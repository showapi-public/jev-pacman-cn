"use client";

import dynamic from "next/dynamic";

import type { ConsoleInput } from "@/components/console/input";
import { DECISION_TIMEOUT_MS } from "@/lib/agent/controller";
import { decisionWindowMs, latencyHistogram } from "@/lib/agent/telemetry";
import { formatLatency, formatPercent } from "@/lib/ui";

/**
 * 这一局的数字，按它们回答的问题分组。
 *
 * 四块瓷砖是扫一眼就值得读的那四个 —— 答案落地了吗、有多慢、多少次靠兜底 —— 其余的
 * 都是计数，而计数属于列表，不属于另外八块瓷砖：一堵等大的数字墙会把真正重要的两个
 * 淹掉。
 *
 * 两个时限不是一回事，图上那条线和「超时」那一行因此必须分开说：
 * **可用窗口 = `budgetMs ÷ speed`**，它决定答案还能不能用，速度越快窗口越小；
 * `DECISION_TIMEOUT_MS` 只决定还要不要继续等，不随速度变。直方图的**分桶边**固定在
 * 1× 的参照系上（跨局、跨游戏才可比），动的只有那条截止线。
 */

const LatencyChart = dynamic(() => import("@/components/charts/LatencyChart"), {
  ssr: false,
  loading: () => <div aria-hidden="true" className="h-27 animate-pulse rounded-md bg-white/[0.03]" />,
});

export interface SessionStatsProps {
  input: ConsoleInput;
}

export function SessionStats({ input }: SessionStatsProps) {
  const metrics = input.metrics;
  // 这条线是「答案还来不来得及」的唯一口径：分桶边不动，它随着速度压缩。
  const deadlineMs = decisionWindowMs(input.budgetMs, input.speed);
  const buckets = latencyHistogram(input.records, deadlineMs);
  const measured = buckets.reduce((total, bucket) => total + bucket.count, 0);
  const rate = metrics.appliedRate ?? 0;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <StatTile
          label="执行率"
          hint={`模型的答案在${input.actor}抵达${input.place}之前送到、并被采纳的比例。`}
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
          hint="模型没能交出可用答案、改由内置规则接手的次数：答晚了、没答上来（含没配 API Key），或者答得不合法，都会记在这里。"
          value={String(metrics.fallbacks)}
        />
      </div>

      <div>
        {/* 分桶边是固定的 1× 参照系，动的是截止线，所以这一行必须写出当前是多少毫秒 ——
            否则读者没有任何办法知道那条分界意味着什么，也不知道它随速度变过。 */}
        <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
          <h4 className="label m-0 label-strong">延迟分布</h4>
          <span className="label text-fg-3">
            截止约 <span className="num">{Math.round(deadlineMs)}</span> ms
            {input.speed === 1 ? null : (
              <span className="num">
                （1× 基准 {input.budgetMs} ms ÷ {input.speed}×）
              </span>
            )}
          </span>
        </div>
        {measured === 0 ? (
          <p className="m-0 rounded-md border border-subtle bg-inset px-3 py-4 text-center text-micro text-fg-3">
            还没有可测量的请求。
          </p>
        ) : (
          <LatencyChart buckets={buckets} deadlineMs={deadlineMs} />
        )}
      </div>

      <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0 text-micro">
        <Row label="模型请求数" hint="本局向模型发出的决策请求总数，含没答上来的。" value={metrics.requests} />
        <Row
          label="已执行"
          hint={`答案合法且在时限内抵达、真正驱动了${input.actor}的次数。`}
          value={metrics.applied}
        />
        <Row
          label="过期回答"
          hint="作废掉的决策：答案来晚了，或者在它落地之前就被换模式、换决策点打断。"
          value={metrics.stale}
        />
        {/* 超时 is the abort at DECISION_TIMEOUT_MS — a *different* limit from the
            deadline the histogram above is cut at. Interpolate both: a hardcoded
            1500 would be a second source of truth, and would drift. */}
        <Row
          label="超时"
          hint={`等到 ${DECISION_TIMEOUT_MS} ms 仍未收到答案、请求被彻底放弃。它比 ${Math.round(deadlineMs)} ms 的可用窗口长得多：答案越过可用窗口就已经不能被采纳，而这个上限只决定还要不要继续等。`}
          value={metrics.timeouts}
        />
        <Row
          label="错误"
          hint="没拿到可用答案：连接失败、模型侧报错或限流、没配置 API Key，以及返回的答案没通过校验（编号不符、不是合法动作）。"
          value={metrics.errors}
        />
        <Row
          label="无效"
          hint="控制器自己拒收的答案：动作不在合法范围内，或编号对不上。客户端会先校验一遍，所以实战里通常一直是 0。"
          value={metrics.invalid}
        />
        <Row
          label="p50 延迟"
          hint="排序后取中间那个样本（样本为偶数时取下偏的那个）。"
          value={formatLatency(metrics.p50LatencyMs ?? Number.NaN)}
        />
        <Row
          label="待处理"
          hint="还没落地的请求：正在询问模型的，加上答案已到手、还没在决策点被采纳或作废的 —— 后一种在决策列表里显示为「已到手」，不是「询问中」。"
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
