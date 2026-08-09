import { useEffect, useRef, useState, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Lane, Obstacle } from "../types";
import {
  LANE_X,
  SPAWN_Z,
  PLAYER_Z,
  PLAYER_RADIUS,
  OBSTACLE_HALF,
  checkCollision,
  currentSpeed,
  currentSpawnInterval,
  randomLane,
  scoreFromDistance,
} from "../lib/logic";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface GameProps {
  onScore: (score: number) => void;
  onGameOver: () => void;
  laneRef: React.RefObject<Lane>;
}

// ─── Road surface ─────────────────────────────────────────────────────────────
const ROAD_LENGTH = 300;
const ROAD_WIDTH = 10.5;

function Road() {
  return (
    <group>
      {/* Main road surface */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, PLAYER_Z - ROAD_LENGTH / 2 + 20]} receiveShadow>
        <planeGeometry args={[ROAD_WIDTH, ROAD_LENGTH]} />
        <meshStandardMaterial color="#07051a" />
      </mesh>
      {/* Left edge glow strip */}
      <mesh position={[-ROAD_WIDTH / 2, 0.04, PLAYER_Z - ROAD_LENGTH / 2 + 20]}>
        <boxGeometry args={[0.14, 0.1, ROAD_LENGTH]} />
        <meshStandardMaterial color="#c026d3" emissive="#c026d3" emissiveIntensity={3} />
      </mesh>
      {/* Right edge glow strip */}
      <mesh position={[ROAD_WIDTH / 2, 0.04, PLAYER_Z - ROAD_LENGTH / 2 + 20]}>
        <boxGeometry args={[0.14, 0.1, ROAD_LENGTH]} />
        <meshStandardMaterial color="#c026d3" emissive="#c026d3" emissiveIntensity={3} />
      </mesh>
      {/* Left lane divider */}
      <mesh position={[LANE_X[0] + 1.5, 0.04, PLAYER_Z - ROAD_LENGTH / 2 + 20]}>
        <boxGeometry args={[0.05, 0.06, ROAD_LENGTH]} />
        <meshStandardMaterial color="#4f46e5" emissive="#4f46e5" emissiveIntensity={2} />
      </mesh>
      {/* Right lane divider */}
      <mesh position={[LANE_X[2] - 1.5, 0.04, PLAYER_Z - ROAD_LENGTH / 2 + 20]}>
        <boxGeometry args={[0.05, 0.06, ROAD_LENGTH]} />
        <meshStandardMaterial color="#4f46e5" emissive="#4f46e5" emissiveIntensity={2} />
      </mesh>
    </group>
  );
}

// ─── Scrolling lane dashes ────────────────────────────────────────────────────
function LaneDashes({ offsetRef }: { offsetRef: React.RefObject<number> }) {
  const groupRef = useRef<THREE.Group>(null!);
  const DASH_COUNT = 20;
  const DASH_SPACING = 9;

  const dashes: JSX.Element[] = [];
  for (let i = 0; i < DASH_COUNT; i++) {
    const z = PLAYER_Z - i * DASH_SPACING;
    dashes.push(
      <mesh key={`dl${i}`} position={[LANE_X[0] + 1.5, 0.05, z]}>
        <boxGeometry args={[0.05, 0.04, 3]} />
        <meshStandardMaterial color="#6366f1" emissive="#6366f1" emissiveIntensity={1.5} transparent opacity={0.7} />
      </mesh>,
      <mesh key={`dr${i}`} position={[LANE_X[2] - 1.5, 0.05, z]}>
        <boxGeometry args={[0.05, 0.04, 3]} />
        <meshStandardMaterial color="#6366f1" emissive="#6366f1" emissiveIntensity={1.5} transparent opacity={0.7} />
      </mesh>,
    );
  }

  useFrame(() => {
    if (!groupRef.current) return;
    const off = ((offsetRef.current ?? 0) % DASH_SPACING);
    groupRef.current.position.z = off;
  });

  return <group ref={groupRef}>{dashes}</group>;
}

