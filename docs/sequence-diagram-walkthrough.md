# PromptMask — Sequence Diagram Walkthrough

This document explains the sequence diagram step by step: what every participant is, what triggers each phase, and why each interaction exists.

---

## Participants

| Label | What it is |
|---|---|
| **User** | The person typing a prompt into an AI chat page |
| **AI Chat Page** | The host website (ChatGPT, Gemini, Claude, Perplexity, or Grok) |
| **ContentScript** | `content_script.js` — injected into the AI page at `document_start`, intercepts user actions before the page JS sees them |
| **ServiceWorker** | `service_worker.js` — the MV3 background script; routes messages between ContentScript and OffscreenDoc |
| **OffscreenDoc** | `offscreen.js` running inside a hidden offscreen document — the only context where MediaPipe/WebGPU inference can run |
| **ModelCache** | `model_cache.mjs` — manages downloading, caching, and streaming the Gemma model file |
| **CacheAPI** | The browser's built-in Cache API — stores the ~3 GB model file on disk between sessions |
| **HuggingFace** | The remote CDN that hosts the model file (only contacted on first use) |
| **Storage** | `chrome.storage.local` — shared key-value store that all extension contexts read and write |
| **Popup** | `popup.js` / `popup.html` — the settings panel opened when the user clicks the extension icon |

---

## Phase 0 — Extension Startup

**Steps 1–4**

When the user navigates to a supported AI site, Chrome injects `content_script.js` at `document_start` — before any of the page's own JavaScript runs. The content script immediately reads the user's saved settings (which sites and which PII categories are enabled) from Storage, fills in any missing defaults, then sets up two things:

1. A `MutationObserver` that watches the DOM for the compose box to appear.
2. A set of capture-phase global event listeners on `document` (for `focusin`, `keydown`, `click`, etc.) that fire before the host page's own handlers, giving PromptMask first look at every user action.

Nothing is sent to the model at this point — this phase is purely setup.

---

## Phase 1 — User Configures Settings in the Popup

**Steps 5–13**

When the user clicks the extension icon, `popup.js` opens and immediately reads two keys from Storage: the saved toggle settings and the current model download state. It renders all the site and PII category toggles and shows the model status (e.g. "Not downloaded", "Downloading 45%", "Ready").

When the user flips a toggle, the popup debounces the save for 100 ms and writes the new settings to Storage. Because `content_script.js` is already listening to `chrome.storage.onChanged`, it picks up the change immediately — no page reload needed.

---

## Phase 2 — User Types and Hits Send

**Steps 14–20**

As the user types, the content script tracks which element is the active composer. This matters because different sites use `<textarea>`, contenteditable divs, ProseMirror, or Lexical editors.

When the user presses **Enter** or clicks **Send**, the capture-phase listener fires *first*. It:

1. **Swallows the event** — calls `stopPropagation()` and `preventDefault()` so the AI page never sees it.
2. Calls `setBusy()` to visually disable the composer and send button, preventing a second submission while redaction runs.

The original message is preserved in memory.

---

## Phase 3 — Sending the Prompt to the Model

**Steps 21–30**

The content script reads the active category config and sends an `LLM_PROMPT` message to the service worker.

The service worker:
1. Generates a UUID (`requestId`) to correlate the eventual result with this request.
2. Stores the `sendResponse` callback in a `pendingRequests` map.
3. Registers the sender's tab ID so it can relay progress updates back.
4. Calls `ensureOffscreenDocument()` — creates the hidden offscreen page if it doesn't exist yet. The offscreen document is required because WebGPU and WASM need a real document context, which a service worker doesn't provide.

The service worker then forwards the `LLM_PROMPT` (with the `requestId` attached) to the offscreen document.

---

## Phase 4 — Model Initialisation and Download

**Steps 31–58**

The offscreen document queues the task (to prevent parallel calls from corrupting model state), builds the full Gemma prompt string, then asks `ModelCache` for a stream of the model file.

`ModelCache` checks the browser's **Cache API** first:

### If the model is already cached (returning user)

The cached response is returned immediately. `ModelCache` writes `status: "loading"` to Storage. The service worker sees this via `storage.onChanged` and relays a `MODEL_PROGRESS` message to the content script, which shows a spinner in the composer while the model loads into GPU memory.

