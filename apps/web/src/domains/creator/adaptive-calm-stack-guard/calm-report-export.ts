import { computeAdaptiveCalmLayoutPlan, evaluateDeviceThermalBudget, rankAndStackAssistantSuggestions,
  type AdaptiveCalmExportInput, type RankedAssistantCard } from "./adaptive-calm-stack-engine";
import { assertCalmSession } from "./calm-input-contract";

function assertPrimitives<T extends object>(actual: T, expected: T, ignored: readonly string[] = []): void {
  for (const key of Object.keys(expected) as (keyof T)[]) {
    const value = expected[key];
    if ((value === null || typeof value !== "object") && !ignored.includes(String(key)) && actual[key] !== value) throw new RangeError("리포트가 현재 구성 예제와 다릅니다. 다시 계산해 주세요.");
  }
}
function assertCards(actual: readonly RankedAssistantCard[], expected: readonly RankedAssistantCard[]): void {
  if (actual.length !== expected.length) throw new RangeError("스태킹 결과의 카드 수가 다릅니다.");
  actual.forEach((card, index) => {
    const current = expected[index];
    if (!current || card.suggestion.id !== current.suggestion.id) throw new RangeError("스태킹 결과의 제안 순서가 다릅니다.");
    assertPrimitives(card, current);
  });
}

/** 현재 문맥 UI 다이어트 플랜·스마트 스태킹·기기 예산 가드·4종 제스처 매크로를 JSON으로 직렬화한다. */
export function exportAdaptiveCalmConfigJson(input: AdaptiveCalmExportInput): string {
  const { session } = input;
  assertCalmSession(session);
  const working = session.working;
  const layoutPlan = computeAdaptiveCalmLayoutPlan(working.contextId, { focusBoost: working.focusBoost });
  assertPrimitives(input.layoutPlan, layoutPlan);
  for (const key of ["pinnedControls", "drawerControls"] as const) {
    if (!Array.isArray(input.layoutPlan[key]) || input.layoutPlan[key].length !== layoutPlan[key].length
      || input.layoutPlan[key].some((control, index) => control.id !== layoutPlan[key][index]?.id)) throw new RangeError("레이아웃 예제의 컨트롤 목록이 다릅니다.");
  }
  const thermalReport = evaluateDeviceThermalBudget(working.deviceTierId, working.features, working.appliedDegradationIds);
  assertPrimitives(input.thermalReport.deviceTier, thermalReport.deviceTier);
  assertPrimitives(input.thermalReport.features, thermalReport.features);
  for (const key of ["raw", "current", "projectedAfterAllGuards"] as const) assertPrimitives(input.thermalReport[key], thermalReport[key]);
  const supplied = input.assistantStack;
  if (!Array.isArray(supplied.visibleCards) || !Array.isArray(supplied.queuedCards) || supplied.visibleCards.length > 2
    || supplied.visibleCards.length + supplied.queuedCards.length > 64) throw new RangeError("스태킹 결과가 지원 한도를 넘었습니다.");
  const assistantStack = rankAndStackAssistantSuggestions({ contextId: working.contextId, maxVisible: supplied.maxVisible,
    suggestions: [...supplied.visibleCards, ...supplied.queuedCards].map(card => card.suggestion) });
  assertPrimitives(supplied, assistantStack, ["dismissedCount"]);
  assertCards(supplied.visibleCards, assistantStack.visibleCards); assertCards(supplied.queuedCards, assistantStack.queuedCards);
  return JSON.stringify({
    schema: "toonstudio.adaptive-calm-stack-guard.v1",
    sourceKind: "cpu-config-example", studioSettingsApplied: false, hardwareMeasured: false, persisted: false,
    estimateBasis: "fixed-example-control-and-device-weights",
    sessionStatus: session.status,
    historyCount: session.historyCount,
    contextLayout: {
      contextId: layoutPlan.contextId, focusBoost: layoutPlan.focusBoost,
      visibleControlCount: layoutPlan.visibleControlCount, collapsedControlCount: layoutPlan.collapsedControlCount,
      pinnedControlIds: layoutPlan.pinnedControls.map((item) => item.id),
      baselineComplexityIndex: layoutPlan.baselineComplexityIndex,
      adaptedComplexityIndex: layoutPlan.adaptedComplexityIndex,
      complexityReductionPct: layoutPlan.complexityReductionPct,
      baselineViewportPct: layoutPlan.baselineViewportPct,
      adaptedViewportPct: layoutPlan.adaptedViewportPct,
    },
    assistantStack: {
      maxVisible: assistantStack.maxVisible,
      cognitiveLoadStatus: assistantStack.cognitiveLoadStatus,
      visibleIds: assistantStack.visibleCards.map((c) => ({
        id: c.suggestion.id, domain: c.suggestion.domain, severity: c.suggestion.severity, priorityScore: c.priorityScore,
      })),
      queuedIds: assistantStack.queuedCards.map((c) => ({
        id: c.suggestion.id, queueReason: c.queueReason, conflictWithId: c.conflictWithId,
      })),
      deferredConflictCount: assistantStack.deferredConflictCount,
    },
    deviceThermalGuard: {
      deviceTierId: thermalReport.deviceTier.id,
      memoryBudgetMb: thermalReport.deviceTier.memoryBudgetMb,
      features: thermalReport.features,
      current: thermalReport.current,
      projectedAfterAllGuards: thermalReport.projectedAfterAllGuards,
      appliedDegradationIds: thermalReport.appliedDegradationIds,
    },
    gestureMacros: session.working.gestures.map((m) => ({
      triggerId: m.triggerId, actionId: m.actionId, enabled: m.enabled,
    })),
  }, null, 2);
}
