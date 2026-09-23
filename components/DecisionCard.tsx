"use client";

import * as React from "react";

import { DirectionCompass } from "@/components/DirectionCompass";
import { ProbabilityBars } from "@/components/ProbabilityBars";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { ControllerSnapshot } from "@/lib/agent/controller";
import type { DecisionTelemetry } from "@/lib/agent/types";
import type { CandidateAnalysis } from "@/lib/game/analysis";
import type { Direction } from "@/lib/game/types";
import { DIRECTION_LABELS, formatLatency, formatPercent, formatValue } from "@/lib/ui";
import { cn } from "@/lib/utils";

/**
 * The decision being made right now — the panel's hero.
 *
 * Three registers, in the order a reader needs them: *where* (the compass, the
 * only place a direction is spelled as an arrow), *how strongly* (the ladder),
 * and *on what evidence* (the facts, folded away until asked for). Prose is the
 * last register and the smallest: a fallback's rule, a failure's reason.
 *
 * A direction can be picked in the compass or in the ladder, and the two stay
 * in step — the picked column is what the facts table highlights.
 */

/** The candidate facts, as rows so the legal moves can be compared down a column. */
const FACT_ROWS: { label: string; value: (candidate: CandidateAnalysis) => string }[] = [
  { label: "最近的豆子（格）", value: (c) => (c.nearestPelletDistance === null ? "—" : `${c.nearestPelletDistance}`) },
  { label: "6 格内的豆子数", value: (c) => `${c.pelletsWithin6Tiles}` },
  { label: "最近的能量豆（格）", value: (c) => (c.nearestPowerPelletDistance === null ? "—" : `${c.nearestPowerPelletDistance}`) },
  { label: "最近的危险幽灵（格）", value: (c) => (c.nearestDangerousGhostDistance === null ? "—" : `${c.nearestDangerousGhostDistance}`) },
  { label: "最近的受惊幽灵（格）", value: (c) => (c.nearestFrightenedGhostDistance === null ? "—" : `${c.nearestFrightenedGhostDistance}`) },
  { label: "可达安全格数", value: (c) => `${c.reachableSafeArea}` },
  { label: "是否死路", value: (c) => (c.deadEnd ? `是（${c.deadEndDepth ?? 1}）` : "否") },
  { label: "是否沿当前朝向", value: (c) => (c.continuesForward ? "是" : "否") },
];

export interface DecisionCardProps {
  snapshot: ControllerSnapshot;
  /** The newest record; null before the first junction. */
  decision: DecisionTelemetry | null;
  /** Manual mode: picking a direction turns Pac-Man instead of inspecting one. */
  steerable: boolean;
  onSteer?: (direction: Direction) => void;
}

