import { initializeCanvas, readPsd } from "ag-psd";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { convertPsdAdjustmentLayer } from "../studio-psd-adjustment-import";

import { exportPagePsd, type PsdExportEl } from "./studio-psd-export";
import type Konva from "konva";

/**
 * exportPagePsd 배선 검증 — 조정 레이어의 maskSrc가 실제 PSD 바이트에
 * 네이티브 마스크로 기록되고, 다시 읽어 가져오기 변환까지 닫히는지 본다.
 * 조정만 있는 페이지는 Konva 캡처를 타지 않으므로 stage는 닿지 않는 값으로
 * 대체하고, Image/Canvas는 결정적 알파 패턴을 돌려주는 스텁으로 고정한다
 * (브라우저 디코드 자체는 순수 변환 테스트와 같은 값으로 검증됨).
 */

const W = 16;
const H = 24;
// 알파 패턴: 픽셀 인덱스 % 256 — 위치마다 값이 달라 재투영·채널 기록을 대조할 수 있다.
function patternAlpha(index: number): number {
  return index % 256;
}

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

function fakeCanvas(): Record<string, unknown> {
  return {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: () => undefined,
      getImageData: (_x: number, _y: number, width: number, height: number) => {
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < width * height; i++) {
          data[i * 4] = 255;
          data[i * 4 + 1] = 255;
          data[i * 4 + 2] = 255;
          data[i * 4 + 3] = patternAlpha(i);
        }
        return { width, height, data };
      },
    }),
  };
}

beforeAll(() => {
  initializeCanvas(((width: number, height: number) => ({
    width,
    height,
    getContext: () => ({
      createImageData: (w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
      }),
    }),
  })) as unknown as (width: number, height: number) => HTMLCanvasElement);
});

beforeEach(() => {
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal("document", { createElement: () => fakeCanvas() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const stage = null as unknown as Konva.Stage;

function adjustmentEl(overrides: Partial<PsdExportEl> = {}): PsdExportEl {
  return {
    id: "adj-1",
    type: "adjustment",
    x: 0,
    y: 0,
    width: W,
    height: H,
    name: "레벨 마스크",
    adjustment: "levels",
    parameters: { rgbShadowInput: 10, rgbHighlightInput: 240 },
    maskSrc: "data:image/png;base64,AAAA",
    ...overrides,
  } as PsdExportEl;
}

describe("exportPagePsd — 조정 레이어 마스크 네이티브 기록", () => {
  it("maskSrc가 있는 조정은 네이티브 마스크와 함께 기록되고 왕복이 닫힌다", async () => {
    const result = await exportPagePsd(stage, [adjustmentEl()], W, H, 1, { scale: 1 });
    expect(result.layerCount).toBe(1);
    expect(result.lossManifest!.decisions).toContainEqual(expect.objectContaining({
      feature: "adjustment-layer", disposition: "preserved", count: 1,
    }));
    expect(result.lossManifest!.decisions).toContainEqual(expect.objectContaining({
      feature: "layer-mask", disposition: "preserved", count: 1,
    }));
    // 마스크를 픽셀에 구웠다는 거짓 집계가 없어야 한다.
    expect(result.lossManifest!.decisions.filter(
      (d) => d.feature === "layer-mask" && d.disposition === "rasterized",
    )).toEqual([]);

    const psd = readPsd(await result.blob.arrayBuffer(), {
      useImageData: true, skipCompositeImageData: true,
    });
    const layer = psd.children![0]!;
    expect(layer.adjustment?.type).toBe("levels");
    expect(layer.mask).toBeDefined();
    expect(layer.mask!.left).toBe(0);
    expect(layer.mask!.top).toBe(0);
    expect(layer.mask!.right).toBe(W);
    expect(layer.mask!.bottom).toBe(H);
    expect(layer.mask!.disabled).toBeFalsy();
    const data = layer.mask!.imageData!.data;
    for (let i = 0; i < W * H; i++) {
      expect(data[i * 4]).toBe(patternAlpha(i));
    }
    // 조정 파라미터도 종전대로 왕복한다.
    const back = convertPsdAdjustmentLayer(layer.adjustment!);
    expect(back).toMatchObject({ status: "converted", kind: "levels" });
  });

  it("꺼진 마스크는 disabled 네이티브 마스크로 기록되고 preserved로 집계한다", async () => {
    const result = await exportPagePsd(
      stage,
      [adjustmentEl({ maskEnabled: false })],
      W, H, 1, { scale: 1 },
    );
    expect(result.lossManifest!.decisions).toContainEqual(expect.objectContaining({
      feature: "layer-mask", disposition: "preserved", count: 1,
    }));
    expect(result.lossManifest!.decisions.filter(
      (d) => d.feature === "layer-mask" && d.disposition === "dropped",
    )).toEqual([]);
    const psd = readPsd(await result.blob.arrayBuffer(), {
      useImageData: true, skipCompositeImageData: true,
    });
    expect(psd.children![0]!.mask!.disabled).toBe(true);
  });

  it("마스크가 없는 조정은 종전과 같이 마스크 없이 기록된다", async () => {
    const el = adjustmentEl();
    delete (el as { maskSrc?: string }).maskSrc;
    const result = await exportPagePsd(stage, [el], W, H, 1, { scale: 1 });
    expect(result.layerCount).toBe(1);
    expect(result.lossManifest!.decisions.filter(
      (d) => d.feature === "layer-mask",
    )).toEqual([]);
    const psd = readPsd(await result.blob.arrayBuffer(), {
      useImageData: true, skipCompositeImageData: true,
    });
    expect(psd.children![0]!.mask).toBeUndefined();
  });
});
