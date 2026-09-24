"use client";

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Minus } from "@phosphor-icons/react";

import type { DecisionTelemetry } from "@/lib/agent/types";
import type { Direction } from "@/lib/games/pacman/types";
import { DIRECTION_LABELS, formatLatency, formatPercent, telemetryStatus, type Tone } from "@/lib/ui";
import { Chip } from "@/components/ui/chip";

/**
 * The decision history, newest first, as a scannable table rather than a
 * sentence per row.
 *
 * Every row answers the same five questions in the same five columns — which
 * decision, which way, how strongly, how slow, how it ended — so the eye can
 * run down one column and find the outliers instead of reading prose. A
 * fallback is amber in both the arrow and the pill: it is the one outcome worth
 * spotting from across the room.
 */

const GLYPH: Record<Direction, typeof ArrowUp> = {
  UP: ArrowUp,
  DOWN: ArrowDown,
  LEFT: ArrowLeft,
  RIGHT: ArrowRight,
};

/**
 * One grid for the header and every row, so the columns line up by construction.
 *
 * `relative` is load-bearing, not decoration. Each row ends with an `sr-only`
 * detail span, and Tailwind's `sr-only` is `position: absolute`: as a seventh
 * child of a six-column grid it lands in an implicit second row, *below* the
 * row's own box. With no positioned ancestor its containing block would be the
 * document, so it would escape the list's scroller and the panel's overflow and
 * settle at its static position in page coordinates — inflating the document's
 * scrollable overflow and giving the single-screen shell a phantom page
 * scrollbar. Making the row a containing block keeps the span inside the row,
 * where the scroller clips it.
 *
 * The 状态 column is sized by its content, not by a pixel figure. A pill is a
 * box around a word, so a fixed column silently drifts out of step the moment
 * the type scale moves: at 12px the three-character pills measure 66px, which
 * in a 58px track pushed them 8px left, through the gap and onto the latency
 * digits. `auto` lets the pill size the column and gives the slack back to the
 * share bar, which is the one column here that has room to spare.
 */
const ROW_GRID =
  "relative grid grid-cols-[30px_14px_minmax(20px,1fr)_52px_auto] items-center gap-2";

export interface DecisionTimelineProps {
  records: readonly DecisionTelemetry[];
}

export function DecisionTimeline({ records }: DecisionTimelineProps) {
  if (records.length === 0) {
    return (
      <div className="flex flex-col gap-1 px-3 py-5">
        <p className="label m-0 label-strong">暂无决策</p>
        <p className="m-0 min-w-0 text-body text-fg-2">
          点击「开始」——当吃豆人抵达路口时，决策会逐条出现在这里。
        </p>
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
          const Glyph = chosen ? GLYPH[chosen] : Minus;
          const barWidth = probability === undefined ? 0 : Math.max(0, Math.round(probability * 100));

          const detail = [
            `决策 ${record.decisionId}，路口 (${record.junction.x}, ${record.junction.y})`,
            `来源 ${record.source}`,
            chosen ? `方向 ${DIRECTION_LABELS[chosen]}` : "无方向",
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
                <Glyph weight="bold" className="size-3.5" />
              </span>

              <span aria-hidden="true" className="flex items-center gap-2">
                <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-pill bg-white/[0.06]">
                  <span
                    className={`block h-full rounded-pill ${fallback ? "bg-warn" : "bg-pacman"}`}
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
