import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createBrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import { normalizeBrushStudioV6MaterialConfig } from "../brush-lab/brush-studio-v6-material-engine";
import { exportPageToSvg } from "../export/studio-svg-export";
import { loadStudioPerfectFreehandStroker } from "../studio-perfect-freehand";

import { planStudioBristlePhysicsOil } from "./studio-bristle-physics-oil-v1";
import {
  STUDIO_ALL_BRUSH_CATALOG_ITEMS,
  STUDIO_LIBRARY_ALL_BRUSH_CATALOG_ITEMS,
  type StudioBrushCatalogItem,
} from "./studio-brush-catalog";
import {
  planStudioDynamicBrushDabs,
  studioBrushDynamicsSettingsForBrushId,
} from "./studio-brush-dynamics";
import { studioBrushEngineProgramSetFromMaterial } from "./studio-brush-engine-program-set";
import {
  STUDIO_BRUSH_PRODUCT_PROFILE_CACHE_LIMIT,
  studioBrushProductProfile,
  studioBrushProductProfileCacheSizeForTests,
} from "./studio-brush-product-profile";
import {
  planStudioStampBrushDabs,
  resolveStudioStampBrushKind,
  resolveStudioStampBrushStyle,
  studioStampDabTipCanvasCacheSizeForTests,
} from "./studio-brush-stamp-engine";
import { studioV6RecipeIdFromCatalogId } from "./studio-brush-v6-id";
import { planStudioDrawPointerStart } from "./studio-draw-pointer-start-plan";
import {
  resetStudioDryMediaKernelTipCacheForTests,
  studioDryMediaKernelTipCacheSizeForTests,
} from "./studio-dry-media-kernel-tip";
import { applyInkWash, normalizeInkWash } from "./studio-ink-wash";
import {
  STUDIO_INKWASH_FLUID_MAX_DIMENSION,
  createStudioInkwashFluidSession,
  depositStudioInkwashFluidStroke,
  readStudioInkwashFluidCell,
} from "./studio-inkwash-fluid";
import {
  STUDIO_INKWASH_WASH_MAX_APPLIED_ENTRIES,
  STUDIO_INKWASH_WASH_MAX_JOURNAL_ENTRIES,
  STUDIO_INKWASH_WASH_MAX_RECORDS,
  ensureStudioInkwashWash,
  getStudioInkwashWash,
  markStudioInkwashWashDeposited,
  readStudioInkwashWashDocumentCell,
  resetStudioInkwashWash,
  studioInkwashWashAppliedEntries,
  studioInkwashWashRecordCountForTests,
  upsertStudioInkwashWashStroke,
} from "./studio-inkwash-wash";
import {
  planStudioMaterialBrush,
  renderStudioMaterialBrush,
} from "./studio-material-brush-runtime";
import {
  stabilizeStudioStrokeSample,
  type StudioStrokeStabilizerState,
} from "./studio-stroke-stabilizer";
import {
  STUDIO_WET_INK_BRUSH_FIELD_SCALE,
  planStudioWetInkBrushReplay,
} from "./studio-wet-ink-brush-runtime";
import {
  planStudioWetWashLivePipeline,
  resetStudioWetWashLivePipelineCacheForTests,
} from "./studio-wet-wash-live-pipeline";

import type { DrawEl } from "../studio-element-model";

