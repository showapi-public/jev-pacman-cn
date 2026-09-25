"use client";

/**
 * One run of one game: the state, the controller, the cabinet switches, the
 * model in play, and the export — everything `app/page.tsx` used to own, minus
 * anything that knows which game is being played.
 *
 * The split is deliberate. This hook talks only in `GameDefinition<S>` and
 * `GameState`; it never names a direction, a pellet or a junction. The page that
 * calls it gets the raw `S` back and hands it to that game's own meters. So a
 * second game needs no change here — it needs a `GameDefinition`, and a picture
 * of whatever `S` holds.
 *
 * Three things are worth reading before changing it:
 *
 * - The **publish** path is what React sees. The engine mutates one state object
 *   in place, so a snapshot that merely held `stateRef.current` would never
 *   change identity and never re-render; `publish()` therefore wraps the live
 *   state in a fresh object each time. The panels read a moving target on
 *   purpose — 100 ms of staleness is invisible, and copying the whole state ten
 *   times a second is not free.
 * - The **speed** effect is not cosmetic. Speed scales the game clock, so the
 *   wall-clock window a decision has to arrive in shrinks with it. The controller
 *   is deliberately *not* told about it: it asks at the driver's own `prefetch`,
 *   a fixed *game-space* distance, which is precisely what makes the window
 *   `budgetMs / speed`. Scaling the trigger point here instead would pin the
 *   window to a constant and contradict the deadline line, the statistics panel
 *   and the speed tooltip all at once. See the note in `AgentController` where
 *   `setSpeed` used to live, and `docs/design-multi-game.md` §8.
 * - The **model** is a property of the run, not of the request: switching it
 *   restarts the game, because a history that mixes two models' decisions cannot
 *   be read as either one's.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { AgentController, type ControllerSnapshot } from "@/lib/agent/controller";
import { createHeuristicProvider, createRandomProvider } from "@/lib/agent/providers";
import { computeMetrics } from "@/lib/agent/telemetry";
import type { ActionId, DecisionProvider } from "@/lib/agent/types";
import { SOUND_STORAGE_KEY, SoundBoard } from "@/lib/audio/sfx";
import type { GameDefinition, GameEvent, GameState } from "@/lib/games/types";
import type { ModelCatalogue } from "@/lib/jev/models";
import { createJevProvider } from "@/lib/jev/client";
import type { PlayMode } from "@/lib/ui";

/** The seed a fresh cabinet starts on. */
const DEFAULT_SEED = 42;
/** How many event lines the console keeps. */
const EVENT_LOG_SIZE = 6;
/**
 * Cabinet preferences are global, not per game: sound and CRT are properties of
 * the machine, so one game's setting is the next game's setting.
 */
const CRT_STORAGE_KEY = "jev:crt";
/** The chosen catalogue entry. Global for the same reason, and shared with the nav page. */
const MODEL_STORAGE_KEY = "jev:model";
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

/** What the game page sees. Everything except `state` is game-independent. */
export interface GameSession<S extends GameState> {
  /** 最近一次发布的状态快照。引擎原地改它，所以它是「移动的目标」。 */
  state: S;
  /** 控制器快照。右栏与参数条共用同一份。 */
  controller: ControllerSnapshot;

  mode: PlayMode;
  speed: number;
  seed: number;
  debug: boolean;
  /** 彩蛋：色相轮转。 */
  neon: boolean;
  crtOn: boolean;
  soundOn: boolean;

  /** 模型目录；null = 还没拿到（请求在飞或失败）。 */
  catalogue: ModelCatalogue | null;
  /** 选中的条目 id；null = 用服务端默认。 */
  modelId: string | null;

  /** 最近几条人话事件（已由游戏自己说好）。 */
  events: readonly string[];
  sound: SoundBoard;

  stateRef: React.RefObject<S | null>;
  controllerRef: React.RefObject<AgentController<S> | null>;

