# Data Flow

Detailed sequence diagrams for the main flows. For the top-level happy-path diagram, see [DOCUMENTATION.md §5](DOCUMENTATION.md#5-end-to-end-data-flow).

---

## 1. First-run: model download

Triggered the first time the user sends a message with redaction enabled.

```mermaid
sequenceDiagram
    autonumber
    participant CS as content_script
    participant SW as service_worker
    participant OS as offscreen
    participant MC as model_cache
    participant CA as Cache API
    participant HF as HuggingFace CDN
    participant ST as chrome.storage

    CS->>SW: LLM_PROMPT
    SW->>OS: LLM_PROMPT + requestId
    OS->>MC: getModelAssetReader()
    MC->>CA: caches.open("promptmask-model-cache-v1")
    MC->>CA: cache.match(URL)
    CA-->>MC: undefined (miss)
    MC->>ST: writeModelState(status: downloading, 0 bytes)
    ST-->>SW: onChanged
    SW-->>CS: MODEL_PROGRESS
    CS->>CS: showDownloadProgress()
    MC->>HF: fetch(MODEL_DOWNLOAD_URL)
    HF-->>MC: Response (stream)
    MC->>MC: body.tee() → [streamA, streamB]
    par cache write
        MC->>CA: cache.put(URL, Response(streamA))
    and feed inference + progress
        loop every chunk
            MC->>OS: yield chunk (streamB)
            MC->>MC: downloadedBytes += n
            alt every 750ms or 8MB
                MC->>ST: writeModelState(status: downloading, n bytes)
                ST-->>SW: onChanged
                SW-->>CS: MODEL_PROGRESS
                CS->>CS: update banner
            end
        end
    end
    MC->>ST: writeModelState(status: loading)
    OS->>OS: LlmInference.createFromOptions(streamB)
    OS->>ST: writeModelState(status: ready)
    Note over OS: model instance cached in memory<br/>for the life of the offscreen doc
```

---

## 2. Happy-path redaction (model already loaded)

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant C as Composer
    participant CS as content_script
    participant SW as service_worker
    participant OS as offscreen
    participant UT as offscreen_utils
    participant MP as MediaPipe

    U->>C: Enter
    C-->>CS: keydown (capture)
    CS->>CS: handleSendAction<br/>phase=IDLE
    CS->>C: preventDefault + stopImmediatePropagation
    CS->>CS: setBusy(true), showSpinner()
    CS->>SW: LLM_PROMPT {prompt, redactionConfig}
    SW->>SW: requestId = uuid()<br/>pendingRequests.set(requestId, cb)
    SW->>OS: LLM_PROMPT + requestId

    OS->>OS: enqueueInference(task)
    OS->>UT: buildPrompt(text, config)
    UT-->>OS: framed Gemma prompt
    OS->>MP: generateResponse(prompt)
    MP-->>OS: raw output
    OS->>UT: normalizeOutput(raw)
    UT-->>OS: cleaned
    OS->>UT: findDisallowedPlaceholderKeys(cleaned, config)
    UT-->>OS: [] (empty — all good)

    OS->>SW: LLM_RESULT {requestId, result}
    SW->>SW: pendingRequests.get(requestId)(result)
    SW->>SW: delete pendingRequests[requestId]
    SW-->>CS: sendResponse resolves
    CS->>CS: looksLikeValidRedaction() ✓
    CS->>C: applyComposerText(redacted)
    CS->>CS: enterPreview()<br/>phase=PREVIEW
    CS->>CS: hideSpinner(), setBusy(false)
    CS-->>U: Toast "Redacted — press Enter to send"
    U->>C: Enter (second time)
    C-->>CS: keydown
    CS->>CS: phase=PREVIEW → allowNativeSubmit<br/>phase=IDLE
    Note over C: Site's own handler fires normally<br/>and submits redacted text
```

---

## 3. Correction retry (model emits a disabled placeholder)

Happens when the user has e.g. disabled `governmentLegal` but the model still outputs `[SSN 1]`.

```mermaid
sequenceDiagram
    autonumber
    participant OS as offscreen
    participant UT as offscreen_utils
    participant MP as MediaPipe

    OS->>UT: buildPrompt(text, config)<br/>(SSN category NOT mentioned)
    UT-->>OS: prompt
    OS->>MP: generateResponse(prompt)
    MP-->>OS: "...my [SSN 1] is hidden..."
    OS->>UT: normalizeOutput + findDisallowedPlaceholderKeys
    UT-->>OS: ["SSN"]
    OS->>UT: buildCorrectionPrompt(text, config, ["SSN"])
    UT-->>OS: correction prompt<br/>"Do not use [SSN N]. Previously you did. Redo:"
    OS->>MP: generateResponse(correction)
    MP-->>OS: "...my SSN is hidden..." (or masked differently)
    OS->>UT: findDisallowedPlaceholderKeys
    alt still has disallowed keys
        OS-->>OS: throw — return error in LLM_RESULT
    else clean
        OS-->>OS: return cleaned result
    end
```

Only **one** correction round is attempted; a second failure surfaces as an error to the content script, which restores the original text.

---

## 4. Failure / restoration

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant C as Composer
    participant CS as content_script
    participant SW as service_worker
    participant OS as offscreen

    U->>C: Enter
    CS->>CS: capture original text
    CS->>SW: LLM_PROMPT
    SW->>OS: LLM_PROMPT
    OS-->>SW: LLM_RESULT {error: "WebGPU init failed"}
    SW-->>CS: resolves with error
    CS->>CS: setComposerText(composer, originalText)
    CS->>CS: resetToIdle()<br/>phase=IDLE
    CS-->>U: Toast "Redaction failed: WebGPU init failed"
    CS->>CS: hideSpinner(), setBusy(false)
```

Same pattern applies if `looksLikeValidRedaction` rejects the output or if all four `applyComposerText` strategies fail.

---

## 5. Settings update (popup → content script)

```mermaid
sequenceDiagram
    participant U as User
    participant PU as popup.js
    participant ST as chrome.storage
    participant CS as content_script

    U->>PU: Toggle "Medical" off
    PU->>PU: scheduleSave() (100ms debounce)
    PU->>ST: storage.local.set({promptmask_settings_v1: {...}})
    ST-->>PU: onChanged (self)
    ST-->>CS: onChanged (all listening tabs)
    CS->>CS: loadSettings() refresh cached config
    Note over CS: Next redaction uses new category mask
```

No messaging between popup and content script — `chrome.storage.onChanged` is the bus.

---

## 6. Composer detection on navigation

AI chat sites are SPAs; the composer element changes on route changes.

```mermaid
sequenceDiagram
    participant DOM
    participant MO as MutationObserver
    participant CS as content_script

    Note over CS: init() at document_start
    CS->>MO: observe(document.body, {subtree, childList})
    DOM-->>MO: mutation (new composer appears)
    MO->>CS: callback
    CS->>CS: findComposer()
    CS->>CS: bindComposer(newComposer)
    CS->>CS: rememberComposer()
    Note over CS: Also: global capture-phase listeners<br/>on document handle clicks/keys<br/>for composers not yet bound
```

The combination of a MutationObserver and document-level capture-phase listeners is why the extension works reliably across route changes on all five sites.
