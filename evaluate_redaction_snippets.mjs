import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { buildPrompt, normalizeOutput } from "./extension/offscreen_utils.mjs";

const execFileAsync = promisify(execFile);
const DEFAULT_SNIPPETS_FILE = "test_redaction_snippets.txt";
const DEFAULT_LIT_PATH = "./lit";
const DEFAULT_BACKEND = "cpu";
const DEFAULT_OUTPUT_PATH = "redaction_eval_results.json";
const DEFAULT_MODEL_CANDIDATES = [
  "models/gemma-4-E2B-it.litertlm",
  "models/gemma-4-E2B-it-web.task",
  "models/promptmask-gemma3n-redactor-v1.litertlm",
  "models/gemma-3n-E2B-it-int4-Web.litertlm"
];
const PLACEHOLDER_PATTERN = /\[[A-Z_]+ \d+\]/g;

const STRUCTURED_PII_RULES = [
  { name: "email", regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { name: "ssn", regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  {
    name: "phone",
    regex: /(?:\+\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?){2,4}\d{2,4}/g
  },
  { name: "ipv4", regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
  { name: "pan", regex: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
  { name: "gst", regex: /\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z0-9]Z[A-Z0-9]\b/g },
  {
    name: "credit_card",
    regex: /\b(?:\d[ -]?){13,19}\b/g,
    filter: (value) => value.replace(/\D/g, "").length >= 13
  },
  { name: "api_key", regex: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { name: "github_token", regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { name: "ifsc", regex: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g },
  { name: "paypal_id", regex: /\b[A-Z0-9-]{6,}\b/g, contexts: [/paypal/i] },
  {
    name: "invoice_case_order_id",
    regex: /\b(?:ORD|INV|TCK|REF|CAS|MRN)[-_A-Z0-9]{3,}\b/g
  },
  {
    name: "dob",
    regex:
      /(?:DOB|date of birth|born on|birthday|Patient date of birth)\s*[:\-]?\s*([A-Za-z0-9,/-]{6,})/gi,
    captureGroup: 1
  }
];

function usage() {
  return [
    "Usage:",
    "  node evaluate_redaction_snippets.mjs <snippets.txt> [--model <path-or-alias>] [--lit <path>] [--backend <cpu|gpu>] [--limit <n>] [--output <json>]",
    "",
    "Defaults:",
    `  snippets file: ${DEFAULT_SNIPPETS_FILE}`,
    `  lit binary: ${DEFAULT_LIT_PATH}`,
    `  backend: ${DEFAULT_BACKEND}`,
    `  output file: ${DEFAULT_OUTPUT_PATH}`
  ].join("\n");
}

export function parseArgs(argv) {
  const args = [...argv];
  let snippetsPath = DEFAULT_SNIPPETS_FILE;
  let model = null;
  let litPath = DEFAULT_LIT_PATH;
  let backend = DEFAULT_BACKEND;
  let limit = null;
  let outputPath = DEFAULT_OUTPUT_PATH;

  while (args.length) {
    const token = args.shift();
    if (!token) {
      continue;
    }
    if (token === "--help" || token === "-h") {
      return { help: true };
    }
    if (token === "--model") {
      model = args.shift() ?? null;
      continue;
    }
    if (token === "--lit") {
      litPath = args.shift() ?? DEFAULT_LIT_PATH;
      continue;
    }
    if (token === "--backend") {
      backend = args.shift() ?? DEFAULT_BACKEND;
      continue;
    }
    if (token === "--limit") {
      const raw = args.shift();
      limit = raw ? Number.parseInt(raw, 10) : null;
      continue;
    }
    if (token === "--output") {
      outputPath = args.shift() ?? DEFAULT_OUTPUT_PATH;
      continue;
    }
    if (token.startsWith("--")) {
      throw new Error(`Unknown option: ${token}`);
    }
    snippetsPath = token;
  }

  return {
    help: false,
    snippetsPath,
    model,
    litPath,
    backend,
    limit,
    outputPath
  };
}

export function parseSnippetsFile(rawText) {
  const normalized = rawText.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const headerPattern =
    /={10,}\n(TEST SNIPPET\s+\d+:\s*[^\n]+)\n={10,}\n([\s\S]*?)(?=\n={10,}\nTEST SNIPPET\s+\d+:|\s*$)/g;
  const matches = [...normalized.matchAll(headerPattern)];

  if (matches.length > 0) {
    return matches.map((match, index) => ({
      id: index + 1,
      title: match[1].trim(),
      text: match[2].trim()
    }));
  }

  const paragraphs = normalized
    .split(/\n\s*\n(?=\S)/)
    .map((block) => block.trim())
    .filter(Boolean);

  return paragraphs.map((text, index) => ({
    id: index + 1,
    title: `Snippet ${index + 1}`,
    text
  }));
}

function normalizeStructuredValue(value) {
  return value.replace(/\s+/g, " ").trim();
}

export function extractStructuredPii(text) {
  const findings = [];
  const lower = text.toLowerCase();

  for (const rule of STRUCTURED_PII_RULES) {
    const matches = [...text.matchAll(rule.regex)];
    for (const match of matches) {
      if (rule.contexts && !rule.contexts.some((context) => context.test(lower))) {
        continue;
      }
      const value = normalizeStructuredValue(
        rule.captureGroup ? match[rule.captureGroup] ?? "" : match[0] ?? ""
      );
      if (!value) {
        continue;
      }
      if (rule.filter && !rule.filter(value)) {
        continue;
      }
      if (!findings.some((finding) => finding.name === rule.name && finding.value === value)) {
        findings.push({ name: rule.name, value });
      }
    }
  }

  return findings;
}

export function evaluateRedaction(inputText, outputText) {
  const structuredPii = extractStructuredPii(inputText);
  const leakedValues = structuredPii.filter((finding) => outputText.includes(finding.value));
  const placeholders = [...outputText.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[0]);
  const uniquePlaceholders = [...new Set(placeholders)];
  const changed = inputText.trim() !== outputText.trim();
  const suspiciouslyShort =
    inputText.length > 20 &&
    outputText.length < inputText.length * 0.35 &&
    uniquePlaceholders.length === 0;

  let verdict = "pass";
  const reasons = [];

  if (leakedValues.length > 0) {
    verdict = "fail";
    reasons.push(`Structured PII leaked: ${leakedValues.map((item) => item.value).join(", ")}`);
  }

  if (suspiciouslyShort) {
    verdict = "fail";
    reasons.push("Output is unexpectedly short and contains no placeholders.");
  }

  if (verdict === "pass" && structuredPii.length > 0 && uniquePlaceholders.length === 0) {
    verdict = "warn";
    reasons.push("No placeholders were produced even though structured PII was detected in the input.");
  }

  if (verdict === "pass" && !changed) {
    verdict = structuredPii.length > 0 ? "warn" : "pass";
    if (structuredPii.length > 0) {
      reasons.push("Output is unchanged from input.");
    }
  }

  if (reasons.length === 0) {
    reasons.push("No structured PII leaks detected.");
  }

  return {
    verdict,
    reasons,
    structuredPii,
    leakedValues,
    placeholders: uniquePlaceholders
  };
}

export async function findDefaultModel(cwd) {
  for (const candidate of DEFAULT_MODEL_CANDIDATES) {
    const resolved = path.resolve(cwd, candidate);
    try {
      await fs.access(resolved);
      return resolved;
    } catch {
      // Try next candidate.
    }
  }
  return DEFAULT_MODEL_CANDIDATES[0];
}

export async function runLitInference({ litPath, model, backend, prompt }) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "promptmask-redaction-"));
  const promptPath = path.join(tempDir, "prompt.txt");

  try {
    await fs.writeFile(promptPath, prompt, "utf8");
    const { stdout, stderr } = await execFileAsync(litPath, [
      "run",
      model,
      "--backend",
      backend,
      "-f",
      promptPath
    ]);
    return {
      output: normalizeOutput((stdout || "").trim()),
      stderr: (stderr || "").trim()
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function evaluateSnippets({
  cwd,
  snippetsPath,
  model,
  litPath,
  backend,
  limit
}) {
  const rawText = await fs.readFile(path.resolve(cwd, snippetsPath), "utf8");
  const snippets = parseSnippetsFile(rawText);
  const selected = Number.isInteger(limit) && limit > 0 ? snippets.slice(0, limit) : snippets;
  const resolvedModel = model ?? (await findDefaultModel(cwd));
  const results = [];

  for (const snippet of selected) {
    const prompt = buildPrompt(snippet.text);
    try {
      const { output, stderr } = await runLitInference({
        litPath,
        model: resolvedModel,
        backend,
        prompt
      });
      const evaluation = evaluateRedaction(snippet.text, output);
      results.push({
        ...snippet,
        model: resolvedModel,
        backend,
        output,
        stderr,
        ...evaluation
      });
    } catch (error) {
      results.push({
        ...snippet,
        model: resolvedModel,
        backend,
        output: "",
        stderr: "",
        verdict: "error",
        reasons: [error?.stderr?.trim() || error?.message || String(error)],
        structuredPii: [],
        leakedValues: [],
        placeholders: []
      });
    }
  }

  return {
    model: resolvedModel,
    backend,
    snippetsPath: path.resolve(cwd, snippetsPath),
    total: results.length,
    pass: results.filter((result) => result.verdict === "pass").length,
    warn: results.filter((result) => result.verdict === "warn").length,
    fail: results.filter((result) => result.verdict === "fail").length,
    error: results.filter((result) => result.verdict === "error").length,
    results
  };
}

async function main() {
  const cwd = process.cwd();
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(usage());
    return;
  }

  const summary = await evaluateSnippets({
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
  console.log(`Pass: ${summary.pass}  Warn: ${summary.warn}  Fail: ${summary.fail}  Error: ${summary.error}`);
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
