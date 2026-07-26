> [!NOTE]
> **Documentation Notice**
>
> This documentation is automatically generated through static analysis of the repository's implementation and existing documentation. It reflects the verified implementation at the time it was generated and is intended as a technical reference for the project's architecture, implementation details, workflows, and engineering decisions.
>
> As the project evolves, portions of this document may become outdated. The repository's source code and LICENSE file remain the authoritative sources for runtime behavior, legal terms, and implementation details.

# Dr.Clash

A public feature request and bug tracking platform for the Dr.Clash Clash of Clans companion mobile app. Users submit, vote on, and track feature requests and bug reports. Administrators manage the board with replies, status updates, and moderation.

The companion mobile application (upgrade tracker, base layouts, army planner, statistics, mini-games, home screen widgets) is a separate project not included in this repository. This repository contains only the web-based community feedback portal and its serverless API backend.

## Purpose

Dr.Clash replaces opaque feedback channels (email, Discord, etc.) with a transparent, vote-driven prioritization system. Every authenticated user can submit feature requests and bug reports, upvote or downvote existing submissions, and see which items administrators have completed. The system provides a direct communication channel between the mobile app's user base and its development team.

## Highlights

- **Serverless API**: Entire backend runs on Cloudflare Workers with D1 (serverless SQLite) -- no servers to manage, automatic scaling
- **Vote-driven prioritization**: Community upvote/downvote system with optimistic UI updates and authoritative server reconciliation
- **Dual authentication strategies**: Email/password with PBKDF2 (100k iterations SHA-256) alongside Google OAuth 2.0
- **Rate-limited by design**: Per-endpoint, per-IP windowed rate limiting using D1 storage for auth and submission endpoints
- **Editorial design system**: VoiceBox -- a magazine-style, high-contrast, zero-border-radius visual language with intentional red accent usage
- **Lazy-loaded frontend**: Every route uses Angular 17+ `loadComponent` for code-split delivery

## Features

- **Feature/Bug Board**: Public feed of user-submitted feature requests and bug reports with type-based and status-based filtering
- **Voting System**: Authenticated upvote (+) and downvote (-) with toggle-off behavior, optimistic state updates, and server-side correction
- **Cursor-based Pagination**: Keyset pagination on the post feed using last post ID as cursor, avoiding offset drift
- **User Authentication**: Email/password registration with server-side validation, Google OAuth 2.0, JWT-based session management with 7-day expiry
- **Password Reset**: Email-based reset flow via the Resend API with 1-hour expiring JWT tokens
- **Admin Dashboard**: Separate admin authentication against environment variable credentials, post management (mark done, reopen, delete), reply management (create, edit, delete), bulk clear of all completed items
- **Profile Management**: In-app username editing with server-side uniqueness validation, full account deletion with cascade of all associated data
- **Responsive Layout**: Mobile-responsive design with hamburger navigation, full-screen overlay menu with staggered animations, adaptive grids, and mobile-first CSS
- **Scroll-triggered Animations**: IntersectionObserver-based fade-in animations on the landing page and legal pages
- **Go-to-Top Button**: Fixed-position scroll-to-top button appearing after 200px scroll threshold
- **Legal Pages**: Privacy Policy and Terms & Conditions pages with scroll-animated content

## Technical Overview

Dr.Clash is split into two independently deployable units that communicate exclusively through a REST API:

**Frontend** -- An Angular 21 single-page application deployed on Vercel. Uses standalone components exclusively (no NgModules). Every application route is lazy-loaded via `loadComponent`, producing separate JavaScript chunks delivered on demand. Authentication state is managed by `AuthService` using Angular signals (`signal()`, `computed()`), with the JWT token stored in `sessionStorage` (cleared on tab close). The HTTP client (`ApiService`) wraps native `fetch` with automatic `Authorization: Bearer` header injection. The visual layer follows the VoiceBox design system -- strict editorial aesthetic with zero rounded corners, no shadows, black/white/red palette only, and a deliberately limited red accent policy (at most one red element per viewport).

**Backend** -- A Cloudflare Workers application built on the Hono 4.6 framework, deployed as a serverless function with a D1 SQLite database. Uses JWT (HS256) for stateless authentication, the Web Crypto API for PBKDF2 password hashing (100,000 iterations SHA-256 with 16-byte salt), and parameterized prepared statements (D1 `.bind()`) for all database operations. Rate limiting is implemented as middleware backed by D1 storage with SHA-256 hashed IPs (never stores raw IP addresses). The API follows a flat route structure under `/api/` with middleware handling CORS, security headers, JWT verification, and windowed rate limiting.

**Communication Boundary**: The Angular SPA communicates with the Cloudflare Workers API exclusively through HTTPS REST calls. The API base URL is hardcoded in the frontend's `ApiService`. No WebSocket, no server-sent events, no real-time push -- all data fetching is request-response.

## Technology Stack

### Frontend
| Technology | Purpose |
|---|---|
| TypeScript 5.9 | Primary language, strict mode enabled |
| Angular 21.2 | SPA framework using standalone components, signals, `bootstrapApplication` |
| Angular Router 21.2 | Lazy-loaded routing via `loadComponent` |
| Angular Forms 21.2 | Template-driven forms with `FormsModule` and `[(ngModel)]` |
| Angular Animations | `provideAnimations()` provider (registered, no custom animations used) |
| Native `fetch` | HTTP client wrapping the browser Fetch API |
| esbuild (via `@angular/build`) | Production build bundler replacing the legacy `@angular-devkit/build-angular` |

### Backend
| Technology | Purpose |
|---|---|
| TypeScript 5.6 | Primary language, strict mode enabled |
| Hono 4.6 | Lightweight TypeScript web framework for Cloudflare Workers providing routing, context, middleware, and JWT utilities |
| Cloudflare Workers | Serverless runtime environment |
| Cloudflare D1 | Serverless SQLite database with ACID transactions |
| Web Crypto API | PBKDF2 password hashing and SHA-256 digest (in-browser, no external library) |
| Wrangler 3.80 | Cloudflare Workers CLI for development, deployment, and D1 migrations |

### Authentication
| Technology | Purpose |
|---|---|
| JWT (HS256) | Stateless session tokens with `hono/jwt` sign/verify |
| PBKDF2 (100k iterations, SHA-256) | Password hashing with per-password random 16-byte salt |
| Google OAuth 2.0 | Third-party authentication via Google's OAuth endpoints |
| Resend API | Transactional email delivery for password reset flow |

### Infrastructure
| Platform | Purpose |
|---|---|
| Vercel | Frontend SPA hosting |
| Cloudflare Workers | Backend API hosting |
| Cloudflare D1 | Serverless SQLite database |
| npm 11 | Package manager |

### Developer Tooling
| Technology | Purpose |
|---|---|
| Prettier 3.8 | Code formatting (single quotes, 100 char width, Angular HTML parser) |
| Vitest 4.0 / jsdom 28.0 | Unit testing framework (configured but no test files exist) |

## Repository Structure

