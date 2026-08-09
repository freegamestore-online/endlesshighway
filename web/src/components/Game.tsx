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

export interface GameProps {
  onScore: (score: number) => void;
  onGameOver: () => void;
  laneRef: React.RefObject<Lane>;
}

// ─── Road / Grid ──────────────────────────────────────────────────────────────
const ROAD_LENGTH = 200;
const ROAD_WIDTH = 10;

function Road() {
  return (
    <group>
      {/* Road surface */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, PLAYER_Z - ROAD_LENGTH / 2 + 10]}>
        <planeGeometry args={[ROAD_WIDTH, ROAD_LENGTH]} />
        <meshStandardMaterial color="#0a0a1a" />
      </mesh>
      {/* Road edges — glowing purple */}
      <mesh position={[-ROAD_WIDTH / 2, 0.02, PLAYER_Z - ROAD_LENGTH / 2 + 10]}>
        <boxGeometry args={[0.12, 0.12, ROAD_LENGTH]} />
        <meshStandardMaterial color="#c026d3" emissive="#c026d3" emissiveIntensity={2} />
      </mesh>
      <mesh position={[ROAD_WIDTH / 2, 0.02, PLAYER_Z - ROAD_LENGTH / 2 + 10]}>
        <boxGeometry args={[0.12, 0.12, ROAD_LENGTH]} />
        <meshStandardMaterial color="#c026d3" emissive="#c026d3" emissiveIntensity={2} />
      </mesh>
      {/* Center dividers */}
      <mesh position={[-1.5, 0.02, PLAYER_Z - ROAD_LENGTH / 2 + 10]}>
        <boxGeometry args={[0.05, 0.05, ROAD_LENGTH]} />
        <meshStandardMaterial color="#4f46e5" emissive="#4f46e5" emissiveIntensity={1.5} />
      </mesh>
      <mesh position={[1.5, 0.02, PLAYER_Z - ROAD_LENGTH / 2 + 10]}>
        <boxGeometry args={[0.05, 0.05, ROAD_LENGTH]} />
        <meshStandardMaterial color="#4f46e5" emissive="#4f46e5" emissiveIntensity={1.5} />
      </mesh>
    </group>
  );
}

// Scrolling lane dashes
function LaneDashes({ offsetRef }: { offsetRef: React.RefObject<number> }) {
  const groupRef = useRef<THREE.Group>(null!);
  const DASH_COUNT = 16;
  const DASH_SPACING = 8;

  useFrame(() => {
    if (!groupRef.current) return;
    const off = offsetRef.current % DASH_SPACING;
    groupRef.current.position.z = off;
  });

  const dashes: JSX.Element[] = [];
  for (let i = 0; i < DASH_COUNT; i++) {
    const z = PLAYER_Z - i * DASH_SPACING;
    dashes.push(
      <mesh key={`dl${i}`} position={[-1.5, 0.03, z]}>
        <boxGeometry args={[0.05, 0.04, 2.5]} />
        <meshStandardMaterial color="#6366f1" emissive="#6366f1" emissiveIntensity={1.2} />
      </mesh>,
      <mesh key={`dr${i}`} position={[1.5, 0.03, z]}>
        <boxGeometry args={[0.05, 0.04, 2.5]} />
        <meshStandardMaterial color="#6366f1" emissive="#6366f1" emissiveIntensity={1.2} />
      </mesh>,
    );
  }

  return <group ref={groupRef}>{dashes}</group>;
}

// Infinite grid floor (outside road)
function GridFloor() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[300, 300]} />
        <meshStandardMaterial color="#050510" />
      </mesh>
      <gridHelper args={[300, 60, "#1e1b4b", "#1e1b4b"]} position={[0, -0.03, 0]} />
    </>
  );
}

