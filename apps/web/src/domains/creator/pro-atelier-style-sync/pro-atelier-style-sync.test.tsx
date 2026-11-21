// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { StudioBrushProductCataloguePanel } from "../brush-lab/StudioBrushProductCataloguePanel";

import { StudioProAtelierStyleSyncPanel } from "./StudioProAtelierStyleSyncPanel";
import {
  DEFAULT_ASSISTANT_SUBMISSION_CUTS,
  DEFAULT_MASTER_CUT_DNA,
  STYLE_SYNC_DELTA_E_TARGET,
  STYLE_SYNC_STROKE_ERROR_TARGET_PX,
  analyzeCutStyleDrift,
  computeOklchDeltaE,
  harmonizeCrossCutStyles,
  harmonizeSingleCutToMaster,
  type CutArtStyleDna,
} from "./cross-cut-style-harmonizer-engine";
import {
  PRO_DRAWING_8_TOOLS_META,
  computeValueFlipSubView,
  decodeTeamBrushShareCode,
  encodeTeamBrushShareCode,
  evaluatePuppetAndMeshWarp,
  fillFromReferenceLayerWithExpand,
  mixPigmentsAndAdjustTone,
  sculptVectorStrokeWidth,
  sliceFrameAndTrackSpeechTail,
  snapPointToSpecialtyRuler,
  type Point2D,
  type TeamBrushSharePreset,
  type VectorStrokePoint,
} from "./pro-drawing-8-tools-engine";

afterEach(cleanup);

function makeEnclosedBoxMask(size: number, thickness: 1 | 2): Uint8Array {
  const alpha = new Uint8Array(size * size);
  const outerMin = 2;
  const outerMax = size - 3;
  const innerLineMin = outerMin + thickness - 1;
  const innerLineMax = outerMax - thickness + 1;
  const fringeMin = innerLineMin + 1;
  const fringeMax = innerLineMax - 1;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = y * size + x;
      const inOuterBox = x >= outerMin && x <= outerMax && y >= outerMin && y <= outerMax;
      const strictlyInsideInk = x > innerLineMin && x < innerLineMax && y > innerLineMin && y < innerLineMax;
      if (inOuterBox && !strictlyInsideInk) {
        alpha[idx] = 245;
      } else if (
        x >= fringeMin &&
        x <= fringeMax &&
        y >= fringeMin &&
        y <= fringeMax &&
        (x === fringeMin || x === fringeMax || y === fringeMin || y === fringeMax)
      ) {
        alpha[idx] = 68;
      } else {
        alpha[idx] = 0;
      }
    }
  }
  return alpha;
}

describe("1. 참조 레이어 채우기 & 선 안쪽 1~3px 확장 (fillFromReferenceLayerWithExpand)", () => {
  it("안티앨리어싱 흰 틈을 0px로 메우면서 선 바깥 외부 영역으로 1px도 번지지 않는다", () => {
    const mask = makeEnclosedBoxMask(14, 2);
    const result = fillFromReferenceLayerWithExpand({
      width: 14,
      height: 14,
      referenceAlpha: mask,
      seed: { x: 7, y: 7 },
      expandPx: 2,
    });

    expect(result.baseFilledPixels).toBeGreaterThan(0);
    expect(result.initialGapPixels).toBeGreaterThan(0);
    expect(result.remainingGapPixels).toBe(0);
    expect(result.leakedOutsidePixels).toBe(0);
    expect(result.boundarySafe).toBe(true);
    expect(result.filledMask[0]).toBe(0);
    expect(result.filledMask[13]).toBe(0);
  });

  it("1px 얇은 선화에서도 expandPx 1→2→3 증가 시 단조 확장하되 외부 번짐은 항상 0px이다", () => {
    const thinMask = makeEnclosedBoxMask(12, 1);
    const r1 = fillFromReferenceLayerWithExpand({
      width: 12,
      height: 12,
      referenceAlpha: thinMask,
      seed: { x: 6, y: 6 },
      expandPx: 1,
    });
    const r2 = fillFromReferenceLayerWithExpand({
      width: 12,
      height: 12,
      referenceAlpha: thinMask,
      seed: { x: 6, y: 6 },
      expandPx: 2,
    });
    const r3 = fillFromReferenceLayerWithExpand({
      width: 12,
      height: 12,
      referenceAlpha: thinMask,
      seed: { x: 6, y: 6 },
      expandPx: 3,
    });

    expect(r1.expandedPixels).toBeLessThanOrEqual(r2.expandedPixels);
    expect(r2.expandedPixels).toBeLessThanOrEqual(r3.expandedPixels);
    expect(r1.leakedOutsidePixels).toBe(0);
    expect(r2.leakedOutsidePixels).toBe(0);
    expect(r3.leakedOutsidePixels).toBe(0);
    expect(r2.remainingGapPixels).toBe(0);
  });

  it("시드가 선화 위이거나 캔버스 범위를 벗어나면 안전하게 0px 결과를 반환한다", () => {
    const mask = makeEnclosedBoxMask(12, 1);
    const onLine = fillFromReferenceLayerWithExpand({
      width: 12,
      height: 12,
      referenceAlpha: mask,
      seed: { x: 2, y: 2 },
      expandPx: 2,
    });
    const outOfBounds = fillFromReferenceLayerWithExpand({
      width: 12,
      height: 12,
      referenceAlpha: mask,
      seed: { x: -5, y: 50 },
      expandPx: 2,
    });

    expect(onLine.totalFilledPixels).toBe(0);
    expect(onLine.boundarySafe).toBe(true);
    expect(outOfBounds.totalFilledPixels).toBe(0);
    expect(outOfBounds.boundarySafe).toBe(true);
  });
});