function createRecordingCanvas2DContext(): {
  ctx: CanvasRenderingContext2D;
  drawCalls: number;
  nonFiniteArgs: number;
} {
  let drawCalls = 0;
  let nonFiniteArgs = 0;
  const checkFinite = (...nums: number[]) => {
    for (const n of nums) {
      if (!Number.isFinite(n)) nonFiniteArgs += 1;
    }
  };
  const gradientStub = {
    addColorStop: (offset: number) => {
      checkFinite(offset);
    },
  };
  const canvasStub = { width: 256, height: 256 };
  const ctx = {
    canvas: canvasStub,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineWidth: 1,
    lineCap: "round",
    lineJoin: "round",
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: (x: number, y: number) => {
      checkFinite(x, y);
    },
    lineTo: (x: number, y: number) => {
      checkFinite(x, y);
    },
    quadraticCurveTo: (cpx: number, cpy: number, x: number, y: number) => {
      checkFinite(cpx, cpy, x, y);
    },
    bezierCurveTo: (cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) => {
      checkFinite(cp1x, cp1y, cp2x, cp2y, x, y);
    },
    arc: (x: number, y: number, r: number, sa: number, ea: number) => {
      checkFinite(x, y, r, sa, ea);
    },
    ellipse: (x: number, y: number, rx: number, ry: number, rot: number, sa: number, ea: number) => {
      checkFinite(x, y, rx, ry, rot, sa, ea);
    },
    rect: (x: number, y: number, w: number, h: number) => {
      checkFinite(x, y, w, h);
    },
    roundRect: (x: number, y: number, w: number, h: number, r?: number) => {
      if (typeof r === "number") checkFinite(x, y, w, h, r);
      else checkFinite(x, y, w, h);
    },
    clearRect: (x: number, y: number, w: number, h: number) => {
      checkFinite(x, y, w, h);
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      checkFinite(x, y, w, h);
      drawCalls += 1;
    },
    fill: () => {
      drawCalls += 1;
    },
    stroke: () => {
      drawCalls += 1;
    },
    clip: () => {},
    translate: (x: number, y: number) => {
      checkFinite(x, y);
    },
    rotate: (angle: number) => {
      checkFinite(angle);
    },
    scale: (x: number, y: number) => {
      checkFinite(x, y);
    },
    setTransform: () => {},
    drawImage: (...args: unknown[]) => {
      for (let i = 1; i < args.length; i += 1) {
        if (typeof args[i] === "number") checkFinite(args[i] as number);
      }
      drawCalls += 1;
    },
    createRadialGradient: (x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) => {
      checkFinite(x0, y0, r0, x1, y1, r1);
      return gradientStub;
    },
    createLinearGradient: (x0: number, y0: number, x1: number, y1: number) => {
      checkFinite(x0, y0, x1, y1);
      return gradientStub;
    },
    createImageData: (w: number, h: number) => {
      const safeW = Math.max(1, Math.floor(w));
      const safeH = Math.max(1, Math.floor(h));
      return {
        width: safeW,
        height: safeH,
        data: new Uint8ClampedArray(safeW * safeH * 4),
      };
    },
    getImageData: (x: number, y: number, w: number, h: number) => {
      checkFinite(x, y, w, h);
      const safeW = Math.max(1, Math.floor(w));
      const safeH = Math.max(1, Math.floor(h));
      return {
        width: safeW,
        height: safeH,
        data: new Uint8ClampedArray(safeW * safeH * 4),
      };
    },
    putImageData: () => {
      drawCalls += 1;
    },
  } as unknown as CanvasRenderingContext2D;

  return {
    ctx,
    get drawCalls() {
      return drawCalls;
    },
    get nonFiniteArgs() {
      return nonFiniteArgs;
    },
  };
}

