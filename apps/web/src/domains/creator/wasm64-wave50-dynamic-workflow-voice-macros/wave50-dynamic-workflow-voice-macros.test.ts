import { describe, expect, it } from "vitest";

import {
  analyzePenStrokeGeometry,
  applyDefaultDynamicMacroStep,
  AtomicMacroRollbackJournal,
  compileDynamicMacroPlan,
  compilePenButtonMacroPlan,
  compileVoiceMacroPlan,
  computeDocumentStateHash,
  createInitialHysteresisState,
  createStudioMacroDocumentState,
  evaluateContextReactiveWorkflow,
  SACRED_MIN_CANVAS_VIEWPORT_RATIO,
  validateSacredViewportBudget,
  type StrokePoint,
} from "./index";

function makeOvalStroke(cx: number, cy: number, rx: number, ry: number, steps = 24): StrokePoint[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const theta = (i / steps) * Math.PI * 2;
    return { x: cx + Math.cos(theta) * rx, y: cy + Math.sin(theta) * ry, timeMs: 1_000 + i * 12, pressure: 0.55 };
  });
}

function makeRectStroke(x: number, y: number, w: number, h: number): StrokePoint[] {
  return [
    { x, y, timeMs: 1_000 },
    { x: x + w * 0.5, y, timeMs: 1_030 },
    { x: x + w, y, timeMs: 1_060 },
    { x: x + w, y: y + h * 0.5, timeMs: 1_090 },
    { x: x + w, y: y + h, timeMs: 1_120 },
    { x: x + w * 0.5, y: y + h, timeMs: 1_150 },
    { x, y: y + h, timeMs: 1_180 },
    { x, y: y + h * 0.5, timeMs: 1_210 },
    { x: x + 2, y: y + 2, timeMs: 1_240 },
  ];
}

function makeStraightHoldStroke(x0: number, y0: number, x1: number, y1: number, holdMs: number, t0 = 1_000): StrokePoint[] {
  const pts: StrokePoint[] = Array.from({ length: 9 }, (_, i) => ({
    x: x0 + ((x1 - x0) * i) / 8,
    y: y0 + ((y1 - y0) * i) / 8,
    timeMs: t0 + i * 16,
  }));
  pts.push({ x: x1 + 1, y: y1, timeMs: t0 + 128 + holdMs });
  return pts;
}

