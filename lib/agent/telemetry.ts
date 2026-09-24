/**
 * Telemetry and metrics.
 *
 * Every decision is recorded, including the ones that went wrong, and the
 * numbers on screen are computed from those records — not estimated.
 */

import { DECISION_DEADLINE_MS, type GameState } from "../games/pacman/types";
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

/* ------------------------------------------------------------------ charts */

/** One point on the session chart: the Nth decision, and how sure the agent was. */
export interface DecisionPoint {
  /** 1-based position in the session, so the x axis reads as "the Nth decision". */
  index: number;
  decisionId: string;
  /** Jev's own confidence in its answer, 0–1; null when the provider gave none. */
  confidence: number | null;
  /** The share the chosen direction was given, 0–1; null with no distribution. */
  chosenProbability: number | null;
  latencyMs: number | null;
}

/**
 * The session as a time series, oldest first, capped at `limit` points so the
 * chart stays readable in a long game. Records with neither a confidence nor a
 * probability are dropped: a point with no y value would read as a fall to zero.
 */
export function decisionSeries(records: readonly DecisionTelemetry[], limit = 80): DecisionPoint[] {
  const usable = records.filter(
    (record) => record.confidence !== null || Object.keys(record.probabilities).length > 0,
  );
  const tail = usable.slice(Math.max(0, usable.length - limit));

  return tail.map((record, offset) => {
    const chosen = record.choice ? record.probabilities[record.choice] : undefined;
    return {
      // The index is the decision's position in the whole session, not in the
      // window, so the axis keeps counting up as old points fall off the left.
      index: usable.length - tail.length + offset + 1,
      decisionId: record.decisionId,
      confidence: record.confidence,
      chosenProbability: chosen ?? null,
      latencyMs: record.latencyMs,
    };
  });
}

export interface LatencyBucket {
  label: string;
  count: number;
  /** True while the whole bucket sits inside the decision deadline. */
  withinDeadline: boolean;
}

/**
 * Fixed buckets, so the bars mean the same thing in every session.
 *
 * The 500 ms edge is load-bearing, not decorative: it is DECISION_DEADLINE_MS,
 * the point past which an answer can no longer be used, so the bars to its right
 * are answers that arrived after Pac-Man had already crossed the junction. Pin it
 * to that constant rather than to a literal, or the split quietly stops meaning
 * "too late" the moment either constant it derives from is retuned.
 *
 * What the split is *not* is `stale`. This histogram only ever sees answers that
 * were measured; `stale` counts every discarded decision, measured or not. See
 * `overDeadlineCount` for where the two come apart.
 */
const LATENCY_BUCKETS: readonly { label: string; max: number }[] = [
  { label: "<150", max: 150 },
  { label: "150–300", max: 300 },
  { label: "300–500", max: 500 },
  { label: "500–800", max: 800 },
  { label: "800–1200", max: 1200 },
  { label: "≥1200", max: Number.POSITIVE_INFINITY },
];

/** How many answers landed in each latency bucket — the shape of the latency. */
export function latencyHistogram(records: readonly DecisionTelemetry[]): LatencyBucket[] {
  const buckets = LATENCY_BUCKETS.map((bucket) => ({
    label: bucket.label,
    count: 0,
    // Inside only while the *whole* range is: the ceiling is the last point the
    // bucket can hold, so `max <= deadline` is the exact test. The open-ended
    // top bucket is outside by construction.
    withinDeadline: bucket.max <= DECISION_DEADLINE_MS,
  }));

  for (const record of records) {
    const value = record.latencyMs;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    // Each record lands in exactly one bucket: the first whose ceiling it is under.
    const index = LATENCY_BUCKETS.findIndex((bucket) => value < bucket.max);
    if (index >= 0) buckets[index].count += 1;
  }

  return buckets;
}

/**
 * How many measured answers arrived too late to be used.
 *
 * Read this as the lateness slice of `stale`, never as `stale` itself. Both are
 * about discarded decisions, but the histogram can only speak for answers that
 * were measured, and the controller discards plenty that were not: a request
 * cancelled before its answer came (switching to manual, a new game epoch, the
 * junction replaced, the game restarted) is closed STALE with a null latency, and
 * an answer that arrived comfortably in time but was discarded for one of those
 * same non-latency reasons keeps its short latency while wearing a STALE status.
 * Neither is visible to this count — the first has nothing to bucket, the second
 * lands in a bucket this function calls healthy.
 *
 * So the two counts overlap without agreeing, and a difference between them is
 * not by itself a sign that either one is wrong.
 */
export function overDeadlineCount(buckets: readonly LatencyBucket[]): number {
  return buckets.reduce((sum, bucket) => sum + (bucket.withinDeadline ? 0 : bucket.count), 0);
}

