"use client";

import dynamic from "next/dynamic";

import type { SeriesPoint } from "@/lib/agent/telemetry";
import { formatPercent } from "@/lib/ui";

/**
 * The session confidence chart, as a panel register.
 *
 * The chart itself is loaded on demand: it is the only thing in the app that
 * pulls in a charting library, and the console must paint before it arrives.
 *
 * There are two different reasons for an empty chart, and they need different
 * sentences. Before the first decision there is genuinely nothing to plot. But
 * the baseline players — 随机 and 启发式 — exist to be the yardstick Jev is
 * measured against, so they deliberately report no self-assessed confidence and
 * no probability distribution; run one of those for a whole game and the chart
 * stays empty with dozens of decisions behind it. Saying "尚未有决策数据" there
 * is simply false, and it reads as a broken panel. So the count of recorded
 * decisions, not just the count of plottable points, decides the copy.
 */

const ConfidenceChart = dynamic(() => import("@/components/charts/ConfidenceChart"), {
  ssr: false,
  loading: () => <div aria-hidden="true" className="h-32 w-full animate-pulse rounded-md bg-white/[0.03]" />,
});

export interface ConfidenceTrendProps {
  points: readonly SeriesPoint[];
  /**
   * Every decision in the session, including the ones that carry neither a
   * confidence nor a probability and are therefore absent from `points`.
   */
  recordCount: number;
}

export function ConfidenceTrend({ points, recordCount }: ConfidenceTrendProps) {
  const latest = [...points].reverse().find((point) => point.confidence !== null)?.confidence ?? null;
  const average = mean(
    points.map((point) => point.confidence).filter((value): value is number => value !== null),
  );

  return (
    <section aria-labelledby="confidence-heading" className="shrink-0 px-3 pt-2.5 pb-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <h3 id="confidence-heading" className="label m-0 label-strong">
          整局置信度
        </h3>
        {/* The legend keys a series that does not exist yet; showing it above an
            empty plate just adds two unexplained dots to read past. */}
        {points.length === 0 ? null : (
          <p className="m-0 flex items-center gap-3 text-micro text-fg-3">
            <LegendKey color="var(--accent)" label="自评置信度" />
            <LegendKey color="var(--self)" label="选项占比" />
            <span className="num">
              均值 {average === null ? "—" : formatPercent(average)}
              {latest === null ? null : (
                <>
                  {" · 最新 "}
                  {formatPercent(latest)}
                </>
              )}
            </span>
          </p>
        )}
      </div>

      {points.length > 0 ? (
        <ConfidenceChart points={points} />
      ) : recordCount === 0 ? (
        <p className="m-0 rounded-md border border-subtle bg-inset px-3 py-6 text-center text-micro text-fg-3">
          尚未有决策数据。开始游戏后，这里会按决策顺序画出 Jev 的自评置信度。
        </p>
      ) : (
        <p className="m-0 rounded-md border border-subtle bg-inset px-3 py-6 text-center text-micro text-fg-3">
          这 {recordCount} 条决策都来自本地基线策略（随机 / 启发式），它们只给出方向，
          不给出自评置信度与概率分布——这条曲线画的是 Jev 的自我判断。切到 Jev 模式再开一局即可看到。
        </p>
      )}
    </section>
  );
}

function LegendKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-fg-3">
      <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}
