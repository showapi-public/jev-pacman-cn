"use client";

import type { ConsoleInput } from "@/components/console/input";
import { formatMs } from "@/lib/ui";

/**
 * `?debug=1` 背后的一切，集中在一处。
 *
 * 这个页签存在的意义是回答「它为什么这么走」—— 正在瞄准的决策点、还在路上的请求、
 * 刚刚落地的几步，以及发给模型的原始 JSON。它不属于设计的一部分；它是设计看起来
 * 不对时你会打开的那件仪器。
 */

export interface DebugPaneProps {
  input: ConsoleInput;
}

export function DebugPane({ input }: DebugPaneProps) {
  const snapshot = input.controller;
  const pending = snapshot.telemetry.find((record) => record.status === "PENDING") ?? null;
  const label = (action: string | null) => (action === null ? "—" : input.vocab.label(action));

  return (
    <div className="flex flex-col gap-3 p-3">
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-micro">
        <dt className="label m-0">目标{input.place}</dt>
        <dd className="num m-0 text-fg-2">
          {snapshot.target
            ? `(${snapshot.target.at?.x}, ${snapshot.target.at?.y}) · 朝向 ${label(
                snapshot.target.facing,
              )} · 合法动作 ${snapshot.target.actions.map((action) => label(action)).join(" ")} · 还差 ${snapshot.target.distance.toFixed(2)} 格`
            : "无"}
        </dd>

        <dt className="label m-0">待处理请求</dt>
        <dd className="num m-0 text-fg-2">
          {pending ? `${pending.decisionId}（${snapshot.status}）` : "无"}
        </dd>

        <dt className="label m-0">最近决策</dt>
        <dd className="num m-0 text-fg-2">
          {snapshot.recentDecisions.length === 0
            ? "无"
            : snapshot.recentDecisions
                .map((record) => `(${record.at?.x},${record.at?.y}) ${label(record.action)}`)
                .join(" → ")}
        </dd>

        <dt className="label m-0">世代</dt>
        <dd className="num m-0 text-fg-2">
          {snapshot.epoch} · 格子覆盖层 {snapshot.target ? "开" : "关"} · 已运行{" "}
          {formatMs(input.playTimeMs)}
        </dd>
      </dl>

      <div className="flex flex-col gap-1">
        <h4 className="label m-0 label-strong">最近游戏事件</h4>
        <ol className="m-0 flex list-none flex-col gap-0.5 p-0 num text-micro text-fg-3">
          {input.events.length === 0 ? (
            <li>暂无游戏事件。</li>
          ) : (
            input.events.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)
          )}
        </ol>
      </div>

      <div className="flex flex-col gap-1">
        <h4 className="label m-0 label-strong">发送给模型的原始状态</h4>
        <pre className="num m-0 rounded-md border border-subtle bg-inset p-2.5 text-micro leading-relaxed whitespace-pre-wrap text-fg-2">
          {snapshot.lastObservation
            ? JSON.stringify(snapshot.lastObservation, null, 2)
            : `点击「开始」——第一份观测数据会在${input.actor}抵达第一个${input.place}之前发出。`}
        </pre>
      </div>
    </div>
  );
}
