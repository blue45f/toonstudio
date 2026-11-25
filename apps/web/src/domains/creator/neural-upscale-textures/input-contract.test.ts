// @vitest-environment jsdom
import { StrictMode, createElement, useState } from "react";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioNeuralUpscaleTexturesPanel, type StudioNeuralUpscaleTexturesPanelProps, bilinearUpscale, computePsnr,
  detectUpscalerBackend, detectUpscalerGpuCapability, downsampleBox,
  measureEdgeSharpness, measureTileSeamContinuity, roughnessToRgbaBuffer,
  synthesizeProceduralTexture, upscaleWebtoonBuffer, type RgbaImageBuffer,
} from "./index";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const redToTransparent = (blue: number): RgbaImageBuffer => ({
  width: 2, height: 1,
  data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, blue, 0]),
});

describe("CPU 업스케일 입력·실행 경계", () => {
  it("GPU API가 있어도 장치를 요청하지 않고 CPU 결과와 미검증 가용성을 구분한다", () => {
    const requestAdapter = vi.fn();
    vi.stubGlobal("navigator", { gpu: { requestAdapter } });
    const result = upscaleWebtoonBuffer(redToTransparent(0));
    expect(detectUpscalerBackend()).toBe("cpu");
    expect(detectUpscalerGpuCapability()).toBe("api-present-unverified");
    expect(result.metrics).toMatchObject({ backend: "cpu", gpuExecuted: false, gpuCapability: "api-present-unverified" });
    expect(requestAdapter).not.toHaveBeenCalled();
    render(createElement<StudioNeuralUpscaleTexturesPanelProps>(StudioNeuralUpscaleTexturesPanel, {}));
    expect(screen.getByTestId("upscaler-backend-badge").textContent).toContain("GPU·ML 미실행");
    expect(screen.getByTestId("upscaler-scope-notice").textContent).toContain("고정 합성 샘플");
    expect(screen.getByTestId("upscaler-scope-notice").textContent).toContain("장치·컴파일·실행은 미검증");
    expect(requestAdapter).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])("잘못된 geometry %s를 할당 전에 거부한다", (width) => {
    const source = { width, height: 1, data: new Uint8ClampedArray(4) };
    expect(() => upscaleWebtoonBuffer(source)).toThrow(RangeError);
    expect(() => bilinearUpscale(source, 2)).toThrow(RangeError);
    expect(() => measureEdgeSharpness(source)).toThrow(RangeError);
  });

  it("잘린 RGBA·출력 예산 초과·맞지 않는 reference·배율을 성공으로 보정하지 않는다", () => {
    const source = redToTransparent(0);
    const truncated = { ...source, data: source.data.slice(0, 4) };
    expect(() => upscaleWebtoonBuffer(truncated)).toThrow(RangeError);
    expect(() => computePsnr(source, truncated)).toThrow(RangeError);
    expect(() => computePsnr(source, { ...source, width: 1, height: 2 })).toThrow(RangeError);
    expect(() => upscaleWebtoonBuffer({ width: 1024, height: 1024, data: new Uint8ClampedArray(1024 * 1024 * 4) })).toThrow(RangeError);
    expect(() => upscaleWebtoonBuffer(source, { referenceHighRes: source })).toThrow(RangeError);
    expect(() => upscaleWebtoonBuffer(source, { referenceHighRes: { width: 4, height: 2, data: new Uint8ClampedArray(4) } })).toThrow(RangeError);
    expect(() => Reflect.apply(upscaleWebtoonBuffer, undefined, [source, { scaleFactor: 3 }])).toThrow(RangeError);
    expect(() => upscaleWebtoonBuffer(source, { edgeSharpenStrength: NaN })).toThrow(RangeError);
    expect(() => downsampleBox(source, 2)).toThrow(RangeError);
  });

  it.each([2, 4] as const)("%s× Lanczos·bilinear에서 숨은 투명 RGB가 보이는 픽셀에 번지지 않고 원본을 보존한다", (factor) => {
    const black = redToTransparent(0);
    const blue = redToTransparent(255);
    const before = blue.data.slice();
    for (const run of [
      (image: RgbaImageBuffer) => bilinearUpscale(image, factor),
      (image: RgbaImageBuffer) => upscaleWebtoonBuffer(image, { scaleFactor: factor }).output,
    ]) {
      const output = run(blue);
      expect(output.data).toEqual(run(black).data);
      expect(output.data).not.toBe(blue.data);
      let partialAlphaPixels = 0;
      for (let k = 0; k < output.data.length; k += 4) {
        const alpha = output.data[k + 3] ?? 0;
        expect(output.data[k + 1]).toBe(0);
        expect(output.data[k + 2]).toBe(0);
        if (alpha === 0) expect(output.data[k]).toBe(0);
        if (alpha > 0 && alpha < 255) {
          partialAlphaPixels += 1;
          expect(output.data[k]).toBeGreaterThan(240);
        }
      }
      expect(partialAlphaPixels).toBeGreaterThan(0);
    }
    expect(blue.data).toEqual(before);
    expect(upscaleWebtoonBuffer(blue).metrics.sharpeningApplied).toBe(false);
  });

  it.each([2, 4] as const)("%s× 균일 반투명색의 비정수 premultiplied 값은 할로 없이 straight RGBA를 유지한다", (factor) => {
    for (const color of [[128, 0, 0, 128], [51, 103, 207, 127]]) {
      const source = { width: 2, height: 2, data: new Uint8ClampedArray([...color, ...color, ...color, ...color]) };
      const before = source.data.slice();
      for (const antiRingingStrength of [0, 1]) {
        const result = upscaleWebtoonBuffer(source, { scaleFactor: factor, antiRingingStrength });
        expect(result.metrics.haloOvershootCount).toBe(0);
        expect(result.metrics.haloOvershootRate).toBe(0);
        for (let k = 0; k < result.output.data.length; k += 4) {
          expect(Array.from(result.output.data.slice(k, k + 4))).toEqual(color);
        }
      }
      expect(source.data).toEqual(before);
    }
  });

  it("박스 다운샘플도 알파를 먼저 곱하고 PSNR은 알파 손실을 감지한다", () => {
    const source = { width: 2, height: 2, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 0, 255, 0, 0, 255, 0, 0, 255, 0]) };
    expect(downsampleBox(source, 2).data).toEqual(new Uint8ClampedArray([255, 0, 0, 128]));
    expect(computePsnr(redToTransparent(0), redToTransparent(255))).toBe(99.99);
    const changed = redToTransparent(0);
    changed.data[3] = 0;
    expect(computePsnr(redToTransparent(0), changed)).toBeLessThan(99.99);
  });
});

