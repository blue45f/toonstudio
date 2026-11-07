// character-lab 포즈·관절·제어점 드래그 중 인터럽트(pointercancel, lostpointercapture, Escape, window.blur) 취소·롤백·연속 리그 전환 리포트 평가기 및 음성 대조군 스위트.

export const REQUIRED_ANCESTOR_COMMITS = Object.freeze([
  "f8a04aee",
  "06d95bc8",
  "39976d11",
  "eac1fb45",
  "698dffc4",
  "6a35c0ee",
]);

export const REQUIRED_CANCEL_SCENARIO_IDS = Object.freeze([
  "pointerCancelMidDrag",
  "lostPointerCaptureMidDrag",
  "escapeKeyMidDrag",
  "windowBlurMidDrag",
]);

function evaluateProvenance(provenance, failures) {
  if (!provenance || provenance.allRequiredAncestorsPresent !== true) {
    failures.push("provenance.allRequiredAncestorsPresent가 true가 아닙니다.");
  }
  if (Array.isArray(provenance?.ancestorCommits)) {
    const ancestorMap = new Map(
      provenance.ancestorCommits.map((entry) => [entry.commit, Boolean(entry.isAncestor ?? entry.present)]),
    );
    for (const commit of REQUIRED_ANCESTOR_COMMITS) {
      if (ancestorMap.get(commit) !== true) {
        failures.push(`필수 조상 커밋 누락 또는 미포함: ${commit}`);
      }
    }
  }
}

function evaluateCancelScenarios(cancelScenarios, failures) {
  if (!cancelScenarios || typeof cancelScenarios !== "object") {
    failures.push("report.cancelScenarios 객체가 누락되었습니다.");
    return { checkedCount: 0, passedCount: 0 };
  }
  let checkedCount = 0;
  let passedCount = 0;

  for (const scenarioId of REQUIRED_CANCEL_SCENARIO_IDS) {
    const scenario = cancelScenarios[scenarioId];
    if (!scenario || typeof scenario !== "object") {
      failures.push(`필수 드래그 중단 시나리오 누락: ${scenarioId}`);
      continue;
    }
    checkedCount += 1;
    const startFailures = failures.length;

    if (scenario.dragStarted !== true) {
      failures.push(
        `시나리오 ${scenarioId}: 드래그 시작 상태([data-dragging='true'] 또는 [data-gizmo-ring]) 미확인 (dragStarted=${String(scenario.dragStarted)})`,
      );
    }
    if (scenario.draggingClearedAfterCancel !== true) {
      failures.push(
        `시나리오 ${scenarioId}: 취소 직후 드래그 활성 표시([data-dragging='true'], [data-gizmo-ring])가 정리되지 않음 (draggingClearedAfterCancel=${String(scenario.draggingClearedAfterCancel)})`,
      );
    }
    if (scenario.historyDepthUnchanged !== true) {
      failures.push(
        `시나리오 ${scenarioId}: 취소된 드래그가 히스토리 깊이를 오염시킴 (historyDepthUnchanged=${String(scenario.historyDepthUnchanged)})`,
      );
    }
    if (scenario.uncommittedMutationReverted !== true) {
      failures.push(
        `시나리오 ${scenarioId}: 미확정 미리보기 변이가 시작 기준선으로 롤백되지 않음 (uncommittedMutationReverted=${String(scenario.uncommittedMutationReverted)})`,
      );
    }
    if (scenario.recoveryDragCommitted !== true) {
      failures.push(
        `시나리오 ${scenarioId}: 취소 직후 다음 정상 드래그 커밋 및 실행 취소 복구가 동작하지 않음 (recoveryDragCommitted=${String(scenario.recoveryDragCommitted)})`,
      );
    }
    if (scenario.pageErrorCount !== 0) {
      failures.push(
        `시나리오 ${scenarioId}: 실행 중 미처리 pageerror 발생 (pageErrorCount=${String(scenario.pageErrorCount)})`,
      );
    }

    if (failures.length === startFailures) {
      passedCount += 1;
    }
  }

  return { checkedCount, passedCount };
}

