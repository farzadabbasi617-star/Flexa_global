export function isSupportedClashInvite(value?: string | null) {
  const candidate = String(value || "").trim();
  if (!candidate) return false;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "link.clashroyale.com") {
      return false;
    }
    if (url.username || url.password || (url.port && url.port !== "443")) return false;
    if (!url.pathname.toLowerCase().startsWith("/invite/friend/")) return false;

    // A real Clash Royale friend share link contains both values. Requiring
    // them prevents unrelated official-site links from entering matchmaking.
    const tag = url.searchParams.get("tag")?.trim();
    const token = url.searchParams.get("token")?.trim();
    return Boolean(tag && token && tag.length <= 32 && token.length <= 160);
  } catch {
    return false;
  }
}
