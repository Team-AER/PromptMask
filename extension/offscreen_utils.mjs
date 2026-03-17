const PROMPT_PREAMBLE = `You are a PII redaction system. Replace any PII in the input with consistently numbered placeholders and return ONLY the redacted text. Keep all non-PII text exactly as-is. Do not add or remove any other words. Do not add headings, labels, explanations, quotes, or tags.

Preserve the original formatting exactly: keep all line breaks, paragraph spacing, bullet points, indentation, list structure, and whitespace. Do not collapse the text into a single line or paragraph or normalize spacing.

Use ONLY the placeholder categories listed below. Never invent new placeholder categories such as [CITY], [TIME], [ZIP], [SUB-CC], [ENDPOINT_SERIAL], [MON_NUMBER], or any other unlisted tag. If a value does not fit one of the listed categories, leave it unchanged.`;

const CATEGORY_PLACEHOLDER_LINES = {
  identityContact: [
    "- Names -> [NAME 1], [NAME 2], ...",
    "- Phones -> [PHONE 1], [PHONE 2], ...",
    "- Emails -> [EMAIL 1], [EMAIL 2], ...",
    "- Usernames / account handles -> [USERNAME 1], [USERNAME 2], ...",
    "- Addresses (street, building, floor, city, postal code, full mailing addresses) -> [ADDRESS 1], [ADDRESS 2], ...",
    "- Dates of birth -> [DATE_OF_BIRTH 1], [DATE_OF_BIRTH 2], ..."
  ],
  governmentLegal: [
    "- SSN and government ID numbers (SSN, SIN, TIN/EIN, National ID) -> [SSN 1], [SSN 2], ...",
    "- PAN (India, e.g., ABCPK1234D) -> [PAN 1], [PAN 2], ...",
    "- GST / tax registration numbers (e.g., 27ABCDE1234F1Z5) -> [GST 1], [GST 2], ...",
    "- Driver's license numbers -> [DRIVER_LICENSE 1], [DRIVER_LICENSE 2], ..."
  ],
  financialPayment: [
    "- Bank details -> [BANK_ACCOUNT 1], [BANK_ACCOUNT 2], ...",
    "- Credit cards -> [CREDIT_CARD 1], [CREDIT_CARD 2], ...",
    "- Card expiry dates -> [CARD_EXPIRY 1], [CARD_EXPIRY 2], ...",
    "- Card CVV/CVC -> [CARD_CVV 1], [CARD_CVV 2], ...",
    "- PayPal details -> [PAYPAL 1], [PAYPAL 2], ..."
  ],
  medical: [
    "- Insurance IDs -> [INSURANCE_ID 1], [INSURANCE_ID 2], ...",
    "- Medical record numbers (MRN) -> [MRN 1], [MRN 2], ..."
  ],
  credentialsSecrets: [
    "- API keys -> [API_KEY 1], [API_KEY 2], ...",
    "- Access tokens -> [ACCESS_TOKEN 1], [ACCESS_TOKEN 2], ..."
  ],
  networkDevice: [
    "- IP addresses -> [IP_ADDRESS 1], [IP_ADDRESS 2], ...",
    "- Device identifiers (e.g., A1B2C3D4E5F6) -> [DEVICE_ID 1], [DEVICE_ID 2], ..."
  ],
  businessCase: [
    "- Order/transaction IDs -> [ORDER_ID 1], [ORDER_ID 2], ...",
    "- Invoice IDs (e.g., INV-2026-00173) -> [INVOICE_ID 1], [INVOICE_ID 2], ...",
    "- Ticket, case, or reference IDs (e.g., TCK-556201, REF-12345) -> [CASE_ID 1], [CASE_ID 2], ..."
  ]
};

const GENERIC_NUMBERING_RULES = [
  "- Assign each distinct PII value a sequential number within its category, starting at 1.",
  "- If the same PII value appears again later, reuse the same number.",
  "- Different PII values in the same category get different numbers.",
  "- Replace each PII span with exactly one placeholder. Do not split a single name or email into multiple placeholders.",
  "- Replace the entire matched value, including fixed prefixes, suffixes, punctuation, and separators. Example: replace `INV-2026-00173` as one placeholder, not `INV-[INVOICE_ID 1]`.",
  "- Replace a full email address as one span, including the local-part and the domain. Never leave fragments such as `ar@[EMAIL 1]` or `[NAME]@example.com`.",
  "- Do not invent placeholders. Only replace substrings that are actual PII values present in the input.",
  `- Do not redact category labels or generic phrases without a concrete identifier (e.g., "bank details", "PAN", "invoice number" with no value).`
];

