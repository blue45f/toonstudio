/**
 * Feature-gated Konva Phase 1-2 ↔ Vello 통합 런타임 브리지 + 확장 WASM 핫패스 어댑터.
 *
 * - Phase 1(가이드·격자·스냅·투시 자·마키·8-핸들 변형 상자·눈금자)과
 *   Phase 2(한국어 가로쓰기 HTB / 전통 세로쓰기 TTB 말풍선·꼬리·금칙·종중횡조)를
 *   단일 런타임 토글(`studioVelloPhase12Enabled`, 안전 기본값 `false`) 뒤에 통합한다.
 * - Vello 렌더러 초기화/제출 실패 또는 WebGPU 디바이스 유실 시 예외를 삼키고 즉시 Konva로
 *   자동 폴백해 캔버스 빈 화면·작업 중단·크래시를 원천 차단한다.
 * - `Wasm64AdaptiveLoadBalancer`와 직결해 프레임 예산(60Hz/120Hz)·열/메모리 압박·확장 WASM
 *   핫패스(`studio-wasm64-extended-suite.wasm` 지연 로드)를 통합 제어한다.
 * - `StudioCanvasViewportToolLayers` / `BubbleEl` 계약은 `import type`으로만 참조하고,
 *   `/studio` 초기 진입 그래프에서 정적 import하지 않으므로 eager 번들 증가량 0바이트를 유지한다.
 */

import { solidPaint, type ColorIR, type PathVerbIR, type SceneIR, type SceneNodeIR } from "@toonstudio/studio-project-model";

import {
  buildVelloPhase2BalloonScene,
  renderPhase2BalloonToCanvas2D,
  type StudioVelloBalloonShape,
  type StudioVelloBalloonSpec,
  type StudioVelloBalloonTail,
  type StudioVelloPhase2BalloonOutput,
  type StudioVelloTextShaperBridge,
} from "../lettering/studio-vello-phase2-balloon-text-adapter";
import {
  FRAME_BUDGET_60HZ_MS,
  Wasm64AdaptiveLoadBalancer,
  createWasm64AdaptiveLoadBalancer,
  type AdaptiveLoadBalancerConfig,
  type AdaptiveLoadBalancerTelemetry,
  type AdaptiveRouteDecision,
  type AdaptiveRouteOptions,
  type AdaptiveTaskKind,
  type SystemPressureUpdate,
} from "../wasm64-runtime-bridge/wasm64-adaptive-load-balancer";

import {
  buildVelloPhase1OverlayScene,
  hairlineStrokeWidthPx,
  hitTestTransformBox,
  renderPhase1OverlayToCanvas2D,
  type StudioTransformHandleGeometry,
  type StudioTransformHitResult,
  type StudioVelloGuideLine,
  type StudioVelloMarqueeRect,
  type StudioVelloOverlayViewport,
  type StudioVelloPhase1OverlayOutput,
  type StudioVelloPhase1OverlayState,
  type StudioVelloRulerOverlayConfig,
  type StudioVelloSnapLine,
  type StudioVelloTransformBox,
} from "./studio-vello-phase1-overlay-adapter";

import type { BubbleTextMeasurer } from "../lettering/studio-bubble-text-fit";
import type { BubbleVariant } from "../studio-assets";
import type { BubbleEl } from "../studio-element-model";
import type { VanishingPoint } from "../studio-perspective-guide";
import type { SmartGuideOverlay } from "../studio-smart-guides";
import type {
  StudioWasm64ExtendedSuiteRuntime,
  WasmMarchingAntsResult,
} from "../wasm64-runtime-bridge/wasm64-extended-suite-types";
import type { StudioPoint2D } from "./studio-stage-handle-types";

export const STUDIO_VELLO_PHASE12_FLAG_DEFAULT = false as const;
export const STUDIO_VELLO_PHASE12_QUERY_PARAM = "studioVelloPhase12";
export const STUDIO_VELLO_PHASE12_STORAGE_KEY = "toonstudio:vello-phase12-enabled";

export type StudioVelloPhase12FlagSource =
  | "emergency-disabled" | "explicit" | "global-flag" | "query-param" | "storage" | "safe-default";

export interface StudioVelloPhase12FlagResolution {
  readonly enabled: boolean;
  readonly source: StudioVelloPhase12FlagSource;
}

export interface StudioVelloPhase12GlobalFlags {
  readonly __TOONSTUDIO_VELLO_PHASE12_ENABLED__?: boolean;
  readonly __TOONSTUDIO_VELLO_PHASE12_DISABLED__?: boolean;
}

export type StudioVelloActiveBackend = "vello" | "vello-canvas2d-fallback" | "konva";
export type StudioVelloFallbackReason =
  | "none"
  | "feature-flag-disabled"
  | "emergency-disabled"
  | "renderer-init-error"
  | "renderer-submit-error"
  | "gpu-device-lost"
  | "load-balancer-pressure";

