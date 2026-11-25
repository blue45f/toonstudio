// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CANVAS_VIEWPORT_TARGET_PCT,
  COMPLEXITY_DIET_TARGET_PCT,
  CORE_CONTROL_MAX_COUNT,
  CORE_CONTROL_MIN_COUNT,
  DEFAULT_ASSISTANT_SUGGESTIONS,
  DEFAULT_DEVICE_FEATURES,
  DEFAULT_GESTURE_MACROS,
  DEVICE_TIER_SPECS,
  MAX_VISIBLE_ASSISTANT_CARDS,
  STUDIO_CONTEXT_PROFILES,
  StudioAdaptiveCalmGuardPanel,
  applyAdaptiveCalmSession,
  applyRecommendedDegradations,
  clampNumber,
  computeAdaptiveCalmLayoutPlan,
  createAdaptiveCalmSession,
  evaluateDeviceThermalBudget,
  exportAdaptiveCalmConfigJson,
  findDuplicateGestureActions,
  getDeviceTierSpec,
  getStudioContextProfile,
  rankAndStackAssistantSuggestions,
  resetGestureMacros,
  revertAdaptiveCalmSession,
  round1,
  toggleDegradationGuard,
  updateGestureMacro,
  updateWorkingCalmSnapshot,
  type AssistantSuggestion,
  type DeviceFeatureFlags,
} from "./index";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("1. 5대 창작 단계 문맥 프로파일 및 UI 복잡도 다이어트 엔진", () => {
  it("STUDIO_CONTEXT_PROFILES는 5대 창작 단계를 모두 포함하며 각 단계 노출 컨트롤이 5~7개다", () => {
    expect(STUDIO_CONTEXT_PROFILES.map((item) => item.id)).toEqual([
      "rough-conti",
      "line-inking",
      "color-lighting",
      "lettering-sfx",
      "qa-export",
    ]);
    for (const profile of STUDIO_CONTEXT_PROFILES) {
      expect(profile.pinnedControlIds.length).toBeGreaterThanOrEqual(CORE_CONTROL_MIN_COUNT);
      expect(profile.pinnedControlIds.length).toBeLessThanOrEqual(CORE_CONTROL_MAX_COUNT);
      expect(new Set(profile.pinnedControlIds).size).toBe(profile.pinnedControlIds.length);
    }
  });

  it("5대 단계 모두 기본 레이아웃에서 UI 복잡도 60%+ 절감과 캔버스 점유율 82%+를 달성한다", () => {
    for (const profile of STUDIO_CONTEXT_PROFILES) {
      const plan = computeAdaptiveCalmLayoutPlan(profile.id);
      expect(plan.visibleControlCount).toBeGreaterThanOrEqual(CORE_CONTROL_MIN_COUNT);
      expect(plan.visibleControlCount).toBeLessThanOrEqual(CORE_CONTROL_MAX_COUNT);
      expect(plan.visibleControlCount + plan.collapsedControlCount).toBe(plan.totalControlCount);
      expect(plan.complexityReductionPct).toBeGreaterThanOrEqual(COMPLEXITY_DIET_TARGET_PCT);
      expect(plan.meetsComplexityDietTarget).toBe(true);
      expect(plan.adaptedViewportPct).toBeGreaterThanOrEqual(CANVAS_VIEWPORT_TARGET_PCT);
      expect(plan.meetsViewportTarget).toBe(true);
    }
  });

  it("rough-conti와 line-inking은 단계별 핵심 도구를 서로 다르게 노출하고 보조 패널을 서랍으로 정리한다", () => {
    const conti = computeAdaptiveCalmLayoutPlan("rough-conti");
    const ink = computeAdaptiveCalmLayoutPlan("line-inking");
    const contiIds = conti.pinnedControls.map((c) => c.id);
    const inkIds = ink.pinnedControls.map((c) => c.id);

    expect(contiIds).toContain("camera-angle-guide");
    expect(contiIds).toContain("panel-gutter");
    expect(contiIds).not.toContain("bg3d-viewport");

    expect(inkIds).toContain("line-stabilizer");
    expect(inkIds).toContain("vector-anchor");
    expect(inkIds).not.toContain("platform-slice-export");
  });

  it("lettering-sfx는 5개 핵심 컨트롤만 노출하고 qa-export는 저작권 BOM·슬라이스 출고를 고정한다", () => {
    const letter = computeAdaptiveCalmLayoutPlan("lettering-sfx");
    const qa = computeAdaptiveCalmLayoutPlan("qa-export");

    expect(letter.visibleControlCount).toBe(5);
    expect(letter.pinnedControls.map((c) => c.id)).toContain("balloon-tail");
    expect(letter.pinnedControls.map((c) => c.id)).toContain("sfx-stamp");

    expect(qa.pinnedControls.map((c) => c.id)).toContain("preflight-rights-bom");
    expect(qa.pinnedControls.map((c) => c.id)).toContain("platform-slice-export");
  });

  it("focusBoost 옵션은 노출 컨트롤을 5개로 압축하고 캔버스 점유율을 추가로 확보한다", () => {
    for (const profile of STUDIO_CONTEXT_PROFILES) {
      const normal = computeAdaptiveCalmLayoutPlan(profile.id, { focusBoost: false });
      const boosted = computeAdaptiveCalmLayoutPlan(profile.id, { focusBoost: true });
      expect(boosted.visibleControlCount).toBe(5);
      expect(boosted.adaptedViewportPct).toBeGreaterThan(normal.adaptedViewportPct);
      expect(boosted.complexityReductionPct).toBeGreaterThanOrEqual(normal.complexityReductionPct);
    }
  });

  it("유틸리티 함수(getStudioContextProfile·getDeviceTierSpec·clampNumber·round1)는 비정상 입력을 안전 보정한다", () => {
    expect(getStudioContextProfile(undefined).id).toBe("rough-conti");
    expect(getDeviceTierSpec(undefined).id).toBe("ipad-pro-tablet");
    expect(clampNumber(Number.NaN, 10, 20)).toBe(10);
    expect(clampNumber(999, 10, 20)).toBe(20);
    expect(round1(12.36)).toBe(12.4);
  });
});

