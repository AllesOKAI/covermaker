# Reliability and Postprod Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make drafts and exports dependable, add meaningful layout checks and connect the static cover maker to the local post-production command.

**Architecture:** Extract deterministic data, layout, persistence, export and handoff modules while retaining the existing React/SVG renderer. Use Node's built-in test runner for pure modules and real browser smoke tests for persistent, font- and export-dependent workflows.

**Tech Stack:** React 19, TypeScript, Vite/vinext, Node test runner, existing browser Canvas/SVG APIs.

**Spec:** `docs/superpowers/specs/2026-11-12-reliability-and-postprod-design.md`

## Global Constraints

- Two-space indentation; no new runtime dependencies and no backend.
- Preserve existing artwork seeds/geometry and the legacy draft/preset keys until migrated.
- Commit each numbered topic separately with its tests and focused documentation.
- Exported PNG dimensions and deterministic pattern identity must not regress.

## Review Focus

- Quota exhaustion during migration must never delete the most recent recoverable draft; test failed writes and legacy migration in the storage task.
- A font finishing after the first preview must not make exported lines disagree; test pending and loaded fonts in the layout/export tasks.
- Unknown or hostile URL strings must remain inert display text; test malformed and repeated parameters in the handoff task.
- A failed member of a multi-file export must not abort later formats; test partial failure and output ordering in the export task.
- A reset or new preset must preserve an independent immutable version; test version identity and current-draft persistence in the storage task.

---

### Task 1: Reliable local drafts

**Files:**
- Create: `lib/artwork.ts`, `lib/draft-storage.ts`, `lib/browser-storage.ts`, `tests/draft-storage.test.ts`, `tests/browser-storage.test.ts`
- Modify: `app/page.tsx`, `app/globals.css`, `package.json`, `.gitignore`

**Interfaces:**
- Consumes: existing v4 Episode/Preset objects and keys.
- Produces: shared artwork types/defaults, `loadDraft(storage)`, `saveDraft(storage, draft)`, `prepareGuestImage(file, env)`, normalized persisted `{ episode, preset }`.

- [ ] Add Node test scripts and behavior tests for v4 migration, complete state restoration, validation, quota errors, guest-image compression and observable failure.
- [ ] Run tests and confirm missing modules/desired behaviors fail before implementation.
- [ ] Extract defaults without changing seeds; implement validated versioned persistence and bounded Canvas image normalization with a serial write queue.
- [ ] Integrate hydration gating, active-preset persistence, upload/reset/preset save feedback and accessible save status.
- [ ] Run focused tests, full tests and lint; commit `fix: preserve complete local drafts`.

### Task 2: Consistent layout checks

**Files:**
- Create: `lib/artwork-layout.ts`, `tests/artwork-layout.test.ts`
- Modify: `app/page.tsx`, `app/globals.css`

**Interfaces:**
- Consumes: shared Episode/Preset types, real `CanvasRenderingContext2D.measureText`, `document.fonts`.
- Produces: format layout metrics, `fitArtworkText`, `validateArtwork`, usable measured title/subtitle lines and per-format warnings.

- [ ] Write failing tests for long unbroken words, explicit newlines, unicode, title/subtitle/tag limits and five-format warning coverage.
- [ ] Implement measurement and shared safe-area geometry; replace character-based title truncation without touching pattern math.
- [ ] Connect input limits to the model, render warnings at affected artboards and expose count based on true limits.
- [ ] Verify font-ready re-measurement, tests and lint; commit `fix: validate artwork text across formats`.

### Task 3: Faster, clearer exports

**Files:**
- Create: `lib/artwork-export.ts`, `tests/artwork-export.test.ts`
- Modify: `app/page.tsx`, `app/globals.css`

**Interfaces:**
- Consumes: live SVG refs, font/asset cache, `exportCover`.
- Produces: session resource cache, per-format export results, partial-failure reporting and sequential all-format download UI.

- [ ] Write failing tests for resource fetching once, object URL cleanup, a failed export and independent batch failures.
- [ ] Extract export with cached fonts/images, guarded object URLs, typed errors and awaited cleanup.
- [ ] Add per-button and all-export busy states plus success/error details; keep five PNG dimensions unchanged.
- [ ] Run tests, browser export smoke test and lint; commit `feat: streamline artwork exports`.

### Task 4: Verified TypeScript and static preview

**Files:**
- Create: `scripts/preview.mjs` or focused static preview helper.
- Modify: `tsconfig.json`, `vite.config.ts`, `.github/workflows/build.yml`, `package.json`, `README.md`

- [ ] Confirm baseline typecheck and Vite preview diagnostics; test the replacement preview's `/`, assets, traversal and correct MIME handling.
- [ ] Remove obsolete Cloudflare types and unsupported preview configuration; use static HTTP serving with existing system/runtime facilities.
- [ ] Add `test`, `typecheck`, `check`, CI and preview verification; fix newly surfaced source typing issues.
- [ ] Run `npm run check` and HTTP smoke tests; commit `build: verify source and static preview`.

### Task 5: Leaner assets and rendering

**Files:**
- Create: `scripts/optimize-images.mjs` if necessary, `tests/performance.test.ts` only for real logic.
- Modify: bounded versions of public photos and references in `lib/artwork.ts`, `app/page.tsx`, CSS/metadata where needed.

**Interfaces:**
- Produces: small local WebP photos, memoized artwork rendering, stable model-context tool callbacks with no duplicate registrations.

- [ ] Measure current asset and rendered-path counts; define a pure test for guest sample selection or persistent export identity if logic changes.
- [ ] Compress images without altering their visible crop; update references.
- [ ] Memoize static covers, isolate live control changes, stabilize browser tool registration in one effect.
- [ ] Verify generated HTML dimensions/gzip, no new network dependency, tests/lint/build; commit `perf: reduce artwork asset and rendering overhead`.

### Task 6: Post-production handoff

**Files:**
- Create: `lib/postprod-handoff.ts`, `tests/postprod-handoff.test.ts`
- Modify: `app/page.tsx`, `app/globals.css`, `README.md`

**Interfaces:**
- Produces: `readEpisodeQuery(searchParams)`, `createCovermakerQuery(episode)`, `createPostprodCommand({ episode, preset, videoPath, coverPath, directory })` and a clipboard/download handoff UI.

- [ ] Write failing tests for aliases, blank/invalid values, Unicode, quote/newline-safe shell escaping and intended PNG filename.
- [ ] Implement typed query parsing and strict shell single-quote escaping; integrate parameters after stored state restoration without later query-driven autosave loops.
- [ ] Add copyable bilingual-existing-style command/help, outbound share link, postprod directory/video/cover path inputs without storing secrets.
- [ ] Browser-verify query + saved draft precedence and clipboard/local command; run the full check suite.
- [ ] Commit `feat: connect cover artwork with post-production`.