// ─── Player ───────────────────────────────────────────────────────────────────
function Player({ laneRef }: { laneRef: React.RefObject<Lane> }) {
  const groupRef = useRef<THREE.Group>(null!);
  const targetX = useRef(LANE_X[1]);
  const currentX = useRef(LANE_X[1]);
  const glowRef = useRef<THREE.PointLight>(null!);
  const t = useRef(0);

  useFrame((_, dt) => {
    t.current += dt;
    const lane = laneRef.current ?? 1;
    targetX.current = LANE_X[lane];
    // Smooth lane switch
    currentX.current += (targetX.current - currentX.current) * Math.min(1, dt * 12);

    if (groupRef.current) {
      groupRef.current.position.x = currentX.current;
      groupRef.current.position.z = PLAYER_Z;
      groupRef.current.position.y = 0.8 + Math.sin(t.current * 3) * 0.06;
      groupRef.current.rotation.z = (targetX.current - currentX.current) * -0.3;
    }
    if (glowRef.current) {
      glowRef.current.intensity = 1.8 + Math.sin(t.current * 4) * 0.4;
    }
  });

  return (
    <group ref={groupRef} position={[LANE_X[1], 0.8, PLAYER_Z]}>
      {/* Main sphere */}
      <mesh castShadow>
        <sphereGeometry args={[PLAYER_RADIUS, 32, 32]} />
        <meshStandardMaterial
          color="#00f5ff"
          emissive="#00f5ff"
          emissiveIntensity={0.8}
          metalness={0.3}
          roughness={0.1}
        />
      </mesh>
      {/* Inner glow core */}
      <mesh>
        <sphereGeometry args={[PLAYER_RADIUS * 0.55, 16, 16]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={2}
          transparent
          opacity={0.6}
        />
      </mesh>
      {/* Point light for glow effect */}
      <pointLight ref={glowRef} color="#00f5ff" intensity={2} distance={5} />
    </group>
  );
}

// ─── Obstacle ─────────────────────────────────────────────────────────────────
function ObstacleMesh({ obstacle }: { obstacle: Obstacle }) {
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame((_, dt) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += dt * 1.5;
      meshRef.current.rotation.y += dt * 2;
    }
  });

  const x = LANE_X[obstacle.lane];

  return (
    <group position={[x, 0.9, obstacle.z]}>
      <mesh ref={meshRef} castShadow>
        <boxGeometry args={[OBSTACLE_HALF * 2, OBSTACLE_HALF * 2, OBSTACLE_HALF * 2]} />
        <meshStandardMaterial
          color="#ff2060"
          emissive="#ff2060"
          emissiveIntensity={1.2}
          metalness={0.2}
          roughness={0.1}
        />
      </mesh>
      {/* Glow ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.1, 0.06, 8, 24]} />
        <meshStandardMaterial color="#ff2060" emissive="#ff2060" emissiveIntensity={2} transparent opacity={0.5} />
      </mesh>
      <pointLight color="#ff2060" intensity={1.5} distance={4} />
    </group>
  );
}

// ─── Stars / space background ─────────────────────────────────────────────────
function Stars() {
  const pointsRef = useRef<THREE.Points>(null!);

  const positions = useRef<Float32Array>(() => {
    const arr = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 200;
      arr[i * 3 + 1] = Math.random() * 60 + 5;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 300;
    }
    return arr;
  });

  useFrame((_, dt) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += dt * 0.01;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions.current, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#a78bfa" size={0.25} sizeAttenuation />
    </points>
  );
}

// ─── Camera ───────────────────────────────────────────────────────────────────
function FollowCamera({ laneRef }: { laneRef: React.RefObject<Lane> }) {
  const { camera } = useThree();
  const camX = useRef(0);

  useFrame((_, dt) => {
    const lane = laneRef.current ?? 1;
    const tx = LANE_X[lane] * 0.3;
    camX.current += (tx - camX.current) * dt * 4;
    camera.position.x = camX.current;
    camera.position.y = 7;
    camera.position.z = PLAYER_Z + 13;
    camera.lookAt(camX.current, 0, PLAYER_Z - 10);
  });

  return null;
}

// ─── Main Scene ───────────────────────────────────────────────────────────────
function Scene({ laneRef, onScore, onGameOver }: GameProps) {
  const obstacles = useRef<Obstacle[]>([]);
  const nextId = useRef(0);
  const elapsed = useRef(0);
  const spawnTimer = useRef(0);
  const distance = useRef(0);
  const lastScore = useRef(-1);
  const dead = useRef(false);
  const offsetRef = useRef(0);

  const cbs = useRef({ onScore, onGameOver });
  cbs.current = { onScore, onGameOver };

  const [renderTick, setRenderTick] = useState(0);

  useFrame((_, delta) => {
    if (dead.current) return;
    const dt = Math.min(delta, 0.05);
    elapsed.current += dt;

    const speed = currentSpeed(elapsed.current);
    distance.current += speed * dt;
    offsetRef.current += speed * dt;

    // Scoring
    const score = scoreFromDistance(distance.current);
    if (score !== lastScore.current) {
      lastScore.current = score;
      cbs.current.onScore(score);
    }

    // Spawn obstacles
    spawnTimer.current += dt;
    const interval = currentSpawnInterval(elapsed.current);
    if (spawnTimer.current >= interval) {
      spawnTimer.current = 0;
      const lane = randomLane();
      obstacles.current.push({ id: nextId.current++, lane, z: SPAWN_Z });
      setRenderTick((n) => n + 1);
    }

    // Move obstacles + collision
    const playerLane = laneRef.current ?? 1;
    const alive: Obstacle[] = [];
    let anyChange = false;

    for (const obs of obstacles.current) {
      obs.z += speed * dt;

      if (checkCollision(playerLane, obs.lane, obs.z)) {
        dead.current = true;
        cbs.current.onGameOver();
        return;
      }

      // Keep only obstacles that haven't passed the player yet
      if (obs.z <= PLAYER_Z + 6) {
        alive.push(obs);
      } else {
        anyChange = true;
      }
    }

    if (anyChange) {
      obstacles.current = alive;
      setRenderTick((n) => n + 1);
    }
  });

  // suppress unused warning — renderTick drives re-renders
  void renderTick;

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.15} color="#1a0a2e" />
      <directionalLight position={[0, 20, 10]} intensity={0.5} color="#a78bfa" castShadow />
      <pointLight position={[0, 8, PLAYER_Z - 5]} color="#7c3aed" intensity={1.2} distance={30} />
      <pointLight position={[-8, 3, PLAYER_Z - 20]} color="#db2777" intensity={0.8} distance={25} />
      <pointLight position={[8, 3, PLAYER_Z - 20]} color="#0891b2" intensity={0.8} distance={25} />

      {/* Background */}
      <color attach="background" args={["#03010f"]} />
      <fog attach="fog" args={["#03010f", 50, 120]} />

      {/* Scene elements */}
      <Stars />
      <GridFloor />
      <Road />
      <LaneDashes offsetRef={offsetRef} />

      {/* Player */}
      <Player laneRef={laneRef} />

      {/* Obstacles */}
      {obstacles.current.map((obs) => (
        <ObstacleMesh key={obs.id} obstacle={obs} />
      ))}

      {/* Camera */}
      <FollowCamera laneRef={laneRef} />
    </>
  );
}

