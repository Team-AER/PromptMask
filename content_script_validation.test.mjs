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
    extractSnippet(source, /function looksLikeValidRedaction\(originalText, redactedText\) \{[\s\S]*?\n\}/, "looksLikeValidRedaction"),
    "globalThis.__testExports = { looksLikeValidRedaction };"
  ].join("\n\n");

  const context = vm.createContext({ globalThis: {} });
  new vm.Script(snippet).runInContext(context);
  return context.globalThis.__testExports.looksLikeValidRedaction;
}

async function testRejectsDroppedContextWithoutPlaceholder() {
  const looksLikeValidRedaction = await loadLooksLikeValidRedaction();

  assert.equal(looksLikeValidRedaction("My name is Noor", "Noor"), true);
}

async function testAcceptsNonEmptyReplacement() {
  const looksLikeValidRedaction = await loadLooksLikeValidRedaction();

  assert.equal(looksLikeValidRedaction("My name is Noor", "My name is [NAME 1]"), true);
}

async function testAcceptsDisabledCategoryLiteralPreserved() {
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

  assert.equal(looksLikeValidRedaction("Call me maybe", "maybe"), true);
}

async function testRejectsBlankOutput() {
  const looksLikeValidRedaction = await loadLooksLikeValidRedaction();

  assert.equal(looksLikeValidRedaction("My name is Noor", "   "), false);
}

async function testRejectsVeryShortLongPromptOutput() {
  const looksLikeValidRedaction = await loadLooksLikeValidRedaction();

  const originalText =
    "This is a long prompt that clearly exceeds eighty characters and should reject very short outputs.";

  assert.equal(looksLikeValidRedaction(originalText, "short summary"), false);
}

async function run() {
  await testRejectsDroppedContextWithoutPlaceholder();
  await testAcceptsNonEmptyReplacement();
  await testAcceptsDisabledCategoryLiteralPreserved();
  await testRejectsChangedOutputWithoutPlaceholderForShortInput();
  await testRejectsBlankOutput();
  await testRejectsVeryShortLongPromptOutput();
  console.log("content_script_validation tests: OK");
}

run();
