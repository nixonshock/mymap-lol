"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { STATES, money } from "@/lib/states";
import { globalTopOrgs, linkForOrg } from "@/lib/store";
import { pinHref } from "@/lib/links";
import { Favicon } from "@/components/LinkPreview";

/** Shared modal shell (worldmap.lol style: dimmed overlay + white rounded card). */
function Shell({
  children,
  onClose,
  maxW = "max-w-lg",
}: {
  children: React.ReactNode;
  onClose: () => void;
  maxW?: string;
}) {
  return (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-end justify-center bg-[rgba(30,45,70,0.4)] p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className={`flex max-h-[92dvh] w-full ${maxW} flex-col overflow-hidden rounded-t-[26px] bg-white shadow-2xl sm:rounded-[26px]`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function CloseX({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      aria-label="Close"
      onClick={onClose}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef3f9] text-[14px] text-[#8494ab] transition hover:bg-[#e6eef7]"
    >
      ✕
    </button>
  );
}

function Kicker({ text }: { text: string }) {
  return (
    <div className="text-[11px] font-extrabold uppercase tracking-[1.54px] text-[#8494ab]">{text}</div>
  );
}

/* ---------------- How it works ---------------- */

export function InfoModal({ onClose }: { onClose: () => void }) {
  const steps = [
    { emoji: "🚩", title: "Claim", body: "Plant your flag on any open state from just $10. Your card (name, pitch, link) holds the spot." },
    { emoji: "🏙️", title: "Or a single city", body: "Stake on one city instead — it is listed in the Cities panel on the right, and it never claims the state around it. Add your own city if it isn't listed." },
    { emoji: "📈", title: "Stake to climb", body: "Your rank is your total stake on a state or a city. Out-stake the #1 to take the top spot." },
    { emoji: "🔑", title: "Your name is your entry", body: "There are no accounts — everything paid under one name adds up on one entry. Top up using the exact same name you staked with, and the same link; a different name starts a new listing. The form tells you which one you're on as you type." },
    { emoji: "♻️", title: "Reclaim anytime", body: "Get passed? Just top up the difference — under your same name it adds to your entry, and your past stake still counts, so nothing is wasted." },
  ];
  return (
    <Shell onClose={onClose} maxW="max-w-md">
      <div className="flex items-start justify-between px-6 pt-5">
        <div>
          <Kicker text="mymap.lol · live" />
          <h2 className="font-display mt-1 text-[25px] font-bold text-[#3a2418]">How conquest works 🇲🇾</h2>
        </div>
        <CloseX onClose={onClose} />
      </div>
      <div className="flex-1 space-y-2.5 overflow-y-auto px-6 py-5">
        {steps.map((s) => (
          <div key={s.title} className="flex gap-3 rounded-2xl bg-[#f2f7fc] px-4 py-3">
            <div className="text-xl">{s.emoji}</div>
            <div>
              <div className="font-display text-[14px] font-semibold text-[#1f2b3e]">{s.title}</div>
              <div className="mt-0.5 text-[12px] font-semibold leading-relaxed text-[#8494ab]">{s.body}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-[#eef3f9] px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="font-display w-full rounded-2xl bg-[#ffc93c] py-3 text-[15px] font-semibold text-[#4a3400] transition hover:brightness-95"
        >
          Got it
        </button>
      </div>
    </Shell>
  );
}

/* ---------------- The board ---------------- */

export function BoardModal({ onClose }: { onClose: () => void }) {
  const orgs = useMemo(() => globalTopOrgs(10), []);
  return (
    <Shell onClose={onClose} maxW="max-w-md">
      <div className="flex items-start justify-between px-6 pt-5">
        <div>
          <Kicker text="mymap.lol · live" />
          <h2 className="font-display mt-1 text-[25px] font-bold text-[#3a2418]">The board 🏆</h2>
          <div className="mt-1 text-[12px] font-semibold text-[#8494ab]">
            Each startup&apos;s total stake across the map.
          </div>
        </div>
        <CloseX onClose={onClose} />
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {orgs.length === 0 ? (
          <p className="px-2 py-8 text-center text-[13px] font-semibold text-[#8494ab]">
            No holders yet. Claim a state to appear here.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {orgs.map((o, i) => (
              <li
                key={o.orgName}
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
                  <Favicon link={linkForOrg(o.orgName)} />
                  <Link
                    href={pinHref(o.orgName, linkForOrg(o.orgName))}
                    title={`${o.orgName} — listing page`}
                    className="truncate text-[13px] font-bold text-[#1f2b3e] underline decoration-[#dfe7f0] underline-offset-2 transition hover:text-[#166d4a]"
                  >
                    {o.orgName}
                  </Link>
                  <span className="shrink-0 text-[10.5px] font-bold text-[#8494ab]">
                    {o.states} {o.states === 1 ? "state" : "states"}
                  </span>
                </div>
                <div className="shrink-0 text-[13px] font-extrabold tabular-nums text-[#1f7a55]">
                  {money(o.total)}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Shell>
  );
}

/* ---------------- Find a state ---------------- */

export function SearchModal({ onClose, onPick }: { onClose: () => void; onPick: (code: string) => void }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return STATES;
    return STATES.filter((x) => x.name.toLowerCase().includes(s));
  }, [q]);

  return (
    <Shell onClose={onClose} maxW="max-w-md">
      <div className="flex items-start justify-between px-6 pt-5">
        <div>
          <Kicker text="mymap.lol · live" />
          <h2 className="font-display mt-1 text-[25px] font-bold text-[#3a2418]">Find a state 🔍</h2>
        </div>
        <CloseX onClose={onClose} />
      </div>
      <div className="px-6 pt-4">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search states…"
          className="w-full rounded-xl border border-[#dfe7f0] bg-[#fbfdff] px-3.5 py-2.5 text-[13px] font-semibold text-[#1f2b3e] outline-none transition focus:border-[#b9cde0]"
        />
      </div>
      <div className="grid flex-1 grid-cols-2 gap-1.5 overflow-y-auto p-4">
        {results.map((s) => (
          <button
            key={s.code}
            type="button"
            onClick={() => {
              onClose();
              onPick(s.code);
            }}
            className="rounded-xl bg-[#f2f7fc] px-3 py-2.5 text-left text-[13px] font-bold text-[#1f2b3e] transition hover:bg-[#e9f1f9]"
          >
            {s.name}
          </button>
        ))}
        {results.length === 0 && (
          <p className="col-span-2 py-6 text-center text-[13px] font-semibold text-[#8494ab]">
            No states match.
          </p>
        )}
      </div>
    </Shell>
  );
}
