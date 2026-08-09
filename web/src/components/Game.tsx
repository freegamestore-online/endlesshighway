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
  BASE_SPEED,
  MAX_SPEED,
} from "../lib/logic";

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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, PLAYER_Z - ROAD_LENGTH / 2 + 20]} receiveShadow>
        <planeGeometry args={[ROAD_WIDTH, ROAD_LENGTH]} />
        <meshStandardMaterial color="#07051a" />
      </mesh>
      {/* Edge glow strips */}
      <mesh position={[-ROAD_WIDTH / 2, 0.04, PLAYER_Z - ROAD_LENGTH / 2 + 20]}>
        <boxGeometry args={[0.14, 0.1, ROAD_LENGTH]} />
        <meshStandardMaterial color="#c026d3" emissive="#c026d3" emissiveIntensity={3} />
      </mesh>
      <mesh position={[ROAD_WIDTH / 2, 0.04, PLAYER_Z - ROAD_LENGTH / 2 + 20]}>
        <boxGeometry args={[0.14, 0.1, ROAD_LENGTH]} />
        <meshStandardMaterial color="#c026d3" emissive="#c026d3" emissiveIntensity={3} />
      </mesh>
      {/* Lane dividers */}
      <mesh position={[LANE_X[0]! + 1.5, 0.04, PLAYER_Z - ROAD_LENGTH / 2 + 20]}>
        <boxGeometry args={[0.05, 0.06, ROAD_LENGTH]} />
        <meshStandardMaterial color="#4f46e5" emissive="#4f46e5" emissiveIntensity={2} />
      </mesh>
      <mesh position={[LANE_X[2]! - 1.5, 0.04, PLAYER_Z - ROAD_LENGTH / 2 + 20]}>
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
      <mesh key={`dl${i}`} position={[LANE_X[0]! + 1.5, 0.05, z]}>
        <boxGeometry args={[0.05, 0.04, 3]} />
        <meshStandardMaterial color="#6366f1" emissive="#6366f1" emissiveIntensity={1.5} transparent opacity={0.7} />
      </mesh>,
      <mesh key={`dr${i}`} position={[LANE_X[2]! - 1.5, 0.05, z]}>
        <boxGeometry args={[0.05, 0.04, 3]} />
        <meshStandardMaterial color="#6366f1" emissive="#6366f1" emissiveIntensity={1.5} transparent opacity={0.7} />
      </mesh>,
    );
  }

  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.position.z = (offsetRef.current ?? 0) % DASH_SPACING;
  });

  return <group ref={groupRef}>{dashes}</group>;
}

