# Tech Used In This Project

## Overview

This project is an on-device AI redaction tool built around the **Google Gemma 4 E2B WebGPU** model and **MediaPipe LLM Inference**. It combines a **Python** model-management workflow with a **Chrome Extension (Manifest V3)** runtime that performs **local WebGPU inference** in the browser. The main use case is **PII redaction** for prompts typed into sites like **ChatGPT**, **Gemini**, **Claude**, **Perplexity**, and **Grok**.

## Core AI And Model Stack

- **Gemma 4 E2B WebGPU**: The extension runtime uses `gemma-4-E2B-it-web.task` (`.task` format, sourced from `litert-community/gemma-4-E2B-it-litert-lm`).
- **MediaPipe LLM Inference**: The primary inference API used for local model execution.
- **LiteRT-LM**: Used for `.litertlm` model packaging and local CLI inference.
- **TFLite / TensorFlow Lite**: Used as the base format for models that are bundled into `.task` files.
- **SentencePiece tokenizer**: Used when bundling custom `.tflite` models with tokenizer assets.
- **Prompt engineering**: The redaction behavior is defined by a structured prompt with category rules, numbering rules, and output normalization.
- **On-device AI / edge AI / local inference**: Models run locally instead of sending prompt contents to a cloud inference API.

## Model Formats Used

- **`.task`**: MediaPipe model bundle format used by the extension runtime.
- **`.litertlm`**: LiteRT-LM model format, used for CLI inference (Gemma 3n variant).
- **INT4 quantized models**: The referenced Gemma assets are quantized for edge/device execution.

## Browser And Extension Technology

- **Chrome Extension**
- **Manifest V3 (MV3)**
- **Service Worker**
- **Offscreen Document API**
- **Content Scripts**
- **Popup UI**
- **Chrome Storage API**
- **Chrome Scripting API**
- **Chrome Runtime Messaging**
- **Host permissions**
- **Content Security Policy (CSP)**

The extension architecture is split across:

- `extension/service_worker.js`: coordinates request routing and offscreen lifecycle.
- `extension/offscreen.js`: initializes MediaPipe and runs model inference.
- `extension/content_script.js`: integrates with supported AI chat sites and intercepts prompt submission flow.
- `extension/popup.js` and `extension/popup.html`: provide settings for site-level and category-level control.
- `extension/offscreen_utils.mjs`: centralizes prompt construction and output cleanup.

## Web Runtime And Performance Technologies

- **WebGPU**: GPU-accelerated in-browser inference.
- **WASM / WebAssembly**: MediaPipe runtime assets are loaded from `extension/lib/wasm`.
- **JavaScript ES Modules (`.mjs`)**
- **Module service worker**
- **Async/await**
- **Promise queueing** for serialized inference requests
- **Deterministic generation settings**: `temperature: 0`, `topK: 1`, fixed `randomSeed`

The local demo page in `test.html` also uses:

- **jsDelivr CDN**
- **`@mediapipe/tasks-genai`**
- **HTML5**
- **Vanilla JavaScript**
- **WebGPU adapter inspection**

## Python Tooling And Local Utilities

- **Python 3**
- **argparse**
- **pathlib**
- **http.server**
- **ThreadingHTTPServer**
- **SimpleHTTPRequestHandler**
- **CORS headers**

Python scripts in the repo:

- `download_models.py`: downloads the Gemma 4 E2B WebGPU model from Hugging Face (defaults to `gemma4-e2b-web`).
- `bundle_model.py`: bundles custom TFLite + tokenizer inputs into MediaPipe `.task` files.
- `serve_model.py`: serves `test.html` and `models/` locally for browser-based testing.

## External Services And Libraries

- **Hugging Face Hub**
- **`huggingface_hub`**
- **MediaPipe**
- **`mediapipe.tasks.python.genai.bundler`**
- **`tqdm`**
- **Localhost model serving**
- **CDN-delivered MediaPipe runtime** for the demo page

## Frontend And UI Layer

- **HTML**
- **CSS**
- **Vanilla JavaScript**
- **Responsive layout**
- **Accessible labels / ARIA attributes**
- **Toggle-based settings UI**
- **Spinner/loading state UI**

## Testing

- **Node.js**
- **Node built-in `assert/strict`**
- **JavaScript unit tests**
- **Prompt snapshot/behavior validation**
- **Output normalization tests**

Current test files:

- `extension/offscreen_utils.test.mjs` — prompt-building and normalization helpers
- `extension/model_cache.test.mjs` — model state and download progress
- `category_isolation.test.mjs` — per-category prompt filtering
- `cross_contamination.test.mjs` — disabled-category non-leakage
- `redaction_category_toggle.test.mjs` — end-to-end redaction under toggle combinations
- `content_script_editor_resolution.test.mjs` — composer detection across editor types
- `content_script_validation.test.mjs` — selector coverage for supported sites
- `evaluate_redaction_snippets.mjs` / `evaluate_category_toggle.mjs` — eval harnesses

## Security And Privacy Technologies

- **PII redaction**
- **Prompt sanitization**
- **Local-only inference**
- **No cloud LLM dependency for runtime redaction**
- **CSP-restricted extension pages**
- **Scoped site toggles**
- **Category-based redaction controls**

Supported redaction categories include:

- **Identity and contact**
- **Government and legal IDs**
- **Financial and payment**
- **Medical**
- **Credentials and secrets**
- **Network and device**
- **Business and case references**

## Supported Integrations

The extension is configured to work with:

- **ChatGPT**
- **OpenAI Chat**
- **Gemini**
- **Claude**
- **Perplexity**
- **Grok**

## Development Workflow Keywords

- **Model download**
- **Model bundling**
- **Local server**
- **Web demo**
- **Browser extension development**
- **Offscreen inference**
- **Prompt preprocessing**
- **Output postprocessing**
- **WebGPU testing**
- **Edge deployment**
- **On-device LLM**

## Keyword Index

**Gemma, Gemma 2, Gemma 3, Gemma 3n, FunctionGemma, Google Gemma, MediaPipe, MediaPipe LLM Inference, LiteRT-LM, TFLite, TensorFlow Lite, SentencePiece, tokenizer, `.task`, `.litertlm`, `.bin`, quantization, int4, local inference, edge AI, on-device AI, PII redaction, prompt engineering, prompt masking, prompt sanitization, Chrome Extension, Manifest V3, MV3, service worker, offscreen document, content script, popup UI, Chrome Storage API, Chrome Runtime API, Chrome Scripting API, runtime messaging, host permissions, CSP, WebGPU, GPU inference, WebAssembly, WASM, JavaScript, ES modules, `.mjs`, HTML, CSS, Vanilla JavaScript, Python, argparse, pathlib, http.server, ThreadingHTTPServer, SimpleHTTPRequestHandler, CORS, Hugging Face, Hugging Face Hub, `huggingface_hub`, MediaPipe bundler, jsDelivr, `@mediapipe/tasks-genai`, Node.js, `assert/strict`, unit tests, local server, localhost, browser AI, AI privacy, private inference, redaction categories, identity data, contact data, government IDs, tax IDs, payment data, medical data, API keys, access tokens, IP addresses, device identifiers, invoice IDs, case IDs, ChatGPT, Gemini, Claude, Perplexity, Grok.**
