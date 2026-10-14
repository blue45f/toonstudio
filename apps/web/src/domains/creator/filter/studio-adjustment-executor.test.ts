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
  normalizeBrightnessContrast,
  normalizePosterizeLevels,
  normalizeThresholdLevel,
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

const NEW_KINDS = [
  "brightness-contrast",
  "exposure",
  "vibrance",
  "invert",
  "posterize",
  "threshold",
] as const satisfies readonly StudioAdjustmentKind[];

describe("studio adjustment executor — 신규 6종 실행", () => {
  it("brightness-contrast: 밝기는 이동, 대비는 중간값 기준 확대, 알파 보존", () => {
    const brightened = makeImg([[100, 100, 100, 200]]);
    expect(applyStudioAdjustmentPixels(brightened, "brightness-contrast", { brightness: 75 })).toBe(true);
    // shift = 75/150*127.5 = 63.75 → 100 + 63.75 = 163.75 → 164
    expect(pixelAt(brightened, 0)).toEqual([164, 164, 164, 200]);

    const contrasted = makeImg([[100, 100, 100, 255]]);
    applyStudioAdjustmentPixels(contrasted, "brightness-contrast", { contrast: 50 });
    // (100 - 127.5) * 1.5 + 127.5 = 86.25 → 86
    expect(pixelAt(contrasted, 0)).toEqual([86, 86, 86, 255]);

    const identity = makeImg([[100, 100, 100, 255]]);
    applyStudioAdjustmentPixels(identity, "brightness-contrast", {});
    expect(pixelAt(identity, 0)).toEqual([100, 100, 100, 255]);
  });

  it("brightness-contrast 정규화: PSD 척도 밖 값은 -150..150 / -50..100으로 클램프", () => {
    expect(normalizeBrightnessContrast({ brightness: 999, contrast: -999 })).toEqual({
      brightness: 150,
      contrast: -50,
      useLegacy: false,
    });
    expect(normalizeBrightnessContrast({ brightness: "x", useLegacy: true }).useLegacy).toBe(true);
  });

  it("exposure: +1 EV는 채널을 2배로, gamma는 지수 보정을 적용한다(기존 실행기 위임)", () => {
    const img = makeImg([[64, 32, 255, 255]]);
    expect(applyStudioAdjustmentPixels(img, "exposure", { exposure: 1, gamma: 1, offset: 0 })).toBe(true);
    expect(pixelAt(img, 0)).toEqual([128, 64, 255, 255]);

    const gammaImg = makeImg([[64, 64, 64, 255]]);
    applyStudioAdjustmentPixels(gammaImg, "exposure", { exposure: 0, gamma: 2, offset: 0 });
    // (64/255)^(1/2) * 255 = 127.75 → 128
    expect(pixelAt(gammaImg, 0)).toEqual([128, 128, 128, 255]);
  });

  it("vibrance: saturation -100이면 휘도 그레이로 수렴한다(기존 실행기 위임)", () => {
    const img = makeImg([[255, 0, 0, 255]]);
    expect(applyStudioAdjustmentPixels(img, "vibrance", { vibrance: 0, saturation: -100 })).toBe(true);
    // L = 0.299*255 = 76.245 → 76
    expect(pixelAt(img, 0)).toEqual([76, 76, 76, 255]);

    const gray = makeImg([[128, 128, 128, 255]]);
    applyStudioAdjustmentPixels(gray, "vibrance", { vibrance: 100, saturation: 0 });
    expect(pixelAt(gray, 0)).toEqual([128, 128, 128, 255]);
  });

  it("invert: 채널을 255에서 뒤집고 알파는 그대로 둔다", () => {
    const img = makeImg([[10, 200, 255, 128]]);
    expect(applyStudioAdjustmentPixels(img, "invert", {})).toBe(true);
    expect(pixelAt(img, 0)).toEqual([245, 55, 0, 128]);
  });

  it("posterize: levels 구간으로 양자화한다", () => {
    const img = makeImg([[100, 200, 0, 255], [255, 64, 30, 255]]);
    expect(applyStudioAdjustmentPixels(img, "posterize", { levels: 4 })).toBe(true);
    // band=64, scale=85: 100→85, 200→255, 0→0 / 255→255, 64→85, 30→0
    expect(pixelAt(img, 0)).toEqual([85, 255, 0, 255]);
    expect(pixelAt(img, 1)).toEqual([255, 85, 0, 255]);
    expect(normalizePosterizeLevels({ levels: 999 })).toBe(255);
    expect(normalizePosterizeLevels({})).toBe(4);
  });

  it("threshold: 휘도가 level보다 작으면 검정, 같거나 크면 흰색(PSD 경계 규칙)", () => {
    const img = makeImg([[255, 0, 0, 255], [0, 255, 0, 200], [128, 128, 128, 255]]);
    expect(applyStudioAdjustmentPixels(img, "threshold", { level: 128 })).toBe(true);
    // 휘도: 빨강 76.245 < 128 → 검정 / 초록 149.685 ≥ 128 → 흰색 / 회색 128 ≥ 128 → 흰색
    expect(pixelAt(img, 0)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(img, 1)).toEqual([255, 255, 255, 200]);
    expect(pixelAt(img, 2)).toEqual([255, 255, 255, 255]);
    expect(normalizeThresholdLevel({ level: 0 })).toBe(1);
    expect(normalizeThresholdLevel({})).toBe(128);
  });

  it("디스패치: 신규 6종만 true, 기존 종류는 적용한 척하지 않고 false + 무변경", () => {
    expect([...STUDIO_ADJUSTMENT_EXECUTOR_KINDS]).toEqual([...NEW_KINDS]);
    for (const kind of ["levels", "curves", "hsl", "color-balance", "channel-mixer", "gradient-map", "lab"] as const) {
      const img = makeImg([[10, 20, 30, 255]]);
      expect(applyStudioAdjustmentPixels(img, kind, {})).toBe(false);
      expect(pixelAt(img, 0)).toEqual([10, 20, 30, 255]);
    }
  });
});

describe("studio adjustment executor — 효과 그래프 통합", () => {
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
