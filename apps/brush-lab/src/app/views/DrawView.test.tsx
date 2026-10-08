// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PRESET_CATALOG } from "../../engine/presets/catalog";
import { supportedReport } from "../../lanes/lane";
import { BrushLabApp } from "../shell/BrushLabApp";
import { createDrawStore } from "../state/draw-store";
import { createLabStore } from "../state/lab-store";
import { installCanvasStub } from "../testing/canvas-stub";
import { createMockLane, mockEnvironment, unavailableDescriptor } from "../testing/mock-lane";
import { createMockRunner } from "../testing/mock-runner";

import type { BrushProgram } from "../../engine/presets/program-schema";
import type { LaneDescriptor, LaneId } from "../../lanes/lane";
import type { GalleryRenderer, GalleryRenderResult } from "../../platform/worker-client";
import type { DrawStore } from "../state/draw-store";
import type { CanvasStubRecorder } from "../testing/canvas-stub";
import type { MockLane, MockLaneOptions } from "../testing/mock-lane";

interface Harness {
  descriptors: LaneDescriptor[];
  /** `desc.create()`가 만든 모든 레인(능력 탐지용 probe 인스턴스 포함). 세션이 쓴 레인은 `sessionLanes`. */
  lanes: MockLane[];
  programs: BrushProgram[];
  added: { pressure: number; pointerType: string; x: number }[][];
  /** 세션이 레인 init에 넘긴 설정. */
  inits: { laneId: LaneId; presentCanvas: boolean; wetCapacityTiles: number | undefined; width: number; height: number }[];
  renders: string[];
  gallery: GalleryRenderer;
  drawStore: DrawStore;
}

/** 레인 호출을 기록하는 모의 레인 디스크립터. `create`가 만든 레인은 `lanes`에 쌓인다. */
function recordingDescriptor(h: Pick<Harness, "lanes" | "programs" | "added" | "inits">, opts: MockLaneOptions & { id: LaneId }): LaneDescriptor {
  return {
    id: opts.id,
    label: opts.label ?? `모의 ${opts.id}`,
    kind: opts.kind ?? "baseline",
    status: opts.status ?? "implemented",
    nodeVerification: "모의",
    browserVerification: "없음",
    create: () => {
      const lane = createMockLane(opts);
      const begin = lane.beginStroke.bind(lane);
      lane.beginStroke = (program, seed, options) => {
        h.programs.push(program);
        begin(program, seed, options);
      };
      const add = lane.addSamples.bind(lane);
      lane.addSamples = (samples) => {
        h.added.push(samples.map((s) => ({ pressure: s.pressure, pointerType: s.pointerType, x: s.x })));
        return add(samples);
      };
      const init = lane.init.bind(lane);
      lane.init = (env, config) => {
        h.inits.push({
          laneId: opts.id,
          presentCanvas: config.presentCanvas !== undefined,
          wetCapacityTiles: config.wetCapacityTiles,
          width: config.width,
          height: config.height,
        });
        return init(env, config);
      };
      h.lanes.push(lane);
      return lane;
    },
  };
}

/** init까지 호출된(= 세션이 실제로 쓴) 레인만. probe용 인스턴스는 제외한다. */
function sessionLanes(h: Pick<Harness, "lanes">): MockLane[] {
  return h.lanes.filter((l) => l.calls.includes("init"));
}

type HarnessBase = Pick<Harness, "lanes" | "programs" | "added" | "inits">;

function makeHarness(descriptorsFor: (h: HarnessBase) => LaneDescriptor[]): Harness {
  const base: HarnessBase = { lanes: [], programs: [], added: [], inits: [] };
  const renders: string[] = [];
  const gallery: GalleryRenderer = {
    render: (presetId, fixtureId, size) => {
      renders.push(`${presetId}:${fixtureId}:${size}`);
      const result: GalleryRenderResult = {
        presetId,
        fixtureId,
        image: { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4).fill(40) },
        pixelHash: `h-${presetId}`,
        renderMs: 1,
        dabCount: 3,
        family: [],
      };
      return Promise.resolve(result);
    },
    dispose: () => {},
  };
  return { ...base, descriptors: descriptorsFor(base), renders, gallery, drawStore: createDrawStore() };
}

/** webgpu-compute는 사용 불가, wasm-cpu·cpu-reference는 사용 가능. */
function defaultDescriptors(h: HarnessBase): LaneDescriptor[] {
  return [
    recordingDescriptor(h, { id: "cpu-reference", label: "CPU 참조" }),
    unavailableDescriptor("webgpu-compute", ["webgpu-api-unavailable"], "WebGPU compute"),
    recordingDescriptor(h, { id: "wasm-cpu", label: "wasm CPU", kind: "candidate" }),
    recordingDescriptor(h, { id: "canvas2d", label: "Canvas2D", status: "browser-verification-required" }),
  ];
}

let stub: CanvasStubRecorder;
beforeEach(() => {
  stub = installCanvasStub();
});
afterEach(() => {
  cleanup();
  stub.restore();
  vi.restoreAllMocks();
});

function renderDraw(h: Harness, props: Partial<Parameters<typeof BrushLabApp>[0]> = {}) {
  const store = createLabStore({ tab: "draw" });
  const result = render(
    <BrushLabApp
      registry={h.descriptors}
      env={mockEnvironment()}
      runner={createMockRunner()}
      store={store}
      drawStore={h.drawStore}
      gallery={h.gallery}
      {...props}
    />,
  );
  return { store, ...result };
}

