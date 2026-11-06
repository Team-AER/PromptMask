export const SETTINGS_STORAGE_KEY = "promptmask_settings_v1";

export const SITE_KEYS = ["chatgpt", "gemini", "claude", "perplexity", "grok"];

export const CATEGORY_TO_PLACEHOLDER_KEYS = {
  identityContact: ["NAME", "PHONE", "EMAIL", "USERNAME", "ADDRESS", "DATE_OF_BIRTH"],
  governmentLegal: ["SSN", "PAN", "GST", "DRIVER_LICENSE"],
  financialPayment: ["BANK_ACCOUNT", "CREDIT_CARD", "CARD_EXPIRY", "CARD_CVV", "PAYPAL"],
  medical: ["INSURANCE_ID", "MRN"],
  credentialsSecrets: ["API_KEY", "ACCESS_TOKEN"],
  networkDevice: ["IP_ADDRESS", "DEVICE_ID"],
  businessCase: ["ORDER_ID", "INVOICE_ID", "CASE_ID"]
};

export const CATEGORY_KEYS = Object.keys(CATEGORY_TO_PLACEHOLDER_KEYS);

function createEnabledMap(keys) {
  return Object.fromEntries(keys.map((key) => [key, true]));
}

export const DEFAULT_SETTINGS = {
  sites: createEnabledMap(SITE_KEYS),
  categories: createEnabledMap(CATEGORY_KEYS)
};

function mergeBooleanSection(defaults, rawSection) {
  const merged = { ...defaults };
  if (!rawSection || typeof rawSection !== "object") {
    return merged;
  }

  for (const key of Object.keys(merged)) {
    if (typeof rawSection[key] === "boolean") {
      merged[key] = rawSection[key];
    }
  }
  return merged;
}

export function mergeSettings(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    sites: mergeBooleanSection(DEFAULT_SETTINGS.sites, source.sites),
    categories: mergeBooleanSection(DEFAULT_SETTINGS.categories, source.categories)
  };
}
