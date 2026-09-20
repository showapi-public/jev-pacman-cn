"use client";

/**
 * The page shell: it owns the game state and the controller, hands the canvas a
 * reference to both, and re-renders the panels about ten times a second.
 *
 * Nothing here plays the game. Start/Pause/Restart, the mode switch and the
 * keyboard (manual mode only) are the whole of the input.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { Controls } from "@/components/Controls";
import { DecisionFeed } from "@/components/DecisionFeed";
import { DecisionPanel } from "@/components/DecisionPanel";
import { GameHud } from "@/components/GameHud";
import { MetricsPanel } from "@/components/MetricsPanel";
import { PacmanCanvas } from "@/components/PacmanCanvas";
import { AgentController } from "@/lib/agent/controller";
import { createHeuristicProvider, createRandomProvider } from "@/lib/agent/providers";
import { computeMetrics, recentFeed } from "@/lib/agent/telemetry";
import type { DecisionProvider } from "@/lib/agent/types";
import { createGame, pauseGame, requestDirection, resumeGame, startGame } from "@/lib/game/engine";
import type { GameEvent, GameState } from "@/lib/game/types";
import { createJevProvider } from "@/lib/jev/client";
import {
  KEY_DIRECTIONS,
  describeEvent,
  formatMs,
  type PlayMode,
  type UiSnapshot,
} from "@/lib/ui";

const INITIAL_SEED = 42;
const EVENT_LOG_SIZE = 6;

export default function Page() {
  const providersRef = useRef<Record<PlayMode, DecisionProvider | null> | null>(null);
  if (!providersRef.current) {
    providersRef.current = {
      JEV: createJevProvider(),
      MANUAL: null,
      RANDOM: createRandomProvider(INITIAL_SEED),
      HEURISTIC: createHeuristicProvider(),
    };
  }
  const providers = providersRef.current;

  const stateRef = useRef<GameState | null>(null);
  if (!stateRef.current) stateRef.current = createGame({ seed: INITIAL_SEED });

  const controllerRef = useRef<AgentController | null>(null);
  if (!controllerRef.current) controllerRef.current = new AgentController({ provider: providers.JEV });

  const eventsRef = useRef<string[]>([]);
  const [ui, setUi] = useState<UiSnapshot | null>(() =>
    buildSnapshot(stateRef.current as GameState, controllerRef.current as AgentController, []),
  );
  const [mode, setMode] = useState<PlayMode>("JEV");
  const [speed, setSpeed] = useState(0.5);
  const [seed, setSeed] = useState(INITIAL_SEED);
  const [debug, setDebug] = useState(false);
  const [tab, setTab] = useState<"DECISION" | "STATE">("DECISION");
  const [sideTab, setSideTab] = useState<"FEED" | "METRICS">("FEED");

  const publish = useCallback(() => {
    const state = stateRef.current;
    const controller = controllerRef.current;
    if (!state || !controller) return;
    setUi(buildSnapshot(state, controller, eventsRef.current));
  }, []);

  const onEvents = useCallback((events: GameEvent[]) => {
    const lines = events.map(describeEvent);
    eventsRef.current = [...lines.reverse(), ...eventsRef.current].slice(0, EVENT_LOG_SIZE);
  }, []);

  const restart = useCallback(
    (nextSeed: number, nextMode: PlayMode) => {
      const controller = controllerRef.current;
      if (!controller) return;
      controller.reset();
      controller.setProvider(providers[nextMode]);
      const state = createGame({ seed: nextSeed });
      stateRef.current = state;
      eventsRef.current = [];
      startGame(state);
      publish();
    },
    [providers, publish],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("debug") === "1") setDebug(true);
    publish();
  }, [publish]);

  useEffect(() => {
    if (mode !== "MANUAL") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const state = stateRef.current;
      const direction = KEY_DIRECTIONS[event.key];
      if (!state || !direction || state.status !== "PLAYING") return;
      event.preventDefault();
      requestDirection(state, direction);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode]);

  const handleStartPause = () => {
    const state = stateRef.current;
    if (!state) return;
    if (state.status === "PLAYING") pauseGame(state);
    else if (state.status === "PAUSED") resumeGame(state);
    else startGame(state);
    publish();
  };

  const handleMode = (next: PlayMode) => {
    setMode(next);
    restart(seed, next);
  };

  const handleSeed = (next: number) => {
    setSeed(next);
    restart(next, mode);
  };

  const handleToggleDebug = () => {
    setDebug((current) => {
      const next = !current;
      const url = new URL(window.location.href);
      url.searchParams.set("debug", next ? "1" : "0");
      window.history.replaceState({}, "", url);
      return next;
    });
  };

  const handleExport = () => {
    const state = stateRef.current;
    const controller = controllerRef.current;
    if (!state || !controller) return;
    const snapshot = controller.snapshot();
    const payload = {
      exportedAt: new Date().toISOString(),
      mode,
      seed,
      summary: computeMetrics(snapshot.telemetry, state),
      game: {
        score: state.score,
        lives: state.lives,
        level: state.level,
        pelletsEaten: state.pelletsEaten,
        ghostsEaten: state.ghostsEaten,
        playTimeMs: state.playTimeMs,
      },
      decisions: snapshot.telemetry,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `jev-pacman-${mode.toLowerCase()}-seed${seed}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (!ui) return <div className="page" />;

  const snapshot = ui.controller;
  const latest = ui.feed[0] ?? null;

  return (
    <div className="page">
      <header className="header">
        <div className="brand">
          <span className="brand-mark" />
          <div>
            <div className="brand-name">Jev plays Pac-Man</div>
            <div className="brand-sub">
              TypeSafe System One · structured state in, one legal direction out · no fine-tuning, no screenshots
            </div>
          </div>
        </div>

        <div className="header-right">
          <span className="chip" data-tone={ui.status === "PLAYING" ? "live" : ui.status === "PAUSED" ? "warn" : undefined}>
            <span className="dot" />
            {ui.status.toLowerCase().replace("_", " ")}
          </span>
          <span className="chip">seed {seed}</span>
          <span className="chip">play time {formatMs(ui.playTimeMs)}</span>
        </div>
      </header>

      <div className="layout">
        <div className="stack">
          <div className="panel">
            <div className="panel-head">
              <span>Game</span>
              <span className="chip" data-tone={mode === "MANUAL" ? undefined : "live"}>
                <span className="dot" />
                {mode === "MANUAL" ? "arrow keys" : mode.toLowerCase()}
              </span>
            </div>
            <PacmanCanvas
              stateRef={stateRef}
              controllerRef={controllerRef}
              mode={mode}
              speed={speed}
              debug={debug}
              onSnapshot={publish}
              onEvents={onEvents}
            />
          </div>

          <div className="panel">
            <GameHud ui={ui} />
          </div>

          <div className="panel">
            <div className="panel-body tight">
              <Controls
                mode={mode}
                speed={speed}
                seed={seed}
                debug={debug}
                status={ui.status}
                onMode={handleMode}
                onSpeed={setSpeed}
                onSeed={handleSeed}
                onToggleDebug={handleToggleDebug}
                onStartPause={handleStartPause}
                onRestart={() => restart(seed, mode)}
                onExport={handleExport}
              />
            </div>
          </div>

          {debug ? (
            <div className="panel">
              <div className="panel-head">
                <span>Debug</span>
                <span className="muted" style={{ fontSize: 10.5 }}>?debug=1</span>
              </div>
              <div className="panel-body">
                <div className="event-log">
                  <div>
                    target junction{" "}
                    {snapshot.target
                      ? `(${snapshot.target.junction.x}, ${snapshot.target.junction.y}) · legal ${snapshot.target.legalDirections.join(" ")} · ${snapshot.target.tilesAway.toFixed(2)} tiles away`
                      : "none"}
                  </div>
                  <div>
                    pending request{" "}
                    {snapshot.telemetry.find((record) => record.status === "PENDING")
                      ? `${snapshot.telemetry.find((record) => record.status === "PENDING")?.decisionId} (${snapshot.status})`
                      : "none"}
                  </div>
                  <div>
                    recent decisions{" "}
                    {snapshot.recentDecisions.length === 0
                      ? "none"
                      : snapshot.recentDecisions
                          .map((record) => `(${record.junction.x},${record.junction.y}) ${record.chosen}`)
                          .join(" → ")}
                  </div>
                  <div>epoch {snapshot.epoch} · tile {snapshot.target ? "overlay on canvas" : "—"}</div>
                </div>
                <div className="event-log" style={{ marginTop: 10, maxHeight: 140 }}>
                  {ui.events.length === 0 ? <div>no events yet</div> : ui.events.map((line, index) => <div key={`${line}-${index}`}>{line}</div>)}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-head">
              <div className="tabs">
                <button type="button" className="tab" data-active={tab === "DECISION"} onClick={() => setTab("DECISION")}>
                  Decision
                </button>
                <button type="button" className="tab" data-active={tab === "STATE"} onClick={() => setTab("STATE")}>
                  State
                </button>
              </div>
              <span className="muted" style={{ fontSize: 10.5 }}>
                {snapshot.lastObservation ? "live" : "idle"}
              </span>
            </div>

            {tab === "DECISION" ? (
              <DecisionPanel snapshot={snapshot} decision={latest} />
            ) : (
              <pre className="state-json">
                {snapshot.lastObservation
                  ? JSON.stringify(snapshot.lastObservation, null, 2)
                  : "Nothing sent to Jev yet."}
              </pre>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <div className="tabs">
                <button type="button" className="tab" data-active={sideTab === "FEED"} onClick={() => setSideTab("FEED")}>
                  Decision feed
                </button>
                <button type="button" className="tab" data-active={sideTab === "METRICS"} onClick={() => setSideTab("METRICS")}>
                  Metrics
                </button>
              </div>
              <span className="muted" style={{ fontSize: 10.5 }}>
                {snapshot.telemetry.length} records
              </span>
            </div>
            {sideTab === "FEED" ? <DecisionFeed feed={ui.feed} /> : <MetricsPanel metrics={ui.metrics} />}
          </div>
        </div>
      </div>

      <div className="footer-note">
        Pac-Man moves at a fixed 60 Hz; Jev is asked one question per junction, three tiles before Pac-Man
        gets there, and only about the directions he may legally take. Answers that arrive late are thrown
        away, and anything that is not Jev&apos;s answer is labelled <code>FALLBACK</code> in the feed.
        {mode !== "MANUAL" ? ` Currently playing as ${mode.toLowerCase()}.` : " Manual mode: use the arrow keys."}
      </div>
    </div>
  );
}

function buildSnapshot(state: GameState, controller: AgentController, events: string[]): UiSnapshot {
  const snapshot = controller.snapshot();
  return {
    status: state.status,
    score: state.score,
    lives: state.lives,
    level: state.level,
    pelletsRemaining: state.pellets.size,
    powerPelletsRemaining: state.powerPellets.size,
    pelletsEaten: state.pelletsEaten,
    ghostsEaten: state.ghostsEaten,
    playTimeMs: state.playTimeMs,
    controller: snapshot,
    metrics: computeMetrics(snapshot.telemetry, state),
    feed: recentFeed(snapshot.telemetry, 40),
    events,
  };
}
