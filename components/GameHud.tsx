"use client";

import type { UiSnapshot } from "@/lib/ui";
import { formatMs } from "@/lib/ui";

export function GameHud({ ui }: { ui: UiSnapshot }) {
  const lives = Math.max(0, ui.lives);
  const ghosts = ui.controller.lastObservation?.ghosts ?? [];
  const frightened = ghosts.filter((ghost) => ghost.mode === "FRIGHTENED").length;

  return (
    <div className="stat-grid">
      <div className="stat">
        <div className="label">Score</div>
        <div className="value">{ui.score.toLocaleString("en-US")}</div>
      </div>

      <div className="stat">
        <div className="label">Lives</div>
        <div className="lives">
          {[0, 1, 2].map((index) => (
            <span key={index} className={index < lives ? "life-dot" : "life-dot spent"} />
          ))}
        </div>
      </div>

      <div className="stat">
        <div className="label">Pellets left</div>
        <div className="value">
          {ui.pelletsRemaining + ui.powerPelletsRemaining}
          <span className="muted"> · {ui.pelletsEaten} eaten</span>
        </div>
      </div>

      <div className="stat">
        <div className="label">Ghosts eaten</div>
        <div className="value">
          {ui.ghostsEaten}
          {frightened > 0 ? <span className="muted"> · {frightened} frightened</span> : null}
        </div>
      </div>

      <div className="stat">
        <div className="label">Survival</div>
        <div className="value">{formatMs(ui.playTimeMs)}</div>
      </div>

      <div className="stat">
        <div className="label">Level</div>
        <div className="value">{ui.level}</div>
      </div>
    </div>
  );
}
