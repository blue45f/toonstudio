import { describe, expect, it } from "vitest";

import type { StudioImageDataLike } from "../studio-filters";

import {
  classifyStudioPsdEffectNode,
  validateStudioAdjustmentEffectGraph,
  type StudioAdjustmentEffectGraph,
  type StudioAdjustmentKind,
} from "./studio-adjustment-effect-graph";
import {
  applyStudioAdjustmentPixels,
  normalizeBlackWhite,
  parseCubeLut,
  STUDIO_ADJUSTMENT_EXECUTOR_KINDS,
} from "./studio-adjustment-executor";

function makeImg(pixels: readonly (readonly number[])[]): StudioImageDataLike {
  return {
    data: new Uint8ClampedArray(pixels.flatMap((pixel) => [...pixel])),
    width: pixels.length,
    height: 1,
  };
}

function pixelAt(img: StudioImageDataLike, index: number): number[] {
  return [...img.data.slice(index * 4, index * 4 + 4)];
}

const NEW_KINDS = ["black-white", "photo-filter", "selective-color", "color-lookup"] as const;

describe("studio adjustment executor — 전수 대응 4종 실행", () => {
  it("black-white: 순수 앵커 색은 가중% × 255, 무채색·흰색은 항등, 알파 보존", () => {
    const img = makeImg([
      [255, 0, 0, 200], // reds 40 → 102
      [255, 255, 0, 255], // yellows 60 → 153
      [0, 0, 255, 255], // blues 20 → 51
      [128, 128, 128, 255], // 무채색 항등
      [255, 255, 255, 255], // 흰색 항등
    ]);
    expect(applyStudioAdjustmentPixels(img, "black-white", {})).toBe(true);
    expect(pixelAt(img, 0)).toEqual([102, 102, 102, 200]);
    expect(pixelAt(img, 1)).toEqual([153, 153, 153, 255]);
    expect(pixelAt(img, 2)).toEqual([51, 51, 51, 255]);
    expect(pixelAt(img, 3)).toEqual([128, 128, 128, 255]);
    expect(pixelAt(img, 4)).toEqual([255, 255, 255, 255]);
  });

  it("black-white: 중간 색조는 헥스콘 분해로 계산한다", () => {
    const img = makeImg([[200, 100, 50, 255]]);
    applyStudioAdjustmentPixels(img, "black-white", {});
    // mn=50(중립) + (150-50)·reds40% + 50·yellows60% = 50+40+30 = 120
    expect(pixelAt(img, 0)).toEqual([120, 120, 120, 255]);
    expect(normalizeBlackWhite({ reds: 999 })).toMatchObject({ reds: 300 });
    expect(normalizeBlackWhite({})).toEqual({
      reds: 40, yellows: 60, greens: 40, cyans: 60, blues: 20, magentas: 80,
    });
  });

  it("black-white: 틴트는 회색에 틴트색 계수를 곱한다", () => {
    const img = makeImg([[255, 255, 255, 255]]);
    applyStudioAdjustmentPixels(img, "black-white", {
      useTint: true, tintColor: "#000000",
    });
    // gray 255 × (0.4 + 1.2·0) = 102
    expect(pixelAt(img, 0)).toEqual([102, 102, 102, 255]);
  });

  it("photo-filter: 기존 엔진 위임 — density 50·빨강·휘도 미보존이면 G/B만 절반", () => {
    const img = makeImg([[100, 100, 100, 255]]);
    expect(applyStudioAdjustmentPixels(img, "photo-filter", {
      color: "#ff0000", density: 50, preserveLuminosity: false,
    })).toBe(true);
    expect(pixelAt(img, 0)).toEqual([100, 50, 50, 255]);
  });

  it("photo-filter: density 0은 항등", () => {
    const img = makeImg([[10, 20, 30, 255]]);
    applyStudioAdjustmentPixels(img, "photo-filter", { color: "#ff0000", density: 0 });
    expect(pixelAt(img, 0)).toEqual([10, 20, 30, 255]);
  });

  it("selective-color absolute: reds에 cyan 100을 더하면 빨강이 제거된다", () => {
    const img = makeImg([[255, 0, 0, 255], [0, 0, 255, 255]]);
    expect(applyStudioAdjustmentPixels(img, "selective-color", {
      mode: "absolute", "range.reds": [100, 0, 0, 0],
    })).toBe(true);
    expect(pixelAt(img, 0)).toEqual([0, 0, 0, 255]);
    // 파랑 픽셀은 blues 범위에 보정이 없어 무변경
    expect(pixelAt(img, 1)).toEqual([0, 0, 255, 255]);
  });

  it("selective-color relative: 보정은 현재 채널량에 비례한다", () => {
    const img = makeImg([[128, 0, 0, 255]]);
    applyStudioAdjustmentPixels(img, "selective-color", {
      mode: "relative", "range.reds": [100, 0, 0, 0],
    });
    // c=127, relative +100% → +127 → c=254 → r=1
    expect(pixelAt(img, 0)).toEqual([1, 0, 0, 255]);
  });

  it("selective-color: 보정 범위가 없으면 항등", () => {
    const img = makeImg([[200, 30, 30, 255]]);
    applyStudioAdjustmentPixels(img, "selective-color", { mode: "absolute" });
    expect(pixelAt(img, 0)).toEqual([200, 30, 30, 255]);
  });

  it("color-lookup: .cube 항등 LUT는 픽셀을 유지하고 반전 LUT는 뒤집는다", () => {
    const identityCube = "LUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n";
    const bytes = [...new TextEncoder().encode(identityCube)];
    const img = makeImg([[255, 0, 128, 255]]);
    expect(applyStudioAdjustmentPixels(img, "color-lookup", { lutBytes: bytes })).toBe(true);
    expect(pixelAt(img, 0)).toEqual([255, 0, 128, 255]);

    const invertCube = "LUT_3D_SIZE 2\n1 1 1\n0 1 1\n1 0 1\n0 0 1\n1 1 0\n0 1 0\n1 0 0\n0 0 0\n";
    const invertBytes = [...new TextEncoder().encode(invertCube)];
    const img2 = makeImg([[255, 0, 0, 255]]);
    expect(applyStudioAdjustmentPixels(img2, "color-lookup", { lutBytes: invertBytes })).toBe(true);
    expect(pixelAt(img2, 0)).toEqual([0, 255, 255, 255]);
  });

  it("color-lookup: 데이터가 없거나 .cube가 아니면 false + 무변경 (적용한 척 금지)", () => {
    const img = makeImg([[10, 20, 30, 255]]);
    expect(applyStudioAdjustmentPixels(img, "color-lookup", {})).toBe(false);
    expect(pixelAt(img, 0)).toEqual([10, 20, 30, 255]);
    const img2 = makeImg([[10, 20, 30, 255]]);
    expect(applyStudioAdjustmentPixels(img2, "color-lookup", {
      lutBytes: [...new TextEncoder().encode("not a cube")],
    })).toBe(false);
    expect(pixelAt(img2, 0)).toEqual([10, 20, 30, 255]);
  });

  it("parseCubeLut: 크기·표 검증", () => {
    expect(parseCubeLut("LUT_3D_SIZE 2\n0 0 0\n")?.size).toBeUndefined();
    expect(parseCubeLut("hello")).toBeUndefined();
    const lut = parseCubeLut("TITLE \"x\"\nLUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n");
    expect(lut?.size).toBe(2);
    expect(lut?.table.length).toBe(24);
  });

  it("디스패치 목록은 10종이며 기존 종류는 여전히 false", () => {
    expect(STUDIO_ADJUSTMENT_EXECUTOR_KINDS).toHaveLength(10);
    for (const kind of ["levels", "curves", "hsl", "color-balance", "channel-mixer", "gradient-map", "lab"] as const) {
      const img = makeImg([[10, 20, 30, 255]]);
      expect(applyStudioAdjustmentPixels(img, kind, {})).toBe(false);
      expect(pixelAt(img, 0)).toEqual([10, 20, 30, 255]);
    }
  });
});

