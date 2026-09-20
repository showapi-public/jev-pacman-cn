"use client";

import type { AgentController } from "@/lib/agent/controller";
import type { DecisionTelemetry } from "@/lib/agent/types";
import type { CandidateAnalysis } from "@/lib/game/analysis";
import type { Direction } from "@/lib/game/types";
import { formatMs, formatPercent, formatValue } from "@/lib/ui";

export interface DecisionPanelProps {
  snapshot: ReturnType<AgentController["snapshot"]>;
  decision: DecisionTelemetry | null;
}

/**
 * One status word for the whole panel. `snapshot.status` is the controller's,
 * the feed chips are the per-decision record's, and this panel never mixes the
 * two: what it shows is what the controller is doing right now.
 */
const HEADLINE_STATUS: Record<string, string> = {
  MANUAL: "manual",
  IDLE: "between junctions",
  REQUESTING: "asking Jev",
  READY: "answer in hand",
  OFFLINE: "offline",
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
  { label: "pellet distance", value: (c) => (c.nearestPelletDistance === null ? "—" : `${c.nearestPelletDistance}`) },
  { label: "pellets within 6", value: (c) => `${c.pelletsWithin6Tiles}` },
  { label: "power pellet", value: (c) => (c.nearestPowerPelletDistance === null ? "—" : `${c.nearestPowerPelletDistance}`) },
  { label: "danger ghost", value: (c) => (c.nearestDangerousGhostDistance === null ? "—" : `${c.nearestDangerousGhostDistance}`) },
  { label: "frightened ghost", value: (c) => (c.nearestFrightenedGhostDistance === null ? "—" : `${c.nearestFrightenedGhostDistance}`) },
  { label: "safe room", value: (c) => `${c.reachableSafeArea}` },
  { label: "dead end", value: (c) => (c.deadEnd ? `yes (${c.deadEndDepth ?? 1})` : "no") },
  { label: "continues heading", value: (c) => (c.continuesForward ? "yes" : "no") },
];

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

  return (
    <>
      <div className="panel-head">
        <span>Jev decision</span>
        <span className="chip" data-tone={CHIP_TONE[snapshot.status] ?? undefined}>
          <span className="dot" />
          {HEADLINE_STATUS[snapshot.status] ?? snapshot.status.toLowerCase()}
        </span>
      </div>

      <div className="panel-body">
        {snapshot.apiKeyMissing ? (
          <div className="banner" style={{ marginBottom: 14 }}>
            <span>
              JEV API key not configured. Every junction will use the fallback. Manual mode is still available.
            </span>
          </div>
        ) : null}

        <div className="decision-headline">
          <span className="decision-direction">
            {selected ?? (snapshot.status === "REQUESTING" ? "ASKING…" : "—")}
          </span>
          <span className="decision-meta">
            <span>
              {decision ? `#${decision.decisionId} · epoch ${decision.epoch}` : "no decision yet"}
            </span>
            <span>
              junction {decision ? `(${decision.junction.x}, ${decision.junction.y})` : "—"}
              {target ? ` · ${target.tilesAway.toFixed(1)} tiles away` : ""}
            </span>
            <span>
              latency {decision?.latencyMs != null ? formatMs(decision.latencyMs) : "—"} · option share{" "}
              {selected && probabilities[selected] !== undefined ? formatPercent(probabilities[selected]!) : "—"} ·
              Jev&apos;s own confidence{" "}
              {decision?.confidence != null ? formatValue(decision.confidence, 2) : "—"} · source{" "}
              {decision?.source ?? "—"}
            </span>
            {decision?.source === "FALLBACK" && decision.note ? <span>fallback rule: {decision.note}</span> : null}
            {decision && decision.status !== "APPLIED" && decision.status !== "PENDING" && decision.note ? (
              <span>{decision.note}</span>
            ) : null}
            {decision?.status === "PENDING" ? <span>answer on its way</span> : null}
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="muted">No junction on Pac-Man&apos;s path yet.</p>
        ) : (
          <div className="bars">
            {rows.map((direction) => {
              const probability = probabilities[direction];
              const width = probability === undefined ? 0 : Math.max(2, Math.round(probability * 100));
              return (
                <div className="bar-row" key={direction} data-selected={direction === selected}>
                  <span className="bar-name">
                    {direction}
                    {direction === selected ? <span className="arrow">◀</span> : null}
                  </span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ width: `${hasProbabilities ? width : 0}%` }} />
                  </span>
                  <span className="bar-value">
                    {probability === undefined ? "—" : formatPercent(probability)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {!hasProbabilities ? (
          <p className="muted" style={{ marginTop: 10 }}>
            {decision?.source === "FALLBACK"
              ? "Fallback move: Jev did not answer in time, so the game kept Pac-Man moving and logged this rule."
              : "No probabilities from Jev for this decision."}
          </p>
        ) : null}

        <div className="reasoning">
          <div className="label" style={{ marginBottom: 8 }}>
            Reasoning inputs — what Jev was shown for each legal move
          </div>
          {directions.length === 0 || !candidates ? (
            <p className="muted">Nothing asked yet.</p>
          ) : (
            <table className="reasoning-table">
              <thead>
                <tr>
                  <th />
                  {directions.map((direction) => (
                    <th key={direction} data-selected={direction === selected}>
                      {direction}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FACT_ROWS.map((row) => (
                  <tr key={row.label}>
                    <td className="reasoning-label">{row.label}</td>
                    {directions.map((direction) => {
                      const candidate = candidates[direction];
                      return (
                        <td key={direction} data-selected={direction === selected}>
                          {candidate ? row.value(candidate) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
