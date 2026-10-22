import { describe, expect, it } from "vitest";

import type { StudioImageDataLike } from "../studio-filters";
import type { El } from "../studio-element-model";
import {
  buildStudioLiveAdjustmentRenderTree,
  createStudioLiveAdjustment,
} from "../studio-live-adjustment";
import { mergePsdElementsWithAdjustments } from "../studio-psd-adjustment-commit";

import {
  createAdjustmentEl,
  patchAdjustmentLayer,
  planAdjustmentComposite,
  type AdjustmentElement,
} from "./studio-adjustment-layer-elements";
import {
  adjustmentMaskCoverageFromImageData,
  applyAdjustmentKindPixels,
  compositeAdjustmentPixels,
  executeAdjustmentElComposite,
  resolveAdjustmentCompositeBlendMode,
} from "./studio-adjustment-composite-executor";

function makeImg(pixels: readonly (readonly number[])[]): StudioImageDataLike {
  return {
    data: new Uint8ClampedArray(pixels.flatMap((pixel) => [...pixel])),
    width: pixels.length,
    height: 1,
  };
}

function pixelAt(img: StudioImageDataLike, index = 0): number[] {
  return [...img.data.slice(index * 4, index * 4 + 4)];
}

function adjustmentEl(
  id: string,
  kind: AdjustmentElement["adjustment"],
  parameters: AdjustmentElement["parameters"] = {},
  patch?: Parameters<typeof patchAdjustmentLayer>[2],
): AdjustmentElement {
  const base = createAdjustmentEl({ id, kind, pageWidth: 1, pageHeight: 1, parameters });
  const [el] = patch ? patchAdjustmentLayer([base], id, patch) : [base];
  if (!el || el.type !== "adjustment") throw new Error("unreachable");
  return el;
}

function rasterEl(id: string, groupId?: string): El {
  return {
    id, type: "image", x: 0, y: 0, width: 1, height: 1, rotation: 0,
    ...(groupId ? { groupId } : {}),
  } as unknown as El;
}

/** id → 단색 버퍼. 같은 인스턴스를 돌려줘 실행기가 원본을 건드리는지까지 본다. */
function solidRenderer(colors: Readonly<Record<string, readonly number[]>>) {
  const cache = new Map<string, StudioImageDataLike>();
  const renderContent = (element: El): StudioImageDataLike => {
    const cached = cache.get(element.id);
    if (cached) return cached;
    const img = makeImg([colors[element.id] ?? [0, 0, 0, 0]]);
    cache.set(element.id, img);
    return img;
  };
  return { renderContent, cache };
}

