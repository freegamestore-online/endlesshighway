import { useEffect, useRef, useState, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Lane, Obstacle, Coin, Gap } from "../types";
import {
  LANE_X,
  SPAWN_Z,
  PLAYER_Z,
  PLAYER_RADIUS,
  OBSTACLE_HALF,
  checkCollision,
  checkCoinCollect,
  checkGapCollision,
  currentSpeed,
  currentSpawnInterval,
  currentCoinInterval,
  currentGapInterval,
  spawnCount,
  randomLane,
  randomTwoLanes,
  randomCoinHeight,
  randomGapLanes,
  scoreFromDistance,
  displaySpeed,
  BASE_SPEED,
  MAX_SPEED,
  JUMP_VELOCITY,
  GRAVITY,
  CUBE_TOP,
  COIN_SCORE,
  GAP_LENGTH,
  GAP_START_AFTER,
} from "../lib/logic";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface GameProps {
  onScore: (score: number) => void;
  onGameOver: () => void;
  onSpeed?: (speed: number) => void;
  laneRef: React.RefObject<Lane>;
  jumpRef: React.RefObject<() => void>;
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
      <mesh position={[-ROAD_WIDTH / 2, 0.04, PLAYER_Z - ROAD_LENGTH / 2 + 20]}>
        <boxGeometry args={[0.14, 0.1, ROAD_LENGTH]} />
        <meshStandardMaterial color="#c026d3" emissive="#c026d3" emissiveIntensity={3} />
      </mesh>
      <mesh position={[ROAD_WIDTH / 2, 0.04, PLAYER_Z - ROAD_LENGTH / 2 + 20]}>
        <boxGeometry args={[0.14, 0.1, ROAD_LENGTH]} />
        <meshStandardMaterial color="#c026d3" emissive="#c026d3" emissiveIntensity={3} />
      </mesh>
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

// ─── Gap mesh — a glowing void in the road ────────────────────────────────────
function GapMesh({ gap }: { gap: Gap }) {
  const t = useRef(0);
  const light1Ref = useRef<THREE.PointLight>(null!);
  const light2Ref = useRef<THREE.PointLight>(null!);

  useFrame((_, dt) => {
    t.current += dt;
    const pulse = 1.2 + Math.sin(t.current * 4) * 0.4;
    if (light1Ref.current) light1Ref.current.intensity = pulse;
    if (light2Ref.current) light2Ref.current.intensity = pulse * 0.7;
  });

  // gap.z is the leading edge (far side), gap.z + GAP_LENGTH is the near edge
  const centerZ = gap.z + GAP_LENGTH / 2;

  return (
    <group>
      {/* Dark void panel — sits just below road level */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.15, centerZ]}>
        <planeGeometry args={[ROAD_WIDTH, GAP_LENGTH]} />
        <meshStandardMaterial color="#000000" />
      </mesh>

      {/* Glowing leading edge */}
      <mesh position={[0, 0.04, gap.z]}>
        <boxGeometry args={[ROAD_WIDTH + 0.3, 0.12, 0.18]} />
        <meshStandardMaterial color="#00f5ff" emissive="#00f5ff" emissiveIntensity={4} transparent opacity={0.9} />
      </mesh>
      {/* Glowing trailing edge */}
      <mesh position={[0, 0.04, gap.z + GAP_LENGTH]}>
        <boxGeometry args={[ROAD_WIDTH + 0.3, 0.12, 0.18]} />
        <meshStandardMaterial color="#00f5ff" emissive="#00f5ff" emissiveIntensity={4} transparent opacity={0.9} />
      </mesh>

      {/* Side glow strips */}
      <mesh position={[-ROAD_WIDTH / 2, 0.04, centerZ]}>
        <boxGeometry args={[0.18, 0.1, GAP_LENGTH]} />
        <meshStandardMaterial color="#7c3aed" emissive="#7c3aed" emissiveIntensity={3} transparent opacity={0.8} />
      </mesh>
      <mesh position={[ROAD_WIDTH / 2, 0.04, centerZ]}>
        <boxGeometry args={[0.18, 0.1, GAP_LENGTH]} />
        <meshStandardMaterial color="#7c3aed" emissive="#7c3aed" emissiveIntensity={3} transparent opacity={0.8} />
      </mesh>

      {/* Abyss glow beneath */}
      <pointLight ref={light1Ref} color="#00f5ff" intensity={1.5} distance={10} position={[0, -2, centerZ]} />
      <pointLight ref={light2Ref} color="#7c3aed" intensity={1.0} distance={8} position={[0, -3, centerZ]} />

      {/* Warning arrow markers above the gap */}
      <mesh position={[0, 1.2, gap.z - 2]} rotation={[0, 0, 0]}>
        <coneGeometry args={[0.35, 0.7, 3]} />
        <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={3} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

// ─── Coin mesh ────────────────────────────────────────────────────────────────
function CoinMesh({ coin }: { coin: Coin }) {
  const groupRef = useRef<THREE.Group>(null!);
  const t = useRef(Math.random() * Math.PI * 2);
  useFrame((_, dt) => {
    t.current += dt;
    if (!groupRef.current) return;
    groupRef.current.rotation.y += dt * 3.5;
    groupRef.current.position.y = coin.y + Math.sin(t.current * 2.5) * 0.12;
  });
  const x = LANE_X[coin.lane]!;
  return (
    <group ref={groupRef} position={[x, coin.y, coin.z]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.32, 0.32, 0.1, 24]} />
        <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={1.8} metalness={0.9} roughness={0.05} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 0.02, 6]} />
        <meshStandardMaterial color="#ffffff" emissive="#fde68a" emissiveIntensity={2.5} metalness={1} roughness={0} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.36, 0.04, 8, 24]} />
        <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={3} transparent opacity={0.7} />
      </mesh>
      <pointLight color="#f59e0b" intensity={1.4} distance={4} />
    </group>
  );
}

