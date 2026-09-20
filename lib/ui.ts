/**
 * View types and small formatters shared by the page and its panels.
 */

import type { ControllerSnapshot } from "./agent/controller";
import type { Metrics } from "./agent/telemetry";
import type { DecisionTelemetry } from "./agent/types";
import type { Direction, GameEvent, GameStatus } from "./game/types";

export type PlayMode = "JEV" | "MANUAL" | "RANDOM" | "HEURISTIC";

export const PLAY_MODES: readonly PlayMode[] = ["JEV", "MANUAL", "RANDOM", "HEURISTIC"];

export const MODE_LABELS: Record<PlayMode, string> = {
  JEV: "Jev",
  MANUAL: "Manual",
  RANDOM: "Random",
  HEURISTIC: "Heuristic",
};

export const SPEEDS = [0.5, 1, 2] as const;

export interface UiSnapshot {
  status: GameStatus;
  score: number;
  lives: number;
  level: number;
  pelletsRemaining: number;
  powerPelletsRemaining: number;
  pelletsEaten: number;
  ghostsEaten: number;
  playTimeMs: number;
  controller: ControllerSnapshot;
  metrics: Metrics;
  feed: DecisionTelemetry[];
  /** Recent game events, newest first, already formatted for display. */
  events: string[];
}

export const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: "UP",
  ArrowDown: "DOWN",
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
};

export function formatMs(milliseconds: number): string {
  if (!Number.isFinite(milliseconds)) return "—";
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatValue(value: number | null | undefined, digits = 0, suffix = ""): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}${suffix}`;
}

export function formatPercent(fraction: number | null | undefined, digits = 0): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function describeEvent(event: GameEvent): string {
  switch (event.type) {
    case "PELLET_EATEN":
      return `+${event.score} pellet at (${event.tile.x}, ${event.tile.y})`;
    case "POWER_PELLET_EATEN":
      return `+${event.score} power pellet at (${event.tile.x}, ${event.tile.y})`;
    case "GHOST_EATEN":
      return `+${event.score} ${event.ghost} eaten`;
    case "PACMAN_DIED":
      return `Pac-Man caught, ${event.livesLeft} ${event.livesLeft === 1 ? "life" : "lives"} left`;
    case "LEVEL_CLEARED":
      return `level ${event.level} cleared`;
    case "FRIGHTENED_STARTED":
      return `ghosts frightened for ${(event.durationMs / 1000).toFixed(0)}s`;
    case "FRIGHTENED_ENDED":
      return "ghosts back to normal";
    case "GHOST_RELEASED":
      return `${event.ghost} left the house`;
    case "GAME_OVER":
      return "game over";
  }
}

export function isAiMode(mode: PlayMode): boolean {
  return mode !== "MANUAL";
}
