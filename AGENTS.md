# Dr.Clash - Angular Project Rules

## Architecture

```
src/app/
  core/              # Singleton services, guards, interceptors
  features/          # Lazy-loaded feature modules (one per route)
  layout/            # App shell: nav, footer
  shared/            # Reusable components, directives, pipes
```

- Every route gets its own folder under `features/`
- All routes use `loadComponent` (lazy loading) - no eager imports
- Layout components (nav, footer) are imported eagerly in `App`

## Conventions

- **Standalone components only** - no NgModules
- **Inline templates** for trivial components (1-5 lines)
- **Separate files** (`.html`, `.css`) for any component with real content
- Use `input()` / `output()` over `@Input` / `@Output`
- Use `inject()` over constructor injection
- Use Angular 17+ control flow (`@if`, `@for`) - no `*ngIf` / `*ngFor`

## Naming

- Feature folders: `kebab-case` matching the route path
- Component selectors: `app-` prefix, e.g. `app-home`, `app-nav`
- Directives: `[camelCase]` selector, e.g. `[animateOnScroll]`

## Assets

- Static files go in `public/` - Angular serves them from root
- Do **not** put assets in `src/assets/` unless configured for hashing

## Design System (VoiceBox)

- Fonts: Archivo Black (headings), Work Sans (body), Space Mono (code)
- Colors: `#0A0A0A` (black), `#FAFAFA` (white), `#EF4444` (red accent)
- Radius: `0px` everywhere - sharp, editorial, no curves
- Shadows: `none` - hierarchy from weight, contrast, and borders only
- Red is a scalpel - at most one red element per viewport
- See `DESIGN.md` for full spec

## Writing

- Never use em dash (-- or —). Use a regular hyphen (-) instead.

## Git Rules

- Never commit or push anything unless explicitly told to by the user.
- Never use `git add`, `git commit`, `git push`, or any git automation without direct instruction.
- If the user asks to create or edit files, do the work locally but do not stage or commit it.
- Wait for the user to say "commit" or "push" before touching git history.