describe("wasm64-wave50-dynamic-workflow-voice-macros", () => {
  it("1. 러프 레이어 원형 폐곡선 궤적은 비침투 말풍선 변환(balloon_candidate)을 제안한다", () => {
    const oval = makeOvalStroke(300, 260, 88, 62);
    const geom = analyzePenStrokeGeometry(oval);
    expect(geom.isClosedLoop).toBe(true);
    expect(geom.circularity).toBeGreaterThan(0.8);

    const hit1 = evaluateContextReactiveWorkflow(
      { layerRole: "rough", activeTool: "rough_pencil", strokePoints: oval, nowMs: 1_400 },
      createInitialHysteresisState("rough_pencil"),
    );
    const hit2 = evaluateContextReactiveWorkflow(
      { layerRole: "rough", activeTool: "rough_pencil", strokePoints: oval, nowMs: 1_600 },
      hit1.nextState,
    );

    expect(hit1.decision).toBe("warming_hysteresis");
    expect(hit2.decision).toBe("suggested_non_intrusive");
    expect(hit2.autoSwitched).toBe(false);
    expect(hit2.nextTool).toBe("rough_pencil");
    expect(hit2.suggestion?.kind).toBe("balloon_candidate");
    expect(hit2.suggestion?.targetTool).toBe("balloon_tool");
  });

  it("2. 러프 레이어 사각 폐곡선 궤적은 컷 프레임 확정(cut_frame)을 비침투 제안한다", () => {
    const res = evaluateContextReactiveWorkflow(
      { layerRole: "rough", activeTool: "rough_pencil", strokePoints: makeRectStroke(120, 140, 280, 190), nowMs: 2_000 },
      createInitialHysteresisState("rough_pencil"),
      { requiredConsecutiveHits: 1 },
    );
    expect(res.geometry.isClosedLoop).toBe(true);
    expect(res.geometry.rectangularity).toBeGreaterThan(0.85);
    expect(res.decision).toBe("suggested_non_intrusive");
    expect(res.suggestion?.kind).toBe("cut_frame");
    expect(res.suggestion?.targetTool).toBe("cut_frame_knife");
  });

  it("3. 선화 레이어 교차점 스침 궤적은 교차점 지우개(intersection_erase)로 자동 전환한다", () => {
    const graze: StrokePoint[] = [
      { x: 200, y: 200, timeMs: 1_000 },
      { x: 230, y: 214, timeMs: 1_020 },
      { x: 260, y: 222, timeMs: 1_040 },
    ];
    const res = evaluateContextReactiveWorkflow(
      { layerRole: "lineart", activeTool: "ink_pen", strokePoints: graze, nowMs: 1_200, intersectsExistingLinework: true, intersectionGrazeCount: 2 },
      createInitialHysteresisState("ink_pen"),
      { requiredConsecutiveHits: 1 },
    );
    expect(res.decision).toBe("auto_switched");
    expect(res.autoSwitched).toBe(true);
    expect(res.nextTool).toBe("intersection_eraser");
    expect(res.suggestion?.kind).toBe("intersection_erase");
  });

  it("4. 밑색 레이어 폐영역 내부 더블탭은 틈새 막힘 채색(gap_closing_fill)으로 자동 전환한다", () => {
    const res = evaluateContextReactiveWorkflow(
      { layerRole: "flat", activeTool: "ink_pen", strokePoints: [{ x: 340, y: 410, timeMs: 1_500 }], nowMs: 1_520, isDoubleTapInsideClosedRegion: true, closedRegionGapPx: 4 },
      createInitialHysteresisState("ink_pen"),
      { requiredConsecutiveHits: 1 },
    );
    expect(res.decision).toBe("auto_switched");
    expect(res.nextTool).toBe("gap_closing_fill");
    expect(res.suggestion?.kind).toBe("gap_closing_fill");
    expect(res.suggestion?.recommendedGapClosePx).toBe(4);
  });

  it("5. 직선 궤적 말단 장시간 홀드는 직선 자(straight_ruler) 자동 스냅을 켠다", () => {
    const res = evaluateContextReactiveWorkflow(
      { layerRole: "lineart", activeTool: "ink_pen", strokePoints: makeStraightHoldStroke(80, 120, 360, 120, 420), nowMs: 1_900 },
      createInitialHysteresisState("ink_pen"),
      { requiredConsecutiveHits: 1 },
    );
    expect(res.geometry.straightness).toBeGreaterThan(0.95);
    expect(res.geometry.holdDurationMs).toBeGreaterThanOrEqual(420);
    expect(res.decision).toBe("auto_switched");
    expect(res.nextTool).toBe("straight_ruler");
    expect(res.suggestion?.kind).toBe("straight_ruler");
  });

  it("6. 수동 잠금(manualLock) 활성화 시 어떤 맥락 제스처에도 자동 전환과 제안을 차단한다", () => {
    const res = evaluateContextReactiveWorkflow(
      { layerRole: "flat", activeTool: "ink_pen", strokePoints: [{ x: 200, y: 200, timeMs: 1_000 }], nowMs: 1_100, isDoubleTapInsideClosedRegion: true, manualLock: true },
      createInitialHysteresisState("ink_pen"),
      { requiredConsecutiveHits: 1 },
    );
    expect(res.decision).toBe("blocked_manual_lock");
    expect(res.autoSwitched).toBe(false);
    expect(res.nextTool).toBe("ink_pen");
    expect(res.suggestion).toBeNull();
  });

  it("7. 히스테리시스는 1회성 오탐을 보류하고 연속 확신도 충족 시에만 전환을 확정한다", () => {
    const graze: StrokePoint[] = [{ x: 100, y: 100, timeMs: 1_000 }, { x: 145, y: 108, timeMs: 1_030 }];
    const hit1 = evaluateContextReactiveWorkflow(
      { layerRole: "lineart", activeTool: "ink_pen", strokePoints: graze, nowMs: 1_030, intersectsExistingLinework: true },
      createInitialHysteresisState("ink_pen"),
      { requiredConsecutiveHits: 2 },
    );
    const hit2 = evaluateContextReactiveWorkflow(
      { layerRole: "lineart", activeTool: "ink_pen", strokePoints: graze, nowMs: 1_160, intersectsExistingLinework: true },
      hit1.nextState,
      { requiredConsecutiveHits: 2 },
    );
    expect(hit1.decision).toBe("warming_hysteresis");
    expect(hit1.nextState.consecutiveCount).toBe(1);
    expect(hit2.decision).toBe("auto_switched");
    expect(hit2.nextTool).toBe("intersection_eraser");
  });

  it("8. 최소 쿨다운(cooldownMs) 안에서는 반대 도구 전환을 막고 경과 후 허용한다", () => {
    const first = evaluateContextReactiveWorkflow(
      { layerRole: "lineart", activeTool: "ink_pen", strokePoints: [{ x: 10, y: 10, timeMs: 1_000 }, { x: 45, y: 18, timeMs: 1_020 }], nowMs: 1_020, intersectsExistingLinework: true },
      createInitialHysteresisState("ink_pen"),
      { requiredConsecutiveHits: 1, cooldownMs: 500 },
    );
    const straightHold = makeStraightHoldStroke(20, 40, 260, 40, 400, 1_100);
    const blocked = evaluateContextReactiveWorkflow(
      { layerRole: "lineart", activeTool: "intersection_eraser", strokePoints: straightHold, nowMs: 1_300 },
      first.nextState,
      { requiredConsecutiveHits: 1, cooldownMs: 500 },
    );
    const allowed = evaluateContextReactiveWorkflow(
      { layerRole: "lineart", activeTool: "intersection_eraser", strokePoints: straightHold, nowMs: 1_650 },
      first.nextState,
      { requiredConsecutiveHits: 1, cooldownMs: 500 },
    );
    expect(blocked.decision).toBe("blocked_cooldown");
    expect(blocked.nextTool).toBe("intersection_eraser");
    expect(allowed.decision).toBe("auto_switched");
    expect(allowed.nextTool).toBe("straight_ruler");
  });

  it("9. Sacred 82% 뷰포트 예산은 44px 바·7메뉴 이내에서 통과하고 초과 시 제안을 보류한다", () => {
    const healthy = validateSacredViewportBudget({
      viewportWidthPx: 1440,
      viewportHeightPx: 900,
      contextBarHeightPx: 44,
      sideChromeWidthPx: 80,
      floatingChipWidthPx: 168,
      floatingChipHeightPx: 36,
      visibleMenuCount: 7,
    });
    expect(healthy.passesSacred82Budget).toBe(true);
    expect(healthy.usableCanvasRatio).toBeGreaterThanOrEqual(SACRED_MIN_CANVAS_VIEWPORT_RATIO);

    const blocked = evaluateContextReactiveWorkflow(
      {
        layerRole: "rough",
        activeTool: "rough_pencil",
        strokePoints: makeOvalStroke(220, 220, 70, 52),
        nowMs: 2_000,
        viewportChrome: { viewportWidthPx: 1280, viewportHeightPx: 720, contextBarHeightPx: 64, sideChromeWidthPx: 260, visibleMenuCount: 9 },
      },
      createInitialHysteresisState("rough_pencil"),
      { requiredConsecutiveHits: 1 },
    );
    expect(blocked.decision).toBe("blocked_viewport_budget");
    expect(blocked.viewportAudit?.passesSacred82Budget).toBe(false);
    expect(blocked.viewportAudit?.violationsKo.length).toBeGreaterThanOrEqual(2);
  });

  it("10. 음성 명령 '노을 역광 깔아줘'를 색온도 보정+림라이트 2단계 매크로로 컴파일한다", () => {
    const plan = compileVoiceMacroPlan({ utteranceKo: "노을 역광 깔아줘", activeCutNumber: 2 });
    expect(plan.isExecutable).toBe(true);
    expect(plan.targetCutNumbers).toEqual([2]);
    expect(plan.steps.map((s) => s.opcode)).toEqual(["apply_atmosphere_grade", "apply_rim_backlight"]);
    expect(plan.unmatchedFragments).toEqual([]);
  });

  it("11. 복합 음성 명령 '3번 컷 대사 10% 키우고 흰 점 메워줘'를 3번 컷 2단계 원자 매크로로 컴파일한다", () => {
    const plan = compileVoiceMacroPlan({ utteranceKo: "3번 컷 대사 10% 키우고 흰 점 메워줘", activeCutNumber: 1 });
    expect(plan.isExecutable).toBe(true);
    expect(plan.targetCutNumbers).toEqual([3]);
    expect(plan.steps.map((s) => s.opcode)).toEqual(["scale_dialogue_text", "fill_white_specs"]);
    if (plan.steps[0]?.opcode === "scale_dialogue_text") {
      expect(plan.steps[0].params.scaleDeltaPercent).toBe(10);
      expect(plan.steps[0].params.cutNumbers).toEqual([3]);
    }
  });

  it("12. 음성 명령 '어시스턴트 밑색 레이어만 비교해줘'를 소유자·역할 필터 비교 매크로로 컴파일한다", () => {
    const plan = compileVoiceMacroPlan({ utteranceKo: "어시스턴트 밑색 레이어만 비교해줘" });
    expect(plan.isExecutable).toBe(true);
    const step = plan.steps[0];
    expect(step?.opcode).toBe("compare_filtered_layers");
    if (step?.opcode === "compare_filtered_layers") {
      expect(step.params.ownerFilter).toBe("assistant");
      expect(step.params.layerRole).toBe("flat");
      expect(step.params.isolateOnly).toBe(true);
    }
  });

  it("13. 음성 명령 '선화 삐침 정리해줘'를 선화 교차 삐침 정리 매크로로 컴파일한다", () => {
    const plan = compileVoiceMacroPlan({ utteranceKo: "선화 삐침 정리해줘", activeCutNumber: 4 });
    expect(plan.isExecutable).toBe(true);
    expect(plan.steps[0]?.opcode).toBe("trim_lineart_overshoots");
    expect(plan.targetCutNumbers).toEqual([4]);
  });

  it("14. 다중 컷 범위와 대사 축소 명령 '2~4번 컷 대사 15% 줄이고 흰 점 메워줘'를 정확히 파싱한다", () => {
    const plan = compileVoiceMacroPlan({ utteranceKo: "2~4번 컷 대사 15% 줄이고 흰 점 메워줘" });
    expect(plan.targetCutNumbers).toEqual([2, 3, 4]);
    expect(plan.steps).toHaveLength(2);
    if (plan.steps[0]?.opcode === "scale_dialogue_text") {
      expect(plan.steps[0].params.scaleDeltaPercent).toBe(-15);
      expect(plan.steps[0].params.scaleFactor).toBeCloseTo(0.85, 4);
    }
  });

  it("15. 해석 불가능한 음성 입력은 안전하게 비실행 계획과 미인식 구문 경고를 반환한다", () => {
    const plan = compileVoiceMacroPlan({ utteranceKo: "점심 메뉴 추천해줘" });
    expect(plan.isExecutable).toBe(false);
    expect(plan.steps).toHaveLength(0);
    expect(plan.unmatchedFragments).toEqual(["점심 메뉴 추천해줘"]);
    expect(plan.warningsKo.length).toBeGreaterThan(0);
  });

  it("16. 스타일러스 사이드 버튼·제스처 조합은 레이어 역할별 맥락 매크로와 복합 마감 패스를 컴파일한다", () => {
    const lineartPlan = compilePenButtonMacroPlan({ button: "primary_side", gesture: "double_click", layerRole: "lineart", activeCutNumber: 2 });
    const finishPlan = compilePenButtonMacroPlan({ button: "secondary_side", gesture: "double_click", layerRole: "flat", activeCutNumber: 2 });
    const brushPlan = compilePenButtonMacroPlan({ button: "primary_side", gesture: "hold_drag_up", layerRole: "shade", dragDistancePx: 36 });

    expect(lineartPlan.steps[0]?.opcode).toBe("trim_lineart_overshoots");
    expect(finishPlan.steps.map((s) => s.opcode)).toEqual(["trim_lineart_overshoots", "fill_white_specs"]);
    expect(brushPlan.steps[0]?.opcode).toBe("adjust_brush_radius");
  });

  it("17. 하이브리드(펜 버튼+음성) 컴파일은 동일 입력에 대해 항상 같은 결정론적 planId를 산출한다", () => {
    const input = {
      penButton: { button: "primary_side" as const, gesture: "double_click" as const, layerRole: "lineart" as const, activeCutNumber: 3 },
      voice: { utteranceKo: "3번 컷 대사 10% 키우고 흰 점 메워줘", activeCutNumber: 3 },
    };
    const planA = compileDynamicMacroPlan(input);
    const planB = compileDynamicMacroPlan(input);
    expect(planA.source).toBe("hybrid");
    expect(planA.steps).toHaveLength(3);
    expect(planA.planId).toBe(planB.planId);
  });

  it("18. 복합 매크로 실행 후 1회 Ctrl+Z(undo)로 전량 원복되고 1회 redo로 재적용된다", () => {
    const journal = new AtomicMacroRollbackJournal(createStudioMacroDocumentState([1, 2, 3], 3));
    const initialHash = journal.getCurrentStateHash();
    const plan = compileVoiceMacroPlan({ utteranceKo: "3번 컷 대사 10% 키우고 흰 점 메워줘", activeCutNumber: 3 });

    const exec = journal.executeMacroPlan(plan, { executedAtMs: 5_000 });
    expect(exec.ok).toBe(true);
    expect(exec.transaction?.stepDeltas).toHaveLength(2);
    expect(exec.state.cuts[3]?.dialogueScalePercent).toBe(110);
    expect(exec.state.cuts[3]?.whiteSpecCount).toBe(0);
    expect(journal.getUndoStack()).toHaveLength(1);

    const undo = journal.undoLastMacroTransaction();
    expect(undo.ok).toBe(true);
    expect(undo.affectedStepCount).toBe(2);
    expect(undo.restoredStateHash).toBe(initialHash);
    expect(undo.state.cuts[3]?.dialogueScalePercent).toBe(100);
    expect(undo.state.cuts[3]?.whiteSpecCount).toBe(14);

    const redo = journal.redoLastMacroTransaction();
    expect(redo.ok).toBe(true);
    expect(redo.state.cuts[3]?.dialogueScalePercent).toBe(110);
    expect(redo.state.cuts[3]?.whiteSpecCount).toBe(0);
  });

  it("19. 복합 매크로 2단계 실패 시 1단계 변경까지 자동 전량 롤백하고 Undo 스택을 오염시키지 않는다", () => {
    const journal = new AtomicMacroRollbackJournal(createStudioMacroDocumentState([1, 2, 3], 3));
    const initialHash = computeDocumentStateHash(journal.getCurrentState());
    const plan = compileVoiceMacroPlan({ utteranceKo: "3번 컷 대사 10% 키우고 흰 점 메워줘", activeCutNumber: 3 });

    const failed = journal.executeMacroPlan(plan, {
      executedAtMs: 6_200,
      stepExecutor: (state, step, stepIndex) => {
        if (stepIndex === 1) throw new Error("마스크 버퍼 잠금 충돌로 흰 점 채우기에 실패했습니다.");
        return applyDefaultDynamicMacroStep(state, step);
      },
    });

    expect(failed.ok).toBe(false);
    expect(failed.rolledBackAll).toBe(true);
    expect(failed.stateRestoredExactly).toBe(true);
    expect(failed.currentStateHash).toBe(initialHash);
    expect(failed.state.cuts[3]?.dialogueScalePercent).toBe(100);
    expect(failed.state.cuts[3]?.whiteSpecCount).toBe(14);
    expect(failed.transaction?.status).toBe("rolled_back");
    expect(failed.transaction?.stepDeltas.map((d) => d.status)).toEqual(["rolled_back", "failed"]);
    expect(journal.getUndoStack()).toHaveLength(0);
    expect(journal.getRollbackAuditLog()).toHaveLength(1);
  });

  it("20. 연속 복합 매크로 2건 실행 후 1클릭 Undo 2회로 초기 상태 해시에 정확히 복귀한다", () => {
    const journal = new AtomicMacroRollbackJournal(createStudioMacroDocumentState([1, 2, 3], 2));
    const initialHash = journal.getCurrentStateHash();

    const run1 = journal.executeMacroPlan(compileVoiceMacroPlan({ utteranceKo: "노을 역광 깔아줘", activeCutNumber: 2 }), { executedAtMs: 7_000 });
    const run2 = journal.executeMacroPlan(compilePenButtonMacroPlan({ button: "secondary_side", gesture: "double_click", layerRole: "flat", activeCutNumber: 2 }), { executedAtMs: 7_400 });
    expect(run1.ok).toBe(true);
    expect(run2.ok).toBe(true);
    expect(run2.state.cuts[2]?.atmospherePreset).toBe("sunset");
    expect(run2.state.cuts[2]?.lineartOvershootCount).toBe(0);
    expect(run2.state.cuts[2]?.whiteSpecCount).toBe(0);

    const undo2 = journal.undoLastMacroTransaction();
    expect(undo2.ok).toBe(true);
    expect(undo2.state.cuts[2]?.atmospherePreset).toBe("sunset");
    expect(undo2.state.cuts[2]?.lineartOvershootCount).toBe(9);

    const undo1 = journal.undoLastMacroTransaction();
    expect(undo1.ok).toBe(true);
    expect(undo1.restoredStateHash).toBe(initialHash);
    expect(undo1.state.cuts[2]?.atmospherePreset).toBe("none");
  });
});
