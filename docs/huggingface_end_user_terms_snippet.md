# PromptMask Model Download Terms Snippet

## Short onboarding copy

PromptMask downloads its default on-device model from our Hugging Face repository the first time you use local redaction.

This model is based on Gemma and its use is subject to:

- Gemma Terms of Use: https://ai.google.dev/gemma/terms
- Gemma Prohibited Use Policy: https://ai.google.dev/gemma/prohibited_use_policy
- PromptMask Terms: [insert your terms URL]

By continuing, you acknowledge that use of this model is subject to those terms and restrictions.

## Checkbox / consent text

`I understand that PromptMask will download a Gemma-based model for local use on this device, and that use of the model is subject to the Gemma Terms of Use, the Gemma Prohibited Use Policy, and the PromptMask Terms.`

## Longer terms copy

PromptMask provides access to a Gemma-based model artifact for local, on-device inference. By downloading, accessing, or using this model through PromptMask, you agree that your use of the model remains subject to the Gemma Terms of Use and the Gemma Prohibited Use Policy, in addition to the PromptMask Terms to the extent those terms do not conflict with the Gemma Terms.

If the model artifact is redistributed or packaged by PromptMask, that redistribution does not transfer ownership of Google trademarks or alter the governing Gemma restrictions. Users must comply with all applicable use restrictions and prohibited-use requirements associated with Gemma.

## First-download dialog fields to include

Include these fields in the product UI:

- Model source: `https://huggingface.co/<account>/<repo>`
- Model size: `[insert approximate size]`
- Stored locally after download: `Yes`
- Base model family: `Gemma`
- Terms link: `https://ai.google.dev/gemma/terms`
- Prohibited use link: `https://ai.google.dev/gemma/prohibited_use_policy`
- PromptMask terms link: `[insert your terms URL]`

## Product note

If you rename the file, keep the user-facing language clear that the artifact is still Gemma-based. Renaming the filename should not be used to conceal origin or governing terms.
