import assert from "node:assert/strict";

import {
  CATEGORY_TO_PLACEHOLDER_KEYS,
  buildPrompt,
  extractPlaceholderKeys,
  findDisallowedPlaceholderKeys,
  getEnabledPlaceholderKeys
} from "./extension/offscreen_utils.mjs";

const ALL_CATEGORY_KEYS = Object.keys(CATEGORY_TO_PLACEHOLDER_KEYS);
const REPRESENTATIVE_PLACEHOLDER_BY_CATEGORY = Object.fromEntries(
  ALL_CATEGORY_KEYS.map((categoryKey) => [categoryKey, CATEGORY_TO_PLACEHOLDER_KEYS[categoryKey][0]])
);
const ALL_REPRESENTATIVE_PLACEHOLDERS_OUTPUT = ALL_CATEGORY_KEYS.map(
  (categoryKey) => `[${REPRESENTATIVE_PLACEHOLDER_BY_CATEGORY[categoryKey]} 1]`
).join(" | ");

function makeCategoryConfig(overrides = {}) {
  const categories = Object.fromEntries(ALL_CATEGORY_KEYS.map((categoryKey) => [categoryKey, true]));
  return {
    categories: {
      ...categories,
      ...overrides
    }
  };
}

function makeCategoryConfigFromMask(mask) {
  const overrides = Object.fromEntries(
    ALL_CATEGORY_KEYS.map((categoryKey, index) => [categoryKey, Boolean(mask & (1 << index))])
  );
  return makeCategoryConfig(overrides);
}

function testFinanceOnMedicalOffPromptScope() {
  const prompt = buildPrompt(
    "Credit card 5500 0000 0000 0004. MRN-40098712.",
    makeCategoryConfig({
      identityContact: false,
      governmentLegal: false,
      financialPayment: true,
      medical: false,
      credentialsSecrets: false,
      networkDevice: false,
      businessCase: false
    })
  );

  assert.ok(prompt.includes("Allowed placeholders for this run:"));
  assert.ok(prompt.includes("[CREDIT_CARD N]"));
  assert.ok(prompt.includes("[BANK_ACCOUNT N]"));
  assert.ok(!prompt.includes("[MRN N]"));
  assert.ok(!prompt.includes("[INSURANCE_ID N]"));
  assert.ok(prompt.includes("If text belongs to a disabled category, leave that text unchanged."));
  assert.ok(prompt.includes("Never output a placeholder from a disabled category."));
}

function testIdentityOnGovernmentOffPromptScope() {
  const prompt = buildPrompt(
    "My name is Noor and my PAN: ABCDE1234F.",
    makeCategoryConfig({
      identityContact: true,
      governmentLegal: false,
      financialPayment: false,
      medical: false,
      credentialsSecrets: false,
      networkDevice: false,
      businessCase: false
    })
  );

  assert.ok(prompt.includes("My name is Noor and my PAN: ABCDE1234F."));
  assert.ok(prompt.includes("My name is [NAME 1] and my PAN: ABCDE1234F."));
  assert.ok(!prompt.includes("[PAN N]"));
}

function testFinanceOnMedicalOffValidation() {
  const redactionConfig = makeCategoryConfig({
    identityContact: false,
    governmentLegal: false,
    financialPayment: true,
    medical: false,
    credentialsSecrets: false,
    networkDevice: false,
    businessCase: false
  });

  const validOutput =
    "Customer Aisha Patel wants to update payment information. Credit card: [CREDIT_CARD 1], expiry [CARD_EXPIRY 1], CVV [CARD_CVV 1]. Medical record number: MRN-40098712.";
  const invalidOutput =
    "Customer Aisha Patel wants to update payment information. Credit card: [CREDIT_CARD 1], expiry [CARD_EXPIRY 1], CVV [CARD_CVV 1]. Medical record number: [MRN 1].";

  assert.deepEqual(findDisallowedPlaceholderKeys(validOutput, redactionConfig), []);
  assert.deepEqual(findDisallowedPlaceholderKeys(invalidOutput, redactionConfig), ["MRN"]);
}

function testMedicalOnFinanceOffValidation() {
  const redactionConfig = makeCategoryConfig({
    identityContact: false,
    governmentLegal: false,
    financialPayment: false,
    medical: true,
    credentialsSecrets: false,
    networkDevice: false,
    businessCase: false
  });

  const validOutput =
    "Insurance ID: [INSURANCE_ID 1]. Medical record number: [MRN 1]. Credit card: 5500 0000 0000 0004.";
  const invalidOutput =
    "Insurance ID: [INSURANCE_ID 1]. Medical record number: [MRN 1]. Credit card: [CREDIT_CARD 1].";

  assert.deepEqual(findDisallowedPlaceholderKeys(validOutput, redactionConfig), []);
  assert.deepEqual(findDisallowedPlaceholderKeys(invalidOutput, redactionConfig), ["CREDIT_CARD"]);
}

