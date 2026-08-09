/**
 * Pure game logic for Endless Highway — no React, no Three.js.
 * Keeping rules here makes them unit-testable.
 */

/** X positions for the 3 lanes in world space */
export const LANE_X: [number, number, number] = [-3, 0, 3];

/** How far ahead obstacles spawn */
export const SPAWN_Z = -80;

/** Z position of the player (fixed) */
export const PLAYER_Z = 4;

/** Half-size of the player sphere for collision */
export const PLAYER_RADIUS = 0.65;

/** Half-size of an obstacle cube for collision */
export const OBSTACLE_HALF = 0.72;

/** Base game speed — noticeably fast from the start */
export const BASE_SPEED = 32;

/** Speed increase per second of play */
export const SPEED_RAMP = 0.8;

/** Hard cap on speed */
export const MAX_SPEED = 90;

/** Score per 5 units of distance */
export const SCORE_PER_UNIT = 10;

/** Tightest gap between spawns (seconds) */
export const MIN_SPAWN_INTERVAL = 0.18;

/** Starting spawn interval (seconds) — already aggressive */
export const BASE_SPAWN_INTERVAL = 0.65;

/** How fast spawn interval shrinks per second */
export const SPAWN_RAMP = 0.012;

/**
 * After this many seconds, there's a chance a second block spawns
 * simultaneously in a different lane.
 */
export const DOUBLE_SPAWN_AFTER = 8;

/** Probability of a double-spawn once the threshold is passed (0–1) */
export const DOUBLE_SPAWN_CHANCE = 0.45;

export function currentSpeed(elapsed: number): number {
  return Math.min(BASE_SPEED + elapsed * SPEED_RAMP, MAX_SPEED);
}

export function currentSpawnInterval(elapsed: number): number {
  return Math.max(BASE_SPAWN_INTERVAL - elapsed * SPAWN_RAMP, MIN_SPAWN_INTERVAL);
}

/**
 * Returns how many obstacles to spawn this tick (1 or 2).
 * Double-spawns kick in after DOUBLE_SPAWN_AFTER seconds.
 */
export function spawnCount(elapsed: number, rand: () => number = Math.random): 1 | 2 {
  if (elapsed >= DOUBLE_SPAWN_AFTER && rand() < DOUBLE_SPAWN_CHANCE) return 2;
  return 1;
}

/** True when the player (at playerLane) collides with an obstacle at obstacleZ in obstacleLane */
export function checkCollision(
  playerLane: number,
  obstacleLane: number,
  obstacleZ: number,
): boolean {
  if (playerLane !== obstacleLane) return false;
  const dist = Math.abs(obstacleZ - PLAYER_Z);
  return dist < PLAYER_RADIUS + OBSTACLE_HALF;
}

/** Returns a random lane (0, 1, or 2) */
export function randomLane(rand: () => number = Math.random): 0 | 1 | 2 {
  return Math.floor(rand() * 3) as 0 | 1 | 2;
}

/**
 * Returns two DIFFERENT random lanes for double-spawns.
 * Guarantees at least one safe lane exists.
 */
export function randomTwoLanes(rand: () => number = Math.random): [0 | 1 | 2, 0 | 1 | 2] {
  const a = randomLane(rand);
  let b: 0 | 1 | 2;
  do { b = randomLane(rand); } while (b === a);
  return [a, b];
}

/** Score from distance traveled */
export function scoreFromDistance(distance: number): number {
  return Math.floor(distance / 5) * SCORE_PER_UNIT;
}
