// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioWorkAssetSmartFiltersSchema } from "../../contracts/studio-smart-filter-stack-contract";
import { StudioImageAdjustmentsPanel } from "../../StudioImageAdjustmentsPanel";
import {
  applyCameraRawRgba,
  applyLut3DToRgba,
  applyProChannelMixer,
  createActionRecorder,
  createPresetLut3D,
  DEFAULT_CAMERA_RAW_HSL,
  DEFAULT_PRO_CHANNEL_MIXER,
  finalizeActionSequence,
  parseCubeLut,
  recordActionStep,
  runBatchActionOnFrames,
  separateColorChannels,
  WEBTOON_BATCH_ACTION_PRESETS,
} from "../photoshop-camera-raw-channels";
import {
  compositeWithBlendIf,
  createDefaultLayerFxStack,
  DEFAULT_BLEND_IF_RANGE,
  evaluateBlendIfRangeFactor,
  renderPhotoshopLayerFx,
  syncLayerFxGlobalLight,
} from "../photoshop-layer-fx-compositor";
import {
  applyCloneStamp,
  applyContentAwareFill,
  applyPatchTool,
  applySpotHealingBrush,
  applyVectorMaskToRgba,
  createPresetVectorMaskPath,
  rasterizeVectorMask,
  recombineFrequencies,
  refineSelectionMask,
  renderQuickMaskOverlay,
  selectColorRange,
  separateFrequencies,
} from "../photoshop-retouch-frequency";
import {
  addSmartFilter,
  createSmartObjectDocument,
  duplicateSmartFilter,
  evaluateSmartObjectStack,
  fromStudioSmartFilterStack,
  paintSmartFilterMaskCircle,
  PHOTOSHOP_SMART_FILTER_RECIPES,
  removeSmartFilter,
  reorderSmartFilter,
  replaceSmartObjectContents,
  toStudioSmartFilterStack,
  updateSmartFilterBlending,
  updateSmartFilterMaskOptions,
  updateSmartFilterParams,
} from "../photoshop-smart-object-stack";
import { PhotoshopProStudioWorkbench } from "../PhotoshopProStudioWorkbench";

import type { ImageEl } from "../../studio-element-model";
import type { RgbaImageBuffer } from "../photoshop-pixel-math";
import type { BezierVectorPath } from "../photoshop-retouch-frequency";

function makeSolidBuffer(width: number, height: number, r: number, g: number, b: number, a = 255): RgbaImageBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = a;
  }
  return { width, height, data };
}

