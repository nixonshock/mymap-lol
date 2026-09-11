"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  subscribe,
  getVersion,
  cityLeaderboard,
  stateLeaderboard,
  minimumToOvertake,
  findHolder,
  sameOrg,
  applyPaidClaim,
} from "@/lib/store";
import { checkout } from "@/lib/checkout";
import { SOCIAL_HINT, linkLabel, normalizeLink, outboundHref, pinHref, safeHref, type ListingMode } from "@/lib/links";
import { PRICING, money, moneyBoth, moneyMyr, stateCodeToName } from "@/lib/states";
import type { StateLeaderboard, StakeTarget } from "@/lib/types";

const EMPTY_FORM = { orgName: "", pitch: "", link: "", email: "" };

export default function StakeModal({
  target,
  onClose,
  onOpenRules,
}: {
  target: StakeTarget;
  onClose: () => void;
  onOpenRules?: () => void;
}) {
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  const isCity = target.kind === "city";
  // Narrowed once here so the JSX below can use it without re-checking the union.
  const cityTarget = target.kind === "city" ? target : null;
  const lb: StateLeaderboard = useMemo(
    () => (target.kind === "city" ? cityLeaderboard(target.id) : stateLeaderboard(target.code)),
    [target, version],
  );
  const stateCode = target.kind === "city" ? target.stateCode : target.code;
  const where = target.kind === "city" ? `${target.name} · ${stateCodeToName(target.stateCode)}` : stateCodeToName(target.code);

  const [form, setForm] = useState(EMPTY_FORM);
  const [amountInput, setAmountInput] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  // worldmap.lol's two listing modes: a product website, or a social profile.
  const [mode, setMode] = useState<ListingMode>("site");

  // The NAME is the entry (there are no accounts), so a typed name that matches
  // an existing holder — case/space-insensitively — tops that entry up instead
  // of starting a second listing. `mine` is that match.
  const mine = useMemo(() => findHolder(lb, form.orgName), [lb, form.orgName]);
  const orgTotal = mine?.total ?? 0;
  const suggested = useMemo(() => minimumToOvertake(lb, form.orgName.trim()), [lb, form.orgName]);
  /**
   * The amount follows the suggestion until the visitor edits the box — then
   * their number wins. Following it matters for the top-up promise: typing the
   * name you already hold drops the box straight to the difference you owe
   * ($30 to retake #1), instead of leaving a stale figure in the way.
   */
  const amountFollows = amountInput === null || amountInput.trim() === "";
  const amount = amountFollows ? suggested : Math.max(0, Math.floor(Number(amountInput) || 0));
  const isTopForMe = orgTotal > 0 && sameOrg(lb.holders[0]?.orgName ?? "", form.orgName);

  // The stored link is the domain only (site) or the canonical profile URL
  // (social), so the same listing always tops up instead of duplicating.
  const normalized = useMemo(() => normalizeLink(form.link, mode), [form.link, mode]);
  /** Typed name wins; otherwise the link names the listing ("acme.com" / "@handle"). */
  const displayName = form.orgName.trim() || normalized.display || "";
  /**
   * What actually gets sent: when the typed name matches an existing holder we
   * send THEIR stored spelling, so the payment always lands on the same entry
   * even if this visitor capitalised it differently.
   */
  const claimName = mine?.orgName || displayName;

  const isInvalid = !displayName || !form.pitch.trim() || amount < 1 || Boolean(normalized.error);

  async function submit() {
    setBusy(true);
    setResult(null);
    try {
      const payload = {
        stateCode,
        cityId: cityTarget?.id,
        cityName: cityTarget?.name,
        orgName: claimName,
        pitch: form.pitch.trim(),
        link: normalized.href ?? undefined,
        amount,
      };

      // LIVE: the stake is parked as pending and Whop's hosted checkout takes
      // over from here (worldmap.lol's flow) — "Opening secure checkout…".
      if (process.env.NEXT_PUBLIC_PAYMENT_MODE === "live") {
        const applied = await applyPaidClaim(payload, { email: form.email.trim() || undefined });
        if (applied.checkoutUrl) {
          setOpening(true);
          window.location.assign(applied.checkoutUrl);
          return;
        }
        setResult({ ok: applied.ok, message: applied.message });
        return;
      }

      const pay = await checkout(payload);
      if (pay.status === "paid") {
        const applied = await applyPaidClaim(payload, { email: form.email.trim() || undefined });
        if (!applied.ok) {
          setResult({ ok: false, message: applied.message });
          return;
        }
        setResult({
          ok: true,
          message: `${money(amount)} staked on ${lb.name}. You're now a holder!`,
        });
        setForm(EMPTY_FORM);
        setAmountInput(null);
      } else {
        setResult({ ok: false, message: pay.message });
      }
    } catch {
      setResult({ ok: false, message: "Payment failed — try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-end justify-center bg-[rgba(30,45,70,0.4)] p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[26px] bg-white shadow-2xl sm:rounded-[26px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-start justify-between border-b border-[#eef3f9] px-6 py-5">
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-[1.54px] text-[#8494ab]">
              {where} · live
            </div>
            <h2 className="font-display mt-1 text-[25px] font-bold leading-none text-[#3a2418]">
              {isCity ? "🏙️" : "🚩"} Stake on {lb.name}
            </h2>
            <div className="mt-2 flex items-center gap-2 text-[13px] font-bold text-[#8494ab]">
              <span
                className={`h-2 w-2 rounded-full ${lb.isEmpty ? "bg-[#c6d4e4]" : "bg-[#1f7a55]"}`}
              />
              {lb.isEmpty ? "Open for claiming" : `${money(lb.totalStake)} staked`} · from {moneyBoth(PRICING.minClaim)}
            </div>
            <p className="mt-2 max-w-[46ch] text-[12.5px] font-semibold leading-relaxed text-[#8494ab]">
              Your rank is your total stake on this {isCity ? "city" : "state"}. Top up anytime —
              reclaiming #1 only costs the difference, your past stake still counts.{" "}
              <span className="text-[#1f2b3e]">Your name is your entry:</span> stake under the same
              name to add to it, a different name starts a new one.
            </p>
            {cityTarget && (
              <div className="mt-1 text-[11.5px] font-semibold text-[#8494ab]">
                City stakes stay on {cityTarget.name} — {stateCodeToName(cityTarget.stateCode)} itself is not
                claimed.
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef3f9] text-[14px] text-[#8494ab] transition hover:bg-[#e6eef7]"
          >
            ✕
          </button>
        </div>

        {/* leaderboard */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="text-[12px] font-extrabold uppercase tracking-wide text-[#b8860b]">
            Leaderboard
          </div>
          {lb.isEmpty ? (
            <p className="mt-2 text-[13px] font-semibold leading-relaxed text-[#8494ab]">
              No holder yet. Be the first — plant your flag and own this {isCity ? "city" : "state"}.
            </p>
          ) : (
            <ol className="mt-2 space-y-1.5">
              {lb.holders.slice(0, 6).map((h, i) => (
                <li
                  key={h.orgName}
                  className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ${
                    i === 0 ? "bg-[#fff7e0] ring-1 ring-[#ffe3a1]" : "bg-[#f2f7fc]"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                        i === 0 ? "bg-[#ffc93c] text-[#4a3400]" : "bg-white text-[#8494ab] ring-1 ring-[#e5edf5]"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 truncate text-[13px] font-bold text-[#1f2b3e]">
                        {/* the name opens the bidder's listing page (their link preview) */}
                        <Link
                          href={pinHref(h.orgName, h.link)}
                          onClick={(e) => e.stopPropagation()}
                          title={`${h.orgName} — listing page`}
                          className="truncate text-[#166d4a] underline decoration-[#9fd0b9] underline-offset-2 transition hover:text-[#0f5c3c]"
                        >
                          {h.orgName}
                        </Link>
                        {safeHref(h.link) && (
                          <a
                            href={outboundHref(h.link) ?? undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Open ${h.orgName}'s site`}
                            title={safeHref(h.link) ?? undefined}
                            className="shrink-0 text-[10.5px] font-bold text-[#8494ab] transition hover:text-[#1f7a55]"
                          >
                            ↗
                          </a>
                        )}
                        {i === 0 && <span aria-label="top holder">👑</span>}
                      </div>
                      <div className="truncate text-[11px] font-semibold text-[#8494ab]">
                        {[h.pitch, linkLabel(h.link)].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-[13px] font-extrabold tabular-nums text-[#1f7a55]">
                    {money(h.total)}
                  </div>
                </li>
              ))}
            </ol>
          )}

          {/* form */}
          <div className="mt-5 space-y-2.5">
            <input
              value={form.orgName}
              onChange={(e) => setForm({ ...form, orgName: e.target.value })}
              placeholder={mode === "social" ? "Name (optional — defaults to the @handle)" : "Organization name (optional)"}
              className="w-full rounded-xl border border-[#dfe7f0] bg-[#fbfdff] px-3.5 py-2.5 text-[13px] font-semibold text-[#1f2b3e] outline-none transition focus:border-[#b9cde0]"
            />
            {/* Live recognition: proves the name IS the entry, so a top-up is
                visibly an add-to, not a second listing. */}
            {form.orgName.trim() && (
              <div
                className={`px-1 text-[11px] font-semibold leading-relaxed ${
                  mine ? "text-[#1f7a55]" : "text-[#8494ab]"
                }`}
              >
                {mine
                  ? `✓ Recognised ${mine.orgName} — this payment adds to their ${money(mine.total)} here, it does not start a new entry.`
                  : lb.isEmpty
                    ? "New entry — first to claim here. Keep this exact name to top up later."
                    : `New entry — nobody here has staked as ${form.orgName.trim()}. Reuse the exact name you staked with to top up instead.`}
              </div>
            )}
            <input
              value={form.pitch}
              onChange={(e) => setForm({ ...form, pitch: e.target.value })}
              placeholder="One-line pitch (e.g. Fintech • HQ in KL)"
              className="w-full rounded-xl border border-[#dfe7f0] bg-[#fbfdff] px-3.5 py-2.5 text-[13px] font-semibold text-[#1f2b3e] outline-none transition focus:border-[#b9cde0]"
            />

            {/* listing mode — worldmap.lol's 🌐 Product URL / @ Social profile tabs */}
            <div className="flex items-center gap-1.5 rounded-full bg-[#f2f7fc] p-1 ring-1 ring-[#e5edf5]">
              {(
                [
                  { key: "site", label: "🌐 Website" },
                  { key: "social", label: "@ Social profile" },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={mode === t.key}
                  onClick={() => setMode(t.key)}
                  className={`flex-1 rounded-full px-3 py-1.5 text-[12px] font-extrabold transition ${
                    mode === t.key ? "bg-white text-[#1f2b3e] shadow-sm" : "text-[#8494ab] hover:text-[#1f2b3e]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <input
              value={form.link}
              onChange={(e) => setForm({ ...form, link: e.target.value })}
              placeholder={mode === "social" ? "x.com/yourhandle" : "yourstartup.com"}
              className={`w-full rounded-xl border bg-[#fbfdff] px-3.5 py-2.5 text-[13px] font-semibold text-[#1f2b3e] outline-none transition focus:border-[#b9cde0] ${
                normalized.error ? "border-[#e8b4b4]" : "border-[#dfe7f0]"
              }`}
            />
            {mode === "social" && !normalized.error && (
              <div className="text-[11px] font-semibold text-[#8494ab]">{SOCIAL_HINT}</div>
            )}
            {normalized.error ? (
              <div className="text-[11px] font-bold text-[#c0392b]">{normalized.error}</div>
            ) : (
              !form.orgName.trim() &&
              normalized.display && (
                <div className="text-[11px] font-semibold text-[#8494ab]">
                  Listed as <span className="font-extrabold text-[#1f7a55]">{normalized.display}</span>
                </div>
              )
            )}

            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="Email for your receipt (optional)"
              className="w-full rounded-xl border border-[#dfe7f0] bg-[#fbfdff] px-3.5 py-2.5 text-[13px] font-semibold text-[#1f2b3e] outline-none transition focus:border-[#b9cde0]"
            />
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={amountFollows ? String(suggested) : amountInput ?? ""}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder={String(suggested)}
                className="w-full rounded-xl border border-[#dfe7f0] bg-[#fbfdff] px-3.5 py-2.5 text-[13px] font-semibold text-[#1f2b3e] outline-none transition focus:border-[#b9cde0]"
              />
              <span className="shrink-0 text-[12px] font-bold text-[#8494ab]">USD</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-[11px] font-semibold text-[#8494ab]">
              <span>
                charged as {money(amount)} · {moneyMyr(amount)}
              </span>
              {/* Edited away from the suggestion? One tap puts back the exact
                  amount that takes #1 (or the $10 floor when already #1). */}
              {!amountFollows && amount !== suggested && (
                <button
                  type="button"
                  onClick={() => setAmountInput(null)}
                  className="shrink-0 underline decoration-dotted underline-offset-2 transition hover:text-[#1f7a55]"
                >
                  use {money(suggested)}
                  {isTopForMe ? "" : " — takes #1"}
                </button>
              )}
            </div>
          </div>

          <p className="mt-3 text-[12.5px] font-bold leading-relaxed text-[#1f2b3e]">
            {isTopForMe ? (
              <>
                👑 You hold #1 in {lb.name} with {money(orgTotal)}. Add more to grow your lead.
              </>
            ) : lb.isEmpty ? (
              <>👑 {moneyBoth(PRICING.minClaim)} claims {lb.name} outright — first mover holds #1.</>
            ) : (
              <>
                👑 {money(suggested)} takes #1 in {lb.name}!{" "}
                <span className="font-semibold text-[#8494ab]">({moneyMyr(suggested)})</span>
              </>
            )}
          </p>

          {result && (
            <div
              className={`mt-3 rounded-xl px-3 py-2 text-[13px] font-semibold ${
                result.ok ? "bg-[#e7f7ef] text-[#1f7a55]" : "bg-[#fdeaea] text-[#c0392b]"
              }`}
            >
              {result.message}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="border-t border-[#eef3f9] px-6 py-4">
          <button
            type="button"
            onClick={submit}
            disabled={busy || opening || isInvalid}
            className="font-display w-full rounded-2xl bg-[#ffc93c] py-3 text-center text-[15px] font-semibold text-[#4a3400] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {opening
              ? "Opening secure checkout…"
              : busy
                ? "Processing…"
                : `${lb.isEmpty ? "Claim" : "Stake"} ${lb.name} — ${moneyBoth(amount || suggested)}`}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full py-1 text-center text-[12px] font-semibold text-[#8494ab] transition hover:text-[#1f2b3e]"
          >
            maybe later
          </button>
          {process.env.NEXT_PUBLIC_PAYMENT_MODE === "live" ? (
            <p className="mt-2 text-center text-[10.5px] font-semibold leading-relaxed text-[#b0bed0]">
              🔒 Secure payment via Whop · it&apos;s an ad buy, not a bet · by continuing you agree to
              the{" "}
              <button
                type="button"
                onClick={onOpenRules}
                className="underline decoration-dotted underline-offset-2 transition hover:text-[#8494ab]"
              >
                rules &amp; terms
              </button>
            </p>
          ) : (
            <p className="mt-1 text-center text-[10px] font-semibold text-[#b0bed0]">
              Demo mode — no real payment is taken
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
