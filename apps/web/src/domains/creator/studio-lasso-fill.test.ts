import { describe, expect, it } from "vitest";

import type { AdvancedFillImageDataLike, AdvancedFillRgba } from "./studio-advanced-fill";
import {
  applyStudioLassoFill,
  rasterizeStudioLassoFillMask,
  STUDIO_LASSO_FILL_DEFAULTS,
  type StudioLassoFillPoint,
} from "./studio-lasso-fill";

const CLEAR: AdvancedFillRgba = [0, 0, 0, 0];
const BLACK: AdvancedFillRgba = [0, 0, 0, 255];
const RED: AdvancedFillRgba = [240, 20, 30, 255];

function imageFromRows(
  rows: readonly string[],
  palette: Readonly<Record<string, AdvancedFillRgba>>,
): AdvancedFillImageDataLike {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) => {
    expect(row).toHaveLength(width);
    [...row].forEach((key, x) => {
      const color = palette[key];
      if (!color) throw new Error(`Missing test palette color: ${key}`);
      data.set(color, (y * width + x) * 4);
    });
  });
  return { data, width, height };
}

function solid(width: number, height: number, color: AdvancedFillRgba): AdvancedFillImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let position = 0; position < width * height; position++) data.set(color, position * 4);
  return { data, width, height };
}

function rgbaAt(image: AdvancedFillImageDataLike, x: number, y: number): number[] {
  const offset = (y * image.width + x) * 4;
  return Array.from(image.data.slice(offset, offset + 4));
}

function maskRows(mask: Uint8Array, width: number): string[] {
  const rows: string[] = [];
  for (let offset = 0; offset < mask.length; offset += width) {
    rows.push(Array.from(mask.slice(offset, offset + width), (value) => (value ? "#" : ".")).join(""));
  }
  return rows;
}

/** 오른쪽이 열린 "⊂" 선화 — 버킷으로는 새는 대표 케이스. */
const OPEN_BRACKET_ROWS = [
  "............",
  "............",
  "...######...",
  "...#........",
  "...#........",
  "...#........",
  "...#........",
  "...######...",
  "............",
  "............",
];
const LINE_PALETTE = { ".": CLEAR, "#": BLACK } as const;
/** 브래킷을 넉넉히 감싸는 직사각형 래소. 내부 x=2..9, y=1..7 (56px). */
const BRACKET_LASSO: readonly StudioLassoFillPoint[] = [
  { x: 2, y: 1 },
  { x: 10, y: 1 },
  { x: 10, y: 8 },
  { x: 2, y: 8 },
];

describe("rasterizeStudioLassoFillMask", () => {
  it("직사각형 경로를 픽셀 중심 기준으로 래스터화한다", () => {
    const mask = rasterizeStudioLassoFillMask(
      [
        { x: 1, y: 1 },
        { x: 6, y: 1 },
        { x: 6, y: 6 },
        { x: 1, y: 6 },
      ],
      8,
      8,
    );
    expect(maskRows(mask, 8)).toEqual([
      "........",
      ".#####..",
      ".#####..",
      ".#####..",
      ".#####..",
      ".#####..",
      "........",
      "........",
    ]);
  });

  it("삼각형 경로를 even-odd로 래스터화한다", () => {
    const mask = rasterizeStudioLassoFillMask(
      [
        { x: 1, y: 1 },
        { x: 7, y: 1 },
        { x: 1, y: 7 },
      ],
      8,
      8,
    );
    expect(maskRows(mask, 8)).toEqual([
      "........",
      ".#####..",
      ".####...",
      ".###....",
      ".##.....",
      ".#......",
      "........",
      "........",
    ]);
  });

  it("면적이 없는 직선 경로는 빈 마스크를 만든다", () => {
    const mask = rasterizeStudioLassoFillMask(
      [
        { x: 1, y: 1 },
        { x: 5, y: 1 },
        { x: 9, y: 1 },
      ],
      10,
      3,
    );
    expect(mask.every((value) => value === 0)).toBe(true);
  });

  it("크기가 1보다 작으면 거부한다", () => {
    expect(() =>
      rasterizeStudioLassoFillMask(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: 1 },
        ],
        0,
        4,
      ),
    ).toThrow(RangeError);
  });
});

