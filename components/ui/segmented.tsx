"use client";

import * as React from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A row of mutually exclusive choices — the player, the speed. One is always
 * selected, so the group is a set of `aria-pressed` buttons inside a labelled
 * `role="group"`: the label names the axis ("速度"), and each button says only
 * its own value ("0.5×").
 */

export interface SegmentedProps extends React.ComponentProps<"div"> {
  /** Names the axis this group switches. Rendered as the group's label. */
  label: string;
  /** Hide the label visually while keeping it for assistive tech. */
  labelHidden?: boolean;
  /** `accent` paints the selected option in the chrome accent. */
  tone?: "neutral" | "accent";
}

export function Segmented({
  className,
  label,
  labelHidden = false,
  tone = "neutral",
  children,
  ...props
}: SegmentedProps) {
  const labelId = React.useId();

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)} {...props}>
      <span id={labelId} className={cn("label", labelHidden && "sr-only")}>
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={labelId}
        className="inline-flex w-fit gap-0.5 rounded-md border border-line bg-inset p-0.5"
      >
        {React.Children.map(children, (child) =>
          React.isValidElement<ButtonProps>(child)
            ? React.cloneElement(child, {
                size: "sm",
                variant: tone === "accent" ? "segmentedAccent" : "segmented",
              })
            : child,
        )}
      </div>
    </div>
  );
}

/** One option of a `Segmented`. `pressed` maps to `aria-pressed`. */
export function Segment({
  pressed,
  className,
  ...props
}: ButtonProps & { pressed: boolean }) {
  return <Button aria-pressed={pressed} className={cn("h-6 px-2.5", className)} {...props} />;
}
