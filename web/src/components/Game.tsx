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
  onCoins?: (coins: number) => void;
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

  const centerZ = gap.z + GAP_LENGTH / 2;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.15, centerZ]}>
        <planeGeometry args={[ROAD_WIDTH, GAP_LENGTH]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
      <mesh position={[0, 0.04, gap.z]}>
        <boxGeometry args={[ROAD_WIDTH + 0.3, 0.12, 0.18]} />
        <meshStandardMaterial color="#00f5ff" emissive="#00f5ff" emissiveIntensity={4} transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, 0.04, gap.z + GAP_LENGTH]}>
        <boxGeometry args={[ROAD_WIDTH + 0.3, 0.12, 0.18]} />
        <meshStandardMaterial color="#00f5ff" emissive="#00f5ff" emissiveIntensity={4} transparent opacity={0.9} />
      </mesh>
      <mesh position={[-ROAD_WIDTH / 2, 0.04, centerZ]}>
        <boxGeometry args={[0.18, 0.1, GAP_LENGTH]} />
        <meshStandardMaterial color="#7c3aed" emissive="#7c3aed" emissiveIntensity={3} transparent opacity={0.8} />
      </mesh>
      <mesh position={[ROAD_WIDTH / 2, 0.04, centerZ]}>
        <boxGeometry args={[0.18, 0.1, GAP_LENGTH]} />
        <meshStandardMaterial color="#7c3aed" emissive="#7c3aed" emissiveIntensity={3} transparent opacity={0.8} />
      </mesh>
      <pointLight ref={light1Ref} color="#00f5ff" intensity={1.5} distance={10} position={[0, -2, centerZ]} />
      <pointLight ref={light2Ref} color="#7c3aed" intensity={1.0} distance={8} position={[0, -3, centerZ]} />
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
function Scene({ laneRef, onScore, onGameOver, onSpeed, onCoins, jumpRef }: GameProps) {
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
  const lastCoins = useRef(-1);
  const dead = useRef(false);
  const offsetRef = useRef(0);
  const speedRef = useRef(BASE_SPEED);
  const coinsCollected = useRef(0);

  const jumpY = useRef(0);
  const jumpVel = useRef(0);
  const isJumping = useRef(false);

  const [, forceRender] = useState(0);
  const cbs = useRef({ onScore, onGameOver, onSpeed, onCoins });
  cbs.current = { onScore, onGameOver, onSpeed, onCoins };

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
      const lanes = randomTwoLanes();
      for (let i = 0; i < count; i++) {
        const lane = count === 1 ? randomLane() : lanes[i]!;
        obstacles.current.push({ id: nextId.current++, lane, z: SPAWN_Z });
      }
    }

    // Spawn coins
    coinSpawnTimer.current += dt;
    const coinInterval = currentCoinInterval(elapsed.current);
    if (coinSpawnTimer.current >= coinInterval) {
      coinSpawnTimer.current = 0;
      coins.current.push({
        id: nextId.current++,
        lane: randomLane(),
        z: SPAWN_Z,
        y: randomCoinHeight(),
      });
    }

    // Spawn gaps
    gapSpawnTimer.current += dt;
    const gapInterval = currentGapInterval(elapsed.current);
    if (elapsed.current > GAP_START_AFTER && gapSpawnTimer.current >= gapInterval) {
      gapSpawnTimer.current = 0;
      const gapLanes = randomGapLanes();
      for (const lane of gapLanes) {
        gaps.current.push({ id: nextId.current++, lane, z: SPAWN_Z });
      }
    }

    // Move obstacles
    for (const obs of obstacles.current) {
      obs.z += speed * dt;
    }
    obstacles.current = obstacles.current.filter((o) => o.z < PLAYER_Z + 6);

    // Move coins
    for (const c of coins.current) {
      c.z += speed * dt;
    }

    // Move gaps
    for (const g of gaps.current) {
      g.z += speed * dt;
    }
    gaps.current = gaps.current.filter((g) => g.z < PLAYER_Z + GAP_LENGTH + 4);

    // Collision detection
    const playerX = LANE_X[laneRef.current ?? 1]!;
    const playerY = jumpY.current;

    for (const obs of obstacles.current) {
      if (checkCollision(obs, playerX, playerY)) {
        dead.current = true;
        cbs.current.onGameOver();
        return;
      }
    }

    // Coin collection
    const remaining: Coin[] = [];
    for (const c of coins.current) {
      if (checkCoinCollect(c, playerX, playerY)) {
        coinsCollected.current += 1;
      } else {
        remaining.push(c);
      }
    }
    coins.current = remaining.filter((c) => c.z < PLAYER_Z + 4);

    // Report coin count
    if (coinsCollected.current !== lastCoins.current) {
      lastCoins.current = coinsCollected.current;
      cbs.current.onCoins?.(coinsCollected.current);
    }

    // Gap collision
    for (const g of gaps.current) {
      if (checkGapCollision(g, laneRef.current ?? 1, playerY, playerX)) {
        dead.current = true;
        cbs.current.onGameOver();
        return;
      }
    }

    forceRender((n) => n + 1);
  });

  return (
    <>
      <Stars />
      <SpaceFloor offsetRef={offsetRef} />
      <Road />
      <LaneDashes offsetRef={offsetRef} />
      {gaps.current.map((g) => (
        <GapMesh key={g.id} gap={g} />
      ))}
      {obstacles.current.map((obs) => (
        <ObstacleMesh key={obs.id} obstacle={obs} speedRef={speedRef} />
      ))}
      {coins.current.map((c) => (
        <CoinMesh key={c.id} coin={c} />
      ))}
      <RunningPlayer
        laneRef={laneRef}
        speedRef={speedRef}
        jumpYRef={jumpY}
        isJumpingRef={isJumping}
      />
      <FollowCamera laneRef={laneRef} speedRef={speedRef} />
      <ambientLight intensity={0.25} color="#1a0a3a" />
      <directionalLight
        position={[5, 14, 10]}
        intensity={1.4}
        color="#ffffff"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight color="#7c3aed" intensity={3} distance={30} position={[0, 8, PLAYER_Z - 10]} />
      <pointLight color="#00f5ff" intensity={1.5} distance={20} position={[0, 4, PLAYER_Z - 20]} />
      <fog attach="fog" args={["#030112", 30, 120]} />
    </>
  );
}

