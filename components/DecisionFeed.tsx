"use client";

import type { DecisionTelemetry } from "@/lib/agent/types";
import { DIRECTION_LABELS, formatMs, formatPercent } from "@/lib/ui";

import styles from "./DecisionFeed.module.css";

/**
 * The module's class names are `df-`-prefixed; aliased once here so the JSX
 * below reads as a row, not as a dictionary lookup.
 */
const {
  "df-list": list,
  "df-row": row,
  "df-id": id,
  "df-direction": direction,
  "df-note": note,
  "df-source": source,
  "df-noteText": noteText,
  "df-sep": sep,
  "df-conf": conf,
  "df-latency": latency,
  "df-status": status,
  "df-empty": empty,
  "df-emptyLabel": emptyLabel,
  "df-emptyHint": emptyHint,
} = styles;

/** The four tones the shared `.chip` primitive understands. */
type ChipTone = "live" | "busy" | "warn" | "bad";

/**
 * The pill for one record. The tone is the whole contract: emerald once the
 * answer was applied, amber while the agent is still being asked (and in hand
 * as soon as it answers), red for every answer that did not land in time.
 */
function statusPill(record: DecisionTelemetry): { label: string; tone: ChipTone } {
  switch (record.status) {
    case "APPLIED":
      return { label: "已执行", tone: "live" };
    case "PENDING":
      return record.choice
        ? { label: "已到手", tone: "busy" }
        : { label: "询问中", tone: "busy" };
    case "STALE":
      return { label: "已过期", tone: "bad" };
    case "TIMEOUT":
      return { label: "超时", tone: "bad" };
    case "ERROR":
      return { label: "出错", tone: "bad" };
    case "INVALID":
      return { label: "无效", tone: "bad" };
  }
}

/**
 * The decision history, newest first. This is the panel body: rows run to the
 * panel edges and carry their own padding, and no row announces itself — a new
 * decision lands about once a second, which is far too chatty for aria-live.
 */
export function DecisionFeed({ feed }: { feed: DecisionTelemetry[] }) {
  if (feed.length === 0) {
    return (
      <div className={empty}>
        <p className={`label ${emptyLabel}`}>暂无决策</p>
        <p className={emptyHint}>
          点击「开始」——当吃豆人抵达路口时，决策会出现在这里。
        </p>
      </div>
    );
  }

  return (
    <ol className={list} aria-label="决策历史">
      {feed.map((record, index) => {
        const pill = statusPill(record);
        const choice = record.choice;
        const probability = choice ? record.probabilities[choice] : undefined;

        return (
          <li className={`${row} ${index === 0 ? "anim-rise" : ""}`} key={record.decisionId}>
            <span className={`mono ${id}`}>{record.decisionId}</span>

            <span
              className={`mono ${direction}`}
              data-kind={record.applied ? "applied" : choice ? "chosen" : "none"}
            >
              {record.applied
                ? DIRECTION_LABELS[record.applied]
                : choice
                  ? DIRECTION_LABELS[choice]
                  : "—"}
            </span>

            <span className={note}>
              <span className={source} data-fallback={record.source === "FALLBACK" ? "true" : undefined}>
                {record.source}
              </span>
              {record.note ? (
                <>
                  <span className={sep} aria-hidden="true">
                    ·
                  </span>
                  <span className={noteText}>{record.note}</span>
                </>
              ) : null}
              {probability === undefined ? null : (
                <>
                  <span className={sep} aria-hidden="true">
                    ·
                  </span>
                  <span className={`mono ${conf}`}>{formatPercent(probability)} 把握</span>
                </>
              )}
            </span>

            <span className={`mono ${latency}`}>
              {record.latencyMs === null ? "—" : formatMs(record.latencyMs)}
            </span>

            <span className={`chip ${status}`} data-tone={pill.tone}>
              <span className="dot" />
              {pill.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
