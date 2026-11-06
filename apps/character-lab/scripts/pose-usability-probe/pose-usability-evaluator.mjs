// character-lab 포즈 모바일·태블릿 사용성(반응형·44px 터치 타겟·접이식 진단·손상 리그 조작 차단 및 즉시 복구) 리포트 평가기 및 음성 대조군 스위트.

export const REQUIRED_VIEWPORT_IDS = Object.freeze(["320px", "390px", "768px", "1440px", "200pct-zoom"]);

export const REQUIRED_ANCESTOR_COMMITS = Object.freeze(["f8a04aee", "06d95bc8", "39976d11", "eac1fb45", "698dffc4"]);

function evaluateProvenance(provenance, failures) {
  if (!provenance || provenance.allRequiredAncestorsPresent !== true) {
    failures.push("provenance.allRequiredAncestorsPresent가 true가 아닙니다.");
  }
  if (Array.isArray(provenance?.ancestorCommits)) {
    const ancestorMap = new Map(provenance.ancestorCommits.map((entry) => [entry.commit, Boolean(entry.isAncestor ?? entry.present)]));
    for (const commit of REQUIRED_ANCESTOR_COMMITS) {
      if (ancestorMap.get(commit) !== true) {
        failures.push(`필수 조상 커밋 누락 또는 미포함: ${commit}`);
      }
    }
  }
}

function evaluateViewports(viewports, failures) {
  if (!viewports || typeof viewports !== "object") {
    failures.push("report.viewports 객체가 누락되었습니다.");
    return { checkedCount: 0, overflowFreeCount: 0, touchTargetPassCount: 0, screenshotPairCount: 0 };
  }
  let checkedCount = 0;
  let overflowFreeCount = 0;
  let touchTargetPassCount = 0;
  let screenshotPairCount = 0;

  for (const vpId of REQUIRED_VIEWPORT_IDS) {
    const vp = viewports[vpId];
    if (!vp || typeof vp !== "object") {
      failures.push(`필수 뷰포트 측정 결과 누락: ${vpId}`);
      continue;
    }
    checkedCount += 1;
    const docOverflowOk = vp.horizontalOverflowPx === 0;
    const panelOverflowOk = vp.posePanelOverflowPx === 0;
    if (!docOverflowOk) {
      failures.push(`뷰포트 ${vpId}: 문서 가로 오버플로 발생 (horizontalOverflowPx=${String(vp.horizontalOverflowPx)})`);
    }
    if (!panelOverflowOk) {
      failures.push(`뷰포트 ${vpId}: PosePanel 가로 오버플로 발생 (posePanelOverflowPx=${String(vp.posePanelOverflowPx)})`);
    }
    if (docOverflowOk && panelOverflowOk) overflowFreeCount += 1;

    const under44Ok = vp.under44Count === 0;
    const totalOk = typeof vp.totalInteractiveChecked === "number" && vp.totalInteractiveChecked >= 20;
    if (!under44Ok) {
      failures.push(`뷰포트 ${vpId}: 44x44 CSS px 미만 인터랙티브 요소 존재 (under44Count=${String(vp.under44Count)})`);
    }
    if (!totalOk) {
      failures.push(`뷰포트 ${vpId}: 검사된 인터랙티브 요소 수 부족 (totalInteractiveChecked=${String(vp.totalInteractiveChecked)}, 최소 20)`);
    }
    if (under44Ok && totalOk) touchTargetPassCount += 1;

    const afterOk = Boolean(vp.afterScreenshot) && vp.afterScreenshotExists === true;
    const beforeOk = Boolean(vp.beforeScreenshot) && vp.beforeScreenshotExists === true;
    if (!afterOk) {
      failures.push(`뷰포트 ${vpId}: after 스크린샷 누락 또는 파일 미존재 (${String(vp.afterScreenshot ?? "null")})`);
    }
    if (!beforeOk) {
      failures.push(`뷰포트 ${vpId}: before 스크린샷 누락 또는 파일 미존재 (${String(vp.beforeScreenshot ?? "null")})`);
    }
    if (afterOk && beforeOk) screenshotPairCount += 1;
  }

  return { checkedCount, overflowFreeCount, touchTargetPassCount, screenshotPairCount };
}