const CATEGORY_RULES = {
  identityContact: [
    `- Only redact dates that clearly indicate a date of birth (DOB, "date of birth", "born", "birthday", "Patient date of birth"). Leave all other dates and timestamps unchanged.`,
    `- Standalone service dates, discharge dates, appointment dates, incident dates, month/day mentions, and timestamps are NOT dates of birth and must remain unchanged unless the text explicitly says they are DOB-related.`,
    `- Treat abbreviated names or initials as distinct values unless the text is an exact match (e.g., "Neha Kulkarni" != "Neha K.").`,
    "- Redact full names (first + last) entirely with [NAME N]; do not leave surnames.",
    "- Redact full street addresses, mailing addresses, and business addresses entirely with a single [ADDRESS N]. This includes building names, floor/unit numbers, street names, localities, cities, states, postal codes, and countries when present.",
    "- Redact phone numbers (including country codes) with [PHONE N].",
    "- Redact emails with [EMAIL N].",
    `- Redact dates of birth (e.g., "DOB: 1992-08-14" or "born on January 7, 1985") with [DATE_OF_BIRTH N].`,
    `- Redact usernames/account handles (e.g., "neha.kulkarni91") with [USERNAME N].`
  ],
  governmentLegal: [
    "- Remove all digits of SSNs and government IDs. Replace the full identifier with [SSN N] (keep the label if present).",
    "- Redact GST/tax-registration numbers (e.g., 27ABCDE1234F1Z5) with [GST N]."
  ],
  financialPayment: [],
  medical: [],
  credentialsSecrets: [],
  networkDevice: [
    "- Redact device identifiers (e.g., hardware IDs like A1B2C3D4E5F6) with [DEVICE_ID N]."
  ],
  businessCase: [
    "- Redact order/transaction IDs (e.g., ORD-2026-77831) with [ORDER_ID N].",
    "- Redact invoice numbers (e.g., INV-2026-00173) with [INVOICE_ID N].",
    "- Redact ticket/case/reference IDs (e.g., TCK-556201, CASE-OPS-2026-2194, HOLD-2026-BPS-44) with [CASE_ID N].",
    "- If an identifier includes a business prefix such as ORD-, INV-, TCK-, CASE-, REF-, HOLD-, or MRN-, replace the full identifier and do not leave any numeric fragment behind."
  ]
};

const PROMPT_EXAMPLES = `Examples:
Input: Payroll setup for Sam — SSN: 123-45-6789 (dummy).
Output: Payroll setup for [NAME 1] — SSN: [SSN 1] (dummy).
Input: Tax ID 12-3456789 or SIN 123-456-789.
Output: Tax ID [SSN 1] or SIN [SSN 2].
Input: Hi, I'm Priya Nair. Please update my address to 14B, Lakeview Apartments, 3rd Cross, Indiranagar, Bengaluru 560038. You can reach me at +91 98765 43210 or priya.nair17@example.com. DOB: 1992-08-14.
Output: Hi, I'm [NAME 1]. Please update my address to [ADDRESS 1]. You can reach me at [PHONE 1] or [EMAIL 1]. [DATE_OF_BIRTH 1].
Input: Invoice INV-2026-00173 for case TCK-556201.
Ship to: Wellness Clinic, 2nd Floor, 18 Baner Road, Pune 411045.
Output: Invoice [INVOICE_ID 1] for case [CASE_ID 1].
Ship to: [ADDRESS 1].
Input: Neha Kulkarni (Neha K.) approved the request.
Output: [NAME 1] ([NAME 2]) approved the request.
Input: From: Neha Kulkarni neha.kulkarni+support@example.com
To: security@kwc.example.com
Date: 2026-01-13
Subject: Re: Case TCK-556201 — request for redacted logs
Output: From: [NAME 1] [EMAIL 1]
To: [EMAIL 2]
Date: 2026-01-13
Subject: Re: Case [CASE_ID 1] — request for redacted logs
Input: Ship the replacement to 480 West Fulton Market, Suite 900, Chicago, IL 60661, United States.
Output: Ship the replacement to [ADDRESS 1].
Input: The insured was born on January 7, 1985. Her next appointment is on 2026-03-03 at 10:30 AM.
Output: The insured was born on [DATE_OF_BIRTH 1]. Her next appointment is on 2026-03-03 at 10:30 AM.
Input: Remit payment for order ORD-2026-77831 and invoice INV-2026-01487. Keep legal hold HOLD-2026-BPS-44 attached to case CASE-OPS-2026-2194.
Output: Remit payment for order [ORDER_ID 1] and invoice [INVOICE_ID 1]. Keep legal hold [CASE_ID 1] attached to case [CASE_ID 2].
Input: Contact ar@brightpathsystems.com or julia.reyes@redstoneadvisory.com for follow-up.
Output: Contact [EMAIL 1] or [EMAIL 2] for follow-up.
Input: Account username is neha.kulkarni91. Please remove bank details if present.
Output: Account username is [USERNAME 1]. Please remove bank details if present.
Input: Alice emailed Bob at bob@x.com. Alice's SSN is 111-22-3333 and Bob's is 444-55-6666.
Output: [NAME 1] emailed [NAME 2] at [EMAIL 1]. [NAME 1]'s SSN is [SSN 1] and [NAME 2]'s is [SSN 2].`;