export function DecisionCard({ snapshot, decision, steerable, onSteer }: DecisionCardProps) {
  const observation = snapshot.lastObservation;
  const target = snapshot.target;

  const directions: Direction[] = decision?.legalDirections?.length
    ? decision.legalDirections
    : (target?.legalDirections ?? []);

  const probabilities = decision?.probabilities ?? {};
  const hasProbabilities = Object.keys(probabilities).length > 0;
  const chosen = decision?.choice ?? decision?.applied ?? null;
  const source = decision?.source ?? null;
  const asking = snapshot.status === "REQUESTING";

  /*
   * The inspected direction follows Jev's answer, but a click on the compass or
   * the ladder overrides it — until the next decision arrives, which is what the
   * `id` guard is for. Remounting on every decision would throw away the click
   * mid-inspection; comparing ids does not.
   */
  const [picked, setPicked] = React.useState<{ id: string | null; direction: Direction } | null>(null);
  const decisionId = decision?.decisionId ?? null;
  const active = picked && picked.id === decisionId ? picked.direction : chosen;

  const candidates = observation?.candidates;

  const pick = (direction: Direction) => {
    setPicked({ id: decisionId, direction });
    if (steerable) onSteer?.(direction);
  };

  return (
    <div className="flex shrink-0 flex-col gap-3 px-3 pt-3">
      {snapshot.apiKeyMissing ? (
        <p className="m-0 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-micro text-fg-2">
          未配置 JEV API Key。每个路口都会改用兜底规则，右侧的置信度与概率不会产生数据。手动模式仍可正常使用。
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <DirectionCompass
          legalDirections={directions}
          selected={chosen}
          heading={target?.heading ?? observation?.pacman.heading ?? null}
          source={source}
          asking={asking}
          probabilities={probabilities}
          onPick={directions.length === 0 ? undefined : pick}
          pickAction={steerable ? "steer" : "inspect"}
        />

        <div className="flex min-w-[180px] flex-1 flex-col gap-2">
          {directions.length === 0 ? (
            <p className="m-0 text-micro text-fg-3">
              {steerable
                ? "手动驾驶中：用方向键控制吃豆人，不向 Jev 提问。"
                : "点击「开始」——第一个决策会在吃豆人接近第一个路口时出现。"}
            </p>
          ) : hasProbabilities ? (
            <ProbabilityBars
              directions={directions}
              probabilities={probabilities}
              selected={active}
              onSelect={pick}
            />
          ) : (
            <p className="m-0 text-micro text-fg-3">
              {source === "FALLBACK"
                ? "兜底动作：Jev 未能及时作答，游戏按内置规则继续，并记录该规则。"
                : "这次决策 Jev 没有给出概率分布。"}
            </p>
          )}
        </div>
      </div>

      <dl className="m-0 min-h-8 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-micro">
        <Cell label="决策">
          {decision ? `#${decision.decisionId} · 世代 ${decision.epoch}` : "暂无决策"}
        </Cell>
        <Cell label="路口">
          {decision ? `(${decision.junction.x}, ${decision.junction.y})` : "—"}
          {target ? ` · 还差 ${target.tilesAway.toFixed(1)} 格` : ""}
        </Cell>
        <Cell label="延迟">{decision?.latencyMs != null ? formatLatency(decision.latencyMs) : "—"}</Cell>
        <Cell label="选项占比">
          {active && probabilities[active] !== undefined ? formatPercent(probabilities[active]) : "—"}
        </Cell>
        <Cell label="自评置信度">
          {decision?.confidence != null ? formatValue(decision.confidence, 2) : "—"}
        </Cell>
        <Cell label="来源">{decision?.source ?? "—"}</Cell>
      </dl>

      {decision?.source === "FALLBACK" && decision.note ? (
        <p className="m-0 text-micro text-warn">兜底规则：{decision.note}</p>
      ) : null}
      {decision && decision.status !== "APPLIED" && decision.status !== "PENDING" && decision.note ? (
        <p className="m-0 text-micro text-fg-3">{decision.note}</p>
      ) : null}

      <Collapsible className="flex flex-col gap-2">
        <CollapsibleTrigger
          label="推理输入"
          className="w-fit border-t border-subtle pt-2"
        />
        <CollapsibleContent>
          {directions.length === 0 || !candidates ? (
            <p className="m-0 pb-3 text-micro text-fg-3">
              尚未发起提问，或该记录已不在最近一次观测中。
            </p>
          ) : (
            <div className="scroll-area max-h-[188px] rounded-md border border-subtle bg-inset">
              <table className="w-full border-collapse text-micro">
                <caption className="sr-only">每个合法方向的候选事实，每个方向一列。</caption>
                <thead>
                  <tr>
                    <th scope="col" className="sticky top-0 z-1 bg-elevated px-2 py-1.5">
                      <span className="sr-only">指标</span>
                    </th>
                    {directions.map((direction) => (
                      <th
                        key={direction}
                        scope="col"
                        className={cn(
                          "num sticky top-0 z-1 bg-elevated px-2 py-1.5 text-right font-[510] whitespace-nowrap",
                          direction === active ? "text-pacman" : "text-fg-3",
                        )}
                      >
                        {DIRECTION_LABELS[direction]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FACT_ROWS.map((row) => (
                    <tr key={row.label} className="border-t border-divider">
                      <th
                        scope="row"
                        className="px-2 py-1 text-left font-normal whitespace-nowrap text-fg-3"
                      >
                        {row.label}
                      </th>
                      {directions.map((direction) => {
                        const candidate = candidates[direction];
                        return (
                          <td
                            key={direction}
                            className={cn(
                              "num px-2 py-1 text-right whitespace-nowrap",
                              direction === active
                                ? "bg-hover text-fg"
                                : "text-fg-4",
                            )}
                          >
                            {candidate ? row.value(candidate) : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

/** One `label · value` pair of the decision's metadata, wrapped in a div for flex flow. */
function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="label m-0 shrink-0">{label}</dt>
      <dd className="num m-0 text-fg-2">{children}</dd>
    </div>
  );
}