describe("2. 벡터 선 굵기 사후 부분 보정 브러시 (sculptVectorStrokeWidth)", () => {
  const sampleStroke: readonly VectorStrokePoint[] = [
    { x: 0, y: 0, width: 3 },
    { x: 25, y: 0, width: 3 },
    { x: 50, y: 0, width: 3 },
    { x: 75, y: 0, width: 3 },
    { x: 100, y: 0, width: 3 },
    { x: 180, y: 0, width: 3 },
  ];

  it("thicken 모드는 브러시 중심에서 최대 가중을 주고 반경 밖 정점은 100% 보존한다", () => {
    const res = sculptVectorStrokeWidth({
      points: sampleStroke,
      mode: "thicken",
      brushCenter: { x: 50, y: 0 },
      brushRadius: 60,
      strength: 2.0,
    });

    expect(res.points[2].width).toBeCloseTo(5.0, 2);
    expect(res.points[1].width).toBeGreaterThan(3);
    expect(res.points[1].width).toBeLessThan(res.points[2].width);
    expect(res.points[5].width).toBe(3);
    expect(res.averageWidthAfter).toBeGreaterThan(res.averageWidthBefore);
  });

  it("thin 모드는 지정 구간 선폭을 줄이며 minWidth 하한선 아래로 내려가지 않는다", () => {
    const res = sculptVectorStrokeWidth({
      points: sampleStroke,
      mode: "thin",
      brushCenter: { x: 50, y: 0 },
      brushRadius: 60,
      strength: 10.0,
      minWidth: 0.75,
    });

    expect(res.points[2].width).toBe(0.75);
    expect(res.points.every((p) => p.width >= 0.75)).toBe(true);
    expect(res.averageWidthAfter).toBeLessThan(res.averageWidthBefore);
  });

  it("simplify 모드는 Ramer-Douglas-Peucker로 불필요 제어점을 제거하고 오차를 epsilon 이하로 유지한다", () => {
    const denseLine: readonly VectorStrokePoint[] = [
      { x: 0, y: 0, width: 2 },
      { x: 20, y: 0.4, width: 2 },
      { x: 40, y: -0.3, width: 2 },
      { x: 60, y: 0.2, width: 2 },
      { x: 80, y: 18, width: 2 },
      { x: 100, y: 18.2, width: 2 },
      { x: 120, y: 18, width: 2 },
    ];
    const epsilon = 1.5;
    const res = sculptVectorStrokeWidth({
      points: denseLine,
      mode: "simplify",
      brushCenter: { x: 60, y: 8 },
      brushRadius: 200,
      strength: epsilon,
    });

    expect(res.outputPointCount).toBeLessThan(denseLine.length);
    expect(res.removedPointCount).toBeGreaterThan(0);
    expect(res.maxDeviationPx).toBeLessThanOrEqual(epsilon);
    expect(res.points[0]).toEqual(denseLine[0]);
    expect(res.points[res.points.length - 1]).toEqual(denseLine[denseLine.length - 1]);
  });
});

