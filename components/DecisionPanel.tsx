"use client";

import type { AgentController } from "@/lib/agent/controller";
import type { DecisionTelemetry } from "@/lib/agent/types";
import type { CandidateAnalysis } from "@/lib/game/analysis";
import type { Direction } from "@/lib/game/types";
import { formatMs, formatPercent, formatValue } from "@/lib/ui";
import styles from "./DecisionPanel.module.css";

export interface DecisionPanelProps {
  snapshot: ReturnType<AgentController["snapshot"]>;
  decision: DecisionTelemetry | null;
}

/**
 * One status word for the whole panel. `snapshot.status` is the controller's,
 * the feed chips are the per-decision record's, and this panel never mixes the
 * two: what it shows is what the controller is doing right now.
 */
const STATUS_LABEL: Partial<Record<string, string>> = {
  MANUAL: "manual",
  IDLE: "between junctions",
  REQUESTING: "asking Jev",
  READY: "answer in hand",
};

/** A request that failed reports why it failed, never a colour word. */
const ERROR_LABEL: Partial<Record<string, string>> = {
  no_api_key: "no API key",
  timeout: "Jev timed out",
  connection: "connection failed",
  http: "Jev refused",
  invalid: "unusable answer",
  unknown: "request failed",
};

const CHIP_TONE: Record<string, "live" | "busy" | "warn" | "bad" | undefined> = {
  MANUAL: undefined,
  IDLE: undefined,
  REQUESTING: "busy",
  READY: "live",
  OFFLINE: "bad",
};

/** The candidate facts, as rows so the legal moves can be compared down a column. */
const FACT_ROWS: { label: string; value: (candidate: CandidateAnalysis) => string }[] = [
  { label: "pellet distance (tiles)", value: (c) => (c.nearestPelletDistance === null ? "—" : `${c.nearestPelletDistance}`) },
  { label: "pellets within 6 tiles", value: (c) => `${c.pelletsWithin6Tiles}` },
  { label: "power pellet (tiles)", value: (c) => (c.nearestPowerPelletDistance === null ? "—" : `${c.nearestPowerPelletDistance}`) },
  { label: "danger ghost (tiles)", value: (c) => (c.nearestDangerousGhostDistance === null ? "—" : `${c.nearestDangerousGhostDistance}`) },
  { label: "frightened ghost (tiles)", value: (c) => (c.nearestFrightenedGhostDistance === null ? "—" : `${c.nearestFrightenedGhostDistance}`) },
  { label: "safe tiles reachable", value: (c) => `${c.reachableSafeArea}` },
  { label: "dead end", value: (c) => (c.deadEnd ? `yes (${c.deadEndDepth ?? 1})` : "no") },
  { label: "continues heading", value: (c) => (c.continuesForward ? "yes" : "no") },
];

/** `snapshot.status`, in words; a failed request names the kind of failure. */
function statusLabel(snapshot: DecisionPanelProps["snapshot"]): string {
  if (snapshot.status === "OFFLINE") {
    const kind = snapshot.lastError?.kind;
    return (kind ? ERROR_LABEL[kind] : undefined) ?? "offline";
  }
  return STATUS_LABEL[snapshot.status] ?? snapshot.status.toLowerCase();
}