// ─── Game canvas wrapper ──────────────────────────────────────────────────────
export function Game({ laneRef, onScore, onGameOver, onSpeed, onCoins, jumpRef }: GameProps) {
  return (
    <Canvas
      shadows
      camera={{ fov: 60, near: 0.1, far: 200, position: [0, 7.5, 14] }}
      style={{ width: "100%", height: "100%" }}
      gl={{ antialias: true, alpha: false }}
    >
      <Scene laneRef={laneRef} onScore={onScore} onGameOver={onGameOver} onSpeed={onSpeed} onCoins={onCoins} jumpRef={jumpRef} />
    </Canvas>
  );
}

// ─── Speed + Coin HUD ─────────────────────────────────────────────────────────
export function SpeedHUD({ speed, coins }: { speed: number; coins: number }) {
  const bars = 10;
  const filled = Math.round((speed / 100) * bars);
  const speedColor =
    speed < 30 ? "#00f5ff" : speed < 60 ? "#a78bfa" : speed < 85 ? "#f59e0b" : "#ff1a4d";

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 14,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      {/* Speed gauge */}
      <div
        style={{
          background: "rgba(3,1,18,0.82)",
          border: `1px solid ${speedColor}44`,
          borderRadius: 10,
          padding: "6px 10px",
          backdropFilter: "blur(6px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 4,
          minWidth: 88,
        }}
      >
        <span
          style={{
            fontFamily: "Manrope, sans-serif",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: speedColor,
            textTransform: "uppercase",
          }}
        >
          Speed
        </span>
        <div style={{ display: "flex", gap: 3 }}>
          {Array.from({ length: bars }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 5,
                height: 14,
                borderRadius: 2,
                background: i < filled ? speedColor : "rgba(255,255,255,0.1)",
                boxShadow: i < filled ? `0 0 4px ${speedColor}` : "none",
                transition: "background 0.15s",
              }}
            />
          ))}
        </div>
        <span
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 18,
            fontWeight: 900,
            color: speedColor,
            lineHeight: 1,
            textShadow: `0 0 8px ${speedColor}`,
          }}
        >
          {speed}
          <span style={{ fontFamily: "Manrope, sans-serif", fontSize: 9, fontWeight: 600, marginLeft: 2 }}>km/h</span>
        </span>
      </div>

      {/* Coin counter */}
      <div
        style={{
          background: "rgba(3,1,18,0.82)",
          border: "1px solid #f59e0b44",
          borderRadius: 10,
          padding: "6px 10px",
          backdropFilter: "blur(6px)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          minWidth: 88,
          justifyContent: "flex-end",
        }}
      >
        {/* Coin icon */}
        <span style={{ fontSize: 16, lineHeight: 1 }}>🪙</span>
        <span
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 20,
            fontWeight: 900,
            color: "#fbbf24",
            lineHeight: 1,
            textShadow: "0 0 8px #f59e0b",
          }}
        >
          {coins}
        </span>
      </div>
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

// ─── Console frame (HUD shell + touch controls) ───────────────────────────────
interface ConsoleFrameProps {
  children: React.ReactNode;
  onLeft: () => void;
  onRight: () => void;
  onJump: () => void;
  phase: string;
  speed: number;
  coins: number;
  score?: number;
  highScore?: number;
}