describe("텍스처 품질 입력 경계", () => {
  it("생략한 optional 값은 기존 기본값으로 처리한다", () => {
    expect(upscaleWebtoonBuffer(redToTransparent(0), { edgeSharpenStrength: undefined }).options.edgeSharpenStrength).toBe(0.72);
    expect(synthesizeProceduralTexture("hanji-fiber", { width: undefined }).width).toBe(128);
  });
  it("빈 버퍼·잘못된 geometry·비유한 경계오차를 심리스 통과로 표시하지 않는다", () => {
    expect(() => measureTileSeamContinuity(new Uint8ClampedArray(0), 2, 2)).toThrow(RangeError);
    expect(() => measureTileSeamContinuity(new Uint8ClampedArray(16), 2, 2, NaN)).toThrow(RangeError);
    expect(() => measureTileSeamContinuity(new Uint8ClampedArray(4), 1, 1)).toThrow(RangeError);
    expect(() => roughnessToRgbaBuffer(new Uint8ClampedArray(1), 2, 2)).toThrow(RangeError);
    expect(() => synthesizeProceduralTexture("hanji-fiber", { width: 16.5 })).toThrow(RangeError);
    expect(() => synthesizeProceduralTexture("hanji-fiber", { width: Infinity })).toThrow(RangeError);
    expect(() => synthesizeProceduralTexture("hanji-fiber", { width: 513 })).toThrow(RangeError);
  });
});

