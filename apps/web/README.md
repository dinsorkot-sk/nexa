# Nexa web app

The tenant-facing SPA: `apps/web` on Nuxt 4, calling the standalone API in `apps/server` through a same-origin `/v1` proxy. The session travels as an HttpOnly cookie and never as a header.

## Ports

| Process | Port | Notes |
|---|---|---|
| Web (this app) | 3000 | The sign-in page and the app; the proxy lives here too |
| API (`apps/server`) | 3001 | The Hono server under `/v1` (PGlite by default in development) |

## Session at a glance

Same-origin calls keep the cookie simple: the browser talks to `http://localhost:3000/v1/**`, and the app proxies to `NEXA_API_URL` (default `http://localhost:3001`).

- `CORS_ORIGINS` (API, default `http://localhost:3000`) is where the session cookie's CSRF guard gets its answer: a state-changing call that carries a session must come from that origin with a JSON body, or the API answers 403. Keep the app on `http://localhost:3000` in development, or widen `CORS_ORIGINS` in the API's environment.
- Sign up exists only for non-production APIs (`POST /v1/auth/signup` disables itself in production until email verification ships). Production sign-in works for accounts that already exist.

## Run

```bash
# API (one process per PGlite data directory — see below)
DATABASE_URL=pglite:///tmp/opencode/nexa-api/pglite pnpm db:migrate
DATABASE_URL=pglite:///tmp/opencode/nexa-api/pglite pnpm db:seed
DATABASE_URL=pglite:///tmp/opencode/nexa-api/pglite pnpm dev:api      # http://localhost:3001/v1

# The app, from the build output — the supported way on this machine:
pnpm --filter @nexa/web build
PORT=3000 node apps/web/.output/server/index.mjs

# Or the development server when a rebuild is affordable either way:
PORT=3000 pnpm --filter @nexa/web dev
```

**PGlite persists to a directory, and two processes on one directory corrupt it.** Never run a second server, a `db:migrate`, or a test suite against the same `pglite://` path while a server holds it. Each long-lived server gets its own directory.

## Development server

`nuxt dev` runs on this machine, but a cold first boot takes about four minutes — the sources and Vite's caches live on `/mnt/d`'s 9p filesystem. Passing the port goes through the environment (`PORT=3100`); the extra `--` of `pnpm run` reaches nuxt as a literal argument. `NEXA_VITE_CACHE_DIR` is an escape hatch that moves Vite's cache to the Linux filesystem through `vite.cacheDir` — it works, but measured boots read the same either way (4m04s cold versus 4m07s with the cache moved), so it only removes one risk factor:

```bash
NEXA_VITE_CACHE_DIR=/tmp/opencode/nexa-vite PORT=3100 pnpm --filter @nexa/web dev
```

If a build already exists, running it (`node .output/server/index.mjs`) is faster than waiting for dev to start.

## Tests

```bash
pnpm --filter @nexa/web test    # the composables, against a stubbed fetch; no Nuxt runtime
```

The suite runs in a node environment: `useApi`, `useEntity`, `useSession` and `useFormat` are tested on their own, and the screens are checked in a real browser instead (see the phase records in `docs/plans/README.md`).
