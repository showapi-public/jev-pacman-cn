"use client";

import type { Metrics } from "@/lib/agent/telemetry";
import { formatMs, formatPercent, formatValue } from "@/lib/ui";

export function MetricsPanel({ metrics }: { metrics: Metrics }) {
  const cells: { label: string; value: string }[] = [
    { label: "Jev requests", value: String(metrics.requests) },
    { label: "Applied", value: String(metrics.applied) },
    { label: "Fallbacks", value: String(metrics.fallbacks) },
    { label: "Stale answers", value: String(metrics.stale) },
    { label: "Timeouts", value: String(metrics.timeouts) },
    { label: "Errors", value: String(metrics.errors) },
    { label: "Invalid", value: String(metrics.invalid) },
    { label: "Applied rate", value: formatPercent(metrics.appliedRate) },
    { label: "Mean latency", value: formatMs(metrics.meanLatencyMs ?? Number.NaN) },
    { label: "p50 latency", value: formatMs(metrics.p50LatencyMs ?? Number.NaN) },
    { label: "p95 latency", value: formatMs(metrics.p95LatencyMs ?? Number.NaN) },
    { label: "Score", value: metrics.score.toLocaleString("en-US") },
    { label: "Pellets eaten", value: String(metrics.pelletsEaten) },
    { label: "Ghosts eaten", value: String(metrics.ghostsEaten) },
    { label: "Survival", value: formatMs(metrics.survivalMs) },
    { label: "Level", value: `${metrics.level}${metrics.lives === 0 ? " · over" : ""}` },
  ];

  return (
    <div className="metric-grid">
      {cells.map((cell) => (
        <div className="metric" key={cell.label}>
          <div className="label">{cell.label}</div>
          <div className="value">{cell.value === "—" ? formatValue(null) : cell.value}</div>
        </div>
      ))}
    </div>
  );
}
