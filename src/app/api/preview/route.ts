import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/preview?url=https://acme.com
 *
 * Server-side unfurl of a listing's link — the title, description and image the
 * browser can't read itself (cross-origin). worldmap.lol builds its bidder
 * pages the same way: the pitch text on a listing is the site's own
 * `og:description`, not something the buyer typed.
 *
 * Results are cached in-process for an hour; the fetch is capped at 6s / 300KB
 * and refuses anything that isn't a public http(s) host.
 */

interface Preview {
  ok: boolean;
  url: string;
  site: string;
  title: string;
  description: string;
  image: string | null;
}

const TTL_MS = 60 * 60 * 1000;
const MAX_BYTES = 400_000; // cap on the markup we regex over
const MAX_DOWNLOAD = 4_000_000; // refuse to buffer anything larger
const CACHE_MAX = 300;
const cache = new Map<string, { at: number; data: Preview }>();

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
  "#8217": "\u2019",
  "#8216": "\u2018",
};

function decode(s: string): string {
  return s
    .replace(/&([a-zA-Z#0-9]+);/g, (m, e: string) => ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull a meta value, tolerating either attribute order. */
function meta(html: string, key: string): string | null {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${k}["'][^>]*?content\\s*=\\s*["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*?(?:property|name)\\s*=\\s*["']${k}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m?.[1]) return decode(m[1]);
  }
  return null;
}

/** Refuse loopback / private / metadata addresses — this endpoint fetches for us. */
function isPublicHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (h === "0.0.0.0" || h === "::1" || h === "[::1]") return false;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 169 && b === 254) return false;
  }
  return h.includes(".");
}

function firstImage(html: string, href: string): string | null {
  const raw =
    meta(html, "og:image:secure_url") ??
    meta(html, "og:image:url") ??
    meta(html, "og:image") ??
    meta(html, "twitter:image") ??
    meta(html, "twitter:image:src");
  if (!raw) return null;
  try {
    const abs = new URL(raw, href);
    return abs.protocol === "http:" || abs.protocol === "https:" ? abs.toString() : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url") ?? "";
  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return NextResponse.json({ ok: false, error: "bad_url" }, { status: 400 });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return NextResponse.json({ ok: false, error: "bad_scheme" }, { status: 400 });
  }
  if (!isPublicHost(url.hostname)) {
    return NextResponse.json({ ok: false, error: "blocked_host" }, { status: 400 });
  }

  const site = (url.hostname.replace(/^www\./i, "") + url.pathname.replace(/\/+$/, "")).toLowerCase();
  const key = url.toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json(hit.data, { headers: { "cache-control": "public, s-maxage=3600" } });
  }

  const fallback: Preview = { ok: false, url: key, site, title: "", description: "", image: null };

  try {
    const res = await fetch(key, {
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
      headers: {
        // Some sites block unknown agents outright; identify honestly.
        "user-agent": "Mozilla/5.0 (compatible; mymap-lol-preview/1.0; +https://www.mymap.lol)",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en,ms;q=0.8",
      },
      cache: "no-store",
    });

    const type = res.headers.get("content-type") ?? "";
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (!res.ok || !/text\/html|application\/xhtml/i.test(type) || (declared && declared > MAX_DOWNLOAD)) {
      cache.set(key, { at: Date.now(), data: fallback });
      return NextResponse.json(fallback, { status: 200, headers: { "cache-control": "public, s-maxage=600" } });
    }

    // Big pages bury their metadata behind megabytes of inline script, and not
    // always inside <head> (YouTube's og tags sit past a premature </head>), so
    // drop script/style bodies from the whole document, then regex over it —
    // the capped slice first (cheap), the whole thing only if that finds nothing.
    const full = await res.text();
    const lean = full
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "");

    const extract = (html: string) => ({
      title:
        meta(html, "og:title") ??
        meta(html, "twitter:title") ??
        decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? ""),
      description:
        meta(html, "og:description") ?? meta(html, "twitter:description") ?? meta(html, "description") ?? "",
      image: firstImage(html, key),
    });

    let found = extract(lean.slice(0, MAX_BYTES));
    if (!found.title && !found.description && lean.length > MAX_BYTES) {
      found = extract(lean);
    }

    const data: Preview = {
      ok: Boolean(found.title || found.description),
      url: key,
      site,
      title: found.title.slice(0, 160),
      description: found.description.slice(0, 400),
      image: found.image,
    };

    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: Date.now(), data });

    return NextResponse.json(data, { headers: { "cache-control": "public, s-maxage=3600" } });
  } catch {
    cache.set(key, { at: Date.now(), data: fallback });
    return NextResponse.json(fallback, { status: 200, headers: { "cache-control": "public, s-maxage=300" } });
  }
}
