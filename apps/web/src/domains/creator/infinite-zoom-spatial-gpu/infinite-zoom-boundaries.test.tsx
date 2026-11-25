// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioInfiniteZoomSpatialPanel, alignToWebGpu256, computeAlignedTextureBytesPerRow, computeFloat32Ulp, computeFloat64Ulp,
  evaluateFloatingOriginPrecision, evaluateInfiniteZoomScene, exportInfiniteZoomManifestJson, planGpuRingAndAtlasBuffers, validateInfiniteZoomWgsl, type InfiniteZoomSceneSnapshot } from "./index";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("좌표·정수·계산 예제 경계", () => {
  it("subnormal ULP는 f32/f64의 최소 단위보다 작아지지 않는다", () => {
    expect(computeFloat32Ulp(Number.MIN_VALUE)).toBe(2 ** -149);
    expect(computeFloat32Ulp(2 ** -140)).toBe(2 ** -149);
    expect(computeFloat64Ulp(Number.MIN_VALUE)).toBe(Number.MIN_VALUE);
  });
  it("정렬·행 크기 overflow를 유효한 256바이트로 대체하지 않는다", () => {
    expect(() => alignToWebGpu256(Number.MAX_VALUE)).toThrow();
    expect(() => alignToWebGpu256(Number.MAX_SAFE_INTEGER)).toThrow();
    expect(() => computeAlignedTextureBytesPerRow(Number.MAX_VALUE, 8)).toThrow();
    expect(alignToWebGpu256(255.5)).toBe(256);
  });
  it("frame overflow를 거부하고 큰 안전 정수 프레임의 슬롯 분포도 계획과 일치한다", () => {
    expect(() => planGpuRingAndAtlasBuffers({ frameIndex: Number.MAX_VALUE })).toThrow();
    const p = planGpuRingAndAtlasBuffers({ frameIndex: Number.MAX_SAFE_INTEGER - 1 });
    const counts = (state: string) => p.megaAtlas.slotStates.filter(value => value === state).length;
    expect(counts("active-hot")).toBe(p.megaAtlas.hotSlots); expect(counts("cached-warm")).toBe(p.megaAtlas.warmSlots);
    expect(counts("lru-evictable")).toBe(p.megaAtlas.lruEvictableSlots); expect(counts("free")).toBe(p.megaAtlas.freeSlots);
    expect(p.stagingRing.slots.every(slot => Number.isSafeInteger(slot.fenceValue))).toBe(true);
  });
  it("floating-origin은 같은 f64 worldCoord 샘플의 카메라 상대값을 비교한다", () => {
    const report = evaluateFloatingOriginPrecision(100_000, 9_999_999.9);
    for (const sample of report.probeSamples) {
      const expected = Math.fround(Math.fround(sample.worldCoordPx - report.worldOffsetPx) * Math.fround(report.zoomFactor));
      expect(sample.floatingOriginScreenPx).toBe(expected);
    }
  });
  it("JSON·WGSL 검사는 GPU 실행·영구 저장·원고 적용 성공으로 표시하지 않는다", () => {
    const result = exportInfiniteZoomManifestJson(); const json = JSON.parse(result.json);
    expect(json.sourceKind).toBe("cpu-spatial-example"); expect(json.gpuSubmitted).toBe(false); expect(json.artworkApplied).toBe(false);
    expect(result.scene.wgslValidation).toMatchObject({ validationKind: "static-source-contract", gpuCompiled: false });
    expect(result.wgsl).toContain("if (page_count == 0u)");
    expect(() => validateInfiniteZoomWgsl("x".repeat(65_537))).toThrow();
  });
  it("NaN 초기값은 slider·계산 장면에 같은 정규화 값으로 표시된다", () => {
    render(<StudioInfiniteZoomSpatialPanel initialZoomExp={NaN} initialParallaxDepth={Infinity} />);
    expect((screen.getByTestId("infinite-zoom-slider") as HTMLInputElement).value).toBe("-2");
    expect((screen.getByTestId("parallax-depth-slider") as HTMLInputElement).value).toBe("0");
    expect(screen.getByTestId("infinite-zoom-example-scope").textContent).toContain("CPU");
  });
  it("클립보드 미지원은 JSON 성공 알림을 보내지 않고 재시도를 제공한다", async () => {
    vi.stubGlobal("navigator", {}); const receiver = vi.fn(); render(<StudioInfiniteZoomSpatialPanel onExportJson={receiver} />);
    fireEvent.click(screen.getByTestId("copy-manifest-json-btn")); expect(receiver).not.toHaveBeenCalled();
    expect(await screen.findByTestId("infinite-zoom-copy-retry")).toBeTruthy();
  });
  it("콜백 대기 중 중복 변경을 막고 거절 뒤 최신 수신자에게 같은 장면을 재알림한다", async () => {
    const gate = Promise.withResolvers<void>(); const first = vi.fn(() => gate.promise); const latest = vi.fn();
    const view = render(<StudioInfiniteZoomSpatialPanel onSceneChange={first} />);
    fireEvent.click(screen.getByTestId("advance-ring-frame-btn")); fireEvent.click(screen.getByTestId("advance-ring-frame-btn")); expect(first).toHaveBeenCalledTimes(1);
    await act(async () => { gate.reject(new Error("예제 수신 거절")); }); await screen.findByTestId("infinite-zoom-scene-retry");
    view.rerender(<StudioInfiniteZoomSpatialPanel onSceneChange={latest} />); fireEvent.click(screen.getByTestId("infinite-zoom-scene-retry"));
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1)); expect(latest.mock.calls[0]).toEqual(first.mock.calls[0]);
  });
});


