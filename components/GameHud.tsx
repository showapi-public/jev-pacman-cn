"use client";

import type { UiSnapshot } from "@/lib/ui";
import { formatMs } from "@/lib/ui";

import styles from "./GameHud.module.css";

/** Pac-Man starts with three; the strip shows those three slots and no more. */
const LIFE_SLOTS = [0, 1, 2] as const;

/**
 * The KPI strip: six facts about the run, read left to right as one instrument.
 * Score is the master readout; pellets, ghosts eaten and survival are the
 * running totals; lives and level are the run's state. Every value is mono +
 * tabular-nums, so numbers that tick never move the strip.
 */
export function GameHud({ ui }: { ui: UiSnapshot }) {
  const lives = Math.max(0, ui.lives);
  const ghosts = ui.controller.lastObservation?.ghosts ?? [];
  const frightened = ghosts.filter((ghost) => ghost.mode === "FRIGHTENED").length;

  return (
    <dl className={styles["hud-strip"]}>
      <div className={styles["hud-cell"]}>
        <dt className="label">Score</dt>
        <dd className={`value ${styles["hud-value"]} ${styles["hud-score"]}`}>
          {ui.score.toLocaleString("en-US")}
        </dd>
      </div>

      {/* The dots are decoration; the aria-label names the readout and the
          sr-only count is the text screen readers get. */}
      <div className={styles["hud-cell"]}>
        <dt className="label">Lives</dt>
        <dd className={`${styles["hud-value"]} ${styles["hud-dots"]}`} aria-label="lives">
          {LIFE_SLOTS.map((slot) => (
            <span
              key={slot}
              aria-hidden="true"
              data-spent={slot >= lives}
              className={styles["hud-life"]}
            />
          ))}
          <span className="sr-only">{lives === 1 ? "1 life left" : `${lives} lives left`}</span>
        </dd>
      </div>

      <div className={styles["hud-cell"]}>
        <dt className="label">Pellets left</dt>
        <dd className={`value ${styles["hud-value"]}`}>
          {ui.pelletsRemaining + ui.powerPelletsRemaining}
          <span className="muted"> · {ui.pelletsEaten} eaten</span>
        </dd>
      </div>

      <div className={styles["hud-cell"]}>
        <dt className="label">Ghosts eaten</dt>
        <dd className={`value ${styles["hud-value"]}`}>
          {ui.ghostsEaten}
          {frightened > 0 ? (
            <span className={styles["hud-frightened"]}> · {frightened} frightened</span>
          ) : null}
        </dd>
      </div>

      <div className={styles["hud-cell"]}>
        <dt className="label">Survival</dt>
        <dd className={`value ${styles["hud-value"]}`}>{formatMs(ui.playTimeMs)}</dd>
      </div>

      <div className={styles["hud-cell"]}>
        <dt className="label">Level</dt>
        <dd className={`value ${styles["hud-value"]}`}>{ui.level}</dd>
      </div>
    </dl>
  );
}