export interface StudioVelloLayerOwnership {
  readonly phase1OverlayOwner: "vello" | "konva";
  readonly phase2BalloonOwner: "vello" | "konva";
  readonly konvaShouldRenderOverlays: boolean;
  readonly konvaShouldRenderBalloons: boolean;
}

export interface StudioVelloBridgeRendererHandle {
  readonly backendLabel?: string;
  submitScene(scene: SceneIR): void;
  dispose?(): void;
}

/** `StudioCanvasViewportToolLayersProps`와 100% 구조 호환되는 Phase 1 오버레이 최소 계약 슬라이스. */
export interface StudioViewportToolLayersPhase1Slice {
  readonly isExporting: boolean;
  readonly canvasH: number;
  readonly effScale: number;
  readonly guides: { readonly x: readonly number[]; readonly y: readonly number[] };
  readonly smartGuides: SmartGuideOverlay;
  readonly userGuides: readonly { readonly id: string; readonly type: "v" | "h"; readonly pos: number }[];
  readonly perspectiveRulerActive: boolean;
  readonly vanishingPoints: readonly VanishingPoint[];
  readonly perspectiveEyeLevelY: number | null;
  readonly canvasWidth?: number;
  readonly showGrid?: boolean;
  readonly gridSize?: number;
  readonly marqueeRect?: StudioVelloMarqueeRect | null;
  readonly rulers?: StudioVelloRulerOverlayConfig | null;
  readonly transformBox?: StudioVelloTransformBox | null;
}

export interface StudioVelloViewportFrameInput {
  readonly viewport: StudioVelloOverlayViewport;
  readonly toolLayers?: StudioViewportToolLayersPhase1Slice | null;
  readonly phase1State?: StudioVelloPhase1OverlayState | null;
  readonly bubbleElements?: readonly BubbleEl[];
  readonly balloons?: readonly StudioVelloBalloonSpec[];
  readonly marchingAnts?: WasmMarchingAntsResult | null;
  readonly background?: ColorIR;
}

export interface StudioVelloViewportFrameResult {
  readonly activeBackend: StudioVelloActiveBackend;
  readonly fallbackReason: StudioVelloFallbackReason;
  readonly ownership: StudioVelloLayerOwnership;
  readonly unifiedScene: SceneIR | null;
  readonly phase1Output: StudioVelloPhase1OverlayOutput | null;
  readonly phase2Output: StudioVelloPhase2BalloonOutput | null;
  readonly transformHandles: readonly StudioTransformHandleGeometry[];
  readonly routeDecision: AdaptiveRouteDecision | null;
  readonly frameMs: number;
  readonly errorMessage?: string;
}

export interface StudioExtendedWasmDispatchResult<T> {
  readonly ok: boolean;
  readonly executor: "wasm64-extended-suite" | "js-fallback";
  readonly routeDecision: AdaptiveRouteDecision;
  readonly value: T;
  readonly elapsedMs: number;
  readonly fallbackError?: string;
}

export interface StudioVelloViewportRuntimeBridgeTelemetry {
  readonly studioVelloPhase12Enabled: boolean;
  readonly flagSource: StudioVelloPhase12FlagSource;
  readonly activeBackend: StudioVelloActiveBackend;
  readonly fallbackReason: StudioVelloFallbackReason;
  readonly ownership: StudioVelloLayerOwnership;
  readonly rendererInitialized: boolean;
  readonly framesRenderedVello: number;
  readonly framesRenderedCanvas2d: number;
  readonly framesRenderedKonva: number;
  readonly rendererInitFailures: number;
  readonly rendererSubmitFailures: number;
  readonly extendedWasmDispatches: number;
  readonly extendedWasmFallbacks: number;
  readonly lastErrorMessage: string | null;
  readonly lastRouteDecision: AdaptiveRouteDecision | null;
  readonly loadBalancer: AdaptiveLoadBalancerTelemetry;
}

export interface StudioVelloViewportRuntimeBridgeOptions {
  /** 명시적 Phase 1-2 통합 Vello 활성화 토글(미지정 시 안전 기본값 `false`). */
  readonly studioVelloPhase12Enabled?: boolean;
  readonly globalFlags?: StudioVelloPhase12GlobalFlags;
  readonly urlSearch?: string;
  readonly storageGet?: (key: string) => string | null;
  readonly loadBalancer?: Wasm64AdaptiveLoadBalancer;
  readonly loadBalancerConfig?: AdaptiveLoadBalancerConfig;
  readonly initVelloRenderer?: () => Promise<StudioVelloBridgeRendererHandle> | StudioVelloBridgeRendererHandle;
  readonly loadExtendedWasmSuite?: () => Promise<StudioWasm64ExtendedSuiteRuntime>;
  readonly overlayCanvas2d?: CanvasRenderingContext2D | null;
  readonly balloonCanvas2d?: CanvasRenderingContext2D | null;
  readonly allowCanvas2dFallbackOnGpuLoss?: boolean;
  readonly shaper?: StudioVelloTextShaperBridge;
  readonly measurer?: BubbleTextMeasurer;
  readonly now?: () => number;
}

