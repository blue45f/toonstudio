/**
 * 모션 웹툰 키프레임 보간 코어.
 *
 * 시간축 위의 키프레임(변환 채널 값 + 다음 구간 이징)을 임의 시각에서 샘플링하는
 * 순수 계산 모듈. 채널은 분석(EffectCraft 대조)에서 확정한 5종 —
 * X/Y 이동(%), 스케일, 회전(deg), 불투명도 — 이다.
 *
 * 카메라 무브(줌·팬·흔들림)는 이 코어 위의 프리셋 트랙으로 표현한다.
 * 진폭 매핑은 기존 CSS 재생(@keyframes mw-*)과 강도 기본값 0.5에서 정확히
 * 일치하도록 잡았다 — 줌 1→1.18, 팬 scale 1.15·이동 ±4%, 흔들림 오프셋 그대로.
 * 그래서 키프레임 샘플링으로 바꿔도 기본 연출의 겉모습은 변하지 않는다.
 */

import {
  applyMotionEasing,
  DEFAULT_MOTION_EASING_PRESET_ID,
  LINEAR_EASING,
  resolveMotionEasing,
  type MotionEasing,
  type MotionEasingPresetId,
} from "./motion-webtoon-easing";
import {
  clampCutDuration,
  clampIntensity,
  type CutDirection,
} from "./motion-webtoon-model";

/** 변환 채널 값. x·y는 무대 크기 대비 %(CSS translate %와 동일 의미). */
export interface MotionTransformValues {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotationDeg: number;
  readonly opacity: number;
}

export const IDENTITY_TRANSFORM: MotionTransformValues = {
  x: 0,
  y: 0,
  scale: 1,
  rotationDeg: 0,
  opacity: 1,
};

/** 키프레임 — atSeconds는 트랙(컷) 시작 기준 초. easing은 다음 키프레임까지의 구간 이징. */
export interface MotionKeyframe {
  readonly atSeconds: number;
  readonly easing: MotionEasing;
  readonly values: MotionTransformValues;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpValues(
  from: MotionTransformValues,
  to: MotionTransformValues,
  t: number,
): MotionTransformValues {
  return {
    x: lerp(from.x, to.x, t),
    y: lerp(from.y, to.y, t),
    scale: lerp(from.scale, to.scale, t),
    rotationDeg: lerp(from.rotationDeg, to.rotationDeg, t),
    opacity: lerp(from.opacity, to.opacity, t),
  };
}

/**
 * 키프레임 트랙을 timeSeconds에서 샘플링한다.
 * - 트랙이 비면 항등 변환.
 * - 첫 키프레임 이전이면 첫 값, 마지막 이후면 마지막 값(양끝 클램프).
 * - 구간 안에서는 시작 키프레임의 이징을 적용한 비율로 채널별 선형 보간.
 * - 길이가 0인 구간(같은 시각의 키프레임 중복)에서는 뒤 키프레임 값이 즉시 이긴다.
 */
export function sampleMotionKeyframes(
  keyframes: readonly MotionKeyframe[],
  timeSeconds: number,
): MotionTransformValues {
  if (keyframes.length === 0) return IDENTITY_TRANSFORM;
  const sorted = [...keyframes].sort((a, b) => a.atSeconds - b.atSeconds);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const t = Number.isFinite(timeSeconds) ? timeSeconds : 0;
  if (t <= first.atSeconds) return first.values;
  if (t >= last.atSeconds) return last.values;

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const from = sorted[i]!;
    const to = sorted[i + 1]!;
    if (t < from.atSeconds || t >= to.atSeconds) continue;
    const span = to.atSeconds - from.atSeconds;
    if (span <= 0) return to.values;
    const local = (t - from.atSeconds) / span;
    return lerpValues(from.values, to.values, applyMotionEasing(from.easing, local));
  }
  return last.values;
}

// ── 카메라 무브 → 키프레임 트랙 ───────────────────────────────────────

/**
 * 컷 연출에 실제로 적용할 이징.
 * 흔들림은 기존 CSS가 linear 고정이었고 구간마다 방향이 바뀌는 지터라,
 * 이징을 따로 지정하지 않았으면 linear를 유지한다. 그 외 무브는 기본 ease-in-out.
 */
