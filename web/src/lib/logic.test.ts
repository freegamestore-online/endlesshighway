import { describe, it, expect } from "vitest";
import {
  checkCollision,
  currentSpeed,
  currentSpawnInterval,
  BASE_SPEED,
  MAX_SPEED,
  BASE_SPAWN_INTERVAL,
  MIN_SPAWN_INTERVAL,
  PLAYER_Z,
  PLAYER_RADIUS,
  OBSTACLE_HALF,
  scoreFromDistance,
  randomLane,
} from "./logic";

describe("checkCollision", () => {
  it("returns false when lanes differ", () => {
    expect(checkCollision(0, 1, PLAYER_Z)).toBe(false);
    expect(checkCollision(2, 0, PLAYER_Z)).toBe(false);
  });

  it("returns true when same lane and obstacle exactly at player z", () => {
    expect(checkCollision(1, 1, PLAYER_Z)).toBe(true);
  });

  it("returns true when obstacle is within collision range", () => {
    const justInside = PLAYER_Z + PLAYER_RADIUS + OBSTACLE_HALF - 0.01;
    expect(checkCollision(0, 0, justInside)).toBe(true);
  });

  it("returns false when same lane but obstacle far away", () => {
    expect(checkCollision(0, 0, -50)).toBe(false);
    expect(checkCollision(0, 0, 30)).toBe(false);
  });
});

describe("currentSpeed", () => {
  it("starts at BASE_SPEED", () => {
    expect(currentSpeed(0)).toBe(BASE_SPEED);
  });

  it("increases over time", () => {
    expect(currentSpeed(10)).toBeGreaterThan(BASE_SPEED);
  });

  it("caps at MAX_SPEED", () => {
    expect(currentSpeed(9999)).toBe(MAX_SPEED);
  });
});

describe("currentSpawnInterval", () => {
  it("starts at BASE_SPAWN_INTERVAL", () => {
    expect(currentSpawnInterval(0)).toBe(BASE_SPAWN_INTERVAL);
  });

  it("decreases over time", () => {
    expect(currentSpawnInterval(30)).toBeLessThan(BASE_SPAWN_INTERVAL);
  });

  it("never goes below MIN_SPAWN_INTERVAL", () => {
    expect(currentSpawnInterval(9999)).toBe(MIN_SPAWN_INTERVAL);
  });
});

describe("scoreFromDistance", () => {
  it("returns 0 for short distances", () => {
    expect(scoreFromDistance(0)).toBe(0);
    expect(scoreFromDistance(4.9)).toBe(0);
  });

  it("increases with distance", () => {
    expect(scoreFromDistance(50)).toBeGreaterThan(scoreFromDistance(10));
  });
});

describe("randomLane", () => {
  it("always returns 0, 1, or 2", () => {
    for (let i = 0; i < 50; i++) {
      const lane = randomLane();
      expect([0, 1, 2]).toContain(lane);
    }
  });

  it("is deterministic with a seeded rand", () => {
    expect(randomLane(() => 0)).toBe(0);
    expect(randomLane(() => 0.99)).toBe(2);
  });
});
