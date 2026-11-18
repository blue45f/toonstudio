import { describe, expect, it } from "vitest";

import { applyDustRemoval, selectDustMask } from "./studio-dust-removal";

import type { StudioImageDataLike } from "../studio-filters";

function createBlankImage(
  width: number,
  height: number,
  fill: readonly [number, number, number, number] = [0, 0, 0, 0],
): StudioImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = fill[0];
    data[i * 4 + 1] = fill[1];
    data[i * 4 + 2] = fill[2];
    data[i * 4 + 3] = fill[3];
  }
  return { width, height, data };
}

function setPixel(
  img: StudioImageDataLike,
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

describe("studio-dust-removal (PIDust spec)", () => {
  it("8-연결 성분의 bboxWidth <= dustSize 이고 bboxHeight <= dustSize 일 때만 먼지로 제거한다", () => {
    const img = createBlankImage(16, 16);
    // 1) 대각선으로 8-연결된 3x3 먼지 (bbox 3x3 <= 3 -> 제거 대상)
    setPixel(img, 2, 2, [10, 10, 10, 255]);
    setPixel(img, 3, 3, [10, 10, 10, 255]);
    setPixel(img, 4, 4, [10, 10, 10, 255]);

    // 2) 가로 4px 얇은 선분 (픽셀 수는 작아도 bboxWidth = 4 > 3 -> 보존 대상!)
    for (let x = 8; x <= 11; x += 1) {
      setPixel(img, x, 5, [20, 20, 20, 255]);
    }

    const maskRes = selectDustMask(img, { dustSize: 3, mode: "remove-from-transparency" });
    expect(maskRes.componentCount).toBe(1);
    expect(maskRes.pixelCount).toBe(3);

    const cleaned = applyDustRemoval(img, { dustSize: 3, mode: "remove-from-transparency" });
    expect(cleaned.data[(2 * 16 + 2) * 4 + 3]).toBe(0);
    expect(cleaned.data[(3 * 16 + 3) * 4 + 3]).toBe(0);
    expect(cleaned.data[(4 * 16 + 4) * 4 + 3]).toBe(0);
    // 4x1 선분은 손상 없이 유지된다.
    expect(cleaned.data[(5 * 16 + 8) * 4 + 3]).toBe(255);
    expect(cleaned.data[(5 * 16 + 11) * 4 + 3]).toBe(255);
  });

  it("(dustSize + 1) 패딩 외곽 경계 밖으로 이어지는 ROI 경계 선분은 먼지로 오탐하지 않는다", () => {
    const img = createBlankImage(20, 20);
    // ROI는 [6..14, 6..14]. ROI 안쪽에는 (6,10) 1픽셀만 걸치지만 바깥 x=1..6 까지 이어진 긴 선분
    for (let x = 1; x <= 6; x += 1) {
      setPixel(img, x, 10, [0, 0, 0, 255]);
    }
    // ROI 내부 순수 2x2 먼지
    setPixel(img, 10, 10, [0, 0, 0, 255]);
    setPixel(img, 11, 11, [0, 0, 0, 255]);

    const cleaned = applyDustRemoval(img, {
      dustSize: 3,
      mode: "remove-from-transparency",
      roi: { x: 6, y: 6, width: 9, height: 9 },
    });

    // (dustSize + 1) = 4 패딩 외곽(x = 2)까지 이어진 선분 끝 (6, 10)은 지워지지 않는다.
    expect(cleaned.data[(10 * 20 + 6) * 4 + 3]).toBe(255);
    // ROI 안쪽 고립 2x2 티끌은 지워진다.
    expect(cleaned.data[(10 * 20 + 10) * 4 + 3]).toBe(0);
    expect(cleaned.data[(11 * 20 + 11) * 4 + 3]).toBe(0);
  });

  it("흰색 배경에서 먼지 제거(remove-from-white) 모드가 작은 먹 티끌을 순백으로 덮는다", () => {
    const img = createBlankImage(12, 12, [255, 255, 255, 255]);
    setPixel(img, 5, 5, [30, 25, 20, 255]);
    setPixel(img, 6, 5, [40, 35, 30, 255]);

    const cleaned = applyDustRemoval(img, {
      dustSize: 2,
      mode: "remove-from-white",
    });

    expect([...cleaned.data.slice((5 * 12 + 5) * 4, (5 * 12 + 5) * 4 + 4)]).toEqual([
      255, 255, 255, 255,
    ]);
  });

  it("주변 색으로 빈틈 메우기(fill-gaps-surrounding)는 1px 외곽 둘레 최빈 색으로 채운다", () => {
    const img = createBlankImage(12, 12, [240, 190, 160, 255]); // 피부색 바탕
    // (5,5) 1픽셀 투명 빈틈 생성
    setPixel(img, 5, 5, [0, 0, 0, 0]);
    // 8개 외곽 둘레 중 2개만 다른 색(파란 그림자), 나머지 6개는 피부색(240,190,160,255)
    setPixel(img, 4, 4, [40, 60, 180, 255]);
    setPixel(img, 5, 4, [40, 60, 180, 255]);

    const filled = applyDustRemoval(img, {
      dustSize: 2,
      mode: "fill-gaps-surrounding",
    });

    expect([...filled.data.slice((5 * 12 + 5) * 4, (5 * 12 + 5) * 4 + 4)]).toEqual([
      240, 190, 160, 255,
    ]);
  });

  it("전경색으로 빈틈 메우기(fill-gaps-foreground)는 외곽 대형 투명 배경은 두고 내부 실구멍만 메운다", () => {
    const img = createBlankImage(14, 14, [0, 0, 0, 0]);
    for (let y = 3; y <= 10; y += 1) {
      for (let x = 3; x <= 10; x += 1) {
        setPixel(img, x, y, [80, 90, 100, 255]);
      }
    }
    // 칠 내부 2x1 실구멍
    setPixel(img, 6, 6, [0, 0, 0, 0]);
    setPixel(img, 7, 6, [0, 0, 0, 0]);

    const filled = applyDustRemoval(img, {
      dustSize: 3,
      mode: "fill-gaps-foreground",
      foregroundColor: "#ef4444",
    });

    expect([...filled.data.slice((6 * 14 + 6) * 4, (6 * 14 + 6) * 4 + 4)]).toEqual([
      239, 68, 68, 255,
    ]);
    // 바깥 투명 여백은 그대로 투명 유지
    expect(filled.data[3]).toBe(0);
  });
});
