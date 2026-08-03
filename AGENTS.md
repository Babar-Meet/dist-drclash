# Dr.Clash - Angular + Cloudflare Workers

## Architecture

```
src/app/
  core/              # Singleton services (ApiService, AuthService)
  features/          # Lazy-loaded feature components (one per route)
  layout/            # Nav + footer (eagerly imported by App)
  shared/            # Reusable directives, components
workers/src/
  index.ts           # ALL route handlers, auth helpers, DB ops (865 lines)
  middleware/
    auth.ts          # jwtVerify, requireAuth, requireAdmin, requireUserVote
    rate-limit.ts    # Per-IP windowed rate limiting via D1
```

## Conventions

- Standalone components only (no NgModules)
- `input()`/`output()` over `@Input`/`@Output`; `inject()` over constructor injection
- Angular 17+ control flow (`@if`, `@for`) — no `*ngIf`/`*ngFor`
- Prettier: single quotes, 100 char width, Angular HTML parser

## Design System (VoiceBox)

Fonts: Archivo Black (headings), Work Sans (body), Space Mono (code)
Colors: `#0A0A0A` (black), `#FAFAFA` (white), `#EF4444` (red accent)
Radius: `0px`, Shadows: `none`
Red is a scalpel — at most one red element per viewport
See `DESIGN.md` for full spec

## Key Facts an Agent Will Miss

- **Frontend API URL is hardcoded** in `src/app/core/services/api.service.ts:3` — NOT in environment config
- **Backend is a single file** (`workers/src/index.ts`, 865 lines) — no controllers, services, or repo layer
- **Admin auth uses env vars** (`ADMIN_USERNAME`/`ADMIN_PASSWORD`), not the DB. Admin JWTs have `id: 0`, `is_admin: true`. Admin tokens are blocked from voting and user features
- **`requireAdmin` middleware exists in `auth.ts` but is unused** — admin routes use inline `user.is_admin` check instead
- **Secrets must be set via `wrangler secret put`**, NOT in `wrangler.toml` `[vars]` (unencrypted)
- **Vote state lives in the root `VoteService` singleton** (`src/app/core/services/vote.service.ts`), NOT in the component. It owns a per-post intent map, 300ms debounce, single-flight flush, optimistic merge (delta math: new vote +intent, switch +2*intent, unvote -fromVote), a **localStorage outbox** (key `pendingVotes`, with Safari-private-mode memory fallback), exponential backoff honoring `Retry-After`, hydrate/replay on app start, and clears state on logout. The client persists the absolute desired state (1/-1/0) BEFORE the network call.
- **`POST /api/vote` uses an absolute-state idempotent contract**: `value` is the desired final state, and a repeated identical value is a server-side NO-OP (returns current state) so retries/replays never double-apply. The handler re-reads the count AFTER the `batch()` so the response is authoritative, and returns 500 (not 400) for internal errors. `voteRateLimit` 429s include a `Retry-After` header.
- **Pending votes are stored in localStorage, NOT sessionStorage** - sessionStorage dies with the tab, which caused votes to be lost on refresh.
- **No CSP header** anywhere — frontend `index.html` has none, Worker only sets X-Frame-Options/X-Content-Type-Options/Referrer-Policy/X-XSS-Protection

## Testing

### E2E (Playwright, 319 tests)
- **NEVER RUN E2E TESTS YOURSELF**. They take too long. The user will run them. If you make changes that require E2E verification, give the user the specific `npm run test:e2e` command to run.
- **ONLY run specific unit tests** to verify the exact files you edit.
All API calls mocked via `page.route()`. Key patterns:
- **Catch-all route must be registered FIRST** with `route.fallback()`, THEN specific handlers (`**/api/posts*`, `**/api/vote`, `**/api/auth/me`) with `route.fulfill()`
- Auth mock: `page.evaluate(() => sessionStorage.setItem('token', 'fake-jwt-token-for-testing'))` then `page.reload()`
- `getByText(text, { exact: true })` — NOT `page.locator(selector, { exactText })` (silently ignored)
- E2E auto-starts `ng serve` via Playwright `webServer` config

### Unit (Vitest, 34 tests)
- Config: `tsconfig.spec.json` with `vitest/globals` types
- `.spec.ts` files excluded from prod build via `tsconfig.app.json` `exclude`

### Commands
```
npm run test:unit          # Vitest (no watch)
npm run test:e2e           # Playwright headless
npm run test:e2e:headed    # Playwright headed
npm run test:e2e:gui       # Playwright UI mode
npm run test:e2e:debug     # Playwright debug
npm run test:all           # unit + e2e
```

## Workers Commands (run from `workers/`)
```
npm run dev              # wrangler dev (local)
npm run deploy           # wrangler deploy
npm run migrate          # wrangler d1 migrations apply drclash-db
npm run migrate:local    # wrangler d1 migrations apply drclash-db --local
```

## Environment Files
- `.env.test` — committed with dummy values for CI
- `.env.test.local` — real test creds (gitignored via `.env.*.local`)
- Real secrets for Workers go in Cloudflare dashboard via `wrangler secret put`

## Git Rules

- Never commit or push unless explicitly told to
- No `git add`, `git commit`, `git push` automation without direct instruction
- Wait for explicit "commit" or "push" command

## Writing

- Never use em dash (-- or —). Use a regular hyphen (-).
