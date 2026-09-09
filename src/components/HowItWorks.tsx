"use client";

import { useState } from "react";

export default function HowItWorks() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-zinc-300 transition hover:text-zinc-50"
      >
        How it works
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-bold text-zinc-50">How it works</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-lg px-2 text-zinc-400 transition hover:text-zinc-100"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-5">
              {[
                {
                  n: "1",
                  ti: "Claim your flag",
                  d: "Plant your organization on any open state from a small fee. Your card (name, pitch, link) holds the spot.",
                },
                {
                  n: "2",
                  ti: "Stake to climb",
                  d: "Your rank is your total stake on a state. Out-stake the current #1 to take the top spot.",
                },
                {
                  n: "3",
                  ti: "Reclaim anytime",
                  d: "Get passed? Just top up the difference — your past stake still counts, so nothing is wasted.",
                },
              ].map((s) => (
                <div key={s.n} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[13px] font-bold text-emerald-300">
                    {s.n}
                  </span>
                  <div>
                    <h3 className="text-[14px] font-semibold text-zinc-100">{s.ti}</h3>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-zinc-400">{s.d}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-5 border-t border-zinc-800 pt-4 text-[12px] leading-relaxed text-zinc-600">
              Borders are illustrative, not a political statement. On the live platform this is an ad
              buy, not a bet. Map data: Malaysia administrative boundaries.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
