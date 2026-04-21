## Plan: MVP WebGPU Gemma — Test Page First, Then Extension

Validate the WebGPU + MediaPipe pipeline with a simple test page before adding Chrome extension complexity. This isolates issues and speeds up debugging.

### Steps

1. **Download the web model** — Run:
   ```bash
   huggingface-cli download google/gemma-3n-E2B-it-litert-lm gemma-3n-E2B-it-int4-Web.litertlm --local-dir ./models
   ```
   *(Optional)* Update download_models.py with a `gemma3n-e2b-web` entry, then run `python download_models.py --model gemma3n-e2b-web --output-dir models` to fetch the same file programmatically.
   All models, regardless of download method, must end up in the models/ directory.

2. Create local model server — Add serve_model.py with Python http.server + CORS headers, serving the models/ folder on port 8000.

3. Build test webpage — Create test.html that loads MediaPipe GenAI from CDN, initializes LlmInference with http://localhost:8000/gemma-3n-E2B-it-int4-Web.litertlm, and provides a minimal prompt/response UI. Use MediaPipe's @mediapipe/tasks-genai JavaScript API.
   Objective: send a prompt_text in the web page and receive the generated response to confirm WebGPU inference works end-to-end.

4. Validate WebGPU pipeline — Open test.html in Chrome, confirm model loads, run a test prompt, verify response generation works.

5. Port to Chrome extension — Once the test page works, create extension/ with manifest, offscreen document (copy logic from test.html), service worker, and popup UI.

6. Test extension end-to-end — Load unpacked extension, verify offscreen document initializes the model, confirm popup can trigger inference.

 Why This Order
Phase	What You Learn	Time to Validate
Test page	WebGPU works, model loads, MediaPipe API is correct	~10 min
Extension	Offscreen messaging, service worker lifecycle	~30 min
If the test page fails, you know it's a model/MediaPipe/WebGPU issue. If only the extension fails, you know it's messaging or permissions.

Deferred (Post-MVP)
Model file validation (check for -Web.litertlm suffix)
IndexedDB/OPFS caching for persistence
User file picker flow for model loading
Production model hosting/CDN
FunctionGemma integration and function calling UI