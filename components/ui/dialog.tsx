"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The home for prose the console has no room for: how a decision is made, what
 * the colours mean, what the telemetry counts. It opens over the console rather
 * than pushing it, so nothing on the board moves when it does.
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-50 bg-black/60",
          "data-[state=open]:animate-[fade-in_var(--dur)_var(--ease)]",
        )}
      />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2",
          "scroll-area rounded-xl border border-line bg-panel p-5",
          "data-[state=open]:animate-[pop-in_var(--dur)_var(--ease-out)]",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="关闭"
          className={cn(
            "absolute top-3 right-3 grid size-7 place-items-center rounded-md",
            "text-fg-3 transition-colors duration-[var(--dur-fast)] ease-swift hover:bg-hover hover:text-fg",
          )}
        >
          <X aria-hidden="true" weight="bold" className="size-3.5" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("mb-3 m-0 text-title font-[590] tracking-[-0.011em] text-fg", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("m-0 flex flex-col gap-3 text-body leading-relaxed text-fg-2", className)}
      {...props}
    />
  );
}
