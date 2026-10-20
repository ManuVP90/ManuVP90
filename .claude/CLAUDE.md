# Trivia del Cosmere — project memory

Unofficial fan trivia PWA about Brandon Sanderson's Cosmere. Mobile-first, local pass-the-phone
play only, offline, 5 languages (es, en, fr, de, it). Owner: ManuVP90 (Spanish-speaking, learning to
code). This repo is also the owner's **GitHub profile repo**: never edit the root `README.md`; project
docs live in `docs/`. Talk to the owner in Spanish.

## Golden rule (non-negotiable)
Every Cosmere name/term in a language must be the one used in that language's **official published
edition** (es: Nova/Penguin Random House · fr: Le Livre de Poche/Orbit · de: Heyne/Piper ·
it: Mondadori). No official form → the localized Coppermind/community form → else English.
`content/glossary.json` records each term's form and `status` (official, community, unchanged,
unpublished, unverified). Never mark a term `official` without a source.

## Where things are
- `docs/SPEC.md` — binding contract: game rules, data formats (§3), work ids (§4).
- `docs/ENGINE.md` — app architecture. `docs/AGENTS.md` — the agent team and workflows.
- `content/en/<world>.json` canonical questions; `content/<lang>/` translations, `glossary-review.json`,
  `WORK_TITLES.json`; `content/glossary.json` shared glossary.
- `app/` vanilla-JS PWA (no build step). `app/data/` is GENERATED — never hand-edit.
- `tools/` validators, generators and tests (see table below).

## Commands (quality gates — all must pass before any commit)
| Command | Purpose |
|---|---|
| `node tools/build.mjs --check` | validate content (no writes) |
| `node tools/build.mjs` | regenerate `app/data/` — **lead/release only, never in parallel agents** |
| `node tools/check-app.mjs` | SW shell, i18n key parity, manifest, work titles |
| `node tools/unit.mjs` | engine unit tests |
| `node tools/smoke.mjs` | end-to-end phone run (Playwright, Chromium preinstalled) |
| `node tools/edge.mjs` | edge-case regression suite |
| `node tools/check-terms.mjs [langs]` | terminology consistency report |
| `node tools/changed-ids.mjs <rev>` | new/changed question ids since a revision |
| `node tools/merge-glossary.mjs` | merge `content/<lang>/glossary-review.json` into the glossary |
| `node tools/verification-list.mjs` | regenerate native-reviewer checklists in `docs/verification/` |
Never run `playwright install` locally. Serve the app with `node tools/serve.mjs <port>`.

## Engineering rules
- Any change under `app/` → bump `CACHE_VERSION` in `app/sw.js` (CI enforces it) and, for releases,
  `APP_VERSION` in `app/js/config.js`; new modules go into `SHELL` in `app/sw.js`.
- All UI strings exist in all 5 `app/i18n/*.json` with identical keys and placeholders.
  fr: «vous», U+00A0 before ? ! : ; and inside « »; de: «du», „…“; typographic apostrophes in fr/it.
- Every bug fix gets a deterministic regression test in `tools/edge.mjs` or `tools/unit.mjs`.
- Timer rule (lead decision, beta round 3): once a question is revealed the clock runs in real time even if the
  player leaves; it pauses only before reveal and in the quick-game quit dialog.

## Content rules (SPEC §3.1)
4 options, one unambiguous answer; difficulty 1–4; `work` = latest book needed (spoiler filter);
in planet worlds all options from that planet; no wordplay or gender leaks; `terms` complete;
every fact verifiable in published text (WebSearch returns Coppermind snippets; coppermind.net
itself cannot be fetched here). Same id across all languages; keep files in English id order.

## Team protocol
- Parallel agents get **disjoint file ownership** (stated in their brief); they never commit.
- The lead integrates: merge glossary reviews → `build.mjs` → all gates → commit → push.
- Commits: imperative subject, explanatory body. Feature branch + PR to `main`; never push to `main`.
- Rate limits can kill agents mid-task: when resuming, tell them partial edits exist and to inspect
  `git diff` first.
