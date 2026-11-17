import { BrowserClient, Scope, defaultStackParser, makeFetchTransport } from "./lib/monitoring-sdk.mjs";

const key = "promptmask_monitoring_v1";
let client;
let scope;
let configuration = Promise.resolve(false);

export function configureMonitoring() {
  configuration = configuration.then(applyConfiguration, applyConfiguration);
  return configuration;
}

async function applyConfiguration() {
  let config;
  try {
    config = (await chrome.storage.local.get(key))[key];
    if (config === undefined) {
      const response = await fetch(chrome.runtime.getURL("monitoring-config.json"));
      if (response.ok) config = await response.json();
    }
  } catch {
    config = undefined;
  }
  const previous = client;
  client = undefined;
  scope = undefined;
  if (previous) await previous.close(2000);
  if (!config?.enabled || !config.dsn) return false;
  let dsn;
  try {
    dsn = new URL(config.dsn);
  } catch {
    return false;
  }
  if (dsn.origin !== "https://glitchtip.brainfc.uk" || !/^[a-f0-9]+$/i.test(dsn.username) || !/^\/\d+$/.test(dsn.pathname)) return false;
  client = new BrowserClient({
    dsn: config.dsn,
    tunnel: config.tunnel || undefined,
    environment: config.environment || "production",
    release: `promptmask@${chrome.runtime.getManifest().version}`,
    transport: makeFetchTransport,
    stackParser: defaultStackParser,
    integrations: [],
    sendDefaultPii: false,
    beforeSend(event) {
      delete event.request;
      delete event.user;
      delete event.breadcrumbs;
      delete event.extra;
      for (const value of event.exception?.values || []) value.value = value.type || "Error";
      return event;
    }
  });
  scope = new Scope();
  scope.setClient(client);
  client.init();
  return true;
}

export function flushMonitoring(timeout = 2000) {
  return client?.flush(timeout) ?? Promise.resolve(true);
}

export function reportError(error) {
  return scope?.captureException(error);
}

globalThis.addEventListener?.("error", event => reportError(event.error));
globalThis.addEventListener?.("unhandledrejection", event => reportError(event.reason));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[key]) void configureMonitoring();
});
void configureMonitoring();