// ─── Space grid floor ─────────────────────────────────────────────────────────
function SpaceFloor({ offsetRef }: { offsetRef: React.RefObject<number> }) {
  const gridRef = useRef<THREE.GridHelper>(null!);
  useFrame(() => {
    if (!gridRef.current) return;
    gridRef.current.position.z = (offsetRef.current ?? 0) % 5;
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
    const arr = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 280;
      arr[i * 3 + 1] = Math.random() * 90 + 4;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 380;
    }
    positions.current = arr;
  }

  useFrame((_, dt) => {
    if (pointsRef.current) pointsRef.current.rotation.y += dt * 0.008;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions.current!, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#a78bfa" size={0.28} sizeAttenuation />
    </points>
  );
}

// ─── Running Character (replaces plain sphere) ────────────────────────────────
// A neon stick-figure runner with pumping arms/legs, bobbing head, and jet exhaust.
function RunningPlayer({
  laneRef,
  speedRef,
}: {
  laneRef: React.RefObject<Lane>;
  speedRef: React.RefObject<number>;
}) {
  const rootRef = useRef<THREE.Group>(null!);
  const bodyRef = useRef<THREE.Mesh>(null!);
  const headRef = useRef<THREE.Group>(null!);
  const leftLegRef = useRef<THREE.Group>(null!);
  const rightLegRef = useRef<THREE.Group>(null!);
  const leftArmRef = useRef<THREE.Group>(null!);
  const rightArmRef = useRef<THREE.Group>(null!);
  const jetRef = useRef<THREE.Group>(null!);
  const glowRef = useRef<THREE.PointLight>(null!);
  const leanRef = useRef<THREE.Group>(null!);

  const targetX = useRef(LANE_X[1]!);
  const currentX = useRef(LANE_X[1]!);
  const t = useRef(0);
  const laneChangeShake = useRef(0); // 0-1 shake intensity on lane change
  const prevLane = useRef<Lane>(1);

  useFrame((_, dt) => {
    t.current += dt;

    const lane = laneRef.current ?? 1;
    const speed = speedRef.current ?? BASE_SPEED;
    // Normalised speed 0→1
    const speedT = Math.min((speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED), 1);

    // Detect lane change → trigger shake
    if (lane !== prevLane.current) {
      laneChangeShake.current = 1;
      prevLane.current = lane;
    }
    laneChangeShake.current *= 0.82; // decay

    targetX.current = LANE_X[lane]!;
    currentX.current += (targetX.current - currentX.current) * Math.min(1, dt * 13);

    // Running cadence — faster at higher speed
    const cadence = 6 + speedT * 10;
    const phase = t.current * cadence;

    // Root position + body bob
    const bobY = 0.12 + Math.abs(Math.sin(phase)) * 0.14;
    const shakeX = Math.sin(t.current * 40) * laneChangeShake.current * 0.08;
    const shakeY = Math.abs(Math.sin(t.current * 35)) * laneChangeShake.current * 0.05;

    if (rootRef.current) {
      rootRef.current.position.x = currentX.current + shakeX;
      rootRef.current.position.y = bobY + shakeY;
      rootRef.current.position.z = PLAYER_Z;
    }

    // Lean into direction of travel
    if (leanRef.current) {
      const leanZ = -0.18 - speedT * 0.12; // lean forward more at speed
      const leanX = (targetX.current - currentX.current) * -0.12;
      leanRef.current.rotation.z = leanX;
      leanRef.current.rotation.x = leanZ;
    }

    // Head bob + look ahead
    if (headRef.current) {
      headRef.current.rotation.x = -0.05 + Math.sin(phase * 0.5) * 0.06;
      headRef.current.position.y = 1.28 + Math.sin(phase) * 0.03;
    }

    // Leg swing — alternating
    if (leftLegRef.current && rightLegRef.current) {
      const swing = 0.55 + speedT * 0.35;
      leftLegRef.current.rotation.x = Math.sin(phase) * swing;
      rightLegRef.current.rotation.x = Math.sin(phase + Math.PI) * swing;
    }

    // Arm swing — opposite to legs
    if (leftArmRef.current && rightArmRef.current) {
      const armSwing = 0.45 + speedT * 0.3;
      leftArmRef.current.rotation.x = Math.sin(phase + Math.PI) * armSwing;
      rightArmRef.current.rotation.x = Math.sin(phase) * armSwing;
    }

    // Jet exhaust pulse
    if (jetRef.current) {
      const pulse = 0.7 + Math.sin(t.current * 18) * 0.3 + speedT * 0.5;
      jetRef.current.scale.set(pulse, pulse, 1 + speedT * 1.5);
      jetRef.current.children.forEach((c, i) => {
        const m = c as THREE.Mesh;
        if (m.material && (m.material as THREE.MeshStandardMaterial).emissiveIntensity !== undefined) {
          (m.material as THREE.MeshStandardMaterial).emissiveIntensity =
            1.5 + Math.sin(t.current * 20 + i) * 0.5 + speedT * 1.5;
        }
      });
    }

    // Glow pulse
    if (glowRef.current) {
      glowRef.current.intensity = 2.5 + Math.sin(t.current * 7) * 0.8 + speedT * 1.5;
    }
  });

  // Shared neon material factory (inline to avoid duplicate declarations)
  const C = "#00f5ff";
  const C2 = "#7c3aed";

  return (
    <group ref={rootRef} position={[LANE_X[1]!, 0.12, PLAYER_Z]}>
      <group ref={leanRef}>
        {/* ── Torso ── */}
        <mesh ref={bodyRef} position={[0, 0.72, 0]} castShadow>
          <capsuleGeometry args={[0.18, 0.42, 8, 16]} />
          <meshStandardMaterial color={C} emissive={C} emissiveIntensity={0.9} metalness={0.3} roughness={0.1} />
        </mesh>

        {/* ── Chest armour plate ── */}
        <mesh position={[0, 0.82, 0.14]}>
          <boxGeometry args={[0.28, 0.22, 0.06]} />
          <meshStandardMaterial color="#ffffff" emissive={C} emissiveIntensity={1.2} metalness={0.6} roughness={0.05} />
        </mesh>

        {/* ── Head ── */}
        <group ref={headRef} position={[0, 1.28, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.2, 20, 20]} />
            <meshStandardMaterial color={C} emissive={C} emissiveIntensity={1} metalness={0.2} roughness={0.1} />
          </mesh>
          {/* Visor */}
          <mesh position={[0, 0, 0.16]} rotation={[0.1, 0, 0]}>
            <boxGeometry args={[0.26, 0.1, 0.04]} />
            <meshStandardMaterial color="#ff2060" emissive="#ff2060" emissiveIntensity={2} transparent opacity={0.85} />
          </mesh>
          {/* Antenna */}
          <mesh position={[0, 0.26, 0]}>
            <cylinderGeometry args={[0.015, 0.015, 0.22, 6]} />
            <meshStandardMaterial color={C2} emissive={C2} emissiveIntensity={2} />
          </mesh>
          <mesh position={[0, 0.38, 0]}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={3} />
          </mesh>
        </group>

        {/* ── Left Arm (pivot at shoulder) ── */}
        <group ref={leftArmRef} position={[-0.26, 1.0, 0]}>
          <mesh position={[0, -0.2, 0]}>
            <capsuleGeometry args={[0.07, 0.3, 6, 8]} />
            <meshStandardMaterial color={C} emissive={C} emissiveIntensity={0.8} />
          </mesh>
          {/* Fist */}
          <mesh position={[0, -0.42, 0]}>
            <sphereGeometry args={[0.09, 8, 8]} />
            <meshStandardMaterial color="#ffffff" emissive={C} emissiveIntensity={1.5} />
          </mesh>
        </group>

        {/* ── Right Arm ── */}
        <group ref={rightArmRef} position={[0.26, 1.0, 0]}>
          <mesh position={[0, -0.2, 0]}>
            <capsuleGeometry args={[0.07, 0.3, 6, 8]} />
            <meshStandardMaterial color={C} emissive={C} emissiveIntensity={0.8} />
          </mesh>
          <mesh position={[0, -0.42, 0]}>
            <sphereGeometry args={[0.09, 8, 8]} />
            <meshStandardMaterial color="#ffffff" emissive={C} emissiveIntensity={1.5} />
          </mesh>
        </group>

        {/* ── Left Leg (pivot at hip) ── */}
        <group ref={leftLegRef} position={[-0.14, 0.48, 0]}>
          {/* Upper leg */}
          <mesh position={[0, -0.2, 0]}>
            <capsuleGeometry args={[0.09, 0.28, 6, 8]} />
            <meshStandardMaterial color={C2} emissive={C2} emissiveIntensity={1} />
          </mesh>
          {/* Lower leg */}
          <mesh position={[0, -0.5, 0.04]}>
            <capsuleGeometry args={[0.07, 0.26, 6, 8]} />
            <meshStandardMaterial color={C} emissive={C} emissiveIntensity={0.9} />
          </mesh>
          {/* Foot */}
          <mesh position={[0, -0.72, 0.08]}>
            <boxGeometry args={[0.12, 0.07, 0.22]} />
            <meshStandardMaterial color="#ffffff" emissive={C} emissiveIntensity={1.2} />
          </mesh>
        </group>

        {/* ── Right Leg ── */}
        <group ref={rightLegRef} position={[0.14, 0.48, 0]}>
          <mesh position={[0, -0.2, 0]}>
            <capsuleGeometry args={[0.09, 0.28, 6, 8]} />
            <meshStandardMaterial color={C2} emissive={C2} emissiveIntensity={1} />
          </mesh>
          <mesh position={[0, -0.5, 0.04]}>
            <capsuleGeometry args={[0.07, 0.26, 6, 8]} />
            <meshStandardMaterial color={C} emissive={C} emissiveIntensity={0.9} />
          </mesh>
          <mesh position={[0, -0.72, 0.08]}>
            <boxGeometry args={[0.12, 0.07, 0.22]} />
            <meshStandardMaterial color="#ffffff" emissive={C} emissiveIntensity={1.2} />
          </mesh>
        </group>

        {/* ── Jet exhaust (back of torso) ── */}
        <group ref={jetRef} position={[0, 0.72, -0.22]}>
          {/* Main flame cone */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.14, 0.7, 10]} />
            <meshStandardMaterial
              color="#00f5ff"
              emissive="#00f5ff"
              emissiveIntensity={2}
              transparent
              opacity={0.5}
            />
          </mesh>
          {/* Inner hot core */}
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.1]}>
            <coneGeometry args={[0.07, 0.45, 8]} />
            <meshStandardMaterial
              color="#ffffff"
              emissive="#f472b6"
              emissiveIntensity={3}
              transparent
              opacity={0.75}
            />
          </mesh>
          {/* Speed streak trails */}
          <mesh position={[-0.08, 0, 0.15]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.025, 0.5, 4]} />
            <meshStandardMaterial color="#a78bfa" emissive="#a78bfa" emissiveIntensity={2} transparent opacity={0.4} />
          </mesh>
          <mesh position={[0.08, 0, 0.15]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.025, 0.5, 4]} />
            <meshStandardMaterial color="#a78bfa" emissive="#a78bfa" emissiveIntensity={2} transparent opacity={0.4} />
          </mesh>
        </group>

        {/* ── Equator ring (hero accent) ── */}
        <mesh position={[0, 0.72, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.24, 0.025, 8, 32]} />
          <meshStandardMaterial color={C} emissive={C} emissiveIntensity={3} />
        </mesh>
      </group>

      {/* Point light for character glow */}
      <pointLight ref={glowRef} color={C} intensity={2.5} distance={8} />
      {/* Shadow caster light */}
      <pointLight color="#7c3aed" intensity={0.8} distance={5} position={[0, -0.5, 0]} />
    </group>
  );
}

