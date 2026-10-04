# PromptMask technology overview

| Layer | Technology | Role |
|---|---|---|
| Browser product | Chrome Manifest V3; JavaScript, HTML, CSS | Content script, module service worker, offscreen document, toolbar popup |
| Local inference | Gemma 4 E2B WebGPU `.task`; MediaPipe LLM Inference | Mask prompt values using category-filtered instructions |
| Runtime assets | Bundled MediaPipe JavaScript and WASM; WebGPU | Initialize and execute the model locally |
| Configuration | `chrome.storage.local`, `chrome.storage.onChanged` | Site/category settings and model lifecycle state |
| Model storage | Browser Cache API; streamed `Response` objects | Reuse the pinned download when cached bytes remain available |
| Messaging | `chrome.runtime.sendMessage` | Correlate prompt/result requests and relay progress |
| Optional Python tools | MediaPipe, `huggingface_hub`, `tqdm`; Python standard HTTP server | Download files, bundle custom models, and serve the demo |
| Standalone demo | HTML/JavaScript; jsDelivr MediaPipe runtime; localhost model | Separate browser test harness, with network behavior different from the extension |
| Tests | Node.js built-in assertions | Helper logic, category filtering, cache state, editor discovery and selectors |

The extension requires no Python environment or frontend build step. Optional model tooling has its own package/platform requirements in [requirements.txt](../requirements.txt).

The source has seven category controls and five site controls; see the [README](../README.md). Runtime decoding uses `maxTokens: 16384`, `temperature: 0`, `topK: 1`, and `randomSeed: 1` in [offscreen.js](../extension/offscreen.js). These are source constants, not documented CLI options or a guarantee of identical outputs across devices.

The Python downloader also exposes an older Gemma 3n `.litertlm` asset. That is not the extension's current runtime model. A separate LiteRT-LM CLI is not included in the repository.

For privacy/storage boundaries and current console logging, read [ARCHITECTURE.md](ARCHITECTURE.md). For setup and checks, read [DOCUMENTATION.md](DOCUMENTATION.md).
