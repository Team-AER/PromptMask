## Plan: PII Redaction Chrome Extension (chatgpt.com MVP)

Use Gemma-3n via WebGPU within a Chrome extension to detect and redact PII from prompts typed into chatgpt.com. Start with Gemma-3n to validate the workflow; later swap to FunctionGemma for structured outputs.

### Workflow

1. User types or pastes text in the ChatGPT message composer.
2. On Enter/submit, the extension intercepts the text, sends it to the offscreen Gemma inference worker.
3. Gemma returns the redacted text with placeholders.
4. The content script replaces the input value with the sanitized version and submits the search.

### Steps

1. **Manifest updates**
    - Add `"scripting"` to permissions.
    - Add `"https://chatgpt.com/*"` (and `"https://chat.openai.com/*"` if needed) to `host_permissions`.
    - Declare a `content_scripts` entry targeting `https://chatgpt.com/*` loading `content_script.js` at `document_idle`.

2. **Content script (`extension/content_script.js`)**
    - Locate the composer via `[data-testid="conversation-compose-box"] textarea`, `textarea[placeholder*="Send a message"]`, or other ChatGPT-specific selectors.
    - Attach listeners to the send button and Enter key (respecting Shift+Enter for newline).
    - Prevent default submission, send the text to the service worker (`chrome.runtime.sendMessage`).
    - Replace the composer value with the redacted response, show a temporary loading indicator, then trigger send.
    - Use `MutationObserver` to re-bind when the SPA swaps conversation panes or rerenders the composer.

3. **Reuse existing infrastructure**
   - `extension/service_worker.js` already forwards `LLM_PROMPT` messages and manages the offscreen document.
   - `extension/offscreen.js` already loads the model, initializes MediaPipe `@mediapipe/tasks-genai`, and performs PII redaction via the existing prompt template.

4. **User feedback / latency handling**
    - Disable the composer/send button while redaction runs, show "Redacting..." placeholder.
    - Handle errors by restoring the original prompt and surfacing a toast/banner in the UI overlay.

5. **Testing**
    - Load unpacked extension, open `https://chatgpt.com`.
    - Type text containing sample PII (names, phones, emails, SSNs, API keys, bank data, tokens).
    - Confirm the submitted message replaces sensitive spans with placeholders (`[NAME]`, `[PHONE]`, `[EMAIL]`, `[ADDRESS]`, `[SSN]`, `[API_KEY]`, `[BANK_ACCOUNT]`, `[CREDIT_CARD]`, `[ACCESS_TOKEN]`).

### Message Flow

```
content_script.js (chatgpt.com)
    └── chrome.runtime.sendMessage({ target: "service_worker", type: "LLM_PROMPT", prompt })
service_worker.js
    └── ensure offscreen document exists
    └── forward message to offscreen.js with requestId
offscreen.js (WebGPU)
    └── run Gemma inference via MediaPipe
    └── send result back with same requestId
service_worker.js
    └── respond to original sender (content script)
content_script.js
    └── replace text field value and submit form
```

### Deferred Enhancements

- Expand matches to other domains (Bing, DuckDuckGo, Gmail, Docs).
- Support real-time redaction on blur/debounce.
- Provide a popup toggle to enable/disable per domain.
- Swap to FunctionGemma for structured entity extraction and verification.
- Cache the model via OPFS/IndexedDB for faster startup.
