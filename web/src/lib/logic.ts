/**
 * Pure game logic for Endless Highway — no React, no Three.js.
 */

/** X positions for the 3 lanes in world space */
export const LANE_X: [number, number, number] = [-3, 0, 3];

/** How far ahead obstacles/coins/gaps spawn */
export const SPAWN_Z = -80;

/** Z position of the player (fixed) */
export const PLAYER_Z = 4;

/** Half-size of the player sphere for collision */
export const PLAYER_RADIUS = 0.65;

/** Half-size of an obstacle cube for collision */
export const OBSTACLE_HALF = 0.72;

/** Coin collect radius */
export const COIN_RADIUS = 0.55;

/** Coin ground height options — ground level or floating (jump to collect) */
export const COIN_HEIGHTS: readonly number[] = [0.9, 2.2];

/** Score bonus per coin collected */
export const COIN_SCORE = 50;

/** Very gentle start speed */
export const BASE_SPEED = 8;

/** Speed increase per second — slow ramp so it feels gradual */
export const SPEED_RAMP = 0.55;

/** Hard cap on speed */
export const MAX_SPEED = 60;

/** Score per 5 units of distance */
export const SCORE_PER_UNIT = 10;

/** Tightest obstacle gap (seconds) */
export const MIN_SPAWN_INTERVAL = 0.4;

/** Starting obstacle interval — relaxed at the start */
export const BASE_SPAWN_INTERVAL = 2.2;

/** How fast spawn interval shrinks per second */
export const SPAWN_RAMP = 0.01;

/** After this many seconds, double-block spawns can happen */
export const DOUBLE_SPAWN_AFTER = 25;

/** Probability of a double-spawn once threshold is passed */
export const DOUBLE_SPAWN_CHANCE = 0.3;

/** Jump initial velocity (world units/sec) */
export const JUMP_VELOCITY = 9.5;

/** Gravity constant */
export const GRAVITY = 22;

/** Top of the obstacle cube */
export const CUBE_TOP = OBSTACLE_HALF * 2 + 0.9;

/** Coin spawn interval (seconds) */
export const COIN_SPAWN_INTERVAL = 1.8;

/** How fast coin spawn interval shrinks */
export const COIN_SPAWN_RAMP = 0.005;

/** Minimum coin spawn interval */
export const MIN_COIN_INTERVAL = 0.7;

/** Gap spawn interval (seconds) — gaps start after 10s */
export const GAP_SPAWN_INTERVAL = 5.0;

/** How fast gap interval shrinks */
export const GAP_SPAWN_RAMP = 0.008;

/** Minimum gap spawn interval */
export const MIN_GAP_INTERVAL = 2.0;

/** Gap length in world units — how long the hole is */
export const GAP_LENGTH = 9;

/** Gaps only start appearing after this many seconds */
export const GAP_START_AFTER = 10;

export function currentSpeed(elapsed: number): number {
  return Math.min(BASE_SPEED + elapsed * SPEED_RAMP, MAX_SPEED);
}

/** Speed as a 0-100 integer for display */
export function displaySpeed(elapsed: number): number {
  return Math.round((currentSpeed(elapsed) / MAX_SPEED) * 100);
}

export function currentSpawnInterval(elapsed: number): number {
  return Math.max(BASE_SPAWN_INTERVAL - elapsed * SPAWN_RAMP, MIN_SPAWN_INTERVAL);
}

export function currentCoinInterval(elapsed: number): number {
  return Math.max(COIN_SPAWN_INTERVAL - elapsed * COIN_SPAWN_RAMP, MIN_COIN_INTERVAL);
}

export function currentGapInterval(elapsed: number): number {
  return Math.max(GAP_SPAWN_INTERVAL - elapsed * GAP_SPAWN_RAMP, MIN_GAP_INTERVAL);
}

export function spawnCount(elapsed: number, rand: () => number = Math.random): 1 | 2 {
  if (elapsed >= DOUBLE_SPAWN_AFTER && rand() < DOUBLE_SPAWN_CHANCE) return 2;
  return 1;
}

/** True when the player collides with an obstacle (jump clears it) */
export function checkCollision(
  playerLane: number,
  obstacleLane: number,
  obstacleZ: number,
  playerJumpY: number = 0,
): boolean {
  if (playerLane !== obstacleLane) return false;
  const dist = Math.abs(obstacleZ - PLAYER_Z);
  if (dist >= PLAYER_RADIUS + OBSTACLE_HALF) return false;
  const playerBottom = playerJumpY;
  const playerTop = playerJumpY + PLAYER_RADIUS * 2;
  const obsBottom = 0.9 - OBSTACLE_HALF;
  const obsTop = 0.9 + OBSTACLE_HALF;
  if (playerBottom >= obsTop || playerTop <= obsBottom) return false;
  return true;
}

/** True when the player falls into a gap (not jumping over it) */
export function checkGapCollision(
  playerLane: number,
  gapLanes: number[],
  gapZ: number,
  gapLength: number,
  playerJumpY: number,
): boolean {
  if (!gapLanes.includes(playerLane)) return false;
  // The gap leading edge comes toward the player; player is at PLAYER_Z
  // Gap spans from gapZ to gapZ + gapLength (z increases as it moves toward player)
  const inside = gapZ <= PLAYER_Z && gapZ + gapLength >= PLAYER_Z;
  if (!inside) return false;
  // Player must be on the ground (not jumping) to fall in
  return playerJumpY < 0.15;
}

/** True when the player can collect a coin */
export function checkCoinCollect(
  playerLane: number,
  coinLane: number,
  coinZ: number,
  coinY: number,
  playerJumpY: number,
): boolean {
  if (playerLane !== coinLane) return false;
  const distZ = Math.abs(coinZ - PLAYER_Z);
  if (distZ >= COIN_RADIUS + PLAYER_RADIUS) return false;
  const playerCY = playerJumpY + PLAYER_RADIUS;
  const distY = Math.abs(playerCY - coinY);
  return distY < COIN_RADIUS + PLAYER_RADIUS;
}

export function randomLane(rand: () => number = Math.random): 0 | 1 | 2 {
  return Math.floor(rand() * 3) as 0 | 1 | 2;
}

export function randomTwoLanes(rand: () => number = Math.random): [0 | 1 | 2, 0 | 1 | 2] {
  const a = randomLane(rand);
  let b: 0 | 1 | 2;
  do { b = randomLane(rand); } while (b === a);
  return [a, b];
}

export function scoreFromDistance(distance: number): number {
  return Math.floor(distance / 5) * SCORE_PER_UNIT;
}

export function randomCoinHeight(rand: () => number = Math.random): number {
  return COIN_HEIGHTS[Math.floor(rand() * COIN_HEIGHTS.length)] ?? 0.9;
}

/**
 * Returns which lanes the gap covers: 1 lane (easy) or all 3 (full gap, must jump).
 * Early on always full gap so player learns to jump.
 */
export function randomGapLanes(elapsed: number, rand: () => number = Math.random): (0 | 1 | 2)[] {
  // Full-road gap — player must jump regardless of lane
  if (elapsed < 30 || rand() < 0.65) return [0, 1, 2];
  // Two-lane gap — dodge or jump
  const safe = randomLane(rand);
  return ([0, 1, 2] as (0 | 1 | 2)[]).filter((l) => l !== safe);
}
