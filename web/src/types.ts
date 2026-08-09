export type GamePhase = "menu" | "playing" | "over";

/** A lane index: 0 = left, 1 = center, 2 = right */
export type Lane = 0 | 1 | 2;

/** An incoming obstacle block */
export interface Obstacle {
  id: number;
  lane: Lane;
  z: number;
}
