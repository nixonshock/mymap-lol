// Holder links arrive as free text from the claim form ("acme.com", "https://…").
// Everything the UI renders from them goes through here so a half-typed URL
// still works and a `javascript:` href can never be rendered.

/** Normalize a user-supplied link into a safe absolute http(s) href, or null. */
export function safeHref(link?: string | null): string | null {
  const raw = (link ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  // Any other explicit scheme (javascript:, data:, mailto:, …) is refused —
  // we only link out to the web.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
  return `https://${raw}`;
}

/** "www.acme.com/about" → "acme.com/about" — the short label shown next to a holder. */
export function linkLabel(link?: string | null): string | null {
  const href = safeHref(link);
  if (!href) return null;
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./i, "");
    const path = url.pathname.replace(/\/+$/, "");
    return path ? `${host}${path}` : host;
  } catch {
    return null;
  }
}
