# Gemma on Edge with MediaPipe

Run Google's Gemma model locally on your device using MediaPipe's LLM Inference API. The Chrome extension uses a single WebGPU-optimized `.litertlm` model.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Download a Model

Before downloading or using Gemma model files, review the Gemma Terms of Use and Prohibited Use Policy:

- [Gemma Terms of Use](https://ai.google.dev/gemma/terms)
- [Gemma Prohibited Use Policy](https://ai.google.dev/gemma/prohibited_use_policy)

```bash
# Download the model used by the Chrome extension
python download_models.py

# Or download it explicitly
python download_models.py --model gemma3n-e2b-web

# List all available models
python download_models.py --list
```

### 3. Run Inference (LiteRT-LM CLI)

```bash
# Put a prompt in a file
echo "What is machine learning?" > prompt.txt

# Run the same local .litertlm model used by the extension
lit run models/gemma-3n-E2B-it-int4-Web.litertlm -f prompt.txt --backend cpu

# Or pull a model from Hugging Face via the LiteRT-LM registry
export HUGGING_FACE_HUB_TOKEN="your_huggingface_token"
lit list --show_all
lit run google/gemma-3n-E2B-it-litert-lm/gemma-3n-E2B-it-int4-Web.litertlm --backend cpu
```

### 4. Install the LiteRT-LM CLI (fresh setup)

```bash
# Option A: Use the bundled CLI binary from this repo
mkdir -p ~/.local/bin
cp ./lit ~/.local/bin/lit
chmod +x ~/.local/bin/lit

# Option B: Download a prebuilt LiteRT-LM CLI (macOS ARM64, Linux x86_64/ARM64, Windows x86_64)
# then make it executable and place it on PATH
# (macOS/Linux) chmod +x ./lit

# macOS may require approving the binary in System Settings > Privacy & Security

# Add ~/.local/bin to PATH for zsh
printf '\n# Add ~/.local/bin to PATH for lit\nexport PATH="$HOME/.local/bin:$PATH"\n' >> ~/.zshrc

# Restart terminal (or run: source ~/.zshrc)

#test if it works with
lit --help
```

## 📦 Runtime Model

| Model | Format | Description |
|-------|--------|-------------|
| `gemma3n-e2b-web` | `.litertlm` | Gemma 3n E2B WebGPU model used by the extension and local demo |

## 🔧 Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `--max-tokens` | 1024 | Maximum tokens (input + output) |
| `--temperature` | 0.8 | Randomness (0.0 = deterministic) |
| `--top-k` | 40 | Top-K sampling parameter |

## 📁 Project Structure

```
gemma_on_edge/
├── requirements.txt      # Python dependencies
├── download_models.py    # Download models from HuggingFace
├── lit                  # LiteRT-LM CLI binary
├── bundle_model.py       # Bundle custom TFLite models
├── test.html             # Local WebGPU demo
└── models/               # Downloaded models (created after download)
```

## 🔄 Custom Model Bundling

If you have a custom-converted TFLite model, bundle it into `.task` format:

```bash
python bundle_model.py \
    --tflite path/to/model.tflite \
    --tokenizer path/to/tokenizer.model \
    --output my_custom_model.task \
    --model-type gemma3
```

## 📚 Downloaded Model

| Model | Format | Description |
|-------|--------|-------------|
| `gemma3n-e2b-web` | .litertlm | Gemma 3n E2B WebGPU model used by the extension |

## 🔗 Resources

- [MediaPipe LLM Inference Guide](https://ai.google.dev/edge/mediapipe/solutions/genai/llm_inference)
- [Gemma 3n E2B LiteRT-LM Model](https://huggingface.co/google/gemma-3n-E2B-it-litert-lm)
- [MediaPipe Studio Demo](https://mediapipe-studio.webapps.google.com/demo/llm_inference)

## ⚠️ Requirements

- **Python**: 3.9 - 3.12
- **MediaPipe**: 0.10.14+
- **RAM**: 8GB+ recommended for larger models

## 📄 License

This project uses Gemma models which are subject to [Google's Gemma Terms of Use](https://ai.google.dev/gemma/terms).

## ⚖️ Gemma Compliance Notes

This repository does not commit Gemma model binaries into version control. Users download model files separately into `models/`, and those model files remain subject to Google's Gemma Terms of Use and Gemma Prohibited Use Policy.

If you later change this project or the Chrome extension to download Gemma model files for users from your own source on first run, treat that as redistribution of Gemma. In that case you should:

- keep a `NOTICE` file with the exact Gemma notice text in any package or distribution that includes the model files
- provide recipients a copy or link to the current Gemma Terms of Use
- provide clear notice that Gemma use is subject to the Section 3.2 use restrictions and the Prohibited Use Policy
- add your own app or extension terms that make those use restrictions enforceable for your users
- mark any modified Gemma files prominently if you ever modify, convert, or rebundle them

For a future first-run model download flow, document the model source in user-facing docs or the extension onboarding screen. The terms do not appear to require naming the origin host, but disclosing the source is the practical way to tell users what they are downloading, who is redistributing it, and where the governing terms apply.

This project is a local redaction helper, not a substitute for legal, medical, financial, or other licensed professional services. Review outputs before relying on them in sensitive workflows.