// ─── Running + jumping character ──────────────────────────────────────────────
function RunningPlayer({
  laneRef, speedRef, jumpYRef, isJumpingRef,
}: {
  laneRef: React.RefObject<Lane>;
  speedRef: React.RefObject<number>;
  jumpYRef: React.RefObject<number>;
  isJumpingRef: React.RefObject<boolean>;
}) {
  const rootRef = useRef<THREE.Group>(null!);
  const leanRef = useRef<THREE.Group>(null!);
  const headRef = useRef<THREE.Group>(null!);
  const leftLegRef = useRef<THREE.Group>(null!);
  const rightLegRef = useRef<THREE.Group>(null!);
  const leftArmRef = useRef<THREE.Group>(null!);
  const rightArmRef = useRef<THREE.Group>(null!);
  const jetRef = useRef<THREE.Group>(null!);
  const glowRef = useRef<THREE.PointLight>(null!);
  const shadowRef = useRef<THREE.Mesh>(null!);

  const targetX = useRef(LANE_X[1]!);
  const currentX = useRef(LANE_X[1]!);
  const t = useRef(0);
  const laneChangeShake = useRef(0);
  const prevLane = useRef<Lane>(1);

  useFrame((_, dt) => {
    t.current += dt;
    const lane = laneRef.current ?? 1;
    const speed = speedRef.current ?? BASE_SPEED;
    const speedT = Math.min((speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED), 1);
    const jumpY = jumpYRef.current ?? 0;
    const isJumping = isJumpingRef.current ?? false;

    if (lane !== prevLane.current) {
      laneChangeShake.current = 1;
      prevLane.current = lane;
    }
    laneChangeShake.current *= 0.82;

    targetX.current = LANE_X[lane]!;
    currentX.current += (targetX.current - currentX.current) * Math.min(1, dt * 13);

    const cadence = 6 + speedT * 10;
    const phase = t.current * cadence;
    const groundBob = isJumping ? 0 : Math.abs(Math.sin(phase)) * 0.14;
    const shakeX = Math.sin(t.current * 40) * laneChangeShake.current * 0.08;
    const shakeY = Math.abs(Math.sin(t.current * 35)) * laneChangeShake.current * 0.05;

    if (rootRef.current) {
      rootRef.current.position.x = currentX.current + shakeX;
      rootRef.current.position.y = 0.12 + groundBob + jumpY + shakeY;
      rootRef.current.position.z = PLAYER_Z;
    }
    if (leanRef.current) {
      const jumpLean = isJumping ? -0.32 - Math.sin(jumpY / CUBE_TOP) * 0.15 : -0.18 - speedT * 0.12;
      leanRef.current.rotation.x = jumpLean;
      leanRef.current.rotation.z = (targetX.current - currentX.current) * -0.12;
    }
    if (headRef.current) {
      headRef.current.rotation.x = isJumping ? -0.18 : -0.05 + Math.sin(phase * 0.5) * 0.06;
      headRef.current.position.y = 1.28 + (isJumping ? 0 : Math.sin(phase) * 0.03);
    }
    if (leftLegRef.current && rightLegRef.current) {
      if (isJumping) {
        leftLegRef.current.rotation.x = -0.7;
        rightLegRef.current.rotation.x = -0.7;
      } else {
        const swing = 0.55 + speedT * 0.35;
        leftLegRef.current.rotation.x = Math.sin(phase) * swing;
        rightLegRef.current.rotation.x = Math.sin(phase + Math.PI) * swing;
      }
    }
    if (leftArmRef.current && rightArmRef.current) {
      if (isJumping) {
        leftArmRef.current.rotation.x = -0.9;
        rightArmRef.current.rotation.x = -0.9;
        leftArmRef.current.rotation.z = -0.4;
        rightArmRef.current.rotation.z = 0.4;
      } else {
        const armSwing = 0.45 + speedT * 0.3;
        leftArmRef.current.rotation.x = Math.sin(phase + Math.PI) * armSwing;
        rightArmRef.current.rotation.x = Math.sin(phase) * armSwing;
        leftArmRef.current.rotation.z = 0;
        rightArmRef.current.rotation.z = 0;
      }
    }
    if (jetRef.current) {
      const jumpBoost = isJumping ? 1.8 : 1;
      const pulse = (0.7 + Math.sin(t.current * 18) * 0.3 + speedT * 0.5) * jumpBoost;
      jetRef.current.scale.set(pulse, pulse, (1 + speedT * 1.5) * jumpBoost);
    }
    if (glowRef.current) {
      glowRef.current.intensity = 2.5 + Math.sin(t.current * 7) * 0.8 + speedT * 1.5 + (isJumping ? 2 : 0);
    }
    if (shadowRef.current) {
      const shadowScale = Math.max(0.1, 1 - jumpY / 4);
      shadowRef.current.scale.setScalar(shadowScale);
      (shadowRef.current.material as THREE.MeshStandardMaterial).opacity = 0.35 * shadowScale;
      shadowRef.current.position.y = -jumpY + 0.01;
    }
  });

  const C = "#00f5ff";
  const C2 = "#7c3aed";

  return (
    <group ref={rootRef} position={[LANE_X[1]!, 0.12, PLAYER_Z]}>
      <mesh ref={shadowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[0.45, 16]} />
        <meshStandardMaterial color="#000000" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <group ref={leanRef}>
        <mesh position={[0, 0.72, 0]} castShadow>
          <capsuleGeometry args={[0.18, 0.42, 8, 16]} />
          <meshStandardMaterial color={C} emissive={C} emissiveIntensity={0.9} metalness={0.3} roughness={0.1} />
        </mesh>
        <mesh position={[0, 0.82, 0.14]}>
          <boxGeometry args={[0.28, 0.22, 0.06]} />
          <meshStandardMaterial color="#ffffff" emissive={C} emissiveIntensity={1.2} metalness={0.6} roughness={0.05} />
        </mesh>
        <group ref={headRef} position={[0, 1.28, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.2, 20, 20]} />
            <meshStandardMaterial color={C} emissive={C} emissiveIntensity={1} metalness={0.2} roughness={0.1} />
          </mesh>
          <mesh position={[0, 0, 0.16]} rotation={[0.1, 0, 0]}>
            <boxGeometry args={[0.26, 0.1, 0.04]} />
            <meshStandardMaterial color="#ff2060" emissive="#ff2060" emissiveIntensity={2} transparent opacity={0.85} />
          </mesh>
          <mesh position={[0, 0.26, 0]}>
            <cylinderGeometry args={[0.015, 0.015, 0.22, 6]} />
            <meshStandardMaterial color={C2} emissive={C2} emissiveIntensity={2} />
          </mesh>
          <mesh position={[0, 0.38, 0]}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={3} />
          </mesh>
        </group>
        <group ref={leftArmRef} position={[-0.26, 1.0, 0]}>
          <mesh position={[0, -0.2, 0]}>
            <capsuleGeometry args={[0.07, 0.3, 6, 8]} />
            <meshStandardMaterial color={C} emissive={C} emissiveIntensity={0.8} />
          </mesh>
          <mesh position={[0, -0.42, 0]}>
            <sphereGeometry args={[0.09, 8, 8]} />
            <meshStandardMaterial color="#ffffff" emissive={C} emissiveIntensity={1.5} />
          </mesh>
        </group>
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
        <group ref={leftLegRef} position={[-0.14, 0.48, 0]}>
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
        <group ref={jetRef} position={[0, 0.72, -0.22]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.14, 0.7, 10]} />
            <meshStandardMaterial color="#00f5ff" emissive="#00f5ff" emissiveIntensity={2} transparent opacity={0.5} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.1]}>
            <coneGeometry args={[0.07, 0.45, 8]} />
            <meshStandardMaterial color="#ffffff" emissive="#f472b6" emissiveIntensity={3} transparent opacity={0.75} />
          </mesh>
          <mesh position={[-0.08, 0, 0.15]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.025, 0.5, 4]} />
            <meshStandardMaterial color="#a78bfa" emissive="#a78bfa" emissiveIntensity={2} transparent opacity={0.4} />
          </mesh>
          <mesh position={[0.08, 0, 0.15]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.025, 0.5, 4]} />
            <meshStandardMaterial color="#a78bfa" emissive="#a78bfa" emissiveIntensity={2} transparent opacity={0.4} />
          </mesh>
        </group>
        <mesh position={[0, 0.72, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.24, 0.025, 8, 32]} />
          <meshStandardMaterial color={C} emissive={C} emissiveIntensity={3} />
        </mesh>
      </group>
      <pointLight ref={glowRef} color={C} intensity={2.5} distance={8} />
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
        <meshStandardMaterial color="#ff1a4d" emissive="#ff1a4d" emissiveIntensity={1.6} metalness={0.1} roughness={0.05} />
      </mesh>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.2, 0.07, 8, 24]} />
        <meshStandardMaterial color="#ff1a4d" emissive="#ff1a4d" emissiveIntensity={2.8} transparent opacity={0.6} />
      </mesh>
      <mesh ref={ring2Ref}>
        <torusGeometry args={[1.1, 0.05, 8, 24]} />
        <meshStandardMaterial color="#ff8c00" emissive="#ff8c00" emissiveIntensity={2.5} transparent opacity={0.5} />
      </mesh>
      <pointLight color="#ff1a4d" intensity={2.2} distance={6} />
    </group>
  );
}

