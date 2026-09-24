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

import type { SeriesPoint } from "@/lib/agent/telemetry";
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
  points: readonly SeriesPoint[];
}

/**
 * The minimum span the x axis must show (in decision-index units) so that a
 * session with only a couple of data points does not stretch them across the
 * full width.  Data fills from left to right, and once the span exceeds this
 * value the axis grows naturally.  When the series window slides (old points
 * are dropped by `decisionSeries`), the axis slides with it.
 */
const MIN_X_SPAN = 20;

export default function ConfidenceChart({ points }: ConfidenceChartProps) {
  const last = points.at(-1);
  const meanConfidence = mean(
    points.map((point) => point.confidence).filter((value): value is number => value !== null),
  );

  const firstIdx = points[0]?.index ?? 1;
  const lastIdx = last?.index ?? 1;
  const span = lastIdx - firstIdx;
  const displaySpan = Math.max(span, MIN_X_SPAN);
  const xDomainEnd = firstIdx + displaySpan;

  const tickStep = displaySpan > 40 ? 10 : 5;
  const xTicks: number[] = [];
  const tickStart = Math.ceil(firstIdx / tickStep) * tickStep;
  for (let t = Math.max(tickStart, tickStep); t <= xDomainEnd; t += tickStep) {
    xTicks.push(t);
  }

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
          data={points as SeriesPoint[]}
          margin={{ top: 8, right: 10, bottom: 0, left: 0 }}
          accessibilityLayer={false}
        >
          <CartesianGrid vertical={false} stroke="var(--divider)" />
          <XAxis
            dataKey="index"
            type="number"
            domain={[firstIdx, xDomainEnd]}
            tick={{ fill: "var(--text-quaternary)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border-subtle)" }}
            ticks={xTicks}
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
            tick={{ fill: "var(--text-quaternary)", fontSize: 11 }}
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

          {/* 选项占比画的是「本局主体」的分数，所以它用自身色 `--self` —— 换游戏
              （吃豆人琥珀 / 蛇头绿）只换外壳上那一个变量，这张图不知道是哪个游戏。 */}
          <Area
            type="monotone"
            dataKey="chosenProbability"
            name="选项占比"
            stroke="var(--self)"
            strokeWidth={1.25}
            strokeOpacity={0.75}
            fill="var(--self)"
            fillOpacity={0.08}
            dot={false}
            activeDot={{ r: 2.5, fill: "var(--self)", stroke: "none" }}
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
  payload?: { payload: SeriesPoint }[];
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
