"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  subscribe,
  getVersion,
  stateLeaderboard,
  minimumToOvertake,
  applyPaidClaim,
} from "@/lib/store";
import { checkout } from "@/lib/checkout";
import { PRICING, money } from "@/lib/states";
import type { StateLeaderboard } from "@/lib/types";

const EMPTY_FORM = { orgName: "", pitch: "", link: "" };

export default function ClaimPanel({ code }: { code: string }) {
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  const lb: StateLeaderboard = useMemo(() => stateLeaderboard(code), [code, version]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [amount, setAmount] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const orgTotal = useMemo(
    () => lb.holders.find((h) => h.orgName === form.orgName.trim())?.total ?? 0,
    [lb, form.orgName],
  );
  const suggested = useMemo(() => minimumToOvertake(lb, form.orgName.trim()), [lb, form.orgName]);
  const isTopForMe = orgTotal > 0 && (lb.holders[0]?.orgName === form.orgName.trim());

  // Keep the suggested amount in sync with the form.
  useEffect(() => {
    setAmount((a) => (a <= 0 ? suggested : Math.max(a, suggested)));
  }, [suggested]);

  const isInvalid = !form.orgName.trim() || !form.pitch.trim() || amount < 1;

  async function submit() {
    setBusy(true);
    setResult(null);
    try {
      const pay = await checkout({
        stateCode: code,
        orgName: form.orgName.trim(),
        pitch: form.pitch.trim(),
        link: form.link.trim() || undefined,
        amount,
      });
      if (pay.status === "paid") {
        const applied = applyPaidClaim({
          stateCode: code,
          orgName: form.orgName.trim(),
          pitch: form.pitch.trim(),
          link: form.link.trim() || undefined,
          amount,
        });
        setResult({ ok: true, message: `${money(amount)} staked on ${lb.name}. You're now a holder!` });
        setForm(EMPTY_FORM);
      } else {
        setResult({ ok: false, message: pay.message });
      }
    } catch (e) {
      setResult({ ok: false, message: "Payment failed — try again." });
    } finally {
      setBusy(false);
    }
  }

  function copyShare() {
    const shareText = `${lb.name}: ${lb.totalStake > 0 ? money(lb.totalStake) + " staked" : "open for claiming"} on mymap.lol`;
    navigator.clipboard?.writeText(shareText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-zinc-800 bg-zinc-950/60">
      {/* header */}
      <div className="border-b border-zinc-800 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[12px] uppercase tracking-wider text-zinc-500">State</div>
            <h2 className="mt-1 text-2xl font-bold text-zinc-50">{lb.name}</h2>
          </div>
          <span
            className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ${
              lb.isEmpty ? "bg-zinc-800 text-zinc-300" : "bg-emerald-500/15 text-emerald-300"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${lb.isEmpty ? "bg-zinc-400" : "bg-emerald-400"}`} />
            {lb.isEmpty ? "Open" : "Claimed"}
          </span>
        </div>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <div className="text-[12px] text-zinc-500">Total staked</div>
            <div className="text-xl font-bold text-emerald-400">{money(lb.totalStake)}</div>
          </div>
          {!lb.isEmpty && (
            <button
              onClick={copyShare}
              className="text-[12px] font-medium text-zinc-400 transition hover:text-zinc-200"
            >
              {copied ? "Copied ✓" : "Copy share"}
            </button>
          )}
        </div>
      </div>

      {/* leaderboard */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">Leaderboard</h3>
          {!lb.isEmpty && (
            <span className="text-[12px] text-zinc-500">by total stake</span>
          )}
        </div>

        {lb.isEmpty ? (
          <p className="mt-2 text-sm leading-relaxed text-zinc-500">
            No holder yet. Be the first — plant your flag and own this state on the leaderboard.
          </p>
        ) : (
          <ol className="space-y-2">
            {lb.holders.slice(0, 8).map((h, i) => (
              <li
                key={h.orgName}
                className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ${
                  i === 0 ? "bg-emerald-500/10 ring-1 ring-emerald-500/30" : "bg-zinc-900/60"
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
                      i === 0 ? "bg-emerald-500 text-zinc-950" : "bg-zinc-800 text-zinc-300"
                    }`}
                  >
                    {i === 0 ? "1" : i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 truncate text-sm font-medium text-zinc-100">
                      {h.orgName}
                      {i === 0 && <span aria-label="top holder">👑</span>}
                    </div>
                    {h.pitch && <div className="truncate text-[12px] text-zinc-500">{h.pitch}</div>}
                  </div>
                </div>
                <div className="shrink-0 text-sm font-semibold tabular-nums text-zinc-300">
                  {money(h.total)}
                </div>
              </li>
            ))}
          </ol>
        )}

        {/* claim / stake form */}
        <div className="mt-5 border-t border-zinc-800 pt-5">
          <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
            {lb.isEmpty ? "Claim this state" : "Stake to climb"}
          </h3>

          <div className="space-y-3">
            <input
              value={form.orgName}
              onChange={(e) => setForm({ ...form, orgName: e.target.value })}
              placeholder="Organization name"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-emerald-500"
            />
            <input
              value={form.pitch}
              onChange={(e) => setForm({ ...form, pitch: e.target.value })}
              placeholder="One-line pitch (e.g. Fintech • HQ in KL)"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-emerald-500"
            />
            <input
              value={form.link}
              onChange={(e) => setForm({ ...form, link: e.target.value })}
              placeholder="Website (optional)"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-emerald-500"
            />

            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={amount || ""}
                onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                placeholder={String(suggested)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-emerald-500"
              />
              <span className="shrink-0 text-sm font-medium text-zinc-500">USD</span>
            </div>

            <div className="text-[12px] leading-relaxed text-zinc-500">
              {isTopForMe ? (
                <>You hold the top spot with {money(orgTotal)}. Add more to grow your lead.</>
              ) : lb.isEmpty ? (
                <>Claim from {money(PRICING.minClaim)}. Your rank = your total stake.</>
              ) : (
                <>
                  Current #{1} is at {money(lb.holders[0].total)}. Stake{" "}
                  <span className="text-zinc-300">{money(suggested)}</span> to take the top spot.
                </>
              )}
            </div>

            <button
              onClick={submit}
              disabled={busy || isInvalid}
              className="w-full rounded-lg bg-emerald-500 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Processing…" : lb.isEmpty ? `Claim ${lb.name} — ${money(amount || suggested)}` : `Stake ${money(amount || suggested)}`}
            </button>

            <p className="text-center text-[11px] leading-relaxed text-zinc-600">
              {process.env.NEXT_PUBLIC_PAYMENT_MODE === "live"
                ? "Secure payment · it's an ad buy, not a bet"
                : "Demo mode — no real payment is taken"}
            </p>

            {result && (
              <div
                className={`rounded-lg px-3 py-2 text-[13px] ${
                  result.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"
                }`}
              >
                {result.message}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