// ─── Camera ───────────────────────────────────────────────────────────────────
function FollowCamera({ laneRef, speedRef }: { laneRef: React.RefObject<Lane>; speedRef: React.RefObject<number> }) {
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
    if ("fov" in camera) {
      const p = camera as THREE.PerspectiveCamera;
      p.fov += (60 + speedT * 18 - p.fov) * dt * 3;
      p.updateProjectionMatrix();
    }
  });
  return null;
}

// ─── Main game scene ──────────────────────────────────────────────────────────
function Scene({ laneRef, onScore, onGameOver, onSpeed, jumpRef }: GameProps) {
  const obstacles = useRef<Obstacle[]>([]);
  const coins = useRef<Coin[]>([]);
  const gaps = useRef<Gap[]>([]);
  const nextId = useRef(0);
  const elapsed = useRef(0);
  const spawnTimer = useRef(0);
  const coinSpawnTimer = useRef(0);
  const gapSpawnTimer = useRef(0);
  const distance = useRef(0);
  const lastScore = useRef(-1);
  const lastSpeed = useRef(-1);
  const dead = useRef(false);
  const offsetRef = useRef(0);
  const speedRef = useRef(BASE_SPEED);
  const coinsCollected = useRef(0);

  const jumpY = useRef(0);
  const jumpVel = useRef(0);
  const isJumping = useRef(false);

  const [, forceRender] = useState(0);
  const cbs = useRef({ onScore, onGameOver, onSpeed });
  cbs.current = { onScore, onGameOver, onSpeed };

  useEffect(() => {
    (jumpRef as React.MutableRefObject<() => void>).current = () => {
      if (isJumping.current || dead.current) return;
      isJumping.current = true;
      jumpVel.current = JUMP_VELOCITY;
    };
  }, [jumpRef]);

  useFrame((_, delta) => {
    if (dead.current) return;
    const dt = Math.min(delta, 0.05);
    elapsed.current += dt;

    const speed = currentSpeed(elapsed.current);
    speedRef.current = speed;
    distance.current += speed * dt;
    offsetRef.current += speed * dt;

    // Jump physics
    if (isJumping.current) {
      jumpVel.current -= GRAVITY * dt;
      jumpY.current += jumpVel.current * dt;
      if (jumpY.current <= 0) {
        jumpY.current = 0;
        jumpVel.current = 0;
        isJumping.current = false;
      }
    }

    // Report speed (0-100)
    const spd = displaySpeed(elapsed.current);
    if (spd !== lastSpeed.current) {
      lastSpeed.current = spd;
      cbs.current.onSpeed?.(spd);
    }

    // Score
    const distScore = scoreFromDistance(distance.current);
    const totalScore = distScore + coinsCollected.current * COIN_SCORE;
    if (totalScore !== lastScore.current) {
      lastScore.current = totalScore;
      cbs.current.onScore(totalScore);
    }

    // Spawn obstacles
    spawnTimer.current += dt;
    const interval = currentSpawnInterval(elapsed.current);
    if (spawnTimer.current >= interval) {
      spawnTimer.current = 0;
      const count = spawnCount(elapsed.current);
      if (count === 2) {
        const [la, lb] = randomTwoLanes();
        obstacles.current.push(
          { id: nextId.current++, lane: la, z: SPAWN_Z },
          { id: nextId.current++, lane: lb, z: SPAWN_Z },
        );
      } else {
        obstacles.current.push({ id: nextId.current++, lane: randomLane(), z: SPAWN_Z });
      }
      forceRender((n) => n + 1);
    }

    // Spawn coins
    coinSpawnTimer.current += dt;
    const coinInterval = currentCoinInterval(elapsed.current);
    if (coinSpawnTimer.current >= coinInterval) {
      coinSpawnTimer.current = 0;
      const coinLane = randomLane();
      const coinY = randomCoinHeight();
      const clusterSize = Math.floor(Math.random() * 3) + 1;
      for (let c = 0; c < clusterSize; c++) {
        coins.current.push({
          id: nextId.current++,
          lane: coinLane,
          z: SPAWN_Z - c * 2.5,
          y: coinY,
          collected: false,
        });
      }
      forceRender((n) => n + 1);
    }

    // Spawn gaps (only after GAP_START_AFTER seconds)
    if (elapsed.current >= GAP_START_AFTER) {
      gapSpawnTimer.current += dt;
      const gapInterval = currentGapInterval(elapsed.current);
      if (gapSpawnTimer.current >= gapInterval) {
        gapSpawnTimer.current = 0;
        const gapLanes = randomGapLanes(elapsed.current);
        gaps.current.push({
          id: nextId.current++,
          lanes: gapLanes,
          z: SPAWN_Z,
          length: GAP_LENGTH,
        });
        forceRender((n) => n + 1);
      }
    }

    const playerLane = laneRef.current ?? 1;
    let changed = false;

    // Move + collide obstacles
    const aliveObs: Obstacle[] = [];
    for (const obs of obstacles.current) {
      obs.z += speed * dt;
      if (checkCollision(playerLane, obs.lane, obs.z, jumpY.current)) {
        dead.current = true;
        cbs.current.onGameOver();
        return;
      }
      if (obs.z <= PLAYER_Z + 8) aliveObs.push(obs);
      else changed = true;
    }
    obstacles.current = aliveObs;

    // Move + collect coins
    const aliveCo: Coin[] = [];
    for (const coin of coins.current) {
      coin.z += speed * dt;
      if (!coin.collected && checkCoinCollect(playerLane, coin.lane, coin.z, coin.y, jumpY.current)) {
        coin.collected = true;
        coinsCollected.current += 1;
        changed = true;
        continue;
      }
      if (coin.z <= PLAYER_Z + 8 && !coin.collected) aliveCo.push(coin);
      else changed = true;
    }
    coins.current = aliveCo;

    // Move + collide gaps
    const aliveGaps: Gap[] = [];
    for (const gap of gaps.current) {
      gap.z += speed * dt;
      if (checkGapCollision(playerLane, gap.lanes, gap.z, gap.length, jumpY.current)) {
        dead.current = true;
        cbs.current.onGameOver();
        return;
      }
      // Keep gap visible until it fully passes the player
      if (gap.z + gap.length <= PLAYER_Z + 10) {
        changed = true; // passed
      } else {
        aliveGaps.push(gap);
      }
    }
    gaps.current = aliveGaps;

    if (changed) forceRender((n) => n + 1);
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
      <RunningPlayer laneRef={laneRef} speedRef={speedRef} jumpYRef={jumpY} isJumpingRef={isJumping} />
      {obstacles.current.map((obs) => (
        <ObstacleMesh key={obs.id} obstacle={obs} speedRef={speedRef} />
      ))}
      {coins.current.map((coin) => (
        <CoinMesh key={coin.id} coin={coin} />
      ))}
      {gaps.current.map((gap) => (
        <GapMesh key={gap.id} gap={gap} />
      ))}
      <FollowCamera laneRef={laneRef} speedRef={speedRef} />
    </>
  );
}

// ─── Canvas wrapper ───────────────────────────────────────────────────────────
export function Game({ laneRef, onScore, onGameOver, onSpeed, jumpRef }: GameProps) {
  return (
    <Canvas
      shadows
      camera={{ fov: 60, near: 0.1, far: 400, position: [0, 7.5, PLAYER_Z + 14] }}
      style={{ width: "100%", height: "100%" }}
      gl={{ antialias: true }}
    >
      <Scene laneRef={laneRef} onScore={onScore} onGameOver={onGameOver} onSpeed={onSpeed} jumpRef={jumpRef} />
    </Canvas>
  );
}

// ─── Speed HUD ────────────────────────────────────────────────────────────────
export function SpeedHUD({ speed }: { speed: number }) {
  const pct = Math.min(speed, 100);
  // Color shifts from cyan → yellow → red as speed climbs
  const hue = Math.round(180 - pct * 1.8); // 180 (cyan) → 0 (red)
  const barColor = `hsl(${hue}, 100%, 60%)`;
  return (
    <div
      style={{
        position: "absolute",
        bottom: 14,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      <div style={{ fontFamily: "Manrope, sans-serif", fontSize: 11, color: "#a78bfa", letterSpacing: 2, textTransform: "uppercase" }}>
        Speed
      </div>
      {/* Bar */}
      <div
        style={{
          width: 120,
          height: 8,
          borderRadius: 4,
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.12)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 4,
            background: barColor,
            boxShadow: `0 0 8px ${barColor}`,
            transition: "width 0.3s ease, background 0.3s ease",
          }}
        />
      </div>
      {/* Number */}
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: 18,
          fontWeight: 700,
          color: barColor,
          textShadow: `0 0 12px ${barColor}`,
          lineHeight: 1,
          transition: "color 0.3s ease",
        }}
      >
        {pct}
      </div>
    </div>
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
        width: 52, height: 52, borderRadius: 12,
        border: `2px solid ${active ? color : color + "40"}`,
        cursor: disabled ? "default" : "pointer",
        fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center",
        background: active ? `linear-gradient(135deg, ${color}28, ${color}10)` : `${color}08`,
        color: active ? color : color + "70",
        boxShadow: active
          ? `0 0 22px ${color}99, 0 0 8px ${color}44, inset 0 0 12px ${color}18`
          : `inset 0 1px 0 rgba(255,255,255,0.04)`,
        transition: "all 0.06s ease",
        touchAction: "none", userSelect: "none", outline: "none",
        opacity: disabled ? 0.4 : 1,
      }}
      aria-label={label}
    >
      {label}
    </button>
  );
}