describe("applyAdjustmentKindPixels — 종류별 번역·디스패치", () => {
  it("levels: PSD 채널 파라미터가 전용 레벨 엔진으로 적용된다", () => {
    const img = makeImg([[10, 125, 240, 255]]);
    expect(applyAdjustmentKindPixels(img, "levels", {
      rgbShadowInput: 10, rgbHighlightInput: 240, rgbMidtoneInput: 1,
      rgbShadowOutput: 0, rgbHighlightOutput: 255,
    })).toBe(true);
    expect(pixelAt(img)).toEqual([0, 128, 255, 255]);
  });

  it("curves: 평탄 점 배열이 곡선 LUT로 적용된다", () => {
    const img = makeImg([[128, 255, 0, 255]]);
    expect(applyAdjustmentKindPixels(img, "curves", { rgbPoints: [0, 0, 255, 128] })).toBe(true);
    expect(pixelAt(img)).toEqual([64, 128, 0, 255]);
  });

  it("color-balance: 톤 영역 축이 1:1로 옮겨진다", () => {
    const img = makeImg([[128, 128, 128, 255]]);
    expect(applyAdjustmentKindPixels(img, "color-balance", {
      midtonesCyanRed: 100, midtonesMagentaGreen: 0, midtonesYellowBlue: 0,
    })).toBe(true);
    expect(pixelAt(img)).toEqual([255, 128, 128, 255]);
  });

  it("channel-mixer: % 행렬이 비율 행렬로 적용된다", () => {
    const img = makeImg([[10, 200, 30, 255]]);
    expect(applyAdjustmentKindPixels(img, "channel-mixer", {
      redFromRed: 0, redFromGreen: 100, redFromBlue: 0, redConstant: 0,
    })).toBe(true);
    expect(pixelAt(img)).toEqual([200, 200, 30, 255]);
  });

  it("gradient-map: 0..4096 위치 인코딩이 휘도 맵으로 적용된다", () => {
    const img = makeImg([[128, 128, 128, 255], [255, 0, 0, 255]]);
    expect(applyAdjustmentKindPixels(img, "gradient-map", {
      stops: "0:#000000:50,4096:#ffffff:50",
    })).toBe(true);
    expect(pixelAt(img, 0)).toEqual([128, 128, 128, 255]);
    expect(pixelAt(img, 1)).toEqual([76, 76, 76, 255]);
  });

  it("hsl: 마스터 채도 -100은 무채색으로, 색조 +120은 빨강을 초록으로 돌린다", () => {
    const gray = makeImg([[255, 0, 0, 255]]);
    expect(applyAdjustmentKindPixels(gray, "hsl", { hue: 0, saturation: -100, lightness: 0 })).toBe(true);
    expect(pixelAt(gray)).toEqual([128, 128, 128, 255]);
    const shifted = makeImg([[255, 0, 0, 255]]);
    expect(applyAdjustmentKindPixels(shifted, "hsl", { hue: 120, saturation: 0, lightness: 0 })).toBe(true);
    expect(pixelAt(shifted)).toEqual([0, 255, 0, 255]);
  });

  it("기존 실행기 10종으로 위임된다 (invert·black-white)", () => {
    const inverted = makeImg([[10, 20, 30, 255]]);
    expect(applyAdjustmentKindPixels(inverted, "invert", {})).toBe(true);
    expect(pixelAt(inverted)).toEqual([245, 235, 225, 255]);
    const bw = makeImg([[255, 0, 0, 255]]);
    expect(applyAdjustmentKindPixels(bw, "black-white", {})).toBe(true);
    expect(pixelAt(bw)).toEqual([102, 102, 102, 255]);
  });

  it("color-lookup: 데이터가 없으면 false+무변경, .cube가 있으면 적용", () => {
    const noData = makeImg([[10, 20, 30, 255]]);
    expect(applyAdjustmentKindPixels(noData, "color-lookup", {})).toBe(false);
    expect(pixelAt(noData)).toEqual([10, 20, 30, 255]);
    const invertCube = "LUT_3D_SIZE 2\n1 1 1\n0 1 1\n1 0 1\n0 0 1\n1 1 0\n0 1 0\n1 0 0\n0 0 0\n";
    const withData = makeImg([[255, 0, 0, 255]]);
    expect(applyAdjustmentKindPixels(withData, "color-lookup", {
      lutBytes: [...new TextEncoder().encode(invertCube)],
    })).toBe(true);
    expect(pixelAt(withData)).toEqual([0, 255, 255, 255]);
  });

  it("lab·스톱 없는 gradient-map은 적용한 척하지 않는다", () => {
    const lab = makeImg([[10, 20, 30, 255]]);
    expect(applyAdjustmentKindPixels(lab, "lab", {})).toBe(false);
    expect(pixelAt(lab)).toEqual([10, 20, 30, 255]);
    const gm = makeImg([[10, 20, 30, 255]]);
    expect(applyAdjustmentKindPixels(gm, "gradient-map", {})).toBe(false);
    expect(pixelAt(gm)).toEqual([10, 20, 30, 255]);
  });
});

