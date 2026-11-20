/**
 * PureRef 2.0 / VizRef / BeeRef 프로 레퍼런스 오버레이 컨트롤러.
 *
 * 기존 `studio-reference-board.ts` 위에 다음 4가지 고급 작화 참고 기능을 비파괴 확장한다:
 * 1. 클릭-스루 투명 트레이싱 오버레이(`Alt+T` 토글, `pointer-events: none`, 투명도 0.15..0.85, 흑백 명도 체크)
 * 2. 비파괴 정규화 크롭(`cropRect`) 및 시맨틱 톤 레드라인 주석(`annotations[]`) 직렬화
 * 3. GIF/Animated WebP 프레임 스텝 스크러버 및 A-B 구간 루프 재생 상태 머신
 * 4. Document Picture-in-Picture 항상 위 보드 런처(미지원 환경은 보조 창 폴백)
 */

import type { StudioReferenceBoardItemView } from "../studio-reference-board";

export const REFERENCE_PRO_SCHEMA_VERSION = 1 as const;
export const CLICK_THROUGH_MIN_OPACITY = 0.15;
export const CLICK_THROUGH_MAX_OPACITY = 0.85;
export const MIN_CROP_DIMENSION = 0.02;

export type ReferenceAnnotationTone = "accent" | "warn" | "cool" | "good" | "bad";

export type ReferenceAnnotationKind = "arrow" | "circle" | "pin-note";

export interface ReferenceNormalizedPoint {
  /** 0..1 정규화 X 좌표. */
  readonly x: number;
  /** 0..1 정규화 Y 좌표. */
  readonly y: number;
}

export interface ReferenceNormalizedCropRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ReferenceRedlineAnnotation {
  readonly id: string;
  readonly kind: ReferenceAnnotationKind;
  readonly from: ReferenceNormalizedPoint;
  readonly to?: ReferenceNormalizedPoint;
  /** 원형 강조 반경(0.01..0.5 정규화). */
  readonly radius?: number;
  readonly label?: string;
  readonly tone: ReferenceAnnotationTone;
}

export interface ReferenceProItemExtension {
  readonly itemId: string;
  readonly cropRect: ReferenceNormalizedCropRect | null;
  readonly annotations: readonly ReferenceRedlineAnnotation[];
  readonly grayscaleValueCheck: boolean;
  /** 명도 단순화(Notan) 단계: null(끄기) | 3 | 5. */
  readonly valuePosterizeLevels: null | 3 | 5;
}

export interface ClickThroughOverlayState {
  readonly enabled: boolean;
  readonly activeItemId: string | null;
  readonly opacity: number;
  readonly grayscaleValueCheck: boolean;
  readonly valuePosterizeLevels: null | 3 | 5;
  readonly hotkey: "Alt+T";
}

export interface ClickThroughCssProjection {
  readonly pointerEvents: "none" | "auto";
  readonly opacity: number;
  readonly filter: string;
}

export interface ReferenceGifStepperState {
  readonly itemId: string;
  readonly frameCount: number;
  readonly currentFrame: number;
  readonly playing: boolean;
  readonly fps: number;
  readonly loopStartFrame: number | null;
  readonly loopEndFrame: number | null;
  /** 각 프레임 지속 시간(ms). 비어 있으면 `1000 / fps` 균등 간격 사용. */
  readonly frameDurationsMs: readonly number[];
  readonly accumulatedMs: number;
}

export interface ReferenceProOverlayDocument {
  readonly version: typeof REFERENCE_PRO_SCHEMA_VERSION;
  readonly clickThrough: ClickThroughOverlayState;
  readonly extensionsByItemId: Readonly<Record<string, ReferenceProItemExtension>>;
}

export interface DocumentPipWindowLike {
  readonly document: Document;
  readonly closed?: boolean;
  close(): void;
}