// ─── Action button ─────────────────────────────────────────────────────────────
interface ActionBtnProps {
  label: string;
  sublabel?: string;
  onPress: () => void;
  color?: string;
  size?: number;
  disabled?: boolean;
}

function ActionBtn({ label, sublabel, onPress, color = "#c026d3", size = 52, disabled = false }: ActionBtnProps) {
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
        width: size, height: size, borderRadius: "50%",
        border: `2px solid ${active ? color : color + "50"}`,
        cursor: disabled ? "default" : "pointer",
        fontSize: 20, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: active ? `radial-gradient(circle, ${color}30, ${color}10)` : `${color}0a`,
        color: active ? color : color + "80",
        boxShadow: active
          ? `0 0 28px ${color}bb, 0 0 10px ${color}55, inset 0 0 16px ${color}20`
          : `inset 0 1px 0 rgba(255,255,255,0.04)`,
        transition: "all 0.06s ease",
        touchAction: "none", userSelect: "none", outline: "none",
        opacity: disabled ? 0.4 : 1, gap: 1,
      }}
      aria-label={label}
    >
      <span>{label}</span>
      {sublabel && (
        <span style={{ fontSize: 8, letterSpacing: 1, opacity: 0.7, fontFamily: "Manrope,sans-serif", textTransform: "uppercase" }}>
          {sublabel}
        </span>
      )}
    </button>
  );
}