describe("applyStudioLassoFill", () => {
  it("열린 선도 둘러싼 경로가 닫아 주어 안쪽이 채워지고 밖으로 새지 않는다", () => {
    const reference = imageFromRows(OPEN_BRACKET_ROWS, LINE_PALETTE);
    const target = solid(12, 10, CLEAR);
    const targetBefore = target.data.slice();

    const result = applyStudioLassoFill({
      target,
      referenceImage: reference,
      points: BRACKET_LASSO,
      fill: RED,
    });

    expect(result.diagnostics.status).toBe("applied");
    // 내부 56px − 선 16px = 40px.
    expect(result.diagnostics.paintedPixelCount).toBe(40);
    expect(result.lasso).toEqual({
      pointCount: 4,
      interiorPixelCount: 56,
      seed: { x: 2, y: 1 },
      lineBoundary: "visible",
      closeGapRadius: 0,
    });
    // 브래킷 안쪽.
    expect(rgbaAt(result.imageData, 5, 4)).toEqual([...RED]);
    // 열린 쪽(브래킷 입구와 래소 경계 사이)도 경로가 닫아 주어 채워진다.
    expect(rgbaAt(result.imageData, 9, 4)).toEqual([...RED]);
    // 선 픽셀 자체는 칠하지 않는다.
    expect(rgbaAt(result.imageData, 3, 4)).toEqual([...CLEAR]);
    expect(rgbaAt(result.imageData, 5, 2)).toEqual([...CLEAR]);
    // 래소 밖은 절대 칠하지 않는다.
    expect(rgbaAt(result.imageData, 11, 4)).toEqual([...CLEAR]);
    expect(rgbaAt(result.imageData, 2, 8)).toEqual([...CLEAR]);
    expect(rgbaAt(result.imageData, 0, 0)).toEqual([...CLEAR]);
    // 입력 버퍼는 변경하지 않는다.
    expect(target.data).toEqual(targetBefore);
  });

  it("lineBoundary none이면 선을 무시하고 내부 전체를 채운다", () => {
    const reference = imageFromRows(OPEN_BRACKET_ROWS, LINE_PALETTE);
    const result = applyStudioLassoFill({
      target: solid(12, 10, CLEAR),
      referenceImage: reference,
      points: BRACKET_LASSO,
      fill: RED,
      options: { lineBoundary: "none" },
    });
    expect(result.diagnostics.status).toBe("applied");
    expect(result.diagnostics.paintedPixelCount).toBe(56);
    expect(rgbaAt(result.imageData, 3, 4)).toEqual([...RED]);
  });

  it("틈 메우기 반경이 선의 작은 틈을 닫아 틈 픽셀을 칠하지 않는다", () => {
    // x=5 세로 벽에 y=4..5 두 픽셀 틈이 있는 선화. 래소 오른쪽 채널은 반경보다 넓게 둔다
    // (닫기 연산이 벽과 래소 경계 사이의 좁은 채널까지 메우는 것은 기존 엔진과 같은 동작이라,
    // 여기서는 틈 자체의 효과만 분리해 본다).
    const rows = Array.from({ length: 10 }, (_, y) =>
      y === 4 || y === 5 ? ".............." : ".....#........",
    );
    const reference = imageFromRows(rows, LINE_PALETTE);
    const lasso: readonly StudioLassoFillPoint[] = [
      { x: 1, y: 1 },
      { x: 12, y: 1 },
      { x: 12, y: 8 },
      { x: 1, y: 8 },
    ];

    const open = applyStudioLassoFill({
      target: solid(14, 10, CLEAR),
      referenceImage: reference,
      points: lasso,
      fill: RED,
    });
    expect(rgbaAt(open.imageData, 5, 4)).toEqual([...RED]);
    // 내부 77px − 벽 5px = 72px.
    expect(open.diagnostics.paintedPixelCount).toBe(72);

    const closed = applyStudioLassoFill({
      target: solid(14, 10, CLEAR),
      referenceImage: reference,
      points: lasso,
      fill: RED,
      options: { closeGapRadius: 1 },
    });
    expect(closed.lasso.closeGapRadius).toBe(1);
    expect(rgbaAt(closed.imageData, 5, 4)).toEqual([...CLEAR]);
    expect(rgbaAt(closed.imageData, 5, 5)).toEqual([...CLEAR]);
    expect(closed.diagnostics.paintedPixelCount).toBe(70);
    // 틈에서 먼 내부 픽셀은 그대로 채워진다.
    expect(rgbaAt(closed.imageData, 2, 2)).toEqual([...RED]);
    expect(rgbaAt(closed.imageData, 10, 4)).toEqual([...RED]);
  });

  it("내부가 캔버스 대부분을 덮으면 누수 가드가 작동해 아무것도 칠하지 않는다", () => {
    const result = applyStudioLassoFill({
      target: solid(10, 10, CLEAR),
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      fill: RED,
    });
    expect(result.diagnostics.status).toBe("leak-guarded");
    expect(result.diagnostics.paintedPixelCount).toBe(0);
    expect(result.mask.every((value) => value === 0)).toBe(true);
    expect(rgbaAt(result.imageData, 5, 5)).toEqual([...CLEAR]);
  });

  it("내부가 전부 선이면 empty를 반환한다", () => {
    const result = applyStudioLassoFill({
      target: solid(6, 6, CLEAR),
      referenceImage: solid(6, 6, BLACK),
      points: [
        { x: 1, y: 1 },
        { x: 4, y: 1 },
        { x: 4, y: 4 },
        { x: 1, y: 4 },
      ],
      fill: RED,
    });
    expect(result.diagnostics.status).toBe("empty");
    expect(result.lasso.interiorPixelCount).toBe(9);
    expect(result.lasso.seed).toEqual({ x: 1, y: 1 });
  });

  it("연속 중복점과 닫힘 중복점을 정리해 같은 결과를 낸다", () => {
    const reference = imageFromRows(OPEN_BRACKET_ROWS, LINE_PALETTE);
    const result = applyStudioLassoFill({
      target: solid(12, 10, CLEAR),
      referenceImage: reference,
      points: [
        { x: 2, y: 1 },
        { x: 2, y: 1 },
        { x: 10, y: 1 },
        { x: 10, y: 8 },
        { x: 2, y: 8 },
        { x: 2, y: 1 },
      ],
      fill: RED,
    });
    expect(result.lasso.pointCount).toBe(4);
    expect(result.diagnostics.paintedPixelCount).toBe(40);
  });

  it("잘못된 입력은 엔진과 같은 방식으로 거부한다", () => {
    const target = solid(6, 6, CLEAR);
    expect(() =>
      applyStudioLassoFill({
        target,
        points: [
          { x: 1, y: 1 },
          { x: 4, y: 4 },
        ],
        fill: RED,
      }),
    ).toThrow(RangeError);
    expect(() =>
      applyStudioLassoFill({
        target,
        points: [
          { x: 1, y: 1 },
          { x: Number.NaN, y: 2 },
          { x: 4, y: 4 },
        ],
        fill: RED,
      }),
    ).toThrow(RangeError);
    expect(() =>
      applyStudioLassoFill({
        target,
        points: BRACKET_LASSO,
        fill: RED,
        options: { lineBoundary: "bogus" as never },
      }),
    ).toThrow(TypeError);
    expect(() =>
      applyStudioLassoFill({
        target,
        points: BRACKET_LASSO,
        fill: RED,
        options: { lineAlphaThreshold: 300 },
      }),
    ).toThrow(RangeError);
    expect(() =>
      applyStudioLassoFill({
        target,
        points: BRACKET_LASSO,
        fill: RED,
        options: { closeGapRadius: 99 },
      }),
    ).toThrow(RangeError);
  });

  it("기본값은 기존 채우기 엔진 기본값과 어긋나지 않는다", () => {
    expect(STUDIO_LASSO_FILL_DEFAULTS).toEqual({
      lineBoundary: "visible",
      lineAlphaThreshold: 0,
      closeGapRadius: 0,
      areaAdjustment: 0,
    });
  });
});
