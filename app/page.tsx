"use client";

/**
 * The console shell: it owns the game state and the controller, hands the canvas
 * a reference to both, and re-renders the panels about ten times a second.
 *
 * Nothing here plays the game. Start/Pause/Restart, the player switch and the
 * keyboard (manual mode only) are the whole of the input. The layout is fixed to
 * the viewport: a 52px header, then two columns that scroll inside themselves —
 * so the page never grows a scrollbar of its own, and the maze never scrolls at
 * all.
 */

import { ArrowCounterClockwise, Info, Pause, Play } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { DecisionConsole } from "@/components/DecisionConsole";
import { GameControls } from "@/components/GameControls";
import { GameMeters } from "@/components/GameMeters";
import { HelpDialog } from "@/components/HelpDialog";
import { PacmanCanvas } from "@/components/PacmanCanvas";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Panel, PanelActions, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AgentController } from "@/lib/agent/controller";
import { createHeuristicProvider, createRandomProvider } from "@/lib/agent/providers";
import { computeMetrics, recentFeed } from "@/lib/agent/telemetry";
import type { DecisionProvider } from "@/lib/agent/types";
import { SOUND_STORAGE_KEY, SoundBoard } from "@/lib/audio/sfx";
import { createGame, pauseGame, requestDirection, resumeGame, startGame } from "@/lib/game/engine";
import type { Direction, GameEvent, GameState } from "@/lib/game/types";
import { createJevProvider } from "@/lib/jev/client";
import {
  GAME_STATUS_TONE,
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

  /** A compass key in manual mode is a steering wheel, not an inspection. */
  const handleSteer = (direction: Direction) => {
    const state = stateRef.current;
    if (!state || mode !== "MANUAL" || state.status !== "PLAYING") return;
    requestDirection(state, direction);
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

  if (!ui) return <div className="app-shell" />;

  const running = ui.status === "PLAYING";
  const playLabel = running ? "暂停" : ui.status === "PAUSED" ? "继续" : "开始";
  const PlayIcon = running ? Pause : Play;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#stage">
        跳到游戏区域
      </a>

      <TooltipProvider delayDuration={180} skipDelayDuration={400}>
        <header className="flex h-[52px] shrink-0 items-center justify-between gap-4 border-b border-subtle px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="size-[22px] shrink-0 rounded-full bg-pacman [clip-path:polygon(100%_24%,52%_50%,100%_76%,100%_100%,0_100%,0_0,100%_0)]"
            />
            <div className="flex min-w-0 flex-col">
              <h1 className="anim-flicker m-0 text-title font-[590] tracking-[-0.011em] text-fg">
                Jev 玩吃豆人
              </h1>
              <p className="m-0 truncate text-micro text-fg-3">
                TypeSafe System One · 输入结构化状态，输出一个合法方向 · 无需微调，不看截图
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {neon ? (
              <Chip tone="busy" dot role="status">
                霓虹模式
              </Chip>
            ) : null}
            <Chip tone={GAME_STATUS_TONE[ui.status]} dot role="status">
              {STATUS_LABELS[ui.status]}
            </Chip>
            <Chip>
              种子 <span className="num">{seed}</span>
            </Chip>
            <Chip>
              时长 <span className="num">{formatMs(ui.playTimeMs)}</span>
            </Chip>
            <Button
              variant="primary"
              onClick={handleStartPause}
              disabled={ui.status === "GAME_OVER"}
              className="gap-1.5"
              title={
                running ? "暂停游戏" : ui.status === "PAUSED" ? "继续游戏" : "让当前玩家开始游玩"
              }
            >
              <PlayIcon aria-hidden="true" weight="fill" className="size-3.5" />
              {playLabel}
            </Button>
            {ui.status === "GAME_OVER" ? (
              <Button
                onClick={() => restart(seed, mode)}
                className="gap-1.5"
                title="用当前种子和玩家重新开一局"
              >
                <ArrowCounterClockwise aria-hidden="true" weight="bold" className="size-3.5" />
                重开
              </Button>
            ) : null}
          </div>
        </header>

        <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 min-[900px]:grid-cols-[minmax(0,1.2fr)_minmax(430px,0.95fr)] min-[900px]:overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-col gap-4">
            <Panel id="stage" aria-labelledby="maze-heading" className="min-h-0 flex-1">
              <PanelHeader>
                <PanelTitle id="maze-heading">迷宫</PanelTitle>
                <PanelActions>
                  <Chip
                    tone={mode !== "MANUAL" && running ? "live" : "neutral"}
                    dot
                  >
                    {mode === "MANUAL" ? "方向键驾驶" : `玩家 ${MODE_LABELS[mode]}`}
                  </Chip>
                  <HelpDialog>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="玩法与颜色说明"
                      title="决策是怎么产生的，以及迷宫里的颜色各自代表什么"
                    >
                      <Info aria-hidden="true" weight="bold" className="size-3.5" />
                    </Button>
                  </HelpDialog>
                </PanelActions>
              </PanelHeader>

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

              <GameMeters ui={ui} />
            </Panel>

            <Panel aria-label="操作面板">
              <GameControls
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
                onRestart={() => restart(seed, mode)}
                onExport={handleExport}
              />
            </Panel>
          </div>

          <DecisionConsole
            ui={ui}
            steerable={mode === "MANUAL"}
            debug={debug}
            onSteer={handleSteer}
          />
        </main>
      </TooltipProvider>
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
