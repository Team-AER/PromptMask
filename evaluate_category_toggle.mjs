import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CATEGORY_TO_PLACEHOLDER_KEYS,
  buildPrompt,
  findDisallowedPlaceholderKeys
} from "./extension/offscreen_utils.mjs";
import { findDefaultModel, runLitInference } from "./evaluate_redaction_snippets.mjs";

const ALL_CATEGORY_KEYS = Object.keys(CATEGORY_TO_PLACEHOLDER_KEYS);

// Map from placeholder key → category (e.g. "SSN" → "governmentLegal").
const KEY_TO_CATEGORY = {};
for (const [cat, keys] of Object.entries(CATEGORY_TO_PLACEHOLDER_KEYS)) {
  for (const key of keys) {
    KEY_TO_CATEGORY[key] = cat;
  }
}

const DEFAULT_OUTPUT_PATH = "category_toggle_eval_results.json";
const DEFAULT_LIT_PATH = "./lit";
const DEFAULT_BACKEND = "cpu";

// ---------------------------------------------------------------------------
// Fixture parsing
// ---------------------------------------------------------------------------

// Split a fixture file into snippets.  Handles both:
//   "CATEGORY TOGGLE TEST SNIPPET N: ..." (test_redaction_category_toggle.txt)
//   "CROSS CONTAMINATION TEST SNIPPET N: ..." (test_cross_contamination.txt)
//
// Expected file structure:
//   ={10+} separator
//   Title line + metadata key:value lines
//   ={10+} separator
//   Body text
//   (repeat)
function parseToggleSnippetsFile(rawText) {
  const normalized = ("\n" + rawText.replace(/\r\n/g, "\n").trim()).trimEnd();
  if (!normalized.trim()) return [];

  // Split on lines of 10+ = signs (with surrounding newlines).
  const parts = normalized.split(/\n={10,}\n/);
  // After prepending \n: parts[0]="", parts[1]=first_title_block, parts[2]=first_body, ...

  const snippets = [];

  for (let i = 1; i + 1 < parts.length; i += 2) {
    const titleBlock = parts[i].trim();
    const bodyBlock = parts[i + 1].trim();

    if (!titleBlock) continue;

    const lines = titleBlock.split("\n");
    const titleLine = lines[0].trim();

    const match = titleLine.match(/TEST SNIPPET\s+(\d+):\s*(.+)/i);
    if (!match) continue;

    const id = Number.parseInt(match[1], 10);

    // Parse remaining lines as metadata key:value pairs.
    const metadata = {};
    for (const line of lines.slice(1)) {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        metadata[key] = value;
      }
    }

    snippets.push({ id, title: titleLine, metadata, text: bodyBlock });
  }

  return snippets;
}

// ---------------------------------------------------------------------------
// Configuration helpers
// ---------------------------------------------------------------------------

function buildRedactionConfig(title, metadata) {
  const categories = Object.fromEntries(ALL_CATEGORY_KEYS.map((key) => [key, true]));

  if (metadata["Enabled categories"]) {
    // Only the specified categories are enabled.
    for (const key of ALL_CATEGORY_KEYS) categories[key] = false;
    for (const cat of metadata["Enabled categories"].split(",").map((s) => s.trim())) {
      if (cat && Object.prototype.hasOwnProperty.call(categories, cat)) {
        categories[cat] = true;
      }
    }
  } else if (metadata["Disabled category"]) {
    // All ON except the specified one.
    const disabled = metadata["Disabled category"].trim();
    if (Object.prototype.hasOwnProperty.call(categories, disabled)) {
      categories[disabled] = false;
    }
  } else if (metadata["Broad category"]) {
    // Legacy format: "identityContact ON" / "identityContact OFF" encoded in title.
    const broadCat = metadata["Broad category"].trim();
    const isOff = /\bOFF\b/.test(title);
    if (Object.prototype.hasOwnProperty.call(categories, broadCat)) {
      if (isOff) {
        categories[broadCat] = false;
      } else {
        // "ON" → only this category enabled.
        for (const key of ALL_CATEGORY_KEYS) categories[key] = false;
        categories[broadCat] = true;
      }
    }
  }

  return { categories };
}