describe("3. 실제 물감 감산 혼색(KM) & 색온도/명도 보정 (mixPigmentsAndAdjustTone)", () => {
  const yellow = { r: 245, g: 215, b: 30 };
  const blue = { r: 25, g: 95, b: 225 };

  it("노랑 + 파랑 50:50 감산 혼색이 회색이 아닌 자연 녹색(H 105°~175°, G 우세)을 산출한다", () => {
    const res = mixPigmentsAndAdjustTone({
      primary: yellow,
      secondary: blue,
      ratio: 0.5,
    });

    expect(res.mixedRgb.g).toBeGreaterThan(res.mixedRgb.r);
    expect(res.mixedRgb.g).toBeGreaterThan(res.mixedRgb.b);
    expect(res.mixedOklch.h).toBeGreaterThanOrEqual(105);
    expect(res.mixedOklch.h).toBeLessThanOrEqual(175);
    expect(res.mixedOklch.c).toBeGreaterThan(res.naiveAdditiveOklch.c);
    expect(res.mixedCssOklch).toMatch(/^oklch\(/);
  });

  it("혼색 비율 0과 1에서 각각 원본 primary/secondary 색상을 정확히 유지한다", () => {
    const atZero = mixPigmentsAndAdjustTone({ primary: yellow, secondary: blue, ratio: 0 });
    const atOne = mixPigmentsAndAdjustTone({ primary: yellow, secondary: blue, ratio: 1 });

    expect(atZero.mixedRgb).toEqual(yellow);
    expect(atOne.mixedRgb).toEqual(blue);
  });

  it("색온도(따뜻함/차가움)와 명도 보정 브러시가 기존 색조를 예측 가능하게 이동시킨다", () => {
    const neutral = mixPigmentsAndAdjustTone({ primary: yellow, secondary: blue, ratio: 0.5 });
    const warmer = mixPigmentsAndAdjustTone({
      primary: yellow,
      secondary: blue,
      ratio: 0.5,
      temperatureShift: 0.5,
    });
    const cooler = mixPigmentsAndAdjustTone({
      primary: yellow,
      secondary: blue,
      ratio: 0.5,
      temperatureShift: -0.5,
    });
    const brighter = mixPigmentsAndAdjustTone({
      primary: yellow,
      secondary: blue,
      ratio: 0.5,
      lightnessShift: 0.12,
    });
    const darker = mixPigmentsAndAdjustTone({
      primary: yellow,
      secondary: blue,
      ratio: 0.5,
      lightnessShift: -0.12,
    });

    expect(warmer.adjustedRgb.r).toBeGreaterThan(cooler.adjustedRgb.r);
    expect(cooler.adjustedRgb.b).toBeGreaterThan(warmer.adjustedRgb.b);
    expect(brighter.adjustedOklch.l).toBeGreaterThan(neutral.adjustedOklch.l);
    expect(darker.adjustedOklch.l).toBeLessThan(neutral.adjustedOklch.l);
  });
});

describe("4. 핀 기반 퍼펫 워프 & 4×4 메쉬 자유 변형 (evaluatePuppetAndMeshWarp)", () => {
  const bounds = { x: 0, y: 0, width: 100, height: 100 };

  it("다중 핀 IDW 퍼펫 워프는 고정 핀 변위 0, 이동 핀 정확 보간, 중간 정점 부드러운 변형을 만족한다", () => {
    const res = evaluatePuppetAndMeshWarp({
      vertices: [
        { x: 0, y: 50 },
        { x: 50, y: 50 },
        { x: 100, y: 50 },
      ],
      bounds,
      pins: [
        { id: "anchor", anchor: { x: 0, y: 50 }, target: { x: 0, y: 50 } },
        { id: "drag", anchor: { x: 100, y: 50 }, target: { x: 110, y: 20 } },
      ],
    });

    expect(res.vertices[0]).toEqual({ x: 0, y: 50 });
    expect(res.vertices[2]).toEqual({ x: 110, y: 20 });
    expect(res.vertices[1].x).toBeCloseTo(55, 1);
    expect(res.vertices[1].y).toBeCloseTo(35, 1);
  });

  it("4×4 바이큐빅 메쉬는 영변위에서 항등이고, 균일 변위 시 모든 정점이 정확히 평행이동한다", () => {
    const pts: readonly Point2D[] = [
      { x: 0, y: 0 },
      { x: 35, y: 65 },
      { x: 100, y: 100 },
    ];
    const identity = evaluatePuppetAndMeshWarp({ vertices: pts, bounds, pins: [] });
    expect(identity.vertices).toEqual(pts);
    expect(identity.maxDisplacementPx).toBe(0);

    const uniformOffsets = Array.from({ length: 16 }, () => ({ x: 12, y: -8 }));
    const shifted = evaluatePuppetAndMeshWarp({
      vertices: pts,
      bounds,
      pins: [],
      meshOffsets: uniformOffsets,
    });
    expect(shifted.vertices[0]).toEqual({ x: 12, y: -8 });
    expect(shifted.vertices[1]).toEqual({ x: 47, y: 57 });
    expect(shifted.vertices[2]).toEqual({ x: 112, y: 92 });
    expect(shifted.activeMeshHandles).toBe(16);
  });

  it("4×4 코너 제어점 이동 시 해당 모서리 정점이 정확히 일치 보간된다", () => {
    const offsets = Array.from({ length: 16 }, (_, i) => (i === 3 ? { x: 24, y: -16 } : { x: 0, y: 0 }));
    const res = evaluatePuppetAndMeshWarp({
      vertices: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      bounds,
      pins: [],
      meshOffsets: offsets,
    });
    expect(res.vertices[0]).toEqual({ x: 0, y: 0 });
    expect(res.vertices[1]).toEqual({ x: 124, y: -16 });
  });
});

describe("5. 실시간 흑백 명도(밸류) & 좌우 반전 서브뷰 (computeValueFlipSubView)", () => {
  it("Rec.709 휘도 가중치, 16구간 히스토그램 합계, 암부+중간톤+명부 비율 합=1 불변식을 만족한다", () => {
    const pixels = [
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
      { r: 0, g: 0, b: 255 },
      { r: 255, g: 255, b: 255 },
    ];
    const res = computeValueFlipSubView({
      pixels,
      width: 200,
      height: 100,
      grayscaleEnabled: true,
      flipHorizontal: false,
    });

    expect(res.grayscaleSamples[1]).toBeCloseTo(255 * 0.2126, 1);
    expect(res.grayscaleSamples[2]).toBeCloseTo(255 * 0.7152, 1);
    expect(res.grayscaleSamples[3]).toBeCloseTo(255 * 0.0722, 1);
    expect(res.histogram16).toHaveLength(16);
    expect(res.histogram16.reduce((a, b) => a + b, 0)).toBe(pixels.length);
    expect(res.shadowRatio + res.midtoneRatio + res.highlightRatio).toBeCloseTo(1, 3);
    expect(res.contrastRatio).toBeCloseTo(21, 0);
  });

  it("좌우 반전 매트릭스는 2회 적용 시 원좌표로 복귀하는 대합(involution) 성질을 갖는다", () => {
    const res = computeValueFlipSubView({
      pixels: [{ r: 120, g: 120, b: 120 }],
      width: 300,
      height: 200,
      grayscaleEnabled: false,
      flipHorizontal: true,
      zoom: 1,
    });

    const [a, , , d, e, f] = res.transformMatrix;
    const x1 = a * 40 + e;
    const x2 = a * x1 + e;
    expect(x1).toBe(260);
    expect(x2).toBe(40);
    expect(d).toBe(1);
    expect(f).toBe(0);
    expect(res.cssFilter).toBe("none");
  });

  it("중간톤 편중 표본에 대해 명암 분리 권장 진단을 반환한다", () => {
    const flatMidtones = Array.from({ length: 10 }, () => ({ r: 128, g: 128, b: 128 }));
    const res = computeValueFlipSubView({
      pixels: flatMidtones,
      width: 100,
      height: 100,
      grayscaleEnabled: true,
      flipHorizontal: false,
    });

    expect(res.midtoneRatio).toBe(1);
    expect(res.balanceVerdictKo).toContain("중간톤 편중");
  });
});

describe("6. 1획 컷 테두리 분할 & 말풍선 꼬리 화자 자동 추적 (sliceFrameAndTrackSpeechTail)", () => {
  it("가로 직선 칼선 분할 시 여백(gutterPx)을 포함해 두 컷 면적 합이 원본 면적과 정확히 일치한다", () => {
    const res = sliceFrameAndTrackSpeechTail({
      frame: { x: 0, y: 0, width: 200, height: 100 },
      cutLine: { start: { x: -10, y: 50 }, end: { x: 210, y: 50 } },
      gutterPx: 10,
      bubble: { cx: 150, cy: 30, rx: 30, ry: 16 },
      speakerMouth: { x: 60, y: 80 },
    });

    expect(res.didSplit).toBe(true);
    expect(res.firstFrame.area + res.secondFrame.area + 10 * 200).toBeCloseTo(res.originalArea, 1);
    expect(Math.abs(res.firstFrame.bounds.height - 45)).toBeLessThan(0.01);
    expect(Math.abs(res.secondFrame.bounds.height - 45)).toBeLessThan(0.01);
  });

  it("사선 칼선 분할에서도 2개의 유효 다각형 컷을 생성한다", () => {
    const res = sliceFrameAndTrackSpeechTail({
      frame: { x: 10, y: 10, width: 200, height: 140 },
      cutLine: { start: { x: 0, y: 120 }, end: { x: 220, y: 40 } },
      gutterPx: 12,
      bubble: { cx: 160, cy: 45, rx: 36, ry: 20 },
      speakerMouth: { x: 90, y: 120 },
    });

    expect(res.didSplit).toBe(true);
    expect(res.firstFrame.vertices.length).toBeGreaterThanOrEqual(3);
    expect(res.secondFrame.vertices.length).toBeGreaterThanOrEqual(3);
    expect(res.firstFrame.area + res.secondFrame.area).toBeLessThan(res.originalArea);
  });

  it("말풍선 위치가 좌우로 이동해도 꼬리 벡터가 화자 입 좌표를 정확히 재추적한다", () => {
    const mouth = { x: 100, y: 140 };
    const rightBubble = sliceFrameAndTrackSpeechTail({
      frame: { x: 0, y: 0, width: 240, height: 180 },
      cutLine: { start: { x: 0, y: 90 }, end: { x: 240, y: 90 } },
      gutterPx: 10,
      bubble: { cx: 180, cy: 50, rx: 36, ry: 20 },
      speakerMouth: mouth,
    });
    const leftBubble = sliceFrameAndTrackSpeechTail({
      frame: { x: 0, y: 0, width: 240, height: 180 },
      cutLine: { start: { x: 0, y: 90 }, end: { x: 240, y: 90 } },
      gutterPx: 10,
      bubble: { cx: 40, cy: 50, rx: 36, ry: 20 },
      speakerMouth: mouth,
    });

    // 오른쪽 말풍선 → 왼쪽 아래 화자(90°~180°), 왼쪽 말풍선 → 오른쪽 아래 화자(0°~90°)
    expect(rightBubble.speechTail.angleDeg).toBeGreaterThan(90);
    expect(rightBubble.speechTail.angleDeg).toBeLessThan(180);
    expect(leftBubble.speechTail.angleDeg).toBeGreaterThan(0);
    expect(leftBubble.speechTail.angleDeg).toBeLessThan(90);
    expect(rightBubble.speechTail.tailLengthPx).toBeGreaterThan(0);
    expect(rightBubble.speechTail.mouthInsideBubble).toBe(false);
  });
});

describe("7. 팀 공유 브러시 코드 인코더/디코더 (encodeTeamBrushShareCode / decodeTeamBrushShareCode)", () => {
  const preset: TeamBrushSharePreset = {
    version: 1,
    name: "웹툰 주력 마루펜 프로",
    baseSizePx: 11.5,
    spacing: 0.06,
    pressureCurve: [
      { x: 0, y: 0.04 },
      { x: 0.3, y: 0.18 },
      { x: 0.7, y: 0.86 },
      { x: 1, y: 1 },
    ],
    paperGrain: { pattern: "rough-cotton", depth: 0.35, scale: 1.5 },
    dualTip: {
      enabled: true,
      shape: "bristle",
      blendMode: "subtract",
      scatter: 0.22,
      rotationJitterDeg: 18,
    },
  };

  it("한글 브러시 이름·필압 커브·종이 요철·듀얼 팁을 URL-safe 코드 한 줄로 무손실 왕복한다", () => {
    const code = encodeTeamBrushShareCode(preset);
    expect(code).toMatch(/^TSB1-[A-Za-z0-9_-]+\.[0-9a-f]{8}$/);
    const decoded = decodeTeamBrushShareCode(code);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.preset).toEqual(preset);
    }
  });

  it("공유 코드에서 1글자라도 변조되면 CHECKSUM_MISMATCH 오류를 반환한다", () => {
    const code = encodeTeamBrushShareCode(preset);
    const tamperedChar = code[8] === "A" ? "B" : "A";
    const tampered = `${code.slice(0, 8)}${tamperedChar}${code.slice(9)}`;
    const decoded = decodeTeamBrushShareCode(tampered);

    expect(decoded.ok).toBe(false);
    if (!decoded.ok) {
      expect(decoded.errorCode).toBe("CHECKSUM_MISMATCH");
    }
  });

  it("잘못된 접두어와 규격 이탈 스키마를 안전하게 차단한다", () => {
    const badPrefix = decodeTeamBrushShareCode("OTHER-abc.12345678");
    expect(badPrefix.ok).toBe(false);
    if (!badPrefix.ok) {
      expect(badPrefix.errorCode).toBe("INVALID_PREFIX");
    }

    const malformed = decodeTeamBrushShareCode("TSB1-no-checksum");
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) {
      expect(malformed.errorCode).toBe("MALFORMED_PAYLOAD");
    }
  });
});

