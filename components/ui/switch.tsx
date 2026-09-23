"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A labelled switch: track, thumb, and the word for what it turns on. Used for
 * the cabinet's two preferences (sound, CRT), which are state the player set —
 * not actions they take.
 */
export interface SwitchProps extends React.ComponentProps<typeof SwitchPrimitive.Root> {
  label: string;
}

export function Switch({ className, label, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "group inline-flex shrink-0 items-center gap-2 text-micro font-[510] whitespace-nowrap",
        "text-fg-3 transition-colors duration-[var(--dur-fast)] ease-swift hover:text-fg-2",
        "data-[state=checked]:text-fg",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative h-[18px] w-[30px] shrink-0 rounded-pill border border-line bg-white/[0.06]",
          "transition-colors duration-[var(--dur)] ease-swift",
          "group-data-[state=checked]:border-accent/50 group-data-[state=checked]:bg-accent-soft",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] left-[2px] size-3 rounded-full bg-fg-4",
            "transition-[transform,background-color] duration-[var(--dur)] ease-swift",
            "group-data-[state=checked]:translate-x-3 group-data-[state=checked]:bg-accent-hover",
          )}
        />
      </span>
      {label}
    </SwitchPrimitive.Root>
  );
}
