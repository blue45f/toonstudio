/**
 * studio-animatic-lottie-export.ts — 애니매틱 → Lottie JSON 변환 (설계 v1 구현)
 *
 * 설계 전문: 같은 폴더의 lottie-export-design.md
 *
 * 변환 범위 (v1, 확정):
 * - 컴포지션: fps·전체 길이(ip/op)·캔버스 크기.
 * - 컷(segment) → 레이어 1개. 이미지 바인딩이 있으면 이미지 레이어(ty 2),
 *   없으면 플레이어가 그대로 재생할 수 있는 단색 플레이스홀더 레이어(ty 1).
 *   애니매틱 문서는 픽셀을 저장하지 않으므로 이미지 연결은 호출부가 바인딩으로 준다.
 * - 카메라 키프레임 → 위치(panX/panY %)·확대(zoom) 키프레임. 렌더러와 같은 식:
 *   위치 px = 중심 + pan% × 컴포지션 크기 / 100, 배율 = fit × zoom.
 * - 불투명도: fade 전환의 페이드인과 (확장 문서의) 카메라 키프레임 opacity.
 * - 이징: linear·ease-in-out(현 main) + ease-in·ease-out·hold(키프레임 편집 확장).
 *   Lottie 이징은 "시작 키프레임"에 붙고 ToonStudio는 "도착 키프레임"에서 읽으므로
 *   변환 시 한 칸 앞당겨 붙인다.
 * - 대사·효과음 cue → Lottie 마커 (텍스트 레이어는 폰트 에셋이 필요해 v2).
 *
 * 범위 밖 (warnings로 고지): 오디오, vertical-scroll 연속 스트립, pan 전환의
 * 추가 오프셋, sourceRect 픽셀 크롭(프리컴프 필요), 회전·마스크·효과.
 */

import {
  planStudioAnimaticPreview,
  type StudioAnimaticDocument,
  type StudioAnimaticSegment,
} from "../studio-animatic-timeline";
import { resolveStudioAnimaticError } from "../status-i18n/studio-producer-error-i18n";

export const STUDIO_ANIMATIC_LOTTIE_VERSION = "5.7.4";
export const STUDIO_ANIMATIC_LOTTIE_MAX_BYTES = 4_000_000;
export const STUDIO_ANIMATIC_LOTTIE_DEFAULT_WIDTH = 720;
export const STUDIO_ANIMATIC_LOTTIE_DEFAULT_HEIGHT = 1280;

/** main의 2종 + 키프레임 편집 확장의 3종. 모르는 값은 linear로 읽고 경고한다. */
export type StudioAnimaticLottieEasingName =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "hold";

export interface StudioAnimaticLottieImageBinding {
  readonly segmentId: string;
  /** Lottie 에셋 id (레이어 refId와 연결). */
  readonly assetId: string;
  readonly width: number;
  readonly height: number;
  /** 파일명 또는 data URI. data:로 시작하면 임베드 에셋(e:1)으로 쓴다. */
  readonly fileName: string;
  /** sourceRect(문서 좌표)를 에셋 픽셀로 환산할 때 쓰는 원본 문서 크기. 없으면 에셋 전체를 한 컷으로 본다. */
  readonly documentWidth?: number;
  readonly documentHeight?: number;
}

export interface StudioAnimaticLottieOptions {
  readonly width?: number;
  readonly height?: number;
  readonly name?: string;
  readonly images?: readonly StudioAnimaticLottieImageBinding[];
  /** 기본 true. false면 cue 마커를 만들지 않는다. */
  readonly includeCueMarkers?: boolean;
}

export interface LottieBezierTangents {
  readonly x: readonly number[];
  readonly y: readonly number[];
}

export interface LottieKeyframe {
  readonly t: number;
  readonly s: readonly number[];
  readonly e?: readonly number[];
  readonly i?: LottieBezierTangents;
  readonly o?: LottieBezierTangents;
  /** hold 키프레임 표시 (Lottie: h=1이면 다음 키프레임까지 값 유지). */
  readonly h?: 1;
}

export interface LottieAnimatedProperty {
  readonly a: 0 | 1;
  readonly k: readonly number[] | readonly LottieKeyframe[];
}

export interface LottieTransform {
  readonly o: LottieAnimatedProperty;
  readonly r: LottieAnimatedProperty;
  readonly p: LottieAnimatedProperty;
  readonly a: LottieAnimatedProperty;
  readonly s: LottieAnimatedProperty;
}

