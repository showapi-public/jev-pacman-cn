"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The tab strip that keeps secondary content out of the layout: a panel shows
 * one register at a time instead of three stacked ones.
 *
 * The strip is underline-style rather than boxed — a boxed tab row reads as a
 * second toolbar, and this app already has exactly one toolbar.
 */

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-md bg-inset p-0.5", className)}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "rounded-sm px-2.5 py-1 text-micro font-[510] whitespace-nowrap",
        "text-fg-3 transition-colors duration-[var(--dur-fast)] ease-swift",
        "hover:text-fg data-[state=active]:bg-elevated data-[state=active]:text-fg",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn("min-h-0 flex-1 focus-visible:outline-none", className)}
      {...props}
    />
  );
}
