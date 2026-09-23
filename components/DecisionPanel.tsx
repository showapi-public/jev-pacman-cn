"use client";

import type { AgentController } from "@/lib/agent/controller";
import type { DecisionTelemetry } from "@/lib/agent/types";
import type { CandidateAnalysis } from "@/lib/game/analysis";
import type { Direction } from "@/lib/game/types";
import { DIRECTION_LABELS, formatMs, formatPercent, formatValue } from "@/lib/ui";
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
  MANUAL: "手动",
  IDLE: "路口之间",
  REQUESTING: "正在询问 Jev",
  READY: "答案已到手",
};

/** A request that failed reports why it failed, never a colour word. */
const ERROR_LABEL: Partial<Record<string, string>> = {
  no_api_key: "未配置 API Key",
  timeout: "Jev 请求超时",
  connection: "连接失败",
  http: "Jev 拒绝响应",
  invalid: "答案不可用",
  unknown: "请求失败",
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
  { label: "最近的豆子（格）", value: (c) => (c.nearestPelletDistance === null ? "—" : `${c.nearestPelletDistance}`) },
  { label: "6 格内的豆子数", value: (c) => `${c.pelletsWithin6Tiles}` },
  { label: "最近的能量豆（格）", value: (c) => (c.nearestPowerPelletDistance === null ? "—" : `${c.nearestPowerPelletDistance}`) },
  { label: "最近的危险幽灵（格）", value: (c) => (c.nearestDangerousGhostDistance === null ? "—" : `${c.nearestDangerousGhostDistance}`) },
  { label: "最近的受惊幽灵（格）", value: (c) => (c.nearestFrightenedGhostDistance === null ? "—" : `${c.nearestFrightenedGhostDistance}`) },
  { label: "可达安全格数", value: (c) => `${c.reachableSafeArea}` },
  { label: "是否死路", value: (c) => (c.deadEnd ? `是（${c.deadEndDepth ?? 1}）` : "否") },
  { label: "是否沿当前朝向", value: (c) => (c.continuesForward ? "是" : "否") },
];

/** `snapshot.status`, in words; a failed request names the kind of failure. */
function statusLabel(snapshot: DecisionPanelProps["snapshot"]): string {
  if (snapshot.status === "OFFLINE") {
    const kind = snapshot.lastError?.kind;
    return (kind ? ERROR_LABEL[kind] : undefined) ?? "离线";
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
  const headline = selected ? DIRECTION_LABELS[selected] : snapshot.status === "REQUESTING" ? "询问中…" : "—";
  const heroState = selected ? "chosen" : snapshot.status === "REQUESTING" ? "asking" : "empty";

  return (
    <>
      <div className="panel-head">
        <span className={styles["dp-head-label"]}>Jev 的决策</span>
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
                未配置 JEV API Key。每个路口都会改用兜底规则。手动模式仍可正常使用。
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
                    {" · 世代 "}
                    <span className={`mono ${styles["dp-meta-num"]}`}>{decision.epoch}</span>
                  </>
                ) : (
                  "暂无决策"
                )}
              </p>

              <p className={styles["dp-meta-line"]}>
                {"路口 "}
                <span className={`mono ${styles["dp-meta-num"]}`}>
                  {decision ? `(${decision.junction.x}, ${decision.junction.y})` : "—"}
                </span>
                {target ? (
                  <>
                    {" · 还差 "}
                    <span className={`mono ${styles["dp-meta-num"]}`}>{target.tilesAway.toFixed(1)}</span>
                    {" 格"}
                  </>
                ) : null}
              </p>

              <p className={styles["dp-meta-line"]}>
                {"延迟 "}
                <span className={`mono ${styles["dp-meta-num"]}`}>
                  {decision?.latencyMs != null ? formatMs(decision.latencyMs) : "—"}
                </span>
                {" · 选项占比 "}
                <span className={`mono ${styles["dp-meta-num"]}`}>
                  {selected && probabilities[selected] !== undefined ? formatPercent(probabilities[selected]) : "—"}
                </span>
                {" · Jev 自评置信度 "}
                <span className={`mono ${styles["dp-meta-num"]}`}>
                  {decision?.confidence != null ? formatValue(decision.confidence, 2) : "—"}
                </span>
                {" · 来源 "}
                <span className={`mono ${styles["dp-meta-num"]}`}>{decision?.source ?? "—"}</span>
              </p>

              {decision?.source === "FALLBACK" && decision.note ? (
                <p className={styles["dp-meta-note"]} data-tone="warn">
                  兜底规则：{decision.note}
                </p>
              ) : null}
              {decision && decision.status !== "APPLIED" && decision.status !== "PENDING" && decision.note ? (
                <p className={styles["dp-meta-note"]}>{decision.note}</p>
              ) : null}
              {decision?.status === "PENDING" ? (
                <p className={styles["dp-meta-note"]} data-tone="warn">
                  答案还在路上
                </p>
              ) : null}
            </div>
          </div>

          {rows.length === 0 ? (
            <p className={styles["dp-empty"]}>点击「开始」——第一个决策会在抵达第一个路口时出现。</p>
          ) : hasProbabilities ? (
            <ol className={styles["dp-bars"]}>
              {rows.map((direction) => {
                const probability = probabilities[direction];
                const width = probability === undefined ? 0 : Math.max(2, Math.round(probability * 100));
                return (
                  <li className={styles["dp-bar-row"]} key={direction} data-selected={direction === selected}>
                    <span className={styles["dp-bar-name"]}>
                      <span className={`dot ${styles["dp-bar-mark"]}`} aria-hidden="true" />
                      {DIRECTION_LABELS[direction]}
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
                ? "兜底动作：Jev 未能及时作答，因此游戏按这条规则让吃豆人继续前进，并记录下来。"
                : "这次决策 Jev 没有给出概率分布。"}
            </p>
          )}

          <div className={styles["dp-reasoning"]}>
            <div className="label">推理输入 —— Jev 对每个合法方向所看到的数据</div>
            {directions.length === 0 || !candidates ? (
              <p className={styles["dp-empty"]}>尚未发起提问。</p>
            ) : (
              <div className={styles["dp-table-scroll"]}>
                <table className={styles["dp-table"]}>
                  <caption className="sr-only">每个合法方向的候选事实，每个方向一列。</caption>
                  <thead>
                    <tr>
                      <th scope="col" className={styles["dp-fact-head"]}>
                        <span className="sr-only">指标</span>
                      </th>
                      {directions.map((direction) => (
                        <th key={direction} scope="col" className={styles["dp-dir-head"]} data-selected={direction === selected}>
                          {DIRECTION_LABELS[direction]}
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
