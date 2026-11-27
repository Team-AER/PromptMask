import assert from "node:assert/strict";

let config;
let storageListener;
const envelopes = [];
globalThis.chrome = {
  storage: {
    local: { async get(key) { return { [key]: config }; } },
    onChanged: { addListener(listener) { storageListener = listener; } }
  },
  runtime: { onMessage: { addListener() {} }, sendMessage: async () => ({}), getURL: path => `chrome-extension://test/${path}`, getManifest: () => ({ version: "1.2.3" }) }
};
globalThis.fetch = async (url, options) => {
  if (String(url).endsWith("manifest.json")) return new Response('{"version":"1.2.3"}');
  if (String(url).endsWith("monitoring-config.json")) return new Response('{"enabled":false}');
  envelopes.push({ url: String(url), body: options.body });
  return new Response("{}", { status: 200 });
};
const monitoring = await import("./monitoring.mjs");
assert.equal(await monitoring.configureMonitoring(), false);
assert.equal(monitoring.reportError(new Error("PRIVATE_SENTINEL")), undefined);
for (const dsn of ["invalid", "https://key@example.com/22", "https://glitchtip.brainfc.uk/22"]) {
  config = { enabled: true, dsn };
  assert.equal(await monitoring.configureMonitoring(), false);
}
config = { enabled: true, dsn: "https://abcdef1234567890@glitchtip.brainfc.uk/22" };
assert.equal(await monitoring.configureMonitoring(), true);
assert.ok(monitoring.reportError(new Error("PRIVATE_SENTINEL")));
assert.equal(await monitoring.flushMonitoring(), true);
assert.equal(envelopes.length, 1);
assert.equal(envelopes[0].body.includes("PRIVATE_SENTINEL"), false);
assert.equal(JSON.parse(envelopes[0].body.split("\n")[2]).release, "promptmask@1.2.3");
config = { enabled: false };
storageListener({ promptmask_monitoring_v1: { newValue: config } }, "local");
assert.equal(await monitoring.configureMonitoring(), false);
assert.equal(monitoring.reportError(new Error("disabled")), undefined);
assert.equal(envelopes.length, 1);
console.log("Monitoring configuration, real SDK delivery, scrubbing and disable passed");

// Offscreen documents expose chrome.runtime but no chrome.storage.
delete chrome.storage;
delete chrome.runtime.getManifest;
let changeListener;
chrome.runtime.onMessage.addListener = listener => { changeListener = listener; };
chrome.runtime.sendMessage = async () => ({ config });
const offscreen = await import("./monitoring.mjs?offscreen");
config = { enabled: true, dsn: "https://abcdef1234567890@glitchtip.brainfc.uk/22" };
assert.equal(await offscreen.configureMonitoring(), true);
assert.ok(offscreen.reportError(new Error("OFFSCREEN_PRIVATE_SENTINEL")));
assert.equal(await offscreen.flushMonitoring(), true);
assert.equal(envelopes.length, 2);
assert.equal(envelopes[1].body.includes("OFFSCREEN_PRIVATE_SENTINEL"), false);
config = { enabled: false };
changeListener({ type: "MONITORING_CONFIG_CHANGED" });
assert.equal(await offscreen.configureMonitoring(), false);
assert.equal(offscreen.reportError(new Error("disabled")), undefined);
console.log("Offscreen runtime configuration, delivery, scrubbing and opt-out passed");