describe("compositeAdjustmentPixels — 비파괴·불투명도·블렌드", () => {
  it("입력 버퍼를 변형하지 않고 새 버퍼에 적용한다", () => {
    const source = makeImg([[10, 20, 30, 255]]);
    const before = [...source.data];
    const { imageData, applied } = compositeAdjustmentPixels(source, adjustmentEl("a", "invert"));
    expect(applied).toBe(true);
    expect(pixelAt(imageData)).toEqual([245, 235, 225, 255]);
    expect([...source.data]).toEqual(before);
    expect(imageData.data).not.toBe(source.data);
  });

  it("opacity 0.5는 조정 결과와 원본의 중간값이다", () => {
    const source = makeImg([[10, 10, 10, 255]]);
    const { imageData } = compositeAdjustmentPixels(
      source, adjustmentEl("a", "invert", {}, { opacity: 0.5 }));
    expect(pixelAt(imageData)).toEqual([128, 128, 128, 255]);
  });

  it("blendMode multiply는 조정 결과를 원본과 곱해 섞는다", () => {
    const source = makeImg([[200, 200, 200, 255]]);
    const { imageData } = compositeAdjustmentPixels(
      source, adjustmentEl("a", "invert", {}, { blendMode: "multiply" }));
    // 반전 결과 55와 원본 200의 multiply = 200*55/255 ≈ 43
    expect(pixelAt(imageData)).toEqual([43, 43, 43, 255]);
    expect(resolveAdjustmentCompositeBlendMode("multiply")).toBe("multiply");
    expect(resolveAdjustmentCompositeBlendMode("source-over")).toBe("normal");
    expect(resolveAdjustmentCompositeBlendMode("pass-through")).toBe("normal");
  });

  it("비활성(hidden) 조정은 applied=false이고 픽셀은 원본 복제다", () => {
    const source = makeImg([[10, 20, 30, 255]]);
    const { imageData, applied } = compositeAdjustmentPixels(
      source, adjustmentEl("a", "invert", {}, { enabled: false }));
    expect(applied).toBe(false);
    expect(pixelAt(imageData)).toEqual([10, 20, 30, 255]);
  });

  it("데이터 없는 color-lookup은 applied=false이고 원본과 같다", () => {
    const source = makeImg([[10, 20, 30, 255]]);
    const { imageData, applied } = compositeAdjustmentPixels(
      source, adjustmentEl("a", "color-lookup", { lut3DFileName: "look.cube" }));
    expect(applied).toBe(false);
    expect(pixelAt(imageData)).toEqual([10, 20, 30, 255]);
  });
});

describe("렌더 트리 접기 — adjustment-el 노드와 라이브 조정 무회귀", () => {
  it("AdjustmentEl이 아래 요소들을 자식으로 접고, 클립이면 바로 아래 1개만 접는다", () => {
    const a = rasterEl("a");
    const b = rasterEl("b");
    const c = rasterEl("c");
    const tree = buildStudioLiveAdjustmentRenderTree(
      [a, b, adjustmentEl("adj", "invert"), c], () => true);
    expect(tree.map((node) => node.id)).toEqual(["adj", "c"]);
    expect(tree[0]).toMatchObject({
      kind: "adjustment-el", isolatedSource: false,
      children: [{ id: "a" }, { id: "b" }],
    });
    const clipped = buildStudioLiveAdjustmentRenderTree(
      [a, b, adjustmentEl("adj", "invert", {}, { clipToBelow: true }), c], () => true);
    expect(clipped.map((node) => node.id)).toEqual(["a", "adj", "c"]);
    expect(clipped[1]).toMatchObject({
      kind: "adjustment-el", isolatedSource: true, children: [{ id: "b" }],
    });
  });

  it("라이브 조정 레이어의 기존 접기 결과는 변하지 않는다", () => {
    const image = (id: string): El => ({
      ...createStudioLiveAdjustment(id, 800, 1080), adjustmentLayer: undefined,
    });
    const live = createStudioLiveAdjustment("adjust", 800, 1080);
    const tree = buildStudioLiveAdjustmentRenderTree(
      [image("a"), image("b"), live, image("c")], () => true);
    expect(tree.map((node) => node.id)).toEqual(["adjust", "c"]);
    expect(tree[0]).toMatchObject({ kind: "adjustment", children: [{ id: "a" }, { id: "b" }] });
  });

  it("숨긴 AdjustmentEl은 트리에서 빠져 합성에 닿지 않는다", () => {
    const hidden = adjustmentEl("adj", "invert", {}, { enabled: false });
    const tree = buildStudioLiveAdjustmentRenderTree(
      [rasterEl("a"), hidden], (element) => element.hidden !== true);
    expect(tree.map((node) => node.id)).toEqual(["a"]);
  });
});