// ─── Console frame ────────────────────────────────────────────────────────────
interface ConsoleFrameProps {
  children: React.ReactNode;
  onLeft: () => void;
  onRight: () => void;
  onJump: () => void;
  score: number;
  highScore: number;
  phase: string;
  speed: number;
}

export function ConsoleFrame({ children, onLeft, onRight, onJump, phase, speed }: ConsoleFrameProps) {
  const playing = phase === "playing";
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#03010f", position: "relative" }}>
      {/* Game viewport */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {children}
        {/* Speed HUD — only while playing */}
        {playing && <SpeedHUD speed={speed} />}
      </div>

      {/* Controls bar */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 24px 12px",
          background: "linear-gradient(180deg, #07051a 0%, #0d0525 100%)",
          borderTop: "1px solid rgba(124,58,237,0.25)",
          gap: 12,
        }}
      >
        {/* D-Pad */}
        <div style={{ display: "flex", gap: 8 }}>
          <DPadBtn label="◀" onPress={onLeft} disabled={!playing} />
          <DPadBtn label="▶" onPress={onRight} disabled={!playing} />
        </div>

        {/* Centre hint */}
        <div style={{ textAlign: "center", fontFamily: "Manrope,sans-serif", fontSize: 10, color: "#4c1d95", letterSpacing: 1, textTransform: "uppercase", lineHeight: 1.4 }}>
          {playing ? "jump over\ngaps & cubes" : "endless highway"}
        </div>

        {/* Jump button */}
        <ActionBtn label="▲" sublabel="jump" onPress={onJump} color="#c026d3" size={56} disabled={!playing} />
      </div>
    </div>
  );
}

