# server (placeholder)

Empty on purpose. Wayfold's app runs fully standalone with no backend.

This folder will later hold:

- **Prompt 3** — the stateless serverless function that proxies the Anthropic API for the
  LLM parsing fallback (the API key lives only here, never in the app).
- **Part B / Prompts 5–7** — the optional premium backend (Fastify + Postgres): sync mirror,
  email ingestion, flight status, web share.

It is not a pnpm workspace package yet; add a `package.json` when work starts here.