// ─── Space grid floor ─────────────────────────────────────────────────────────
function SpaceFloor({ offsetRef }: { offsetRef: React.RefObject<number> }) {
  const gridRef = useRef<THREE.GridHelper>(null!);

  useFrame(() => {
    if (!gridRef.current) return;
    const off = (offsetRef.current ?? 0) % 5;
    gridRef.current.position.z = off;
  });

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]}>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#040310" />
      </mesh>
      <gridHelper ref={gridRef} args={[400, 80, "#1e1b4b", "#1e1b4b"]} position={[0, -0.05, 0]} />
    </>
  );
}

// ─── Stars ────────────────────────────────────────────────────────────────────
function Stars() {
  const pointsRef = useRef<THREE.Points>(null!);
  const positions = useRef<Float32Array | null>(null);

  if (!positions.current) {
    const arr = new Float32Array(800 * 3);
    for (let i = 0; i < 800; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 250;
      arr[i * 3 + 1] = Math.random() * 80 + 4;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 350;
    }
    positions.current = arr;
  }

  useFrame((_, dt) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += dt * 0.008;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions.current, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#a78bfa" size={0.28} sizeAttenuation />
    </points>
  );
}

// ─── Player sphere ────────────────────────────────────────────────────────────
function Player({ laneRef }: { laneRef: React.RefObject<Lane> }) {
  const groupRef = useRef<THREE.Group>(null!);
  const targetX = useRef(LANE_X[1]!);
  const currentX = useRef(LANE_X[1]!);
  const glowRef = useRef<THREE.PointLight>(null!);
  const t = useRef(0);
  const trailRef = useRef<THREE.Mesh>(null!);

  useFrame((_, dt) => {
    t.current += dt;
    const lane = laneRef.current ?? 1;
    targetX.current = LANE_X[lane]!;
    currentX.current += (targetX.current - currentX.current) * Math.min(1, dt * 14);

    if (groupRef.current) {
      groupRef.current.position.x = currentX.current;
      groupRef.current.position.y = 0.85 + Math.sin(t.current * 2.8) * 0.07;
      groupRef.current.rotation.z = (targetX.current - currentX.current) * -0.25;
    }
    if (glowRef.current) {
      glowRef.current.intensity = 2.2 + Math.sin(t.current * 5) * 0.5;
    }
    if (trailRef.current) {
      trailRef.current.scale.z = 0.8 + Math.sin(t.current * 6) * 0.2;
    }
  });

  return (
    <group ref={groupRef} position={[LANE_X[1]!, 0.85, PLAYER_Z]}>
      {/* Trail glow */}
      <mesh ref={trailRef} position={[0, -0.1, 0.8]}>
        <coneGeometry args={[0.3, 1.6, 12]} />
        <meshStandardMaterial
          color="#00f5ff"
          emissive="#00f5ff"
          emissiveIntensity={1.5}
          transparent
          opacity={0.25}
        />
      </mesh>
      {/* Outer shell */}
      <mesh castShadow>
        <sphereGeometry args={[PLAYER_RADIUS, 32, 32]} />
        <meshStandardMaterial
          color="#00f5ff"
          emissive="#00f5ff"
          emissiveIntensity={0.9}
          metalness={0.4}
          roughness={0.05}
        />
      </mesh>
      {/* Inner bright core */}
      <mesh>
        <sphereGeometry args={[PLAYER_RADIUS * 0.5, 16, 16]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={3}
          transparent
          opacity={0.7}
        />
      </mesh>
      {/* Equator ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[PLAYER_RADIUS * 1.05, 0.04, 8, 32]} />
        <meshStandardMaterial color="#00f5ff" emissive="#00f5ff" emissiveIntensity={3} />
      </mesh>
      <pointLight ref={glowRef} color="#00f5ff" intensity={2.2} distance={7} />
    </group>
  );
}

// ─── Obstacle cube ────────────────────────────────────────────────────────────
function ObstacleMesh({ obstacle }: { obstacle: Obstacle }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const ringRef = useRef<THREE.Mesh>(null!);
  const t = useRef(Math.random() * Math.PI * 2);

  useFrame((_, dt) => {
    t.current += dt;
    if (meshRef.current) {
      meshRef.current.rotation.x += dt * 1.8;
      meshRef.current.rotation.y += dt * 2.3;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z += dt * 2;
      ringRef.current.scale.setScalar(1 + Math.sin(t.current * 4) * 0.12);
    }
  });

  const x = LANE_X[obstacle.lane]!;

  return (
    <group position={[x, 0.9, obstacle.z]}>
      <mesh ref={meshRef} castShadow>
        <boxGeometry args={[OBSTACLE_HALF * 2, OBSTACLE_HALF * 2, OBSTACLE_HALF * 2]} />
        <meshStandardMaterial
          color="#ff1a4d"
          emissive="#ff1a4d"
          emissiveIntensity={1.4}
          metalness={0.1}
          roughness={0.05}
        />
      </mesh>
      {/* Outer glow ring */}
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.15, 0.07, 8, 24]} />
        <meshStandardMaterial
          color="#ff1a4d"
          emissive="#ff1a4d"
          emissiveIntensity={2.5}
          transparent
          opacity={0.55}
        />
      </mesh>
      <pointLight color="#ff1a4d" intensity={1.8} distance={5} />
    </group>
  );
}