// Parse "value->KEY, value2->KEY2" pairs from the Expected labels field.
// Splits on ", " then on "->".  Values may contain spaces.
function parseExpectedLabels(raw) {
  if (!raw) return [];
  return raw
    .split(", ")
    .map((pair) => {
      const arrowIndex = pair.lastIndexOf("->");
      if (arrowIndex < 0) return null;
      return {
        value: pair.slice(0, arrowIndex).trim(),
        expectedKey: pair.slice(arrowIndex + 2).trim()
      };
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Per-snippet evaluation
// ---------------------------------------------------------------------------

async function evaluateSnippet(snippet, { litPath, model, backend }) {
  const { title, metadata, text } = snippet;
  const redactionConfig = buildRedactionConfig(title, metadata);
  const expectedLabels = parseExpectedLabels(metadata["Expected labels"]);

  const prompt = buildPrompt(text, redactionConfig);
  let output, stderr;

  try {
    ({ output, stderr } = await runLitInference({ litPath, model, backend, prompt }));
  } catch (error) {
    return {
      ...snippet,
      model,
      backend,
      output: "",
      stderr: "",
      verdict: "error",
      reasons: [error?.stderr?.trim() || error?.message || String(error)],
      positiveRedactions: [],
      negativePreservations: [],
      crossContaminations: [],
      wrongLabels: []
    };
  }

  const positiveRedactions = [];
  const negativePreservations = [];
  const wrongLabels = [];

  // Cross-contamination: disallowed placeholder keys present in output.
  const crossContaminations = findDisallowedPlaceholderKeys(output, redactionConfig);

  // Per-value checks derived from Expected labels metadata.
  for (const { value, expectedKey } of expectedLabels) {
    const keyCategory = KEY_TO_CATEGORY[expectedKey];
    const categoryEnabled = keyCategory
      ? Boolean(redactionConfig.categories[keyCategory])
      : false;
    const valueInOutput = output.includes(value);

    if (expectedKey === "none" || !categoryEnabled) {
      // Negative preservation: disabled-category PII should remain literally in output.
      negativePreservations.push({
        value,
        status: valueInOutput ? "preserved" : "missing"
      });
    } else {
      // Positive redaction: enabled-category PII should be absent from output.
      positiveRedactions.push({
        value,
        status: valueInOutput ? "leaked" : "redacted"
      });

      // Wrong-label detection: the expected placeholder key should appear in output.
      const correctKeyPresent = new RegExp(`\\[${expectedKey}\\s+\\d+\\]`).test(output);
      if (!valueInOutput && !correctKeyPresent) {
        wrongLabels.push({ value, expectedKey, status: "key-missing" });
      }
    }
  }

  // Build verdict and reasons.
  const leaks = positiveRedactions.filter((r) => r.status === "leaked");
  const missing = negativePreservations.filter((r) => r.status === "missing");

  let verdict = "pass";
  const reasons = [];

  if (leaks.length > 0) {
    verdict = "fail";
    reasons.push(`Leaked PII values: ${leaks.map((r) => r.value).join(", ")}`);
  }

  if (crossContaminations.length > 0) {
    verdict = "fail";
    reasons.push(`Disallowed placeholder keys in output: ${crossContaminations.join(", ")}`);
  }

  if (missing.length > 0) {
    if (verdict === "pass") verdict = "warn";
    reasons.push(
      `Disabled-category PII missing from output (should be untouched): ${missing.map((r) => r.value).join(", ")}`
    );
  }

  if (wrongLabels.length > 0) {
    if (verdict === "pass") verdict = "warn";
    reasons.push(
      `Wrong or missing placeholder labels: ${wrongLabels.map((r) => `${r.value}->${r.expectedKey}`).join(", ")}`
    );
  }

  if (reasons.length === 0) {
    reasons.push("All category toggle checks passed.");
  }

  return {
    ...snippet,
    model,
    backend,
    output,
    stderr,
    verdict,
    reasons,
    positiveRedactions,
    negativePreservations,
    crossContaminations,
    wrongLabels
  };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

async function evaluateToggleSnippets({ cwd, snippetsPath, model, litPath, backend, limit }) {
  const rawText = await fs.readFile(path.resolve(cwd, snippetsPath), "utf8");
  const snippets = parseToggleSnippetsFile(rawText);
  const selected = Number.isInteger(limit) && limit > 0 ? snippets.slice(0, limit) : snippets;
  const resolvedModel = model ?? (await findDefaultModel(cwd));
  const results = [];

  for (const snippet of selected) {
    const result = await evaluateSnippet(snippet, {
      litPath,
      model: resolvedModel,
      backend
    });
    results.push(result);
  }

  return {
    model: resolvedModel,
    backend,
    snippetsPath: path.resolve(cwd, snippetsPath),
    total: results.length,
    pass: results.filter((r) => r.verdict === "pass").length,
    warn: results.filter((r) => r.verdict === "warn").length,
    fail: results.filter((r) => r.verdict === "fail").length,
    error: results.filter((r) => r.verdict === "error").length,
    results
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function usage() {
  return [
    "Usage:",
    "  node evaluate_category_toggle.mjs [fixture.txt] [--model <path>] [--lit <path>] [--backend <cpu|gpu>] [--limit <n>] [--output <json>]",
    "",
    "Defaults:",
    "  fixture: test_redaction_category_toggle.txt",
    `  lit binary: ${DEFAULT_LIT_PATH}`,
    `  backend: ${DEFAULT_BACKEND}`,
    `  output: ${DEFAULT_OUTPUT_PATH}`
  ].join("\n");
}

function parseArgs(argv) {
  const args = [...argv];
  let snippetsPath = "test_redaction_category_toggle.txt";
  let model = null;
  let litPath = DEFAULT_LIT_PATH;
  let backend = DEFAULT_BACKEND;
  let limit = null;
  let outputPath = DEFAULT_OUTPUT_PATH;

  while (args.length) {
    const token = args.shift();
    if (!token) continue;
    if (token === "--help" || token === "-h") return { help: true };
    if (token === "--model") { model = args.shift() ?? null; continue; }
    if (token === "--lit") { litPath = args.shift() ?? DEFAULT_LIT_PATH; continue; }
    if (token === "--backend") { backend = args.shift() ?? DEFAULT_BACKEND; continue; }
    if (token === "--limit") {
      const raw = args.shift();
      limit = raw ? Number.parseInt(raw, 10) : null;
      continue;
    }
    if (token === "--output") { outputPath = args.shift() ?? DEFAULT_OUTPUT_PATH; continue; }
    if (token.startsWith("--")) throw new Error(`Unknown option: ${token}`);
    snippetsPath = token;
  }

  return { help: false, snippetsPath, model, litPath, backend, limit, outputPath };
}

async function main() {
  const cwd = process.cwd();
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(usage());
    return;
  }

  const summary = await evaluateToggleSnippets({
    cwd,
    snippetsPath: options.snippetsPath,
    model: options.model,
    litPath: options.litPath,
    backend: options.backend,
    limit: options.limit
  });

  await fs.writeFile(
    path.resolve(cwd, options.outputPath),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8"
  );

  console.log(`Model: ${summary.model}`);
  console.log(`Snippets: ${summary.total}`);
  console.log(
    `Pass: ${summary.pass}  Warn: ${summary.warn}  Fail: ${summary.fail}  Error: ${summary.error}`
  );
  console.log(`Saved report: ${path.resolve(cwd, options.outputPath)}`);

  for (const result of summary.results) {
    const label = result.verdict.toUpperCase().padEnd(5);
    console.log(`${label} ${result.title}`);
    for (const reason of result.reasons) {
      console.log(`  - ${reason}`);
    }
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);

if (invokedPath === modulePath) {
  main().catch((error) => {
    console.error(error?.stack ?? error?.message ?? String(error));
    process.exitCode = 1;
  });
}
