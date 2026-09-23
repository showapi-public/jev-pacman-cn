"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DecisionPoint } from "@/lib/agent/telemetry";
import { formatLatency, formatPercent } from "@/lib/ui";

/**
 * The session chart: how sure Jev was, decision by decision.
 *
 * Two series, because they answer different questions. *Self-reported
 * confidence* is what the model claimed; *the share it gave its own choice* is
 * what came out of the distribution. When the two diverge, the model is hedging
 * — which is exactly the thing worth watching in a long session.
 *
 * Kept deliberately plain: no gradient wash, no animation on data change (the
 * series grows every second and a re-animating chart is unreadable), and a
 * dashed mean line so "is this session better than the last" is one comparison.
 */

const HEIGHT = 128;

export interface ConfidenceChartProps {
  points: readonly DecisionPoint[];
}

export default function ConfidenceChart({ points }: ConfidenceChartProps) {
  const last = points.at(-1);
  const meanConfidence = mean(
    points.map((point) => point.confidence).filter((value): value is number => value !== null),
  );

  /*
   * The chart is an image, not a widget. Every point it draws is also a row in
   * the history table right below it, so there is nothing here a keyboard user
   * cannot reach — and left to its own default, Recharts marks the surface
   * `role="application" tabindex="0"` with no accessible name, which drops a
   * focus stop into the middle of the console whose announcement is the
   * concatenated axis ticks ("1 0% 50% 100%") and which eats the arrow keys
   * while it holds focus.
   */
  const summary = [
    `自评置信度与选项占比的整局走势，共 ${points.length} 次决策`,
    meanConfidence === null ? null : `自评置信度均值 ${Math.round(meanConfidence * 100)}%`,
    last?.confidence == null ? null : `最新 ${Math.round(last.confidence * 100)}%`,
  ]
    .filter((part): part is string => part !== null)
    .join("；")
    .concat("。");

  return (
    <div style={{ height: HEIGHT }} className="w-full" role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={points as DecisionPoint[]}
          margin={{ top: 8, right: 10, bottom: 0, left: 0 }}
          accessibilityLayer={false}
        >
          <CartesianGrid vertical={false} stroke="var(--divider)" />
          <XAxis
            dataKey="index"
            type="number"
            domain={["dataMin", "dataMax"]}
            tick={{ fill: "var(--text-quaternary)", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border-subtle)" }}
            tickCount={5}
            allowDecimals={false}
          />
          {/*
           * The left margin must stay at 0 and the width must fit the longest
           * label. Y ticks are `text-anchor="end"`, so they grow leftwards from
           * the axis: a negative left margin shifts the axis band's origin off
           * the canvas and "100%" loses its leading digits to the viewport edge,
           * which renders the axis as three identical "0%" labels.
           */}
          <YAxis
            domain={[0, 1]}
            ticks={[0, 0.5, 1]}
            tickFormatter={(value: number) => `${Math.round(value * 100)}%`}
            tick={{ fill: "var(--text-quaternary)", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <ChartTooltip
            cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
            content={<ChartTooltipCard />}
          />

          {meanConfidence === null ? null : (
            <ReferenceLine
              y={meanConfidence}
              stroke="var(--border-strong)"
              strokeDasharray="3 3"
              ifOverflow="extendDomain"
            />
          )}

          <Area
            type="monotone"
            dataKey="chosenProbability"
            name="选项占比"
            stroke="var(--pacman)"
            strokeWidth={1.25}
            strokeOpacity={0.75}
            fill="var(--pacman)"
            fillOpacity={0.08}
            dot={false}
            activeDot={{ r: 2.5, fill: "var(--pacman)", stroke: "none" }}
            isAnimationActive={false}
            connectNulls
          />
          <Area
            type="monotone"
            dataKey="confidence"
            name="自评置信度"
            stroke="var(--accent)"
            strokeWidth={1.75}
            fill="var(--accent)"
            fillOpacity={0.14}
            dot={false}
            activeDot={{ r: 2.5, fill: "var(--accent)", stroke: "none" }}
            isAnimationActive={false}
            connectNulls
          />

          {last?.confidence === null || last?.confidence === undefined ? null : (
            <ReferenceDot
              x={last.index}
              y={last.confidence}
              r={3}
              fill="var(--bg-canvas)"
              stroke="var(--accent)"
              strokeWidth={2}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

interface TooltipPayload {
  active?: boolean;
  label?: number | string;
  payload?: { payload: DecisionPoint }[];
}

/** The hover readout: the decision's id, then both series side by side. */
function ChartTooltipCard({ active, payload }: TooltipPayload) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="rounded-md border border-line bg-elevated px-2.5 py-1.5 text-micro">
      <p className="num m-0 mb-1 text-fg-3">
        第 {point.index} 次决策 · {point.decisionId}
      </p>
      <dl className="m-0 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
        <dt className="text-fg-3">自评置信度</dt>
        <dd className="num m-0 text-right text-fg">
          {point.confidence === null ? "—" : point.confidence.toFixed(2)}
        </dd>
        <dt className="text-fg-3">选项占比</dt>
        <dd className="num m-0 text-right text-fg">
          {point.chosenProbability === null ? "—" : formatPercent(point.chosenProbability)}
        </dd>
        <dt className="text-fg-3">延迟</dt>
        <dd className="num m-0 text-right text-fg">
          {point.latencyMs === null ? "—" : formatLatency(point.latencyMs)}
        </dd>
      </dl>
    </div>
  );
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}