// ─── Menu overlay ─────────────────────────────────────────────────────────────
export function MenuOverlay({ onStart }: { onStart: () => void }) {
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 28, zIndex: 20,
      background: "radial-gradient(ellipse at 50% 40%, #0d0525cc 0%, #03010fee 100%)",
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: 38, fontWeight: 700, color: "#00f5ff", textShadow: "0 0 32px #00f5ff88", lineHeight: 1.1 }}>
          Endless
        </div>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: 38, fontWeight: 700, color: "#c026d3", textShadow: "0 0 32px #c026d388", lineHeight: 1.1 }}>
          Highway
        </div>
        <div style={{ fontFamily: "Manrope, sans-serif", fontSize: 13, color: "#a78bfa", marginTop: 10, letterSpacing: 1 }}>
          dodge cubes · jump gaps · collect coins
        </div>
      </div>
      <button
        onClick={onStart}
        style={{
          fontFamily: "Fraunces, serif", fontSize: 18, fontWeight: 700,
          padding: "14px 44px", borderRadius: 14,
          background: "linear-gradient(135deg, #7c3aed, #c026d3)",
          color: "#fff", border: "none", cursor: "pointer",
          boxShadow: "0 0 32px #c026d366", letterSpacing: 1,
        }}
      >
        Start
      </button>
      <div style={{ fontFamily: "Manrope, sans-serif", fontSize: 11, color: "#4c1d95", textAlign: "center", lineHeight: 1.8 }}>
        ← → to switch lanes &nbsp;·&nbsp; Space / ▲ to jump
      </div>
    </div>
  );
}