describe("2. 스마트 어시스턴트 스태킹 엔진 (rankAndStackAssistantSuggestions)", () => {
  it("동시 다중 제안 입력 시 최상단 노출 카드를 최대 2개로 엄격히 제한하고 나머지를 큐로 보류한다", () => {
    const stack = rankAndStackAssistantSuggestions({ contextId: "rough-conti" });
    expect(stack.visibleCards.length).toBeLessThanOrEqual(MAX_VISIBLE_ASSISTANT_CARDS);
    expect(stack.visibleCards).toHaveLength(2);
    expect(stack.visibleCards[0]?.stackSlot).toBe(1);
    expect(stack.visibleCards[1]?.stackSlot).toBe(2);
    expect(stack.visibleCards.length + stack.queuedCards.length).toBe(DEFAULT_ASSISTANT_SUGGESTIONS.length);
  });

  it("치명 오류(180° 월선·얼굴 말풍선 가림)가 경고·권장 제안보다 항상 우선 노출된다", () => {
    const stack = rankAndStackAssistantSuggestions({ contextId: "color-lighting" });
    expect(stack.criticalInVisibleCount).toBe(2);
    const visibleIds = stack.visibleCards.map((c) => c.suggestion.id);
    expect(visibleIds).toContain("cam-axis-180-cut14");
    expect(visibleIds).toContain("balloon-face-occlude-cut14");
  });

  it("maxVisible에 2 초과 또는 0 이하를 전달해도 항상 1~2 범위로 클램프한다", () => {
    const over = rankAndStackAssistantSuggestions({ contextId: "rough-conti", maxVisible: 6 });
    const under = rankAndStackAssistantSuggestions({ contextId: "rough-conti", maxVisible: 0 });
    expect(over.maxVisible).toBe(2);
    expect(over.visibleCards).toHaveLength(2);
    expect(under.maxVisible).toBe(1);
    expect(under.visibleCards).toHaveLength(1);
  });

  it("동일 충돌 그룹의 하위 제안은 conflict-deferred와 conflictWithId로 표시되어 동시 노출을 차단한다", () => {
    const stack = rankAndStackAssistantSuggestions({ contextId: "rough-conti" });
    const exprQueued = stack.queuedCards.find((c) => c.suggestion.id === "expr-brow-tension-cut14");
    const camAuxQueued = stack.queuedCards.find((c) => c.suggestion.id === "camera-dutch-emphasis-cut16");

    expect(exprQueued?.queueReason).toBe("conflict-deferred");
    expect(exprQueued?.conflictWithId).toBe("balloon-face-occlude-cut14");
    expect(camAuxQueued?.queueReason).toBe("conflict-deferred");
    expect(camAuxQueued?.conflictWithId).toBe("cam-axis-180-cut14");
    expect(stack.deferredConflictCount).toBeGreaterThanOrEqual(2);
  });

  it("치명 오류를 제외한 상태에서 문맥 변경 시 현재 단계 관련 도메인이 최상위로 재정렬된다", () => {
    const nonCritical = DEFAULT_ASSISTANT_SUGGESTIONS.filter((item) => item.severity !== "critical");
    const colorStack = rankAndStackAssistantSuggestions({ contextId: "color-lighting", suggestions: nonCritical });
    const qaStack = rankAndStackAssistantSuggestions({ contextId: "qa-export", suggestions: nonCritical });

    expect(colorStack.visibleCards[0]?.suggestion.domain).toBe("lighting");
    expect(qaStack.visibleCards[0]?.suggestion.domain).toBe("modelsheet");
    // lighting이 lighting-color 슬롯을 점유해 style 제안은 충돌 보류됨
    const styleCard = colorStack.queuedCards.find((c) => c.suggestion.domain === "style");
    expect(styleCard?.queueReason).toBe("conflict-deferred");
    expect(styleCard?.conflictWithId).toBe("lighting-rim-contrast-cut14");
  });

  it("dismissedIds로 최상단 카드를 보류하면 충돌 해소된 대기 카드가 승격되며 노출 수는 2개 이하를 유지한다", () => {
    const afterDismiss = rankAndStackAssistantSuggestions({
      contextId: "rough-conti",
      dismissedIds: ["balloon-face-occlude-cut14"],
    });
    expect(afterDismiss.dismissedCount).toBe(1);
    expect(afterDismiss.visibleCards).toHaveLength(2);
    expect(afterDismiss.visibleCards.some((c) => c.suggestion.id === "expr-brow-tension-cut14")).toBe(true);
  });

  it("치명 오류가 3건 이상 동시 발생하면 상위 2건만 노출하고 guarded 상태를 보고한다", () => {
    const tripleCritical: readonly AssistantSuggestion[] = [
      ...DEFAULT_ASSISTANT_SUGGESTIONS.slice(0, 2),
      {
        id: "modelsheet-critical-cut22",
        domain: "modelsheet",
        severity: "critical",
        conflictGroup: "continuity-spec",
        confidence: 0.93,
        titleKo: "22컷 필수 흉터·귀걸이 동시 누락",
        titleEn: "Cut 22: Missing Scar & Earring",
        detailKo: "설정집 필수 식별 소품 2종이 누락되었습니다.",
        detailEn: "Two required character props are missing.",
        cutLabel: "Cut 22",
      },
    ];
    const stack = rankAndStackAssistantSuggestions({ contextId: "qa-export", suggestions: tripleCritical });
    expect(stack.visibleCards).toHaveLength(2);
    expect(stack.unshownCriticalCount).toBe(1);
    expect(stack.cognitiveLoadStatus).toBe("guarded");
  });
});

