import {
  CornerDownRight,
  EyeOff,
  Film,
  Ghost,
  Grid2X2,
  Image as ImageIcon,
  Layers3,
  Lock,
  MessageCircle,
  PenTool,
  ScanLine,
  Sparkles,
  Square,
  Sticker,
  Type as TypeIcon,
  type LucideIcon,
} from "lucide-react";

import type {
  StudioLayerColor,
  StudioLayerKind,
  StudioLayerNavigatorResult,
} from "./studio-layer-navigator";
import type { StudioLayerPaletteStatusKind } from "./studio-layer-palette-visual";

export const STUDIO_LAYER_NAVIGATOR_KIND_ICONS: Record<
  Exclude<StudioLayerKind, "all">,
  LucideIcon
> = {
  image: ImageIcon,
  text: TypeIcon,
  bubble: MessageCircle,
  draw: PenTool,
  frame: Square,
  sticker: Sticker,
  effect: Sparkles,
  other: Layers3,
};

export const STUDIO_LAYER_NAVIGATOR_FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cool";
export const STUDIO_LAYER_NAVIGATOR_COARSE_TARGET =
  "max-lg:min-h-11 max-lg:min-w-11 pointer-coarse:min-h-11 pointer-coarse:min-w-11";

export const STUDIO_LAYER_COLOR_DOT_CLASS: Record<StudioLayerColor, string> = {
  red: "bg-bad",
  orange: "bg-accent",
  yellow: "bg-warning",
  green: "bg-good",
  blue: "bg-cool",
  violet: "bg-[oklch(0.68_0.18_312)]",
};

export const STUDIO_LAYER_STATUS_ICONS: Record<StudioLayerPaletteStatusKind, LucideIcon> = {
  "local-hidden": Ghost,
  hidden: EyeOff,
  locked: Lock,
  reference: ScanLine,
  mask: Layers3,
  "mask-disabled": Layers3,
  clipping: CornerDownRight,
  "alpha-locked": Grid2X2,
  ai: Sparkles,
  animated: Film,
};

export const STUDIO_LAYER_STATUS_CLASSES: Record<StudioLayerPaletteStatusKind, string> = {
  "local-hidden": "border-line-strong bg-raised text-fg-2",
  hidden: "border-line-strong bg-raised text-fg-3",
  locked: "border-accent/30 bg-accent-soft/35 text-accent",
  reference: "border-cool/30 bg-cool/10 text-cool",
  mask: "border-good/30 bg-good/10 text-good",
  "mask-disabled": "border-line bg-card text-fg-3/60",
  clipping: "border-[oklch(0.68_0.16_312/0.3)] bg-[oklch(0.68_0.16_312/0.1)] text-[oklch(0.76_0.13_312)]",
  "alpha-locked": "border-accent/30 bg-accent-soft/35 text-accent",
  ai: "border-warning/30 bg-warning/10 text-warning",
  animated: "border-cool/30 bg-cool/10 text-cool",
};

export const STUDIO_LAYER_TRIO_BUTTON_BASE_CLASS =
  "inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md border px-1.5 text-[0.62rem] font-semibold [word-break:keep-all] transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.96] disabled:opacity-40 motion-reduce:transition-none motion-reduce:transform-none max-lg:px-2 max-lg:text-[0.68rem] pointer-coarse:px-2 pointer-coarse:text-[0.68rem]";

export const STUDIO_LAYER_TRIO_BUTTON_INACTIVE_CLASS =
  "border-line/70 bg-card/85 text-fg-2 hover:bg-raised hover:text-fg";

export const STUDIO_LAYER_TRIO_BUTTON_ACTIVE_CLASSES = {
  clippingMask: "border-[oklch(0.68_0.16_312/0.6)] bg-[oklch(0.68_0.16_312/0.14)] text-fg",
  alphaLock: "border-accent/60 bg-accent-soft/45 text-fg",
  reference: "border-cool/60 bg-cool/15 text-fg",
  colorTint: "border-cool/60 bg-cool/15 text-fg",
} as const;

export function studioLayerNavigatorItemStatusLabel(
  entry: StudioLayerNavigatorResult
): string {
  const labels: string[] = [];
  if (entry.effectivelyHidden) labels.push("숨김");
  if (entry.effectivelyLocked) labels.push("잠김");
  if (entry.item.fillReference) labels.push("채우기 참조");
  if (entry.item.alphaLocked) labels.push("알파 락");
  if (entry.item.masked) {
    labels.push(entry.item.maskEnabled === false ? "마스크 꺼짐" : "마스크");
  }
  if (entry.item.aiGenerated) labels.push("AI 작업");
  if (entry.item.clipBelow) labels.push("아래 클리핑");
  if (entry.item.animated) labels.push("애니메이션");
  return labels.join(", ");
}