```
/
├── public/                          # Static assets (served from root by Angular)
│   ├── app-icon.png                 # App icon / favicon
│   ├── app-store.svg                # Apple App Store badge SVG
│   ├── google-play.svg              # Google Play badge SVG
│   └── favicon.ico
├── src/                             # Angular application source
│   ├── index.html                   # Entry HTML with Google Fonts preconnect
│   ├── main.ts                      # Angular bootstrap via bootstrapApplication()
│   ├── styles.css                   # Global CSS reset, body defaults, selection color
│   └── app/
│       ├── app.config.ts            # ApplicationConfig providers (router, animations, error listeners)
│       ├── app.routes.ts            # Route definitions with lazy-loaded components
│       ├── app.ts                   # Root component (nav + router-outlet + footer + go-to-top)
│       ├── app.html                 # Root template (component selectors)
│       ├── app.css                  # Root layout (flex column, min-height: 100dvh)
│       ├── core/
│       │   └── services/
│       │       ├── api.service.ts   # HTTP client wrapping fetch, typed methods for all endpoints
│       │       └── auth.service.ts  # Authentication state (signal-based), token management
│       ├── features/               # Lazy-loaded feature modules (one per route)
│       │   ├── home/                # Landing page with hero, feature cards, app store links
│       │   ├── features-bug/        # Feature/bug request board with voting, filtering, pagination
│       │   ├── login/               # Login/register forms, Google OAuth, forgot password
│       │   ├── admin/               # Admin dashboard with post/reply management and bulk ops
│       │   ├── oauth-callback/      # OAuth redirect handler (token from URL fragment)
│       │   ├── reset-password/      # Password reset form (token from query parameter)
│       │   ├── privacy-policy/      # Privacy policy legal page with scroll animations
│       │   └── terms-conditions/    # Terms & conditions legal page with scroll animations
│       ├── layout/                  # Shell components (persistent outside router-outlet)
│       │   ├── nav/                 # Sticky nav bar, hamburger menu, profile modal
│       │   └── footer/              # Site footer with navigation links
│       └── shared/                  # Reusable building blocks
│           ├── components/
│           │   ├── coming-soon.component.ts   # Placeholder for unimplemented routes
│           │   └── go-to-top.component.ts     # Scroll-to-top floating action button
│           └── directives/
│               └── animate-on-scroll.directive.ts  # IntersectionObserver fade-in
├── workers/                         # Cloudflare Workers backend
│   ├── wrangler.toml                # Worker config, D1 binding, env vars, secrets
│   ├── package.json                 # Backend dependencies (hono, wrangler, typescript)
│   ├── tsconfig.json                # Workers TypeScript config (ES2021, strict)
│   ├── migrations/                  # Sequential SQL migration files
│   │   ├── 0001_initial.sql         # users, posts, votes tables + indexes
│   │   ├── 0002_rate_limit.sql      # rate_limits table + OAuth state storage
│   │   └── 0003_replies.sql         # replies table (admin responses)
│   └── src/
│       ├── index.ts                 # Main Hono app: all route handlers, auth helpers, DB ops
│       ├── db/
│       │   └── types.ts             # TypeScript interfaces for DB rows (User, Post, Vote, etc.)
│       └── middleware/
│           ├── auth.ts              # JWT verification, requireAuth, requireAdmin, guard functions
│           └── rate-limit.ts        # Per-IP windowed rate limiting middleware
├── DESIGN.md                        # Complete VoiceBox design system specification
├── AGENTS.md                        # AI assistant coding conventions
├── angular.json                     # Angular CLI configuration (esbuild builder, budgets)
├── tsconfig.json                    # Root TypeScript config (strict mode, ES2022)
├── tsconfig.app.json                # App-specific TS config
├── tsconfig.spec.json               # Test-specific TS config (vitest globals)
├── vercel.json                      # Vercel deployment configuration (project name only)
├── .env.example                     # Template for all required environment variables
├── .editorconfig                    # Editor settings (2-space indent, UTF-8, single quotes for TS)
├── .prettierrc                      # Prettier configuration
├── .gitignore                       # Git ignore rules
├── package.json                     # Frontend dependencies and scripts
└── package-lock.json                # Lockfile (npm)
```

## Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Angular SPA)                                      │
│  ┌──────────┐ ┌──────────┐ ┌─────────────────────────────┐ │
│  │ Nav      │ │ Router   │ │ GoToTop / Footer            │ │
│  │ Component│ │ Outlet   │ │ Components                  │ │
│  └──────────┘ └──────────┘ └─────────────────────────────┘ │
│       │              │                                      │
│       ▼              ▼                                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ AuthService (signal-based user state, JWT token mgmt)│    │
│  │ ApiService (fetch-based typed HTTP client)           │    │
│  └─────────────────────────────────────────────────────┘    │
│                        │                                      │
└────────────────────────┼─────────────────────────────────────┘
                         │ HTTPS / REST (JSON)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare Workers (Hono 4.6)                              │
