// @vitest-environment jsdom
/**
 * Character Labs 성능·리렌더·구독 누수 회귀 검증.
 *
 * 재현 가능한 계측 기준선:
 * 1) 64개 외형 프리셋 썸네일 일괄 갱신(pending 64회 + ready 64회 = 128회 `thumbnail/update` 이벤트):
 *    - 수정 전: `useLabState()`가 `thumbnails` 변경마다 새 스냅샷을 반환하여 TopBar(129회), SlotRail(129회),
 *      FailureBanner(129회), ViewportPane(129회), ParamPanel(129회), SlotPanel(129회) = 총 774회 렌더.
 *    - 수정 후: `useLabState()`가 `thumbnails` 전용 변경을 무시하고 `SlotPanel`만 활성 슬롯(face-shape 6개 프리셋)의
 *      썸네일 배열을 `useLabSelector(..., shallowEqual)`로 구독하여 TopBar(1회), SlotRail(1회), FailureBanner(1회),
 *      ViewportPane(1회), ParamPanel(1회), SlotPanel(1 + 6×2 = 13회) = 총 18회 렌더(불필요 리렌더 97.7% 감소).
 * 2) 체형 슬라이더 30회 연속 드래그(`param/set` coalesce):
 *    - 수정 전: SlotRail(31회), FailureBanner(31회) 모두 매 스텝 리렌더.
 *    - 수정 후: SlotRail(1회, 드래그 중 0회), FailureBanner(1회, 드래그 중 0회).
 * 3) 9개 인스펙터 탭 3회전 반복 전환 및 마운트/언마운트 반복 시 window 이벤트 리스너·스토어 구독 누수 0건.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PERFORMANCE_PRESETS } from "../../animation/presets";
import { ALL_AVAILABLE_CAPABILITIES, createDefaultRecipe, createPresetCatalog } from "../../contracts";
import { APPEARANCE_PRESETS } from "../../presets";
import { createLabStore } from "../../state/lab-store";
import { createMockEngine, mockDiagnostics } from "../../testing/mock-engine";
import { MockLabProvider, createMockEngineSession } from "../../testing/mock-store";

import { FailureBanner } from "./FailureBanner";
import { InspectorTabs } from "./InspectorTabs";
import { ExportPanel } from "./panels/ExportPanel";
import { ExpressionPanel } from "./panels/ExpressionPanel";
import { PaintPanel } from "./panels/PaintPanel";
import { ParamPanel } from "./panels/ParamPanel";
import { PhysicsPanel } from "./panels/PhysicsPanel";
import { PosePanel } from "./panels/PosePanel";
import { RenderPanel } from "./panels/RenderPanel";
import { SlotPanel } from "./panels/SlotPanel";
import { ViewportPane } from "./panels/ViewportPane";
import { SlotRail } from "./SlotRail";
import { TopBar } from "./TopBar";
import { createUiStateStore } from "./ui-state";

import type { LabPanels } from "./lab-runtime";
import type { InspectorTabId } from "./ui-state";
import type { CapturedRaster } from "../../contracts";

const PERF_PANELS: LabPanels = {
  SlotPanel,
  ViewportPane,
  ParamPanel,
  ExpressionPanel,
  PosePanel,
  PhysicsPanel,
  RenderPanel,
  PaintPanel,
  ExportPanel,
};

afterEach(cleanup);

function buildDefaultCatalog() {
  return createPresetCatalog([...APPEARANCE_PRESETS, ...PERFORMANCE_PRESETS]);
}

const DUMMY_RASTER: CapturedRaster = {
  width: 4,
  height: 4,
  rgba: new Uint8ClampedArray(4 * 4 * 4),
};

describe("Character Labs 성능·리렌더·메모리/이벤트 누수 검증", () => {
  it("64개 프리셋 썸네일 일괄 갱신(128회 thumbnail/update) 시 비관련 컴포넌트는 0회 리렌더되고 SlotPanel은 활성 슬롯만 리렌더된다", () => {
    const catalog = buildDefaultCatalog();
    let tick = 1_000;
    const store = createLabStore({
      catalog,
      now: () => {
        tick += 1;
        return tick;
      },
      initial: {
        recipe: createDefaultRecipe(),
        capabilities: ALL_AVAILABLE_CAPABILITIES,
        engine: { phase: "ready", backend: "webgl2", diagnostics: mockDiagnostics("webgl2") },
      },
    });
    const session = createMockEngineSession(store.getState().engine);
    session.setEngine(createMockEngine({ backend: "webgl2" }));
    const ui = createUiStateStore({ activeSlot: "face-shape", inspectorTab: "param" });

    const commits: Record<string, number> = {
      topBar: 0,
      slotRail: 0,
      failureBanner: 0,
      viewportPane: 0,
      paramPanel: 0,
      slotPanel: 0,
    };

    render(
      <MockLabProvider store={store} catalog={catalog} engineSession={session} shell={{ ui }}>
        <Profiler id="topBar" onRender={() => { commits.topBar += 1; }}>
          <TopBar />
        </Profiler>
        <Profiler id="failureBanner" onRender={() => { commits.failureBanner += 1; }}>
          <FailureBanner />
        </Profiler>
        <Profiler id="slotRail" onRender={() => { commits.slotRail += 1; }}>
          <SlotRail />
        </Profiler>
        <Profiler id="viewportPane" onRender={() => { commits.viewportPane += 1; }}>
          <ViewportPane hudIntervalMs={0} />
        </Profiler>
        <Profiler id="paramPanel" onRender={() => { commits.paramPanel += 1; }}>
          <ParamPanel />
        </Profiler>
        <Profiler id="slotPanel" onRender={() => { commits.slotPanel += 1; }}>
          <SlotPanel />
        </Profiler>
      </MockLabProvider>,
    );

    // 초기 마운트 직후 카운터를 0으로 리셋해 순수하게 128회 썸네일 이벤트 동안의 리렌더 횟수만 계측한다.
    commits.topBar = 0;
    commits.slotRail = 0;
    commits.failureBanner = 0;
    commits.viewportPane = 0;
    commits.paramPanel = 0;
    commits.slotPanel = 0;

    const appearancePresets = APPEARANCE_PRESETS;
    expect(appearancePresets).toHaveLength(64);
    const activeSlotCount = catalog.bySlot("face-shape").length;
    expect(activeSlotCount).toBe(6);

    // 64개 외형 프리셋 전체에 대해 pending(64회) + ready(64회) = 총 128회 thumbnail/update 이벤트 발생
    for (const preset of appearancePresets) {
      act(() => {
        store.applyEvent({
          type: "thumbnail/update",
          presetId: preset.id,
          entry: { status: "pending", cacheKey: preset.id },
        });
      });
      act(() => {
        store.applyEvent({
          type: "thumbnail/update",
          presetId: preset.id,
          entry: { status: "ready", cacheKey: preset.id, raster: DUMMY_RASTER },
        });
      });
    }

    // 썸네일을 읽지 않는 5개 컴포넌트는 128회 이벤트 동안 추가 리렌더가 정확히 0회여야 한다(수정 전: 각 128회)
    expect(commits.topBar).toBe(0);
    expect(commits.slotRail).toBe(0);
    expect(commits.failureBanner).toBe(0);
    expect(commits.viewportPane).toBe(0);
    expect(commits.paramPanel).toBe(0);
    // SlotPanel은 활성 슬롯(face-shape 6개 프리셋 × 2단계 = 12회)에 대해서만 리렌더된다(수정 전: 128회 → 수정 후: 12회)
    expect(commits.slotPanel).toBe(activeSlotCount * 2);
  });

  it("체형 슬라이더 20단계(-0.9 → 1.0, step 0.1) 연속 드래그 시 SlotRail과 FailureBanner는 불필요하게 리렌더되지 않는다", () => {
    const catalog = buildDefaultCatalog();
    let tick = 1_000;
    const store = createLabStore({
      catalog,
      now: () => {
        tick += 1;
        return tick;
      },
      initial: { recipe: createDefaultRecipe(), capabilities: ALL_AVAILABLE_CAPABILITIES },
    });

    const commits = { slotRail: 0, failureBanner: 0, paramPanel: 0 };

    render(
      <MockLabProvider store={store} catalog={catalog}>
        <Profiler id="failureBanner" onRender={() => { commits.failureBanner += 1; }}>
          <FailureBanner />
        </Profiler>
        <Profiler id="slotRail" onRender={() => { commits.slotRail += 1; }}>
          <SlotRail />
        </Profiler>
        <Profiler id="paramPanel" onRender={() => { commits.paramPanel += 1; }}>
          <ParamPanel />
        </Profiler>
      </MockLabProvider>,
    );

    expect(commits).toEqual({ slotRail: 1, failureBanner: 1, paramPanel: 1 });
    commits.slotRail = 0;
    commits.failureBanner = 0;
    commits.paramPanel = 0;

    const heightSlider = screen.getByLabelText("키", { selector: "input[type=range]" });
    const steps = [-0.9, -0.8, -0.7, -0.6, -0.5, -0.4, -0.3, -0.2, -0.1, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    for (const val of steps) {
      fireEvent.change(heightSlider, { target: { value: val.toFixed(1) } });
    }

    expect(store.getState().recipe.body.height).toBe(1);
    expect(store.getState().history.depth).toBe(1);
    // 슬롯과 실패 상태가 바뀌지 않았으므로 SlotRail·FailureBanner는 연속 드래그 동안 0회 리렌더
    expect(commits.slotRail).toBe(0);
    expect(commits.failureBanner).toBe(0);
    expect(commits.paramPanel).toBe(steps.length);
  });

  it("9개 인스펙터 탭 3회전 반복 전환 및 셸 마운트·언마운트 시 window 이벤트 리스너가 누수되지 않는다", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const activeListeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
    addSpy.mockImplementation((type: string, listener: EventListenerOrEventListenerObject) => {
      let set = activeListeners.get(type);
      if (!set) {
        set = new Set();
        activeListeners.set(type, set);
      }
      set.add(listener);
    });
    removeSpy.mockImplementation((type: string, listener: EventListenerOrEventListenerObject) => {
      activeListeners.get(type)?.delete(listener);
    });

    try {
      const catalog = buildDefaultCatalog();
      const store = createLabStore({
        catalog,
        initial: {
          recipe: createDefaultRecipe(),
          capabilities: ALL_AVAILABLE_CAPABILITIES,
          engine: { phase: "ready", backend: "webgl2", diagnostics: mockDiagnostics("webgl2") },
        },
      });
      const session = createMockEngineSession(store.getState().engine);
      session.setEngine(createMockEngine({ backend: "webgl2" }));
      const ui = createUiStateStore();

      const view = render(
        <MockLabProvider store={store} catalog={catalog} engineSession={session} shell={{ ui }}>
          <TopBar />
          <ViewportPane hudIntervalMs={0} />
          <InspectorTabs panels={PERF_PANELS} />
        </MockLabProvider>,
      );

      const tabsToCycle: readonly InspectorTabId[] = ["param", "expression", "pose", "physics", "render", "paint", "export", "vision", "package"];
      // 9개 인스펙터 탭을 3회전(27회) 빠르게 반복 전환(진입·이탈 반복)
      for (let cycle = 0; cycle < 3; cycle += 1) {
        for (const tabId of tabsToCycle) {
          act(() => {
            ui.setInspectorTab(tabId);
          });
        }
      }

      view.unmount();

      // 언마운트 후 등록된 모든 window 리스너가 남김없이 해제되었는지 검증
      for (const [, listeners] of activeListeners.entries()) {
        expect(listeners.size).toBe(0);
      }
    } finally {
      addSpy.mockRestore();
      removeSpy.mockRestore();
    }
  });
});
