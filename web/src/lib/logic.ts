/**
 * Pure game math — no React, no three.js. Keeping the rules here (instead of
 * buried in the render loop) makes them unit-testable: see logic.test.ts.
 * Replace these with your own game's rules; the pattern (pure logic + a thin
 * r3f render layer in components/Game.tsx) is what to keep.
 */

/** Half-width of the square arena. Player + orbs stay within ±ARENA_HALF. */
export const ARENA_HALF = 14;
/** Player move speed, in world units per second. */
export const PLAYER_SPEED = 11;
/** How close the player must get to an orb to collect it. */
export const PICKUP_RADIUS = 1.3;
/** Seconds on the clock per round. */
export const ROUND_SECONDS = 30;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Squared 2D (x,z) distance — cheaper than a sqrt for pure comparisons. */
export function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

/** True when (px,pz) is within `radius` of (ox,oz). */
export function collides(px: number, pz: number, ox: number, oz: number, radius = PICKUP_RADIUS): boolean {
  return dist2(px, pz, ox, oz) <= radius * radius;
}

/** Keep a point inside the arena bounds. */
export function clampToArena(x: number, z: number, half = ARENA_HALF): [number, number] {
  return [clamp(x, -half, half), clamp(z, -half, half)];
}

/**
 * A random orb position at least `minDist` from (avoidX, avoidZ) so an orb
 * never spawns on top of the player. `rand` defaults to Math.random but is
 * injectable so tests stay deterministic.
 */
export function randomOrbPosition(
  avoidX: number,
  avoidZ: number,
  half = ARENA_HALF,
  minDist = 4,
  rand: () => number = Math.random,
): [number, number] {
  for (let i = 0; i < 16; i++) {
    const x = (rand() * 2 - 1) * half;
    const z = (rand() * 2 - 1) * half;
    if (dist2(x, z, avoidX, avoidZ) >= minDist * minDist) return [x, z];
  }
  // Fallback (extremely unlikely): mirror the avoid point to the far side.
  return clampToArena(-avoidX, -avoidZ, half);
}
