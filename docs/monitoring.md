# Error monitoring

Monitoring is opt-in because prompts contain sensitive material. Set the extension-local `promptmask_monitoring_v1` record to `{enabled: true, dsn: "<project DSN>", environment: "production"}` using the extension service worker console or managed provisioning. Set `enabled: false` to stop it. Only the configured GlitchTip origin is allowed by the extension CSP.

The official browser SDK is bundled locally with `npm ci && npm run build:monitoring`; no remote executable code is loaded. A private client per extension context avoids instrumenting the host page. Prompt text, redaction output, request context, users, breadcrumbs, extras and exception messages are excluded. Only exception types and diagnostic stacks are sent. Content scripts do not initialize monitoring. Test from the service worker or popup context and confirm the captured event ID in GlitchTip.
