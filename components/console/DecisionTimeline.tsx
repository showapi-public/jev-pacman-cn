"use client";

import { ActionGlyph } from "@/components/console/ActionGlyph";
import type { ConsoleInput } from "@/components/console/input";
import { Chip } from "@/components/ui/chip";
import { recentFeed } from "@/lib/agent/telemetry";
import { formatLatency, formatPercent, telemetryStatus, type Tone } from "@/lib/ui";

/**
 * 决策历史：最新在前，是一张能扫的表，而不是每行一句话。
 *
 * 每一行都在同样的五列里回答同样五个问题 —— 哪一次决策、选了哪个动作、有多确定、
 * 多慢、怎么结束的 —— 于是眼睛可以顺着某一列找异常值，而不用读散文。兜底在箭头与
 * 胶囊上同时变黄：那是唯一一个隔着房间也值得认出来的结果。
 *
 * 动作列在四向游戏里画箭头，其它游戏显示词表里的短标签；文字始终在 `title` 与
 * `sr-only` 里，颜色与箭头都不是唯一的信号。
 */

/**
 * 列表最多显示多少行。
 *
 * 上限在显示层而不是输入层：`ConsoleInput.records` 是全量记录，指标与图表必须看到
 * 每一条；而一次几千行的列表既没人读，也会把渲染拖慢。
 */
const HISTORY_LIMIT = 40;

/**
 * 表头与每一行共用一套栅格，列因此天生对齐。
 *
 * `relative` 是承重的，不是装饰。每一行末尾有一个 `sr-only` 的详情片段，而
 * Tailwind 的 `sr-only` 是 `position: absolute`：作为六列栅格里的第七个孩子，它会
 * 掉进隐式的第二行 —— 在行自己的盒子*下方*。没有定位祖先时，它的包含块是文档，
 * 于是它会逃出列表的滚动容器与面板的 overflow，停在页面坐标里的静态位置，把文档的
 * 可滚动溢出撑大，给这台单屏机台添一条幽灵般的整页滚动条。把行变成包含块能把它
 * 关在行内，由滚动容器裁掉。
 *
 * 「状态」列按内容定宽（`auto`），不写像素值。胶囊是「一个词外面套一个盒」，盒宽随
 * 字号走：三个汉字的胶囊在 12px 下量到 66px，而它当时待在一个写死的 58px 轨道里 ——
 * 于是向左溢出 8px，正好吃掉 `gap-2` 顶到延迟的数字上。改成 `auto` 后由胶囊决定列宽，
 * 让出的空间还给这里唯一有余量的弹性列「选项占比」。
 */
const ROW_GRID = "relative grid grid-cols-[30px_14px_minmax(20px,1fr)_52px_auto] items-center gap-2";

export interface DecisionTimelineProps {
  input: ConsoleInput;
}

export function DecisionTimeline({ input }: DecisionTimelineProps) {
  const records = recentFeed(input.records, HISTORY_LIMIT);

  if (records.length === 0) {
    const idle =
      input.status === "GAME_OVER" || input.status === "CLEARED"
        ? `这一局已经结束，${input.place}之间的决策不会再有新的了。`
        : `点击「开始」——当${input.actor}抵达${input.place}时，决策会逐条出现在这里。`;

    return (
      <div className="flex flex-col gap-1 px-3 py-5">
        <p className="label m-0 label-strong">暂无决策</p>
        <p className="m-0 min-w-0 text-body text-fg-2">{idle}</p>
      </div>
    );
  }

  return (
    <div>
      <div
        aria-hidden="true"
        className={`${ROW_GRID} sticky top-0 z-1 border-b border-subtle bg-panel px-3 py-1.5 label`}
      >
        <span>编号</span>
        <span />
        <span>选项占比</span>
        <span className="text-right">延迟</span>
        <span className="text-right">状态</span>
      </div>

      <ol className="m-0 list-none p-0">
        {records.map((record, index) => {
          const chosen = record.applied ?? record.choice;
          const probability = record.choice ? record.probabilities[record.choice] : undefined;
          const fallback = record.source === "FALLBACK";
          const pill = fallback
            ? { label: "兜底", tone: "busy" as Tone }
            : telemetryStatus(record.status, record.choice);
          const chosenLabel = chosen === null ? "无动作" : input.vocab.label(chosen);
          const barWidth = probability === undefined ? 0 : Math.max(0, Math.round(probability * 100));

          const detail = [
            `决策 ${record.decisionId}，${input.place} (${record.at?.x ?? "—"}, ${record.at?.y ?? "—"})`,
            `模型 ${record.model ?? "—"}`,
            `来源 ${record.source}`,
            `动作 ${chosenLabel}`,
            probability === undefined ? null : `占比 ${formatPercent(probability)}`,
            record.confidence === null ? null : `自评置信度 ${record.confidence.toFixed(2)}`,
            record.latencyMs === null ? null : `延迟 ${formatLatency(record.latencyMs)}`,
            record.note,
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <li
              key={record.decisionId}
              title={detail}
              className={`${ROW_GRID} border-b border-divider px-3 py-1.5 text-micro transition-colors duration-[var(--dur-fast)] ease-swift last:border-b-0 hover:bg-hover ${
                index === 0 ? "anim-rise bg-elevated" : ""
              }`}
            >
              <span className="num text-fg-3">{record.decisionId}</span>

              {/* 兜底用警示黄、已执行用前景色、只到手未落地用次级前景色、什么都没有则最淡。 */}
              <span
                aria-hidden="true"
                className={
                  fallback
                    ? "text-warn"
                    : record.applied
                      ? "text-fg"
                      : record.choice
                        ? "text-fg-2"
                        : "text-fg-4"
                }
              >
                <ActionGlyph vocab={input.vocab} action={chosen} className="size-3.5" />
              </span>

              <span aria-hidden="true" className="flex items-center gap-2">
                <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-pill bg-white/[0.06]">
                  <span
                    className={`block h-full rounded-pill ${fallback ? "bg-warn" : "bg-self"}`}
                    style={{ width: `${barWidth}%` }}
                  />
                </span>
                <span className="num w-9 shrink-0 text-right text-fg-3">
                  {probability === undefined ? "—" : formatPercent(probability)}
                </span>
              </span>

              <span className="num text-right text-fg-3">
                {record.latencyMs === null ? "—" : formatLatency(record.latencyMs)}
              </span>

              <span className="flex justify-end">
                <Chip tone={pill.tone} dot>
                  {pill.label}
                </Chip>
              </span>

              <span className="sr-only">{detail}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
