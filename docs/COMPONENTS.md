# Component Reference

Per-file API surface, with line-number anchors. For the narrative overview, see [DOCUMENTATION.md §6](DOCUMENTATION.md#6-component-reference).

Paths are relative to the repo root.

---

## `extension/manifest.json`

MV3 manifest. Declares:

- `permissions`: `offscreen`, `storage`, `unlimitedStorage`
- `host_permissions`: 5 chat sites + HuggingFace
- `background.service_worker`: `service_worker.js` (`"type": "module"`)
- `content_scripts[0]`: `content_script.js`, matches all 9 chat URLs, `run_at: document_start`, `all_frames: true`
- `action.default_popup`: `popup.html`
- `content_security_policy.extension_pages`: `script-src 'self' 'wasm-unsafe-eval'` (needed for MediaPipe WASM)

---

## `extension/service_worker.js`

Message router. ~91 lines, no durable state.

| Symbol | Lines | Purpose |
|---|---|---|
| `pendingRequests` | module-level `Map` | `requestId` → `sendResponse` callback |
| `progressSubscribers` | module-level `Set` | tab IDs that want `MODEL_PROGRESS` relayed |
| `ensureOffscreenDocument()` | L7–L18 | Idempotent `chrome.offscreen.createDocument` |
| `chrome.storage.onChanged` | L21–L39 | Watches `MODEL_STATE_KEY`; forwards to subscriber tabs |
| `chrome.runtime.onMessage` | L41–L90 | Routes `LLM_PROMPT` → offscreen; `LLM_RESULT` → caller. Returns `true` to keep the channel open for async `sendResponse`. |

**Invariant:** every `LLM_PROMPT` must eventually resolve or reject its callback; callbacks are deleted from `pendingRequests` on resolution. If the offscreen doc crashes, the callback will leak until the SW itself is evicted — acceptable since `pendingRequests` is in-memory only.

---

## `extension/content_script.js` (~1564 lines)

The biggest and most defensive file. Organized roughly:

| Section | Approx. lines | What lives there |
|---|---|---|
| Constants & selectors | 1–110 | `COMPOSER_SELECTORS`, `SEND_BUTTON_SELECTORS`, storage keys, timing constants |
| Logging / small helpers | 110–310 | `log`, `warn`, safe DOM helpers |
| Spinner / toast / download banner UI | 310–500 | DOM-built floating UI (inline styles, high z-index) |
| Composer text I/O | 473–585 | `getComposerText`, `setComposerText`, `applyComposerText` |
| Settings | 586–658 | `loadSettings`, `getCategoryConfig`, `getEnabledPlaceholders` |
| Composer detection | 658–780 | `findComposer`, element scoring |
| Event predicates | 1093–1175 | `isEnterSubmit`, `shouldBypassSendInterception`, `looksLikeValidRedaction` |
| Send-interception state machine | 1214–1422 | `redactAndPreview`, `handleSendAction`, `enterPreview`, `resetToIdle`, `allowNativeSubmit` |
| Composer binding | 1352–1422 | `bindComposer`, `observeComposer` |
| Global fallback handlers | 1439–1544 | Document-level capture-phase listeners |
| `init()` | 1545–1548 | Entry point |

### Key functions

| Function | Lines | Purpose |
|---|---|---|
| `findComposer()` | 658–733 | Scores candidates from `COMPOSER_SELECTORS`, prefers visible focused editable elements |
| `applyComposerText(composer, text)` | 501–519 | Tries 4 write strategies in order: (1) `execCommand('selectAll')` + `execCommand('insertText')`, (2) synthetic `beforeinput`, (3) synthetic `paste` via `ClipboardEvent`, (4) direct DOM mutation. Returns `true` on first success. |
| `looksLikeValidRedaction(orig, red)` | 1176–1180 | Sanity checks: truthy and non-empty; if original is >80 chars then redacted must be ≥20 chars |
| `redactAndPreview({composer, sendButton})` | 1214–1315 | Orchestrator: reads state, sends message, validates, writes, shows toast |
| `handleSendAction(event, composer)` | 1317–1351 | State machine: IDLE → intercept + redact; PREVIEW → pass through |
| `bindComposer(composer)` | 1352–1422 | Attaches keydown/input/focus listeners, plus form `submit` and send-button `click` |
| `bindGlobalFallbackHandlers()` | 1439–1544 | Document-level safety net for composers that appear after SPA navigation |
| `init()` | 1545 | `loadSettings()` + `observeComposer()` + `bindGlobalFallbackHandlers()` |

### State variables

| Name | Type | Purpose |
|---|---|---|
| `state.phase` | `"idle" \| "redacted_preview"` | Send-interception phase (`PHASE_IDLE` / `PHASE_PREVIEW` constants) |
| `state.running` | `boolean` | True while a redaction request is in-flight |
| `state.lastFocusedComposer` | `HTMLElement \| null` | Most recently focused composer element |
| `state.lastFocusedAt` | `number` | Timestamp of last focus event |
| `state.modelReadyForSession` | `boolean` | True once the model has reported `status: ready` in this session |
| `state.nativeSubmitBypass` | `boolean` | True during the passthrough window after a successful redaction |
| `state.nativeSubmitComposer` | `HTMLElement \| null` | Composer associated with the current passthrough bypass |
| `state.nativeSubmitBypassUntil` | `number` | Timestamp when the bypass window expires (NATIVE_SUBMIT_BYPASS_MS = 1200 ms) |

---

## `extension/offscreen.js` (~138 lines)

| Symbol | Lines | Purpose |
|---|---|---|
| `WASM_URL` | L9 | URL to `extension/lib/wasm/` resolved via `chrome.runtime.getURL` |
| `MAX_TOKENS` | L10 | `16384` — token budget passed to `LlmInference.createFromOptions` |
| `llmInferenceInstance` | module-level | Cached `LlmInference` (never recreated) |
| `inferenceQueue` | `Promise` chain | Serializes concurrent prompts |
| `initModel()` | 17–53 | Lazy init; writes `status: ready` on success, `status: error` on failure |
| `runInference(prompt)` | 55–74 | `instance.generateResponse(prompt)` with a `generate()` fallback |
| `enqueueInference(task)` | 76–80 | `inferenceQueue = inferenceQueue.then(task)` |
| `chrome.runtime.onMessage` | 82–138 | Handles `LLM_PROMPT`; builds prompt via `offscreen_utils`, runs inference, runs correction retry if needed, posts `LLM_RESULT` |

**Why serialize inference?** MediaPipe's `LlmInference` is not safe to call concurrently on the same instance. The promise-chain queue ensures FIFO ordering without pulling in a library.

---

## `extension/offscreen_utils.mjs` (~338 lines)

Pure functions. Unit-tested in `offscreen_utils.test.mjs`.

| Symbol | Lines | Purpose |
|---|---|---|
| `PROMPT_PREAMBLE` | L1 | System instruction |
| `CATEGORY_PLACEHOLDER_LINES` | L9–L48 | Per-category placeholder schema text |
| `GENERIC_NUMBERING_RULES` | L50–L60 | Shared numbering and de-duplication rules (applied to all prompts) |
| `CATEGORY_RULES` | L61–L89 | Per-category extra heuristics |
| `PROMPT_EXAMPLES` | L91–L169 | 14 in-context examples, each tagged with categories |
| `CATEGORY_TO_PLACEHOLDER_KEYS` | L173 | `Record<CategoryKey, string[]>` |
| `buildRedactionPrompt(enabledKeys)` | L183–L216 | Filters preamble/rules/examples to enabled categories |
| `REDACTION_PROMPT` | L233 | Prebuilt "all categories enabled" prompt |
| `getEnabledCategoryKeys(config)` | L235–L243 | `Object.entries(config.categories).filter(...)` |
| `getEnabledPlaceholderKeys(config)` | L244–L253 | Maps enabled categories → placeholder keys |
| `buildPrompt(text, config)` | L255–L272 | Wraps with Gemma turn framing |
| `buildCorrectionPrompt(text, config, bad)` | L274–L288 | Self-correction prompt |
| `extractPlaceholderKeys(text)` | L290–L304 | Regex `/\[([A-Z_]+)\s+\d+\]/g` |
| `findDisallowedPlaceholderKeys(text, config)` | L306–L313 | Set difference vs. `getEnabledPlaceholderKeys` |
| `normalizeOutput(raw)` | L315–L338 | Strips `<start_of_turn>model` prefix, `<end_of_turn>` suffix, and continuation markers |

---

## `extension/model_cache.mjs` (~328 lines)

| Symbol | Lines | Purpose |
|---|---|---|
| `MODEL_DOWNLOAD_URL` | L5 | HuggingFace CDN URL |
| `MODEL_CACHE_NAME` | L6 | `"promptmask-model-cache-v1"` |
| `MODEL_STATE_KEY` | L7 | `"promptmask_model_state_v1"` |
| `MODEL_EXPECTED_BYTES` | L8 | ~2 GB hint |
| `MODEL_DISPLAY_SIZE` | L9 | `"2 GB"` display string |
| `createDefaultModelState()` | 14–27 | Initial state factory |
| `normalizeModelState(raw)` | 29–57 | Merge-with-defaults, type-safe |
| `isModelReady(state)` | 58–60 | `state.status === "ready"` |
| `formatByteCount(n)` | 62–78 | `"2.50 GB"` formatter |
| `describeModelState(state)` | 84–124 | Human-readable summary + detail |
| `readModelState()` / `writeModelState()` | 125–147 | Storage I/O |
| `openCachedModelResponse()` | 149–158 | `cache.match(url)` |
| `deleteCachedModel()` | 160–170 | Clears cache + resets state |
| `requestPersistentStorage()` | 171–181 | `navigator.storage.persist()` |
| `shouldEmitProgress(prev, next)` | 183–191 | Throttle (≥ 750 ms or ≥ 8 MB) |
| `createProgressReader(stream, total)` | 193–251 | Wraps stream, emits progress |
| `getModelAssetReader()` | 253–328 | Main entry: cache check → fetch + `tee()` on miss → returns `ReadableStream` for MediaPipe |

---

## `extension/popup.js` (~206 lines)

| Symbol | Lines | Purpose |
|---|---|---|
| `STORAGE_KEY` | L3 | `"promptmask_settings_v1"` |
| `SITE_TOGGLE_IDS` | L5–11 | Map |
| `CATEGORY_TOGGLE_IDS` | L13–21 | Map |
| `DEFAULT_SETTINGS` | L23–40 | All enabled |
| `setStatus(text, kind)` | 49–62 | "Saved" / "Saving" / "Error" footer |
| `setPillState(siteSettings)` | 63–71 | Header pill (active if any site is enabled) |
| `renderModelState(state)` | 73–81 | Model status block |
| `mergeSettings(raw)` | 83–107 | Merge raw storage value with defaults |
| `readSettingsFromUI()` | 121–136 | Checkbox → object |
| `applySettingsToUI(settings)` | 138–148 | Object → checkboxes |
| `persistSettings()` | 150–160 | Save + update pill |
| `scheduleSave()` | 162–169 | 100 ms debounce |
| `init()` | 171–206 | Read storage, render, attach listeners |

---

## `extension/lib/genai_bundle.mjs`

Thin re-export of MediaPipe's bundled GenAI tasks. Exposes:

- `FilesetResolver.forGenAiTasks(wasmDir)` → resolves the WASM files in `lib/wasm/`
- `LlmInference.createFromOptions(resolver, options)` → the runtime

---

## Python helpers

### `download_models.py`

| Symbol | Lines | Purpose |
|---|---|---|
| `MODELS` dict | 14–27 | Registry: `gemma3n-e2b-web` and `gemma4-e2b-web`, each with `repo_id`, `filename`, `format` |
| `list_models()` | 30–37 | Pretty-print registry |
| `download_model(key, output_dir, token)` | 40–88 | `hf_hub_download(repo_id, filename, local_dir)`; supports `HF_TOKEN` env var |
| `download_all(output_dir, format_filter)` | 91–102 | Bulk |
| `main()` | 105–161 | `argparse` CLI: `--list`, `--model`, `--all`, `--output-dir` |

### `bundle_model.py` (~138 lines)

Calls `mediapipe.tasks.python.genai.bundler.create_bundle(...)` to package custom TFLite + SentencePiece into a `.task` MediaPipe can load.

### `serve_model.py` (~78 lines)

`ThreadingHTTPServer` with a `CORSRequestHandler` subclass. Serves `./` (so `test.html` works) plus `models/` with `Access-Control-Allow-Origin: *`.

---

## Test files

### Unit (Node, `node --test` style)

| File | Under test |
|---|---|
| `extension/offscreen_utils.test.mjs` | `buildPrompt`, `normalizeOutput`, `findDisallowedPlaceholderKeys`, `buildCorrectionPrompt` |
| `extension/model_cache.test.mjs` | `normalizeModelState`, `formatByteCount`, `shouldEmitProgress`, `createProgressReader` |

### Integration / behavioral

| File | Covers |
|---|---|
| `category_isolation.test.mjs` | Disabling a category fully removes it from the built prompt |
| `cross_contamination.test.mjs` | Disabled categories don't leak through |
| `redaction_category_toggle.test.mjs` | Full flow under toggle combinations |
| `content_script_editor_resolution.test.mjs` | Composer detection across editor variants |
| `content_script_validation.test.mjs` | Selector coverage per supported site |

### Evaluation scripts

| File | Purpose |
|---|---|
| `evaluate_redaction_snippets.mjs` | Runs a corpus through the model; measures recall/precision |
| `evaluate_category_toggle.mjs` | Measures per-category leak rate; output in `category_toggle_eval_results.json` |
