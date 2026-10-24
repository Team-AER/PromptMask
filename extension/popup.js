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
let persistedSettings = null;
let settingsRevision = 0;
let saving = false;
let saveQueued = false;
const changedRows = new Set();

function setStatus(text, kind = "muted") {
  if (!statusEl) {
    return;
  }
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`;
  window.clearTimeout(clearStatusTimeout);
  if (kind === "saved") {
    clearStatusTimeout = window.setTimeout(() => {
      setStatus("Settings saved on this device", "muted");
    }, 1200);
  }
}

function setPillState(settings) {
  if (!activePillEl) {
    return;
  }

  const siteCount = Object.values(settings.sites).filter(Boolean).length;
  const hasCategories = Object.values(settings.categories).some(Boolean);
  activePillEl.textContent = !siteCount ? "Disabled on all sites"
    : !hasCategories ? "All categories off"
    : `Enabled on ${siteCount} ${siteCount === 1 ? "site" : "sites"}`;
  activePillEl.classList.toggle("paused", !siteCount || !hasCategories);
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

  setPillState(settings);
}

async function persistSettings() {
  if (saving) {
    saveQueued = true;
    return;
  }
  saving = true;
  const revision = settingsRevision;
  const settings = readSettingsFromUI();
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: settings });
    persistedSettings = settings;
    setPillState(settings);
    if (revision === settingsRevision) {
      changedRows.clear();
      setStatus("Saved", "saved");
    }
  } catch (err) {
    if (revision === settingsRevision) {
      if (persistedSettings) applySettingsToUI(persistedSettings);
      setStatus("Could not save. Previous settings restored. Try the change again.", "error");
      for (const row of changedRows) {
        const feedback = document.createElement("span");
        feedback.className = "setting-feedback";
        feedback.setAttribute("role", "alert");
        feedback.textContent = "Not saved. Previous setting restored; try again.";
        row.appendChild(feedback);
      }
      changedRows.clear();
    }
  } finally {
    saving = false;
    if (saveQueued) {
      saveQueued = false;
      persistSettings();
    }
  }
}

function scheduleSave(event) {
  settingsRevision += 1;
  document.querySelectorAll(".setting-feedback").forEach(el => el.remove());
  const row = event.target.closest(".setting-row");
  if (row) changedRows.add(row);
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

    persistedSettings = settings;
    setStatus("Settings saved on this device", "muted");
  } catch (err) {
    applySettingsToUI(DEFAULT_SETTINGS);
    activePillEl.textContent = "Settings unavailable";
    activePillEl.classList.add("paused");
    document.querySelectorAll("input[type='checkbox']").forEach(el => el.disabled = true);
    renderModelState(null);
    setStatus("Could not load settings. Close and reopen PromptMask to try again.", "error");
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