describe("studio adjustment executor — 전수 대응 4종 그래프 통합", () => {
  function graphWithAdjustment(kind: StudioAdjustmentKind): StudioAdjustmentEffectGraph {
    return {
      version: 1,
      id: `graph-${kind}`,
      revision: 0,
      outputNodeId: "output",
      nodes: [
        { id: "source", kind: "source", enabled: true, opacity: 1, blendMode: "normal", sourceHash: "sha", embedded: true },
        { id: "adjustment", kind: "adjustment", enabled: true, opacity: 1, blendMode: "normal", adjustment: kind, parameters: {}, colorSpace: "srgb" },
        { id: "output", kind: "output", enabled: true, opacity: 1, blendMode: "normal", outputColorSpace: "srgb" },
      ],
      edges: [
        { from: "source", to: "adjustment", input: "source" },
        { from: "adjustment", to: "output", input: "source" },
      ],
    };
  }

  it.each(NEW_KINDS.map((kind) => [kind] as const))(
    "%s: 그래프 검증 통과 + PSD 보존 분류가 editable",
    (kind) => {
      const graph = graphWithAdjustment(kind);
      expect(() => validateStudioAdjustmentEffectGraph(graph)).not.toThrow();
      expect(classifyStudioPsdEffectNode(graph.nodes[1]!)).toBe("editable");
    },
  );
});
