import { describe, expect, it } from "vitest";

import {
  applyLassoFillLeftover,
  applyLeftoverPenStroke,
  fillLeftoverGaps,
} from "./studio-fill-leftover";

function createCanvas(
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

function setPx(
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

function getPx(
  img: { data: Uint8ClampedArray; width: number },
  x: number,
  y: number,
): [number, number, number, number] {
  const off = (y * img.width + x) * 4;
  return [img.data[off]!, img.data[off + 1]!, img.data[off + 2]!, img.data[off + 3]!];
}

describe("studio-fill-leftover", () => {
  it("올가미 내부의 작은 미채색 틈새를 어두운 선화를 넘지 않고 가장 가까운 주변 색(보로노이)으로 채운다", () => {
    const img = createCanvas(12, 12, [0, 0, 0, 0]);
    const RED = [230, 50, 50, 255] as const;
    const BLUE = [40, 100, 240, 255] as const;
    const INK = [10, 10, 10, 255] as const;

    // 2..9 구역 채색: x=5에 세로 검정 선화 장벽을 두고 왼쪽은 빨강, 오른쪽은 파랑으로 칠한다.
    for (let y = 2; y <= 9; y++) {
      for (let x = 2; x <= 9; x++) {
        if (x === 5) setPx(img, x, y, INK);
        else if (x < 5) setPx(img, x, y, RED);
        else setPx(img, x, y, BLUE);
      }
    }

    // 선화 바로 옆에 덜 칠해진 투명 구멍을 양쪽에 하나씩 남긴다.
    setPx(img, 4, 5, [0, 0, 0, 0]); // 빨강 영역 구멍(오른쪽은 검정 선화 x=5)
    setPx(img, 6, 5, [0, 0, 0, 0]); // 파랑 영역 구멍(왼쪽은 검정 선화 x=5)

    const res = applyLassoFillLeftover(
      img,
      [
        { x: 1, y: 1 },
        { x: 11, y: 1 },
        { x: 11, y: 11 },
        { x: 1, y: 11 },
      ],
      { maxGapAreaPx: 10 },
    );

    expect(res.filledIslandCount).toBe(2);
    expect(res.filledPixelCount).toBe(2);
    expect(getPx(res.imageData, 4, 5)).toEqual([...RED]);
    expect(getPx(res.imageData, 6, 5)).toEqual([...BLUE]);
    // 선화 픽셀 자체는 절대 덮어쓰이지 않는다.
    expect(getPx(res.imageData, 5, 5)).toEqual([...INK]);
    // 원본 버퍼 불변성 검증
    expect(getPx(img, 4, 5)).toEqual([0, 0, 0, 0]);
  });

  it("maxGapAreaPx를 초과하는 넓은 배경 미채색 영역은 건드리지 않는다", () => {
    const img = createCanvas(10, 10, [0, 0, 0, 0]);
    const GREEN = [60, 200, 90, 255] as const;
    for (let y = 1; y <= 8; y++) {
      for (let x = 1; x <= 8; x++) {
        setPx(img, x, y, GREEN);
      }
    }
    // 3x3 = 9px 미채색 구멍 vs 1x1 = 1px 미채색 구멍
    for (let y = 2; y <= 4; y++) {
      for (let x = 2; x <= 4; x++) {
        setPx(img, x, y, [0, 0, 0, 0]);
      }
    }
    setPx(img, 7, 7, [0, 0, 0, 0]);

    const res = fillLeftoverGaps({
      target: img,
      maxGapAreaPx: 4,
    });

    expect(res.filledIslandCount).toBe(1);
    expect(res.filledPixelCount).toBe(1);
    expect(getPx(res.imageData, 7, 7)).toEqual([...GREEN]);
    expect(getPx(res.imageData, 3, 3)).toEqual([0, 0, 0, 0]);
  });

  it("applyLeftoverPenStroke는 브러시가 지나간 궤적 안의 틈새만 선택적으로 메운다", () => {
    const img = createCanvas(12, 8, [255, 255, 255, 255]);
    const SKIN = [245, 205, 180, 255] as const;
    for (let y = 1; y <= 6; y++) {
      for (let x = 1; x <= 10; x++) {
        setPx(img, x, y, SKIN);
      }
    }
    // 흰 종이색 틈새 두 곳: (3, 3) 과 (9, 3)
    setPx(img, 3, 3, [255, 255, 255, 255]);
    setPx(img, 9, 3, [255, 255, 255, 255]);

    const res = applyLeftoverPenStroke(
      img,
      [
        { x: 2, y: 3.5 },
        { x: 4.5, y: 3.5 },
      ],
      2,
      { maxGapAreaPx: 8 },
    );

    expect(getPx(res.imageData, 3, 3)).toEqual([...SKIN]);
    // 브러시가 닿지 않은 (9, 3)은 그대로 흰색을 유지한다.
    expect(getPx(res.imageData, 9, 3)).toEqual([255, 255, 255, 255]);
  });
});
