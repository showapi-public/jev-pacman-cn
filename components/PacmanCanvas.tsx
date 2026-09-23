"use client";

/**
 * The game stage: canvas plus the fixed-timestep loop that drives the engine.
 *
 * The loop owns the simulation. React only sees snapshots (about ten a second),
 * so a slow render can never change how the game plays out.
 */

import { useEffect, useRef } from "react";

import type { AgentController } from "@/lib/agent/controller";
import type { SoundBoard } from "@/lib/audio/sfx";
import { stepGame } from "@/lib/game/engine";
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
} from "@/lib/game/juice";
import { EFFECT_COLORS, TILE, drawGame, ghostColor } from "@/lib/game/render";
import { FIXED_DT_MS } from "@/lib/game/types";
import type { GameEvent, GameState } from "@/lib/game/types";
import { isAiMode, type PlayMode } from "@/lib/ui";
import type { JuiceState } from "@/lib/game/juice";

/** Never simulate more than this per frame: a hidden tab must not fast-forward. */
const MAX_STEPS_PER_FRAME = 3;
const PUBLISH_INTERVAL_MS = 100;
/**
 * The bitmap is rendered at this multiple of the displayed resolution, so the
 * maze stays crisp when the board is given a tall viewport and the well scales
 * it up. Drawing is done in maze pixels throughout — only the canvas transform
 * changes, so nothing in lib/game has to know about it.
 */
const RENDER_SCALE = 2;

export interface PacmanCanvasProps {
  stateRef: React.RefObject<GameState | null>;
  controllerRef: React.RefObject<AgentController | null>;
  mode: PlayMode;
  speed: number;
  debug: boolean;
  neon: boolean;
  crt: boolean;
  /** The cabinet waiting for a coin: shown while the game is ready to start. */
  attract: boolean;
  sound: SoundBoard;
  onSnapshot: () => void;
  onEvents: (events: GameEvent[]) => void;
}

export function PacmanCanvas(props: PacmanCanvasProps) {
  const juiceRef = useRef<JuiceState>(createJuice());
  if (process.env.NODE_ENV !== "production") {
    // Debug hook: lets a headless probe assert that the juice layer is alive.
    (globalThis as { __jevJuice?: JuiceState }).__jevJuice = juiceRef.current;
  }
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  // The maze is known before the first paint (the page builds the game state
  // during render), so the canvas box is correct on the very first frame.
  const maze = props.stateRef.current?.maze;
  const mazeWidth = (maze?.width ?? 28) * TILE;
  const mazeHeight = (maze?.height ?? 31) * TILE;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const maze = propsRef.current.stateRef.current?.maze;
    if (!maze) return;
    const pixels = ratio * RENDER_SCALE;
    canvas.width = Math.round(maze.width * TILE * pixels);
    canvas.height = Math.round(maze.height * TILE * pixels);
    const context = canvas.getContext("2d");
    if (!context) return;

    let frameHandle = 0;
    let previous = performance.now();
    let accumulator = 0;
    let lastPublish = 0;

    const frame = (now: number) => {
      frameHandle = requestAnimationFrame(frame);
      const { stateRef, controllerRef, mode, speed, debug, neon, sound, onSnapshot, onEvents } = propsRef.current;
      const state = stateRef.current;
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

        while (accumulator >= FIXED_DT_MS && steps < MAX_STEPS_PER_FRAME) {
          // The agent decides first, then the engine moves: a direction applied
          // now is the one Pac-Man takes at the junction he is heading for.
          if (isAiMode(mode)) controller.tick(state);
          collected.push(...stepGame(state, FIXED_DT_MS));
          accumulator -= FIXED_DT_MS;
          steps += 1;
        }
        if (steps >= MAX_STEPS_PER_FRAME) accumulator = 0;
        if (collected.length > 0) {
          onEvents(collected);
          reactTo(collected, juice, sound, state, reduced);
        }
      } else {
        // A pause or a hit-stop must not bank time and then fast-forward.
        accumulator = 0;
      }

      stepJuice(juice, elapsed);

      const width = state.maze.width * TILE;
      const height = state.maze.height * TILE;
      context.setTransform(pixels, 0, 0, pixels, 0, 0);
      context.clearRect(0, 0, width, height);
      drawGame(context, state, {
        debug,
        time: now,
        juice,
        neon,
        thinking: state.status === "PLAYING" && controller.isRequesting(),
        debugInfo: controller.debugInfo(state),
      });

      if (now - lastPublish >= PUBLISH_INTERVAL_MS) {
        lastPublish = now;
        onSnapshot();
      }
    };

    frameHandle = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameHandle);
    // The loop reads everything through propsRef, so it is started once.
  }, []);

  return (
    <div
      /* The well is the box that scales the maze to fit. Both of its tracks are
         pinned to `minmax(0, 1fr)` on purpose: with the default `auto` row the
         canvas' `height: 100%` would have no definite track to resolve against,
         so the floor of `min-height: auto` would hand the height to the bitmap's
         own aspect ratio (662x733 in a 320px well) and `overflow: hidden` would
         slice the maze in half, top and bottom. A `1fr` row is always definite
         once the well itself is, which is what makes `h-full` mean the well. */
      className="screen-crt relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] place-items-center overflow-hidden bg-well p-3"
      data-crt={props.crt ? "true" : undefined}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="吃豆人迷宫。实时得分、豆子与幽灵状态见迷宫下方的参数栏。"
        /* The bitmap carries the device-pixel scale; the box is the fitted area
           and `object-contain` letterboxes the maze inside it, so the whole maze
           is always visible whatever the well's proportions. */
        width={mazeWidth}
        height={mazeHeight}
        className="block h-full w-full object-contain"
      />
      {props.attract ? (
        <p className="attract absolute bottom-4 left-1/2 z-3 m-0 -translate-x-1/2 rounded-pill border border-pacman/40 bg-canvas/90 px-4 py-1.5 backdrop-blur-[2px] [text-shadow:0_0_12px_rgba(255,210,63,0.35)]">
          <span className="attract-coin" aria-hidden="true" />
          投入硬币 —— 按开始
        </p>
      ) : null}
    </div>
  );
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Engine events become sound and particles.
 *
 * Presentation only: nothing here can change what Pac-Man does. Motion juice is
 * skipped under `prefers-reduced-motion`; sound is governed by the mute switch.
 */
