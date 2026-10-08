// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BRISTLE_RAPIER_LANE, createRapierBristleLane } from "../../lanes/physics/rapier-bristle-lane";
import { BrushLabApp } from "../shell/BrushLabApp";
import { createDrawStore } from "../state/draw-store";
import { createLabStore } from "../state/lab-store";
import { installCanvasStub } from "../testing/canvas-stub";
import { mockDescriptor, mockEnvironment } from "../testing/mock-lane";
import { createMockRunner } from "../testing/mock-runner";

import type { LaneDescriptor } from "../../lanes/lane";
import type { DrawStore } from "../state/draw-store";
import type { LabStore } from "../state/lab-store";
import type { CanvasStubRecorder } from "../testing/canvas-stub";

/**
 * 실험 레인 UI: 배지·검증 범위 설명·인증 제외 표시·Rapier 초기화 중/실패 표시.
 * 실제 Worker·GPU·Rapier wasm에 의존하지 않는다(Rapier 실패 경로는 실제 레인 코드에 거부하는 임포터를 주입한다).
 * 브라우저에서 실제로 보이는 모습은 `scripts/browser-draw-probe.mjs`로 확인한다.
 */

function experimental(base: LaneDescriptor): LaneDescriptor {
  return { ...base, maturity: "experimental" };
}

