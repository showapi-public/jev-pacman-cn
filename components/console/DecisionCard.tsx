"use client";

import * as React from "react";

import { ActionCompass } from "@/components/console/ActionCompass";
import { ProbabilityBars } from "@/components/console/ProbabilityBars";
import { orderActions, type ConsoleInput } from "@/components/console/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { ActionId } from "@/lib/games/types";
import { formatLatency, formatPercent, formatValue } from "@/lib/ui";
import { cn } from "@/lib/utils";

/**
 * 正在发生的这次决策 —— 右栏的主角。
 *
 * 三档寄存器，按读者需要的顺序：*在哪*（动作盘，全应用唯一把动作画成箭头的地方）、
 * *多确定*（概率阶梯）、*凭什么*（事实表，默认折叠）。散文放最后且最小：兜底规则、
 * 失败原因。
 *
 * 事实表就是模型看到的东西。它渲染 `Question.facts` —— 与控制器装配请求时交给
 * 服务端的是**同一个对象**，服务端把它按 `${modelLabel}: ${value}` 拍平成 criteria
 * 交给模型。两边不可能漂移，因为只有一份。
 *
 * 动作可以在动作盘上选，也可以在阶梯上选，两处始终同步 —— 被选中的那一列就是事实表
 * 高亮的那一列。
 */

export interface DecisionCardProps {
  input: ConsoleInput;
}

