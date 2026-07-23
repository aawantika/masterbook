# Masterbook

A personal, local-only recipe database — unifies recipes pulled from EPUB cookbooks, Instagram saves, and website pastes into one searchable app. Search/filter by meal type, ingredient, and cuisine; track a "want to try" queue; keep a running cooking log (date, rating, notes/adjustments) per recipe across multiple attempts.

## Why local-only

Some recipes here are extracted from personal EPUB copies of copyrighted cookbooks. This app never syncs anywhere, never hosts on the public internet, and the server binds to `127.0.0.1` only. The app's code lives in this repo; your actual recipe data (the SQLite database, any imported EPUB files) lives in gitignored local folders (`data/`, `epub-sources/`) and never leaves your machine. Cloning this repo gives you the app, not anyone's recipes — each person who runs it builds their own local cookbook.

## Stack

- **Server**: Node/TypeScript, Express, `better-sqlite3` (SQLite with FTS5 full-text search)
- **Web**: React + Vite SPA, proxied to the server in dev
- npm workspaces monorepo (`server/`, `web/`), single `npm run dev` runs both

## Getting started

```
npm install
npm run dev
```

This starts the Express API on `http://127.0.0.1:3001` and the Vite dev server on `http://127.0.0.1:5173` (proxying `/api` to the server). Open `http://127.0.0.1:5173` in Chrome.

**To make it feel like a standalone app** (Dock icon, no address bar) rather than a browser tab: with the page open in Chrome, use the menu → "Cast, Save, and Share" → "Install page as app." It's still a regular local web page underneath — no Electron, no extra build step — just pinned like a native app.

The database (`data/cookbook.db`) is created and migrated automatically on first server start; meal types and cuisine suggestions are seeded automatically too.

## Adding recipes

- **Instagram / website**: go to "+ Add recipe," paste the recipe text, choose a source type, and hit "Parse recipe." It'll do a best-effort split into title/ingredients/instructions — review and fix in the editor before saving (the parser is a heuristic, not magic; the original pasted text is always preserved alongside whatever it guesses).
- **EPUB cookbooks**: not yet wired up. The schema (`epub_sources`, `epub_candidates`) is already in place for it; the extraction pipeline (heuristic chapter/segment parsing + a review queue reusing the same editor) is a planned follow-up, sequenced after the rest of the app was working end-to-end.

## Features

- **Search/filter**: full-text search (title, ingredients, instructions) combined with meal-type, cuisine, and ingredient filters — AND across filter categories, OR within a category's multi-select.
- **Want-to-try queue**: star any recipe to add it to a lightweight queue, independent of the cooking log; filter the search page down to just that queue.
- **Cooking log**: log an attempt (date, 1–5 rating, freeform notes/adjustments) any time you make a recipe. One recipe can have many logged attempts over time. Average rating and last-cooked date are computed from this log, not stored separately.
- **Full CRUD**: create, edit (same editor, pre-filled), and delete any recipe.

## Project layout

```
server/src/
  db/            schema.sql, better-sqlite3 client, migration + seed
  ingestion/     shared parsing heuristics (manual paste; reused later by EPUB review)
  routes/        recipes (CRUD + search), attempts (cooking log), meta, ingest
web/src/
  api/           typed fetch client + shared types
  components/    RecipeDraftEditor (shared create/edit), FilterBar, RecipeCard, CookingLogList
  pages/         SearchPage, RecipeDetailPage, ImportManualPage
```

## What's not committed (and why)

See `.gitignore` — `data/` (the SQLite DB itself) and `epub-sources/` (any imported EPUB files) are excluded wholesale, plus `*.db*`/`*.epub` are excluded by extension too as a second line of defense. This is deliberate: this repo should never end up holding a real recipe database or copyrighted book content, even by accident.

## Roadmap

- EPUB ingestion pipeline (`epub2` for parsing, heuristic chapter/segment splitting into review candidates, reusing the manual-paste editor for review/confirm).
- Remote/phone access was considered and deliberately deferred — staying `127.0.0.1`-only for now. If it matters later, the planned approach is [Tailscale](https://tailscale.com) (an encrypted device-to-device tunnel between just your own devices), not actually hosting the app publicly.
