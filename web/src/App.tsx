import { useRef, useState } from "react";
import { GameShell, GameTopbar, GameOverScreen } from "@freegamestore/games";
import { Game } from "./components/Game";
import { useHighScore } from "./hooks/useHighScore";
import { ROUND_SECONDS } from "./lib/logic";
import type { GamePhase } from "./types";

export default function App() {
  const [phase, setPhase] = useState<GamePhase>("menu");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  // Bumping `round` remounts <Game> so each play starts from a clean state.
  const [round, setRound] = useState(0);
  const [highScore, setHighScore] = useHighScore("APPNAME-highscore");

  // The final score is read from a ref at game-over so it isn't stale in the
  // callback closure (score state updates asynchronously during play).
  const scoreRef = useRef(0);
  const handleScore = (s: number) => { scoreRef.current = s; setScore(s); };

  const start = () => {
    scoreRef.current = 0;
    setScore(0);
    setTimeLeft(ROUND_SECONDS);
    setRound((r) => r + 1);
    setPhase("playing");
  };

  const end = () => {
    setHighScore(scoreRef.current);
    setPhase("over");
  };

  return (
    <GameShell
      topbar={
        <GameTopbar
          title="APPNAME"
          stats={[
            { label: "Score", value: score, accent: true },
            { label: "Time", value: `${timeLeft}s` },
            { label: "Best", value: highScore },
          ]}
        />
      }
    >
      <div className="relative w-full h-full min-h-[400px]">
        {phase !== "menu" && (
          <Game key={round} onScore={handleScore} onTime={setTimeLeft} onGameOver={end} />
        )}

        {phase === "menu" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center gap-5 px-6" style={{ background: "#0f172a" }}>
            <h1 className="text-3xl font-bold" style={{ color: "#f8fafc" }}>APPNAME</h1>
            <p className="max-w-sm" style={{ color: "#94a3b8" }}>
              Move with <b>WASD / arrow keys</b> (or the on-screen pad on mobile).
              Grab as many orbs as you can before the clock runs out.
            </p>
            <button
              onClick={start}
              className="font-semibold rounded-xl"
              style={{ minHeight: 48, padding: "0 2rem", background: "#22d3ee", color: "#083344", border: "none", cursor: "pointer", fontSize: "1.05rem" }}
            >
              Play
            </button>
            {highScore > 0 && <p className="text-sm" style={{ color: "#64748b" }}>Best: {highScore}</p>}
          </div>
        )}

        {phase === "over" && (
          <GameOverScreen score={score} highScore={highScore} onPlayAgain={start} />
        )}
      </div>
    </GameShell>
  );
}
