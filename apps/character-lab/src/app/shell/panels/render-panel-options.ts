import { TONE_MAPPINGS } from "../../../contracts";

import type { QualityPresetId, ShadingProfile, ToneMapping } from "../../../contracts";
import type { BetaFeatureState } from "../../../render/beta-features";

export const DEFAULT_RENDER_POLL_MS = 500;

export const QUALITY_IDS: readonly QualityPresetId[] = ["preview", "standard", "hero"];
export const TONE_LABELS_KO: Readonly<Record<ToneMapping, string>> = { "khr-pbr-neutral": "KHR PBR Neutral(기본)", aces: "ACES", none: "없음" };
export const OUTLINE_LABELS_KO = { none: "없음", hull: "외곽 셸(hull)", edge: "엣지 검출" } as const;
export const CASCADE_CHOICES = [1, 2, 3, 4] as const;
export const RAMP_CHOICES = [2, 3, 4] as const;

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