// ─── Camera ───────────────────────────────────────────────────────────────────
function FollowCamera({ laneRef }: { laneRef: React.RefObject<Lane> }) {
  const { camera } = useThree();
  const camX = useRef(0);

  useFrame((_, dt) => {
    const lane = laneRef.current ?? 1;
    const tx = (LANE_X[lane]! ?? 0) * 0.28;
    camX.current += (tx - camX.current) * dt * 5;
    camera.position.x = camX.current;
    camera.position.y = 7.5;
    camera.position.z = PLAYER_Z + 14;
    camera.lookAt(camX.current * 0.5, 0.5, PLAYER_Z - 8);
  });

  return null;
}

// ─── Main game scene ──────────────────────────────────────────────────────────
function Scene({ laneRef, onScore, onGameOver }: GameProps) {
  const obstacles = useRef<Obstacle[]>([]);
  const nextId = useRef(0);
  const elapsed = useRef(0);
  const spawnTimer = useRef(0);
  const distance = useRef(0);
  const lastScore = useRef(-1);
  const dead = useRef(false);
  const offsetRef = useRef(0);
  const [, forceRender] = useState(0);

  const cbs = useRef({ onScore, onGameOver });
  cbs.current = { onScore, onGameOver };

  useFrame((_, delta) => {
    if (dead.current) return;
    const dt = Math.min(delta, 0.05);
    elapsed.current += dt;

    const speed = currentSpeed(elapsed.current);
    distance.current += speed * dt;
    offsetRef.current += speed * dt;

    // Score
    const score = scoreFromDistance(distance.current);
    if (score !== lastScore.current) {
      lastScore.current = score;
      cbs.current.onScore(score);
    }

    // Spawn
    spawnTimer.current += dt;
    const interval = currentSpawnInterval(elapsed.current);
    if (spawnTimer.current >= interval) {
      spawnTimer.current = 0;
      obstacles.current.push({ id: nextId.current++, lane: randomLane(), z: SPAWN_Z });
      forceRender((n) => n + 1);
    }

    // Move + collide
    const playerLane = laneRef.current ?? 1;
    const alive: Obstacle[] = [];
    let changed = false;

    for (const obs of obstacles.current) {
      obs.z += speed * dt;
      if (checkCollision(playerLane, obs.lane, obs.z)) {
        dead.current = true;
        cbs.current.onGameOver();
        return;
      }
      if (obs.z <= PLAYER_Z + 8) {
        alive.push(obs);
      } else {
        changed = true;
      }
    }

    if (changed) {
      obstacles.current = alive;
      forceRender((n) => n + 1);
    }
  });

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.12} color="#1a0a2e" />
      <directionalLight position={[0, 25, 10]} intensity={0.4} color="#a78bfa" castShadow />
      <pointLight position={[0, 10, PLAYER_Z - 4]} color="#7c3aed" intensity={1.5} distance={35} />
      <pointLight position={[-9, 4, PLAYER_Z - 25]} color="#db2777" intensity={0.9} distance={30} />
      <pointLight position={[9, 4, PLAYER_Z - 25]} color="#0891b2" intensity={0.9} distance={30} />

      <color attach="background" args={["#03010f"]} />
      <fog attach="fog" args={["#03010f", 55, 130]} />

      <Stars />
      <SpaceFloor offsetRef={offsetRef} />
      <Road />
      <LaneDashes offsetRef={offsetRef} />
      <Player laneRef={laneRef} />

      {obstacles.current.map((obs) => (
        <ObstacleMesh key={obs.id} obstacle={obs} />
      ))}

      <FollowCamera laneRef={laneRef} />
    </>
  );
}

