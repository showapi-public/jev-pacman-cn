"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A panel is the only container the product has: one luminance step above the
 * canvas, a hairline border, and a 36px header band that names it. No shadows,
 * no second border, no nested elevation — depth is luminance and nothing else.
 *
 * `Panel` is a flex column with `min-h-0`, so a panel placed in a fixed-height
 * shell can hand its leftover height to whichever child scrolls.
 */

export function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border border-subtle bg-panel",
        className,
      )}
      {...props}
    />
  );
}

export function PanelHeader({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      className={cn(
        "flex h-9 shrink-0 items-center justify-between gap-3 border-b border-subtle",
        "bg-linear-to-b from-white/[0.03] to-transparent px-3",
        className,
      )}
      {...props}
    />
  );
}

export function PanelTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("label shrink-0 m-0 label-strong", className)} {...props} />;
}

/** The right-hand slot of a header: chips, tabs, a single button. */
export function PanelActions({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex shrink-0 items-center gap-2", className)} {...props} />;
}

export function PanelBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("min-h-0 p-3", className)} {...props} />;
}

/** A body that scrolls: the panel keeps its header, the content moves. */
export function PanelScroll({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("scroll-area min-h-0 flex-1 p-3", className)} {...props} />;
}

/** One hairline between two stacked registers inside a body. */
export function PanelDivider({ className, ...props }: React.ComponentProps<"div">) {
  return <div role="separator" className={cn("h-px shrink-0 bg-divider", className)} {...props} />;
}
