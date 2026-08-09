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
  scoreFromDistance,
} from "./logic";

describe("checkCollision", () => {
  it("returns false when lanes differ", () => {
    expect(checkCollision(0, 1, PLAYER_Z)).toBe(false);
    expect(checkCollision(2, 0, PLAYER_Z)).toBe(false);
  });

  it("returns true when same lane and obstacle at player z", () => {
    expect(checkCollision(1, 1, PLAYER_Z)).toBe(true);
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

  it("decreases over time but not below MIN", () => {
    expect(currentSpawnInterval(9999)).toBe(MIN_SPAWN_INTERVAL);
  });
});

describe("scoreFromDistance", () => {
  it("returns 0 for short distances", () => {
    expect(scoreFromDistance(0)).toBe(0);
    expect(scoreFromDistance(4)).toBe(0);
  });

  it("increases with distance", () => {
    expect(scoreFromDistance(50)).toBeGreaterThan(scoreFromDistance(10));
  });
});
