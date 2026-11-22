// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  runHyperAutomationPipeline,
  runPipelineConditionalBatchMacro,
} from "./automation-spectrum-pipeline-engine";
import {
  CONDITION_EXCLUDE_SILENT_CUTS,
  CONDITION_ONLY_3D_CUTS,
  attachMacroStepCondition,
  buildConditionalBatchMacro,
  createBatchMacroCutsFromStoryboard,
  executeEpisodeBatchMacro,
  finalizeRecordedMacro,
  recordMacroStep,
  resumeEpisodeBatchMacro,
  startMacroRecording,
} from "./conditional-episode-batch-macro";
import { StudioHyperAutomationOsPanel } from "./StudioHyperAutomationOsPanel";

afterEach(cleanup);

describe("축 30 · 조건 분기 60컷 배치 매크로 & 체크포인트 · 실패 격리 vs 원자적 롤백 (#146–#150)", () => {
  it("녹화형 매크로가 조건 분기('3D 컷에만 블러', '대사 없는 컷 제외')를 60컷에 정확히 분기 적용한다", () => {
    let draft = startMacroRecording("3D+대사 조건 분기 녹화");
    draft = recordMacroStep(draft, {
      stepId: "s-blur",
      action: "apply-depth-blur",
      labelKo: "3D 컷 배경 블러",
      params: { blurRadiusPx: 5.5 },
      conditions: [],
    });
    draft = attachMacroStepCondition(draft, "s-blur", CONDITION_ONLY_3D_CUTS);
    draft = recordMacroStep(draft, {
      stepId: "s-lut",
      action: "apply-color-lut",
      labelKo: "대사 컷 색온도 LUT",
      params: { lutId: "warm-evening-17" },
      conditions: [CONDITION_EXCLUDE_SILENT_CUTS],
    });
    const macro = finalizeRecordedMacro(draft);

    const cuts60 = createBatchMacroCutsFromStoryboard([], 60);
    const report = executeEpisodeBatchMacro({
      cuts: cuts60,
      macro,
      commitPolicy: "isolate-failures",
    });

    expect(report.totalCuts).toBe(60);
    expect(report.status).toBe("completed");
    expect(report.failedCount).toBe(0);
    expect(report.skippedCount).toBeGreaterThan(0);
    expect(report.appliedCount + report.skippedCount).toBe(60);

    for (const cut of report.finalCuts) {
      if (cut.has3dBackground) {
        expect(cut.backgroundBlurPx).toBe(5.5);
      } else {
        expect(cut.backgroundBlurPx).toBe(0);
      }
      if (cut.hasDialogue) {
        expect(cut.toneLutId).toBe("warm-evening-17");
      } else {
        expect(cut.toneLutId).toBeNull();
      }
    }
  });

  it("체크포인트 중단(30/60컷) 후 재개하면 1~60컷 전체 일괄 실행과 바이트 수준 동일 결과를 산출한다", () => {
    const macro = buildConditionalBatchMacro({
      blurOnlyOn3dCuts: true,
      excludeSilentCutsForTone: true,
      includeLineTintAllCuts: true,
    });
    const cuts60 = createBatchMacroCutsFromStoryboard([], 60);

    const fullDirect = executeEpisodeBatchMacro({
      cuts: cuts60,
      macro,
      commitPolicy: "isolate-failures",
    });

    const paused = executeEpisodeBatchMacro({
      cuts: cuts60,
      macro,
      commitPolicy: "isolate-failures",
      pauseAfterCount: 30,
    });
    expect(paused.status).toBe("paused");
    expect(paused.processedCount).toBe(30);
    expect(paused.checkpoint).not.toBeNull();
    expect(paused.checkpoint?.nextCutPosition).toBe(30);
    // 중단 중에는 아직 최종 커밋 전이므로 finalCuts는 원본 스냅샷 유지
    expect(paused.finalCuts).toEqual(paused.preRunSnapshot);

    const resumed = resumeEpisodeBatchMacro(paused.checkpoint!);
    expect(resumed.status).toBe("completed");
    expect(resumed.processedCount).toBe(60);
    expect(resumed.checkpoint).toBeNull();
    expect(resumed.finalCuts).toEqual(fullDirect.finalCuts);
    expect(resumed.appliedCount).toBe(fullDirect.appliedCount);
  });

  it("#150 60컷 중 1컷(37컷)에 손상 이미지 오류가 나면 '실패 격리 커밋'은 나머지 59컷을 안전 커밋한다", () => {
    const macro = buildConditionalBatchMacro({
      blurOnlyOn3dCuts: true,
      excludeSilentCutsForTone: true,
      includeLineTintAllCuts: true,
    });
    const cuts60 = createBatchMacroCutsFromStoryboard([], 60, {
      37: "corrupted-image",
    });

    const isolated = executeEpisodeBatchMacro({
      cuts: cuts60,
      macro,
      commitPolicy: "isolate-failures",
    });

    expect(isolated.status).toBe("completed-with-isolated-failures");
    expect(isolated.rolledBack).toBe(false);
    expect(isolated.failedCount).toBe(1);
    expect(isolated.committedCount).toBe(59);
    expect(isolated.failures[0]?.cutIndex).toBe(37);
    expect(isolated.failures[0]?.code).toBe("CORRUPTED_IMAGE");

    // 37컷은 원본 미변경 상태로 격리, 나머지 59컷은 정상 선화 틴트 커밋 확인
    const cut37 = isolated.finalCuts.find((cut) => cut.cutIndex === 37);
    const other59 = isolated.finalCuts.filter((cut) => cut.cutIndex !== 37);
    expect(cut37?.lineTintNormalized).toBe(false);
    expect(cut37?.appliedEffects).toEqual([]);
    expect(other59).toHaveLength(59);
    expect(other59.every((cut) => cut.lineTintNormalized)).toBe(true);
  });

  it("#150 60컷 중 1컷(42컷)에 권한 잠금 오류가 나면 '전체 원자적 롤백'은 60컷 전체를 사전 스냅샷으로 복원한다", () => {
    const macro = buildConditionalBatchMacro({
      blurOnlyOn3dCuts: true,
      excludeSilentCutsForTone: true,
      includeLineTintAllCuts: true,
    });
    const cuts60 = createBatchMacroCutsFromStoryboard([], 60, {
      42: "permission-locked",
    });

    const rolledBack = executeEpisodeBatchMacro({
      cuts: cuts60,
      macro,
      commitPolicy: "atomic-rollback",
    });

    expect(rolledBack.status).toBe("rolled-back");
    expect(rolledBack.rolledBack).toBe(true);
    expect(rolledBack.failedCount).toBe(1);
    expect(rolledBack.committedCount).toBe(0);
    expect(rolledBack.failures[0]?.cutIndex).toBe(42);
    expect(rolledBack.failures[0]?.code).toBe("PERMISSION_LOCKED");
    // 60컷 전체가 사전 스냅샷과 100% 동일해야 한다
    expect(rolledBack.finalCuts).toEqual(rolledBack.preRunSnapshot);
    expect(rolledBack.finalCuts.every((cut) => !cut.lineTintNormalized && cut.backgroundBlurPx === 0)).toBe(
      true,
    );
  });

  it("automation-spectrum-pipeline-engine 브리지(runPipelineConditionalBatchMacro)가 파이프라인 컷을 60컷 배치로 연결한다", () => {
    const run = runHyperAutomationPipeline({
      input: { ideaLine: "비 오는 서울 옥상의 시계공이 13번째 편지를 연다" },
      mode: "hyper-auto-99",
    });
    const batch = runPipelineConditionalBatchMacro(run, {
      targetCutCount: 60,
      commitPolicy: "isolate-failures",
      faultInjections: { 19: "corrupted-image" },
    });

    expect(batch.totalCuts).toBe(60);
    expect(batch.failedCount).toBe(1);
    expect(batch.committedCount).toBe(59);
    expect(batch.rolledBack).toBe(false);
  });

  it("StudioHyperAutomationOsPanel UI에서 체크포인트 중단·재개 및 원자적 롤백 전환이 동작한다", () => {
    render(<StudioHyperAutomationOsPanel />);

    fireEvent.change(screen.getByTestId("hyper-auto-idea-input"), {
      target: { value: "자정 우체국에서 깨어난 기록자" },
    });
    fireEvent.click(screen.getByTestId("hyper-auto-run-button"));

    expect(screen.getByTestId("hyper-auto-batch-macro-section")).toBeTruthy();

    // 30컷 체크포인트 중단 → 이어서 재개 (기본: 37컷 손상 이미지 + 실패 격리 커밋)
    fireEvent.click(screen.getByTestId("batch-macro-pause-30-btn"));
    expect(screen.getByTestId("batch-macro-processed").textContent).toContain("30/60");
    expect(screen.getByTestId("batch-macro-resume-btn").hasAttribute("disabled")).toBe(false);

    fireEvent.click(screen.getByTestId("batch-macro-resume-btn"));
    expect(screen.getByTestId("batch-macro-processed").textContent).toContain("60/60");
    expect(screen.getByTestId("batch-macro-failed").textContent).toContain("1컷");
    expect(screen.getByTestId("batch-macro-rolledback").textContent).toContain("아니오");
    expect(screen.getByTestId("batch-macro-failure-detail").textContent).toContain("37컷");

    // 전체 원자적 롤백으로 전환 후 60컷 실행
    fireEvent.click(screen.getByTestId("batch-macro-policy-rollback"));
    fireEvent.click(screen.getByTestId("batch-macro-run-60-btn"));
    expect(screen.getByTestId("batch-macro-committed").textContent).toContain("0컷");
    expect(screen.getByTestId("batch-macro-rolledback").textContent).toContain("예");
  });
});
