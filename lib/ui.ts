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
  MANUAL: "手动",
  RANDOM: "随机",
  HEURISTIC: "启发式",
};

/** `GameStatus`, in words, for the header chip and anything else that names it. */
export const STATUS_LABELS: Record<GameStatus, string> = {
  READY: "就绪",
  PLAYING: "进行中",
  PAUSED: "已暂停",
  GAME_OVER: "游戏结束",
  CLEARED: "已通关",
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

/** The four directions, in words, wherever the UI shows one to a human. */
export const DIRECTION_LABELS: Record<Direction, string> = {
  UP: "上",
  DOWN: "下",
  LEFT: "左",
  RIGHT: "右",
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
      return `在 (${event.tile.x}, ${event.tile.y}) 吃到豆子 +${event.score}`;
    case "POWER_PELLET_EATEN":
      return `在 (${event.tile.x}, ${event.tile.y}) 吃到能量豆 +${event.score}`;
    case "GHOST_EATEN":
      return `${event.ghost} 被吃掉 +${event.score}`;
    case "PACMAN_DIED":
      return `吃豆人被抓住，剩余 ${event.livesLeft} 条命`;
    case "LEVEL_CLEARED":
      return `第 ${event.level} 关通过`;
    case "FRIGHTENED_STARTED":
      return `幽灵进入受惊状态 ${(event.durationMs / 1000).toFixed(0)} 秒`;
    case "FRIGHTENED_ENDED":
      return "幽灵恢复正常";
    case "GHOST_RELEASED":
      return `${event.ghost} 离开鬼屋`;
    case "GAME_OVER":
      return "游戏结束";
  }
}

export function isAiMode(mode: PlayMode): boolean {
  return mode !== "MANUAL";
}