// ─── Console D-Pad Button ─────────────────────────────────────────────────────
interface DPadBtnProps {
  label: string;
  onPress: () => void;
  color?: string;
}

function DPadBtn({ label, onPress, color = "#00f5ff" }: DPadBtnProps) {
  const [active, setActive] = useState(false);

  return (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        setActive(true);
        onPress();
      }}
      onPointerUp={() => setActive(false)}
      onPointerLeave={() => setActive(false)}
      onPointerCancel={() => setActive(false)}
      style={{
        width: 48,
        height: 48,
        borderRadius: 10,
        border: `1.5px solid ${active ? color : color + "44"}`,
        cursor: "pointer",
        fontSize: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: active
          ? `${color}33`
          : `${color}0a`,
        color: active ? color : color + "99",
        boxShadow: active
          ? `0 0 18px ${color}88, inset 0 0 10px ${color}22`
          : "none",
        transition: "all 0.07s ease",
        touchAction: "none",
        userSelect: "none",
      }}
      aria-label={label}
    >
      {label}
    </button>
  );
}

// ─── Action Button ────────────────────────────────────────────────────────────
function ActionBtn({ label, color }: { label: string; color: string }) {
  const [active, setActive] = useState(false);
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); setActive(true); }}
      onPointerUp={() => setActive(false)}
      onPointerLeave={() => setActive(false)}
      onPointerCancel={() => setActive(false)}
      style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        border: `1.5px solid ${active ? color : color + "44"}`,
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 700,
        fontFamily: "Manrope, sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: active ? `${color}33` : `${color}0a`,
        color: active ? color : color + "88",
        boxShadow: active ? `0 0 16px ${color}88` : "none",
        transition: "all 0.07s ease",
        touchAction: "none",
        userSelect: "none",
        letterSpacing: "0.05em",
      }}
      aria-label={label}
    >
      {label}
    </button>
  );
}

// ─── Console Frame ────────────────────────────────────────────────────────────
interface ConsoleFrameProps {
  children: React.ReactNode;
  onLeft: () => void;
  onRight: () => void;
  score: number;
  highScore: number;
}