│  ┌────────────┐ ┌────────────┐ ┌─────────────────────────┐ │
│  │ CORS       │ │ JWT Verify │ │ Rate Limiting (D1)      │ │
│  │ Middleware  │ │ Middleware │ │ Middleware              │ │
│  └────────────┘ └────────────┘ └─────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Route Handlers                                       │    │
│  │ /api/health    /api/auth/*    /api/posts/*           │    │
│  │ /api/vote      /api/admin/*                          │    │
│  └─────────────────────────────────────────────────────┘    │
│                        │                                      │
└────────────────────────┼─────────────────────────────────────┘
                         │ D1 Binding
                         ▼
               ┌─────────────────────────┐
               │  Cloudflare D1 (SQLite) │
               │  users / posts / votes  │
               │  replies / rate_limits  │
               └─────────────────────────┘
```

### Initialization Sequence

1. **Angular Bootstrap**: `main.ts` calls `bootstrapApplication(App, appConfig)`. The `appConfig` provider array registers `provideRouter(routes)`, `provideAnimations()`, and `provideBrowserGlobalErrorListeners()`.

2. **Root Component Render**: `App` component renders immediately with four children: `<app-nav />` (sticky navigation), `<router-outlet />` (feature content), `<app-footer />`, and `<app-go-to-top />`. The `NavComponent` and `FooterComponent` are eagerly imported by `App.ts` -- they are not lazy-loaded because they persist across navigation.

3. **AuthService Initialization**: The `AuthService` constructor calls `loadUser()` synchronously during Angular's dependency injection phase. This checks `sessionStorage` for an existing JWT token. If found, it calls `GET /api/auth/me` to validate the token and populate the `user` signal. The `loading` signal transitions from `true` to `false` after completion.

4. **Route Resolution**: The Angular Router matches the current URL against `app.routes.ts`. Each route is defined with `loadComponent` for lazy-loaded chunk delivery. The matched component (e.g., `HomeComponent` for `/`) is loaded asynchronously and rendered into `<router-outlet />`.

5. **Backend Cold Start**: When the Cloudflare Worker receives its first request (or after idle timeout), the Hono application initializes in the Workers runtime. No database connection pool is needed -- D1 queries are executed through the injected binding (`c.env.DB`). Static middleware (CORS, security headers) is registered once at worker boot.

### Middleware Stack (Execution Order)

```
Incoming Request
  │
  ├ 1. CORS Middleware (global, all routes)
  │    Sets Access-Control-Allow-Origin to APP_URL env var
  │    Handles OPTIONS preflight (204 No Content)
  │
  ├ 2. JWT Verify Middleware (global, /api/*)
  │    Extracts Bearer token from Authorization header
  │    Verifies HS256 signature via hono/jwt verify()
  │    On success: populates c.set('user', payload)
  │    On failure: silently continues with user = null (non-blocking)
  │
  ├ 3. Security Headers Middleware (global, all routes)
  │    X-Frame-Options: DENY
  │    X-Content-Type-Options: nosniff
  │    Referrer-Policy: strict-origin-when-cross-origin
  │    X-XSS-Protection: 0
  │
  ├ 4. Rate Limit Middleware (selected routes only)
  │    Applied to: /api/auth/login, /api/auth/register,
  │    /api/auth/forgot-password, /api/admin/login,
  │    /api/auth/reset-password, /api/posts, /api/vote
  │    Strict limit: 10 req/60s (auth + admin login endpoints)
  │    Standard limit: 30 req/60s (posts + vote endpoints)
  │    See rate-limit.ts for implementation
  │
  └ 5. Route Handler
       Executes business logic, database operations, returns JSON
```

### Frontend Architecture

The Angular application follows a strict feature-based structure with standalone components:

- **`core/`**: Singleton services registered with `providedIn: 'root'`. `AuthService` owns authentication state (user signal, loading signal, token management) and is consumed by nav, features-bug, admin, login, and oauth-callback. `ApiService` wraps all HTTP communication with typed methods for every endpoint and automatic JWT header injection.

- **`layout/`**: Shell components rendered directly by `App` outside the router outlet. `NavComponent` is sticky-positioned at the top with responsive hamburger menu and profile modal. `FooterComponent` is a dark banner with navigation links and copyright. Both persist across route changes without re-initialization.

- **`features/`**: One folder per route, each containing a single lazy-loaded component with its template, styles, and logic. Every route in `app.routes.ts` uses `loadComponent` for code splitting. Feature components import only from `core/` services, `shared/` directives, or Angular framework modules.

- **`shared/`**: Reusable building blocks. `AnimateOnScrollDirective` provides declarative scroll-triggered animations. `GoToTopComponent` is a fixed-position FAB with scroll visibility. `ComingSoonComponent` is a placeholder for unimplemented routes.

State management is entirely signal-based (`signal()`, `computed()`) distributed across components rather than centralized. The `AuthService` user signal is the only shared reactive state -- individual components (e.g., `FeaturesBugComponent`) hold their own signal state for posts, filters, loading, and UI toggles.

### Backend Architecture

The Hono application uses a flat route structure defined in `workers/src/index.ts`. All business logic is implemented directly in route handlers rather than abstracted into separate controllers or services. The file is a single 854-line module containing:

- Route definitions (app.get, app.post, app.put, app.delete)
- Input validation (email format, username charset/length, password length, post content length, vote values)
- Database queries via D1 prepared statements with `.bind()`
- PBKDF2 hash/compare helper functions (Web Crypto API)
- Constant-time string comparison utility

Three middleware files provide cross-cutting concerns:
- `auth.ts` -- JWT verification and authorization guards (requireAuth, requireAdmin, requireUserVote, requireUserAccount)
- `rate-limit.ts` -- Per-IP windowed rate limiting backed by D1

No repository pattern, no service layer, no DTOs -- the backend is intentionally flat and minimal. Each route handler receives the request, validates input, queries D1, and returns JSON.

## Core Components

### AuthService (`src/app/core/services/auth.service.ts`)

**Purpose**: Singleton service managing authentication state across the entire application.

**State**:
- `user`: `signal<User | null>` -- current authenticated user or null
- `loading`: `signal<boolean>` -- initialization status (true during session restoration)

**Token Management**:
- Internally caches the JWT in a private `_token` field for in-memory access
- Persists to `sessionStorage` (cleared when browser tab closes) via `getItem`/`setItem`/`removeItem`
- Never exposes the raw token to consuming components

**Initialization**:
- Constructor calls `loadUser()` synchronously
- `loadUser()` checks `sessionStorage` for token, validates via `GET /api/auth/me`, populates `user` signal
- If validation fails, clears the token and sets `user` to null
- `initFromToken(token)` is used by `OauthCallbackComponent` after Google OAuth -- sets the token then validates

**Methods**:
- `login(email, password)` -- authenticates via email/password, stores token, sets user
- `adminLogin(username, password)` -- authenticates against env var credentials, stores token, sets user
- `updateProfile(username)` -- calls profile API, updates user signal with response
- `deleteAccount()` -- calls account deletion API, clears token and user signal
- `logout()` -- clears token from sessionStorage and user signal (no server-side invalidation)

**Key Design Detail**: AuthService delegates all HTTP calls to ApiService. It never constructs URLs or headers directly.

### ApiService (`src/app/core/services/api.service.ts`)

**Purpose**: Typed HTTP client providing a single interface for all API communication.

**Architecture**:
- Base URL is hardcoded as a module constant (`const API = '...'`)
- Every request automatically injects `Content-Type: application/json` and `Authorization: Bearer <token>` (if token exists in sessionStorage)
- Token is read directly from `sessionStorage` rather than from `AuthService`, avoiding circular dependency
- All HTTP methods return typed `Promise<T>` via the private `request<T>()` method

**Error Handling**:
- Parses JSON error responses
- Extracts `error` field as message and optional `code` field (used by login for `oauth_only` detection)
- Throws a standard `Error` object with optional `.code` property

**Method Surface** (all typed):
- Auth: `login`, `register`, `me`, `forgotPassword`, `resetPassword`
- Posts: `getPosts`, `createPost`
- Voting: `vote`
- Profile: `updateProfile`, `deleteAccount`
- Admin: `adminLogin`, `adminGetPosts`, `adminMarkDone`, `adminReopen`, `adminDeletePost`, `adminReply`, `adminEditReply`, `adminDeleteReply`, `adminClearDone`
- Replies: `getReplies`

### FeaturesBugComponent (`src/app/features/features-bug/features-bug.component.ts`)

**Purpose**: Main feature/bug request board -- the primary user-facing interface.

**State Ownership** (all component-scoped signals):
- `posts`: `signal<Post[]>` -- current page of posts
- `activeFilter`: `signal<FilterTab>` -- 'all', 'feature', 'bug', or 'done'
- `showForm`: `signal<boolean>` -- submission overlay visibility
- `loading`, `submitting`, `loadingMore`: boolean signals
- `expandedPosts`: `signal<Set<number>>` -- posts with expanded content
- `pendingVotes`: `Set<number>` -- posts with in-flight vote requests (prevents duplicate submissions)
- `nextCursor`: `number | null` -- cursor for pagination

**Filtering**:
- Filter tabs (All, Features, Bugs, Done) trigger fresh API calls with type/status parameters
- "Done" filter maps to `status=done` without type filter
- "Features"/"Bugs" filter maps to the corresponding type with `status=current`
- "All" passes neither type nor status (defaults to `status=current` server-side)

**Pagination**:
- Cursor-based keyset pagination using the last post ID from each batch
- `loadMore()` fetches the next page and appends to the existing `posts` signal array
- Server returns `limit + 1` items -- the extra item indicates "has more" without a separate count query

**Voting**:
- `vote(postId, value)` implements optimistic updates with server reconciliation
- Sequence: check auth -> guard against pending -> compute optimistic delta -> update local state -> POST to server -> replace with authoritative server value -> on error, revert to previous state
- If `post.user_vote === value`, the call becomes a toggle-off (`value = 0`)
- Delta calculation: `value === 0` removes existing vote; existing vote exists but differs = `value * 2` (switch); no existing vote = `value` (new)
- Minimum floor of 0 on optimistic upvote count (prevents negative display)

### AdminComponent (`src/app/features/admin/admin.component.ts`)

**Purpose**: Administrative dashboard for managing posts and replies.

**Authentication**: Separate login flow that checks credentials against `ADMIN_USERNAME` and `ADMIN_PASSWORD` environment variables. Admin JWT tokens have `id: 0` and `is_admin: true`. The admin panel conditionally renders -- login form when not authenticated, dashboard when authenticated.

**Operations**:
- Post management: mark done, reopen, delete (with `confirm()` dialog)
- Reply management: create, inline edit, delete (with `confirm()`)
- Bulk clear: delete all done posts with their associated votes and replies
- Filter tabs for status-based viewing (All, Current, Done)

**State**: Uses `Record<number, string>` maps for reply text inputs and editing state, `Set<number>` for tracking in-flight operations.

### NavComponent (`src/app/layout/nav/nav.component.ts`)

**Purpose**: Sticky top navigation bar with responsive behavior and profile management.

**Desktop**: Horizontal link layout with `routerLinkActive` styling (red underline on active), "Hello, username" button for authenticated users, CTA login button for unauthenticated users.

**Mobile** (`max-width: 768px`):
- Hamburger button with animated span-to-X transition
- Full-screen dark overlay menu with `backdrop-filter: blur(16px)`
- Staggered link animations using `transition-delay` increments (0.04s per item)
- Escape key closes menu via `@HostListener('document:keydown.escape')`

**Profile Modal**: Dark overlay with centered card containing username display/edit, account deletion flow (two-step confirmation), and logout. All interactions are inline (no separate route).

### AnimateOnScrollDirective (`src/app/shared/directives/animate-on-scroll.directive.ts`)

**Purpose**: Declarative scroll-triggered fade-in animation using the IntersectionObserver API, avoiding scroll event listener overhead.

**Behavior**:
- On `ngOnInit`, checks if the element is already in the viewport via `getBoundingClientRect()`
- If visible: immediately adds `is-visible` CSS class
- If not visible: adds `will-animate` CSS class, creates an IntersectionObserver with `threshold: 0.1`, swaps to `is-visible` on intersection
- Disconnects the observer after the first intersection (one-time animation)
- Cleans up observer on `ngOnDestroy`

**CSS Contract**: Host components define transitions on `[animateOnScroll]` with `.will-animate` (hidden state) and `.is-visible` (visible state) selectors.

### GoToTopComponent (`src/app/shared/components/go-to-top.component.ts`)

**Purpose**: Fixed-position scroll-to-top button with visibility threshold.

- Listens to `window:scroll` via `@HostListener`, sets `visible` to `true` when `scrollY > 200`
- CSS transition handles opacity and translateY for smooth appear/disappear
- `pointer-events: none` / `auto` prevents interaction when hidden
- Click triggers `window.scrollTo({ top: 0, behavior: 'smooth' })`

### Backend Route Handlers (`workers/src/index.ts`)

**Purpose**: All API endpoints implemented as a single flat module (854 lines).

**Design**: No controllers, no services, no repositories. Each route handler is a Hono middleware function that:
1. Parses request body from `c.req.json()` (POST/PUT) or query parameters (GET)
2. Validates input with inline checks (type, length, format)
3. Executes D1 prepared statements via `c.env.DB.prepare().bind().run()/.all()/.first()`
4. Returns JSON responses via `c.json()`
5. Wraps business logic in try/catch, returning 400 for malformed requests

**Boundaries**: The `Bindings` type interface defines the shape of `c.env` -- all environment variables and the D1 binding are strongly typed.

### Auth Middleware (`workers/src/middleware/auth.ts`)

**Purpose**: JWT verification and authorization guards.

**`jwtVerify`**: Non-blocking middleware. Extracts Bearer token, verifies HS256 signature via `hono/jwt`'s `verify()`. On success, attaches `{ id, email, username, is_admin }` to Hono's context (`c.set('user', ...)`). On verification failure, silently continues with no user -- the request proceeds as unauthenticated.

**`requireAuth`**: Blocks requests with no authenticated user, returns 401.

**`requireAdmin`**: Blocks non-admin users, returns 403.

**`requireUserVote`**: Blocks unauthenticated requests (401) and admin tokens (403). Admin tokens have `id: 0` which has no corresponding foreign key in the votes table.

**`requireUserAccount`**: Blocks unauthenticated requests (401) and admin tokens (403). Prevents admin tokens from accessing user-specific features like profile updates, post creation, and account deletion.

### Rate Limit Middleware (`workers/src/middleware/rate-limit.ts`)

**Purpose**: Per-IP windowed rate limiting using D1 storage.

**IP Identification**: Uses `cf-connecting-ip` header (Cloudflare's authentic IP header) with fallback to `x-forwarded-for` and then `'unknown'`.

**IP Privacy**: IP is hashed using SHA-256 via `crypto.subtle.digest()`, truncated to 16 hex characters. Raw IPs are never stored.

**Window Algorithm**:
1. Compute `windowKey` by dividing current Unix timestamp by the window size
2. Upsert into `rate_limits` table with composite key `(path:ipHash, windowKey)`
3. ON CONFLICT increment count
4. Read back count and compare against max
5. Return 429 if exceeded

**Failure Mode**: Catches all errors with `console.error()` and allows the request through (fail-open). The rate limiter depends on D1 availability -- if D1 is down, rate limiting is bypassed.

## Routing

### Frontend Routes (`src/app/app.routes.ts`)

| Path | Component | Lazy-loaded | Auth Required | Description |
|---|---|---|---|---|
| `/` | `HomeComponent` | Yes | No | Landing page with hero, feature cards, app store links |
| `/features-bug` | `FeaturesBugComponent` | Yes | No (read), Yes (vote/submit) | Feature/bug request board |
| `/login` | `LoginComponent` | Yes | No | Login/register form, Google OAuth, forgot password |
| `/admin` | `AdminComponent` | Yes | Admin | Admin dashboard (post/reply management) |
| `/oauth-callback` | `OauthCallbackComponent` | Yes | No | Google OAuth redirect handler |
| `/reset-password` | `ResetPasswordComponent` | Yes | No | Password reset form with token from query param |
| `/privacy-policy` | `PrivacyPolicyComponent` | Yes | No | Privacy policy legal page |
| `/terms-conditions` | `TermsConditionsComponent` | Yes | No | Terms & conditions legal page |
| `**` (wildcard) | Redirect to `/` | — | — | Catch-all fallback |

All routes use `loadComponent` for code splitting. No `canActivate` guards -- authentication enforcement is handled at the component level or at the API level.

## API Documentation

All API endpoints are served from the Cloudflare Workers backend under the `/api/` path prefix.

### Health

| Method | Path | Auth | Rate Limited | Description |
|---|---|---|---|---|
| GET | `/api/health` | No | No | Returns `{ ok: true }` |

### Authentication

| Method | Path | Auth | Rate Limit | Description |
|---|---|---|---|---|
| POST | `/api/auth/register` | No | Strict (10/min) | Create account with email, username, password |
| POST | `/api/auth/login` | No | Strict (10/min) | Authenticate with email + password, returns JWT + user |
| POST | `/api/auth/forgot-password` | No | Strict (10/min) | Sends password reset email via Resend API |
| POST | `/api/auth/reset-password` | No | Strict (10/min) | Reset password using token from email |
| GET | `/api/auth/google` | No | No | Redirect to Google OAuth 2.0 consent screen |
| GET | `/api/auth/google/callback` | No | No | OAuth callback, exchanges code for token, redirects with JWT fragment |
| GET | `/api/auth/me` | Optional | No | Returns current authenticated user or null |
| PUT | `/api/auth/profile` | Required (non-admin) | No | Update username |
| DELETE | `/api/auth/account` | Required (non-admin) | No | Delete account and all associated data |

**Register Request**: `{ email: string, username: string, password: string }` -- Username validation: 2-30 chars, letters/numbers/hyphens/underscores only. Password minimum 6 characters. Email max 254 characters, validated against regex.

**Login Request/Response**: `{ email, password }` -> `{ token: string, user: { id, email, username, is_admin } }`. OAuth-only accounts return 401 with `code: 'oauth_only'`.

**Forgot Password**: Always returns `{ message: string }` regardless of whether the email exists. Same message text for both cases to prevent email enumeration. Sends email via Resend API with 1-hour expiring reset link.

**Reset Password**: Requires `{ token: string, password: string }`. Token is verified as a JWT signed with the application JWT_SECRET and must have `purpose: 'password-reset'`.

**Google OAuth Flow**:
1. `GET /api/auth/google` -- generates random UUID state, stores in `rate_limits` table (300s expiry), redirects to Google
2. `GET /api/auth/google/callback` -- validates state, exchanges authorization code for access token, fetches user info from Google's `oauth2/v2/userinfo`, finds or creates user, issues application JWT, redirects to frontend at `/oauth-callback#token=<jwt>`

### Posts

| Method | Path | Auth | Rate Limit | Description |
|---|---|---|---|---|
| GET | `/api/posts` | Optional | Standard (30/min) | List posts with optional type/status/cursor/limit filters |
| GET | `/api/posts/:id` | Optional | No | Get single post with replies and user vote status |
| GET | `/api/posts/:id/replies` | No | No | Get replies for a specific post |
| POST | `/api/posts` | Required (non-admin) | Standard (30/min) | Create a new feature request or bug report |

**List Query Parameters**: `type` (feature|bug), `status` (current|done, default: current), `cursor` (numeric post ID for keyset pagination), `limit` (max 50, default: 20).

**List Response**: `{ posts: Post[], nextCursor: number | null }`. Each post includes `user_vote` (1, -1, or null for current user) and `replies` array (batch-fetched in a single query using `WHERE post_id IN (...)`).

**Cache**: Response includes `Cache-Control: public, max-age=30, s-maxage=60`.

**Create Post Request**: `{ type: "feature"|"bug", title: string, content: string }`. Title minimum 3 characters, maximum 200. Content maximum 50,000 characters.

### Voting

| Method | Path | Auth | Rate Limit | Description |
|---|---|---|---|---|
| POST | `/api/vote` | Required (non-admin) | Standard (30/min) | Cast, switch, or remove a vote |

**Request**: `{ post_id: number, value: -1 | 0 | 1 }`

**Vote Logic** (server-side, single route handler):
- `value === 0`: Remove existing vote if one exists, decrement `posts.upvotes` by the removed value
- `value` matches existing vote: Toggle off -- delete the vote, decrement `posts.upvotes`
- `value` differs from existing vote: Switch -- update vote value, adjust `posts.upvotes` by `value * 2` (e.g., switching from +1 to -1 decrements by 2)
- No existing vote: Insert new vote, increment `posts.upvotes` by `value`

**Response**: `{ upvotes: number }` -- authoritative vote count from the server.

### Admin

| Method | Path | Auth | Rate Limit | Description |
|---|---|---|---|---|
| POST | `/api/admin/login` | No | Strict (10/min) | Admin login against environment variables |
| GET | `/api/admin/posts` | Admin | No | List all posts with optional status filter |
| PUT | `/api/admin/posts/:id/done` | Admin | No | Mark post as done |
| PUT | `/api/admin/posts/:id/reopen` | Admin | No | Reopen a done post |
| DELETE | `/api/admin/posts/:id` | Admin | No | Delete post and associated votes/replies |
| DELETE | `/api/admin/posts/done` | Admin | No | Delete all done posts and their votes/replies |
| POST | `/api/admin/posts/:id/reply` | Admin | No | Create a reply on a post |
| PUT | `/api/admin/replies/:id` | Admin | No | Edit a reply's content |
| DELETE | `/api/admin/replies/:id` | Admin | No | Delete a reply |

**Admin Login**: Compares `username` and `password` directly against `ADMIN_USERNAME` and `ADMIN_PASSWORD` environment variables. On success, issues a JWT with `id: 0`, `email: 'admin@drclash'`, `username: 'admin'`, `is_admin: true`, and 7-day expiry.

**Admin Authorization**: Admin routes use `requireAuth` middleware with inline `user.is_admin` checks returning 403 rather than the dedicated `requireAdmin` middleware. The `requireAdmin` middleware exists in `auth.ts` but is not used by any route.

### Error Response Format

All errors return JSON with shape `{ error: string }`, optionally with a `code` field for programmatic handling.

| Status | Meaning | Common Cases |
|---|---|---|
| 400 | Bad Request | Missing fields, validation failures, invalid JSON |
| 401 | Unauthorized | Missing/expired/invalid JWT, wrong credentials |
| 403 | Forbidden | Admin token accessing user features, non-admin accessing admin routes |
| 404 | Not Found | Non-existent post ID |
| 409 | Conflict | Duplicate email/username during registration, taken username during profile update |
| 429 | Rate Limit | Exceeded request quota |
| 500 | Internal Server Error | Database failure, unexpected error |

## Authentication

### Identity Model

The application supports two distinct identity types:

1. **User Accounts**: Stored in the `users` table with email, username, password_hash (nullable for OAuth-only users), and optional oauth_google_id. JWT tokens carry `id > 0` and `is_admin: false`.

2. **Admin Identity**: Authenticated against environment variables (`ADMIN_USERNAME`, `ADMIN_PASSWORD`). Not stored in the database. JWT tokens carry `id: 0`, `email: 'admin@drclash'`, and `is_admin: true`. Completely separate from the user authentication system.

### Email/Password Authentication Flow

```
LoginComponent                  AuthService                  ApiService            Worker (Hono)
     │                             │                             │                     │
     │  submit(email, password)    │                             │                     │
     ├────────────────────────────►│                             │                     │
     │                             │  login(email, password)     │                     │
     │                             ├────────────────────────────►│                     │
     │                             │                             │  POST /api/auth/login│
     │                             │                             ├────────────────────►│
     │                             │                             │                     ├─ Lookup user by email
     │                             │                             │                     ├─ PBKDF2 verify hash
     │                             │                             │                     ├─ Sign JWT (7-day expiry)
     │                             │                             │◄────────────────────┤
     │                             │◄────────────────────────────┤                     │
     │                             │  Store token in sessionStorage                     │
     │                             │  Set user signal                                   │
     │◄────────────────────────────┤                             │                     │
```

### Google OAuth Flow

```
LoginComponent                  Browser                     Worker API              Google
     │                             │                             │                     │
     │  googleLogin()              │                             │                     │
     ├────────────────────────────►│                             │                     │
     │  window.location.href =     │                             │                     │
     │  /api/auth/google           │                             │                     │
     │                             │  GET /api/auth/google       │                     │
     │                             ├────────────────────────────►│                     │
     │                             │                             ├─ Generate UUID state
     │                             │                             ├─ Store in rate_limits table
     │                             │                             ├─ Redirect to Google   │
     │                             │◄────────────────────────────┤                     │
     │                             │  302 Redirect               │                     │
     │                             │                             │                     │
     │                             │  GET accounts.google.com    │                     │
     │                             ├──────────────────────────────────────────────────►│
     │                             │  User consents                                    │
     │                             │◄──────────────────────────────────────────────────┤
     │                             │  Redirect to callback with code + state           │
     │                             │                             │                     │
     │                             │  GET /api/auth/google/callback?code=...&state=... │
     │                             ├────────────────────────────►│                     │
     │                             │                             ├─ Validate state
     │                             │                             ├─ Exchange code for token
     │                             │                             ├─ Fetch Google user info
     │                             │                             ├─ Find or create user
     │                             │                             ├─ Sign JWT
     │                             │                             ├─ Redirect to /oauth-callback#token=<jwt>
     │                             │◄────────────────────────────┤                     │
     │                             │  302 Redirect               │                     │
     │                             │                             │                     │
     │  /oauth-callback#token=...  │                             │                     │
     │◄────────────────────────────┤                             │                     │
     │                             │                             │                     │
     OauthCallbackComponent        │                             │                     │
     ├─ Parse fragment             │                             │                     │
     ├─ Clean URL (replaceState)   │                             │                     │
     ├─ sessionStorage.setItem     │                             │                     │
     ├─ auth.initFromToken()       │                             │                     │
     └─ Navigate to /features-bug  │                             │                     │
```

### Password Reset Flow

```
Forgot Password            Worker API               Resend API           User Email
     │                         │                        │                    │
     │  POST /api/auth/        │                        │                    │
     │  forgot-password        │                        │                    │
     │  { email }              │                        │                    │
     ├────────────────────────►│                        │                    │
     │                         ├─ Lookup user by email  │                    │
     │                         ├─ Sign reset JWT        │                    │
     │                         │  (1-hour expiry)       │                    │
     │                         ├─ POST /emails          │                    │
     │                         ├───────────────────────►│                    │
     │                         │                        ├───────────────────►│
     │                         │                        │   Reset email sent │
     │◄────────────────────────┤                        │                    │
     │  { message } (same      │                        │                    │
     │   whether email exists) │                        │                    │
```

### Authorization Model

Authorization is enforced at three levels:

1. **API Middleware** (backend): Four guard functions in `auth.ts` enforce different authorization levels:
   - `requireAuth`: Any valid JWT required (401 if missing)
   - `requireAdmin`: Valid JWT with `is_admin: true` required (401 if missing, 403 if not admin)
   - `requireUserVote`: Valid JWT, non-admin required (403 for admin tokens with `id: 0`)
   - `requireUserAccount`: Valid JWT, non-admin, non-zero id required (403 for admin tokens)

2. **Inline Checks** (backend): Admin routes use `requireAuth` + inline `user.is_admin` check returning 403. The voting endpoint uses `requireUserVote` to prevent admins from voting.

3. **Conditional Rendering** (frontend): Components check `auth.user()` to conditionally render UI:
   - Vote buttons are disabled when `auth.user()` is null
   - Create post buttons are only shown when `auth.user()` is truthy
   - Admin link in nav conditionally appears when `auth.user()?.is_admin` is true
   - Admin dashboard shows login form or dashboard based on admin authentication state

### Token Lifecycle

- **Auth Tokens**: 7-day expiry (`exp + 604800`). Stored in `sessionStorage` (cleared on tab close). No refresh token mechanism -- users re-authenticate after tab close or token expiry.
- **Password Reset Tokens**: 1-hour expiry (`exp + 3600`), issued with `purpose: 'password-reset'` claim that is verified by the reset endpoint.
- **Admin Tokens**: Same 7-day expiry as user auth tokens, but with `id: 0` and `is_admin: true`.

## Data Model

### Entity Relationship Diagram

```
users (1) ──────────< (N) posts (1) ──────────< (N) votes
                                (1) ──────────< (N) replies
                              rate_limits (no direct FK relationships)
```

### Tables

#### `users`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK, AUTOINCREMENT | Unique user identifier |
| email | TEXT | UNIQUE, NOT NULL | User email address |
| username | TEXT | UNIQUE, NOT NULL | Display name (alphanumeric + hyphens + underscores) |
| password_hash | TEXT | NULLABLE | PBKDF2 hash in format `pbkdf2:100000:<salt_hex>:<hash_hex>`. Null for OAuth-only users. |
| oauth_google_id | TEXT | UNIQUE, NULLABLE | Google account ID for OAuth-linked accounts |
| is_admin | INTEGER | DEFAULT 0 | Admin flag (boolean: 0 or 1) |
| created_at | TEXT | DEFAULT datetime('now') | ISO 8601 timestamp |

#### `posts`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK, AUTOINCREMENT | Unique post identifier |
| user_id | INTEGER | NOT NULL, FK -> users(id) | Author |
| type | TEXT | CHECK('feature', 'bug') | Post category |
| status | TEXT | DEFAULT 'current', CHECK('current', 'done') | Lifecycle status |
| title | TEXT | NOT NULL | Post title (3-200 chars) |
| content | TEXT | NOT NULL | Post body (max 50,000 chars) |
| upvotes | INTEGER | DEFAULT 0 | Net vote count (denormalized for fast ordering) |
| created_at | TEXT | DEFAULT datetime('now') | ISO 8601 timestamp |

**Indexes**: `posts(status)`, `posts(type)`, `posts(upvotes DESC)`

#### `votes`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK, AUTOINCREMENT | Unique vote identifier |
| post_id | INTEGER | NOT NULL, FK -> posts(id) | Target post |
| user_id | INTEGER | NOT NULL, FK -> users(id) | Voter |
| value | INTEGER | CHECK(1, -1) | 1 = upvote, -1 = downvote |
| created_at | TEXT | DEFAULT datetime('now') | ISO 8601 timestamp |

**Constraints**: UNIQUE(post_id, user_id) -- prevents duplicate votes (enables upsert logic). **Indexes**: `votes(post_id)`, `votes(user_id)`

#### `replies`
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PK, AUTOINCREMENT | Unique reply identifier |
| post_id | INTEGER | NOT NULL, FK -> posts(id) ON DELETE CASCADE | Target post |
| content | TEXT | NOT NULL | Reply body (max 50,000 chars) |
| created_at | TEXT | DEFAULT datetime('now') | ISO 8601 timestamp |

Note: `ON DELETE CASCADE` ensures replies are automatically deleted when a post is deleted.

#### `rate_limits`
| Column | Type | Constraints | Description |
|---|---|---|---|
| key | TEXT | PK (composite) | Composite key: `{path}:{ip_hash}` or `oauth_state:{uuid}` |
| window_key | INTEGER | PK (composite) | Time window identifier (Unix timestamp / window size) |
| count | INTEGER | DEFAULT 1 | Request count in current window |
| expires_at | INTEGER | NOT NULL | Unix timestamp for expiration cleanup |

**Index**: `rate_limits(expires_at)`

The `rate_limits` table serves a dual purpose:
1. **Rate limiting**: Composite key `({path}:{ip_hash}, windowKey)` tracks request counts per endpoint per IP per time window
2. **OAuth state storage**: Key `oauth_state:{uuid}` with `window_key=0` stores OAuth state parameters temporarily (300s expiry)

### Data Lifecycle

1. **Registration**: INSERT into `users` with email, username, password_hash (or oauth_google_id for OAuth). Username uniqueness is enforced server-side with a separate check query.

2. **Post Creation**: INSERT into `posts` with user_id, type, status='current', upvotes=0. The newly created post is immediately fetched and returned with author username.

3. **Voting**: INSERT/UPSERT/DELETE on `votes` table with corresponding UPDATE on `posts.upvotes`. The `upvotes` column on `posts` is a denormalized counter updated atomically within the same transaction by the same endpoint. Vote value is restricted to 1 (up) or -1 (down); value 0 on the API triggers the "remove vote" code path.

4. **Post Completion**: Admin sets `posts.status = 'done'`. Posts remain visible with a "Done" type badge and green border-top.

5. **Admin Replies**: INSERT into `replies`. Replies are fetched alongside posts in a batch query. No user association -- replies are implicitly from admin (no author column).

6. **Account Deletion**: Manual cascade in three DELETE operations:
   - DELETE votes WHERE user_id = ?
   - DELETE votes WHERE post_id IN (SELECT id FROM posts WHERE user_id = ?)
   - DELETE posts WHERE user_id = ?
   - DELETE users WHERE id = ?

7. **Bulk Clear Done**: Manual cascade:
   - DELETE votes WHERE post_id IN (SELECT id FROM posts WHERE status = 'done')
   - DELETE replies WHERE post_id IN (SELECT id FROM posts WHERE status = 'done')
   - DELETE posts WHERE status = 'done'

### Migration Strategy

Migrations are sequential SQL files in `workers/migrations/`:
- `0001_initial.sql` -- Foundation schema (users, posts, votes) with indexes
- `0002_rate_limit.sql` -- Adds rate_limits table for rate limiting and OAuth state
- `0003_replies.sql` -- Adds replies table for admin responses (ON DELETE CASCADE)

Applied via `wrangler d1 migrations apply drclash-db` (or with `--local` for local development). Existing migrations should never be modified after production application.

## Configuration

### `wrangler.toml` (`workers/wrangler.toml`)

Cloudflare Workers configuration specifying:
- Worker name: `drclash-api`
- Entry point: `src/index.ts`
- Compatibility date: `2025-01-01`
- D1 database binding: `DB` -> database name `drclash-db` with a specific database ID
- Public environment variables: `APP_URL`, `RESEND_SENDER_EMAIL`, `GOOGLE_CALLBACK_URL`

Sensitive values (`JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`) are excluded from `wrangler.toml` and set via `wrangler secret put`.

### `angular.json` (root)

Angular CLI configuration using the application builder (`@angular/build:application`):
- Browser entry: `src/main.ts`
- Assets: `public/` directory served from root
- Styles: `src/styles.css`
- Production budgets: 500kB initial warning, 1MB initial error, 6kB per component style warning, 8kB error
- Output hashing enabled for production cache busting

### `vercel.json` (root)

Minimal Vercel configuration: only sets the project name to `drclash`. No rewrites, redirects, or headers configured.

### `tsconfig.json` (root)

Strict TypeScript configuration: `strict: true`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `skipLibCheck`, `isolatedModules`, `target: ES2022`, `module: preserve`. Angular compiler options enforce `strictInjectionParameters`, `strictInputAccessModifiers`, and `strictTemplates`.

## Environment Variables

All environment variables are consumed by the Cloudflare Workers backend through typed bindings in `workers/src/index.ts` (the `Bindings` interface). The frontend references no environment variables -- the API base URL is hardcoded in `api.service.ts`.

| Variable | Required | Purpose | Consumer | Sensitive |
|---|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Yes | Cloudflare API authentication for Wrangler | Wrangler CLI | Yes |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Cloudflare account identifier | Wrangler CLI | Yes |
| `JWT_SECRET` | Yes | HS256 signing key for all JWT tokens (auth + password reset) | Worker `index.ts` | Yes |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth 2.0 client identifier | Worker `index.ts` | Yes |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth 2.0 client secret | Worker `index.ts` | Yes |
| `GOOGLE_CALLBACK_URL` | Yes | OAuth redirect URI registered with Google | Worker `index.ts` | No (public) |
| `RESEND_API_KEY` | Yes | API key for Resend transactional email service | Worker `index.ts` | Yes |
| `RESEND_SENDER_EMAIL` | Yes | From address for password reset emails | Worker `index.ts` | No (public) |
| `ADMIN_USERNAME` | Yes | Admin panel login username | Worker `index.ts` | Yes |
| `ADMIN_PASSWORD` | Yes | Admin panel login password | Worker `index.ts` | Yes |
| `APP_URL` | Yes | Frontend origin (used for CORS and redirect URLs) | Worker `index.ts` | No |

`GOOGLE_CALLBACK_URL`, `RESEND_SENDER_EMAIL`, and `APP_URL` are stored as plain `[vars]` in `wrangler.toml`. The remaining sensitive values are set via `wrangler secret put` and are not committed to version control.

## Dependencies

### Internal Module Dependency Graph

```
AppComponent
├── NavComponent ──────────> AuthService ──────> ApiService
├── RouterOutlet ──────────> [Lazy-loaded routes]
│   ├── HomeComponent ─────> AnimateOnScrollDirective
│   ├── FeaturesBugComponent ──> ApiService, AuthService
│   ├── LoginComponent ────> ApiService, AuthService
│   ├── AdminComponent ────> ApiService, AuthService
│   ├── OauthCallbackComponent ──> AuthService
│   ├── ResetPasswordComponent ──> ApiService
│   ├── PrivacyPolicyComponent ──> AnimateOnScrollDirective
│   └── TermsConditionsComponent ──> AnimateOnScrollDirective
├── FooterComponent
└── GoToTopComponent
```

**Key Dependency Characteristics**:
- `NavComponent` depends on `AuthService` but not `ApiService` directly (delegates HTTP calls through AuthService)
- `FeaturesBugComponent` depends on both `ApiService` (for posts/votes) and `AuthService` (for user state for conditional UI)
- `AdminComponent` depends on both services -- uses AuthService for admin login state, ApiService for all admin operations
- `LoginComponent` depends on both services -- uses AuthService for user login, ApiService for registration and password reset
- Legal pages and home page only depend on `AnimateOnScrollDirective` from shared

### Key External Dependencies

**`@angular/core` 21.2**: Provides the entire Angular framework -- standalone component bootstrap via `bootstrapApplication`, signals (`signal()`, `computed()`), dependency injection (`inject()`), `@Component` decorator, `@HostListener`, `ApplicationConfig`.

**`@angular/router` 21.2**: Client-side routing with lazy loading via `loadComponent`, `RouterOutlet`, `RouterLink`, `RouterLinkActive` directives for navigation.

**`@angular/forms` 21.2**: Template-driven forms via `FormsModule` and `[(ngModel)]` two-way binding. Used in login, registration, admin, features-bug submission, and profile editing.

**`@angular/platform-browser/animations` 21.2**: Animation module provider (`provideAnimations()`) registered in app config but no custom Angular animations are implemented.

**`@angular/build` 21.2**: Build tooling replacing the legacy `@angular-devkit/build-angular`. Uses esbuild-based application builder.

**`hono` 4.6**: Lightweight TypeScript web framework optimized for edge runtimes. Provides routing, context management, middleware stacking, and JWT signing/verification (`hono/jwt`). The entire API surface is Hono's route definitions.

**`wrangler` 3.80**: Cloudflare Workers CLI for local development (`wrangler dev`), deployment (`wrangler deploy`), and D1 migration management.

**`vitest` 4.0 / `jsdom` 28.0**: Unit testing dependencies -- configured in `tsconfig.spec.json` but no test files exist in the codebase.

## Application Workflow

### Complete User Visit Lifecycle

1. Browser requests the application at `<frontend_url>`.
2. Vercel serves `index.html` which includes Google Fonts preconnect links (Archivo Black, Work Sans, Space Mono).
3. Angular bootstraps from `main.ts` via `bootstrapApplication(App, appConfig)`.
4. The `App` component renders immediately with the nav, empty router outlet, footer, and go-to-top button.
5. `AuthService` constructor fires `loadUser()`:
   - Reads `sessionStorage` for an existing JWT token
   - If no token: sets `loading` to false, `user` remains null
   - If token found: calls `GET /api/auth/me`, populates `user` signal on success or clears token on failure
6. Router resolves `/` to `HomeComponent` (lazy-loaded via `loadComponent`).
7. `HomeComponent` renders the hero section with the `animateOnScroll` directive, which immediately adds `is-visible` (hero is likely in the viewport).
8. Feature cards below use staggered `transition-delay` values (0ms, 80ms, 160ms, 240ms, 320ms, 400ms) for sequential fade-in animations.
9. `NavComponent` checks `auth.user()` -- if null, shows "Login" button; if user exists, shows "Hello, {username}" button.

### Voting Lifecycle

1. User clicks the "+" (upvote) button on a post card.
2. `FeaturesBugComponent.vote(postId, value)` executes:
   - Guard: returns early if `auth.user()` is null (button should be disabled, but safeguard exists)
   - Guard: returns early if `pendingVotes` Set already contains `postId` (prevents duplicate concurrent requests)
   - If `post.user_vote === value`, sets value to 0 (toggle-off behavior)
   - Captures `prev` state: `{ upvotes, user_vote }` for rollback
   - Computes optimistic delta:
     - `value === 0`: delta = `-(prev.user_vote ?? 0)` (remove existing vote)
     - `prev.user_vote` exists but differs: delta = `value * 2` (switch vote direction)
     - No existing vote: delta = `value` (new vote)
   - Optimistically updates `posts` signal: `upvotes = Math.max(0, p.upvotes + delta)`, `user_vote = value === 0 ? null : value`
   - Adds `postId` to `pendingVotes`
   - Sends POST to `/api/vote` with `{ post_id, value }`
3. Server processes vote logic (insert/update/delete on votes, adjust posts.upvotes via SQL).
4. Server returns authoritative `{ upvotes }`.
5. On success: replaces optimistic value with server value in `posts` signal.
6. On failure: reverts to captured `prev` state.
7. Removes `postId` from `pendingVotes`.

### Admin Management Lifecycle

1. Admin navigates to `/admin`.
2. `AdminComponent.ngOnInit()` checks `auth.user()?.is_admin`. If false, renders login form. If true, calls `loadPosts()`.
3. Admin enters credentials, clicks Login.
4. `auth.adminLogin()` calls `POST /api/admin/login`, server compares against env vars, returns JWT with `id: 0`, `is_admin: true`.
5. Admin dashboard renders with table of all posts.
6. Each row shows: ID, type badge, title, author, vote count, status badge, action buttons (Done/Reopen, Delete), and reply management (inline create/edit/delete).
7. Marking done: `PUT /api/admin/posts/:id/done` sets `status = 'done'`. Posts reload.
8. Bulk clear: `DELETE /api/admin/posts/done` deletes all done posts, their votes, and their replies in three sequential queries.
9. Replies are managed inline: input field per post, Enter or Send button creates reply via `POST /api/admin/posts/:id/reply`. Existing replies show Edit/Delete buttons. Edit mode replaces content with input field + Save/Cancel.

## Performance Considerations

- **Lazy-loaded routes**: Every page is a separate JavaScript chunk loaded on demand via `loadComponent`. The initial payload contains only the shell (nav, footer) and the first route's code.
- **Cursor-based pagination**: Keyset pagination uses the last post ID as cursor instead of `OFFSET`. This avoids the offset drift problem where inserted/deleted records shift page boundaries.
- **Optimistic voting**: Vote UI updates immediately (within the same synchronous execution context) without waiting for server confirmation. Server response authoritatively corrects the optimistic value.
- **Cache headers**: Post list responses include `Cache-Control: public, max-age=30, s-maxage=60`, enabling CDN-level caching for 30 seconds.
- **IntersectionObserver**: Scroll animations use the native IntersectionObserver API instead of scroll event listeners. Avoids main thread pressure from scroll event handlers.
- **Batch reply fetching**: When loading a page of posts, replies are fetched in a single batched query using `WHERE post_id IN (...)`, avoiding N+1 queries.
- **Database indexes**: Six indexes on query-critical columns: `posts(status)`, `posts(type)`, `posts(upvotes DESC)`, `votes(post_id)`, `votes(user_id)`, `rate_limits(expires_at)`.
- **Go-to-top visibility**: Uses scroll event listener but only reads `window.scrollY`, avoiding layout thrashing from forced reflows.

## Security Considerations

- **Password hashing**: PBKDF2 with 100,000 iterations of SHA-256 and per-password random 16-byte salt. Hash stored in format `pbkdf2:100000:<salt_hex>:<hash_hex>`.
- **Constant-time comparison**: Password verification uses XOR-based constant-time string comparison (`constantTimeEqual`) to prevent timing side-channel attacks.
- **JWT signing**: All tokens signed with HS256 using `hono/jwt`. Auth tokens have 7-day expiry. Password reset tokens have 1-hour expiry with a `purpose` claim.
- **Token storage**: JWT stored exclusively in `sessionStorage` (cleared on browser tab close), not `localStorage` (which persists across sessions).
- **IP hashing**: Rate limiter computes SHA-256 hash of client IP (truncated to 16 hex characters). Raw IPs are never committed to storage.
- **Authorization guards**: Four distinct middleware guard functions enforce separation between admin and user capabilities. Admin tokens cannot vote, create posts, update profiles, or delete accounts.
- **Input validation**: All user inputs validated server-side: email format (regex), username charset/length (2-30, alphanumeric + hyphens + underscores), password length (minimum 6), post title/content length (3-200 / 50,000 max), vote values (-1, 0, 1).
- **SQL injection prevention**: All database queries use D1 parameterized prepared statements (`.bind()` method). No string concatenation of user input into SQL queries.
- **Security headers**: `X-Frame-Options: DENY` (prevents clickjacking), `X-Content-Type-Options: nosniff` (prevents MIME sniffing), `Referrer-Policy: strict-origin-when-cross-origin`, `X-XSS-Protection: 0` (modern browsers ignore this, but included).
- **CORS restriction**: `Access-Control-Allow-Origin` set to the `APP_URL` environment variable value, not a wildcard. This restricts cross-origin requests to the known frontend origin.
- **Forgot password info leak prevention**: Same generic response message returned regardless of whether the email exists in the database: `"If this email is registered, a reset link has been sent."`.
- **OAuth CSRF protection**: Google OAuth flow generates a cryptographically random UUID state parameter stored in the `rate_limits` table with 300-second expiry. The callback validates this state before exchanging the authorization code.
- **Admin credentials isolation**: Admin credentials are stored as Cloudflare Workers secrets (environment variables), never in the database. Separate from the user authentication system with no shared infrastructure.
- **Account deletion completeness**: Account deletion manually cascades through four DELETE operations covering the user's votes, votes on the user's posts, the user's posts, and finally the user record.

## Deployment Architecture

```
┌──────────────────────┐       ┌──────────────────────────────┐
│  Vercel              │       │  Cloudflare Workers          │
│  ┌────────────────┐  │       │  ┌────────────────────────┐  │
│  │ Angular SPA    │  │ HTTPS │  │ Hono API (drclash-api) │  │
│  │ (drclash)      │◄─┼───────┼─►│ src/index.ts           │  │
│  │                │  │       │  │                        │  │
│  │ Static files   │  │       │  │ Middleware stack       │  │
│  │ Build: dist/   │  │       │  └───────────┬────────────┘  │
│  └────────────────┘  │       │              │               │
└──────────────────────┘       │              │ D1 Binding    │
                               │              ▼               │
                               │  ┌────────────────────────┐  │
                               │  │ Cloudflare D1 (SQLite) │  │
                               │  │ drclash-db             │  │
                               │  └────────────────────────┘  │
                               └──────────────────────────────┘

Environment variables (secrets) ──> wrangler secret put
D1 schema management ───────────> wrangler d1 migrations apply
```

**Frontend Deployment**: Angular application built with `ng build` (production mode triggers output hashing for cache busting) and deployed to Vercel. The `vercel.json` configuration only specifies the project name.

**Backend Deployment**: Cloudflare Worker deployed via `wrangler deploy`. The worker is named `drclash-api` and runs on Cloudflare's edge network. Sensitive environment variables are configured via `wrangler secret put` rather than in `wrangler.toml`. Database schema is managed through sequential SQL migration files applied via `wrangler d1 migrations apply`.

**Database**: Cloudflare D1 is a serverless SQLite database. It is accessed through the `DB` binding injected into the Worker runtime. No connection pooling, no replication configuration -- D1 handles this transparently.

**CORS**: The backend sets `Access-Control-Allow-Origin` to the `APP_URL` environment variable value. This allows the frontend on Vercel to make cross-origin requests to the Workers backend.

## CI/CD

Not detected in the current implementation. No GitHub Actions workflows, no CI configuration files, no deployment pipeline configuration exists within the repository. The `.gitignore` file does include `.vercel/` suggesting Vercel may handle automatic deployments from the repository, but no explicit CI/CD configuration is present in the repository.

## Engineering Decisions

### Why a Serverless Backend (Cloudflare Workers + D1)

The backend uses Cloudflare Workers with D1 (serverless SQLite) instead of a traditional server-hosted database. This eliminates infrastructure management -- no server provisioning, no connection pooling, no replication configuration, no OS patching. The Worker scales to zero when idle and cold-starts on demand. D1 provides ACID-compliant SQLite semantics without requiring a persistent connection. This architecture is well-suited for a low-to-medium traffic feedback portal where request volume is unpredictable.

### Why Flat Route Handlers Instead of Layered Architecture

The backend (`workers/src/index.ts`) implements all business logic directly in 854-line single file without controllers, services, or repositories. This is an intentional simplicity tradeoff: for the application's scope (5 database tables, ~20 endpoints), the overhead of layered abstractions would introduce complexity without proportional benefit. The tradeoff becomes limiting as the application grows -- adding features or endpoints directly increases the module's size and reduces maintainability.

### Why Signal-Based State (Angular) Instead of a State Management Library

The frontend uses Angular's built-in `signal()` API for reactive state rather than adopting NgRx, Akita, or other state management libraries. Signals are distributed across components (no centralized store) -- each component owns its own signal state. The `AuthService`'s user signal is the only shared reactive state. This keeps the architecture simple for the application's moderate complexity but means there is no single source of truth for data, no devtools for debugging state changes, and no built-in side-effect management.

### Why Cursor Pagination Instead of Offset Pagination

The post feed uses keyset (cursor) pagination with the last post ID as the cursor. This avoids the offset drift problem: with offset pagination, inserting or deleting records shifts page boundaries, potentially causing users to miss or see duplicate items. Cursor pagination provides a stable view regardless of concurrent writes. The tradeoff is that cursor pagination cannot support arbitrary page jumps (e.g., "Go to page 5").

### Why Optimistic Updates for Voting

Vote UI updates immediately without waiting for server confirmation. This provides instant feedback to the user -- critical for a high-frequency interaction like voting. The tradeoff is potential visual glitches if the server rejects the vote (reverted on error) or if the authoritative count differs from the optimistic projection (corrected when the server response arrives). The `pendingVotes` Set prevents duplicate concurrent requests.

### Why sessionStorage Instead of localStorage

JWT tokens are stored in `sessionStorage`, which is cleared when the browser tab closes. This means the user must re-authenticate on every new session. This is a security-conscious tradeoff: `sessionStorage` is isolated per-tab and does not persist to disk, reducing the risk of token theft from XSS or physical device access. The tradeoff is user convenience -- closing and reopening the browser requires re-login.

### Why No Refresh Tokens

The application uses single JWT tokens with 7-day expiry and provides no refresh token mechanism. Users must re-authenticate when the token expires. This simplifies the architecture (no refresh token rotation, no token storage strategy beyond `sessionStorage`) at the cost of UX -- an active user session terminates after 7 days regardless of activity.

### Why No Email Verification

User registration does not require email verification -- any valid email format can register. This removes friction from the onboarding flow. The tradeoff is that accounts can be created without proving email ownership, which may lead to spam accounts or user confusion about feature notifications. The forgot-password flow is available for users who need to set a password on OAuth-only accounts.

### Why PBKDF2 Instead of bcrypt/Argon2

The Web Crypto API (available in Cloudflare Workers) provides native PBKDF2 implementation. Bcrypt and Argon2 require external libraries which add bundle size and may not be available in the Workers runtime. PBKDF2 with 100,000 iterations of SHA-256 provides reasonable password stretching for this application's security requirements. The tradeoff is that PBKDF2 is more susceptible to GPU-based brute force than memory-hard functions like Argon2.

### Why the `rate_limits` Table Serves Dual Purpose

The `rate_limits` table stores both rate limit counters and OAuth state parameters. This avoids creating a separate table for temporary state storage. The OAuth state entries use `key` prefix `oauth_state:` and `window_key = 0`, distinguishing them from rate limit entries. Both types of data have natural expiry (rate limit windows expire; OAuth states have 300-second TTL). A periodic cleanup query could remove expired rows.

## Interesting Implementation Details

### PBKDF2 Password Hashing (Web Crypto API)

The `pbkdf2Hash` function generates a 16-byte cryptographically random salt using `crypto.getRandomValues()`, derives 256 bits using PBKDF2 with SHA-256 and 100,000 iterations, and returns a self-describing string format: `pbkdf2:100000:<salt_hex>:<hash_hex>`. The `pbkdf2Compare` function parses this format to extract the salt and iterations, re-derives the hash from the provided password, and compares using constant-time XOR.

### Constant-Time String Comparison

The `constantTimeEqual` function prevents timing side-channel attacks on password verification. Standard string comparison (`===`) short-circuits on the first differing character, allowing an attacker to measure the comparison time and iteratively determine the correct hash. The constant-time implementation XORs every character and checks the final result, ensuring all operations take the same duration regardless of how many characters match.

### Vote Delta Computation

The vote logic uses a mathematically clean approach for adjusting the denormalized `upvotes` counter:
- **New vote** (no existing vote): `posts.upvotes += value` (+1 or -1)
- **Remove vote** (value = 0 or same value clicked again): `posts.upvotes -= existing_value` (reverses the original change)
- **Switch vote** (different value): `posts.upvotes += value * 2` (removes the old vote's contribution and adds the new one in a single operation)

This avoids a two-step read-adjust-write cycle.

### Batch Reply Fetching Pattern

When loading a page of posts with replies, the backend first queries the posts, then constructs a dynamic `WHERE post_id IN (?, ?, ...)` query with parameterized placeholders. This fetches all replies for the current page in a single database round-trip instead of N+1 queries. The replies are then grouped by `post_id` in a `Record<number, Reply[]>` map and attached to their respective posts before serialization.

### Rate Limiter IP Privacy

The rate limiter hashes the client IP using SHA-256 and truncates to 16 hex characters (64 bits). This provides a privacy-preserving rate limit key: the truncated hash cannot be reversed to recover the original IP, but provides sufficient collision resistance for rate-limiting purposes. The hash uses the full SHA-256 digest before truncation, not a reduced-round variant.

### Admin Token Separation

Admin tokens use `id: 0`, which has no corresponding row in the `users` foreign key table. This makes admin tokens structurally incompatible with user features (they would fail FK constraints on INSERT). The `requireUserVote` and `requireUserAccount` guards provide an additional software layer of separation on top of this database-level incompatibility.

### OAuth State Storage in `rate_limits` Table

The Google OAuth flow stores the anti-CSRF state parameter as a row in the `rate_limits` table with key `oauth_state:<uuid>`, `window_key = 0`, and 300-second expiry. This reuses an existing table rather than adding a dedicated OAuth state table. The UUID is generated via `crypto.randomUUID()` (standard Web Crypto API). After successful exchange, the state row is deleted. If the state parameter is reused or expired, the callback returns a 400 error.

## License

Copyright (c) 2026 Babariya Meet. All rights reserved.

No permission is granted to use, copy, modify, merge, publish, distribute, sublicense, create derivative works from, reference, reverse engineer for replication, or otherwise exploit this project, in whole or in part, for any purpose without prior written permission from the copyright holder.
