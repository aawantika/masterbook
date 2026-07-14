import * as cheerio from 'cheerio';
import { parseIngredientLine } from '../shared/parseIngredientLine.js';
import { parseManualPaste } from '../shared/parseManualPaste.js';
import { RecipeDraft } from '../../types/recipe.js';

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

function instructionEntryToText(entry: unknown): string | null {
  if (typeof entry === 'string') return entry.trim() || null;
  if (entry && typeof entry === 'object') {
    const obj = entry as Record<string, unknown>;
    if (typeof obj.text === 'string' && obj.text.trim()) return obj.text.trim();
    if (Array.isArray(obj.itemListElement)) {
      return obj.itemListElement.map(instructionEntryToText).filter(Boolean).join(' ');
    }
    if (typeof obj.name === 'string' && obj.name.trim()) return obj.name.trim();
  }
  return null;
}

function extractInstructions(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    return raw
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(raw)) {
    return raw.map(instructionEntryToText).filter((s): s is string => Boolean(s));
  }
  return [];
}

function extractStringList(raw: unknown): string[] {
  if (typeof raw === 'string') return [raw.trim()].filter(Boolean);
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean);
  }
  return [];
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
  instructions: string[];
  sourceUrl: string;
}): string {
  const parts: string[] = [input.title, ''];
  if (input.servings) parts.push(`Servings: ${input.servings}`);
  if (input.totalTimeMinutes != null) parts.push(`Total time: ${input.totalTimeMinutes} min`);
  parts.push('', 'Ingredients:', ...input.ingredientLines, '', 'Instructions:');
  input.instructions.forEach((step, i) => parts.push(`${i + 1}. ${step}`));
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
    const title = typeof node.name === 'string' && node.name.trim() ? node.name.trim() : 'Untitled recipe';
    const ingredientLines = extractStringList(node.recipeIngredient ?? node.ingredients);
    const instructions = extractInstructions(node.recipeInstructions);
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
    const ingredients = ingredientLines.map((line) => parseIngredientLine(line));

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
