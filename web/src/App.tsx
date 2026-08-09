import { useRef, useState, useCallback, useEffect } from "react";
import { GameShell, GameTopbar } from "@freegamestore/games";
import {
  Game,
  ConsoleFrame,
  MenuOverlay,
  GameOverOverlay,
  useLaneControls,
} from "./components/Game";
import { useHighScore } from "./hooks/useHighScore";
import type { GamePhase, Lane } from "./types";

export default function App() {
  const [phase, setPhase] = useState<GamePhase>("menu");
  const [score, setScore] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [round, setRound] = useState(0);
  const [highScore, setHighScore] = useHighScore("endlesshighway_highscore");

  const scoreRef = useRef(0);
  const laneRef = useRef<Lane>(1);
  const jumpRef = useRef<() => void>(() => {});

  const handleScore = useCallback((s: number) => {
    scoreRef.current = s;
    setScore(s);
  }, []);

  const handleSpeed = useCallback((s: number) => {
    setSpeed(s);
  }, []);

  const handleGameOver = useCallback(() => {
    setHighScore(scoreRef.current);
    setPhase("over");
  }, [setHighScore]);

  const start = useCallback(() => {
    scoreRef.current = 0;
    laneRef.current = 1;
    setScore(0);
    setSpeed(0);
    setRound((r) => r + 1);
    setPhase("playing");
  }, []);

  const { moveLeft, moveRight } = useLaneControls(laneRef);

  const handleJump = useCallback(() => {
    jumpRef.current();
  }, []);

  // Keyboard controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== "playing") return;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") moveLeft();
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") moveRight();
      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W" || e.key === " ") {
        e.preventDefault();
        handleJump();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, moveLeft, moveRight, handleJump]);

  return (
    <GameShell
      topbar={
        <GameTopbar
          title="Endless Highway"
          stats={[
            { label: "Score", value: score, accent: true },
            { label: "Best", value: highScore },
          ]}
        />
      }
    >
      <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
        <ConsoleFrame
          onLeft={moveLeft}
          onRight={moveRight}
          onJump={handleJump}
          score={score}
          highScore={highScore}
          phase={phase}
          speed={speed}
        >
          {phase === "playing" && (
            <Game
              key={round}
              laneRef={laneRef}
              onScore={handleScore}
              onGameOver={handleGameOver}
              onSpeed={handleSpeed}
              jumpRef={jumpRef}
            />
          )}

          {phase !== "playing" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "radial-gradient(ellipse at 50% 40%, #0d0525 0%, #03010f 100%)",
              }}
            />
          )}

          {phase === "menu" && <MenuOverlay onStart={start} />}
          {phase === "over" && (
            <GameOverOverlay
              score={score}
              highScore={highScore}
              onRestart={start}
            />
          )}
        </ConsoleFrame>
      </div>
    </GameShell>
  );
}
