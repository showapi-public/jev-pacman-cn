"use client";

/**
 * The game stage: canvas plus the fixed-timestep loop that drives the engine.
 *
 * The loop owns the simulation. React only sees snapshots (about ten a second),
 * so a slow render can never change how the game plays out.
 */

import { useEffect, useRef } from "react";

import type { AgentController } from "@/lib/agent/controller";
import { stepGame } from "@/lib/game/engine";
import { TILE, drawGame } from "@/lib/game/render";
import { FIXED_DT_MS } from "@/lib/game/types";
import type { GameEvent, GameState } from "@/lib/game/types";
import { isAiMode, type PlayMode } from "@/lib/ui";

/** Never simulate more than this per frame: a hidden tab must not fast-forward. */
const MAX_STEPS_PER_FRAME = 3;
const PUBLISH_INTERVAL_MS = 100;

export interface PacmanCanvasProps {
  stateRef: React.RefObject<GameState | null>;
  controllerRef: React.RefObject<AgentController | null>;
  mode: PlayMode;
  speed: number;
  debug: boolean;
  onSnapshot: () => void;
  onEvents: (events: GameEvent[]) => void;
}

export function PacmanCanvas(props: PacmanCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

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
      const { stateRef, controllerRef, mode, speed, debug, onSnapshot, onEvents } = propsRef.current;
      const state = stateRef.current;
      const controller = controllerRef.current;
      if (!state || !controller) return;

      const elapsed = Math.min(now - previous, 100);
      previous = now;

      if (state.status === "PLAYING") {
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
        if (collected.length > 0) onEvents(collected);
      }

      const width = state.maze.width * TILE;
      const height = state.maze.height * TILE;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      drawGame(context, state, { debug, time: now, debugInfo: controller.debugInfo(state) });

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
    <div className="stage">
      <canvas ref={canvasRef} aria-label="Pac-Man game" />
    </div>
  );
}
