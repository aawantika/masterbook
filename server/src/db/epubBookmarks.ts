import { db } from './client.js';

export type EpubBookmark = {
  id: number;
  epubSourceId: number;
  title: string | null;
  startFlowIndex: number;
  startBlockIndex: number;
  endFlowIndex: number;
  endBlockIndex: number;
  createdAt: string;
};

type BookmarkRow = {
  id: number;
  epub_source_id: number;
  title: string | null;
  start_flow_index: number;
  start_block_index: number;
  end_flow_index: number;
  end_block_index: number;
  created_at: string;
};

function toBookmark(row: BookmarkRow): EpubBookmark {
  return {
    id: row.id,
    epubSourceId: row.epub_source_id,
    title: row.title,
    startFlowIndex: row.start_flow_index,
    startBlockIndex: row.start_block_index,
    endFlowIndex: row.end_flow_index,
    endBlockIndex: row.end_block_index,
    createdAt: row.created_at
  };
}

export function createBookmark(
  epubSourceId: number,
  title: string | null,
  startFlowIndex: number,
  startBlockIndex: number,
  endFlowIndex: number,
  endBlockIndex: number
): EpubBookmark {
  const result = db
    .prepare(
      `INSERT INTO epub_bookmarks
        (epub_source_id, title, start_flow_index, start_block_index, end_flow_index, end_block_index)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(epubSourceId, title, startFlowIndex, startBlockIndex, endFlowIndex, endBlockIndex);
  return toBookmark(
    db.prepare('SELECT * FROM epub_bookmarks WHERE id = ?').get(Number(result.lastInsertRowid)) as BookmarkRow
  );
}

export function listBookmarksForSource(epubSourceId: number): EpubBookmark[] {
  const rows = db
    .prepare('SELECT * FROM epub_bookmarks WHERE epub_source_id = ? ORDER BY start_flow_index, start_block_index')
    .all(epubSourceId) as BookmarkRow[];
  return rows.map(toBookmark);
}

export function getBookmark(id: number): EpubBookmark | null {
  const row = db.prepare('SELECT * FROM epub_bookmarks WHERE id = ?').get(id) as BookmarkRow | undefined;
  return row ? toBookmark(row) : null;
}

export function deleteBookmark(id: number): void {
  db.prepare('DELETE FROM epub_bookmarks WHERE id = ?').run(id);
}
