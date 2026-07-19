import * as cheerio from 'cheerio';
import { groupIngredientLinesBySections, parseIngredientLine } from '../shared/parseIngredientLine.js';
import { parseManualPaste } from '../shared/parseManualPaste.js';
import { ParsedIngredientLine, ParsedInstructionStep, RecipeDraft } from '../../types/recipe.js';

// A generic modern-browser UA. Many sites (this project's motivating case:
// Serious Eats) block whatever user-agent Claude's own WebFetch tool
// presents, but happily serve a normal browser — this runs from the user's
// own machine/IP with a normal UA, which is a different situation entirely.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Groups recipes from the same site under one sidebar entry (e.g. every
// thewoksoflife.com recipe collapses under "thewoksoflife.com") instead of
// one group per exact recipe URL. Just the bare hostname — the user can
// rename it to something prettier ("The Woks of Life") in the editor.
function deriveSourceNameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, '') || null;
  } catch {
    return null;
  }
}

function parseIsoDurationToMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  if (!hours && !minutes) return null;
  return hours * 60 + minutes;
}

// schema.org HowToSection entries ("To Make the Tartar Sauce") nest their
// own sub-steps under itemListElement — flattening those into one joined
// string (the previous behavior) collapsed a whole section into a single
// unreadable blob. This flattens recursively instead, tagging every
// resulting step with whichever section (if any) it came from, mirroring
// how ingredient sections are tracked.
function instructionEntryToSteps(entry: unknown, section: string | null): ParsedInstructionStep[] {
  if (typeof entry === 'string') {
    const text = decodeHtmlEntities(entry.trim());
    return text ? [{ text, section }] : [];
  }
  if (entry && typeof entry === 'object') {
    const obj = entry as Record<string, unknown>;
    const type = obj['@type'];
    const isSection = type === 'HowToSection' || (Array.isArray(type) && type.includes('HowToSection'));
    if (Array.isArray(obj.itemListElement)) {
      const sectionName =
        isSection && typeof obj.name === 'string' && obj.name.trim() ? decodeHtmlEntities(obj.name.trim()) : section;
      return obj.itemListElement.flatMap((sub) => instructionEntryToSteps(sub, sectionName));
    }
    if (typeof obj.text === 'string' && obj.text.trim()) {
      return [{ text: decodeHtmlEntities(obj.text.trim()), section }];
    }
    if (typeof obj.name === 'string' && obj.name.trim()) {
      return [{ text: decodeHtmlEntities(obj.name.trim()), section }];
    }
  }
  return [];
}

function extractInstructions(raw: unknown): ParsedInstructionStep[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    return raw
      .split(/\n+/)
      .map((s) => decodeHtmlEntities(s.trim()))
      .filter(Boolean)
      .map((text) => ({ text, section: null }));
  }
  if (Array.isArray(raw)) {
    return raw.flatMap((entry) => instructionEntryToSteps(entry, null));
  }
  return [];
}

// Several WP recipe plugins (WP Recipe Maker and others) write literal HTML
// entities into their JSON-LD string values ("Rao&#8217;s", "spooned &amp;
// leveled") instead of the real characters — a JSON string has no entity
// syntax of its own, so `JSON.parse` leaves them untouched. Decoding via a
// throwaway HTML text node reuses cheerio's existing entity decoder rather
// than hand-rolling a named-entity table.
function decodeHtmlEntities(text: string): string {
  if (!text.includes('&')) return text;
  return cheerio.load(`<div>${text}</div>`)('div').text();
}

function extractStringList(raw: unknown): string[] {
  if (typeof raw === 'string') return [decodeHtmlEntities(raw.trim())].filter(Boolean);
  if (Array.isArray(raw)) {
    return raw
      .filter((v): v is string => typeof v === 'string')
      .map((v) => decodeHtmlEntities(v.trim()))
      .filter(Boolean);
  }
  return [];
}

