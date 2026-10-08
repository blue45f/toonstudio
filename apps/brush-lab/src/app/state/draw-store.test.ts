import { describe, expect, it } from "vitest";

import { createDrawActions, createDrawStore, DRAW_PAPER_KINDS, initialDrawState } from "./draw-store";

import type { DrawStrokeStats } from "./draw-store";

function stats(): DrawStrokeStats {
  return {
    addSamplesP50Ms: 1,
    addSamplesP95Ms: 2,
    endStrokeMs: 3,
    readbackMs: 4,
    dabCount: 5,
    overflowDabs: 0,
    frames: 2,
    receipt: { dabCount: 5, submitCount: 1, gpuTimeMs: null, timingSource: "unavailable", frameTimesMs: [1], overflowDabs: 0, poolTilesUsed: 1 },
    timings: { addSamplesMs: [1, 2], endStrokeMs: 3, readbackMs: 4 },
  };
}

describe("drawStore", () => {
  it("초기 상태: 마우스 압력 시뮬레이션 켬, 1024×640, 레인 미정, 브러시 기본값", () => {
    const s = initialDrawState();
    expect(s.mousePressureSim).toBe(true);
    expect(s.canvasMode).toBe("1024x640");
    expect(s.laneId).toBeNull();
    expect(s.laneChosenByUser).toBe(false);
    expect(s.overrides).toEqual({});
    expect(s.panelOpen).toBe(true);
  });

  it("set은 얕은 병합이며 변경이 없으면 구독자를 깨우지 않는다", () => {
    const store = createDrawStore();
    let wakes = 0;
    const off = store.subscribe(() => {
      wakes += 1;
    });
    store.set({ search: "수채" });
    store.set({ search: "수채" });
    expect(wakes).toBe(1);
    off();
    store.set({ search: "" });
    expect(wakes).toBe(1);
  });

  it("초기 레인은 한 번만 정해지고, 사용자가 고르면 이후 자동 선택이 무시된다(ADR-0018)", () => {
    const store = createDrawStore();
    const a = createDrawActions(store);
    expect(a.pickInitialLane("webgpu-compute")).toBe(true);
    expect(store.get().laneId).toBe("webgpu-compute");
    expect(store.get().laneChosenByUser).toBe(false);
    expect(store.get().nonce).toBe(0);
    // 이미 정했으므로 다른 후보가 나중에 supported가 되어도 바꾸지 않는다.
    expect(a.pickInitialLane("cpu-reference")).toBe(false);
    expect(store.get().laneId).toBe("webgpu-compute");

    a.chooseLane("wasm-cpu");
    expect(store.get()).toMatchObject({ laneId: "wasm-cpu", laneChosenByUser: true, nonce: 1 });
    expect(a.pickInitialLane("cpu-reference")).toBe(false);
    expect(store.get().laneId).toBe("wasm-cpu");

    const fresh = createDrawStore();
    const b = createDrawActions(fresh);
    b.chooseLane("cpu-reference");
    expect(b.pickInitialLane("webgpu-compute")).toBe(false);
    expect(fresh.get().laneId).toBe("cpu-reference");
  });

  it("브러시를 바꾸면 오버라이드·안정화·종이 종류는 기본으로 돌아가고 색은 유지되며 최근 사용에 쌓인다", () => {
    const store = createDrawStore();
    const a = createDrawActions(store);
    a.setColor("#336699");
    a.setOverride({ sizePx: 20 });
    a.setOverride({ opacity: 0.4 });
    a.setStabilizerPct(70);
    a.setPaperKind("rough");
    expect(store.get().overrides).toEqual({ sizePx: 20, opacity: 0.4 });
    a.setPreset("charcoal");
    expect(store.get()).toMatchObject({ presetId: "charcoal", overrides: {}, stabilizerPct: null, paperKind: "preset", color: "#336699" });
    a.setPreset("watercolor-wet");
    a.setPreset("charcoal");
    expect(store.get().recentPresetIds).toEqual(["charcoal", "watercolor-wet"]);
    for (let i = 0; i < 12; i += 1) a.setPreset(i % 2 === 0 ? "airbrush" : `p${i}`);
    expect(store.get().recentPresetIds.length).toBeLessThanOrEqual(8);
  });

  it("최근 색은 8칸이고 중복은 앞으로 당긴다", () => {
    const store = createDrawStore();
    const a = createDrawActions(store);
    for (let i = 0; i < 10; i += 1) a.commitColor(`#00000${i}`);
    expect(store.get().recentColors).toHaveLength(8);
    a.commitColor("#000005");
    expect(store.get().recentColors[0]).toBe("#000005");
  });

  it("지우기는 nonce를 올리고 획 통계는 recordStroke로 쌓이며 resetDocumentStats로 비워진다", () => {
    const store = createDrawStore();
    const a = createDrawActions(store);
    a.recordStroke(stats(), { width: 1, height: 1, data: new Uint8ClampedArray(4) });
    a.recordStroke(stats(), { width: 1, height: 1, data: new Uint8ClampedArray(4) });
    expect(store.get().strokes).toBe(2);
    expect(store.get().lastImage).not.toBeNull();
    a.clearDocument();
    expect(store.get().nonce).toBe(1);
    a.resetDocumentStats();
    expect(store.get()).toMatchObject({ strokes: 0, lastStroke: null, lastImage: null });
  });

  it("알림은 순번을 붙이고 최근 8개만 남기며 clearNotices로 비운다", () => {
    const store = createDrawStore();
    const a = createDrawActions(store);
    for (let i = 0; i < 10; i += 1) a.pushNotice("code", `m${i}`);
    expect(store.get().notices).toHaveLength(8);
    expect(store.get().notices.at(-1)).toMatchObject({ seq: 10, message: "m9" });
    a.clearNotices();
    expect(store.get().notices).toEqual([]);
  });

  it("같은 캔버스 모드를 다시 고르면 구독자를 깨우지 않는다", () => {
    const store = createDrawStore();
    const a = createDrawActions(store);
    let wakes = 0;
    store.subscribe(() => {
      wakes += 1;
    });
    a.setCanvasMode("1024x640");
    expect(wakes).toBe(0);
    a.setCanvasMode("512");
    expect(wakes).toBe(1);
  });

  it("종이 종류 프리셋은 스키마 범위 안의 값만 쓴다", () => {
    for (const kind of DRAW_PAPER_KINDS) {
      if (!kind.values) continue;
      expect(kind.values.paperScale).toBeGreaterThan(0);
      expect(kind.values.paperRoughness).toBeGreaterThanOrEqual(0);
      expect(kind.values.paperRoughness).toBeLessThanOrEqual(1);
      expect(kind.values.paperAbsorbency).toBeGreaterThanOrEqual(0);
      expect(kind.values.paperAbsorbency).toBeLessThanOrEqual(1);
    }
  });
});