describe("3. 저사양/모바일 기기 메모리·발열·프레임 가드 (evaluateDeviceThermalBudget)", () => {
  it("4대 기기 티어는 데스크톱→노트북→태블릿→모바일 4GB 순으로 메모리·열 예산이 단계적으로 낮아진다", () => {
    expect(DEVICE_TIER_SPECS.map((t) => t.id)).toEqual([
      "flagship-desktop",
      "apple-silicon-laptop",
      "ipad-pro-tablet",
      "entry-mobile-4gb",
    ]);
    for (let i = 1; i < DEVICE_TIER_SPECS.length; i += 1) {
      const curTier = DEVICE_TIER_SPECS[i];
      const prevTier = DEVICE_TIER_SPECS[i - 1];
      if (!curTier || !prevTier) throw new Error("기기 티어 스펙이 누락되었습니다.");
      expect(curTier.memoryBudgetMb).toBeLessThan(prevTier.memoryBudgetMb);
      expect(curTier.thermalHeadroom).toBeLessThan(prevTier.thermalHeadroom);
    }
  });

  it("flagship-desktop은 기본 기능 3종에서 safe 등급과 강등 제안 0건을 반환한다", () => {
    const report = evaluateDeviceThermalBudget("flagship-desktop", DEFAULT_DEVICE_FEATURES);
    expect(report.current.status).toBe("safe");
    expect(report.needsDegradation).toBe(false);
    expect(report.degradationProposals).toHaveLength(0);
    expect(report.current.estimatedFps).toBe(60);
  });

  it("entry-mobile-4gb는 고부하 기능 활성화 시 critical과 4종 비파괴 안전 강등을 제안한다", () => {
    const report = evaluateDeviceThermalBudget("entry-mobile-4gb", DEFAULT_DEVICE_FEATURES);
    expect(report.current.status).toBe("critical");
    expect(report.needsDegradation).toBe(true);
    const ids = report.degradationProposals.map((p) => p.id);
    expect(ids).toEqual([
      "pause-bg3d-viewport",
      "lower-impasto-lod",
      "throttle-background-precache",
      "tile-4k-stream-cap",
    ]);
    for (const proposal of report.degradationProposals) {
      expect(proposal.nonDestructive).toBe(true);
      expect(proposal.reversible).toBe(true);
      expect(proposal.savedMemoryMb).toBeGreaterThan(0);
    }
  });

  it("ipad-pro-tablet에서 고부하 기능 조합 시 임계치 초과를 감지하고 비파괴 강등을 제안한다", () => {
    const report = evaluateDeviceThermalBudget("ipad-pro-tablet", DEFAULT_DEVICE_FEATURES);
    expect(report.needsDegradation).toBe(true);
    expect(report.degradationProposals.length).toBeGreaterThanOrEqual(3);
    expect(report.projectedAfterAllGuards.estimatedMemoryMb).toBeLessThan(report.raw.estimatedMemoryMb);
  });

  it("모든 권장 강등을 적용하면 current 지표가 raw 대비 개선되고 projectedAfterAllGuards와 일치한다", () => {
    const initial = evaluateDeviceThermalBudget("entry-mobile-4gb", DEFAULT_DEVICE_FEATURES);
    const allIds = initial.degradationProposals.map((p) => p.id);
    const guarded = evaluateDeviceThermalBudget("entry-mobile-4gb", DEFAULT_DEVICE_FEATURES, allIds);

    expect(guarded.current.estimatedMemoryMb).toBeLessThan(initial.raw.estimatedMemoryMb);
    expect(guarded.current.estimatedFrameMs).toBeLessThan(initial.raw.estimatedFrameMs);
    expect(guarded.current.thermalLoadPct).toBeLessThan(initial.raw.thermalLoadPct);
    expect(guarded.current).toEqual(guarded.projectedAfterAllGuards);
    expect(guarded.current.status).toBe("safe");
  });

  it("flagship-desktop에서도 4대 고부하 기능을 전부 켜면 caution 이상과 스로틀링 제안을 산출한다", () => {
    const heavyAll: DeviceFeatureFlags = {
      canvas4k: true,
      bg3dViewport: true,
      impastoTexture: true,
      localAiAssist: true,
    };
    const report = evaluateDeviceThermalBudget("flagship-desktop", heavyAll);
    expect(report.activeFeatureCount).toBe(4);
    expect(report.current.status).not.toBe("safe");
    expect(report.degradationProposals.some((p) => p.id === "throttle-background-precache")).toBe(true);
  });

  it("기능을 끈 뒤 무효화된 appliedDegradationIds는 자동 제거되어 절감액이 과계산되지 않는다", () => {
    const lightFeatures: DeviceFeatureFlags = {
      canvas4k: true,
      bg3dViewport: false,
      impastoTexture: false,
      localAiAssist: true,
    };
    const report = evaluateDeviceThermalBudget("entry-mobile-4gb", lightFeatures, [
      "pause-bg3d-viewport",
      "lower-impasto-lod",
      "throttle-background-precache",
    ]);
    expect(report.appliedDegradationIds).toEqual(["throttle-background-precache"]);
  });
});

