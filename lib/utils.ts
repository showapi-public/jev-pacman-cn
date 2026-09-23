/**
 * Class-name plumbing for the UI layer.
 *
 * `cn` is the standard `clsx` + `tailwind-merge` pair: conditional classes from
 * props, then a last-wins merge so a caller's `className` always beats the
 * component's own defaults. That merge is what makes these primitives safe to
 * restyle from the outside without `!important`.
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
