# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

PromptMask is a Chrome extension (Manifest V3) that intercepts prompts on AI chat sites (ChatGPT, Gemini, Claude, Grok, Perplexity) and redacts PII before the user sends them. Redaction runs **entirely on-device** using Google's Gemma 4 E2B model via MediaPipe's WebGPU inference API.

## Commands

### Python setup (model management)
```bash
pip install -r requirements.txt
python download_models.py --model gemma4-e2b-web   # downloads ~2GB model into models/
python download_models.py --list                   # list available models
python serve_model.py                              # serves test.html + models/ at localhost:8000
```

### Running the model locally (requires lit binary on PATH)
```bash
lit run models/gemma-4-E2B-it-web.task -f prompt.txt --backend cpu
```

### JavaScript unit tests (no test runner — plain Node)
```bash
node extension/offscreen_utils.test.mjs         # prompt-building and output normalization
node extension/model_cache.test.mjs             # model state and download progress
node category_isolation.test.mjs                # per-category prompt filtering
node cross_contamination.test.mjs               # disabled-category non-leakage
node redaction_category_toggle.test.mjs         # end-to-end redaction under toggle combos
node content_script_editor_resolution.test.mjs  # composer detection across editor types
node content_script_validation.test.mjs         # selector coverage for supported sites
```

### Evaluation harness (requires downloaded model + lit)
```bash
node evaluate_redaction_snippets.mjs            # runs model over test_redaction_snippets.txt
node evaluate_category_toggle.mjs               # runs model over test_redaction_category_toggle.txt
```

### Load the extension in Chrome
Load `extension/` as an unpacked extension in `chrome://extensions`. The model (~2GB) is downloaded on first use from Hugging Face and cached in the browser's Cache Storage API.

## Architecture

### Message flow (send interception)

```
content_script.js
  → chrome.runtime.sendMessage({ target: "service_worker", type: "LLM_PROMPT" })
  → service_worker.js (creates offscreen doc if needed, forwards message)
  → offscreen.js (runs MediaPipe LlmInference, sends LLM_RESULT back)
  → service_worker.js (resolves pending promise, returns result to content script)
  → content_script.js (writes redacted text back into composer DOM element)
```

**Two-phase send interception:** The content script intercepts Enter/click in capture phase (registered at `document_start` before host-page scripts). Phase 1 (idle → redacted_preview): intercept send, run redaction, write result back to composer. Phase 2 (redacted_preview): user presses Enter again to confirm — bypass flag is set and the event passes through natively.

### Key files

| File | Role |
|------|------|
| `extension/content_script.js` | Intercepts send events, manages composer DOM, drives the redaction flow |
| `extension/service_worker.js` | MV3 service worker; bridges content script ↔ offscreen doc; relays model download progress |
| `extension/offscreen.js` | Runs MediaPipe `LlmInference` in the offscreen document; queues inference requests serially |
| `extension/offscreen_utils.mjs` | Builds the redaction prompt, normalizes model output, detects disallowed placeholders |
| `extension/model_cache.mjs` | Manages model download from Hugging Face, chunked streaming into Cache Storage, state persistence in `chrome.storage.local` |
| `extension/popup.js` | Popup UI; reads/writes `promptmask_settings_v1` to `chrome.storage.local` |

### Settings and storage keys

- `promptmask_settings_v1` — per-site and per-category toggles (synced live to content script via `chrome.storage.onChanged`)
- `promptmask_model_state_v1` — model download/load status (`not_downloaded`, `downloading`, `loading`, `ready`, `error`)
- Model binary — stored in Cache Storage under `promptmask-model-cache-v1`

### PII categories and placeholders

Categories are defined in `extension/offscreen_utils.mjs` (`CATEGORY_PLACEHOLDER_LINES`, `CATEGORY_RULES`) and mirrored in `content_script.js` (`CATEGORY_TO_PLACEHOLDERS`). Placeholders follow the pattern `[TYPE N]` (e.g., `[NAME 1]`, `[SSN 2]`). The prompt is built dynamically from only the enabled categories, so disabling a category removes it from the model's instruction entirely.

### Composer detection strategy

`content_script.js` resolves a "composer" (the prompt input element) through layered heuristics: first tries a prioritized list of specific selectors (`COMPOSER_SELECTORS`), then falls back to scoring all editable candidates on the page by aria-label, placeholder text, position, and DOM context. Writing redacted text back tries four strategies in order: `execCommand`, synthetic `beforeinput`, synthetic `paste` (ClipboardEvent), and direct DOM mutation — each handles a different editor framework (plain textarea, Lexical, ProseMirror, etc.).

### Model

The model (`gemma-4-E2B-it-web.task`) is a ~2GB WebGPU-optimized MediaPipe `.task` bundle. `extension/lib/genai_bundle.mjs` and `extension/lib/wasm/` are the MediaPipe runtime (vendored, not modified). The model is never committed to git. Temperature is set to 0, topK to 1 for deterministic output.

## Coding conventions

- JavaScript: ES modules (`.mjs` for importable modules, `.js` for content/service scripts), 2-space indentation, camelCase.
- Python: 4-space indentation, snake_case, single-purpose scripts.
- Tests use Node's built-in `assert`; co-locate tests with the module they validate.
- Commit messages use `feat:`, `fix:`, or `docs:` prefixes where possible.
- Do not commit anything in `models/`, `lit`, `prompt.txt`, or `extension.zip` (all gitignored).
- For gated HuggingFace models, set `HUGGING_FACE_HUB_TOKEN` or run `huggingface-cli login` before downloading.
