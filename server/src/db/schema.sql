-- Accounts. No password/session data here -- Firebase Authentication owns
-- login, passwords, and password-reset emails; this table just maps a
-- Firebase identity (firebase_uid) to a local role and a place to hang
-- recipe ownership off of. Populated by requireAuth on a user's first
-- verified request (lazy row creation) or by the admin-only create-user
-- route for accounts other than the initial admin.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  firebase_uid TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','user')) DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- recipes: the canonical record. raw_text is always preserved regardless of
-- how well structured parsing went, so nothing is ever lost to a bad parse.
CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  servings TEXT,
  total_time_minutes INTEGER,
  instructions_json TEXT NOT NULL DEFAULT '[]',
  ingredients_text TEXT NOT NULL DEFAULT '',
  raw_text TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL CHECK (source_type IN ('epub','instagram','website','manual')),
  source_ref TEXT,
  source_name TEXT,
  video_ref TEXT,
  epub_source_id INTEGER REFERENCES epub_sources(id),
  image_url TEXT,
  notes TEXT,
  want_to_try_at TEXT,
  favorited_at TEXT,
  needs_fixing_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ingredient_catalog (
  id INTEGER PRIMARY KEY,
  canonical_name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id INTEGER REFERENCES ingredient_catalog(id),
  raw_text TEXT NOT NULL,
  quantity TEXT,
  unit TEXT,
  section TEXT,
  position INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_ingredient ON recipe_ingredients(ingredient_id);

CREATE TABLE IF NOT EXISTS meal_types (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS recipe_meal_types (
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  meal_type_id INTEGER NOT NULL REFERENCES meal_types(id),
  PRIMARY KEY (recipe_id, meal_type_id)
);

CREATE TABLE IF NOT EXISTS cuisines (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE IF NOT EXISTS recipe_cuisines (
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  cuisine_id INTEGER NOT NULL REFERENCES cuisines(id),
  PRIMARY KEY (recipe_id, cuisine_id)
);

-- the cooking log: one recipe -> many attempts, each with its own date/rating/notes.
CREATE TABLE IF NOT EXISTS recipe_attempts (
  id INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  attempted_at TEXT NOT NULL,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_recipe_attempts_recipe ON recipe_attempts(recipe_id);

-- EPUB pipeline bookkeeping: one row per uploaded book. Recipes extracted
-- from a book are tracked via the same source_type/source_name convention
-- every other ingestion path already uses (see recipes.source_name), not a
-- foreign key back here -- consistent with how the sidebar already groups
-- recipes "by source".
CREATE TABLE IF NOT EXISTS epub_sources (
  id INTEGER PRIMARY KEY,
  title TEXT,
  author TEXT,
  filename TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A "tag this recipe, come back to it later" flag while browsing a book --
-- distinct from the actual recipes table. Reading is meant to be fast
-- (click where a recipe starts, click where it ends, move on); the real
-- structuring/review into a saved recipe happens separately later, when
-- the user opens a bookmark from the per-book list. A bookmark's range is
-- expressed in terms of the same {flowIndex, blockIndex} coordinates
-- epubBlocks.ts already produces, and can span more than one chapter (a
-- recipe straddling a chapter boundary is just a range that crosses it --
-- no extra modeling needed).
CREATE TABLE IF NOT EXISTS epub_bookmarks (
  id INTEGER PRIMARY KEY,
  epub_source_id INTEGER NOT NULL REFERENCES epub_sources(id) ON DELETE CASCADE,
  title TEXT,
  start_flow_index INTEGER NOT NULL,
  start_block_index INTEGER NOT NULL,
  end_flow_index INTEGER NOT NULL,
  end_block_index INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_epub_bookmarks_source ON epub_bookmarks(epub_source_id);

CREATE VIRTUAL TABLE IF NOT EXISTS recipes_fts USING fts5(
  title,
  raw_text,
  instructions_text,
  ingredients_text,
  content='recipes',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS recipes_fts_insert AFTER INSERT ON recipes BEGIN
  INSERT INTO recipes_fts(rowid, title, raw_text, instructions_text, ingredients_text)
  VALUES (new.id, new.title, new.raw_text, new.instructions_json, new.ingredients_text);
END;

CREATE TRIGGER IF NOT EXISTS recipes_fts_delete AFTER DELETE ON recipes BEGIN
  INSERT INTO recipes_fts(recipes_fts, rowid, title, raw_text, instructions_text, ingredients_text)
  VALUES ('delete', old.id, old.title, old.raw_text, old.instructions_json, old.ingredients_text);
END;

CREATE TRIGGER IF NOT EXISTS recipes_fts_update AFTER UPDATE ON recipes BEGIN
  INSERT INTO recipes_fts(recipes_fts, rowid, title, raw_text, instructions_text, ingredients_text)
  VALUES ('delete', old.id, old.title, old.raw_text, old.instructions_json, old.ingredients_text);
  INSERT INTO recipes_fts(rowid, title, raw_text, instructions_text, ingredients_text)
  VALUES (new.id, new.title, new.raw_text, new.instructions_json, new.ingredients_text);
END;
