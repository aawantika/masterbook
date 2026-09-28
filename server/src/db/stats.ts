import fs from 'node:fs';
import path from 'node:path';
import { db, dbPath, imagesDir, epubSourcesDir } from './client.js';
import { resolveDisplayName } from './users.js';

export type UserRecipeCount = {
  userId: number | null;
  name: string;
  recipeCount: number;
};

export type RecipeImageInfo = {
  recipeId: number;
  title: string;
  imageUrl: string;
  bytes: number | null; // null if the file is missing on disk (broken reference)
};

export type SiteStats = {
  totalRecipes: number;
  totalUsers: number;
  perUser: UserRecipeCount[];
  images: RecipeImageInfo[];
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
       GROUP BY u.id`
    )
    .all() as Array<{ user_id: number; email: string; display_name: string | null; recipe_count: number }>;

  const perUser: UserRecipeCount[] = rows
    .map((row) => ({
      userId: row.user_id,
      name: resolveDisplayName(row.display_name, row.email),
      recipeCount: row.recipe_count
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const unowned = (
    db.prepare('SELECT count(*) as count FROM recipes WHERE user_id IS NULL').get() as { count: number }
  ).count;
  if (unowned > 0) {
    perUser.push({ userId: null, name: 'Unowned (legacy)', recipeCount: unowned });
  }

  // Only locally-saved images (/api/images/<filename>, actually living in
  // imagesDir) count here -- a hotlinked external URL isn't taking up any
  // of our disk space, so it wouldn't belong in a "what's using storage"
  // list even though it's still a valid recipe.imageUrl.
  const imageRows = db
    .prepare("SELECT id, title, image_url FROM recipes WHERE image_url LIKE '/api/images/%' ORDER BY id")
    .all() as Array<{ id: number; title: string; image_url: string }>;

  const images: RecipeImageInfo[] = imageRows
    .map((row) => {
      const filename = row.image_url.slice('/api/images/'.length);
      const filePath = path.join(imagesDir, filename);
      const bytes = fs.existsSync(filePath) ? fs.statSync(filePath).size : null;
      return { recipeId: row.id, title: row.title, imageUrl: row.image_url, bytes };
    })
    .sort((a, b) => (b.bytes ?? -1) - (a.bytes ?? -1));

  const databaseBytes = sqliteFileSizeBytes();
  const imagesBytes = directorySizeBytes(imagesDir);
  const epubSourcesBytes = directorySizeBytes(epubSourcesDir);

  return {
    totalRecipes,
    totalUsers,
    perUser,
    images,
    storage: {
      databaseBytes,
      imagesBytes,
      epubSourcesBytes,
      totalBytes: databaseBytes + imagesBytes + epubSourcesBytes
    }
  };
}
