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

// Instagram's own embed endpoint for a public post/reel/IGTV video —
// "/{type}/{shortcode}/embed" — the same URL their own "Embed" share option
// generates. Works without any API key for public posts; private or
// age-gated ones will show a login prompt inside the iframe instead of the
// video, which is an Instagram-side restriction, not something to work around.
function extractInstagramEmbedPath(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.toLowerCase().includes('instagram.com')) return null;
    const match = parsed.pathname.match(/^\/(p|reel|tv)\/([^/]+)/);
    return match ? `/${match[1]}/${match[2]}/embed` : null;
  } catch {
    return null;
  }
}

export type VideoEmbed = { url: string; aspectRatio: '16 / 9' | '9 / 16' };

// YouTube embeds are landscape (16:9); Instagram Reels/posts are portrait
// (9:16) — the player needs a different aspect ratio per platform rather
// than a one-size-fits-all box.
export function getVideoEmbed(sourceRef: string | null): VideoEmbed | null {
  if (!sourceRef) return null;
  const youtubeId = extractYouTubeVideoId(sourceRef);
  if (youtubeId) return { url: `https://www.youtube.com/embed/${youtubeId}`, aspectRatio: '16 / 9' };
  const instagramEmbedPath = extractInstagramEmbedPath(sourceRef);
  if (instagramEmbedPath) return { url: `https://www.instagram.com${instagramEmbedPath}`, aspectRatio: '9 / 16' };
  return null;
}
