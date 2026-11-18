/**
 * Studio Frame Animation — always-on frame editing, preview timing, and onion-skin model.
 * MediaRecorder and motion-export dependencies live in studio-frame-animation-export so the
 * Studio route does not download the WebM runtime until its already-lazy panel is requested.
 */
export {
  DEFAULT_FRAME_FPS,
  MAX_FRAME_FPS,
  MIN_FRAME_FPS,
  frameDurationMs,
  frameDurationsMs,
  frameIndexAtElapsed,
  normalizeFrameFps,
} from "./studio-frame-animation-timing";

// Types remain source-compatible without creating a runtime edge. Value exports intentionally
// live only in studio-frame-animation-export so the Studio static graph cannot pull MediaRecorder.
export type {
  FrameAnimationExportHandle,
  FrameAnimationExportOptions,
  FrameAnimationExportPlan,
  FrameAnimationExportRequest,
  MotionCutImage,
  MotionExportProgress,
  MotionExportResult,
} from "./export/studio-frame-animation-export";

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

// ── 프레임 데이터 모델 ──────────────────────────────────────────────

export interface StudioAnimFrame {
  id: string;
  src: string; // 래스터화된 PNG dataURL(프레임 1장, stage 캡처 결과)
  durationMs?: number; // 이 프레임만의 개별 노출 시간. 미설정 시 fps 기반 균등 시간.
}

// 프레임 상한 — 각 프레임이 PNG dataURL 통째로 문서 JSON에 인라인 저장되므로(기존 ImageEl.src와
// 동일 전략) 무한 성장은 문서 크기/히스토리 스냅샷 비용을 폭주시킨다. 60장(12fps 기준 5초 루프)은
// 눈짓/걷기/짧은 개그 루프에 충분하다.
export const MAX_ANIM_FRAMES = 60;

// 프레임 개별 노출 시간(setFrameDuration) 안전 범위 — 너무 짧으면 사실상 안 보이고, 너무 길면
// "애니메이션"이라 부르기 애매해진다(정지 컷과 구분 어려움).
const MIN_FRAME_DURATION_MS = 16;
const MAX_FRAME_DURATION_MS = 60_000;

export function createAnimFrame(src: string, id: string): StudioAnimFrame {
  return { id, src };
}

// ── 프레임 배열 조작(불변, studio-layers.ts 스타일) ─────────────────

/**
 * afterId 프레임 바로 뒤(없거나 미지정이면 맨 끝)에 frame을 삽입한 새 배열. 배열 길이가 이미
 * MAX_ANIM_FRAMES면 원본을 그대로 반환(무추가) — 호출측(패널)이 상한을 UI에서 안내한다. 순수.
 */
export function insertFrame(frames: StudioAnimFrame[], frame: StudioAnimFrame, afterId?: string | null): StudioAnimFrame[] {
  if (frames.length >= MAX_ANIM_FRAMES) return frames;
  if (afterId == null) return [...frames, frame];
  const index = frames.findIndex((f) => f.id === afterId);
  if (index === -1) return [...frames, frame];
  return [...frames.slice(0, index + 1), frame, ...frames.slice(index + 1)];
}

/** id 프레임 제거. 마지막 1장은 삭제 거부(원본 그대로 반환) — 애니메이션 요소는 항상 ≥1 프레임 유지. 순수. */
export function removeFrame(frames: StudioAnimFrame[], id: string): StudioAnimFrame[] {
  if (frames.length <= 1) return frames;
  const next = frames.filter((f) => f.id !== id);
  return next.length === frames.length ? frames : next;
}

/** id 프레임을 바로 뒤에 복제(newId). 상한 도달 시 무추가(원본 반환). 순수. */
export function duplicateFrame(frames: StudioAnimFrame[], id: string, newId: string): StudioAnimFrame[] {
  if (frames.length >= MAX_ANIM_FRAMES) return frames;
  const index = frames.findIndex((f) => f.id === id);
  if (index === -1) return frames;
  const copy: StudioAnimFrame = { ...frames[index]!, id: newId };
  return [...frames.slice(0, index + 1), copy, ...frames.slice(index + 1)];
}

