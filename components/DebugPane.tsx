"use client";

import { DIRECTION_LABELS, formatMs, type UiSnapshot } from "@/lib/ui";

/**
 * Everything behind `?debug=1`, in one place.
 *
 * This register exists to answer "why did it do that" — the junction it is
 * aiming at, the request still in flight, the last few committed turns, and the
 * exact JSON that was sent to Jev. It is not part of the design; it is the
 * instrument you open when the design looks wrong.
 */

export interface DebugPaneProps {
  ui: UiSnapshot;
}

export function DebugPane({ ui }: DebugPaneProps) {
  const snapshot = ui.controller;
  const pending = snapshot.telemetry.find((record) => record.status === "PENDING") ?? null;

  return (
    <div className="flex flex-col gap-3 p-3">
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-micro">
        <dt className="label m-0">目标路口</dt>
        <dd className="num m-0 text-fg-2">
          {snapshot.target
            ? `(${snapshot.target.junction.x}, ${snapshot.target.junction.y}) · 朝向 ${
                DIRECTION_LABELS[snapshot.target.heading]
              } · 合法方向 ${snapshot.target.legalDirections
                .map((direction) => DIRECTION_LABELS[direction])
                .join(" ")} · 还差 ${snapshot.target.tilesAway.toFixed(2)} 格`
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
                .map(
                  (record) =>
                    `(${record.junction.x},${record.junction.y}) ${DIRECTION_LABELS[record.chosen]}`,
                )
                .join(" → ")}
        </dd>

        <dt className="label m-0">世代</dt>
        <dd className="num m-0 text-fg-2">
          {snapshot.epoch} · 格子覆盖层 {snapshot.target ? "开" : "关"} · 已运行 {formatMs(ui.playTimeMs)}
        </dd>
      </dl>

      <div className="flex flex-col gap-1">
        <h4 className="label m-0 label-strong">最近游戏事件</h4>
        <ol className="m-0 flex list-none flex-col gap-0.5 p-0 num text-micro text-fg-3">
          {ui.events.length === 0 ? (
            <li>暂无游戏事件。</li>
          ) : (
            ui.events.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)
          )}
        </ol>
      </div>

      <div className="flex flex-col gap-1">
        <h4 className="label m-0 label-strong">发送给 Jev 的原始状态</h4>
        <pre className="num m-0 rounded-md border border-subtle bg-inset p-2.5 text-micro leading-relaxed whitespace-pre-wrap text-fg-2">
          {snapshot.lastObservation
            ? JSON.stringify(snapshot.lastObservation, null, 2)
            : "点击「开始」——第一个观测数据会在吃豆人抵达第一个路口前三格时发出。"}
        </pre>
      </div>
    </div>
  );
}
