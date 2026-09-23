"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The one button in the product.
 *
 * `primary` is reserved for the single action that starts the demo — the eye
 * should land there and nowhere else. Everything else is `secondary` (a real
 * toggle or a secondary action) or `ghost` (chrome that lives inside a header).
 * `segmented` is the pressed state of a choice group, so a selected option never
 * needs its own bespoke styles.
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap",
    "rounded-md border font-sans font-[510]",
    "transition-[background-color,border-color,color,transform] duration-[var(--dur-fast)] ease-swift",
    "active:scale-[0.96]",
    "disabled:pointer-events-none disabled:opacity-45",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: "border-transparent bg-accent-deep text-on-accent hover:bg-accent",
        secondary:
          "border-line bg-white/[0.03] text-fg-2 hover:border-line-strong hover:bg-hover hover:text-fg",
        ghost: "border-transparent bg-transparent text-fg-3 hover:bg-hover hover:text-fg",
        segmented:
          "border-transparent bg-transparent text-fg-3 hover:bg-hover hover:text-fg aria-pressed:border-line aria-pressed:bg-elevated aria-pressed:text-fg",
        segmentedAccent:
          "border-transparent bg-transparent text-fg-3 hover:bg-hover hover:text-fg aria-pressed:border-accent/40 aria-pressed:bg-accent-soft aria-pressed:text-fg",
      },
      size: {
        sm: "h-7 px-2.5 text-micro",
        md: "h-8 px-3 text-body",
        icon: "size-7",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Render as the child element instead of a `<button>`. */
    asChild?: boolean;
  };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      type={asChild ? undefined : "button"}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
