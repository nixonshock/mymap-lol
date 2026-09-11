// Holder links arrive as free text from the claim form ("acme.com", "https://…",
// "@handle"). Everything the UI renders from them goes through here so a
// half-typed URL still works and a `javascript:` href can never be rendered.

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

/* ------------------------------------------------------------------ listings */

/**
 * A listing is either a product website or a public social profile — the same
 * two modes worldmap.lol offers ("🌐 Product URL" / "@ Social profile").
 */
export type ListingMode = "site" | "social";

/** The networks a social listing may point at. */
export const SOCIAL_NETWORKS = ["X", "Instagram", "GitHub", "YouTube"];
export const SOCIAL_HINT = "X · Instagram · GitHub · YouTube — profile / channel links";

/** host → canonical host (twitter.com and x.com are the same listing). */
const SOCIAL_HOST: Record<string, string> = {
  "x.com": "x.com",
  "twitter.com": "x.com",
  "instagram.com": "instagram.com",
  "github.com": "github.com",
  "youtube.com": "youtube.com",
};

export const isSocialHost = (host?: string | null) =>
  !!host && Object.prototype.hasOwnProperty.call(SOCIAL_HOST, host.toLowerCase());

/** Canonical profile path per network, so "@me" and "x.com/me/" are one listing. */
function normalizeSocialPath(host: string, path: string): string | null {
  const segs = path.split("/").filter(Boolean);
  if (segs.length === 0) return null;
  const first = segs[0];
  if (host === "x.com") return segs.length === 1 && /^[A-Za-z0-9_]{1,15}$/.test(first) ? first : null;
  if (host === "instagram.com") return segs.length === 1 && /^[A-Za-z0-9._]{1,30}$/.test(first) ? first : null;
  if (host === "github.com") return segs.length === 1 && /^[A-Za-z0-9-]{1,39}$/.test(first) ? first : null;
  if (host === "youtube.com") {
    // Channels only — never a video, /watch, /shorts, /results or a playlist.
    if (segs.length === 1 && /^@[\w.-]{3,30}$/.test(first)) return first;
    if (segs.length === 2 && ["channel", "c", "user"].includes(first) && /^[\w-]{3,40}$/.test(segs[1])) {
      return `${first}/${segs[1]}`;
    }
    return null;
  }
  return null;
}

export interface NormalizedLink {
  /** what we store and link out to (null when the input was unusable) */
  href: string | null;
  /** "acme.com" or "@handle" — the name shown when the buyer left the name blank */
  display: string | null;
  error: string | null;
}

/**
 * Turn whatever was typed into the link we store.
 *
 *   site   → the domain only, no path and no query ("acme.com/about?utm=x" → "https://acme.com")
 *   social → the canonical profile URL ("@me" → "https://x.com/me")
 *
 * Keeping only the domain is what makes "submit the same link again" top up the
 * same listing instead of creating a duplicate — same rule as worldmap.lol.
 */
export function normalizeLink(rawInput: string, mode: ListingMode): NormalizedLink {
  const raw = (rawInput ?? "").trim();
  if (!raw) return { href: null, display: null, error: null };

  if (mode === "site") {
    const href = safeHref(raw);
    if (!href) return { href: null, display: null, error: "Use a normal web address (https://…)." };
    let host: string;
    try {
      host = new URL(href).hostname.replace(/^www\./i, "").toLowerCase();
    } catch {
      return { href: null, display: null, error: "That doesn't look like a web address." };
    }
    if (!host.includes(".") || host.startsWith(".") || host.endsWith(".")) {
      return { href: null, display: null, error: "That doesn't look like a web address." };
    }
    return { href: `https://${host}`, display: host, error: null };
  }

  // --- social
  let host = "";
  let path = "";
  if (raw.startsWith("@")) {
    host = "x.com";
    path = raw.slice(1);
  } else {
    const href = safeHref(raw);
    if (!href) return { href: null, display: null, error: "Use a profile link or an @handle." };
    try {
      const url = new URL(href);
      host = url.hostname.replace(/^www\./i, "").toLowerCase();
      path = url.pathname;
    } catch {
      return { href: null, display: null, error: "Use a profile link or an @handle." };
    }
    if (!isSocialHost(host)) {
      // "justahandle" with no host at all — treat it as an X handle.
      if (!host.includes(".")) {
        host = "x.com";
        path = raw;
      } else {
        return {
          href: null,
          display: null,
          error: `Social profiles must be on ${SOCIAL_NETWORKS.join(", ")}.`,
        };
      }
    }
  }

  const canonicalHost = SOCIAL_HOST[host] ?? host;
  const clean = normalizeSocialPath(canonicalHost, path.replace(/^\/+|\/+$/g, ""));
  if (!clean) {
    return {
      href: null,
      display: null,
      error:
        canonicalHost === "youtube.com"
          ? "Use a channel link (youtube.com/@yourchannel) — not a video or a post."
          : "Use a profile link — not a single post, video, or page.",
    };
  }
  return {
    href: `https://${canonicalHost}/${clean}`,
    display: `@${clean.split("/").pop()?.replace(/^@/, "") ?? clean}`,
    error: null,
  };
}

/** "https://acme.com" → "acme.com" · "https://x.com/me" → "@me" */
export function displayNameOf(link?: string | null): string | null {
  const href = safeHref(link);
  if (!href) return null;
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    const path = url.pathname.replace(/^\/+|\/+$/g, "");
    if (isSocialHost(host) && path) return `@${path.split("/").pop()?.replace(/^@/, "") ?? path}`;
    return host;
  } catch {
    return null;
  }
}

/** Stable id for a listing: "acme.com" or "x.com/handle" (used as the profile page URL). */
export function slugOf(link?: string | null): string | null {
  const href = safeHref(link);
  if (!href) return null;
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    const path = url.pathname.replace(/^\/+|\/+$/g, "");
    if (isSocialHost(host) && path) return `${host}/${path}`.toLowerCase();
    return host;
  } catch {
    return null;
  }
}

/** Slug for a holder that never gave a link, so every name still has a profile page. */
export function nameSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Where a bidder's name points: their profile page on mymap.lol. */
export function pinHref(orgName: string, link?: string | null): string {
  const slug = slugOf(link) ?? nameSlug(orgName);
  return `/pin/${slug}`;
}

/** Favicon for a link (third-party resolver, same one worldmap.lol uses). */
export function iconUrl(link?: string | null): string | null {
  const host = hostOf(link);
  return host ? `https://unavatar.io/${host}?fallback=false` : null;
}

/** Small favicon used inside dense lists. */
export function faviconUrl(link?: string | null): string | null {
  const host = hostOf(link);
  return host ? `https://icons.duckduckgo.com/ip3/${host}.ico` : null;
}

export function hostOf(link?: string | null): string | null {
  const href = safeHref(link);
  if (!href) return null;
  try {
    return new URL(href).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Outbound link with our referral tag, like worldmap.lol appends ?utm_source=… */
export function outboundHref(link?: string | null): string | null {
  const href = safeHref(link);
  if (!href) return null;
  try {
    const url = new URL(href);
    if (!url.searchParams.has("utm_source")) url.searchParams.set("utm_source", "mymap.lol");
    return url.toString();
  } catch {
    return href;
  }
}