// ─── Console D-Pad button ─────────────────────────────────────────────────────
interface DPadBtnProps {
  label: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
}

function DPadBtn({ label, onPress, color = "#00f5ff", disabled = false }: DPadBtnProps) {
  const [active, setActive] = useState(false);

  return (
    <button
      disabled={disabled}
      onPointerDown={(e) => {
        e.preventDefault();
        if (disabled) return;
        setActive(true);
        onPress();
      }}
      onPointerUp={() => setActive(false)}
      onPointerLeave={() => setActive(false)}
      onPointerCancel={() => setActive(false)}
      style={{
        width: 52,
        height: 52,
        borderRadius: 12,
        border: `2px solid ${active ? color : color + "40"}`,
        cursor: disabled ? "default" : "pointer",
        fontSize: 22,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: active
          ? `linear-gradient(135deg, ${color}28, ${color}10)`
          : `${color}08`,
        color: active ? color : color + "70",
        boxShadow: active
          ? `0 0 22px ${color}99, 0 0 8px ${color}44, inset 0 0 12px ${color}18`
          : `inset 0 1px 0 rgba(255,255,255,0.04)`,
        transition: "all 0.06s ease",
        touchAction: "none",
        userSelect: "none",
        outline: "none",
        opacity: disabled ? 0.4 : 1,
      }}
      aria-label={label}
    >
      {label}
    </button>
  );
}

// ─── Action button ────────────────────────────────────────────────────────────
function ActionBtn({ label, color }: { label: string; color: string }) {
  const [active, setActive] = useState(false);
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); setActive(true); }}
      onPointerUp={() => setActive(false)}
      onPointerLeave={() => setActive(false)}
      onPointerCancel={() => setActive(false)}
      style={{
        width: 42,
        height: 42,
        borderRadius: "50%",
        border: `2px solid ${active ? color : color + "40"}`,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 800,
        fontFamily: "Manrope, sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: active ? `${color}28` : `${color}08`,
        color: active ? color : color + "70",
        boxShadow: active ? `0 0 20px ${color}99, 0 0 8px ${color}44` : "none",
        transition: "all 0.06s ease",
        touchAction: "none",
        userSelect: "none",
        outline: "none",
        letterSpacing: "0.05em",
      }}
      aria-label={label}
    >
      {label}
    </button>
  );
}

// ─── Console Frame ────────────────────────────────────────────────────────────
export interface ConsoleFrameProps {
  children: React.ReactNode;
  onLeft: () => void;
  onRight: () => void;
  score: number;
  highScore: number;
  phase: "menu" | "playing" | "over";
}

