/**
 * Telemetry and metrics.
 *
 * Every decision is recorded, including the ones that went wrong, and the
 * numbers on screen are computed from those records — not estimated.
 */

import type { GameState } from "../game/types";
import type { DecisionTelemetry } from "./types";

export interface Metrics {
  /** Decision requests sent to a provider (Jev, mock or baseline). */
  requests: number;
  /** Requests whose answer Pac-Man actually took. */
  applied: number;
  fallbacks: number;
  stale: number;
  timeouts: number;
  errors: number;
  invalid: number;
  pending: number;
  meanLatencyMs: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  /** applied / requests: how often the answer arrived in time. */
  appliedRate: number | null;
  score: number;
  pelletsEaten: number;
  ghostsEaten: number;
  survivalMs: number;
  level: number;
  lives: number;
  pelletsRemaining: number;
}

export function computeMetrics(records: readonly DecisionTelemetry[], state: GameState): Metrics {
  const requests = records.filter((record) => record.source !== "FALLBACK");
  const latencies = records
    .map((record) => record.latencyMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const applied = records.filter((record) => record.status === "APPLIED" && record.source !== "FALLBACK").length;
  const fallbacks = records.filter((record) => record.source === "FALLBACK").length;

  return {
    requests: requests.length,
    applied,
    fallbacks,
    stale: records.filter((record) => record.status === "STALE").length,
    timeouts: records.filter((record) => record.status === "TIMEOUT").length,
    errors: records.filter((record) => record.status === "ERROR").length,
    invalid: records.filter((record) => record.status === "INVALID").length,
    pending: records.filter((record) => record.status === "PENDING").length,
    meanLatencyMs: mean(latencies),
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    appliedRate: requests.length === 0 ? null : applied / requests.length,
    score: state.score,
    pelletsEaten: state.pelletsEaten,
    ghostsEaten: state.ghostsEaten,
    survivalMs: state.playTimeMs,
    level: state.level,
    lives: state.lives,
    pelletsRemaining: state.pellets.size,
  };
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index];
}

/** The most recent decisions, newest first: what the decision feed shows. */
export function recentFeed(records: readonly DecisionTelemetry[], limit = 40): DecisionTelemetry[] {
  return [...records].reverse().slice(0, limit);
}