function evaluateModeCancelChecks(modeCancelChecks, failures) {
  if (!modeCancelChecks || typeof modeCancelChecks !== "object") {
    failures.push("report.modeCancelChecks 객체가 누락되었습니다.");
    return false;
  }
  const startLen = failures.length;

  const mode3 = modeCancelChecks.mode3BoneScaleCancel;
  if (
    !mode3 ||
    mode3.dragStarted !== true ||
    mode3.draggingClearedAfterCancel !== true ||
    mode3.historyDepthUnchanged !== true ||
    mode3.uncommittedMutationReverted === false ||
    mode3.mode2Restored === false ||
    mode3.pageErrorCount !== 0
  ) {
    failures.push(
      "modeCancelChecks.mode3BoneScaleCancel 검증 실패 (Mode 3 R 스케일 드래그 중 취소 시 히스토리 불변·드래그 상태 정리·미확정 변이 롤백·Mode 2 복원·pageErrorCount=0 필요).",
    );
  }

  const cp = modeCancelChecks.controlPointCancel;
  if (
    !cp ||
    cp.dragStarted !== true ||
    cp.draggingClearedAfterCancel !== true ||
    cp.historyDepthUnchanged !== true ||
    cp.uncommittedMutationReverted === false ||
    cp.pageErrorCount !== 0
  ) {
    failures.push(
      "modeCancelChecks.controlPointCancel 검증 실패 (형상 제어점 드래그 중 취소 시 히스토리 불변·[data-dragging='true'] 정리·미확정 변이 롤백·pageErrorCount=0 필요).",
    );
  }

  return failures.length === startLen;
}

function evaluateContinuousRigTransitions(continuousRigTransitions, failures) {
  if (!continuousRigTransitions || typeof continuousRigTransitions !== "object") {
    failures.push("report.continuousRigTransitions 객체가 누락되었습니다.");
    return false;
  }
  const startLen = failures.length;

  if (continuousRigTransitions.allTransitionsCompleted !== true) {
    failures.push("continuousRigTransitions.allTransitionsCompleted가 true가 아닙니다.");
  }
  if (continuousRigTransitions.leftoverDraggingElements !== 0) {
    failures.push(
      `continuousRigTransitions.leftoverDraggingElements가 0이 아닙니다 (${String(continuousRigTransitions.leftoverDraggingElements)}).`,
    );
  }
  if (continuousRigTransitions.corruptRigBlockedCleanly !== true) {
    failures.push("continuousRigTransitions.corruptRigBlockedCleanly가 true가 아닙니다.");
  }
  if (continuousRigTransitions.finalValidRigCancelAndCommitPassed !== true) {
    failures.push("continuousRigTransitions.finalValidRigCancelAndCommitPassed가 true가 아닙니다.");
  }
  if (continuousRigTransitions.pageErrorCount !== 0) {
    failures.push(
      `continuousRigTransitions.pageErrorCount가 0이 아닙니다 (${String(continuousRigTransitions.pageErrorCount)}).`,
    );
  }

  return failures.length === startLen;
}

/**
 * 포즈·관절·제어점 드래그 취소 및 연속 리그 전환 실브라우저 프로브 리포트를 검증한다.
 */