function testNoCategoriesEnabledRejectsAllPlaceholders() {
  const redactionConfig = makeCategoryConfig({
    identityContact: false,
    governmentLegal: false,
    financialPayment: false,
    medical: false,
    credentialsSecrets: false,
    networkDevice: false,
    businessCase: false
  });

  const prompt = buildPrompt("Email jane@example.com", redactionConfig);

  assert.ok(prompt.includes("No PII categories are enabled. Return the input unchanged."));
  assert.deepEqual(findDisallowedPlaceholderKeys("Email [EMAIL 1]", redactionConfig), ["EMAIL"]);
}

function testEnabledPlaceholderResolutionAndExtraction() {
  const redactionConfig = {
    categories: {
      identityContact: false,
      governmentLegal: false,
      financialPayment: true,
      medical: false,
      credentialsSecrets: false,
      networkDevice: false,
      businessCase: false
    },
    enabledPlaceholders: ["CREDIT_CARD", "CARD_EXPIRY", "CARD_CVV", "PAYPAL", "BANK_ACCOUNT"]
  };

  assert.deepEqual(getEnabledPlaceholderKeys(redactionConfig), [
    "CREDIT_CARD",
    "CARD_EXPIRY",
    "CARD_CVV",
    "PAYPAL",
    "BANK_ACCOUNT"
  ]);
  assert.deepEqual(
    extractPlaceholderKeys("[CREDIT_CARD 1] [CREDIT_CARD 2] [CARD_CVV 1] [MRN 1]"),
    ["CREDIT_CARD", "CARD_CVV", "MRN"]
  );
}

function testAllCategoryToggleCombinations() {
  const totalCombinations = 1 << ALL_CATEGORY_KEYS.length;

  for (let mask = 0; mask < totalCombinations; mask += 1) {
    const redactionConfig = makeCategoryConfigFromMask(mask);
    const expectedEnabledPlaceholderKeys = ALL_CATEGORY_KEYS.flatMap((categoryKey) =>
      redactionConfig.categories[categoryKey] ? CATEGORY_TO_PLACEHOLDER_KEYS[categoryKey] : []
    );
    const expectedDisallowedPlaceholderKeys = ALL_CATEGORY_KEYS.flatMap((categoryKey) =>
      redactionConfig.categories[categoryKey] ? [] : [REPRESENTATIVE_PLACEHOLDER_BY_CATEGORY[categoryKey]]
    );

    assert.deepEqual(
      getEnabledPlaceholderKeys(redactionConfig),
      expectedEnabledPlaceholderKeys,
      `enabled placeholders mismatch for mask ${mask}`
    );

    assert.deepEqual(
      findDisallowedPlaceholderKeys(ALL_REPRESENTATIVE_PLACEHOLDERS_OUTPUT, redactionConfig),
      expectedDisallowedPlaceholderKeys,
      `disallowed placeholders mismatch for mask ${mask}`
    );

    const prompt = buildPrompt("Synthetic mixed-category input.", redactionConfig);
    const allowedTags = expectedEnabledPlaceholderKeys.map((key) => `[${key} N]`);
    const disallowedTags = expectedDisallowedPlaceholderKeys.map((key) => `[${key} N]`);

    if (allowedTags.length === 0) {
      assert.ok(
        prompt.includes("No PII categories are enabled. Return the input unchanged."),
        `missing no-category instruction for mask ${mask}`
      );
      continue;
    }

    assert.ok(prompt.includes("Allowed placeholders for this run:"), `missing allow-list for mask ${mask}`);
    for (const tag of allowedTags) {
      assert.ok(prompt.includes(tag), `prompt should allow ${tag} for mask ${mask}`);
    }
    for (const tag of disallowedTags) {
      assert.ok(!prompt.includes(tag), `prompt should not allow ${tag} for mask ${mask}`);
    }
  }
}

function run() {
  testFinanceOnMedicalOffPromptScope();
  testIdentityOnGovernmentOffPromptScope();
  testFinanceOnMedicalOffValidation();
  testMedicalOnFinanceOffValidation();
  testNoCategoriesEnabledRejectsAllPlaceholders();
  testEnabledPlaceholderResolutionAndExtraction();
  testAllCategoryToggleCombinations();
  console.log("redaction_category_toggle tests: OK");
}

run();
