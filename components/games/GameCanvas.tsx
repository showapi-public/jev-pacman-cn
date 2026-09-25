"use client";

/**
 * The game stage, for every game: a canvas plus the fixed-timestep loop that
 * drives the engine.
 *
 * The loop is not a game's business. `controller.tick() → step() → paint()` is
 * the same three calls whatever is being played; the only things it needs from
 * the game are the step size, the bitmap size, a frame painter, and a way to
 * turn events into sound and particles. All five already live on
 * `GameDefinition`, so this component imports no game at all — it is handed one.
 *
 * That is why it also owns the juice layer: hit-stop, shake, particles and the
 * flash are per-run presentation state, and there is exactly one run on screen
 * at a time. It reaches the game's renderer through `PaintView.fx`, so the loop
 * still does not know what a particle is.
 *
 * React only sees snapshots (about ten a second), so a slow render can never
 * change how a game plays out.
 */

import { useEffect, useRef } from "react";

import type { AgentController } from "@/lib/agent/controller";
import type { SfxName, SoundBoard } from "@/lib/audio/sfx";
import type { GameDefinition, GameEvent, GameState, FxSink } from "@/lib/games/types";
import {
  addBurst,
  addConfetti,
  addPelletSpark,
  addPopup,
  addTrauma,
  createJuice,
  flashScreen,
  freezeFor,
  isFrozen,
  stepJuice,
  type JuiceState,
} from "@/lib/games/juice";
import { isAiMode, type PlayMode } from "@/lib/ui";

/** Never simulate more than this per frame: a hidden tab must not fast-forward. */
const MAX_STEPS_PER_FRAME = 3;
const PUBLISH_INTERVAL_MS = 100;
/**
 * The bitmap is rendered at this multiple of the displayed resolution, so the
 * board stays crisp when the well is given a tall viewport and scales it up.
 * Drawing is done in the game's own units throughout — only the canvas
 * transform changes, so nothing in `lib/games` has to know about it.
 */
const RENDER_SCALE = 2;

export interface GameCanvasProps<S extends GameState> {
  game: GameDefinition<S>;
  stateRef: React.RefObject<S | null>;
  controllerRef: React.RefObject<AgentController<S> | null>;
  mode: PlayMode;
  speed: number;
  debug: boolean;
  neon: boolean;
  crt: boolean;
  /** The cabinet waiting for a coin: shown while the game is ready to start. */
  attract: boolean;
  /** The line under the board while it waits. Game's own words. */
  attractText: string;
  /** What the board is, for screen readers. Game's own words. */
  ariaLabel: string;
  sound: SoundBoard;
  onSnapshot: () => void;
  onEvents: (events: readonly GameEvent[]) => void;
}

