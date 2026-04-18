const pendingRequests = new Map();
const MODEL_STATE_KEY = "promptmask_model_state_v1";

// Track tab IDs that are waiting for model progress updates.
const progressSubscribers = new Set();

async function ensureOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["IFRAME_SCRIPTING"],
    justification: "Run MediaPipe WebGPU inference offscreen."
  });
  console.info("[Gemma Redaction] Offscreen document created.");
}

// Relay model download progress from chrome.storage to subscribed content script tabs.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[MODEL_STATE_KEY]) {
    return;
  }
  if (progressSubscribers.size === 0) {
    return;
  }

  const modelState = changes[MODEL_STATE_KEY].newValue;
  for (const tabId of progressSubscribers) {
    chrome.tabs.sendMessage(tabId, {
      type: "MODEL_PROGRESS",
      modelState
    }).catch(() => {
      // Tab may have been closed or navigated away.
      progressSubscribers.delete(tabId);
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== "service_worker") {
    return;
  }

  if (message.type === "LLM_RESULT") {
    const pending = pendingRequests.get(message.requestId);
    if (pending) {
      pendingRequests.delete(message.requestId);
      pending({ result: message.result, error: message.error });
    }
    if (message.error) {
      console.warn("[Gemma Redaction] Offscreen error:", message.error);
    } else {
      console.info("[Gemma Redaction] Result from model:", JSON.stringify(message.result));
    }
    return;
  }

  if (message.type === "LLM_PROMPT") {
    const requestId = crypto.randomUUID();
    pendingRequests.set(requestId, sendResponse);

    // Subscribe the sender tab for model progress updates.
    const tabId = sender?.tab?.id;
    if (tabId) {
      progressSubscribers.add(tabId);
    }

    ensureOffscreenDocument()
      .then(() => {
        console.info("[Gemma Redaction] Forwarding prompt:", requestId);
        chrome.runtime.sendMessage({
          target: "offscreen",
          type: "LLM_PROMPT",
          requestId,
          prompt: message.prompt,
          redactionConfig: message.redactionConfig
        });
      })
      .catch((err) => {
        pendingRequests.delete(requestId);
        if (tabId) {
          progressSubscribers.delete(tabId);
        }
        console.error("[Gemma Redaction] Failed to create offscreen doc:", err);
        sendResponse({ error: err?.message ?? String(err) });
      });

    return true;
  }
});