// ─── Game over overlay ────────────────────────────────────────────────────────
export function GameOverOverlay({ score, highScore, onRestart }: { score: number; highScore: number; onRestart: () => void }) {
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 20, zIndex: 20,
      background: "radial-gradient(ellipse at 50% 40%, #1a0a2ecc 0%, #03010fee 100%)",
    }}>
      <div style={{ fontFamily: "Fraunces, serif", fontSize: 32, fontWeight: 700, color: "#ff1a4d", textShadow: "0 0 24px #ff1a4d88" }}>
        Game Over
      </div>
      <div style={{ textAlign: "center", fontFamily: "Manrope, sans-serif", fontSize: 15, color: "#a78bfa", lineHeight: 2 }}>
        <div>Score <span style={{ color: "#00f5ff", fontWeight: 700 }}>{score}</span></div>
        <div>Best &nbsp;<span style={{ color: "#fbbf24", fontWeight: 700 }}>{highScore}</span></div>
      </div>
      <button
        onClick={onRestart}
        style={{
          fontFamily: "Fraunces, serif", fontSize: 16, fontWeight: 700,
          padding: "12px 40px", borderRadius: 12,
          background: "linear-gradient(135deg, #7c3aed, #c026d3)",
          color: "#fff", border: "none", cursor: "pointer",
          boxShadow: "0 0 24px #c026d355",
        }}
      >
        Try Again
      </button>
    </div>
  );
}

// ─── Lane controls hook ───────────────────────────────────────────────────────
export function useLaneControls(laneRef: React.RefObject<Lane>) {
  const moveLeft = useCallback(() => {
    const cur = laneRef.current ?? 1;
    (laneRef as React.MutableRefObject<Lane>).current = Math.max(0, cur - 1) as Lane;
  }, [laneRef]);
  const moveRight = useCallback(() => {
    const cur = laneRef.current ?? 1;
    (laneRef as React.MutableRefObject<Lane>).current = Math.min(2, cur + 1) as Lane;
  }, [laneRef]);
  return { moveLeft, moveRight };
}