function evaluateDiagnosticsAndGrouping(diag, failures) {
  if (!diag || typeof diag !== "object") {
    failures.push("report.diagnosticsAndGrouping 객체가 누락되었습니다.");
    return false;
  }
  const startLen = failures.length;
  if (diag.primaryGroupPresent !== true) {
    failures.push("주요 포즈 조작 그룹([data-testid='pose-primary-controls'], role='region', aria-label='주요 포즈 조작')이 확인되지 않았습니다.");
  }
  if (diag.detailsPresent !== true) {
    failures.push("고급 진단 접이식 컨테이너([data-testid='pose-advanced-diagnostics'])가 확인되지 않았습니다.");
  }
  if (diag.defaultOpen !== false) {
    failures.push(`고급 진단 컨테이너가 기본 접힘(defaultOpen === false) 상태가 아닙니다 (defaultOpen=${String(diag.defaultOpen)}).`);
  }
  if (diag.openedAfterClick !== true) {
    failures.push("고급 진단 요약 클릭 후 펼침(openedAfterClick === true) 동작이 확인되지 않았습니다.");
  }
  if (diag.closedAfterSecondClick !== true) {
    failures.push("고급 진단 요약 재클릭 후 접힘(closedAfterSecondClick === true) 동작이 확인되지 않았습니다.");
  }
  if (diag.buttonNamesAccessible !== true) {
    failures.push("PosePanel 또는 ViewportToolbar 내 접근 가능한 이름이 비어 있는 버튼이 존재합니다.");
  }
  return failures.length === startLen;
}

function evaluateRigTransitions(rigTransitions, failures) {
  if (!rigTransitions || typeof rigTransitions !== "object") {
    failures.push("report.rigTransitions 객체가 누락되었습니다.");
    return false;
  }
  const startLen = failures.length;

  const empty = rigTransitions.normalEmptyRig;
  if (
    !empty ||
    empty.characterId !== "normal-empty-rig" ||
    empty.pageErrorCount !== 0 ||
    empty.failureBannerCount !== 0 ||
    empty.emptyNoticeShown !== true
  ) {
    failures.push("rigTransitions.normalEmptyRig 검증 실패 (characterId/pageErrorCount=0/failureBannerCount=0/emptyNoticeShown=true 필요).");
  }

  const cycle = rigTransitions.corruptCycleRig;
  if (
    !cycle ||
    cycle.characterId !== "corrupt-cycle-rig" ||
    cycle.pageErrorCount !== 0 ||
    cycle.diagnosticShown !== true ||
    cycle.controlsDisabledOnCorrupt !== true ||
    cycle.historyDepthUnchanged !== true
  ) {
    failures.push(
      "rigTransitions.corruptCycleRig 검증 실패 ([skeleton-cycle] 진단 표시·조작 버튼 비활성화·히스토리 깊이 불변·pageErrorCount=0 필요).",
    );
  }

  const nanRig = rigTransitions.corruptNanRestRig;
  if (
    !nanRig ||
    nanRig.characterId !== "corrupt-nan-rest-rig" ||
    nanRig.pageErrorCount !== 0 ||
    nanRig.diagnosticShown !== true ||
    nanRig.controlsDisabledOnCorrupt !== true ||
    nanRig.historyDepthUnchanged !== true
  ) {
    failures.push(
      "rigTransitions.corruptNanRestRig 검증 실패 ([skeleton-non-finite-rest] 진단 표시·조작 버튼 비활성화·히스토리 깊이 불변·pageErrorCount=0 필요).",
    );
  }

  const recovery = rigTransitions.immediateRecoveryToValidRig;
  if (
    !recovery ||
    recovery.characterId !== "valid-humanoid-rig" ||
    recovery.pageErrorCount !== 0 ||
    recovery.controlsEnabledAfterRecovery !== true ||
    recovery.poseActionSucceeded !== true ||
    recovery.historyDepthIncremented !== true
  ) {
    failures.push(
      "rigTransitions.immediateRecoveryToValidRig 검증 실패 (정상 리그 전환 직후 조작 버튼 활성화·포즈 적용 및 히스토리 깊이 +1·pageErrorCount=0 필요).",
    );
  }

  return failures.length === startLen;
}

