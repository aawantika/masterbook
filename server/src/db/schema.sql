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
  epub_source_id INTEGER REFERENCES epub_sources(id),
  image_url TEXT,
  notes TEXT,
  want_to_try_at TEXT,
  favorited_at TEXT,
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

-- EPUB pipeline bookkeeping (schema in place from day one; UI wired in a later phase).
CREATE TABLE IF NOT EXISTS epub_sources (
  id INTEGER PRIMARY KEY,
  title TEXT,
  author TEXT,
  filename TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS epub_candidates (
  id INTEGER PRIMARY KEY,
  epub_source_id INTEGER NOT NULL REFERENCES epub_sources(id) ON DELETE CASCADE,
  chapter_index INTEGER,
  segment_index INTEGER,
  raw_text TEXT NOT NULL,
  guessed_title TEXT,
  heuristic_flags TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected')),
  resulting_recipe_id INTEGER REFERENCES recipes(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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