export function DecisionCard({ input }: DecisionCardProps) {
  const snapshot = input.controller;
  const decision = input.records.at(-1) ?? null;
  const target = snapshot.target;

  const actions = decision?.legalActions?.length ? decision.legalActions : (target?.actions ?? []);
  const probabilities = decision?.probabilities ?? {};
  const hasProbabilities = Object.keys(probabilities).length > 0;
  const chosen = decision?.choice ?? decision?.applied ?? null;
  const source = decision?.source ?? null;
  const asking = snapshot.status === "REQUESTING";

  /*
   * 检视中的动作先跟着模型的答案，但点一下动作盘或阶梯就会把它改掉 —— 直到下一条
   * 决策到来，`id` 这道判断就是干这个的。每次决策都重挂组件会把检视中的点击丢掉；
   * 比较 id 不会。
   */
  const [picked, setPicked] = React.useState<{ id: string | null; action: ActionId } | null>(null);
  const decisionId = decision?.decisionId ?? null;
  const active = picked && picked.id === decisionId ? picked.action : chosen;

  const pick = (action: ActionId) => {
    setPicked({ id: decisionId, action });
    if (input.steerable) input.onSteer(action);
  };

  /*
   * 事实表跟着**它自己那条记录**：控制器把 `Question` 与 `decisionId` 一起留着，
   * 所以兜底、失败或别的决策留下的旧事实不会冒充这一次的（那会让读者以为模型
   * 看到的就是另一组数字）。id 对不上就明说没有，而不是拿旧表凑一张。
   */
  const framed = snapshot.lastQuestion;
  const facts = framed && framed.decisionId === decisionId ? framed.question.facts : null;
  const columns = orderActions(input.vocab, actions);

  const idleCopy =
    input.status === "GAME_OVER" || input.status === "CLEARED"
      ? `这一局已经结束，${input.place}之间不会再有新的决策了。`
      : input.steerable
        ? `手动驾驶中：用键盘控制${input.actor}，不向模型提问。`
        : `点击「开始」——第一个决策会在${input.actor}接近第一个${input.place}时出现。`;

  return (
    <div className="flex shrink-0 flex-col gap-3 px-3 pt-3">
      {snapshot.apiKeyMissing ? (
        <p className="m-0 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-micro text-fg-2">
          未配置 JEV API Key。每次决策都会改用兜底规则，右侧的置信度与概率不会产生数据。手动模式仍可正常使用。
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <ActionCompass
          vocab={input.vocab}
          actions={actions}
          selected={chosen}
          facing={target?.facing ?? null}
          source={source}
          asking={asking}
          probabilities={probabilities}
          onPick={actions.length === 0 ? undefined : pick}
          pickAction={input.steerable ? "steer" : "inspect"}
        />

        <div className="flex min-w-[180px] flex-1 flex-col gap-2">
          {actions.length === 0 ? (
            <p className="m-0 text-micro text-fg-3">{idleCopy}</p>
          ) : hasProbabilities ? (
            <ProbabilityBars
              vocab={input.vocab}
              actions={actions}
              probabilities={probabilities}
              selected={active}
              onSelect={pick}
            />
          ) : (
            <p className="m-0 text-micro text-fg-3">
              {source === "FALLBACK"
                ? "兜底动作：模型未能及时作答，游戏按内置规则继续，并记录该规则。"
                : "这次决策没有给出概率分布。"}
            </p>
          )}
        </div>
      </div>

      <dl className="m-0 min-h-9 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-micro">
        <Cell label="决策">
          {decision ? `#${decision.decisionId} · 世代 ${decision.epoch}` : "暂无决策"}
        </Cell>
        <Cell label={input.place}>
          {decision ? `(${decision.at?.x}, ${decision.at?.y})` : "—"}
          {target ? ` · 还差 ${target.distance.toFixed(1)} 格` : ""}
        </Cell>
        <Cell
          label="模型"
          title="这一条是谁答的（渠道或模型名）。— 表示本次压根没问模型：随机、启发式、录放，或兜底。"
        >
          {decision?.model ?? "—"}
        </Cell>
        <Cell label="来源" title="这一条是*怎么*答的：JEV / MOCK / RANDOM / HEURISTIC / SCRIPTED / FALLBACK。">
          {decision?.source ?? "—"}
        </Cell>
        <Cell label="选项占比">
          {active && probabilities[active] !== undefined ? formatPercent(probabilities[active]) : "—"}
        </Cell>
        <Cell label="自评置信度">
          {decision?.confidence != null ? formatValue(decision.confidence, 2) : "—"}
        </Cell>
        <Cell label="延迟">{decision?.latencyMs != null ? formatLatency(decision.latencyMs) : "—"}</Cell>
      </dl>

      {decision?.source === "FALLBACK" && decision.note ? (
        <p className="m-0 text-micro text-warn">兜底规则：{decision.note}</p>
      ) : null}
      {decision && decision.status !== "APPLIED" && decision.status !== "PENDING" && decision.note ? (
        <p className="m-0 text-micro text-fg-3">{decision.note}</p>
      ) : null}

      <Collapsible className="flex flex-col gap-2">
        <CollapsibleTrigger label="推理输入" className="w-fit border-t border-subtle pt-2" />
        <CollapsibleContent>
          {columns.length === 0 || facts === null ? (
            <p className="m-0 pb-3 text-micro text-fg-3">
              这一条没有对应的提问记录（可能是兜底，或还没开始提问）。
            </p>
          ) : (
            <div className="scroll-area max-h-[188px] rounded-md border border-subtle bg-inset">
              <table className="w-full border-collapse text-micro">
                <caption className="sr-only">
                  每个合法动作一列的共享事实。这张表与发送给模型的完全是同一份数据。
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="sticky top-0 z-1 bg-elevated px-2 py-1.5">
                      <span className="sr-only">指标</span>
                    </th>
                    {columns.map((action) => (
                      <th
                        key={action}
                        scope="col"
                        className={cn(
                          "num sticky top-0 z-1 bg-elevated px-2 py-1.5 text-right font-[510] whitespace-nowrap",
                          action === active ? "text-self" : "text-fg-3",
                        )}
                      >
                        {input.vocab.label(action)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {facts.map((row) => (
                    <tr key={row.label} className="border-t border-divider">
                      <th
                        scope="row"
                        className="px-2 py-1 text-left font-normal whitespace-nowrap text-fg-3"
                        title={row.modelLabel}
                      >
                        {row.label}
                      </th>
                      {columns.map((action) => (
                        <td
                          key={action}
                          className={cn(
                            "num px-2 py-1 text-right whitespace-nowrap",
                            action === active ? "bg-hover text-fg" : "text-fg-4",
                          )}
                        >
                          {row.values[action] ?? "—"}
                        </td>
                      ))}
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

/** 元信息里的一对 `label · value`，包在 div 里以便横向流式排布。 */
function Cell({
  label,
  title,
  children,
}: {
  label: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className={cn("label m-0 shrink-0", title && "cursor-help")} title={title}>
        {label}
      </dt>
      <dd className="num m-0 text-fg-2">{children}</dd>
    </div>
  );
}
