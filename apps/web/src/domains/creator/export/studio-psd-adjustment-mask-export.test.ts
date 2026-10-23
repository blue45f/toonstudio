import { initializeCanvas, readPsd, writePsd, type Layer } from "ag-psd";
import { beforeAll, describe, expect, it } from "vitest";

import {
  convertPsdMaskPixelsToStudioAlpha,
  planPsdLayerMaskRaster,
} from "../studio-psd-mask-import";

import { convertStudioMaskPixelsToPsdLayerMask } from "./studio-psd-adjustment-mask-export";

/**
 * 조정 레이어 마스크 역변환(Studio maskSrc → PSD 네이티브 마스크) 검증.
 * 왕복 계약: PSD 그레이스케일 마스크 → (가져오기) Studio 알파 마스크 →
 * (이 모듈) PSD 네이티브 마스크 → 다시 읽어도 가시성 값이 그대로여야 한다.
 * 밀도·페더는 가져올 때 이미 픽셀에 반영되므로 역변환이 파라미터로
 * 되살리지 않는 것도 함께 고정한다(이중 적용 방지).
 */

function studioPixels(
  alphas: readonly number[],
  width: number,
  height: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const data = new Uint8ClampedArray(width * height * 4);
  alphas.forEach((alpha, index) => {
    data[index * 4] = 255;
    data[index * 4 + 1] = 255;
    data[index * 4 + 2] = 255;
    data[index * 4 + 3] = alpha;
  });
  return { data, width, height };
}

const ALPHAS = [0, 64, 128, 255, 200, 30] as const; // 3x2

// node 환경에는 Canvas가 없어 ag-psd 읽기의 createImageData가 동작하지 않는다 —
// 읽기가 실제로 쓰는 createImageData만 제공하는 최소 캔버스로 초기화한다.
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

describe("convertStudioMaskPixelsToPsdLayerMask — 순수 역변환", () => {
  it("알파를 그레이스케일(R=G=B=알파, A=255)로 옮기고 페이지 틀 bounds를 기록한다", () => {
    const mask = convertStudioMaskPixelsToPsdLayerMask(studioPixels(ALPHAS, 3, 2));
    expect(mask).not.toBeNull();
    expect(mask!.left).toBe(0);
    expect(mask!.top).toBe(0);
    expect(mask!.right).toBe(3);
    expect(mask!.bottom).toBe(2);
    expect(mask!.defaultColor).toBe(0);
    expect(mask!.disabled).toBeUndefined();
    const data = mask!.imageData!.data;
    ALPHAS.forEach((alpha, index) => {
      expect(data[index * 4]).toBe(alpha);
      expect(data[index * 4 + 1]).toBe(alpha);
      expect(data[index * 4 + 2]).toBe(alpha);
      expect(data[index * 4 + 3]).toBe(255);
    });
  });

  it("RGB가 흰색이 아니어도 알파만 권위 값으로 삼는다(합성 커버리지 규약과 동일)", () => {
    const pixels = studioPixels([77], 1, 1);
    pixels.data[0] = 10;
    pixels.data[1] = 20;
    pixels.data[2] = 30;
    const mask = convertStudioMaskPixelsToPsdLayerMask(pixels);
    expect(mask!.imageData!.data[0]).toBe(77);
  });

  it("비활성 마스크는 disabled로, 오프셋은 bounds로 기록하고 밀도·페더는 되살리지 않는다", () => {
    const mask = convertStudioMaskPixelsToPsdLayerMask(studioPixels(ALPHAS, 3, 2), {
      left: 5,
      top: 7,
      disabled: true,
    });
    expect(mask!.disabled).toBe(true);
    expect(mask!.left).toBe(5);
    expect(mask!.top).toBe(7);
    expect(mask!.right).toBe(8);
    expect(mask!.bottom).toBe(9);
    // 이미 픽셀에 반영된 값을 파라미터로 다시 쓰면 재가져오기에서 이중 적용된다.
    expect(mask!.userMaskDensity).toBeUndefined();
    expect(mask!.userMaskFeather).toBeUndefined();
    expect(mask!.vectorMaskDensity).toBeUndefined();
    expect(mask!.vectorMaskFeather).toBeUndefined();
    expect(mask!.fromVectorData).toBeUndefined();
  });

  it("형식이 어긋난 입력은 마스크를 지어내지 않고 null을 돌려준다", () => {
    // 데이터 길이 불일치
    expect(convertStudioMaskPixelsToPsdLayerMask({
      data: new Uint8ClampedArray(8), width: 3, height: 2,
    })).toBeNull();
    // 0 크기
    expect(convertStudioMaskPixelsToPsdLayerMask({
      data: new Uint8ClampedArray(0), width: 0, height: 2,
    })).toBeNull();
    // 픽셀 상한 초과(주입한 상한 기준)
    expect(convertStudioMaskPixelsToPsdLayerMask(studioPixels(ALPHAS, 3, 2), {
      maxPixels: 5,
    })).toBeNull();
    // 상한 경계값은 허용
    expect(convertStudioMaskPixelsToPsdLayerMask(studioPixels(ALPHAS, 3, 2), {
      maxPixels: 6,
    })).not.toBeNull();
  });
});