// ─── Obstacle cube ────────────────────────────────────────────────────────────
function ObstacleMesh({ obstacle, speedRef }: { obstacle: Obstacle; speedRef: React.RefObject<number> }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const ringRef = useRef<THREE.Mesh>(null!);
  const ring2Ref = useRef<THREE.Mesh>(null!);
  const t = useRef(Math.random() * Math.PI * 2);

  useFrame((_, dt) => {
    t.current += dt;
    const speed = speedRef.current ?? BASE_SPEED;
    const speedT = Math.min((speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED), 1);
    // Spin faster as game speeds up
    const spin = 2 + speedT * 4;

    if (meshRef.current) {
      meshRef.current.rotation.x += dt * spin * 0.9;
      meshRef.current.rotation.y += dt * spin * 1.1;
      meshRef.current.rotation.z += dt * spin * 0.4;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z += dt * spin * 1.2;
      ringRef.current.scale.setScalar(1 + Math.sin(t.current * 5) * 0.15);
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.x += dt * spin * 0.8;
      ring2Ref.current.scale.setScalar(1 + Math.sin(t.current * 5 + 1.5) * 0.12);
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
          emissiveIntensity={1.6}
          metalness={0.1}
          roughness={0.05}
        />
      </mesh>
      {/* Horizontal ring */}
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.2, 0.07, 8, 24]} />
        <meshStandardMaterial color="#ff1a4d" emissive="#ff1a4d" emissiveIntensity={2.8} transparent opacity={0.6} />
      </mesh>
      {/* Vertical ring */}
      <mesh ref={ring2Ref} rotation={[0, 0, 0]}>
        <torusGeometry args={[1.1, 0.05, 8, 24]} />
        <meshStandardMaterial color="#ff8c00" emissive="#ff8c00" emissiveIntensity={2.5} transparent opacity={0.5} />
      </mesh>
      <pointLight color="#ff1a4d" intensity={2.2} distance={6} />
    </group>
  );
}