### If the model is not cached (first-time user)

`ModelCache` fetches the ~3 GB file from HuggingFace. It uses `response.body.tee()` to split the stream into two:
- One half is piped to the **Cache API** to save the file to disk for future sessions.
- The other half is wrapped in a progress-tracking reader.

Every 750 ms or every 8 MB received, `ModelCache` writes the current byte progress to Storage. The service worker relays this to the content script, which shows a download progress banner. Once the stream completes the status transitions to `"loading"` and the banner switches to a spinner.

In both paths, the offscreen document receives a readable stream and passes it directly to MediaPipe.

---

## Phase 5 — LLM Inference

**Steps 59–83**

The offscreen document initialises MediaPipe `LlmInference` with deterministic settings (`temperature: 0`, `topK: 1`, `randomSeed: 1`) so redaction is consistent for the same input. Once the model is loaded, `ModelCache` writes `status: "ready"` to Storage, which the popup reflects immediately.

`generateResponse(prompt)` runs. The raw output is passed through `normalizeOutput` to strip the Gemma `<start_of_turn>` / `<end_of_turn>` framing tokens.

### Safety check — disallowed placeholder keys

The extension checks whether the output accidentally used placeholder tags from a *disabled* category (e.g. it redacted a name as `[NAME 1]` when the identity category was turned off). If any disallowed keys are found:

1. A **correction prompt** is built that explicitly tells the model which tags it must not use.
2. Inference runs a second time.
3. The output is checked again. If disallowed keys still appear, the attempt is reported as an error. Otherwise the cleaned result is used.

If the first attempt was already clean, the result goes straight through.

The offscreen document sends the result (or error) back to the service worker as an `LLM_RESULT` message, carrying the `requestId`.

---

## Phase 6 — Routing the Result Back

**Steps 84–86**

The service worker receives `LLM_RESULT`, looks up the matching `sendResponse` callback in `pendingRequests` by `requestId`, and calls it with `{ result }` or `{ error }`. This resolves the original `chrome.runtime.sendMessage` promise in the content script. The entry is then deleted from `pendingRequests`.

---

## Phase 7 — Applying the Redacted Text

**Steps 87–95**

Back in the content script, `looksLikeValidRedaction` sanity-checks the output — it verifies the result is truthy, the length ratio is plausible, and any changes are represented by proper placeholder tokens.

**If valid:**
- `applyComposerText` writes the redacted text back into the composer. Because AI sites use custom editors, it tries up to four strategies in order: `execCommand("insertText")`, synthetic `beforeinput` event, synthetic paste `ClipboardEvent`, and finally direct DOM mutation — stopping at whichever works first.
- `setBusy(false)` re-enables the composer and send button.
- The internal phase is set to `redacted_preview`.
- A toast shows: *"Redacted — press Enter to send"*.

**If invalid or errored:**
- The original text is restored and an error toast is shown. The user can edit and try again.

---

## Phase 8 — User Confirms and Sends

**Steps 96–104**

The user reviews the redacted text and presses **Enter** (or clicks Send) a second time.

The content script intercepts this event again. This time `handleSendAction` sees the phase is `redacted_preview`, so instead of swallowing the event it:
1. Sets a bypass flag via `allowNativeSubmit()`.
2. Resets all state to idle.
3. Lets the event propagate normally.

The AI chat page receives the event as if the user typed and sent it themselves — but the composer now contains the redacted version. The original message with PII never reaches the AI service.

---

## Summary of the Data Flow

```
User keystroke
  → ContentScript intercepts (capture phase)
    → ServiceWorker  (LLM_PROMPT + requestId)
      → OffscreenDoc (MediaPipe inference)
           ↕ ModelCache (downloads/caches model; streams progress via Storage)
      → ServiceWorker (LLM_RESULT + requestId)
    → ContentScript  (writes redacted text back to composer)
  → User confirms
→ AI Chat Page receives redacted message
```

**Storage acts as the pub/sub bus for progress events**
(ModelCache → Storage → ServiceWorker → ContentScript)

**`chrome.runtime.sendMessage` handles the request/response flow** for the inference result.

This separation is required because the offscreen document cannot message the content script directly — it must route through the service worker.
