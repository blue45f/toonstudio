import { TONE_MAPPINGS } from "../../../contracts";

import type { QualityPresetId, ShadingProfile, ToneMapping } from "../../../contracts";
import type { BetaFeatureId, BetaFeatureState } from "../../../render/beta-features";
import type { SceneFeatureReport } from "../../../render/scene-features";
import type { LabShaperGen3dLookId } from "../../../render/shaper-gen3d-bridge";

export interface RenderPanelProps {
  /** HUD·기능 보고 갱신 주기(ms). 0 이하면 한 번만 읽는다. */
  readonly pollIntervalMs?: number;
}

export const DEFAULT_RENDER_POLL_MS = 500;

export const QUALITY_IDS: readonly QualityPresetId[] = ["preview", "standard", "hero"];
export const TONE_LABELS_KO: Readonly<Record<ToneMapping, string>> = { "khr-pbr-neutral": "KHR PBR Neutral(기본)", aces: "ACES", none: "없음" };
export const OUTLINE_LABELS_KO = { none: "없음", hull: "외곽 셸(hull)", edge: "엣지 검출" } as const;
export const CASCADE_CHOICES = [1, 2, 3, 4] as const;
export const RAMP_CHOICES = [2, 3, 4] as const;

export function renderLookOptions(lookId: LabShaperGen3dLookId, delight: boolean, disableHairInline: boolean) {
  return { lookId, delight, disableHairInline };
}

export function withoutPendingBeta(previous: ReadonlySet<BetaFeatureId>, id: BetaFeatureId): ReadonlySet<BetaFeatureId> {
  const copy = new Set(previous);
  copy.delete(id);
  return copy;
}

export function unavailableFeatureReason(features: SceneFeatureReport | null, id: keyof SceneFeatureReport): string | null {
  const entry = features?.[id];
  return entry && entry.status === "unavailable" ? (entry.reasonKo ?? "사유 없음") : null;
}

export function isToneMapping(value: string): value is ToneMapping {
  return (TONE_MAPPINGS as readonly string[]).includes(value);
}

export function isOutline(value: string): value is ShadingProfile["toon"]["outline"] {
  return value === "none" || value === "hull" || value === "edge";
}

/** 베타 항목 한 줄 상태(한글). 요청했지만 지금은 적용되지 않는 경우(모드 불일치 등)는 오류가 아니라 '대기'다. */
export function describeBetaState(state: BetaFeatureState): string {
  if (state.status === "active") return state.detail ? `활성 — ${state.detail}` : "활성";
  if (state.status === "unavailable") return `사용 불가 — ${state.reasonKo ?? "사유 없음"}`;
  if (state.requested) return `대기 — ${state.reasonKo ?? "지금은 적용되지 않습니다."}`;
  return state.reasonKo ? `꺼짐 — ${state.reasonKo}` : "꺼짐";
}

export function failureMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "reasonKo" in error && typeof (error as { reasonKo: unknown }).reasonKo === "string") return (error as { reasonKo: string }).reasonKo;
  return error instanceof Error ? error.message : "알 수 없는 오류";
}
