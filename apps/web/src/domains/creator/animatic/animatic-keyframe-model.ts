/**
 * animatic-keyframe-model.ts — 애니매틱 키프레임 트랙 모델 (순수 모듈 초안)
 *
 * 애니매틱은 컷 타이밍·오디오까지 있으나 값의 시간 변화(카메라 이동·줌·
 * 불투명도·자막 페이드)를 키프레임으로 다루는 층이 없었다. 이 모델은
 * "속성 × 키프레임 목록"의 순수 자료구조와 시간 샘플링만 책임진다.
 * 편집 UI(레인·그래프)와 렌더 적용은 후속 단계가 이 모델 위에 얹는다.
 */

export type KeyframeEasing =
  | { readonly kind: "linear" }
  | { readonly kind: "hold" }
  | { readonly kind: "ease-in" }
  | { readonly kind: "ease-out" }
  | { readonly kind: "ease-in-out" }
  | {
      readonly kind: "bezier";
      /** 시간축 제어점 (0~1). 값축은 y1,y2. */
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
    };

export interface AnimaticKeyframe {
  /** 초 단위 시간 (트랙 시작 기준). */
  readonly time: number;
  readonly value: number;
  /** 이 키프레임에서 다음 키프레임으로 가는 구간의 이징. */
  readonly easing: KeyframeEasing;
}

export interface AnimaticKeyframeTrack {
  /** 대상 속성 식별자. 예: "camera.x", "camera.zoom", "layer.opacity", "caption.fade" */
  readonly property: string;
  readonly keyframes: readonly AnimaticKeyframe[];
}

const LINEAR: KeyframeEasing = { kind: "linear" };

/** 시간 순 정렬 + 같은 시간 키프레임 교체 규칙으로 트랙을 정규화한다. */
export function normalizeKeyframeTrack(track: AnimaticKeyframeTrack): AnimaticKeyframeTrack {
  const byTime = new Map<number, AnimaticKeyframe>();
  for (const kf of track.keyframes) {
    if (!Number.isFinite(kf.time) || !Number.isFinite(kf.value)) continue;
    byTime.set(Math.max(0, kf.time), { ...kf, time: Math.max(0, kf.time) });
  }
  const keyframes = [...byTime.values()].sort((a, b) => a.time - b.time);
  return { property: track.property, keyframes };
}

/** 키프레임을 넣은 새 트랙을 돌려준다 (같은 시간이면 교체). */
export function upsertKeyframe(
  track: AnimaticKeyframeTrack,
  time: number,
  value: number,
  easing: KeyframeEasing = LINEAR,
): AnimaticKeyframeTrack {
  return normalizeKeyframeTrack({
    property: track.property,
    keyframes: [...track.keyframes.filter((kf) => kf.time !== time), { time, value, easing }],
  });
}

/** 지정 시간의 키프레임을 뺀 새 트랙. */
export function removeKeyframeAt(track: AnimaticKeyframeTrack, time: number): AnimaticKeyframeTrack {
  return { property: track.property, keyframes: track.keyframes.filter((kf) => kf.time !== time) };
}

/** 구간 전체를 delta초만큼 이동한 새 트랙 (음수 이동은 0에서 멈춤). */
export function shiftKeyframes(track: AnimaticKeyframeTrack, deltaSeconds: number): AnimaticKeyframeTrack {
  return normalizeKeyframeTrack({
    property: track.property,
    keyframes: track.keyframes.map((kf) => ({ ...kf, time: Math.max(0, kf.time + deltaSeconds) })),
  });
}

function cubicAt(t: number, p1: number, p2: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t;
}

function cubicSlope(t: number, p1: number, p2: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * p1 + 6 * mt * t * (p2 - p1) + 3 * t * t * (1 - p2);
}

