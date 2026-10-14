// @vitest-environment jsdom

import { readPsd, type AdjustmentLayer } from "ag-psd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { studioKonvaRuntime as Konva } from "../render/studio-konva-runtime";
import { convertPsdAdjustmentLayer } from "../studio-psd-adjustment-import";

import { convertStudioAdjustmentToPsd } from "./studio-psd-adjustment-export";
import { exportPagePsd, type PsdExportEl } from "./studio-psd-export";

/**
 * PSD → Studio → PSD 라운드트립 대칭 검증.
 * 가져오기 변환(convertPsdAdjustmentLayer)이 만든 kind·parameters 를 내보내기
 * 역변환(convertStudioAdjustmentToPsd)에 넣으면 원래 ag-psd 조정이 복원돼야 하고,
 * exportPagePsd 로 실제 PSD 바이트를 경유해도 종류·파라미터가 그대로여야 한다.
 * 픽스처는 Photoshop이 실제로 기록하는 형태(전 채널 명시)로 둔다 — 채널이 비어
 * 있으면 ag-psd 읽기가 기본 채널을 채워 넣으므로 그 경우까지 같을 수는 없다.
 */
const PSD_FIXTURES: readonly AdjustmentLayer[] = [
  {
    type: "levels",
    rgb: { shadowInput: 10, highlightInput: 240, shadowOutput: 0, highlightOutput: 255, midtoneInput: 1.2 },
    red: { shadowInput: 5, highlightInput: 250, shadowOutput: 2, highlightOutput: 253, midtoneInput: 0.9 },
    green: { shadowInput: 0, highlightInput: 255, shadowOutput: 0, highlightOutput: 255, midtoneInput: 1 },
    blue: { shadowInput: 20, highlightInput: 230, shadowOutput: 10, highlightOutput: 245, midtoneInput: 1.1 },
  },
  {
    type: "curves",
    rgb: [{ input: 0, output: 10 }, { input: 128, output: 140 }, { input: 255, output: 255 }],
    blue: [{ input: 0, output: 0 }, { input: 255, output: 200 }],
  },
  {
    type: "hue/saturation",
    master: { a: 0, b: 0, c: 0, d: 0, hue: 15, saturation: -20, lightness: 5 },
    reds: { a: 315, b: 345, c: 15, d: 45, hue: 10, saturation: 5, lightness: -5 },
  },
  {
    type: "color balance",
    shadows: { cyanRed: -10, magentaGreen: 5, yellowBlue: 20 },
    midtones: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 },
    highlights: { cyanRed: 15, magentaGreen: -5, yellowBlue: -10 },
    preserveLuminosity: true,
  },
  {
    type: "channel mixer",
    red: { red: 100, green: 0, blue: 0, constant: 0 },
    green: { red: 10, green: 90, blue: 0, constant: 5 },
    blue: { red: 0, green: 0, blue: 100, constant: 0 },
    gray: { red: 30, green: 59, blue: 11, constant: 0 },
    monochrome: false,
  },
  {
    type: "gradient map",
    gradientType: "solid",
    reverse: true,
    dither: false,
    colorStops: [
      { color: { r: 0, g: 0, b: 0 }, location: 0, midpoint: 50 },
      { color: { r: 255, g: 128, b: 0 }, location: 4096, midpoint: 50 },
    ],
  },
];

describe("PSD 조정 레이어 변환 라운드트립 (PSD → Studio → PSD)", () => {
  it.each(PSD_FIXTURES.map((fixture) => [fixture.type, fixture] as const))(
    "%s: 가져오기 변환 후 역변환하면 원래 파라미터가 복원된다",
    (_type, fixture) => {
      const imported = convertPsdAdjustmentLayer(fixture);
      expect(imported.status).toBe("converted");
      if (imported.status !== "converted") return;
      const exported = convertStudioAdjustmentToPsd(imported.kind, imported.parameters);
      expect(exported.status).toBe("converted");
      if (exported.status !== "converted") return;
      expect(exported.adjustment).toEqual(fixture);
    },
  );

  it("PSD 대응 종류가 없는 Studio 조정(lab)은 unsupported 로 정직하게 돌아온다", () => {
    const exported = convertStudioAdjustmentToPsd("lab", { lightness: 10 });
    expect(exported.status).toBe("unsupported");
    if (exported.status !== "unsupported") return;
    expect(exported.kind).toBe("lab");
    expect(exported.reason).toContain("PSD 조정 레이어");
  });
});

