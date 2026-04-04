import assert from "node:assert/strict";

import {
  CATEGORY_TO_PLACEHOLDER_KEYS,
  buildCorrectionPrompt,
  findDisallowedPlaceholderKeys,
  getEnabledPlaceholderKeys
} from "./extension/offscreen_utils.mjs";

const ALL_CATEGORY_KEYS = Object.keys(CATEGORY_TO_PLACEHOLDER_KEYS);

function makeCategoryConfig(overrides = {}) {
  const categories = Object.fromEntries(ALL_CATEGORY_KEYS.map((key) => [key, true]));
  return { categories: { ...categories, ...overrides } };
}

function onlyCategory(...enabled) {
  const overrides = Object.fromEntries(ALL_CATEGORY_KEYS.map((key) => [key, false]));
  for (const cat of enabled) overrides[cat] = true;
  return makeCategoryConfig(overrides);
}

// ---------------------------------------------------------------------------
// PAN vs CREDIT_CARD
// ---------------------------------------------------------------------------

function testPanVsCreditCard_BothOn_WrongLabel_NotCaught() {
  // When both governmentLegal and financialPayment are ON, the deterministic
  // guard cannot distinguish a wrong label — [PAN 1] is "allowed" since
  // governmentLegal is enabled. This documents the known gap.
  const config = makeCategoryConfig();
  const output = "Card number: [PAN 1], expiry [CARD_EXPIRY 1].";
  assert.deepEqual(
    findDisallowedPlaceholderKeys(output, config),
    [],
    "wrong label not caught when both categories enabled (known gap)"
  );
}

function testPanVsCreditCard_OnlyFinancialOn_CatchesPan() {
  const config = onlyCategory("financialPayment");
  const output = "Card number: [PAN 1], expiry [CARD_EXPIRY 1].";
  assert.deepEqual(findDisallowedPlaceholderKeys(output, config), ["PAN"]);
}

function testPanVsCreditCard_OnlyGovLegalOn_CatchesCreditCard() {
  const config = onlyCategory("governmentLegal");
  const output = "PAN: [PAN 1]. Card number: [CREDIT_CARD 1].";
  assert.deepEqual(findDisallowedPlaceholderKeys(output, config), ["CREDIT_CARD"]);
}

// ---------------------------------------------------------------------------
// SSN vs BANK_ACCOUNT
// ---------------------------------------------------------------------------

function testSsnVsBankAccount_OnlyGovLegalOn_CatchesBankAccount() {
  const config = onlyCategory("governmentLegal");
  const output = "SSN: [SSN 1]. Account: [BANK_ACCOUNT 1].";
  assert.deepEqual(findDisallowedPlaceholderKeys(output, config), ["BANK_ACCOUNT"]);
}

function testSsnVsBankAccount_OnlyFinancialOn_CatchesSsn() {
  const config = onlyCategory("financialPayment");
  const output = "SSN: [SSN 1]. Account: [BANK_ACCOUNT 1].";
  assert.deepEqual(findDisallowedPlaceholderKeys(output, config), ["SSN"]);
}

// ---------------------------------------------------------------------------
// MRN vs CASE_ID
// ---------------------------------------------------------------------------

function testMrnVsCaseId_OnlyMedicalOn_CatchesCaseId() {
  const config = onlyCategory("medical");
  const output = "MRN: [MRN 1]. Ticket: [CASE_ID 1].";
  assert.deepEqual(findDisallowedPlaceholderKeys(output, config), ["CASE_ID"]);
}

function testMrnVsCaseId_OnlyBusinessOn_CatchesMrn() {
  const config = onlyCategory("businessCase");
  const output = "MRN: [MRN 1]. Ticket: [CASE_ID 1].";
  assert.deepEqual(findDisallowedPlaceholderKeys(output, config), ["MRN"]);
}

// ---------------------------------------------------------------------------
// GST vs INVOICE_ID (both alphanumeric patterns)
// ---------------------------------------------------------------------------

function testGstVsInvoiceId_OnlyGovLegalOn_CatchesInvoiceId() {
  const config = onlyCategory("governmentLegal");
  const output = "GST: [GST 1]. Invoice: [INVOICE_ID 1].";
  assert.deepEqual(findDisallowedPlaceholderKeys(output, config), ["INVOICE_ID"]);
}

function testGstVsInvoiceId_OnlyBusinessOn_CatchesGst() {
  const config = onlyCategory("businessCase");
  const output = "GST: [GST 1]. Invoice: [INVOICE_ID 1].";
  assert.deepEqual(findDisallowedPlaceholderKeys(output, config), ["GST"]);
}

// ---------------------------------------------------------------------------
// DEVICE_ID vs PAN (both alphanumeric)
// ---------------------------------------------------------------------------

function testDeviceIdVsPan_OnlyNetworkOn_CatchesPan() {
  const config = onlyCategory("networkDevice");
  const output = "Device: [DEVICE_ID 1]. PAN: [PAN 1].";
  assert.deepEqual(findDisallowedPlaceholderKeys(output, config), ["PAN"]);
}

// ---------------------------------------------------------------------------
// Multiple simultaneous wrong labels
// ---------------------------------------------------------------------------

function testMultipleSimultaneousWrongLabels() {
  const config = onlyCategory("financialPayment");
  const output = "Card: [PAN 1]. Record: [MRN 1]. Account: [BANK_ACCOUNT 1].";
  assert.deepEqual(findDisallowedPlaceholderKeys(output, config), ["PAN", "MRN"]);
}

// ---------------------------------------------------------------------------
// buildCorrectionPrompt references disallowed keys
// ---------------------------------------------------------------------------

function testCorrectionPromptMentionsDisallowedKeys() {
  const config = onlyCategory("financialPayment");
  const correction = buildCorrectionPrompt(
    "PAN: ABCDE1234F. Card: 4111 1111 1111 1111.",
    config,
    ["PAN"]
  );
  assert.ok(correction.includes("[PAN N]"), "correction prompt should mention [PAN N]");
  assert.ok(
    correction.includes("disabled placeholder tags"),
    "correction prompt should mention disabled placeholder tags"
  );
}

// ---------------------------------------------------------------------------
// Empty output — no cross-contamination
// ---------------------------------------------------------------------------

function testEmptyOutputNoCrossContamination() {
  const config = onlyCategory("financialPayment");
  assert.deepEqual(findDisallowedPlaceholderKeys("", config), []);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function run() {
  testPanVsCreditCard_BothOn_WrongLabel_NotCaught();
  testPanVsCreditCard_OnlyFinancialOn_CatchesPan();
  testPanVsCreditCard_OnlyGovLegalOn_CatchesCreditCard();
  testSsnVsBankAccount_OnlyGovLegalOn_CatchesBankAccount();
  testSsnVsBankAccount_OnlyFinancialOn_CatchesSsn();
  testMrnVsCaseId_OnlyMedicalOn_CatchesCaseId();
  testMrnVsCaseId_OnlyBusinessOn_CatchesMrn();
  testGstVsInvoiceId_OnlyGovLegalOn_CatchesInvoiceId();
  testGstVsInvoiceId_OnlyBusinessOn_CatchesGst();
  testDeviceIdVsPan_OnlyNetworkOn_CatchesPan();
  testMultipleSimultaneousWrongLabels();
  testCorrectionPromptMentionsDisallowedKeys();
  testEmptyOutputNoCrossContamination();
  console.log("cross_contamination tests: OK");
}

run();
