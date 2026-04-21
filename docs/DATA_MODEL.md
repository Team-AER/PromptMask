# Data Model

Full reference for storage keys, message envelopes, and the PII-category taxonomy.

---

## 1. Storage keys (`chrome.storage.local`)

| Key | Owner | Schema |
|---|---|---|
| `promptmask_settings_v1` | popup.js (write), content_script.js (read) | `Settings` |
| `promptmask_model_state_v1` | model_cache.mjs (write), popup.js + service_worker.js (read) | `ModelState` |

### 1.1 `Settings`

```ts
type SiteKey = "chatgpt" | "gemini" | "claude" | "perplexity" | "grok";

type CategoryKey =
  | "identityContact"
  | "governmentLegal"
  | "financialPayment"
  | "medical"
  | "credentialsSecrets"
  | "networkDevice"
  | "businessCase";

interface Settings {
  sites:      Record<SiteKey, boolean>;
  categories: Record<CategoryKey, boolean>;
}
```

Default: everything `true`. See `DEFAULT_SETTINGS` in [extension/popup.js:23](../extension/popup.js).

### 1.2 `ModelState`

```ts
type ModelStatus =
  | "not_downloaded"
  | "downloading"
  | "loading"
  | "ready"
  | "error";

interface ModelState {
  status:          ModelStatus;
  revision:        string;
  fileName:        string;
  sourcePageUrl:   string;
  downloadUrl:     string;
  expectedBytes:   number;    // known-ahead hint (~2 GB)
  totalBytes:      number;    // reported by server Content-Length
  downloadedBytes: number;
  lastUpdatedAt:   string | null;  // ISO-8601
  error:           string | null;
}
```

---

## 2. Message envelopes

All messages are `chrome.runtime.sendMessage` payloads. Directions and shapes:

### 2.1 `LLM_PROMPT` — content script → service worker

```ts
{
  target: "service_worker",
  type:   "LLM_PROMPT",
  prompt: string,
  redactionConfig: RedactionConfig
}
```

### 2.2 `LLM_PROMPT` — service worker → offscreen

Same as above plus a `requestId: string` (UUID) and `target: "offscreen"`.

### 2.3 `LLM_RESULT` — offscreen → service worker

```ts
{
  target:    "service_worker",
  type:      "LLM_RESULT",
  requestId: string,
  result?:   string,
  error?:    string
}
```

Exactly one of `result` or `error` is set.

### 2.4 `MODEL_PROGRESS` — service worker → content script

Sent on every `chrome.storage.onChanged` for `promptmask_model_state_v1`:

```ts
{
  type:       "MODEL_PROGRESS",
  modelState: ModelState
}
```

### 2.5 `RedactionConfig`

```ts
interface RedactionConfig {
  categories: Record<CategoryKey, boolean>;   // verbatim from Settings
  enabledPlaceholders: string[];              // flattened allow-list
}
```

---

## 3. PII taxonomy

7 categories × 24 placeholder keys. Source of truth: [`CATEGORY_TO_PLACEHOLDER_KEYS` in offscreen_utils.mjs:171](../extension/offscreen_utils.mjs).

| Category | Placeholder keys | Example before → after |
|---|---|---|
| `identityContact` | `NAME`, `PHONE`, `EMAIL`, `USERNAME`, `ADDRESS`, `DATE_OF_BIRTH` | `Alice, alice@x.com` → `[NAME 1], [EMAIL 1]` |
| `governmentLegal` | `SSN`, `PAN`, `GST`, `DRIVER_LICENSE` | `123-45-6789` → `[SSN 1]` |
| `financialPayment` | `BANK_ACCOUNT`, `CREDIT_CARD`, `CARD_EXPIRY`, `CARD_CVV`, `PAYPAL` | `4111 1111 1111 1111` → `[CREDIT_CARD 1]` |
| `medical` | `INSURANCE_ID`, `MRN` | `MRN: 00123` → `MRN: [MRN 1]` |
| `credentialsSecrets` | `API_KEY`, `ACCESS_TOKEN` | `sk-abc…` → `[API_KEY 1]` |
| `networkDevice` | `IP_ADDRESS`, `DEVICE_ID` | `192.168.1.5` → `[IP_ADDRESS 1]` |
| `businessCase` | `ORDER_ID`, `INVOICE_ID`, `CASE_ID` | `Order #A-9911` → `Order [ORDER_ID 1]` |

### Placeholder numbering rules

- Numbering starts at `1` per **placeholder key** (not per category).
- Same distinct value → same number across the prompt (co-reference preserved).
- Different values of the same key → incrementing numbers in order of first appearance.

```
Input:  Alice emailed Bob, then Alice emailed Carol.
Output: [NAME 1] emailed [NAME 2], then [NAME 1] emailed [NAME 3].
```

### Regex for placeholders

```js
/\[([A-Z_]+)\s+\d+\]/g
```

Used by `extractPlaceholderKeys` in [offscreen_utils.mjs:288](../extension/offscreen_utils.mjs).

---

## 4. Prompt template (built dynamically)

```
{PROMPT_PREAMBLE}

{placeholder lines for ENABLED categories only}

RULES:
- {rule lines for ENABLED categories only}

EXAMPLES:
{examples whose tags intersect ENABLED categories only}

INPUT:
{user text}
```

…wrapped in Gemma turn framing:

```
<start_of_turn>user
{above}
<end_of_turn>
<start_of_turn>model

```

(The trailing newline after `<start_of_turn>model` is significant — Gemma expects to resume generation here.)

### Correction prompt

When the model emits a disabled placeholder, the retry prompt adds:

```
You previously used disallowed placeholder tags: [X N], [Y N].
Those tags are disabled for this request. Redact without them.
```

See `buildCorrectionPrompt` in [offscreen_utils.mjs:272](../extension/offscreen_utils.mjs).

---

## 5. Validation rules (content script)

From `looksLikeValidRedaction` in [content_script.js:1203](../extension/content_script.js):

1. Output must be truthy and non-empty.
2. If output differs from input, it must contain at least one `[KEY N]` placeholder.
3. `len(output) >= 0.35 * len(input)` **or** `len(output) >= 12`.
4. The literal text between placeholders in the output must appear in the original input in the same order (enforced by `literalSegmentsAppearInOrder`).

If any check fails, the original text is restored and an error toast is shown.

---

## 6. Supported chat sites (host match patterns)

| Site | Patterns |
|---|---|
| ChatGPT | `https://chatgpt.com/*`, `https://chat.openai.com/*` |
| Gemini | `https://gemini.google.com/*` |
| Claude | `https://claude.ai/*`, `https://www.claude.ai/*` |
| Grok | `https://grok.com/*`, `https://www.grok.com/*` |
| Perplexity | `https://perplexity.ai/*`, `https://www.perplexity.ai/*` |

Source: `content_scripts[0].matches` in [extension/manifest.json](../extension/manifest.json).

---

## 7. Model download hosts

Needed in `host_permissions` for the one-time model fetch:

- `https://huggingface.co/*`
- `https://*.huggingface.co/*`
- `https://*.hf.co/*`
- `https://*.xethub.hf.co/*`
