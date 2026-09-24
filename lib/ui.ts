/**
 * View types and small formatters shared by the page and its panels.
 */

import type { ControllerSnapshot, ControllerStatus } from "./agent/controller";
import type { Metrics } from "./agent/telemetry";
import type { DecisionTelemetry, TelemetryStatus } from "./agent/types";
import type { Direction, GameEvent, GameStatus } from "./games/pacman/types";

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

/**
 * Elapsed time as a running clock — the shape a stopwatch shows, for things
 * that are read as "the game has been going for 1:37", not as a measurement.
 *
 * Do not use this for decision latency. Above one second it would render a
 * 1.4s answer as "0:01", which sits next to "平均延迟 520 ms" in the same row of
 * stat tiles and reads as a different quantity entirely. Latency has its own
 * formatter below.
 */
export function formatMs(milliseconds: number): string {
  if (!Number.isFinite(milliseconds)) return "—";
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * A duration you compare against other durations, so the unit never changes
 * with the magnitude: always milliseconds, up to a second, then seconds with
 * one decimal. The Jev timeout is 2000 ms, so the seconds branch is the common
 * case on a slow link, not an edge case.
 */
export function formatLatency(milliseconds: number | null | undefined): string {
  if (milliseconds === null || milliseconds === undefined || !Number.isFinite(milliseconds)) return "—";
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  return `${(milliseconds / 1000).toFixed(1)} s`;
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

/* ------------------------------------------------------------------ copy */

/*
 * Every string the console says about the agent lives here, in one vocabulary.
 * Panels import words from this module instead of inventing their own, so the
 * same state can never be called two different things on two different panels.
 */

/** What the controller is doing right now, in words. */
export const CONTROLLER_STATUS_LABELS: Record<ControllerStatus, string> = {
  MANUAL: "手动驾驶",
  IDLE: "路口之间",
  REQUESTING: "正在询问 Jev",
  READY: "答案已到手",
  OFFLINE: "离线",
};

/** A failed request names the kind of failure, never a colour word. */
export const DECIDE_ERROR_LABELS: Record<string, string> = {
  no_api_key: "未配置 API Key",
  timeout: "请求超时",
  connection: "连接失败",
  rate_limited: "被限流",
  bad_request: "请求体不合法",
  http: "Jev 拒绝响应",
  invalid: "答案不可用",
  unknown: "请求失败",
};

/**
 * The label for one failure kind — use this rather than indexing the map.
 *
 * The map cannot be exhaustive: `/api/decide` reports HTTP failures as
 * `http_<status>` (a 500, a 502, …), and that set is open-ended. Indexing the map
 * directly meant every one of those — and 429, which the route names
 * `rate_limited` — fell through to a bare "离线": the pill stopped saying *what*
 * had gone wrong, which is the only job it has.
 */
export function decideErrorLabel(kind: string | null | undefined): string | null {
  if (!kind) return null;
  if (kind.startsWith("http_")) return `Jev 返回 ${kind.slice("http_".length)}`;
  return DECIDE_ERROR_LABELS[kind] ?? null;
}

export type Tone = "neutral" | "live" | "busy" | "bad" | "warn" | "accent";

/** The controller's status, with the pill tone that goes with it. */
export function controllerStatus(snapshot: {
  status: ControllerStatus;
  lastError: { kind: string } | null;
}): { label: string; tone: Tone } {
  if (snapshot.status === "OFFLINE") {
    return { label: decideErrorLabel(snapshot.lastError?.kind) ?? "离线", tone: "bad" };
  }
  const tone: Record<ControllerStatus, Tone> = {
    MANUAL: "neutral",
    IDLE: "neutral",
    REQUESTING: "busy",
    READY: "live",
    OFFLINE: "bad",
  };
  return { label: CONTROLLER_STATUS_LABELS[snapshot.status], tone: tone[snapshot.status] };
}

/**
 * One decision record's status. Emerald once the answer was applied, amber
 * while the agent is still being asked (and as soon as it answers), red for
 * every answer that did not land in time.
 */
export function telemetryStatus(status: TelemetryStatus, choice: Direction | null): {
  label: string;
  tone: Tone;
} {
  switch (status) {
    case "APPLIED":
      return { label: "已执行", tone: "live" };
    case "PENDING":
      return choice ? { label: "已到手", tone: "busy" } : { label: "询问中", tone: "busy" };
    case "STALE":
      return { label: "已过期", tone: "bad" };
    case "TIMEOUT":
      return { label: "超时", tone: "bad" };
    case "ERROR":
      return { label: "出错", tone: "bad" };
    case "INVALID":
      return { label: "无效", tone: "bad" };
  }
}

/** The game's status, named the same way everywhere it appears. */
export const GAME_STATUS_TONE: Record<GameStatus, Tone> = {
  READY: "warn",
  PLAYING: "live",
  PAUSED: "busy",
  GAME_OVER: "bad",
  CLEARED: "accent",
};