export function ConsoleFrame({
  children,
  onLeft,
  onRight,
  score,
  highScore,
  phase,
}: ConsoleFrameProps) {
  const buttonsActive = phase === "playing";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        background: "radial-gradient(ellipse at 50% 25%, #0e0626 0%, #03010f 65%)",
        fontFamily: "Manrope, sans-serif",
        overflow: "hidden",
        padding: "4px 0",
      }}
    >
      {/* ── Console body ── */}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          background:
            "linear-gradient(170deg, #1d1a30 0%, #12102000 40%, #0c0a1a 70%, #080614 100%)",
          borderRadius: 36,
          padding: "10px 14px 16px",
          boxShadow: [
            "0 0 0 1.5px #4c1d9540",
            "0 0 80px #7c3aed18",
            "0 0 200px #7c3aed08",
            "inset 0 1.5px 0 rgba(255,255,255,0.08)",
            "inset 0 -3px 12px rgba(0,0,0,0.6)",
            "0 24px 60px rgba(0,0,0,0.7)",
          ].join(", "),
          border: "1px solid #2d1b6930",
          maxWidth: 520,
          width: "calc(100% - 12px)",
        }}
      >
        {/* ── Top strip: logo + stats ── */}
        <div
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 7,
            padding: "0 4px",
          }}
        >
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#00f5ff",
                boxShadow: "0 0 8px #00f5ff",
              }}
            />
            <span
              style={{
                fontFamily: "Fraunces, serif",
                fontSize: 11,
                fontWeight: 800,
                color: "#a78bfa",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                textShadow: "0 0 14px #a78bfa55",
              }}
            >
              NEON∞DRIVE
            </span>
          </div>

          {/* Score readouts */}
          <div style={{ display: "flex", gap: 12, fontSize: 11, fontWeight: 600 }}>
            <span style={{ color: "#334155" }}>
              PTS{" "}
              <span style={{ color: "#00f5ff", fontWeight: 800, textShadow: "0 0 8px #00f5ff55" }}>
                {score}
              </span>
            </span>
            <span style={{ color: "#334155" }}>
              BEST{" "}
              <span style={{ color: "#f59e0b", fontWeight: 800, textShadow: "0 0 8px #f59e0b44" }}>
                {highScore}
              </span>
            </span>
          </div>
        </div>

        {/* ── Screen bezel ── */}
        <div
          style={{
            width: "100%",
            borderRadius: 20,
            background: "#000",
            padding: "4px",
            boxShadow: [
              "0 0 0 2px #120d2a",
              "0 0 0 3.5px #1e1040",
              "inset 0 0 40px #000000cc",
              "0 0 50px #7c3aed14",
            ].join(", "),
            border: "1px solid #0d0a1e",
          }}
        >
          {/* Scanline overlay */}
          <div
            style={{
              borderRadius: 16,
              overflow: "hidden",
              aspectRatio: "16/9",
              position: "relative",
              background: "#03010f",
              minHeight: 155,
            }}
          >
            {/* Scanlines */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage:
                  "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 4px)",
                pointerEvents: "none",
                zIndex: 5,
              }}
            />
            {/* Corner reflections */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: "30%",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.025) 0%, transparent 100%)",
                pointerEvents: "none",
                zIndex: 6,
                borderRadius: "16px 16px 0 0",
              }}
            />
            {children}
          </div>
        </div>

        {/* ── Speaker grille ── */}
        <div style={{ display: "flex", gap: 4, margin: "7px 0 5px", opacity: 0.3 }}>
          {[...Array(7)].map((_, i) => (
            <div
              key={i}
              style={{
                width: 3,
                height: 3,
                borderRadius: "50%",
                background: "#7c3aed",
                boxShadow: "0 0 4px #7c3aed",
              }}
            />
          ))}
        </div>

        {/* ── Controls row ── */}
        <div
          style={{
            display: "flex",
            width: "100%",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0 8px",
            gap: 8,
          }}
        >
          {/* D-Pad */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 0,
            }}
          >
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <DPadBtn label="◀" onPress={onLeft} color="#00f5ff" disabled={!buttonsActive} />
              {/* D-pad center nub */}
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "radial-gradient(circle at 40% 35%, #2d1b69, #0d0a1e)",
                  border: "1.5px solid #3b1f7a44",
                  boxShadow: "inset 0 2px 4px rgba(0,0,0,0.6)",
                }}
              />
              <DPadBtn label="▶" onPress={onRight} color="#00f5ff" disabled={!buttonsActive} />
            </div>
            <div
              style={{
                fontSize: 9,
                color: "#2d3748",
                letterSpacing: "0.12em",
                marginTop: 4,
                fontWeight: 600,
              }}
            >
              MOVE
            </div>
          </div>

          {/* Center home button */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle at 38% 32%, #4c1d95, #1a0a2e 70%)",
                border: "2px solid #6d28d944",
                boxShadow:
                  "0 0 18px #7c3aed44, inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -2px 6px rgba(0,0,0,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                color: "#a78bfa",
                textShadow: "0 0 10px #a78bfa",
              }}
            >
              ∞
            </div>
            <div style={{ fontSize: 8, color: "#1e1b4b", letterSpacing: "0.15em", fontWeight: 700 }}>
              HOME
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "42px 42px",
                gridTemplateRows: "42px 42px",
                gap: 5,
              }}
            >
              {/* Y top-left, X top-right, B bottom-left, A bottom-right */}
              <ActionBtn label="Y" color="#f59e0b" />
              <ActionBtn label="X" color="#00f5ff" />
              <ActionBtn label="B" color="#f472b6" />
              <ActionBtn label="A" color="#4ade80" />
            </div>
            <div
              style={{
                fontSize: 9,
                color: "#2d3748",
                letterSpacing: "0.12em",
                marginTop: 4,
                fontWeight: 600,
              }}
            >
              ACTION
            </div>
          </div>
        </div>

        {/* ── Bottom grip bumpers ── */}
        <div
          style={{
            display: "flex",
            gap: 4,
            marginTop: 10,
            opacity: 0.18,
            alignItems: "center",
          }}
        >
          {[...Array(9)].map((_, i) => (
            <div
              key={i}
              style={{
                width: 18,
                height: 5,
                borderRadius: 4,
                background: "#7c3aed",
              }}
            />
          ))}
        </div>

        {/* Subtle neon underglow */}
        <div
          style={{
            position: "absolute",
            bottom: -2,
            left: "15%",
            right: "15%",
            height: 2,
            borderRadius: 2,
            background:
              "linear-gradient(90deg, transparent, #7c3aed88, #c026d388, #7c3aed88, transparent)",
            filter: "blur(3px)",
          }}
        />
      </div>
    </div>
  );
}

