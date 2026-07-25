# AI Generated Documentation

This documentation was generated through static analysis of the project's source code.

It represents the implementation at the time it was generated and may become outdated as the project evolves.

Always treat the source code as the ultimate source of truth.

---

# Dr.Clash

A community-driven feature request and bug tracking platform for Clash of Clans companion app.

---

## Purpose

Dr.Clash exists to serve as the public feedback hub for a Clash of Clans companion mobile application. It allows users to submit feature requests and bug reports, vote on existing submissions, and allows administrators to track, respond to, and mark work as completed. The platform replaces opaque feedback channels with a transparent, vote-driven prioritization system.

The companion mobile app itself (upgrade tracker, base layouts, army planner, stats, mini-games, home screen widgets) is not included in this repository. This repository contains only the web-based feedback portal and its API backend.

Intended audience: end users of the Dr.Clash mobile app, community moderators, and project administrators.

---

## Highlights

- **Serverless backend**: Entire API runs on Cloudflare Workers with D1 SQLite database -- zero infrastructure management
- **Vote-driven prioritization**: Community upvote/downvote system with optimistic UI updates and server reconciliation
- **Dual auth strategies**: Email/password with PBKDF2 hashing alongside Google OAuth integration
- **Rate-limited by design**: Per-endpoint, per-IP windowed rate limiting on auth and submission endpoints
- **Editorial design system**: VoiceBox -- a high-contrast, magazine-style, zero-border-radius visual language
- **Lazy-loaded architecture**: All routes use Angular 17+ `loadComponent` for code-split delivery

---

## Features

- **Feature/Bug Board**: Public feed of user-submitted feature requests and bug reports with type-based filtering
- **Voting System**: Authenticated upvote/downvote with toggle-off, optimistic state, and server-side correction
- **User Authentication**: Email/password registration, Google OAuth, JWT-based session management
- **Password Reset**: Email-based reset flow via Resend API with expiring JWT tokens
- **Admin Dashboard**: Separate admin authentication (env var credentials), post management (mark done, reopen, delete), reply management (create, edit, delete), bulk clear of completed items
- **Profile Management**: In-app username editing, full account deletion with cascade of all associated data
- **Cursor-based Pagination**: Infinite scroll on the post feed via keyset pagination
- **Responsive Layout**: Full mobile responsiveness with hamburger navigation, adaptive grids, and mobile-first CSS
- **Scroll-triggered Animations**: IntersectionObserver-based fade-in animations on landing and legal pages
- **Go-to-Top Button**: Fixed-position scroll-to-top button appearing after scroll threshold
- **Legal Pages**: Privacy Policy and Terms & Conditions pages with markdown-style content

---

## Technical Overview

Dr.Clash is split into two independently deployable units:

**Frontend** is an Angular 21 single-page application using standalone components (no NgModules). Every route is lazy-loaded via `loadComponent`. The app communicates with the backend exclusively through a REST API client (`ApiService`). Authentication state is managed by `AuthService` using signals, with the JWT token stored in `sessionStorage`. The visual layer follows the VoiceBox design system -- a strict editorial aesthetic with no rounded corners, no shadows, black/white palette with a single red accent per viewport.