export function evaluatePoseCancelProbeReport(report) {
  const failures = [];
  if (!report || typeof report !== "object") {
    failures.push("리포트 객체가 비어 있거나 유효하지 않습니다.");
    return {
      ok: false,
      passed: false,
      exitCode: 1,
      failures,
      summary: {
        scenarioCheckedCount: 0,
        scenarioPassedCount: 0,
        modeCancelChecksOk: false,
        continuousRigTransitionsOk: false,
        pageErrorsZero: false,
        failureCount: failures.length,
      },
    };
  }

  evaluateProvenance(report.provenance, failures);
  const scenarioSummary = evaluateCancelScenarios(report.cancelScenarios, failures);
  const modeCancelChecksOk = evaluateModeCancelChecks(report.modeCancelChecks, failures);
  const continuousRigTransitionsOk = evaluateContinuousRigTransitions(report.continuousRigTransitions, failures);

  const pageErrorsZero = Array.isArray(report.pageErrors) && report.pageErrors.length === 0;
  if (!pageErrorsZero) {
    failures.push(
      `report.pageErrors가 빈 배열이 아닙니다 (count=${String(Array.isArray(report.pageErrors) ? report.pageErrors.length : "non-array")}).`,
    );
  }

  const ok = failures.length === 0;
  return {
    ok,
    passed: ok,
    exitCode: ok ? 0 : 1,
    failures,
    summary: {
      scenarioCheckedCount: scenarioSummary.checkedCount,
      scenarioPassedCount: scenarioSummary.passedCount,
      modeCancelChecksOk,
      continuousRigTransitionsOk,
      pageErrorsZero,
      failureCount: failures.length,
    },
  };
}

/**
 * 모든 게이트 조건을 만족하는 정본 통과 픽스처 리포트를 생성한다.
 */
export function createPassingPoseCancelFixture() {
  const cancelScenarios = {};
  for (const scenarioId of REQUIRED_CANCEL_SCENARIO_IDS) {
    cancelScenarios[scenarioId] = {
      id: scenarioId,
      bone: "leftLowerArm",
      dragStarted: true,
      previewMovedPx: 32.5,
      draggingClearedAfterCancel: true,
      historyDepthBefore: 0,
      historyDepthAfterCancel: 0,
      historyDepthUnchanged: true,
      revertDeltaPx: 0,
      uncommittedMutationReverted: true,
      historyDepthAfterRecoveryDrag: 1,
      historyDepthAfterRecoveryUndo: 0,
      recoveryDragCommitted: true,
      pageErrorCount: 0,
    };
  }

  return {
    schema: "character-lab-pose-cancel-probe/v1",
    generatedAt: "2026-11-07T00:00:00.000Z",
    provenance: {
      commitSha: "6a35c0ee00000000000000000000000000000000",
      shortCommit: "6a35c0ee",
      branch: "fix/character-lab-pose-drag-cancel-recovery",
      ancestorCommits: REQUIRED_ANCESTOR_COMMITS.map((commit) => ({ commit, present: true, isAncestor: true })),
      allRequiredAncestorsPresent: true,
      dirtyFiles: [],
    },
    unverifiedBoundaries: {
      physicalMultiTouchHardware: false,
      safariWebKitBrowser: false,
      hardwareAcceleratedPhysicalGpu: false,
      statementKo:
        "물리 멀티터치 하드웨어, Safari/WebKit 브라우저, 하드웨어 가속 물리 GPU(Metal/Vulkan/DX12)는 이 컨테이너 SwiftShader Chromium 실행에서 검증되지 않았습니다.",
    },
    cancelScenarios,
    modeCancelChecks: {
      mode3BoneScaleCancel: {
        mode: 3,
        bone: "spine",
        dragStarted: true,
        draggingClearedAfterCancel: true,
        historyDepthBefore: 0,
        historyDepthAfterCancel: 0,
        historyDepthUnchanged: true,
        uncommittedMutationReverted: true,
        mode2Restored: true,
        pageErrorCount: 0,
      },
      controlPointCancel: {
        controlPointId: "cp-face-jaw",
        dragStarted: true,
        draggingClearedAfterCancel: true,
        historyDepthBefore: 0,
        historyDepthAfterCancel: 0,
        historyDepthUnchanged: true,
        uncommittedMutationReverted: true,
        pageErrorCount: 0,
      },
    },
    continuousRigTransitions: {
      sequence: [
        "procedural",
        "valid-humanoid-rig",
        "normal-empty-rig",
        "corrupt-cycle-rig",
        "corrupt-nan-rest-rig",
        "valid-humanoid-rig",
      ],
      allTransitionsCompleted: true,
      leftoverDraggingElements: 0,
      corruptRigBlockedCleanly: true,
      finalValidRigCancelAndCommitPassed: true,
      pageErrorCount: 0,
    },
    pageErrors: [],
  };
}

