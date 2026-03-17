const COMPOSER_SELECTORS = [
  "[data-testid='conversation-compose-box'] textarea",
  "[data-testid='conversation-compose-box'] input[type='text']",
  "[data-testid='conversation-compose-box'] input[type='search']",
  "textarea#prompt-textarea",
  "textarea[data-testid='prompt-textarea']",
  "textarea[placeholder*='Send a message']",
  "textarea[placeholder*='ask' i]",
  "textarea[placeholder*='claude' i]",
  "input[placeholder*='ask' i]",
  "input[placeholder*='claude' i]",
  "input[placeholder*='search' i]",
  "input[aria-label*='ask' i]",
  "input[aria-label*='prompt' i]",
  "input[aria-label*='message' i]",
  "input[aria-label*='claude' i]",
  "input[aria-label*='search' i]",
  "input[data-testid*='prompt' i]",
  "input[data-testid*='search' i]",
  "textarea[placeholder*='prompt' i]",
  "textarea[aria-label*='message' i]",
  "textarea[aria-label*='prompt' i]",
  "rich-textarea textarea",
  "rich-textarea [contenteditable='true']",
  "rich-textarea [contenteditable='plaintext-only']",
  "div[contenteditable='true'][data-testid='prompt-textarea']",
  "div[contenteditable='plaintext-only'][data-testid='prompt-textarea']",
  "div[contenteditable='true'][aria-label*='Message']",
  "div[contenteditable='true'][aria-label*='message' i]",
  "div[contenteditable='true'][aria-label*='prompt' i]",
  "div[contenteditable='true'][aria-label*='claude' i]",
  "div[contenteditable='plaintext-only'][aria-label*='message' i]",
  "div[contenteditable='plaintext-only'][aria-label*='prompt' i]",
  "div[contenteditable='plaintext-only'][aria-label*='claude' i]",
  "div[contenteditable='true'][data-placeholder*='claude' i]",
  "div[contenteditable='plaintext-only'][data-placeholder*='claude' i]",
  "div.ProseMirror[contenteditable='true']",
  "div.ProseMirror[contenteditable='plaintext-only']",
  "[data-testid*='chat-input' i] [contenteditable='true']",
  "[data-testid*='chat-input' i] [contenteditable='plaintext-only']",
  "div[contenteditable='true'][role='textbox']",
  "div[contenteditable='plaintext-only'][role='textbox']",
  "[role='textbox'][contenteditable='true']",
  "[role='textbox'][contenteditable='plaintext-only']"
];

const SEND_BUTTON_SELECTORS = [
  "button[data-testid='send-button']",
  "button[data-testid*='send' i]",
  "button[data-testid*='send-message' i]",
  "button[data-testid*='submit' i]",
  "button[aria-label='Submit']",
  "button[aria-label*='submit' i]",
  "button[aria-label='Send Message']",
  "button[aria-label*='send message' i]",
  "button[aria-label='Send prompt']",
  "button[aria-label='Send message']",
  "button[aria-label*='send' i]",
  "[role='button'][aria-label*='submit' i]",
  "[role='button'][aria-label*='send' i]",
  "button[title*='send' i]",
  "button[title*='submit' i]",
  "button[mattooltip*='send' i]",
  "button[mattooltip*='submit' i]",
  "button[type='submit']"
];

const PHASE_IDLE = "idle";
const PHASE_PREVIEW = "redacted_preview";

const state = {
  running: false,
  phase: PHASE_IDLE,
  lastFocusedComposer: null,
  lastFocusedAt: 0,
  nativeSubmitBypass: false,
  nativeSubmitComposer: null,
  nativeSubmitBypassUntil: 0
};
let globalFallbackBound = false;
let suppressInputReset = false;
let nativeSubmitBypassTimer = 0;
const handledSendEvents = new WeakSet();
const NATIVE_SUBMIT_BYPASS_MS = 1200;

const SETTINGS_STORAGE_KEY = "promptmask_settings_v1";
const MODEL_STATE_KEY = "promptmask_model_state_v1";
const MODEL_EXPECTED_BYTES = 3040000000;
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

const CATEGORY_TO_PLACEHOLDERS = {
  identityContact: ["NAME", "PHONE", "EMAIL", "USERNAME", "ADDRESS", "DATE_OF_BIRTH"],
  governmentLegal: ["SSN", "PAN", "GST", "DRIVER_LICENSE"],
  financialPayment: ["BANK_ACCOUNT", "CREDIT_CARD", "CARD_EXPIRY", "CARD_CVV", "PAYPAL"],
  medical: ["INSURANCE_ID", "MRN"],
  credentialsSecrets: ["API_KEY", "ACCESS_TOKEN"],
  networkDevice: ["IP_ADDRESS", "DEVICE_ID"],
  businessCase: ["ORDER_ID", "INVOICE_ID", "CASE_ID"]
};