/** id 프레임을 toIndex(범위 클램프)로 이동. 순수. */
export function reorderFrame(frames: StudioAnimFrame[], id: string, toIndex: number): StudioAnimFrame[] {
  const fromIndex = frames.findIndex((f) => f.id === id);
  if (fromIndex === -1) return frames;
  const target = clampFrameIndex(frames, toIndex);
  if (target === fromIndex) return frames;
  const next = frames.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(target, 0, moved!);
  return next;
}

/** id 프레임의 개별 노출 시간 설정(null이면 해제 → fps 기반 균등 시간으로 복귀). 순수. */
export function setFrameDuration(frames: StudioAnimFrame[], id: string, durationMs: number | null): StudioAnimFrame[] {
  return frames.map((f) =>
    f.id === id
      ? { ...f, durationMs: durationMs === null ? undefined : Math.round(clamp(durationMs, MIN_FRAME_DURATION_MS, MAX_FRAME_DURATION_MS)) }
      : f
  );
}

/** id의 인덱스. 없으면(또는 id가 null/undefined면) -1. 순수. */
export function frameIndexOf(frames: StudioAnimFrame[], id: string | null | undefined): number {
  if (id == null) return -1;
  return frames.findIndex((f) => f.id === id);
}

/** index를 [0, frames.length-1]로 클램프. 빈 배열이면 0. 순수. */
export function clampFrameIndex(frames: StudioAnimFrame[], index: number): number {
  if (frames.length === 0) return 0;
  return Math.round(clamp(index, 0, frames.length - 1));
}

// ── 어니언스키닝 v2 (순수 계산 — Konva 노드는 만들지 않는다) ──────────
// REA 근거: ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68,
// ev_84e24ea66b2393d0fa57182b4de9dbe3be9c25ee54f982c2dcfc534bf63eddda

export const LEGACY_MAX_ONION_SKIN_FRAMES = 3;
export const MAX_ONION_SKIN_FRAMES = 8;

export interface OnionSkinRgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export type OnionSkinOpacityFalloff = "harmonic" | "linear" | "exponential";

export const DEFAULT_ONION_PREV_RGB: OnionSkinRgbColor = Object.freeze({ r: 239, g: 68, b: 68 });
export const DEFAULT_ONION_NEXT_RGB: OnionSkinRgbColor = Object.freeze({ r: 59, g: 130, b: 246 });

export interface OnionSkinSettings {
  enabled: boolean;
  prevCount: number; // 기본 0..3, v2(extendedRange) 또는 onionSkinLayers 직접 전달 시 최대 8
  nextCount: number; // 기본 0..3, v2(extendedRange) 또는 onionSkinLayers 직접 전달 시 최대 8
  opacity: number; // 0..1 — 가장 가까운 인접 프레임(offset ±1)의 불투명도
  tint: boolean; // true면 이전=빨강·다음=파랑(또는 지정 RGB) 색조 힌트
  /** true이면 normalize 시 최대 8프레임 범위를 허용한다. */
  extendedRange?: boolean;
  /** 이전 프레임 사용자 지정 RGB 색상 (0..255). */
  prevColorRgb?: OnionSkinRgbColor;
  /** 다음 프레임 사용자 지정 RGB 색상 (0..255). */
  nextColorRgb?: OnionSkinRgbColor;
  /** 단계별 불투명도 감쇠 곡선 ("harmonic" = opacity/step 기본값). */
  opacityFalloff?: OnionSkinOpacityFalloff;
  /** exponential 감쇠 시 단계당 곱셈 비율 (0.05..0.95, 기본 0.65). */
  falloffRatio?: number;
  /** 어니언스킨에서 제외할 프레임 ID 또는 0-based 인덱스 목록. */
  excludedFrames?: readonly (string | number)[];
}