describe("내보내기·수신자의 실패 격리", () => {
  it("실제 clipboard ACK 후에만 알리고 알림 거절 재시도는 복사를 반복하지 않는다", async () => {
    const gate = Promise.withResolvers<void>(); const writeText = vi.fn((_text: string) => gate.promise);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const first = vi.fn((_text: string, _scene: InfiniteZoomSceneSnapshot) => { throw new Error("수신 거절"); });
    const latest = vi.fn<(text: string, scene: InfiniteZoomSceneSnapshot) => void>();
    const view = render(<StudioInfiniteZoomSpatialPanel onExportJson={first} />);
    fireEvent.click(screen.getByTestId("copy-manifest-json-btn")); fireEvent.click(screen.getByTestId("copy-manifest-json-btn"));
    expect(writeText).toHaveBeenCalledTimes(1); expect(first).not.toHaveBeenCalled();
    await act(async () => { gate.resolve(); }); await screen.findByTestId("infinite-zoom-copy-retry");
    view.rerender(<StudioInfiniteZoomSpatialPanel onExportJson={latest} />); fireEvent.click(screen.getByTestId("infinite-zoom-copy-retry"));
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1)); expect(writeText).toHaveBeenCalledTimes(1);
    expect(latest.mock.calls[0]).toEqual(first.mock.calls[0]);
    const text = writeText.mock.calls[0]?.[0]; expect(typeof text).toBe("string");
    if (text) expect(screen.getByTestId("infinite-zoom-copy-state").textContent).toContain(String(new TextEncoder().encode(text).byteLength));
  });
  it("복사 완료 뒤 수신자 제거도 성공으로 바꾸지 않고 WGSL 실패는 독립 재시도한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined); vi.stubGlobal("navigator", { clipboard: { writeText } });
    const receiver = vi.fn(() => { throw new Error("알림 실패"); }); const view = render(<StudioInfiniteZoomSpatialPanel onExportJson={receiver} />);
    fireEvent.click(screen.getByTestId("copy-manifest-json-btn")); await screen.findByTestId("infinite-zoom-copy-retry");
    view.rerender(<StudioInfiniteZoomSpatialPanel />); fireEvent.click(screen.getByTestId("infinite-zoom-copy-retry"));
    await waitFor(() => expect(screen.getByTestId("infinite-zoom-copy-state").getAttribute("data-copy-state")).toBe("error"));
    expect(writeText).toHaveBeenCalledTimes(1); expect(receiver).toHaveBeenCalledTimes(1);
    writeText.mockRejectedValue(new Error("클립보드 거절")); fireEvent.click(screen.getByTestId("copy-wgsl-btn")); await screen.findByTestId("infinite-zoom-copy-retry");
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    writeText.mockResolvedValue(undefined); fireEvent.click(screen.getByTestId("infinite-zoom-copy-retry"));
    await waitFor(() => expect(screen.getByTestId("infinite-zoom-copy-state").getAttribute("data-copy-state")).toBe("copied"));
    expect(writeText).toHaveBeenCalledTimes(3); expect(receiver).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("wgsl-shader-preview").textContent).toContain("main_infinite_zoom_atlas");
  });
  it("수신자의 동기 throw·출력 변경은 화면·프리셋·재시도 정본을 오염시키지 않는다", async () => {
    const expected = evaluateInfiniteZoomScene({ frameIndex: 1 });
    const receiver = vi.fn((scene: InfiniteZoomSceneSnapshot) => { Object.assign(scene.activeBand, { labelKo: "외부 수정" }); throw new Error("수신 실패"); });
    const latest = vi.fn<(scene: InfiniteZoomSceneSnapshot) => void>(); const view = render(<StudioInfiniteZoomSpatialPanel onSceneChange={receiver} />);
    expect(() => fireEvent.click(screen.getByTestId("advance-ring-frame-btn"))).not.toThrow(); await screen.findByTestId("infinite-zoom-scene-retry");
    expect(evaluateInfiniteZoomScene({ frameIndex: 1 }).activeBand).toEqual(expected.activeBand);
    view.rerender(<StudioInfiniteZoomSpatialPanel onSceneChange={latest} />); fireEvent.click(screen.getByTestId("infinite-zoom-scene-retry"));
    expect(latest).toHaveBeenCalledTimes(1); expect(latest.mock.calls[0]?.[0]).toEqual(expected);
    expect(screen.getByTestId("gpu-ring-atlas-svg").getAttribute("data-active-slot")).toBe("1");
  });
  it("unmount 후 늦은 복사 응답은 외부 알림을 보내지 않는다", async () => {
    const gate = Promise.withResolvers<void>(); const writeText = vi.fn((_text: string) => gate.promise); vi.stubGlobal("navigator", { clipboard: { writeText } });
    const receiver = vi.fn(); const view = render(<StudioInfiniteZoomSpatialPanel onExportJson={receiver} />);
    fireEvent.click(screen.getByTestId("copy-manifest-json-btn")); view.unmount(); await act(async () => { gate.resolve(); });
    expect(writeText).toHaveBeenCalledTimes(1); expect(receiver).not.toHaveBeenCalled();
  });
  it("reset도 최신 props를 정규화해 같은 장면을 화면과 수신자에게 전달한다", () => {
    const receiver = vi.fn<(scene: InfiniteZoomSceneSnapshot) => void>();
    const view = render(<StudioInfiniteZoomSpatialPanel initialZoomExp={1.2} initialParallaxDepth={0.7} />);
    view.rerender(<StudioInfiniteZoomSpatialPanel initialZoomExp={NaN} initialParallaxDepth={9} onSceneChange={receiver} />);
    fireEvent.click(screen.getByTestId("reset-infinite-zoom-btn"));
    expect((screen.getByTestId("infinite-zoom-slider") as HTMLInputElement).value).toBe("-2");
    expect((screen.getByTestId("parallax-depth-slider") as HTMLInputElement).value).toBe("1");
    expect(receiver.mock.calls[0]?.[0]).toMatchObject({ zoomExp: -2, parallaxDepth: 1 });
  });
  it("정적 검사·극값 JSON도 자원 상한과 입력 원문을 보존한다", () => {
    expect(computeFloat64Ulp(Number.MAX_VALUE)).toBe(2 ** 971);
    expect(() => computeFloat32Ulp(Number.MAX_VALUE)).toThrow();
    const input = { zoomExp: NaN, parallaxDepth: Infinity, activeLayerCount: Number.MAX_VALUE, dirtyTileCount: Number.MAX_VALUE, memo: "원문 é·한글  " }; const before = { ...input };
    const exported = exportInfiniteZoomManifestJson(input); expect(input).toEqual(before); expect(exported.json).not.toContain(input.memo);
    expect(exported.scene.gpuPlan.megaAtlas.slotStates).toHaveLength(256); expect(exported.scene.nestedPortals).toHaveLength(4);
    expect(JSON.parse(exported.json).gpuSubmitted).toBe(false);
    expect(validateInfiniteZoomWgsl(exported.wgsl.replace("if (page_count == 0u) { return; }", "")).valid).toBe(false);
  });
});
