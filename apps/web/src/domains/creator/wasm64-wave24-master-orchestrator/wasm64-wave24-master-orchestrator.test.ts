import { describe, expect, it } from "vitest";

import {
  CARDINAL_FLICK_DIRECTIONS,
  computeFittsIndexOfDifficulty,
  computeLaplaceSmoothedProbability,
  createDefaultWasm64StageCapabilityLoaders,
  enforceMinimumHitTargetRect,
  estimateFittsMovementTimeMs,
  MarkovIntentPrefetchOrchestrator,
  MAX_PREFETCH_IDLE_BUDGET_MS,
  MIN_HIT_TARGET_PX,
  MIN_SAFE_RADIAL_RING_RADIUS_PX,
  normalizeShortcutChord,
  optimizeFittsRadialMenuAndChords,
  RADIAL_COMPASS_DIRECTIONS,
  rectsOverlap,
  STUDIO_STAGE_LABELS_KO,
  STUDIO_WORKFLOW_STAGES,
  type StudioCommandProfile,
  type StudioWorkflowStage,
  type Wasm64CapabilityLoaderSpec,
} from "./index";

function createMockStageLoaders(
  onLoad: (stage: StudioWorkflowStage, capabilityId: string) => void,
  estimatedDispatchMs: number = 0.6,
): readonly Wasm64CapabilityLoaderSpec[] {
  return STUDIO_WORKFLOW_STAGES.map((stage) => ({
    capabilityId: `wasm64-mock-${stage}`,
    stage,
    labelKo: `${STUDIO_STAGE_LABELS_KO[stage]} 테스트 로더`,
    estimatedDispatchMs,
    estimatedBytes: 32_768,
    load: async () => {
      onLoad(stage, `wasm64-mock-${stage}`);
      return { ready: true, stage };
    },
  }));
}