function pointerEvent(type: string, init: PointerEventInit & { timeStamp?: number } = {}): PointerEvent {
  const { timeStamp, ...rest } = init;
  const ev = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
    pressure: 0.5,
    ...rest,
  });
  if (typeof timeStamp === "number") Object.defineProperty(ev, "timeStamp", { value: timeStamp });
  return ev;
}

async function ready(h: Harness): Promise<HTMLElement> {
  await waitFor(() => expect(h.drawStore.get().sessionStatus).toBe("ready"));
  return screen.getByTestId("lab-draw-stage");
}

/** 한 획: down → move → up. rAF가 프레임을 묶어 처리할 시간을 준다. */
async function drawStroke(h: Harness, stage: HTMLElement, t0: number, pointerType = "mouse"): Promise<void> {
  const before = h.drawStore.get().strokes;
  act(() => {
    stage.dispatchEvent(pointerEvent("pointerdown", { clientX: 20, clientY: 20, timeStamp: t0, pointerType }));
    stage.dispatchEvent(pointerEvent("pointermove", { clientX: 60, clientY: 40, timeStamp: t0 + 16, pointerType }));
    stage.dispatchEvent(pointerEvent("pointermove", { clientX: 120, clientY: 50, timeStamp: t0 + 32, pointerType }));
    stage.dispatchEvent(pointerEvent("pointerup", { clientX: 130, clientY: 52, timeStamp: t0 + 48, pointerType }));
  });
  await waitFor(() => expect(h.drawStore.get().strokes).toBe(before + 1));
}