export function ConsoleFrame({ children, onLeft, onRight, score, highScore }: ConsoleFrameProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        background: "radial-gradient(ellipse at 50% 30%, #0d0525 0%, #03010f 70%)",
        fontFamily: "Manrope, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Console body */}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          background: "linear-gradient(160deg, #1c1a2e 0%, #110e1e 60%, #0a0816 100%)",
          borderRadius: 32,
          padding: "12px 16px 18px",
          boxShadow:
            "0 0 0 1.5px #6d28d944, 0 0 60px #7c3aed22, 0 0 120px #7c3aed0a, inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -2px 8px rgba(0,0,0,0.5)",
          border: "1px solid #2d1b6933",
          maxWidth: 500,
          width: "calc(100% - 16px)",
        }}
      >
        {/* Top strip */}
        <div
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
            padding: "0 6px",
          }}
        >
          <span
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 12,
              fontWeight: 800,
              color: "#a78bfa",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              textShadow: "0 0 12px #a78bfa66",
            }}
          >
            NEON∞DRIVE
          </span>
          <div style={{ display: "flex", gap: 14, fontSize: 11 }}>
            <span style={{ color: "#475569" }}>
              PTS <span style={{ color: "#00f5ff", fontWeight: 800 }}>{score}</span>
            </span>
            <span style={{ color: "#475569" }}>
              BEST <span style={{ color: "#f59e0b", fontWeight: 800 }}>{highScore}</span>
            </span>
          </div>
        </div>

        {/* Screen bezel */}
        <div
          style={{
            width: "100%",
            borderRadius: 18,
            background: "#000",
            padding: "3px",
            boxShadow:
              "0 0 0 2px #1e1040, inset 0 0 30px #000000cc, 0 0 40px #7c3aed11",
            border: "2px solid #1e1040",
          }}
        >
          <div
            style={{
              borderRadius: 14,
              overflow: "hidden",
              aspectRatio: "16/9",
              position: "relative",
              background: "#03010f",
              minHeight: 160,
            }}
          >
            {children}
          </div>
        </div>

        {/* Speaker dots */}
        <div style={{ display: "flex", gap: 5, margin: "7px 0 5px", opacity: 0.35 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: "#7c3aed" }} />
          ))}
        </div>

        {/* Controls row */}
        <div
          style={{
            display: "flex",
            width: "100%",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "2px 10px 0",
            gap: 8,
          }}
        >
          {/* D-Pad */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <DPadBtn label="◀" onPress={onLeft} color="#00f5ff" />
            {/* D-pad center nub */}
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "radial-gradient(circle, #2d1b69 0%, #1a0a2e 100%)",
                border: "1px solid #4c1d9544",
                boxShadow: "inset 0 1px 3px rgba(0,0,0,0.5)",
              }}
            />
            <DPadBtn label="▶" onPress={onRight} color="#00f5ff" />
          </div>

          {/* Center home button */}
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "radial-gradient(circle at 40% 35%, #4c1d95, #1a0a2e)",
              border: "1.5px solid #6d28d966",
              boxShadow: "0 0 14px #7c3aed44, inset 0 1px 0 rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              color: "#a78bfa",
            }}
          >
            ∞
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <ActionBtn label="A" color="#00f5ff" />
            <ActionBtn label="B" color="#f472b6" />
          </div>
        </div>

        {/* Bottom grip */}
        <div style={{ display: "flex", gap: 5, marginTop: 10, opacity: 0.2 }}>
          {[...Array(8)].map((_, i) => (
            <div key={i} style={{ width: 16, height: 4, borderRadius: 3, background: "#7c3aed" }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Overlay screens ──────────────────────────────────────────────────────────
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
        background: "rgba(3,1,15,0.9)",
        zIndex: 10,
        gap: 10,
        padding: 16,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: "clamp(1.5rem, 6vw, 2.4rem)",
          fontWeight: 800,
          color: "#00f5ff",
          textShadow: "0 0 24px #00f5ff, 0 0 48px #00f5ff44",
          letterSpacing: "0.06em",
          lineHeight: 1.1,
        }}
      >
        ENDLESS
        <br />
        HIGHWAY
      </div>
      <div style={{ fontSize: "clamp(0.7rem, 2.5vw, 1rem)", color: "#a78bfa", lineHeight: 1.5 }}>
        Look left, look right,{" "}
        <span style={{ color: "#f472b6", fontWeight: 700 }}>don't get smooshed~</span>
      </div>
      <div style={{ fontSize: "clamp(0.6rem, 2vw, 0.78rem)", color: "#475569", lineHeight: 1.7 }}>
        ← → Arrow keys · A / D · D-pad buttons
      </div>
      <button
        onClick={onStart}
        style={{
          marginTop: 6,
          padding: "10px 30px",
          borderRadius: 12,
          border: "1.5px solid #00f5ff",
          background: "rgba(0,245,255,0.1)",
          color: "#00f5ff",
          fontSize: "clamp(0.85rem, 2.5vw, 1rem)",
          fontWeight: 700,
          fontFamily: "Manrope, sans-serif",
          cursor: "pointer",
          boxShadow: "0 0 24px #00f5ff44",
          letterSpacing: "0.1em",
          minHeight: 44,
        }}
      >
        ▶ START
      </button>
    </div>
  );
}

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
        background: "rgba(3,1,15,0.93)",
        zIndex: 10,
        gap: 10,
        padding: 16,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: "clamp(1.3rem, 5vw, 2rem)",
          fontWeight: 800,
          color: "#ff2060",
          textShadow: "0 0 24px #ff206066",
          letterSpacing: "0.08em",
        }}
      >
        SMOOSHED!
      </div>
      <div style={{ fontSize: "clamp(0.7rem, 2.5vw, 0.9rem)", color: "#94a3b8" }}>
        A neon cube got you 🔴
      </div>

      <div
        style={{
          background: "rgba(0,245,255,0.05)",
          border: "1px solid rgba(0,245,255,0.18)",
          borderRadius: 14,
          padding: "10px 28px",
          marginTop: 2,
        }}
      >
        <div style={{ fontSize: "clamp(1.6rem, 6vw, 2.2rem)", fontWeight: 800, color: "#00f5ff", fontFamily: "Fraunces, serif", lineHeight: 1 }}>
          {score}
        </div>
        <div style={{ fontSize: "0.65rem", color: "#64748b", letterSpacing: "0.12em", marginTop: 2 }}>SCORE</div>
        {isNew ? (
          <div style={{ fontSize: "0.72rem", color: "#f59e0b", marginTop: 4, fontWeight: 700 }}>★ NEW HIGH SCORE!</div>
        ) : (
          <div style={{ fontSize: "0.68rem", color: "#475569", marginTop: 4 }}>Best: {highScore}</div>
        )}
      </div>

      <button
        onClick={onRestart}
        style={{
          marginTop: 4,
          padding: "10px 30px",
          borderRadius: 12,
          border: "1.5px solid #a78bfa",
          background: "rgba(167,139,250,0.1)",
          color: "#a78bfa",
          fontSize: "clamp(0.85rem, 2.5vw, 1rem)",
          fontWeight: 700,
          fontFamily: "Manrope, sans-serif",
          cursor: "pointer",
          boxShadow: "0 0 20px #a78bfa44",
          letterSpacing: "0.1em",
          minHeight: 44,
        }}
      >
        ↺ TRY AGAIN
      </button>
    </div>
  );
}

