# PromptMask component reference

| Component | Main responsibilities | Source |
|---|---|---|
| Content script | Composer discovery and binding; submission capture; settings; output checks; preview; best effort restoration | [content_script.js](../extension/content_script.js) |
| Background router | Offscreen creation; request IDs and pending callbacks; model-progress subscriptions | [service_worker.js](../extension/service_worker.js) |
| Inference host | Lazy model initialization; serial promise queue; normalization; one correction retry; developer console logs | [offscreen.js](../extension/offscreen.js) |
| Prompt helpers | Category-to-placeholder mapping; filtered rules/examples; Gemma turn framing; output key extraction | [offscreen_utils.mjs](../extension/offscreen_utils.mjs) |
| Model cache | Pinned URL/revision; Cache API response streams; storage persistence request; progress and state normalization | [model_cache.mjs](../extension/model_cache.mjs) |
| Popup | Site/category controls, debounced settings saves, model status, storage change listeners | [popup.js](../extension/popup.js), [popup.html](../extension/popup.html) |
| Manifest | Supported origins, MV3 permissions, local assets and CSP | [manifest.json](../extension/manifest.json) |

Helper tests do not execute the model. See the [developer guide](DOCUMENTATION.md) for validation and [data model](DATA_MODEL.md) for settings/messages.

## Model tooling

| Tool | Scope |
|---|---|
| [download_models.py](../download_models.py) | Downloads the selected model repository file into `models/`; separate from extension cache and pinned revision |
| [bundle_model.py](../bundle_model.py) | Bundles supplied TFLite and tokenizer inputs with supported Gemma token defaults |
| [serve_model.py](../serve_model.py) | Serves the repository on localhost:8000 with CORS; requires `models/` to exist |
| [test.html](../test.html) | WebGPU redaction demo using the local Gemma 4 `.task` file and jsDelivr runtime assets |
| [evaluate_redaction_snippets.mjs](../evaluate_redaction_snippets.mjs), [evaluate_category_toggle.mjs](../evaluate_category_toggle.mjs) | Evaluation tooling, separate from browser extension operation |
