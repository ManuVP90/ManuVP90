# Engine: Trivia del Cosmere (PWA)

The game is a plain PWA in `app/`: HTML, CSS and JavaScript ES modules. It has no framework, no build step and no external network resources (system fonts, inline SVG icons, synthesized sounds). The game design and data contract are in [SPEC.md](SPEC.md).

## Run locally

Any static server rooted at `app/` works:

```sh
node tools/serve.mjs 8080          # no dependencies
# or: python3 -m http.server -d app 8080
# or: npx serve app
```

Open http://localhost:8080/. Service workers need `http://localhost` or HTTPS. A `file://` URL won't work because the app uses `fetch` and ES modules.

## Smoke test

```sh
node tools/smoke.mjs                                    # screenshots go to $TMPDIR/cosmere-smoke
SCREENSHOT_DIR=/some/dir node tools/smoke.mjs
```

The test uses Playwright with Chromium. It loads a local `playwright` package if there is one, otherwise the global install (`npm root -g`). It starts `tools/serve.mjs` on a random port and emulates a Pixel 7 with locale `es-ES`. `Math.random` is replaced by a seeded generator (`SEED=<n>` to change it), so every run plays the same game. It then runs through:

1. The first-run introduction (what have you read? → rules → start), then Spanish auto-detection on the home screen.
2. A classic game with 2 players on the "Difícil" level, played to victory. The starting player is drawn at random and announced on the first handoff ("Empieza: …"); the starter always misses and the other player always answers right, so the turn must pass after 3 correct answers in a row. The options must carry no attribute that reveals the answer. Every non-final question must be difficulty 2 or higher, and the final question must be difficulty 4 (or 3 while there is no difficulty-4 data). Each lifeline is used once. Stormlight goes on the first question, which is answered wrong on purpose: the wrong option is struck, nothing is revealed, and the second wrong pick passes the turn. Breath must change the question id but keep its category and difficulty. Atium must leave exactly 2 enabled options, one of them correct. There are no lifelines on the final question. The game is reloaded mid-way and resumed with "Continue game", which must show the pass-the-phone screen first. The run includes the wildcard and the final question.
3. All 5 languages, switched from Settings, plus the light theme.
4. A full quick game on "Fácil", started from the quick intro screen. The test checks that the last level is remembered, that all questions are difficulty 1, and that Atium works once per game.
5. Practice with difficulty 4. While no difficulty-4 data exists, the setup screen must show the fallback message and the question must be difficulty 3. The test also checks the 4 difficulty pips and that practice has no lifelines. Then Stats (lifeline use counts) and About (lifelines section).
6. The spoiler filter: the wheel must lose the sectors that have no questions left.
7. A v1 saved game injected into `localStorage`. It must resume as level Normal with all lifelines and be saved back as v3.
8. Offline reload through the service worker.
9. A tablet viewport, checked for horizontal overflow.

The test fails on any console error, page error or failed request. It reads `app/data/questions.<lang>.json` to know the right answers, so it works with both real and placeholder data.

## Edge tests

```sh
node tools/edge.mjs                                     # screenshots go to $TMPDIR/cosmere-edge
```