describe("executeAdjustmentElComposite — 순서·범위·비파괴", () => {
  it("stackIndex 순서대로 실행된다 (PSD 병합 → 합성 종단)", () => {
    const els = mergePsdElementsWithAdjustments(
      [
        { stackIndex: 0, elements: [rasterEl("bottom")] },
        { stackIndex: 2, elements: [rasterEl("top")] },
      ],
      [
        { id: "adj-invert", name: "반전", kind: "invert", parameters: {}, notes: [], stackIndex: 1 },
        { id: "adj-threshold", name: "임계값", kind: "threshold", parameters: { level: 128 }, notes: [], stackIndex: 3 },
      ],
      { width: 1, height: 1 },
    );
    expect(els.map((el) => el.id)).toEqual(["bottom", "adj-invert", "top", "adj-threshold"]);
    const { renderContent, cache } = solidRenderer({
      bottom: [255, 0, 0, 255],
      top: [0, 0, 255, 128],
    });
    const { imageData, trace } = executeAdjustmentElComposite(els, {
      width: 1, height: 1, renderContent,
    });
    // 아래만 반전(빨강→청록) → 위에 반투명 파랑 → 임계값: 휘도 104 < 128이라 검정.
    expect(pixelAt(imageData)).toEqual([0, 0, 0, 255]);
    expect(trace.map((entry) => entry.layerId)).toEqual(["adj-invert", "adj-threshold"]);
    expect(trace.every((entry) => entry.applied)).toBe(true);
    // 렌더러가 돌려준 원본 버퍼는 합성이 변형하지 않는다.
    expect(pixelAt(cache.get("bottom")!)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(cache.get("top")!)).toEqual([0, 0, 255, 128]);
    // 플래너의 단계 순서와 실행기의 실행 순서가 일치한다.
    const plan = planAdjustmentComposite(els, {
      graphIdPrefix: "doc:page", revision: 1, compositeSourceHashFor: () => "hash",
    });
    expect(plan.filter((step) => step.type === "adjustment").map((step) =>
      step.type === "adjustment" ? step.layerId : "")).toEqual(["adj-invert", "adj-threshold"]);
  });

  it("조정을 끄면(hidden) 원본 합성 그대로 복원된다", () => {
    const bottom = rasterEl("bottom");
    const top = rasterEl("top");
    const { renderContent } = solidRenderer({
      bottom: [255, 0, 0, 255],
      top: [0, 0, 255, 128],
    });
    const plain = executeAdjustmentElComposite([bottom, top], {
      width: 1, height: 1, renderContent,
    });
    expect(pixelAt(plain.imageData)).toEqual([127, 0, 128, 255]);
    const hidden = adjustmentEl("adj", "invert", {}, { enabled: false });
    const withHidden = executeAdjustmentElComposite([bottom, hidden, top], {
      width: 1, height: 1, renderContent,
    });
    expect(pixelAt(withHidden.imageData)).toEqual([127, 0, 128, 255]);
    expect(withHidden.trace).toEqual([]);
  });

  it("클립 조정은 바로 아래 레이어에만, 비클립은 아래 합성 전체에 닿는다", () => {
    const a = rasterEl("a");
    const b = rasterEl("b");
    const colors = { a: [0, 255, 0, 128], b: [255, 0, 0, 128] };
    const clipped = executeAdjustmentElComposite(
      [a, b, adjustmentEl("adj", "invert", {}, { clipToBelow: true })],
      { width: 1, height: 1, renderContent: solidRenderer(colors).renderContent },
    );
    // b만 반전(0,255,255,128)을 a(0,255,0,128) 위에 얹은 값.
    expect(pixelAt(clipped.imageData)).toEqual([0, 255, 170, 192]);
    expect(clipped.trace[0]?.clipToBelow).toBe(true);
    const unclipped = executeAdjustmentElComposite(
      [a, b, adjustmentEl("adj", "invert")],
      { width: 1, height: 1, renderContent: solidRenderer(colors).renderContent },
    );
    // a·b 합성(170,85,0,192) 전체를 반전한 값 — 클립 결과와 달라야 한다.
    expect(pixelAt(unclipped.imageData)).toEqual([85, 170, 255, 192]);
    expect(unclipped.trace[0]?.clipToBelow).toBe(false);
  });

  it("폴더(그룹) 안 조정은 폴더 밖 아래 레이어에 닿지 않는다", () => {
    const outside = rasterEl("outside");
    const inside = rasterEl("inside", "folder");
    const adj = { ...adjustmentEl("adj", "invert"), groupId: "folder" } as El;
    const { imageData, trace } = executeAdjustmentElComposite(
      [outside, inside, adj],
      {
        width: 1, height: 1,
        renderContent: solidRenderer({
          outside: [10, 20, 30, 255],
          inside: [200, 100, 50, 128],
        }).renderContent,
      },
    );
    // 폴더 안 inside만 반전(55,155,205,128)해 outside 위에 얹은 값.
    expect(pixelAt(imageData)).toEqual([33, 88, 118, 255]);
    expect(trace.map((entry) => entry.layerId)).toEqual(["adj"]);
  });

  it("라이브 조정 레이어가 섞이면 조용히 건너뛰지 않고 실패로 닫는다", () => {
    const live = {
      id: "live", type: "image", x: 0, y: 0, width: 1, height: 1, rotation: 0,
      src: "data:image/png;base64,AAAA",
      adjustmentLayer: { version: 1, scope: "composite-below" },
    } as unknown as El;
    expect(() => executeAdjustmentElComposite([rasterEl("a"), live], {
      width: 1, height: 1, renderContent: solidRenderer({ a: [1, 2, 3, 255] }).renderContent,
    })).toThrow(/studio-adjustment-layer-runtime/);
  });
});