const WHITE: ColorIR = { r: 1, g: 1, b: 1, a: 1 };
const INK: ColorIR = { r: 0.08, g: 0.09, b: 0.1, a: 1 };
const GRID_MINOR_COLOR: ColorIR = { r: 124 / 255, g: 92 / 255, b: 252 / 255, a: 0.24 };
const GRID_MAJOR_COLOR: ColorIR = { r: 124 / 255, g: 92 / 255, b: 252 / 255, a: 0.46 };
const MARCHING_ANTS_COLOR: ColorIR = { r: 0.12, g: 0.27, b: 0.21, a: 0.92 };
const MAX_GRID_LINES_PER_AXIS = 200;

const KONVA_OWNERSHIP: StudioVelloLayerOwnership = Object.freeze({
  phase1OverlayOwner: "konva", phase2BalloonOwner: "konva",
  konvaShouldRenderOverlays: true, konvaShouldRenderBalloons: true,
});
const VELLO_OWNERSHIP: StudioVelloLayerOwnership = Object.freeze({
  phase1OverlayOwner: "vello", phase2BalloonOwner: "vello",
  konvaShouldRenderOverlays: false, konvaShouldRenderBalloons: false,
});

function parseBoolToken(raw: string | null | undefined): boolean | null {
  const norm = raw?.trim().toLowerCase();
  if (norm === "1" || norm === "true" || norm === "on") return true;
  if (norm === "0" || norm === "false" || norm === "off") return false;
  return null;
}

/** `studioVelloPhase12Enabled` 피처 플래그를 안전 기본값(`false`) 우선 순위로 해석한다. */
export function resolveStudioVelloPhase12Flag(options?: {
  readonly studioVelloPhase12Enabled?: boolean;
  readonly globalFlags?: StudioVelloPhase12GlobalFlags;
  readonly urlSearch?: string;
  readonly storageGet?: (key: string) => string | null;
}): StudioVelloPhase12FlagResolution {
  const globals = options?.globalFlags ?? (globalThis as unknown as StudioVelloPhase12GlobalFlags);
  if (globals.__TOONSTUDIO_VELLO_PHASE12_DISABLED__ === true) {
    return { enabled: false, source: "emergency-disabled" };
  }
  if (typeof options?.studioVelloPhase12Enabled === "boolean") {
    return { enabled: options.studioVelloPhase12Enabled, source: "explicit" };
  }
  if (typeof globals.__TOONSTUDIO_VELLO_PHASE12_ENABLED__ === "boolean") {
    return { enabled: globals.__TOONSTUDIO_VELLO_PHASE12_ENABLED__, source: "global-flag" };
  }
  const rawSearch = options?.urlSearch ?? (globalThis.location as { search?: string } | undefined)?.search ?? "";
  if (rawSearch) {
    const query = rawSearch.includes("?") ? rawSearch.slice(rawSearch.indexOf("?")) : rawSearch;
    const parsed = parseBoolToken(new URLSearchParams(query).get(STUDIO_VELLO_PHASE12_QUERY_PARAM));
    if (parsed !== null) return { enabled: parsed, source: "query-param" };
  }
  const stored = parseBoolToken(options?.storageGet?.(STUDIO_VELLO_PHASE12_STORAGE_KEY));
  if (stored !== null) return { enabled: stored, source: "storage" };
  return { enabled: STUDIO_VELLO_PHASE12_FLAG_DEFAULT, source: "safe-default" };
}