let settings = {
  sites: { ...DEFAULT_SETTINGS.sites },
  categories: { ...DEFAULT_SETTINGS.categories }
};

const busyState = new WeakMap();
const PLACEHOLDER_PREFIXES = [
  "[NAME ",
  "[PHONE ",
  "[EMAIL ",
  "[USERNAME ",
  "[ADDRESS ",
  "[SSN ",
  "[DATE_OF_BIRTH ",
  "[INSURANCE_ID ",
  "[MRN ",
  "[IP_ADDRESS ",
  "[ORDER_ID ",
  "[INVOICE_ID ",
  "[CASE_ID ",
  "[PAN ",
  "[GST ",
  "[DEVICE_ID ",
  "[PAYPAL ",
  "[DRIVER_LICENSE ",
  "[API_KEY ",
  "[BANK_ACCOUNT ",
  "[CREDIT_CARD ",
  "[CARD_EXPIRY ",
  "[CARD_CVV ",
  "[ACCESS_TOKEN "
];

const SPINNER_ID = "gemma-redaction-spinner";
const SPINNER_STYLE_ID = "gemma-redaction-spinner-style";

function getComposerText(el) {
  if (!el) {
    return "";
  }
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return el.value;
  }
  return el.innerText || el.textContent || "";
}

function isContentEditableComposer(el) {
  if (!(el instanceof HTMLElement)) {
    return false;
  }
  if (el.isContentEditable) {
    return true;
  }

  const busySnapshot = busyState.get(el);
  const previousValue = busySnapshot?.contentEditable;
  return previousValue === "true" || previousValue === "plaintext-only";
}

function isEditableComposerElement(el) {
  if (!(el instanceof HTMLElement)) {
    return false;
  }
  if (el.getAttribute("aria-hidden") === "true") {
    return false;
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.type !== "hidden" && !el.disabled && !el.readOnly;
  }
  return isContentEditableComposer(el) || el.getAttribute("role") === "textbox";
}

function rememberComposer(el) {
  if (!isEditableComposerElement(el)) {
    return;
  }
  state.lastFocusedComposer = el;
  state.lastFocusedAt = Date.now();
}

function getRememberedComposer() {
  const remembered = state.lastFocusedComposer;
  if (!remembered) {
    return null;
  }
  if (!remembered.isConnected) {
    state.lastFocusedComposer = null;
    state.lastFocusedAt = 0;
    return null;
  }
  if (!isEditableComposerElement(remembered)) {
    state.lastFocusedComposer = null;
    state.lastFocusedAt = 0;
    return null;
  }
  return remembered;
}

function getDeepActiveElement(root = document) {
  let active = root.activeElement ?? null;
  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  return active;
}

function findComposerFromEventPath(event) {
  if (!event?.composedPath) {
    return null;
  }
  for (const node of event.composedPath()) {
    if (isEditableComposerElement(node)) {
      return node;
    }
  }
  return null;
}

function normalizeComparableText(text) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function composerReflectsValue(composer, expectedValue) {
  return normalizeComparableText(getComposerText(composer)) === normalizeComparableText(expectedValue);
}

