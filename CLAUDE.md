# Working on masterbook

## Every parsing fix needs a regression test — no exceptions

If a recipe URL or pasted text doesn't parse correctly (wrong title,
mangled ingredients, instructions polluted with page chrome, etc.), the
fix is not done until there's a test in `server/tests/` that reproduces
the exact failure and would catch it regressing.

This applies to `parseIngredientLine.ts`, `parseManualPaste.ts`, and
`fetchRecipeFromUrl.ts` (website fetching/extraction) alike.

**How to do this for a website-fetch bug specifically**: don't write a
test that hits a real URL over the network. `fetchRecipeFromUrl.ts`
exports `extractRecipeFromHtml(html, url)` — the actual parsing logic,
separated from the `fetch()` call — specifically so a test can hand it a
small fixture HTML string reproducing the bug's structural conditions
(the misleading class names, the wrapper nesting, whatever tripped it up)
without depending on a live site's markup staying the same forever. See
`server/tests/fetchRecipeFromUrl.test.ts` for the pattern.

**Workflow when the user brings a new URL/paste that parses wrong:**
1. Actually run it through the real code (curl the dev server's
   `/api/ingest/website/fetch`, or call `parseManualPaste`/
   `parseIngredientLine` directly) — diagnose from real output, don't
   guess-fix from reading the source alone.
2. Fix the root cause.
3. Write a fixture-based test that reproduces the original failure and
   passes against the fix. Verify it actually fails on the pre-fix code
   if there's any doubt it's really exercising the bug.
4. Only then is the fix considered shipped.

This was skipped once already (commit `20acd33`, the bakeomaniac.com
fix) — verified live but never turned into a committed test — and got
called out for it. Don't skip it again.

## Other standing conventions

- **"Commit" means commit AND push.** Don't ask, don't narrate it as a
  separate step — the normal safety checks (diff review, PII sweep)
  still happen first.
- **Never commit real user/recipe data or secrets.** `data/`,
  `epub-sources/`, `*.db*`, `*.epub`, `.env`, `firebase-service-account.json`
  all stay gitignored. Sweep every diff for stray secrets/PII before
  pushing.
- **Migrations**: any `ALTER TABLE` + backfill in `server/src/db/migrate.ts`
  must guard the backfill *inside* the same "column doesn't exist yet"
  branch, never as an unconditional statement that runs on every boot —
  otherwise a later legitimately-pending/different-state row gets
  silently overwritten on the next restart. Every migration gets its own
  regression test against a real in-memory `better-sqlite3` db (see
  `migrateUserApproval.test.ts`, `migratePerUserFavoritesAndQueue.test.ts`,
  `migrateAttemptOwnership.test.ts`, `siteStatus.test.ts` for the pattern).
- **No hosting/deployment specifics in this repo, ever** (README, code
  comments, commit messages) — no real ports, internal hostnames, host
  hardware, usernames, or absolute paths tied to the actual live
  deployment. This repo is public. Generic/local-dev info is fine.
- **EPUB is admin-only** (`requireAdmin` on `/api/epub`) — a known
  unpatched vulnerability in a transitive dependency (`adm-zip`, via
  `epub2`) makes upload a real attack surface for any approved (not just
  admin) account. Don't widen this back out without that dependency
  issue actually being resolved first.
