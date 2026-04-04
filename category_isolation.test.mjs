import assert from "node:assert/strict";

import {
  CATEGORY_TO_PLACEHOLDER_KEYS,
  buildPrompt,
  findDisallowedPlaceholderKeys
} from "./extension/offscreen_utils.mjs";

const ALL_CATEGORY_KEYS = Object.keys(CATEGORY_TO_PLACEHOLDER_KEYS);

function makeCategoryConfig(overrides = {}) {
  const categories = Object.fromEntries(ALL_CATEGORY_KEYS.map((key) => [key, true]));
  return { categories: { ...categories, ...overrides } };
}

// Config with all categories ON except one.
function allExcept(disabledCategory) {
  return makeCategoryConfig({ [disabledCategory]: false });
}

// Synthetic output containing every placeholder key from a category, each once.
function syntheticOutput(categoryKey) {
  return CATEGORY_TO_PLACEHOLDER_KEYS[categoryKey]
    .map((key, i) => `[${key} ${i + 1}]`)
    .join(" ");
}

// ---------------------------------------------------------------------------
// One OFF isolation: disable exactly one category, verify 4 assertions.
// ---------------------------------------------------------------------------

function testOneOffIsolation(disabledCategory) {
  const config = allExcept(disabledCategory);
  const disabledKeys = CATEGORY_TO_PLACEHOLDER_KEYS[disabledCategory];
  const prompt = buildPrompt("Synthetic mixed-category input.", config);

  // 1. buildPrompt excludes ALL placeholder definitions for the disabled category.
  for (const key of disabledKeys) {
    assert.ok(
      !prompt.includes(`[${key} N]`),
      `prompt should NOT include [${key} N] when ${disabledCategory} is disabled`
    );
  }

  // 2. buildPrompt includes ALL placeholder definitions for every enabled category.
  for (const otherCategory of ALL_CATEGORY_KEYS) {
    if (otherCategory === disabledCategory) continue;
    for (const key of CATEGORY_TO_PLACEHOLDER_KEYS[otherCategory]) {
      assert.ok(
        prompt.includes(`[${key} N]`),
        `prompt should include [${key} N] when ${otherCategory} is enabled (${disabledCategory} disabled)`
      );
    }
  }

  // 3. findDisallowedPlaceholderKeys catches ALL keys from the disabled category
  //    (not just the representative first one as in the 128-combo test).
  assert.deepEqual(
    findDisallowedPlaceholderKeys(syntheticOutput(disabledCategory), config),
    disabledKeys,
    `should catch every key from disabled category ${disabledCategory}`
  );

  // 4. findDisallowedPlaceholderKeys allows all other categories' placeholder keys.
  for (const otherCategory of ALL_CATEGORY_KEYS) {
    if (otherCategory === disabledCategory) continue;
    assert.deepEqual(
      findDisallowedPlaceholderKeys(syntheticOutput(otherCategory), config),
      [],
      `should allow all keys from ${otherCategory} when only ${disabledCategory} is disabled`
    );
  }
}

function run() {
  for (const categoryKey of ALL_CATEGORY_KEYS) {
    testOneOffIsolation(categoryKey);
  }
  console.log("category_isolation tests: OK");
}

run();
