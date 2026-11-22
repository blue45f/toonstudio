import { memo, useCallback, useEffect, useId, useLayoutEffect, useReducer, useRef, useState } from "react";
import {
  Arrow,
  Circle as KCircle,
  Ellipse,
  Group,
  Line,
  Path,
  Rect,
  Shape,
  Star,
} from "react-konva/lib/ReactKonvaCore";

import {
  requestStudioGpuBristleOverlay,
  STUDIO_GPU_BRISTLE_BRUSH_ID_PREFIX,
  studioGpuBristleOilRequest,
} from "../render/studio-gpu-bristle-host";
import { refreshStudioRasterPresentationCaches } from "../render/studio-raster-presentation-cache";
import {
  processFreehandPoints,
  processPencilPoints,
  resampleStrokePressures,
  resolveStudioFreehandRenderPath,
  screentoneDotRadius,
  screentoneDotsForStroke,
  screentoneDotsForStrokeIncremental,
} from "../studio-brush";
import {
  DEFAULT_STUDIO_CAUSAL_WATERCOLOR_MAX_DABS,
  planCausalWatercolorBrushDabs,
  planCausalWatercolorBrushDabsIncremental,
} from "../studio-causal-watercolor-brush";
import {
  planStudioDynamicBrushCoverageAndLegacyMarks,
  renderStudioDynamicBrushCoverage,
  renderStudioDynamicBrushLegacyMarks,
} from "../studio-dynamic-brush-coverage-renderer";
import { planStudioDynamicBrushRender } from "../studio-dynamic-brush-render-plan";
import {
  FX_PASTEL_DAB_CAP,
  STUDIO_FX_LUMINOUS_COMPOSITE_OPERATION,
  fxBrushSeedFromKey,
  isStudioFxPressureBrushId,
  createStudioIncrementalFxLuminousRibbonBuilder,
  createStudioIncrementalFxPressurePathBuilder,
  planOilBrushDabs,
  planOilBrushDabsIncremental,
  releaseOilBrushDabDraftPlanners,
  planPastelBrushDabs,
  resolveStudioFxBrushTapPressureResponse,
} from "../studio-fx-brush";
import { konvaGradientProps } from "../studio-gradient-engine";
import {
  planStudioHighlighterWashTap,
  resolveStudioHighlighterWashBrushId,
} from "../studio-highlighter-wash-ribbon";
import { STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1 } from "../studio-material-pressure-model";
import {
  planStudioPerfectFreehandRender,
  planStudioPerfectFreehandRenderIncremental,
} from "../studio-outline-stroke-contract";
import {
  konvaPatternProps,
  loadPatternTileImage,
  patternDataUrl,
} from "../studio-pattern-fill";
import {
  loadStudioPerfectFreehandStroker,
  peekStudioPerfectFreehandStroker,
  resolveStudioPerfectFreehandProfile,
} from "../studio-perfect-freehand";
import {
  fillStudioPixelPencilCells,
  planStudioPixelPencilCells,
} from "../studio-pixel-pencil";
import {
  planStudioRetainedMediaTapDab,
  resolveStudioRetainedMediaPressure,
  resolveStudioRetainedMediaPressureProfileId,
} from "../studio-retained-media-pressure";
import {
  buildStudioRoughShapeRenderPlan,
  loadStudioRoughGenerator,
  peekStudioRoughGenerator,
  studioRoughSeedFromElementId,
  studioSketchStyleOfElement,
} from "../studio-rough-shape";
import { StudioStampDrawShape } from "../StudioStampDrawShape";

import { StudioMaterialBrushShape } from "./StudioMaterialBrushShape";

import {
  mapStudioBrushAliasPressureSamples,
  resolveStudioBrushAliasWatercolorPlanSettings,
} from "./studio-brush-alias-profile";
import {
  resolveStudioCapturedBrushDynamicsPresetId,
} from "./studio-brush-dynamics";
import { resolveStudioBrushRuntimeProgramSet } from "./studio-brush-composition-runtime";
import {
  resolveStudioBrushRuntimeContract,
} from "./studio-brush-runtime-contract";
import {
  resolveStudioStampBrushKind,
} from "./studio-brush-stamp-engine";
import { STUDIO_BRUSH_RETAINED_DRAFT_SYMMETRY_VARIATIONS } from "./studio-brush-symmetry";
import {
  paintStudioDrawAngledNibCoverage,
  paintStudioDrawCalligraphyRibbon,
  paintStudioDrawFreehandPenStroke,
  paintStudioDrawGlitterParticles,
  paintStudioDrawHighlighterWashRibbon,
  paintStudioDrawHighlighterWashTap,
  paintStudioDrawLuminousRibbonPass,
  paintStudioDrawPastelDabs,
  paintStudioDrawPencilRibbonPasses,
  paintStudioDrawScreentoneDots,
  paintStudioDrawWatercolorDab,
} from "./studio-draw-node-canvas-painters";
import {
  buildStudioCalligraphyDrawRibbon,
  buildStudioGlitterBrushParticles,
  buildStudioHighlighterDrawWashPlan,
  buildStudioOilBrushPlanInput,
  buildStudioOilRibbonPaintInput,
  buildStudioPencilPassPlans,
  computeStudioOutlineErrorBounds,
  evaluateStudioPerfectOutlinePath,
  evaluateStudioPerfectStrokeClassification,
  isStudioDynamicSealDebugEnabled,
  planStudioLuminousBrushRender,
  recordStudioDynamicCommitRenderDebug,
  recordStudioDynamicCommitRouteDebug,
  resolveStudioAngledNibCoveragePressureInput,
  resolveStudioDrawFreehandContext,
  resolveStudioDrawTapMetrics,
} from "./studio-draw-node-stroke-helpers";
import {
  drawBounds,
  drawStudioCausalInkContract,
  getSymmetricPoints,
  resolveStudioCausalInkDrawContract,
} from "./studio-draw-rendering";
import {
  createStudioFxLuminousRetainedPass,
  type StudioFxLuminousRetainedPass,
} from "./studio-fx-luminous-retained-path";
import { resolveStudioDrawTapRadius } from "./studio-live-visible-tap";
import {
  paintStudioOilRibbonCarrier,
  paintStudioOilRibbonHit,
  planStudioOilRibbonCarrier,
  planStudioOilRibbonCarrierIncremental,
  releaseStudioOilRibbonDraftPlanners,
  studioOilRibbonProgramsForBrush,
} from "./studio-oil-ribbon-carrier";
import { paintStudioOilRibbonCarrierIncremental } from "./studio-oil-live-paint";
import {
  STUDIO_PENCIL_DEFAULT_ALIAS_PASS,
  STUDIO_PENCIL_RIBBON_ALPHA_BUCKET_COUNT,
  studioPencilAliasPassPoints,
} from "./studio-pencil-alias-passes";
import {
  planStudioAngledNibStrokeLocalCoverage,
  planStudioAngledNibStrokeLocalCoverageIncremental,
} from "./studio-stroke-local-coverage";
import {
  isStudioBoundedFlowPaintModelCompatible,
} from "./studio-stroke-paint-model";
import {
  effectiveCornerRadius,
  lineArrowHeadGeoms,
  normalizeShapeParams,
  normalizeStrokeStyle,
  polygonPathNodeLayoutInBounds,
  strokeDashArray,
} from "./studio-stroke-shapes";
import {
  planWatercolorBrushDabs,
  watercolorBrushSeedFromKey,
} from "./studio-watercolor-brush";
import { planStudioInteractiveWetInkBrushReplay } from "./studio-wet-ink-backend-capability";
import {
  renderStudioWetInkBrushReplay,
} from "./studio-wet-ink-brush-runtime";
import {
  planStudioWetRibbonCarrier,
  traceStudioWetRibbonCarrierBatch,
} from "./studio-wet-ribbon-carrier";
import { planStudioWetWashLivePipeline } from "./studio-wet-wash-live-pipeline";
import { drawStudioWetPaperBake, releaseStudioWetPaperBakeRequesters, resolveStudioWatercolorSettledSurface, resolveStudioWetPaperBakeProgramIdForBrush } from "./wet-paper/studio-watercolor-settled-surface";

import type { DrawEl } from "../studio-element-model";
import type { StudioIncrementalFxPressurePathBuilder } from "../studio-fx-brush";
import type { StudioPaperSurfaceSettings } from "./studio-paper-granulation-runtime";
import type { StudioPatternSpec } from "../studio-pattern-fill";
import type { StudioPerfectFreehandStroker } from "../studio-perfect-freehand";
import type { StudioRoughGeneratorHandle } from "../studio-rough-shape";
import type Konva from "konva";

export { STUDIO_PENCIL_RIBBON_ALPHA_BUCKET_COUNT };


// 손그림(스케치) 도형용 rough.js generator 훅 — 스케치가 켜진 도형이 처음 보일 때만
// 동적 import로 로드한다(Studio eager 청크에 rough.js 미포함). 로드 전에는 null을 반환해
// 깨끗한 Konva 프리미티브 폴백으로 그리고, 로드가 끝나면 상태 변경으로 다시 그린다.
function useStudioRoughGenerator(wanted: boolean): StudioRoughGeneratorHandle | null {
  const [generator, setGenerator] = useState<StudioRoughGeneratorHandle | null>(
    () => peekStudioRoughGenerator()
  );
  useEffect(() => {
    if (!wanted || generator) return;
    let active = true;
    loadStudioRoughGenerator()
      .then((loaded) => {
        if (active) setGenerator(loaded);
      })
      .catch(() => {
        // 로드 실패 시 깨끗한 프리미티브 렌더를 유지한다 — 다음 마운트가 재시도.
      });
    return () => {
      active = false;
    };
  }, [wanted, generator]);
  return wanted ? generator : null;
}

// 퍼펙트-프리핸드(tldraw 필기감) 스트로커 훅 — 퍼펙트 브러시 획이 처음 보일 때만 동적
// import로 로드한다(Studio eager 청크에 perfect-freehand 미포함). 로드 전에는 null을 반환해
// 깨끗한 Line 폴백으로 그리고, 로드가 끝나면 상태 변경으로 다시 그린다.
function useStudioPerfectFreehandStroker(wanted: boolean): StudioPerfectFreehandStroker | null {
  const [stroker, setStroker] = useState<StudioPerfectFreehandStroker | null>(
    () => peekStudioPerfectFreehandStroker()
  );
  useEffect(() => {
    if (!wanted || stroker) return;
    let active = true;
    loadStudioPerfectFreehandStroker()
      .then((loaded) => {
        // 스트로커는 함수 값이라 updater 로 오인되지 않게 반드시 클로저로 감싼다.
        if (active) setStroker(() => loaded);
      })
      .catch(() => {
        // 로드 실패 시 깨끗한 Line 폴백 렌더를 유지한다 — 다음 마운트가 재시도.
      });
    return () => {
      active = false;
    };
  }, [wanted, stroker]);
  return wanted ? stroker : null;
}


