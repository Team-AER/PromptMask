# PromptMask Default Model

This repository distributes the default model used by the PromptMask Chrome extension for local on-device inference.

## What this file is

`promptmask-default-v1.litertlm` is a LiteRT-LM model artifact used by PromptMask to run local inference in the browser via MediaPipe and WebGPU.

## Base model / origin

This file is based on Gemma.

Gemma is provided under and subject to the Gemma Terms of Use:

- https://ai.google.dev/gemma/terms

Use of Gemma is also subject to the Gemma Prohibited Use Policy:

- https://ai.google.dev/gemma/prohibited_use_policy

## Redistribution notice

This repository redistributes a Gemma-based model artifact for use with PromptMask.

`NOTICE`:

`Gemma is provided under and subject to the Gemma Terms of Use found at ai.google.dev/gemma/terms`

## Modification status

Choose one of the following and keep only the correct statement:

Option A: Unmodified upstream artifact

- `This file is redistributed without modification from the original Gemma-based LiteRT-LM artifact.`

Option B: Modified artifact

- `This file is a modified / converted / renamed Gemma-based artifact for use with PromptMask.`
- `Modifications include: [describe conversion, quantization, packaging, or renaming here].`

If you modified the artifact, keep the modification notice prominent.

## How PromptMask uses this model

The PromptMask Chrome extension downloads this file on first use and runs inference locally on the user's device.

PromptMask does not send the prompt content to a hosted model endpoint as part of normal inference; the model file is downloaded once and then used locally in the browser runtime.

## File list

- `promptmask-default-v1.litertlm`: Default PromptMask model artifact
- `NOTICE`: Required Gemma redistribution notice

## Terms for users

By downloading, accessing, or using this model artifact through PromptMask or directly from this repository, you agree that use of the model remains subject to:

- the Gemma Terms of Use
- the Gemma Prohibited Use Policy
- any applicable PromptMask product terms that do not conflict with the Gemma Terms

## Suggested metadata

Suggested Hugging Face model card tags:

- `gemma`
- `litertlm`
- `webgpu`
- `mediapipe`
- `chrome-extension`
- `on-device`

## Maintainer note

Replace this draft with final product-specific wording before publishing, especially the modification-status section and any claims about how PromptMask stores or caches the model locally.
