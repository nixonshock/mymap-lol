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

export default function StakeModal({ code, onClose }: { code: string; onClose: () => void }) {
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  const lb: StateLeaderboard = useMemo(() => stateLeaderboard(code), [code, version]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [amount, setAmount] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const orgTotal = useMemo(
    () => lb.holders.find((h) => h.orgName === form.orgName.trim())?.total ?? 0,
    [lb, form.orgName],
  );
  const suggested = useMemo(() => minimumToOvertake(lb, form.orgName.trim()), [lb, form.orgName]);
  const isTopForMe = orgTotal > 0 && lb.holders[0]?.orgName === form.orgName.trim();

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
        applyPaidClaim({
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
              {lb.name} · live
            </div>
            <h2 className="font-display mt-1 text-[25px] font-bold leading-none text-[#3a2418]">
              🚩 Stake on {lb.name}
            </h2>
            <div className="mt-2 flex items-center gap-2 text-[13px] font-bold text-[#8494ab]">
              <span
                className={`h-2 w-2 rounded-full ${lb.isEmpty ? "bg-[#c6d4e4]" : "bg-[#1f7a55]"}`}
              />
              {lb.isEmpty ? "Open for claiming" : `${money(lb.totalStake)} staked`} · from {money(PRICING.minClaim)}
            </div>
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
              No holder yet. Be the first — plant your flag and own this state.
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
                        {h.orgName}
                        {i === 0 && <span aria-label="top holder">👑</span>}
                      </div>
                      {h.pitch && <div className="truncate text-[11px] font-semibold text-[#8494ab]">{h.pitch}</div>}
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
              placeholder="Organization name"
              className="w-full rounded-xl border border-[#dfe7f0] bg-[#fbfdff] px-3.5 py-2.5 text-[13px] font-semibold text-[#1f2b3e] outline-none transition focus:border-[#b9cde0]"
            />
            <input
              value={form.pitch}
              onChange={(e) => setForm({ ...form, pitch: e.target.value })}
              placeholder="One-line pitch (e.g. Fintech • HQ in KL)"
              className="w-full rounded-xl border border-[#dfe7f0] bg-[#fbfdff] px-3.5 py-2.5 text-[13px] font-semibold text-[#1f2b3e] outline-none transition focus:border-[#b9cde0]"
            />
            <input
              value={form.link}
              onChange={(e) => setForm({ ...form, link: e.target.value })}
              placeholder="Website (optional)"
              className="w-full rounded-xl border border-[#dfe7f0] bg-[#fbfdff] px-3.5 py-2.5 text-[13px] font-semibold text-[#1f2b3e] outline-none transition focus:border-[#b9cde0]"
            />
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={amount || ""}
                onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                placeholder={String(suggested)}
                className="w-full rounded-xl border border-[#dfe7f0] bg-[#fbfdff] px-3.5 py-2.5 text-[13px] font-semibold text-[#1f2b3e] outline-none transition focus:border-[#b9cde0]"
              />
              <span className="shrink-0 text-[12px] font-bold text-[#8494ab]">USD</span>
            </div>
          </div>

          <p className="mt-3 text-[12px] font-semibold leading-relaxed text-[#8494ab]">
            {isTopForMe ? (
              <>You hold the top spot with {money(orgTotal)}. Add more to grow your lead.</>
            ) : lb.isEmpty ? (
              <>Claim from {money(PRICING.minClaim)}. Your rank = your total stake.</>
            ) : (
              <>
                Current #1 is at {money(lb.holders[0].total)}. Stake{" "}
                <span className="text-[#1f2b3e]">{money(suggested)}</span> to take the top spot.
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
            disabled={busy || isInvalid}
            className="font-display w-full rounded-2xl bg-[#ffc93c] py-3 text-center text-[15px] font-semibold text-[#4a3400] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy
              ? "Processing…"
              : `${lb.isEmpty ? "Claim" : "Stake"} ${lb.name} — ${money(amount || suggested)}`}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full py-1 text-center text-[12px] font-semibold text-[#8494ab] transition hover:text-[#1f2b3e]"
          >
            maybe later
          </button>
          <p className="mt-1 text-center text-[10px] font-semibold text-[#b0bed0]">
            {process.env.NEXT_PUBLIC_PAYMENT_MODE === "live"
              ? "Secure payment · it's an ad buy, not a bet"
              : "Demo mode — no real payment is taken"}
          </p>
        </div>
      </div>
    </div>
  );
}
