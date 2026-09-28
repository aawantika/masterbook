# Masterbook

A personal, self-hosted recipe database — unifies recipes pulled from EPUB cookbooks, Instagram saves, and website pastes into one searchable app. Search/filter by meal type and cuisine; track a "want to try" queue, favorites, and a "needs fixing" flag for recipes you want to come back and clean up; keep a running cooking log (date, rating, notes/adjustments) per recipe across multiple attempts; browse a global activity log across every recipe you've cooked.

## Privacy model

Some recipes here are extracted from personal EPUB copies of copyrighted cookbooks, so this app is private by design: it's self-hosted on one machine (a Mac mini, via Docker) and shared only with an invite-only list of friends and family through Firebase Auth. There's no public sign-up — the first account to ever log in becomes the admin, and everyone else must be added by the admin from the Users page. Every API route requires a Firebase ID token, and image routes (which `<img>` tags can't attach a token to) require a Firebase session cookie set at login.

The app's code lives in this repo; your actual recipe data (the SQLite database, saved recipe images, any imported EPUB files) and secrets (Firebase service-account key, Cloudflare tunnel token) live in gitignored local files and never get committed. Cloning this repo gives you the app, not anyone's recipes.

## Stack

- **Server**: Node/TypeScript, Express, `better-sqlite3` (SQLite with FTS5 full-text search)
- **Web**: React + Vite SPA, proxied to the server in dev
- npm workspaces monorepo (`server/`, `web/`), single `npm run dev` runs both

## Self-hosting (Docker + Cloudflare Tunnel)

This is how the real deployment runs: one container serves both the built React app and `/api/*` on port 3001, and a `cloudflared` container exposes it at a public hostname through a Cloudflare Tunnel (outbound-only — no router port-forwarding). The app's port is bound to `127.0.0.1` on the host, so it isn't reachable from the LAN directly.

**One-time setup**

1. **Firebase** (console.firebase.google.com): create a project; enable Authentication → Email/Password; under Authentication → Settings → User actions, **disable "Enable create (sign-up)"**; add your tunnel hostname under Authentication → Settings → Authorized domains. Register a Web app and paste its config into `web/src/firebase.ts`. Generate a service-account key (Project settings → Service accounts) and save it as `firebase-service-account.json` in the repo root (gitignored — must exist before `docker compose up`, or Docker mounts an empty directory in its place).
2. **Cloudflare**: with a domain on Cloudflare, create a tunnel in Zero Trust → Networks → Tunnels (Docker connector). Add a public hostname pointing at `http://masterbook:3001`. Put the token in a gitignored `.env` file in the repo root: `TUNNEL_TOKEN=...`
3. **Data**: copy an existing `data/` folder (containing `cookbook.db` and `images/`) and `epub-sources/` into the repo root, or start empty. Stop any running server first so the SQLite WAL is checkpointed into `cookbook.db`. Older databases are migrated automatically on startup.
4. **Log in first yourself** — the first login becomes admin and is assigned ownership of all existing recipes. Then add others from the Users page (they receive a Firebase password-reset email to set their password).

**Run / update**

```
git pull
docker compose --profile tunnel up -d --build
```

`data/` and `epub-sources/` are bind-mounted volumes — they're the app's entire durable state. Moving to new hardware is copying those two folders plus the two secrets and running the same command.

**Host setup (Mac mini)**: disable sleep and auto-restart after power loss (`sudo pmset -a sleep 0 autorestart 1`), and set Docker Desktop to start at login.

## Local development

```
npm install
npm run dev
```

This starts the Express API on `http://127.0.0.1:3001` and the Vite dev server on `http://127.0.0.1:5173` (proxying `/api` to the server). Open `http://127.0.0.1:5173` in Chrome.

**To make it feel like a standalone app** (Dock icon, no address bar) rather than a browser tab: with the page open in Chrome, use the menu → "Cast, Save, and Share" → "Install page as app." It's still a regular local web page underneath — no Electron, no extra build step — just pinned like a native app.

The database (`data/cookbook.db`) is created and migrated automatically on first server start; meal types and cuisine suggestions are seeded automatically too.

## Adding recipes

- **Instagram / website / manual paste**: go to "+ Add recipe," paste a link (or the recipe text directly), and hit "Fetch recipe" (or "Parse recipe" for pasted text). It does a best-effort split into title/ingredients/instructions — review and fix in the editor before saving. The parser is a heuristic, not magic, so the original pasted/fetched text is always preserved alongside whatever it guesses.
  - Instagram and YouTube pages don't carry fetchable recipe data (login-gated / JS-rendered / no structured markup), so those links skip straight to "paste the text yourself, I'll structure it."
  - Some sites actively block fetching altogether (bot protection, not just JS rendering) — for those, "Skip — just save the link(s)" opens the editor with the link pre-filled so you're not stuck hand-transcribing a whole recipe just to bookmark it.
  - A recipe can have both a written source (`sourceRef`) and a separate companion video (`videoRef`) at once — e.g. a blog post plus its YouTube demo — shown side by side on the detail page.
  - Instagram/YouTube recipes get an embedded video player (via each platform's own public embed endpoint) on the detail page. Instagram never exposes a scrapable static image, so if you find one yourself (e.g. via the browser's dev tools on the rendered post), pasting the URL into the editor's Image field and hitting "Save locally" downloads the actual bytes to `data/images/` — Instagram's own image URLs are signed and expire after a few days, so this makes it permanent.
- **EPUB cookbooks**: upload an EPUB from the EPUB library page, browse it in the built-in reader, select the blocks that make up a recipe, and extract them straight into the normal recipe editor. Bookmarks let you tag recipes within a book to come back to.

## Features

- **Search/filter**: full-text search (title, ingredients, instructions) combined with meal-type and cuisine filters — AND across filter categories, OR within a category's multi-select. Grid or list view; everything sorts alphabetically by title.
- **Want-to-try queue, favorites, and "needs fixing"**: three independent per-recipe flags (★ / ♥ / 🔧), each with its own sidebar section and filter chip — queue what you want to cook, favorite what you love, flag what needs a parsing/formatting cleanup for later.
- **Cooking log**: log an attempt (date, 1–5 rating, freeform notes/adjustments) any time you make a recipe. One recipe can have many logged attempts over time. Average rating and last-cooked date are computed from this log, not stored separately. A global **activity log** page lists every logged attempt across all recipes, newest first.
- **Ingredient/instruction editing**: drag-and-drop reordering (including across section boundaries) for both ingredients and instruction steps, plus section grouping with move-up/down and remove-section controls. Ingredient parsing handles bilingual "NAME | translation quantity unit" lines, size descriptors ("1 medium onion"), article quantities ("a pinch of X"), and prefers an explicit metric weight ("113g") over a compound imperial measurement ("1/2 cup + 2 tbsp") when a site gives both.
- **Full CRUD**: create, edit (same editor, pre-filled), and delete any recipe.

## Testing

`npm test` (or `npm run test -w server`) runs the ingestion parser regression suite (`server/tests/`) — every parsing bug fix that's landed gets a test case here, covering both `parseIngredientLine.ts` and `parseManualPaste.ts`.

## Project layout

```
server/src/
  db/            schema.sql, better-sqlite3 client, migration + seed
  ingestion/
    shared/      parseIngredientLine.ts, parseManualPaste.ts — reused by manual paste and (later) EPUB review
    website/     fetchRecipeFromUrl.ts — JSON-LD/microdata extraction for site fetches
  routes/        recipes (CRUD + search), attempts (cooking log), images (local image save), meta, ingest
server/tests/    parser regression suite (node:test)
web/src/
  api/           typed fetch client + shared types
  components/    RecipeDraftEditor (shared create/edit), RecipeCard/RecipeListRow, RecipeDetailPanel,
                 Sidebar, FilterBar, CookingLogList/Panel, ImportPanel
  pages/         BrowsePage, RecipeDetailPage, AddRecipePage, ActivityPage
```

## What's not committed (and why)

See `.gitignore` — `data/` (the SQLite DB, plus any recipe images saved locally under `data/images/`) and `epub-sources/` (any imported EPUB files) are excluded wholesale, plus `*.db*`/`*.epub` are excluded by extension too as a second line of defense. This is deliberate: this repo should never end up holding a real recipe database or copyrighted book content, even by accident.

## Roadmap

- Automated nightly SQLite backups off the host machine.
