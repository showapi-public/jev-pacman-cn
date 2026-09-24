/**
 * A seeded pseudo-random generator, shared by every game and by the baseline
 * players.
 *
 * It lives at the root of `lib/` because nothing about it is game-specific: a
 * seed has to replay a whole game exactly, whether that game is Pac-Man, the
 * snake, or a reference player that just wants a deterministic coin flip.
 */

/** mulberry32: a small deterministic PRNG so a seed replays a whole game. */
export function nextRandom(state: number): { value: number; state: number } {
  let t = (state + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: t | 0 };
}

export function seedToRngState(seed: number): number {
  return seed | 0;
}
