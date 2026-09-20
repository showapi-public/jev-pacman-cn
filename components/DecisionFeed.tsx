"use client";

import type { DecisionTelemetry } from "@/lib/agent/types";
import { formatMs } from "@/lib/ui";

const STATUS_TONE: Record<string, "live" | "busy" | "warn" | "bad" | undefined> = {
  APPLIED: "live",
  PENDING: "busy",
  STALE: "warn",
  TIMEOUT: "bad",
  ERROR: "bad",
  INVALID: "bad",
};

export function DecisionFeed({ feed }: { feed: DecisionTelemetry[] }) {
  if (feed.length === 0) {
    return <p className="muted" style={{ padding: "12px 14px" }}>No decisions yet.</p>;
  }

  return (
    <div className="feed">
      {feed.map((record) => (
        <div className="feed-row" key={`${record.decisionId}-${record.status}`}>
          <span className="feed-id">{record.decisionId}</span>
          <span className="feed-direction">{record.applied ?? record.choice ?? "—"}</span>
          <span className="feed-note">
            {record.source}
            {record.note ? ` · ${record.note}` : ""}
            {record.probabilities && record.choice
              ? ` · ${Math.round((record.probabilities[record.choice] ?? 0) * 100)}% sure`
              : ""}
          </span>
          <span className="chip" data-tone={STATUS_TONE[record.status] ?? undefined}>
            {record.status === "PENDING"
              ? record.choice
                ? "in hand"
                : "asking"
              : record.status.toLowerCase()}
            {record.latencyMs != null ? ` · ${formatMs(record.latencyMs)}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
