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

/** Base game speed (world units/sec) — bumped up for more excitement */
export const BASE_SPEED = 24;

/** How much speed increases per second of play */
export const SPEED_RAMP = 0.55;

/** Max game speed cap */
export const MAX_SPEED = 70;

/** Score per 5 units of distance */
export const SCORE_PER_UNIT = 10;

/** Minimum gap between obstacle spawns (seconds) */
export const MIN_SPAWN_INTERVAL = 0.28;

/** Starting spawn interval (seconds) */
export const BASE_SPAWN_INTERVAL = 1.1;

/** How fast spawn interval decreases per second */
export const SPAWN_RAMP = 0.008;

export function currentSpeed(elapsed: number): number {
  return Math.min(BASE_SPEED + elapsed * SPEED_RAMP, MAX_SPEED);
}

export function currentSpawnInterval(elapsed: number): number {
  return Math.max(BASE_SPAWN_INTERVAL - elapsed * SPAWN_RAMP, MIN_SPAWN_INTERVAL);
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

/** Score from distance traveled */
export function scoreFromDistance(distance: number): number {
  return Math.floor(distance / 5) * SCORE_PER_UNIT;
}
