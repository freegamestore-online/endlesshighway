import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGameSounds } from "@freegamestore/games";
import * as THREE from "three";
import type { Orb } from "../types";
import {
  ARENA_HALF,
  PLAYER_SPEED,
  ROUND_SECONDS,
  clampToArena,
  collides,
  randomOrbPosition,
} from "../lib/logic";

const ORB_COUNT = 5;

export interface GameProps {
  /** Called with the running total whenever the player collects an orb. */
  onScore: (score: number) => void;
  /** Called each time the whole-second countdown ticks down. */
  onTime: (secondsLeft: number) => void;
  /** Called once when the clock hits zero. */
  onGameOver: () => void;
}

type Dir = "left" | "right" | "up" | "down";

function mapKey(key: string): Dir | null {
  switch (key) {
    case "ArrowLeft": case "a": case "A": return "left";
    case "ArrowRight": case "d": case "D": return "right";
    case "ArrowUp": case "w": case "W": return "up";
    case "ArrowDown": case "s": case "S": return "down";
    default: return null;
  }
}

function initialOrbs(): Orb[] {
  const orbs: Orb[] = [];
  for (let i = 0; i < ORB_COUNT; i++) {
    const [x, z] = randomOrbPosition(0, 0);
    orbs.push({ id: i, x, z });
  }
  return orbs;
}

// The player is moved imperatively (via a ref) every frame — no React re-render
// per frame. Only orb pickups (infrequent) touch React state.
function Player({ posRef }: { posRef: React.RefObject<THREE.Vector3> }) {
  const group = useRef<THREE.Group>(null!);
  useFrame(() => {
    if (group.current && posRef.current) {
      group.current.position.x = posRef.current.x;
      group.current.position.z = posRef.current.z;
    }
  });
  return (
    <group ref={group} position={[0, 0.6, 0]}>
      <mesh castShadow>
        <sphereGeometry args={[0.6, 24, 24]} />
        <meshStandardMaterial color="#22d3ee" emissive="#0891b2" emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

function OrbMesh({ orb }: { orb: Orb }) {
  const mesh = useRef<THREE.Mesh>(null!);
  useFrame((_, dt) => {
    if (mesh.current) {
      mesh.current.rotation.y += dt * 2;
      mesh.current.position.y = 0.7 + Math.sin(mesh.current.rotation.y * 1.5) * 0.12;
    }
  });
  return (
    <mesh ref={mesh} position={[orb.x, 0.7, orb.z]} castShadow>
      <boxGeometry args={[0.7, 0.7, 0.7]} />
      <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.6} />
    </mesh>
  );
}

function Arena() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[ARENA_HALF * 2, ARENA_HALF * 2]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      <gridHelper args={[ARENA_HALF * 2, ARENA_HALF, "#334155", "#334155"]} position={[0, 0.02, 0]} />
    </group>
  );
}

// A camera that eases to sit behind + above the player and looks at them.
function FollowCamera({ posRef }: { posRef: React.RefObject<THREE.Vector3> }) {
  const { camera } = useThree();
  useFrame(() => {
    const p = posRef.current;
    if (!p) return;
    camera.position.x += (p.x - camera.position.x) * 0.08;
    camera.position.z += (p.z + 16 - camera.position.z) * 0.08;
    camera.position.y = 15;
    camera.lookAt(p.x, 0, p.z);
  });
  return null;
}