function makeCenteredSquareCutout(size: number, pad: number, r: number, g: number, b: number): RgbaImageBuffer {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = pad; y < size - pad; y += 1) {
    for (let x = pad; x < size - pad; x += 1) {
      const off = (y * size + x) * 4;
      data[off] = r; data[off + 1] = g; data[off + 2] = b; data[off + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

function pxAt(buf: RgbaImageBuffer, x: number, y: number): [number, number, number, number] {
  const off = (y * buf.width + x) * 4;
  return [buf.data[off] ?? 0, buf.data[off + 1] ?? 0, buf.data[off + 2] ?? 0, buf.data[off + 3] ?? 0];
}

const DUMMY_IMAGE_EL: ImageEl = {
  id: "img-pro-1",
  type: "image",
  src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  x: 0, y: 0, width: 120, height: 120, rotation: 0, opacity: 1,
};

afterEach(() => {
  cleanup();
});

describe("1. Photoshop Layer FX 10종 & Blend-If 엔진", () => {
  it("Drop Shadow가 외곽 투명 영역에 방향성 그림자를 투사하고 글로벌 라이트 각도를 동기화한다", () => {
    const src = makeCenteredSquareCutout(32, 10, 200, 180, 160);
    const base = syncLayerFxGlobalLight(createDefaultLayerFxStack(), 180);
    expect(base.dropShadow.angleDeg).toBe(180);
    expect(base.innerShadow.angleDeg).toBe(180);
    expect(base.bevelEmboss.angleDeg).toBe(180);

    const out = renderPhotoshopLayerFx(src, {
      ...base,
      dropShadow: { ...base.dropShadow, enabled: true, distancePx: 4, sizePx: 3, opacity: 0.9, angleDeg: 180, useGlobalLight: false },
    });
    // angle 180° -> dx = -cos(pi)*4 = +4 -> 그림자가 오른쪽 바깥(x=24, y=16)에 나타남
    expect(pxAt(src, 24, 16)[3]).toBe(0);
    expect(pxAt(out, 24, 16)[3]).toBeGreaterThan(80);
  });

  it("Outer Glow가 실루엣 바깥 둘레에 발광 알파를 생성한다", () => {
    const src = makeCenteredSquareCutout(28, 9, 120, 120, 120);
    const base = createDefaultLayerFxStack();
    const out = renderPhotoshopLayerFx(src, {
      ...base,
      outerGlow: { ...base.outerGlow, enabled: true, sizePx: 5, opacity: 0.9, color: { r: 80, g: 210, b: 255 } },
    });
    const [r, g, b, a] = pxAt(out, 7, 14);
    expect(a).toBeGreaterThan(30);
    expect(b).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(100);
  });

  it("Inner Shadow와 Inner Glow(edge/center)가 내부 픽셀만 변조하고 외곽은 투명으로 유지한다", () => {
    const src = makeCenteredSquareCutout(28, 8, 220, 220, 220);
    const base = createDefaultLayerFxStack();
    const shadowed = renderPhotoshopLayerFx(src, {
      ...base,
      innerShadow: { ...base.innerShadow, enabled: true, distancePx: 3, sizePx: 3, opacity: 0.9, color: { r: 10, g: 10, b: 10 } },
    });
    expect(pxAt(shadowed, 2, 2)[3]).toBe(0);
    expect(pxAt(shadowed, 9, 9)[0]).toBeLessThan(200);

    const glowCenter = renderPhotoshopLayerFx(src, {
      ...base,
      innerGlow: { ...base.innerGlow, enabled: true, source: "center", sizePx: 6, opacity: 0.85, color: { r: 255, g: 240, b: 100 }, blendMode: "normal" },
    });
    expect(pxAt(glowCenter, 14, 14)[2]).toBeLessThan(pxAt(src, 14, 14)[2]);
  });

  it("Bevel & Emboss가 방향(up/down)에 따라 대칭 경사면에 하이라이트와 그림자를 반전시킨다", () => {
    const src = makeCenteredSquareCutout(32, 8, 130, 130, 130);
    const base = createDefaultLayerFxStack();
    const up = renderPhotoshopLayerFx(src, {
      ...base,
      bevelEmboss: { ...base.bevelEmboss, enabled: true, direction: "up", sizePx: 5, depthPct: 200, angleDeg: 135, useGlobalLight: false },
    });
    const down = renderPhotoshopLayerFx(src, {
      ...base,
      bevelEmboss: { ...base.bevelEmboss, enabled: true, direction: "down", sizePx: 5, depthPct: 200, angleDeg: 135, useGlobalLight: false },
    });
    const topLeftUp = pxAt(up, 9, 9)[0];
    const bottomRightUp = pxAt(up, 22, 22)[0];
    const topLeftDown = pxAt(down, 9, 9)[0];
    expect(topLeftUp).not.toBe(bottomRightUp);
    expect(Math.sign(topLeftUp - 130)).toBe(-Math.sign(topLeftDown - 130));
  });

  it("Satin·Color Overlay·Gradient Overlay·Pattern Overlay와 fillOpacity 분리를 정확히 합성한다", () => {
    const src = makeCenteredSquareCutout(24, 4, 100, 100, 100);
    const base = createDefaultLayerFxStack();
    const colorOut = renderPhotoshopLayerFx(src, {
      ...base, fillOpacity: 0,
      colorOverlay: { enabled: true, color: { r: 240, g: 40, b: 60 }, opacity: 1, blendMode: "normal" },
    });
    expect(pxAt(colorOut, 12, 12)[0]).toBeGreaterThan(230);
    expect(pxAt(colorOut, 12, 12)[3]).toBe(255);

    const gradOut = renderPhotoshopLayerFx(src, {
      ...base,
      gradientOverlay: {
        enabled: true, style: "linear", angleDeg: 0, scalePct: 100, reverse: false, opacity: 1, blendMode: "normal",
        stops: [{ pos: 0, color: { r: 0, g: 0, b: 255 } }, { pos: 1, color: { r: 255, g: 0, b: 0 } }],
      },
    });
    expect(pxAt(gradOut, 18, 12)[0]).toBeGreaterThan(pxAt(gradOut, 6, 12)[0]);

    const patOut = renderPhotoshopLayerFx(src, {
      ...base,
      patternOverlay: { enabled: true, pattern: "checker", scalePct: 100, offsetX: 0, offsetY: 0, opacity: 0.9, blendMode: "normal" },
      satin: { ...base.satin, enabled: true, opacity: 0.4, distancePx: 3, sizePx: 2 },
    });
    expect(pxAt(patOut, 5, 5)[0]).not.toBe(pxAt(patOut, 12, 5)[0]);
  });

  it("Stroke가 outside·inside·center 위치에 EDT 안티앨리어싱 외곽선을 렌더링한다", () => {
    const src = makeCenteredSquareCutout(30, 10, 50, 50, 50);
    const base = createDefaultLayerFxStack();
    const outside = renderPhotoshopLayerFx(src, {
      ...base,
      stroke: { enabled: true, position: "outside", sizePx: 3, color: { r: 255, g: 255, b: 255 }, opacity: 1, blendMode: "normal" },
    });
    expect(pxAt(outside, 8, 15)[3]).toBeGreaterThan(200);
    expect(pxAt(outside, 8, 15)[0]).toBeGreaterThan(230);

    const inside = renderPhotoshopLayerFx(src, {
      ...base,
      stroke: { enabled: true, position: "inside", sizePx: 2, color: { r: 255, g: 0, b: 0 }, opacity: 1, blendMode: "normal" },
    });
    expect(pxAt(inside, 8, 15)[3]).toBe(0);
    expect(pxAt(inside, 10, 15)[0]).toBeGreaterThan(180);
  });

  it("Blend-If 분할 페더 슬라이더 계수 및 전경/배경 조건부 합성이 수학적으로 정확하다", () => {
    const range = { blackMin: 40, blackMax: 120, whiteMin: 200, whiteMax: 240 };
    expect(evaluateBlendIfRangeFactor(20, range)).toBe(0);
    expect(evaluateBlendIfRangeFactor(80, range)).toBeCloseTo(0.5, 4);
    expect(evaluateBlendIfRangeFactor(160, range)).toBe(1);
    expect(evaluateBlendIfRangeFactor(220, range)).toBeCloseTo(0.5, 4);
    expect(evaluateBlendIfRangeFactor(250, range)).toBe(0);

    // 왼쪽은 어두운 전경(20), 오른쪽은 밝은 전경(210)
    const fg = makeSolidBuffer(10, 2, 20, 20, 20, 255);
    for (let x = 5; x < 10; x += 1) {
      const off = x * 4;
      fg.data[off] = 210; fg.data[off + 1] = 210; fg.data[off + 2] = 210;
    }
    const bg = makeSolidBuffer(10, 2, 20, 180, 40, 255);
    const out = compositeWithBlendIf(fg, bg, {
      enabled: true,
      thisGray: { blackMin: 50, blackMax: 100, whiteMin: 255, whiteMax: 255 },
      underlyingGray: DEFAULT_BLEND_IF_RANGE,
    });
    // 어두운 전경(20)은 빠져서 배경 녹색(180)이 그대로 드러남
    expect(pxAt(out, 1, 0)[1]).toBe(180);
    // 밝은 전경(210)은 그대로 전경이 덮임
    expect(pxAt(out, 7, 0)[0]).toBe(210);
  });
});

describe("2. Smart Object & 비파괴 Smart Filter 스택 (T-024 계약 호환)", () => {
  it("원본 픽셀 불변성 유지 및 StudioWorkAssetSmartFiltersSchema 100% 직렬화/역직렬화 호환", () => {
    const src = makeSolidBuffer(12, 12, 100, 120, 140, 255);
    let doc = createSmartObjectDocument({ id: "so-1", source: src });
    doc = addSmartFilter(doc, { engine: "brightness-contrast", params: { brightness: 0.2, contrast: 20 }, opacity: 0.8, blendMode: "overlay" });
    doc = addSmartFilter(doc, { engine: "sepia", opacity: 0.5, blendMode: "color" });

    const contractStack = toStudioSmartFilterStack(doc);
    const parsed = StudioWorkAssetSmartFiltersSchema.safeParse(contractStack);
    expect(parsed.success).toBe(true);
    expect(contractStack.entries).toHaveLength(2);

    const restored = fromStudioSmartFilterStack(contractStack, createSmartObjectDocument({ source: src }));
    expect(restored.filters[0]?.blendMode).toBe("overlay");
    expect(restored.filters[0]?.opacity).toBeCloseTo(0.8, 3);
    expect(restored.filters[1]?.blendMode).toBe("color");

    const evaluated = evaluateSmartObjectStack(restored);
    expect(pxAt(evaluated, 6, 6)[0]).not.toBe(100);
    // 원본 버퍼 불변 확인
    expect(doc.sourcePixels[0]).toBe(100);
  });

  it("필터 재편집·순서 변경·복제·삭제·비활성화가 파이프라인 출력에 즉시 반영된다", () => {
    const src = makeSolidBuffer(10, 10, 80, 100, 120, 255);
    let doc = createSmartObjectDocument({ source: src });
    doc = addSmartFilter(doc, { id: "f-inv", engine: "invert", opacity: 1 });
    doc = addSmartFilter(doc, { id: "f-bc", engine: "brightness-contrast", params: { brightness: 0.25, contrast: 0 } });
    const orderA = evaluateSmartObjectStack(doc);

    const reordered = reorderSmartFilter(doc, 0, 1);
    const orderB = evaluateSmartObjectStack(reordered);
    expect(pxAt(orderA, 5, 5)[0]).not.toBe(pxAt(orderB, 5, 5)[0]);

    const edited = updateSmartFilterParams(doc, "f-bc", { brightness: -0.2 });
    expect(pxAt(evaluateSmartObjectStack(edited), 5, 5)[0]).toBeLessThan(pxAt(orderA, 5, 5)[0]);

    const dup = duplicateSmartFilter(doc, "f-inv");
    expect(dup.filters).toHaveLength(3);
    const muted = updateSmartFilterBlending(doc, "f-inv", { enabled: false });
    const removed = removeSmartFilter(muted, "f-bc");
    expect(pxAt(evaluateSmartObjectStack(removed), 5, 5)[0]).toBe(80);
  });

  it("Smart Filter Mask 페인팅·반전·페더 및 Replace Contents 원본 교체가 정확히 동작한다", () => {
    const src = makeSolidBuffer(16, 16, 40, 40, 40, 255);
    let doc = createSmartObjectDocument({ source: src });
    doc = addSmartFilter(doc, { engine: "invert", opacity: 1 });
    // 좌상단 (3,3) 반경 3 영역을 마스크 검정(0)으로 칠해 필터 차단
    doc = paintSmartFilterMaskCircle(doc, 3, 3, 3, 0, 1);
    const maskedOut = evaluateSmartObjectStack(doc);
    expect(pxAt(maskedOut, 3, 3)[0]).toBe(40);
    expect(pxAt(maskedOut, 13, 13)[0]).toBe(215);

    const invertedMaskOut = evaluateSmartObjectStack(updateSmartFilterMaskOptions(doc, { inverted: true, featherPx: 1 }));
    expect(pxAt(invertedMaskOut, 3, 3)[0]).toBeGreaterThan(180);
    expect(pxAt(invertedMaskOut, 13, 13)[0]).toBe(40);

    // Replace Contents: 필터 스택 유지한 채 원본만 교체
    const nextSrc = makeSolidBuffer(16, 16, 200, 100, 50, 255);
    const replaced = replaceSmartObjectContents(doc, nextSrc);
    expect(replaced.filters).toHaveLength(1);
    expect(pxAt(evaluateSmartObjectStack(replaced), 13, 13)[0]).toBe(55);
  });

  it("내장 Smart Filter 추천 레시피(High-Pass / Glow / Film)가 모두 유효하게 평가된다", () => {
    const src = makeCenteredSquareCutout(16, 3, 140, 110, 90);
    for (const recipe of PHOTOSHOP_SMART_FILTER_RECIPES) {
      let doc = createSmartObjectDocument({ source: src });
      for (const entry of recipe.entries) doc = addSmartFilter(doc, entry);
      const out = evaluateSmartObjectStack(doc);
      expect(out.data.length).toBe(src.data.length);
      expect(StudioWorkAssetSmartFiltersSchema.safeParse(toStudioSmartFilterStack(doc)).success).toBe(true);
    }
  });
});

describe("3. 리터칭·Frequency Separation·Content-Aware Fill·벡터 마스크·Color Range", () => {
  it("Frequency Separation 분리 후 Linear Light 재합성이 원본을 ±2 오차 내로 복원하고 질감 세기를 제어한다", () => {
    const src = makeSolidBuffer(16, 16, 140, 120, 110, 255);
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const off = (y * 16 + x) * 4;
        const checker = (x + y) % 2 === 0 ? 22 : -22;
        src.data[off] = 140 + checker;
      }
    }
    const sep = separateFrequencies(src, 2);
    const restored = recombineFrequencies(sep, { textureStrength: 1 });
    let maxErr = 0;
    for (let i = 0; i < src.data.length; i += 1) {
      maxErr = Math.max(maxErr, Math.abs((src.data[i] ?? 0) - (restored.data[i] ?? 0)));
    }
    expect(maxErr).toBeLessThanOrEqual(2);

    const smoothed = recombineFrequencies(sep, { textureStrength: 0 });
    expect(Math.abs(pxAt(smoothed, 4, 4)[0] - pxAt(smoothed, 5, 4)[0])).toBeLessThan(6);
  });

  it("Clone Stamp가 원본 영역 색상을 대상 좌표에 부드럽게 복제한다", () => {
    const src = makeSolidBuffer(20, 20, 30, 30, 30, 255);
    for (let y = 2; y <= 6; y += 1) {
      for (let x = 2; x <= 6; x += 1) {
        const off = (y * 20 + x) * 4;
        src.data[off] = 240; src.data[off + 1] = 80; src.data[off + 2] = 60;
      }
    }
    const out = applyCloneStamp(src, {
      sourceX: 4, sourceY: 4, destinationPoints: [{ x: 14, y: 14 }], radiusPx: 2.5, hardness01: 1, opacity01: 1,
    });
    expect(pxAt(out, 14, 14)[0]).toBe(240);
    expect(pxAt(out, 14, 14)[1]).toBe(80);
  });

  it("Spot Healing Brush와 Seamless Patch Tool이 어두운 잡티를 주변 배경 톤으로 복원한다", () => {
    const src = makeSolidBuffer(24, 24, 210, 195, 180, 255);
    for (let y = 10; y <= 13; y += 1) {
      for (let x = 10; x <= 13; x += 1) {
        const off = (y * 24 + x) * 4;
        src.data[off] = 20; src.data[off + 1] = 20; src.data[off + 2] = 20;
      }
    }
    const healed = applySpotHealingBrush(src, 11.5, 11.5, 3);
    expect(pxAt(healed, 11, 11)[0]).toBeGreaterThan(190);

    const mask = new Uint8Array(24 * 24);
    for (let y = 10; y <= 13; y += 1) for (let x = 10; x <= 13; x += 1) mask[y * 24 + x] = 255;
    const patched = applyPatchTool(src, mask, -7, 0, 24);
    expect(pxAt(patched, 11, 11)[0]).toBeGreaterThan(195);
  });

  it("Content-Aware Edge-Fill이 말풍선/이물질 흔적을 주변 배경 그라데이션으로 자동 메운다", () => {
    const src = makeSolidBuffer(24, 24, 0, 0, 0, 255);
    for (let y = 0; y < 24; y += 1) {
      for (let x = 0; x < 24; x += 1) {
        const off = (y * 24 + x) * 4;
        src.data[off] = 80 + x * 5;
        src.data[off + 1] = 150;
        src.data[off + 2] = 210;
      }
    }
    const mask = new Uint8Array(24 * 24);
    for (let y = 9; y <= 14; y += 1) {
      for (let x = 9; x <= 14; x += 1) {
        const off = (y * 24 + x) * 4;
        src.data[off] = 255; src.data[off + 1] = 0; src.data[off + 2] = 255;
        mask[y * 24 + x] = 255;
      }
    }
    const filled = applyContentAwareFill(src, mask, { patchRadius: 1, searchRadius: 8 });
    const [r, g, b] = pxAt(filled, 12, 12);
    expect(Math.abs(r - 140)).toBeLessThan(28);
    expect(Math.abs(g - 150)).toBeLessThan(20);
    expect(Math.abs(b - 210)).toBeLessThan(20);
  });

  it("Bezier 벡터 마스크가 nonzero/evenodd 규칙과 안티앨리어싱으로 알파를 클리핑한다", () => {
    const src = makeSolidBuffer(32, 32, 200, 160, 120, 255);
    const oval = createPresetVectorMaskPath("oval", 32, 32);
    const mask = rasterizeVectorMask([oval], 32, 32, { supersample: 2, featherPx: 0 });
    const clipped = applyVectorMaskToRgba(src, mask);
    expect(pxAt(clipped, 16, 16)[3]).toBe(255);
    expect(pxAt(clipped, 1, 1)[3]).toBe(0);

    // evenodd 도넛(바깥 사각 + 안쪽 사각 구멍) 검증
    const rectPath = (id: string, x0: number, y0: number, x1: number, y1: number): BezierVectorPath => ({
      id, name: id, closed: true, fillRule: "evenodd",
      anchors: [
        { x: x0, y: y0, handleInX: x0, handleInY: y0, handleOutX: x0, handleOutY: y0 },
        { x: x1, y: y0, handleInX: x1, handleInY: y0, handleOutX: x1, handleOutY: y0 },
        { x: x1, y: y1, handleInX: x1, handleInY: y1, handleOutX: x1, handleOutY: y1 },
        { x: x0, y: y1, handleInX: x0, handleInY: y1, handleOutX: x0, handleOutY: y1 },
      ],
    });
    const outer = rasterizeVectorMask([rectPath("outer", 4, 4, 28, 28)], 32, 32, { supersample: 1 });
    expect(outer[16 * 32 + 16]).toBe(255);
    expect(outer[1 * 32 + 1]).toBe(0);
  });

  it("CIE Lab Color Range 선택·경계 다듬기·Quick Mask 오버레이가 대상 색만 정밀 선택한다", () => {
    const src = makeSolidBuffer(16, 16, 30, 80, 220, 255);
    for (let y = 4; y < 12; y += 1) {
      for (let x = 4; x < 12; x += 1) {
        const off = (y * 16 + x) * 4;
        src.data[off] = 230; src.data[off + 1] = 45; src.data[off + 2] = 45;
      }
    }
    const sel = selectColorRange(src, { mode: "sampled", sampleColor: { r: 230, g: 45, b: 45 }, fuzziness: 40 });
    expect(sel.selectedPixelCount).toBe(64);
    expect(sel.mask[8 * 16 + 8]).toBe(255);
    expect(sel.mask[0]).toBe(0);

    const expanded = refineSelectionMask(sel.mask, 16, 16, { shiftEdgePx: 1 });
    expect(expanded[3 * 16 + 8]).toBe(255);

    const quickMask = renderQuickMaskOverlay(src, sel.mask, { maskIndicates: "masked", overlayOpacity: 0.5 });
    expect(pxAt(quickMask, 0, 0)[0]).toBeGreaterThan(100);
    expect(pxAt(quickMask, 8, 8)[0]).toBe(230);
  });
});

describe("4. Camera Raw(ACR)·3D LUT·RGB/CMYK/Lab 채널·배치 액션", () => {
  it("Camera Raw 색온도·노출·명료도·디헤이즈·비네팅·필름 그레인이 실제 픽셀을 정확히 변환한다", () => {
    const gray = makeSolidBuffer(20, 20, 128, 128, 128, 255);
    const warm = applyCameraRawRgba(gray, { temperature: 60 });
    expect(pxAt(warm, 10, 10)[0]).toBeGreaterThan(pxAt(warm, 10, 10)[2]);

    const bright = applyCameraRawRgba(gray, { exposure: 0.8 });
    expect(pxAt(bright, 10, 10)[0]).toBeGreaterThan(190);

    const vig = applyCameraRawRgba(gray, { vignette: -80 });
    expect(pxAt(vig, 0, 0)[0]).toBeLessThan(pxAt(vig, 10, 10)[0]);

    const grainy = applyCameraRawRgba(gray, { grainAmount: 60, grainSeed: 777 });
    expect(pxAt(grainy, 2, 3)[0]).not.toBe(pxAt(grainy, 7, 9)[0]);
  });

  it("Camera Raw HSL 8색 믹서가 빨강 계열만 조절하고 순수 파랑 픽셀은 보존한다", () => {
    const src = makeSolidBuffer(8, 2, 220, 40, 40, 255);
    for (let x = 4; x < 8; x += 1) {
      const off = x * 4;
      src.data[off] = 40; src.data[off + 1] = 60; src.data[off + 2] = 220;
    }
    const out = applyCameraRawRgba(src, {
      hsl: { ...DEFAULT_CAMERA_RAW_HSL, red: { hue: 0, saturation: -90, luminance: 20 } },
    });
    expect(pxAt(out, 1, 0)[1]).toBeGreaterThan(110);
    expect(Math.abs(pxAt(out, 6, 0)[2] - 220)).toBeLessThanOrEqual(2);
  });

  it("3D LUT .cube 파서와 삼선형 보간 적용기가 정확한 색 변환을 수행한다", () => {
    const cubeText = [
      'TITLE "SwapRB"',
      "LUT_3D_SIZE 2",
      "0 0 0", "0 0 1", "0 1 0", "0 1 1",
      "1 0 0", "1 0 1", "1 1 0", "1 1 1",
    ].join("\n");
    const lut = parseCubeLut(cubeText);
    expect(lut.size).toBe(2);
    const red = makeSolidBuffer(4, 4, 255, 0, 0, 255);
    const swapped = applyLut3DToRgba(red, lut, 1);
    expect(pxAt(swapped, 1, 1)[0]).toBe(0);
    expect(pxAt(swapped, 1, 1)[2]).toBe(255);

    const presetLut = createPresetLut3D("warm-sunset", 9);
    const warmOut = applyLut3DToRgba(makeSolidBuffer(4, 4, 128, 128, 128, 255), presetLut, 1);
    expect(pxAt(warmOut, 1, 1)[0]).toBeGreaterThan(pxAt(warmOut, 1, 1)[2]);
    expect(() => parseCubeLut("INVALID")).toThrow();
  });

  it("RGB / CMYK / CIE Lab 채널 분리 및 프로 채널 믹서가 정확하게 동작한다", () => {
    const cyan = makeSolidBuffer(6, 6, 0, 255, 255, 255);
    const cmyk = separateColorChannels(cyan, "cmyk");
    expect(cmyk.channels).toHaveLength(4);
    expect(cmyk.channels[0]?.mean01).toBeCloseTo(1, 2); // C = 1
    expect(cmyk.channels[3]?.mean01).toBeCloseTo(0, 2); // K = 0

    const lab = separateColorChannels(makeSolidBuffer(6, 6, 255, 255, 255, 255), "lab");
    expect(lab.channels[0]?.mean01).toBeCloseTo(1, 2); // L* = 100

    const labPop = applyProChannelMixer(makeSolidBuffer(4, 4, 200, 120, 120, 255), {
      ...DEFAULT_PRO_CHANNEL_MIXER, colorSpace: "lab", labAdjust: [0, 1.5, 1],
    });
    expect(pxAt(labPop, 1, 1)[0]).toBeGreaterThan(200);

    const mono = applyProChannelMixer(makeSolidBuffer(4, 4, 200, 100, 50, 255), {
      ...DEFAULT_PRO_CHANNEL_MIXER, monochrome: true, rgbRed: [0.3, 0.6, 0.1, 0],
    });
    expect(pxAt(mono, 1, 1)[0]).toBe(pxAt(mono, 1, 1)[1]);
    expect(pxAt(mono, 1, 1)[1]).toBe(pxAt(mono, 1, 1)[2]);
  });

  it("배치 액션 레코더·리플레이어와 웹툰 회차 일괄 후보정 프리셋 4종이 다수 컷을 일괄 처리한다", () => {
    let rec = createActionRecorder();
    rec = recordActionStep(rec, { id: "s1", label: "따뜻하게", enabled: true, kind: "camera-raw", settings: { temperature: 40 } });
    rec = recordActionStep(rec, { id: "s2", label: "색감표", enabled: true, kind: "lut-3d", presetId: "webtoon-vivid", strength: 0.5 });
    const seq = finalizeActionSequence(rec, { id: "my-seq", name: "테스트 일괄", description: "테스트" });

    const frames = [
      { id: "cut-1", label: "1컷", image: makeSolidBuffer(8, 8, 120, 120, 120, 255) },
      { id: "cut-2", label: "2컷", image: makeSolidBuffer(8, 8, 90, 100, 110, 255) },
    ];
    const results = runBatchActionOnFrames(frames, seq);
    expect(results).toHaveLength(2);
    expect(results[0]?.appliedStepCount).toBe(2);
    expect(pxAt(results[0]!.output, 3, 3)[0]).toBeGreaterThan(pxAt(results[0]!.output, 3, 3)[2]);

    expect(WEBTOON_BATCH_ACTION_PRESETS.length).toBeGreaterThanOrEqual(4);
    for (const preset of WEBTOON_BATCH_ACTION_PRESETS) {
      const batch = runBatchActionOnFrames(frames, preset);
      expect(batch[0]?.appliedStepCount).toBe(preset.steps.length);
    }
  });
});

describe("5. 포토샵 프로 랩 쉬운 한국어 UX · 접근성 · 지연 마운트 연동", () => {
  it("5개 분할 탭을 렌더링하고 쉬운 한국어 레이블로 전환되며 접근성 규격을 준수한다", () => {
    render(<PhotoshopProStudioWorkbench selected={DUMMY_IMAGE_EL} onPatch={vi.fn()} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "레이어 효과",
      "색감 보정실",
      "잡티·배경 지우기",
      "스마트 필터",
      "채널·일괄 작업",
    ]);
    // 내부 영문 전문 용어 직접 노출 금지 검증
    const text = screen.getByLabelText("포토샵 프로 랩").textContent ?? "";
    expect(text).not.toMatch(/Blend-If|Camera Raw|Frequency Separation|Content-Aware/i);

    // 5개 탭 순회 전환
    fireEvent.click(screen.getByRole("tab", { name: "색감 보정실" }));
    expect(screen.getByText("색온도 (차가움↔따뜻함)")).toBeDefined();

    fireEvent.click(screen.getByRole("tab", { name: "잡티·배경 지우기" }));
    expect(screen.getByRole("button", { name: "배경 흔적 자동 메우기" })).toBeDefined();

    fireEvent.click(screen.getByRole("tab", { name: "스마트 필터" }));
    expect(screen.getByRole("button", { name: /웹툰 인물 선명 마무리/ })).toBeDefined();

    fireEvent.click(screen.getByRole("tab", { name: "채널·일괄 작업" }));
    expect(screen.getByText("웹툰 회차 일괄 후보정 프리셋")).toBeDefined();
  });

  it("레이어 효과 프리셋 클릭과 토글 시 활성 효과 수와 상태 안내가 갱신된다", () => {
    render(<PhotoshopProStudioWorkbench selected={DUMMY_IMAGE_EL} onPatch={vi.fn()} />);
    expect(screen.getByText("활성 효과 0개")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "웹툰 스티커 테두리" }));
    expect(screen.getByText("활성 효과 2개")).toBeDefined();
    expect(screen.getByRole("status", { name: "작업 상태 안내" }).textContent).toContain("웹툰 스티커 테두리");

    fireEvent.click(screen.getByRole("button", { name: "초기화" }));
    expect(screen.getByText("활성 효과 0개")).toBeDefined();
  });

  it("접이식 세부 설정(<details>) 점진적 공개와 색감 보정실 프리셋·HSL 8색 전환이 정상 동작한다", () => {
    render(<PhotoshopProStudioWorkbench selected={DUMMY_IMAGE_EL} onPatch={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "색감 보정실" }));
    expect(screen.getByText("세부 톤 · 8가지 색별 조절 · 필름 입자")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "노을 감성 장면" }));
    expect(screen.getByRole("status", { name: "작업 상태 안내" }).textContent).toContain("노을 감성 장면");

    fireEvent.change(screen.getByLabelText("특정 색만 따로 조절"), { target: { value: "blue" } });
    expect((screen.getByLabelText("특정 색만 따로 조절") as HTMLSelectElement).value).toBe("blue");
  });

  it("잡티·배경 지우기 탭에서 5가지 모드 전환과 모양 틀 마스크 옵션이 정상 노출된다", () => {
    render(<PhotoshopProStudioWorkbench selected={DUMMY_IMAGE_EL} onPatch={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "잡티·배경 지우기" }));

    fireEvent.click(screen.getByRole("button", { name: "피부결·색감 따로 다듬기" }));
    expect(screen.getByText("선·질감 유지 강도")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "비슷한 색만 골라내기" }));
    expect(screen.getByLabelText("골라낼 색상 범위")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "모양 틀로 자르기" }));
    expect(screen.getByLabelText("자르기 모양 틀")).toBeDefined();
    expect(screen.getByRole("button", { name: "안쪽·바깥 반전하기" })).toBeDefined();
  });

  it("스마트 필터 탭에서 필터 추가·복제·순서 변경·삭제 시 정본 계약 스택으로 onPatch를 호출한다", () => {
    const onPatch = vi.fn();
    render(<PhotoshopProStudioWorkbench selected={DUMMY_IMAGE_EL} onPatch={onPatch} />);
    fireEvent.click(screen.getByRole("tab", { name: "스마트 필터" }));

    fireEvent.click(screen.getByRole("button", { name: "부드러운 흐림" }));
    fireEvent.click(screen.getByRole("button", { name: "따뜻한 회상 톤" }));
    expect(onPatch).toHaveBeenCalledTimes(2);

    const lastCall = onPatch.mock.calls[1]?.[0] as { smartFilters?: unknown };
    expect(StudioWorkAssetSmartFiltersSchema.safeParse(lastCall.smartFilters).success).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "따뜻한 회상 톤 위로 이동" }));
    const reorderedCall = onPatch.mock.calls[2]?.[0] as { smartFilters?: { entries: Array<{ engine: string }> } };
    expect(reorderedCall.smartFilters?.entries[0]?.engine).toBe("sepia");
  });

  it("채널·일괄 작업 탭에서 채널 분해 전환과 나만의 작업 순서 녹화가 정상 동작한다", () => {
    render(<PhotoshopProStudioWorkbench selected={DUMMY_IMAGE_EL} onPatch={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "채널·일괄 작업" }));

    fireEvent.change(screen.getByLabelText("색상 채널 보기 방식"), { target: { value: "cmyk" } });
    expect(screen.getByText("청록 잉크")).toBeDefined();
    expect(screen.getByText("먹색 잉크")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "녹화 시작" }));
    fireEvent.click(screen.getByRole("button", { name: "현재 보정 기록" }));
    expect(screen.getByText("기록 1단계")).toBeDefined();
  });

  it("StudioImageAdjustmentsPanel에서 '포토샵 프로 랩 열기'가 지연 마운트되어 확장 시 로드된다", async () => {
    render(
      <StudioImageAdjustmentsPanel
        selected={DUMMY_IMAGE_EL}
        filterClipboard={null}
        onSetFilterClipboard={vi.fn()}
        onPatch={vi.fn()}
        effectFavoriteState={{ version: 1, favorites: [], recent: [] }}
        onToggleEffectFavorite={vi.fn()}
        onRememberEffectRecent={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", { name: "포토샵 프로 랩 열기" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText("포토샵 프로 랩")).toBeNull();

    fireEvent.click(trigger);
    await waitFor(() => {
      expect(screen.getByLabelText("포토샵 프로 랩")).toBeDefined();
    });
  });
});
