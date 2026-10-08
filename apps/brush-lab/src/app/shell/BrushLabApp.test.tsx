// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDrawStore } from "../state/draw-store";
import { createLabStore } from "../state/lab-store";
import { installCanvasStub } from "../testing/canvas-stub";
import { mockDescriptor, mockEnvironment, unavailableDescriptor } from "../testing/mock-lane";
import { createMockRunner } from "../testing/mock-runner";

import { BrushLabApp } from "./BrushLabApp";

import type { LabStore } from "../state/lab-store";
import type { CanvasStubRecorder } from "../testing/canvas-stub";

let stub: CanvasStubRecorder;
beforeEach(() => {
  stub = installCanvasStub();
});
afterEach(() => {
  cleanup();
  stub.restore();
});

const registry = [
  mockDescriptor({ id: "cpu-reference", label: "CPU 참조" }),
  unavailableDescriptor("webgpu-compute", ["webgpu-api-unavailable"], "WebGPU compute"),
  mockDescriptor({ id: "wasm-cpu", label: "wasm CPU", status: "reserved", kind: "candidate" }),
];

function renderApp(store: LabStore, extra: Partial<Parameters<typeof BrushLabApp>[0]> = {}) {
  return render(
    <BrushLabApp
      registry={registry}
      env={mockEnvironment()}
      runner={createMockRunner()}
      store={store}
      drawStore={createDrawStore()}
      gallery={null}
      galleryError="테스트 환경에는 Worker가 없다"
      {...extra}
    />,
  );
}

// jsdom 전체 앱 렌더는 CPU를 공유하는 환경(동시 vitest 다수)에서 수 초가 걸릴 수 있어 타임아웃을 넉넉히 둔다.
describe("BrushLabApp", { timeout: 30_000 }, () => {
  it("실험 앱 셸과 탭 4개를 렌더하고 클릭·키보드로 전환한다", () => {
    const store = createLabStore({ tab: "gallery" });
    renderApp(store, { autoProbe: false });
    expect(screen.getByRole("heading", { level: 1, name: "ToonStudio Brush Lab" })).toBeTruthy();
    expect(screen.getByText("실험 앱 · 배포 대상 아님")).toBeTruthy();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["그리기", "갤러리", "A/B 비교", "리포트"]);
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe("lab-tab-gallery");

    fireEvent.click(screen.getByRole("tab", { name: "리포트" }));
    expect(store.get().tab).toBe("report");
    expect(screen.getByRole("tab", { name: "리포트" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText(/세션 리포트 \(0\)/u)).toBeTruthy();

    const tablist = screen.getByRole("tablist", { name: "브러시 랩 화면" });
    // 리포트(끝) → 오른쪽: 맨 앞 탭(그리기)으로 순환
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(store.get().tab).toBe("draw");
    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(store.get().tab).toBe("report");
    fireEvent.keyDown(tablist, { key: "Home" });
    expect(store.get().tab).toBe("draw");
    expect(document.activeElement?.id).toBe("lab-tab-draw");
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(store.get().tab).toBe("gallery");
    fireEvent.keyDown(tablist, { key: "End" });
    expect(store.get().tab).toBe("report");
    expect(document.activeElement?.id).toBe("lab-tab-report");
    // 비활성 탭은 tabIndex -1(roving tabindex)
    expect(screen.getByRole("tab", { name: "갤러리" }).getAttribute("tabindex")).toBe("-1");
    expect(screen.getByRole("tab", { name: "그리기" }).getAttribute("tabindex")).toBe("-1");
    expect(screen.getByRole("tab", { name: "리포트" }).getAttribute("tabindex")).toBe("0");
  });

  it("그리기가 첫 번째 탭이며 기본 선택이다(저장소 기본 상태)", () => {
    const store = createLabStore();
    renderApp(store, { autoProbe: false });
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]?.textContent).toBe("그리기");
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[0]?.getAttribute("tabindex")).toBe("0");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe("lab-tab-draw");
    expect(screen.getByTestId("lab-draw-view")).toBeTruthy();
  });

  it("다른 탭으로 갔다 와도 그리기 화면은 마운트된 채 숨겨질 뿐이다(문서 보존)", () => {
    const store = createLabStore();
    renderApp(store, { autoProbe: false });
    const draw = screen.getByTestId("lab-draw-view");
    fireEvent.click(screen.getByRole("tab", { name: "갤러리" }));
    expect(screen.getByTestId("lab-draw-view")).toBe(draw);
    expect(draw.closest("[role='tabpanel']")?.hasAttribute("hidden")).toBe(true);
    fireEvent.click(screen.getByRole("tab", { name: "그리기" }));
    expect(draw.closest("[role='tabpanel']")?.hasAttribute("hidden")).toBe(false);
  });

  it("배너는 레인별 probe 결과와 unavailable 사유 코드를 보여주고 자동 전환하지 않는다", async () => {
    const store = createLabStore({ tab: "compare", laneA: "cpu-reference", laneB: "webgpu-compute" });
    renderApp(store);
    const banner = screen.getByRole("status", { name: "레인 능력 보고" });
    expect(banner.textContent).toContain("probe 0/3");
    await screen.findByText(/probe 3\/3/u);
    expect(banner.textContent).toContain("무음 대체 없음");
    expect(banner.textContent).toContain("supported · adapter 없음(CPU)");
    expect(banner.textContent).toContain("unavailable (webgpu-api-unavailable)");
    expect(banner.textContent).toContain("이 브라우저에 navigator.gpu(WebGPU API)가 없음");
    expect(banner.textContent).toContain("예약(미구현)");
    expect(store.get().capability["webgpu-compute"]?.reasons).toEqual(["webgpu-api-unavailable"]);
    expect(store.get().capability["wasm-cpu"]?.reasons).toEqual(["not-implemented"]);
    // 레인 B 선택은 그대로다(다른 레인으로 자동 전환하지 않는다)
    expect(store.get().laneB).toBe("webgpu-compute");
    const selectB = screen.getByLabelText("레인 B") as HTMLSelectElement;
    expect(selectB.value).toBe("webgpu-compute");
    const options = Array.from(selectB.options).map((o) => [o.value, o.disabled]);
    expect(options).toEqual([
      ["cpu-reference", false],
      ["webgpu-compute", true],
      ["wasm-cpu", true],
    ]);
    expect(screen.getByTestId("lab-lane-badge-b").textContent).toContain("unavailable (webgpu-api-unavailable)");
  });

  it("갤러리 Worker를 만들 수 없으면 갤러리 탭에 사유를 드러낸다", () => {
    const store = createLabStore({ tab: "gallery" });
    renderApp(store, { autoProbe: false });
    expect(screen.getByRole("alert").textContent).toContain("테스트 환경에는 Worker가 없다");
    expect(screen.getByText("갤러리 Worker를 만들 수 없다.")).toBeTruthy();
  });

  it("오류 목록은 배너에 쌓이고 '오류 지우기'로 비운다", () => {
    const store = createLabStore({ tab: "report" });
    renderApp(store, { autoProbe: false });
    act(() => {
      store.set({ errors: [{ laneId: "webgpu-compute", code: "device-lost", message: "장치 유실", seq: 1 }] });
    });
    const list = screen.getByRole("list", { name: "오류 목록" });
    expect(list.textContent).toContain("device-lost");
    expect(list.textContent).toContain("장치 유실");
    fireEvent.click(screen.getByRole("button", { name: "오류 지우기" }));
    expect(store.get().errors).toEqual([]);
    expect(screen.queryByRole("list", { name: "오류 목록" })).toBeNull();
  });
});
