/**
 * studio-flood-fill-bleed-preview.ts
 *
 * Pure geometric model for Flood Fill / Color Assist (채색 보조):
 * - Visualizes live area expansion / bleed range (`expansionPx` + `tolerance`)
 * - Visualizes lineart gap sealing (`closeGapPx`)
 * - Flags leak risk when wide expansion/tolerance is paired with 0px gap closing
 */

import { toleranceToPercent } from "../studio-colordrop-gesture";
import type { StudioAdvancedFillSettings } from "../studio-advanced-fill-settings";

export type FloodFillBleedRiskLevel = "safe" | "moderate" | "wide";

export interface StudioFloodFillBleedPreviewMetrics {
  readonly baseRadiusSvg: number;
  readonly bleedRingRadiusSvg: number;
  readonly gapBridgeStrokeWidthSvg: number;
  readonly gapSealed: boolean;
  readonly tolerancePercent: number;
  readonly bleedDeltaPx: number;
  readonly riskLevel: FloodFillBleedRiskLevel;
  readonly summaryText: string;
}

export function computeStudioFloodFillBleedPreview(
  settings: Pick<
    StudioAdvancedFillSettings,
    "tolerance" | "expansionPx" | "closeGapPx" | "antiAlias" | "leakGuard"
  >,
): StudioFloodFillBleedPreviewMetrics {
  const baseRadiusSvg = 22;
  const tolerancePercent = toleranceToPercent(settings.tolerance);
  const expansionPx = Number.isFinite(settings.expansionPx) ? settings.expansionPx : 0;
  const closeGapPx = Number.isFinite(settings.closeGapPx) ? Math.max(0, settings.closeGapPx) : 0;

  const rawDeltaSvg = expansionPx * 0.65 + (tolerancePercent / 100) * 3.5;
  const clampedDeltaSvg = Math.max(-9, Math.min(11, rawDeltaSvg));
  const bleedRingRadiusSvg = Math.round((baseRadiusSvg + clampedDeltaSvg) * 10) / 10;

  const gapSealed = closeGapPx > 0;
  const gapBridgeStrokeWidthSvg = gapSealed
    ? Math.round(Math.min(7.5, 1.5 + closeGapPx * 0.3) * 10) / 10
    : 0;

  let riskLevel: FloodFillBleedRiskLevel = "safe";
  if ((tolerancePercent >= 65 || expansionPx >= 8) && closeGapPx === 0) {
    riskLevel = "wide";
  } else if (tolerancePercent >= 45 || expansionPx >= 4) {
    riskLevel = "moderate";
  }

  const expansionPhrase =
    expansionPx > 0
      ? `선 안쪽 +${expansionPx}px 번짐`
      : expansionPx < 0
        ? `경계 안쪽 ${expansionPx}px 축소`
        : "경계 정밀 밀착";
  const gapPhrase = gapSealed ? `틈 닫기 ${closeGapPx}px` : "틈 닫기 꺼짐";

  return {
    baseRadiusSvg,
    bleedRingRadiusSvg,
    gapBridgeStrokeWidthSvg,
    gapSealed,
    tolerancePercent,
    bleedDeltaPx: expansionPx,
    riskLevel,
    summaryText: `${expansionPhrase} · ${gapPhrase} · 오차 ${tolerancePercent}%`,
  };
}
