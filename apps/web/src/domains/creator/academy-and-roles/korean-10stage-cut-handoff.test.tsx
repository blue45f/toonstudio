// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  KOREAN_10STAGE_ORDER,
  KOREAN_10STAGE_WEBTOON_PIPELINE,
  SAMPLE_KOREAN_10STAGE_CUT_RECORDS,
  StudioPipelineGovernanceBoard,
  WEBTOON_8_STAGE_PIPELINE,
  aggregateCut10StagePayoutLedger,
  applyCut10StageHandoff,
  calculateWithholding33Truncated10,
  evaluateCut10StageHandoff,
  getKorean10StageSpec,
  getNextKorean10StageId,
  type CutHandoffRecord,
} from "./index";

const HANGUL_REGEX = /[가-힣]/u;

afterEach(() => {
  cleanup();
});

function createBaseLineartCut(overrides?: Partial<CutHandoffRecord>): CutHandoffRecord {
  return {
    cutId: "CUT-20-007",
    episodeId: "EP-20",
    currentStageId: "lineart",
    assigneeId: "artist-line-01",
    assigneeNameKo: "서연(선화)",
    assigneeNameEn: "Seoyeon (Lineart)",
    layers: [
      { layerId: "l1", layerName: "01_SCRIPT_NOTES", stageId: "script", locked: false, lockMode: "editable" },
      { layerId: "l2", layerName: "02_CONTI_GRID", stageId: "conti", locked: false, lockMode: "editable" },
      { layerId: "l3", layerName: "03_SKETCH_POSE", stageId: "sketch", locked: false, lockMode: "editable" },
      { layerId: "l4", layerName: "04_LINEART_CHAR", stageId: "lineart", locked: false, lockMode: "editable" },
      { layerId: "l5", layerName: "05_BG3D_ROOM", stageId: "bg3d", locked: false, lockMode: "editable" },
    ],
    widthPx: 1600,
    dpi: 350,
    openLineGapCount: 0,
    biblePaletteMatchPercent: 99,
    rightsBomPassed: true,
    missingRightsBomCount: 0,
    baseRateKrw: 24_000,
    complexityMultiplier: 1.0,
    rushBonusKrw: 0,
    isFreelanceOutsource: true,
    ...overrides,
  };
}

