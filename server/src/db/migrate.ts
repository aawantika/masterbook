import { db, getSchemaSql } from './client.js';
import { seed } from './seed.js';

export function migrate(): void {
  db.exec(getSchemaSql());

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
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  migrate();
  console.log('Migration + seed complete.');
}