function evaluateInteractions(interactions, failures) {
  if (!interactions || typeof interactions !== "object") {
    failures.push("report.interactions 객체가 누락되었습니다.");
    return false;
  }
  const startLen = failures.length;

  const drag = interactions.pointerHandleDrag;
  if (!drag || drag.dragged !== true || drag.historyDepthIncremented !== true || drag.pageErrorCount !== 0) {
    failures.push("interactions.pointerHandleDrag 검증 실패 (dragged=true, historyDepthIncremented=true, pageErrorCount=0 필요).");
  }

  const focus = interactions.keyboardFocus;
  if (!focus || focus.tabReachedPoseControl !== true || focus.focusVisibleOutlineObserved !== true) {
    failures.push("interactions.keyboardFocus 검증 실패 (tabReachedPoseControl=true, focusVisibleOutlineObserved=true 필요).");
  }

  const undoRedo = interactions.undoRedo;
  if (
    !undoRedo ||
    undoRedo.undoRestoredDepth !== true ||
    undoRedo.redoReappliedDepth !== true ||
    undoRedo.keyboardCtrlZWorked !== true ||
    undoRedo.keyboardCtrlYWorked !== true ||
    undoRedo.pageErrorCount !== 0
  ) {
    failures.push(
      "interactions.undoRedo 검증 실패 (undoRestoredDepth, redoReappliedDepth, keyboardCtrlZWorked, keyboardCtrlYWorked, pageErrorCount=0 필요).",
    );
  }

  return failures.length === startLen;
}

/**
 * 포즈 사용성 실브라우저 프로브 리포트를 검증하고 { ok, failures, summary }를 반환한다.
 */
export function evaluatePoseUsabilityReport(report) {
  const failures = [];
  if (!report || typeof report !== "object") {
    failures.push("리포트 객체가 비어 있거나 유효하지 않습니다.");
    return {
      ok: false,
      passed: false,
      exitCode: 1,
      failures,
      summary: {
        viewportCount: 0,
        overflowFreeCount: 0,
        touchTargetPassCount: 0,
        screenshotPairCount: 0,
        diagnosticsAndGroupingOk: false,
        rigTransitionsOk: false,
        interactionsOk: false,
        failureCount: failures.length,
      },
    };
  }

  evaluateProvenance(report.provenance, failures);
  const vpSummary = evaluateViewports(report.viewports, failures);
  const diagnosticsAndGroupingOk = evaluateDiagnosticsAndGrouping(report.diagnosticsAndGrouping, failures);
  const rigTransitionsOk = evaluateRigTransitions(report.rigTransitions, failures);
  const interactionsOk = evaluateInteractions(report.interactions, failures);

  const ok = failures.length === 0;
  return {
    ok,
    passed: ok,
    exitCode: ok ? 0 : 1,
    failures,
    summary: {
      viewportCount: vpSummary.checkedCount,
      overflowFreeCount: vpSummary.overflowFreeCount,
      touchTargetPassCount: vpSummary.touchTargetPassCount,
      screenshotPairCount: vpSummary.screenshotPairCount,
      diagnosticsAndGroupingOk,
      rigTransitionsOk,
      interactionsOk,
      failureCount: failures.length,
    },
  };
}

/**
 * 모든 게이트 조건을 만족하는 정본 통과 픽스처 리포트를 생성한다.
 */