describe("한국 실무 10단계 컷 분업 바통 게이트 엔진", () => {
  it("기존 8단계 계약을 유지하면서 10단계 표준 공정 순서와 영문 무결성을 보장한다", () => {
    expect(WEBTOON_8_STAGE_PIPELINE).toHaveLength(8);
    expect(KOREAN_10STAGE_WEBTOON_PIPELINE).toHaveLength(10);
    expect(KOREAN_10STAGE_ORDER).toEqual([
      "script",
      "conti",
      "sketch",
      "lineart",
      "bg3d",
      "flatting",
      "shading",
      "post-fx",
      "lettering",
      "pd-qa",
    ]);
    expect(getNextKorean10StageId("script")).toBe("conti");
    expect(getNextKorean10StageId("lineart")).toBe("bg3d");
    expect(getNextKorean10StageId("pd-qa")).toBeNull();
    expect(getKorean10StageSpec("pd-qa").order).toBe(10);

    for (const stage of KOREAN_10STAGE_WEBTOON_PIPELINE) {
      expect(HANGUL_REGEX.test(stage.labelEn)).toBe(false);
      expect(HANGUL_REGEX.test(stage.shortLabelEn)).toBe(false);
      expect(HANGUL_REGEX.test(stage.handoffSummaryEn)).toBe(false);
    }
  });

  it("선화 열린 틈새가 1건 이상이거나 Rights BOM 미통과면 바통 인계를 차단하고 정산을 보류한다", () => {
    const gapBlocked = evaluateCut10StageHandoff(
      createBaseLineartCut({ openLineGapCount: 2 }),
    );
    expect(gapBlocked.passed).toBe(false);
    expect(gapBlocked.canHandoff).toBe(false);
    expect(gapBlocked.previousStageLayersLocked).toBe(false);
    expect(gapBlocked.payout.payableStatus).toBe("held");
    expect(gapBlocked.checks.find((c) => c.checkId === "open-line-gap")?.passed).toBe(false);
    // 차단 시 현재 선화 레이어는 수정 가능 상태를 유지한다
    expect(gapBlocked.updatedLayers.find((l) => l.layerId === "l4")?.locked).toBe(false);
    // 차단 사유 영문에는 한글이 0자여야 한다
    expect(HANGUL_REGEX.test(gapBlocked.summaryEn)).toBe(false);
    for (const reason of gapBlocked.blockingReasonsEn) {
      expect(HANGUL_REGEX.test(reason)).toBe(false);
    }

    const bomBlocked = evaluateCut10StageHandoff(
      createBaseLineartCut({ rightsBomPassed: false, missingRightsBomCount: 1 }),
    );
    expect(bomBlocked.passed).toBe(false);
    expect(bomBlocked.checks.find((c) => c.checkId === "rights-bom")?.passed).toBe(false);
    expect(bomBlocked.payout.payableStatus).toBe("held");
  });

  it("검증 통과 시 이전·현재 공정 레이어를 locked: true로 자동 잠금하고 다음 공정으로 바통을 넘긴다", () => {
    const input = createBaseLineartCut();
    const evaluated = evaluateCut10StageHandoff(input);

    expect(evaluated.passed).toBe(true);
    expect(evaluated.nextStageId).toBe("bg3d");
    expect(evaluated.previousStageLayersLocked).toBe(true);
    expect(evaluated.lockedLayerIds).toEqual(["l1", "l2", "l3", "l4"]);

    // script~lineart(l1~l4)는 locked: true, 하위 bg3d(l5)는 편집 가능 유지
    for (const id of ["l1", "l2", "l3", "l4"]) {
      const layer = evaluated.updatedLayers.find((item) => item.layerId === id);
      expect(layer?.locked).toBe(true);
      expect(layer?.lockMode).toBe("read-only");
    }
    const downstream = evaluated.updatedLayers.find((item) => item.layerId === "l5");
    expect(downstream?.locked).toBe(false);
    expect(downstream?.lockMode).toBe("editable");
    expect(HANGUL_REGEX.test(evaluated.summaryEn)).toBe(false);

    const applied = applyCut10StageHandoff(input, "2026-11-23T12:30:00Z");
    expect(applied.transitioned).toBe(true);
    expect(applied.nextRecord.currentStageId).toBe("bg3d");
    expect(applied.nextRecord.layers.find((l) => l.layerId === "l4")?.locked).toBe(true);
    expect(applied.nextRecord.handedOffAtIso).toBe("2026-11-23T12:30:00Z");
  });

  it("외주 원고료 3.3%(소득세 3% + 지방소득세 0.3%) 10원 미만 절사와 원장 집계를 정확히 계산한다", () => {
    // 24,000원 -> 소득세 720원, 지방소득세 72->70원, 합 790원, 실수령 23,210원
    const case24k = calculateWithholding33Truncated10(24_000);
    expect(case24k).toEqual({
      grossKrw: 24_000,
      incomeTax3PctKrw: 720,
      localIncomeTax03PctKrw: 70,
      totalWithholdingTaxKrw: 790,
      netPayableKrw: 23_210,
      taxApplied: true,
    });

    // 15,000원 -> 소득세 450원, 지방소득세 45->40원, 합 490원, 실수령 14,510원
    const case15k = calculateWithholding33Truncated10(15_000);
    expect(case15k.totalWithholdingTaxKrw).toBe(490);
    expect(case15k.netPayableKrw).toBe(14_510);

    // 33,333원 -> 소득세 999.99->990원, 지방소득세 99->90원, 합 1,080원
    const caseOdd = calculateWithholding33Truncated10(33_333);
    expect(caseOdd.incomeTax3PctKrw).toBe(990);
    expect(caseOdd.localIncomeTax03PctKrw).toBe(90);
    expect(caseOdd.totalWithholdingTaxKrw % 10).toBe(0);
    expect(caseOdd.grossKrw - caseOdd.totalWithholdingTaxKrw).toBe(caseOdd.netPayableKrw);

    // 사내 인력(원천징수 미적용)
    const noTax = calculateWithholding33Truncated10(24_000, false);
    expect(noTax.totalWithholdingTaxKrw).toBe(0);
    expect(noTax.netPayableKrw).toBe(24_000);

    // 샘플 3컷 원장 집계: 2컷 통과(24,000 + 15,000), 1컷 Rights BOM 미통과 보류(22,500)
    const ledger = aggregateCut10StagePayoutLedger(SAMPLE_KOREAN_10STAGE_CUT_RECORDS);
    expect(ledger.totalCuts).toBe(3);
    expect(ledger.approvedCutCount).toBe(2);
    expect(ledger.heldCutCount).toBe(1);
    expect(ledger.totalApprovedGrossKrw).toBe(39_000);
    expect(ledger.totalApprovedWithholdingTaxKrw).toBe(790 + 490);
    expect(ledger.totalApprovedNetPayableKrw).toBe(39_000 - 1_280);
    expect(ledger.totalHeldGrossKrw).toBe(22_500);
  });

  it("파이프라인 보드 UI에서 한국 실무 10단계 모드로 전환해 선화 틈새 차단과 원클릭 인계를 수행한다", () => {
    render(<StudioPipelineGovernanceBoard mode="pipeline" />);

    fireEvent.click(screen.getByTestId("pipeline-mode-10stage"));
    expect(screen.getByTestId("pipeline-10stage-script")).toBeTruthy();
    expect(screen.getByTestId("pipeline-10stage-pd-qa")).toBeTruthy();
    expect(screen.getByTestId("pipeline-10stage-payout-panel").textContent).toContain("23,210원");

    // 선화 틈새 0건 해제 -> 인계 차단
    fireEvent.click(screen.getByRole("button", { name: "선화 틈새 0건" }));
    const handoffBtn = screen.getByTestId("pipeline-10stage-handoff-btn") as HTMLButtonElement;
    expect(handoffBtn.disabled).toBe(true);

    // 선화 틈새 0건 복원 -> 원클릭 10단계 바통 인계 실행 (lineart -> bg3d)
    fireEvent.click(screen.getByRole("button", { name: "선화 틈새 0건" }));
    expect(handoffBtn.disabled).toBe(false);
    fireEvent.click(handoffBtn);
    expect(screen.getByTestId("pipeline-10stage-bg3d").getAttribute("data-stage-state")).toBe("active");
    expect(screen.getByTestId("pipeline-10stage-lineart").getAttribute("data-stage-state")).toBe("locked");
  });
});