const STUDIO_DRAW_PATTERN_IMAGE_CACHE_LIMIT = 128;
const resolvedPatternTileImages = new Map<string, HTMLImageElement>();
const pendingPatternTileImageLoads = new Map<string, Promise<HTMLImageElement>>();

function cacheResolvedPatternTileImage(tileSrc: string, image: HTMLImageElement): void {
  if (!resolvedPatternTileImages.has(tileSrc)) {
    while (resolvedPatternTileImages.size >= STUDIO_DRAW_PATTERN_IMAGE_CACHE_LIMIT) {
      const oldestTileSrc = resolvedPatternTileImages.keys().next().value;
      if (typeof oldestTileSrc !== "string") break;
      resolvedPatternTileImages.delete(oldestTileSrc);
    }
  }
  resolvedPatternTileImages.set(tileSrc, image);
}

function loadSharedPatternTileImage(tileSrc: string): Promise<HTMLImageElement> {
  const resolved = resolvedPatternTileImages.get(tileSrc);
  if (resolved) return Promise.resolve(resolved);
  const pending = pendingPatternTileImageLoads.get(tileSrc);
  if (pending) return pending;

  const request = loadPatternTileImage(tileSrc, () => new globalThis.Image()).then(
    (image) => {
      cacheResolvedPatternTileImage(tileSrc, image);
      pendingPatternTileImageLoads.delete(tileSrc);
      return image;
    },
    (error: unknown) => {
      pendingPatternTileImageLoads.delete(tileSrc);
      throw error;
    },
  );
  pendingPatternTileImageLoads.set(tileSrc, request);
  return request;
}

// 패턴 채우기 타일 이미지 훅 — 패턴 스펙의 SVG 타일(data URL)을 HTMLImage로 비동기 로드한다.
// UrlImage의 effect 로드 방식을 훅으로 컴포넌트화한 것. 타일 src는 patternId/색에만
// 의존하므로(배율은 fillPatternScale로 적용) 배율 조절로는 재로드되지 않는다. 문서 노드가
// 이미 해결한 타일은 transform-draft가 같은 이미지 객체를 첫 렌더부터 재사용한다. 캐시가
// 차가워도 동일 src의 진행 중 요청을 공유하며, bounded cache라 문서별 색 조합이 누적되지 않는다.
// 로드 전/실패 시 null → konvaPatternProps가 no-op이 되어 fill/그라데이션 폴백 유지.
function usePatternFillImage(pattern: StudioPatternSpec | undefined): HTMLImageElement | null {
  const [loaded, setLoaded] = useState<{
    image: HTMLImageElement;
    tileSrc: string;
  } | null>(null);
  const tileSrc = pattern ? patternDataUrl(pattern) : null;
  const image = tileSrc
    ? (loaded?.tileSrc === tileSrc ? loaded.image : null)
      ?? resolvedPatternTileImages.get(tileSrc)
      ?? null
    : null;
  useEffect(() => {
    if (!tileSrc) return;
    const resolved = resolvedPatternTileImages.get(tileSrc);
    if (resolved) {
      // A cache hit must be visible on the first render, but the mounted node also retains its own
      // reference so a later bounded-cache eviction cannot make an existing pattern disappear.
      if (loaded?.tileSrc !== tileSrc || loaded.image !== resolved) {
        setLoaded({ image: resolved, tileSrc });
      }
      return;
    }
    if (loaded?.tileSrc === tileSrc) return;
    let active = true;
    loadSharedPatternTileImage(tileSrc)
      .then((img) => {
        if (active) setLoaded({ image: img, tileSrc });
      })
      .catch(() => {
        // 로드 실패 시 현재 fill/gradient 폴백을 유지하고 다음 마운트가 재시도한다.
      });
    return () => {
      active = false;
    };
  }, [loaded, tileSrc]);
  return image;
}

