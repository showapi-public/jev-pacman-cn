"use client";

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import { CaretDown } from "@phosphor-icons/react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Fold-away content. The default state is collapsed: a control the demo does
 * not need at rest (the seed, the debug overlay, the export) should not cost
 * vertical space until it is asked for.
 *
 * The trigger always writes its state out — a caret alone would leave the
 * change of state unannounced.
 */

export const Collapsible = CollapsiblePrimitive.Root;

export interface CollapsibleTriggerProps
  extends React.ComponentProps<typeof CollapsiblePrimitive.Trigger> {
  label: string;
}

export function CollapsibleTrigger({ className, label, ...props }: CollapsibleTriggerProps) {
  return (
    <CollapsiblePrimitive.Trigger
      className={cn(
        "group inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-micro font-[510]",
        "text-fg-3 transition-colors duration-[var(--dur-fast)] ease-swift",
        "hover:bg-hover hover:text-fg data-[state=open]:text-fg-2",
        className,
      )}
      {...props}
    >
      <CaretDown
        aria-hidden="true"
        weight="bold"
        className="size-3 shrink-0 transition-transform duration-[var(--dur)] ease-swift group-data-[state=open]:rotate-180"
      />
      {label}
    </CollapsiblePrimitive.Trigger>
  );
}

export function CollapsibleContent({
  className,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Content>) {
  return (
    <CollapsiblePrimitive.Content
      className={cn(
        "overflow-hidden",
        "data-[state=closed]:animate-[collapse-up_var(--dur)_var(--ease)]",
        "data-[state=open]:animate-[collapse-down_var(--dur)_var(--ease)]",
        className,
      )}
      {...props}
    />
  );
}
