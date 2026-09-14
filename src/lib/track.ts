"use client";

/**
 * Count a click on a listing's outbound link.
 *
 * Fired from the moment a visitor taps through to a bidder's own site, which is
 * what the bidder's profile page reports back to them.
 *
 * `navigator.sendBeacon` is the point: the link opens in a new tab, so a plain
 * fetch could be cancelled by the navigation. A beacon is queued by the browser
 * and sent whether or not this page stays alive. Nothing here is allowed to
 * interfere with the click itself — no await, no preventDefault, and every
 * failure is swallowed.
 *
 * The slug is resolved by the server from the link (the same rule `/pin/<slug>`
 * uses), so a client cannot credit a click to a listing that isn't its own.
 */

export type ClickSource = "profile" | "card" | "map" | "cities";

export function trackClick(input: { link?: string | null; orgName?: string; source: ClickSource }) {
  if (typeof window === "undefined" || !input.link) return;
  const body = JSON.stringify({ link: input.link, orgName: input.orgName, source: input.source });
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/click", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/click", {
      method: "POST",
      body,
      keepalive: true,
      headers: { "content-type": "application/json" },
    }).catch(() => {});
  } catch {
    /* a metric is never worth breaking the link */
  }
}
