import { initializeCanvas, readPsd } from "ag-psd";
import { describe, expect, it } from "vitest";

import {
  compositeStudioTag2pixColor,
  studioTag2pixHslToRgb,
} from "../studio-onnx-tag2pix";
import {
  STUDIO_COLORIZE_LAYER_LABELS,
  STUDIO_COLORIZE_LAYER_ORDER,
  STUDIO_COLORIZE_LINE_FADE_LUMINANCE,
  buildStudioColorizeLayerPsd,
  compositeStudioColorizeLayerPreview,
  splitStudioColorizeLayers,
  studioColorizeLayerPsdMessage,
  type StudioColorizeLayerRaster,
} from "./studio-onnx-colorize-layers";

/**
 * `readPsd` decodes layer pixels through the DOM canvas even in `useImageData` mode.
 * The shim hands it a plain `ImageData` so the round trip can assert real structure
 * under `environment: node`.
 */
initializeCanvas(
  (): HTMLCanvasElement => {
    throw new Error("PSD 검증에서는 캔버스를 만들지 않습니다.");
  },
  (width: number, height: number): ImageData => ({
    colorSpace: "srgb",
    data: new Uint8ClampedArray(width * height * 4),
    height,
    width,
  }),
);

const PLANE_PIXELS = 512 * 512;

/** 단색 모델 색상 평면 — rgb(0..1)를 tanh 범위로 인코딩한다. */
function constantPlane(r: number, g: number, b: number): Float32Array {
  const plane = new Float32Array(3 * PLANE_PIXELS);
  plane.fill(r * 2 - 1, 0, PLANE_PIXELS);
  plane.fill(g * 2 - 1, PLANE_PIXELS, 2 * PLANE_PIXELS);
  plane.fill(b * 2 - 1, 2 * PLANE_PIXELS);
  return plane;
}

function layerOf(
  layers: readonly StudioColorizeLayerRaster[],
  id: StudioColorizeLayerRaster["id"],
): Uint8ClampedArray {
  const found = layers.find((layer) => layer.id === id);
  if (!found) throw new Error(`레이어가 없습니다: ${id}`);
  return found.rgba;
}

function pixelOf(data: Uint8ClampedArray, offsetIndex: number): [number, number, number, number] {
  const i = offsetIndex * 4;
  return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
}

describe("splitStudioColorizeLayers", () => {
  // 4×1: 흰 배경 / 검은 선 / 중간 회색 톤 / 갈색 유색 선
  const source = new Uint8ClampedArray([
    255, 255, 255, 255,
    0, 0, 0, 255,
    128, 128, 128, 255,
    120, 60, 30, 255,
  ]);
  const split = () => splitStudioColorizeLayers({
    colorPlane: constantPlane(1, 0, 0),
    sourceRgba: source,
    sourceWidth: 4,
    sourceHeight: 1,
  });

  it("레이어 순서와 라벨이 PSD 패널 순서(선화→음영→밑색)와 같다", () => {
    const result = split();
    expect(result.layers.map((layer) => layer.id)).toEqual([...STUDIO_COLORIZE_LAYER_ORDER]);
  });

  it("밑색은 모델 색상을 자기 명도로 돌려주고 선 아래에도 색이 있다", () => {
    const color = layerOf(split().layers, "color");
    expect(pixelOf(color, 0)).toEqual([255, 0, 0, 255]);
    // 검은 선 픽셀에서도 밑색은 모델 색을 유지한다 (다시 칠 수 있어야 한다)
    expect(pixelOf(color, 1)).toEqual([255, 0, 0, 255]);
  });

  it("선화는 어두운 픽셀만 알파를 세우고 원본 RGB를 유지한다", () => {
    const line = layerOf(split().layers, "line");
    expect(pixelOf(line, 0)[3]).toBe(0); // 흰 배경은 잉크가 아니다
    expect(pixelOf(line, 1)).toEqual([0, 0, 0, 255]); // 검은 선은 완전한 잉크
    const toneAlpha = pixelOf(line, 2)[3]!;
    expect(toneAlpha).toBeGreaterThan(0);
    expect(toneAlpha).toBeLessThan(80); // 중간 톤은 약한 알파만
    // 유색 선은 원본 색을 그대로 들고 있다
    expect(pixelOf(line, 3).slice(0, 3)).toEqual([120, 60, 30]);
    expect(pixelOf(line, 3)[3]).toBeGreaterThan(120);
  });

  it("음영은 원본 휘도의 회색 맵이되 선 구간 아래로 내려가지 않는다", () => {
    const shading = layerOf(split().layers, "shading");
    const floor = Math.round(STUDIO_COLORIZE_LINE_FADE_LUMINANCE * 255);
    expect(pixelOf(shading, 0)).toEqual([255, 255, 255, 255]);
    expect(pixelOf(shading, 1)[0]).toBe(floor); // 검은 선도 하한까지만
    expect(pixelOf(shading, 2)[0]).toBe(floor); // 중간 톤도 하한으로 눌린다
  });

  it("투명 픽셀은 잉크가 되지 않고 밑색 알파만 원본을 따른다", () => {
    const transparent = new Uint8ClampedArray([0, 0, 0, 0]);
    const result = splitStudioColorizeLayers({
      colorPlane: constantPlane(0, 0, 1),
      sourceRgba: transparent,
      sourceWidth: 1,
      sourceHeight: 1,
    });
    expect(pixelOf(layerOf(result.layers, "line"), 0)[3]).toBe(0);
    expect(pixelOf(layerOf(result.layers, "color"), 0)).toEqual([0, 0, 255, 0]);
    expect(pixelOf(layerOf(result.layers, "shading"), 0)).toEqual([255, 255, 255, 255]);
  });

  it("하이라이트는 만들지 않고 건너뜀 사유를 기록한다", () => {
    const result = split();
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.layer).toBe("highlight");
    expect(result.skipped[0]?.reason).toContain("하이라이트");
    expect(result.layers.map((layer) => layer.id)).not.toContain("highlight");
  });

  it("원본 버퍼 길이가 크기와 다르면 실패한다", () => {
    expect(() => splitStudioColorizeLayers({
      colorPlane: constantPlane(1, 0, 0),
      sourceRgba: new Uint8ClampedArray(8),
      sourceWidth: 4,
      sourceHeight: 1,
    })).toThrow(RangeError);
  });

  it("캔버스 예산을 넘는 이미지는 분리 전에 실패한다", () => {
    expect(() => splitStudioColorizeLayers({
      colorPlane: constantPlane(1, 0, 0),
      sourceRgba: new Uint8ClampedArray(4),
      sourceWidth: 3000,
      sourceHeight: 3000,
    })).toThrow(RangeError);
  });
});

