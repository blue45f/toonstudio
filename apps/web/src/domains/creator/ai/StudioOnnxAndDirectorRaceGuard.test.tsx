// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STUDIO_AI_DEFAULT_SETTINGS } from "./studio-ai-client";
import { StudioOnnxAnimeStylePanel } from "./StudioOnnxAnimeStylePanel";
import { StudioOnnxColorizePanel } from "./StudioOnnxColorizePanel";
import { StudioOnnxUpscalePanel } from "../StudioOnnxUpscalePanel";

const { convertImageToAnimeStyleMock, animeStyleOnDeviceMock, colorizeOnDeviceMock, upscaleOnDeviceMock } = vi.hoisted(
  () => ({
    convertImageToAnimeStyleMock: vi.fn(),
    animeStyleOnDeviceMock: vi.fn(),
    colorizeOnDeviceMock: vi.fn(),
    upscaleOnDeviceMock: vi.fn(),
  }),
);

vi.mock("./studio-ai-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./studio-ai-client")>();
  return {
    ...actual,
    loadStudioAiSessionSettings: () => STUDIO_AI_DEFAULT_SETTINGS,
    convertImageToAnimeStyle: convertImageToAnimeStyleMock,
  };
});

vi.mock("../studio-onnx-anime-style", () => ({
  convertToAnimeStyleOnDevice: animeStyleOnDeviceMock,
}));

vi.mock("../studio-onnx-colorize", () => ({
  colorizeLineArtOnDeviceWithLayers: colorizeOnDeviceMock,
}));

vi.mock("../studio-onnx-upscale", () => ({
  upscaleImageOnDevice: upscaleOnDeviceMock,
}));

afterEach(() => {
  cleanup();
  convertImageToAnimeStyleMock.mockReset();
  animeStyleOnDeviceMock.mockReset();
  colorizeOnDeviceMock.mockReset();
  upscaleOnDeviceMock.mockReset();
});