function Scene({ onScore, onTime, onGameOver }: GameProps) {
  const posRef = useRef(new THREE.Vector3(0, 0.6, 0));
  const keys = useRef<Set<Dir>>(new Set());
  const [orbs, setOrbs] = useState<Orb[]>(initialOrbs);
  // Orbs also live in a ref. The collision scan runs in useFrame and mutates
  // this in place the instant an orb is collected, so a slow-moving player still
  // overlapping the old position on the NEXT frame can't collect the same orb
  // again before React commits the setOrbs re-render (which would double-count).
  const orbsRef = useRef<Orb[]>(orbs);

  const scoreRef = useRef(0);
  const timeRef = useRef(ROUND_SECONDS);
  const lastSecondRef = useRef(ROUND_SECONDS);
  const nextOrbId = useRef(ORB_COUNT);
  const overRef = useRef(false);

  const sounds = useGameSounds();
  const soundsRef = useRef(sounds);
  soundsRef.current = sounds;
  const cbs = useRef({ onScore, onTime, onGameOver });
  cbs.current = { onScore, onTime, onGameOver };

  useEffect(() => {
    const down = (e: KeyboardEvent) => { const d = mapKey(e.key); if (d) keys.current.add(d); };
    const up = (e: KeyboardEvent) => { const d = mapKey(e.key); if (d) keys.current.delete(d); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useFrame((_, delta) => {
    if (overRef.current) return;
    const dt = Math.min(delta, 0.05);

    // Countdown → game over.
    timeRef.current -= dt;
    const secs = Math.max(0, Math.ceil(timeRef.current));
    if (secs !== lastSecondRef.current) {
      lastSecondRef.current = secs;
      cbs.current.onTime(secs);
    }
    if (timeRef.current <= 0) {
      overRef.current = true;
      soundsRef.current.playGameOver();
      cbs.current.onGameOver();
      return;
    }

    // Movement — normalize diagonals so they aren't faster.
    let vx = 0, vz = 0;
    if (keys.current.has("left")) vx -= 1;
    if (keys.current.has("right")) vx += 1;
    if (keys.current.has("up")) vz -= 1;
    if (keys.current.has("down")) vz += 1;
    if (vx !== 0 || vz !== 0) {
      const len = Math.hypot(vx, vz) || 1;
      const p = posRef.current;
      const [nx, nz] = clampToArena(
        p.x + (vx / len) * PLAYER_SPEED * dt,
        p.z + (vz / len) * PLAYER_SPEED * dt,
      );
      p.x = nx;
      p.z = nz;
    }

    // Collect orbs — respawn each collected orb elsewhere. Mutate the ref in
    // place so the next frame sees the new position immediately; only touch
    // React state (for rendering) when something actually changed.
    const p = posRef.current;
    const list = orbsRef.current;
    let collected = 0;
    for (let i = 0; i < list.length; i++) {
      if (collides(p.x, p.z, list[i]!.x, list[i]!.z)) {
        collected++;
        const [x, z] = randomOrbPosition(p.x, p.z);
        list[i] = { id: nextOrbId.current++, x, z };
      }
    }
    if (collected > 0) {
      scoreRef.current += collected;
      cbs.current.onScore(scoreRef.current);
      soundsRef.current.playScore();
      setOrbs([...list]);
    }
  });

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[8, 20, 8]} intensity={1.1} castShadow />
      <fog attach="fog" args={["#0f172a", 42, 95]} />
      <color attach="background" args={["#0f172a"]} />
      <FollowCamera posRef={posRef} />
      <Arena />
      <Player posRef={posRef} />
      {orbs.map((o) => <OrbMesh key={o.id} orb={o} />)}
    </>
  );
}

// On-screen d-pad for touch devices. It dispatches synthetic key events so the
// same keyboard handling drives movement — one input path, no duplication.
function press(dir: Dir, type: "keydown" | "keyup") {
  const key = dir === "left" ? "ArrowLeft" : dir === "right" ? "ArrowRight" : dir === "up" ? "ArrowUp" : "ArrowDown";
  window.dispatchEvent(new KeyboardEvent(type, { key }));
}

function DpadButton({ dir, label }: { dir: Dir; label: string }) {
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); press(dir, "keydown"); }}
      onPointerUp={(e) => { e.preventDefault(); press(dir, "keyup"); }}
      onPointerCancel={() => press(dir, "keyup")}
      onPointerLeave={() => press(dir, "keyup")}
      className="select-none pointer-events-auto flex items-center justify-center"
      style={{
        width: 56, height: 56, borderRadius: "0.9rem",
        background: "rgba(255,255,255,0.14)", backdropFilter: "blur(4px)",
        border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontSize: 22,
        touchAction: "none",
      }}
      aria-label={`Move ${dir}`}
    >
      {label}
    </button>
  );
}

function MobileControls() {
  // If we unmount mid-press (e.g. a resize crosses the mobile breakpoint while
  // a button is held), release every direction so a key can't stick down and
  // send the player drifting forever.
  useEffect(() => () => {
    (["left", "right", "up", "down"] as Dir[]).forEach((d) => press(d, "keyup"));
  }, []);
  return (
    <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none" style={{ zIndex: 10 }}>
      <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(3, 56px)", gridTemplateRows: "repeat(2, 56px)" }}>
        <span />
        <DpadButton dir="up" label="&#9650;" />
        <span />
        <DpadButton dir="left" label="&#9664;" />
        <DpadButton dir="down" label="&#9660;" />
        <DpadButton dir="right" label="&#9654;" />
      </div>
    </div>
  );
}

export function Game(props: GameProps) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768 || "ontouchstart" in window);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return (
    <div className="relative w-full h-full">
      <Canvas shadows camera={{ position: [0, 15, 16], fov: 55, near: 0.1, far: 200 }} style={{ width: "100%", height: "100%" }}>
        <Scene {...props} />
      </Canvas>
      {isMobile && <MobileControls />}
    </div>
  );
}
