"use client";

import type { ReactNode } from "react";

import { Tooltip } from "@/components/ui/tooltip";

/**
 * The meter strip's frame: six equal registers, read left to right as one
 * instrument.
 *
 * The **frame** is shared because six registers with a label / value / addendum
 * hierarchy is what every game's readout wants. What goes *in* the six registers
 * is not — each game assembles its own from its own state.
 *
 * A lane's addendum (`已吃 240`) is one type step *below* the value it follows,
 * so it reads as a caption rather than a second number — label / value /
 * addendum = 12 / 16 / 12. It is a nowrap item in a `flex-wrap` row, and that is
 * load-bearing rather than decorative. The six registers are equal sixths, so at
 * a 1280px viewport a register gets 89px of content width while a three-digit
 * value plus `已吃 240` needs 86px — and the first cut of this strip, before the
 * type scale went up, sat at 0.7px of margin. Run-on inline, that deficit broke
 * the phrase *mid-word*: `已吃 40` split with `40` alone on line 2, where it read
 * as a statistic of its own. A nowrap flex item can only share the value's
 * baseline or take a caption line whole, so a register ever grows by one clean
 * line and never by a broken one. The separator is a 4px flex gap and not a `·`
 * for the same reason: a middot costs 14px of mono whitespace — exactly the
 * difference between one line and two at 1280 — and a middot leading a wrapped
 * line reads as a bullet.
 */
export function MeterStrip({ children }: { children: ReactNode }) {
  return <dl className="m-0 grid shrink-0 grid-cols-6 border-t border-subtle">{children}</dl>;
}

export interface MeterProps {
  label: string;
  /** A 12px glyph that speeds up scanning; decorative, so hidden from AT. */
  icon?: ReactNode;
  hint: string;
  children: ReactNode;
}

/** One lane of the strip: a labelled value with the explanation on hover. */
export function Meter({ label, icon, hint, children }: MeterProps) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 border-l border-divider px-3 py-2 first:border-l-0">
      <Tooltip content={hint}>
        <dt className="label flex cursor-help items-center gap-1">
          {icon ? (
            <span aria-hidden="true" className="text-fg-4 [&>svg]:size-3">
              {icon}
            </span>
          ) : null}
          {label}
        </dt>
      </Tooltip>
      <dd className="m-0 text-title leading-tight">{children}</dd>
    </div>
  );
}
