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

  const ingredientColumns = db.prepare('PRAGMA table_info(recipe_ingredients)').all() as Array<{ name: string }>;
  if (!ingredientColumns.some((c) => c.name === 'section')) {
    db.exec('ALTER TABLE recipe_ingredients ADD COLUMN section TEXT');
  }
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

export function migrate(): void {
  db.exec(getSchemaSql());
  migrateRecipeTimeColumns();
  migrateNewColumns();
  migrateInstructionsShape();

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
