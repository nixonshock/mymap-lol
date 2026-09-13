/**
 * The ranking type scale (Jerry's call, Sep 2026).
 *
 * Every ranked list steps its type down with the rank — #1 is biggest, #2 and
 * #3 step down, and everything from 4th place on shares the list's normal size.
 * The point is that the top bidder looks like the top bidder.
 *
 * `rankSize(rank, base)` returns the px size for a row whose list normally
 * renders at `base` px — pass the base the list already used.
 */
const STEPS = [1.34, 1.17, 1.08, 1];

export function rankSize(rank: number, base: number): number {
  const step = STEPS[Math.min(Math.max(Math.round(rank), 1), STEPS.length) - 1];
  return Math.round(base * step);
}
