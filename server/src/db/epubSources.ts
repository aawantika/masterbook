import { db } from './client.js';

export type EpubSource = {
  id: number;
  title: string | null;
  author: string | null;
  filename: string | null;
  importedAt: string;
  recipeCount: number;
};

// Placeholder row inserted before the file is actually parsed, so the
// upload route has a synchronous id to write the file to disk under and to
// roll back (delete) if the file turns out not to be a valid EPUB.
export function createEpubSourcePlaceholder(filename: string): number {
  const result = db.prepare('INSERT INTO epub_sources (filename) VALUES (?)').run(filename);
  return Number(result.lastInsertRowid);
}

export function updateEpubSourceMetadata(id: number, title: string | null, author: string | null): void {
  db.prepare('UPDATE epub_sources SET title = ?, author = ? WHERE id = ?').run(title, author, id);
}

export function deleteEpubSource(id: number): void {
  db.prepare('DELETE FROM epub_sources WHERE id = ?').run(id);
}

// "Recipes from this book" is tracked via the same source_type/source_name
// convention every other ingestion path already uses (see recipes.ts),
// not a foreign key -- so the count is a title-string match rather than a
// join. Matches how the sidebar already groups recipes "by source".
function withRecipeCounts(
  rows: Array<{ id: number; title: string | null; author: string | null; filename: string | null; imported_at: string }>
): EpubSource[] {
  const countStmt = db.prepare(
    "SELECT COUNT(*) as count FROM recipes WHERE source_type = 'epub' AND source_name = ?"
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    author: row.author,
    filename: row.filename,
    importedAt: row.imported_at,
    recipeCount: row.title ? (countStmt.get(row.title) as { count: number }).count : 0
  }));
}

export function listEpubSources(): EpubSource[] {
  const rows = db.prepare('SELECT id, title, author, filename, imported_at FROM epub_sources ORDER BY imported_at DESC').all() as Array<{
    id: number;
    title: string | null;
    author: string | null;
    filename: string | null;
    imported_at: string;
  }>;
  return withRecipeCounts(rows);
}

export function getEpubSource(id: number): EpubSource | null {
  const row = db.prepare('SELECT id, title, author, filename, imported_at FROM epub_sources WHERE id = ?').get(id) as
    | { id: number; title: string | null; author: string | null; filename: string | null; imported_at: string }
    | undefined;
  return row ? withRecipeCounts([row])[0] : null;
}
