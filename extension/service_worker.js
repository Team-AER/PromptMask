const pendingRequests = new Map();

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
    }
    return;
  }

  if (message.type === "LLM_PROMPT") {
    const requestId = crypto.randomUUID();
    pendingRequests.set(requestId, sendResponse);

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
        console.error("[Gemma Redaction] Failed to create offscreen doc:", err);
        sendResponse({ error: err?.message ?? String(err) });
      });

    return true;
  }
});
