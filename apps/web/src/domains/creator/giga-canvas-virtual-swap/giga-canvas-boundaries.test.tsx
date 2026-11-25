// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  StudioGigaCanvasSwapPanel, compressTileRleDelta, computeMipPyramid, createInMemorySwapSlotPool,
  decodeMorton2D, decompressTileRleDelta, evaluateGigaCanvasSwapState, exportGigaCanvasSwapJson,
  getGigaCanvasPreset, verifyTileSwapRoundTrip,
} from "./index";

afterEach(cleanup);
const presetId = "webtoon-100cut-scroll" as const;
const plan = () => evaluateGigaCanvasSwapState({ presetId, memoryBudgetGb: 4, scrollPositionPct: 24, zoomPct: 100, activeDensityPct: 38 });

describe("상한·저장 근거·실패 경계", () => {
  it("Morton 코드와 사용자 MIP 사양의 비유한·범위 초과 입력을 거절한다", () => {
    expect(() => decodeMorton2D(4294967296)).toThrow();
    expect(() => computeMipPyramid({ ...getGigaCanvasPreset(presetId), widthPx: Number.NaN })).toThrow();
  });
  it("작은 압축 스트림이 지원 타일 상한을 넘는 버퍼를 생성하지 못한다", () => {
    const bytes = [84, 83, 82, 68, 0, 0, 0, 32, 0];
    let remaining = 2 * 1024 * 1024;
    while (remaining > 0) {
      const run = Math.min(65665, remaining); const ext = run - 130;
      bytes.push(255, ext & 255, (ext >>> 8) & 255, 0); remaining -= run;
    }
    expect(() => decompressTileRleDelta(new Uint8Array(bytes))).toThrow();
  });
  it("종료 뒤 추가 바이트를 유효한 타일로 숨기지 않는다", () => {
    const compressed = compressTileRleDelta(new Uint8ClampedArray([1, 2, 3, 4]));
    expect(() => decompressTileRleDelta(new Uint8Array([...compressed, 0]))).toThrow();
  });
  it("슬롯 write 반환값도 내부 payload와 분리한다", () => {
    const pool = createInMemorySwapSlotPool();
    const receipt = pool.write("one", new Uint8Array([1, 2])); receipt.payload[0] = 99;
    expect(pool.read("one")).toEqual(new Uint8Array([1, 2]));
  });
  it("슬롯 풀 총량 초과는 기존 슬롯을 바꾸지 않고 거절한다", () => {
    const pool = createInMemorySwapSlotPool(); const bytes = new Uint8Array(1024 * 1024);
    for (let i = 0; i < 16; i += 1) pool.write(String(i), bytes);
    expect(() => pool.write("extra", bytes)).toThrow();
    expect(pool.totalStoredBytes()).toBe(16 * bytes.length);
  });
  it("정규화한 예제 크기와 비정방 RGBA 버퍼의 픽셀 수를 정확히 보고한다", () => {
    const generated = verifyTileSwapRoundTrip({ presetId, tileSize: 1024 });
    expect(generated.tileWidth).toBe(512); expect(generated.rawBytes).toBe(512 * 512 * 4);
    const custom = verifyTileSwapRoundTrip({ presetId, pixels: new Uint8ClampedArray(24) });
    expect(custom.tileWidth * custom.tileHeight * 4).toBe(custom.rawBytes);
  });
  it("모델은 OPFS 권한·저장과 GPU 실행을 확인한 것으로 보고하지 않는다", () => {
    expect(plan()).toMatchObject({ opfsAccessVerified: false, opfsPersistenceVerified: false, gpuExecutionVerified: false });
    const sample = verifyTileSwapRoundTrip({ presetId });
    expect(sample).toMatchObject({ sampleFormat: "rgba8", opfsPersistenceVerified: false });
  });
  it("다른 프리셋의 바이트 검증을 현재 계획의 검증으로 내보내지 않는다", () => {
    expect(() => exportGigaCanvasSwapJson(plan(), verifyTileSwapRoundTrip({ presetId: "hdr-32k-cover" }))).toThrow();
  });
  it("복원 실패 시 검증 전의 정상 슬롯을 보존한다", () => {
    const base = createInMemorySwapSlotPool(); const original = new Uint8Array([7, 8, 9]);
    base.write("kept", original); let written = false;
    const pool = { ...base,
      write: (key: string, data: Uint8Array) => { written = true; return base.write(key, data); },
      read: (key: string) => written ? new Uint8Array([0]) : base.read(key),
    };
    expect(() => verifyTileSwapRoundTrip({ presetId, tileKey: "kept", pool })).toThrow();
    expect(base.read("kept")).toEqual(original);
  });
  it("구성을 바꾸면 이전 바이트 검증을 현재 JSON에서 제거한다", () => {
    render(<StudioGigaCanvasSwapPanel />); fireEvent.click(screen.getByTestId("run-roundtrip-btn"));
    expect(screen.getByTestId("roundtrip-result-card")).toBeTruthy();
    fireEvent.click(screen.getByTestId("budget-btn-8"));
    expect(screen.queryByTestId("roundtrip-result-card")).toBeNull();
  });
  it("클립보드 실패를 안내하고 같은 JSON으로 재시도한다", async () => {
    const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    try {
      render(<StudioGigaCanvasSwapPanel />); fireEvent.click(screen.getByTestId("export-swap-json-btn"));
      await waitFor(() => expect(screen.getByTestId("swap-panel-status").textContent).toContain("복사 실패"));
      expect(screen.getByTestId("swap-json-preview").textContent).toContain("toonstudio.giga-canvas-virtual-swap.v1");
      writeText.mockResolvedValue(undefined); fireEvent.click(screen.getByTestId("export-swap-json-btn"));
      await waitFor(() => expect(screen.getByTestId("swap-panel-status").textContent).toContain("복사했습니다"));
    } finally { if (previous) Object.defineProperty(navigator, "clipboard", previous); else Reflect.deleteProperty(navigator, "clipboard"); }
  });
  it("내보내기 수신자의 비동기 거부도 처리하고 재시도할 수 있다", async () => {
    const onExportJson = vi.fn().mockRejectedValueOnce(new Error("receiver failed")).mockResolvedValue(undefined);
    render(<StudioGigaCanvasSwapPanel onExportJson={onExportJson} />);
    fireEvent.click(screen.getByTestId("export-swap-json-btn"));
    await waitFor(() => expect(screen.getByTestId("swap-panel-status").textContent).toContain("전달 실패"));
    fireEvent.click(screen.getByTestId("export-swap-json-btn"));
    await waitFor(() => expect(onExportJson).toHaveBeenCalledTimes(2));
  });
});
