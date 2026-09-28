import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../../');
export const dataDir = path.join(projectRoot, 'data');
export const dbPath = path.join(dataDir, 'cookbook.db');
export const imagesDir = path.join(dataDir, 'images');
// Top-level (not nested under data/) to match the existing .gitignore entry
// -- epub-sources/ is its own gitignored directory, same as data/.
export const epubSourcesDir = path.join(projectRoot, 'epub-sources');

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(imagesDir, { recursive: true });
fs.mkdirSync(epubSourcesDir, { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function getSchemaSql(): string {
  const schemaPath = path.join(__dirname, 'schema.sql');
  return fs.readFileSync(schemaPath, 'utf8');
}
