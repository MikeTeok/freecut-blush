# Freecut Blush – Agent guide

Browser-based multi-track video editor. React 19 + TypeScript + Vite.

## Commands

| Command | What |
|---|---|
| `npm run dev` | Dev server at `localhost:5173` (COOP/COEP headers required) |
| `npm run build` | Production build |
| `npm run lint` | Oxlint (via Vite+) |
| `npm run format` | Oxfmt (via Vite+) |
| `npm run check` | Lint + TS typecheck (via Vite+) — run before push |
| `npm run test:run` | Vitest (jsdom) once |
| `npm run test` | Vitest watch mode |
| `npm run verify` | Full gate: check→boundaries→deps→coverage→build→headless |
| `npm run routes` | Regenerate `src/routeTree.gen.ts` (TanStack Router) |
| `npm run headless:test:portable` | Portable headless suite (Node + Chrome + edit + media) |

All scripts use `vite-plus` (`vp`) under the hood.

## Architecture

```
src/
  features/     — UI modules (timeline, preview, editor, media-library, effects, …)
  runtime/      — playback/render engines (composition-runtime, player)
  infrastructure/ — GPU, analysis, audio, storage, browser adapters
  shared/       — framework-agnostic domain primitives (timeline, projects, utils)
  app/          — bootstrap
  components/   — shadcn/ui Radix components
  routes/       — TanStack file-based routes (run `npm run routes` after changes)
```

- Feature modules use `deps/` adapters to import cross-feature — enforced by oxlint `no-restricted-imports` rules
- Feature boundaries, deps contracts, and legacy import checks are CI-gated — run `npm run verify` before any large change
- `ignoreExports` / `ignorePatterns` in `.fallowrc.json` are ratchet baselines — never bulk-`fallow fix`

## Build quirks

- **Multi-entry:** `index.html` (editor) + `headless.html` (UI-less render harness)
- **COOP/COEP:** `same-origin` + `require-corp` in dev; Vercel uses `credentialless`
- **Service worker:** build hash injected into `sw.js` via custom Vite plugin
- **Manual chunks:** complex Rollup `manualChunks` config to avoid TDZ cycles; `core-logger` must be standalone
- **`src/routeTree.gen.ts`** is generated — never edit manually; excluded from oxfmt formatting

## Dependencies

- All production deps exact-pinned (no `^`/`~`). New deps same rule.
- `onnxruntime-web` (dev build) and `lucide-react` (0.468.x) pinned deliberately — never routine-bump
- `npm@11.8.0` package manager
- `esbuild` + `typescript` overridden at root level

## Code style

- Conventional commits (`type(scope): description`)
- All work goes to `main`, push directly
- Shared domain modules (`src/shared/timeline/`, `src/shared/projects/`) must never import React, React DOM, or TanStack Router
- `VITE_SHOW_DEBUG_PANEL=false` hides debug panel in dev

## Testing

- jsdom environment (`src/test/setup.ts`), Vitest via Vite+
- Coverage thresholds (ratchet floor): 48% stmts / 42% branch / 52% funcs / 49% lines
- Headless suite requires a production build (`npm run headless:test` builds first)
- Preview sync stress: `npm run test:preview-sync:stress -- --runs 20`
