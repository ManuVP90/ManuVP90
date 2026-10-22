---
name: steward
description: Repository conventions for driving a PR of Trivia del Cosmere to green — read before acting on CI or review events.
---

# Stewarding a PR in this repo

- **Branches:** work on a feature branch; never push to `main`; merge the base into the branch
  (no rebase/force-push on shared branches).
- **CI** (`.github/workflows/ci.yml`) runs build --check, check-terms (report only), check-app,
  unit, a data-freshness warning, smoke and edge. Reproduce any failure locally with the same
  command before fixing it (`node tools/<name>.mjs`; Chromium is preinstalled — never
  `playwright install` locally).
- **Common failures and fixes**
  - `check-app` → "CACHE_VERSION must change": bump `CACHE_VERSION` in `app/sw.js`.
  - `check-app` → SHELL/i18n mismatch: add the module to `SHELL` / add the key to all 5 i18n files.
  - `build --check` → "missing translation": translate the id in every `content/<lang>/` file
    (use the matching `translator-<lang>` agent or the `translate` workflow).
  - Stale `app/data` warning: run `node tools/build.mjs` and commit the regenerated files.
- **Generated files:** `app/data/*` comes only from `node tools/build.mjs`; never hand-edit.
- **Never touch** the root `README.md` (owner's GitHub profile).
- **Review comments on content** (facts, names): verify with WebSearch (Coppermind snippets)
  before changing; apply the change in English AND every translation; record term decisions in
  `content/<lang>/glossary-review.json` and run `node tools/merge-glossary.mjs`.
- **Proactivity:** fix red CI and small review asks directly; content/design disputes and
  anything touching the official-names rule go to the owner (in Spanish) first.