describe("ag-psd 바이트 왕복 — 네이티브 마스크로 쓰고 다시 읽기", () => {
  function writeAndRead(mask: NonNullable<ReturnType<typeof convertStudioMaskPixelsToPsdLayerMask>>) {
    const layer: Layer = {
      name: "레벨 보정",
      left: 0,
      top: 0,
      adjustment: {
        type: "levels",
        rgb: { shadowInput: 10, highlightInput: 240, shadowOutput: 0, highlightOutput: 255, midtoneInput: 1 },
      },
      mask,
    };
    const buffer = writePsd(
      { width: 3, height: 2, children: [layer] },
      { noBackground: true },
    );
    const psd = readPsd(buffer, { useImageData: true, skipCompositeImageData: true });
    return psd.children![0]!;
  }

  it("마스크 채널·bounds·조정 파라미터가 함께 복원된다", () => {
    const mask = convertStudioMaskPixelsToPsdLayerMask(studioPixels(ALPHAS, 3, 2))!;
    const back = writeAndRead(mask);
    expect(back.adjustment?.type).toBe("levels");
    expect(back.mask).toBeDefined();
    expect(back.mask!.left).toBe(0);
    expect(back.mask!.top).toBe(0);
    expect(back.mask!.right).toBe(3);
    expect(back.mask!.bottom).toBe(2);
    expect(back.mask!.disabled).toBeFalsy();
    const data = back.mask!.imageData!.data;
    ALPHAS.forEach((alpha, index) => {
      expect(data[index * 4]).toBe(alpha);
    });
  });

  it("비활성으로 기록한 마스크는 비활성으로 되돌아온다", () => {
    const mask = convertStudioMaskPixelsToPsdLayerMask(studioPixels(ALPHAS, 3, 2), {
      disabled: true,
    })!;
    const back = writeAndRead(mask);
    expect(back.mask!.disabled).toBe(true);
  });

  it("되읽은 마스크를 가져오기 변환에 넣으면 원래 Studio 알파와 같아진다(전체 왕복)", () => {
    const original = studioPixels(ALPHAS, 3, 2);
    const mask = convertStudioMaskPixelsToPsdLayerMask(original)!;
    const back = writeAndRead(mask);
    const studioBack = convertPsdMaskPixelsToStudioAlpha(
      back.mask!.imageData!.data,
      back.mask!.imageData!.width,
      back.mask!.imageData!.height,
    );
    expect(studioBack).not.toBeNull();
    ALPHAS.forEach((alpha, index) => {
      expect(studioBack![index * 4 + 3]).toBe(alpha);
      expect(studioBack![index * 4]).toBe(255);
    });
  });

  it("가져오기 방향(그레이스케일→알파) 뒤 역변환하면 그레이스케일 값이 그대로다", () => {
    // Photoshop이 기록하는 형태: R=G=B=가시성, A=255.
    const gray = new Uint8ClampedArray(3 * 2 * 4);
    ALPHAS.forEach((alpha, index) => {
      gray[index * 4] = alpha;
      gray[index * 4 + 1] = alpha;
      gray[index * 4 + 2] = alpha;
      gray[index * 4 + 3] = 255;
    });
    const studio = convertPsdMaskPixelsToStudioAlpha(gray, 3, 2);
    expect(studio).not.toBeNull();
    const mask = convertStudioMaskPixelsToPsdLayerMask({ data: studio!, width: 3, height: 2 });
    expect(mask).not.toBeNull();
    ALPHAS.forEach((alpha, index) => {
      expect(mask!.imageData!.data[index * 4]).toBe(alpha);
    });
  });

  it("역변환한 마스크는 가져오기 플래너가 거부하지 않는다(bounds와 픽셀 크기 일치)", () => {
    const mask = convertStudioMaskPixelsToPsdLayerMask(studioPixels(ALPHAS, 3, 2))!;
    const plan = planPsdLayerMaskRaster({
      layerLeft: 0,
      layerTop: 0,
      layerPixelWidth: 3,
      layerPixelHeight: 2,
      mask,
    });
    expect(plan).not.toBeNull();
    expect(plan!.destinationWidth).toBe(3);
    expect(plan!.destinationHeight).toBe(2);
    expect(plan!.defaultAlpha).toBe(0);
  });
});