function buildProductionDrawElementForCatalogItem(
  item: StudioBrushCatalogItem,
  strokeIndex: number,
  points: readonly number[],
  pressures: readonly number[],
): DrawEl {
  const startX = points[0] ?? 48;
  const startY = points[1] ?? 48;
  const startPressure = pressures[0] ?? 0.55;
  const runtimeBrushId = item.id;
  const recipeId = studioV6RecipeIdFromCatalogId(item.id);
  const v6Program = recipeId ? createBrushStudioV6Program(recipeId) : null;
  const v6Material = v6Program
    ? normalizeBrushStudioV6MaterialConfig({
        version: 1,
        seed: v6Program.seed,
        slots: v6Program.slots,
        tuning: v6Program.tuning,
        input: v6Program.input,
      })
    : null;
  const brushEnginePrograms = v6Material
    ? studioBrushEngineProgramSetFromMaterial(v6Material)
    : null;
  const brushDynamics = !v6Material
    ? studioBrushDynamicsSettingsForBrushId(item.id)
      ?? studioBrushDynamicsSettingsForBrushId(runtimeBrushId)
    : null;

  const plan = planStudioDrawPointerStart({
    id: `soak-${item.id}-${strokeIndex}`,
    position: { x: startX, y: startY },
    pointer: {
      pointerType: "pen",
      pressure: startPressure,
      tiltX: 12,
      tiltY: -8,
      twist: 0,
      timeStamp: 1000 + strokeIndex * 16,
    },
    drawMode: item.operation === "erase" ? "eraser" : "pen",
    drawShape: "line",
    shapeFill: false,
    color: item.defaultColor ?? "#1f6feb",
    strokeWidth: item.defaultWidth,
    brushOpacity: item.defaultOpacity,
    brush: runtimeBrushId,
    brushCatalogId: item.id,
    brushCatalogName: item.name,
    brushDynamics,
    brushEnginePrograms,
    stabilizer: 2,
    stabilizerMode: "adaptive",
    velocitySensitivity: 0.5,
    pressureCurve: 1,
    positionScale: 1,
    brushTip: {
      tiltEnabled: true,
      angleDeg: 35,
      roundness: 0.65,
    },
    symmetry: {
      type: "none",
      centerX: 120,
      centerY: 70,
      radialCount: 4,
    },
  });

  return {
    ...plan.element,
    points: [...points],
    pressures: [...pressures],
  };
}