describe("8. 특수 스냅 자 (snapPointToSpecialtyRuler) & 8대 도구 레지스트리", () => {
  it("등각 30° 격자 스냅과 기준점 레이 잠금이 정확한 30°/90°/150° 각도를 유지한다", () => {
    const gridSnap = snapPointToSpecialtyRuler({
      point: { x: 28, y: 15 },
      mode: "isometric-30",
      origin: { x: 0, y: 0 },
      gridSize: 32,
    });
    const angleDeg = (Math.atan2(gridSnap.snapped.y, gridSnap.snapped.x) * 180) / Math.PI;
    expect(angleDeg).toBeCloseTo(30, 1);

    const rayLock = snapPointToSpecialtyRuler({
      point: { x: 103, y: 182 },
      mode: "isometric-30",
      anchorPoint: { x: 100, y: 100 },
      gridSize: 32,
    });
    expect(rayLock.lockedAngleDeg).toBe(90);
    expect(rayLock.snapped.x).toBe(100);
  });

  it("360° 등장방형 파노라마 스냅이 경도·위도 증분과 극지방 왜곡 배율(1/cosφ)을 정확히 계산한다", () => {
    const equator = snapPointToSpecialtyRuler({
      point: { x: 1024, y: 512 },
      mode: "panorama-360",
      canvasWidth: 2048,
      canvasHeight: 1024,
      panoramaStepDeg: 15,
    });
    expect(equator.panoramaMetadata?.longitudeDeg).toBe(0);
    expect(equator.panoramaMetadata?.latitudeDeg).toBe(0);
    expect(equator.panoramaMetadata?.equirectangularStretch).toBeCloseTo(1, 3);

    // 위도 60° (y = (90-60)/180 * 1024 = 170.67) -> stretch = 1/cos(60°) = 2.0
    const lat60 = snapPointToSpecialtyRuler({
      point: { x: 1024, y: 171 },
      mode: "panorama-360",
      canvasWidth: 2048,
      canvasHeight: 1024,
      panoramaStepDeg: 15,
    });
    expect(lat60.panoramaMetadata?.latitudeDeg).toBe(60);
    expect(lat60.panoramaMetadata?.equirectangularStretch).toBeCloseTo(2, 2);
  });

  it("픽셀 아트 격자 스냅이 지정 셀 크기의 정수 배수에 정확히 정렬된다", () => {
    const snap = snapPointToSpecialtyRuler({
      point: { x: 53.7, y: 101.2 },
      mode: "pixel-grid",
      origin: { x: 0, y: 0 },
      gridSize: 16,
    });
    expect(snap.snapped).toEqual({ x: 48, y: 96 });
    expect(snap.gridCoord).toEqual({ u: 3, v: 6 });
  });

  it("PRO_DRAWING_8_TOOLS_META 레지스트리에 중복 없는 8개 전문가 도구가 등록되어 있다", () => {
    expect(PRO_DRAWING_8_TOOLS_META).toHaveLength(8);
    expect(new Set(PRO_DRAWING_8_TOOLS_META.map((item) => item.id)).size).toBe(8);
  });
});