export interface LottieLayer {
  readonly ddd: 0;
  readonly ind: number;
  readonly ty: 1 | 2;
  readonly nm: string;
  readonly refId?: string;
  /** 단색 레이어(ty 1) 전용. */
  readonly sc?: string;
  readonly sw?: number;
  readonly sh?: number;
  readonly ks: LottieTransform;
  readonly ao: 0;
  readonly ip: number;
  readonly op: number;
  readonly st: number;
  readonly bm: 0;
}

export interface LottieAsset {
  readonly id: string;
  readonly w: number;
  readonly h: number;
  readonly u: string;
  readonly p: string;
  readonly e?: 0 | 1;
}

export interface LottieMarker {
  readonly tm: number;
  readonly cm: string;
  readonly dr: number;
}

export interface LottieAnimation {
  readonly v: string;
  readonly fr: number;
  readonly ip: number;
  readonly op: number;
  readonly w: number;
  readonly h: number;
  readonly nm: string;
  readonly ddd: 0;
  readonly assets: readonly LottieAsset[];
  readonly layers: readonly LottieLayer[];
  readonly markers?: readonly LottieMarker[];
}

export type StudioAnimaticLottieResult =
  | {
      readonly ok: true;
      readonly animation: LottieAnimation;
      readonly json: string;
      readonly bytes: number;
      readonly warnings: readonly string[];
    }
  | { readonly ok: false; readonly error: string };

/** 확장 필드(opacity)를 포함할 수 있는 카메라 키프레임의 느슨한 읽기 형태. */
interface CameraKeyframeRead {
  readonly at: number;
  readonly panXPercent: number;
  readonly panYPercent: number;
  readonly zoom: number;
  readonly easing: string;
  readonly opacity?: unknown;
}

