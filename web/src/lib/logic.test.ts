import { describe, expect, it } from "vitest";
import {
  ARENA_HALF,
  PICKUP_RADIUS,
  clamp,
  clampToArena,
  collides,
  dist2,
  randomOrbPosition,
} from "./logic";

describe("clamp", () => {
  it("bounds a value within the range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
});

describe("collides", () => {
  it("detects a touch inside the pickup radius", () => {
    expect(collides(0, 0, 0.5, 0.5)).toBe(true);
  });
  it("misses when farther than the radius", () => {
    expect(collides(0, 0, 5, 5)).toBe(false);
  });
  it("is inclusive at exactly the radius edge", () => {
    expect(collides(0, 0, PICKUP_RADIUS, 0)).toBe(true);
  });
});

describe("clampToArena", () => {
  it("keeps out-of-bounds points inside the arena", () => {
    expect(clampToArena(100, -100)).toEqual([ARENA_HALF, -ARENA_HALF]);
  });
});

describe("randomOrbPosition", () => {
  it("never spawns within minDist of the avoid point", () => {
    // A deterministic PRNG: the first (0.5, 0.5) draw lands on the player at
    // origin and must be rejected; the next draw is accepted.
    const seq = [0.5, 0.5, 0.95, 0.05, 0.2, 0.8];
    let i = 0;
    const rand = () => seq[i++ % seq.length]!;
    const [x, z] = randomOrbPosition(0, 0, ARENA_HALF, 4, rand);
    expect(dist2(x, z, 0, 0)).toBeGreaterThanOrEqual(16);
  });
  it("stays within the arena bounds", () => {
    const [x, z] = randomOrbPosition(0, 0);
    expect(Math.abs(x)).toBeLessThanOrEqual(ARENA_HALF);
    expect(Math.abs(z)).toBeLessThanOrEqual(ARENA_HALF);
  });
});
