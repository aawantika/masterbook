import { db, getSchemaSql } from './client.js';
import { seed, pruneStaleCuisines } from './seed.js';

// Ad-hoc column migration for existing dev databases — `CREATE TABLE IF NOT
// EXISTS` in schema.sql only affects brand-new tables, so a real schema
// change on an already-created table needs an explicit ALTER TABLE step,
// guarded by checking what columns currently exist.
function migrateRecipeTimeColumns(): void {
  const columns = db.prepare('PRAGMA table_info(recipes)').all() as Array<{ name: string }>;
  const names = new Set(columns.map((c) => c.name));

  if (!names.has('total_time_minutes')) {
    db.exec('ALTER TABLE recipes ADD COLUMN total_time_minutes INTEGER');
    if (names.has('prep_time_minutes') || names.has('cook_time_minutes')) {
      db.exec(`
        UPDATE recipes
        SET total_time_minutes = COALESCE(prep_time_minutes, 0) + COALESCE(cook_time_minutes, 0)
        WHERE prep_time_minutes IS NOT NULL OR cook_time_minutes IS NOT NULL
      `);
    }
  }
  if (names.has('prep_time_minutes')) db.exec('ALTER TABLE recipes DROP COLUMN prep_time_minutes');
  if (names.has('cook_time_minutes')) db.exec('ALTER TABLE recipes DROP COLUMN cook_time_minutes');
}

function migrateNewColumns(): void {
  const columns = db.prepare('PRAGMA table_info(recipes)').all() as Array<{ name: string }>;
  const names = new Set(columns.map((c) => c.name));
  if (!names.has('favorited_at')) db.exec('ALTER TABLE recipes ADD COLUMN favorited_at TEXT');
  if (!names.has('image_url')) db.exec('ALTER TABLE recipes ADD COLUMN image_url TEXT');
  if (!names.has('source_name')) db.exec('ALTER TABLE recipes ADD COLUMN source_name TEXT');
  if (!names.has('video_ref')) db.exec('ALTER TABLE recipes ADD COLUMN video_ref TEXT');
  if (!names.has('needs_fixing_at')) db.exec('ALTER TABLE recipes ADD COLUMN needs_fixing_at TEXT');

  const ingredientColumns = db.prepare('PRAGMA table_info(recipe_ingredients)').all() as Array<{ name: string }>;
  if (!ingredientColumns.some((c) => c.name === 'section')) {
    db.exec('ALTER TABLE recipe_ingredients ADD COLUMN section TEXT');
  }
}

// epub_candidates was scaffolded early on for a heuristic "auto-detect every
// recipe, review a queue later" workflow that the actual EPUB import feature
// doesn't use (extraction is interactive -- browse, select blocks, extract
// straight into the normal recipe editor, no pending state to persist).
// DROP TABLE IF EXISTS is naturally idempotent, unlike the column-existence
// checks above, since schema.sql no longer CREATEs it either.
function dropEpubCandidatesTable(): void {
  db.exec('DROP TABLE IF EXISTS epub_candidates');
}

// instructions_json used to store a flat string[]; it's now
// { text, section }[] so sub-steps under a source's section headers (e.g.
// "To Make the Tartar Sauce") can be tracked instead of collapsed into one
// blob. Existing rows still hold the old shape until rewritten here —
// runs once per row, converting only rows whose first element is a bare
// string (the old shape's telltale sign).
function migrateInstructionsShape(): void {
  const rows = db.prepare('SELECT id, instructions_json FROM recipes').all() as Array<{
    id: number;
    instructions_json: string;
  }>;
  const update = db.prepare('UPDATE recipes SET instructions_json = ? WHERE id = ?');
  for (const row of rows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.instructions_json || '[]');
    } catch {
      continue;
    }
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
      const migrated = (parsed as string[]).map((text) => ({ text, section: null }));
      update.run(JSON.stringify(migrated), row.id);
    }
  }
}

// recipes.user_id is a column addition on an existing table (the `users`
// table itself is brand new, so it "just migrates" via schema.sql above --
// this only needs the guarded ALTER TABLE pattern). Stays nullable, same as
// every other ALTER-added column here, since SQLite can't retrofit NOT NULL
// without a table rebuild. Backfills any still-unowned recipe onto the
// admin account -- idempotent (only touches NULL rows), safe to run before
// an admin exists yet (no-op until the first admin logs in and gets a
// users row via requireAuth's lazy creation).
function migrateOwnership(): void {
  const columns = db.prepare('PRAGMA table_info(recipes)').all() as Array<{ name: string }>;
  const names = new Set(columns.map((c) => c.name));
  if (!names.has('user_id')) {
    db.exec('ALTER TABLE recipes ADD COLUMN user_id INTEGER REFERENCES users(id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_recipes_user ON recipes(user_id)');
  }
  backfillRecipeOwnership();
}

// Also called by requireAuth right after the bootstrap admin is created, so
// pre-accounts recipes (e.g. a database carried over from local-only use)
// are owned immediately instead of only after the next server restart.
export function backfillRecipeOwnership(): void {
  const admin = db
    .prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1")
    .get() as { id: number } | undefined;
  if (admin) db.prepare('UPDATE recipes SET user_id = ? WHERE user_id IS NULL').run(admin.id);
}