// ─── Exported Game component ──────────────────────────────────────────────────
export function Game({ onScore, onGameOver, laneRef }: GameProps) {
  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Canvas
        shadows
        camera={{ position: [0, 7, PLAYER_Z + 13], fov: 60, near: 0.1, far: 200 }}
        style={{ width: "100%", height: "100%" }}
        gl={{ antialias: true }}
      >
        <Scene laneRef={laneRef} onScore={onScore} onGameOver={onGameOver} />
      </Canvas>
    </div>
  );
}

// ─── Keyboard input hook (used by App) ───────────────────────────────────────
export function useLaneControls(laneRef: React.RefObject<Lane>) {
  const moveLeft = useCallback(() => {
    laneRef.current = Math.max(0, (laneRef.current ?? 1) - 1) as Lane;
  }, [laneRef]);

  const moveRight = useCallback(() => {
    laneRef.current = Math.min(2, (laneRef.current ?? 1) + 1) as Lane;
  }, [laneRef]);

  useEffect(() => {
    const pressed = new Set<string>();
    const down = (e: KeyboardEvent) => {
      if (pressed.has(e.key)) return;
      pressed.add(e.key);
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") moveLeft();
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") moveRight();
    };
    const up = (e: KeyboardEvent) => pressed.delete(e.key);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [moveLeft, moveRight]);

  return { moveLeft, moveRight };
}
