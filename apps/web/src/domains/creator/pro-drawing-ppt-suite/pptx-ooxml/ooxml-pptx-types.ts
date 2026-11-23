/**
 * OOXML `.pptx` 덱·슬라이드·도형·표·SmartArt·차트·애니메이션 공용 타입 계약.
 */

import type { OoxmlThemeId, PptxSlideSizePreset } from "./ooxml-theme-spec";

export type PptxTransitionKind = "none" | "fade" | "push" | "wipe" | "morph" | "zoom";

export type PptxShapeKind = "rect" | "roundRect" | "ellipse" | "arrow";

export type PptxShapeTone = "accent" | "secondary" | "surface" | "highlight";

export type SmartArtVariant =
  | "process-chevron"
  | "timeline-milestone"
  | "pyramid-tiers"
  | "org-hierarchy"
  | "swot-quadrant"
  | "cycle-loop";

export type NativeChartVariant = "bar" | "line" | "donut" | "radar";

export type BuildAnimationKind = "appear" | "fly-in" | "fade" | "zoom" | "wipe";

export type BuildAnimationTarget = "title" | "bullets" | "visual" | "table" | "shapes";

export interface BuildAnimationEntry {
  readonly id: string;
  readonly target: BuildAnimationTarget;
  readonly label: string;
  readonly kind: BuildAnimationKind;
  readonly order: number;
  readonly delayMs: number;
  readonly durationMs: number;
}

export interface PptxVectorShape {
  readonly id: string;
  readonly kind: PptxShapeKind;
  readonly label: string;
  readonly xPct: number;
  readonly yPct: number;
  readonly wPct: number;
  readonly hPct: number;
  readonly tone: PptxShapeTone;
}

export interface PptxTableModel {
  readonly id: string;
  readonly title?: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly showHeaderRow: boolean;
  readonly bandedRows: boolean;
}

export interface SmartArtItem {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
}

export interface PptxSmartArtBlock {
  readonly id: string;
  readonly variant: SmartArtVariant;
  readonly title?: string;
  readonly items: readonly SmartArtItem[];
}

export interface NativeChartDatum {
  readonly id: string;
  readonly label: string;
  readonly value: number;
}

export interface PptxChartBlock {
  readonly id: string;
  readonly variant: NativeChartVariant;
  readonly title: string;
  readonly unit?: string;
  readonly points: readonly NativeChartDatum[];
}

export interface PptxSlideInput {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly bullets?: readonly string[];
  readonly shapes?: readonly PptxVectorShape[];
  readonly table?: PptxTableModel | null;
  readonly smartArt?: PptxSmartArtBlock | null;
  readonly chart?: PptxChartBlock | null;
  readonly speakerNotes?: string;
  readonly transition?: PptxTransitionKind;
  readonly transitionDurationMs?: number;
  readonly animations?: readonly BuildAnimationEntry[];
}

export interface PptxDeckInput {
  readonly title: string;
  readonly author?: string;
  readonly slideSize: PptxSlideSizePreset;
  readonly themeId: OoxmlThemeId;
  readonly slides: readonly PptxSlideInput[];
}

export interface ParsedPptxDeck {
  readonly deck: PptxDeckInput;
  readonly slideCount: number;
  readonly warnings: readonly string[];
  readonly rawSlideTexts: readonly (readonly string[])[];
}

export type PptxDeckPresetId =
  | "psst-business-plan"
  | "webtoon-series-proposal"
  | "episode-conti-pitch";
