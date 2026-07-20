// Shared between ImportPanel (deciding whether to attempt a fetch at all)
// and RecipeDetailPanel (deciding whether "Refresh from source" is offered)
// so both agree on which URLs actually carry fetchable recipe data.

export function isInstagramUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().includes('instagram.com');
  } catch {
    return false;
  }
}

// YouTube (including Shorts) exposes thumbnails at a predictable URL keyed
// by video ID — no page fetch needed. Video pages don't carry Recipe
// JSON-LD, so that's the only thing worth auto-fetching there.
export function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^(www|m)\./i, '').toLowerCase();
    if (hostname === 'youtu.be') {
      return parsed.pathname.slice(1).split('/')[0] || null;
    }
    if (hostname === 'youtube.com') {
      const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/?]+)/);
      if (shortsMatch) return shortsMatch[1];
      return parsed.searchParams.get('v');
    }
    return null;
  } catch {
    return null;
  }
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

// A URL that's known not to expose structured recipe data on the page
// itself — Instagram is login-gated/JS-rendered, YouTube pages carry video
// metadata rather than a Recipe schema. Both need the recipe text pasted
// in manually rather than auto-fetched or auto-refreshed.
export function isUnfetchableRecipeUrl(url: string): boolean {
  return isInstagramUrl(url) || extractYouTubeVideoId(url) !== null;
}