export function DecisionPanel({ snapshot, decision }: DecisionPanelProps) {
  const observation = snapshot.lastObservation;
  const target = snapshot.target;
  const directions: Direction[] = decision?.legalDirections?.length
    ? decision.legalDirections
    : (target?.legalDirections ?? []);

  const probabilities = decision?.probabilities ?? {};
  const hasProbabilities = Object.keys(probabilities).length > 0;
  const rows = [...directions].sort((a, b) => (probabilities[b] ?? 0) - (probabilities[a] ?? 0));
  const selected = hasProbabilities ? (decision?.choice ?? null) : null;
  const candidates = observation?.candidates;

  // The hero states the decision, or why there is not one yet.
  const headline = selected ?? (snapshot.status === "REQUESTING" ? "ASKING…" : "—");
  const heroState = selected ? "chosen" : snapshot.status === "REQUESTING" ? "asking" : "empty";

  return (
    <>
      <div className="panel-head">
        <span className={styles["dp-head-label"]}>Jev decision</span>
        <span className="chip" data-tone={CHIP_TONE[snapshot.status]} role="status">
          <span className="dot" aria-hidden="true" />
          {statusLabel(snapshot)}
        </span>
      </div>

      <div className="panel-body">
        <div className={styles["dp-wrap"]}>
          {snapshot.apiKeyMissing ? (
            <div className="banner">
              <span>
                JEV API key not configured. Every junction will use the fallback. Manual mode is still available.
              </span>
            </div>
          ) : null}

          <div className={styles["dp-hero"]} data-state={heroState}>
            <p className={`${styles["dp-hero-value"]} anim-pop`} key={decision?.decisionId ?? "none"}>
              {headline}
            </p>

            <div className={styles["dp-meta"]}>
              <p className={styles["dp-meta-line"]}>
                {decision ? (
                  <>
                    #<span className={`mono ${styles["dp-meta-num"]}`}>{decision.decisionId}</span>
                    {" · epoch "}
                    <span className={`mono ${styles["dp-meta-num"]}`}>{decision.epoch}</span>
                  </>
                ) : (
                  "no decision yet"
                )}
              </p>

              <p className={styles["dp-meta-line"]}>
                {"junction "}
                <span className={`mono ${styles["dp-meta-num"]}`}>
                  {decision ? `(${decision.junction.x}, ${decision.junction.y})` : "—"}
                </span>
                {target ? (
                  <>
                    {" · "}
                    <span className={`mono ${styles["dp-meta-num"]}`}>{target.tilesAway.toFixed(1)}</span>
                    {" tiles away"}
                  </>
                ) : null}
              </p>

              <p className={styles["dp-meta-line"]}>
                {"latency "}
                <span className={`mono ${styles["dp-meta-num"]}`}>
                  {decision?.latencyMs != null ? formatMs(decision.latencyMs) : "—"}
                </span>
                {" · option share "}
                <span className={`mono ${styles["dp-meta-num"]}`}>
                  {selected && probabilities[selected] !== undefined ? formatPercent(probabilities[selected]) : "—"}
                </span>
                {" · Jev's own confidence "}
                <span className={`mono ${styles["dp-meta-num"]}`}>
                  {decision?.confidence != null ? formatValue(decision.confidence, 2) : "—"}
                </span>
                {" · source "}
                <span className={`mono ${styles["dp-meta-num"]}`}>{decision?.source ?? "—"}</span>
              </p>

              {decision?.source === "FALLBACK" && decision.note ? (
                <p className={styles["dp-meta-note"]} data-tone="warn">
                  fallback rule: {decision.note}
                </p>
              ) : null}
              {decision && decision.status !== "APPLIED" && decision.status !== "PENDING" && decision.note ? (
                <p className={styles["dp-meta-note"]}>{decision.note}</p>
              ) : null}
              {decision?.status === "PENDING" ? (
                <p className={styles["dp-meta-note"]} data-tone="warn">
                  answer on its way
                </p>
              ) : null}
            </div>
          </div>

          {rows.length === 0 ? (
            <p className={styles["dp-empty"]}>Press Start — the first decision appears at the first junction.</p>
          ) : hasProbabilities ? (
            <ol className={styles["dp-bars"]}>
              {rows.map((direction) => {
                const probability = probabilities[direction];
                const width = probability === undefined ? 0 : Math.max(2, Math.round(probability * 100));
                return (
                  <li className={styles["dp-bar-row"]} key={direction} data-selected={direction === selected}>
                    <span className={styles["dp-bar-name"]}>
                      <span className={`dot ${styles["dp-bar-mark"]}`} aria-hidden="true" />
                      {direction}
                    </span>
                    <span className={styles["dp-bar-track"]}>
                      <span className={styles["dp-bar-fill"]} style={{ width: `${width}%` }} />
                    </span>
                    <span className={styles["dp-bar-value"]}>{probability === undefined ? "—" : formatPercent(probability)}</span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className={styles["dp-note"]} data-tone={decision?.source === "FALLBACK" ? "warn" : undefined}>
              {decision?.source === "FALLBACK"
                ? "Fallback move: Jev did not answer in time, so the game kept Pac-Man moving and logged this rule."
                : "No probabilities from Jev for this decision."}
            </p>
          )}

          <div className={styles["dp-reasoning"]}>
            <div className="label">Reasoning inputs — what Jev was shown for each legal move</div>
            {directions.length === 0 || !candidates ? (
              <p className={styles["dp-empty"]}>Nothing asked yet.</p>
            ) : (
              <div className={styles["dp-table-scroll"]}>
                <table className={styles["dp-table"]}>
                  <caption className="sr-only">Candidate facts for each legal move, one column per direction.</caption>
                  <thead>
                    <tr>
                      <th scope="col" className={styles["dp-fact-head"]}>
                        <span className="sr-only">Fact</span>
                      </th>
                      {directions.map((direction) => (
                        <th key={direction} scope="col" className={styles["dp-dir-head"]} data-selected={direction === selected}>
                          {direction}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {FACT_ROWS.map((row) => (
                      <tr key={row.label}>
                        <th scope="row" className={styles["dp-fact-label"]}>
                          {row.label}
                        </th>
                        {directions.map((direction) => {
                          const candidate = candidates[direction];
                          return (
                            <td key={direction} className={styles["dp-value"]} data-selected={direction === selected}>
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
          </div>
        </div>
      </div>
    </>
  );
}
