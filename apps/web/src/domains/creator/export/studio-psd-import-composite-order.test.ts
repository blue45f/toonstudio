// @vitest-environment jsdom
import { readPsd, writePsd, type Layer, type PixelData } from "ag-psd";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { importPsdFile, type PsdImportedElement } from "../studio-psd-import";
import { DEFAULT_WATERMARK } from "../studio-watermark";
import { renderStudioExportCompositePreviewToCanvas } from "./studio-export-composite-preview";
import {
  decodePngDataUrl,
  installPsdRoundtripCanvas,
  solidPixels,
} from "./studio-psd-roundtrip-corpus";

beforeAll(installPsdRoundtripCanvas);

function layer(name: string, left: number, width: number, color: readonly [number, number, number, number]): Layer {
  return {
    name,
    left,
    top: 0,
    right: left + width,
    bottom: 1,
    imageData: solidPixels(width, 1, color),
  };
}

/**
 * 브라우저 래스터 구현 대신 불투명·무배율 source-over 픽셀 포트만 사용한다.
 * PSD 디코드, 가져오기와 제품 합성 함수의 순서·숨김 결정은 실제 구현을 실행한다.
 */
function compositeImportedElements(elements: readonly PsdImportedElement[]) {
  const canvas = document.createElement("canvas");
  const output = new Uint8ClampedArray(3 * 4);
  const images = new Map<HTMLImageElement, PixelData>();
  const imageCache = new Map<string, HTMLImageElement>();
  const drawn: string[] = [];
  for (const element of elements) {
    const pixels = decodePngDataUrl(element.src);
    const image = document.createElement("img");
    image.src = element.src;
    image.alt = element.name ?? element.id;
    Object.defineProperties(image, {
      complete: { value: true },
      naturalWidth: { value: pixels.width },
      naturalHeight: { value: pixels.height },
    });
    images.set(image, pixels);
    imageCache.set(element.src, image);
  }
  const context = {
    globalAlpha: 1,
    filter: "none",
    clearRect: () => output.fill(0),
    save: vi.fn(),
    restore: vi.fn(),
    scale: (x: number, y: number) => expect([x, y]).toEqual([1, 1]),
    drawImage: (source: CanvasImageSource, x: number, y: number, width: number, height: number) => {
      if (!(source instanceof HTMLImageElement)) throw new Error("이미지 레이어만 합성해야 해요.");
      const pixels = images.get(source);
      if (!pixels) throw new Error("실제 PSD에서 읽은 이미지 픽셀이 없어요.");
      expect([width, height, y, context.globalAlpha]).toEqual([pixels.width, pixels.height, 0, 1]);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(3);
      for (let offset = 3; offset < pixels.data.length; offset += 4) {
        expect(pixels.data[offset]).toBe(255);
      }
      output.set(pixels.data, x * 4);
      drawn.push(source.alt);
    },
  };
  Object.defineProperty(canvas, "getContext", { value: () => context });
  const summary = renderStudioExportCompositePreviewToCanvas(canvas, {
    page: { id: "psd-stack", elements, canvasH: 1 },
    canvasWidth: 3,
    canvasHeight: 1,
    exportFormat: "png",
    exportTransparent: true,
    watermark: DEFAULT_WATERMARK,
    imageCache,
  });
  return { output: Array.from(output), drawn, summary };
}

describe("실제 PSD 레이어 순서와 제품 합성 결과", () => {
  it.each(["평면", "중첩 그룹"] as const)("%s: 뒤→앞 형제 순서와 겹친 앞쪽 픽셀을 보존한다", async (kind) => {
    const bottom = layer("뒤 빨강", 0, 3, [255, 0, 0, 255]);
    const middle = layer("중간 초록", 1, 2, [0, 255, 0, 255]);
    const front = layer("앞 파랑", 2, 1, [0, 0, 255, 255]);
    const hidden = { ...layer("숨긴 노랑", 0, 3, [255, 255, 0, 255]), hidden: true };
    const children: Layer[] = kind === "평면"
      ? [bottom, middle, front, hidden]
      : [bottom, { name: "폴더", blendMode: "pass through", children: [middle, front] }, hidden];
    const bytes = writePsd({ width: 3, height: 1, children }, { generateThumbnail: false, noBackground: true });
    const decoded = readPsd(bytes, { useImageData: true, skipCompositeImageData: true });
    expect(decoded.children?.map((entry) => entry.name)).toEqual(children.map((entry) => entry.name));
    if (kind === "중첩 그룹") {
      expect(decoded.children?.[1]?.children?.map((entry) => entry.name)).toEqual(["중간 초록", "앞 파랑"]);
    }

    const imported = await importPsdFile(new File([bytes], "stack-order.psd"), 3);
    expect(imported.elements.map((element) => element.name)).toEqual(["뒤 빨강", "중간 초록", "앞 파랑", "숨긴 노랑"]);
    const composite = compositeImportedElements(imported.elements);
    expect(composite.drawn).toEqual(["뒤 빨강", "중간 초록", "앞 파랑"]);
    expect(composite.output).toEqual([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
    ]);
    expect(composite.summary).toMatchObject({ visibleElementCount: 3, hiddenLayerCount: 1 });
  });
});
