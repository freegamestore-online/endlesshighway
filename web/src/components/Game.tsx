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
  spawnCount,
  randomLane,
  randomTwoLanes,
  scoreFromDistance,
  BASE_SPEED,
  MAX_SPEED,
  JUMP_VELOCITY,
  GRAVITY,
  CUBE_TOP,
} from "../lib/logic";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface GameProps {
  onScore: (score: number) => void;
  onGameOver: () => void;
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

// ─── Running + jumping character ──────────────────────────────────────────────
function RunningPlayer({
  laneRef,
  speedRef,
  jumpYRef,
  isJumpingRef,
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

    // Ground bob only when not jumping
    const groundBob = isJumping ? 0 : Math.abs(Math.sin(phase)) * 0.14;
    const shakeX = Math.sin(t.current * 40) * laneChangeShake.current * 0.08;
    const shakeY = Math.abs(Math.sin(t.current * 35)) * laneChangeShake.current * 0.05;

    if (rootRef.current) {
      rootRef.current.position.x = currentX.current + shakeX;
      rootRef.current.position.y = 0.12 + groundBob + jumpY + shakeY;
      rootRef.current.position.z = PLAYER_Z;
    }

    if (leanRef.current) {
      // Lean forward more when jumping, tuck slightly at peak
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
        // Tuck legs up during jump
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
        // Arms out wide during jump
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
      // Jet blasts harder on jump
      const jumpBoost = isJumping ? 1.8 : 1;
      const pulse = (0.7 + Math.sin(t.current * 18) * 0.3 + speedT * 0.5) * jumpBoost;
      jetRef.current.scale.set(pulse, pulse, (1 + speedT * 1.5) * jumpBoost);
    }

    if (glowRef.current) {
      glowRef.current.intensity = 2.5 + Math.sin(t.current * 7) * 0.8 + speedT * 1.5 + (isJumping ? 2 : 0);
    }

    // Drop shadow on ground — shrinks and fades as player rises
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
      {/* Drop shadow blob */}
      <mesh ref={shadowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[0.45, 16]} />
        <meshStandardMaterial color="#000000" transparent opacity={0.35} depthWrite={false} />
      </mesh>

      <group ref={leanRef}>
        {/* Torso */}
        <mesh position={[0, 0.72, 0]} castShadow>
          <capsuleGeometry args={[0.18, 0.42, 8, 16]} />
          <meshStandardMaterial color={C} emissive={C} emissiveIntensity={0.9} metalness={0.3} roughness={0.1} />
        </mesh>
        {/* Chest plate */}
        <mesh position={[0, 0.82, 0.14]}>
          <boxGeometry args={[0.28, 0.22, 0.06]} />
          <meshStandardMaterial color="#ffffff" emissive={C} emissiveIntensity={1.2} metalness={0.6} roughness={0.05} />
        </mesh>

        {/* Head */}
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

        {/* Left Arm */}
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

        {/* Right Arm */}
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

        {/* Left Leg */}
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

        {/* Right Leg */}
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

        {/* Jet exhaust */}
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

        {/* Equator ring */}
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

// ─── Camera with dynamic FOV ──────────────────────────────────────────────────
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
function Scene({ laneRef, onScore, onGameOver, jumpRef }: GameProps) {
  const obstacles = useRef<Obstacle[]>([]);
  const nextId = useRef(0);
  const elapsed = useRef(0);
  const spawnTimer = useRef(0);
  const distance = useRef(0);
  const lastScore = useRef(-1);
  const dead = useRef(false);
  const offsetRef = useRef(0);
  const speedRef = useRef(BASE_SPEED);

  // Jump state
  const jumpY = useRef(0);       // current Y offset (feet height above ground)
  const jumpVel = useRef(0);     // current vertical velocity
  const isJumping = useRef(false);

  const [, forceRender] = useState(0);

  const cbs = useRef({ onScore, onGameOver });
  cbs.current = { onScore, onGameOver };

  // Expose jump trigger to parent
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

    const score = scoreFromDistance(distance.current);
    if (score !== lastScore.current) {
      lastScore.current = score;
      cbs.current.onScore(score);
    }

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

    const playerLane = laneRef.current ?? 1;
    const alive: Obstacle[] = [];
    let changed = false;

    for (const obs of obstacles.current) {
      obs.z += speed * dt;
      if (checkCollision(playerLane, obs.lane, obs.z, jumpY.current)) {
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
      <RunningPlayer laneRef={laneRef} speedRef={speedRef} jumpYRef={jumpY} isJumpingRef={isJumping} />
      {obstacles.current.map((obs) => (
        <ObstacleMesh key={obs.id} obstacle={obs} speedRef={speedRef} />
      ))}
      <FollowCamera laneRef={laneRef} speedRef={speedRef} />
    </>
  );
}

// ─── Canvas wrapper ───────────────────────────────────────────────────────────
export function Game({ laneRef, onScore, onGameOver, jumpRef }: GameProps) {
  return (
    <Canvas
      shadows
      camera={{ fov: 60, near: 0.1, far: 400, position: [0, 7.5, PLAYER_Z + 14] }}
      style={{ width: "100%", height: "100%" }}
      gl={{ antialias: true }}
    >
      <Scene laneRef={laneRef} onScore={onScore} onGameOver={onGameOver} jumpRef={jumpRef} />
    </Canvas>
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
        background: active ? `linear-gradient(135deg, ${color}28, ${color}10)` : `${color}08`,
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
  onJump: () => void;
  score: number;
  highScore: number;
  phase: "menu" | "playing" | "over";
}

export function ConsoleFrame({ children, onLeft, onRight, onJump, score, highScore, phase }: ConsoleFrameProps) {
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
        <div style={{ width: "100%", borderRadius: 20, background: "#000", padding: "4px", boxShadow: ["0 0 0 2px #120d2a", "0 0 0 3.5px #1e1040", "inset 0 0 40px #000000cc", "0 0 50px #7c3aed14"].join(", "), border: "1px solid #0d0a1e" }}>
          <div style={{ borderRadius: 16, overflow: "hidden", aspectRatio: "16/9", position: "relative", background: "#03010f", minHeight: 155 }}>
            <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 4px)", pointerEvents: "none", zIndex: 5 }} />
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "30%", background: "linear-gradient(180deg, rgba(255,255,255,0.025) 0%, transparent 100%)", pointerEvents: "none", zIndex: 6, borderRadius: "16px 16px 0 0" }} />
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
          {/* D-Pad: up + left/right */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            {/* Up button */}
            <DPadBtn label="▲" onPress={onJump} color="#4ade80" disabled={!buttonsActive} />
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <DPadBtn label="◀" onPress={onLeft} color="#00f5ff" disabled={!buttonsActive} />
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: "radial-gradient(circle at 40% 35%, #2d1b69, #0d0a1e)", border: "1.5px solid #3b1f7a44", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.6)" }} />
              <DPadBtn label="▶" onPress={onRight} color="#00f5ff" disabled={!buttonsActive} />
            </div>
            <div style={{ fontSize: 9, color: "#2d3748", letterSpacing: "0.12em", marginTop: 2, fontWeight: 600 }}>MOVE</div>
          </div>

          {/* Center home button */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: "radial-gradient(circle at 38% 32%, #4c1d95, #1a0a2e 70%)", border: "2px solid #6d28d944", boxShadow: "0 0 18px #7c3aed44, inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -2px 6px rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#a78bfa", textShadow: "0 0 10px #a78bfa" }}>
              ∞
            </div>
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

        {/* Bottom grip bumpers */}
        <div style={{ display: "flex", gap: 4, marginTop: 10, opacity: 0.18, alignItems: "center" }}>
          {[...Array(9)].map((_, i) => (
            <div key={i} style={{ width: 18, height: 5, borderRadius: 3, background: "linear-gradient(90deg, #4c1d95, #7c3aed)" }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Menu overlay ─────────────────────────────────────────────────────────────
export function MenuOverlay({ onStart }: { onStart: () => void }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 10, gap: 10 }}>
      <div style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 900, color: "#00f5ff", textShadow: "0 0 30px #00f5ff, 0 0 60px #00f5ff44", letterSpacing: "0.08em", textAlign: "center" }}>
        NEON∞DRIVE
      </div>
      <div style={{ fontSize: 9, color: "#a78bfa", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600 }}>
        Dodge · Jump · Survive
      </div>
      <button
        onClick={onStart}
        style={{ marginTop: 8, padding: "8px 22px", borderRadius: 8, border: "1.5px solid #00f5ff44", background: "linear-gradient(135deg, #00f5ff14, #7c3aed14)", color: "#00f5ff", fontSize: 11, fontWeight: 800, fontFamily: "Manrope, sans-serif", letterSpacing: "0.14em", cursor: "pointer", textTransform: "uppercase", boxShadow: "0 0 20px #00f5ff22", transition: "all 0.15s" }}
      >
        START
      </button>
      <div style={{ fontSize: 8, color: "#334155", letterSpacing: "0.1em", marginTop: 4, textAlign: "center" }}>
        ◀ ▶ to move · ▲ or SPACE to jump
      </div>
    </div>
  );
}

// ─── Game over overlay ────────────────────────────────────────────────────────
export function GameOverOverlay({ score, highScore, onRestart }: { score: number; highScore: number; onRestart: () => void }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 10, gap: 8, background: "rgba(3,1,15,0.75)" }}>
      <div style={{ fontFamily: "Fraunces, serif", fontSize: 18, fontWeight: 900, color: "#ff1a4d", textShadow: "0 0 20px #ff1a4d", letterSpacing: "0.1em" }}>GAME OVER</div>
      <div style={{ fontSize: 11, color: "#00f5ff", fontWeight: 800 }}>Score: {score}</div>
      {score >= highScore && score > 0 && (
        <div style={{ fontSize: 9, color: "#f59e0b", fontWeight: 700, letterSpacing: "0.12em" }}>✦ NEW BEST ✦</div>
      )}
      <div style={{ fontSize: 9, color: "#475569" }}>Best: {highScore}</div>
      <button
        onClick={onRestart}
        style={{ marginTop: 6, padding: "7px 20px", borderRadius: 8, border: "1.5px solid #00f5ff44", background: "linear-gradient(135deg, #00f5ff14, #7c3aed14)", color: "#00f5ff", fontSize: 10, fontWeight: 800, fontFamily: "Manrope, sans-serif", letterSpacing: "0.14em", cursor: "pointer", textTransform: "uppercase", boxShadow: "0 0 16px #00f5ff22" }}
      >
        TRY AGAIN
      </button>
    </div>
  );
}

// ─── Lane controls hook ───────────────────────────────────────────────────────
export function useLaneControls(laneRef: React.RefObject<Lane>) {
  const moveLeft = useCallback(() => {
    (laneRef as React.MutableRefObject<Lane>).current = Math.max(0, (laneRef.current ?? 1) - 1) as Lane;
  }, [laneRef]);

  const moveRight = useCallback(() => {
    (laneRef as React.MutableRefObject<Lane>).current = Math.min(2, (laneRef.current ?? 1) + 1) as Lane;
  }, [laneRef]);

  return { moveLeft, moveRight };
}