// Ingredient/instruction list items rendered straight into the DOM,
// for sites whose JSON-LD ships empty recipeIngredient/recipeInstructions
// arrays and fills them in client-side via JS after page load (confirmed on
// bongeats.com — the JSON-LD's arrays are empty at fetch time, but the same
// text lives in these list items in the static HTML all along).
function extractListItemsBySelector($: cheerio.CheerioAPI, selectors: string[]): string[] {
  for (const selector of selectors) {
    const items = $(selector)
      .find('li')
      .toArray()
      .map((el) => decodeHtmlEntities($(el).text().replace(/\s+/g, ' ').trim()))
      .filter(Boolean);
    if (items.length > 0) return items;
  }
  return [];
}

// WP Recipe Maker (one of the most common WordPress recipe plugins —
// confirmed on omnivorescookbook.com, likely others) renders ingredient
// section headers ("Marinade", "Sauce") as DOM elements between groups of
// <li>s, but never includes them in the JSON-LD recipeIngredient array at
// all — there's no section signal left in the structured data to recover.
// This reads the groups straight from the DOM instead, which also sidesteps
// the site's own doubled-parens/leading-comma JSON-LD quirks entirely, since
// we're reconstructing from the plugin's already-separated amount/unit/name/
// notes spans rather than its exported (and sometimes malformed) JSON.
function extractWprmIngredients($: cheerio.CheerioAPI): ParsedIngredientLine[] | null {
  const groups = $('.wprm-recipe-ingredient-group');
  if (groups.length === 0) return null;

  const lines: Array<{ text: string; section: string | null }> = [];
  groups.each((_, groupEl) => {
    const $group = $(groupEl);
    const headerText = $group.find('.wprm-recipe-ingredient-group-name').first().text().trim();
    const section = headerText ? decodeHtmlEntities(headerText) : null;
    $group.find('.wprm-recipe-ingredient').each((_, li) => {
      const $li = $(li);
      const amount = $li.find('.wprm-recipe-ingredient-amount').first().text().trim();
      const unit = $li.find('.wprm-recipe-ingredient-unit').first().text().trim();
      const name = $li.find('.wprm-recipe-ingredient-name').first().text().trim();
      const notes = $li.find('.wprm-recipe-ingredient-notes').first().text().trim();
      const text = decodeHtmlEntities(
        [amount, unit, name].filter(Boolean).join(' ') + (notes ? ` ${notes}` : '')
      ).replace(/\s+,/g, ',');
      if (text.trim()) lines.push({ text: text.trim(), section });
    });
  });

  return lines.length > 0 ? lines.map(({ text, section }) => parseIngredientLine(text, section)) : null;
}

function extractYield(raw: unknown): string | null {
  const list = extractStringList(raw);
  return list[0] ?? null;
}

// schema.org `image` can be a URL string, an array of URL strings, an
// ImageObject ({ url } or { contentUrl }), or an array of those — just take
// the first usable URL we find. We only ever store this URL, never fetch or
// persist the image itself.
function extractImageUrl(raw: unknown): string | null {
  if (typeof raw === 'string') return raw.trim() || null;
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const found = extractImageUrl(entry);
      if (found) return found;
    }
    return null;
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.url === 'string' && obj.url.trim()) return obj.url.trim();
    if (typeof obj.contentUrl === 'string' && obj.contentUrl.trim()) return obj.contentUrl.trim();
  }
  return null;
}

function isRecipeNode(node: unknown): node is Record<string, unknown> {
  if (!node || typeof node !== 'object') return false;
  const type = (node as Record<string, unknown>)['@type'];
  if (typeof type === 'string') return type === 'Recipe';
  if (Array.isArray(type)) return type.includes('Recipe');
  return false;
}

// JSON-LD Recipe nodes can appear as a single object, inside an array, or
// nested under an "@graph" array (common with WordPress/Yoast SEO output).
function findRecipeNode(json: unknown): Record<string, unknown> | null {
  if (Array.isArray(json)) {
    for (const entry of json) {
      const found = findRecipeNode(entry);
      if (found) return found;
    }
    return null;
  }
  if (json && typeof json === 'object') {
    if (isRecipeNode(json)) return json as Record<string, unknown>;
    const graph = (json as Record<string, unknown>)['@graph'];
    if (Array.isArray(graph)) return findRecipeNode(graph);
  }
  return null;
}