/** CSS hex / rgb / rgba 색상 문자열을 Vello `ColorIR`(0..1)로 안전하게 변환한다. */
export function parseCssColorToIR(raw: string | undefined, fallback: ColorIR): ColorIR {
  const text = raw?.trim();
  if (!text) return fallback;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu.exec(text);
  if (hex) {
    const d = hex[1]!;
    if (d.length === 3 || d.length === 4) {
      return {
        r: parseInt(d[0]! + d[0]!, 16) / 255, g: parseInt(d[1]! + d[1]!, 16) / 255,
        b: parseInt(d[2]! + d[2]!, 16) / 255, a: d.length === 4 ? parseInt(d[3]! + d[3]!, 16) / 255 : 1,
      };
    }
    return {
      r: parseInt(d.slice(0, 2), 16) / 255, g: parseInt(d.slice(2, 4), 16) / 255,
      b: parseInt(d.slice(4, 6), 16) / 255, a: d.length === 8 ? parseInt(d.slice(6, 8), 16) / 255 : 1,
    };
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/iu.exec(text);
  if (rgb) {
    const clamp01 = (n: number): number => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
    return {
      r: clamp01(Number(rgb[1]) / 255), g: clamp01(Number(rgb[2]) / 255),
      b: clamp01(Number(rgb[3]) / 255), a: rgb[4] !== undefined ? clamp01(Number(rgb[4])) : 1,
    };
  }
  return fallback;
}

/** 16종 `BubbleVariant`를 Vello Phase 2 말풍선 기하 형태(4종)로 매핑한다. */
export function mapBubbleVariantToVelloShape(variant: BubbleVariant): StudioVelloBalloonShape {
  if (variant === "thought" || variant === "cloud-soft" || variant === "whisper") return "cloud";
  if (variant === "shout" || variant === "angry" || variant === "explosive" || variant === "scared") return "burst";
  if (variant === "box" || variant === "system" || variant === "phone" || variant === "digital-code" || variant === "comic-narrative") return "box";
  return "oval";
}

/** Konva 문서 모델 `BubbleEl`을 Vello Phase 2 말풍선 사양(`StudioVelloBalloonSpec`)으로 변환한다. */
export function adaptBubbleElToVelloSpec(el: BubbleEl): StudioVelloBalloonSpec {
  const shape = mapBubbleVariantToVelloShape(el.variant);
  const omitDefaultTail = el.tail === "none" || (shape === "box" && el.tail === undefined && el.tailDirection === undefined);
  const tail: StudioVelloBalloonTail | null = omitDefaultTail ? null : {
    anchor: el.tailDirection ?? "bottom",
    ratio: el.tailXRatio ?? (el.tail === "right" ? 0.72 : 0.32),
    length: Math.max(8, el.tailHeight ?? 28),
    baseWidth: Math.max(10, el.tailBase ?? Math.min(28, el.width * 0.14)),
    tipOffset: el.tail === "left" ? -10 : el.tail === "right" ? 10 : 0,
    bend: el.tailBend ?? 0,
    kind: el.variant === "thought" || el.variant === "cloud-soft" ? "thought-dots" : "pointed",
  };
  return {
    id: el.id, shape, x: el.x, y: el.y, width: el.width, height: el.height, text: el.text,
    writingMode: el.vertical ? "ttb" : "htb", align: el.align ?? "center",
    fontSize: el.fontSize, lineHeight: el.lineHeight, fontFamily: el.font, fontStyle: el.fontStyle,
    fillColor: parseCssColorToIR(el.fill, WHITE),
    strokeColor: parseCssColorToIR(el.stroke, INK),
    strokeWidth: el.strokeWidth ?? 2,
    textColor: parseCssColorToIR(el.textFill, INK),
    tail,
  };
}

function projectBalloonSpecToViewport(spec: StudioVelloBalloonSpec, vp: StudioVelloOverlayViewport): StudioVelloBalloonSpec {
  const s = Number.isFinite(vp.scale) && vp.scale > 0 ? vp.scale : 1;
  if (s === 1 && vp.offsetX === 0 && vp.offsetY === 0) return spec;
  return {
    ...spec,
    x: spec.x * s - vp.offsetX, y: spec.y * s - vp.offsetY,
    width: spec.width * s, height: spec.height * s,
    fontSize: spec.fontSize !== undefined ? spec.fontSize * s : undefined,
    letterSpacing: spec.letterSpacing !== undefined ? spec.letterSpacing * s : undefined,
    cornerRadius: spec.cornerRadius !== undefined ? spec.cornerRadius * s : undefined,
    strokeWidth: spec.strokeWidth !== undefined ? spec.strokeWidth * s : undefined,
    tail: spec.tail ? { ...spec.tail, length: spec.tail.length * s, baseWidth: spec.tail.baseWidth * s, tipOffset: (spec.tail.tipOffset ?? 0) * s } : spec.tail,
  };
}

/** `StudioCanvasViewportToolLayersProps` 슬라이스를 Vello Phase 1 오버레이 상태로 변환한다. */
export function adaptViewportToolLayersToPhase1State(
  slice: StudioViewportToolLayersPhase1Slice,
): StudioVelloPhase1OverlayState {
  if (slice.isExporting) return {};
  const guides: StudioVelloGuideLine[] = [];
  if (slice.showGrid && typeof slice.gridSize === "number" && Number.isFinite(slice.gridSize) && slice.gridSize >= 4) {
    const step = slice.gridSize;
    const cols = Math.min(MAX_GRID_LINES_PER_AXIS, Math.ceil((slice.canvasWidth ?? 800) / step));
    const rows = Math.min(MAX_GRID_LINES_PER_AXIS, Math.ceil(slice.canvasH / step));
    for (let i = 1; i <= cols; i += 1) {
      guides.push({ id: `grid-v-${i}`, axis: "x", position: i * step, kind: "gutter", color: i % 5 === 0 ? GRID_MAJOR_COLOR : GRID_MINOR_COLOR });
    }
    for (let i = 1; i <= rows; i += 1) {
      guides.push({ id: `grid-h-${i}`, axis: "y", position: i * step, kind: "gutter", color: i % 5 === 0 ? GRID_MAJOR_COLOR : GRID_MINOR_COLOR });
    }
  }
  for (const [idx, x] of slice.guides.x.entries()) guides.push({ id: `guide-x-${idx}`, axis: "x", position: x, kind: "margin" });
  for (const [idx, y] of slice.guides.y.entries()) guides.push({ id: `guide-y-${idx}`, axis: "y", position: y, kind: "margin" });
  for (const ug of slice.userGuides) {
    guides.push({ id: `user-guide-${ug.id}`, axis: ug.type === "v" ? "x" : "y", position: ug.pos, kind: "user" });
  }
  const snapLines: StudioVelloSnapLine[] = slice.smartGuides.segments.map((seg, idx) => ({
    id: `smart-guide-${idx}`, axis: seg.axis === "v" ? "x" : "y", position: seg.pos, start: seg.from, end: seg.to,
  }));
  const perspectiveGrid = slice.perspectiveRulerActive && slice.vanishingPoints.length > 0
    ? { active: true, vanishingPoints: slice.vanishingPoints.map((vp) => ({ x: vp.x, y: vp.y })), horizonY: slice.perspectiveEyeLevelY ?? null }
    : null;
  return {
    guides, snapLines, perspectiveGrid,
    marqueeRect: slice.marqueeRect ?? null,
    rulers: slice.rulers ?? null,
    transformBox: slice.transformBox ?? null,
  };
}

/** 확장 WASM 마칭 앤츠 세그먼트(`[x0, y0, x1, y1]`)를 Vello Phase 1 헤어라인 경로 노드로 변환한다. */
export function buildMarchingAntsSceneNode(
  ants: WasmMarchingAntsResult,
  vp: StudioVelloOverlayViewport,
  color: ColorIR = MARCHING_ANTS_COLOR,
): SceneNodeIR | null {
  if (ants.segmentCount <= 0 || ants.segments.length < 4) return null;
  const s = Number.isFinite(vp.scale) && vp.scale > 0 ? vp.scale : 1;
  const verbs: PathVerbIR[] = [];
  const limit = Math.min(ants.segmentCount, Math.floor(ants.segments.length / 4));
  for (let i = 0; i < limit; i += 1) {
    const o = i * 4;
    verbs.push(
      { v: "M", x: (ants.segments[o] ?? 0) * s - vp.offsetX, y: (ants.segments[o + 1] ?? 0) * s - vp.offsetY },
      { v: "L", x: (ants.segments[o + 2] ?? 0) * s - vp.offsetX, y: (ants.segments[o + 3] ?? 0) * s - vp.offsetY },
    );
  }
  return {
    id: "overlay-wasm-marching-ants", kind: "stroke-path", opacity: 1, blend: "src-over",
    path: { verbs }, paint: solidPaint(color.r, color.g, color.b, color.a),
    strokeWidth: hairlineStrokeWidthPx(vp.dpr, 1), cap: "butt", join: "miter", miterLimit: 4,
  };
}

export class StudioVelloViewportRuntimeBridge {
  readonly loadBalancer: Wasm64AdaptiveLoadBalancer;
  private enabled: boolean;
  private flagSource: StudioVelloPhase12FlagSource;
  private readonly emergencyDisabled: boolean;
  private readonly initVelloRenderer?: StudioVelloViewportRuntimeBridgeOptions["initVelloRenderer"];
  private readonly loadExtendedWasmSuite?: StudioVelloViewportRuntimeBridgeOptions["loadExtendedWasmSuite"];
  private readonly overlayCanvas2d: CanvasRenderingContext2D | null;
  private readonly balloonCanvas2d: CanvasRenderingContext2D | null;
  private readonly allowCanvas2dFallbackOnGpuLoss: boolean;
  private readonly shaper?: StudioVelloTextShaperBridge;
  private readonly measurer?: BubbleTextMeasurer;
  private readonly now: () => number;

  private rendererHandle: StudioVelloBridgeRendererHandle | null = null;
  private initAttempted = false;
  private extendedWasmRuntime: StudioWasm64ExtendedSuiteRuntime | null = null;
  private activeBackend: StudioVelloActiveBackend = "konva";
  private fallbackReason: StudioVelloFallbackReason;
  private lastErrorMessage: string | null = null;
  private lastRouteDecision: AdaptiveRouteDecision | null = null;
  private lastTransformBox: StudioVelloTransformBox | null = null;
  private lastViewport: StudioVelloOverlayViewport | null = null;
  private readonly counters = {
    framesVello: 0, framesCanvas2d: 0, framesKonva: 0,
    initFailures: 0, submitFailures: 0, wasmDispatches: 0, wasmFallbacks: 0,
  };

  constructor(options: StudioVelloViewportRuntimeBridgeOptions = {}) {
    const resolved = resolveStudioVelloPhase12Flag(options);
    this.enabled = resolved.enabled;
    this.flagSource = resolved.source;
    this.emergencyDisabled = resolved.source === "emergency-disabled";
    this.fallbackReason = this.emergencyDisabled ? "emergency-disabled" : this.enabled ? "none" : "feature-flag-disabled";
    this.loadBalancer = options.loadBalancer ?? createWasm64AdaptiveLoadBalancer({
      budgetMs: FRAME_BUDGET_60HZ_MS,
      capabilities: { webgpuCompute: true, wasmRelaxedSimd: true, wasmSimd128: true },
      ...options.loadBalancerConfig,
    });
    this.initVelloRenderer = options.initVelloRenderer;
    this.loadExtendedWasmSuite = options.loadExtendedWasmSuite;
    this.overlayCanvas2d = options.overlayCanvas2d ?? null;
    this.balloonCanvas2d = options.balloonCanvas2d ?? null;
    this.allowCanvas2dFallbackOnGpuLoss = options.allowCanvas2dFallbackOnGpuLoss ?? false;
    this.shaper = options.shaper;
    this.measurer = options.measurer;
    this.now = options.now ?? (() => performance.now());
  }

  isEnabled(): boolean { return this.enabled && !this.emergencyDisabled; }

  getLayerOwnership(): StudioVelloLayerOwnership {
    return this.activeBackend === "konva" ? KONVA_OWNERSHIP : VELLO_OWNERSHIP;
  }

  /** 런타임 중 Phase 1-2 Vello 토글을 전환한다(비상 비활성화 상태에서는 항상 Konva 유지). */
  setStudioVelloPhase12Enabled(nextEnabled: boolean): void {
    if (this.emergencyDisabled) {
      this.enabled = false; this.activeBackend = "konva"; this.fallbackReason = "emergency-disabled";
      return;
    }
    this.enabled = nextEnabled;
    this.flagSource = "explicit";
    if (!nextEnabled) {
      this.disposeRendererHandle();
      this.activeBackend = "konva";
      this.fallbackReason = "feature-flag-disabled";
      return;
    }
    this.initAttempted = false;
    this.lastErrorMessage = null;
    this.fallbackReason = "none";
  }

  /** GPU 디바이스 유실 또는 열·메모리 압박 이벤트를 로드 밸런서와 브리지 상태에 즉시 반영한다. */
  notifySystemPressure(update: SystemPressureUpdate): void {
    this.loadBalancer.updatePressure(update);
    if (update.gpuDeviceLost) {
      this.disposeRendererHandle();
      this.fallbackReason = "gpu-device-lost";
      if (!this.allowCanvas2dFallbackOnGpuLoss || (!this.overlayCanvas2d && !this.balloonCanvas2d)) {
        this.activeBackend = "konva";
      }
    }
  }

  /** Vello 렌더러를 지연 초기화한다. 실패 시 예외를 던지지 않고 Konva 자동 폴백으로 전환한다. */
  async initializeRenderer(): Promise<boolean> {
    if (!this.isEnabled()) {
      this.activeBackend = "konva";
      this.fallbackReason = this.emergencyDisabled ? "emergency-disabled" : "feature-flag-disabled";
      return false;
    }
    if (this.rendererHandle) return true;
    if (this.initAttempted && this.fallbackReason === "renderer-init-error") return false;
    this.initAttempted = true;
    if (!this.initVelloRenderer) return false;
    try {
      this.rendererHandle = await this.initVelloRenderer();
      this.fallbackReason = "none";
      this.lastErrorMessage = null;
      return true;
    } catch (error) {
      this.counters.initFailures += 1;
      this.rendererHandle = null;
      this.activeBackend = "konva";
      this.fallbackReason = "renderer-init-error";
      this.lastErrorMessage = error instanceof Error ? error.message : String(error);
      if (/webgpu|gpu|device|adapter/iu.test(this.lastErrorMessage)) {
        this.loadBalancer.updatePressure({ gpuDeviceLost: true });
      }
      return false;
    }
  }

  /**
   * Phase 1 오버레이 + Phase 2 한국어 말풍선을 통합 프레임으로 렌더한다.
   * 토글 꺼짐·초기화 실패·GPU 유실·제출 오류 시 즉시 Konva 소유권을 반환해 회귀 0건을 보장한다.
   */
  async renderFrame(input: StudioVelloViewportFrameInput): Promise<StudioVelloViewportFrameResult> {
    const startedAt = this.now();
    if (!this.isEnabled()) {
      return this.konvaFrame(this.emergencyDisabled ? "emergency-disabled" : "feature-flag-disabled", startedAt, null);
    }

    const lbTelemetry = this.loadBalancer.getTelemetry();
    const routeDecision = this.loadBalancer.route("3d-lt-contour");
    this.lastRouteDecision = routeDecision;

    if (lbTelemetry.gpuDeviceLost || routeDecision.reason === "gpu-device-lost") {
      if (!this.allowCanvas2dFallbackOnGpuLoss || (!this.overlayCanvas2d && !this.balloonCanvas2d)) {
        return this.konvaFrame("gpu-device-lost", startedAt, routeDecision);
      }
    }

    if (this.initVelloRenderer && !this.rendererHandle && !lbTelemetry.gpuDeviceLost) {
      const ok = await this.initializeRenderer();
      if (!ok) return this.konvaFrame("renderer-init-error", startedAt, routeDecision, this.lastErrorMessage ?? undefined);
    }

    if (this.fallbackReason === "renderer-init-error" || this.fallbackReason === "renderer-submit-error") {
      return this.konvaFrame(this.fallbackReason, startedAt, routeDecision, this.lastErrorMessage ?? undefined);
    }

    const phase1State = input.phase1State ?? (input.toolLayers ? adaptViewportToolLayersToPhase1State(input.toolLayers) : {});
    this.lastTransformBox = phase1State.transformBox ?? null;
    this.lastViewport = input.viewport;

    const rawBalloons: readonly StudioVelloBalloonSpec[] = input.balloons
      ?? (input.bubbleElements ?? []).map((el) => adaptBubbleElToVelloSpec(el));
    const projectedBalloons = rawBalloons.map((b) => projectBalloonSpecToViewport(b, input.viewport));

    const phase2Output = buildVelloPhase2BalloonScene(
      projectedBalloons,
      { width: input.viewport.width, height: input.viewport.height, background: input.background },
      { measurer: this.measurer, shaper: this.shaper },
    );
    const phase1Output = buildVelloPhase1OverlayScene(phase1State, input.viewport);
    const antsNode = input.marchingAnts ? buildMarchingAntsSceneNode(input.marchingAnts, input.viewport) : null;
    const unifiedScene: SceneIR = {
      version: 11,
      width: phase1Output.scene.width,
      height: phase1Output.scene.height,
      background: input.background ?? { r: 0, g: 0, b: 0, a: 0 },
      nodes: [
        ...phase2Output.scene.nodes,
        ...(antsNode ? [antsNode] : []),
        ...phase1Output.scene.nodes,
      ],
    };

    const useVelloGpu = this.rendererHandle !== null && !lbTelemetry.gpuDeviceLost && routeDecision.accelerator === "webgpu-compute";
    if (useVelloGpu && this.rendererHandle) {
      this.loadBalancer.acquire(routeDecision.accelerator);
      try {
        this.rendererHandle.submitScene(unifiedScene);
        const frameMs = Math.max(0, this.now() - startedAt);
        this.loadBalancer.recordFrame({ frameMs, task: "3d-lt-contour", accelerator: routeDecision.accelerator });
        this.activeBackend = "vello";
        this.fallbackReason = "none";
        this.counters.framesVello += 1;
        return {
          activeBackend: "vello", fallbackReason: "none", ownership: VELLO_OWNERSHIP,
          unifiedScene, phase1Output, phase2Output, transformHandles: phase1Output.handles, routeDecision, frameMs,
        };
      } catch (error) {
        this.counters.submitFailures += 1;
        this.lastErrorMessage = error instanceof Error ? error.message : String(error);
        this.disposeRendererHandle();
        return this.konvaFrame("renderer-submit-error", startedAt, routeDecision, this.lastErrorMessage);
      } finally {
        this.loadBalancer.release(routeDecision.accelerator);
      }
    }

    if (this.overlayCanvas2d || this.balloonCanvas2d) {
      if (this.balloonCanvas2d) renderPhase2BalloonToCanvas2D(this.balloonCanvas2d, phase2Output, input.viewport.dpr);
      if (this.overlayCanvas2d) renderPhase1OverlayToCanvas2D(this.overlayCanvas2d, phase1Output, input.viewport);
      const frameMs = Math.max(0, this.now() - startedAt);
      this.loadBalancer.recordFrame({ frameMs, task: "3d-lt-contour", accelerator: routeDecision.accelerator });
      this.activeBackend = "vello-canvas2d-fallback";
      this.fallbackReason = lbTelemetry.gpuDeviceLost ? "gpu-device-lost" : routeDecision.downgraded ? "load-balancer-pressure" : "none";
      this.counters.framesCanvas2d += 1;
      return {
        activeBackend: "vello-canvas2d-fallback", fallbackReason: this.fallbackReason, ownership: VELLO_OWNERSHIP,
        unifiedScene, phase1Output, phase2Output, transformHandles: phase1Output.handles, routeDecision, frameMs,
      };
    }

    return this.konvaFrame(routeDecision.downgraded ? "load-balancer-pressure" : "renderer-init-error", startedAt, routeDecision);
  }

  /** Vello Phase 1이 오버레이를 소유할 때 8-핸들·회전·OBB 이동 히트 테스트를 결정적으로 수행한다. */
  hitTestTransform(screenPoint: StudioPoint2D, options?: { readonly hitSlopCss?: number }): StudioTransformHitResult | null {
    if (!this.lastTransformBox || !this.lastViewport || this.activeBackend === "konva") return null;
    return hitTestTransformBox(this.lastTransformBox, this.lastViewport, screenPoint, options);
  }

  /**
   * 확장 WASM 핫패스(`studio-wasm64-extended-suite.wasm`)를 `Wasm64AdaptiveLoadBalancer`로 라우팅해
   * 지연 로드 실행하고, 로드 실패나 `js-fallback` 라우팅 시 JS 폴백으로 안전 강등한다.
   */
  async dispatchExtendedWasmHotpath<T>(
    task: AdaptiveTaskKind,
    handlers: {
      readonly runWasm: (runtime: StudioWasm64ExtendedSuiteRuntime) => T | Promise<T>;
      readonly runJsFallback: () => T | Promise<T>;
    },
    routeOptions?: AdaptiveRouteOptions,
  ): Promise<StudioExtendedWasmDispatchResult<T>> {
    const startedAt = this.now();
    const routeDecision = this.loadBalancer.route(task, routeOptions);
    this.lastRouteDecision = routeDecision;
    const canTryWasm = routeDecision.accelerator !== "js-fallback";

    if (canTryWasm) {
      this.loadBalancer.acquire(routeDecision.accelerator);
      try {
        const runtime = await this.ensureExtendedWasmRuntime();
        const value = await handlers.runWasm(runtime);
        const elapsedMs = Math.max(0, this.now() - startedAt);
        this.loadBalancer.recordFrame({ frameMs: elapsedMs, task, accelerator: routeDecision.accelerator });
        this.counters.wasmDispatches += 1;
        return { ok: true, executor: "wasm64-extended-suite", routeDecision, value, elapsedMs };
      } catch (error) {
        const fallbackError = error instanceof Error ? error.message : String(error);
        const value = await handlers.runJsFallback();
        const elapsedMs = Math.max(0, this.now() - startedAt);
        this.loadBalancer.recordFrame({ frameMs: elapsedMs, task, accelerator: "js-fallback" });
        this.counters.wasmFallbacks += 1;
        return { ok: true, executor: "js-fallback", routeDecision, value, elapsedMs, fallbackError };
      } finally {
        this.loadBalancer.release(routeDecision.accelerator);
      }
    }

    const value = await handlers.runJsFallback();
    const elapsedMs = Math.max(0, this.now() - startedAt);
    this.loadBalancer.recordFrame({ frameMs: elapsedMs, task, accelerator: "js-fallback" });
    this.counters.wasmFallbacks += 1;
    return { ok: true, executor: "js-fallback", routeDecision, value, elapsedMs };
  }

  getTelemetry(): StudioVelloViewportRuntimeBridgeTelemetry {
    return {
      studioVelloPhase12Enabled: this.isEnabled(),
      flagSource: this.flagSource,
      activeBackend: this.activeBackend,
      fallbackReason: this.fallbackReason,
      ownership: this.getLayerOwnership(),
      rendererInitialized: this.rendererHandle !== null,
      framesRenderedVello: this.counters.framesVello,
      framesRenderedCanvas2d: this.counters.framesCanvas2d,
      framesRenderedKonva: this.counters.framesKonva,
      rendererInitFailures: this.counters.initFailures,
      rendererSubmitFailures: this.counters.submitFailures,
      extendedWasmDispatches: this.counters.wasmDispatches,
      extendedWasmFallbacks: this.counters.wasmFallbacks,
      lastErrorMessage: this.lastErrorMessage,
      lastRouteDecision: this.lastRouteDecision,
      loadBalancer: this.loadBalancer.getTelemetry(),
    };
  }

  dispose(): void {
    this.disposeRendererHandle();
    if (this.extendedWasmRuntime) {
      this.extendedWasmRuntime.dispose();
      this.extendedWasmRuntime = null;
    }
    this.activeBackend = "konva";
  }

  private async ensureExtendedWasmRuntime(): Promise<StudioWasm64ExtendedSuiteRuntime> {
    if (this.extendedWasmRuntime) return this.extendedWasmRuntime;
    if (this.loadExtendedWasmSuite) {
      this.extendedWasmRuntime = await this.loadExtendedWasmSuite();
      return this.extendedWasmRuntime;
    }
    const loader = await import("../wasm64-runtime-bridge/wasm64-extended-suite-loader");
    this.extendedWasmRuntime = await loader.loadStudioWasm64ExtendedSuiteRuntime();
    return this.extendedWasmRuntime;
  }

  private disposeRendererHandle(): void {
    if (!this.rendererHandle) return;
    try { this.rendererHandle.dispose?.(); } catch { /* 해제 오류 무시 */ }
    this.rendererHandle = null;
  }

  private konvaFrame(
    reason: StudioVelloFallbackReason,
    startedAt: number,
    routeDecision: AdaptiveRouteDecision | null,
    errorMessage?: string,
  ): StudioVelloViewportFrameResult {
    this.activeBackend = "konva";
    this.fallbackReason = reason;
    this.counters.framesKonva += 1;
    return {
      activeBackend: "konva", fallbackReason: reason, ownership: KONVA_OWNERSHIP,
      unifiedScene: null, phase1Output: null, phase2Output: null, transformHandles: [],
      routeDecision, frameMs: Math.max(0, this.now() - startedAt), errorMessage,
    };
  }
}

export function createStudioVelloViewportRuntimeBridge(
  options?: StudioVelloViewportRuntimeBridgeOptions,
): StudioVelloViewportRuntimeBridge {
  return new StudioVelloViewportRuntimeBridge(options);
}