describe("MarkovIntentPrefetchOrchestrator (1·2차 마르코프 도구 전이 투기적 프리페처)", () => {
  it("초기 무관측 상태에서 8개 공정에 대해 정확한 라플라스 균등 분포(1/8)와 총합 1.0을 보장한다", () => {
    expect(STUDIO_WORKFLOW_STAGES).toHaveLength(8);
    expect(computeLaplaceSmoothedProbability(0, 0, 1.0, 8)).toBeCloseTo(0.125, 10);
    expect(computeLaplaceSmoothedProbability(4, 8, 1.0, 8)).toBeCloseTo(5 / 16, 10);

    const invoked: string[] = [];
    const orchestrator = new MarkovIntentPrefetchOrchestrator({
      loaders: createMockStageLoaders((_, id) => invoked.push(id)),
      laplaceAlpha: 1.0,
      threshold: 0.2,
    });

    const dist = orchestrator.predictNextStages("sketch", null);
    expect(dist).toHaveLength(8);
    const totalProb = dist.reduce((acc, item) => acc + item.probability, 0);
    expect(totalProb).toBeCloseTo(1.0, 9);
    for (const item of dist) {
      expect(item.probability).toBeCloseTo(0.125, 9);
    }

    // 균등 확률(0.125)은 임계값(0.2) 미만이므로 투기적 로드를 호출하지 않는다.
    const report = orchestrator.prefetchSpeculativeCapabilities({}, { currentStage: "sketch" });
    expect(report.skipReason).toBe("no-stage-above-threshold");
    expect(report.dispatchedCapabilityIds).toHaveLength(0);
    expect(invoked).toHaveLength(0);
    expect(report.serverCostKrw).toBe(0);
  });

  it("2차 마르코프 문맥 P(next | prev, current)을 학습해 동일한 현재 공정에서도 직전 공정에 따라 다른 모듈을 예열한다", async () => {
    const invoked: string[] = [];
    const orchestrator = new MarkovIntentPrefetchOrchestrator({
      loaders: createMockStageLoaders((_, id) => invoked.push(id), 0.4),
      laplaceAlpha: 0.5,
      orderStrategy: "second-order",
      threshold: 0.25,
      topK: 1,
    });

    // 문맥 A: 3d-stage -> sketch 직후에는 항상 ink로 진입 (6회)
    for (let i = 0; i < 6; i += 1) {
      orchestrator.recordTransition("sketch", "ink", "3d-stage");
    }
    // 문맥 B: flat-color -> sketch(부분 수정) 직후에는 항상 shade로 진입 (6회)
    for (let i = 0; i < 6; i += 1) {
      orchestrator.recordTransition("sketch", "shade", "flat-color");
    }

    const predAfter3d = orchestrator.predictNextStages("sketch", "3d-stage");
    expect(predAfter3d[0]?.nextStage).toBe("ink");
    // P2(ink | 3d-stage, sketch) = (6 + 0.5) / (6 + 8 * 0.5) = 6.5 / 10 = 0.65
    expect(predAfter3d[0]?.pSecondOrder).toBeCloseTo(0.65, 9);
    expect(predAfter3d.reduce((sum, p) => sum + p.probability, 0)).toBeCloseTo(1.0, 9);

    const predAfterFlat = orchestrator.predictNextStages("sketch", "flat-color");
    expect(predAfterFlat[0]?.nextStage).toBe("shade");
    expect(predAfterFlat[0]?.pSecondOrder).toBeCloseTo(0.65, 9);

    const dispatchA = orchestrator.prefetchSpeculativeCapabilities(
      { idleBudgetMs: 2.0 },
      { prevStage: "3d-stage", currentStage: "sketch" },
    );
    expect(dispatchA.dispatchedCapabilityIds).toEqual(["wasm64-mock-ink"]);
    await orchestrator.awaitInFlightPrefetches();
    expect(orchestrator.isCapabilityWarm("wasm64-mock-ink")).toBe(true);

    // 동일 문맥 재요청 시 이미 예열된 모듈은 중복 호출하지 않는다.
    const repeatDispatchA = orchestrator.prefetchSpeculativeCapabilities(
      { idleBudgetMs: 2.0 },
      { prevStage: "3d-stage", currentStage: "sketch" },
    );
    expect(repeatDispatchA.dispatchedCapabilityIds).toHaveLength(0);
    expect(repeatDispatchA.alreadyWarmCapabilityIds).toEqual(["wasm64-mock-ink"]);

    const dispatchB = orchestrator.prefetchSpeculativeCapabilities(
      { idleBudgetMs: 2.0 },
      { prevStage: "flat-color", currentStage: "sketch" },
    );
    expect(dispatchB.dispatchedCapabilityIds).toEqual(["wasm64-mock-shade"]);
    await orchestrator.awaitInFlightPrefetches();
    expect(invoked).toEqual(["wasm64-mock-ink", "wasm64-mock-shade"]);
  });

  it("미관측 2차 문맥에서는 적응형 백오프(adaptive)로 학습된 1차 분포를 활용하고 시퀀스 관찰을 지원한다", () => {
    const orchestrator = new MarkovIntentPrefetchOrchestrator({
      orderStrategy: "adaptive",
      backoffPriorWeight: 2.0,
      laplaceAlpha: 1.0,
    });

    // sketch -> ink -> flat-color -> lettering 흐름 반복 관찰
    for (let i = 0; i < 5; i += 1) {
      orchestrator.observeStageEnter("sketch");
      orchestrator.observeStageEnter("ink");
      orchestrator.observeStageEnter("flat-color");
      orchestrator.observeStageEnter("lettering");
    }

    // 한 번도 본 적 없는 (audio-motion, ink) 2차 문맥이라도 1차(ink -> flat-color) 지식을 백오프로 계승
    const unseenBigramPreds = orchestrator.predictNextStages("ink", "audio-motion");
    expect(unseenBigramPreds[0]?.nextStage).toBe("flat-color");
    expect(unseenBigramPreds[0]?.blendLambda).toBe(0);
    expect(unseenBigramPreds[0]?.probability).toBeGreaterThan(0.42);
  });

  it("유휴 프레임 예산 상한(<= 2ms)을 초과하는 후순위 로더는 즉시 다음 유휴 구간으로 이연(defer)한다", () => {
    let fakeClockMs = 100.0;
    const loadedIds: string[] = [];

    const customLoaders: readonly Wasm64CapabilityLoaderSpec[] = STUDIO_WORKFLOW_STAGES.map((stage) => ({
      capabilityId: `wasm64-budget-${stage}`,
      stage,
      labelKo: `${STUDIO_STAGE_LABELS_KO[stage]} 예산 검증 로더`,
      estimatedDispatchMs: 1.25,
      estimatedBytes: 48_000,
      load: async () => {
        loadedIds.push(`wasm64-budget-${stage}`);
        return stage;
      },
    }));

    const orchestrator = new MarkovIntentPrefetchOrchestrator({
      loaders: customLoaders,
      threshold: 0.2,
      topK: 3,
      laplaceAlpha: 0.5,
      nowMs: () => {
        const current = fakeClockMs;
        // 디스패치 루프 시간 경과 시뮬레이션 (첫 로더 기동 뒤 1.1ms 경과)
        fakeClockMs += 0.35;
        return current;
      },
    });

    for (let i = 0; i < 5; i += 1) {
      orchestrator.recordTransition("ink", "flat-color");
      orchestrator.recordTransition("ink", "shade");
    }

    // 호출자가 8.0ms를 요청하더라도 하드 캡(2.0ms)으로 강제 클램프된다.
    const report = orchestrator.prefetchSpeculativeCapabilities(
      { idleBudgetMs: 8.0, thermalState: "nominal" },
      { currentStage: "ink" },
    );

    expect(report.effectiveBudgetMs).toBe(MAX_PREFETCH_IDLE_BUDGET_MS);
    expect(report.candidateStages).toEqual(["flat-color", "shade"]);
    // 첫 모듈 기동(0.35 + 1.25 <= 2.0)은 허용되나 두 번째 모듈은 잔여 예산 부족으로 이연된다.
    expect(report.dispatchedCapabilityIds).toEqual(["wasm64-budget-flat-color"]);
    expect(report.deferredCapabilityIds).toEqual(["wasm64-budget-shade"]);
    expect(report.withinIdleBudget).toBe(true);
    expect(orchestrator.getTelemetrySnapshot().budgetDeferredCount).toBe(1);
  });

  it("saveData·저속 네트워크·발열 상태(fair/serious/critical)에 맞춰 프리페치를 차단하거나 축소한다", () => {
    const dispatched: string[] = [];
    const orchestrator = new MarkovIntentPrefetchOrchestrator({
      loaders: createMockStageLoaders((_, id) => dispatched.push(id), 0.4),
      threshold: 0.2,
      topK: 2,
      laplaceAlpha: 0.5,
    });

    for (let i = 0; i < 6; i += 1) {
      orchestrator.recordTransition("shade", "lettering");
      orchestrator.recordTransition("shade", "publish-qa");
    }

    const saveDataReport = orchestrator.prefetchSpeculativeCapabilities(
      { saveData: true },
      { currentStage: "shade" },
    );
    expect(saveDataReport.skipReason).toBe("save-data-enabled");
    expect(saveDataReport.dispatchedCapabilityIds).toHaveLength(0);

    const slowNetReport = orchestrator.prefetchSpeculativeCapabilities(
      { effectiveConnectionType: "2g" },
      { currentStage: "shade" },
    );
    expect(slowNetReport.skipReason).toBe("constrained-network");
    expect(slowNetReport.dispatchedCapabilityIds).toHaveLength(0);

    const criticalThermalReport = orchestrator.prefetchSpeculativeCapabilities(
      { thermalState: "critical" },
      { currentStage: "shade" },
    );
    expect(criticalThermalReport.skipReason).toBe("thermal-throttled");
    expect(criticalThermalReport.dispatchedCapabilityIds).toHaveLength(0);

    // fair 발열 단계에서는 예산을 1.0ms 이하, topK를 1개로 축소하여 발열 악화를 막는다.
    const fairThermalReport = orchestrator.prefetchSpeculativeCapabilities(
      { thermalState: "fair", idleBudgetMs: 2.0 },
      { currentStage: "shade" },
    );
    expect(fairThermalReport.effectiveBudgetMs).toBe(1.0);
    expect(fairThermalReport.effectiveTopK).toBe(1);
    expect(fairThermalReport.dispatchedCapabilityIds).toHaveLength(1);
  });

  it("기본 지연 wasm64-* 로더 사양은 생성 시점에 0회 실행되며 모든 8개 공정을 포괄한다", () => {
    const defaultSpecs = createDefaultWasm64StageCapabilityLoaders();
    expect(defaultSpecs).toHaveLength(8);
    const coveredStages = new Set(defaultSpecs.map((s) => s.stage));
    expect(coveredStages.size).toBe(8);
    for (const spec of defaultSpecs) {
      expect(spec.capabilityId.startsWith("wasm64-")).toBe(true);
      expect(typeof spec.load).toBe("function");
      expect(spec.estimatedDispatchMs).toBeLessThanOrEqual(MAX_PREFETCH_IDLE_BUDGET_MS);
    }

    const seededOrchestrator = new MarkovIntentPrefetchOrchestrator({
      seedStudioWorkflowPriors: true,
      loaders: createMockStageLoaders(() => undefined, 0.3),
    });
    expect(seededOrchestrator.getTelemetrySnapshot().totalObservedTransitions).toBe(
      8,
    );
  });
});