describe("레이어 재합성 오차 계약", () => {
  it("분리→재합성이 실제 채색 합성과 작은 오차 안에서 일치한다", () => {
    const width = 64;
    const height = 64;
    // 원본: 흰 배경 + 검은 테두리 선 + 옅은 톤(0.88) + 중간 톤(0.62) 원
    const source = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let lum = 255;
        if (x === 4 || x === 59 || y === 4 || y === 59) lum = 0;
        if (x > 36 && y > 36) lum = Math.round(0.88 * 255);
        const dx = x - 20;
        const dy = y - 20;
        if (dx * dx + dy * dy < 100) lum = Math.round(0.62 * 255);
        const i = (y * width + x) * 4;
        source[i] = lum;
        source[i + 1] = lum;
        source[i + 2] = lum;
        source[i + 3] = 255;
      }
    }
    // 모델 색상 평면: 위치 그라데이션 (밝은 명도 구간 포함)
    const plane = new Float32Array(3 * PLANE_PIXELS);
    for (let y = 0; y < 512; y += 1) {
      for (let x = 0; x < 512; x += 1) {
        const [r, g, b] = studioTag2pixHslToRgb((x / 512) * 0.85, 0.75, 0.25 + 0.6 * (y / 512));
        const i = y * 512 + x;
        plane[i] = r * 2 - 1;
        plane[PLANE_PIXELS + i] = g * 2 - 1;
        plane[2 * PLANE_PIXELS + i] = b * 2 - 1;
      }
    }

    const flattened = compositeStudioTag2pixColor({
      colorPlane: plane,
      sourceRgba: source,
      sourceWidth: width,
      sourceHeight: height,
    });
    const split = splitStudioColorizeLayers({
      colorPlane: plane,
      sourceRgba: source,
      sourceWidth: width,
      sourceHeight: height,
    });
    const preview = compositeStudioColorizeLayerPreview(width, height, split.layers);

    let errorSum = 0;
    let nonLineErrorSum = 0;
    let nonLineCount = 0;
    let backgroundErrorSum = 0;
    let backgroundCount = 0;
    const line = layerOf(split.layers, "line");
    for (let i = 0; i < width * height; i += 1) {
      for (let c = 0; c < 3; c += 1) {
        const error = Math.abs(preview[i * 4 + c]! - flattened[i * 4 + c]!);
        errorSum += error;
        if (line[i * 4 + 3] === 0) {
          nonLineErrorSum += error;
          nonLineCount += 1;
          if (source[i * 4] === 255) {
            backgroundErrorSum += error;
            backgroundCount += 1;
          }
        }
      }
    }
    const meanError = errorSum / (width * height * 3);
    const nonLineMeanError = nonLineErrorSum / nonLineCount;
    const backgroundMeanError = backgroundErrorSum / backgroundCount;
    // 오차 계약 (합성 장면 실측 기반):
    //  - 흰 배경(휘도 1) 구간은 명도 곱셈이 항등이라 거의 정확히 되돌아온다.
    //  - 톤 구간은 곱하기 합성과 HSL 명도 곱셈의 차이만큼 어긋난다
    //    (휘도 0.88 톤 구간 실측 평균 약 19.6/255 — 밝은 모델 색에서 커진다).
    // 전체 평균이 이 범위를 크게 벗어나면 분리식이 깨진 것으로 본다.
    expect(backgroundMeanError).toBeLessThan(1);
    expect(nonLineMeanError).toBeLessThan(5);
    expect(meanError).toBeLessThan(8);
  });
});

