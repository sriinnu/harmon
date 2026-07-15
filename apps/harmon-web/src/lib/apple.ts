/** Extract an Apple catalog song id from a music.apple.com URL. */
export function appleSongIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('music.apple.com')) return null;
    const trackParam = parsed.searchParams.get('i');
    if (trackParam) return trackParam;
    const parts = parsed.pathname.split('/').filter(Boolean);
    // /{storefront}/song/{slug}/{id} or /{storefront}/song/{id}
    const songIndex = parts.indexOf('song');
    if (songIndex >= 0) {
      const tail = parts[parts.length - 1];
      if (/^\d+$/.test(tail)) return tail;
    }
    return null;
  } catch {
    return null;
  }
}
