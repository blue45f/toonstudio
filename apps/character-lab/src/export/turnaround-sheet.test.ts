import { describe, expect, it } from "vitest";

import { createMockEngine } from "../testing/mock-engine";

import { isPng } from "./png-encoder";
import { TURNAROUND_YAW_ANGLES_DEG, clampTurnaroundPanelSize, exportTurnaroundSheetPng, stitchHorizontalRasters } from "./turnaround-sheet";

describe("export/turnaround-sheet", () => {
  it("clampTurnaroundPanelSize는 4컷 합산 너비가 4096px을 넘지 않도록 단일 컷 너비를 1024px 이하로 제한한다", () => {
    expect(clampTurnaroundPanelSize(2048, 1536)).toEqual({ panelWidth: 1024, panelHeight: 1536 });
    expect(clampTurnaroundPanelSize(512, 768)).toEqual({ panelWidth: 512, panelHeight: 768 });
    expect(clampTurnaroundPanelSize(4, 4)).toEqual({ panelWidth: 16, panelHeight: 16 });
  });

  it("stitchHorizontalRasters는 동일 높이 패널들을 좌→우 순서로 정확히 이어 붙인다", () => {
    const p1 = { width: 2, height: 1, rgba: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]) };
    const p2 = { width: 1, height: 1, rgba: new Uint8ClampedArray([0, 0, 255, 255]) };
    const out = stitchHorizontalRasters([p1, p2]);
    expect(out.width).toBe(3);
    expect(out.height).toBe(1);
    expect([...out.rgba]).toEqual([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
  });

  it("exportTurnaroundSheetPng는 0°·35°·90°·180° 4방향을 연속 캡처해 가로 합성 PNG를 생성한다", async () => {
    const engine = createMockEngine();
    const outcome = await exportTurnaroundSheetPng(
      engine,
      { panelWidth: 32, panelHeight: 48, framingMode: "full-body", settleSteps: 3 },
      { now: () => 100 },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(isPng(outcome.bytes)).toBe(true);
    expect(outcome.receipt.width).toBe(32 * TURNAROUND_YAW_ANGLES_DEG.length);
    expect(outcome.receipt.height).toBe(48);
    expect(outcome.receipt.fileName).toMatch(/-128x48-turnaround\.png$/u);

    const renderCalls = engine.calls.filter((call) => call.method === "renderPasses");
    expect(renderCalls).toHaveLength(4);
    const yaws = renderCalls.map((call) => (call.args[0] as { camera?: { yawDeg?: number } }).camera?.yawDeg);
    expect(yaws).toEqual([0, 35, 90, 180]);
    expect(engine.calls.find((call) => call.method === "settle")?.args).toEqual([3]);
  });

  it("허용 해상도 상한(총 폭 > 4096px)을 초과하면 export-turnaround-size 실패를 반환한다", async () => {
    const engine = createMockEngine();
    const outcome = await exportTurnaroundSheetPng(engine, { panelWidth: 1200, panelHeight: 512 });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.code).toBe("export-turnaround-size");
  });
});