Regression tests for the Beta 1, 2 and 3 findings ([BETA-1.md](BETA-1.md)). Each test opens a fresh context (service workers blocked, seeded `Math.random`, storage written before boot; settings marked `onboarded` are stored unless a test asks for a `fresh` first run) and uses Playwright's fake clock (`page.clock`, paused where timer values are checked exactly), so nothing depends on real time. `ONLY=<regex>` runs a subset. They cover: corrupt or foreign-shaped saves in every key (the app must reach Home, delete the bad save and offer "Continue" only for valid ones); the localized startup error screen and its "clear data and restart" action (module that fails to load, missing strings file, screen that throws); the classic timer (real time once revealed: a hidden page, Home, a reload and the handoff of an already-seen question all count; a never-shown question waits on the handoff; Home/Back ask first; a system clock jump or a clock moved backwards gives nothing back; 0 left resolves as a timeout; a 1.2 deadline save migrates); the quick game's Back + Cancel, timer pause behind the quit dialog and resume after a reload; no repeated questions with narrow spoiler filters (quick and practice); pure engine rules run in the page (final question prefers unseen questions, random starter, 3-answer turns, migration, language matching, grapheme initials); ca/gl/eu → Spanish; 6 players with long names at 320 and 390 px; German/French strings; lifeline details (no answer index in the DOM, Atium/Stormlight exclusive with a visible reason, Breath keeps an armed Stormlight, Breath reason, empty practice); and 200 % text at 320 px. Beta 2 adds: reload with the quick quit dialog open; a pending question that survives a spoiler-filter change (classic and quick); stricter save validation (fx, clock range, charges 0–2, final-phase consistency); `{category}` templates that take labels with articles in all languages, "Ayudas" vs "Comodín"; the 3rd answer in a row infusing the last gem; live setup avatars; specific "new game" confirmations; the already-infused notice (2.5 s or tap); the first-run introduction in 5 languages; quick results after a reload; the boot screen's confirmation, focus and kept caches; Home's bottom row at 200 % / 320 px. Beta 3 adds: `clockLeft` edge cases and the timer copy; the quit dialog pausing only while on screen; onboarding for null/corrupt settings, reload mid-introduction, silent flag for existing players, nothing preselected, 320×568 at 200 %; the empty-filter banner and messages; the wildcard choice surviving a reload on the handoff; stricter validation (pending category, unique colors, quick score/correct, result vs best); cross-game repeats (ring buffer, least-recent draws, practice notice); neutral "used" labels and French lifeline capitals; victory stats and Play again; unambiguous dialog buttons, French typography, IT/FR apostrophes, long names on 2 lines. Run both `smoke.mjs` and `edge.mjs` before shipping.

## Layout

```
app/
  index.html               shell; loads css/app.css and js/app.js (module)
  manifest.webmanifest     PWA manifest (icons in icons/)
  sw.js                    service worker (CACHE_VERSION constant)
  css/app.css              all styles; design tokens on :root / [data-theme="light"]
  i18n/<lang>.json         UI strings (nested objects, {placeholders})
  data/questions.<lang>.json  generated by tools/build.mjs (do not edit by hand)
  icons/                   generated by tools/make-icons.py
  js/
    app.js                 entry: imports main.js dynamically; any startup failure → boot-error screen
    main.js                settings → strings → questions → router → SW
    boot-error.js          self-contained localized error screen + "clear data and restart" (no other app imports)
    text.js                grapheme helpers (Intl.Segmenter): avatar initials, name clean-up
    config.js              categories, gem colors, langs (+ LANG_ALIASES), timer/quick constants, MAX_STREAK, LEVELS, LIFELINES, APP_VERSION
    core.js                app state (settings, stats), router, shared UI pieces (top bar, toggle, toast, confirm)
    storage.js             localStorage wrapper that never throws (falls back to memory)
    i18n.js                setLang / t(key, params) / detectLang
    data.js                loadQuestions, Pool (spoiler filter, no-repeat draws, level draws, final, Breath alternative), quickPlan, shuffle
    game.js                classic-mode rules, no DOM (state, deep validation, migration, applyAnswer, infusion, streak)
    works.js               work ids grouped by world + WORK_TITLES per language (TODO: localized titles)
    icons.js               inline SVG icons, gem shapes (each category has its own cut), lifeline art (lifelineSvg)
    fx.js                  WebAudio sounds, navigator.vibrate, CSS confetti, reduced-motion check
    dom.js                 h() element builder (text is always inserted as text nodes)
    components/            question card (+ lifeline rules, timer), lifelines row, wheel, player board, spoiler picker
    screens/               home, onboarding (first-run introduction), classic (setup + game), quick, practice, stats, settings, about
tools/
  serve.mjs                tiny static server (also used by the smoke test)
  smoke.mjs                Playwright smoke test
  make-icons.py            PNG/SVG icon generator (pure Python + zlib)
```

### Key mechanics