function reactTo(
  events: GameEvent[],
  juice: JuiceState,
  sound: SoundBoard,
  state: GameState,
  reduced: boolean,
): void {
  const tile = state.pacman.tile;
  for (const event of events) {
    switch (event.type) {
      case "PELLET_EATEN":
        sound.play("chomp");
        if (!reduced) addPelletSpark(juice, event.tile.x, event.tile.y, EFFECT_COLORS.pellet, 2);
        break;
      case "POWER_PELLET_EATEN":
        sound.play("power");
        if (reduced) break;
        flashScreen(juice, 150, EFFECT_COLORS.power);
        addPelletSpark(juice, event.tile.x, event.tile.y, EFFECT_COLORS.power, 6);
        addTrauma(juice, 0.25);
        break;
      case "GHOST_EATEN":
        sound.play("ghost");
        if (reduced) break;
        addBurst(juice, tile.x, tile.y, ghostColor(event.ghost), 16);
        addPopup(juice, tile.x, tile.y - 1, `+${event.score}`, EFFECT_COLORS.score);
        freezeFor(juice, 80);
        addTrauma(juice, 0.5);
        break;
      case "PACMAN_DIED":
        sound.play("death");
        if (reduced) break;
        addBurst(juice, tile.x, tile.y, EFFECT_COLORS.death, 22);
        flashScreen(juice, 220, EFFECT_COLORS.death);
        addTrauma(juice, 1);
        break;
      case "LEVEL_CLEARED":
        sound.play("level");
        if (reduced) break;
        addConfetti(juice, state.maze.width, state.maze.height, EFFECT_COLORS.level, 54);
        addPopup(juice, state.maze.width / 2, state.maze.height * 0.42, `第 ${state.level} 关`, EFFECT_COLORS.score, 1200);
        break;
      case "GAME_OVER":
        if (reduced) break;
        flashScreen(juice, 320, EFFECT_COLORS.death);
        addTrauma(juice, 0.6);
        break;
      default:
        break;
    }
  }
}
