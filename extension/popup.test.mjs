import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { MODEL_STATE_KEY, describeModelState, normalizeModelState } from "./model_cache.mjs";

const source = fs.readFileSync(new URL("./popup.js", import.meta.url), "utf8")
  .replace(/^import[^\n]+\n/, "");
const siteNames = ["chatgpt", "gemini", "claude", "perplexity", "grok"];
const categoryNames = ["identityContact", "governmentLegal", "financialPayment", "medical", "credentialsSecrets", "networkDevice", "businessCase"];
const defaults = () => ({sites: Object.fromEntries(siteNames.map(k => [k, true])), categories: Object.fromEntries(categoryNames.map(k => [k, true]))});
const flush = () => new Promise(resolve => setImmediate(resolve));

async function fixture({getError = false, write = async () => {}} = {}) {
  const elements = new Map();
  const feedback = [];
  const create = () => ({textContent: "", className: "", checked: true, disabled: false,
    classList: {add() {}, toggle() {}}, setAttribute() {}, addEventListener() {},
    appendChild(el) { feedback.push(el); }, remove() { feedback.splice(feedback.indexOf(this), 1); }});
  for (const id of ["status", "active-pill", "model-summary", "model-detail",
    ...siteNames.map(k => "site-" + k), ...categoryNames.map(k => "cat-" + k)]) {
    const element = create();
    element.closest = () => element;
    elements.set(id, element);
  }
  const toggles = [...elements].filter(([id]) => /^(site|cat)-/.test(id)).map(([,el]) => el);
  const writes = [];
  const context = vm.createContext({MODEL_STATE_KEY, describeModelState, normalizeModelState,
    window: {setTimeout, clearTimeout},
    document: {getElementById: id => elements.get(id), createElement: create,
      querySelectorAll: selector => selector === ".setting-feedback" ? [...feedback] : toggles},
    chrome: {storage: {local: {get: async () => {
      if (getError) throw new Error("unavailable");
      return {promptmask_settings_v1: defaults()};
    }, set: async value => { writes.push(value); await write(value); }}, onChanged: {addListener() {}}}}
  });
  vm.runInContext(source, context);
  await flush();
  const change = async id => {
    const element = elements.get(id);
    element.checked = !element.checked;
    context.event = {target: element};
    vm.runInContext("scheduleSave(event); window.clearTimeout(saveTimeout)", context);
  };
  return {elements, feedback, writes, context, change};
}

{
  const f = await fixture({write: async () => { throw new Error("failed"); }});
  await f.change("cat-medical");
  await vm.runInContext("persistSettings()", f.context);
  assert.equal(f.elements.get("cat-medical").checked, true, "failed save restores confirmed setting");
  assert.equal(f.elements.get("status").textContent, "", "row recovery is not repeated in the header");
  assert.equal(f.elements.get("active-pill").textContent, "Enabled on 5 sites");
  assert.equal(f.feedback.length, 1, "error stays beside the changed setting");
  assert.equal(f.feedback[0].textContent, "Not saved. Setting restored. Try again.");
}

{
  const f = await fixture({write: async () => { throw new Error("failed"); }});
  await vm.runInContext("persistSettings()", f.context);
  assert.match(f.elements.get("status").textContent, /Could not save/, "failures without a changed row retain global recovery");
  assert.equal(f.feedback.length, 0);
}

{
  let release;
  const firstWrite = new Promise(resolve => { release = resolve; });
  let count = 0;
  const f = await fixture({write: async () => { if (++count === 1) await firstWrite; }});
  await f.change("site-chatgpt");
  const first = vm.runInContext("persistSettings()", f.context);
  await f.change("site-gemini");
  await vm.runInContext("persistSettings()", f.context);
  assert.equal(f.writes.length, 1, "writes cannot race each other");
  release();
  await first;
  await flush();
  assert.equal(f.writes.length, 2);
  const stored = f.writes[1].promptmask_settings_v1;
  assert.equal(stored.sites.chatgpt, false);
  assert.equal(stored.sites.gemini, false);
  assert.equal(f.elements.get("active-pill").textContent, "Enabled on 3 sites");
  vm.runInContext("window.clearTimeout(clearStatusTimeout)", f.context);
}

{
  const f = await fixture({getError: true});
  assert.equal(f.elements.get("active-pill").textContent, "Settings unavailable");
  assert.equal(f.elements.get("cat-medical").disabled, true);
  assert.match(f.elements.get("status").textContent, /Close and reopen/);
}

console.log("PASS: save failure recovery, serialized rapid changes, and load failure state");
