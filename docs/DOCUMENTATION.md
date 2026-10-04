# PromptMask developer guide

Start with the [README](../README.md) for the product, installation, controls, and privacy limits. The Chrome extension is the product; the Python scripts and `test.html` are separate development tools.

## Repository map

| Path | Purpose |
|---|---|
| `extension/manifest.json` | MV3 metadata, supported origins, permissions, icons, CSP |
| `extension/content_script.js` | Composer discovery, submission interception, preview and editor updates |
| `extension/service_worker.js` | Request routing, offscreen creation, progress forwarding |
| `extension/offscreen.js` | Model initialization, inference queue, output normalization and correction |
| `extension/offscreen_utils.mjs` | Category-specific prompt rules and placeholder validation |
| `extension/model_cache.mjs` | Pinned model source, Cache API, progress and state |
| `extension/popup.*` | Site/category settings and model status |
| `extension/icons/` | PromptMask's existing logo and extension icons |
| `extension/lib/` | Bundled MediaPipe JavaScript and WASM runtime |
| `download_models.py` | Optional Hugging Face downloads into gitignored `models/` |
| `bundle_model.py` | Optional custom TFLite/tokenizer bundling |
| `serve_model.py`, `test.html` | Local browser demo; external jsDelivr runtime dependencies |
| `evaluate_*.mjs`, `*.test.mjs` | Evaluation tooling and Node assertion tests |

## Development loop

Load `extension/` unpacked as described in the README. Edit the source, reload the extension in Chrome, then reload supported chat tabs. There is no extension build command or npm package manifest.

Run all eight test commands listed in the README. These verify helper logic, category filtering, cache state/progress, editor resolution, selector coverage, and evaluation parsing. The category-toggle tests simulate outputs; they do not run the real model. Passing these tests does not prove browser/GPU compatibility, redaction accuracy, or continued compatibility with live sites.

Use fictional data for a manual browser check: test the first download and cached reload, each supported site, Enter and Send, editing a preview, disabled controls, and an error/retry. Check that the displayed text matches your expectations before confirming. This guide describes the checks to perform, not a claim that a release has passed them.

## Model lifecycle

The first enabled redaction lazily creates the offscreen document and downloads the pinned Gemma 4 E2B WebGPU model. Cache hits still require model initialization after the offscreen document is recreated; they are not instantaneous. The in-memory model is reused while that document remains alive, and requests are serialized.

Download progress and loading state are stored under `promptmask_model_state_v1`. The estimated size is approximately 2 GB; actual Content-Length is used where available. Persistent storage is requested, not guaranteed. There is a cache-deletion helper in `model_cache.mjs`, but no user-facing delete button in the popup.

The Python downloader also lists an older Gemma 3n model. It downloads repository files independently and does not use the extension's pinned revision or install them into the extension cache. Custom bundles likewise do not automatically replace the runtime model.

## Troubleshooting

- **Download error:** check network access to the configured Hugging Face hosts and retry. A cached model can be downloaded again after cache loss or a model revision change.
- **WebGPU initialization error:** check browser/GPU availability. A successful Node test is not a hardware qualification.
- **No interception:** check the popup site toggle, supported URL, extension reload, and fresh chat-tab load. Selectors may need updates when sites change their editors.
- **Unexpected output:** check enabled categories, review the full preview, and reproduce with fictional data. Validation is intentionally limited and cannot detect every miss.
- **Developer console:** current inference logs include prompt text and outputs. Do not include sensitive inputs in screenshots, logs, or issue reports.

## Documentation status

[Architecture](ARCHITECTURE.md), [data flow](DATA_FLOW.md), [components](COMPONENTS.md), [data model](DATA_MODEL.md), and [technology](TECH_STACK.md) describe the current source. `plan.md`, `plan_v3.md`, the PDF design material, and older rendered diagrams under `mermaid_diagrams/` are historical design/evaluation material; consult runtime source before treating them as current behavior.

Model publication templates and compliance material remain under `docs/huggingface_*`. They are packaging guidance, not evidence of a published model or Chrome Web Store release.