describe("9. 컷-대-컷 실시간 화풍 일체화 엔진 (cross-cut-style-harmonizer-engine)", () => {
  it("마스터 컷 자신과의 비교는 이질감 0점 · ΔE 0 · 선폭 오차 0px · matched 등급이다", () => {
    const selfDrift = analyzeCutStyleDrift(DEFAULT_MASTER_CUT_DNA, DEFAULT_MASTER_CUT_DNA);
    expect(selfDrift.inconsistencyScore).toBe(0);
    expect(selfDrift.maxColorDeltaE).toBe(0);
    expect(selfDrift.strokeWidthErrorPx).toBe(0);
    expect(selfDrift.grade).toBe("matched");
    expect(selfDrift.meetsDeltaETarget).toBe(true);
    expect(selfDrift.meetsStrokeTarget).toBe(true);
  });

  it("보정 전 어시스턴트·외주 제출 컷들은 허용 기준(ΔE<=2.0, 선폭<=0.15px)을 초과한다", () => {
    const report = harmonizeCrossCutStyles(
      DEFAULT_MASTER_CUT_DNA,
      DEFAULT_ASSISTANT_SUBMISSION_CUTS,
      1,
    );
    expect(report.beforeMaxDeltaE).toBeGreaterThan(STYLE_SYNC_DELTA_E_TARGET);
    expect(report.beforeMaxStrokeErrorPx).toBeGreaterThan(STYLE_SYNC_STROKE_ERROR_TARGET_PX);
    expect(report.beforeAverageInconsistency).toBeGreaterThan(30);
  });

  it("1클릭 자동 화풍 일체화(strength=1) 적용 후 전 컷 편차가 ΔE <= 2.0, 선폭 오차 <= 0.15px로 수렴한다", () => {
    const report = harmonizeCrossCutStyles(
      DEFAULT_MASTER_CUT_DNA,
      DEFAULT_ASSISTANT_SUBMISSION_CUTS,
      1,
    );

    expect(report.afterMaxDeltaE).toBeLessThanOrEqual(STYLE_SYNC_DELTA_E_TARGET);
    expect(report.afterMaxStrokeErrorPx).toBeLessThanOrEqual(STYLE_SYNC_STROKE_ERROR_TARGET_PX);
    expect(report.allCutsWithinDeltaETarget).toBe(true);
    expect(report.allCutsWithinStrokeTarget).toBe(true);
    expect(report.convergencePassed).toBe(true);
    expect(report.afterAverageInconsistency).toBeLessThan(report.beforeAverageInconsistency);
    for (const entry of report.results) {
      expect(entry.after.maxColorDeltaE).toBeLessThanOrEqual(STYLE_SYNC_DELTA_E_TARGET);
      expect(entry.after.strokeWidthErrorPx).toBeLessThanOrEqual(STYLE_SYNC_STROKE_ERROR_TARGET_PX);
      expect(entry.inconsistencyReduction).toBeGreaterThan(20);
    }
  });

  it("OKLCH 색상환 0°/360° 경계 최단 호 보정과 17노트 명암 커브 LUT 단조 증가를 보장한다", () => {
    const wrapMaster: CutArtStyleDna = {
      ...DEFAULT_MASTER_CUT_DNA,
      skinOklch: { l: 0.8, c: 0.08, h: 10 },
    };
    const wrapCut: CutArtStyleDna = {
      ...DEFAULT_ASSISTANT_SUBMISSION_CUTS[0],
      skinOklch: { l: 0.8, c: 0.08, h: 350 },
      contrastRatio: 2.5,
    };
    const synced = harmonizeSingleCutToMaster(wrapMaster, wrapCut, 1);

    expect(synced.correction.skinShift.deltaH).toBe(20);
    expect(computeOklchDeltaE(wrapMaster.skinOklch, synced.harmonizedCut.skinOklch)).toBeLessThanOrEqual(
      STYLE_SYNC_DELTA_E_TARGET,
    );

    const lut = synced.correction.contrastCurveLut;
    expect(lut).toHaveLength(17);
    expect(lut[0]).toBe(0);
    expect(lut[16]).toBe(1);
    for (let i = 1; i < lut.length; i += 1) {
      expect(lut[i]).toBeGreaterThanOrEqual(lut[i - 1]);
    }
  });

  it("보정 강도(0 → 0.5 → 1.0)에 따라 평균 이질감 점수가 단조 감소한다", () => {
    const r0 = harmonizeCrossCutStyles(DEFAULT_MASTER_CUT_DNA, DEFAULT_ASSISTANT_SUBMISSION_CUTS, 0);
    const rHalf = harmonizeCrossCutStyles(
      DEFAULT_MASTER_CUT_DNA,
      DEFAULT_ASSISTANT_SUBMISSION_CUTS,
      0.5,
    );
    const rFull = harmonizeCrossCutStyles(
      DEFAULT_MASTER_CUT_DNA,
      DEFAULT_ASSISTANT_SUBMISSION_CUTS,
      1,
    );

    expect(r0.afterAverageInconsistency).toBeGreaterThan(rHalf.afterAverageInconsistency);
    expect(rHalf.afterAverageInconsistency).toBeGreaterThan(rFull.afterAverageInconsistency);
  });
});

