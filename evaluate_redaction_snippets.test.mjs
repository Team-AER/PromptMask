import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  evaluateRedaction,
  extractStructuredPii,
  findDefaultModel,
  parseArgs,
  parseSnippetsFile
} from "./evaluate_redaction_snippets.mjs";

function testParseArgsDefaults() {
  const parsed = parseArgs([]);

  assert.equal(parsed.help, false);
  assert.equal(parsed.snippetsPath, "test_redaction_snippets.txt");
  assert.equal(parsed.backend, "cpu");
}

function testParseSnippetsFileWithHeaders() {
  const snippets = parseSnippetsFile(`
==============================================================
TEST SNIPPET 1: Email
==============================================================
Email me at a@example.com

==============================================================
TEST SNIPPET 2: SSN
==============================================================
SSN 111-22-3333
`);

  assert.equal(snippets.length, 2);
  assert.equal(snippets[0].title, "TEST SNIPPET 1: Email");
  assert.equal(snippets[1].text, "SSN 111-22-3333");
}

function testExtractStructuredPii() {
  const findings = extractStructuredPii(`
Reach me at priya@example.com or +1 415-555-0101.
SSN 123-45-6789 and IP 192.168.1.2.
`);

  assert.ok(findings.some((item) => item.name === "email" && item.value === "priya@example.com"));
  assert.ok(findings.some((item) => item.name === "ssn" && item.value === "123-45-6789"));
  assert.ok(findings.some((item) => item.name === "ipv4" && item.value === "192.168.1.2"));
}

function testEvaluateRedactionPass() {
  const result = evaluateRedaction(
    "Email priya@example.com. SSN 123-45-6789.",
    "Email [EMAIL 1]. SSN [SSN 1]."
  );

  assert.equal(result.verdict, "pass");
  assert.equal(result.leakedValues.length, 0);
}

function testEvaluateRedactionFailOnLeak() {
  const result = evaluateRedaction(
    "Email priya@example.com. SSN 123-45-6789.",
    "Email [EMAIL 1]. SSN 123-45-6789."
  );

  assert.equal(result.verdict, "fail");
  assert.ok(result.reasons[0].includes("123-45-6789"));
}

async function testFindDefaultModelPrefersGemma4() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "promptmask-find-model-"));

  try {
    await fs.mkdir(path.join(tempDir, "models"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "models", "promptmask-gemma3n-redactor-v1.litertlm"), "", "utf8");
    await fs.writeFile(path.join(tempDir, "models", "gemma-4-E2B-it.litertlm"), "", "utf8");

    const model = await findDefaultModel(tempDir);
    assert.equal(model, path.join(tempDir, "models", "gemma-4-E2B-it.litertlm"));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function run() {
  testParseArgsDefaults();
  testParseSnippetsFileWithHeaders();
  testExtractStructuredPii();
  testEvaluateRedactionPass();
  testEvaluateRedactionFailOnLeak();
  await testFindDefaultModelPrefersGemma4();
  console.log("evaluate_redaction_snippets tests: OK");
}

run().catch((error) => {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exitCode = 1;
});
