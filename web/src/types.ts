export type GamePhase = "menu" | "playing" | "over";

/** A collectible orb resting on the arena floor. */
export interface Orb {
  id: number;
  x: number;
  z: number;
}