describe("Fitts-Law Radial Pie-Menu & Chorded Shortcut Optimizer (피츠 법칙 방사형 메뉴·한 손 단축키)", () => {
  it("피츠의 법칙 섀넌 공식 ID = log2(1 + D / W) 및 이동 시간을 정확히 계산한다", () => {
    expect(computeFittsIndexOfDifficulty(0, 44)).toBe(0);
    expect(computeFittsIndexOfDifficulty(44, 44)).toBeCloseTo(1.0, 10);
    expect(computeFittsIndexOfDifficulty(132, 44)).toBeCloseTo(2.0, 10);
    expect(computeFittsIndexOfDifficulty(308, 44)).toBeCloseTo(3.0, 10);
    expect(estimateFittsMovementTimeMs(132, 44, 50, 100)).toBeCloseTo(250, 10);

    const expanded = enforceMinimumHitTargetRect({ x: 100, y: 200, width: 24, height: 28 });
    expect(expanded.wasExpanded).toBe(true);
    expect(expanded.rect.width).toBe(MIN_HIT_TARGET_PX);
    expect(expanded.rect.height).toBe(MIN_HIT_TARGET_PX);
    // 중심점 (112, 214) 불변 확인
    expect(expanded.rect.x + expanded.rect.width * 0.5).toBeCloseTo(112, 9);
    expect(expanded.rect.y + expanded.rect.height * 0.5).toBeCloseTo(214, 9);
  });

  it("빈도와 쌍 전이가 가장 높은 핵심 명령 쌍을 N/E/S/W 주축 직선 플릭 슬롯에 배치하고 비트 비용을 절감한다", () => {
    const commands: readonly StudioCommandProfile[] = [
      { commandId: "pen", labelKo: "G펜 선화", frequency: 420, screenTarget: { x: 40, y: 120, width: 36, height: 36 } },
      { commandId: "eraser", labelKo: "지우개", frequency: 390, screenTarget: { x: 40, y: 920, width: 36, height: 36 } },
      { commandId: "bucket", labelKo: "자동 채움", frequency: 280, screenTarget: { x: 40, y: 540, width: 36, height: 36 } },
      { commandId: "eyedropper", labelKo: "스포이드", frequency: 260, screenTarget: { x: 1860, y: 540, width: 36, height: 36 }, isHoldModifierTool: true },
      { commandId: "lasso", labelKo: "올가미 선택", frequency: 75, screenTarget: { x: 60, y: 260, width: 44, height: 44 } },
      { commandId: "symmetry", labelKo: "대칭 자", frequency: 55, screenTarget: { x: 1820, y: 160, width: 44, height: 44 } },
      { commandId: "balloon", labelKo: "말풍선 펜", frequency: 45, screenTarget: { x: 1820, y: 880, width: 44, height: 44 } },
      { commandId: "pose3d", labelKo: "3D 인체 배치", frequency: 30, screenTarget: { x: 60, y: 880, width: 44, height: 44 } },
    ];

    const result = optimizeFittsRadialMenuAndChords({
      commands,
      pairwiseTransitions: [
        { fromCommandId: "pen", toCommandId: "eraser", count: 310 },
        { fromCommandId: "eraser", toCommandId: "pen", count: 295 },
        { fromCommandId: "bucket", toCommandId: "eyedropper", count: 210 },
        { fromCommandId: "eyedropper", toCommandId: "bucket", count: 195 },
      ],
      menuOrigin: { x: 960, y: 540 },
      requestedRingRadiusPx: 96,
    });

    expect(result.sliceAssignments).toHaveLength(8);
    expect(RADIAL_COMPASS_DIRECTIONS).toHaveLength(8);

    const slotByCommand = new Map(
      result.sliceAssignments
        .filter((s) => s.commandId !== null)
        .map((s) => [s.commandId as string, s] as const),
    );

    const penSlot = slotByCommand.get("pen");
    const eraserSlot = slotByCommand.get("eraser");
    const bucketSlot = slotByCommand.get("bucket");
    const eyedropperSlot = slotByCommand.get("eyedropper");

    expect(penSlot?.isCardinal).toBe(true);
    expect(eraserSlot?.isCardinal).toBe(true);
    expect(bucketSlot?.isCardinal).toBe(true);
    expect(eyedropperSlot?.isCardinal).toBe(true);
    expect(CARDINAL_FLICK_DIRECTIONS).toContain(penSlot?.direction);
    expect(CARDINAL_FLICK_DIRECTIONS).toContain(eraserSlot?.direction);

    // 핵심 왕복 쌍(pen<->eraser, bucket<->eyedropper)이 각각 180도 정반대 주축(4칸 차이)에 배치되었는지 검증
    const penEraserStep = Math.abs((penSlot?.slotIndex ?? 0) - (eraserSlot?.slotIndex ?? 0));
    const bucketEyedropperStep = Math.abs((bucketSlot?.slotIndex ?? 0) - (eyedropperSlot?.slotIndex ?? 0));
    expect(penEraserStep).toBe(4);
    expect(bucketEyedropperStep).toBe(4);

    // 화면 외곽 툴바 대비 피츠 난이도(비트)가 현저히 절감된다.
    expect(result.optimizedRadialWeightedIdBits).toBeLessThan(result.baselineWeightedIdBits);
    expect(result.averageBitsSavedPerInvoke).toBeGreaterThan(2.0);
    expect(result.subMinimumInputTargetCount).toBe(4);
    expect(result.serverCostKrw).toBe(0);
  });

  it("작은 반지름 요청 시에도 >= 44x44px 히트박스 불변 조건과 8슬롯 무중첩 기하를 강제한다", () => {
    const commands: readonly StudioCommandProfile[] = [
      { commandId: "cmd-1", labelKo: "명령 1", frequency: 100, screenTarget: { x: 10, y: 10, width: 20, height: 20 } },
      { commandId: "cmd-2", labelKo: "명령 2", frequency: 90, screenTarget: { x: 10, y: 50, width: 32, height: 32 } },
      { commandId: "cmd-3", labelKo: "명령 3", frequency: 80, screenTarget: { x: 10, y: 90, width: 44, height: 44 } },
    ];

    const result = optimizeFittsRadialMenuAndChords({
      commands,
      requestedRingRadiusPx: 28, // 너무 작은 반지름 입력
    });

    expect(result.radiusClampedForHitTargetInvariant).toBe(true);
    expect(result.effectiveRingRadiusPx).toBeGreaterThanOrEqual(MIN_SAFE_RADIAL_RING_RADIUS_PX);
    expect(result.allHitTargetsMeetMinimum44Px).toBe(true);

    for (const slice of result.sliceAssignments) {
      expect(slice.hitBox.width).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
      expect(slice.hitBox.height).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
    }

    for (let i = 0; i < result.sliceAssignments.length; i += 1) {
      const a = result.sliceAssignments[i]?.hitBox;
      expect(a).toBeDefined();
      for (let j = i + 1; j < result.sliceAssignments.length; j += 1) {
        const b = result.sliceAssignments[j]?.hitBox;
        expect(b).toBeDefined();
        if (a && b) {
          expect(rectsOverlap(a, b)).toBe(false);
        }
      }
    }

    for (const pad of result.modifierTouchPads) {
      expect(pad.hitBox.width).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
      expect(pad.hitBox.height).toBeGreaterThanOrEqual(MIN_HIT_TARGET_PX);
    }
  });

  it("예약 단축키·반대 손 뻗침·중복·길게 누르기 간섭을 모두 탐지하고 무충돌 한 손 코드로 재배정한다", () => {
    expect(normalizeShortcutChord(" shift + ctrl + w ").normalized).toBe("Ctrl+Shift+W");

    const commands: readonly StudioCommandProfile[] = [
      {
        commandId: "hold-eyedropper",
        labelKo: "임시 스포이드",
        frequency: 300,
        screenTarget: { x: 20, y: 100, width: 44, height: 44 },
        preferredChord: "s",
        isHoldModifierTool: true,
      },
      {
        commandId: "dup-eraser",
        labelKo: "지우개 전환",
        frequency: 250,
        screenTarget: { x: 20, y: 160, width: 44, height: 44 },
        preferredChord: "S", // hold-eyedropper와 중복 충돌
      },
      {
        commandId: "reserved-close",
        labelKo: "캔버스 초기화",
        frequency: 200,
        screenTarget: { x: 20, y: 220, width: 44, height: 44 },
        preferredChord: "Ctrl+W", // 브라우저 탭 닫기 예약 키 충돌
      },
      {
        commandId: "far-right-key",
        labelKo: "레이어 잠금",
        frequency: 160,
        screenTarget: { x: 20, y: 280, width: 44, height: 44 },
        preferredChord: "Shift+P", // 왼손 프로필에서 오른손 영역 침범
      },
      {
        commandId: "chord-shadow",
        labelKo: "빠른 좌우 반전",
        frequency: 140,
        screenTarget: { x: 20, y: 340, width: 44, height: 44 },
        preferredChord: "A+S", // 길게 누르는 S 키와 동시 입력 화음 간섭
      },
      {
        commandId: "clean-valid",
        labelKo: "브러시 크기 확대",
        frequency: 120,
        screenTarget: { x: 20, y: 400, width: 44, height: 44 },
        preferredChord: "Shift+D",
      },
    ];

    const leftHandResult = optimizeFittsRadialMenuAndChords({
      commands,
      handPreference: "left-hand",
    });

    const conflictKinds = leftHandResult.detectedChordConflicts.map((c) => c.kind);
    expect(conflictKinds).toContain("duplicate-binding");
    expect(conflictKinds).toContain("os-browser-reserved");
    expect(conflictKinds).toContain("cross-hand-stretch");
    expect(conflictKinds).toContain("hold-prefix-shadow");

    const assignedSet = new Set(leftHandResult.chordBindings.map((b) => b.assignedChord));
    expect(assignedSet.size).toBe(commands.length);
    expect(assignedSet.has("Ctrl+W")).toBe(false);
    expect(assignedSet.has("Shift+P")).toBe(false);

    const holdAssigned = leftHandResult.chordBindings.find((b) => b.commandId === "hold-eyedropper");
    const validAssigned = leftHandResult.chordBindings.find((b) => b.commandId === "clean-valid");
    expect(holdAssigned?.assignedChord).toBe("S");
    expect(holdAssigned?.preservedPreferred).toBe(true);
    expect(validAssigned?.assignedChord).toBe("Shift+D");
    expect(validAssigned?.preservedPreferred).toBe(true);

    // 왼손잡이 작가용 오른손 단축키 프로필(right-hand)도 충돌 0건으로 성립하는지 검증
    const rightHandResult = optimizeFittsRadialMenuAndChords({
      commands,
      handPreference: "right-hand",
    });
    const rightAssignedSet = new Set(rightHandResult.chordBindings.map((b) => b.assignedChord));
    expect(rightAssignedSet.size).toBe(commands.length);
    for (const binding of rightHandResult.chordBindings) {
      expect(binding.singleHandCompliant).toBe(true);
    }
  });

  it("8개를 초과하는 명령 목록에서 상위 8개만 방사형 슬롯에 싣고 나머지에도 무충돌 단축키를 부여한다", () => {
    const tenCommands: readonly StudioCommandProfile[] = Array.from({ length: 10 }, (_, idx) => ({
      commandId: `tool-${String(idx + 1).padStart(2, "0")}`,
      labelKo: `도구 ${idx + 1}`,
      frequency: (10 - idx) * 25,
      screenTarget: { x: 30, y: 80 + idx * 52, width: 44, height: 44 },
    }));

    const result = optimizeFittsRadialMenuAndChords({ commands: tenCommands });
    expect(result.sliceAssignments.filter((s) => s.commandId !== null)).toHaveLength(8);
    expect(result.overflowCommandIds).toEqual(["tool-09", "tool-10"]);
    expect(result.chordBindings).toHaveLength(10);
    expect(new Set(result.chordBindings.map((b) => b.assignedChord)).size).toBe(10);
    expect(result.allHitTargetsMeetMinimum44Px).toBe(true);
  });

  it("지수 감쇠(decayFactor) 적응과 로더 일시 실패 후 재시도 복구를 무결하게 처리한다", async () => {
    let failFirstAttempt = true;
    const loaders: readonly Wasm64CapabilityLoaderSpec[] = [
      {
        capabilityId: "wasm64-flaky-publish",
        stage: "publish-qa",
        labelKo: "출고 검수 복구 테스트 로더",
        estimatedDispatchMs: 0.4,
        estimatedBytes: 24_000,
        load: async () => {
          if (failFirstAttempt) {
            failFirstAttempt = false;
            throw new Error("일시적 청크 지연");
          }
          return { ok: true };
        },
      },
    ];

    const orchestrator = new MarkovIntentPrefetchOrchestrator({
      loaders,
      decayFactor: 0.6,
      threshold: 0.25,
      topK: 1,
    });

    for (let i = 0; i < 4; i += 1) {
      orchestrator.recordTransition("lettering", "audio-motion");
    }
    // 최근 작업 흐름이 publish-qa로 전환됨에 따라 감쇠 후 publish-qa가 1순위로 역전
    for (let i = 0; i < 6; i += 1) {
      orchestrator.recordTransition("lettering", "publish-qa");
    }

    const firstTry = orchestrator.prefetchSpeculativeCapabilities({}, { currentStage: "lettering" });
    expect(firstTry.dispatchedCapabilityIds).toEqual(["wasm64-flaky-publish"]);
    await orchestrator.awaitInFlightPrefetches();
    expect(orchestrator.getTelemetrySnapshot().failedCapabilityIds).toEqual(["wasm64-flaky-publish"]);
    expect(orchestrator.isCapabilityWarm("wasm64-flaky-publish")).toBe(false);

    // 다음 유휴 구간에서 자동 재시도하여 정상 예열 상태로 전환
    const secondTry = orchestrator.prefetchSpeculativeCapabilities({}, { currentStage: "lettering" });
    expect(secondTry.dispatchedCapabilityIds).toEqual(["wasm64-flaky-publish"]);
    await orchestrator.awaitInFlightPrefetches();
    expect(orchestrator.isCapabilityWarm("wasm64-flaky-publish")).toBe(true);
    expect(orchestrator.getTelemetrySnapshot().failedCapabilityIds).toHaveLength(0);
  });
});
