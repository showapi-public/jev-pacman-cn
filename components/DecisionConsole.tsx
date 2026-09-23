"use client";

import * as React from "react";

import { ConfidenceTrend } from "@/components/ConfidenceTrend";
import { DebugPane } from "@/components/DebugPane";
import { DecisionCard } from "@/components/DecisionCard";
import { DecisionTimeline } from "@/components/DecisionTimeline";
import { SessionStats } from "@/components/SessionStats";
import { Chip } from "@/components/ui/chip";
import { Panel, PanelActions, PanelDivider, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { decisionSeries, type DecisionPoint } from "@/lib/agent/telemetry";
import type { Direction } from "@/lib/game/types";
import { useMediaQuery } from "@/lib/use-media-query";
import { controllerStatus, formatLatency, formatPercent, type UiSnapshot } from "@/lib/ui";

/**
 * The right column: everything about the decision, and nothing else.
 *
 * The decision being made is always on screen — it is the thing worth watching
 * continuously — and the session registers share what is left over behind a tab
 * strip, one at a time. That is also what keeps the console to a single
 * scrollbar: expand the facts, and the list below gets shorter instead of a
 * second scrollbar appearing.
 *
 * The session chart is the one register that moves. On a tall viewport it has
 * room to sit permanently under the decision; on a short one it would starve the
 * history of every pixel it has — the panel loses 180px between a 900px and a
 * 720px window, and the chart's ~173px would come straight out of the list, whose
 * rows would end up below the fold entirely. So below the threshold the chart
 * folds into the strip as a tab of its own, and the history keeps its height.
 */

type ConsoleTab = "HISTORY" | "CONFIDENCE" | "METRICS" | "STATE";

/**
 * Above this viewport height the chart fits permanently.
 *
 * Derived from the column's own arithmetic rather than picked by eye. Measured,
 * the column is `viewport - 52px header - 32px padding` tall, and the panel
 * header (36), the decision card (~290, after compact dl layout) and its rule (1) take ~327 of that; the
 * chart register takes another 173. What is left is the tab strip's 32px trigger
 * row plus the history list. Three rows is the least that is still worth reading,
 * which needs 120px of list — so the chart keeps its own place from 780px of
 * viewport up, and folds into the strip below that.
 *
 * The threshold is in viewport pixels, not screen pixels: a 1440x900 display
 * gives Chrome about 813px of viewport, so calibrating against 900 would have
 * folded the chart on the most common laptop size there is.
 */
const CHART_STAYS_INLINE = "(min-height: 780px)";

export interface DecisionConsoleProps {
  ui: UiSnapshot;
  /** Manual mode: the compass steers rather than inspects. */
  steerable: boolean;
  debug: boolean;
  onSteer: (direction: Direction) => void;
}

export function DecisionConsole({ ui, steerable, debug, onSteer }: DecisionConsoleProps) {
  const snapshot = ui.controller;
  const latest = ui.feed[0] ?? null;
  const status = controllerStatus(snapshot);

  const chartInline = useMediaQuery(CHART_STAYS_INLINE, true);

  const [tab, setTab] = React.useState<ConsoleTab>("HISTORY");
  // A tab that is not in the strip would strand the reader on a view they cannot
  // get back to, so the derived value falls back rather than the tab state being
  // chased around by an effect — same as 状态 when debug is switched off, and the
  // same again for 置信度 when the window grows enough to give the chart its own
  // place back.
  const activeTab: ConsoleTab =
    (tab === "STATE" && !debug) || (tab === "CONFIDENCE" && chartInline) ? "HISTORY" : tab;

  const series = React.useMemo(() => decisionSeries(snapshot.telemetry), [snapshot.telemetry]);

  return (
    <Panel aria-label="Jev 决策可视化" className="min-h-0">
      <PanelHeader>
        <PanelTitle>Jev 决策</PanelTitle>
        <PanelActions>
          <span className="label num">{snapshot.telemetry.length} 条记录</span>
          <Chip tone={status.tone} dot role="status">
            {status.label}
          </Chip>
        </PanelActions>
      </PanelHeader>

      <DecisionCard
        snapshot={snapshot}
        decision={latest}
        steerable={steerable}
        onSteer={onSteer}
      />

      <PanelDivider className="mt-3" />
      {chartInline ? (
        <>
          <ConfidenceTrend points={series} recordCount={snapshot.telemetry.length} />
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
            {debug ? <TabsTrigger value="STATE">状态</TabsTrigger> : null}
          </TabsList>
          <span className="label num">
            {activeTab === "METRICS"
              ? `执行率 ${ui.metrics.appliedRate === null ? "—" : `${Math.round(ui.metrics.appliedRate * 100)}%`}`
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
            <DecisionTimeline records={ui.feed} />
          </div>
        </TabsContent>

        {chartInline ? null : (
          <TabsContent value="CONFIDENCE" className="min-h-0 flex-1">
            <div className="scroll-area h-full">
              <ConfidenceTrend points={series} recordCount={snapshot.telemetry.length} />
            </div>
          </TabsContent>
        )}

        <TabsContent value="METRICS" className="min-h-0 flex-1">
          <div className="scroll-area h-full">
            <SessionStats metrics={ui.metrics} records={snapshot.telemetry} />
          </div>
        </TabsContent>

        {debug ? (
          <TabsContent value="STATE" className="min-h-0 flex-1">
            <div className="scroll-area h-full">
              <DebugPane ui={ui} />
            </div>
          </TabsContent>
        ) : null}
      </Tabs>
    </Panel>
  );
}

/** The run's mean self-reported confidence, for the strip's readout. */
function meanConfidence(points: readonly DecisionPoint[]): string {
  const values = points
    .map((point) => point.confidence)
    .filter((value): value is number => value !== null);
  if (values.length === 0) return "—";
  return formatPercent(values.reduce((total, value) => total + value, 0) / values.length);
}
