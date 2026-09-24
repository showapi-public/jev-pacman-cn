"use client";

import * as React from "react";

import { ConfidenceTrend } from "@/components/console/ConfidenceTrend";
import { DebugPane } from "@/components/console/DebugPane";
import { DecisionCard } from "@/components/console/DecisionCard";
import { DecisionTimeline } from "@/components/console/DecisionTimeline";
import { SessionStats } from "@/components/console/SessionStats";
import type { ConsoleInput } from "@/components/console/input";
import { Chip } from "@/components/ui/chip";
import { Panel, PanelActions, PanelDivider, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { decisionSeries, type SeriesPoint } from "@/lib/agent/telemetry";
import { useMediaQuery } from "@/lib/use-media-query";
import { controllerStatus, formatLatency, formatPercent } from "@/lib/ui";

/**
 * 右栏：关于决策的一切，别的什么都不放。
 *
 * 正在发生的那一次决策永远在屏幕上 —— 它是唯一值得持续盯着的东西 —— 而这一局的
 * 账目放在一条页签后面，一次只给一个。这也是右栏只有一个滚动条的原因：展开事实表，
 * 下面的列表变短，而不是冒出第二个滚动条。
 *
 * 会话曲线是唯一会动的寄存器。视口高的时候它有地方常驻在决策卡下面；矮视口下它会
 * 把历史列表的每一个像素都吃掉 —— 面板在 900px 与 720px 的窗口之间少掉 180px，
 * 而曲线那 ~173px 会直接从列表里出，列表的行会整段掉到折线以下。所以低于阈值时曲线
 * 折进页签里，历史保住自己的高度。
 */

type ConsoleTab = "HISTORY" | "CONFIDENCE" | "METRICS" | "STATE";

/**
 * Above this viewport height the chart fits permanently.
 *
 * Derived from the column's own arithmetic rather than picked by eye. Measured
 * at 813px of viewport, the column is `viewport - 52px header - 32px padding`
 * tall, and the fixed registers inside it take, from the top: the panel header
 * (36), the decision card with its rule (289), the chart register (178) and the
 * tab strip (36). What is left is the history list — 190px there, i.e. 5.5 rows
 * at the measured 34.4px row. Three rows (103px) is the least still worth
 * reading, which the inline chart drops below at 726px of viewport; the
 * threshold sits at 780 to keep a visible margin of roughly a row and a half
 * over that floor instead of landing on it exactly.
 *
 * The threshold is in viewport pixels, not screen pixels: a 1440x900 display
 * gives Chrome about 813px of viewport, so calibrating against 900 would have
 * folded the chart on the most common laptop size there is.
 */
const CHART_STAYS_INLINE = "(min-height: 780px)";

export interface DecisionConsoleProps {
  /** 右栏的全部输入 —— 零游戏知识，见 `components/console/input.ts`。 */
  input: ConsoleInput;
}

export function DecisionConsole({ input }: DecisionConsoleProps) {
  const snapshot = input.controller;
  const records = input.records;
  const latest = records.at(-1) ?? null;
  const status = controllerStatus(snapshot);

  const chartInline = useMediaQuery(CHART_STAYS_INLINE, true);

  const [tab, setTab] = React.useState<ConsoleTab>("HISTORY");
  // A tab that is not in the strip would strand the reader on a view they cannot
  // get back to, so the derived value falls back rather than the tab state being
  // chased around by an effect — same as 状态 when debug is switched off, and the
  // same again for 置信度 when the window grows enough to give the chart its own
  // place back.
  const activeTab: ConsoleTab =
    (tab === "STATE" && !input.debug) || (tab === "CONFIDENCE" && chartInline) ? "HISTORY" : tab;

  const series = React.useMemo(() => decisionSeries(records), [records]);

  return (
    <Panel aria-label="模型决策可视化" className="min-h-0">
      <PanelHeader>
        <PanelTitle>模型决策</PanelTitle>
        <PanelActions>
          <span className="label num">{records.length} 条记录</span>
          <Chip tone={status.tone} dot role="status">
            {status.label}
          </Chip>
        </PanelActions>
      </PanelHeader>

      <DecisionCard input={input} />

      <PanelDivider className="mt-3" />
      {chartInline ? (
        <>
          <ConfidenceTrend points={series} recordCount={records.length} />
          <PanelDivider />
        </>
      ) : null}

      <Tabs
        value={activeTab}
        onValueChange={(value) => setTab(value as ConsoleTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-subtle px-3">
          <TabsList aria-label="决策区视图">
            <TabsTrigger value="HISTORY">决策历史</TabsTrigger>
            {chartInline ? null : <TabsTrigger value="CONFIDENCE">置信度</TabsTrigger>}
            <TabsTrigger value="METRICS">指标</TabsTrigger>
            {input.debug ? <TabsTrigger value="STATE">状态</TabsTrigger> : null}
          </TabsList>
          <span className="label num">
            {activeTab === "METRICS"
              ? `执行率 ${input.metrics.appliedRate === null ? "—" : `${Math.round(input.metrics.appliedRate * 100)}%`}`
              : activeTab === "STATE"
                ? "原始 JSON"
                : activeTab === "CONFIDENCE"
                  ? series.length === 0
                    ? "本轮策略不产出置信度"
                    : `均值 ${meanConfidence(series)}`
                  : `最新 ${formatLatency(latest?.latencyMs ?? Number.NaN)}`}
          </span>
        </div>

        <TabsContent value="HISTORY" className="min-h-0 flex-1">
          <div className="scroll-area h-full">
            <DecisionTimeline input={input} />
          </div>
        </TabsContent>

        {chartInline ? null : (
          <TabsContent value="CONFIDENCE" className="min-h-0 flex-1">
            <div className="scroll-area h-full">
              <ConfidenceTrend points={series} recordCount={records.length} />
            </div>
          </TabsContent>
        )}

        <TabsContent value="METRICS" className="min-h-0 flex-1">
          <div className="scroll-area h-full">
            <SessionStats input={input} />
          </div>
        </TabsContent>

        {input.debug ? (
          <TabsContent value="STATE" className="min-h-0 flex-1">
            <div className="scroll-area h-full">
              <DebugPane input={input} />
            </div>
          </TabsContent>
        ) : null}
      </Tabs>
    </Panel>
  );
}

/** The run's mean self-reported confidence, for the strip's readout. */
function meanConfidence(points: readonly SeriesPoint[]): string {
  const values = points
    .map((point) => point.confidence)
    .filter((value): value is number => value !== null);
  if (values.length === 0) return "—";
  return formatPercent(values.reduce((total, value) => total + value, 0) / values.length);
}