const ALL_CATEGORY_KEYS = Object.keys(CATEGORY_PLACEHOLDER_LINES);

function buildRedactionPrompt(enabledCategoryKeys) {
  const placeholderLines = enabledCategoryKeys
    .flatMap((cat) => CATEGORY_PLACEHOLDER_LINES[cat] ?? [])
    .join("\n");

  const rules = [
    ...GENERIC_NUMBERING_RULES,
    ...enabledCategoryKeys.flatMap((cat) => CATEGORY_RULES[cat] ?? [])
  ].join("\n");

  return `${PROMPT_PREAMBLE}

Placeholders (use sequential numbering per category, starting at 1):
${placeholderLines}

Numbering rules:
${rules}

${PROMPT_EXAMPLES}
`;
}

export const REDACTION_PROMPT = buildRedactionPrompt(ALL_CATEGORY_KEYS);

export const CATEGORY_TO_PLACEHOLDER_KEYS = {
  identityContact: ["NAME", "PHONE", "EMAIL", "USERNAME", "ADDRESS", "DATE_OF_BIRTH"],
  governmentLegal: ["SSN", "PAN", "GST", "DRIVER_LICENSE"],
  financialPayment: ["BANK_ACCOUNT", "CREDIT_CARD", "CARD_EXPIRY", "CARD_CVV", "PAYPAL"],
  medical: ["INSURANCE_ID", "MRN"],
  credentialsSecrets: ["API_KEY", "ACCESS_TOKEN"],
  networkDevice: ["IP_ADDRESS", "DEVICE_ID"],
  businessCase: ["ORDER_ID", "INVOICE_ID", "CASE_ID"]
};

export function buildPrompt(text, redactionConfig = null) {
  const categories = redactionConfig?.categories;
  let promptBody;

  if (categories && typeof categories === "object") {
    const enabledKeys = ALL_CATEGORY_KEYS.filter((key) => categories[key] !== false);

    if (enabledKeys.length === 0) {
      promptBody = `${PROMPT_PREAMBLE}\n\nNo PII categories are enabled. Return the input unchanged.`;
    } else if (enabledKeys.length === ALL_CATEGORY_KEYS.length) {
      promptBody = REDACTION_PROMPT;
    } else {
      promptBody = buildRedactionPrompt(enabledKeys);
    }
  } else {
    promptBody = REDACTION_PROMPT;
  }

  return `<start_of_turn>user\n${promptBody}\n\nINPUT:\n${text}\n<end_of_turn>\n<start_of_turn>model\n`;
}

export function normalizeOutput(text) {
  let output = text ?? "";
  const startTag = "<start_of_turn>model";
  const startIndex = output.indexOf(startTag);
  if (startIndex !== -1) {
    output = output.slice(startIndex + startTag.length);
    if (output.startsWith("\n")) {
      output = output.slice(1);
    }
  }
  const endIndex = output.indexOf("<end_of_turn>");
  if (endIndex !== -1) {
    output = output.slice(0, endIndex);
  }
  return output;
}