const PLACEHOLDER_COLORS = ["#3b4a6b", "#6b3b4a", "#3b6b54", "#6b5a3b", "#54406b", "#3b626b"] as const;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round3(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function utf8Bytes(value: string): number {
  return typeof TextEncoder === "function" ? new TextEncoder().encode(value).byteLength : value.length * 3;
}

const EASING_TANGENTS: Record<
  Exclude<StudioAnimaticLottieEasingName, "hold">,
  { readonly o: LottieBezierTangents; readonly i: LottieBezierTangents }
> = {
  // 대각선 위 제어점 = 선형.
  linear: { o: { x: [0], y: [0] }, i: { x: [1], y: [1] } },
  // main의 ease-in-out은 smoothstep이며 cubic-bezier(0.42,0,0.58,1)가 그 표준 근사다.
  "ease-in-out": { o: { x: [0.42], y: [0] }, i: { x: [0.58], y: [1] } },
  "ease-in": { o: { x: [0.42], y: [0] }, i: { x: [1], y: [1] } },
  "ease-out": { o: { x: [0], y: [0] }, i: { x: [0.58], y: [1] } },
};

/** ToonStudio 이징 이름 → Lottie 베지어 탄젠트. hold·미지원 이름은 null. */
export function lottieTangentsForEasing(
  easing: string,
): { readonly o: LottieBezierTangents; readonly i: LottieBezierTangents } | null {
  if (easing === "hold") return null;
  return EASING_TANGENTS[easing as keyof typeof EASING_TANGENTS] ?? null;
}

function isKnownEasing(easing: string): boolean {
  return easing === "hold" || easing in EASING_TANGENTS;
}

interface TimedValue {
  /** 컴포지션 절대 프레임. */
  readonly t: number;
  readonly value: readonly number[];
  /** 이 값에서 다음 값으로 가는 구간의 이징 (도착 키프레임 이징을 앞당긴 것). */
  readonly easingToNext: string;
}

function animatedProperty(points: readonly TimedValue[]): LottieAnimatedProperty {
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const deduped: TimedValue[] = [];
  for (const point of sorted) {
    const last = deduped[deduped.length - 1];
    if (last && last.t === point.t) deduped[deduped.length - 1] = point;
    else deduped.push(point);
  }
  const first = deduped[0];
  if (!first) return { a: 0, k: [0] };
  const allEqual = deduped.every(
    (point) =>
      point.value.length === first.value.length &&
      point.value.every((v, index) => v === first.value[index]),
  );
  if (deduped.length === 1 || allEqual) return { a: 0, k: first.value };
  const keyframes: LottieKeyframe[] = deduped.map((point, index) => {
    const next = deduped[index + 1];
    if (!next) return { t: point.t, s: point.value };
    if (point.easingToNext === "hold") return { t: point.t, s: point.value, e: next.value, h: 1 };
    const tangents = lottieTangentsForEasing(point.easingToNext) ?? EASING_TANGENTS.linear;
    return { t: point.t, s: point.value, e: next.value, i: tangents.i, o: tangents.o };
  });
  return { a: 1, k: keyframes };
}

function readCameraKeyframes(segment: StudioAnimaticSegment): readonly CameraKeyframeRead[] {
  const raw = segment.cameraKeyframes as readonly CameraKeyframeRead[];
  if (raw.length > 0) return [...raw].sort((a, b) => a.at - b.at);
  return [
    { at: 0, panXPercent: 0, panYPercent: 0, zoom: 1, easing: "linear" },
    { at: 1, panXPercent: 0, panYPercent: 0, zoom: 1, easing: "linear" },
  ];
}

function opacityOf(kf: CameraKeyframeRead): number | null {
  return typeof kf.opacity === "number" && Number.isFinite(kf.opacity) ? clamp(kf.opacity, 0, 1) : null;
}

/** 한 컷의 fit 배율 (렌더러의 drawCut 식과 동일: sourceRect 픽셀 크기 기준). */
function fitForSegment(
  segment: StudioAnimaticSegment,
  binding: StudioAnimaticLottieImageBinding | undefined,
  width: number,
  height: number,
): number {
  if (!binding) return 1;
  const sw =
    binding.documentWidth && binding.documentWidth > 0
      ? (segment.sourceRect.width / binding.documentWidth) * binding.width
      : binding.width;
  const sh =
    binding.documentHeight && binding.documentHeight > 0
      ? (segment.sourceRect.height / binding.documentHeight) * binding.height
      : binding.height;
  if (!(sw > 0) || !(sh > 0)) return 1;
  return Math.min(width / sw, height / sh);
}

export function buildStudioAnimaticLottie(
  document: StudioAnimaticDocument,
  options: StudioAnimaticLottieOptions = {},
): StudioAnimaticLottieResult {
  const planned = planStudioAnimaticPreview(document, false);
  if (!planned.ok) return { ok: false, error: resolveStudioAnimaticError(planned.error) };
  const { plan } = planned;
  if (document.segments.length === 0 || plan.totalDurationMs <= 0) {
    return { ok: false, error: "내보낼 컷이 없습니다." };
  }
  const width = Math.round(clamp(options.width ?? STUDIO_ANIMATIC_LOTTIE_DEFAULT_WIDTH, 16, 4_096));
  const height = Math.round(clamp(options.height ?? STUDIO_ANIMATIC_LOTTIE_DEFAULT_HEIGHT, 16, 4_096));
  const fr = plan.fps;
  const warnings: string[] = [];
  const bindings = new Map((options.images ?? []).map((binding) => [binding.segmentId, binding]));

  if (document.previewMode === "vertical-scroll") {
    warnings.push(
      "세로 스크롤 모드는 연속 스트립이라 v1에서는 컷 단위 레이어로 변환했습니다. 스크롤 이동 자체는 Lottie에 담기지 않습니다.",
    );
  }

  const assets: LottieAsset[] = [];
  const seenAssets = new Set<string>();
  for (const binding of options.images ?? []) {
    if (seenAssets.has(binding.assetId)) continue;
    seenAssets.add(binding.assetId);
    const embedded = binding.fileName.startsWith("data:");
    assets.push({
      id: binding.assetId,
      w: Math.round(binding.width),
      h: Math.round(binding.height),
      u: "",
      p: binding.fileName,
      ...(embedded ? { e: 1 as const } : {}),
    });
  }

  let placeholderCount = 0;
  let panTransitionCount = 0;
  const unknownEasings = new Set<string>();

  const layers: LottieLayer[] = document.segments.map((segment, index) => {
    const planSegment = plan.segments[index]!;
    const startFrame = round3((planSegment.startMs * fr) / 1_000);
    const endFrame = round3((planSegment.endMs * fr) / 1_000);
    const durationFrames = Math.max(0.001, endFrame - startFrame);
    const binding = bindings.get(segment.id);
    if (!binding) placeholderCount += 1;
    if (segment.transition.kind === "pan") panTransitionCount += 1;

    const keyframes = readCameraKeyframes(segment);
    const fit = fitForSegment(segment, binding, width, height);
    // 구간의 이징은 도착 키프레임에서 읽으므로, Lottie(출발 키프레임 기준)로는 한 칸 앞당긴다.
    const easingToNextAt = (kfIndex: number): string => {
      const easing = keyframes[kfIndex + 1]?.easing ?? keyframes[kfIndex]?.easing ?? "linear";
      if (!isKnownEasing(easing)) unknownEasings.add(easing);
      return easing;
    };
    const frameAt = (kf: CameraKeyframeRead): number => round3(startFrame + clamp(kf.at, 0, 1) * durationFrames);

    const positions: TimedValue[] = keyframes.map((kf, kfIndex) => ({
      t: frameAt(kf),
      value: [
        round3(width / 2 + (kf.panXPercent * width) / 100),
        round3(height / 2 + (kf.panYPercent * height) / 100),
        0,
      ],
      easingToNext: easingToNextAt(kfIndex),
    }));
    const scales: TimedValue[] = keyframes.map((kf, kfIndex) => {
      const scale = round3(fit * kf.zoom * 100);
      return { t: frameAt(kf), value: [scale, scale, 100], easingToNext: easingToNextAt(kfIndex) };
    });

    // 불투명도: fade 전환(이전 컷 위로 페이드인) + 카메라 키프레임 opacity(확장 필드).
    const hasCameraOpacity = keyframes.some((kf) => opacityOf(kf) !== null);
    const fadesIn = segment.transition.kind === "fade" && index > 0 && segment.transition.durationMs > 0;
    let opacity: LottieAnimatedProperty;
    if (!hasCameraOpacity && !fadesIn) {
      opacity = { a: 0, k: [100] };
    } else {
      const points: TimedValue[] = [];
      if (fadesIn) {
        const fadeEndFrame = round3(
          startFrame + (Math.min(segment.transition.durationMs, planSegment.endMs - planSegment.startMs) * fr) / 1_000,
        );
        const baseAt = (frame: number): number => {
          // 페이드 구간 동안의 기준 불투명도(카메라 opacity 보간 근사: 구간 시작/끝 값).
          if (!hasCameraOpacity) return 100;
          const progress = (frame - startFrame) / durationFrames;
          const first = keyframes[0]!;
          const last = keyframes[keyframes.length - 1]!;
          const startValue = (opacityOf(first) ?? 1) * 100;
          const endValue = (opacityOf(last) ?? 1) * 100;
          return startValue + (endValue - startValue) * clamp(progress, 0, 1);
        };
        points.push({ t: startFrame, value: [0], easingToNext: "linear" });
        points.push({ t: fadeEndFrame, value: [round3(baseAt(fadeEndFrame))], easingToNext: "linear" });
      }
      if (hasCameraOpacity) {
        for (const [kfIndex, kf] of keyframes.entries()) {
          const t = frameAt(kf);
          if (fadesIn && t <= startFrame) continue;
          points.push({ t, value: [round3((opacityOf(kf) ?? 1) * 100)], easingToNext: easingToNextAt(kfIndex) });
        }
      }
      opacity = animatedProperty(points);
    }

    const anchor: readonly number[] = binding
      ? [round3(binding.width / 2), round3(binding.height / 2), 0]
      : [round3(width / 2), round3(height / 2), 0];

    return {
      ddd: 0,
      ind: index + 1,
      ty: binding ? 2 : 1,
      nm: segment.label || segment.id,
      ...(binding ? { refId: binding.assetId } : { sc: PLACEHOLDER_COLORS[index % PLACEHOLDER_COLORS.length]!, sw: width, sh: height }),
      ks: {
        o: opacity,
        r: { a: 0, k: [0] },
        p: animatedProperty(positions),
        a: { a: 0, k: anchor },
        s: animatedProperty(scales),
      },
      ao: 0,
      ip: startFrame,
      op: endFrame,
      st: startFrame,
      bm: 0,
    } satisfies LottieLayer;
  });

  if (placeholderCount > 0) {
    warnings.push(
      `이미지가 연결되지 않은 컷 ${placeholderCount}개는 단색 플레이스홀더 레이어로 변환했습니다. 실제 그림은 이미지 바인딩을 넘겨야 합니다.`,
    );
  }
  if (panTransitionCount > 0) {
    warnings.push(
      `pan 전환 ${panTransitionCount}개의 추가 오프셋(전환 중 12% 이동)은 v1에서 변환하지 않았습니다. 카메라 키프레임 이동만 반영됩니다.`,
    );
  }
  for (const easing of unknownEasings) {
    warnings.push(`지원하지 않는 이징 "${easing}"은 linear로 변환했습니다.`);
  }

  const markers: LottieMarker[] = [];
  if (options.includeCueMarkers !== false) {
    for (const [index, segment] of document.segments.entries()) {
      const planSegment = plan.segments[index]!;
      for (const cue of segment.cues) {
        const text = cue.speaker ? `${cue.speaker}: ${cue.text}` : cue.text;
        markers.push({
          tm: round3(((planSegment.startMs + cue.offsetMs) * fr) / 1_000),
          cm: text.slice(0, 160),
          dr: 0,
        });
      }
    }
    markers.sort((a, b) => a.tm - b.tm);
    if (markers.length > 0) {
      warnings.push(`대사·효과음 ${markers.length}개는 텍스트 레이어가 아닌 Lottie 마커로 변환했습니다.`);
    }
  }

  const animation: LottieAnimation = {
    v: STUDIO_ANIMATIC_LOTTIE_VERSION,
    fr,
    ip: 0,
    op: round3((plan.totalDurationMs * fr) / 1_000),
    w: width,
    h: height,
    nm: options.name ?? document.workScope,
    ddd: 0,
    assets,
    layers,
    ...(markers.length > 0 ? { markers } : {}),
  };
  const json = JSON.stringify(animation);
  const bytes = utf8Bytes(json);
  if (bytes > STUDIO_ANIMATIC_LOTTIE_MAX_BYTES) {
    return { ok: false, error: `Lottie 파일이 너무 큽니다 (${bytes.toLocaleString("ko-KR")} bytes).` };
  }
  return { ok: true, animation, json, bytes, warnings };
}

/**
 * 재생 가능성 최소 구조 검증 — lottie-web 등 표준 플레이어가 요구하는
 * 필수 필드·키프레임 순서·탄젠트 범위만 검사한다 (전체 스키마 검증이 아님).
 */
export function validateLottieAnimationShape(value: unknown): { ok: true } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "객체가 아닙니다." };
  const anim = value as Record<string, unknown>;
  if (typeof anim.v !== "string" || !anim.v) return { ok: false, error: "v(버전)가 없습니다." };
  for (const field of ["fr", "ip", "op", "w", "h"] as const) {
    if (typeof anim[field] !== "number" || !Number.isFinite(anim[field] as number)) {
      return { ok: false, error: `${field}가 숫자가 아닙니다.` };
    }
  }
  if ((anim.op as number) <= (anim.ip as number)) return { ok: false, error: "op가 ip보다 커야 합니다." };
  if (!Array.isArray(anim.layers) || anim.layers.length === 0) return { ok: false, error: "layers가 비어 있습니다." };
  const assetIds = new Set(
    (Array.isArray(anim.assets) ? anim.assets : []).map((asset) => (asset as { id?: unknown }).id),
  );
  for (const layer of anim.layers as Record<string, unknown>[]) {
    if (layer.ty !== 1 && layer.ty !== 2) return { ok: false, error: "지원하는 레이어 타입(1·2)이 아닙니다." };
    if (layer.ty === 2 && !assetIds.has(layer.refId)) return { ok: false, error: "이미지 레이어의 refId가 에셋에 없습니다." };
    const ks = layer.ks as Record<string, { a?: unknown; k?: unknown }> | undefined;
    if (!ks) return { ok: false, error: "레이어 변환(ks)이 없습니다." };
    for (const prop of ["o", "r", "p", "a", "s"] as const) {
      const property = ks[prop];
      if (!property || (property.a !== 0 && property.a !== 1)) {
        return { ok: false, error: `ks.${prop} 형식이 아닙니다.` };
      }
      if (property.a === 1) {
        const keyframes = property.k as { t?: unknown; s?: unknown }[];
        if (!Array.isArray(keyframes) || keyframes.length === 0) {
          return { ok: false, error: `ks.${prop} 키프레임이 비어 있습니다.` };
        }
        let prevT = -Infinity;
        for (const kf of keyframes) {
          if (typeof kf.t !== "number" || !Array.isArray(kf.s)) {
            return { ok: false, error: `ks.${prop} 키프레임에 t·s가 없습니다.` };
          }
          if (kf.t < prevT) return { ok: false, error: `ks.${prop} 키프레임 시간이 역행합니다.` };
          prevT = kf.t;
        }
      }
    }
    if (typeof layer.ip !== "number" || typeof layer.op !== "number" || layer.op <= layer.ip) {
      return { ok: false, error: "레이어 ip/op가 올바르지 않습니다." };
    }
  }
  return { ok: true };
}
