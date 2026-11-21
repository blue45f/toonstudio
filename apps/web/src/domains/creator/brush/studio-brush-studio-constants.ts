import type { MangaNibPersonalityId } from "@toonstudio/studio-brush-platform";

import type { StudioBrushTipShapeId } from "./studio-brush-tip-stamp";

export const TIP_SHAPE_LABELS: Record<StudioBrushTipShapeId, string> = {
  round: "원형",
  soft: "소프트",
  hard: "하드",
  flake: "플레이크",
  grain: "그레인",
  bristle: "강모",
  sponge: "스펀지",
  sumi: "수묵",
  halftone: "망점",
  star: "스타",
  spatter: "스패터",
  rake: "레이크",
  grass: "잔디",
};

export interface StudioBrushUnifiedMediaPhysics {
  readonly impastoDepth: number;
  readonly wetMixStrength: number;
  readonly railroadEnabled: boolean;
  readonly railroadThreshold: number;
  readonly nibPersonality: MangaNibPersonalityId;
}

export const DEFAULT_STUDIO_BRUSH_UNIFIED_MEDIA_PHYSICS: StudioBrushUnifiedMediaPhysics =
  Object.freeze({
    impastoDepth: 0,
    wetMixStrength: 0,
    railroadEnabled: false,
    railroadThreshold: 0.72,
    nibPersonality: "g-pen",
  });
