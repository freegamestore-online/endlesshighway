import { useRef, useState, useCallback } from "react";
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
  const [round, setRound] = useState(0);
  const [highScore, setHighScore] = useHighScore("endlesshighway_highscore");

  const scoreRef = useRef(0);
  // Shared lane ref — App owns it, passes to both Game (3D scene) and ConsoleFrame (D-pad)
  const laneRef = useRef<Lane>(1);

  const handleScore = (s: number) => {
    scoreRef.current = s;
    setScore(s);
  };

  const handleGameOver = useCallback(() => {
    setHighScore(scoreRef.current);
    setPhase("over");
  }, [setHighScore]);

  const start = useCallback(() => {
    scoreRef.current = 0;
    laneRef.current = 1;
    setScore(0);
    setRound((r) => r + 1);
    setPhase("playing");
  }, []);

  // Keyboard + D-pad controls — active whenever the component is mounted
  const { moveLeft, moveRight } = useLaneControls(laneRef);

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
          score={score}
          highScore={highScore}
        >
          {/* 3D game canvas */}
          {phase === "playing" && (
            <Game
              key={round}
              laneRef={laneRef}
              onScore={handleScore}
              onGameOver={handleGameOver}
            />
          )}

          {/* Dark BG for non-playing states */}
          {phase !== "playing" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "radial-gradient(ellipse at 50% 40%, #0d0525 0%, #03010f 100%)",
              }}
            />
          )}

          {/* Overlays */}
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