// ─── Menu overlay ─────────────────────────────────────────────────────────────
export function MenuOverlay({ onStart }: { onStart: () => void }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(ellipse at 50% 40%, #0d0525ee 0%, #03010fee 100%)",
        zIndex: 10,
        gap: 8,
        padding: 16,
        textAlign: "center",
      }}
    >
      {/* Neon title */}
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: "clamp(1.4rem, 7vw, 2.2rem)",
          fontWeight: 800,
          color: "#00f5ff",
          textShadow:
            "0 0 20px #00f5ff, 0 0 40px #00f5ff66, 0 0 80px #00f5ff22",
          letterSpacing: "0.08em",
          lineHeight: 1.1,
        }}
      >
        ENDLESS
        <br />
        HIGHWAY
      </div>

      <div
        style={{
          fontSize: "clamp(0.65rem, 2.8vw, 0.9rem)",
          color: "#a78bfa",
          lineHeight: 1.6,
          maxWidth: 240,
        }}
      >
        Look left, look right,{" "}
        <span style={{ color: "#f472b6", fontWeight: 700 }}>
          don't get smooshed~
        </span>
      </div>

      <div
        style={{
          fontSize: "clamp(0.55rem, 1.8vw, 0.7rem)",
          color: "#334155",
          lineHeight: 1.8,
          letterSpacing: "0.05em",
        }}
      >
        ← → Arrow keys · A / D · D-pad buttons
      </div>

      <button
        onClick={onStart}
        style={{
          marginTop: 6,
          padding: "9px 28px",
          borderRadius: 12,
          border: "2px solid #00f5ff",
          background: "rgba(0,245,255,0.08)",
          color: "#00f5ff",
          fontSize: "clamp(0.8rem, 2.5vw, 0.95rem)",
          fontWeight: 800,
          fontFamily: "Manrope, sans-serif",
          cursor: "pointer",
          boxShadow: "0 0 28px #00f5ff44, inset 0 0 20px #00f5ff08",
          letterSpacing: "0.12em",
          minHeight: 44,
          minWidth: 120,
          transition: "all 0.15s ease",
        }}
      >
        ▶ START
      </button>
    </div>
  );
}

