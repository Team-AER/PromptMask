import { MODEL_STATE_KEY, describeModelState, normalizeModelState } from "./model_cache.mjs";

const STORAGE_KEY = "promptmask_settings_v1";

const SITE_TOGGLE_IDS = {
  chatgpt: "site-chatgpt",
  gemini: "site-gemini",
  claude: "site-claude",
  perplexity: "site-perplexity",
  grok: "site-grok"
};

const CATEGORY_TOGGLE_IDS = {
  identityContact: "cat-identityContact",
  governmentLegal: "cat-governmentLegal",
  financialPayment: "cat-financialPayment",
  medical: "cat-medical",
  credentialsSecrets: "cat-credentialsSecrets",
  networkDevice: "cat-networkDevice",
  businessCase: "cat-businessCase"
};

const DEFAULT_SETTINGS = {
  sites: {
    chatgpt: true,
    gemini: true,
    claude: true,
    perplexity: true,
    grok: true
  },
  categories: {
    identityContact: true,
    governmentLegal: true,
    financialPayment: true,
    medical: true,
    credentialsSecrets: true,
    networkDevice: true,
    businessCase: true
  }
};

const statusEl = document.getElementById("status");
const activePillEl = document.getElementById("active-pill");
const modelSummaryEl = document.getElementById("model-summary");
const modelDetailEl = document.getElementById("model-detail");
let saveTimeout;
let clearStatusTimeout;

function setStatus(text, kind = "muted") {
  if (!statusEl) {
    return;
  }
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`;
  window.clearTimeout(clearStatusTimeout);
  if (kind === "saved") {
    clearStatusTimeout = window.setTimeout(() => {
      setStatus("Synced", "muted");
    }, 1200);
  }
}

function setPillState(siteSettings) {
  if (!activePillEl) {
    return;
  }

  const hasEnabledSite = Object.values(siteSettings).some(Boolean);
  activePillEl.textContent = hasEnabledSite ? "Active" : "Paused";
  activePillEl.classList.toggle("paused", !hasEnabledSite);
}

function renderModelState(rawModelState) {
  if (!modelSummaryEl || !modelDetailEl) {
    return;
  }

  const { summary, detail } = describeModelState(rawModelState);
  modelSummaryEl.textContent = summary;
  modelDetailEl.textContent = detail;
}

function mergeSettings(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const merged = {
    sites: { ...DEFAULT_SETTINGS.sites },
    categories: { ...DEFAULT_SETTINGS.categories }
  };

  if (source.sites && typeof source.sites === "object") {
    for (const key of Object.keys(merged.sites)) {
      if (typeof source.sites[key] === "boolean") {
        merged.sites[key] = source.sites[key];
      }
    }
  }

  if (source.categories && typeof source.categories === "object") {
    for (const key of Object.keys(merged.categories)) {
      if (typeof source.categories[key] === "boolean") {
        merged.categories[key] = source.categories[key];
      }
    }
  }

  return merged;
}

function getToggleValue(id) {
  const el = document.getElementById(id);
  return Boolean(el?.checked);
}

function setToggleValue(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.checked = Boolean(value);
  }
}

function readSettingsFromUI() {
  const settings = {
    sites: {},
    categories: {}
  };

  for (const [key, id] of Object.entries(SITE_TOGGLE_IDS)) {
    settings.sites[key] = getToggleValue(id);
  }

  for (const [key, id] of Object.entries(CATEGORY_TOGGLE_IDS)) {
    settings.categories[key] = getToggleValue(id);
  }

  return mergeSettings(settings);
}

function applySettingsToUI(settings) {
  for (const [key, id] of Object.entries(SITE_TOGGLE_IDS)) {
    setToggleValue(id, settings.sites[key]);
  }

  for (const [key, id] of Object.entries(CATEGORY_TOGGLE_IDS)) {
    setToggleValue(id, settings.categories[key]);
  }

  setPillState(settings.sites);
}

async function persistSettings() {
  try {
    const settings = readSettingsFromUI();
    await chrome.storage.local.set({ [STORAGE_KEY]: settings });
    setPillState(settings.sites);
    const hasAnyCategory = Object.values(settings.categories).some(Boolean);
    setStatus(hasAnyCategory ? "Saved" : "Saved (all categories off)", "saved");
  } catch (err) {
    setStatus(`Save failed: ${err?.message ?? String(err)}`, "error");
  }
}

function scheduleSave() {
  setPillState(readSettingsFromUI().sites);
  setStatus("Saving...", "saving");
  window.clearTimeout(saveTimeout);
  saveTimeout = window.setTimeout(() => {
    persistSettings();
  }, 100);
}

async function init() {
  try {
    const data = await chrome.storage.local.get([STORAGE_KEY, MODEL_STATE_KEY]);
    const settings = mergeSettings(data[STORAGE_KEY]);
    applySettingsToUI(settings);
    renderModelState(normalizeModelState(data[MODEL_STATE_KEY]));

    if (!data[STORAGE_KEY]) {
      await chrome.storage.local.set({ [STORAGE_KEY]: settings });
    }

    setStatus("Synced", "muted");
  } catch (err) {
    applySettingsToUI(DEFAULT_SETTINGS);
    setPillState(DEFAULT_SETTINGS.sites);
    renderModelState(null);
    setStatus(`Load failed: ${err?.message ?? String(err)}`, "error");
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    if (changes[MODEL_STATE_KEY]) {
      renderModelState(normalizeModelState(changes[MODEL_STATE_KEY].newValue));
    }
  });

  const toggles = document.querySelectorAll("input[type='checkbox']");
  for (const toggle of toggles) {
    toggle.addEventListener("change", scheduleSave);
  }
}

init();
