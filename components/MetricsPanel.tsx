"use client";

import { Fragment } from "react";

import type { Metrics } from "@/lib/agent/telemetry";
import { formatMs, formatPercent } from "@/lib/ui";

import styles from "./MetricsPanel.module.css";

/**
 * The module's class names are `mp-`-prefixed; aliased once here so the JSX
 * below reads as a definition list, not as a dictionary lookup.
 */
const {
  "mp-list": list,
  "mp-group": group,
  "mp-term": term,
  "mp-desc": desc,
  "mp-num": num,
  "mp-rateTrack": rateTrack,
  "mp-rateFill": rateFill,
  "mp-rateValue": rateValue,
} = styles;

/** `keyof Metrics`, so a row can never point at a field that does not exist. */
type MetricKey = keyof Metrics;

interface MetricRow {
  key: MetricKey;
  label: string;
  format: (metrics: Metrics) => string;
  /** The applied-rate row draws its share as a bar beside the number. */
  bar?: boolean;
}

/**
 * One definition row: `key` picks the field, `format` renders it. The value the
 * formatter receives is typed `Metrics[key]`, so the 16 rows below stay bound to
 * the telemetry contract instead of to a hand-copied string list.
 */
function row<K extends MetricKey>(
  key: K,
  label: string,
  format: (value: Metrics[K], metrics: Metrics) => string,
  bar = false,
): MetricRow {
  return { key, label, format: (metrics) => format(metrics[key], metrics), bar };
}

const count = (value: number) => String(value);
/** `formatMs` takes a number; "no samples" has to reach it as NaN. */
const ms = (value: number | null) => formatMs(value ?? Number.NaN);

const GROUPS: readonly { heading: string; rows: readonly MetricRow[] }[] = [
  {
    heading: "Decision quality",
    rows: [
      row("requests", "Jev requests", count),
      row("applied", "Applied", count),
      row("fallbacks", "Fallbacks", count),
      row("stale", "Stale answers", count),
      row("timeouts", "Timeouts", count),
      row("errors", "Errors", count),
      row("invalid", "Invalid", count),
    ],
  },
  {
    heading: "Latency",
    rows: [
      row("appliedRate", "Applied rate", (value) => formatPercent(value), true),
      row("meanLatencyMs", "Mean", ms),
      row("p50LatencyMs", "p50", ms),
      row("p95LatencyMs", "p95", ms),
    ],
  },
  {
    heading: "Game",
    rows: [
      row("score", "Score", (value) => value.toLocaleString("en-US")),
      row("pelletsEaten", "Pellets eaten", count),
      row("ghostsEaten", "Ghosts eaten", count),
      row("survivalMs", "Survival", ms),
      row("level", "Level", (value, metrics) => `${value}${metrics.lives === 0 ? " · over" : ""}`),
    ],
  },
];

/** The bar is a fraction of its track, clamped: a bad number cannot overflow it. */
function share(rate: number | null): number {
  if (rate === null || !Number.isFinite(rate)) return 0;
  return Math.min(1, Math.max(0, rate));
}

/**
 * The session numbers as definition rows: label left, value right, one hairline
 * between them. This is the panel body — it supplies its own padding — and it
 * renders no panel, head or tab of its own.
 */
export function MetricsPanel({ metrics }: { metrics: Metrics }) {
  return (
    <dl className={list}>
      {GROUPS.map(({ heading, rows }) => (
        <Fragment key={heading}>
          <dt className={group}>{heading}</dt>
          {rows.map((entry) => {
            const value = entry.format(metrics);

            return (
              <Fragment key={entry.key}>
                <dt className={term}>
                  <span className="label">{entry.label}</span>
                </dt>
                <dd className={desc}>
                  {entry.bar ? (
                    <>
                      <span className={rateTrack}>
                        <span
                          className={rateFill}
                          style={{ transform: `scaleX(${share(metrics.appliedRate)})` }}
                        />
                      </span>
                      <span className={`${num} ${rateValue}`}>{value}</span>
                    </>
                  ) : (
                    <span className={num}>{value}</span>
                  )}
                </dd>
              </Fragment>
            );
          })}
        </Fragment>
      ))}
    </dl>
  );
}
