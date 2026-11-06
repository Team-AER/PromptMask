import assert from "node:assert/strict";

import {
  CATEGORY_KEYS,
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  SITE_KEYS,
  mergeSettings
} from "./settings.mjs";

function testDefaultsEnableKnownSitesAndCategories() {
  assert.equal(SETTINGS_STORAGE_KEY, "promptmask_settings_v1");
  assert.deepEqual(Object.keys(DEFAULT_SETTINGS.sites), SITE_KEYS);
  assert.deepEqual(Object.keys(DEFAULT_SETTINGS.categories), CATEGORY_KEYS);
  assert.ok(Object.values(DEFAULT_SETTINGS.sites).every(Boolean));
  assert.ok(Object.values(DEFAULT_SETTINGS.categories).every(Boolean));
}

function testMergeSettingsKeepsKnownBooleansOnly() {
  const merged = mergeSettings({
    sites: {
      chatgpt: false,
      unknownSite: false,
      gemini: "no"
    },
    categories: {
      identityContact: false,
      businessCase: "no"
    }
  });

  assert.equal(merged.sites.chatgpt, false);
  assert.equal(merged.sites.gemini, true);
  assert.equal(merged.sites.unknownSite, undefined);
  assert.equal(merged.categories.identityContact, false);
  assert.equal(merged.categories.businessCase, true);
}

function testMergeSettingsHandlesInvalidInput() {
  assert.deepEqual(mergeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(mergeSettings("invalid"), DEFAULT_SETTINGS);
}

function run() {
  testDefaultsEnableKnownSitesAndCategories();
  testMergeSettingsKeepsKnownBooleansOnly();
  testMergeSettingsHandlesInvalidInput();
  console.log("settings tests: OK");
}

run();