  /** 让 React 读一次当前状态。循环每 100 ms 调一次。 */
  publish(): void;
  onEvents(events: readonly GameEvent[]): void;
  /** 开始 / 暂停 / 继续。同一个按钮。 */
  startPause(): void;
  restart(seed: number, mode: PlayMode): void;
  setMode(mode: PlayMode): void;
  setSpeed(speed: number): void;
  setSeed(seed: number): void;
  /** 换模型。会重开一局：两个模型的决策混在一份历史里读不出结论。 */
  setModel(modelId: string): void;
  toggleDebug(): void;
  toggleSound(): void;
  toggleCrt(): void;
  /** 手动模式下，从动作盘点一个动作。 */
  steer(action: ActionId): void;
  exportRun(): void;
}

export function useGameSession<S extends GameState>(
  game: GameDefinition<S>,
  options: { initialSeed?: number } = {},
): GameSession<S> {
  const initialSeed = options.initialSeed ?? DEFAULT_SEED;

  const stateRef = useRef<S | null>(null);
  if (!stateRef.current) stateRef.current = game.createState({ seed: initialSeed });

  const providersRef = useRef<Record<PlayMode, DecisionProvider | null> | null>(null);
  if (!providersRef.current) {
    providersRef.current = {
      JEV: createJevProvider(),
      MANUAL: null,
      RANDOM: createRandomProvider(initialSeed),
      // The heuristic player is game code, so the session hands it the two
      // things the agent layer cannot have: a way to read the position, and the
      // game's own chooser.
      HEURISTIC: createHeuristicProvider<S>({
        state: () => stateRef.current,
        choose: (state, actions) => game.heuristic(state, actions),
      }),
    };
  }
  const providers = providersRef.current;

  const controllerRef = useRef<AgentController<S> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new AgentController<S>({
      driver: game.agent,
      game: game.meta.id,
      provider: providers.JEV,
    });
  }
  const controller = controllerRef.current;

  const [snapshot, setSnapshot] = useState(() => ({
    state: stateRef.current as S,
    controller: controller.snapshot(),
  }));

  const [mode, setModeState] = useState<PlayMode>("JEV");
  // 1× everywhere: the budget the panels quote is only true at 1×, and it is the
  // only speed two games can be compared at. See plan §7 决策②.
  const [speed, setSpeedState] = useState(1);
  const [seed, setSeedState] = useState(initialSeed);
  const [debug, setDebugState] = useState(false);

  const [catalogue, setCatalogue] = useState<ModelCatalogue | null>(null);
  const [modelId, setModelIdState] = useState<string | null>(null);

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
  const sound = soundRef.current;
  const [soundOn, setSoundOn] = useState(true);
  const [crtOn, setCrtOn] = useState(true);
  const [neon, setNeon] = useState(false);

  const eventsRef = useRef<string[]>([]);

  const publish = useCallback(() => {
    const state = stateRef.current;
    if (!state) return;
    setSnapshot({ state, controller: controller.snapshot() });
  }, [controller]);

  const onEvents = useCallback(
    (events: readonly GameEvent[]) => {
      eventsRef.current = [...events.map((event) => game.describeEvent(event)).reverse(), ...eventsRef.current].slice(
        0,
        EVENT_LOG_SIZE,
      );
    },
    [game],
  );

  const restart = useCallback(
    (nextSeed: number, nextMode: PlayMode) => {
      controller.reset();
      controller.setProvider(providers[nextMode]);
      const state = game.createState({ seed: nextSeed });
      stateRef.current = state;
      eventsRef.current = [];
      game.start(state);
      publish();
    },
    [controller, game, providers, publish],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("debug") === "1") setDebugState(true);
    if (window.localStorage.getItem(SOUND_STORAGE_KEY) === "off") {
      setSoundOn(false);
      sound.setMuted(true);
    }
    if (window.localStorage.getItem(CRT_STORAGE_KEY) === "off") setCrtOn(false);
    publish();
  }, [publish, sound]);

  useEffect(() => {
    let cancelled = false;
    const stored = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (stored) {
      setModelIdState(stored);
      controller.setModel(stored);
    }
    void fetch("/api/models", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<ModelCatalogue>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        setCatalogue(data);
        // The stored id can vanish from the catalogue (its line was removed from
        // the environment). Fall back to the default rather than keep asking
        // with an id the server no longer knows.
        if (stored && !data.models.some((entry) => entry.id === stored)) {
          setModelIdState(null);
          controller.setModel(null);
          window.localStorage.removeItem(MODEL_STORAGE_KEY);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [controller]);

  // The cabinet's easter egg: the old code, honoured. It changes nothing about
  // how the game or the model plays — only the colours of the board.
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
          sound.unlock();
          if (next) sound.play("level");
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sound]);

  useEffect(() => {
    if (mode !== "MANUAL") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const state = stateRef.current;
      const action = game.keyActions[event.key];
      if (!state || !action || state.status !== "PLAYING") return;
      event.preventDefault();
      game.agent.apply(state, action);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [game, mode]);

  const startPause = useCallback(() => {
    const state = stateRef.current;
    if (!state) return;
    if (state.status === "PLAYING") game.pause(state);
    else if (state.status === "PAUSED") game.resume(state);
    else {
      // The click that starts the game is also what unlocks the audio context.
      // `play` is a no-op while muted, so there is no switch to consult here.
      sound.unlock();
      sound.play("start");
      game.start(state);
    }
    publish();
  }, [game, publish, sound]);

  const toggleSound = useCallback(() => {
    setSoundOn((current) => {
      const next = !current;
      sound.setMuted(!next);
      if (next) sound.unlock();
      window.localStorage.setItem(SOUND_STORAGE_KEY, next ? "on" : "off");
      return next;
    });
  }, [sound]);

  const toggleCrt = useCallback(() => {
    setCrtOn((current) => {
      const next = !current;
      window.localStorage.setItem(CRT_STORAGE_KEY, next ? "on" : "off");
      return next;
    });
  }, []);

  const setMode = useCallback(
    (next: PlayMode) => {
      setModeState(next);
      restart(seed, next);
    },
    [restart, seed],
  );

  const setSeed = useCallback(
    (next: number) => {
      setSeedState(next);
      restart(next, mode);
    },
    [mode, restart],
  );

  const setSpeed = useCallback((next: number) => {
    setSpeedState(next);
  }, []);

  const setModel = useCallback(
    (next: string) => {
      setModelIdState(next);
      window.localStorage.setItem(MODEL_STORAGE_KEY, next);
      controller.setModel(next);
      restart(seed, mode);
    },
    [controller, mode, restart, seed],
  );

  const toggleDebug = useCallback(() => {
    setDebugState((current) => {
      const next = !current;
      const url = new URL(window.location.href);
      url.searchParams.set("debug", next ? "1" : "0");
      window.history.replaceState({}, "", url);
      return next;
    });
  }, []);

  /** A compass key in manual mode is a steering wheel, not an inspection. */
  const steer = useCallback(
    (action: ActionId) => {
      const state = stateRef.current;
      if (!state || mode !== "MANUAL" || state.status !== "PLAYING") return;
      // `ActionId` is opaque to the shell; landing it is the game's own job.
      game.agent.apply(state, action);
    },
    [game, mode],
  );

  const exportRun = useCallback(() => {
    const state = stateRef.current;
    if (!state) return;
    const telemetry = controller.snapshot().telemetry;
    const payload = {
      exportedAt: new Date().toISOString(),
      game: game.meta.id,
      model: modelId ?? "default",
      mode,
      seed,
      summary: computeMetrics(telemetry),
      result: game.summary(state),
      decisions: telemetry,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `jev-${game.meta.id}-${mode.toLowerCase()}-seed${seed}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [controller, game, mode, modelId, seed]);

  return {
    state: snapshot.state,
    controller: snapshot.controller,
    mode,
    speed,
    seed,
    debug,
    neon,
    crtOn,
    soundOn,
    catalogue,
    modelId,
    events: eventsRef.current,
    sound,
    stateRef,
    controllerRef,
    publish,
    onEvents,
    startPause,
    restart,
    setMode,
    setSpeed,
    setSeed,
    setModel,
    toggleDebug,
    toggleSound,
    toggleCrt,
    steer,
    exportRun,
  };
}
