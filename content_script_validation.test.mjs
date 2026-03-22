import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

function extractSnippet(source, pattern, label) {
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`Could not extract ${label} from content_script.js`);
  }
  return match[0];
}

async function loadLooksLikeValidRedaction() {
  const filePath = path.resolve("extension/content_script.js");
  const source = await readFile(filePath, "utf8");

  const snippet = [
    extractSnippet(source, /const PLACEHOLDER_PREFIXES = \[[\s\S]*?\];/, "PLACEHOLDER_PREFIXES"),
    extractSnippet(source, /const PLACEHOLDER_TOKEN_PATTERN = \/.*?\/g;/, "PLACEHOLDER_TOKEN_PATTERN"),
    extractSnippet(source, /function normalizeComparableText\(text\) \{[\s\S]*?\n\}/, "normalizeComparableText"),
    extractSnippet(
      source,
      /function literalSegmentsAppearInOrder\(normalizedOriginalText, redactedText\) \{[\s\S]*?\n\}/,
      "literalSegmentsAppearInOrder"
    ),
    extractSnippet(source, /function looksLikeValidRedaction\(originalText, redactedText\) \{[\s\S]*?\n\}/, "looksLikeValidRedaction"),
    "globalThis.__testExports = { looksLikeValidRedaction };"
  ].join("\n\n");

  const context = vm.createContext({ globalThis: {} });
  new vm.Script(snippet).runInContext(context);
  return context.globalThis.__testExports.looksLikeValidRedaction;
}

async function testRejectsDroppedContextWithoutPlaceholder() {
  const looksLikeValidRedaction = await loadLooksLikeValidRedaction();

  assert.equal(looksLikeValidRedaction("My name is Noor", "Noor"), false);
}

async function testAcceptsExpectedShortNameRedaction() {
  const looksLikeValidRedaction = await loadLooksLikeValidRedaction();

  assert.equal(looksLikeValidRedaction("My name is Noor", "My name is [NAME 1]"), true);
}

async function testAcceptsAllowedPlaceholderWithDisabledLiteralPreserved() {
  const looksLikeValidRedaction = await loadLooksLikeValidRedaction();

  assert.equal(
    looksLikeValidRedaction(
      "My name is Noor and PAN: ABCPK1234D",
      "My name is [NAME 1] and PAN: ABCPK1234D"
    ),
    true
  );
}

async function testRejectsChangedOutputWithoutPlaceholderForShortInput() {
  const looksLikeValidRedaction = await loadLooksLikeValidRedaction();

  assert.equal(looksLikeValidRedaction("Call me maybe", "maybe"), false);
}

async function testRejectsPlaceholderOutputWhenLiteralOrderIsBroken() {
  const looksLikeValidRedaction = await loadLooksLikeValidRedaction();

  assert.equal(
    looksLikeValidRedaction(
      "My name is Noor and PAN: ABCPK1234D",
      "PAN: ABCPK1234D and my name is [NAME 1]"
    ),
    false
  );
}

async function run() {
  await testRejectsDroppedContextWithoutPlaceholder();
  await testAcceptsExpectedShortNameRedaction();
  await testAcceptsAllowedPlaceholderWithDisabledLiteralPreserved();
  await testRejectsChangedOutputWithoutPlaceholderForShortInput();
  await testRejectsPlaceholderOutputWhenLiteralOrderIsBroken();
  console.log("content_script_validation tests: OK");
}

run();