// Favorites/queue used to be recipes.favorited_at/want_to_try_at -- single
// columns shared by everyone. Moving them to per-user junction tables (see
// schema.sql's recipe_favorites/recipe_want_to_try, already created by
// db.exec(getSchemaSql()) before this runs) needs a backfill: every recipe
// in this app so far was both added *and* favorited/queued by the same
// single user (there was only ever one user before accounts existed), so
// attributing each existing global flag to the recipe's owner is not a
// guess -- it's the actual correct history for every real row this will
// ever run against. A recipe with no owner (legacy/unowned) can't be
// attributed to anyone and is simply left out of the per-user tables --
// nobody "loses" a favorite that has no recorded owner to give it to
// anyway. Guarded on column presence, same one-time-branch pattern as
// migrateUserApproval above, so a restart after the columns are already
// gone never tries to re-run this (they won't exist to check against).
function migratePerUserFavoritesAndQueue(): void {
  const columns = db.prepare('PRAGMA table_info(recipes)').all() as Array<{ name: string }>;
  const names = new Set(columns.map((c) => c.name));

  if (names.has('favorited_at')) {
    db.exec(`
      INSERT OR IGNORE INTO recipe_favorites (recipe_id, user_id, favorited_at)
      SELECT id, user_id, favorited_at FROM recipes
      WHERE favorited_at IS NOT NULL AND user_id IS NOT NULL
    `);
    db.exec('ALTER TABLE recipes DROP COLUMN favorited_at');
  }
  if (names.has('want_to_try_at')) {
    db.exec(`
      INSERT OR IGNORE INTO recipe_want_to_try (recipe_id, user_id, want_to_try_at)
      SELECT id, user_id, want_to_try_at FROM recipes
      WHERE want_to_try_at IS NOT NULL AND user_id IS NOT NULL
    `);
    db.exec('ALTER TABLE recipes DROP COLUMN want_to_try_at');
  }
}

// recipe_attempts.user_id is purely attribution (see schema.sql) -- every
// attempt logged before this column existed was logged by whoever added
// the recipe it belongs to (same single-user history reasoning as
// migratePerUserFavoritesAndQueue above), so that's what it backfills onto.
// An attempt on an unowned/legacy recipe is left unattributed (NULL) rather
// than guessed at -- the activity log just shows no name for those, same
// as it shows no "added by" for an unowned recipe card.
function migrateAttemptOwnership(): void {
  const columns = db.prepare('PRAGMA table_info(recipe_attempts)').all() as Array<{ name: string }>;
  if (!columns.some((c) => c.name === 'user_id')) {
    db.exec('ALTER TABLE recipe_attempts ADD COLUMN user_id INTEGER REFERENCES users(id)');
    db.exec(`
      UPDATE recipe_attempts
      SET user_id = (SELECT r.user_id FROM recipes r WHERE r.id = recipe_attempts.recipe_id)
      WHERE user_id IS NULL
    `);
  }
}

// users.approved_at is a column addition on an existing table -- same
// guarded-ALTER pattern as migrateOwnership above. Every account that
// exists the *first* time this migration ever runs (the bootstrap admin,
// anyone admin-created so far) was already implicitly trusted under the
// old all-or-nothing model, so they're backfilled as approved rather than
// suddenly locked out the moment self-signup lands. The backfill UPDATE
// deliberately lives inside this same one-time branch, not as an
// unconditional statement run on every boot -- otherwise a newly
// self-signed-up *pending* user would get silently auto-approved the next
// time the server restarts, defeating the whole approval gate.
function migrateUserApproval(): void {
  const columns = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  if (!columns.some((c) => c.name === 'approved_at')) {
    db.exec('ALTER TABLE users ADD COLUMN approved_at TEXT');
    db.exec('UPDATE users SET approved_at = created_at WHERE approved_at IS NULL');
  }
}

function migrateUserDisplayName(): void {
  const columns = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  if (!columns.some((c) => c.name === 'display_name')) {
    db.exec('ALTER TABLE users ADD COLUMN display_name TEXT');
  }
}

function migrateUserAvatarUrl(): void {
  const columns = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  if (!columns.some((c) => c.name === 'avatar_url')) {
    db.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT');
  }
}

// site_status is brand new (schema.sql's CREATE TABLE IF NOT EXISTS handles
// the table itself), but it needs exactly one row to hang the freeze toggle
// off of. INSERT OR IGNORE is safe to run every boot, unlike the approval
// backfill above -- it can only ever create the row if it's missing, never
// overwrite an existing row's frozen_at, so it can't accidentally
// un-freeze (or re-freeze) the site on a restart.
function ensureSiteStatusRow(): void {
  db.exec('INSERT OR IGNORE INTO site_status (id, frozen_at, frozen_by, frozen_message) VALUES (1, NULL, NULL, NULL)');
}

export function migrate(): void {
  db.exec(getSchemaSql());
  migrateRecipeTimeColumns();
  migrateNewColumns();
  migrateInstructionsShape();
  dropEpubCandidatesTable();
  migrateOwnership();
  migratePerUserFavoritesAndQueue();
  migrateAttemptOwnership();
  migrateUserApproval();
  migrateUserDisplayName();
  migrateUserAvatarUrl();
  ensureSiteStatusRow();

  const fts5Check = db.prepare(
    "SELECT count(*) as count FROM pragma_compile_options WHERE compile_options LIKE '%FTS5%'"
  ).get() as { count: number };
  if (fts5Check.count === 0) {
    throw new Error(
      'This SQLite build does not have FTS5 compiled in — search will not work. ' +
      'Reinstall better-sqlite3 or check its build flags.'
    );
  }

  seed();
  pruneStaleCuisines();
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  migrate();
  console.log('Migration + seed complete.');
}