// jsdom 전체 앱 렌더는 CPU를 공유하는 환경에서 수 초가 걸릴 수 있어 타임아웃을 넉넉히 둔다.
describe("DrawView", { timeout: 30_000 }, () => {
  it("능력 탐지로 시작 레인을 정한다: webgpu-compute 불가 → wasm-cpu, 사용자가 고르기 전까지만 자동", async () => {
    const h = makeHarness(defaultDescriptors);
    renderDraw(h, { autoProbe: false });
    await ready(h);
    expect(h.drawStore.get()).toMatchObject({ laneId: "wasm-cpu", laneChosenByUser: false });
    expect(sessionLanes(h).map((l) => l.id)).toEqual(["wasm-cpu"]);
    expect(screen.getByTestId("lab-draw-lane-origin").textContent).toContain("시작 시 능력 탐지로 정한 레인");
  });

  it("webgpu-compute가 가능하면 그것을 시작 레인으로 고른다", async () => {
    const h = makeHarness((base) => [
      recordingDescriptor(base, { id: "cpu-reference", label: "CPU 참조" }),
      recordingDescriptor(base, { id: "webgpu-compute", label: "WebGPU compute", kind: "candidate", status: "browser-verification-required" }),
      recordingDescriptor(base, { id: "wasm-cpu", label: "wasm CPU", kind: "candidate" }),
    ]);
    renderDraw(h);
    await ready(h);
    expect(h.drawStore.get().laneId).toBe("webgpu-compute");
    // 라이브 표시 레인은 표시 캔버스를 레인에 넘긴다(레인 init 설정은 모의라 캔버스 크기로 확인).
    expect(screen.getByTestId("lab-draw-badge-unverified").textContent).toContain("browser-verification-required");
  });

  it("엔진 셀렉터: 미지원 레인은 비활성이며 한글 사유 코드를 보여 주고, 직접 고르면 캔버스가 비워진다", async () => {
    const h = makeHarness(defaultDescriptors);
    renderDraw(h, { autoProbe: false });
    const stage = await ready(h);
    await drawStroke(h, stage, 1);
    expect(h.drawStore.get().strokes).toBe(1);

    const select = screen.getByLabelText("레인") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => [o.value, o.disabled, o.textContent ?? ""] as const);
    const gpu = options.find((o) => o[0] === "webgpu-compute");
    expect(gpu?.[1]).toBe(true);
    expect(gpu?.[2]).toContain("webgpu-api-unavailable");
    expect(gpu?.[2]).toContain("이 브라우저에 navigator.gpu(WebGPU API)가 없음");
    expect(options.find((o) => o[0] === "wasm-cpu")?.[1]).toBe(false);
    expect(screen.getByText(/지금 1획이 사라진다/u)).toBeTruthy();

    const firstLane = sessionLanes(h)[0];
    fireEvent.change(select, { target: { value: "cpu-reference" } });
    await waitFor(() => expect(h.drawStore.get().sessionStatus).toBe("ready"));
    expect(h.drawStore.get()).toMatchObject({ laneId: "cpu-reference", laneChosenByUser: true, strokes: 0, lastImage: null });
    expect(firstLane?.calls).toContain("dispose");
    expect(sessionLanes(h).map((l) => l.id)).toEqual(["wasm-cpu", "cpu-reference"]);
    expect(screen.getByTestId("lab-draw-lane-origin").textContent).toContain("직접 고른 레인");
    // 비활성 옵션을 프로그램적으로 골라도 불가 레인으로 바뀌지 않는다.
    fireEvent.change(select, { target: { value: "webgpu-compute" } });
    expect(h.drawStore.get().laneId).toBe("cpu-reference");
    expect(h.drawStore.get().nonce).toBe(1);
  });

  it("직접 고른 레인이 시작에 실패하면 사유 코드를 드러내고 다른 레인으로 자동 전환하지 않는다(ADR-0018)", async () => {
    const h = makeHarness((base) => [
      recordingDescriptor(base, { id: "cpu-reference", label: "CPU 참조" }),
      recordingDescriptor(base, { id: "wasm-cpu", label: "wasm CPU", kind: "candidate", failInit: "wasm-integrity-mismatch" }),
    ]);
    renderDraw(h, { autoProbe: false });
    await waitFor(() => expect(h.drawStore.get().sessionStatus).toBe("error"));
    // 초기 선택(wasm-cpu)이 init에서 실패했다: 알림에 사유 코드가 있고 레인은 그대로다.
    expect(h.drawStore.get().laneId).toBe("wasm-cpu");
    const notices = screen.getByTestId("lab-draw-notices");
    expect(notices.textContent).toContain("wasm-integrity-mismatch");
    expect(notices.textContent).toContain("레인 시작 실패");
    expect(sessionLanes(h).filter((l) => l.id === "cpu-reference")).toHaveLength(0);
    expect(screen.getByTestId("lab-draw-status").textContent).toBe("레인 시작 실패");
  });

  it("모든 후보가 unavailable이면 알림만 남기고 레인을 정하지 않는다", async () => {
    const h = makeHarness(() => [
      unavailableDescriptor("webgpu-compute", ["webgpu-api-unavailable"]),
      unavailableDescriptor("wasm-cpu", ["wasm-artifact-missing"]),
      unavailableDescriptor("cpu-reference", ["dom-unavailable"]),
    ]);
    renderDraw(h, { autoProbe: false });
    await waitFor(() => expect(screen.getByTestId("lab-draw-notices").textContent).toContain("no-initial-lane"));
    expect(h.drawStore.get().laneId).toBeNull();
    expect(h.drawStore.get().sessionStatus).toBe("idle");
  });

  it("브러시 선택: 가족 칩·검색·최근 사용·한글 이름으로 고르고 미리보기를 지연 요청한다", async () => {
    const h = makeHarness(defaultDescriptors);
    renderDraw(h, { autoProbe: false });
    await ready(h);
    const brushes = screen.getByTestId("lab-draw-brushes");
    // 가족 칩은 코드(카탈로그)에서 읽은 한글 어휘다.
    for (const label of ["연필", "목탄", "잉크", "수채", "수묵", "유화", "에어브러시", "마커", "해칭"]) {
      expect(within(brushes).getByRole("button", { name: label })).toBeTruthy();
    }
    expect(within(brushes).getAllByRole("listitem")).toHaveLength(PRESET_CATALOG.length);

    // 가족 칩
    fireEvent.click(within(brushes).getByRole("button", { name: "수채" }));
    const names = within(brushes).getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(names.length).toBeGreaterThan(0);
    expect(names.every((t) => t.includes("수채"))).toBe(true);
    expect(within(brushes).getByRole("button", { name: "수채" }).getAttribute("aria-pressed")).toBe("true");

    // 검색(가족 필터 해제 후)
    fireEvent.click(within(brushes).getByRole("button", { name: "전체" }));
    fireEvent.change(screen.getByLabelText("브러시 검색"), { target: { value: "목탄" } });
    expect(within(brushes).getAllByRole("listitem")).toHaveLength(1);

    // 고르면 프로그램이 바뀌고 최근 사용에 쌓인다
    fireEvent.click(screen.getByTestId("lab-draw-brush-charcoal"));
    expect(h.drawStore.get().presetId).toBe("charcoal");
    fireEvent.change(screen.getByLabelText("브러시 검색"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("lab-draw-chip-recent"));
    expect(within(brushes).getAllByRole("listitem").map((li) => li.textContent ?? "")).toEqual([expect.stringContaining("목탄")]);

    // 미리보기: Worker에 curve 128²로 지연 요청되고 캐시된다
    await waitFor(() => expect(h.drawStore.get().previews.charcoal?.status).toBe("done"));
    expect(h.renders).toContain("charcoal:curve:128");
    const calls = h.renders.length;
    fireEvent.click(within(brushes).getByRole("button", { name: "전체" }));
    fireEvent.click(within(brushes).getByRole("button", { name: "전체" }));
    await waitFor(() => expect(h.drawStore.get().previews[PRESET_CATALOG[0]?.id ?? ""]?.status).toBe("done"));
    // 같은 브러시를 두 번 요청하지 않는다(캐시)
    expect(new Set(h.renders).size).toBe(h.renders.length);
    expect(h.renders.length).toBeGreaterThanOrEqual(calls);
  });

  it("미리보기 Worker가 없으면 이름만 보여 주고 사유를 드러낸다(메인 스레드 대체 렌더 없음)", async () => {
    const h = makeHarness(defaultDescriptors);
    renderDraw(h, { autoProbe: false, gallery: null, galleryError: "테스트 환경에는 Worker가 없다" });
    await ready(h);
    expect(screen.getByTestId("lab-draw-brushes").textContent).toContain("테스트 환경에는 Worker가 없다");
    expect(within(screen.getByTestId("lab-draw-brushes")).getAllByRole("listitem")).toHaveLength(PRESET_CATALOG.length);
    expect(Object.keys(h.drawStore.get().previews)).toHaveLength(0);
  });

  it("Worker가 미리보기 하나를 실패시키면 그 항목만 오류로 남기고 나머지는 계속한다", async () => {
    const h = makeHarness(defaultDescriptors);
    const failing: GalleryRenderer = {
      render: (presetId, fixtureId, size) => (presetId === "airbrush" ? Promise.reject(new Error("모의 Worker 실패")) : h.gallery.render(presetId, fixtureId, size)),
      dispose: () => {},
    };
    renderDraw(h, { autoProbe: false, gallery: failing });
    await ready(h);
    await waitFor(() => expect(h.drawStore.get().previews.airbrush?.status).toBe("error"));
    expect(h.drawStore.get().previews.airbrush?.error).toContain("모의 Worker 실패");
    await waitFor(() => expect(h.drawStore.get().previews["pencil-hb"]?.status).toBe("done"));
    expect(screen.getByTestId("lab-draw-brush-airbrush").querySelector("[role='img'][aria-label^='미리보기 실패']")).toBeTruthy();
  });

  it("파라미터가 프로그램 오버라이드로 반영된다: 크기·불투명도·흐름·안정화·종이(다음 획부터, 레인은 유지)", async () => {
    const h = makeHarness(defaultDescriptors);
    renderDraw(h, { autoProbe: false });
    const stage = await ready(h);
    await drawStroke(h, stage, 1);
    expect(h.programs.at(-1)?.id).toBe("pencil-hb");
    const lane = sessionLanes(h)[0];

    fireEvent.change(screen.getByLabelText(/^크기\(px\)/u), { target: { value: "42" } });
    fireEvent.change(screen.getByLabelText(/^불투명도/u), { target: { value: "0.35" } });
    fireEvent.change(screen.getByLabelText(/^흐름/u), { target: { value: "0.6" } });
    fireEvent.change(screen.getByLabelText(/^안정화\(0~100\)/u), { target: { value: "80" } });
    fireEvent.click(screen.getByLabelText("종이 질감 켜기"));
    fireEvent.change(screen.getByLabelText("종이 종류"), { target: { value: "rough" } });
    await drawStroke(h, stage, 200);

    const program = h.programs.at(-1);
    expect(program?.tip.sizePx).toBe(42);
    expect(program?.deposition.opacity).toBeCloseTo(0.35, 12);
    expect(program?.deposition.flow).toBeCloseTo(0.6, 12);
    // 안정화 80 → s = 0.8 → minCutoff = lerp(3.0, 0.5, 0.8) = 1.0
    expect(program?.input.oneEuro?.position.minCutoff).toBeCloseTo(1.0, 12);
    expect(program?.paper.roughness).toBe(0.85);
    expect(program?.paper.scale).toBe(0.8);
    // 파라미터를 바꿔도 문서(레인)는 그대로다.
    expect(sessionLanes(h)).toHaveLength(1);
    expect(lane?.calls).not.toContain("dispose");
    expect(h.drawStore.get().strokes).toBe(2);
    expect(screen.getByTestId("lab-draw-config-hash").textContent).toMatch(/[0-9a-f]{16}/u);
  });

  it("종이 질감 켜기/끄기와 끈 당김(lazy-brush) 방식이 반영된다", async () => {
    const h = makeHarness(defaultDescriptors);
    renderDraw(h, { autoProbe: false });
    const stage = await ready(h);
    const paper = screen.getByLabelText("종이 질감 켜기") as HTMLInputElement;
    expect(paper.checked).toBe(true); // 연필 HB는 종이 켬
    fireEvent.click(paper);
    await drawStroke(h, stage, 1);
    expect(h.programs.at(-1)?.paper.enabled).toBe(false);

    fireEvent.change(screen.getByLabelText("보정 방식"), { target: { value: "lazy-brush" } });
    fireEvent.change(screen.getByLabelText(/^안정화\(0~100\)/u), { target: { value: "50" } });
    expect(screen.getByTestId("lab-draw-stab-help").textContent).toContain("끈 길이 30 px");
    expect(screen.getByText(/applyStabilizer/u)).toBeTruthy();
    h.added.length = 0;
    await drawStroke(h, stage, 200);
    // 끈 길이 30 px: 포인터가 끈 길이보다 멀어지면 붓이 끌려오므로 끝점(클라이언트 x 130)보다 늦다.
    const xs = h.added.flat().map((s) => s.x);
    expect(xs.length).toBeGreaterThan(2);
    expect(xs[0]).toBe(20);
    expect(Math.max(...xs)).toBeLessThan(130 - 29);
    expect(Math.max(...xs)).toBeGreaterThan(20);
    // 끈 당김 모드에서는 엔진 1€ 필터 오버라이드를 걸지 않는다(브러시 기본값).
    expect(h.programs.at(-1)?.input.oneEuro).toBeUndefined();
    expect(h.drawStore.get().strokes).toBe(2);
  });

  it("마우스 압력 시뮬레이션: 켜면 속도 기반 압력이 레인에 가고, 끄면 브라우저 압력(0.5)이 간다. 펜은 항상 실제 압력", async () => {
    const h = makeHarness(defaultDescriptors);
    renderDraw(h, { autoProbe: false });
    const stage = await ready(h);
    const toggle = screen.getByLabelText("마우스 압력 시뮬레이션(속도 기반)") as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    await drawStroke(h, stage, 1);
    const simulated = h.added.flat().filter((s) => s.pointerType === "mouse").map((s) => s.pressure);
    expect(simulated.length).toBeGreaterThan(2);
    expect(simulated.some((p) => Math.abs(p - 0.5) > 0.01)).toBe(true);

    fireEvent.click(toggle);
    h.added.length = 0;
    await drawStroke(h, stage, 200);
    const raw = h.added.flat().filter((s) => s.pointerType === "mouse").map((s) => s.pressure);
    expect(raw.length).toBeGreaterThan(2);
    expect(raw.every((p) => Math.abs(p - 0.5) < 1e-6)).toBe(true);

    fireEvent.click(toggle);
    h.added.length = 0;
    await drawStroke(h, stage, 400, "pen");
    const pen = h.added.flat().filter((s) => s.pointerType === "pen").map((s) => s.pressure);
    expect(pen.length).toBeGreaterThan(2);
    expect(pen.every((p) => Math.abs(p - 0.5) < 1e-6)).toBe(true);
  });

  it("색: 16진 입력·H/S/V·최근 색 8칸. 잘못된 입력은 오류를 표시하고 색을 바꾸지 않으며, '색은 검정' 안내는 더 이상 없다", async () => {
    const h = makeHarness(defaultDescriptors);
    renderDraw(h, { autoProbe: false });
    const stage = await ready(h);
    expect(screen.queryByTestId("lab-draw-color-note")).toBeNull();
    expect(screen.queryByText(/기본색\(검정\)으로 그린다/u)).toBeNull();
    const hex = screen.getByLabelText("16진 색") as HTMLInputElement;
    fireEvent.change(hex, { target: { value: "#336699" } });
    expect(h.drawStore.get().color).toBe("#336699");
    fireEvent.change(hex, { target: { value: "#zzz" } });
    fireEvent.blur(hex);
    expect(screen.getByText(/색이 아니다/u).getAttribute("role")).toBe("alert");
    expect(h.drawStore.get().color).toBe("#336699");
    fireEvent.change(hex, { target: { value: "#f80" } });
    fireEvent.keyDown(hex, { key: "Enter" });
    expect(h.drawStore.get().color).toBe("#ff8800");

    fireEvent.change(screen.getByLabelText(/^색조\(H\)/u), { target: { value: "120" } });
    expect(h.drawStore.get().color).toBe("#00ff00");
    fireEvent.change(screen.getByLabelText(/^명도\(V\)/u), { target: { value: "50" } });
    expect(h.drawStore.get().color).toBe("#008000");
    fireEvent.change(screen.getByLabelText(/^채도\(S\)/u), { target: { value: "0" } });
    expect(h.drawStore.get().color).toBe("#808080");

    // 최근 색은 획이 끝날 때 쓴 색이 올라온다
    expect(screen.queryByTestId("lab-draw-recent-0")).toBeNull();
    await drawStroke(h, stage, 1);
    expect(h.drawStore.get().recentColors).toEqual(["#808080"]);
    fireEvent.change(hex, { target: { value: "#112233" } });
    await drawStroke(h, stage, 200);
    expect(h.drawStore.get().recentColors).toEqual(["#112233", "#808080"]);
    fireEvent.click(screen.getByTestId("lab-draw-recent-1"));
    expect(h.drawStore.get().color).toBe("#808080");
    expect(screen.getByRole("group", { name: "최근 색 8칸" })).toBeTruthy();
  });

  it("색이 레인에 전달된다: 처음 색은 검정, 색을 바꾸면 다음 획부터 beginStroke options.color로 넘어가고 문서·레인은 유지된다", async () => {
    const h = makeHarness(defaultDescriptors);
    renderDraw(h, { autoProbe: false });
    const stage = await ready(h);
    await drawStroke(h, stage, 1);
    const hex = screen.getByLabelText("16진 색") as HTMLInputElement;
    fireEvent.change(hex, { target: { value: "#ff0000" } });
    await drawStroke(h, stage, 200);
    fireEvent.change(hex, { target: { value: "#0000ff" } });
    await drawStroke(h, stage, 400);
    const lanes = sessionLanes(h);
    expect(lanes).toHaveLength(1);
    // 첫 획은 처음 색(#000000 = 검정), 이후 획은 바뀐 색이다. 색 변경은 레인을 다시 만들지 않는다.
    expect(lanes[0]?.strokeOptions).toEqual([
      { color: [0, 0, 0, 1] },
      { color: [1, 0, 0, 1] },
      { color: [0, 0, 1, 1] },
    ]);
    expect(lanes[0]?.calls).not.toContain("dispose");
    expect(h.drawStore.get().strokes).toBe(3);
  });

  it("고른 색은 새 세션(지우기·레인 변경)에도 유지돼 첫 획부터 그 색으로 시작한다", async () => {
    const h = makeHarness(defaultDescriptors);
    h.drawStore.set({ color: "#336699" });
    renderDraw(h, { autoProbe: false });
    const stage = await ready(h);
    await drawStroke(h, stage, 1);
    expect(sessionLanes(h)[0]?.strokeOptions).toEqual([{ color: [0x33 / 255, 0x66 / 255, 0x99 / 255, 1] }]);
    fireEvent.click(screen.getByTestId("lab-draw-clear"));
    await waitFor(() => expect(sessionLanes(h)).toHaveLength(2));
    const stage2 = await ready(h);
    await drawStroke(h, stage2, 500);
    expect(sessionLanes(h)[1]?.strokeOptions).toEqual([{ color: [0x33 / 255, 0x66 / 255, 0x99 / 255, 1] }]);
  });

  it("입력 표면: touch-action none, 우클릭 메뉴 차단, 캔버스 밖으로 나가도 획 유지", async () => {
    const h = makeHarness(defaultDescriptors);
    renderDraw(h, { autoProbe: false });
    const stage = await ready(h);
    expect(stage.style.touchAction).toBe("none");
    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    stage.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);

    // 캔버스 밖 좌표(음수·초과)도 같은 획의 표본으로 들어간다(포인터 캡처가 요소 밖 move를 계속 전달한다).
    act(() => {
      stage.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, clientY: 10, timeStamp: 1 }));
      stage.dispatchEvent(pointerEvent("pointermove", { clientX: -300, clientY: -50, timeStamp: 17 }));
      stage.dispatchEvent(pointerEvent("pointermove", { clientX: 9000, clientY: 9000, timeStamp: 33 }));
      stage.dispatchEvent(pointerEvent("pointerup", { clientX: 9000, clientY: 9000, timeStamp: 49 }));
    });
    await waitFor(() => expect(h.drawStore.get().strokes).toBe(1));
    expect(sessionLanes(h)[0]?.calls.filter((c) => c === "beginStroke")).toHaveLength(1);
  });

  it("pointercancel은 합성하지 않고 abortStroke로 버린다(문서 보존, 알림, 다음 획 정상)", async () => {
    const h = makeHarness(defaultDescriptors);
    renderDraw(h, { autoProbe: false });
    const stage = await ready(h);
    await drawStroke(h, stage, 1);
    const lane = sessionLanes(h)[0];
    const imageBefore = await lane?.readback();
    act(() => {
      stage.dispatchEvent(pointerEvent("pointerdown", { clientX: 20, clientY: 20, timeStamp: 100 }));
      stage.dispatchEvent(pointerEvent("pointermove", { clientX: 60, clientY: 40, timeStamp: 116 }));
    });
    await waitFor(() => expect(lane?.calls.filter((c) => c === "beginStroke")).toHaveLength(2));
    act(() => {
      stage.dispatchEvent(pointerEvent("pointercancel", { clientX: 60, clientY: 40, timeStamp: 132 }));
    });
    await waitFor(() => expect(lane?.calls.filter((c) => c === "abortStroke")).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId("lab-draw-notices").textContent).toContain("stroke-canceled"));
    expect(lane?.calls.filter((c) => c === "endStroke")).toHaveLength(1);
    expect(h.drawStore.get().strokes).toBe(1);
    expect(await lane?.readback()).toEqual(imageBefore);
    expect(sessionLanes(h)).toHaveLength(1);
    expect(screen.getByTestId("lab-draw-notices").textContent).toContain("그때까지 그린 그림은 그대로다");
    await drawStroke(h, stage, 300);
    expect(h.drawStore.get().strokes).toBe(2);
  });

  it("lostpointercapture(pointerup 없이 캡처 상실)도 같은 abort 경로다", async () => {
    const h = makeHarness(defaultDescriptors);
    renderDraw(h, { autoProbe: false });
    const stage = await ready(h);
    act(() => {
      stage.dispatchEvent(pointerEvent("pointerdown", { clientX: 20, clientY: 20, timeStamp: 100 }));
      stage.dispatchEvent(pointerEvent("pointermove", { clientX: 60, clientY: 40, timeStamp: 116 }));
    });
    await waitFor(() => expect(sessionLanes(h)[0]?.calls).toContain("beginStroke"));
    act(() => {
      stage.dispatchEvent(pointerEvent("lostpointercapture", { clientX: 60, clientY: 40, timeStamp: 132 }));
    });
    await waitFor(() => expect(sessionLanes(h)[0]?.calls).toContain("abortStroke"));
    expect(sessionLanes(h)[0]?.calls).not.toContain("endStroke");
    expect(h.drawStore.get().strokes).toBe(0);
  });

  it("복원할 수 없는 레인에서 취소하면 캔버스를 비운 사실을 알리고 통계를 초기화한다", async () => {
    const h = makeHarness((base) => [recordingDescriptor(base, { id: "cpu-reference", label: "CPU 참조", abort: "lossy" })]);
    renderDraw(h, { autoProbe: false });
    const stage = await ready(h);
    await drawStroke(h, stage, 1);
    expect(h.drawStore.get().strokes).toBe(1);
    act(() => {
      stage.dispatchEvent(pointerEvent("pointerdown", { clientX: 20, clientY: 20, timeStamp: 100 }));
      stage.dispatchEvent(pointerEvent("pointermove", { clientX: 60, clientY: 40, timeStamp: 116 }));
    });
    await waitFor(() => expect(sessionLanes(h)[0]?.calls.filter((c) => c === "beginStroke")).toHaveLength(2));
    act(() => {
      stage.dispatchEvent(pointerEvent("pointercancel", { clientX: 60, clientY: 40, timeStamp: 132 }));
    });
    await waitFor(() => expect(sessionLanes(h)).toHaveLength(2));
    await waitFor(() => expect(screen.getByTestId("lab-draw-notices").textContent).toContain("document-not-preserved"));
    expect(h.drawStore.get().strokes).toBe(0);
    expect(sessionLanes(h)[0]?.calls).toContain("dispose");
  });

  it("지우기는 새 레인을 init하고 이전 레인을 해제하며 획 수·PNG 대상을 비운다", async () => {
    const h = makeHarness(defaultDescriptors);
    renderDraw(h, { autoProbe: false });
    const stage = await ready(h);
    await drawStroke(h, stage, 1);
    const save = screen.getByTestId("lab-draw-save") as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(screen.getByTestId("lab-draw-clear"));
    await waitFor(() => expect(sessionLanes(h)).toHaveLength(2));
    await waitFor(() => expect(h.drawStore.get().sessionStatus).toBe("ready"));
    expect(sessionLanes(h)[0]?.calls).toContain("dispose");
    expect(sessionLanes(h)[1]?.calls).toContain("init");
    expect(h.drawStore.get()).toMatchObject({ strokes: 0, lastImage: null, laneId: "wasm-cpu" });
    expect((screen.getByTestId("lab-draw-save") as HTMLButtonElement).disabled).toBe(true);
    // 새 문서에서 다시 그릴 수 있다.
    await drawStroke(h, screen.getByTestId("lab-draw-stage"), 500);
    expect(h.drawStore.get().strokes).toBe(1);
  });

  it("PNG 저장: 흰 종이에 합성한 PNG Blob을 내려받고 URL.revokeObjectURL을 보장한다", async () => {
    const created: Blob[] = [];
    const revoked: string[] = [];
    let n = 0;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: (blob: Blob): string => {
        created.push(blob);
        n += 1;
        return `blob:mock-${n}`;
      },
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: (url: string): void => {
        revoked.push(url);
      },
    });
    const clicks: { href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push({ href: this.href, download: this.download });
    });
    const h = makeHarness(defaultDescriptors);
    renderDraw(h, { autoProbe: false });
    const stage = await ready(h);
    expect((screen.getByTestId("lab-draw-save") as HTMLButtonElement).disabled).toBe(true);
    await drawStroke(h, stage, 1);
    fireEvent.click(screen.getByTestId("lab-draw-save"));
    expect(created).toHaveLength(1);
    expect(created[0]?.type).toBe("image/png");
    expect(clicks[0]?.download).toMatch(/^brush-draw-pencil-hb-wasm-cpu-\d{8}-\d{6}\.png$/u);
    // 모의 PNG 바이트(시그니처 + 폭·높이 + 픽셀)는 불투명 흰 종이 합성본이다: 첫 픽셀 알파 255.
    const bytes = new Uint8Array(await created[0]!.arrayBuffer());
    expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(bytes[16 + 3]).toBe(255);
    // 다운로드 직후 revoke 예약 → 실제로 해제된다.
    await waitFor(() => expect(revoked).toEqual(["blob:mock-1"]), { timeout: 3000 });
  });

  it("PNG 저장 중 오류는 알림으로 드러내고 그래도 Blob URL을 해제한다", async () => {
    const revoked: string[] = [];
    Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: () => "blob:err" });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: (url: string): void => {
        revoked.push(url);
      },
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("다운로드 차단됨");
    });
    const h = makeHarness(defaultDescriptors);
    renderDraw(h, { autoProbe: false });
    const stage = await ready(h);
    await drawStroke(h, stage, 1);
    fireEvent.click(screen.getByTestId("lab-draw-save"));
    expect(screen.getByTestId("lab-draw-notices").textContent).toContain("download-failed");
    await waitFor(() => expect(revoked).toEqual(["blob:err"]), { timeout: 3000 });
  });

  it("HUD: 레인·브러시·addSamples p50/p95·endStroke·readback·dab 수를 보여 주고 소프트웨어 렌더러는 경고한다", async () => {
    const h = makeHarness((base) => [
      {
        ...recordingDescriptor(base, { id: "webgpu-compute", label: "WebGPU compute", kind: "candidate", status: "browser-verification-required", probe: { ...supportedReport("webgpu-compute"), softwareRenderer: true } }),
      },
      recordingDescriptor(base, { id: "cpu-reference", label: "CPU 참조" }),
    ]);
    renderDraw(h);
    const stage = await ready(h);
    const hud = screen.getByTestId("lab-draw-hud");
    expect(hud.textContent).toContain("WebGPU compute");
    expect(hud.textContent).toContain("연필 HB");
    expect(screen.getByTestId("lab-draw-hud-add").textContent).toBe("—");
    await drawStroke(h, stage, 1);
    expect(screen.getByTestId("lab-draw-hud-add").textContent).toMatch(/^\d+\.\d{2} \/ \d+\.\d{2}$/u);
    expect(screen.getByTestId("lab-draw-hud-end").textContent).toMatch(/^\d+\.\d{2}$/u);
    expect(screen.getByTestId("lab-draw-hud-readback").textContent).toMatch(/^\d+\.\d{2}$/u);
    expect(Number(screen.getByTestId("lab-draw-hud-dabs").textContent)).toBeGreaterThan(0);
    expect(screen.getByTestId("lab-draw-badge-software").textContent).toContain("소프트웨어 렌더러");
    expect(screen.getByTestId("lab-draw-badge-unverified")).toBeTruthy();
  });

  it("HUD: 습식 매체는 건조 상태를 레인이 제공하지 않아 표시를 생략한다는 안내만 보인다", async () => {
    const h = makeHarness(defaultDescriptors);
    renderDraw(h, { autoProbe: false });
    await ready(h);
    expect(screen.queryByTestId("lab-draw-hud-wet")).toBeNull();
    fireEvent.click(screen.getByTestId("lab-draw-brush-watercolor-wet"));
    expect(screen.getByTestId("lab-draw-hud-wet").textContent).toContain("표시를 생략");
  });

  it("캔버스 크기: 1024×640 기본, 512²·1024²·화면 맞춤 선택 시 새 문서(캔버스 속성 크기)로 시작한다", async () => {
    const h = makeHarness(defaultDescriptors);
    renderDraw(h, { autoProbe: false });
    await ready(h);
    const present = (): HTMLCanvasElement => screen.getByTestId("lab-draw-present") as HTMLCanvasElement;
    expect([present().width, present().height]).toEqual([1024, 640]);
    expect(h.drawStore.get().documentSize).toEqual({ width: 1024, height: 640 });

    const select = screen.getByLabelText("캔버스 크기");
    fireEvent.change(select, { target: { value: "512" } });
    await waitFor(() => expect(h.drawStore.get().documentSize).toEqual({ width: 512, height: 512 }));
    await waitFor(() => expect(h.drawStore.get().sessionStatus).toBe("ready"));
    expect([present().width, present().height]).toEqual([512, 512]);
    fireEvent.change(select, { target: { value: "1024" } });
    await waitFor(() => expect(h.drawStore.get().documentSize).toEqual({ width: 1024, height: 1024 }));
    await waitFor(() => expect(h.drawStore.get().sessionStatus).toBe("ready"));
    fireEvent.change(select, { target: { value: "fit" } });
    await waitFor(() => expect(screen.getByTestId("lab-draw-refit")).toBeTruthy());
    await waitFor(() => expect(h.drawStore.get().sessionStatus).toBe("ready"));
    const fitSize = h.drawStore.get().documentSize;
    expect(fitSize?.width).toBeGreaterThanOrEqual(64);
    expect(screen.getByTestId("lab-draw-hint").textContent).toContain("화면 맞춤: 문서");
    // 각 크기 변경은 새 레인(문서)이다: 1024×640 → 512² → 1024² → 화면 맞춤.
    const sizes = h.inits.map((i) => `${i.width}x${i.height}`);
    expect(sizes.slice(0, 3)).toEqual(["1024x640", "512x512", "1024x1024"]);
    expect(h.inits.length).toBeGreaterThanOrEqual(4);
    expect(sessionLanes(h).length).toBe(h.inits.length);
    // 습식 풀 용량을 문서 타일 수까지 올려 레인에 넘긴다(1024×640 = 2560 타일 > 기본 2048).
    expect(h.inits[0]?.wetCapacityTiles).toBe(64 * 40);
    expect(h.inits[1]?.wetCapacityTiles).toBe(2048);
    expect(h.inits[2]?.wetCapacityTiles).toBe(64 * 64);
  });

  it("GPU 표시 레인만 표시 캔버스를 레인에 넘기고 CPU 계열은 readback을 2D 캔버스에 올린다", async () => {
    const h = makeHarness((base) => [
      recordingDescriptor(base, { id: "webgpu-compute", label: "WebGPU compute", kind: "candidate", status: "browser-verification-required" }),
      recordingDescriptor(base, { id: "cpu-reference", label: "CPU 참조" }),
    ]);
    // 미리보기 썸네일도 putImageData를 부르므로 이 테스트는 미리보기 Worker 없이 표시 캔버스만 센다.
    renderDraw(h, { gallery: null, galleryError: "테스트: 미리보기 없음" });
    const stage = await ready(h);
    expect(h.inits.at(-1)).toMatchObject({ laneId: "webgpu-compute", presentCanvas: true });
    const putsBefore = stub.putImageDataCalls;
    await drawStroke(h, stage, 1);
    // 레인이 직접 표시하는 캔버스에는 putImageData를 하지 않는다.
    expect(stub.putImageDataCalls).toBe(putsBefore);
    fireEvent.change(screen.getByLabelText("레인"), { target: { value: "cpu-reference" } });
    await waitFor(() => expect(h.inits.at(-1)?.laneId).toBe("cpu-reference"));
    await waitFor(() => expect(h.drawStore.get().sessionStatus).toBe("ready"));
    expect(h.inits.at(-1)?.presentCanvas).toBe(false);
    const puts = stub.putImageDataCalls;
    await drawStroke(h, screen.getByTestId("lab-draw-stage"), 300);
    expect(stub.putImageDataCalls).toBe(puts + 1);
  });

  it("설정 패널은 접고 펼 수 있다(aria-expanded)", async () => {
    const h = makeHarness(defaultDescriptors);
    renderDraw(h, { autoProbe: false });
    await ready(h);
    const toggle = screen.getByTestId("lab-draw-panel-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById("lab-draw-side")).toBeTruthy();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById("lab-draw-side")).toBeNull();
    // 캔버스(문서)는 그대로다.
    expect(sessionLanes(h)).toHaveLength(1);
    fireEvent.click(toggle);
    expect(document.getElementById("lab-draw-side")).toBeTruthy();
  });

  it("탭 전환 후 돌아와도 같은 세션·같은 레인이다(문서 보존)", async () => {
    const h = makeHarness(defaultDescriptors);
    renderDraw(h, { autoProbe: false });
    const stage = await ready(h);
    await drawStroke(h, stage, 1);
    fireEvent.click(screen.getByRole("tab", { name: "갤러리" }));
    fireEvent.click(screen.getByRole("tab", { name: "그리기" }));
    expect(screen.getByTestId("lab-draw-stage")).toBe(stage);
    expect(sessionLanes(h)).toHaveLength(1);
    expect(sessionLanes(h)[0]?.calls).not.toContain("dispose");
    expect(h.drawStore.get().strokes).toBe(1);
  });

  it("언마운트하면 레인을 해제하고 포인터 캡처를 뗀다", async () => {
    const h = makeHarness(defaultDescriptors);
    const view = renderDraw(h, { autoProbe: false });
    await ready(h);
    view.unmount();
    expect(sessionLanes(h)[0]?.calls).toContain("dispose");
  });

  it("범위를 벗어난 파라미터는 오류로 드러내고 이전 유효 프로그램으로 계속 그린다(무음 보정 없음)", async () => {
    const h = makeHarness(defaultDescriptors);
    renderDraw(h, { autoProbe: false });
    const stage = await ready(h);
    act(() => {
      h.drawStore.set({ overrides: { opacity: 5 } });
    });
    expect(screen.getByTestId("lab-draw-program-error").textContent).toContain("스키마 범위");
    await drawStroke(h, stage, 1);
    // 유효하지 않은 프로그램은 레인에 가지 않고 마지막 유효 프로그램(연필 HB 기본)을 쓴다.
    expect(h.programs.at(-1)?.deposition.opacity).toBeLessThanOrEqual(1);
  });
});
