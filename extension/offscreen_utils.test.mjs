import assert from "node:assert/strict";
import { buildPrompt, normalizeOutput, REDACTION_PROMPT } from "./offscreen_utils.mjs";

const PLACEHOLDER_NUMBERED_EXAMPLES = [
  "[NAME 1]",
  "[PHONE 1]",
  "[EMAIL 1]",
  "[USERNAME 1]",
  "[ADDRESS 1]",
  "[SSN 1]",
  "[DATE_OF_BIRTH 1]",
  "[INSURANCE_ID 1]",
  "[MRN 1]",
  "[IP_ADDRESS 1]",
  "[ORDER_ID 1]",
  "[INVOICE_ID 1]",
  "[CASE_ID 1]",
  "[PAN 1]",
  "[GST 1]",
  "[DEVICE_ID 1]",
  "[PAYPAL 1]",
  "[DRIVER_LICENSE 1]",
  "[API_KEY 1]",
  "[BANK_ACCOUNT 1]",
  "[CREDIT_CARD 1]",
  "[CARD_EXPIRY 1]",
  "[CARD_CVV 1]",
  "[ACCESS_TOKEN 1]"
];

function testBuildPrompt() {
  const input = "Contact Jane Doe at jane.doe@example.com.";
  const prompt = buildPrompt(input);

  assert.ok(prompt.includes("<start_of_turn>user"));
  assert.ok(prompt.includes("<start_of_turn>model"));
  assert.ok(prompt.includes("<end_of_turn>"));
  assert.ok(prompt.includes(REDACTION_PROMPT.trim()));
  assert.ok(prompt.includes(`INPUT:\n${input}`));
}

function testBuildPromptWithScopedCategories() {
  const input = "Contact Jane Doe at jane.doe@example.com and 123-45-6789.";
  const prompt = buildPrompt(input, {
    categories: {
      identityContact: true,
      governmentLegal: false,
      financialPayment: false,
      medical: false,
      credentialsSecrets: false,
      networkDevice: false,
      businessCase: false
    }
  });

  assert.ok(prompt.includes("Scope override for this request"));
  assert.ok(
    prompt.includes(
      "ONLY redact categories that map to these placeholders: [NAME N], [PHONE N], [EMAIL N], [USERNAME N], [ADDRESS N], [DATE_OF_BIRTH N]."
    )
  );
  assert.ok(prompt.includes("Do NOT redact any other category"));
}

function testBuildPromptWithNoCategoriesEnabled() {
  const prompt = buildPrompt("hello", {
    categories: {
      identityContact: false,
      governmentLegal: false,
      financialPayment: false,
      medical: false,
      credentialsSecrets: false,
      networkDevice: false,
      businessCase: false
    }
  });

  assert.ok(prompt.includes("No PII categories are enabled"));
}

function testPromptListsAllPlaceholders() {
  for (const token of PLACEHOLDER_NUMBERED_EXAMPLES) {
    assert.ok(
      REDACTION_PROMPT.includes(token),
      `Missing placeholder token: ${token}`
    );
  }
}

function testPromptIncludesCriticalRules() {
  assert.ok(REDACTION_PROMPT.includes("Replace any PII"));
  assert.ok(REDACTION_PROMPT.includes("return ONLY the redacted text"));
  assert.ok(REDACTION_PROMPT.includes("Do not add headings"));
  assert.ok(REDACTION_PROMPT.includes("Remove all digits of SSNs"));
  assert.ok(REDACTION_PROMPT.includes("Redact full names"));
  assert.ok(REDACTION_PROMPT.includes("Redact full street addresses"));
  assert.ok(REDACTION_PROMPT.includes("Redact phone numbers"));
  assert.ok(REDACTION_PROMPT.includes("Redact emails"));
  assert.ok(REDACTION_PROMPT.includes("Redact dates of birth"));
  assert.ok(REDACTION_PROMPT.includes("Redact invoice numbers"));
  assert.ok(REDACTION_PROMPT.includes("Redact ticket/case/reference IDs"));
  assert.ok(REDACTION_PROMPT.includes("Redact GST/tax-registration numbers"));
  assert.ok(REDACTION_PROMPT.includes("Redact device identifiers"));
  assert.ok(REDACTION_PROMPT.includes("Redact usernames/account handles"));
  assert.ok(REDACTION_PROMPT.includes("Only redact dates that clearly indicate a date of birth"));
  assert.ok(REDACTION_PROMPT.includes("Do not redact category labels or generic phrases"));
}

function testPromptIncludesFormattingRule() {
  assert.ok(REDACTION_PROMPT.includes("Preserve the original formatting exactly"));
  assert.ok(REDACTION_PROMPT.includes("keep all line breaks"));
  assert.ok(REDACTION_PROMPT.includes("bullet points"));
  assert.ok(REDACTION_PROMPT.includes("Do not collapse the text into a single line"));
  assert.ok(REDACTION_PROMPT.includes("whitespace"));
}

function testPromptIncludesNumberingRules() {
  assert.ok(REDACTION_PROMPT.includes("sequential number within its category, starting at 1"));
  assert.ok(REDACTION_PROMPT.includes("reuse the same number"));
  assert.ok(REDACTION_PROMPT.includes("Different PII values in the same category get different numbers"));
}

