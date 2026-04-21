# Hugging Face Publish Checklist for Gemma Model Redistribution

This checklist is for publishing the extension's default Gemma model on your own Hugging Face repository so the Chrome extension can download it on first use.

This is a practical compliance and release checklist, not legal advice. Re-check the current Gemma Terms of Use and Prohibited Use Policy before publishing:

- https://ai.google.dev/gemma/terms
- https://ai.google.dev/gemma/prohibited_use_policy

## What to publish with the model

Publish these items in the Hugging Face model repo:

1. The model file itself
   - Example: `promptmask-default-v1.litertlm`
   - Renaming the file is acceptable as long as you do not hide that it is Gemma-based and you still comply with the Gemma terms.

2. A model card / repository `README.md`
   - State that the file is based on Gemma.
   - Link the Gemma Terms of Use.
   - Link the Gemma Prohibited Use Policy.
   - State whether the file is unmodified or modified.
   - State that your extension downloads the model on first use.

3. A `NOTICE` file
   - Required text:
   - `Gemma is provided under and subject to the Gemma Terms of Use found at ai.google.dev/gemma/terms`

4. A copy of the Gemma Terms or a clear recipient-facing link to them
   - The safest practical approach is:
   - add the link prominently in the repo `README.md`
   - add the link in your product onboarding / first-download screen
   - add the link in your own product terms

5. Your own app / product terms
   - These should notify users that Gemma use is subject to the Gemma Section 3.2 restrictions and the Prohibited Use Policy.
   - These should not conflict with the Gemma Terms.

6. Modification notice, if applicable
   - If you converted, rebundled, quantized, or otherwise modified the model artifact, state that prominently in the repo `README.md`.
   - If you did not modify it, say that clearly too.

## Minimum repo structure

```text
your-hf-model-repo/
├── README.md
├── NOTICE
└── promptmask-default-v1.litertlm
```

If you want a more explicit package:

```text
your-hf-model-repo/
├── README.md
├── NOTICE
├── TERMS.md
└── promptmask-default-v1.litertlm
```

## Recommended Hugging Face repo content

Use a public Hugging Face model repo unless you explicitly want gated access.

Recommended repo metadata:

- Repository name: `promptmask-models`
- Model filename: `promptmask-default-v1.litertlm`
- Tags:
  - `gemma`
  - `litertlm`
  - `webgpu`
  - `chrome-extension`

Recommended README sections:

- What this file is
- Base model / origin
- Terms and restrictions
- How PromptMask uses it
- Modification status
- File list

## User-facing onboarding requirements

Before first download in the extension, show:

- the approximate download size
- that the file will be downloaded from your Hugging Face repo
- that the model is Gemma-based
- a link to the Gemma Terms of Use
- a link to the Gemma Prohibited Use Policy
- a link to your own app terms / policy

Recommended acknowledgement text:

- `By downloading and using this model, you agree that use of the model is subject to the Gemma Terms of Use, the Gemma Prohibited Use Policy, and the PromptMask terms.`

## Recommended release steps

1. Create a new public Hugging Face model repo under your account or org.
2. Upload the model file.
3. Upload `README.md`.
4. Upload `NOTICE`.
5. Verify the direct file URL:
   - `https://huggingface.co/<account>/<repo>/resolve/main/<filename>`
6. Update the extension to download from that URL.
7. Add first-download disclosure in the extension UI.
8. Test model loading in a clean Chrome profile.
9. Pin a specific Hugging Face revision or tag for production releases when possible.

## Pre-publish review

Before publishing, confirm all of the following:

- The repo `README.md` says the file is Gemma-based.
- The repo includes the exact required `NOTICE` text.
- The extension onboarding links the Gemma Terms and Prohibited Use Policy.
- Your product terms mention that Gemma restrictions apply.
- Any modifications are clearly disclosed.
- The download URL works without requiring cookies or private authentication if you intend public first-use downloads.

## Notes for this project

The current extension model is loaded by URL in `extension/offscreen.js`. For the first-use download flow, the model host URL should be an HTTPS Hugging Face `resolve` URL.

The current repo's `docs/` directory is gitignored, so these documents are useful for local planning unless you later change `.gitignore`.
