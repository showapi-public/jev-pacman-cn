"use client";

import dynamic from "next/dynamic";

import type { Metrics } from "@/lib/agent/telemetry";
import { latencyHistogram } from "@/lib/agent/telemetry";
import type { DecisionTelemetry } from "@/lib/agent/types";
import { DECISION_DEADLINE_MS, DECISION_TIMEOUT_MS } from "@/lib/games/pacman/types";
import { formatLatency, formatPercent } from "@/lib/ui";

/**
 * The session numbers, grouped by the question they answer.
 *
 * The four tiles are the ones worth reading at a glance — did the answers land,
 * how slow were they, how often did the console have to fly blind. Everything
 * else is a count, and counts belong in a list, not in eight more tiles: a wall
 * of equal-sized numbers hides the two that matter.
 */

const LatencyChart = dynamic(() => import("@/components/charts/LatencyChart"), {
  ssr: false,
  loading: () => <div aria-hidden="true" className="h-27 animate-pulse rounded-md bg-white/[0.03]" />,
});

export interface SessionStatsProps {
  metrics: Metrics;
  records: readonly DecisionTelemetry[];
}

export function SessionStats({ metrics, records }: SessionStatsProps) {
  const buckets = latencyHistogram(records);
  const measured = buckets.reduce((total, bucket) => total + bucket.count, 0);
  const rate = metrics.appliedRate ?? 0;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <StatTile
          label="执行率"
          hint="Jev 的答案在吃豆人抵达路口之前送到、并被采纳的比例。"
          value={metrics.appliedRate === null ? "—" : formatPercent(metrics.appliedRate)}
          bar={rate}
        />
        <StatTile
          label="平均延迟"
          hint="从发出请求到收到答案的平均耗时。"
          value={formatLatency(metrics.meanLatencyMs ?? Number.NaN)}
        />
        <StatTile
          label="p95 延迟"
          hint="排序后取 95% 位置的那个样本；它比平均值更能暴露慢请求。样本不足 20 条时，它就是最慢的那一次。"
          value={formatLatency(metrics.p95LatencyMs ?? Number.NaN)}
        />
        <StatTile
          label="兜底次数"
          hint="Jev 没能交出可用答案、改由内置规则接手的方向选择次数：答晚了、没答上来（含没配 API Key），或者答得不合法，都会记在这里。"
          value={String(metrics.fallbacks)}
        />
      </div>

      <div>
        {/* The bucket edge is the deadline, so say which edge it is: without this
            a reader has no way to know the split means anything. */}
        <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
          <h4 className="label m-0 label-strong">延迟分布</h4>
          <span className="label text-fg-3">截止约 {DECISION_DEADLINE_MS} ms</span>
        </div>
        {measured === 0 ? (
          <p className="m-0 rounded-md border border-subtle bg-inset px-3 py-4 text-center text-micro text-fg-3">
            还没有可测量的请求。
          </p>
        ) : (
          <LatencyChart buckets={buckets} />
        )}
      </div>

      <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0 text-micro">
        <Row label="Jev 请求数" hint="本局向 Jev 发出的决策请求总数。" value={metrics.requests} />
        <Row label="已执行" hint="答案合法且在时限内抵达、真正驱动了吃豆人的次数。" value={metrics.applied} />
        <Row
          label="过期回答"
          hint="作废掉的决策：答案来晚了，或者在它落地之前就被换模式、换路口打断。"
          value={metrics.stale}
        />
        {/* 超时 is the abort at DECISION_TIMEOUT_MS — a *different* limit from the
            deadline the histogram above is cut at. Interpolate both: a hardcoded
            1500 would be a second source of truth, and would drift. */}
        <Row
          label="超时"
          hint={`等到 ${DECISION_TIMEOUT_MS} ms 仍未收到答案、请求被彻底放弃。它比 ${DECISION_DEADLINE_MS} ms 的可用窗口长得多：答案越过可用窗口就已经不能被采纳，而这个上限只决定还要不要继续等。`}
          value={metrics.timeouts}
        />
        <Row
          label="错误"
          hint="没拿到可用答案：连接失败、Jev 报错或限流、没配置 API Key，以及返回的答案没通过校验（编号不符、不是合法方向）。"
          value={metrics.errors}
        />
        <Row
          label="无效"
          hint="控制器自己拒收的答案：方向不在合法范围内，或编号对不上。客户端会先校验一遍，所以实战里通常一直是 0。"
          value={metrics.invalid}
        />
        <Row
          label="p50 延迟"
          hint="排序后取中间那个样本（样本为偶数时取下偏的那个）。"
          value={formatLatency(metrics.p50LatencyMs ?? Number.NaN)}
        />
        <Row
          label="待处理"
          hint="还没落地的请求：正在询问 Jev 的，加上答案已到手、还没在路口被采纳或作废的 —— 后一种在决策列表里显示为「已到手」，不是「询问中」。"
          value={metrics.pending}
        />
      </dl>
    </div>
  );
}

interface StatTileProps {
  label: string;
  hint: string;
  value: string;
  /** 0–1: draws the value as a bar under the number. */
  bar?: number;
}

/** One headline number, with the answer to "what does that mean" on hover. */
function StatTile({ label, hint, value, bar }: StatTileProps) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-subtle bg-inset px-3 py-2.5">
      <span className="label cursor-help" title={hint}>
        {label}
      </span>
      <span className="num text-kpi text-fg">{value}</span>
      {bar === undefined ? null : (
        <span aria-hidden="true" className="h-1 overflow-hidden rounded-pill bg-white/[0.06]">
          <span
            className="block h-full rounded-pill bg-ok transition-[width] duration-[var(--dur)] ease-swift"
            style={{ width: `${Math.round(Math.min(1, Math.max(0, bar)) * 100)}%` }}
          />
        </span>
      )}
    </div>
  );
}

interface RowProps {
  label: string;
  hint: string;
  value: number | string;
}

function Row({ label, hint, value }: RowProps) {
  return (
    <>
      <dt className="cursor-help border-t border-divider py-1.5 text-fg-3" title={hint}>
        {label}
      </dt>
      <dd className="num m-0 border-t border-divider py-1.5 text-right text-fg">{value}</dd>
    </>
  );
}
