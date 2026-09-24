"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";

import { overDeadlineCount, type LatencyBucket } from "@/lib/agent/telemetry";

/**
 * Where the answer times land: one bar per fixed bucket.
 *
 * Buckets are fixed rather than derived from the data, so the same shape means
 * the same thing in every session — a chart whose axis moves while you watch it
 * cannot be compared to the session before.
 *
 * What moves instead is the *deadline*: the window a decision actually had is
 * `budgetMs ÷ speed`, so it arrives as a prop rather than being read from a
 * game constant the chart has no business knowing.
 */

const HEIGHT = 108;

export default function LatencyChart({
  buckets,
  deadlineMs,
}: {
  buckets: readonly LatencyBucket[];
  deadlineMs: number;
}) {
  // Same reasoning as the confidence chart: the numbers are in the tiles and the
  // counts list beside this, so the chart is a labelled image rather than a
  // nameless focusable `role="application"` surface.
  // The line is about "how many arrived too late", and it has to say so out
  // loud. Stating it in the label keeps the chart's conclusion where a reader
  // (or a screen reader) meets it, without colouring the bars and inventing a
  // second meaning for hue.
  //
  // It counts *buckets*, and says so: a bucket is marked late when its ceiling
  // is past the deadline, so at a speed where the deadline falls inside a bucket
  // rather than on its edge, "线外的分桶" holds answers on both sides of the
  // line. Claiming a per-record count here would be a number nobody computed.
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const late = overDeadlineCount(buckets);
  const peak = buckets.reduce<LatencyBucket | null>(
    (best, bucket) => (best === null || bucket.count > best.count ? bucket : best),
    null,
  );
  const summary =
    total === 0
      ? "延迟分布：本次会话还没有决策延迟可统计。"
      : `延迟分布，共 ${total} 次决策；最多的一档是 ${peak?.label} ms，共 ${peak?.count} 次；截止线约 ${Math.round(deadlineMs)} ms，线外的分桶里另有 ${late} 次。`;

  return (
    <div style={{ height: HEIGHT }} className="w-full" role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height="100%">
        {/* Same rule as the confidence chart: no negative left margin, or the
            end-anchored tick labels run off the canvas edge. */}
        <BarChart
          data={buckets as LatencyBucket[]}
          margin={{ top: 6, right: 4, bottom: 0, left: 0 }}
          accessibilityLayer={false}
        >
          <CartesianGrid vertical={false} stroke="var(--divider)" />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--text-quaternary)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border-subtle)" }}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "var(--text-quaternary)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={34}
          />
          <ChartTooltip
            cursor={{ fill: "var(--bg-hover)" }}
            content={<LatencyTooltip />}
          />
          <Bar
            dataKey="count"
            name="决策数"
            fill="var(--accent)"
            fillOpacity={0.55}
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
            maxBarSize={36}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface TooltipPayload {
  active?: boolean;
  payload?: { payload: LatencyBucket }[];
}

function LatencyTooltip({ active, payload }: TooltipPayload) {
  const bucket = payload?.[0]?.payload;
  if (!active || !bucket) return null;

  return (
    <div className="rounded-md border border-line bg-elevated px-2.5 py-1.5 text-micro">
      <span className="num text-fg">
        {bucket.label} ms · {bucket.count} 次
      </span>
    </div>
  );
}