describe("인스펙터 ONNX/클라우드 AI 이미지 전환 중단·취소 가드 (E11)", () => {
  it("클라우드 애니풍 변환 중 다른 이미지(src)로 전환하면 이전 요청을 즉시 중단하고 B 이미지에 덮어쓰지 않는다", async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveCloud: ((value: unknown) => void) | null = null;
    convertImageToAnimeStyleMock.mockImplementationOnce(
      (_settings, _src, _extra, _purpose, opts) => {
        capturedSignal = opts?.signal;
        return new Promise((resolve) => {
          resolveCloud = resolve;
        });
      },
    );

    const onResultA = vi.fn();
    const { rerender } = render(
      <StudioOnnxAnimeStylePanel
        src="data:image/png;base64,IMAGE_A"
        cloudConfigured={true}
        onResult={onResultA}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "AI로 고화질 변환" }));
    await waitFor(() => {
      expect(screen.getByTestId("onnx-anime-cloud-cancel-btn")).toBeTruthy();
    });

    // 이미지 A → 이미지 B로 전환하면 즉시 abort되어야 한다
    rerender(
      <StudioOnnxAnimeStylePanel
        src="data:image/png;base64,IMAGE_B"
        cloudConfigured={true}
        onResult={onResultA}
      />,
    );
    expect(capturedSignal?.aborted).toBe(true);

    resolveCloud!({ ok: true, data: { dataUrl: "data:image/png;base64,STALE_A_RESULT" } });
    await Promise.resolve();
    expect(onResultA).not.toHaveBeenCalled();
  });

  it.each(["cloud", "device"] as const)("%s 경로의 이전 변환이 끝나도 새 변환의 진행 상태를 유지한다", async (route) => {
    const previousResult = "data:image/png;base64,STALE_A_RESULT";
    const currentResult = "data:image/png;base64,CURRENT_B_RESULT";
    const previousDevice = Promise.withResolvers<{ dataUrl: string }>();
    const previousCloud = Promise.withResolvers<{ ok: true; data: { dataUrl: string } }>();
    const currentCloud = Promise.withResolvers<{ ok: true; data: { dataUrl: string } }>();
    if (route === "device") {
      animeStyleOnDeviceMock.mockReturnValueOnce(previousDevice.promise);
    } else {
      convertImageToAnimeStyleMock.mockReturnValueOnce(previousCloud.promise);
    }
    convertImageToAnimeStyleMock.mockReturnValueOnce(currentCloud.promise);

    const onResult = vi.fn();
    const { rerender } = render(
      <StudioOnnxAnimeStylePanel src="data:image/png;base64,IMAGE_A" cloudConfigured onResult={onResult} />,
    );
    fireEvent.click(screen.getByRole("button", {
      name: route === "device" ? "기기에서 애니풍으로 변환" : "AI로 고화질 변환",
    }));
    const previousMock = route === "device" ? animeStyleOnDeviceMock : convertImageToAnimeStyleMock;
    await waitFor(() => expect(previousMock).toHaveBeenCalledTimes(1));
    const previousSignal = previousMock.mock.calls[0]?.[route === "device" ? 1 : 4]?.signal;

    rerender(
      <StudioOnnxAnimeStylePanel src="data:image/png;base64,IMAGE_B" cloudConfigured onResult={onResult} />,
    );
    expect(previousSignal?.aborted).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "AI로 고화질 변환" }));
    await waitFor(() => expect(convertImageToAnimeStyleMock).toHaveBeenLastCalledWith(
      expect.anything(), "data:image/png;base64,IMAGE_B", "", "episode", { signal: expect.any(AbortSignal) },
    ));

    await act(async () => {
      if (route === "device") {
        previousDevice.resolve({ dataUrl: previousResult });
      } else {
        previousCloud.resolve({ ok: true, data: { dataUrl: previousResult } });
      }
    });
    expect.soft(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByTestId("onnx-anime-cloud-cancel-btn")).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "AI로 변환하는 중…" }).disabled).toBe(true);
    expect(onResult).not.toHaveBeenCalled();

    await act(async () => {
      currentCloud.resolve({ ok: true, data: { dataUrl: currentResult } });
    });
    expect(onResult).toHaveBeenCalledExactlyOnceWith(currentResult);
    expect(screen.queryByTestId("onnx-anime-cloud-cancel-btn")).toBeNull();
  });

  it("클라우드 애니풍 변환 중 취소 버튼 클릭 시 AbortSignal을 중단하고 취소 안내를 보여준다", async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveCloud: ((value: unknown) => void) | null = null;
    convertImageToAnimeStyleMock.mockImplementationOnce(
      (_settings, _src, _extra, _purpose, opts) => {
        capturedSignal = opts?.signal;
        return new Promise((resolve) => {
          resolveCloud = resolve;
        });
      },
    );

    const onResult = vi.fn();
    render(
      <StudioOnnxAnimeStylePanel
        src="data:image/png;base64,IMAGE_A"
        cloudConfigured={true}
        onResult={onResult}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "AI로 고화질 변환" }));
    const cancelBtn = await screen.findByTestId("onnx-anime-cloud-cancel-btn");
    fireEvent.click(cancelBtn);

    expect(capturedSignal?.aborted).toBe(true);
    resolveCloud!({ ok: true, data: { dataUrl: "data:image/png;base64,LATE" } });
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("취소했어요");
    });
    expect(onResult).not.toHaveBeenCalled();
  });

  it("ONNX 기기 채색/업스케일 진행 중 src가 바뀌면 이전 AbortSignal을 중단하고 늦은 결과를 무시한다", async () => {
    let colorizeSignal: AbortSignal | undefined;
    let resolveColorize: ((value: unknown) => void) | null = null;
    colorizeOnDeviceMock.mockImplementationOnce((_src, opts) => {
      colorizeSignal = opts?.signal;
      return new Promise((resolve) => {
        resolveColorize = resolve;
      });
    });

    const onColorizeResult = vi.fn();
    const colorizeView = render(
      <StudioOnnxColorizePanel
        src="data:image/png;base64,LINE_A"
        cloudConfigured={false}
        onResult={onColorizeResult}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /기기에서 채색/u }));
    await waitFor(() => expect(colorizeSignal).toBeDefined());

    colorizeView.rerender(
      <StudioOnnxColorizePanel
        src="data:image/png;base64,LINE_B"
        cloudConfigured={false}
        onResult={onColorizeResult}
      />,
    );
    expect(colorizeSignal?.aborted).toBe(true);
    resolveColorize!({ dataUrl: "data:image/png;base64,STALE_COLOR" });
    await Promise.resolve();
    expect(onColorizeResult).not.toHaveBeenCalled();
    colorizeView.unmount();

    let upscaleSignal: AbortSignal | undefined;
    let resolveUpscale: ((value: unknown) => void) | null = null;
    upscaleOnDeviceMock.mockImplementationOnce((_src, opts) => {
      upscaleSignal = opts?.signal;
      return new Promise((resolve) => {
        resolveUpscale = resolve;
      });
    });

    const onUpscaleResult = vi.fn();
    const upscaleView = render(
      <StudioOnnxUpscalePanel
        src="data:image/png;base64,LOW_A"
        onResult={onUpscaleResult}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "4배로 확대" }));
    await waitFor(() => expect(upscaleSignal).toBeDefined());

    upscaleView.rerender(
      <StudioOnnxUpscalePanel
        src="data:image/png;base64,LOW_B"
        onResult={onUpscaleResult}
      />,
    );
    expect(upscaleSignal?.aborted).toBe(true);
    resolveUpscale!({ dataUrl: "data:image/png;base64,STALE_UP", width: 2048, height: 2048 });
    await Promise.resolve();
    expect(onUpscaleResult).not.toHaveBeenCalled();
  });
});
