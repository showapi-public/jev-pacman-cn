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
import { SOUND_STORAGE_KEY, SoundBoard } from "@/lib/audio/sfx";
import {
  DIRECTION_LABELS,
  KEY_DIRECTIONS,
  MODE_LABELS,
  STATUS_LABELS,
  describeEvent,
  formatMs,
  type PlayMode,
  type UiSnapshot,
} from "@/lib/ui";

const INITIAL_SEED = 42;
const EVENT_LOG_SIZE = 6;
const CRT_STORAGE_KEY = "jev-pacman:crt";
const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

const STATUS_TONE: Record<string, "live" | "busy" | "warn" | undefined> = {
  PLAYING: "live",
  PAUSED: "busy",
  READY: "warn",
  GAME_OVER: "warn",
};

const GHOST_LEGEND = [
  { piece: "blinky", name: "Blinky" },
  { piece: "pinky", name: "Pinky" },
  { piece: "inky", name: "Inky" },
  { piece: "clyde", name: "Clyde" },
  { piece: "frightened", name: "受惊幽灵" },
] as const;

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

  /*
   * Cabinet state. Sound starts on and is remembered; the switches below are the
   * consent — nothing plays before the player presses Start.
   */
  const soundRef = useRef<SoundBoard | null>(null);
  if (!soundRef.current) {
    // The board starts unmuted but stays silent until a gesture unlocks it, and
    // the stored preference is applied on mount (below).
    soundRef.current = new SoundBoard({ muted: false });
  }
  const [soundOn, setSoundOn] = useState(true);
  const [crtOn, setCrtOn] = useState(true);
  const [neon, setNeon] = useState(false);

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
    if (window.localStorage.getItem(SOUND_STORAGE_KEY) === "off") {
      setSoundOn(false);
      soundRef.current?.setMuted(true);
    }
    if (window.localStorage.getItem(CRT_STORAGE_KEY) === "off") setCrtOn(false);
    publish();
  }, [publish]);

  // The cabinet's easter egg: the old code, honoured. It changes nothing about
  // how Pac-Man or Jev play — only the colours of the maze.
  useEffect(() => {
    let index = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key === KONAMI[index]) index += 1;
      else index = key === KONAMI[0] ? 1 : 0;

      if (index === KONAMI.length) {
        index = 0;
        setNeon((current) => {
          const next = !current;
          soundRef.current?.unlock();
          if (next) soundRef.current?.play("level");
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
    else {
      // The click that starts the game is also what unlocks the audio context.
      soundRef.current?.unlock();
      if (soundOn) soundRef.current?.play("start");
      startGame(state);
    }
    publish();
  };

  const handleToggleSound = () => {
    setSoundOn((current) => {
      const next = !current;
      soundRef.current?.setMuted(!next);
      if (next) soundRef.current?.unlock();
      window.localStorage.setItem(SOUND_STORAGE_KEY, next ? "on" : "off");
      return next;
    });
  };

  const handleToggleCrt = () => {
    setCrtOn((current) => {
      const next = !current;
      window.localStorage.setItem(CRT_STORAGE_KEY, next ? "on" : "off");
      return next;
    });
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
  const pending = snapshot.telemetry.find((record) => record.status === "PENDING") ?? null;

  return (
    <div className="page">
      <a className="skip-link" href="#stage">
        跳到游戏区域
      </a>

      <header className="header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div className="brand-text">
            <h1 className="brand-name">Jev 玩吃豆人</h1>
            <p className="brand-sub">
              TypeSafe System One · 输入结构化状态，输出一个合法方向 · 无需微调，不看截图
            </p>
          </div>
        </div>

        <div className="header-right">
          {neon ? (
            <span className="chip" data-tone="busy" role="status">
              <span className="dot" aria-hidden="true" />
              霓虹模式
            </span>
          ) : null}
          <span className="chip" data-tone={STATUS_TONE[ui.status]}>
            <span className="dot" aria-hidden="true" />
            {STATUS_LABELS[ui.status]}
          </span>
          <span className="chip">
            种子 <span className="mono">{seed}</span>
          </span>
          <span className="chip">
            游戏时长 <span className="mono">{formatMs(ui.playTimeMs)}</span>
          </span>
        </div>
      </header>

      <main className="layout">
        <div className="stack">
          <section className="panel" id="stage" aria-labelledby="maze-heading">
            <div className="panel-head">
              <h2 className="panel-title" id="maze-heading">
                迷宫
              </h2>
              <span
                className="chip"
                data-tone={mode !== "MANUAL" && ui.status === "PLAYING" ? "live" : undefined}
              >
                <span className="dot" aria-hidden="true" />
                {mode === "MANUAL" ? "方向键" : `玩家 ${MODE_LABELS[mode]}`}
              </span>
              <button
                type="button"
                className="btn"
                data-variant="primary"
                data-size="sm"
                onClick={handleStartPause}
                title={
                  ui.status === "PLAYING"
                    ? "暂停游戏"
                    : ui.status === "PAUSED"
                      ? "继续游戏"
                      : "让 Jev 开始游玩"
                }
              >
                {ui.status === "PLAYING" ? "暂停" : ui.status === "PAUSED" ? "继续" : "开始"}
              </button>
            </div>
            <PacmanCanvas
              stateRef={stateRef}
              controllerRef={controllerRef}
              mode={mode}
              speed={speed}
              debug={debug}
              neon={neon}
              crt={crtOn}
              sound={soundRef.current}
              attract={ui.status === "READY"}
              onSnapshot={publish}
              onEvents={onEvents}
            />
            <div className="stage-legend">
              <ul className="legend">
                <li className="legend-item">
                  <span className="legend-swatch" data-piece="pacman" aria-hidden="true" />
                  吃豆人
                </li>
                {GHOST_LEGEND.map((ghost) => (
                  <li className="legend-item" key={ghost.piece}>
                    <span className="legend-swatch" data-piece={ghost.piece} aria-hidden="true" />
                    {ghost.name}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="panel" aria-label="游戏总览">
            <GameHud ui={ui} />
          </section>

          <section className="panel" aria-label="操作面板">
            <div className="panel-body tight">
              <Controls
                mode={mode}
                speed={speed}
                seed={seed}
                debug={debug}
                soundOn={soundOn}
                crtOn={crtOn}
                status={ui.status}
                onMode={handleMode}
                onSpeed={setSpeed}
                onSeed={handleSeed}
                onToggleDebug={handleToggleDebug}
                onToggleSound={handleToggleSound}
                onToggleCrt={handleToggleCrt}
                onStartPause={handleStartPause}
                onRestart={() => restart(seed, mode)}
                onExport={handleExport}
              />
            </div>
          </section>

          {debug ? (
            <section className="panel" aria-labelledby="debug-heading">
              <div className="panel-head">
                <h2 className="panel-title" id="debug-heading">
                  调试
                </h2>
                <span className="label">?debug=1</span>
              </div>
              <div className="panel-body">
                <dl className="debug-list">
                  <dt className="label">目标路口</dt>
                  <dd className="mono">
                    {snapshot.target
                      ? `(${snapshot.target.junction.x}, ${snapshot.target.junction.y}) · 合法方向 ${snapshot.target.legalDirections.map((direction) => DIRECTION_LABELS[direction]).join(" ")} · 还差 ${snapshot.target.tilesAway.toFixed(2)} 格`
                      : "无"}
                  </dd>
                  <dt className="label">待处理请求</dt>
                  <dd className="mono">
                    {pending ? `${pending.decisionId} (${snapshot.status})` : "无"}
                  </dd>
                  <dt className="label">最近决策</dt>
                  <dd className="mono">
                    {snapshot.recentDecisions.length === 0
                      ? "无"
                      : snapshot.recentDecisions
                          .map((record) => `(${record.junction.x},${record.junction.y}) ${DIRECTION_LABELS[record.chosen]}`)
                          .join(" → ")}
                  </dd>
                  <dt className="label">世代</dt>
                  <dd className="mono">
                    {snapshot.epoch} · 格子覆盖层 {snapshot.target ? "开" : "关"}
                  </dd>
                </dl>

                <ol className="event-log" aria-label="最近游戏事件">
                  {ui.events.length === 0 ? (
                    <li className="event-log-row">暂无游戏事件。</li>
                  ) : (
                    ui.events.map((line, index) => (
                      <li className="event-log-row" key={`${line}-${index}`}>
                        {line}
                      </li>
                    ))
                  )}
                </ol>
              </div>
            </section>
          ) : null}
        </div>

        <div className="stack">
          <section className="panel" aria-labelledby="decision-tab">
            <div className="panel-head">
              <div className="tabs" role="tablist" aria-label="决策视图">
                <button
                  type="button"
                  className="tab"
                  role="tab"
                  id="decision-tab"
                  aria-selected={tab === "DECISION"}
                  aria-controls="decision-panel"
                  onClick={() => setTab("DECISION")}
                >
                  决策
                </button>
                <button
                  type="button"
                  className="tab"
                  role="tab"
                  id="state-tab"
                  aria-selected={tab === "STATE"}
                  aria-controls="state-panel"
                  onClick={() => setTab("STATE")}
                >
                  状态
                </button>
              </div>
              <span className="label">{snapshot.lastObservation ? "实时" : "空闲"}</span>
            </div>

            {tab === "DECISION" ? (
              <div role="tabpanel" id="decision-panel" aria-labelledby="decision-tab">
                <DecisionPanel snapshot={snapshot} decision={latest} />
              </div>
            ) : (
              <div role="tabpanel" id="state-panel" aria-labelledby="state-tab">
                <pre className="state-json" aria-label="发送给 Jev 的原始状态">
                  {snapshot.lastObservation
                    ? JSON.stringify(snapshot.lastObservation, null, 2)
                    : "点击「开始」——第一个观测数据会在到达第一个路口前三格时发出。"}
                </pre>
              </div>
            )}
          </section>

          <section className="panel" aria-labelledby="feed-tab">
            <div className="panel-head">
              <div className="tabs" role="tablist" aria-label="本局视图">
                <button
                  type="button"
                  className="tab"
                  role="tab"
                  id="feed-tab"
                  aria-selected={sideTab === "FEED"}
                  aria-controls="feed-panel"
                  onClick={() => setSideTab("FEED")}
                >
                  决策记录
                </button>
                <button
                  type="button"
                  className="tab"
                  role="tab"
                  id="metrics-tab"
                  aria-selected={sideTab === "METRICS"}
                  aria-controls="metrics-panel"
                  onClick={() => setSideTab("METRICS")}
                >
                  指标
                </button>
              </div>
              <span className="label">{snapshot.telemetry.length} 条记录</span>
            </div>
            <div role="tabpanel" id={sideTab === "FEED" ? "feed-panel" : "metrics-panel"} aria-labelledby={sideTab === "FEED" ? "feed-tab" : "metrics-tab"}>
              {sideTab === "FEED" ? <DecisionFeed feed={ui.feed} /> : <MetricsPanel metrics={ui.metrics} />}
            </div>
          </section>
        </div>
      </main>

      <footer className="footer-note">
        <p>
          吃豆人以固定 60 Hz 移动。每到路口，系统会在吃豆人抵达前三格向 Jev 提问一次，而且只问它
          合法可走的方向。迟到的回答会被丢弃，任何不是 Jev 给出的选择都会在记录里标记为{" "}
          <code>FALLBACK</code>。
        </p>
        <p>
          {mode === "MANUAL"
            ? "当前为手动模式：使用方向键操作。"
            : `当前玩家：${MODE_LABELS[mode]}。加上 ?debug=1 可查看格子坐标与待处理请求。`}
        </p>
      </footer>
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