describe("4. 단일 제스처 매크로 4종 · 비파괴 세션 상태 머신 · JSON 내보내기", () => {
  it("DEFAULT_GESTURE_MACROS는 단일 제스처 4종과 기본 동작을 정확히 매핑한다", () => {
    expect(DEFAULT_GESTURE_MACROS).toHaveLength(4);
    expect(DEFAULT_GESTURE_MACROS.map((g) => [g.triggerId, g.actionId])).toEqual([
      ["two-finger-tap", "undo-stroke"],
      ["three-finger-swipe", "toggle-focus-mode"],
      ["pen-double-tap", "swap-eraser-gpen"],
      ["four-finger-pinch", "overview-cut-rhythm"],
    ]);
  });

  it("updateGestureMacro와 resetGestureMacros는 불변성을 유지하며 동작 변경·비활성화·초기화를 처리한다", () => {
    const edited = updateGestureMacro(DEFAULT_GESTURE_MACROS, "pen-double-tap", {
      actionId: "flip-canvas-horizontal",
      enabled: false,
    });
    expect(DEFAULT_GESTURE_MACROS[2]?.actionId).toBe("swap-eraser-gpen");
    expect(edited[2]?.actionId).toBe("flip-canvas-horizontal");
    expect(edited[2]?.enabled).toBe(false);

    const restored = resetGestureMacros();
    expect(restored[2]?.actionId).toBe("swap-eraser-gpen");
    expect(restored[2]?.enabled).toBe(true);
  });

  it("findDuplicateGestureActions는 활성 제스처 간 중복 액션만 반환한다", () => {
    expect(findDuplicateGestureActions(DEFAULT_GESTURE_MACROS)).toEqual([]);
    const dup = updateGestureMacro(DEFAULT_GESTURE_MACROS, "four-finger-pinch", { actionId: "undo-stroke" });
    expect(findDuplicateGestureActions(dup)).toEqual(["undo-stroke"]);
    const disabledDup = updateGestureMacro(dup, "four-finger-pinch", { enabled: false });
    expect(findDuplicateGestureActions(disabledDup)).toEqual([]);
  });

  it("세션 상태 머신(create→edit→apply→revert)이 원본 baseline을 보존하고 이력을 추적한다", () => {
    const base = createAdaptiveCalmSession({
      initialContextId: "line-inking",
      initialDeviceTier: "ipad-pro-tablet",
    });
    const edited = updateWorkingCalmSnapshot(base, (cur) => ({
      ...cur,
      contextId: "qa-export",
      focusBoost: true,
    }));
    const applied = applyAdaptiveCalmSession(edited);
    expect(applied.status).toBe("applied");
    expect(applied.applied?.contextId).toBe("qa-export");
    expect(applied.baseline.contextId).toBe("line-inking");
    expect(applied.historyCount).toBe(1);

    const reverted = revertAdaptiveCalmSession(applied);
    expect(reverted.status).toBe("reverted");
    expect(reverted.applied).toBeNull();
    expect(reverted.working).toEqual(base.baseline);
    expect(reverted.historyCount).toBe(2);
  });

  it("applyRecommendedDegradations와 toggleDegradationGuard가 강등 가드를 비파괴 토글한다", () => {
    const base = createAdaptiveCalmSession({ initialDeviceTier: "entry-mobile-4gb" });
    const report = evaluateDeviceThermalBudget(base.working.deviceTierId, base.working.features);
    const appliedAll = applyRecommendedDegradations(base, report);
    expect(appliedAll.working.appliedDegradationIds).toHaveLength(4);

    const toggledOff = toggleDegradationGuard(appliedAll, "pause-bg3d-viewport");
    expect(toggledOff.working.appliedDegradationIds).not.toContain("pause-bg3d-viewport");
    expect(toggledOff.working.appliedDegradationIds).toHaveLength(3);
  });

  it("exportAdaptiveCalmConfigJson은 스키마·레이아웃·어시스턴트 스택(<=2)·기기 가드·4종 제스처 JSON을 생성한다", () => {
    const session = applyAdaptiveCalmSession(
      createAdaptiveCalmSession({ initialContextId: "color-lighting", initialDeviceTier: "entry-mobile-4gb" }),
    );
    const layoutPlan = computeAdaptiveCalmLayoutPlan(session.working.contextId);
    const assistantStack = rankAndStackAssistantSuggestions({ contextId: session.working.contextId });
    const thermalReport = evaluateDeviceThermalBudget(session.working.deviceTierId, session.working.features);

    const json = exportAdaptiveCalmConfigJson({ session, layoutPlan, assistantStack, thermalReport });
    const parsed = JSON.parse(json) as {
      schema: string;
      sessionStatus: string;
      contextLayout: { complexityReductionPct: number; visibleControlCount: number };
      assistantStack: { maxVisible: number; visibleIds: unknown[] };
      deviceThermalGuard: { deviceTierId: string; current: { status: string } };
      gestureMacros: { triggerId: string }[];
    };

    expect(parsed.schema).toBe("toonstudio.adaptive-calm-stack-guard.v1");
    expect(parsed.sessionStatus).toBe("applied");
    expect(parsed.contextLayout.complexityReductionPct).toBeGreaterThanOrEqual(60);
    expect(parsed.assistantStack.maxVisible).toBe(2);
    expect(parsed.assistantStack.visibleIds.length).toBeLessThanOrEqual(2);
    expect(parsed.deviceThermalGuard.deviceTierId).toBe("entry-mobile-4gb");
    expect(parsed.deviceThermalGuard.current.status).toBe("critical");
    expect(parsed.gestureMacros).toHaveLength(4);
  });
});

