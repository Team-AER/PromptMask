import assert from "node:assert/strict";

import {
  evaluateRedaction,
  extractStructuredPii,
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

function run() {
  testParseArgsDefaults();
  testParseSnippetsFileWithHeaders();
  testExtractStructuredPii();
  testEvaluateRedactionPass();
  testEvaluateRedactionFailOnLeak();
  console.log("evaluate_redaction_snippets tests: OK");
}

run();