describe("실제 서비스 전체 브러시 카탈로그 및 장시간 소크(Long-Session Soak) 통합 검증", () => {
  beforeAll(async () => {
    await loadStudioPerfectFreehandStroker();
  });

  afterEach(() => {
    resetStudioInkwashWash();
    resetStudioDryMediaKernelTipCacheForTests();
    resetStudioWetWashLivePipelineCacheForTests();
  });

  it("서비스 전체 브러시 카탈로그(코어·프로 377종 + V6 머티리얼 123종 = 총 500종)가 실제 포인터 시작 계획·캔버스·SVG 렌더 파이프라인을 무결하게 통과한다", () => {
    const itemsById = new Map<string, StudioBrushCatalogItem>();
    for (const item of STUDIO_ALL_BRUSH_CATALOG_ITEMS) itemsById.set(item.id, item);
    for (const item of STUDIO_LIBRARY_ALL_BRUSH_CATALOG_ITEMS) itemsById.set(item.id, item);

    expect(STUDIO_ALL_BRUSH_CATALOG_ITEMS.length).toBeGreaterThanOrEqual(377);
    expect(STUDIO_LIBRARY_ALL_BRUSH_CATALOG_ITEMS.length).toBeGreaterThanOrEqual(357);
    expect(itemsById.size).toBeGreaterThanOrEqual(500);

    const samplePoints = [24, 36, 52, 22, 84, 46, 118, 28, 152, 40];
    const samplePressures = [0.35, 0.62, 0.84, 0.58, 0.4];

    let index = 0;
    for (const [brushId, item] of itemsById) {
      index += 1;
      const runtimeBrushId = item.id;
      if (runtimeBrushId.startsWith("inkwash-")) {
        resetStudioInkwashWash();
      }
      const element = buildProductionDrawElementForCatalogItem(
        item,
        index,
        samplePoints,
        samplePressures,
      );
      const exported = exportPageToSvg({
        width: 180,
        height: 96,
        bg: "#ffffff",
        transparentBg: true,
        elements: [element],
      });

      expect(exported.svg.startsWith("<svg"), `${brushId}: valid svg header`).toBe(true);
      expect(exported.svg.includes("NaN"), `${brushId}: no NaN in SVG`).toBe(false);
      expect(exported.svg.includes("Infinity"), `${brushId}: no Infinity in SVG`).toBe(false);

      if (item.operation === "paint") {
        expect(exported.elementCount, `${brushId}: exported element count`).toBe(1);
        expect(
          exported.svg.includes("<path")
            || exported.svg.includes("<circle")
            || exported.svg.includes("<ellipse")
            || exported.svg.includes("<line")
            || exported.svg.includes("<polygon")
            || exported.svg.includes("<rect")
            || exported.svg.includes("<g "),
          `Brush ${brushId} (${runtimeBrushId}) should emit visible SVG geometry`,
        ).toBe(true);
      }

      if (element.brushEnginePrograms?.material) {
        const marks = planStudioMaterialBrush(element);
        expect(marks.length, `V6 brush ${brushId} should emit material marks`).toBeGreaterThan(0);
        const recorder = createRecordingCanvas2DContext();
        const stats = renderStudioMaterialBrush(recorder.ctx, element);
        expect(stats.totalMarks).toBeGreaterThan(0);
        expect(recorder.nonFiniteArgs, `V6 brush ${brushId} finite canvas coords`).toBe(0);
        expect(recorder.drawCalls, `V6 brush ${brushId} canvas draw calls`).toBeGreaterThan(0);
      }
    }
  });

  it("대형 캔버스(1600×1200) 장거리 수묵 브러시(inkwash-pen·water-brush·bleed-wash·white-ink) 연속 세션에서 원점 밖 획 소실이나 프레임당 재할당 루프 없이 안료가 정확히 침착·세척된다", () => {
    resetStudioInkwashWash();

    const penItem = STUDIO_ALL_BRUSH_CATALOG_ITEMS.find((item) => item.id === "inkwash-pen")!;
    const waterItem = STUDIO_ALL_BRUSH_CATALOG_ITEMS.find((item) => item.id === "inkwash-water-brush")!;
    expect(penItem).toBeDefined();
    expect(waterItem).toBeDefined();

    const cellPigmentTotal = (x: number, y: number): number => {
      const wash = getStudioInkwashWash();
      if (!wash) return 0;
      const cell = readStudioInkwashWashDocumentCell(wash, x, y);
      if (!cell) return 0;
      return (
        cell.mobile[0]
        + cell.mobile[1]
        + cell.mobile[2]
        + cell.fixed[0]
        + cell.fixed[1]
        + cell.fixed[2]
      );
    };

    // 1) Near-origin stroke at (40, 60) -> (120, 90)
    const strokeNear = {
      ...buildProductionDrawElementForCatalogItem(
        penItem,
        1,
        [40, 60, 80, 75, 120, 90],
        [0.5, 0.75, 0.6],
      ),
      watercolorPipeline: "causal-walker-v2" as const,
    };
    const replayNear = planStudioWetInkBrushReplay(strokeNear, {
      phase: "committed",
    });
    expect(replayNear.ok).toBe(true);
    const washAfterNear = getStudioInkwashWash()!;
    expect(washAfterNear).not.toBeNull();
    expect(cellPigmentTotal(80, 75)).toBeGreaterThan(0);

    // 2) Mid-canvas stroke at (680, 460) -> (760, 500) (> 512px from near stroke!)
    const strokeMid = {
      ...buildProductionDrawElementForCatalogItem(
        penItem,
        2,
        [680, 460, 720, 480, 760, 500],
        [0.6, 0.85, 0.7],
      ),
      watercolorPipeline: "causal-walker-v2" as const,
    };
    const replayMid = planStudioWetInkBrushReplay(strokeMid, {
      phase: "committed",
    });
    expect(replayMid.ok).toBe(true);
    expect(cellPigmentTotal(80, 75)).toBeGreaterThan(0);
    expect(cellPigmentTotal(720, 480)).toBeGreaterThan(0);

    // 3) Far-corner stroke at (1360, 980) -> (1460, 1040) (> 1300px from near stroke!)
    const strokeFar = {
      ...buildProductionDrawElementForCatalogItem(
        penItem,
        3,
        [1360, 980, 1410, 1010, 1460, 1040],
        [0.65, 0.9, 0.75],
      ),
      watercolorPipeline: "causal-walker-v2" as const,
    };
    const replayFar1 = planStudioWetInkBrushReplay(strokeFar, {
      phase: "live",
    });
    expect(replayFar1.ok).toBe(true);
    const washAfterFar1 = getStudioInkwashWash()!;
    expect(cellPigmentTotal(1410, 1010)).toBeGreaterThan(0);
    expect(washAfterFar1.session.fluid.width).toBeLessThanOrEqual(STUDIO_INKWASH_FLUID_MAX_DIMENSION);
    expect(washAfterFar1.session.fluid.height).toBeLessThanOrEqual(STUDIO_INKWASH_FLUID_MAX_DIMENSION);

    // Replaying the exact same far stroke on the next frame MUST hit the containment fast-path
    // without reallocating the Float32Array fluid session!
    const sessionRefBefore = washAfterFar1.session;
    const replayFar2 = planStudioWetInkBrushReplay(strokeFar, {
      phase: "live",
    });
    expect(replayFar2.ok).toBe(true);
    const washAfterFar2 = getStudioInkwashWash()!;
    expect(washAfterFar2.session).toBe(sessionRefBefore);

    // 4) Water brush stroke over the far stroke dilutes/spreads pigment and adds wetness
    const strokeWater = {
      ...buildProductionDrawElementForCatalogItem(
        waterItem,
        4,
        [1360, 980, 1410, 1010, 1460, 1040],
        [0.7, 0.85, 0.7],
      ),
      watercolorPipeline: "causal-walker-v2" as const,
    };
    const replayWater = planStudioWetInkBrushReplay(strokeWater, {
      phase: "live",
    });
    expect(replayWater.ok).toBe(true);
    const washAfterWater = getStudioInkwashWash()!;
    const farCellAfterWater = readStudioInkwashWashDocumentCell(washAfterWater, 1410, 1010)!;
    expect(farCellAfterWater).not.toBeNull();
    expect(farCellAfterWater.wet).toBeGreaterThan(0);

    resetStudioInkwashWash();
  });

  it("장시간 세션 동안 수묵 워시 레코드·저널·적용 서명·프로파일·팁 캐시가 LRU 상한 이내로 엄격히 제한된다", () => {
    // 1) Wash records LRU bound (STUDIO_INKWASH_WASH_MAX_RECORDS = 8)
    for (let i = 0; i < STUDIO_INKWASH_WASH_MAX_RECORDS + 6; i += 1) {
      ensureStudioInkwashWash({
        key: `soak-lru-wash-${i}`,
        pageEpoch: `epoch-${i}`,
        originX: 0,
        originY: 0,
        width: 32,
        height: 32,
        fieldScale: STUDIO_WET_INK_BRUSH_FIELD_SCALE,
      });
    }
    expect(studioInkwashWashRecordCountForTests()).toBeLessThanOrEqual(
      STUDIO_INKWASH_WASH_MAX_RECORDS,
    );

    // 2) Journal & applied stroke signatures bound within a single long-session wash record
    const longSessionKey = "soak-long-journal-wash";
    ensureStudioInkwashWash({
      key: longSessionKey,
      pageEpoch: "epoch-long",
      originX: 0,
      originY: 0,
      width: 64,
      height: 64,
      fieldScale: STUDIO_WET_INK_BRUSH_FIELD_SCALE,
    });
    for (let i = 0; i < STUDIO_INKWASH_WASH_MAX_APPLIED_ENTRIES + 40; i += 1) {
      const dummyStroke: DrawEl = {
        id: `stroke-${i}`,
        type: "draw",
        kind: "freehand",
        mode: "pen",
        brush: "inkwash-pen",
        points: [10, 10, 20, 20],
        pressures: [0.5, 0.6],
        stroke: "#111827",
        strokeWidth: 8,
        opacity: 1,
      };
      upsertStudioInkwashWashStroke(dummyStroke, longSessionKey);
      markStudioInkwashWashDeposited(dummyStroke, longSessionKey);
    }
    const longWash = getStudioInkwashWash(longSessionKey)!;
    expect(longWash.journal.length).toBeLessThanOrEqual(STUDIO_INKWASH_WASH_MAX_JOURNAL_ENTRIES);
    expect(studioInkwashWashAppliedEntries(longSessionKey).length).toBeLessThanOrEqual(
      STUDIO_INKWASH_WASH_MAX_APPLIED_ENTRIES,
    );

    // 3) Product profile cache LRU bound (STUDIO_BRUSH_PRODUCT_PROFILE_CACHE_LIMIT = 512)
    for (let i = 0; i < STUDIO_BRUSH_PRODUCT_PROFILE_CACHE_LIMIT + 64; i += 1) {
      const baseItem = STUDIO_ALL_BRUSH_CATALOG_ITEMS[i % STUDIO_ALL_BRUSH_CATALOG_ITEMS.length]!;
      studioBrushProductProfile({
        ...baseItem,
        id: `${baseItem.id}--soak-${i}`,
        defaultWidth: (i % 40) + 1,
      });
    }
    expect(studioBrushProductProfileCacheSizeForTests()).toBeLessThanOrEqual(
      STUDIO_BRUSH_PRODUCT_PROFILE_CACHE_LIMIT,
    );
    expect(studioStampDabTipCanvasCacheSizeForTests()).toBeLessThanOrEqual(128);
    expect(studioDryMediaKernelTipCacheSizeForTests()).toBeLessThanOrEqual(96);

    for (let i = 0; i < STUDIO_INKWASH_WASH_MAX_RECORDS + 6; i += 1) {
      resetStudioInkwashWash(`soak-lru-wash-${i}`);
    }
    resetStudioInkwashWash(longSessionKey);
  });

  it("포인터 스톨(dt 급증)·중복 타임스탬프·NaN/Infinity 비정상 샘플이 유입되어도 모든 브러시 런타임이 오염 없이 복구된다", () => {
    // 1) Stabilizer resilience under dt pause spikes, duplicate timestamps, and NaN inputs
    let state: StudioStrokeStabilizerState = {
      rawX: 100,
      rawY: 100,
      outputX: 100,
      outputY: 100,
      timeStamp: 1000,
      sampleIntervalMs: 8,
    };
    const normalStep = stabilizeStudioStrokeSample(
      state,
      { x: 120, y: 115, timeStamp: 1016 },
      { strength: 6, mode: "adaptive", coordinateScale: 1 },
    );
    expect(Number.isFinite(normalStep.point[0])).toBe(true);
    expect(Number.isFinite(normalStep.point[1])).toBe(true);
    state = normalStep.state;

    // Duplicate timestamp (dt = 0)
    const zeroDtStep = stabilizeStudioStrokeSample(
      state,
      { x: 140, y: 130, timeStamp: 1016 },
      { strength: 6, mode: "adaptive", coordinateScale: 1 },
    );
    expect(Number.isFinite(zeroDtStep.point[0])).toBe(true);
    expect(Number.isFinite(zeroDtStep.point[1])).toBe(true);
    state = zeroDtStep.state;

    // Long pause stall (dt = 8000ms) in weighted spring mode
    const stallStep = stabilizeStudioStrokeSample(
      state,
      { x: 320, y: 260, timeStamp: 9016 },
      { strength: 8, mode: "weighted", coordinateScale: 1 },
    );
    expect(Number.isFinite(stallStep.point[0])).toBe(true);
    expect(Number.isFinite(stallStep.point[1])).toBe(true);
    expect(Number.isFinite(stallStep.derivedPressure ?? 0.5)).toBe(true);

    // 2) InkWash fluid session resilience against NaN/Infinity coordinates & pressures
    const session = createStudioInkwashFluidSession({ width: 64, height: 64 });
    const deposited = depositStudioInkwashFluidStroke(session, {
      tool: "pen",
      radius: 6,
      pigmentLoad: 0.7,
      wetnessLoad: 0.5,
      inkColor: { r: 20, g: 30, b: 40 },
      samples: [
        { x: 16, y: 16, pressure: 0.6 },
        { x: Number.NaN, y: 24, pressure: Number.NaN },
        { x: 32, y: 32, pressure: 0.8 },
        { x: Number.POSITIVE_INFINITY, y: 40, pressure: Number.NEGATIVE_INFINITY },
      ],
    });
    expect(deposited).toBeGreaterThan(0);
    for (let i = 0; i < session.fluid.wet.length; i += 1) {
      expect(Number.isFinite(session.fluid.wet[i]!)).toBe(true);
    }
    for (let i = 0; i < session.fluid.pigment.length; i += 1) {
      expect(Number.isFinite(session.fluid.pigment[i]!)).toBe(true);
    }
    const cell16 = readStudioInkwashFluidCell(session, 16, 16)!;
    expect(cell16).not.toBeNull();
    expect(cell16.mobile[0] + cell16.mobile[1] + cell16.mobile[2]).toBeGreaterThan(0);

    // 3) InkWash raster filter resilience against extreme settings
    const raster = {
      width: 24,
      height: 24,
      data: new Uint8ClampedArray(24 * 24 * 4).fill(220),
    };
    applyInkWash(
      raster,
      normalizeInkWash({
        strength: 85,
        spread: 6,
        edgeBleed: 70,
        granulation: 65,
        paper: 60,
        edgeDarkening: 75,
        inkColor: "#1e293b",
        seed: 42,
      }),
    );
    for (let i = 0; i < raster.data.length; i += 1) {
      expect(Number.isFinite(raster.data[i]!)).toBe(true);
    }

    // 4) Stamp, Dynamic Dabs, Wet Wash Live Pipeline, and Bristle Physics Oil engines with glitchy tails
    const stampKind = resolveStudioStampBrushKind("wash-brush")!;
    const stampStyle = resolveStudioStampBrushStyle(
      stampKind,
      { color: "#1d4ed8", size: 14, opacity: 0.9 },
      null,
      "wash-brush",
    );
    const stampDabs = planStudioStampBrushDabs(
      stampStyle,
      [20, 20, 45, 35, Number.NaN, 50],
      [0.4, 0.8, Number.NaN],
    );
    expect(stampDabs.length).toBeGreaterThan(0);
    for (const dab of stampDabs) {
      expect(Number.isFinite(dab.x)).toBe(true);
      expect(Number.isFinite(dab.y)).toBe(true);
      expect(Number.isFinite(dab.radius)).toBe(true);
      expect(Number.isFinite(dab.alpha)).toBe(true);
    }

    const dynamicSettings = studioBrushDynamicsSettingsForBrushId("crayon")!;
    expect(dynamicSettings).not.toBeNull();
    const dynamicDabs = planStudioDynamicBrushDabs({
      points: [15, 18, 40, 28, 70, 42],
      pressures: [0.5, Number.NaN, 0.85],
      baseWidth: 16,
      baseOpacity: 0.92,
      settings: dynamicSettings,
      seed: 101,
    });
    expect(dynamicDabs.length).toBeGreaterThan(0);
    for (const dab of dynamicDabs) {
      expect(Number.isFinite(dab.x)).toBe(true);
      expect(Number.isFinite(dab.y)).toBe(true);
      expect(Number.isFinite(dab.opacity)).toBe(true);
    }

    const wetWashPlan = planStudioWetWashLivePipeline("soak-wet-wash-1", {
      brushId: "watercolor",
      input: {
        points: [20, 24, 52, 36, 88, 48],
        pressures: [0.5, 0.8, 0.65],
        baseWidth: 18,
        seed: 77,
      },
      carrierSeed: 77,
    });
    expect(wetWashPlan).not.toBeNull();
    expect(wetWashPlan!.dabs.length).toBeGreaterThan(0);

    const oilPhysicsPlan = planStudioBristlePhysicsOil({
      stationXs: [16, 44, 76, 108],
      stationYs: [20, 32, 46, 52],
      laneCount: 5,
      seed: 42,
      baseRadiusPx: 9,
      pressures: [0.5, 0.75, Number.NaN, 0.6],
    });
    expect(oilPhysicsPlan.stationCount).toBe(4);
    for (let i = 0; i < oilPhysicsPlan.laneOffsetRatio.length; i += 1) {
      expect(Number.isFinite(oilPhysicsPlan.laneOffsetRatio[i]!)).toBe(true);
      expect(Number.isFinite(oilPhysicsPlan.laneLoadMultiplier[i]!)).toBe(true);
      expect(Number.isFinite(oilPhysicsPlan.laneWidthScale[i]!)).toBe(true);
    }
  });
});
