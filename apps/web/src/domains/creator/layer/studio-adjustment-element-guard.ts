import type { El } from "../studio-element-model";

/** Lightweight type guard for the document model’s adjustment element. */
export type AdjustmentElement = Extract<El, { type: "adjustment" }>;

export function isAdjustmentEl(el: El): el is AdjustmentElement {
  return el.type === "adjustment";
}
