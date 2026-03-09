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

const state = {
  running: false,
  bypassUntil: 0
};
let globalFallbackBound = false;

const SETTINGS_STORAGE_KEY = "promptmask_settings_v1";
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
  return el.isContentEditable || el.getAttribute("role") === "textbox";
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
    try {
      el.dispatchEvent(
        new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: value })
      );
    } catch {
      el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    }
    el.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    return;
  }

  if (el.isContentEditable) {
    el.focus();
    try {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      selection?.removeAllRanges();
      selection?.addRange(range);
      if (document.execCommand) {
        document.execCommand("insertText", false, value);
      }
    } catch {
      // Some editors block selection mutation; fallback to direct text replacement.
    }
  }

  el.textContent = value;
  try {
    el.dispatchEvent(
      new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: value })
    );
  } catch {
    el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  }
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
    return (
      hasPromptHint ||
      el.closest("form") ||
      el.closest("[data-testid='conversation-compose-box']") ||
      el.closest("rich-textarea")
    );
  });

  return editableCandidates[0] ?? null;
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
    return "Local model server is unreachable. Start `python serve_model.py` and try again.";
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
    if (composer.isContentEditable) {
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

function shouldBypass() {
  return Date.now() < state.bypassUntil;
}

function setBypass(durationMs = 1000) {
  state.bypassUntil = Date.now() + durationMs;
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

async function redactAndSend({ composer, sendButton, form }) {
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

  state.running = true;
  setBusy(composer, sendButton, true);
  showSpinner();
  showToast("Redacting...", false);

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
    if (redacted && redacted.trim()) {
      setComposerText(composer, redacted);
    } else {
      setComposerText(composer, originalText);
    }
    await waitForUiUpdate();
    const expectedText = redacted && redacted.trim() ? redacted : originalText;
    if (!composerReflectsValue(composer, expectedText)) {
      setComposerText(composer, expectedText);
      await waitForUiUpdate();
    }

    setBypass();
    if (sendButton) {
      sendButton.click();
    } else if (form?.requestSubmit) {
      form.requestSubmit();
    } else if (form) {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    } else {
      dispatchEnterSubmit(composer);
    }
  } catch (err) {
    setComposerText(composer, originalText);
    const message = formatError(err);
    console.error("[Gemma Redaction] Redaction failed:", err);
    showToast(`Redaction failed: ${message}`, true);
  } finally {
    hideSpinner();
    setBusy(composer, sendButton, false);
    state.running = false;
  }
}

function bindComposer(composer) {
  if (!composer) {
    return;
  }

  if (composer.dataset.gemmaBound !== "true") {
    composer.dataset.gemmaBound = "true";
    composer.addEventListener(
      "keydown",
      (event) => {
        if (shouldBypass()) {
          return;
        }
        if (!isEnterSubmit(event)) {
          return;
        }
        if (!shouldRedactOnCurrentPage()) {
          return;
        }
        if (state.running) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (!getComposerText(composer).trim()) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const { form, sendButton } = getComposerContext(composer);
        redactAndSend({ composer, sendButton, form });
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
        if (shouldBypass()) {
          return;
        }
        if (!shouldRedactOnCurrentPage()) {
          return;
        }
        if (state.running) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (!getComposerText(composer).trim()) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const { sendButton: latestSendButton } = getComposerContext(composer);
        redactAndSend({ composer, sendButton: latestSendButton, form });
      },
      true
    );
  }

  if (sendButton && sendButton.dataset.gemmaBound !== "true") {
    sendButton.dataset.gemmaBound = "true";
    sendButton.addEventListener(
      "click",
      (event) => {
        if (shouldBypass()) {
          return;
        }
        if (!shouldRedactOnCurrentPage()) {
          return;
        }
        if (state.running) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (!getComposerText(composer).trim()) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const { form: latestForm } = getComposerContext(composer);
        redactAndSend({ composer, sendButton, form: latestForm });
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
    "keydown",
    (event) => {
      if (shouldBypass()) {
        return;
      }
      if (!isEnterSubmit(event)) {
        return;
      }
      if (!shouldRedactOnCurrentPage()) {
        return;
      }
      if (state.running) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const composer =
        findComposerFromEventPath(event) ||
        (isEditableComposerElement(getDeepActiveElement()) ? getDeepActiveElement() : null);
      if (!composer) {
        return;
      }
      if (!getComposerText(composer).trim()) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const { form, sendButton } = getComposerContext(composer);
      redactAndSend({ composer, sendButton, form });
    },
    true
  );

  document.addEventListener(
    "click",
    (event) => {
      if (shouldBypass()) {
        return;
      }
      if (!shouldRedactOnCurrentPage()) {
        return;
      }
      if (state.running) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      const sendControl = path.find(matchesSendControl);
      if (!sendControl) {
        return;
      }

      const deepActive = getDeepActiveElement();
      const composer =
        (isEditableComposerElement(deepActive) ? deepActive : null) ||
        findComposerFromEventPath(event) ||
        findComposerNearElement(sendControl) ||
        findComposer();
      if (!composer || !getComposerText(composer).trim()) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const { form, sendButton } = getComposerContext(composer);
      const effectiveSendButton = sendControl instanceof HTMLElement ? sendControl : sendButton;
      redactAndSend({ composer, sendButton: effectiveSendButton, form });
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
