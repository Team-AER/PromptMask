import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

import { MODEL_STATE_KEY } from "./model_cache.mjs";

import {
  CATEGORY_KEYS,
  CATEGORY_TO_PLACEHOLDER_KEYS,
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

function extract(source, pattern, label) {
  const match = source.match(pattern);
  assert.ok(match, `Could not extract ${label} from content_script.js`);
  return match[0];
}

// content_script.js cannot import ES modules, so it keeps its own copy of the
// settings constants. Evaluate that copy and require it to match settings.mjs.
function loadContentScriptSettings() {
  const source = fs.readFileSync(new URL("./content_script.js", import.meta.url), "utf8");
  const snippet = [
    extract(source, /const SETTINGS_STORAGE_KEY = [\s\S]*?\nconst DEFAULT_SETTINGS = \{[\s\S]*?\n\};/, "settings constants"),
    extract(source, /function mergeSettings\(raw\) \{[\s\S]*?\n\}/, "mergeSettings"),
    extract(source, /function mergeBooleanSection\(defaults, rawSection\) \{[\s\S]*?\n\}/, "mergeBooleanSection"),
    `globalThis.__exports = {
      SETTINGS_STORAGE_KEY, MODEL_STATE_KEY, CATEGORY_TO_PLACEHOLDERS, SITE_KEYS, DEFAULT_SETTINGS, mergeSettings
    };`
  ].join("\n\n");
  const context = vm.createContext({ globalThis: {} });
  new vm.Script(snippet).runInContext(context);
  // Round-trip through JSON so objects from the vm realm compare with deepStrictEqual.
  const exported = context.globalThis.__exports;
  return { ...JSON.parse(JSON.stringify(exported)), mergeSettings: (raw) => JSON.parse(JSON.stringify(exported.mergeSettings(raw))) };
}

function testContentScriptCopyMatchesSettingsModule() {
  const copy = loadContentScriptSettings();
  assert.equal(copy.SETTINGS_STORAGE_KEY, SETTINGS_STORAGE_KEY);
  assert.equal(copy.MODEL_STATE_KEY, MODEL_STATE_KEY);
  assert.deepEqual(copy.SITE_KEYS, SITE_KEYS);
  assert.deepEqual(copy.CATEGORY_TO_PLACEHOLDERS, CATEGORY_TO_PLACEHOLDER_KEYS);
  assert.deepEqual(copy.DEFAULT_SETTINGS, DEFAULT_SETTINGS);

  const raw = { sites: { chatgpt: false, gemini: "no", extra: false }, categories: { medical: false } };
  assert.deepEqual(copy.mergeSettings(raw), mergeSettings(raw));
  assert.deepEqual(copy.mergeSettings(null), mergeSettings(null));
}

function run() {
  testDefaultsEnableKnownSitesAndCategories();
  testMergeSettingsKeepsKnownBooleansOnly();
  testMergeSettingsHandlesInvalidInput();
  testContentScriptCopyMatchesSettingsModule();
  console.log("settings tests: OK");
}

run();