- **Startup and errors**: `app.js` only imports `boot-error.js` and then `import('./main.js')` inside a `try`, so a module that fails to load, an exception in `main()` or a Home screen that throws all end on the error screen. It is localized (saved language if valid, else the device language; strings from the `boot` section of `i18n/<lang>.json`, with a built-in copy if that file can't be fetched) and offers "Reintentar" (focused first: it is harmless) and "Borrar datos y reiniciar", which asks for a one-step confirmation and then removes only this app's `cosmere-trivia:` localStorage keys and reloads. The service-worker caches are kept on purpose, so the reset also works offline (with no data left, the first-run introduction opens). After startup, a screen that throws sends the player Home; if Home itself throws, `setFatalHandler` shows the same error screen.
- **Router** (`core.go(name, params)`): each screen is a function that returns an element. A screen registers cleanups such as timers with `onCleanup` and can override the system back button with `setBack`. One history entry is pushed when you leave Home, so Android back returns to Home, or to the screen's own back handler, instead of closing the app. Before a back handler runs, the history entry is pushed again, so if the handler stays on the screen (quick game: Back → Cancel) the next Back reaches the app again.
- **Stored data is untrusted**: `sanitizeSettings` and `getStats` keep only fields with the right type (an invalid stored language falls back to the device language, not English). The classic save goes through `migrateState` + `isValidState` (players array of 1–6 valid objects, colors, charges, lifelines 0/1, `current` in range, known categories without duplicates, known phase, `pending.order` a permutation of 0–3; `fx.removed` at most 2 wrong options, `fx.struck` at most 1 and disjoint from it, Atium and Stormlight effects never together; `clock.remaining` an integer 0–30000; charges 0–2; a current player with every gem infused only in `final-intro` / final question / a handoff to them, and a final question only for such a player; `pending.cat` in the game's categories and equal to the question's category; unique player colors; per-player stats consistent); the quick save through `isValidRun` (`correct ≤ index`, `correct·100 ≤ score ≤ correct·200`); the saved quick result must agree with the best score (a record equals it, otherwise it is ≤ it). Invalid or unparseable saves are deleted, so "Continue" only appears for a save that works.
- **Questions**: in the data, `o[0]` is always the correct answer. The question card shuffles the display order (`shuffledOrder()`), and the classic and quick games save that order so a reload shows the same layout. The option buttons carry no index: the position → correctness map lives only in the card's closure.
- **Timer** (decision 1.4.0: once revealed, a question's time runs in real time even while the player is away): `questionView({ timer, clock, onClockChange })` keeps `clock = { remaining, savedAt }`: the time left in ms (0–30000) and the wall time (epoch ms) it was measured at. While the card is on screen the countdown uses `performance.now()` (system clock changes don't matter); `remaining`/`savedAt` are written back about once a second and on `pagehide`, `visibilitychange` → hidden and leaving the screen (Home, Back, re-render). When the question is shown again or the page becomes visible, `clockLeft(clock)` (game.js) deducts the wall time since `savedAt` (negative or NaN elapsed → 0, result capped at ≥ 0); at 0 it resolves as a timeout as soon as it is shown. `savedAt: null` means paused: only the quick game's quit dialog does that, and only while it is on screen (`pauseTimer()` / `resumeTimer()`; the question is blurred; hiding or unloading the page with the dialog open lets the time run again). The handoff of a resumed game never shows the question: a question not revealed yet has no clock, so nothing is deducted; one revealed before leaving keeps its `savedAt`, so the away time counts. The classic Home/Back during a revealed timed question asks first (`classic.leaveTimer*`: "the time keeps running"). Saves from 1.2 (`clock.deadline`) are converted once by `migrateClock`.
- **Pool**: built from the loaded questions minus the works disabled in the spoiler filter. `used` maps each category to the ids already asked. A question is not repeated until every candidate for that draw has been used, and when a category starts over the question asked last stays out of the new round (never twice in a row). `drawAny`/`drawAnyLeveled` choose the category weighted by its unused questions, so in practice "all worlds" every question is equally likely. Classic games keep `used` in their saved state. Quick and practice share one in-memory set per app session.
- **Quick game**: `quickPlan(pool, level, 15)` shares the slots between categories in proportion to the questions each offers at the level (largest remainder, capped at what each category holds; the total is capped at the pool size), then shuffles them. `run.seen` lists the ids asked in the run and `Pool.drawUnseen` never returns one of them (Breath also skips them). The run (plan, index, score, lifelines, level, seen, current question with fx and clock) is saved under `cosmere-trivia:quick` after every step; Home offers "Continuar partida rápida". It is deleted when the run finishes or is abandoned. A finished run leaves its summary under `cosmere-trivia:quickResult` until the results screen is left (Play again, Home, Back), so a reload there (`main.js`) shows the results once more without counting the game twice.
- **Classic state** (`localStorage` key `cosmere-trivia:classic`): it is saved after every transition. The phases are `handoff → spin → (choose) → question → …`, plus `final-intro` and `won`. A pending question (id, category, option order, final flag, lifeline `fx`, `clock`) is saved before it is shown, so reloading can't re-roll it. A pending question is looked up with `Pool.getAny` (ignores the spoiler filter), so changing the filter or settings never re-draws it or refreshes its timer; only a question that vanished from the data is replaced (keeping its clock). The same applies to the quick game's `run.current`. On resume, the categories are checked again against the current spoiler filter (the pending question's category is kept until it is answered) and the final-question phases are kept consistent. Resuming from Home (`go('classic', { resume: true })`) in a multi-player game stores the phase in `state.resume` and shows the handoff first. `newClassicGame` draws the starting player (`state.first` shows "Empieza: …" once); `applyAnswer` counts `state.streak` and passes the turn after `MAX_STREAK` (3) correct answers when there are 2+ players (`result.streakEnd`); if that answer infused the last gem the feedback also says so (`classic.allInfusedNext`) and the final question comes on the player's next turn. When the wheel lands on an already-infused gem, the notice stays ~2.5 s (or until tapped) before the world choice. The final question (`drawFinal`) prefers questions not yet asked in the game.
- **Game level** (SPEC v2): `LEVELS` in `config.js` gives each level its difficulty weights and its final-question difficulty. `Pool.drawLeveled(cat, level)` first picks a target difficulty by weight. If that difficulty has no unused question in the category, it uses the nearest difficulty that has one, preferring difficulties inside the level and going at most one step outside it (Easy can fall back to 2, Expert to 2). Past that, it recycles the level's own questions. Because of this, an empty difficulty-4 pool behaves as if its weight went to difficulty 3. `Pool.drawFinal(cats, target)` uses the nearest available difficulty and prefers the harder one on ties. Both classic setup and the quick intro use the shared `levelPicker` from `core.js`, and the last choice is saved as `settings.level` (default `normal`). The game bar shows `levelBadge`. Practice offers difficulties 1–4. When the chosen difficulty has no questions, it shows a note and draws the nearest difficulty instead.
- **Lifelines** (SPEC v2): `components/question.js` implements the rules and `components/lifelines.js` renders the row (three buttons, a "?" help panel and a live status line). A screen turns lifelines on by passing `lifelines: { left, breathOk, fx, onUse, onChange }` to `questionView`. `left` holds the remaining uses, which the screen decrements in `onUse`. `fx = { removed, struck, armed }` holds the effects on the current question; it is changed in place so classic mode can save it in `state.pending.fx` and restore it after a reload.
  - Atium: removes two random wrong options that are still available.
  - Stormlight: is armed before answering and is spent when armed. A wrong pick is then struck and the player picks again, with no reveal. The timer keeps running, and a timeout still counts as a miss.
  - Breath: the screen calls `pool.drawAlternative(q)` (same category and difficulty) and re-renders with a new clock. An armed Stormlight carries over (`emptyFx(true)`). The button is disabled when `pool.hasAlternative(q)` is false.
  - Atium and Stormlight are exclusive on one question (Atium used → Stormlight disabled, Stormlight armed or spent → Atium disabled). Disabled-but-available lifelines show their reason in `.lifeline-reasons` under the row, not only in `title`/`aria-label`.

  Classic games keep `player.lifelines` (1 of each per player). Quick games keep `run.lifelines`, plus `run.current` so the question on screen survives a re-render. Practice and the final question pass no `lifelines`. Each use is counted in `stats.lifelines`.
- **Classic state migration**: `STATE_VERSION` is 3. `migrateState` upgrades v1 saves to v2 (level `normal`, a full set of lifelines for every player) and v2 to v3 (`streak: 0`, `first: false`); `loadSavedGame` writes the upgraded save back.
- **Layout notes**: the top bar and the lifeline row are CSS size containers. With big text (container narrower than 16em / 15em) the title moves to its own row and wraps, and the lifelines stack as full-width rows, so nothing is cut or broken mid-word. The game-bar title "Turno de {name}" is split so only the name gets an ellipsis. The compact player board is a grid (1–3 players in one row, 4 in 2×2, 5–6 in three columns) that switches to a dense layout (gem color as the left edge, mini gems) for 3+ players or a narrow board, so the current player is always on screen.
- **First-run introduction** (`screens/onboarding.js`): `main.js` opens it over Home while the sanitized settings lack `onboarded: true` (`needsOnboarding()`), so missing, corrupt or null settings show it; `settings.onbStep` remembers the step so a reload resumes there with the picks kept. Players with stats or a saved game but no flag get `onboarded: true` silently (`hasPlayed()`). Step 1 is the spoiler filter (`components/spoilers.js`, shared with Settings: works grouped by world with official titles from `works.js`, "Todo"/"Nada", folded per world here; counters wrap below the world name with big text); it starts with nothing selected, has an "I've read everything" shortcut, and "Next" stays disabled with the reason (`onboarding.pickOne`) until a work is selected. Skipping with nothing picked clears the filter. Step 2 is the rules, step 3 start. About has "Ver introducción".
- **Empty spoiler filter**: `filterIsEmpty()` + `noQuestionsBanner()` (core.js): Home, classic setup (start disabled) and the quick intro warn with a button to Settings; a classic or quick game that has no category left shows `classic-empty` / `quick-empty` (the save is kept) instead of spinning. A question already pending still plays.
- **Recently seen questions**: `core.noteSeen(id)` keeps a ring buffer of the last `RECENT_MAX` (150) ids per language under `cosmere-trivia:recent`; `makePool` passes a recency tracker to `Pool`, whose draws prefer candidates not seen lately, then the least recently seen (quick, practice and classic). `Pool.recycled` tells practice that every available question was seen in the session (`practice.allSeen`).
- **Victory**: each classic player keeps `stats = { answered, correct, lifelines }` and the game keeps `playMs` (time on screen between saves, each gap capped at 5 min); the victory screen lists them with the gems infused. "Play again" opens setup with the same players, colors, timer and level.
- **i18n templates**: labels such as `cat.*` are inserted as-is, so every `{category}` / `{world}` template puts the label at the start, after a colon or middle dot, or alone (`+1 carga · El Cosmere (1/2)`, `Edelstein aufgeladen: Andere Welten`); edge.mjs checks this in all languages. In Spanish the lifelines group is "Ayudas" (the wheel sector stays "Comodín").
- **Settings and stats** are stored under the `cosmere-trivia:` prefix. The settings store disabled works, not enabled ones, so works added later are on by default.

### Service worker and offline

`sw.js` precaches the app shell and `i18n/en.json`. Once the app knows the active language, it asks the service worker (`postMessage({type:'cache-urls'})`) to cache that language's `data/questions.<lang>.json` and `i18n/<lang>.json`. This follows SPEC §1: only the active language is downloaded. All same-origin GETs are stale-while-revalidate, so new question data shows up on the next launch after it was fetched.

**When you change any shell file** (JS, CSS, HTML, icons), bump `CACHE_VERSION` in `sw.js`. Also bump `APP_VERSION` in `js/config.js`, which is shown in About. If you add a JS module, add it to `SHELL` in `sw.js`.

## How to add a language

1. Add the code to `LANGS` and `LANG_NAMES` in `app/js/config.js`, and to `LANGS` in `tools/build.mjs`. The build script belongs to the content pipeline, so coordinate that change with the content team.
2. Copy `app/i18n/en.json` to `app/i18n/<code>.json` and translate it. The keys must match exactly; any missing key falls back to English. Keep the `{placeholders}` as they are. Category names (`cat.*`) and gem names (`gem.*`) are in this file too.
3. Add `<code>: { ... }` to `WORK_TITLES` in `app/js/works.js`, using the official published titles.
4. Add `content/<code>/*.json` translations and run `node tools/build.mjs` to produce `app/data/questions.<code>.json`.
5. Bump `CACHE_VERSION` in `sw.js`.

`detectLang()` reads the primary subtag of each `navigator.languages` entry; `LANG_ALIASES` maps Catalan, Galician and Basque (`ca`, `gl`, `eu`, any region) to Spanish. The user's choice in Settings is saved and overrides detection. If you add a JS module, also add it to `SHELL` in `sw.js`; strings needed by the startup error screen go in the `boot` section (and the built-in copy in `boot-error.js`).

## Icons

```sh
python3 tools/make-icons.py
```

This writes `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (artwork inside the 80% safe zone), `apple-touch-icon.png` (180 px) and `icon.svg` (favicon).
