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
    canvas.width = Math.round(maze.width * TILE * ratio);
    canvas.height = Math.round(maze.height * TILE * ratio);
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
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
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
    <div className="stage" data-crt={props.crt || undefined}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Pac-Man maze. The live score, pellets and ghost state are in the stats below the maze."
        /* Intrinsic size is set here so the box has its final size before the
           effect runs: the CSS caps it by height, and nothing shifts. */
        width={mazeWidth}
        height={mazeHeight}
      />
      {props.attract ? (
        <p className="attract attract-overlay">
          <span className="attract-coin" aria-hidden="true" />
          Insert coin — press start
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
        addPopup(juice, state.maze.width / 2, state.maze.height * 0.42, `LEVEL ${state.level}`, EFFECT_COLORS.score, 1200);
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