describe("5. StudioAdaptiveCalmGuardPanel UI 렌더링 및 상호작용", () => {
  it("props 없이 기본 렌더 시 5대 문맥·4대 기기·2단 SVG·최대 2개 어시스턴트 카드·4종 제스처를 표시한다", () => {
    render(<StudioAdaptiveCalmGuardPanel />);
    expect(screen.getByTestId("studio-adaptive-calm-guard-panel")).toBeTruthy();
    expect(screen.getByTestId("calm-complexity-diet-svg")).toBeTruthy();
    expect(screen.getByTestId("device-budget-gauge-svg")).toBeTruthy();

    for (const profile of STUDIO_CONTEXT_PROFILES) {
      expect(screen.getByTestId(`calm-context-${profile.id}`)).toBeTruthy();
    }
    for (const tier of DEVICE_TIER_SPECS) {
      expect(screen.getByTestId(`calm-device-${tier.id}`)).toBeTruthy();
    }
    const visibleCards = screen.getByTestId("assistant-visible-stack").querySelectorAll("article");
    expect(visibleCards.length).toBeLessThanOrEqual(2);
    expect(visibleCards.length).toBe(2);
    for (const macro of DEFAULT_GESTURE_MACROS) {
      expect(screen.getByTestId(`calm-gesture-row-${macro.triggerId}`)).toBeTruthy();
    }
  });

  it("initialContextId와 initialDeviceTier props가 초기 선택 상태와 SVG data 속성에 반영된다", () => {
    render(<StudioAdaptiveCalmGuardPanel initialContextId="lettering-sfx" initialDeviceTier="flagship-desktop" />);
    expect(screen.getByTestId("calm-context-lettering-sfx").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("calm-device-flagship-desktop").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("calm-complexity-diet-svg").getAttribute("data-context-id")).toBe("lettering-sfx");
    expect(screen.getByTestId("device-budget-gauge-svg").getAttribute("data-device-tier")).toBe("flagship-desktop");
    expect(screen.getByTestId("device-budget-gauge-svg").getAttribute("data-budget-status")).toBe("safe");
  });

  it("작업 문맥 전환·집중 부스트·접이식 보조 서랍 토글 시 노출 컨트롤 수와 SVG 지표가 즉시 갱신된다", () => {
    render(<StudioAdaptiveCalmGuardPanel />);
    fireEvent.click(screen.getByTestId("calm-context-color-lighting"));
    expect(screen.getByTestId("calm-complexity-diet-svg").getAttribute("data-context-id")).toBe("color-lighting");
    expect(Number(screen.getByTestId("calm-complexity-diet-svg").getAttribute("data-complexity-reduction"))).toBeGreaterThanOrEqual(60);

    fireEvent.click(screen.getByTestId("calm-focus-boost-btn"));
    expect(screen.getByTestId("calm-complexity-diet-svg").getAttribute("data-visible-controls")).toBe("5");

    expect(screen.queryByTestId("calm-drawer-list")).toBeNull();
    fireEvent.click(screen.getByTestId("calm-drawer-toggle-btn"));
    expect(screen.getByTestId("calm-drawer-list")).toBeTruthy();
  });

  it("entry-mobile-4gb 전환 시 critical 경고와 비파괴 강등이 나타나며 일괄 적용으로 안전 상태로 복구된다", () => {
    render(<StudioAdaptiveCalmGuardPanel initialDeviceTier="flagship-desktop" />);
    expect(screen.getByTestId("device-budget-status-badge").getAttribute("data-status")).toBe("safe");

    fireEvent.click(screen.getByTestId("calm-device-entry-mobile-4gb"));
    expect(screen.getByTestId("device-budget-status-badge").getAttribute("data-status")).toBe("critical");
    expect(screen.getByTestId("calm-degradation-pause-bg3d-viewport")).toBeTruthy();

    fireEvent.click(screen.getByTestId("calm-apply-recommended-guard-btn"));
    expect(screen.getByTestId("device-budget-status-badge").getAttribute("data-status")).toBe("safe");
    expect(screen.getByTestId("device-budget-gauge-svg").getAttribute("data-budget-status")).toBe("safe");
  });

  it("어시스턴트 최상단 카드 보류 시 대기 카드가 승격되며 노출 수는 항상 2 이하를 유지하고 복원된다", () => {
    render(<StudioAdaptiveCalmGuardPanel />);
    const firstCard = screen.getByTestId("assistant-visible-card-1");
    const firstId = firstCard.getAttribute("data-suggestion-id");
    expect(firstId).toBeTruthy();

    fireEvent.click(screen.getByTestId(`assistant-dismiss-btn-${firstId ?? ""}`));
    const visibleAfter = screen.getByTestId("assistant-visible-stack").querySelectorAll("article");
    expect(visibleAfter.length).toBeLessThanOrEqual(2);
    expect(screen.getByTestId("assistant-reset-dismissed-btn")).toBeTruthy();

    fireEvent.click(screen.getByTestId("assistant-reset-dismissed-btn"));
    expect(screen.getByTestId("assistant-visible-card-1").getAttribute("data-suggestion-id")).toBe(firstId);
  });

  it("제스처 매크로 커스텀·중복 감지·초기화와 설정 적용(onApply)·원복 흐름이 정확히 동작한다", () => {
    const onApply = vi.fn();
    render(<StudioAdaptiveCalmGuardPanel onApply={onApply} />);

    expect((screen.getByTestId("calm-revert-btn") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByTestId("calm-gesture-select-four-finger-pinch"), {
      target: { value: "undo-stroke" },
    });
    expect(screen.getByTestId("calm-gesture-duplicate-notice")).toBeTruthy();

    fireEvent.click(screen.getByTestId("calm-reset-gestures-btn"));
    expect(screen.queryByTestId("calm-gesture-duplicate-notice")).toBeNull();

    fireEvent.click(screen.getByTestId("calm-context-qa-export"));
    fireEvent.click(screen.getByTestId("calm-apply-btn"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("calm-session-status-badge").textContent).toContain("적용됨");
    expect((screen.getByTestId("calm-revert-btn") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId("calm-revert-btn"));
    expect(screen.getByTestId("calm-session-status-badge").textContent).toContain("원복됨");
    expect(screen.getByTestId("calm-context-rough-conti").getAttribute("aria-pressed")).toBe("true");
  });

  it("JSON 복사는 ACK 뒤 onExportJson을 호출하고 프리뷰·영문 로케일을 유지한다", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    const onExportJson = vi.fn();
    render(<StudioAdaptiveCalmGuardPanel locale="en" onExportJson={onExportJson} />);

    expect(screen.getByTestId("calm-non-destructive-badge").textContent).toContain("Non-Destructive Guard");
    expect(screen.queryByTestId("calm-json-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("calm-copy-json-btn"));
    await waitFor(() => expect(onExportJson).toHaveBeenCalledTimes(1));
    expect(write).toHaveBeenCalledTimes(1);
    expect(onExportJson.mock.calls[0]?.[0]).toContain("toonstudio.adaptive-calm-stack-guard.v1");
    expect(screen.getByTestId("calm-json-preview").textContent).toContain('"gestureMacros"');

    fireEvent.click(screen.getByTestId("calm-toggle-json-btn"));
    expect(screen.queryByTestId("calm-json-preview")).toBeNull();
  });

  it("렌더링된 모든 button과 select 요소가 min-h-11 터치/포인터 기준을 만족한다", () => {
    const { container } = render(<StudioAdaptiveCalmGuardPanel initialDeviceTier="entry-mobile-4gb" />);
    const buttons = Array.from(container.querySelectorAll("button"));
    const selects = Array.from(container.querySelectorAll("select"));

    expect(buttons.length).toBeGreaterThanOrEqual(24);
    expect(selects.length).toBe(4);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }
    for (const sel of selects) {
      expect(sel.className).toContain("min-h-11");
    }
  });
});

describe("6. 하네스 · 탈-바이올렛 · Calm Atelier 코드 위생 자가 검증", () => {
  const dir = path.resolve(import.meta.dirname);
  const ownedFiles = [
    "adaptive-calm-stack-engine.ts",
    "StudioAdaptiveCalmGuardPanel.tsx",
    "index.ts",
    "adaptive-calm-stack.test.tsx",
    "calm-boundaries.test.tsx",
    "calm-input-contract.ts",
    "calm-report-export.ts",
    "use-calm-notification.ts",
    "use-calm-copy.ts",
  ];

  it("9개 소유 파일이 모두 존재하며 각각 800줄 이하이다", () => {
    const present = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(present.sort()).toEqual([...ownedFiles].sort());
    for (const file of ownedFiles) {
      const fullPath = path.join(dir, file);
      expect(existsSync(fullPath)).toBe(true);
      const lineCount = readFileSync(fullPath, "utf8").split(/\r?\n/).length;
      expect(lineCount).toBeLessThanOrEqual(800);
    }
  });

  it("원시 hex/rgb/hsl·transition-all·Web Storage·private Map store·BigInt·Sparkles·= {} 기본 props가 0건이다", () => {
    for (const file of ownedFiles) {
      if (file === "adaptive-calm-stack.test.tsx") continue;
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(src).not.toMatch(/\brgba?\s*\(/iu);
      expect(src).not.toMatch(/\bhsla?\s*\(/iu);
      expect(src).not.toContain("transition-all");
      expect(src).not.toMatch(/\blocalStorage\b/u);
      expect(src).not.toMatch(/\bsessionStorage\b/u);
      expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
      expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
      expect(src).not.toMatch(/\b\d+n\b/u);
      expect(src).not.toContain("Sparkles");
      expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
      expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
    }
  });

  it("모든 OKLCH 휴(Hue)가 바이올렛 대역(270~320°) 0%이며 접근성·자연스러운 한글 규율을 충족한다", () => {
    const panelSrc = readFileSync(path.join(dir, "StudioAdaptiveCalmGuardPanel.tsx"), "utf8");
    const oklchMatches = Array.from(panelSrc.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/gu));
    expect(oklchMatches.length).toBeGreaterThanOrEqual(8);
    for (const match of oklchMatches) {
      const hue = Number(match[1]);
      expect(hue < 270 || hue > 320).toBe(true);
    }

    expect(panelSrc).toContain("[word-break:keep-all]");
    expect(panelSrc).toContain("tabular-nums");
    expect(panelSrc).toContain("min-h-11");
    expect(panelSrc).toContain("motion-reduce:transition-none");
    expect(panelSrc).not.toContain("하는 것을 가능하게");
    expect(panelSrc).not.toContain("직관적인 경험을 제공");
    expect(panelSrc).not.toContain("원활한 워크플로우를 보장");
  });
});