/** cubic-bezier(x1,y1,x2,y2)에서 x(진행률)에 대한 y를 푼다 (Newton + 이분 폴백). */
export function sampleCubicBezier(x: number, x1: number, y1: number, x2: number, y2: number): number {
  const clamped = Math.min(1, Math.max(0, x));
  let t = clamped;
  for (let i = 0; i < 8; i += 1) {
    const err = cubicAt(t, x1, x2) - clamped;
    if (Math.abs(err) < 1e-6) return cubicAt(t, y1, y2);
    const slope = cubicSlope(t, x1, x2);
    if (Math.abs(slope) < 1e-6) break;
    t -= err / slope;
    if (t < 0 || t > 1) break;
  }
  let lo = 0;
  let hi = 1;
  t = clamped;
  for (let i = 0; i < 24; i += 1) {
    const v = cubicAt(t, x1, x2);
    if (Math.abs(v - clamped) < 1e-6) break;
    if (v < clamped) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return cubicAt(t, y1, y2);
}

/** 이징을 0~1 진행률에 적용한다. */
export function applyEasing(easing: KeyframeEasing, progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  switch (easing.kind) {
    case "linear":
      return p;
    case "hold":
      return 0;
    case "ease-in":
      return sampleCubicBezier(p, 0.42, 0, 1, 1);
    case "ease-out":
      return sampleCubicBezier(p, 0, 0, 0.58, 1);
    case "ease-in-out":
      return sampleCubicBezier(p, 0.42, 0, 0.58, 1);
    case "bezier":
      return sampleCubicBezier(p, easing.x1, easing.y1, easing.x2, easing.y2);
  }
}

/** 시간 t에서의 속성 값을 샘플링한다. 키프레임이 없으면 undefined. */
export function sampleKeyframeTrack(track: AnimaticKeyframeTrack, time: number): number | undefined {
  const kfs = track.keyframes;
  if (kfs.length === 0) return undefined;
  const first = kfs[0]!;
  const last = kfs[kfs.length - 1]!;
  if (time <= first.time) return first.value;
  if (time >= last.time) return last.value;
  for (let i = 0; i < kfs.length - 1; i += 1) {
    const a = kfs[i]!;
    const b = kfs[i + 1]!;
    if (time >= a.time && time <= b.time) {
      if (a.easing.kind === "hold") return a.value;
      const span = b.time - a.time;
      const progress = span === 0 ? 1 : (time - a.time) / span;
      return a.value + (b.value - a.value) * applyEasing(a.easing, progress);
    }
  }
  return last.value;
}

/* ------------------------------------------------------------------ */
/* 카메라 키프레임 어댑터 — 타임라인의 StudioAnimaticCameraKeyframe    */
/* (at 0..1, 이징 문자열)과 이 모델의 속성 트랙 사이를 잇는다.         */
/* ------------------------------------------------------------------ */

export type CameraEasingName =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "ease-in-back"
  | "ease-out-back"
  | "hold"
  | "custom";

export interface CameraKeyframeLike {
  readonly at: number;
  readonly panXPercent: number;
  readonly panYPercent: number;
  readonly zoom: number;
  readonly opacity: number;
  readonly easing: CameraEasingName;
  /** easing이 "custom"인 구간의 베지어 제어점 (x1,y1,x2,y2). */
  readonly curve?: readonly [number, number, number, number];
}

/**
 * 이름 → 이징. 백 이징·커스텀 곡선의 제어점은 keyframe-curve-model.ts의
 * EASING_PRESETS 정본과 같은 값이며, 테스트가 일치를 고정한다.
 */
export function easingFromName(name: CameraEasingName, curve?: readonly [number, number, number, number]): KeyframeEasing {
  switch (name) {
    case "ease-in": return { kind: "ease-in" };
    case "ease-out": return { kind: "ease-out" };
    case "ease-in-out": return { kind: "ease-in-out" };
    case "ease-in-back": return { kind: "bezier", x1: 0.36, y1: 0, x2: 0.66, y2: -0.56 };
    case "ease-out-back": return { kind: "bezier", x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 };
    case "custom":
      return curve ? { kind: "bezier", x1: curve[0], y1: curve[1], x2: curve[2], y2: curve[3] } : { kind: "ease-in-out" };
    case "hold": return { kind: "hold" };
    default: return { kind: "linear" };
  }
}

export const CAMERA_PROPERTIES = ["camera.panX", "camera.panY", "camera.zoom", "layer.opacity"] as const;
export type CameraProperty = (typeof CAMERA_PROPERTIES)[number];

/**
 * 카메라 키프레임 목록을 속성별 트랙으로 펼친다.
 * 타임라인 샘플러는 구간의 이징을 "도착 키프레임"에서 읽으므로, 트랙으로 펼칠 때는
 * 각 키프레임에 다음 키프레임의 이징을 붙여 같은 곡선이 나오게 맞춘다.
 */
export function cameraKeyframesToTracks(keyframes: readonly CameraKeyframeLike[]): Record<CameraProperty, AnimaticKeyframeTrack> {
  const build = (property: CameraProperty, pick: (kf: CameraKeyframeLike) => number): AnimaticKeyframeTrack =>
    normalizeKeyframeTrack({
      property,
      keyframes: keyframes.map((kf, index) => {
        const arrival = keyframes[index + 1] ?? kf;
        return { time: kf.at, value: pick(kf), easing: easingFromName(arrival.easing, arrival.curve) };
      }),
    });
  return {
    "camera.panX": build("camera.panX", (kf) => kf.panXPercent),
    "camera.panY": build("camera.panY", (kf) => kf.panYPercent),
    "camera.zoom": build("camera.zoom", (kf) => kf.zoom),
    "layer.opacity": build("layer.opacity", (kf) => kf.opacity),
  };
}

/** 진행률(0..1)에서의 카메라·불투명도 보간값. 트랙이 비면 undefined 채널이 섞일 수 있어 호출부에서 기본값을 둔다. */
export function sampleCameraTracksAt(
  tracks: Record<CameraProperty, AnimaticKeyframeTrack>,
  progress: number,
): { panXPercent: number; panYPercent: number; zoom: number; opacity: number } {
  const t = Math.min(1, Math.max(0, progress));
  return {
    panXPercent: sampleKeyframeTrack(tracks["camera.panX"], t) ?? 0,
    panYPercent: sampleKeyframeTrack(tracks["camera.panY"], t) ?? 0,
    zoom: sampleKeyframeTrack(tracks["camera.zoom"], t) ?? 1,
    opacity: sampleKeyframeTrack(tracks["layer.opacity"], t) ?? 1,
  };
}