describe("예제 결과 알림 경계", () => {
  it("StrictMode에서도 결과당 한 번만 부모 inline 콜백으로 setState하며 최신 콜백을 사용한다", async () => {
    const upscaleCalls = vi.fn();
    const textureCalls = vi.fn();
    function Parent() {
      const [upscaleCount, setUpscaleCount] = useState(0);
      const [textureCount, setTextureCount] = useState(0);
      const [version, setVersion] = useState(1);
      return createElement("div", {},
        createElement("output", { "data-testid": "parent-counts" }, `${upscaleCount}/${textureCount}`),
        createElement("button", { onClick: () => setVersion(2) }, "부모 콜백 교체"),
        createElement<StudioNeuralUpscaleTexturesPanelProps>(StudioNeuralUpscaleTexturesPanel, {
          onUpscaleComplete: () => { upscaleCalls(version); setUpscaleCount((n) => n + 1); },
          onTextureSynthesized: () => { textureCalls(version); setTextureCount((n) => n + 1); },
        }),
      );
    }
    render(createElement(StrictMode, {}, createElement(Parent)));
    await waitFor(() => expect(screen.getByTestId("parent-counts").textContent).toBe("1/1"));
    fireEvent.click(screen.getByText("부모 콜백 교체"));
    expect(upscaleCalls).toHaveBeenCalledTimes(1);
    expect(textureCalls).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("scale-factor-4x"));
    await waitFor(() => expect(screen.getByTestId("parent-counts").textContent).toBe("2/1"));
    expect(upscaleCalls).toHaveBeenLastCalledWith(2);
    fireEvent.click(screen.getByTestId("tab-textures"));
    fireEvent.click(screen.getByTestId("material-btn-red-brick"));
    await waitFor(() => expect(screen.getByTestId("parent-counts").textContent).toBe("2/2"));
    expect(textureCalls).toHaveBeenLastCalledWith(2);
    expect(upscaleCalls).toHaveBeenCalledTimes(2);
    expect(textureCalls).toHaveBeenCalledTimes(2);
  });

  it("동기 throw와 비동기 reject를 예제 알림 오류로 표시하고 새 결과로 회복한다", async () => {
    const onUpscaleComplete = vi.fn().mockImplementationOnce(() => { throw new Error("알림 오류"); }).mockResolvedValue(undefined);
    const onTextureSynthesized = vi.fn().mockRejectedValueOnce(new Error("알림 거절")).mockResolvedValue(undefined);
    render(createElement<StudioNeuralUpscaleTexturesPanelProps>(StudioNeuralUpscaleTexturesPanel, { onUpscaleComplete, onTextureSynthesized }));
    await waitFor(() => {
      expect(screen.getByTestId("upscale-notification-status").textContent).toContain("예제 결과 알림 실패");
      expect(screen.getByTestId("texture-notification-status").textContent).toContain("실제 적용·저장 완료가 아니며");
    });
    expect(onUpscaleComplete).toHaveBeenCalledTimes(1);
    expect(onTextureSynthesized).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("scale-factor-4x"));
    fireEvent.click(screen.getByTestId("tab-textures"));
    fireEvent.click(screen.getByTestId("material-btn-red-brick"));
    await waitFor(() => {
      expect(screen.queryByTestId("upscale-notification-status")).toBeNull();
      expect(screen.queryByTestId("texture-notification-status")).toBeNull();
    });
    expect(onUpscaleComplete).toHaveBeenCalledTimes(2);
    expect(onTextureSynthesized).toHaveBeenCalledTimes(2);
  });

  it("이전 결과의 늦은 성공 응답이 새 결과의 오류를 덮어쓰지 않는다", async () => {
    const controls = { resolve: () => {} };
    const pending = new Promise<void>((resolve) => { controls.resolve = resolve; });
    const onUpscaleComplete = vi.fn().mockReturnValueOnce(pending).mockRejectedValueOnce(new Error("새 결과 알림 거절"));
    render(createElement<StudioNeuralUpscaleTexturesPanelProps>(StudioNeuralUpscaleTexturesPanel, { onUpscaleComplete }));
    await waitFor(() => expect(screen.getByTestId("upscale-notification-status").textContent).toContain("알림 처리 중"));
    fireEvent.click(screen.getByTestId("scale-factor-4x"));
    await waitFor(() => expect(screen.getByTestId("upscale-notification-status").textContent).toContain("알림 실패"));
    await act(async () => { controls.resolve(); await pending; });
    expect(screen.getByTestId("upscale-notification-status").textContent).toContain("알림 실패");
    expect(onUpscaleComplete).toHaveBeenCalledTimes(2);
  });
});