export const DEFAULT_ONION_SKIN: OnionSkinSettings = {
  enabled: true,
  prevCount: 1,
  nextCount: 1,
  opacity: 0.35,
  tint: true,
};

function normalizeRgbChannel(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.round(clamp(value, 0, 255));
}

export function normalizeOnionSkinRgbColor(
  raw: Partial<OnionSkinRgbColor> | undefined,
  fallback: OnionSkinRgbColor,
): OnionSkinRgbColor {
  if (!raw) return fallback;
  return {
    r: normalizeRgbChannel(raw.r ?? fallback.r, fallback.r),
    g: normalizeRgbChannel(raw.g ?? fallback.g, fallback.g),
    b: normalizeRgbChannel(raw.b ?? fallback.b, fallback.b),
  };
}

export function onionSkinRgbToHex(rgb: OnionSkinRgbColor): string {
  const toHex = (c: number) => normalizeRgbChannel(c, 0).toString(16).padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function isOnionSkinFalloff(v: unknown): v is OnionSkinOpacityFalloff {
  return v === "harmonic" || v === "linear" || v === "exponential";
}

export function normalizeOnionSkinSettings(
  s: Partial<OnionSkinSettings> | undefined,
  options?: { readonly maxCount?: number },
): OnionSkinSettings {
  const merged = { ...DEFAULT_ONION_SKIN, ...s };
  const maxCount =
    options?.maxCount !== undefined
      ? Math.round(clamp(options.maxCount, 0, MAX_ONION_SKIN_FRAMES))
      : s?.extendedRange === true
        ? MAX_ONION_SKIN_FRAMES
        : LEGACY_MAX_ONION_SKIN_FRAMES;
  const base: OnionSkinSettings = {
    enabled: !!merged.enabled,
    prevCount: Math.round(clamp(merged.prevCount, 0, maxCount)),
    nextCount: Math.round(clamp(merged.nextCount, 0, maxCount)),
    opacity: clamp01(merged.opacity),
    tint: !!merged.tint,
  };
  if (s?.extendedRange !== undefined) base.extendedRange = !!s.extendedRange;
  if (s?.prevColorRgb !== undefined) base.prevColorRgb = normalizeOnionSkinRgbColor(s.prevColorRgb, DEFAULT_ONION_PREV_RGB);
  if (s?.nextColorRgb !== undefined) base.nextColorRgb = normalizeOnionSkinRgbColor(s.nextColorRgb, DEFAULT_ONION_NEXT_RGB);
  if (s?.opacityFalloff !== undefined) base.opacityFalloff = isOnionSkinFalloff(s.opacityFalloff) ? s.opacityFalloff : "harmonic";
  if (s?.falloffRatio !== undefined) base.falloffRatio = clamp(s.falloffRatio, 0.05, 0.95);
  if (s?.excludedFrames !== undefined) {
    base.excludedFrames = s.excludedFrames.filter(
      (item): item is string | number =>
        (typeof item === "string" && item.length > 0) || (typeof item === "number" && Number.isInteger(item) && item >= 0),
    );
  }
  return base;
}

/** 최대 8장 범위와 색상·감쇠·제외 프레임을 함께 정규화하는 어니언스킨 v2 진입점. */
export function normalizeOnionSkinSettingsV2(s: Partial<OnionSkinSettings> | undefined): OnionSkinSettings {
  return normalizeOnionSkinSettings({ extendedRange: true, ...s }, { maxCount: MAX_ONION_SKIN_FRAMES });
}

export interface OnionSkinLayer {
  frame: StudioAnimFrame;
  offset: number; // -8..-1, 1..8 (음수=이전, 양수=다음)
  opacity: number; // 감쇠 적용 후 불투명도 (0..1)
  tint: "prev" | "next" | "none";
  colorRgb?: OnionSkinRgbColor;
}

export function resolveOnionSkinLayerColorRgb(
  layer: Pick<OnionSkinLayer, "tint" | "colorRgb">,
  settings?: Pick<OnionSkinSettings, "prevColorRgb" | "nextColorRgb">,
): OnionSkinRgbColor | null {
  if (layer.tint === "none") return null;
  if (layer.colorRgb) return layer.colorRgb;
  return layer.tint === "prev"
    ? normalizeOnionSkinRgbColor(settings?.prevColorRgb, DEFAULT_ONION_PREV_RGB)
    : normalizeOnionSkinRgbColor(settings?.nextColorRgb, DEFAULT_ONION_NEXT_RGB);
}

function computeStepOpacity(
  baseOpacity: number,
  step: number,
  sideCount: number,
  settings: OnionSkinSettings,
): number {
  const mode = settings.opacityFalloff ?? "harmonic";
  if (mode === "linear") {
    const span = Math.max(1, sideCount);
    return clamp01(baseOpacity * ((span - step + 1) / span));
  }
  if (mode === "exponential") {
    const ratio = clamp(settings.falloffRatio ?? 0.65, 0.05, 0.95);
    return clamp01(baseOpacity * Math.pow(ratio, step - 1));
  }
  return clamp01(baseOpacity / step);
}

/**
 * 활성 인덱스 기준 렌더할 어니언스킨 레이어(이전 쪽 가까운 순 → 다음 쪽 가까운 순). 시퀀스
 * 양끝을 넘어가면 멈춘다(래핑 없음). 최대 8장 전/후 탐색 및 excludedFrames 건너뛰기 지원. 순수.
 */
export function onionSkinLayers(frames: StudioAnimFrame[], activeIndex: number, settings: OnionSkinSettings): OnionSkinLayer[] {
  if (!settings.enabled || frames.length < 2) return [];
  const index = clampFrameIndex(frames, activeIndex);
  const prevCount = Math.round(clamp(settings.prevCount, 0, MAX_ONION_SKIN_FRAMES));
  const nextCount = Math.round(clamp(settings.nextCount, 0, MAX_ONION_SKIN_FRAMES));
  const excluded = settings.excludedFrames?.length ? new Set<string | number>(settings.excludedFrames) : null;
  const hasCustomRgb = settings.prevColorRgb !== undefined || settings.nextColorRgb !== undefined;
  const prevRgb = hasCustomRgb ? normalizeOnionSkinRgbColor(settings.prevColorRgb, DEFAULT_ONION_PREV_RGB) : undefined;
  const nextRgb = hasCustomRgb ? normalizeOnionSkinRgbColor(settings.nextColorRgb, DEFAULT_ONION_NEXT_RGB) : undefined;
  const layers: OnionSkinLayer[] = [];

  for (let step = 1; step <= prevCount; step++) {
    const i = index - step;
    if (i < 0) break;
    const candidate = frames[i]!;
    if (excluded && (excluded.has(candidate.id) || excluded.has(i))) continue;
    const tint = settings.tint ? "prev" : "none";
    layers.push({
      frame: candidate,
      offset: -step,
      opacity: computeStepOpacity(settings.opacity, step, prevCount, settings),
      tint,
      ...(tint === "prev" && prevRgb ? { colorRgb: prevRgb } : {}),
    });
  }
  for (let step = 1; step <= nextCount; step++) {
    const i = index + step;
    if (i >= frames.length) break;
    const candidate = frames[i]!;
    if (excluded && (excluded.has(candidate.id) || excluded.has(i))) continue;
    const tint = settings.tint ? "next" : "none";
    layers.push({
      frame: candidate,
      offset: step,
      opacity: computeStepOpacity(settings.opacity, step, nextCount, settings),
      tint,
      ...(tint === "next" && nextRgb ? { colorRgb: nextRgb } : {}),
    });
  }
  return layers;
}
