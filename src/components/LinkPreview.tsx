"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { faviconUrl, iconUrl, linkLabel, outboundHref } from "@/lib/links";

export interface Preview {
  ok: boolean;
  site: string;
  title: string;
  description: string;
  image: string | null;
}

/**
 * Unfurl a link through `/api/preview` (server-side, 1h cached).
 *
 * Browsers can't read another site's HTML, so the tags come from that route.
 * Keyed by URL so a stale response for a previous link can never render.
 */
export function useLinkPreview(link?: string | null): {
  href: string | null;
  data: Preview | null;
  failed: boolean;
} {
  const href = outboundHref(link);
  const [state, setState] = useState<{ forUrl: string; data: Preview | null; failed: boolean }>({
    forUrl: "",
    data: null,
    failed: false,
  });

  useEffect(() => {
    if (!href) return;
    const ctrl = new AbortController();
    fetch(`/api/preview?url=${encodeURIComponent(href)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Preview | null) => {
        setState({ forUrl: href, data: d?.ok ? d : null, failed: !d?.ok });
      })
      .catch(() => setState({ forUrl: href, data: null, failed: true }));
    return () => ctrl.abort();
  }, [href]);

  return {
    href,
    data: state.forUrl === href ? state.data : null,
    failed: state.forUrl === href ? state.failed : false,
  };
}

/**
 * The link preview behind a bidder's name.
 *
 * Until `/api/preview` answers (or if the site has no tags at all) the card
 * falls back to the holder's own one-line pitch.
 */
export function LinkPreviewCard({
  link,
  name,
  pitch,
}: {
  link?: string | null;
  name: string;
  pitch?: string;
}) {
  const { data, failed } = useLinkPreview(link);
  const [imageBroken, setImageBroken] = useState(false);
  const [iconBroken, setIconBroken] = useState(false);

  const host = linkLabel(link);
  const icon = iconUrl(link);
  const title = data?.title || name;
  const description = data?.description || pitch || "";

  return (
    <div className="overflow-hidden rounded-2xl bg-[#f7fafd] ring-1 ring-[#e5edf5]">
      {data?.image && !imageBroken && (
        <img
          src={data.image}
          alt=""
          onError={() => setImageBroken(true)}
          className="h-[150px] w-full object-cover"
        />
      )}
      <div className="flex gap-3 p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white text-[16px] font-extrabold text-[#8494ab] ring-1 ring-[#e5edf5]">
          {icon && !iconBroken ? (
            <img src={icon} alt="" width={28} height={28} onError={() => setIconBroken(true)} />
          ) : (
            name.replace(/^@/, "").slice(0, 1).toUpperCase()
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-bold text-[#1f2b3e]">{title}</div>
          {host && <div className="truncate text-[11.5px] font-semibold text-[#1f7a55]">{host}</div>}
          {description && (
            <p className="mt-1.5 line-clamp-3 text-[12px] font-semibold leading-relaxed text-[#8494ab]">
              {description}
            </p>
          )}
          {!data && !failed && !pitch && (
            <p className="mt-1.5 text-[12px] font-semibold text-[#b0bed0]">Loading preview…</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Tiny site icon for dense lists (worldmap.lol shows the same in its rows). */
export function Favicon({ link, size = 18 }: { link?: string | null; size?: number }) {
  const src = faviconUrl(link);
  const [broken, setBroken] = useState(false);
  if (!src || broken) return null;
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      onError={() => setBroken(true)}
      className="shrink-0 rounded-[4px]"
      style={{ width: size, height: size }}
    />
  );
}