/**
 * 정본 통과 픽스처와 6종의 단일 관심사 변이(음성 대조군)를 평가해 모두 거부(ok === false)되는지 검증한다.
 */
export function runPoseCancelNegativeControlSuite() {
  const passing = createPassingPoseCancelFixture();
  const baselineEvaluation = evaluatePoseCancelProbeReport(passing);
  const baselinePassed = baselineEvaluation.ok === true && baselineEvaluation.failures.length === 0;

  const clone = (obj) => JSON.parse(JSON.stringify(obj));

  const mutations = [
    {
      id: "mutate-pointercancel-pollutes-history",
      descriptionKo: "pointercancel 중단 시 히스토리 깊이가 오염될 때(historyDepthUnchanged=false) 거부",
      mutate: (r) => {
        r.cancelScenarios.pointerCancelMidDrag.historyDepthUnchanged = false;
      },
    },
    {
      id: "mutate-lostpointercapture-leaves-dragging-state",
      descriptionKo: "lostpointercapture 발생 후 드래그 상태 표시가 남을 때(draggingClearedAfterCancel=false) 거부",
      mutate: (r) => {
        r.cancelScenarios.lostPointerCaptureMidDrag.draggingClearedAfterCancel = false;
      },
    },
    {
      id: "mutate-escape-keeps-uncommitted-mutation",
      descriptionKo: "Escape 키 취소 후 미확정 미리보기 변이가 롤백되지 않을 때(uncommittedMutationReverted=false) 거부",
      mutate: (r) => {
        r.cancelScenarios.escapeKeyMidDrag.uncommittedMutationReverted = false;
      },
    },
    {
      id: "mutate-window-blur-breaks-next-drag-recovery",
      descriptionKo: "window.blur 취소 후 다음 정상 드래그 커밋·복구가 실패할 때(recoveryDragCommitted=false) 거부",
      mutate: (r) => {
        r.cancelScenarios.windowBlurMidDrag.recoveryDragCommitted = false;
      },
    },
    {
      id: "mutate-mode3-scale-cancel-mutates-store",
      descriptionKo: "Mode 3(R 스케일) 드래그 취소 시 스토어·히스토리가 변이될 때(historyDepthUnchanged=false) 거부",
      mutate: (r) => {
        r.modeCancelChecks.mode3BoneScaleCancel.historyDepthUnchanged = false;
      },
    },
    {
      id: "mutate-continuous-rig-transition-fails",
      descriptionKo: "연속 리그 전환 후 최종 정상 리그 취소·커밋 검증이 실패할 때(finalValidRigCancelAndCommitPassed=false) 거부",
      mutate: (r) => {
        r.continuousRigTransitions.finalValidRigCancelAndCommitPassed = false;
      },
    },
  ];

  const cases = mutations.map((m) => {
    const mutated = clone(passing);
    m.mutate(mutated);
    const evaluation = evaluatePoseCancelProbeReport(mutated);
    const rejected = evaluation.ok === false && evaluation.failures.length > 0;
    return {
      id: m.id,
      descriptionKo: m.descriptionKo,
      rejected,
      observedOk: evaluation.ok,
      failures: evaluation.failures,
    };
  });

  const allRejected = baselinePassed && cases.every((c) => c.rejected);
  return {
    ok: allRejected,
    allRejected,
    baselinePassed,
    exitCode: allRejected ? 1 : 0,
    cases,
  };
}