export function createPassingPoseUsabilityFixture() {
  const viewports = {};
  for (const vpId of REQUIRED_VIEWPORT_IDS) {
    const width = vpId === "320px" ? 320 : vpId === "390px" ? 390 : vpId === "768px" ? 768 : 1440;
    viewports[vpId] = {
      id: vpId,
      clientWidth: width,
      scrollWidth: width,
      horizontalOverflowPx: 0,
      posePanelOverflowPx: 0,
      totalInteractiveChecked: 65,
      under44Count: 0,
      sampleUnder44: [],
      beforeScreenshot: `/tmp/character-lab-pose-usability-probe/before/before-${vpId}.png`,
      beforeScreenshotExists: true,
      afterScreenshot: `/tmp/character-lab-pose-usability-probe/after/after-${vpId}.png`,
      afterScreenshotExists: true,
    };
  }

  return {
    schema: "character-lab-pose-usability-probe/v1",
    generatedAt: "2026-11-06T00:00:00.000Z",
    provenance: {
      commitSha: "698dffc400000000000000000000000000000000",
      shortCommit: "698dffc4",
      branch: "feat/character-lab-pose-mobile-tablet-usability",
      ancestorCommits: REQUIRED_ANCESTOR_COMMITS.map((commit) => ({ commit, present: true, isAncestor: true })),
      allRequiredAncestorsPresent: true,
      dirtyFiles: [],
    },
    viewports,
    diagnosticsAndGrouping: {
      primaryGroupPresent: true,
      detailsPresent: true,
      defaultOpen: false,
      openedAfterClick: true,
      closedAfterSecondClick: true,
      buttonNamesAccessible: true,
    },
    rigTransitions: {
      normalEmptyRig: {
        characterId: "normal-empty-rig",
        pageErrorCount: 0,
        failureBannerCount: 0,
        emptyNoticeShown: true,
      },
      corruptCycleRig: {
        characterId: "corrupt-cycle-rig",
        pageErrorCount: 0,
        diagnosticShown: true,
        controlsDisabledOnCorrupt: true,
        historyDepthUnchanged: true,
      },
      corruptNanRestRig: {
        characterId: "corrupt-nan-rest-rig",
        pageErrorCount: 0,
        diagnosticShown: true,
        controlsDisabledOnCorrupt: true,
        historyDepthUnchanged: true,
      },
      immediateRecoveryToValidRig: {
        characterId: "valid-humanoid-rig",
        pageErrorCount: 0,
        controlsEnabledAfterRecovery: true,
        poseActionSucceeded: true,
        historyDepthIncremented: true,
      },
    },
    interactions: {
      pointerHandleDrag: {
        dragged: true,
        historyDepthIncremented: true,
        pageErrorCount: 0,
      },
      keyboardFocus: {
        tabReachedPoseControl: true,
        focusVisibleOutlineObserved: true,
      },
      undoRedo: {
        undoRestoredDepth: true,
        redoReappliedDepth: true,
        keyboardCtrlZWorked: true,
        keyboardCtrlYWorked: true,
        pageErrorCount: 0,
      },
    },
  };
}

/**
 * 정본 통과 픽스처와 6종의 단일 관심사 변이(음성 대조군)를 평가해 모두 거부(ok === false)되는지 검증한다.
 */
export function runPoseUsabilityNegativeControlSuite() {
  const passing = createPassingPoseUsabilityFixture();
  const baselineEvaluation = evaluatePoseUsabilityReport(passing);
  const baselinePassed = baselineEvaluation.ok === true && baselineEvaluation.failures.length === 0;

  const clone = (obj) => JSON.parse(JSON.stringify(obj));

  const mutations = [
    {
      id: "mutate-320px-horizontal-overflow",
      descriptionKo: "320px 뷰포트에서 PosePanel 가로 오버플로(53px) 발생 시 거부",
      mutate: (r) => {
        r.viewports["320px"].posePanelOverflowPx = 53;
      },
    },
    {
      id: "mutate-touch-target-under-44px",
      descriptionKo: "390px 뷰포트에서 44x44px 미만 터치 타겟(3개) 존재 시 거부",
      mutate: (r) => {
        r.viewports["390px"].under44Count = 3;
      },
    },
    {
      id: "mutate-diagnostics-not-collapsible",
      descriptionKo: "고급 진단 컨테이너가 기본 접힘 상태가 아닐 때(defaultOpen=true) 거부",
      mutate: (r) => {
        r.diagnosticsAndGrouping.defaultOpen = true;
      },
    },
    {
      id: "mutate-corrupt-rig-controls-not-disabled",
      descriptionKo: "손상 순환 리그(corrupt-cycle-rig)에서 조작 버튼이 비활성화되지 않았을 때 거부",
      mutate: (r) => {
        r.rigTransitions.corruptCycleRig.controlsDisabledOnCorrupt = false;
      },
    },
    {
      id: "mutate-recovery-rig-still-blocked",
      descriptionKo: "정상 리그(valid-humanoid-rig) 복구 직후에도 조작 버튼이 잠겨 있을 때 거부",
      mutate: (r) => {
        r.rigTransitions.immediateRecoveryToValidRig.controlsEnabledAfterRecovery = false;
      },
    },
    {
      id: "mutate-undo-redo-broken",
      descriptionKo: "키보드 Ctrl+Z 실행 취소가 동작하지 않을 때 거부",
      mutate: (r) => {
        r.interactions.undoRedo.keyboardCtrlZWorked = false;
      },
    },
  ];

  const cases = mutations.map((m) => {
    const mutated = clone(passing);
    m.mutate(mutated);
    const evaluation = evaluatePoseUsabilityReport(mutated);
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
