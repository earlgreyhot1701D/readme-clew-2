# Ledger Monorepo

Two apps and a shared library.

```bash
pnpm --filter @acme/api run dev
pnpm --filter @acme/web dev
pnpm -F @acme/api test
pnpm --filter @acme/api run lint
pnpm --filter @acme/ghost run dev
```

The API is built on `fastify`.

The web app is built on `react`.