// ─── Camera with dynamic FOV ──────────────────────────────────────────────────
function FollowCamera({
  laneRef,
  speedRef,
}: {
  laneRef: React.RefObject<Lane>;
  speedRef: React.RefObject<number>;
}) {
  const { camera } = useThree();
  const camX = useRef(0);

  useFrame((_, dt) => {
    const lane = laneRef.current ?? 1;
    const speed = speedRef.current ?? BASE_SPEED;
    const speedT = Math.min((speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED), 1);

    const tx = (LANE_X[lane]! ?? 0) * 0.28;
    camX.current += (tx - camX.current) * dt * 5;

    camera.position.x = camX.current;
    camera.position.y = 7.5;
    camera.position.z = PLAYER_Z + 14;
    camera.lookAt(camX.current * 0.5, 0.5, PLAYER_Z - 8);

    // Widen FOV at speed for tunnel-vision rush feel
    if ("fov" in camera) {
      const perspCam = camera as THREE.PerspectiveCamera;
      const targetFov = 60 + speedT * 18;
      perspCam.fov += (targetFov - perspCam.fov) * dt * 3;
      perspCam.updateProjectionMatrix();
    }
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
  const speedRef = useRef(BASE_SPEED);
  const [, forceRender] = useState(0);

  const cbs = useRef({ onScore, onGameOver });
  cbs.current = { onScore, onGameOver };

  useFrame((_, delta) => {
    if (dead.current) return;
    const dt = Math.min(delta, 0.05);
    elapsed.current += dt;

    const speed = currentSpeed(elapsed.current);
    speedRef.current = speed;
    distance.current += speed * dt;
    offsetRef.current += speed * dt;

    const score = scoreFromDistance(distance.current);
    if (score !== lastScore.current) {
      lastScore.current = score;
      cbs.current.onScore(score);
    }

    spawnTimer.current += dt;
    const interval = currentSpawnInterval(elapsed.current);
    if (spawnTimer.current >= interval) {
      spawnTimer.current = 0;
      obstacles.current.push({ id: nextId.current++, lane: randomLane(), z: SPAWN_Z });
      forceRender((n) => n + 1);
    }

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

      <RunningPlayer laneRef={laneRef} speedRef={speedRef} />

      {obstacles.current.map((obs) => (
        <ObstacleMesh key={obs.id} obstacle={obs} speedRef={speedRef} />
      ))}

      <FollowCamera laneRef={laneRef} speedRef={speedRef} />
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

export function ConsoleFrame({ children, onLeft, onRight, score, highScore, phase }: ConsoleFrameProps) {
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
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          background: "linear-gradient(170deg, #1d1a30 0%, #12102000 40%, #0c0a1a 70%, #080614 100%)",
          borderRadius: 36,
          padding: "10px 14px 16px",
          boxShadow: [
            "0 0 0 1.5px #4c1d9540",
            "0 0 80px #7c3aed18",
            "inset 0 1.5px 0 rgba(255,255,255,0.08)",
            "inset 0 -3px 12px rgba(0,0,0,0.6)",
            "0 24px 60px rgba(0,0,0,0.7)",
          ].join(", "),
          border: "1px solid #2d1b6930",
          maxWidth: 520,
          width: "calc(100% - 12px)",
        }}
      >
        {/* Top strip */}
        <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7, padding: "0 4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00f5ff", boxShadow: "0 0 8px #00f5ff" }} />
            <span style={{ fontFamily: "Fraunces, serif", fontSize: 11, fontWeight: 800, color: "#a78bfa", letterSpacing: "0.22em", textTransform: "uppercase", textShadow: "0 0 14px #a78bfa55" }}>
              NEON∞DRIVE
            </span>
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: 11, fontWeight: 600 }}>
            <span style={{ color: "#334155" }}>PTS <span style={{ color: "#00f5ff", fontWeight: 800, textShadow: "0 0 8px #00f5ff55" }}>{score}</span></span>
            <span style={{ color: "#334155" }}>BEST <span style={{ color: "#f59e0b", fontWeight: 800, textShadow: "0 0 8px #f59e0b44" }}>{highScore}</span></span>
          </div>
        </div>

        {/* Screen bezel */}
        <div style={{ width: "100%", borderRadius: 20, background: "#000", padding: "4px", boxShadow: ["0 0 0 2px #120d2a", "0 0 0 3.5px #1e1040", "inset 0 0 40px #000000cc"].join(", "), border: "1px solid #0d0a1e" }}>
          <div style={{ borderRadius: 16, overflow: "hidden", aspectRatio: "16/9", position: "relative", background: "#03010f", minHeight: 155 }}>
            {/* Scanlines */}
            <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px)", pointerEvents: "none", zIndex: 5 }} />
            {/* Screen glare */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "28%", background: "linear-gradient(180deg, rgba(255,255,255,0.022) 0%, transparent 100%)", pointerEvents: "none", zIndex: 6, borderRadius: "16px 16px 0 0" }} />
            {children}
          </div>
        </div>

        {/* Speaker grille */}
        <div style={{ display: "flex", gap: 4, margin: "7px 0 5px", opacity: 0.3 }}>
          {[...Array(7)].map((_, i) => (
            <div key={i} style={{ width: 3, height: 3, borderRadius: "50%", background: "#7c3aed", boxShadow: "0 0 4px #7c3aed" }} />
          ))}
        </div>

        {/* Controls row */}
        <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", padding: "0 8px", gap: 8 }}>
          {/* D-Pad */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <DPadBtn label="◀" onPress={onLeft} color="#00f5ff" disabled={!buttonsActive} />
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: "radial-gradient(circle at 40% 35%, #2d1b69, #0d0a1e)", border: "1.5px solid #3b1f7a44", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.6)" }} />
              <DPadBtn label="▶" onPress={onRight} color="#00f5ff" disabled={!buttonsActive} />
            </div>
            <div style={{ fontSize: 9, color: "#2d3748", letterSpacing: "0.12em", marginTop: 4, fontWeight: 600 }}>MOVE</div>
          </div>

          {/* Home button */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: "radial-gradient(circle at 38% 32%, #4c1d95, #1a0a2e 70%)", border: "2px solid #6d28d944", boxShadow: "0 0 18px #7c3aed44, inset 0 1px 0 rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#a78bfa", textShadow: "0 0 10px #a78bfa" }}>∞</div>
            <div style={{ fontSize: 8, color: "#1e1b4b", letterSpacing: "0.15em", fontWeight: 700 }}>HOME</div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: "42px 42px", gridTemplateRows: "42px 42px", gap: 5 }}>
              <ActionBtn label="Y" color="#f59e0b" />
              <ActionBtn label="X" color="#00f5ff" />
              <ActionBtn label="B" color="#f472b6" />
              <ActionBtn label="A" color="#4ade80" />
            </div>
            <div style={{ fontSize: 9, color: "#2d3748", letterSpacing: "0.12em", marginTop: 4, fontWeight: 600 }}>ACTION</div>
          </div>
        </div>

        {/* Bottom grip */}
        <div style={{ display: "flex", gap: 4, marginTop: 10, opacity: 0.18, alignItems: "center" }}>
          {[...Array(9)].map((_, i) => (
            <div key={i} style={{ width: 18, height: 5, borderRadius: 3, background: "#7c3aed" }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Overlay screens ──────────────────────────────────────────────────────────
export function MenuOverlay({ onStart }: { onStart: () => void }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(3,1,15,0.92)", zIndex: 10, gap: 10, padding: 16, textAlign: "center" }}>
      <div style={{ fontFamily: "Fraunces, serif", fontSize: "clamp(1.5rem, 6vw, 2.4rem)", fontWeight: 800, color: "#00f5ff", textShadow: "0 0 24px #00f5ff, 0 0 48px #00f5ff44", letterSpacing: "0.06em", lineHeight: 1.1 }}>
        ENDLESS<br />HIGHWAY
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
        style={{ marginTop: 6, padding: "10px 30px", borderRadius: 12, border: "1.5px solid #00f5ff", background: "rgba(0,245,255,0.1)", color: "#00f5ff", fontSize: "clamp(0.85rem, 2.5vw, 1rem)", fontWeight: 700, fontFamily: "Manrope, sans-serif", cursor: "pointer", boxShadow: "0 0 24px #00f5ff44", letterSpacing: "0.1em", minHeight: 44 }}
      >
        ▶ START
      </button>
    </div>
  );
}

export function GameOverOverlay({ score, highScore, onRestart }: { score: number; highScore: number; onRestart: () => void }) {
  const isNew = score > 0 && score >= highScore;
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(3,1,15,0.93)", zIndex: 10, gap: 10, padding: 16, textAlign: "center" }}>
      <div style={{ fontFamily: "Fraunces, serif", fontSize: "clamp(1.3rem, 5vw, 2rem)", fontWeight: 800, color: "#ff2060", textShadow: "0 0 24px #ff206066", letterSpacing: "0.08em" }}>
        SMOOSHED!
      </div>
      <div style={{ fontSize: "clamp(0.7rem, 2.5vw, 0.9rem)", color: "#94a3b8" }}>A neon cube got you 🔴</div>
      <div style={{ background: "rgba(0,245,255,0.05)", border: "1px solid rgba(0,245,255,0.18)", borderRadius: 14, padding: "10px 28px", marginTop: 2 }}>
        <div style={{ fontSize: "clamp(1.6rem, 6vw, 2.2rem)", fontWeight: 800, color: "#00f5ff", fontFamily: "Fraunces, serif", lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: "0.65rem", color: "#64748b", letterSpacing: "0.12em", marginTop: 2 }}>SCORE</div>
        {isNew
          ? <div style={{ fontSize: "0.72rem", color: "#f59e0b", marginTop: 4, fontWeight: 700 }}>★ NEW HIGH SCORE!</div>
          : <div style={{ fontSize: "0.68rem", color: "#475569", marginTop: 4 }}>Best: {highScore}</div>
        }
      </div>
      <button
        onClick={onRestart}
        style={{ marginTop: 4, padding: "10px 30px", borderRadius: 12, border: "1.5px solid #a78bfa", background: "rgba(167,139,250,0.1)", color: "#a78bfa", fontSize: "clamp(0.85rem, 2.5vw, 1rem)", fontWeight: 700, fontFamily: "Manrope, sans-serif", cursor: "pointer", boxShadow: "0 0 20px #a78bfa44", letterSpacing: "0.1em", minHeight: 44 }}
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
        camera={{ position: [0, 7, PLAYER_Z + 14], fov: 60, near: 0.1, far: 200 }}
        style={{ width: "100%", height: "100%" }}
        gl={{ antialias: true }}
      >
        <Scene laneRef={laneRef} onScore={onScore} onGameOver={onGameOver} />
      </Canvas>
    </div>
  );
}

// ─── Keyboard input hook ──────────────────────────────────────────────────────
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
