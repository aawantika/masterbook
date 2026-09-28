import fs from 'node:fs';
import path from 'node:path';
import { db, dbPath, imagesDir, epubSourcesDir } from './client.js';
import { resolveDisplayName } from './users.js';

export type UserRecipeCount = {
  userId: number | null;
  name: string;
  recipeCount: number;
};

export type SiteStats = {
  totalRecipes: number;
  totalUsers: number;
  perUser: UserRecipeCount[];
  storage: {
    databaseBytes: number;
    imagesBytes: number;
    epubSourcesBytes: number;
    totalBytes: number;
  };
};

// Sums file sizes recursively -- images/epub-sources are flat-ish upload
// directories, not deeply nested, but recursing costs nothing and avoids
// silently under-counting if that ever changes.
function directorySizeBytes(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += directorySizeBytes(full);
    else if (entry.isFile()) total += fs.statSync(full).size;
  }
  return total;
}

function sqliteFileSizeBytes(): number {
  // WAL mode (see db/client.ts) keeps recent writes in -wal/-shm sidecar
  // files until a checkpoint -- counting just cookbook.db would understate
  // real disk usage right after a burst of writes.
  let total = 0;
  for (const suffix of ['', '-wal', '-shm']) {
    const p = dbPath + suffix;
    if (fs.existsSync(p)) total += fs.statSync(p).size;
  }
  return total;
}

export function getSiteStats(): SiteStats {
  const totalRecipes = (db.prepare('SELECT count(*) as count FROM recipes').get() as { count: number }).count;
  const totalUsers = (db.prepare('SELECT count(*) as count FROM users').get() as { count: number }).count;

  const rows = db
    .prepare(
      `SELECT u.id as user_id, u.email as email, u.display_name as display_name, count(r.id) as recipe_count
       FROM users u
       LEFT JOIN recipes r ON r.user_id = u.id
       GROUP BY u.id
       ORDER BY recipe_count DESC, u.email ASC`
    )
    .all() as Array<{ user_id: number; email: string; display_name: string | null; recipe_count: number }>;

  const perUser: UserRecipeCount[] = rows.map((row) => ({
    userId: row.user_id,
    name: resolveDisplayName(row.display_name, row.email),
    recipeCount: row.recipe_count
  }));

  const unowned = (
    db.prepare('SELECT count(*) as count FROM recipes WHERE user_id IS NULL').get() as { count: number }
  ).count;
  if (unowned > 0) {
    perUser.push({ userId: null, name: 'Unowned (legacy)', recipeCount: unowned });
  }

  const databaseBytes = sqliteFileSizeBytes();
  const imagesBytes = directorySizeBytes(imagesDir);
  const epubSourcesBytes = directorySizeBytes(epubSourcesDir);

  return {
    totalRecipes,
    totalUsers,
    perUser,
    storage: {
      databaseBytes,
      imagesBytes,
      epubSourcesBytes,
      totalBytes: databaseBytes + imagesBytes + epubSourcesBytes
    }
  };
}