describe("color-balance preserveLuminosity — PSD 파라미터 종단", () => {
  it("preserveLuminosity:true면 휘도를 보존하고, 없으면 기존 결과다", () => {
    const preserved = makeImg([[128, 128, 128, 255]]);
    expect(applyAdjustmentKindPixels(preserved, "color-balance", {
      midtonesCyanRed: 100, midtonesMagentaGreen: 0, midtonesYellowBlue: 0,
      preserveLuminosity: true,
    })).toBe(true);
    expect(pixelAt(preserved)).toEqual([197, 99, 99, 255]);
    const plain = makeImg([[128, 128, 128, 255]]);
    expect(applyAdjustmentKindPixels(plain, "color-balance", {
      midtonesCyanRed: 100, midtonesMagentaGreen: 0, midtonesYellowBlue: 0,
    })).toBe(true);
    expect(pixelAt(plain)).toEqual([255, 128, 128, 255]);
    const off = makeImg([[128, 128, 128, 255]]);
    expect(applyAdjustmentKindPixels(off, "color-balance", {
      midtonesCyanRed: 100, preserveLuminosity: false,
    })).toBe(true);
    expect(pixelAt(off)).toEqual([255, 128, 128, 255]);
  });

  it("compositeAdjustmentPixels 경로(블렌드·불투명도 합성)에서도 보존된다", () => {
    const source = makeImg([[128, 128, 128, 255]]);
    const el = adjustmentEl("cb", "color-balance", {
      midtonesCyanRed: 100, preserveLuminosity: true,
    });
    const { imageData, applied } = compositeAdjustmentPixels(source, el);
    expect(applied).toBe(true);
    expect(pixelAt(imageData)).toEqual([197, 99, 99, 255]);
  });
});

