"use client";

import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A status pill. The tone is the whole contract — emerald means the answer was
 * applied, amber means the agent is still being asked (or Pac-Man himself is
 * talking), red means something did not land, `muted` means idle.
 *
 * Colour is never the only signal: the dot is decoration and the label always
 * spells the state out.
 */
const chipVariants = cva(
  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border px-2 py-px text-micro font-[510] num",
  {
    variants: {
      tone: {
        neutral: "border-line bg-white/[0.02] text-fg-3",
        live: "border-ok/30 bg-ok-soft text-ok",
        busy: "border-warn/30 bg-warn-soft text-warn",
        bad: "border-bad/30 bg-bad-soft text-bad",
        accent: "border-accent/40 bg-accent-soft text-fg-2",
        warn: "border-line-strong bg-white/[0.02] text-fg-2",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type ChipTone = NonNullable<VariantProps<typeof chipVariants>["tone"]>;

export interface ChipProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof chipVariants> {
  /** Draw the leading status dot. Decorative, so it is hidden from the a11y tree. */
  dot?: boolean;
}

export function Chip({ className, tone, dot = false, children, ...props }: ChipProps) {
  return (
    <span className={cn(chipVariants({ tone }), className)} {...props}>
      {dot ? <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