**Backend** is a Cloudflare Workers application built on the Hono framework. It uses D1 (Cloudflare's serverless SQLite database) for persistence, JWT for stateless authentication, and the Web Crypto API for PBKDF2 password hashing. The API follows a flat route structure under `/api/` with middleware handling CORS, security headers, JWT verification, and rate limiting. Admin functionality is gated behind a separate credential check against environment variables.

The frontend is deployed on Vercel. The backend is deployed as a Cloudflare Worker with its database managed through D1 migrations.

---

## Tech Stack

| Category | Technology |
|---|---|
| **Language** | TypeScript 5.9 |
| **Frontend Framework** | Angular 21.2 (standalone components) |
| **Backend Runtime** | Cloudflare Workers |
| **Backend Framework** | Hono 4.6 |
| **Database** | Cloudflare D1 (SQLite) |
| **Auth** | JWT (HS256), PBKDF2 (100k iterations, SHA-256), Google OAuth 2.0 |
| **Email** | Resend API |
| **Build Tool** | Angular CLI / esbuild (via `@angular/build`) |
| **Testing** | Vitest 4, jsdom 28 |
| **Code Quality** | TypeScript strict mode, Prettier |
| **Deployment (Frontend)** | Vercel |
| **Deployment (Backend)** | Cloudflare Workers (Wrangler) |
| **Package Manager** | npm 11 |
| **HTTP Client** | Native `fetch` (Angular) |
| **Design System** | VoiceBox (custom, see DESIGN.md) |

---

## Project Structure

```
dist-drclash/
├── public/                          # Static assets served from root
│   ├── app-icon.png                 # App icon / favicon
│   ├── favicon.ico
│   ├── app-store.svg                # App Store badge
│   └── google-play.svg              # Google Play badge
├── src/
│   ├── index.html                   # Entry HTML with Google Fonts preconnect
│   ├── main.ts                      # Angular bootstrap
│   ├── styles.css                   # Global reset, body, selection
│   └── app/
│       ├── app.config.ts            # Application config (router, animations, error handlers)
│       ├── app.routes.ts            # All route definitions with lazy loading
│       ├── app.ts                   # Root component (nav + router-outlet + footer + go-to-top)
│       ├── app.html                 # Root template
│       ├── app.css                  # Root layout (flex column, min-height)
│       ├── core/
│       │   └── services/
│       │       ├── api.service.ts   # HTTP client wrapping fetch to Workers API
│       │       └── auth.service.ts  # Authentication state (signal-based), token management
│       ├── features/
│       │   ├── home/                # Landing page with hero, feature cards, app store links
│       │   ├── features-bug/        # Feature/bug request board with voting and filtering
│       │   ├── login/               # Login/register form, Google OAuth, forgot password
│       │   ├── admin/               # Admin dashboard: post/reply management, bulk operations
│       │   ├── oauth-callback/      # OAuth redirect handler (token from URL fragment)
│       │   ├── reset-password/      # Password reset form (token from query param)
│       │   ├── privacy-policy/      # Privacy policy legal page
│       │   └── terms-conditions/    # Terms & conditions legal page
│       ├── layout/
│       │   ├── nav/                 # Sticky nav bar, hamburger menu, profile modal
│       │   └── footer/              # Site footer with navigation links
│       └── shared/
│           ├── components/
│           │   ├── coming-soon.component.ts   # Placeholder for unimplemented routes
│           │   └── go-to-top.component.ts     # Scroll-to-top FAB
│           └── directives/
│               └── animate-on-scroll.directive.ts  # IntersectionObserver fade-in
├── workers/                         # Cloudflare Workers backend
│   ├── wrangler.toml                # Worker config, D1 binding, env vars
│   ├── package.json                 # Backend dependencies
│   ├── tsconfig.json                # Workers TypeScript config
│   ├── migrations/
│   │   ├── 0001_initial.sql         # Users, posts, votes tables + indexes
│   │   ├── 0002_rate_limit.sql      # rate_limits table for rate limiting + OAuth state
│   │   └── 0003_replies.sql         # replies table for admin responses
│   └── src/
│       ├── index.ts                 # Main Hono app: all route handlers, auth, helpers
│       ├── db/
│       │   └── types.ts             # TypeScript interfaces for DB rows
│       └── middleware/
│           ├── auth.ts              # JWT verification, requireAuth, requireAdmin guards
│           └── rate-limit.ts        # Per-IP windowed rate limiting middleware
├── DESIGN.md                        # Complete VoiceBox design system specification
├── AGENTS.md                        # AI coding assistant guidelines
├── angular.json                     # Angular CLI configuration
├── tsconfig.json                    # Root TypeScript config (strict mode)
├── tsconfig.app.json                # App-specific TS config
├── tsconfig.spec.json               # Test-specific TS config (vitest globals)
├── vercel.json                      # Vercel deployment config
├── .env.example                     # Environment variable template
├── .editorconfig                    # Editor settings
├── .prettierrc                      # Prettier config (single quotes, 100 width)
└── package.json                     # Frontend dependencies and scripts
```

---

## Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────┐
│  Browser (Angular SPA)                              │
│  ┌──────────┐ ┌──────────┐ ┌─────────────────────┐ │
│  │ Nav      │ │ Router   │ │ GoToTop / Footer    │ │
│  │ Component│ │ Outlet   │ │ Components          │ │
│  └──────────┘ └──────────┘ └─────────────────────┘ │
│       │              │                              │
│       ▼              ▼                              │
│  ┌─────────────────────────────────────────────┐    │
│  │ AuthService (signal-based user state)       │    │
│  │ ApiService (fetch-based HTTP client)        │    │
│  └─────────────────────────────────────────────┘    │
│                        │                             │
└────────────────────────┼────────────────────────────┘
                         │ HTTPS / REST
                         ▼
┌─────────────────────────────────────────────────────┐
│  Cloudflare Workers (Hono)                          │
│  ┌──────────┐ ┌──────────┐ ┌─────────────────────┐ │
│  │ CORS     │ │ JWT      │ │ Rate Limiting       │ │
│  │ Middleware│ │ Verify   │ │ Middleware          │ │
│  └──────────┘ └──────────┘ └─────────────────────┘ │
│       │              │              │               │
│       ▼              ▼              ▼               │
│  ┌─────────────────────────────────────────────┐    │
│  │ Route Handlers                               │    │
│  │ /api/auth/*   /api/posts/*                   │    │
│  │ /api/vote     /api/admin/*                   │    │
│  └─────────────────────────────────────────────┘    │
│                        │                             │
└────────────────────────┼────────────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  Cloudflare D1      │
              │  (SQLite Database)  │
              │  users / posts      │
              │  votes / replies    │
              │  rate_limits        │
              └─────────────────────┘
```

### Frontend Architecture

The Angular application follows a strict feature-based module structure with standalone components:

- **`core/`**: Singleton services (`ApiService`, `AuthService`) that are shared across the application
- **`layout/`**: Shell components (`NavComponent`, `FooterComponent`) rendered outside the router outlet for persistence
- **`features/`**: One folder per route, each containing a single lazy-loaded component
- **`shared/`**: Reusable building blocks (`AnimateOnScrollDirective`, `GoToTopComponent`, `ComingSoonComponent`)

The router is configured in `app.routes.ts` with every route using `loadComponent` for code splitting. The root `App` component eagerly imports layout and shared components, which themselves only import from `core/` or Angular framework modules.

All components use signal-based state management (`signal()`, `computed()`) instead of class properties for reactive state. Two-way data binding in forms uses `[(ngModel)]` from `FormsModule`.

### Backend Architecture

The Hono application uses a flat route structure with middleware stacking:

1. **CORS Middleware** (global): Sets permissive CORS headers for the frontend origin, preflight handling
2. **JWT Middleware** (`/api/*`): Attempts to decode Bearer tokens on every API request, populating `c.get('user')` if valid
3. **Security Headers Middleware** (global): Sets `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `X-XSS-Protection`
4. **Rate Limit Middleware** (selected routes): Applies to auth endpoints (10 req/min) and posts/vote endpoints (30 req/min)

Route handlers perform input validation, database operations via D1 prepared statements, and return JSON responses.

### Authentication Flow

**Email/Password**: User submits credentials -> Worker looks up user, verifies PBKDF2 hash -> issues JWT (7-day expiry) -> frontend stores in `sessionStorage`

**Google OAuth**: User clicks "Continue with Google" -> redirected to Google -> callback receives authorization code -> Worker exchanges for access token -> fetches Google user info -> finds or creates user -> redirects to frontend with JWT in URL fragment

**Token-based session**: JWT is sent as `Authorization: Bearer <token>` header on every API request. The `jwtVerify` middleware decodes it and attaches the user payload to the request context. The `requireAuth` guard rejects unauthenticated requests. `requireUserAccount` additionally prevents admin tokens (which have `id=0`) from accessing user-specific features.

### Data Flow (Voting)

1. User clicks vote button (up or down)
2. `FeaturesBugComponent.vote()` runs: checks auth, guards against duplicate clicks, computes optimistic delta
3. Optimistic update applied immediately to local post list
4. `ApiService.vote()` sends POST to `/api/vote` with `{ post_id, value }`
5. Server processes: upserts vote record, adjusts post upvotes count
6. Server returns authoritative `upvotes` count
7. On success: replaces optimistic value with server value
8. On failure: reverts optimistic update to previous state

---

## Core Components

### Frontend

#### `AuthService` (`src/app/core/services/auth.service.ts`)
- **Purpose**: Singleton managing authentication state across the application
- **State**: `user` signal (User | null), `loading` signal (boolean)
- **Storage**: JWT token in `sessionStorage` (cleared on tab close)
- **Methods**: `login()`, `adminLogin()`, `initFromToken()`, `loadUser()`, `updateProfile()`, `deleteAccount()`, `logout()`
- **Initialization**: Calls `loadUser()` in constructor to restore session from stored token on app load

#### `ApiService` (`src/app/core/services/api.service.ts`)
- **Purpose**: Typed HTTP client wrapping native `fetch` with JWT header injection
- **Base URL**: `https://drclash-api.babarmeet86.workers.dev`
- **Methods**: Typed wrappers for all API endpoints — auth, posts, voting, admin, replies
- **Error handling**: Parses JSON error responses, extracts `error` field and optional `code` field into thrown Error

#### `FeaturesBugComponent` (`src/app/features/features-bug/`)
- **Purpose**: Main feature/bug request board with voting, filtering, and submission
- **State**: `posts` signal array, `activeFilter` signal, `showForm` signal
- **Filtering**: All / Features / Bugs / Done — each reloads from API with type/status params
- **Pagination**: Cursor-based "Load More" with `nextCursor` from API response
- **Voting**: Optimistic updates with rollback on failure, pending vote guard (`pendingVotes` Set)
- **Content truncation**: Posts longer than 200 characters are truncated with "Read more" expand

#### `AdminComponent` (`src/app/features/admin/`)
- **Purpose**: Administrative dashboard for managing posts and replies
- **Auth**: Separate admin login against environment variables (not user accounts)
- **Operations**: Mark done, reopen, delete posts; create, edit, delete admin replies; bulk clear done posts
- **Reply editing**: Inline edit mode per reply with save/cancel

#### `NavComponent` (`src/app/layout/nav/`)
- **Purpose**: Sticky top navigation with responsive hamburger menu
- **Features**: Profile modal (username editing, account deletion), conditional admin link, auth-aware Login/Logout button
- **Responsive**: Desktop shows horizontal links; mobile uses full-screen overlay with staggered link animations
- **Keyboard**: Escape key closes menu

#### `AnimateOnScrollDirective` (`src/app/shared/directives/animate-on-scroll.directive.ts`)
- **Purpose**: CSS class-based scroll-triggered animation using IntersectionObserver
- **Behavior**: If element is already in viewport on init, immediately adds `is-visible` class. Otherwise adds `will-animate` class and observes with 0.1 threshold, swapping to `is-visible` on intersection.

#### `GoToTopComponent` (`src/app/shared/components/go-to-top.component.ts`)
- **Purpose**: Fixed-position button that appears after scrolling past 200px
- **Behavior**: Smooth-scrolls to top on click. Visibility controlled by scroll event listener.

### Backend

#### Hono Route Handlers (`workers/src/index.ts`)
- **Purpose**: All API endpoints for the application
- **Structure**: Flat route definitions on the Hono app instance
- **Auth routes**: Register, login, forgot password, reset password, Google OAuth (init + callback), profile update, account deletion, /me
- **Post routes**: List (with filtering/pagination/cursor), single post, replies, create post
- **Vote route**: Single endpoint handling upvote, downvote, vote removal, and vote switching
- **Admin routes**: Login, list posts, mark done, reopen, reply, edit reply, delete reply, delete post, bulk clear done

#### Auth Middleware (`workers/src/middleware/auth.ts`)
- **Purpose**: JWT verification and authorization guards
- **`jwtVerify`**: Extracts and verifies Bearer token, attaches user to context. Non-blocking — allows unauthenticated requests to proceed with `user = null`
- **`requireAuth`**: Rejects with 401 if no authenticated user
- **`requireAdmin`**: Rejects with 403 if user is not admin
- **`requireUserVote`**: Rejects admin tokens (cannot vote)
- **`requireUserAccount`**: Rejects admin tokens (cannot use user features like profile update, post creation)

#### Rate Limit Middleware (`workers/src/middleware/rate-limit.ts`)
- **Purpose**: Per-IP windowed rate limiting using D1 storage
- **IP identification**: Uses `cf-connecting-ip` header (Cloudflare) with SHA-256 hash to avoid storing raw IPs
- **Window**: Configurable window size in milliseconds
- **Storage**: Upserts into `rate_limits` table with composite key `(path:ipHash, windowKey)`. Fail-open on DB error.
- **Strict limit**: 10 requests per 60 seconds (auth endpoints)
- **Standard limit**: 30 requests per 60 seconds (posts, vote endpoints)

---

## APIs

All API endpoints are served from `https://drclash-api.babarmeet86.workers.dev`.

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | No | Returns `{ ok: true }` |

### Authentication

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| POST | `/api/auth/register` | No | Strict | Create account with email, username, password |
| POST | `/api/auth/login` | No | Strict | Login with email + password, returns JWT |
| POST | `/api/auth/forgot-password` | No | Strict | Sends password reset email via Resend |
| POST | `/api/auth/reset-password` | No | Strict | Reset password using token from email |
| GET | `/api/auth/google` | No | None | Redirect to Google OAuth consent screen |
| GET | `/api/auth/google/callback` | No | None | OAuth callback, redirects with JWT fragment |
| GET | `/api/auth/me` | Optional | None | Returns current user or null |
| PUT | `/api/auth/profile` | Required | None | Update username |
| DELETE | `/api/auth/account` | Required | None | Delete account and all associated data |

**Register request**: `{ email, username, password }`
**Login request**: `{ email, password }`
**Login response**: `{ token: string, user: { id, email, username, is_admin } }`
**Forgot password request**: `{ email }`
**Forgot password response**: `{ message: string }` (always the same message regardless of whether email exists)
**Reset password request**: `{ token: string, password: string }`
**Profile update request**: `{ username }`

### Posts

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| GET | `/api/posts` | Optional | Standard | List posts with optional type/status/cursor/limit filters |
| GET | `/api/posts/:id` | Optional | None | Get single post with replies |
| GET | `/api/posts/:id/replies` | No | None | Get replies for a post |
| POST | `/api/posts` | Required | Standard | Create a new feature request or bug report |

**Posts list query params**: `type` (feature|bug), `status` (current|done), `cursor` (numeric ID for pagination), `limit` (max 50)
**Posts list response**: `{ posts: Post[], nextCursor: number | null }` — replies are batch-fetched and included inline
**Create post request**: `{ type: "feature"|"bug", title, content }`

### Voting

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| POST | `/api/vote` | Required (non-admin) | Standard | Upvote (1), downvote (-1), or remove (0) vote |

**Request**: `{ post_id: number, value: -1 | 0 | 1 }`
**Vote logic**:
- `value = 0`: Remove existing vote
- `value` matches existing vote: Toggle off (remove)
- `value` differs from existing vote: Switch vote (adjust by `value * 2`)
- No existing vote: Insert new vote (adjust by `value`)

### Admin

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| POST | `/api/admin/login` | No | Strict | Admin login against env vars |
| GET | `/api/admin/posts` | Admin | None | List all posts with optional status filter |
| PUT | `/api/admin/posts/:id/done` | Admin | None | Mark post as done |
| PUT | `/api/admin/posts/:id/reopen` | Admin | None | Reopen a done post |
| DELETE | `/api/admin/posts/:id` | Admin | None | Delete post and associated votes/replies |
| DELETE | `/api/admin/posts/done` | Admin | None | Delete all done posts and their votes/replies |
| POST | `/api/admin/posts/:id/reply` | Admin | None | Reply to a post |
| PUT | `/api/admin/replies/:id` | Admin | None | Edit a reply |
| DELETE | `/api/admin/replies/:id` | Admin | None | Delete a reply |

**Admin login request**: `{ username, password }` (matches `ADMIN_USERNAME` and `ADMIN_PASSWORD` env vars)

### Error Responses

All errors return JSON with shape `{ error: string }` and optionally `{ code: string }`. Common HTTP status codes: 400 (validation), 401 (unauthorized), 403 (forbidden), 404 (not found), 409 (conflict), 429 (rate limit), 500 (server error).

---

## Data Model

### Entity Relationship

```
users (1) ─────< (N) posts (1) ─────< (N) votes
                              (1) ─────< (N) replies
```

### Tables

#### `users`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK, AUTOINCREMENT |
| email | TEXT | UNIQUE, NOT NULL |
| username | TEXT | UNIQUE, NOT NULL |
| password_hash | TEXT | Nullable (null for OAuth-only users) |
| oauth_google_id | TEXT | UNIQUE, nullable |
| is_admin | INTEGER | DEFAULT 0 |
| created_at | TEXT | DEFAULT datetime('now') |

#### `posts`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK, AUTOINCREMENT |
| user_id | INTEGER | NOT NULL, FK -> users(id) |
| type | TEXT | CHECK('feature', 'bug') |
| status | TEXT | DEFAULT 'current', CHECK('current', 'done') |
| title | TEXT | NOT NULL |
| content | TEXT | NOT NULL (max 50,000 chars) |
| upvotes | INTEGER | DEFAULT 0 |
| created_at | TEXT | DEFAULT datetime('now') |

Indexes: `posts(status)`, `posts(type)`, `posts(upvotes DESC)`

#### `votes`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK, AUTOINCREMENT |
| post_id | INTEGER | NOT NULL, FK -> posts(id) |
| user_id | INTEGER | NOT NULL, FK -> users(id) |
| value | INTEGER | CHECK(1, -1) |
| created_at | TEXT | DEFAULT datetime('now') |

UNIQUE(post_id, user_id). Indexes: `votes(post_id)`, `votes(user_id)`

#### `replies`
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PK, AUTOINCREMENT |
| post_id | INTEGER | NOT NULL, FK -> posts(id) ON DELETE CASCADE |
| content | TEXT | NOT NULL |
| created_at | TEXT | DEFAULT datetime('now') |

#### `rate_limits`
| Column | Type | Constraints |
|--------|------|-------------|
| key | TEXT | PK (composite with window_key) |
| window_key | INTEGER | PK (composite with key) |
| count | INTEGER | DEFAULT 1 |
| expires_at | INTEGER | NOT NULL |

Index: `rate_limits(expires_at)`

### Migrations

The database is managed through sequential SQL migration files in `workers/migrations/`:
- `0001_initial.sql`: Creates `users`, `posts`, and `votes` tables with indexes
- `0002_rate_limit.sql`: Creates `rate_limits` table for rate limiting and OAuth state storage
- `0003_replies.sql`: Creates `replies` table for admin post responses

### Data Lifecycle

1. User registers -> row in `users` (with or without `password_hash` depending on auth method)
2. User creates post -> row in `posts` with `status='current'`, `upvotes=0`
3. Users vote -> rows in `votes`, `posts.upvotes` updated via SQL
4. Admin marks done -> `posts.status` set to `'done'`
5. Admin replies -> rows in `replies`
6. Admin clears done -> all done posts and their associated votes/replies deleted
7. User deletes account -> cascade: votes on own posts, own votes, own posts, user row

---

## Configuration

### `wrangler.toml`
Cloudflare Workers configuration. Defines the worker name (`drclash-api`), entry point, compatibility date, D1 database binding, and non-sensitive environment variables (`APP_URL`, `RESEND_SENDER_EMAIL`, `GOOGLE_CALLBACK_URL`). Sensitive values (`JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`) are set via `wrangler secret put`.

### `.env.example`
Template for all required environment variables: Cloudflare API credentials, JWT secret, Google OAuth client credentials, Resend API key/sender, admin credentials, and app URL.

### `angular.json`
Angular CLI configuration. Uses `@angular/build:application` builder. Output hashing enabled for production. Budget warnings at 500kB initial / 6kB per component style.

### `vercel.json`
Minimal Vercel configuration — only sets the project name to `drclash`.

### `package.json` (root)
Defines Angular application dependencies: `@angular/core` 21.2, `rxjs` 7.8, `tslib`. Dev dependencies: `@angular/build` 21.2, `@angular/cli` 21.2, `prettier`, `typescript` 5.9, `vitest` 4.0, `jsdom` 28.0.

### `package.json` (workers)
Defines API dependencies: `hono` 4.6. Dev dependencies: `wrangler` 3.80, `@cloudflare/workers-types` 4.24, `typescript` 5.6.

---

## Dependencies

### Internal Module Dependency Graph

```
AppComponent
├── NavComponent ──────> AuthService ──────> ApiService
├── RouterOutlet ──────> [Lazy-loaded routes]
│   ├── HomeComponent ───> AnimateOnScrollDirective
│   ├── FeaturesBugComponent ──> ApiService, AuthService
│   ├── LoginComponent ───> ApiService, AuthService
│   ├── AdminComponent ───> ApiService, AuthService
│   ├── OauthCallbackComponent ───> AuthService
│   ├── ResetPasswordComponent ───> ApiService
│   ├── PrivacyPolicyComponent ───> AnimateOnScrollDirective
│   └── TermsConditionsComponent ───> AnimateOnScrollDirective
├── FooterComponent
└── GoToTopComponent
```

### Key External Dependencies

**`@angular/core` 21.2**: Standalone component bootstrap, signals, inject, HostListener, application config providers
**`@angular/router` 21.2**: Lazy loading via `loadComponent`, `RouterLink`, `RouterLinkActive`, `RouterOutlet`
**`@angular/forms` 21.2**: Template-driven forms via `FormsModule` and `[(ngModel)]`
**`@angular/platform-browser/animations` 21.2**: Router transition animations (provider only, no custom animations used)
**`hono` 4.6**: Lightweight TypeScript web framework for Cloudflare Workers. Provides routing, context, middleware, JWT signing/verification
**`wrangler` 3.80**: Cloudflare Workers CLI for development, deployment, and D1 migrations
**`vitest` 4.0 / `jsdom` 28.0**: Unit testing framework (configured but no test files found in the codebase)

---

## Application Workflow

### User visits the landing page

1. Browser loads `index.html` — Google Fonts (Archivo Black, Work Sans, Space Mono) are preconnected and loaded
2. Angular bootstraps from `main.ts` via `bootstrapApplication(App, appConfig)`
3. `App` component renders immediately: `NavComponent` (sticky top bar), empty `<router-outlet>`, `FooterComponent`, `GoToTopComponent`
4. `AuthService` constructor calls `loadUser()` — checks `sessionStorage` for existing JWT, if found calls `/api/auth/me` to validate and populate `user` signal
5. Router resolves `/` (HomeComponent) — `HomeComponent` is lazy-loaded and rendered into the outlet
6. `AnimateOnScrollDirective` on hero section checks viewport — if visible, immediately adds `is-visible` class, triggering CSS transitions
7. User sees hero section with app logo, title, description, and app store buttons. Feature cards below with staggered animation delays

### User browses the Feature/Bug board

1. User clicks "Features / Bug" in navigation
2. Router lazy-loads `FeaturesBugComponent`, replaces outlet content
3. `ngOnInit` calls `loadPosts()` which calls `ApiService.getPosts()` with default filter (all, current)
4. API returns posts with their replies and user's vote status (if authenticated). Response cached for 30 seconds (`Cache-Control` header)
5. Posts rendered as cards with vote buttons, type labels, title, truncated content, author, date
6. User can filter by clicking tabs (All / Features / Bugs / Done) — each triggers a fresh API call
7. User can click "Load More" for cursor-based pagination

### User votes on a post

1. User must be authenticated — if not, vote buttons are disabled
2. User clicks "+" (upvote) button
3. Optimistic update: vote count adjusted immediately in local signal, button highlighted
4. POST to `/api/vote` with `{ post_id, value: 1 }`
5. Server processes vote logic (insert/update/delete in `votes` table, adjust `posts.upvotes`)
6. On success: server returns authoritative `upvotes` count, local state updated
7. On failure: optimistic update reverted to previous values

### User submits a feature/bug

1. Authenticated user clicks "+ Feature" or "+ Bug" — overlay form appears
2. User fills title and description, clicks "Submit"
3. POST to `/api/posts` with type, title, content
4. Server validates (length, type), inserts into `posts` table
5. New post returned and prepended to local list
6. Form closes

### Admin manages the board

1. Admin navigates to `/admin` — sees admin login form if not authenticated as admin
2. Admin enters credentials from environment variables, POST to `/api/admin/login`
3. Server verifies against `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars, issues JWT with `is_admin: true` and `id: 0`
4. Admin dashboard loads: table of all posts with ID, type, title, author, votes, status, actions, and reply management
5. Admin can: mark as done, reopen, delete, reply (with edit/delete), bulk clear done items

---

## Performance Considerations

- **Lazy-loaded routes**: Every page is a separate chunk loaded on demand — no unnecessary JavaScript on initial page load
- **Cursor-based pagination**: The feature/bug board uses keyset pagination (cursor = last post ID) instead of offset pagination, avoiding the offset drift problem for frequently-updated data
- **Optimistic voting**: Vote UI updates immediately without waiting for server confirmation, with rollback on failure
- **Cache headers**: Post list responses include `Cache-Control: public, max-age=30, s-maxage=60` for CDN caching
- **IntersectionObserver**: Scroll animations use the native IntersectionObserver API instead of scroll event listeners, avoiding main thread pressure
- **Batch reply fetching**: When loading multiple posts, replies are fetched in a single batched query using `WHERE post_id IN (...)` instead of N+1 queries
- **Database indexes**: Indexes on `posts(status)`, `posts(type)`, `posts(upvotes DESC)`, `votes(post_id)`, `votes(user_id)`, and `rate_limits(expires_at)` for query performance
- **Go-to-top visibility**: Uses scroll event listener but only reads `window.scrollY`, avoiding layout thrashing

---

## Security Considerations

- **Password hashing**: PBKDF2 with 100,000 iterations of SHA-256 and per-password random 16-byte salt. Hash format: `pbkdf2:100000:<salt_hex>:<hash_hex>`
- **Constant-time comparison**: Password verification uses constant-time string comparison to prevent timing attacks on password hashes
- **JWT signing**: Tokens signed with HS256 using a server-side secret. 7-day expiry for auth tokens, 1-hour expiry for password reset tokens
- **Token storage**: JWT stored in `sessionStorage` (cleared when browser tab closes), not `localStorage`
- **IP hashing**: Rate limiting stores SHA-256 hashed IP addresses (truncated to 16 hex chars), never raw IPs
- **Auth guards**: Multiple middleware layers prevent admin tokens from accessing user features (`requireUserAccount`, `requireUserVote`). Admin routes check `is_admin` flag on every request
- **Input validation**: All user inputs validated server-side — email format, username charset/length, password length, post content length, vote values
- **SQL injection**: All database queries use parameterized prepared statements (D1 `.bind()`), no string concatenation of user input
- **Security headers**: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-XSS-Protection: 0`
- **CORS restriction**: Access-Control-Allow-Origin set to `APP_URL` env var, not wildcard
- **Forgot password info leak**: Same response message returned regardless of whether the email exists in the database, preventing email enumeration
- **OAuth state parameter**: Google OAuth flow uses a random UUID `state` parameter stored in the `rate_limits` table to prevent CSRF on the callback
- **Account deletion**: Cascading deletion of user's posts, votes, and votes on their posts ensures complete data removal
- **Admin credentials**: Stored as environment variables, not in the database. Separate from user authentication system
- **Rate limiting**: Auth endpoints limited to 10 requests/minute per IP to mitigate brute force and password spraying attacks

---

## Limitations

- **Vote endpoint not rate-limited for D1**: Rate limiting itself depends on D1 database availability. The rate limiter fails open (allows request) if the database is unavailable
- **No email verification flow**: User registration does not require email verification — any valid email format can register
- **Single admin account**: Admin credentials are hardcoded via environment variables, supporting only one admin identity
- **No password change endpoint**: Users cannot change their password without going through the forgot-password flow
- **OAuth-only account recovery**: If a user registered via Google OAuth and later needs to switch to email login, they must use the forgot-password flow (which generates a password reset token for their email)
- **No refresh tokens**: JWT tokens cannot be refreshed — users must re-authenticate after 7 days
- **No automated tests**: While Vitest and jsdom are configured as dependencies, no test files were found in the codebase
- **Session storage only**: JWT is stored in `sessionStorage` — closing the browser tab requires re-authentication
- **No offline support**: The Angular application requires network connectivity for all functionality

---

## Future Maintenance Notes

- **D1 migration order**: Migrations are numbered sequentially. New migrations must maintain the naming convention (`0004_*.sql`) and be applied via `wrangler d1 migrations apply`
- **Environment variables**: New secrets must be added via `wrangler secret put` and typed in the `Bindings` interface in `workers/src/index.ts`
- **Route additions**: New routes must follow the pattern in `app.routes.ts` — use `loadComponent` for lazy loading. Feature folders must match the route path in kebab-case
- **Component conventions**: Standalone components only. Use `input()`/`output()` signals over decorators. Use `inject()` over constructor injection. Use Angular 17+ control flow (`@if`, `@for`) over structural directives
- **Design system**: All visual elements must adhere to the VoiceBox design system (`DESIGN.md`). Zero border-radius, no shadows, black/white/red palette only
- **Database schema changes**: Add new migrations in `workers/migrations/`. Do not modify existing migration files after they have been applied to production. Reference: `0003_replies.sql` for the pattern
- **Hono version**: The backend uses Hono 4.6. Hono's middleware API and JWT helpers (`hono/jwt`) are coupled to this version — verify compatibility before upgrading
- **Angular version**: The frontend targets Angular 21.2. The `@angular/build` package replaces the legacy `@angular-devkit/build-angular` — ensure build configuration follows the new application builder pattern

---

## License

Copyright (c) 2026 Babariya Meet. All rights reserved.

No permission is granted to use, copy, modify, merge, publish, distribute, sublicense, create derivative works from, reference, reverse engineer for replication, or otherwise exploit this project, in whole or in part, for any purpose without prior written permission from the copyright holder.
