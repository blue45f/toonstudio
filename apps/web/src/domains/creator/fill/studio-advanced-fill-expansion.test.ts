import { describe, expect, it } from "vitest";

import {
  applyAdvancedFillPostExpansion,
  expandFillMaskWithRidgeStop,
  filterFillReferenceLayers,
  soakNarrowSliversInMask,
} from "./studio-advanced-fill-expansion";

function makeImage(width: number, height: number, gray = 255): {
  data: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = gray;
    data[i * 4 + 1] = gray;
    data[i * 4 + 2] = gray;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

describe("studio-advanced-fill-expansion", () => {
  it("expand-to-darkest-pixel은 안티에일리어싱 먹선 중심(최암부)까지만 확장하고 선 반대편으로는 새지 않는다", () => {
    // 폭 11, 높이 3: x=0..2 채움 마스크, x=3(180), x=4(90), x=5(20, 최암부 능선), x=6(100), x=7..10(255 반대편 영역)
    const ref = makeImage(11, 3, 255);
    const profile = [255, 255, 255, 180, 90, 20, 100, 255, 255, 255, 255];
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 11; x++) {
        const g = profile[x]!;
        const off = (y * 11 + x) * 4;
        ref.data[off] = g;
        ref.data[off + 1] = g;
        ref.data[off + 2] = g;
        ref.data[off + 3] = 255;
      }
    }

    const mask = new Uint8Array(11 * 3);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x <= 2; x++) mask[y * 11 + x] = 255;
    }

    // expandPx=6 으로 크게 주더라도 능선 중심 x=5에서 멈추고 x=6 이후로는 절대 넘어가면 안 된다.
    const ridgeStopped = expandFillMaskWithRidgeStop(mask, 11, 3, {
      expandPx: 6,
      expandType: "expand-to-darkest-pixel",
      kernelShape: "square",
      referenceImage: ref,
    });
    expect(ridgeStopped[1 * 11 + 3]).toBe(255);
    expect(ridgeStopped[1 * 11 + 4]).toBe(255);
    expect(ridgeStopped[1 * 11 + 5]).toBe(255);
    expect(ridgeStopped[1 * 11 + 6]).toBe(0);
    expect(ridgeStopped[1 * 11 + 7]).toBe(0);
  });

  it("round 커널과 square 커널이 대각선 모서리에서 서로 다른 기하학적 반경을 형성한다", () => {
    const mask = new Uint8Array(9 * 9);
    mask[4 * 9 + 4] = 255; // 중심 (4, 4)

    const round = expandFillMaskWithRidgeStop(mask, 9, 9, {
      expandPx: 2,
      kernelShape: "round",
    });
    const square = expandFillMaskWithRidgeStop(mask, 9, 9, {
      expandPx: 2,
      kernelShape: "square",
    });

    // (6, 6)은 dx=2, dy=2 이므로 유클리드 거리 sqrt(8)=2.828 > 2 → round에서는 0, square에서는 255!
    expect(round[6 * 9 + 6]).toBe(0);
    expect(square[6 * 9 + 6]).toBe(255);
    // 축 방향 (6, 4)는 둘 다 거리 2 이므로 모두 255
    expect(round[4 * 9 + 6]).toBe(255);
    expect(square[4 * 9 + 6]).toBe(255);
  });

  it("soakNarrowSliversInMask는 선화 장벽으로 둘러싸인 좁은 V자 틈새 내부를 메운다", () => {
    const ref = makeImage(9, 9, 255);
    const mask = new Uint8Array(9 * 9);
    // 위쪽 넓은 영역 채움
    for (let y = 1; y <= 3; y++) {
      for (let x = 2; x <= 6; x++) mask[y * 9 + x] = 255;
    }
    // 아래쪽 좁은 틈새 양옆(x=3, x=5)을 검정 먹선 장벽으로 감싸고 x=4, y=4..5 를 미채색 틈새로 둔다.
    for (const [bx, by] of [
      [3, 4],
      [5, 4],
      [3, 5],
      [5, 5],
      [4, 6],
    ] as const) {
      const off = (by * 9 + bx) * 4;
      ref.data[off] = 0;
      ref.data[off + 1] = 0;
      ref.data[off + 2] = 0;
    }

    const soaked = soakNarrowSliversInMask(mask, 9, 9, {
      sliverRadiusPx: 2,
      referenceImage: ref,
    });
    expect(soaked[4 * 9 + 4]).toBe(255);
    expect(soaked[5 * 9 + 4]).toBe(255);
    // 먹선 장벽 자체는 침범하지 않는다.
    expect(soaked[4 * 9 + 3]).toBe(0);
  });

  it("FillUseNotStartColor가 시드 차단 및 확장 경계 보호를 동시에 수행하고 레이어 역할 제외 필터가 정확히 동작한다", () => {
    const target = makeImage(5, 3, 255);
    // x=3 열을 제외 색상(마젠타 가이드선 [255, 0, 255])으로 칠한다.
    for (let y = 0; y < 3; y++) {
      const off = (y * 5 + 3) * 4;
      target.data[off] = 255;
      target.data[off + 1] = 0;
      target.data[off + 2] = 255;
    }

    const seedMask = new Uint8Array(15);
    seedMask[1 * 5 + 2] = 255;

    // 1) 제외 색상 위에서 시드를 찍으면 즉시 차단
    const blocked = applyAdvancedFillPostExpansion({
      mask: seedMask,
      target,
      fill: [0, 200, 100, 255],
      seed: { x: 3, y: 1 },
      useNotStartColor: true,
      notStartColor: [255, 0, 255],
    });
    expect(blocked.blockedByNotStartColor).toBe(true);
    expect(blocked.paintedPixelCount).toBe(0);

    // 2) 인접 영역에서 확장할 때도 마젠타 제외 색상은 침범하지 않는다.
    const guarded = applyAdvancedFillPostExpansion({
      mask: seedMask,
      target,
      fill: [0, 200, 100, 255],
      seed: { x: 2, y: 1 },
      expandPx: 2,
      kernelShape: "square",
      useNotStartColor: true,
      notStartColor: [255, 0, 255],
    });
    expect(guarded.blockedByNotStartColor).toBe(false);
    expect(guarded.mask[1 * 5 + 3]).toBe(0);

    // 3) 레이어 역할별 제외 필터
    const filtered = filterFillReferenceLayers(
      [
        { id: "ink", role: "lineart", visible: true },
        { id: "dlg", role: "text", visible: true },
        { id: "sketch", isDraft: true, visible: true },
        { id: "lck", role: "normal", locked: true, visible: true },
        { id: "bg", role: "paper", visible: true },
      ],
      { excludeText: true, excludeDraft: true, excludeLocked: true, excludePaper: true },
    );
    expect(filtered.map((l) => l.id)).toEqual(["ink"]);
  });
});
