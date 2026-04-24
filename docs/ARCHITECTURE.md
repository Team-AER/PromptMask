# Architecture

This document goes deeper than [DOCUMENTATION.md §4](DOCUMENTATION.md#4-system-architecture). It covers the **execution-context model**, **trust boundaries**, and the **key state machines** inside the extension.

---

## 1. Execution contexts

Chrome MV3 isolates code into several runtime contexts. PromptMask uses four, each with different capabilities:

```mermaid
flowchart TB
    subgraph Browser["Chrome Browser"]
        subgraph Tab["Host Tab (chat site)"]
            Page[Page main world<br/>site's own JS]
            CS[content_script.js<br/>isolated world]
        end

        subgraph Ext["Extension process"]
            SW["service_worker.js<br/>(MV3 background)"]
            OFF["offscreen.html<br/>(hidden document)"]
            POP["popup.html<br/>(browser action)"]
        end

        subgraph Platform["Browser Platform APIs"]
            MSG[chrome.runtime messaging]
            STO[chrome.storage.local]
            CACHE[Cache API]
            GPU[WebGPU]
        end
    end

    Page <-.DOM.-> CS
    CS <-->|sendMessage| MSG
    POP <-->|sendMessage| MSG
    SW <-->|sendMessage| MSG
    OFF <-->|sendMessage| MSG

    SW <--> STO
    CS <--> STO
    POP <--> STO
    OFF <--> STO

    OFF --> CACHE
    OFF --> GPU

    classDef page fill:#fff8e1,stroke:#a0773a
    classDef ext fill:#e3f2fd,stroke:#1565c0
    classDef plat fill:#eceff1,stroke:#455a64
    class Page,CS page
    class SW,OFF,POP ext
    class MSG,STO,CACHE,GPU plat
```

### Capability matrix

| Context | DOM access | WebGPU | Cache API | Persistent state | Module imports |
|---|---|---|---|---|---|
| Page main world | ✅ full | ✅ | ✅ | ✅ | ✅ |
| Content script (isolated world) | ✅ DOM only (no page JS globals) | ❌ | ❌ | ❌ (use messaging → SW) | ❌ (classic script) |
| Service worker | ❌ | ❌ | ❌ | ❌ (ephemeral; use `storage`) | ✅ (`"type": "module"`) |
| Offscreen document | ✅ (its own hidden DOM) | ✅ | ✅ | ✅ while alive | ✅ |
| Popup | ✅ (own DOM) | ✅ | ✅ | ✅ while open | ✅ |

This capability asymmetry is why the architecture looks the way it does:
- **Redaction must happen in the offscreen doc** — only it has WebGPU + Cache API.
- **The service worker can't hold the model** — it gets killed; the offscreen doc doesn't.
- **The content script can't call MediaPipe** — it has no module support and no WebGPU in isolated-world pages.
- The service worker is therefore reduced to a **pure router**.

---

## 2. Logical component map

```mermaid
flowchart LR
    subgraph I["Input layer (content script)"]
        D[Composer detection<br/>COMPOSER_SELECTORS]
        L[Event listeners<br/>capture-phase]
        SM[Send state machine]
    end

    subgraph R["Redaction layer"]
        RQ[Redaction request<br/>redactAndPreview]
        V[Output validator<br/>looksLikeValidRedaction]
        W[Composer writer<br/>applyComposerText]
    end

    subgraph T["Transport layer"]
        SW[Service worker router]
    end

    subgraph E["Engine layer (offscreen)"]
        PB[Prompt builder<br/>offscreen_utils]
        IN[Inference runner<br/>offscreen.js]
        G[Output guardrails<br/>findDisallowedPlaceholderKeys]
    end

    subgraph M["Model layer"]
        MC[Model cache<br/>model_cache.mjs]
        MP[MediaPipe LlmInference]
        HF[(HuggingFace CDN)]
    end

    subgraph C["Config layer"]
        PU[Popup UI]
        SS[(chrome.storage.local)]
    end

    D --> L --> SM --> RQ
    RQ --> SW --> IN
    IN --> PB --> IN
    IN --> MP --> IN
    IN --> G --> IN
    IN --> SW --> RQ
    RQ --> V --> W

    MC --> HF
    MC --> MP
    IN --> MC

    PU <--> SS
    RQ <--> SS
    MC --> SS
    SW --> SS
```

---

## 3. Send-interception state machine (content script)

The content script runs a small state machine per composer element. This is where most of the subtlety lives — every chat site has different quirks around how Enter and the Send button dispatch events.

```mermaid
stateDiagram-v2
    [*] --> idle

    idle --> running: user submits<br/>(Enter without Shift, or Send click)<br/>[preventDefault + stopImmediatePropagation]

    running --> redacted_preview: LLM_RESULT ok<br/>+ looksLikeValidRedaction ✓<br/>+ applyComposerText ✓

    running --> idle: failure<br/>(invalid output / error / user edit)<br/>[restore original + toast]

    redacted_preview --> passthrough: user submits again<br/>within bypass window (1200ms)<br/>[allowNativeSubmit → nativeSubmitBypass=true]

    redacted_preview --> running: user edits & resubmits

    passthrough --> idle: event propagates to site<br/>[resetToIdle]
```

**Code mapping:** `idle` = `PHASE_IDLE` constant; `running` = `state.running === true` (no dedicated phase value); `redacted_preview` = `PHASE_PREVIEW` constant; `passthrough` = `state.nativeSubmitBypass === true`.

**Why two phases?** The extension can't submit for the user — that would require synthesizing a trusted event. Instead it shows the redacted version and asks the user to confirm with a second Enter. The passthrough window (`nativeSubmitBypass`) exists for exactly one event dispatch (1200 ms timeout).

---

## 4. Trust boundaries

```mermaid
flowchart LR
    subgraph U["User's device (trusted)"]
        direction TB
        subgraph UT["Trusted: extension contexts"]
            CS[content_script]
            SW[service_worker]
            OS[offscreen + model]
        end
        subgraph UU["Semi-trusted: host page"]
            P[AI chat site JS]
        end
    end

    subgraph N["Network"]
        HF[HuggingFace<br/>model download only]
        AI[AI chat backend<br/>redacted text only]
    end

    CS -.isolated world.- P
    P -->|redacted prompt| AI
    OS -->|HTTPS fetch<br/>model bytes| HF

    classDef good fill:#e8f5e9,stroke:#2e7d32
    classDef meh fill:#fff3e0,stroke:#ef6c00
    classDef net fill:#eceff1,stroke:#455a64
    class UT good
    class UU meh
    class N,HF,AI net
```

Key invariant: **original (un-redacted) text must never cross the `content_script → page main world` boundary except through `applyComposerText`, and only after passing `looksLikeValidRedaction`.** If the model output is rejected, the composer is restored to the original — the original never touches `window.fetch` etc. because it was already sitting in the composer.

---

## 5. Why each design choice

| Decision | Rationale |
|---|---|
| Use the **Cache API** for model storage, not IndexedDB | Cache stores `Response` objects natively; MediaPipe accepts a `ReadableStream`, avoiding a full-in-memory copy of 2 GB |
| **`tee()`** the download stream | Write to cache + feed inference simultaneously; the second run is instant because the cache is already warm |
| **Service worker stays stateless** (just a Map of pending callbacks) | MV3 can terminate the SW at any time; all durable state lives in `chrome.storage.local` and the offscreen doc |
| **Two-phase submit** (`idle` → `running` → `redacted_preview` → passthrough) | Extensions can't synthesize trusted events that bypass site security; the user’s second Enter is the only reliable trigger |
| **Disallowed-key correction retry** | Open-weight models occasionally emit tags they weren't told about; one correction round has measurable improvement (see `category_toggle_eval_results.json`) |
| **Deterministic decoding** (`temperature=0, topK=1, seed=1`) | Users expect the same input to produce the same redaction; also makes evals reproducible |

---

## 6. Failure modes & fallbacks

```mermaid
flowchart TB
    A[Send action intercepted] --> B{Model ready?}
    B -- no --> B1[Show download banner]
    B1 --> B2{Download succeeds?}
    B2 -- no --> ERR1[Toast: download failed<br/>restore original]
    B2 -- yes --> C
    B -- yes --> C[Inference]
    C --> D{Output present?}
    D -- no --> ERR2[Toast: empty output<br/>restore original]
    D -- yes --> E{Disallowed keys?}
    E -- yes --> E1[Correction retry]
    E1 --> F
    E -- no --> F{looksLikeValidRedaction?}
    F -- no --> ERR3[Toast: validation failed<br/>restore original]
    F -- yes --> G{applyComposerText<br/>one of 4 strategies works?}
    G -- no --> ERR4[Toast: write failed<br/>restore original]
    G -- yes --> OK[Enter PREVIEW phase]

    classDef err fill:#ffebee,stroke:#c62828
    classDef ok fill:#e8f5e9,stroke:#2e7d32
    class ERR1,ERR2,ERR3,ERR4 err
    class OK ok
```

Every error path **restores the original composer text** so the user never loses work.