/** init이 `gate`가 열릴 때까지 끝나지 않는 실험 레인(Rapier wasm 불러오는 중을 흉내). */
function slowInitDescriptor(gate: Promise<void>): LaneDescriptor {
  const base = mockDescriptor({ id: "bristle-rapier", label: "물리 붓털(Rapier 2D, 실험)", kind: "candidate" });
  return experimental({
    ...base,
    create: () => {
      const lane = base.create();
      const init = lane.init.bind(lane);
      lane.init = async (env, config) => {
        await gate;
        return init(env, config);
      };
      return lane;
    },
  });
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

function renderDraw(registry: readonly LaneDescriptor[], drawStore: DrawStore) {
  return render(
    <BrushLabApp
      registry={registry}
      env={mockEnvironment()}
      runner={createMockRunner()}
      store={createLabStore({ tab: "draw" })}
      drawStore={drawStore}
      gallery={null}
      galleryError="없음"
    />,
  );
}

function renderCompare(registry: readonly LaneDescriptor[], store: LabStore) {
  return render(<BrushLabApp registry={registry} env={mockEnvironment()} runner={createMockRunner()} store={store} gallery={null} galleryError="없음" />);
}

describe("실험 레인 UI", { timeout: 30_000 }, () => {
  it("그리기 화면: 실험 레인을 고르면 배지·한글 검증 범위가 보이고 안정 레인에는 없다", async () => {
    const drawStore = createDrawStore();
    const registry = [
      mockDescriptor({ id: "cpu-reference", label: "CPU 참조" }),
      experimental(mockDescriptor({ id: "mpm-paint", label: "MLS-MPM 점탄성 물감(실험)", kind: "candidate" })),
    ];
    renderDraw(registry, drawStore);
    await waitFor(() => expect(drawStore.get().sessionStatus).toBe("ready"));
    // 안정 레인(cpu-reference가 시작 레인): 배지·설명 없음.
    expect(drawStore.get().laneId).toBe("cpu-reference");
    // 능력 배너(항상 보임)에도 배지가 있으므로 엔진 선택 영역 안에서만 본다.
    const lanePanel = within(screen.getByTestId("lab-draw-lane"));
    expect(lanePanel.queryByTestId("lab-experimental-badge")).toBeNull();
    expect(lanePanel.queryByTestId("lab-experimental-note")).toBeNull();

    const select = screen.getByLabelText("레인") as HTMLSelectElement;
    // 옵션 문구에도 실험 표시(레이블에 이미 '실험'이 있으면 중복 없음)가 있다.
    const option = Array.from(select.options).find((o) => o.value === "mpm-paint");
    expect(option?.textContent).toBe("MLS-MPM 점탄성 물감(실험) (mpm-paint)");

    fireEvent.change(select, { target: { value: "mpm-paint" } });
    await waitFor(() => expect(drawStore.get()).toMatchObject({ laneId: "mpm-paint", sessionStatus: "ready" }));
    expect(lanePanel.getByTestId("lab-experimental-badge").textContent).toBe("실험");
    const note = lanePanel.getByTestId("lab-experimental-note").textContent ?? "";
    expect(note).toContain("Node 22 단일 스레드");
    expect(note).toContain("브라우저");
    expect(note).toContain("인증 판정(PASS/FAIL) 집계에서 제외");
    expect(note).toContain("입자 한도");
  });

  it("Rapier 레인: 선택하면 초기화 중 문구가 보이고 끝나면 사라진다(자동 전환 없음)", async () => {
    const drawStore = createDrawStore();
    let open: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const registry = [mockDescriptor({ id: "cpu-reference", label: "CPU 참조" }), slowInitDescriptor(gate)];
    renderDraw(registry, drawStore);
    await waitFor(() => expect(drawStore.get().sessionStatus).toBe("ready"));

    fireEvent.change(screen.getByLabelText("레인"), { target: { value: "bristle-rapier" } });
    const starting = await screen.findByTestId("lab-draw-lane-starting");
    expect(starting.textContent).toContain("Rapier 물리 엔진(wasm)을 불러와 초기화하는 중");
    expect(starting.textContent).toContain("끝나기 전에는 그려지지 않는다");
    expect(drawStore.get()).toMatchObject({ laneId: "bristle-rapier", sessionStatus: "starting" });

    await act(async () => {
      open();
      await gate;
    });
    await waitFor(() => expect(drawStore.get().sessionStatus).toBe("ready"));
    expect(screen.queryByTestId("lab-draw-lane-starting")).toBeNull();
    expect(screen.queryByTestId("lab-draw-lane-error")).toBeNull();
  });

  it("Rapier 레인: 모듈을 불러오지 못하면 사유 코드와 한글 사유를 보이고 다른 레인으로 바꾸지 않는다(ADR-0018)", async () => {
    const drawStore = createDrawStore();
    const failing: LaneDescriptor = {
      ...BRISTLE_RAPIER_LANE,
      create: () => createRapierBristleLane({ importer: () => Promise.reject(new Error("net::ERR_CONNECTION_REFUSED")) }),
    };
    const cpu = mockDescriptor({ id: "cpu-reference", label: "CPU 참조" });
    renderDraw([cpu, failing], drawStore);
    await waitFor(() => expect(drawStore.get().sessionStatus).toBe("ready"));
    expect(drawStore.get().laneId).toBe("cpu-reference");

    fireEvent.change(screen.getByLabelText("레인"), { target: { value: "bristle-rapier" } });
    const alert = await screen.findByTestId("lab-draw-lane-error");
    const text = alert.textContent ?? "";
    expect(text).toContain("물리 붓털(Rapier 2D, 실험)");
    expect(text).toContain("wasm-artifact-missing");
    expect(text).toContain("Rapier 물리 모듈(@dimforge/rapier2d-compat)을 불러오지 못했다");
    expect(text).toContain("net::ERR_CONNECTION_REFUSED");
    expect(text).toContain("다른 레인으로 자동 전환하지 않는다");
    expect(drawStore.get()).toMatchObject({ laneId: "bristle-rapier", sessionStatus: "error", laneChosenByUser: true });
    // 실패한 레인이 그대로 선택돼 있고 cpu-reference 세션이 대신 열리지 않았다.
    expect((screen.getByLabelText("레인") as HTMLSelectElement).value).toBe("bristle-rapier");
    // 다시 시작 중이면 이전 실패 문구는 지워진다(상태가 starting 으로 바뀔 때).
    fireEvent.change(screen.getByLabelText("레인"), { target: { value: "cpu-reference" } });
    await waitFor(() => expect(drawStore.get().sessionStatus).toBe("ready"));
    expect(drawStore.get().sessionError).toBeNull();
    expect(screen.queryByTestId("lab-draw-lane-error")).toBeNull();
  });

  it("A/B 비교: 레인 선택기에 배지·설명이 붙고 능력 배너에도 배지가 보인다", async () => {
    const registry = [
      mockDescriptor({ id: "cpu-reference", label: "CPU 참조" }),
      experimental(mockDescriptor({ id: "bristle-pbd", label: "물리 붓털(자체 PBD, 실험)", kind: "candidate" })),
    ];
    const store = createLabStore({ tab: "compare", laneA: "cpu-reference", laneB: "bristle-pbd", canvasSize: 256 });
    renderCompare(registry, store);
    await screen.findByText(/probe 2\/2/u);
    const badgeB = screen.getByTestId("lab-lane-badge-b");
    expect(badgeB.textContent).toContain("실험");
    expect(screen.getByTestId("lab-lane-badge-a").textContent).not.toContain("실험");
    const notes = screen.getAllByTestId("lab-experimental-note");
    expect(notes).toHaveLength(1);
    expect(notes[0]?.textContent).toContain("압력에 따른 폭 변화");
    // 능력 배너: 실험 레인 줄에만 배지.
    const bannerBadges = screen.getByRole("status", { name: "레인 능력 보고" }).querySelectorAll("[data-testid='lab-experimental-badge']");
    expect(bannerBadges).toHaveLength(1);
  });

  it("A/B 실행: 실험 레인 종합 판정은 '인증 제외(실험)'이고 세션 리포트 집계에서도 빠진다", async () => {
    const registry = [
      mockDescriptor({ id: "cpu-reference", label: "CPU 참조" }),
      experimental(mockDescriptor({ id: "mpm-paint", label: "MLS-MPM 점탄성 물감(실험)", kind: "candidate", color: [200, 0, 0] })),
    ];
    const store = createLabStore({ tab: "compare", laneA: "cpu-reference", laneB: "mpm-paint", canvasSize: 256 });
    renderCompare(registry, store);
    await screen.findByText(/probe 2\/2/u);
    fireEvent.click(screen.getByRole("button", { name: "A/B 실행" }));
    await waitFor(() => expect(store.get().running).toBe(false), { timeout: 10_000 });
    expect(store.get().errors).toEqual([]);
    const reportB = store.get().results.reportB;
    const reportA = store.get().results.reportA;
    expect(reportA).not.toBeNull();
    expect(reportB).not.toBeNull();

    // 안정 레인 A는 판정 그대로, 실험 레인 B는 인증 제외.
    expect((await screen.findByTestId("lab-verdict-a")).textContent).toBe(reportA?.verdict);
    expect(screen.getByTestId("lab-verdict-b").textContent).toBe("인증 제외(실험)");
    const note = screen.getByTestId("lab-verdict-excluded-note").textContent ?? "";
    expect(note).toContain("실험 레인(B)");
    expect(note).toContain(`B ${reportB?.verdict}`);

    // 세션 리포트 탭: 집계에 실험 레인 1건이 제외로 표시되고 판정 열도 인증 제외다.
    act(() => {
      store.set({ tab: "report" });
    });
    const summary = (await screen.findByTestId("lab-report-summary")).textContent ?? "";
    expect(summary).toContain("실험 레인 1건은 인증 판정 집계에서 제외");
    const counted = [reportA?.verdict].filter((v) => v !== undefined);
    expect(counted).toHaveLength(1);
    const pass = reportA?.verdict === "PASS" ? 1 : 0;
    const fail = reportA?.verdict === "FAIL" ? 1 : 0;
    const unavailable = reportA?.verdict === "UNAVAILABLE" ? 1 : 0;
    expect(summary).toContain(`PASS ${pass} · FAIL ${fail} · UNAVAILABLE ${unavailable}`);
    const table = screen.getByRole("table", { name: "세션 리포트 목록" });
    expect(table.textContent).toContain("인증 제외(실험)");
  });

  it("R-C-5 A/B 실행: 실험 레인의 지표별 판정 셀은 '(참고)' 스타일이고 안정 레인 셀은 합격/불합격 색 그대로이며, 리포트 원문 옆에 원시 판정 안내가 붙는다", async () => {
    const registry = [
      mockDescriptor({ id: "cpu-reference", label: "CPU 참조" }),
      experimental(mockDescriptor({ id: "mpm-paint", label: "MLS-MPM 점탄성 물감(실험)", kind: "candidate", color: [200, 0, 0] })),
    ];
    const store = createLabStore({ tab: "compare", laneA: "cpu-reference", laneB: "mpm-paint", canvasSize: 256 });
    renderCompare(registry, store);
    await screen.findByText(/probe 2\/2/u);
    fireEvent.click(screen.getByRole("button", { name: "A/B 실행" }));
    await waitFor(() => expect(store.get().running).toBe(false), { timeout: 10_000 });
    const table = await screen.findByRole("table", { name: "지표·임계값·판정" });
    const rows = Array.from(table.querySelectorAll("tbody tr"));
    expect(rows.length).toBeGreaterThan(0);
    let judged = 0;
    for (const row of rows) {
      const cells = row.querySelectorAll("td");
      const verdictA = cells[cells.length - 2];
      const verdictB = cells[cells.length - 1];
      // A(안정): 판정 그대로 합격/불합격 클래스. B(실험): 항상 참고용 클래스이고 판정이 있으면 "(참고)"가 붙는다.
      expect(verdictA?.className ?? "").not.toContain("lab-verdict-REFERENCE");
      if (verdictB?.textContent !== "—") {
        judged += 1;
        expect(verdictB?.className, row.textContent ?? "").toBe("lab-verdict-REFERENCE");
        expect(verdictB?.textContent ?? "").toMatch(/\(참고\)$/u);
        expect(verdictB?.className ?? "").not.toMatch(/lab-verdict-(PASS|FAIL)/u);
      }
    }
    expect(judged).toBeGreaterThan(0);

    // 리포트 탭: 실험 레인 리포트의 원문 위에 "성숙도를 담지 않는 원시 판정" 안내가 붙는다.
    const reports = store.get().reports;
    const indexB = reports.findIndex((r) => r.laneId === "mpm-paint");
    expect(indexB).toBeGreaterThanOrEqual(0);
    act(() => {
      store.set({ tab: "report" });
    });
    const buttons = await screen.findAllByRole("button", { name: "보기" });
    fireEvent.click(buttons[indexB] as HTMLElement);
    expect(screen.getByTestId("lab-report-raw-note").textContent).toContain("인증이 아니다");
  });

  it("R-C-6 레지스트리에 없는 레인의 리포트는 PASS/FAIL로 세지 않고 '레인 미등록'으로 표시한다(안전한 기본값)", async () => {
    const registry = [mockDescriptor({ id: "cpu-reference", label: "CPU 참조" }), mockDescriptor({ id: "wasm-cpu", label: "wasm" })];
    const store = createLabStore({ tab: "compare", laneA: "cpu-reference", laneB: "wasm-cpu", canvasSize: 256 });
    renderCompare(registry, store);
    await screen.findByText(/probe 2\/2/u);
    fireEvent.click(screen.getByRole("button", { name: "A/B 실행" }));
    await waitFor(() => expect(store.get().running).toBe(false), { timeout: 10_000 });
    const base = store.get().results.reportA;
    expect(base).not.toBeNull();
    if (!base) return;
    // 구버전 세션처럼 현재 레지스트리에 없는 레인 ID의 FAIL 리포트가 남아 있는 상황.
    act(() => {
      store.set({ reports: [{ ...base, laneId: "hokusai", verdict: "FAIL" }], tab: "report" });
    });
    const summary = (await screen.findByTestId("lab-report-summary")).textContent ?? "";
    expect(summary).toContain("PASS 0 · FAIL 0 · UNAVAILABLE 0");
    expect(screen.getByTestId("lab-report-unregistered").textContent).toContain("레인 미등록 1건");
    expect(screen.getByRole("table", { name: "세션 리포트 목록" }).textContent).toContain("레인 미등록");
    expect(screen.getByTestId("lab-report-raw-note").textContent).toContain("레지스트리에 없는 레인");
  });
});