function testPromptIncludesCompositeExample() {
  assert.ok(REDACTION_PROMPT.includes("Hi, I'm Priya Nair."));
  assert.ok(REDACTION_PROMPT.includes("Lakeview Apartments"));
  assert.ok(REDACTION_PROMPT.includes("DOB: 1992-08-14"));
  assert.ok(REDACTION_PROMPT.includes("Output: Hi, I'm [NAME 1]."));
}

function testPromptIncludesInvoiceAndCaseExample() {
  assert.ok(REDACTION_PROMPT.includes("Invoice INV-2026-00173 for case TCK-556201."));
  assert.ok(REDACTION_PROMPT.includes("Invoice [INVOICE_ID 1] for case [CASE_ID 1]."));
  assert.ok(REDACTION_PROMPT.includes("Ship to: [ADDRESS 1]."));
}

function testPromptIncludesMultiEntityExample() {
  assert.ok(REDACTION_PROMPT.includes("Alice emailed Bob at bob@x.com."));
  assert.ok(REDACTION_PROMPT.includes("[NAME 1] emailed [NAME 2] at [EMAIL 1]."));
  assert.ok(REDACTION_PROMPT.includes("[NAME 1]'s SSN is [SSN 1] and [NAME 2]'s is [SSN 2]."));
}

function testPromptIncludesNameVariantExample() {
  assert.ok(REDACTION_PROMPT.includes("Neha Kulkarni (Neha K.) approved the request."));
  assert.ok(REDACTION_PROMPT.includes("[NAME 1] ([NAME 2]) approved the request."));
}

function testPromptIncludesHeaderExample() {
  assert.ok(REDACTION_PROMPT.includes("From: Neha Kulkarni neha.kulkarni+support@example.com"));
  assert.ok(REDACTION_PROMPT.includes("To: security@kwc.example.com"));
  assert.ok(REDACTION_PROMPT.includes("Date: 2026-01-13"));
  assert.ok(REDACTION_PROMPT.includes("Subject: Re: Case TCK-556201"));
  assert.ok(REDACTION_PROMPT.includes("From: [NAME 1] [EMAIL 1]"));
  assert.ok(REDACTION_PROMPT.includes("To: [EMAIL 2]"));
  assert.ok(REDACTION_PROMPT.includes("Date: 2026-01-13"));
  assert.ok(REDACTION_PROMPT.includes("Subject: Re: Case [CASE_ID 1]"));
}

function testPromptIncludesUsernameExample() {
  assert.ok(REDACTION_PROMPT.includes("Account username is neha.kulkarni91."));
  assert.ok(REDACTION_PROMPT.includes("Account username is [USERNAME 1]."));
  assert.ok(REDACTION_PROMPT.includes("Please remove bank details if present."));
}

function testNormalizeOutputStripsEndOfTurn() {
  const raw = "Contact [NAME 1].<end_of_turn> extra";
  const normalized = normalizeOutput(raw);
  assert.equal(normalized, "Contact [NAME 1].");
}

function testNormalizeOutputStripsLeadingModelTag() {
  const raw = "<start_of_turn>model\nContact [NAME 1].";
  const normalized = normalizeOutput(raw);
  assert.equal(normalized, "Contact [NAME 1].");
}

function testNormalizeOutputHandlesBothTags() {
  const raw = "<start_of_turn>model\nContact [NAME 1].<end_of_turn>\n<start_of_turn>user\n";
  const normalized = normalizeOutput(raw);
  assert.equal(normalized, "Contact [NAME 1].");
}

function testNormalizeOutputTrimsWhitespace() {
  const raw = "  Contact [NAME 1].  ";
  const normalized = normalizeOutput(raw);
  assert.equal(normalized, "  Contact [NAME 1].  ");
}

function testNormalizeOutputNoTags() {
  const raw = "Contact [NAME 1].";
  const normalized = normalizeOutput(raw);
  assert.equal(normalized, "Contact [NAME 1].");
}

function testNormalizeOutputPreservesNewlines() {
  const raw = "Line one.\n\nLine two.\n- bullet";
  const normalized = normalizeOutput(raw);
  assert.equal(normalized, "Line one.\n\nLine two.\n- bullet");
}

function run() {
  testBuildPrompt();
  testBuildPromptWithScopedCategories();
  testBuildPromptWithNoCategoriesEnabled();
  testPromptListsAllPlaceholders();
  testPromptIncludesCriticalRules();
  testPromptIncludesFormattingRule();
  testPromptIncludesNumberingRules();
  testPromptIncludesCompositeExample();
  testPromptIncludesInvoiceAndCaseExample();
  testPromptIncludesMultiEntityExample();
  testPromptIncludesNameVariantExample();
  testPromptIncludesHeaderExample();
  testPromptIncludesUsernameExample();
  testNormalizeOutputStripsEndOfTurn();
  testNormalizeOutputStripsLeadingModelTag();
  testNormalizeOutputHandlesBothTags();
  testNormalizeOutputTrimsWhitespace();
  testNormalizeOutputNoTags();
  testNormalizeOutputPreservesNewlines();
  console.log("offscreen_utils tests: OK");
}

run();
