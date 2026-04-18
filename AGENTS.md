# Repository Guidelines

## Project Structure & Module Organization
- `download_models.py` pulls the extension's Gemma model from Hugging Face into `models/` (generated, gitignored).
- `bundle_model.py` bundles custom TFLite + tokenizer inputs into `.task` files.
- `serve_model.py` hosts `test.html` and `models/` with CORS for local WebGPU testing.
- `extension/` contains the Chrome extension (MV3) plus WebGPU/MediaPipe runtime assets under `extension/lib/wasm`.
- `extension/offscreen_utils.mjs` holds prompt-building and output-normalization helpers, with tests in `extension/offscreen_utils.test.mjs`.
- `test.html` is the local WebGPU demo page; `docs/` contains design notes (tracked in git history).

## Build, Test, and Development Commands
- `pip install -r requirements.txt` installs Python dependencies.
- `python download_models.py --list` lists available models.
- `python download_models.py --model gemma4-e2b-web` downloads the extension model into `models/`.
- `python bundle_model.py --tflite path/to/model.tflite --tokenizer path/to/tokenizer.model --output my_model.task` creates a `.task` bundle.
- `python serve_model.py` serves `test.html` at `http://localhost:8000/test.html` and model files at `http://localhost:8000/models/`.
- `lit run models/<model>.litertlm -f prompt.txt --backend cpu` runs local inference with the bundled LiteRT-LM CLI.
- `node extension/offscreen_utils.test.mjs` — prompt-building and normalization unit tests.
- `node extension/model_cache.test.mjs` — model state and download progress unit tests.
- `node category_isolation.test.mjs` — per-category prompt filtering tests.
- `node cross_contamination.test.mjs` — disabled-category non-leakage tests.
- `node redaction_category_toggle.test.mjs` — end-to-end redaction under toggle combinations.
- `node content_script_editor_resolution.test.mjs` — composer detection across editor types.
- `node content_script_validation.test.mjs` — selector coverage for supported sites.

## Coding Style & Naming Conventions
- Python: 4-space indentation, snake_case functions/variables, keep scripts single-purpose.
- JavaScript: ES modules (`.mjs`), 2-space indentation, camelCase identifiers.
- Keep model tags and prompt templates centralized (see `REDACTION_PROMPT`).

## Testing Guidelines
- Current tests use Node’s built-in `assert` with files named `*.test.mjs`.
- Co-locate tests with the module they validate (e.g., `extension/offscreen_utils.test.mjs`).
- If you add Python tests, prefer `pytest` and document the command in this file.

## Commit & Pull Request Guidelines
- Recent history uses short, imperative messages and sometimes Conventional Commits (`feat:`). Prefer `feat:`, `fix:`, or `docs:` when possible.
- PRs should include a concise description, the exact commands run, and any model download requirements.
- Do not commit artifacts in `models/`, `lit`, or `prompt.txt` (gitignored).

## Security & Configuration Tips
- For gated Hugging Face models, run `huggingface-cli login` or set `HUGGING_FACE_HUB_TOKEN` before downloading.
- Avoid uploading model binaries or WebGPU artifacts to the repo.