// memo 는 라이브 드로잉의 핵심 계약이다: 초안이 rAF마다 리렌더를 일으켜도 커밋된 획들은 같은
// el 참조를 받으므로 여기서 잘린다. memo 가 없으면 모든 커밋 획이 매 프레임 스무딩을 재계산해
// 새 points 배열을 만들고, react-konva 가 이를 시각 변경으로 보고 메인 레이어 전체를 다시
// 래스터한다 — 콘텐츠가 쌓일수록 스트로크가 점점 무거워지던 원인.
export const StudioDrawNode = memo(function StudioDrawNode({
  el,
  activeDraft: legacyActiveDraft = false,
  exposeSceneIdentity = true,
  paperSurface,
  renderPurpose,
}: {
  el: DrawEl;
  /** 활성 수채 초안은 움직이는 종점 pigment를 영구 station으로 굳히지 않는다. */
  activeDraft?: boolean;
  /** False for renderer-local preview copies that must never be found as document wrappers. */
  exposeSceneIdentity?: boolean;
  /** Retained document strokes re-plan when the selected paper changes. */
  paperSurface?: StudioPaperSurfaceSettings;
  /**
   * Transform drafts use settled geometry but must not start document-owned background bakes,
   * populate committed caches or write diagnostics on every animation frame.
   */
  renderPurpose?: "document" | "drawing-draft" | "transform-draft";
}) {
  const resolvedRenderPurpose = renderPurpose
    ?? (legacyActiveDraft ? "drawing-draft" : "document");
  const activeDraft = resolvedRenderPurpose === "drawing-draft";
  const durableDocumentRender = resolvedRenderPurpose === "document";
  const kind = el.kind ?? "freehand";
  const runtimeEnginePrograms = resolveStudioBrushRuntimeProgramSet(
    el.brush,
    el.brushEnginePrograms,
  );
  // 패턴 채우기 타일(로드 전 null) — 우선순위: 패턴 > 그라데이션 > 단색(fillPriority).
  // 실제 fillPattern props를 쓰는 도형만 타일을 요청한다. 따라서 exact transform draft는
  // 문서 렌더의 resolved tile을 재사용하고, legacy/freehand의 stale pattern 필드는 어떤
  // render purpose에서도 불필요한 비동기 로드를 시작하지 않는다.
  const patternImage = usePatternFillImage(
    kind === "rect"
      || kind === "ellipse"
      || kind === "star"
      || kind === "triangle"
      || kind === "polygon"
      ? el.pattern
      : undefined,
  );
  // 정착 결과·갈필 침착 미리보기가 준비되면 같은 세대로 다시 그린다. 전체 물리 계산은 시분할한다.
  const [livingInkBakeGeneration, notifyLivingInkBakeReady] = useReducer(
    (generation: number) => (generation + 1) | 0,
    0,
  );
  // 젖은 종이 요청자(렌더 인스턴스 + 대칭 변형): 같은 획을 고치는 동안 지나간 모양·색의 굽기를 버린다.
  const bakeRequesterId = useId();
  const wetPaperMounted = useRef(true);
  const notifyWetPaperReady = useCallback(() => {
    if (wetPaperMounted.current) notifyLivingInkBakeReady();
  }, []);
  useEffect(() => {
    wetPaperMounted.current = true;
    return () => {
      wetPaperMounted.current = false;
      // StrictMode의 재설정은 같은 작업을 계속 쓴다. 실제 언마운트는 다음 microtask에 해제한다.
      queueMicrotask(() => { if (!wetPaperMounted.current) releaseStudioWetPaperBakeRequesters(bakeRequesterId); });
    };
  }, [bakeRequesterId]);
  const rootGroupRef = useRef<Konva.Group | null>(null);
  // 정착 베이크가 도착하면 캐시된 조상(블렌드·마스크·조정 그룹)이 베이스 워시 픽셀을 계속 그리지 않게, 가장
  // 가까운 캐시 소유자부터 다시 만든다(늦게 도착한 이미지와 같은 규칙).
  useLayoutEffect(() => {
    const group = rootGroupRef.current;
    if (livingInkBakeGeneration === 0 || !group) return;
    refreshStudioRasterPresentationCaches(group);
    group.getLayer()?.batchDraw();
  }, [livingInkBakeGeneration]);
  // Opt-in GPU bristle overlay (dli position-based-dynamics chain + per-pixel impasto). The lane
  // advances in a Worker off the render path and this counter is bumped when a result lands, so
  // the compiled (React Compiler) render body re-executes the request and picks up the bitmap.
  // A selected GPU-bristle brush owns pixels only after its bitmap is ready. Pending/unavailable
  // states preserve the source stroke but never execute the Canvas oil carrier.
  const [gpuBristleGeneration, notifyGpuBristleReady] = useReducer(
    (generation: number) => (generation + 1) | 0,
    0,
  );
  const isEraserOperation = el.mode === "eraser"
    || (el.brush ? resolveStudioBrushRuntimeContract(el.brush)?.operation === "erase" : false);
  /**
   * 압력 경로(fx 패밀리: neon/glow/highlighter)의 증분 빌더. 자라나는 요소가 이 컴포넌트를 매
   * 이동 리렌더할 때 전체 압력 경로를 다시 계획하던 것(장획 게이트가 잡는 이동당 O(n))을,
   * sceneFunc(그리기 시점)에서 append 로 소비해 이동당 상수 비용으로 만든다. 렌더 본문이 아닌
   * 그리기 콜백에서만 접근하므로 react-compiler 순수성 규약과도 충돌하지 않는다.
   *
   * 라이브 드래프트에서만 쓴다(P2 리뷰): 빌더의 prefix 검증은 마지막 소비 슬롯만 보는 O(1)
   * 앵커라, 길이·꼬리가 같은 내부 재작성(undo/복원)을 append-only 로 오인해 커밋 요소가 낡은
   * 지오메트리를 유지할 수 있다 — 커밋/재수화 경로는 배치 플래너가 값 동일로 다시 계산한다.
   * 대칭 변형은 인덱스별 빌더로 격리한다(꼬리점이 대칭축 위일 때 변형 간 앵커 충돌 방지).
   */
  const fxPressurePathBuildersRef =
    useRef<Map<number, StudioIncrementalFxPressurePathBuilder> | null>(null);
  const fxPressurePathBuilderForVariation = (
    variationIndex: number,
  ): StudioIncrementalFxPressurePathBuilder => {
    const builders = fxPressurePathBuildersRef.current ??= new Map();
    let builder = builders.get(variationIndex);
    if (!builder) {
      builder = createStudioIncrementalFxPressurePathBuilder();
      builders.set(variationIndex, builder);
    }
    return builder;
  };
  /**
   * 발광 리본 패스별 유지 상태 — (대칭 변형, 패스) 키 하나당 증분 플래너와 안정 prefix Path2D.
   *
   * 압력 경로만 증분이던 시절 glow 는 셸 48개를 매 이동 통째로 다시 계획하고 다시 그렸다(실측
   * r150 원 한 획 34.8초, 최악 이동 716 ms). 패스마다 플래너를 들고 있으면 이동당 비용이 새로
   * 들어온 섹션에만 비례한다(같은 획 0.91초, 최악 이동 25.2 ms).
   */
  const fxLuminousRetainedPassesRef =
    useRef<Map<string, StudioFxLuminousRetainedPass> | null>(null);
  const fxLuminousRetainedPass = (
    variationIndex: number,
    passIndex: number,
    retain: boolean,
  ): StudioFxLuminousRetainedPass | null => {
    // 예산을 넘긴 순간 이미 들고 있던 패스까지 놓는다 — 유지하지 않을 획의 폴리곤을 계속 붙들고
    // 있으면 예산이 상한이 아니라 그냥 미뤄진 지출이 된다.
    if (!retain) {
      fxLuminousRetainedPassesRef.current = null;
      return null;
    }
    const passes = fxLuminousRetainedPassesRef.current ??= new Map();
    const key = `${variationIndex}:${passIndex}`;
    let retained = passes.get(key);
    if (!retained) {
      retained = createStudioFxLuminousRetainedPass(
        createStudioIncrementalFxLuminousRibbonBuilder(),
      );
      passes.set(key, retained);
    }
    return retained;
  };
  const composite = isEraserOperation ? "destination-out" : "source-over";
  const opacity = el.opacity ?? 1;
  const stroke = isEraserOperation ? "#16100c" : el.stroke;
  const strokeWidth = Math.max(1, el.strokeWidth);
  // 스트로크 스타일(점선/선 끝) + 도형 파라미터 — 미설정 요소는 기본값으로 정규화된다.
  const strokeStyle = normalizeStrokeStyle(el.strokeStyle);
  const shapeParams = normalizeShapeParams(el.shapeParams);
  const shapeDash = strokeDashArray(strokeStyle.dash, strokeWidth);
  // 손그림(스케치) 스타일 — 켜진 도형은 rough.js 패스로 그린다(요소 id 시드로 결정적).
  const sketchStyle = kind !== "freehand" ? studioSketchStyleOfElement(el) : null;
  const roughGenerator = useStudioRoughGenerator(sketchStyle?.enabled === true);
  // 연속 가변 폭 아웃라인 브러시 — perfect 잉크뿐 아니라 G펜 계열도 같은 곡선 스트로커를
  // 사용한다. 짧은 직선 캡슐을 겹치던 과거 G펜 경로와 달리 급커브·필압 전환이 하나의
  // 닫힌 윤곽으로 이어진다. 프로필이 있으면 스트로커를 지연 로드한다.
  const perfectProfile = kind === "freehand"
    && el.mode !== "eraser"
    ? resolveStudioPerfectFreehandProfile(el.brush)
    : null;
  const outlineContractPresent = kind === "freehand"
    && el.outlineStroke !== undefined;
  const perfectStroker = useStudioPerfectFreehandStroker(
    perfectProfile !== null || outlineContractPresent,
  );

  const stampBrushKind = kind === "freehand" && el.mode !== "eraser"
    ? resolveStudioStampBrushKind(el.brush)
    : null;
  const dynamicBrushId = kind === "freehand" && el.mode !== "eraser"
    ? resolveStudioCapturedBrushDynamicsPresetId(el)
    : null;
  // Stamp and dynamic-dab renderers own their symmetry fan inside one bounded Shape. Do not build
  // and discard up to 64 complete transformed source-point arrays on every active-draft frame.
  const materialOwnsSymmetry = kind === "freehand" && !isEraserOperation && Boolean(runtimeEnginePrograms?.material);
  const symmetricVariations = materialOwnsSymmetry || stampBrushKind || dynamicBrushId
    ? [el.points]
    : getSymmetricPoints(el.points, el.symmetry);
  // 활성 초안의 대칭 카피는 매 프레임 고정 인덱스 순서로 전부 그려지므로, 획 키 캐시가 보는
  // 작업 집합은 1이 아니라 카피 수다. 보관 한도보다 부채꼴이 넓으면 배치 플래너로 보내, 캐시가
  // 매 프레임 전멸하며 도입 이전보다 느려지는 일이 없게 한다.
  const oilDraftPlannersRetained = activeDraft
    && symmetricVariations.length <= STUDIO_BRUSH_RETAINED_DRAFT_SYMMETRY_VARIATIONS;
  // 보관 베드를 놓는 지점은 둘이다. 캡 포화 오일 획은 카피당 ~27k 런 객체를 들고 있어서, 그리기가
  // 끝난 뒤에도 붙들고 있으면 수십만 객체가 살아 있게 된다. 변형 초안은 동일한 DrawEl id를
  // 재사용하는 renderer-local 복사본일 뿐 이 슬롯의 소유자가 아니므로 전역 초안 상태를 건드리지
  // 않는다.
  //
  //  1. 초안이 끝나면 이 요소가 activeDraft=false 로 다시 그려진다 — 가장 흔한 종료 경로다.
  //  2. 그 렌더가 아예 오지 않는 종료 경로(제스처 취소, 미리보기 레이어 제거, 캔버스 언마운트)는
  //     실제 drawing-draft 소유자가 설치한 아래 정리가 유일한 해제 지점이다.
  //
  // 두 해제 모두 다른 초안이 이미 자리를 차지했으면 no-op 이라 순서에 안전하다.
  if (durableDocumentRender) {
    releaseStudioOilRibbonDraftPlanners(el.id);
    releaseOilBrushDabDraftPlanners(el.id);
  }
  useEffect(() => {
    if (!activeDraft) return undefined;
    // 발광 유지 패스는 이 인스턴스의 ref 라 오일 베드처럼 전역에서 회수할 필요가 없다. 초안이
    // 끝나는 모든 경로(커밋 리렌더·제스처 취소·언마운트)가 이 정리를 지나므로 여기 한 곳이면
    // 충분하고, 렌더 본문에서 ref 를 쓰지 않아 react-compiler 순수성 규약도 건드리지 않는다.
    const luminousPasses = fxLuminousRetainedPassesRef;
    return () => {
      releaseStudioOilRibbonDraftPlanners(el.id);
      releaseOilBrushDabDraftPlanners(el.id);
      luminousPasses.current = null;
    };
  }, [activeDraft, el.id]);
  const dynamicBrushPlanResult = dynamicBrushId
    ? planStudioDynamicBrushRender(el, dynamicBrushId, activeDraft, paperSurface)
    : null;
  const dynamicBrushPlanFailed = dynamicBrushPlanResult?.status === "rejected";
  const dynamicBrushPlan = dynamicBrushPlanResult?.status === "ready"
    ? dynamicBrushPlanResult.plan
    : null;
  const dynamicCoverageAndLegacyMarkPlan = dynamicBrushPlan
    ? planStudioDynamicBrushCoverageAndLegacyMarks({
        dabVariations: dynamicBrushPlan.dabVariations,
        dynamics: dynamicBrushPlan.dynamics,
        materialIdentity: dynamicBrushPlan.materialIdentity,
        dynamicSeed: dynamicBrushPlan.seed,
        stroke,
        stampGrid: dynamicBrushPlan.renderBudget.stampGrid,
        markBudget: dynamicBrushPlan.markBudget,
        // 종이 결은 획이 아니라 캔버스의 성질이라 요소 스냅샷이 아니라 렌더 플랜이 들고 온다.
        ...(dynamicBrushPlan.paper ? { paper: dynamicBrushPlan.paper } : {}),
      })
    : null;
  const dynamicCoverageMarkPlan = dynamicCoverageAndLegacyMarkPlan?.coveragePlan ?? null;

  // 브라우저 감사 진단(플래그 게이트): 커밋 렌더가 분기하기 전의 요소 라우팅 사실을 남긴다 —
  // "라이브는 dynamic 커버리지, 커밋은 알 수 없는 분기"였던 실측 모순의 최종 판별점.
  // 렌더 본문 부수효과는 react-compiler 계약 위반이라 커밋 후 이펙트에서 기록한다.
  useEffect(() => {
    if (
      !durableDocumentRender
      || kind !== "freehand"
      || el.mode === "eraser"
      || !isStudioDynamicSealDebugEnabled()
    ) {
      return;
    }
    recordStudioDynamicCommitRouteDebug({
      el,
      dynamicBrushId,
      planStatus: dynamicBrushPlanResult?.status ?? null,
      coverageOk: dynamicCoverageMarkPlan?.ok ?? null,
      stampBrushKind,
      hasPerfectProfile: perfectProfile !== null,
    });
  }, [
    durableDocumentRender,
    dynamicBrushId,
    dynamicBrushPlanResult,
    dynamicCoverageMarkPlan,
    el,
    kind,
    perfectProfile,
    stampBrushKind,
  ]);

  return (
    <Group
      ref={rootGroupRef}
      studioElementId={exposeSceneIdentity ? el.id : undefined}
      globalCompositeOperation={isEraserOperation ? "destination-out" : undefined}
      listening={false}
    >
      {symmetricVariations.map((points, index) => {
        // 손그림(스케치) 모드 — 모든 도형 종류를 rough.js 패스로 그린다. generator 로드 전이나
        // 지오메트리 부족으로 계획이 비면 아래 깨끗한 프리미티브 분기로 그대로 폴백한다.
        if (kind !== "freehand" && sketchStyle?.enabled && roughGenerator) {
          const sketchPlan = buildStudioRoughShapeRenderPlan(roughGenerator, {
            kind,
            points,
            strokeWidth,
            hasFill: Boolean(el.fill),
            shapeParams,
            style: sketchStyle,
            // 대칭 복제본은 index 오프셋으로 서로 다른(그러나 결정적인) 흔들림을 갖는다.
            seed: studioRoughSeedFromElementId(el.id) + index,
          });
          if (sketchPlan.length > 0) {
            const lineHeads =
              kind === "line" ? lineArrowHeadGeoms(points, strokeStyle, strokeWidth) : [];
            return (
              <Group key={index} opacity={opacity} listening={false}>
                {sketchPlan.map((path, pathIndex) =>
                  path.role === "outline" ? (
                    <Path
                      key={pathIndex}
                      data={path.data}
                      stroke={stroke}
                      strokeWidth={path.strokeWidth}
                      dash={shapeDash}
                      lineCap={strokeStyle.lineCap}
                      lineJoin="round"
                      globalCompositeOperation={composite}
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                  ) : path.role === "fill-hatch" ? (
                    <Path
                      key={pathIndex}
                      data={path.data}
                      stroke={el.fill}
                      strokeWidth={path.strokeWidth}
                      lineCap="round"
                      lineJoin="round"
                      globalCompositeOperation={composite}
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                  ) : (
                    <Path
                      key={pathIndex}
                      data={path.data}
                      fill={path.role === "outline-fill" ? stroke : el.fill}
                      globalCompositeOperation={composite}
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                  )
                )}
                {lineHeads.map((head, headIndex) =>
                  head.kind === "dot" ? (
                    <KCircle
                      key={`head-${headIndex}`}
                      x={head.cx}
                      y={head.cy}
                      radius={head.r}
                      fill={stroke}
                      globalCompositeOperation={composite}
                      listening={false}
                    />
                  ) : (
                    <Line
                      key={`head-${headIndex}`}
                      points={head.points}
                      closed
                      fill={stroke}
                      lineJoin="round"
                      globalCompositeOperation={composite}
                      listening={false}
                    />
                  )
                )}
              </Group>
            );
          }
        }

        if (kind === "rect") {
          const box = drawBounds(points);
          return (
            <Rect
              key={index}
              x={box.x}
              y={box.y}
              width={Math.max(0.1, box.width)}
              height={Math.max(0.1, box.height)}
              fill={el.fill}
              {...konvaGradientProps(el.gradient, { x: 0, y: 0, width: Math.max(0.1, box.width), height: Math.max(0.1, box.height) })}
              {...konvaPatternProps(el.pattern, patternImage)}
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={opacity}
              dash={shapeDash}
              cornerRadius={effectiveCornerRadius(box.width, box.height, shapeParams.cornerRadius)}
              lineJoin="round"
              globalCompositeOperation={composite}
              listening={false}
            />
          );
        }

        if (kind === "ellipse") {
          const box = drawBounds(points);
          return (
            <Ellipse
              key={index}
              x={box.x + box.width / 2}
              y={box.y + box.height / 2}
              radiusX={Math.max(0.1, box.width / 2)}
              radiusY={Math.max(0.1, box.height / 2)}
              fill={el.fill}
              {...konvaGradientProps(el.gradient, { x: -box.width / 2, y: -box.height / 2, width: Math.max(0.1, box.width), height: Math.max(0.1, box.height) })}
              {...konvaPatternProps(el.pattern, patternImage)}
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={opacity}
              dash={shapeDash}
              globalCompositeOperation={composite}
              listening={false}
            />
          );
        }

        if (kind === "star") {
          const box = drawBounds(points);
          return (
            <Star
              key={index}
              x={box.x + box.width / 2}
              y={box.y + box.height / 2}
              numPoints={shapeParams.starPoints}
              innerRadius={Math.max(0.1, (Math.min(box.width, box.height) / 2) * shapeParams.starInnerRatio)}
              outerRadius={Math.max(0.1, Math.min(box.width, box.height) / 2)}
              fill={el.fill}
              {...konvaGradientProps(el.gradient, { x: -Math.min(box.width, box.height) / 2, y: -Math.min(box.width, box.height) / 2, width: Math.max(0.1, Math.min(box.width, box.height)), height: Math.max(0.1, Math.min(box.width, box.height)) })}
              {...konvaPatternProps(el.pattern, patternImage)}
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={opacity}
              dash={shapeDash}
              lineJoin="round"
              globalCompositeOperation={composite}
              listening={false}
            />
          );
        }

        if (kind === "arrow") {
          return (
            <Arrow
              key={index}
              points={points}
              pointerLength={Math.max(8, strokeWidth * 2)}
              pointerWidth={Math.max(8, strokeWidth * 2)}
              fill={stroke}
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={opacity}
              dash={shapeDash}
              lineCap={strokeStyle.lineCap}
              globalCompositeOperation={composite}
              listening={false}
            />
          );
        }

        if (kind === "triangle") {
          const box = drawBounds(points);
          const layout = polygonPathNodeLayoutInBounds(box.x, box.y, box.width, box.height, 3);
          return (
            <Line
              key={index}
              x={layout.x}
              y={layout.y}
              points={[...layout.points]}
              closed
              fill={el.fill}
              {...konvaPatternProps(el.pattern, patternImage)}
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={opacity}
              dash={shapeDash}
              lineJoin="round"
              globalCompositeOperation={composite}
              listening={false}
            />
          );
        }

        if (kind === "polygon") {
          const box = drawBounds(points);
          const layout = polygonPathNodeLayoutInBounds(
            box.x,
            box.y,
            box.width,
            box.height,
            shapeParams.polygonSides,
          );
          return (
            <Line
              key={index}
              x={layout.x}
              y={layout.y}
              points={[...layout.points]}
              closed
              fill={el.fill}
              {...konvaPatternProps(el.pattern, patternImage)}
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={opacity}
              dash={shapeDash}
              lineJoin="round"
              globalCompositeOperation={composite}
              listening={false}
            />
          );
        }

        if (kind === "freehand") {
          if (runtimeEnginePrograms?.material && !isEraserOperation) {
            return (
              <StudioMaterialBrushShape
                key={index}
                element={el}
                points={points}
                enginePrograms={runtimeEnginePrograms}
              />
            );
          }
          const {
            brush,
            brushFamily,
            aliasProfileEnabled,
            isPerfectAliasBrush,
            pixelPencil,
            aliasStrokeWidth,
            aliasPencilPasses,
            singlePointRoute,
            renderSampleDistance,
            pointCount,
            strokeDistance,
            isCompactPerfectDotRoute,
          } = resolveStudioDrawFreehandContext({
            el,
            points,
            strokeWidth,
            hasPerfectProfile: perfectProfile !== null,
          });
          const stampKind = stampBrushKind;
          const dynamicBrush = dynamicBrushId !== null;

          if (pixelPencil && el.mode !== "eraser") {
            const pixelPlan = planStudioPixelPencilCells({ points, strokeWidth: aliasStrokeWidth });
            if (!pixelPlan.complete) return null;
            return (
              <Shape
                key={index}
                sceneFunc={(context) => {
                  context.save();
                  context.fillStyle = stroke;
                  fillStudioPixelPencilCells(context, pixelPlan.cells);
                  context.restore();
                }}
                opacity={opacity}
                globalCompositeOperation={composite}
                listening={false}
                perfectDrawEnabled={false}
              />
            );
          }

          if (outlineContractPresent) {
            const outlinePlanInput = {
              contract: el.outlineStroke,
              stroker: perfectStroker,
              points,
              // New outline contracts record canonical renderer pressure at pointer capture.
              // Applying the mutable brush-alias adapter again here would double-map that input.
              pressures: el.pressures,
              // The durable contract, rather than the mutable brush catalogue, owns alias scale.
              strokeWidth,
              sampleSpacing: el.sampleSpacing,
              legacyMinDistance: renderSampleDistance,
            };
            // 활성 초안은 요소 id 로 키된 증분 플래너가 크로키 캡슐 링·pathData 의 안정
            // prefix 를 유지한다(장획 게이트 capsule-outline; 다른 엔진은 내부에서 배치 위임).
            // 커밋 렌더는 배치 리플레이를 유지해 내부 점 재작성에도 항상 정본을 그린다.
            // 대칭 변형은 같은 요소를 변형된 점 배열로 여러 번 그린다 — 변형 인덱스를 획
            // 키에 포함해 변형끼리 유지 플래너(내부 보관 배열)를 공유하지 않게 한다(P2 리뷰).
            const outlinePlan = activeDraft
              ? planStudioPerfectFreehandRenderIncremental(`${el.id}#${index}`, outlinePlanInput)
              : planStudioPerfectFreehandRender(outlinePlanInput);
            if (outlinePlan.kind === "outline") {
              return (
                <Path
                  key={index}
                  data={outlinePlan.pathData}
                  fill={stroke}
                  opacity={opacity}
                  globalCompositeOperation={composite}
                  listening={false}
                  perfectDrawEnabled={false}
                />
              );
            }
            if (outlinePlan.kind === "fallback-line") {
              const capRadius = outlinePlan.line.endpointCapRadius;
              const linePoints = outlinePlan.line.points;
              const hasLineStart = linePoints.length >= 2;
              const hasDistinctLineEnd = linePoints.length >= 4
                && (
                  linePoints[0] !== linePoints[linePoints.length - 2]
                  || linePoints[1] !== linePoints[linePoints.length - 1]
                );
              return (
                <Group
                  key={index}
                  name="studio-outline-contract-fallback"
                  opacity={opacity}
                  listening={false}
                >
                  <Line
                    points={[...linePoints]}
                    stroke={stroke}
                    strokeWidth={outlinePlan.line.strokeWidth}
                    lineCap="round"
                    lineJoin="round"
                    tension={outlinePlan.line.tension}
                    globalCompositeOperation={composite}
                    perfectDrawEnabled={false}
                    shadowForStrokeEnabled={false}
                  />
                  {capRadius !== null && hasLineStart ? (
                    <KCircle
                      x={linePoints[0]!}
                      y={linePoints[1]!}
                      radius={capRadius}
                      fill={stroke}
                      globalCompositeOperation={composite}
                      listening={false}
                    />
                  ) : null}
                  {capRadius !== null && hasDistinctLineEnd ? (
                    <KCircle
                      x={linePoints[linePoints.length - 2]!}
                      y={linePoints[linePoints.length - 1]!}
                      radius={capRadius}
                      fill={stroke}
                      globalCompositeOperation={composite}
                      listening={false}
                    />
                  ) : null}
                </Group>
              );
            }
            if (outlinePlan.kind !== "legacy-contract") {
              const { minX, minY, width, height } =
                computeStudioOutlineErrorBounds(points);
              const issueName = outlinePlan.kind === "unsupported-contract"
                ? outlinePlan.issue.code
                : outlinePlan.reason;
              // Unknown contract revisions and damaged recorded pressure must never be rendered as
              // a plausible but different legacy stroke. A compact magenta diagnostic keeps the
              // failure visible on canvas while SVG reports a structured skip receipt.
              return (
                <Group
                  key={index}
                  name={`studio-outline-contract-error:${issueName}`}
                  listening={false}
                >
                  <Rect
                    x={minX}
                    y={minY}
                    width={width}
                    height={height}
                    stroke="#ff2f7d"
                    strokeWidth={1.5}
                    dash={[4, 3]}
                    opacity={0.9}
                    listening={false}
                  />
                  <Line
                    points={[minX, minY, minX + width, minY + height]}
                    stroke="#ff2f7d"
                    strokeWidth={1.5}
                    opacity={0.9}
                    listening={false}
                  />
                  <Line
                    points={[minX + width, minY, minX, minY + height]}
                    stroke="#ff2f7d"
                    strokeWidth={1.5}
                    opacity={0.9}
                    listening={false}
                  />
                </Group>
              );
            }
          }

          if (
            points.length === 2
            && singlePointRoute === "generic-dot"
            && perfectProfile === null
            && aliasPencilPasses.length > 0
          ) {
            const sourcePressure = el.pressures?.[0] ?? 0.5;
            const pressureProfile = resolveStudioRetainedMediaPressureProfileId(brush)
              ?? "pencil";
            const pressureResponse = resolveStudioRetainedMediaPressure(
              pressureProfile,
              el.materialPressureModel === STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1
                ? sourcePressure
                : undefined,
              el.materialMinimumDiameterRatio,
            );
            return (
              <Group key={index} opacity={opacity} listening={false}>
                {aliasPencilPasses.map((pass, passIndex) => (
                  <KCircle
                    key={`${pass.role}-${passIndex}`}
                    x={points[0]}
                    y={points[1]}
                    radius={resolveStudioDrawTapRadius(
                      activeDraft,
                      Math.max(
                        0.35,
                        aliasStrokeWidth
                        * pass.widthScale
                        * pressureResponse.sizeScale
                        / 2,
                      ),
                    )}
                    fill={stroke}
                    opacity={Math.min(
                      1,
                      pass.opacityScale
                      * Math.sqrt(
                        pressureResponse.opacityScale
                        * pressureResponse.flowScale,
                      ),
                    )}
                    globalCompositeOperation={composite}
                    listening={false}
                  />
                ))}
              </Group>
            );
          }

          if (
            points.length === 2 &&
            singlePointRoute === "generic-dot"
            && !isPerfectAliasBrush
          ) {
            const { sourcePressure, width } = resolveStudioDrawTapMetrics({
              brush,
              brushFamily,
              mode: el.mode,
              pressures: el.pressures,
              materialPressureModel: el.materialPressureModel,
              materialMinimumDiameterRatio: el.materialMinimumDiameterRatio,
              aliasProfileEnabled,
              isPerfectAliasBrush,
              aliasStrokeWidth,
              includeRetainedPressure: true,
            });
            if (brushFamily === "highlighter") {
              const pressureBrush = isStudioFxPressureBrushId(brush)
                ? brush
                : "highlighter";
              const pressureResponse = resolveStudioFxBrushTapPressureResponse(
                pressureBrush,
                sourcePressure,
                el.materialPressureModel,
                el.materialMinimumDiameterRatio,
              );
              const tapWidth = aliasStrokeWidth * pressureResponse.widthScale;
              const washPlan = planStudioHighlighterWashTap({
                brushId: resolveStudioHighlighterWashBrushId(brush),
                x: points[0],
                y: points[1],
                width: tapWidth,
                opacityScale: pressureResponse.opacityScale,
              });
              return (
                <Shape
                  key={index}
                  sceneFunc={(context) => {
                    paintStudioDrawHighlighterWashTap(context, washPlan, stroke);
                  }}
                  opacity={opacity}
                  globalCompositeOperation="multiply"
                  listening={false}
                  perfectDrawEnabled={false}
                />
              );
            }
            if (brushFamily === "brush" || brushFamily === "calligraphy") {
              const calligraphyRoundness = brushFamily === "calligraphy"
                ? Math.min(1, Math.max(0.08, el.brushTip?.roundness ?? 0.35))
                : 0.36;
              const angle = brushFamily === "calligraphy"
                ? el.brushTip?.angleDeg ?? -30
                : -30;
              return (
                <Ellipse
                  key={index}
                  x={points[0]}
                  y={points[1]}
                  radiusX={Math.max(0.35, width / 2)}
                  radiusY={Math.max(0.35, width * calligraphyRoundness / 2)}
                  rotation={angle}
                  fill={stroke}
                  opacity={opacity}
                  globalCompositeOperation={composite}
                  listening={false}
                />
              );
            }
            if (perfectProfile) {
              const dotWidth = Math.max(Math.max(aliasStrokeWidth, 2), width);
              const minimumDotRadius = brush === "perfect-ink" ? 3 : 1.4;
              return (
                <KCircle
                  key={index}
                  x={points[0]}
                  y={points[1]}
                  radius={Math.max(minimumDotRadius, dotWidth / 2)}
                  fill={stroke}
                  opacity={opacity}
                  globalCompositeOperation={composite}
                  listening={false}
                />
              );
            }
            return (
              <KCircle
                key={index}
                x={points[0]}
                y={points[1]}
                radius={resolveStudioDrawTapRadius(activeDraft, Math.max(0.35, width / 2))}
                fill={stroke}
                opacity={opacity}
                globalCompositeOperation={composite}
                listening={false}
              />
            );
          }

          if (
            points.length <= 4 &&
            singlePointRoute === "generic-dot"
            && isCompactPerfectDotRoute
          ) {
            const { width } = resolveStudioDrawTapMetrics({
              brush,
              brushFamily,
              mode: el.mode,
              pressures: el.pressures,
              materialPressureModel: el.materialPressureModel,
              materialMinimumDiameterRatio: el.materialMinimumDiameterRatio,
              aliasProfileEnabled: el.mode !== "eraser",
              isPerfectAliasBrush,
              aliasStrokeWidth,
              includeRetainedPressure: false,
            });
            if (perfectProfile) {
              const dotWidth = Math.max(Math.max(aliasStrokeWidth, 2), width);
              const minimumDotRadius = brush === "perfect-ink" ? 3 : 1.4;
              return (
                <KCircle
                  key={index}
                  x={points[0]}
                  y={points[1]}
                  radius={Math.max(minimumDotRadius, dotWidth / 2)}
                  fill={stroke}
                  opacity={opacity}
                  globalCompositeOperation={composite}
                  listening={false}
                />
              );
            }
            return (
              <KCircle
                key={index}
                x={points[0]}
                y={points[1]}
                radius={resolveStudioDrawTapRadius(activeDraft, Math.max(0.35, width / 2))}
                fill={stroke}
                opacity={opacity}
                globalCompositeOperation={composite}
                listening={false}
              />
            );
          }

          {
            // 스탬프 엔진 계열(속도 잉크·정밀 에어브러시·그레인 연필·물맛 붓): 라이브 프리뷰와
            // 커밋이 같은 결정적 dab 시퀀스를 그린다 — 증분/재생/협업 복원에서 픽셀이 동일하다.
            if (stampKind) {
              return (
                <StudioStampDrawShape
                  key={index}
                  composite={composite}
                  el={el}
                  opacity={opacity}
                  renderSampleDistance={renderSampleDistance}
                  stampKind={stampKind}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                />
              );
            }
          }

          if (dynamicBrush && el.mode !== "eraser") {
            if (
              dynamicBrushPlanFailed
              || !dynamicBrushPlan
              || (
                dynamicBrushPlan.usesCausalDepositPlan
                && !dynamicCoverageMarkPlan?.ok
              )
            ) {
              return null;
            }
            const legacyMarks = dynamicCoverageAndLegacyMarkPlan?.legacyMarks ?? [];
            const commitRenderDebugEnabled =
              durableDocumentRender && isStudioDynamicSealDebugEnabled();
            const recordCommitRenderDebug = (
              branch: string,
              result: unknown,
            ): void => {
              recordStudioDynamicCommitRenderDebug({
                enabled: commitRenderDebugEnabled,
                elId: el.id,
                branch,
                result,
                coveragePlan: dynamicCoverageMarkPlan,
                legacyMarkCount: legacyMarks.length,
                opacity,
              });
            };
            return (
              <Shape
                key={index}
                sceneFunc={(context) => {
                  if (
                    dynamicCoverageMarkPlan?.ok
                    && isStudioBoundedFlowPaintModelCompatible(el)
                  ) {
                    const rendered = renderStudioDynamicBrushCoverage(
                      context,
                      dynamicCoverageMarkPlan.marks,
                      {
                        activeDraft,
                        opacity,
                        ...(durableDocumentRender
                          ? { committedCacheKey: el.id }
                          : {}),
                      },
                    );
                    recordCommitRenderDebug("bounded-flow-coverage", rendered);
                    // bounded-flow-v2 owns stroke opacity as one final coverage composite. A
                    // surface/budget failure must remain empty (or retain a partial prefix) rather
                    // than replaying marks with opacity on every dab, which would irreversibly
                    // darken overlaps and change the persisted paint model.
                    return;
                  }
                  // Only omitted/legacy paint models retain historical per-dab opacity pixels.
                  // A malformed causal mark plan is rejected before this Shape is constructed.
                  renderStudioDynamicBrushLegacyMarks(context, legacyMarks, opacity);
                  recordCommitRenderDebug("legacy-marks", null);
                }}
                globalCompositeOperation={composite}
                listening={false}
              />
            );
          }

          if (perfectProfile && el.mode !== "eraser") {
            const { debug, isVeryShortPerfectStroke, isSparseLongPerfectStroke } =
              evaluateStudioPerfectStrokeClassification({
                durableDocumentRender,
                brush,
                mode: el.mode,
                brushFamily,
                pointCount,
                strokeDistance,
                aliasStrokeWidth,
                perfectProfile,
                hasStroker: perfectStroker !== null,
              });
            if (isVeryShortPerfectStroke || isSparseLongPerfectStroke) {
              const perfectFallback = resolveStudioFreehandRenderPath(points, {
                sampleSpacing: el.sampleSpacing,
                acceptedTension: 0.32,
                legacyMinDistance: renderSampleDistance,
                legacyTension: 0.4,
              });
              const lineWidth = Math.max(aliasStrokeWidth, 2);
              const dotRadius = Math.max(2, lineWidth * 0.22);
              return (
                <Group key={index} opacity={opacity} listening={false}>
                  <Line
                    points={perfectFallback.points}
                    stroke={stroke}
                    strokeWidth={lineWidth}
                    lineCap="round"
                    lineJoin="round"
                    tension={perfectFallback.tension}
                    globalCompositeOperation={composite}
                    perfectDrawEnabled={false}
                    shadowForStrokeEnabled={false}
                  />
                  {perfectFallback.points.length >= 4 ? (
                    <>
                      <KCircle
                        x={perfectFallback.points[0]!}
                        y={perfectFallback.points[1]!}
                        radius={dotRadius}
                        fill={stroke}
                        opacity={opacity}
                        globalCompositeOperation={composite}
                        listening={false}
                      />
                      <KCircle
                        x={perfectFallback.points[perfectFallback.points.length - 2]!}
                        y={perfectFallback.points[perfectFallback.points.length - 1]!}
                        radius={dotRadius}
                        fill={stroke}
                        opacity={opacity}
                        globalCompositeOperation={composite}
                        listening={false}
                      />
                    </>
                  ) : null}
                </Group>
              );
            }
            if (perfectStroker) {
              const { pathData: perfectPathData, isDegeneratePerfectPath } =
                evaluateStudioPerfectOutlinePath({
                  stroker: perfectStroker,
                  brush,
                  brushFamily,
                  points,
                  pressures: el.pressures,
                  pointCount,
                  strokeDistance,
                  aliasStrokeWidth,
                  perfectProfile,
                  isVeryShortPerfectStroke,
                  isSparseLongPerfectStroke,
                  debug,
                });
              if (perfectPathData && !isDegeneratePerfectPath) {
                return (
                  <Path
                    key={index}
                    data={perfectPathData}
                    fill={stroke}
                    opacity={opacity}
                    globalCompositeOperation={composite}
                    listening={false}
                    perfectDrawEnabled={false}
                  />
                );
              }
            }
            // 스트로커 로드 전/지오메트리 부족 — 깨끗한 Line 폴백(로드 완료 시 훅 상태로 재렌더).
            const perfectFallback = resolveStudioFreehandRenderPath(points, {
              sampleSpacing: el.sampleSpacing,
              acceptedTension: 0.32,
              legacyMinDistance: renderSampleDistance,
              legacyTension: 0.4,
            });
            return (
              <Line
                key={index}
                points={perfectFallback.points}
                stroke={stroke}
                strokeWidth={aliasStrokeWidth}
                opacity={opacity}
                lineCap="round"
                lineJoin="round"
                tension={perfectFallback.tension}
                globalCompositeOperation={composite}
                listening={false}
                perfectDrawEnabled={false}
                shadowForStrokeEnabled={false}
              />
            );
          }

          if (brushFamily === "calligraphy" && el.mode !== "eraser") {
            const { smoothed, ribbon } = buildStudioCalligraphyDrawRibbon({
              el,
              brush,
              points,
              renderSampleDistance,
              aliasStrokeWidth,
            });
            return (
              <Shape
                key={index}
                sceneFunc={(context) => {
                  paintStudioDrawCalligraphyRibbon(
                    context,
                    ribbon,
                    smoothed,
                    aliasStrokeWidth,
                    stroke,
                  );
                }}
                opacity={opacity}
                globalCompositeOperation={composite}
                listening={false}
              />
            );
          }

          if (brushFamily === "brush" && el.mode !== "eraser") {
            const smoothed = resolveStudioFreehandRenderPath(points, {
              sampleSpacing: el.sampleSpacing,
              legacyMinDistance: renderSampleDistance,
              legacyTension: 0,
            }).points;
            const coveragePressureInput =
              resolveStudioAngledNibCoveragePressureInput({
                el,
                brush,
                opacity,
              });
            // 활성 초안은 요소 id 로 키된 증분 빌더가 세그먼트 폴리곤/밀도의 안정 prefix 를
            // 유지한다(장획 게이트 angled-ribbon; 톤 밴딩은 의도적 전역 설계라 매 호출 접는다).
            // 커밋 렌더는 배치 리플레이를 유지해 항상 정본을 그린다.
            const coveragePlan = activeDraft
              ? planStudioAngledNibStrokeLocalCoverageIncremental(
                  // 변형 인덱스로 키 격리 — 변형 간 내부 보관 배열 공유 금지(P2 리뷰).
                  `${el.id}#${index}`,
                  smoothed,
                  aliasStrokeWidth,
                  -Math.PI / 6,
                  coveragePressureInput,
                )
              : planStudioAngledNibStrokeLocalCoverage(
                  smoothed,
                  aliasStrokeWidth,
                  -Math.PI / 6,
                  coveragePressureInput,
                );
            // One band means the mark has no resolvable tonal range. That is the emission this
            // carrier has always had — one compound fill at the element's own opacity — and it
            // stays on the original code path, untouched, so saved documents replay to the byte.
            const tonal = coveragePlan.bands.length > 1;
            // The raster is normalised to the darkest band, so the mark's own peak alpha is
            // carried by the Shape and Konva applies it once — which is also what clamps an
            // overlap to the deepest band instead of letting two bands sum past it.
            const tonalOpacity = coveragePlan.bands[0]?.opacity ?? opacity;
            return (
              <Shape
                key={index}
                sceneFunc={(context, shape) => {
                  paintStudioDrawAngledNibCoverage(
                    context,
                    shape,
                    coveragePlan,
                    tonal,
                    stroke,
                  );
                }}
                fill={stroke}
                opacity={tonal ? tonalOpacity : opacity}
                globalCompositeOperation={composite}
                listening={false}
              />
            );
          }

          if (brushFamily === "watercolor" && el.mode !== "eraser") {
            const causalWatercolor = el.watercolorPipeline === "causal-walker-v2";
            const wetInkReplayPlan = planStudioInteractiveWetInkBrushReplay(
              { ...el, points },
              { phase: activeDraft ? "live" : "committed" },
            );
            const aliasPlanSettings = resolveStudioBrushAliasWatercolorPlanSettings(
              brush,
              strokeWidth,
            );
            const watercolorPressures = mapStudioBrushAliasPressureSamples(
              brush,
              el.pressures,
              Math.floor(points.length / 2),
              0.55,
            );
            const watercolorSeed = watercolorBrushSeedFromKey(el.id);
            // Legacy documents retain their fitted whole-stroke stations. New strokes use raw,
            // already-accepted samples and a residual arc-length cursor, so extending a prefix can
            // append pigment but can never move pigment that was already visible.
            const watercolorInput = {
              points: causalWatercolor
                ? points
                : processFreehandPoints(points, renderSampleDistance),
              pressures: watercolorPressures,
              baseWidth: aliasPlanSettings?.baseWidth ?? strokeWidth,
              spacing: aliasPlanSettings?.spacing,
              seed: watercolorSeed,
              // Causal stations do not redistribute at the cap, so they need the larger shared
              // bound. Legacy documents keep their historical 512-dab fit and exact old pixels.
              maxDabs: causalWatercolor
                ? DEFAULT_STUDIO_CAUSAL_WATERCOLOR_MAX_DABS
                : 512,
              // The endpoint cap belongs only to this replaceable active replay. Permanent causal
              // stations stay prefix-stable, while pointer-up no longer grows the visible stroke.
              previewEndpoint: causalWatercolor && activeDraft,
            };
            // 초안의 플래너·재질·carrier는 요소별 안정 prefix를 재사용한다. 갈필의 침착 표면은
            // 같은 재질 입력을 별도로 받으며, bloom·living-ink와 커밋은 기존 배치 경로를 쓴다.
            const liveWetWashPlan = causalWatercolor && activeDraft
              // 변형 인덱스로 키 격리 — 변형 간 내부 보관 배열 공유 금지(P2 리뷰).
              ? planStudioWetWashLivePipeline(`${el.id}#${index}`, {
                  brushId: brush,
                  enginePrograms: runtimeEnginePrograms,
                  input: watercolorInput,
                  carrierSeed: watercolorSeed,
                })
              : null;
            const plannedDabs = liveWetWashPlan
              ? liveWetWashPlan.dabs
              : causalWatercolor
                ? activeDraft
                  ? planCausalWatercolorBrushDabsIncremental(`${el.id}#${index}`, watercolorInput, false)
                  : planCausalWatercolorBrushDabs(watercolorInput, true)
                : planWatercolorBrushDabs(watercolorInput);
            // The stroke seed feeds the opt-in wet-edge-bloom lanes; SVG export passes the same
            // seed at its two watercolor sites so Canvas and SVG stay pixel-agreeing.
            // The phase gates only the opt-in living-ink settled bake (2026-08-13 wave 3): the
            // fluid field is global, so live drafts render the base wash and the bloom lands on
            // settle — SVG export is settled by definition and passes "settled" at both sites.
            //
            // 커스텀 프로그램 우선권과 정착 권위는 리졸버가 맡는다. 갈필은 초안·최종 대기 중에 같은
            // 침착 표면을 쓰고, 커밋의 전체 물리가 준비되면 최종 래스터로 바뀐다. 다른 레인은 기존 워시다.
            const settledSurface = liveWetWashPlan
              && resolveStudioWetPaperBakeProgramIdForBrush(brush, runtimeEnginePrograms) !== "chu-tai-dry-brush"
              ? null
              : resolveStudioWatercolorSettledSurface({
                  brush,
                  plannedDabs,
                  liveMaterialDabs: liveWetWashPlan?.dabs,
                  seed: watercolorSeed,
                  activeDraft,
                  durableDocumentRender,
                  enginePrograms: runtimeEnginePrograms,
                  color: stroke,
                  onBakeReady: notifyWetPaperReady,
                  bakeGeneration: livingInkBakeGeneration,
                  requester: `${bakeRequesterId}#${index}`,
                });
            const dabs = settledSurface?.dabs ?? liveWetWashPlan?.dabs ?? [];
            const wetRibbonPlan = liveWetWashPlan
              ? liveWetWashPlan.carrierPlan
              : causalWatercolor
                ? planStudioWetRibbonCarrier(dabs, { seed: watercolorSeed })
                : null;
            return (
              <Shape
                key={index}
                sceneFunc={(context) => {
                  if (wetInkReplayPlan?.ok) {
                    renderStudioWetInkBrushReplay(
                      context,
                      wetInkReplayPlan.value,
                      {
                        hidden: el.hidden === true,
                        expectedRevision: wetInkReplayPlan.value.revision,
                        currentRevision: wetInkReplayPlan.value.revision,
                      },
                    );
                    // A selected wet-ink replay never changes renderer after execution starts.
                    return;
                  }
                  if (settledSurface?.wetPaperBake) {
                    drawStudioWetPaperBake(context, settledSurface.wetPaperBake, opacity);
                    return;
                  }
                  // Ineligible/legacy snapshots select the compatibility renderer before execution.
                  if (dabs.length === 0) return;
                  context.save();
                  if (wetRibbonPlan) {
                    // The v2 fail-closed carrier is a connected, direction-following ribbon. Its
                    // four pigment bands soften the wet edge without exposing repeated circles.
                    for (const batch of wetRibbonPlan.batches) {
                      context.globalAlpha = Math.min(
                        1,
                        Math.max(0, batch.opacity * opacity),
                      );
                      context.beginPath();
                      traceStudioWetRibbonCarrierBatch(context, batch);
                      context.fillStyle = stroke;
                      context.fill();
                    }
                    context.restore();
                    return;
                  }
                  for (const dab of dabs) {
                    paintStudioDrawWatercolorDab(context, dab, stroke, opacity);
                  }
                  context.restore();
                }}
                globalCompositeOperation={composite}
                listening={false}
              />
            );
          }

          if (brushFamily === "screentone" && el.mode !== "eraser") {
            // 스크린톤: 전역 격자에 정렬된 망점 도트를 스트로크 경로에 찍는다(겹쳐도 패턴 유지).
            // 활성 초안은 요소 id 로 키된 증분 빌더가 도장 워크의 안정 prefix 를 유지한다
            // (이동당 새 표본 비례 — 장획 게이트 stamp-tone). 커밋 렌더는 배치를 유지한다.
            const pitch = Math.max(3, aliasStrokeWidth * 0.42);
            const radius = Math.max(2, aliasStrokeWidth / 2);
            const dots = activeDraft
              // 변형 인덱스로 키 격리 — 변형 간 내부 보관 배열 공유 금지(P2 리뷰).
              ? screentoneDotsForStrokeIncremental(`${el.id}#${index}`, points, radius, pitch)
              : screentoneDotsForStroke(points, radius, pitch);
            const dotR = screentoneDotRadius(pitch);
            return (
              <Shape
                key={index}
                sceneFunc={(context, shape) => {
                  paintStudioDrawScreentoneDots(context, shape, dots, dotR);
                }}
                fill={stroke}
                opacity={opacity}
                globalCompositeOperation={composite}
                listening={false}
              />
            );
          }

          if (brushFamily === "pencil" && el.mode !== "eraser") {
            const renderPath = resolveStudioFreehandRenderPath(points, {
              sampleSpacing: el.sampleSpacing,
              acceptedTension: 0.18,
              legacyMinDistance: renderSampleDistance,
              legacyTension: 0.2,
            });
            if (
              el.materialPressureModel
              !== STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1
            ) {
              // A pointerdown that never travelled has no polyline to stroke: a one-coordinate
              // `<Line>` only emits a `moveTo`. Legacy documents therefore need the same contact
              // dot the canonical ribbon plans below, or a tap reads as an unresponsive canvas.
              const legacyTapDab = planStudioRetainedMediaTapDab(
                renderPath.points,
                undefined,
                "pencil",
              );
              if (aliasPencilPasses.length > 0) {
                return (
                  <Group key={index} opacity={opacity} listening={false}>
                    {aliasPencilPasses.map((pass, passIndex) => {
                      const passWidth = Math.max(
                        0.5,
                        aliasStrokeWidth * pass.widthScale,
                      );
                      return legacyTapDab ? (
                        <KCircle
                          key={`${pass.role}-${passIndex}`}
                          x={legacyTapDab.x}
                          y={legacyTapDab.y}
                          radius={resolveStudioDrawTapRadius(
                            activeDraft,
                            Math.max(0.25, passWidth / 2),
                          )}
                          fill={stroke}
                          opacity={pass.opacityScale}
                          globalCompositeOperation={composite}
                          listening={false}
                        />
                      ) : (
                        <Line
                          key={`${pass.role}-${passIndex}`}
                          points={studioPencilAliasPassPoints(
                            renderPath.points,
                            pass.jitterRadius,
                          )}
                          stroke={stroke}
                          strokeWidth={passWidth}
                          opacity={pass.opacityScale}
                          lineCap="round"
                          lineJoin="round"
                          tension={renderPath.tension}
                          globalCompositeOperation={composite}
                          listening={false}
                        />
                      );
                    })}
                  </Group>
                );
              }
              return legacyTapDab ? (
                <KCircle
                  key={index}
                  x={legacyTapDab.x}
                  y={legacyTapDab.y}
                  radius={resolveStudioDrawTapRadius(
                    activeDraft,
                    Math.max(0.25, strokeWidth / 2),
                  )}
                  fill={stroke}
                  opacity={opacity}
                  globalCompositeOperation={composite}
                  listening={false}
                />
              ) : (
                <Line
                  key={index}
                  points={processPencilPoints(renderPath.points)}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  opacity={opacity}
                  lineCap="round"
                  lineJoin="round"
                  tension={renderPath.tension}
                  globalCompositeOperation={composite}
                  listening={false}
                />
              );
            }
            const pressureProfile = resolveStudioRetainedMediaPressureProfileId(brush)
              ?? "pencil";
            const passes = aliasPencilPasses.length > 0
              ? aliasPencilPasses
              : [STUDIO_PENCIL_DEFAULT_ALIAS_PASS];
            // Detected on the accepted geometry, never on the per-pass grain jitter: a tap whose
            // samples the jitter has nudged apart would otherwise be planned as a sub-pixel ribbon
            // sliver instead of the nib the user pressed down, and read as an unresponsive canvas.
            const tapDab = planStudioRetainedMediaTapDab(
              renderPath.points,
              el.pressures,
              pressureProfile,
              { minimumDiameterRatio: el.materialMinimumDiameterRatio },
            );
            if (tapDab) {
              return (
                <Group key={index} opacity={opacity} listening={false}>
                  {passes.map((pass, passIndex) => (
                    <KCircle
                      key={`${pass.role}-${passIndex}`}
                      x={tapDab.x}
                      y={tapDab.y}
                      radius={resolveStudioDrawTapRadius(
                        activeDraft,
                        Math.max(
                          0.35,
                          Math.max(0.5, aliasStrokeWidth * pass.widthScale)
                          * tapDab.sizeScale
                          / 2,
                        ),
                      )}
                      fill={stroke}
                      opacity={Math.min(
                        1,
                        pass.opacityScale
                        * Math.sqrt(tapDab.opacityScale * tapDab.flowScale),
                      )}
                      globalCompositeOperation={composite}
                      listening={false}
                    />
                  ))}
                </Group>
              );
            }
            const passPlans = buildStudioPencilPassPlans({
              passes,
              points: renderPath.points,
              pressures: el.pressures,
              materialPressureModel: el.materialPressureModel,
              materialMinimumDiameterRatio: el.materialMinimumDiameterRatio,
              tension: renderPath.tension,
              pressureProfile,
              aliasStrokeWidth,
            });
            return (
              <Shape
                key={index}
                sceneFunc={(context) => {
                  paintStudioDrawPencilRibbonPasses(context, passPlans, stroke);
                }}
                opacity={opacity}
                globalCompositeOperation={composite}
                listening={false}
                perfectDrawEnabled={false}
              />
            );
          }

          if (brushFamily === "highlighter" && el.mode !== "eraser") {
            const washPlan = buildStudioHighlighterDrawWashPlan({
              el,
              brush,
              points,
              renderSampleDistance,
              aliasStrokeWidth,
            });
            return (
              <Shape
                key={index}
                sceneFunc={(context) => {
                  paintStudioDrawHighlighterWashRibbon(context, washPlan, stroke);
                }}
                opacity={opacity}
                globalCompositeOperation="multiply"
                listening={false}
                perfectDrawEnabled={false}
              />
            );
          }

          if (
            (brushFamily === "neon" || brushFamily === "glow")
            && el.mode !== "eraser"
          ) {
            const luminousPlan = planStudioLuminousBrushRender({
              family: brushFamily,
              el,
              points,
              stroke,
              strokeWidth,
              renderSampleDistance,
              activeDraft,
              symmetryVariationCount: symmetricVariations.length,
            });
            if (!luminousPlan.isCanonicalPressure) {
              return (
                <Group key={index} opacity={opacity} listening={false}>
                  {luminousPlan.passes.map((pass) =>
                    luminousPlan.points.length === 2 ? (
                      <KCircle
                        key={pass.passIndex}
                        x={luminousPlan.points[0]}
                        y={luminousPlan.points[1]}
                        radius={pass.legacyTapRadius}
                        fill={pass.passColor}
                        opacity={pass.opacity}
                        globalCompositeOperation={STUDIO_FX_LUMINOUS_COMPOSITE_OPERATION}
                        listening={false}
                      />
                    ) : (
                      <Line
                        key={pass.passIndex}
                        points={luminousPlan.points}
                        stroke={pass.passColor}
                        strokeWidth={pass.legacyLineWidth}
                        opacity={pass.opacity}
                        lineCap="round"
                        lineJoin="round"
                        tension={luminousPlan.tension}
                        globalCompositeOperation={STUDIO_FX_LUMINOUS_COMPOSITE_OPERATION}
                        listening={false}
                      />
                    ),
                  )}
                </Group>
              );
            }
            return (
              <Group key={index} opacity={opacity} listening={false}>
                {luminousPlan.passes.map((pass) =>
                  luminousPlan.points.length === 2 ? (
                    <KCircle
                      key={pass.passIndex}
                      x={luminousPlan.points[0]}
                      y={luminousPlan.points[1]}
                      radius={pass.canonicalTapRadius}
                      fill={pass.passColor}
                      opacity={pass.canonicalTapOpacity}
                      globalCompositeOperation={STUDIO_FX_LUMINOUS_COMPOSITE_OPERATION}
                      listening={false}
                    />
                  ) : (
                    <Shape
                      key={pass.passIndex}
                      sceneFunc={(context) => {
                        const producer = activeDraft
                          ? fxPressurePathBuilderForVariation(index)
                          : null;
                        const retained = producer
                          ? fxLuminousRetainedPass(
                              index,
                              pass.passIndex,
                              luminousPlan.retainLuminousPasses,
                            )
                          : null;
                        paintStudioDrawLuminousRibbonPass(context, {
                          brushId: luminousPlan.brushId,
                          points: luminousPlan.points,
                          pressures: el.pressures,
                          pressureModel: el.materialPressureModel,
                          minimumDiameterRatio: el.materialMinimumDiameterRatio,
                          tension: luminousPlan.tension,
                          baseWidth: strokeWidth,
                          passWidthScale: pass.widthScale,
                          passOpacity: pass.opacity,
                          passColor: pass.passColor,
                          luminousCore: pass.luminousCore,
                          producer,
                          retained,
                        });
                      }}
                      globalCompositeOperation={STUDIO_FX_LUMINOUS_COMPOSITE_OPERATION}
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                  ),
                )}
              </Group>
            );
          }

          if (brushFamily === "glitter" && el.mode !== "eraser") {
            const particles = buildStudioGlitterBrushParticles({
              el,
              points,
              renderSampleDistance,
              aliasStrokeWidth,
            });
            return (
              <Shape
                key={index}
                sceneFunc={(context) => {
                  paintStudioDrawGlitterParticles(
                    context,
                    particles,
                    stroke,
                    opacity,
                  );
                }}
                globalCompositeOperation={STUDIO_FX_LUMINOUS_COMPOSITE_OPERATION}
                listening={false}
              />
            );
          }

          if (brushFamily === "oil" && el.mode !== "eraser") {
            const oilPlanInput = buildStudioOilBrushPlanInput({
              el,
              brush,
              points,
              renderSampleDistance,
              aliasStrokeWidth,
            });
            // 활성 초안만 요소 id 로 키된 증분 플래너를 쓴다. 대브 베드와 캐리어 모두 이동당
            // 전체를 다시 세우고 있었고(2906-대브 베드 기준 캐리어만 14.6ms), 두 플래너 모두
            // 스스로 검증한 접두만 재사용하므로 플랜은 배치와 바이트 동일하다. 커밋 렌더는
            // 배치 리플레이를 유지해 내부 점 재작성에도 항상 정본을 그린다. 대칭 변형은 같은
            // 요소를 변형된 점 배열로 여러 번 그리므로 변형 인덱스를 획 키에 포함한다.
            const dabs = oilDraftPlannersRetained
              ? planOilBrushDabsIncremental(el.id, index, oilPlanInput)
              : planOilBrushDabs(oilPlanInput);
            // 유화 기계 프로그램의 정본은 studioOilRibbonProgramsForBrush 의 id 매트릭스다. 아래는 그 요약이며
            // 매트릭스를 고치면 같이 고친다 — "bristle-physics 레인만 시뮬" 이던 2026-08-13 wave 3 서술이 확장
            // 뒤에도 남아 브러시 통합 검토를 오도한 전례가 있다. 2026-09-02 기준:
            // - WetBrush-2D 강모 물리 시뮬(bristlePhysics): brush--bristle-physics · oil--filbert-ribbon ·
            //   oil--impasto-ribbon · 기본 유화 2종(oil · acrylic). 2026-08-13 wave 3 에는 bristle-physics
            //   전용이었고 2026-08-15 에 filbert·impasto-ribbon, 2026-08-20 에 기본 유화로 확장됐다(그때
            //   함께 들어온 미출하 id — fluid-paint 4종·oil--fluid-paint-* 2행 — 은 2026-09-02 에 제거).
            // - v1 강모 고갈 다이내믹(bristleLoadDynamics, 갈필): brush--bristle-physics ·
            //   brush--bristle-depletion · 기본 유화 2종.
            // - dli GGX 릴리프 오버레이(impastoRelief): brush--impasto-relief · oil--impasto-ribbon · 기본 유화 2종.
            // 고유한 것은 조합이다: 고갈만 = bristle-depletion, 시뮬만 = filbert-ribbon, 릴리프만 =
            // impasto-relief, 시뮬+고갈(릴리프 없음) = bristle-physics, 시뮬+릴리프(고갈 없음) = impasto-ribbon,
            // 셋 다 = 기본 유화 2종. 매트릭스 밖의 유화 브러시는 캐리어 계약상 바이트 동일 플랜을 유지하고,
            // 저장된 브러시의 프로그램 세트(brushEnginePrograms.oil)는 매트릭스를 병합이 아니라 대체한다.
            // SVG 내보내기의 유화 분기와 입력(대브·시드)이 같아 두 렌더러가 픽셀 일치한다. 라이브 retained
            // 오버레이(studio-live-retained-media-overlay)는 같은 매트릭스를 부르지만 대브 입력(원시 점·
            // 비alias 폭)이 달라 이 패리티 주장의 범위 밖이다.
            const oilPrograms = studioOilRibbonProgramsForBrush(
              brush,
              fxBrushSeedFromKey(el.id),
              runtimeEnginePrograms?.oil,
            );
            const carrier = oilDraftPlannersRetained
              ? planStudioOilRibbonCarrierIncremental(el.id, index, dabs, oilPrograms)
              : planStudioOilRibbonCarrier(dabs, oilPrograms);
            return (
              <Shape
                key={index}
                sceneFunc={(context) => {
                  // oil--gpu-bristle 레인은 GPU bitmap만 픽셀 권한을 가진다. drawing-draft와
                  // document는 같은 Worker 상태를 이어 쓰고, renderer-local transform-draft는
                  // 새 비동기 작업을 시작하지 않는다. 요청 생성 실패, pending, unsupported,
                  // Worker/WebGPU decline은 source를 보존하고 Canvas carrier로 전환하지 않는다.
                  const gpuBristleSelected = brush?.startsWith(
                    STUDIO_GPU_BRISTLE_BRUSH_ID_PREFIX,
                  ) ?? false;
                  const gpuBristle = gpuBristleSelected && (durableDocumentRender || activeDraft)
                    ? studioGpuBristleOilRequest(el.id, brush, dabs, opacity, stroke)
                    : null;
                  if (gpuBristleSelected) {
                    if (!gpuBristle) return;
                    const overlay = requestStudioGpuBristleOverlay(
                      gpuBristle,
                      notifyGpuBristleReady,
                      gpuBristleGeneration,
                    );
                    if (!overlay) return;
                    context.drawImage(
                      overlay.bitmap,
                      overlay.dx,
                      overlay.dy,
                      overlay.dw,
                      overlay.dh,
                    );
                    return;
                  }
                  const paintInput = buildStudioOilRibbonPaintInput(
                    carrier,
                    stroke,
                    opacity,
                    dabs,
                  );
                  if (activeDraft) {
                    paintStudioOilRibbonCarrierIncremental(context, {
                      ...paintInput,
                      incrementalKey: el.id,
                    });
                    return;
                  }
                  paintStudioOilRibbonCarrier(context, paintInput);
                }}
                hitFunc={(context, shape) => {
                  paintStudioOilRibbonHit(context, carrier, shape);
                }}
                globalCompositeOperation={composite}
                listening={false}
              />
            );
          }

          if (brushFamily === "pastel" && el.mode !== "eraser") {
            const dabs = planPastelBrushDabs({
              points: resolveStudioFreehandRenderPath(points, {
                sampleSpacing: el.sampleSpacing,
                legacyMinDistance: renderSampleDistance,
                legacyTension: 0,
              }).points,
              pressures: el.pressures,
              baseWidth: aliasStrokeWidth,
              seed: fxBrushSeedFromKey(el.id),
              maxDabs: FX_PASTEL_DAB_CAP,
            });
            return (
              <Shape
                key={index}
                sceneFunc={(context) => {
                  paintStudioDrawPastelDabs(context, dabs, stroke, opacity);
                }}
                globalCompositeOperation={composite}
                listening={false}
              />
            );
          }

          // Default "pen" or "marker" or "eraser"
          // 라쏘 브러시: fill 이 설정된 프리핸드(라쏘 필)는 궤적을 자동으로 닫아 내부를
          // 현재 색으로 채운다. 라이브 초안도 같은 경로를 지나므로 그리는 동안 채움이 미리 보인다.
          const freehandFill = el.mode !== "eraser" ? el.fill : undefined;
          if ((el.sampleSpacing !== undefined || el.pressureModel !== undefined) && !freehandFill) {
            const causalContract = resolveStudioCausalInkDrawContract(el, points);
            return (
              <Shape
                key={index}
                sceneFunc={(context) => {
                  if (causalContract.composite !== "source-over") {
                    context.globalCompositeOperation = causalContract.composite;
                  }
                  drawStudioCausalInkContract(context, causalContract);
                }}
                opacity={causalContract.opacity}
                globalCompositeOperation={causalContract.composite}
                listening={false}
                perfectDrawEnabled={false}
                shadowForStrokeEnabled={false}
              />
            );
          }
          const renderPath = resolveStudioFreehandRenderPath(points, {
            sampleSpacing: el.sampleSpacing,
            legacyMinDistance: renderSampleDistance,
            legacyTension: 0.4,
          });
          const smoothed = renderPath.points;
          const pressures = el.pressures;
          if (pressures && pressures.length > 0 && smoothed.length >= 4) {
            const aliasPressures = aliasProfileEnabled
              ? mapStudioBrushAliasPressureSamples(
                  brush,
                  pressures,
                  Math.floor(points.length / 2),
                  0.5,
                )
              : pressures;
            const sampledPressures = resampleStrokePressures(
              aliasPressures,
              Math.floor(smoothed.length / 2),
            );
            return (
              <Shape
                key={index}
                sceneFunc={(context) => {
                  paintStudioDrawFreehandPenStroke(context, {
                    smoothed,
                    sampledPressures,
                    stroke,
                    aliasStrokeWidth,
                    composite,
                    freehandFill,
                  });
                }}
                opacity={opacity}
                globalCompositeOperation={composite}
                listening={false}
                perfectDrawEnabled={false}
                shadowForStrokeEnabled={false}
              />
            );
          }

          return (
            <Line
              key={index}
              points={smoothed}
              stroke={stroke}
              strokeWidth={aliasStrokeWidth}
              opacity={opacity}
              lineCap="round"
              lineJoin="round"
              tension={renderPath.tension}
              closed={Boolean(freehandFill) && smoothed.length >= 6}
              fill={freehandFill}
              globalCompositeOperation={composite}
              listening={false}
              perfectDrawEnabled={false}
              shadowForStrokeEnabled={false}
            />
          );
        }

        // 직선("line") — 점선/선 끝 스타일 + 시작/끝 화살촉(삼각형·점)을 함께 그린다.
        const lineHeads = lineArrowHeadGeoms(points, strokeStyle, strokeWidth);
        return (
          <Group key={index} opacity={opacity} listening={false}>
            <Line
              points={points}
              stroke={stroke}
              strokeWidth={strokeWidth}
              dash={shapeDash}
              lineCap={strokeStyle.lineCap}
              lineJoin="round"
              globalCompositeOperation={composite}
              listening={false}
            />
            {lineHeads.map((head, headIndex) =>
              head.kind === "dot" ? (
                <KCircle
                  key={headIndex}
                  x={head.cx}
                  y={head.cy}
                  radius={head.r}
                  fill={stroke}
                  globalCompositeOperation={composite}
                  listening={false}
                />
              ) : (
                <Line
                  key={headIndex}
                  points={head.points}
                  closed
                  fill={stroke}
                  lineJoin="round"
                  globalCompositeOperation={composite}
                  listening={false}
                />
              )
            )}
          </Group>
        );
      })}
    </Group>
  );
});