describe("10. UI 렌더링 · 인터랙션 · 지연 마운트 및 스타일 게이트 검증", () => {
  it("전문가 드로잉 8선 워크벤치에서 도구 전환·공유 코드 변조 검증·스냅 자 전환이 즉시 반응한다", () => {
    render(<StudioProAtelierStyleSyncPanel />);

    expect(screen.getByTestId("pas-panel-drawing8")).toBeTruthy();
    expect(screen.getByTestId("pas-fill-remaining-gap").textContent).toBe("0px");

    fireEvent.click(screen.getByTestId("pas-tool-select-vector-width"));
    fireEvent.click(screen.getByTestId("pas-vector-mode-simplify"));
    expect(screen.getByTestId("pas-tool-live-preview").textContent).toContain("제거 제어점");

    fireEvent.click(screen.getByTestId("pas-tool-select-brush-share-code"));
    expect(screen.getByTestId("pas-brush-share-code-output").textContent).toMatch(/^TSB1-/);
    expect(screen.getByTestId("pas-brush-decode-status").textContent).toContain("무결성 검증 통과");

    fireEvent.change(screen.getByTestId("pas-brush-code-input"), {
      target: { value: "TSB1-broken.00000000" },
    });
    expect(screen.getByTestId("pas-brush-decode-status").textContent).toContain("체크섬 검증에 실패");

    fireEvent.click(screen.getByTestId("pas-tool-select-specialty-ruler"));
    fireEvent.click(screen.getByTestId("pas-ruler-mode-pixel-grid"));
    expect(screen.getByTestId("pas-ruler-snapped-coord").textContent).toBe("(128, 80)");
  });

  it("실시간 화풍 일체화 엔진 탭에서 1클릭 일체화 적용 시 ΔE<=2.0·선폭<=0.15px 수렴 배지가 표시된다", () => {
    render(<StudioProAtelierStyleSyncPanel />);

    fireEvent.click(screen.getByTestId("pas-tab-style-sync"));
    expect(screen.getByTestId("pas-panel-style-sync")).toBeTruthy();
    expect(screen.getByTestId("pas-sync-convergence-badge").textContent).toContain("보정 대기 중");

    fireEvent.click(screen.getByTestId("pas-harmonize-apply-btn"));
    expect(screen.getByTestId("pas-sync-convergence-badge").textContent).toContain("통과");
    expect(Number(screen.getByTestId("pas-sync-max-delta-e").textContent)).toBeLessThanOrEqual(2);
    expect(
      Number(screen.getByTestId("pas-sync-max-stroke-error").textContent?.replace("px", "")),
    ).toBeLessThanOrEqual(0.15);

    fireEvent.click(screen.getByTestId("pas-harmonize-reset-btn"));
    expect(screen.getByTestId("pas-sync-convergence-badge").textContent).toContain("보정 대기 중");
  });

  it("StudioBrushProductCataloguePanel 하단 접이식 패널은 기본 닫힘이며 열 때만 지연 마운트한다", async () => {
    render(
      <MemoryRouter initialEntries={["/studio/assets/brushes/new"]}>
        <StudioBrushProductCataloguePanel baseHref="/studio/assets/brushes/new" />
      </MemoryRouter>,
    );

    const disclosure = screen.getByTestId(
      "studio-pro-atelier-style-sync-disclosure",
    ) as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(screen.queryByTestId("studio-pro-atelier-style-sync-panel")).toBeNull();

    disclosure.open = true;
    fireEvent(disclosure, new Event("toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("studio-pro-atelier-style-sync-panel")).toBeTruthy();
    });
  });

  it("CSS 스타일시트는 원시 HEX·transition-all이 0건이고 reduced-motion 및 >=44px 터치 타겟을 준수한다", () => {
    const css = readFileSync(
      resolve(
        process.cwd(),
        "apps/web/src/domains/creator/pro-atelier-style-sync/pro-atelier-style-sync.css",
      ),
      "utf8",
    );
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toContain("transition-all");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("min-height: 2.75rem");
    expect(css).toContain("oklch(");
  });
});
