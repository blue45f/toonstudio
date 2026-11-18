import { describe, expect, it } from "vitest";

import {
  computeReferenceAutoSelectMask,
  computeShrinkSelectionMask,
} from "./studio-shrink-selection";

function blankRgba(
  width: number,
  height: number,
  bg: readonly [number, number, number, number] = [0, 0, 0, 0],
): { data: Uint8ClampedArray; width: number; height: number } {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = bg[0];
    data[i * 4 + 1] = bg[1];
    data[i * 4 + 2] = bg[2];
    data[i * 4 + 3] = bg[3];
  }
  return { data, width, height };
}

function putPx(
  img: { data: Uint8ClampedArray; width: number },
  x: number,
  y: number,
  rgba: readonly [number, number, number, number],
): void {
  const off = (y * img.width + x) * 4;
  img.data[off] = rgba[0];
  img.data[off + 1] = rgba[1];
  img.data[off + 2] = rgba[2];
  img.data[off + 3] = rgba[3];
}

describe("studio-shrink-selection", () => {
  it("바깥 올가미에서 배경을 따라 안쪽으로 수축해 끊어진 선화(closeGapRadius) 내부 피사체를 밀착 선택한다", () => {
    const img = blankRgba(20, 20, [0, 0, 0, 0]);
    const INK = [15, 15, 15, 255] as const;

    // 6..13 정사각형 선화 윤곽선 그리기 (단, 상단 중앙 x=9..10 두 픽셀에 끊어진 틈을 만든다)
    for (let t = 6; t <= 13; t++) {
      if (t !== 9 && t !== 10) putPx(img, t, 6, INK);
      putPx(img, t, 13, INK);
      putPx(img, 6, t, INK);
      putPx(img, 13, t, INK);
    }

    const outerLasso = [
      { x: 1, y: 1 },
      { x: 18, y: 1 },
      { x: 18, y: 18 },
      { x: 1, y: 18 },
    ];

    // closeGapRadius=2 로 2px 선화 틈을 막고 수축하면 6..13 내부(투명 얼굴 영역 포함)가 통째로 보존된다.
    const shrunk = computeShrinkSelectionMask(img, outerLasso, {
      closeGapRadius: 2,
      colorTolerance: 20,
    });

    // 바깥 여백 (3, 3)은 선택에서 제거됨
    expect(shrunk.mask[3 * 20 + 3]).toBe(0);
    // 선화 위 (6, 8) 및 닫힌 내부 (10, 10)은 선택됨
    expect(shrunk.mask[8 * 20 + 6]).toBe(255);
    expect(shrunk.mask[10 * 20 + 10]).toBe(255);
  });

  it("도넛 형태 오브젝트에서 내부 구멍(holePolygons 및 cutoutTransparentInteriorHoles)을 보존한다", () => {
    const img = blankRgba(21, 21, [0, 0, 0, 0]);
    const FILL = [220, 70, 90, 255] as const;

    // 바깥 반경 4..16 채움 도넛, 안쪽 8..12 는 투명 구멍(5x5 = 25px)
    for (let y = 4; y <= 16; y++) {
      for (let x = 4; x <= 16; x++) {
        if (x >= 8 && x <= 12 && y >= 8 && y <= 12) continue;
        putPx(img, x, y, FILL);
      }
    }

    const outer = [
      { x: 1, y: 1 },
      { x: 19, y: 1 },
      { x: 19, y: 19 },
      { x: 1, y: 19 },
    ];

    // 1) cutoutTransparentInteriorHoles 옵션으로 내부 투명 구멍 보존
    const donutAuto = computeShrinkSelectionMask(img, outer, {
      closeGapRadius: 1,
      cutoutTransparentInteriorHoles: true,
      minInteriorHoleAreaPx: 9,
    });
    expect(donutAuto.mask[5 * 21 + 5]).toBe(255);
    expect(donutAuto.mask[10 * 21 + 10]).toBe(0);
    expect(donutAuto.holeCount).toBe(1);

    // 2) 명시적 holePolygons 시드로도 내부 구멍 벽까지 정확히 수축 보존
    const donutWithSeedHole = computeShrinkSelectionMask(img, outer, {
      closeGapRadius: 1,
      holePolygons: [
        [
          { x: 9, y: 9 },
          { x: 11, y: 9 },
          { x: 11, y: 11 },
          { x: 9, y: 11 },
        ],
      ],
    });
    expect(donutWithSeedHole.mask[5 * 21 + 5]).toBe(255);
    expect(donutWithSeedHole.mask[8 * 21 + 8]).toBe(0);
    expect(donutWithSeedHole.holeCount).toBe(1);
  });

  it("computeReferenceAutoSelectMask는 다중 참조 레이어의 선화 틈을 막고 내부 섬(구멍)을 침범하지 않는다", () => {
    const refPrimary = blankRgba(18, 18, [255, 255, 255, 255]);
    const refExtra = blankRgba(18, 18, [0, 0, 0, 0]);
    const INK = [0, 0, 0, 255] as const;

    // 바깥 경계 3..14 (우측 x=14, y=8 에 1px 끊어진 틈)
    for (let t = 3; t <= 14; t++) {
      putPx(refPrimary, t, 3, INK);
      putPx(refPrimary, t, 14, INK);
      putPx(refPrimary, 3, t, INK);
      if (t !== 8) putPx(refPrimary, 14, t, INK);
    }

    // 보조 참조 레이어에 내부 단추 섬(8..10 x 8..10) 배치 → 결과 마스크에 내부 구멍으로 남아야 함
    for (let y = 8; y <= 10; y++) {
      for (let x = 8; x <= 10; x++) {
        putPx(refExtra, x, y, INK);
      }
    }

    const autoSel = computeReferenceAutoSelectMask(
      refPrimary,
      { x: 5, y: 5 },
      {
        colorTolerance: 20,
        closeGapRadius: 1,
        additionalReferenceImages: [refExtra],
      },
    );

    // 내부 빈 공간 (5, 5) 선택됨
    expect(autoSel.mask[5 * 18 + 5]).toBe(255);
    // 끊어진 틈 바깥 (16, 8)으로는 누수되지 않음
    expect(autoSel.mask[8 * 18 + 16]).toBe(0);
    // 보조 참조 레이어의 단추 영역 (9, 9)는 내부 구멍으로 보존됨
    expect(autoSel.mask[9 * 18 + 9]).toBe(0);
    expect(autoSel.interiorHoleCount).toBeGreaterThanOrEqual(1);
  });
});