export function resolveCutEasing(direction: CutDirection): MotionEasing {
  if (direction.easing) return resolveMotionEasing(direction.easing);
  if (direction.cameraMove === "shake") return LINEAR_EASING;
  return resolveMotionEasing(undefined);
}

/** 에디터 표시용 — 컷에 실제로 적용 중인 이징 프리셋 ID(미지정 시 무브별 기본값). */
export function resolveCutEasingPresetId(direction: CutDirection): MotionEasingPresetId {
  if (direction.easing) return direction.easing;
  return direction.cameraMove === "shake" ? "linear" : DEFAULT_MOTION_EASING_PRESET_ID;
}

function keyframe(
  atSeconds: number,
  easing: MotionEasing,
  values: Partial<MotionTransformValues>,
): MotionKeyframe {
  return { atSeconds, easing, values: { ...IDENTITY_TRANSFORM, ...values } };
}

/**
 * 카메라 무브 + 강도 → 컷 길이 전체를 덮는 키프레임 트랙.
 * 강도 0.5에서 기존 CSS @keyframes mw-*와 수치가 일치한다.
 */
export function buildCameraKeyframes(direction: CutDirection): MotionKeyframe[] {
  const duration = clampCutDuration(direction.durationSeconds);
  const intensity = clampIntensity(direction.intensity);
  const easing = resolveCutEasing(direction);

  // CSS 실측: zoom scale 1↔1.18 (Δ0.18 @ 강도 0.5), pan scale 1.15·이동 ±4%.
  const zoomScale = 1 + 0.36 * intensity;
  const panScale = 1 + 0.3 * intensity;
  const panOffset = 8 * intensity;
  const shakeGain = 2 * intensity;

  switch (direction.cameraMove) {
    case "static":
      return [keyframe(0, easing, {})];
    case "zoom-in":
      return [keyframe(0, easing, { scale: 1 }), keyframe(duration, easing, { scale: zoomScale })];
    case "zoom-out":
      return [keyframe(0, easing, { scale: zoomScale }), keyframe(duration, easing, { scale: 1 })];
    case "pan-left":
      return [
        keyframe(0, easing, { scale: panScale, x: panOffset }),
        keyframe(duration, easing, { scale: panScale, x: -panOffset }),
      ];
    case "pan-right":
      return [
        keyframe(0, easing, { scale: panScale, x: -panOffset }),
        keyframe(duration, easing, { scale: panScale, x: panOffset }),
      ];
    case "pan-up":
      return [
        keyframe(0, easing, { scale: panScale, y: panOffset }),
        keyframe(duration, easing, { scale: panScale, y: -panOffset }),
      ];
    case "pan-down":
      return [
        keyframe(0, easing, { scale: panScale, y: -panOffset }),
        keyframe(duration, easing, { scale: panScale, y: panOffset }),
      ];
    case "shake": {
      // CSS mw-shake 오프셋(%) — 0/20/40/60/80/100% 지점. 구간 이징은 linear 고정.
      const offsets: readonly (readonly [number, number, number])[] = [
        [0, 0, 0],
        [0.2, -1.2, 0.8],
        [0.4, 1, -1],
        [0.6, -0.8, -0.6],
        [0.8, 1.1, 0.9],
        [1, 0, 0],
      ];
      return offsets.map(([fraction, x, y]) =>
        keyframe(duration * fraction, LINEAR_EASING, { x: x * shakeGain, y: y * shakeGain }),
      );
    }
  }
}

/** 컷 안 시각(초)에서 카메라 변환을 샘플링한다 — 내보내기 렌더러·미리보기 공용. */
export function sampleCameraTransform(
  direction: CutDirection,
  cutLocalSeconds: number,
): MotionTransformValues {
  return sampleMotionKeyframes(buildCameraKeyframes(direction), cutLocalSeconds);
}

/** DOM 인라인 스타일용 변환 문자열. translate %는 요소 크기 기준(CSS 의미 유지). */
export function cameraTransformCss(values: MotionTransformValues): string {
  const round = (n: number): number => Math.round(n * 10000) / 10000;
  return `translate(${round(values.x)}%, ${round(values.y)}%) scale(${round(values.scale)}) rotate(${round(values.rotationDeg)}deg)`;
}