describe("PSD 내보내기 조정 레이어 라운드트립 (exportPagePsd 경유)", () => {
  let stage: InstanceType<typeof Konva.Stage>;
  let container: HTMLDivElement;

  beforeEach(() => {
    const context = new Proxy({}, {
      get: (_target, key) => {
        if (key === "getImageData") return (_x: number, _y: number, width: number, height: number) => ({
          width, height, data: new Uint8ClampedArray(width * height * 4),
        });
        if (key === "createImageData") return (width: number, height: number) => ({
          width, height, data: new Uint8ClampedArray(width * height * 4),
        });
        return () => undefined;
      },
      set: () => true,
    }) as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      ((id: string) => id === "2d" ? context : null) as HTMLCanvasElement["getContext"],
    );
    container = document.createElement("div");
    document.body.appendChild(container);
    stage = new Konva.Stage({ container, width: 16, height: 24 });
  });

  afterEach(() => {
    stage.destroy(); container.remove(); vi.restoreAllMocks();
  });

  const elements: PsdExportEl[] = [
    {
      id: "adj-levels", type: "adjustment", x: 0, y: 0, width: 16, height: 24,
      name: "레벨 보정", adjustment: "levels", clipToBelow: false,
      parameters: {
        rgbShadowInput: 10, rgbHighlightInput: 240, rgbShadowOutput: 0,
        rgbHighlightOutput: 255, rgbMidtoneInput: 1.2,
      },
    },
    {
      id: "adj-curves", type: "adjustment", x: 0, y: 0, width: 16, height: 24,
      name: "곡선 보정", adjustment: "curves", clipToBelow: true,
      opacity: 0.5, blendMode: "multiply",
      parameters: { rgbPoints: [0, 10, 128, 140, 255, 255] },
    },
  ];

  it("조정 레이어가 네이티브 PSD 조정 레이어로 기록되고 다시 읽으면 종류·파라미터가 유지된다", async () => {
    const result = await exportPagePsd(stage, elements, 16, 24, 1, { scale: 1 });
    expect(result.skipped).toEqual([]);
    expect(result.layerCount).toBe(2);
    expect(result.lossManifest!.decisions).toContainEqual(expect.objectContaining({
      feature: "adjustment-layer", disposition: "preserved", count: 2,
    }));

    const psd = readPsd(await result.blob.arrayBuffer(), {
      useImageData: true, skipCompositeImageData: true,
    });
    // ag-psd children 은 위→아래(Studio 순서의 역순).
    expect(psd.children).toHaveLength(2);
    const [top, bottom] = psd.children!;
    expect(top!.name).toBe("곡선 보정");
    expect(top!.clipping).toBe(true);
    // PSD 불투명도는 바이트로 저장되므로 0.5 → 128/255 로 되돌아온다.
    expect(top!.opacity).toBeCloseTo(0.5, 2);
    expect(top!.blendMode).toBe("multiply");
    expect(bottom!.name).toBe("레벨 보정");
    expect(bottom!.clipping).toBe(false);

    // 다시 가져오기 변환에 넣으면 원래 Studio 종류·파라미터와 같아야 한다.
    const roundTripped = psd.children!.map((child) => {
      expect(child.adjustment).toBeDefined();
      return convertPsdAdjustmentLayer(child.adjustment!);
    });
    // children 은 역순이므로 Studio 순서(뒤→앞)로 되돌려 비교한다.
    const [levelsBack, curvesBack] = [...roundTripped].reverse();
    expect(levelsBack).toMatchObject({
      status: "converted", kind: "levels",
      parameters: elements[0]!.type === "adjustment" ? elements[0].parameters : {},
    });
    expect(curvesBack).toMatchObject({
      status: "converted", kind: "curves",
      parameters: elements[1]!.type === "adjustment" ? elements[1].parameters : {},
    });
  });

  it("PSD 대응 종류가 없는 조정 레이어는 레이어를 만들지 않고 dropped 로 기록한다", async () => {
    const labOnly: PsdExportEl[] = [{
      id: "adj-lab", type: "adjustment", x: 0, y: 0, width: 16, height: 24,
      name: "Lab 보정", adjustment: "lab", parameters: { lightness: 10 }, clipToBelow: false,
    }];
    const result = await exportPagePsd(stage, labOnly, 16, 24, 1, { scale: 1 });
    expect(result.layerCount).toBe(0);
    expect(result.skipped.some((line) => line.includes("Lab 보정"))).toBe(true);
    expect(result.lossManifest!.decisions).toContainEqual(expect.objectContaining({
      feature: "adjustment-layer", disposition: "dropped", count: 1,
    }));
  });
});
