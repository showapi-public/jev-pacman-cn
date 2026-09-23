"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Tooltips carry the explanations the layout no longer has room for: what a
 * colour means, what a control does, why a decision fell back. The panel bodies
 * stay for data; prose lives here.
 *
 * `TooltipProvider` is mounted once in the page shell with a short delay, and
 * every trigger after that needs only `Tooltip content trigger`.
 */

export const TooltipProvider = TooltipPrimitive.Provider;

export interface TooltipProps {
  /** The explanation. Keep it to one or two sentences. */
  content: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
  children: React.ReactNode;
}

export function Tooltip({ content, side = "top", className, children }: TooltipProps) {
  if (!content) return <>{children}</>;

  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            "z-50 max-w-[300px] rounded-md border border-line bg-elevated px-2.5 py-1.5",
            "text-micro leading-relaxed text-fg-2 shadow-none",
            className,
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-[var(--bg-elevated)]" width={10} height={5} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