// ─── Game Over overlay ────────────────────────────────────────────────────────
export function GameOverOverlay({
  score,
  highScore,
  onRestart,
}: {
  score: number;
  highScore: number;
  onRestart: () => void;
}) {
  const isNew = score > 0 && score >= highScore;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(ellipse at 50% 40%, #1a0010ee 0%, #03010fee 100%)",
        zIndex: 10,
        gap: 8,
        padding: 16,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: "clamp(1.2rem, 5.5vw, 1.9rem)",
          fontWeight: 800,
          color: "#ff1a4d",
          textShadow: "0 0 24px #ff1a4d88, 0 0 48px #ff1a4d33",
          letterSpacing: "0.1em",
        }}
      >
        SMOOSHED!
      </div>

      <div
        style={{
          fontSize: "clamp(0.62rem, 2.2vw, 0.82rem)",
          color: "#64748b",
        }}
      >
        A neon cube got you 🔴
      </div>

      {/* Score card */}
      <div
        style={{
          background: "rgba(0,245,255,0.04)",
          border: "1px solid rgba(0,245,255,0.16)",
          borderRadius: 14,
          padding: "10px 26px",
          marginTop: 2,
          boxShadow: "0 0 30px rgba(0,245,255,0.06)",
        }}
      >
        <div
          style={{
            fontSize: "clamp(1.5rem, 6vw, 2.1rem)",
            fontWeight: 800,
            color: "#00f5ff",
            fontFamily: "Fraunces, serif",
            lineHeight: 1,
            textShadow: "0 0 20px #00f5ff66",
          }}
        >
          {score}
        </div>
        <div
          style={{
            fontSize: "0.6rem",
            color: "#334155",
            letterSpacing: "0.15em",
            marginTop: 3,
            fontWeight: 700,
          }}
        >
          SCORE
        </div>
        {isNew ? (
          <div
            style={{
              fontSize: "0.7rem",
              color: "#f59e0b",
              marginTop: 5,
              fontWeight: 800,
              textShadow: "0 0 12px #f59e0b66",
              letterSpacing: "0.05em",
            }}
          >
            ★ NEW HIGH SCORE!
          </div>
        ) : (
          <div style={{ fontSize: "0.65rem", color: "#334155", marginTop: 5 }}>
            Best: {highScore}
          </div>
        )}
      </div>

      <button
        onClick={onRestart}
        style={{
          marginTop: 4,
          padding: "9px 28px",
          borderRadius: 12,
          border: "2px solid #a78bfa",
          background: "rgba(167,139,250,0.08)",
          color: "#a78bfa",
          fontSize: "clamp(0.8rem, 2.5vw, 0.95rem)",
          fontWeight: 800,
          fontFamily: "Manrope, sans-serif",
          cursor: "pointer",
          boxShadow: "0 0 24px #a78bfa44",
          letterSpacing: "0.12em",
          minHeight: 44,
          minWidth: 120,
        }}
      >
        ↺ TRY AGAIN
      </button>
    </div>
  );
}

// ─── Exported Game canvas component ──────────────────────────────────────────
export function Game({ onScore, onGameOver, laneRef }: GameProps) {
  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Canvas
        shadows
        camera={{
          position: [0, 7.5, PLAYER_Z + 14],
          fov: 60,
          near: 0.1,
          far: 220,
        }}
        style={{ width: "100%", height: "100%" }}
        gl={{ antialias: true }}
      >
        <Scene laneRef={laneRef} onScore={onScore} onGameOver={onGameOver} />
      </Canvas>
    </div>
  );
}

// ─── Lane controls hook ───────────────────────────────────────────────────────
export function useLaneControls(laneRef: React.RefObject<Lane>) {
  const moveLeft = useCallback(() => {
    const cur = laneRef.current ?? 1;
    laneRef.current = Math.max(0, cur - 1) as Lane;
  }, [laneRef]);

  const moveRight = useCallback(() => {
    const cur = laneRef.current ?? 1;
    laneRef.current = Math.min(2, cur + 1) as Lane;
  }, [laneRef]);

  useEffect(() => {
    const held = new Set<string>();
    const down = (e: KeyboardEvent) => {
      if (held.has(e.key)) return;
      held.add(e.key);
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") moveLeft();
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") moveRight();
    };
    const up = (e: KeyboardEvent) => held.delete(e.key);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [moveLeft, moveRight]);

  return { moveLeft, moveRight };
}