function ensureSpinnerStyles() {
  if (document.getElementById(SPINNER_STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = SPINNER_STYLE_ID;
  style.textContent = `
    @keyframes gemmaSpin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

function showSpinner() {
  ensureSpinnerStyles();
  let spinner = document.getElementById(SPINNER_ID);
  if (!spinner) {
    spinner = document.createElement("div");
    spinner.id = SPINNER_ID;
    spinner.setAttribute("role", "status");
    spinner.setAttribute("aria-live", "polite");
    spinner.setAttribute("aria-label", "Redaction in progress");
    spinner.style.position = "fixed";
    spinner.style.bottom = "64px";
    spinner.style.right = "16px";
    spinner.style.width = "28px";
    spinner.style.height = "28px";
    spinner.style.border = "3px solid rgba(255, 255, 255, 0.35)";
    spinner.style.borderTopColor = "#ffffff";
    spinner.style.borderRadius = "50%";
    spinner.style.background = "transparent";
    spinner.style.boxShadow = "0 6px 16px rgba(0, 0, 0, 0.25)";
    spinner.style.animation = "gemmaSpin 0.8s linear infinite";
    spinner.style.zIndex = "2147483647";
    spinner.style.display = "none";
    document.body.appendChild(spinner);
  }
  spinner.style.display = "block";
}

function hideSpinner() {
  const spinner = document.getElementById(SPINNER_ID);
  if (spinner) {
    spinner.style.display = "none";
  }
}

function dispatchComposerInput(el, value) {
  try {
    el.dispatchEvent(
      new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: value })
    );
  } catch {
    el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  }
}

function insertPlainTextWithLineBreaks(range, value) {
  const fragment = document.createDocumentFragment();
  const lines = String(value).split("\n");
  lines.forEach((line, index) => {
    fragment.appendChild(document.createTextNode(line));
    if (index < lines.length - 1) {
      fragment.appendChild(document.createElement("br"));
    }
  });
  range.insertNode(fragment);
}

function placeCaretAtEnd(el) {
  try {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  } catch {
    // Ignore caret placement failures.
  }
}

function setContentEditableComposerText(el, value) {
  el.focus();

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  selection?.removeAllRanges();
  selection?.addRange(range);

  if (typeof document.execCommand === "function") {
    try {
      document.execCommand("insertText", false, value);
    } catch {
      // Fall through to DOM replacement when execCommand is blocked.
    }
  }

  if (!composerReflectsValue(el, value)) {
    range.selectNodeContents(el);
    range.deleteContents();
    insertPlainTextWithLineBreaks(range, value);
    placeCaretAtEnd(el);
  }

  dispatchComposerInput(el, value);
}

function setComposerText(el, value) {
  if (!el) {
    return;
  }
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const proto =
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (valueSetter) {
      valueSetter.call(el, value);
    } else {
      el.value = value;
    }
    dispatchComposerInput(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    return;
  }

  if (isContentEditableComposer(el)) {
    setContentEditableComposerText(el, value);
    return;
  }

  el.textContent = value;
  dispatchComposerInput(el, value);
}

async function applyComposerText(composer, value) {
  setComposerText(composer, value);
  await waitForUiUpdate();
  if (composerReflectsValue(composer, value)) {
    return true;
  }

  setComposerText(composer, value);
  await waitForUiUpdate();
  return composerReflectsValue(composer, value);
}

function sendMessage(payload) {
  function sendOnce(messagePayload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(messagePayload, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(lastError);
          return;
        }
        resolve(response);
      });
    });
  }

  function isRetryableRuntimeError(err) {
    const text = String(err?.message ?? err ?? "").toLowerCase();
    return (
      text.includes("could not establish connection") ||
      text.includes("receiving end does not exist")
    );
  }

  async function sendWithRetry(messagePayload) {
    try {
      return await sendOnce(messagePayload);
    } catch (err) {
      if (!isRetryableRuntimeError(err)) {
        throw err;
      }
      await new Promise((resolve) => {
        window.setTimeout(resolve, 120);
      });
      return sendOnce(messagePayload);
    }
  }

  return sendWithRetry(payload);
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

async function loadSettings() {
  try {
    const data = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
    settings = mergeSettings(data[SETTINGS_STORAGE_KEY]);
  } catch (err) {
    console.warn("[Gemma Redaction] Failed to load settings:", err);
  }
}

function getSiteKeyForHost(host) {
  if (host === "chatgpt.com" || host === "chat.openai.com") {
    return "chatgpt";
  }
  if (host === "gemini.google.com" || host.endsWith(".gemini.google.com")) {
    return "gemini";
  }
  if (host === "claude.ai" || host.endsWith(".claude.ai")) {
    return "claude";
  }
  if (host === "perplexity.ai" || host === "www.perplexity.ai") {
    return "perplexity";
  }
  if (host === "grok.com" || host === "www.grok.com") {
    return "grok";
  }
  return null;
}

function hasAnyEnabledCategory() {
  return Object.values(settings.categories).some(Boolean);
}

function isSiteEnabled() {
  const siteKey = getSiteKeyForHost(window.location.hostname.toLowerCase());
  if (!siteKey) {
    return false;
  }
  return Boolean(settings.sites[siteKey]);
}

function shouldRedactOnCurrentPage() {
  return isSiteEnabled() && hasAnyEnabledCategory();
}

function getCategoryConfig() {
  return { ...settings.categories };
}

function getEnabledPlaceholders() {
  const enabled = new Set();
  const categories = getCategoryConfig();
  for (const [categoryKey, placeholderKeys] of Object.entries(CATEGORY_TO_PLACEHOLDERS)) {
    if (!categories[categoryKey]) {
      continue;
    }
    for (const placeholderKey of placeholderKeys) {
      enabled.add(placeholderKey);
    }
  }
  return Array.from(enabled);
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }
  if (!changes[SETTINGS_STORAGE_KEY]) {
    return;
  }
  settings = mergeSettings(changes[SETTINGS_STORAGE_KEY].newValue);
});

function findComposer() {
  for (const selector of COMPOSER_SELECTORS) {
    const el = document.querySelector(selector);
    if (el) {
      return el;
    }
  }

  const editableCandidates = Array.from(
    document.querySelectorAll(
      "textarea, input[type='text'], input[type='search'], input:not([type]), [contenteditable]:not([contenteditable='false']), [role='textbox']"
    )
  ).filter((el) => {
    if (!(el instanceof HTMLElement)) {
      return false;
    }
    if (el.matches("input[type='hidden']")) {
      return false;
    }
    if (el.getAttribute("aria-hidden") === "true") {
      return false;
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (el.disabled || el.readOnly) {
        return false;
      }
    }
    const attrs = `${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("placeholder") ?? ""}`
      .toLowerCase()
      .trim();
    const hasPromptHint =
      attrs.includes("message") ||
      attrs.includes("prompt") ||
      attrs.includes("ask") ||
      attrs.includes("claude") ||
      attrs.includes("perplexity") ||
      attrs.includes("grok");
    const insideComposeRegion =
      Boolean(el.closest("form")) ||
      Boolean(el.closest("[data-testid='conversation-compose-box']")) ||
      Boolean(el.closest("rich-textarea")) ||
      Boolean(el.closest("[data-testid*='composer' i]")) ||
      Boolean(el.closest("[class*='composer' i]"));

    return hasPromptHint || insideComposeRegion;
  });

  if (editableCandidates.length === 0) {
    return null;
  }

  const scored = editableCandidates
    .map((el) => {
      const attrs = `${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("placeholder") ?? ""}`
        .toLowerCase()
        .trim();
      const rect = typeof el.getBoundingClientRect === "function" ? el.getBoundingClientRect() : null;
      let score = 0;
      if (attrs.includes("message")) score += 4;
      if (attrs.includes("ask")) score += 4;
      if (attrs.includes("prompt")) score += 3;
      if (attrs.includes("claude") || attrs.includes("perplexity")) score += 2;
      if (el.closest("[data-testid='conversation-compose-box']")) score += 3;
      if (el.closest("[data-testid*='composer' i]") || el.closest("[class*='composer' i]")) score += 2;
      if (el.closest("form")) score += 1;
      if (el instanceof HTMLTextAreaElement || el.isContentEditable) score += 1;
      if (rect && rect.bottom >= window.innerHeight * 0.45) score += 2;
      if (rect && rect.width >= Math.min(window.innerWidth * 0.35, 420)) score += 1;
      return { el, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.el ?? editableCandidates[0];
}

function findComposerInContainer(container) {
  if (!container || typeof container.querySelector !== "function") {
    return null;
  }
  for (const selector of COMPOSER_SELECTORS) {
    const candidate = container.querySelector(selector);
    if (candidate && isEditableComposerElement(candidate)) {
      return candidate;
    }
  }
  const fallback = container.querySelector(
    "textarea, input[type='text'], input[type='search'], input:not([type]), [contenteditable]:not([contenteditable='false']), [role='textbox']"
  );
  return isEditableComposerElement(fallback) ? fallback : null;
}

function findSendButton(scope) {
  if (!scope) {
    return null;
  }
  for (const selector of SEND_BUTTON_SELECTORS) {
    const el = scope.querySelector(selector);
    if (el) {
      return el;
    }
  }
  return null;
}

function matchesSendControl(el) {
  if (!(el instanceof Element)) {
    return false;
  }
  for (const selector of SEND_BUTTON_SELECTORS) {
    try {
      if (el.matches(selector)) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

function findComposerNearElement(el) {
  if (!(el instanceof Element)) {
    return null;
  }
  const candidates = [
    el.getRootNode?.(),
    el.closest("form"),
    el.closest("[data-testid='conversation-compose-box']"),
    el.closest("[data-testid*='composer' i]"),
    el.closest("[class*='composer' i]"),
    document
  ].filter(Boolean);

  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    const composer = findComposerInContainer(candidate);
    if (composer) {
      return composer;
    }
  }
  return null;
}

function getComposerContext(composer) {
  const form = composer?.closest("form") ?? null;
  const candidateScopes = [
    form,
    composer?.closest("[data-testid='conversation-compose-box']") ?? null,
    composer?.closest("[data-testid*='composer' i]") ?? null,
    composer?.closest("[class*='composer' i]") ?? null,
    document
  ].filter(Boolean);

  let scope = document;
  let sendButton = null;
  const seen = new Set();
  for (const candidateScope of candidateScopes) {
    if (seen.has(candidateScope)) {
      continue;
    }
    seen.add(candidateScope);
    const candidateButton = findSendButton(candidateScope);
    if (candidateButton) {
      scope = candidateScope;
      sendButton = candidateButton;
      break;
    }
  }

  return { form, scope, sendButton };
}

function showToast(message, isError = false) {
  let toast = document.getElementById("gemma-redaction-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "gemma-redaction-toast";
    toast.style.position = "fixed";
    toast.style.bottom = "16px";
    toast.style.right = "16px";
    toast.style.zIndex = "2147483647";
    toast.style.padding = "10px 14px";
    toast.style.borderRadius = "10px";
    toast.style.fontSize = "13px";
    toast.style.fontFamily = "system-ui, sans-serif";
    toast.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.2)";
    toast.style.transition = "opacity 160ms ease";
    toast.style.opacity = "0";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.style.background = isError ? "#701f2b" : "#1b3a57";
  toast.style.color = "#f8f8f8";
  toast.style.opacity = "1";

  window.clearTimeout(toast._gemmaTimeout);
  toast._gemmaTimeout = window.setTimeout(() => {
    toast.style.opacity = "0";
  }, isError ? 4000 : 2000);
}

const DOWNLOAD_BANNER_ID = "gemma-download-banner";

function showDownloadProgress(label, percent) {
  let banner = document.getElementById(DOWNLOAD_BANNER_ID);
  if (!banner) {
    banner = document.createElement("div");
    banner.id = DOWNLOAD_BANNER_ID;
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.style.cssText = [
      "position: fixed",
      "bottom: 16px",
      "right: 16px",
      "z-index: 2147483647",
      "width: 280px",
      "padding: 12px 16px",
      "border-radius: 12px",
      "font-family: system-ui, sans-serif",
      "font-size: 13px",
      "color: #f0f0f0",
      "background: linear-gradient(135deg, #1b3a57 0%, #163049 100%)",
      "box-shadow: 0 8px 28px rgba(0, 0, 0, 0.3)",
      "transition: opacity 200ms ease",
      "opacity: 0"
    ].join("; ");

    const labelEl = document.createElement("div");
    labelEl.dataset.role = "label";
    labelEl.style.marginBottom = "8px";
    labelEl.style.fontWeight = "500";
    banner.appendChild(labelEl);

    const trackEl = document.createElement("div");
    trackEl.dataset.role = "track";
    trackEl.style.cssText = [
      "width: 100%",
      "height: 6px",
      "border-radius: 3px",
      "background: rgba(255, 255, 255, 0.15)",
      "overflow: hidden"
    ].join("; ");

    const fillEl = document.createElement("div");
    fillEl.dataset.role = "fill";
    fillEl.style.cssText = [
      "height: 100%",
      "width: 0%",
      "border-radius: 3px",
      "background: linear-gradient(90deg, #4fc3f7 0%, #29b6f6 50%, #039be5 100%)",
      "transition: width 400ms ease"
    ].join("; ");

    trackEl.appendChild(fillEl);
    banner.appendChild(trackEl);
    document.body.appendChild(banner);
  }

  const labelEl = banner.querySelector("[data-role='label']");
  const fillEl = banner.querySelector("[data-role='fill']");
  if (labelEl) {
    labelEl.textContent = label;
  }
  if (fillEl) {
    const clampedPct = Math.max(0, Math.min(100, percent ?? 0));
    fillEl.style.width = `${clampedPct}%`;
  }
  banner.style.opacity = "1";
}

function hideDownloadProgress() {
  const banner = document.getElementById(DOWNLOAD_BANNER_ID);
  if (banner) {
    banner.style.opacity = "0";
    window.setTimeout(() => {
      banner.remove();
    }, 250);
  }
}

function formatError(err) {
  const text = String(err?.message ?? err ?? "");
  const normalized = text.toLowerCase();
  if (normalized.includes("extension context invalidated")) {
    return "Extension updated. Refresh this tab, then submit again.";
  }
  if (normalized.includes("could not establish connection")) {
    return "PromptMask is reconnecting. Retry once in a moment.";
  }
  if (normalized.includes("receiving end does not exist")) {
    return "Extension reloaded. Refresh this tab, then try again.";
  }
  if (
    normalized.includes("failed to load model from all urls") ||
    normalized.includes("failed to fetch model")
  ) {
    return "Could not download the redaction model. Check your connection and try again.";
  }

  if (!err) {
    return "Unknown error";
  }
  if (typeof err === "string") {
    return err;
  }
  if (err?.message) {
    return err.message;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function setBusy(composer, sendButton, busy) {
  if (!composer) {
    return;
  }

  if (busy) {
    if (!busyState.has(composer)) {
      busyState.set(composer, {
        pointerEvents: composer.style.pointerEvents,
        opacity: composer.style.opacity,
        contentEditable: composer.getAttribute("contenteditable"),
        readOnly: composer.readOnly
      });
    }
    composer.style.pointerEvents = "none";
    composer.style.opacity = "0.7";
    if (isContentEditableComposer(composer)) {
      composer.setAttribute("contenteditable", "false");
    } else if ("readOnly" in composer) {
      composer.readOnly = true;
    }

    if (sendButton) {
      sendButton.dataset.gemmaPrevDisabled = sendButton.disabled ? "true" : "false";
      sendButton.disabled = true;
      sendButton.setAttribute("aria-disabled", "true");
    }
    return;
  }

  const previous = busyState.get(composer);
  if (previous) {
    composer.style.pointerEvents = previous.pointerEvents ?? "";
    composer.style.opacity = previous.opacity ?? "";
    if (previous.contentEditable === null) {
      composer.removeAttribute("contenteditable");
    } else if (previous.contentEditable !== undefined) {
      composer.setAttribute("contenteditable", previous.contentEditable);
    }
    if ("readOnly" in composer) {
      composer.readOnly = Boolean(previous.readOnly);
    }
    busyState.delete(composer);
  } else {
    composer.style.pointerEvents = "";
    composer.style.opacity = "";
  }

  if (sendButton) {
    const wasDisabled = sendButton.dataset.gemmaPrevDisabled === "true";
    sendButton.disabled = wasDisabled;
    sendButton.removeAttribute("aria-disabled");
    delete sendButton.dataset.gemmaPrevDisabled;
  }
}

function isEnterSubmit(event) {
  return event.key === "Enter" && !event.shiftKey && !event.isComposing;
}

function isPreviewReady() {
  return state.phase === PHASE_PREVIEW;
}

function enterPreview() {
  state.phase = PHASE_PREVIEW;
}

function resetToIdle() {
  state.phase = PHASE_IDLE;
  hideToast();
}

function allowNativeSubmit(composer) {
  state.nativeSubmitBypass = true;
  state.nativeSubmitComposer = composer ?? null;
  state.nativeSubmitBypassUntil = Date.now() + NATIVE_SUBMIT_BYPASS_MS;
  window.clearTimeout(nativeSubmitBypassTimer);
  nativeSubmitBypassTimer = window.setTimeout(() => {
    state.nativeSubmitBypass = false;
    state.nativeSubmitComposer = null;
    state.nativeSubmitBypassUntil = 0;
  }, NATIVE_SUBMIT_BYPASS_MS);
}

function shouldBypassSendInterception(composer) {
  if (!state.nativeSubmitBypass || Date.now() > state.nativeSubmitBypassUntil) {
    state.nativeSubmitBypass = false;
    state.nativeSubmitComposer = null;
    state.nativeSubmitBypassUntil = 0;
    return false;
  }
  if (!state.nativeSubmitComposer || !composer) {
    return true;
  }
  return state.nativeSubmitComposer === composer;
}

function hideToast() {
  const toast = document.getElementById("gemma-redaction-toast");
  if (toast) {
    window.clearTimeout(toast._gemmaTimeout);
    toast.style.opacity = "0";
  }
}

function consumeSendEvent(event) {
  if (!event) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") {
    event.stopImmediatePropagation();
  }
}

function dispatchEnterSubmit(composer) {
  const keyEventOptions = {
    key: "Enter",
    code: "Enter",
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true
  };
  composer.dispatchEvent(new KeyboardEvent("keydown", keyEventOptions));
  composer.dispatchEvent(new KeyboardEvent("keypress", keyEventOptions));
  composer.dispatchEvent(new KeyboardEvent("keyup", keyEventOptions));
}

function waitForUiUpdate() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resolve);
    });
  });
}

function looksLikeValidRedaction(originalText, redactedText) {
  if (!redactedText) {
    return false;
  }
  const originalLength = originalText.length;
  const redactedLength = redactedText.length;

  if (originalLength <= 20) {
    return true;
  }

  const hasPlaceholder = PLACEHOLDER_PREFIXES.some((prefix) => redactedText.includes(prefix));
  if (redactedLength < 12) {
    return false;
  }

  if (redactedLength < originalLength * 0.35 && !hasPlaceholder) {
    return false;
  }

  return true;
}

function formatDownloadPercent(downloadedBytes, totalBytes) {
  const total = totalBytes || MODEL_EXPECTED_BYTES;
  if (total <= 0) {
    return null;
  }
  return Math.min(100, Math.floor((downloadedBytes / total) * 100));
}

async function getModelStatus() {
  try {
    const data = await chrome.storage.local.get(MODEL_STATE_KEY);
    const raw = data[MODEL_STATE_KEY];
    return (raw && typeof raw === "object" && typeof raw.status === "string")
      ? raw.status
      : "not_downloaded";
  } catch {
    return "not_downloaded";
  }
}

function handleModelProgress(modelState) {
  if (!modelState || typeof modelState !== "object") {
    return;
  }
  const status = modelState.status;
  if (status === "downloading") {
    const total = (typeof modelState.totalBytes === "number" && modelState.totalBytes > 0)
      ? modelState.totalBytes
      : MODEL_EXPECTED_BYTES;
    const downloaded = typeof modelState.downloadedBytes === "number"
      ? modelState.downloadedBytes
      : 0;
    const pct = formatDownloadPercent(downloaded, total);
    showDownloadProgress(
      pct !== null ? `Downloading model\u2026 ${pct}%` : "Downloading model\u2026",
      pct ?? 0
    );
  } else if (status === "loading") {
    showDownloadProgress("Loading model\u2026", 100);
  } else if (status === "ready") {
    showDownloadProgress("Model ready \u2014 redacting\u2026", 100);
  }
}

async function redactAndPreview({ composer, sendButton }) {
  if (!composer) {
    return;
  }
  if (!shouldRedactOnCurrentPage()) {
    return;
  }
  if (state.running) {
    return;
  }
  const originalText = getComposerText(composer);
  if (!originalText || !originalText.trim()) {
    return;
  }
  rememberComposer(composer);

  state.running = true;
  setBusy(composer, sendButton, true);
  showSpinner();

  // Check whether the model is already cached.
  const modelStatus = await getModelStatus();
  const isFirstUse = modelStatus !== "ready";
  let progressListener = null;

  if (isFirstUse) {
    showDownloadProgress("Downloading model for first use\u2026", 0);
    // Listen for MODEL_PROGRESS messages relayed by the service worker.
    progressListener = (message) => {
      if (message && message.type === "MODEL_PROGRESS") {
        handleModelProgress(message.modelState);
      }
    };
    chrome.runtime.onMessage.addListener(progressListener);
  } else {
    showToast("Redacting...", false);
  }

  try {
    console.info("[Gemma Redaction] Sending prompt for redaction.");
    const response = await sendMessage({
      target: "service_worker",
      type: "LLM_PROMPT",
      prompt: originalText,
      redactionConfig: {
        categories: getCategoryConfig(),
        enabledPlaceholders: getEnabledPlaceholders()
      }
    });

    if (response?.error) {
      console.warn("[Gemma Redaction] Service worker error:", response.error);
      throw new Error(response.error);
    }

    const redacted = response?.result ?? "";
    if (!looksLikeValidRedaction(originalText, redacted)) {
      console.warn("[Gemma Redaction] Suspicious output:", redacted);
      throw new Error("Redaction output looks incomplete.");
    }
    suppressInputReset = true;
    const expectedText = redacted && redacted.trim() ? redacted : originalText;
    const writeSucceeded = await applyComposerText(composer, expectedText);
    if (!writeSucceeded) {
      throw new Error("Could not update the message editor with the redacted text.");
    }

    enterPreview();
    // Allow an extra frame for trailing async input events to settle.
    await waitForUiUpdate();
    suppressInputReset = false;
    showToast("\u2705 Redacted \u2014 press Enter to send", false);
  } catch (err) {
    setComposerText(composer, originalText);
    const message = formatError(err);
    console.error("[Gemma Redaction] Redaction failed:", err);
    showToast(`Redaction failed: ${message}`, true);
  } finally {
    if (progressListener) {
      chrome.runtime.onMessage.removeListener(progressListener);
      hideDownloadProgress();
    }
    suppressInputReset = false;
    hideSpinner();
    setBusy(composer, sendButton, false);
    state.running = false;
  }
}

function handleSendAction(event, composer) {
  if (!shouldRedactOnCurrentPage()) {
    return;
  }
  if (event && handledSendEvents.has(event)) {
    return;
  }
  if (event) {
    handledSendEvents.add(event);
  }
  if (shouldBypassSendInterception(composer)) {
    return;
  }

  if (state.running) {
    consumeSendEvent(event);
    return;
  }

  if (isPreviewReady()) {
    // Phase 2: user confirmed — let the event through to submit normally.
    allowNativeSubmit(composer);
    resetToIdle();
    return;
  }

  // Phase 1 (idle): intercept, redact, show preview.
  if (!getComposerText(composer).trim()) {
    return;
  }
  consumeSendEvent(event);
  const { sendButton } = getComposerContext(composer);
  redactAndPreview({ composer, sendButton });
}

function bindComposer(composer) {
  if (!composer) {
    return;
  }
  rememberComposer(composer);

  if (composer.dataset.gemmaBound !== "true") {
    composer.dataset.gemmaBound = "true";
    composer.addEventListener(
      "focus",
      () => {
        rememberComposer(composer);
      },
      true
    );
    composer.addEventListener(
      "input",
      () => {
        rememberComposer(composer);
        // User edited text while in preview — redaction is stale, reset.
        if (isPreviewReady() && !suppressInputReset) {
          resetToIdle();
        }
      },
      true
    );
    composer.addEventListener(
      "keydown",
      (event) => {
        rememberComposer(composer);
        if (!isEnterSubmit(event)) {
          return;
        }
        handleSendAction(event, composer);
      },
      true
    );
  }

  const { form, sendButton } = getComposerContext(composer);

  if (form && form.dataset.gemmaBound !== "true") {
    form.dataset.gemmaBound = "true";
    form.addEventListener(
      "submit",
      (event) => {
        handleSendAction(event, composer);
      },
      true
    );
  }

  if (sendButton && sendButton.dataset.gemmaBound !== "true") {
    sendButton.dataset.gemmaBound = "true";
    sendButton.addEventListener(
      "pointerdown",
      (event) => {
        handleSendAction(event, composer);
      },
      true
    );
    sendButton.addEventListener(
      "click",
      (event) => {
        handleSendAction(event, composer);
      },
      true
    );
  }
}

function observeComposer() {
  const observer = new MutationObserver(() => {
    const composer = findComposer();
    if (composer) {
      bindComposer(composer);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  const composer = findComposer();
  if (composer) {
    bindComposer(composer);
  }
}

function bindGlobalFallbackHandlers() {
  if (globalFallbackBound) {
    return;
  }
  globalFallbackBound = true;

  document.addEventListener(
    "focusin",
    (event) => {
      const composer =
        findComposerFromEventPath(event) ||
        (isEditableComposerElement(event.target) ? event.target : null);
      if (composer) {
        rememberComposer(composer);
      }
    },
    true
  );

  document.addEventListener(
    "input",
    (event) => {
      const composer =
        findComposerFromEventPath(event) ||
        (isEditableComposerElement(event.target) ? event.target : null);
      if (composer) {
        rememberComposer(composer);
        if (isPreviewReady() && !suppressInputReset) {
          resetToIdle();
        }
      }
    },
    true
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (!isEnterSubmit(event)) {
        return;
      }

      const composer =
        findComposerFromEventPath(event) ||
        (isEditableComposerElement(getDeepActiveElement()) ? getDeepActiveElement() : null) ||
        getRememberedComposer();
      if (!composer) {
        return;
      }

      handleSendAction(event, composer);
    },
    true
  );

  document.addEventListener(
    "pointerdown",
    (event) => {
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      const sendControl = path.find(matchesSendControl);
      if (!sendControl) {
        return;
      }

      const deepActive = getDeepActiveElement();
      const composer =
        (isEditableComposerElement(deepActive) ? deepActive : null) ||
        findComposerFromEventPath(event) ||
        getRememberedComposer() ||
        findComposerNearElement(sendControl) ||
        findComposer();
      if (!composer) {
        return;
      }

      handleSendAction(event, composer);
    },
    true
  );

  document.addEventListener(
    "click",
    (event) => {
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      const sendControl = path.find(matchesSendControl);
      if (!sendControl) {
        return;
      }

      const deepActive = getDeepActiveElement();
      const composer =
        (isEditableComposerElement(deepActive) ? deepActive : null) ||
        findComposerFromEventPath(event) ||
        getRememberedComposer() ||
        findComposerNearElement(sendControl) ||
        findComposer();
      if (!composer) {
        return;
      }

      handleSendAction(event, composer);
    },
    true
  );
}

async function init() {
  await loadSettings();
  observeComposer();
  bindGlobalFallbackHandlers();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    init();
  }, { once: true });
} else {
  init();
}