describe("마스크 커버리지 — compositeAdjustmentPixels", () => {
  const maskOf = (values: readonly number[]) => ({
    width: values.length,
    height: 1,
    data: new Uint8ClampedArray(values),
  });

  it("마스크 0인 픽셀은 조정 제외, 255인 픽셀은 전면 적용", () => {
    const source = makeImg([[10, 20, 30, 255], [10, 20, 30, 255]]);
    const { imageData, applied } = compositeAdjustmentPixels(
      source, adjustmentEl("a", "invert"), maskOf([0, 255]));
    expect(applied).toBe(true);
    expect(pixelAt(imageData, 0)).toEqual([10, 20, 30, 255]);
    expect(pixelAt(imageData, 1)).toEqual([245, 235, 225, 255]);
  });

  it("마스크 중간값은 opacity와 곱해진다 (255마스크·opacity 1 vs 128마스크)", () => {
    const source = makeImg([[10, 10, 10, 255]]);
    const { imageData } = compositeAdjustmentPixels(
      source, adjustmentEl("a", "invert"), maskOf([128]));
    // 반전 245와 원본 10을 128/255만큼 섞은 값.
    expect(pixelAt(imageData)).toEqual([128, 128, 128, 255]);
  });

  it("마스크가 있어도 알파는 변하지 않고 입력 버퍼는 불변이다", () => {
    const source = makeImg([[10, 20, 30, 128]]);
    const before = [...source.data];
    const { imageData } = compositeAdjustmentPixels(
      source, adjustmentEl("a", "invert"), maskOf([255]));
    expect(pixelAt(imageData)).toEqual([245, 235, 225, 128]);
    expect([...source.data]).toEqual(before);
  });

  it("크기가 다른 마스크는 조용히 어긋나지 않고 실패로 닫는다", () => {
    const source = makeImg([[10, 20, 30, 255]]);
    expect(() => compositeAdjustmentPixels(
      source, adjustmentEl("a", "invert"), maskOf([255, 255]))).toThrow(/마스크 크기 불일치/);
  });

  it("adjustmentMaskCoverageFromImageData는 알파를 커버리지로 뽑고 최근접 재투영한다", () => {
    const maskImg = makeImg([[255, 255, 255, 0], [255, 255, 255, 200]]);
    const same = adjustmentMaskCoverageFromImageData(maskImg);
    expect([...same.data]).toEqual([0, 200]);
    const widened = adjustmentMaskCoverageFromImageData(maskImg, 4, 1);
    expect([...widened.data]).toEqual([0, 0, 200, 200]);
  });

  it("executeAdjustmentElComposite는 maskCoverageFor가 준 마스크를 조정 단계에 적용한다", () => {
    const bottom = rasterEl("bottom");
    const adj = adjustmentEl("adj", "invert");
    const { imageData, trace } = executeAdjustmentElComposite([bottom, adj], {
      width: 2,
      height: 1,
      renderContent: () => makeImg([[10, 20, 30, 255], [10, 20, 30, 255]]),
      maskCoverageFor: (element) => element.id === "adj" ? maskOf([255, 0]) : undefined,
    });
    expect(pixelAt(imageData, 0)).toEqual([245, 235, 225, 255]);
    expect(pixelAt(imageData, 1)).toEqual([10, 20, 30, 255]);
    expect(trace).toEqual([{ layerId: "adj", kind: "invert", applied: true, clipToBelow: false }]);
  });
});
