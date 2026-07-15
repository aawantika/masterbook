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

  const ingredientColumns = db.prepare('PRAGMA table_info(recipe_ingredients)').all() as Array<{ name: string }>;
  if (!ingredientColumns.some((c) => c.name === 'section')) {
    db.exec('ALTER TABLE recipe_ingredients ADD COLUMN section TEXT');
  }
}

export function migrate(): void {
  db.exec(getSchemaSql());
  migrateRecipeTimeColumns();
  migrateNewColumns();

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