export interface DocumentPipGlobalLike {
  readonly documentPictureInPicture?: {
    requestWindow(options?: {
      readonly width?: number;
      readonly height?: number;
      readonly disallowReturnToOpener?: boolean;
    }): Promise<DocumentPipWindowLike>;
  };
  readonly ImageDecoder?: unknown;
}

export interface AlwaysOnTopLaunchResult {
  readonly mode: "document-pip" | "companion-popup" | "unavailable";
  readonly pipWindow: DocumentPipWindowLike | null;
  readonly reasonKo: string;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/**
 * 기본 클릭-스루 트레이싱 오버레이 상태를 생성한다.
 */
export function createDefaultClickThroughState(
  activeItemId: string | null = null,
): ClickThroughOverlayState {
  return Object.freeze({
    enabled: false,
    activeItemId,
    opacity: 0.45,
    grayscaleValueCheck: false,
    valuePosterizeLevels: null,
    hotkey: "Alt+T",
  });
}

export function toggleClickThroughTracing(
  state: ClickThroughOverlayState,
  targetItemId?: string | null,
): ClickThroughOverlayState {
  const nextActive = targetItemId !== undefined ? targetItemId : state.activeItemId;
  return {
    ...state,
    enabled: !state.enabled,
    activeItemId: nextActive,
  };
}

export function setClickThroughOpacity(
  state: ClickThroughOverlayState,
  opacity: number,
): ClickThroughOverlayState {
  return {
    ...state,
    opacity: Math.round(clamp(opacity, CLICK_THROUGH_MIN_OPACITY, CLICK_THROUGH_MAX_OPACITY) * 100) / 100,
  };
}

export function toggleClickThroughGrayscaleCheck(
  state: ClickThroughOverlayState,
  posterizeLevels?: null | 3 | 5,
): ClickThroughOverlayState {
  const nextGray = !state.grayscaleValueCheck;
  return {
    ...state,
    grayscaleValueCheck: nextGray,
    valuePosterizeLevels:
      posterizeLevels !== undefined ? posterizeLevels : nextGray ? state.valuePosterizeLevels : null,
  };
}

/**
 * 키보드 이벤트(`Alt+T`)가 클릭-스루 토글로 해석되어야 하는지 판별한다.
 * 입력창(input/textarea/contentEditable) 포커스나 IME 조합 중에는 가로채지 않는다.
 */
export function shouldToggleClickThroughFromKeyEvent(event: {
  readonly key: string;
  readonly code?: string;
  readonly altKey: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly isComposing?: boolean;
  readonly targetTagName?: string;
  readonly isContentEditable?: boolean;
}): boolean {
  if (event.isComposing) return false;
  if (!event.altKey || event.ctrlKey || event.metaKey) return false;
  const tag = (event.targetTagName ?? "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.isContentEditable) {
    return false;
  }
  const normalizedKey = event.key.toLowerCase();
  return normalizedKey === "t" || event.code === "KeyT";
}

/**
 * 오버레이 상태와 기본 보드 항목 뷰를 결합해 실제 DOM 투영 CSS 속성을 계산한다.
 */
export function computeClickThroughCssProjection(
  state: ClickThroughOverlayState,
  baseView?: Pick<StudioReferenceBoardItemView, "opacity" | "grayscale"> | null,
): ClickThroughCssProjection {
  const effectiveOpacity = state.enabled
    ? clamp(state.opacity, CLICK_THROUGH_MIN_OPACITY, CLICK_THROUGH_MAX_OPACITY)
    : clamp(baseView?.opacity ?? 1, 0.05, 1);

  const filters: string[] = [];
  if (state.grayscaleValueCheck || baseView?.grayscale) {
    filters.push("grayscale(100%)");
  }
  if (state.valuePosterizeLevels === 3) {
    filters.push("contrast(185%)");
  } else if (state.valuePosterizeLevels === 5) {
    filters.push("contrast(140%)");
  }

  return {
    pointerEvents: state.enabled ? "none" : "auto",
    opacity: Math.round(effectiveOpacity * 100) / 100,
    filter: filters.length > 0 ? filters.join(" ") : "none",
  };
}

// ── 비파괴 크롭 & 레드라인 주석 ──────────────────────────────────────

export function normalizeCropRect(
  rect: ReferenceNormalizedCropRect,
): ReferenceNormalizedCropRect {
  const x = clamp(rect.x, 0, 1 - MIN_CROP_DIMENSION);
  const y = clamp(rect.y, 0, 1 - MIN_CROP_DIMENSION);
  const maxW = 1 - x;
  const maxH = 1 - y;
  return {
    x: Math.round(x * 10000) / 10000,
    y: Math.round(y * 10000) / 10000,
    width: Math.round(clamp(rect.width, MIN_CROP_DIMENSION, maxW) * 10000) / 10000,
    height: Math.round(clamp(rect.height, MIN_CROP_DIMENSION, maxH) * 10000) / 10000,
  };
}

export function createReferenceProOverlayDocument(): ReferenceProOverlayDocument {
  return {
    version: REFERENCE_PRO_SCHEMA_VERSION,
    clickThrough: createDefaultClickThroughState(null),
    extensionsByItemId: {},
  };
}

function getOrInitExtension(
  doc: ReferenceProOverlayDocument,
  itemId: string,
): ReferenceProItemExtension {
  return (
    doc.extensionsByItemId[itemId] ?? {
      itemId,
      cropRect: null,
      annotations: [],
      grayscaleValueCheck: false,
      valuePosterizeLevels: null,
    }
  );
}

export function setReferenceNonDestructiveCrop(
  doc: ReferenceProOverlayDocument,
  itemId: string,
  cropRect: ReferenceNormalizedCropRect | null,
): ReferenceProOverlayDocument {
  const key = itemId.trim();
  if (!key) return doc;
  const current = getOrInitExtension(doc, key);
  const nextExt: ReferenceProItemExtension = {
    ...current,
    cropRect: cropRect ? normalizeCropRect(cropRect) : null,
  };
  return {
    ...doc,
    extensionsByItemId: {
      ...doc.extensionsByItemId,
      [key]: nextExt,
    },
  };
}

export function addReferenceRedlineAnnotation(
  doc: ReferenceProOverlayDocument,
  itemId: string,
  annotation: ReferenceRedlineAnnotation,
): ReferenceProOverlayDocument {
  const key = itemId.trim();
  if (!key || !annotation.id.trim()) return doc;
  const current = getOrInitExtension(doc, key);
  const sanitized: ReferenceRedlineAnnotation = {
    id: annotation.id.trim(),
    kind: annotation.kind,
    from: { x: clamp01(annotation.from.x), y: clamp01(annotation.from.y) },
    ...(annotation.to
      ? { to: { x: clamp01(annotation.to.x), y: clamp01(annotation.to.y) } }
      : {}),
    ...(annotation.radius !== undefined
      ? { radius: clamp(annotation.radius, 0.01, 0.5) }
      : {}),
    ...(annotation.label ? { label: annotation.label.trim().slice(0, 120) } : {}),
    tone: annotation.tone,
  };

  const filtered = current.annotations.filter((a) => a.id !== sanitized.id);
  const nextExt: ReferenceProItemExtension = {
    ...current,
    annotations: Object.freeze([...filtered, sanitized]),
  };
  return {
    ...doc,
    extensionsByItemId: {
      ...doc.extensionsByItemId,
      [key]: nextExt,
    },
  };
}

export function removeReferenceRedlineAnnotation(
  doc: ReferenceProOverlayDocument,
  itemId: string,
  annotationId: string,
): ReferenceProOverlayDocument {
  const current = doc.extensionsByItemId[itemId];
  if (!current) return doc;
  const nextList = current.annotations.filter((a) => a.id !== annotationId);
  if (nextList.length === current.annotations.length) return doc;
  return {
    ...doc,
    extensionsByItemId: {
      ...doc.extensionsByItemId,
      [itemId]: { ...current, annotations: Object.freeze(nextList) },
    },
  };
}

export function serializeReferenceProOverlayDocument(
  doc: ReferenceProOverlayDocument,
): string {
  return JSON.stringify(doc);
}

export function deserializeReferenceProOverlayDocument(
  rawJson: string,
): ReferenceProOverlayDocument {
  try {
    const parsed = JSON.parse(rawJson) as Partial<ReferenceProOverlayDocument>;
    if (!parsed || parsed.version !== REFERENCE_PRO_SCHEMA_VERSION) {
      return createReferenceProOverlayDocument();
    }
    const ct = parsed.clickThrough;
    const clickThrough: ClickThroughOverlayState = {
      enabled: ct?.enabled === true,
      activeItemId: typeof ct?.activeItemId === "string" ? ct.activeItemId : null,
      opacity: clamp(ct?.opacity ?? 0.45, CLICK_THROUGH_MIN_OPACITY, CLICK_THROUGH_MAX_OPACITY),
      grayscaleValueCheck: ct?.grayscaleValueCheck === true,
      valuePosterizeLevels:
        ct?.valuePosterizeLevels === 3 || ct?.valuePosterizeLevels === 5
          ? ct.valuePosterizeLevels
          : null,
      hotkey: "Alt+T",
    };

    const extensionsByItemId: Record<string, ReferenceProItemExtension> = {};
    if (parsed.extensionsByItemId && typeof parsed.extensionsByItemId === "object") {
      for (const [id, ext] of Object.entries(parsed.extensionsByItemId)) {
        if (!ext || typeof ext !== "object") continue;
        extensionsByItemId[id] = {
          itemId: id,
          cropRect: ext.cropRect ? normalizeCropRect(ext.cropRect) : null,
          annotations: Array.isArray(ext.annotations) ? Object.freeze([...ext.annotations]) : [],
          grayscaleValueCheck: ext.grayscaleValueCheck === true,
          valuePosterizeLevels:
            ext.valuePosterizeLevels === 3 || ext.valuePosterizeLevels === 5
              ? ext.valuePosterizeLevels
              : null,
        };
      }
    }

    return {
      version: REFERENCE_PRO_SCHEMA_VERSION,
      clickThrough,
      extensionsByItemId,
    };
  } catch {
    return createReferenceProOverlayDocument();
  }
}

// ── GIF / Animated WebP 프레임 스텝 & A-B 루프 스크러버 ──────────────

export function createReferenceGifStepper(options: {
  readonly itemId: string;
  readonly frameCount: number;
  readonly fps?: number;
  readonly frameDurationsMs?: readonly number[];
}): ReferenceGifStepperState {
  const safeCount = Math.max(1, Math.floor(options.frameCount));
  const fps = clamp(options.fps ?? 12, 1, 60);
  return {
    itemId: options.itemId,
    frameCount: safeCount,
    currentFrame: 0,
    playing: false,
    fps,
    loopStartFrame: null,
    loopEndFrame: null,
    frameDurationsMs: options.frameDurationsMs ? Object.freeze([...options.frameDurationsMs]) : [],
    accumulatedMs: 0,
  };
}

function activeLoopBounds(state: ReferenceGifStepperState): readonly [number, number] {
  const maxFrame = Math.max(0, state.frameCount - 1);
  if (state.loopStartFrame !== null && state.loopEndFrame !== null) {
    const start = Math.round(clamp(Math.min(state.loopStartFrame, state.loopEndFrame), 0, maxFrame));
    const end = Math.round(clamp(Math.max(state.loopStartFrame, state.loopEndFrame), 0, maxFrame));
    return [start, end];
  }
  return [0, maxFrame];
}

export function stepGifFrame(
  state: ReferenceGifStepperState,
  delta: number,
): ReferenceGifStepperState {
  const [minF, maxF] = activeLoopBounds(state);
  const span = Math.max(1, maxF - minF + 1);
  const offset = (((state.currentFrame - minF + Math.trunc(delta)) % span) + span) % span;
  return {
    ...state,
    playing: false,
    currentFrame: minF + offset,
    accumulatedMs: 0,
  };
}

export function setGifLoopRange(
  state: ReferenceGifStepperState,
  startFrame: number,
  endFrame: number,
): ReferenceGifStepperState {
  const maxFrame = Math.max(0, state.frameCount - 1);
  const a = Math.round(clamp(Math.min(startFrame, endFrame), 0, maxFrame));
  const b = Math.round(clamp(Math.max(startFrame, endFrame), 0, maxFrame));
  const currentFrame = Math.round(clamp(state.currentFrame, a, b));
  return {
    ...state,
    loopStartFrame: a,
    loopEndFrame: b,
    currentFrame,
  };
}

export function clearGifLoopRange(state: ReferenceGifStepperState): ReferenceGifStepperState {
  return {
    ...state,
    loopStartFrame: null,
    loopEndFrame: null,
  };
}

export function advanceGifPlaybackByMs(
  state: ReferenceGifStepperState,
  elapsedMs: number,
): ReferenceGifStepperState {
  if (!state.playing || !Number.isFinite(elapsedMs) || elapsedMs <= 0 || state.frameCount <= 1) {
    return state;
  }
  const [minF, maxF] = activeLoopBounds(state);
  const span = Math.max(1, maxF - minF + 1);
  let frame = Math.round(clamp(state.currentFrame, minF, maxF));
  let budget = state.accumulatedMs + elapsedMs;
  const fallbackDuration = 1000 / Math.max(1, state.fps);

  let guard = 0;
  while (guard < 256) {
    const frameDur = Math.max(10, state.frameDurationsMs[frame] ?? fallbackDuration);
    if (budget < frameDur) break;
    budget -= frameDur;
    frame = minF + ((frame - minF + 1) % span);
    guard += 1;
  }

  return {
    ...state,
    currentFrame: frame,
    accumulatedMs: Math.round(budget * 100) / 100,
  };
}

export function detectReferenceImageDecoderSupport(
  globalObj: DocumentPipGlobalLike = globalThis as unknown as DocumentPipGlobalLike,
): boolean {
  return typeof globalObj.ImageDecoder === "function";
}

// ── Document Picture-in-Picture 항상 위 보드 런처 ────────────────────

export async function openReferenceAlwaysOnTopBoard(options: {
  readonly width?: number;
  readonly height?: number;
  readonly globalObj?: DocumentPipGlobalLike;
  readonly openCompanionPopupFallback?: () => boolean;
}): Promise<AlwaysOnTopLaunchResult> {
  const g = options.globalObj ?? (globalThis as unknown as DocumentPipGlobalLike);
  const width = Math.round(clamp(options.width ?? 420, 240, 1280));
  const height = Math.round(clamp(options.height ?? 520, 240, 1280));

  if (g.documentPictureInPicture && typeof g.documentPictureInPicture.requestWindow === "function") {
    try {
      const pipWindow = await g.documentPictureInPicture.requestWindow({
        width,
        height,
        disallowReturnToOpener: false,
      });
      return {
        mode: "document-pip",
        pipWindow,
        reasonKo: "항상 위(Document PiP) 무테 레퍼런스 창을 열었습니다.",
      };
    } catch {
      // 사용자 거부 또는 팝업 차단 시 보조 창 폴백으로 이행한다.
    }
  }

  if (options.openCompanionPopupFallback && options.openCompanionPopupFallback()) {
    return {
      mode: "companion-popup",
      pipWindow: null,
      reasonKo: "Document PiP 미지원 환경이므로 보조 창 레퍼런스 보드로 전환했습니다.",
    };
  }

  return {
    mode: "unavailable",
    pipWindow: null,
    reasonKo: "현재 브라우저에서 항상 위 보드를 열 수 없습니다. 인라인 레퍼런스 패널을 사용해 주세요.",
  };
}