export function ConsoleFrame({ children, onLeft, onRight, onJump, phase, speed, coins }: ConsoleFrameProps) {
  const playing = phase === "playing";
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#030112" }}>
      {children}

      {playing && <SpeedHUD speed={speed} coins={coins} />}

      {/* Touch controls — only shown while playing */}
      {playing && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px 16px",
            pointerEvents: "none",
          }}
        >
          {/* Left button */}
          <button
            onPointerDown={(e) => { e.preventDefault(); onLeft(); }}
            style={{
              pointerEvents: "all",
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: "rgba(0,245,255,0.12)",
              border: "2px solid rgba(0,245,255,0.4)",
              color: "#00f5ff",
              fontSize: 28,
              cursor: "pointer",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              touchAction: "none",
            }}
          >
            ◀
          </button>

          {/* Jump button */}
          <button
            onPointerDown={(e) => { e.preventDefault(); onJump(); }}
            style={{
              pointerEvents: "all",
              width: 88,
              height: 88,
              borderRadius: "50%",
              background: "rgba(124,58,237,0.18)",
              border: "2px solid rgba(124,58,237,0.5)",
              color: "#a78bfa",
              fontSize: 32,
              cursor: "pointer",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              touchAction: "none",
            }}
          >
            ▲
          </button>

          {/* Right button */}
          <button
            onPointerDown={(e) => { e.preventDefault(); onRight(); }}
            style={{
              pointerEvents: "all",
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: "rgba(0,245,255,0.12)",
              border: "2px solid rgba(0,245,255,0.4)",
              color: "#00f5ff",
              fontSize: 28,
              cursor: "pointer",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              touchAction: "none",
            }}
          >
            ▶
          </button>
        </div>
      )}
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
        gap: 24,
        zIndex: 10,
      }}
    >
      <h1
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: "clamp(2.2rem, 7vw, 4rem)",
          fontWeight: 900,
          color: "#00f5ff",
          textShadow: "0 0 30px #00f5ff, 0 0 60px #7c3aed",
          margin: 0,
          letterSpacing: "-0.02em",
          textAlign: "center",
        }}
      >
        ENDLESS
        <br />
        <span style={{ color: "#a78bfa" }}>HIGHWAY</span>
      </h1>
      <p
        style={{
          fontFamily: "Manrope, sans-serif",
          color: "rgba(167,139,250,0.8)",
          fontSize: "clamp(0.85rem, 2.5vw, 1rem)",
          textAlign: "center",
          maxWidth: 280,
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        Dodge obstacles · Collect coins · Survive gaps
        <br />
        <span style={{ opacity: 0.6, fontSize: "0.85em" }}>← → to switch lanes · ↑ / Space to jump</span>
      </p>
      <button
        onClick={onStart}
        style={{
          fontFamily: "Manrope, sans-serif",
          fontWeight: 800,
          fontSize: "1.1rem",
          padding: "14px 44px",
          borderRadius: 50,
          background: "linear-gradient(135deg, #7c3aed, #00f5ff)",
          border: "none",
          color: "#fff",
          cursor: "pointer",
          letterSpacing: "0.06em",
          boxShadow: "0 0 24px #7c3aed88, 0 0 48px #00f5ff44",
          minHeight: 52,
        }}
      >
        START RACE
      </button>
    </div>
  );
}

// ─── Game-over overlay ────────────────────────────────────────────────────────
export function GameOverOverlay({ score, highScore, onRestart }: { score: number; highScore: number; onRestart: () => void }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        zIndex: 10,
      }}
    >
      <h2
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: "clamp(2rem, 6vw, 3.2rem)",
          fontWeight: 900,
          color: "#ff1a4d",
          textShadow: "0 0 20px #ff1a4d",
          margin: 0,
        }}
      >
        GAME OVER
      </h2>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <span
          style={{
            fontFamily: "Manrope, sans-serif",
            color: "rgba(167,139,250,0.7)",
            fontSize: "0.9rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Score
        </span>
        <span
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: "clamp(2.5rem, 8vw, 4rem)",
            fontWeight: 900,
            color: "#00f5ff",
            textShadow: "0 0 16px #00f5ff",
            lineHeight: 1,
          }}
        >
          {score.toLocaleString()}
        </span>
        {score >= highScore && score > 0 && (
          <span
            style={{
              fontFamily: "Manrope, sans-serif",
              color: "#fbbf24",
              fontSize: "0.85rem",
              fontWeight: 700,
              textShadow: "0 0 8px #f59e0b",
            }}
          >
            ★ NEW BEST!
          </span>
        )}
        <span
          style={{
            fontFamily: "Manrope, sans-serif",
            color: "rgba(167,139,250,0.55)",
            fontSize: "0.8rem",
          }}
        >
          Best: {highScore.toLocaleString()}
        </span>
      </div>
      <button
        onClick={onRestart}
        style={{
          fontFamily: "Manrope, sans-serif",
          fontWeight: 800,
          fontSize: "1rem",
          padding: "12px 38px",
          borderRadius: 50,
          background: "linear-gradient(135deg, #7c3aed, #00f5ff)",
          border: "none",
          color: "#fff",
          cursor: "pointer",
          letterSpacing: "0.06em",
          boxShadow: "0 0 20px #7c3aed66",
          minHeight: 48,
        }}
      >
        TRY AGAIN
      </button>
    </div>
  );
}
