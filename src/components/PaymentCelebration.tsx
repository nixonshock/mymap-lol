"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { moneyBoth } from "@/lib/states";
import type { PaidReturn } from "@/lib/store";

/**
 * The thank-you moment after a stake is paid for.
 *
 * Whop drops the buyer back on the map with the stake on the URL; the page turns
 * those facts into this: a short firework volley over the map plus a card that
 * names the state they just took, so the payment feels like it bought something.
 * Auto-dismisses (and any click closes it), and the motion is skipped entirely
 * for `prefers-reduced-motion` — there the card just appears.
 */

const COLORS = ["#ffc93c", "#ffd873", "#ffffff", "#7fb1ff", "#3f7dd6", "#ff9f43", "#4ade80"];
const LIFETIME_MS = 12_000;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rot: number;
  spin: number;
  life: number;
  round: boolean;
}

function Fireworks() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const parts: Particle[] = [];
    /** `up` = -1 launches skyward, 0 = a symmetric burst in the air. */
    const spawn = (x: number, y: number, count: number, spread: number, power: number, up: -1 | 0) => {
      for (let i = 0; i < count; i++) {
        const angle = up < 0 ? -Math.PI / 2 + (Math.random() - 0.5) * spread : Math.random() * Math.PI * 2;
        const speed = power * (0.55 + Math.random() * 0.75);
        parts.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 4 + Math.random() * 6,
          color: COLORS[(Math.random() * COLORS.length) | 0],
          rot: Math.random() * Math.PI,
          spin: (Math.random() - 0.5) * 0.32,
          life: 1,
          round: Math.random() < 0.35,
        });
      }
    };

    // Opening volley: a cannon from each bottom corner plus a burst overhead,
    // then pops drifting across the sky while the card settles (~4s of sparks).
    spawn(w * 0.16, h + 8, 62, 0.9, 13, -1);
    spawn(w * 0.84, h + 8, 62, 0.9, 13, -1);
    spawn(w * 0.5, h * 0.58, 78, Math.PI * 2, 7, 0);
    const pops = [300, 650, 1000, 1350, 1700, 2050, 2450, 2850].map((delay, i) =>
      window.setTimeout(
        () => spawn(w * (0.14 + 0.105 * i), h * (0.2 + Math.random() * 0.26), 48, Math.PI * 2, 6, 0),
        delay,
      ),
    );

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 16.67, 3);
      last = now;
      ctx.clearRect(0, 0, w, h);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.vy += 0.34 * dt; // gravity
        p.vx *= 0.992;
        p.vy *= 0.992;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
        p.life -= 0.0046 * dt;
        if (p.life <= 0 || p.y > h + 80) {
          parts.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.4));
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size * 0.42, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        }
        ctx.restore();
      }
      if (parts.length) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      pops.forEach((t) => window.clearTimeout(t));
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-[71] h-full w-full" aria-hidden />;
}

export default function PaymentCelebration({
  facts,
  onClose,
}: {
  facts: PaidReturn;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    const timer = window.setTimeout(onClose, LIFETIME_MS);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [onClose]);

  return (
    <>
      <Fireworks />
      <div className="pointer-events-none fixed inset-0 z-[70] flex items-end justify-center p-3 sm:items-center sm:p-4">
        <div
          className="pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-[26px] bg-white p-6 text-center shadow-2xl transition-[opacity,transform] duration-300 ease-out"
          style={{
            opacity: shown ? 1 : 0,
            transform: shown ? "translateY(0) scale(1)" : "translateY(16px) scale(0.96)",
          }}
          role="dialog"
          aria-label={`Payment received — ${facts.stateName}`}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-[#8494ab] transition hover:bg-[#f2f5fa] hover:text-[#1f2b3e]"
          >
            ✕
          </button>

          <div className="text-[42px] leading-none">🎉</div>
          <h2 className="font-display mt-2 text-[22px] font-semibold text-[#1f2b3e]">
            {facts.cityName ?? facts.stateName} is yours!
          </h2>
          <p className="mt-1 text-[13px] font-semibold text-[#3f7dd6]">
            {facts.orgName} · {moneyBoth(facts.amount)} placement
          </p>
          <p className="mx-auto mt-3 max-w-[19rem] text-[12.5px] leading-relaxed text-[#6b7c93]">
            Payment received — your name is in the World Order and the{" "}
            {facts.cityName ? "city" : "state"} now carries your colour. Top up any time to hold the crown.
          </p>

          <Link
            href={facts.href}
            onClick={onClose}
            className="font-display mt-5 block w-full rounded-2xl bg-[#ffc93c] py-3 text-center text-[15px] font-semibold text-[#4a3400] transition hover:brightness-95"
          >
            See my listing
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full py-1 text-center text-[12px] font-semibold text-[#8494ab] transition hover:text-[#1f2b3e]"
          >
            back to the map
          </button>
        </div>
      </div>
    </>
  );
}
