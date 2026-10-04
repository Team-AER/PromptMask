# PromptMask data flow

See the [architecture](ARCHITECTURE.md) for context and [data model](DATA_MODEL.md) for message schemas.

```mermaid
sequenceDiagram
    actor User
    participant Composer as Chat page composer
    participant CS as Content script
    participant SW as Service worker
    participant OS as Offscreen document
    participant Cache as Browser model cache
    participant HF as Hugging Face
    participant Model as MediaPipe and WebGPU
    User->>Composer: Type draft and submit
    Note over Composer: Site scripts can already read the draft DOM
    CS->>Composer: Consume enabled submission
    CS->>SW: LLM_PROMPT with text and categories
    SW->>OS: LLM_PROMPT with requestId
    OS->>Cache: Request pinned model bytes
    alt Cache miss
        Cache->>HF: Fetch model
        HF-->>Cache: Stream model bytes
        Note over Cache,OS: Stream split between cache write and model loading
    end
    Cache-->>OS: Model stream
    OS->>Model: Initialize if needed and run prompt
    Model-->>OS: Output
    opt Disabled placeholder keys found
        OS->>Model: One correction prompt
        Model-->>OS: Corrected output
    end
    OS-->>SW: LLM_RESULT or error
    SW-->>CS: Resolve original request
    alt Accepted output and editor update
        CS->>Composer: Replace draft with redacted preview
        User->>Composer: Review and submit again
        Note over Composer: Native chat-site submission proceeds
    else Error
        CS->>Composer: Best effort preserve or restore original text
        CS-->>User: Error message
    end
```

The actual inference request is queued to prevent overlapping model calls. The in-memory instance is reused while the offscreen document lives; the cached bytes are reused across sessions when retained. Current console logs include prompts and output.

Model state changes travel through `chrome.storage.local` to the popup and service worker; the worker forwards `MODEL_PROGRESS` to subscribed chat tabs. Cache download/loading states are separate from inference completion.

Popup toggles save `promptmask_settings_v1` with a short debounce. Content scripts refresh cached settings through `chrome.storage.onChanged`; the next redaction uses the new category configuration. All controls default to enabled.

Composer discovery combines selectors, a DOM mutation observer, and document-level capture handlers. This supports changing SPA editors but does not establish compatibility with every live site revision.
