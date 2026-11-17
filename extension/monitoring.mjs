import { BrowserClient, Scope, defaultStackParser, makeFetchTransport } from "./lib/monitoring-sdk.mjs";

const key = "promptmask_monitoring_v1";
let client;
let scope;

export async function configureMonitoring() {
  const config = (await chrome.storage.local.get(key))[key];
  const previous = client;
  client = undefined;
  scope = undefined;
  if (previous) await previous.close(2000);
  if (!config?.enabled || !config.dsn) return false;
  const dsn = new URL(config.dsn);
  if (dsn.origin !== "https://glitchtip.brainfc.uk") return false;
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
