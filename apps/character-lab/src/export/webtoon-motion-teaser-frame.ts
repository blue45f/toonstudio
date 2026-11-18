/** 모션 티저 스케줄러와 CPU 렌더러가 공유하는 프레임·오버레이 데이터와 숫자 경계. */
import type { CapturedRaster } from "../contracts";

export interface CutKineticOverlayPlacement {
  readonly cutIndex: 0 | 1 | 2 | 3;
  readonly innerX: number;
  readonly innerY: number;
  readonly innerWidth: number;
  readonly innerHeight: number;
  readonly bubbleOverlay: CapturedRaster | null;
  readonly sfxOverlay: CapturedRaster | null;
}

export interface MotionTeaserFrameSample {
  readonly frameIndex: number;
  readonly outputTimeMs: number;
  readonly timelineElapsedMs: number;
  readonly scrollRatio01: number;
  readonly activeCutIndex: 0 | 1 | 2 | 3;
  /** 컷 체류 구간에서 미세한 포커스 호흡감을 주는 배율 (1.000..1.028) */
  readonly dwellZoom: number;
  /** 각 컷(0..3) 말풍선 팝인 불투명도 (패닝 접근 전 0 → 체류 진입 시 1) */
  readonly cutBubbleAlphas: readonly [number, number, number, number];
  /** 각 컷(0..3) 말풍선 스프링 팝인 배율 (0.78 → 1.04 → 1.00) */
  readonly cutBubbleScales: readonly [number, number, number, number];
  /** 활성 컷 효과음 임팩트 미세 진동 오프셋(px) */
  readonly shakeOffsetX: number;
  readonly shakeOffsetY: number;
  readonly progress01: number;
}

export interface MotionTeaserCameraWindow {
  readonly srcX: number;
  readonly srcY: number;
  readonly srcWidth: number;
  readonly srcHeight: number;
}

export function clampMotionTeaserNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
