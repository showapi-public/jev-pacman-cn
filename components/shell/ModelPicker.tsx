"use client";

import { Segment, Segmented } from "@/components/ui/segmented";
import type { ModelCatalogue } from "@/lib/jev/models";

/**
 * Which catalogue entry answers. Options come from `GET /api/models`, which is
 * shaped so it *cannot* leak a key — the browser never sees a base URL either.
 *
 * Three states worth knowing about:
 *
 * - **No catalogue yet.** The fetch is in flight or failed; say so rather than
 *   rendering an empty group that looks broken.
 * - **Not a model player.** Manual / random / heuristic never ask the model, so
 *   the group is disabled and *says why* — a greyed control with no explanation
 *   reads as a bug.
 * - **An unconfigured entry.** The server knows it has no API key, so picking it
 *   would fall back on every single decision. It stays visible (you want to see
 *   that the entry exists) but cannot be picked.
 */
export interface ModelPickerProps {
  /** `null` while the catalogue is being fetched, or if the fetch failed. */
  catalogue: ModelCatalogue | null;
  /** The selected entry id; `null` means "whatever the server defaults to". */
  value: string | null;
  onChange(id: string): void;
  /** True for manual / random / heuristic: no model takes part. */
  disabled: boolean;
}

export function ModelPicker({ catalogue, value, onChange, disabled }: ModelPickerProps) {
  if (!catalogue) {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <span className="label">模型</span>
        <span className="text-micro text-fg-3">正在读取模型目录…</span>
      </div>
    );
  }

  const selected = value ?? catalogue.default;

  return (
    <Segmented label="模型" hint={disabled ? "当前玩家不询问模型" : undefined}>
      {catalogue.models.map((entry) => (
        <Segment
          key={entry.id}
          pressed={selected === entry.id}
          disabled={disabled || !entry.configured}
          title={
            entry.configured
              ? `${entry.label}：${entry.note}`
              : `${entry.label}：${entry.note}（未配置密钥，选中后每次都会走兜底）`
          }
          onClick={() => onChange(entry.id)}
        >
          {entry.label}
        </Segment>
      ))}
    </Segmented>
  );
}
