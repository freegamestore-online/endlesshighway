/**
 * Pure game logic for Endless Highway — no React, no Three.js.
 * Keeping rules here makes them unit-testable.
 */

/** X positions for the 3 lanes in world space */
export const LANE_X: [number, number, number] = [-3, 0, 3];

/** How far ahead obstacles/coins spawn */
export const SPAWN_Z = -80;

/** Z position of the player (fixed) */
export const PLAYER_Z = 4;

/** Half-size of the player sphere for collision */
export const PLAYER_RADIUS = 0.65;

/** Half-size of an obstacle cube for collision */
export const OBSTACLE_HALF = 0.72;

/** Coin collect radius */
export const COIN_RADIUS = 0.55;

/** Coin ground height options — ground, mid-air (jump to collect) */
export const COIN_HEIGHTS: readonly number[] = [0.9, 2.2];

/** Score bonus per coin collected */
export const COIN_SCORE = 50;

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

/** After this many seconds, there's a chance a second block spawns simultaneously */
export const DOUBLE_SPAWN_AFTER = 8;

/** Probability of a double-spawn once the threshold is passed (0–1) */
export const DOUBLE_SPAWN_CHANCE = 0.45;

/** Jump initial velocity (world units/sec) */
export const JUMP_VELOCITY = 9.5;

/** Gravity constant */
export const GRAVITY = 22;

/** Top of the obstacle cube (used for jump clearance check) */
export const CUBE_TOP = OBSTACLE_HALF * 2 + 0.9; // obstacle y=0.9, half=0.72 → top ≈ 2.34

/** Coin spawn interval (seconds) — independent of obstacle spawner */
export const COIN_SPAWN_INTERVAL = 1.4;

/** How fast coin spawn interval shrinks */
export const COIN_SPAWN_RAMP = 0.006;

/** Minimum coin spawn interval */
export const MIN_COIN_INTERVAL = 0.55;

export function currentSpeed(elapsed: number): number {
  return Math.min(BASE_SPEED + elapsed * SPEED_RAMP, MAX_SPEED);
}

export function currentSpawnInterval(elapsed: number): number {
  return Math.max(BASE_SPAWN_INTERVAL - elapsed * SPAWN_RAMP, MIN_SPAWN_INTERVAL);
}

export function currentCoinInterval(elapsed: number): number {
  return Math.max(COIN_SPAWN_INTERVAL - elapsed * COIN_SPAWN_RAMP, MIN_COIN_INTERVAL);
}

/**
 * Returns how many obstacles to spawn this tick (1 or 2).
 */
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
  // Player feet are at playerJumpY; player top at playerJumpY + PLAYER_RADIUS*2
  // Obstacle occupies y: 0.9 - OBSTACLE_HALF → 0.9 + OBSTACLE_HALF
  const playerBottom = playerJumpY;
  const playerTop = playerJumpY + PLAYER_RADIUS * 2;
  const obsBottom = 0.9 - OBSTACLE_HALF;
  const obsTop = 0.9 + OBSTACLE_HALF;
  // No collision if player is above or below the cube
  if (playerBottom >= obsTop || playerTop <= obsBottom) return false;
  return true;
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
  // Vertical: player centre is at playerJumpY + PLAYER_RADIUS
  const playerCY = playerJumpY + PLAYER_RADIUS;
  const distY = Math.abs(playerCY - coinY);
  return distY < COIN_RADIUS + PLAYER_RADIUS;
}

/** Returns a random lane (0, 1, or 2) */
export function randomLane(rand: () => number = Math.random): 0 | 1 | 2 {
  return Math.floor(rand() * 3) as 0 | 1 | 2;
}

/**
 * Returns two DIFFERENT random lanes for double-spawns.
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

/** Pick a random coin height */
export function randomCoinHeight(rand: () => number = Math.random): number {
  return COIN_HEIGHTS[Math.floor(rand() * COIN_HEIGHTS.length)] ?? 0.9;
}