describe("buildStudioColorizeLayerPsd", () => {
  const width = 8;
  const height = 8;
  function splitSample() {
    const source = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      const onLine = i % width === 0;
      source[i * 4] = onLine ? 0 : 255;
      source[i * 4 + 1] = onLine ? 0 : 255;
      source[i * 4 + 2] = onLine ? 0 : 255;
      source[i * 4 + 3] = 255;
    }
    return splitStudioColorizeLayers({
      colorPlane: constantPlane(0.2, 0.5, 0.9),
      sourceRgba: source,
      sourceWidth: width,
      sourceHeight: height,
    });
  }

  it("8BPS 시그니처의 PSD를 만들고 영수증에 레이어명을 기록한다", async () => {
    const split = splitSample();
    const result = buildStudioColorizeLayerPsd({
      title: "테스트 채색",
      width,
      height,
      layers: split.layers,
      skipped: split.skipped,
    });
    expect(result.blob.type).toBe("image/vnd.adobe.photoshop");
    expect(result.receipt.layerNames).toEqual(
      STUDIO_COLORIZE_LAYER_ORDER.map((id) => STUDIO_COLORIZE_LAYER_LABELS[id]),
    );
    expect(result.receipt.skipped).toHaveLength(1);
    expect(result.receipt.byteLength).toBeGreaterThan(0);
    const buffer = new Uint8Array(await result.blob.arrayBuffer());
    expect([...buffer.slice(0, 4)]).toEqual([0x38, 0x42, 0x50, 0x53]);
    expect(buffer[4]).toBe(0);
    expect(buffer[5]).toBe(1);
  });

  it("readPsd로 레이어 구조와 블렌드를 왕복 검증한다", async () => {
    const split = splitSample();
    const result = buildStudioColorizeLayerPsd({
      title: "테스트 채색",
      width,
      height,
      layers: split.layers,
      skipped: split.skipped,
    });
    const buffer = new Uint8Array(await result.blob.arrayBuffer());
    const psd = readPsd(buffer.buffer, { useImageData: true });
    expect(psd.width).toBe(width);
    expect(psd.height).toBe(height);
    expect(psd.children?.map((layer) => layer.name)).toEqual(
      STUDIO_COLORIZE_LAYER_ORDER.map((id) => STUDIO_COLORIZE_LAYER_LABELS[id]),
    );
    expect(psd.children?.map((layer) => layer.blendMode)).toEqual([
      "normal",
      "multiply",
      "normal",
    ]);
  });

  it("합성본을 주면 PSD 합성 이미지로 그대로 쓴다", async () => {
    const split = splitSample();
    const flattened = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      flattened[i * 4] = 12;
      flattened[i * 4 + 1] = 34;
      flattened[i * 4 + 2] = 56;
      flattened[i * 4 + 3] = 255;
    }
    const result = buildStudioColorizeLayerPsd({
      title: "테스트 채색",
      width,
      height,
      layers: split.layers,
      flattened,
    });
    const buffer = new Uint8Array(await result.blob.arrayBuffer());
    const psd = readPsd(buffer.buffer, { useImageData: true });
    const data = psd.imageData?.data;
    if (!data) throw new Error("합성 이미지가 없습니다.");
    expect([data[0], data[1], data[2]]).toEqual([12, 34, 56]);
  });

  it("레이어가 없으면 실패한다", () => {
    expect(() => buildStudioColorizeLayerPsd({
      title: "빈 PSD",
      width,
      height,
      layers: [],
    })).toThrow(Error);
  });

  it("크기가 맞지 않는 레이어는 실패한다", () => {
    expect(() => buildStudioColorizeLayerPsd({
      title: "깨진 PSD",
      width,
      height,
      layers: [{ id: "color", rgba: new Uint8ClampedArray(4) }],
    })).toThrow(TypeError);
  });

  it("캔버스 예산을 넘으면 실패한다", () => {
    const split = splitSample();
    expect(() => buildStudioColorizeLayerPsd({
      title: "큰 PSD",
      width: 3000,
      height: 3000,
      layers: split.layers,
    })).toThrow(RangeError);
  });
});

describe("studioColorizeLayerPsdMessage", () => {
  it("레이어 수와 건너뜀을 요약한다", () => {
    const message = studioColorizeLayerPsdMessage({
      width: 8,
      height: 8,
      layerNames: ["01_선화 (Line)", "02_음영 (Shading)", "03_밑색 (Color)"],
      skipped: [{ layer: "highlight", reason: "사유" }],
      byteLength: 1024,
    });
    expect(message).toContain("레이어 3개");
    expect(message).toContain("건너뜀 1건");
  });
});