export function GameCanvas<S extends GameState>(props: GameCanvasProps<S>) {
  const juiceRef = useRef<JuiceState>(createJuice());
  if (process.env.NODE_ENV !== "production") {
    // Debug hook: lets a headless probe assert that the juice layer is alive.
    (globalThis as { __jevJuice?: JuiceState }).__jevJuice = juiceRef.current;
  }
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  // The state exists before the first paint (the session builds it during the
  // page's first render), so the canvas box is correct on the very first frame.
  const initial = props.stateRef.current;
  const initialBitmap = initial ? props.game.bitmap(initial) : { width: 1, height: 1 };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const game = propsRef.current.game;
    const state = propsRef.current.stateRef.current;
    if (!state) return;
    const bitmap = game.bitmap(state);
    const pixels = ratio * RENDER_SCALE;
    canvas.width = Math.round(bitmap.width * pixels);
    canvas.height = Math.round(bitmap.height * pixels);
    const context = canvas.getContext("2d");
    if (!context) return;

    let frameHandle = 0;
    let previous = performance.now();
    let accumulator = 0;
    let lastPublish = 0;

    const frame = (now: number) => {
      frameHandle = requestAnimationFrame(frame);
      const current = propsRef.current;
      const { controllerRef, mode, speed, debug, neon, sound, onSnapshot, onEvents } = current;
      const state = current.stateRef.current;
      const controller = controllerRef.current;
      if (!state || !controller) return;

      const elapsed = Math.min(now - previous, 100);
      previous = now;

      const juice = juiceRef.current;
      const reduced = prefersReducedMotion();

      if (state.status === "PLAYING" && !isFrozen(juice)) {
        accumulator += elapsed * speed;
        let steps = 0;
        const collected: GameEvent[] = [];

        while (accumulator >= current.game.fixedDtMs && steps < MAX_STEPS_PER_FRAME) {
          // The agent decides first, then the engine moves: an action applied
          // now is the one taken at the decision point the game is heading for.
          if (isAiMode(mode)) controller.tick(state);
          collected.push(...current.game.step(state, current.game.fixedDtMs));
          accumulator -= current.game.fixedDtMs;
          steps += 1;
        }
        if (steps >= MAX_STEPS_PER_FRAME) accumulator = 0;
        if (collected.length > 0) {
          onEvents(collected);
          current.game.react(collected, state, createFxSink(juice, sound, reduced));
        }
      } else {
        // A pause or a hit-stop must not bank time and then fast-forward.
        accumulator = 0;
      }

      stepJuice(juice, elapsed);

      const bitmap = current.game.bitmap(state);
      context.setTransform(pixels, 0, 0, pixels, 0, 0);
      context.clearRect(0, 0, bitmap.width, bitmap.height);
      current.game.paint(context, state, {
        debug,
        timeMs: now,
        neon,
        thinking: state.status === "PLAYING" && controller.isRequesting(),
        // 与 `createFxSink` 读同一个判据：粒子和画布上的装饰一起停，不会各停各的。
        reducedMotion: reduced,
        fx: juice,
        // The overlay's contents are the game's own; the controller has no
        // business knowing what a junction is.
        debugInfo: debug ? current.game.agent.debug(state) : null,
      });

      if (now - lastPublish >= PUBLISH_INTERVAL_MS) {
        lastPublish = now;
        onSnapshot();
      }
    };

    frameHandle = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameHandle);
    // Everything else is read through propsRef; only a different game needs the
    // loop restarted (and the bitmap resized for it).
  }, [props.game]);

  const state = props.stateRef.current;
  const bitmap = state ? props.game.bitmap(state) : initialBitmap;

  return (
    <div
      /* The well is the box that scales the board to fit. Both of its tracks are
         pinned to `minmax(0, 1fr)` on purpose: with the default `auto` row the
         canvas' `height: 100%` would have no definite track to resolve against,
         so the floor of `min-height: auto` would hand the height to the bitmap's
         own aspect ratio (662x733 in a 320px well) and `overflow: hidden` would
         slice the board in half, top and bottom. A `1fr` row is always definite
         once the well itself is, which is what makes `h-full` mean the well. */
      className="screen-crt relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] place-items-center overflow-hidden bg-well p-3"
      data-crt={props.crt ? "true" : undefined}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={props.ariaLabel}
        /* The bitmap carries the device-pixel scale; the box is the fitted area
           and `object-contain` letterboxes the board inside it, so the whole
           board is always visible whatever the well's proportions. */
        width={bitmap.width}
        height={bitmap.height}
        className="block h-full w-full object-contain"
      />
      {props.attract ? (
        <p className="attract absolute bottom-4 left-1/2 z-3 m-0 -translate-x-1/2 rounded-pill border border-self/40 bg-canvas/90 px-4 py-1.5 backdrop-blur-[2px] [text-shadow:0_0_12px_color-mix(in_oklab,var(--self)_35%,transparent)]">
          <span className="attract-coin" aria-hidden="true" />
          {props.attractText}
        </p>
      ) : null}
    </div>
  );
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The game's `react()` writes into this: an `FxSink` over the run's juice state
 * and the cabinet's sound board.
 *
 * `prefers-reduced-motion` is enforced **here**, which is exactly what lets the
 * games write their effects unconditionally: a game says "there was a burst of
 * 16 particles", and the sink decides that on this machine it will be no burst
 * at all. Sound is not motion, so it is never suppressed by it — the mute
 * switch is the only thing that silences it.
 */
function createFxSink(juice: JuiceState, sound: SoundBoard, reduced: boolean): FxSink {
  return {
    sound: (name) => sound.play(name as SfxName),
    trauma: (amount) => {
      if (!reduced) addTrauma(juice, amount);
    },
    freeze: (ms) => {
      if (!reduced) freezeFor(juice, ms);
    },
    flash: (ms, color) => {
      if (!reduced) flashScreen(juice, ms, color);
    },
    spark: (x, y, color, count) => {
      if (!reduced) addPelletSpark(juice, x, y, color, count);
    },
    burst: (x, y, color, count) => {
      if (!reduced) addBurst(juice, x, y, color, count);
    },
    popup: (x, y, text, color, lifeMs) => {
      if (!reduced) addPopup(juice, x, y, text, color, lifeMs);
    },
    confetti: (width, height, colors, count) => {
      if (!reduced) addConfetti(juice, width, height, colors, count);
    },
  };
}
