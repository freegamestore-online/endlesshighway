export type GamePhase = "menu" | "playing" | "over";

/** A lane index: 0 = left, 1 = center, 2 = right */
export type Lane = 0 | 1 | 2;

/** An incoming obstacle block */
export interface Obstacle {
  id: number;
  lane: Lane;
  z: number;
}

/** A collectible coin */
export interface Coin {
  id: number;
  lane: Lane;
  z: number;
  /** height above ground */
  y: number;
  collected: boolean;
}

/** A gap in the road — player must jump over it */
export interface Gap {
  id: number;
  /** which lanes are missing — 1 lane = easy, 2 lanes = hard, 3 = full gap */
  lanes: Lane[];
  /** Z of the leading edge of the gap */
  z: number;
  /** length of the gap in world units */
  length: number;
}