function buildReadableRawText(input: {
  title: string;
  servings: string | null;
  totalTimeMinutes: number | null;
  ingredientLines: string[];
  instructions: ParsedInstructionStep[];
  sourceUrl: string;
}): string {
  const parts: string[] = [input.title, ''];
  if (input.servings) parts.push(`Servings: ${input.servings}`);
  if (input.totalTimeMinutes != null) parts.push(`Total time: ${input.totalTimeMinutes} min`);
  parts.push('', 'Ingredients:', ...input.ingredientLines, '', 'Instructions:');
  input.instructions.forEach((step, i) => parts.push(`${i + 1}. ${step.text}`));
  parts.push('', `Source: ${input.sourceUrl}`);
  return parts.join('\n');
}

export type WebsiteFetchResult = RecipeDraft & { usedStructuredData: boolean };

export async function fetchRecipeFromUrl(url: string): Promise<WebsiteFetchResult> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);

  let recipeNode: Record<string, unknown> | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (recipeNode) return;
    const raw = $(el).contents().text();
    try {
      recipeNode = findRecipeNode(JSON.parse(raw));
    } catch {
      // Malformed JSON-LD on the page — skip it and keep looking at other script tags.
    }
  });

  if (recipeNode) {
    const node: Record<string, unknown> = recipeNode;
    const title =
      typeof node.name === 'string' && node.name.trim() ? decodeHtmlEntities(node.name.trim()) : 'Untitled recipe';
    let ingredientLines = extractStringList(node.recipeIngredient ?? node.ingredients);
    let instructions = extractInstructions(node.recipeInstructions);
    if (ingredientLines.length === 0) {
      ingredientLines = extractListItemsBySelector($, [
        '[class*="recipe-ingredient"]',
        '[class*="ingredient-list"]',
        '[class*="ingredients"]'
      ]);
    }
    if (instructions.length === 0) {
      instructions = extractListItemsBySelector($, [
        '[class*="recipe-process"]',
        '[class*="recipe-instruction"]',
        '[class*="recipe-direction"]',
        '[class*="instructions"]',
        '[class*="directions"]'
      ]).map((text) => ({ text, section: null }));
    }
    const servings = extractYield(node.recipeYield ?? node.yield);
    // Prefer the site's own totalTime when present; otherwise sum prep+cook
    // as a reasonable fallback (only if at least one of them is present).
    const explicitTotal = parseIsoDurationToMinutes(node.totalTime);
    const prepTimeMinutes = parseIsoDurationToMinutes(node.prepTime);
    const cookTimeMinutes = parseIsoDurationToMinutes(node.cookTime);
    const totalTimeMinutes =
      explicitTotal ?? (prepTimeMinutes != null || cookTimeMinutes != null ? (prepTimeMinutes ?? 0) + (cookTimeMinutes ?? 0) : null);
    const cuisineNames = extractStringList(node.recipeCuisine);
    const imageUrl = extractImageUrl(node.image);
    const sourceName = deriveSourceNameFromUrl(url);
    // Schema.org's Recipe spec has no official ingredient-group field, so
    // sites that display sectioned ingredients ("For the chicken") often
    // just embed the header as a plain string within the flat
    // recipeIngredient array — the same section-detection heuristic used
    // for manual pastes picks these up here too. WP Recipe Maker sites keep
    // section headers out of the JSON-LD entirely, so try the DOM-based
    // extraction first and only fall back to the JSON-LD-derived lines.
    const ingredients = extractWprmIngredients($) ?? groupIngredientLinesBySections(ingredientLines);

    return {
      title,
      ingredients,
      instructions,
      rawText: buildReadableRawText({
        title,
        servings,
        totalTimeMinutes,
        ingredientLines: ingredients.map((i) => i.rawText),
        instructions,
        sourceUrl: url
      }),
      servings,
      totalTimeMinutes,
      cuisineNames,
      imageUrl,
      sourceName,
      usedStructuredData: true
    };
  }

  // No structured data found — fall back to the page's visible text run
  // through the same heuristic splitter used for manual pastes, after
  // stripping obvious non-recipe chrome so it isn't drowning in nav/footer text.
  $('script, style, nav, footer, header, noscript, iframe').remove();
  const bodyText = ($('body').text() || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const fallback = parseManualPaste(bodyText);
  return { ...fallback, sourceName: deriveSourceNameFromUrl(url), usedStructuredData: false };
}
