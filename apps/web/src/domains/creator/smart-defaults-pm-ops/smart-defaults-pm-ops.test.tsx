// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioSoloDeadlineMeterPanel } from "../deadline-meter/StudioSoloDeadlineMeterPanel";
import {
  CUT_DIFFICULTY_TIERS,
  DEFAULT_PLATFORM_QC_INPUT,
  DEFAULT_SETTLEMENT_ENTRIES,
  DEFAULT_STUDIO_CONVEYOR_EPISODES,
  DEFAULT_STUDIO_STAFF_POOL,
  SMART_STAGE_ORDER,
  StudioLargePmConveyorConsole,
  StudioSmartFieldGuide,
  adaptSmartDefaultsFromIntentText,
  applyReallocationProposal,
  applySmartStagePreset,
  auditZeroBlankFields,
  buildAllSmartStageDefaults,
  buildSmartStageDefaults,
  calculateWeightedStudioSettlement,
  detectDominoDelayRisk,
  evaluateMultiEpisodeConveyor,
  guardNonEmptyFieldValue,
  runPlatformPreSubmissionQc,
  updateSmartStageFieldValue,
} from "./index";

afterEach(() => {
  cleanup();
});

describe("빈칸 제로 스마트 기본값 · 선택 의도 엔진", () => {
  it("전 5단계 모든 입력 항목이 빈칸 0%, 1줄 의도 설명, 추천 근거, 3종 대안 프리셋을 제공한다", () => {
    const allStages = buildAllSmartStageDefaults();
    const audit = auditZeroBlankFields(allStages);

    expect(audit.isZeroBlankCompliant).toBe(true);
    expect(audit.blankCount).toBe(0);
    expect(audit.filledRatioPercent).toBe(100);
    expect(audit.totalFields).toBe(20);

    for (const stageId of SMART_STAGE_ORDER) {
      const bundle = buildSmartStageDefaults(stageId);
      expect(bundle.blankFieldCount).toBe(0);
      expect(bundle.completionRatePercent).toBe(100);
      expect(bundle.stagePresets).toHaveLength(3);
      for (const field of bundle.fields) {
        expect(field.value.trim().length).toBeGreaterThan(0);
        expect(field.intentHint.trim().length).toBeGreaterThan(8);
        expect(field.recommendedWhy.trim().length).toBeGreaterThan(8);
        expect(field.aiSuggestionBadgeKo.trim().length).toBeGreaterThan(2);
        expect(field.alternatives).toHaveLength(3);
      }
    }
  });

  it("빈칸 입력 시 추천값 자동 방어(guardNonEmptyFieldValue) 및 단계 프리셋 원클릭 적용이 동작한다", () => {
    const planning = buildSmartStageDefaults("planning");
    const synopsisField = planning.fields.find((f) => f.fieldId === "synopsis");
    expect(synopsisField).toBeDefined();
    if (!synopsisField) return;

    const guarded = guardNonEmptyFieldValue(synopsisField, "   ");
    expect(guarded.restoredFromFallback).toBe(true);
    expect(guarded.value).toBe(synopsisField.recommendedValue);

    const updatedSafe = updateSmartStageFieldValue(planning, "synopsis", "");
    expect(updatedSafe.blankFieldCount).toBe(0);

    const presetApplied = applySmartStagePreset(planning, "plan-rofan-premium");
    const genreAfter = presetApplied.fields.find((f) => f.fieldId === "genre");
    expect(genreAfter?.value).toContain("로맨스 판타지");
  });

  it("내 의도 한 줄로 5단계 전체 기본값을 장르·조명·템포·플랫폼에 맞춰 빈칸 0%로 일괄 최적화한다", () => {
    const cyberAction = adaptSmartDefaultsFromIntentText(
      "사이버펑크 네온 야간 헌터 액션, 빠른 75컷 전개, 네이버 정식연재 1600px 출고",
      "stage3d",
    );
    expect(cyberAction.audit.isZeroBlankCompliant).toBe(true);
    expect(cyberAction.signals.genreKey).toBe("action-fantasy");
    expect(cyberAction.signals.lightingKey).toBe("neon-night");
    expect(cyberAction.signals.platformKey).toBe("naver-official-1600");
    expect(
      cyberAction.stages.storyboard.fields.find((f) => f.fieldId === "cutCount")?.value,
    ).toBe("75");
    expect(
      cyberAction.activeStage.fields.find((f) => f.fieldId === "timeOfDay")?.value,
    ).toContain("네온 심야");

    const rofanKakao = adaptSmartDefaultsFromIntentText(
      "로맨스 판타지 회귀 궁정물, 따뜻한 노을 조명, 카카오페이지 연재",
    );
    expect(rofanKakao.audit.blankCount).toBe(0);
    expect(rofanKakao.signals.genreKey).toBe("romance-fantasy");
    expect(rofanKakao.signals.platformKey).toBe("kakao-page-720");
    expect(
      rofanKakao.stages.delivery.fields.find((f) => f.fieldId === "platformSpec")?.value,
    ).toContain("카카오페이지");

    const thrillerGlobal = adaptSmartDefaultsFromIntentText(
      "도시 미스터리 공포 스릴러, 깊은 새벽 그림자, 느린 서스펜스 여백, 글로벌 800px 연재",
    );
    expect(thrillerGlobal.audit.blankCount).toBe(0);
    expect(thrillerGlobal.signals.platformKey).toBe("global-800");
    expect(
      thrillerGlobal.stages.storyboard.fields.find((f) => f.fieldId === "verticalGutterPx")?.value,
    ).toBe("260");
    expect(
      thrillerGlobal.stages.delivery.fields.find((f) => f.fieldId === "sliceHeightPx")?.value,
    ).toBe("1280");

    const dailyNaver690 = adaptSmartDefaultsFromIntentText(
      "일상 힐링 고양이 코미디, 1인 가벼운 48컷, 네이버 도전만화 690px",
    );
    expect(dailyNaver690.audit.blankCount).toBe(0);
    expect(dailyNaver690.signals.platformKey).toBe("naver-challenge-690");
    expect(
      dailyNaver690.stages.delivery.fields.find((f) => f.fieldId === "platformSpec")?.value,
    ).toContain("690px");
  });
});

describe("대형 스튜디오 PM 3~4화차 로테이션 컨베이어 · 정산 · 플랫폼 사전 QC 엔진", () => {
  it("Ep.12~15 4화차 로테이션 도미노 지연 경보를 탐지하고 여유 인력 재배정으로 지연을 해소한다", () => {
    const initial = evaluateMultiEpisodeConveyor(
      DEFAULT_STUDIO_CONVEYOR_EPISODES,
      DEFAULT_STUDIO_STAFF_POOL,
    );
    expect(initial.totalActiveEpisodes).toBe(4);
    expect(initial.episodes.map((e) => e.episodeNumber)).toEqual([12, 13, 14, 15]);
    expect(initial.delayedEpisodeCount).toBe(1);

    // Ep.14 선화·3D 배경 12시간 지연 → 하류 인계 + Ep.15 동일 공정 도미노 경보 발생
    const domino = detectDominoDelayRisk(initial.episodes);
    expect(domino.overallSeverity).toBe("critical");
    expect(domino.alerts.length).toBeGreaterThanOrEqual(2);
    expect(domino.affectedEpisodeNumbers).toContain(14);
    expect(domino.affectedEpisodeNumbers).toContain(15);

    // 여유 인력 재배정 제안이 주력 공정(김다온) 우선으로 생성됨
    expect(initial.reallocationProposals.length).toBeGreaterThanOrEqual(2);
    expect(initial.reallocationProposals[0]?.isPrimarySkillMatch).toBe(true);

    // 제안 2건을 순차 적용하면 Ep.14 지연이 완전 해소되고 도미노 경보 0건으로 전환
    let currentEpisodes = DEFAULT_STUDIO_CONVEYOR_EPISODES;
    let currentStaff = DEFAULT_STUDIO_STAFF_POOL;
    for (const proposal of initial.reallocationProposals) {
      const next = applyReallocationProposal(currentEpisodes, currentStaff, proposal);
      currentEpisodes = next.episodes;
      currentStaff = next.staffPool;
    }

    const afterRealloc = evaluateMultiEpisodeConveyor(currentEpisodes, currentStaff);
    expect(afterRealloc.delayedEpisodeCount).toBe(0);
    expect(afterRealloc.domino.overallSeverity).toBe("none");
    expect(afterRealloc.domino.alerts).toHaveLength(0);
  });

  it("난이도 가중치(0.8x/1.0x/1.4x/1.8x) × 공정 단가 × 프리랜서 3.3% / 사업자 VAT 10%를 정확히 분리 계산한다", () => {
    expect(CUT_DIFFICULTY_TIERS.map((t) => t.multiplier)).toEqual([0.8, 1.0, 1.4, 1.8]);

    const report = calculateWeightedStudioSettlement(DEFAULT_SETTLEMENT_ENTRIES);
    expect(report.lines).toHaveLength(3);

    // 1) 선화 프리랜서 3.3%: 10*0.8 + 36*1.0 + 18*1.4 + 6*1.8 = 80.0 가중 컷 × 24,000원 = 1,920,000원
    const lineart = report.lines[0];
    expect(lineart?.rawCutCount).toBe(70);
    expect(lineart?.weightedCutCount).toBe(80);
    expect(lineart?.grossAmountKrw).toBe(1_920_000);
    expect(lineart?.flatComparisonKrw).toBe(1_680_000);
    expect(lineart?.fairnessDeltaKrw).toBe(240_000);
    expect(lineart?.incomeTaxKrw).toBe(57_600);
    expect(lineart?.localIncomeTaxKrw).toBe(5_760);
    expect(lineart?.withholdingTaxKrw).toBe(63_360);
    expect(lineart?.vatKrw).toBe(0);
    expect(lineart?.netPayoutKrw).toBe(1_856_640);
    expect((lineart?.netPayoutKrw ?? 0) + (lineart?.withholdingTaxKrw ?? 0)).toBe(
      lineart?.grossAmountKrw,
    );

    // 2) 3D 배경 사업자 세금계산서(VAT 10%): 4*0.8 + 22*1.0 + 10*1.4 + 12*1.8 = 60.8 가중 컷 × 18,000원 = 1,094,400원
    const bg3dBiz = report.lines[2];
    expect(bg3dBiz?.weightedCutCount).toBe(60.8);
    expect(bg3dBiz?.grossAmountKrw).toBe(1_094_400);
    expect(bg3dBiz?.withholdingTaxKrw).toBe(0);
    expect(bg3dBiz?.vatKrw).toBe(109_440);
    expect(bg3dBiz?.invoiceTotalKrw).toBe(1_203_840);

    // 3) 프리랜서 소계 vs 사업자 소계 분리 합산 검증
    expect(report.freelancerSubtotal.contractorCount).toBe(2);
    expect(report.businessSubtotal.contractorCount).toBe(1);
    expect(report.grandTotals.totalWithholdingTaxKrw).toBe(
      report.freelancerSubtotal.withholdingTaxKrw,
    );
    expect(report.grandTotals.totalVatKrw).toBe(report.businessSubtotal.vatKrw);

    // 4) 한국 소득세법 10원 미만 절사 (소득세 3% 절사 + 지방소득세는 산출 소득세의 10% 절사) 및 NaN 단가 방어
    const truncationReport = calculateWeightedStudioSettlement([
      {
        entryId: "trunc-100500",
        contractorNameKo: "절사 검증 작가 A",
        episodeLabelKo: "Ep.15",
        stageId: "coloring",
        baseRatePerCutKrw: 100_500,
        taxMode: "freelancer-3.3",
        cuts: { simple: 0, standard: 1, actionDetail: 0, crowdBg: 0 },
      },
      {
        entryId: "trunc-51800",
        contractorNameKo: "절사 검증 작가 B",
        episodeLabelKo: "Ep.15",
        stageId: "lettering",
        baseRatePerCutKrw: 51_800,
        taxMode: "freelancer-3.3",
        cuts: { simple: 0, standard: 1, actionDetail: 0, crowdBg: 0 },
      },
      {
        entryId: "nan-guard",
        contractorNameKo: "비정상 단가 방어",
        episodeLabelKo: "Ep.15",
        stageId: "lineart",
        baseRatePerCutKrw: Number.NaN,
        taxMode: "freelancer-3.3",
        cuts: { simple: 2, standard: 3, actionDetail: 0, crowdBg: 0 },
      },
    ]);

    // 100,500 * 3% = 3,015 -> 3,010원 / 3,010 * 10% = 301 -> 300원 / 합계 3,310원
    const lineA = truncationReport.lines[0];
    expect(lineA?.incomeTaxKrw).toBe(3_010);
    expect(lineA?.localIncomeTaxKrw).toBe(300);
    expect(lineA?.withholdingTaxKrw).toBe(3_310);
    expect(lineA?.netPayoutKrw).toBe(97_190);

    // 51,800 * 3% = 1,554 -> 1,550원 / 1,550 * 10% = 155 -> 150원 / 합계 1,700원
    const lineB = truncationReport.lines[1];
    expect(lineB?.incomeTaxKrw).toBe(1_550);
    expect(lineB?.localIncomeTaxKrw).toBe(150);
    expect(lineB?.withholdingTaxKrw).toBe(1_700);
    expect(lineB?.netPayoutKrw).toBe(50_100);

    // baseRatePerCutKrw가 NaN이면 0원으로 방어되어 NaN 전파 차단
    const lineNan = truncationReport.lines[2];
    expect(lineNan?.baseRatePerCutKrw).toBe(0);
    expect(lineNan?.grossAmountKrw).toBe(0);
    expect(lineNan?.withholdingTaxKrw).toBe(0);
    expect(lineNan?.netPayoutKrw).toBe(0);
    expect(Number.isFinite(truncationReport.grandTotals.grossTotalKrw)).toBe(true);
    expect(Number.isFinite(truncationReport.grandTotals.totalNetPayoutKrw)).toBe(true);
  });

  it("네이버(690/1600px)·카카오·글로벌 플랫폼 사전 QC와 심의 충돌을 정확히 판정한다", () => {
    const passNaver = runPlatformPreSubmissionQc(DEFAULT_PLATFORM_QC_INPUT);
    expect(passNaver.verdict).toBe("ready-to-submit");
    expect(passNaver.score).toBe(100);
    expect(passNaver.failCount).toBe(0);

    const failNaver690 = runPlatformPreSubmissionQc({
      ...DEFAULT_PLATFORM_QC_INPUT,
      platformId: "naver-challenge",
      widthPx: 1600,
      maxSingleSliceMb: 3.4,
      unresolvedTypoCount: 2,
      clippedBalloonCount: 1,
      declaredAgeRating: "all",
      hasBloodOrGore: true,
      hasUnlicensedBrandLogo: true,
      rightsBomVerified: false,
    });
    expect(failNaver690.verdict).toBe("blocked");
    expect(failNaver690.failCount).toBe(5);
    expect(failNaver690.blockingReasonsKo.length).toBe(5);

    const kakaoWarn = runPlatformPreSubmissionQc({
      ...DEFAULT_PLATFORM_QC_INPUT,
      platformId: "kakao-page",
      widthPx: 720,
      maxSliceHeightPx: 1600,
      maxSingleSliceMb: 1.5,
      totalEpisodeMb: 18,
      minFontSizePx: 22,
      minVerticalGutterPx: 120,
      mobilePreviewChecked: false,
    });
    expect(kakaoWarn.verdict).toBe("needs-review");
    expect(kakaoWarn.warnCount).toBe(1);

    const globalFail = runPlatformPreSubmissionQc({
      ...DEFAULT_PLATFORM_QC_INPUT,
      platformId: "global-webtoon",
      widthPx: 800,
      maxSliceHeightPx: 1600, // 글로벌 1280px 초과
      minFontSizePx: 14, // 20px 미달
    });
    expect(globalFail.verdict).toBe("blocked");
    // 분할 높이 초과 + 회차 총용량(26.4MB > 20MB) 초과 + 모바일 최소 폰트 미달 = 3건 차단
    expect(globalFail.failCount).toBe(3);
    expect(globalFail.checks.filter((c) => c.status === "fail").map((c) => c.checkId)).toEqual([
      "qc-resolution",
      "qc-filesize",
      "qc-mobile-readability",
    ]);
  });
});

describe("StudioSmartFieldGuide · StudioLargePmConveyorConsole UI 및 마감 계측기 통합", () => {
  it("StudioSmartFieldGuide가 의도 설명·추천 근거·3종 대안 프리셋과 빈칸 자동 채움 가드를 렌더링한다", () => {
    const stage = buildSmartStageDefaults("planning");
    const synopsisField = stage.fields.find((f) => f.fieldId === "synopsis");
    expect(synopsisField).toBeDefined();
    if (!synopsisField) return;

    let latestValue = "";
    render(
      <StudioSmartFieldGuide
        field={{ ...synopsisField, value: "" }}
        onChange={(next) => {
          latestValue = next;
        }}
      />,
    );

    expect(screen.getByText(synopsisField.intentHint)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("빈칸 감지");
    fireEvent.click(screen.getByRole("button", { name: /빈칸 자동 채움/u }));
    expect(latestValue).toBe(synopsisField.recommendedValue);
  });

  it("StudioLargePmConveyorConsole 4대 탭과 상호작용(의도 맞춤·재배정·3.3%/VAT 전환·사전 QC)이 동작한다", () => {
    render(<StudioLargePmConveyorConsole />);

    // 초기 빈칸 0% 배지
    expect(screen.getByTestId("zero-blank-status-pill").textContent).toContain("빈칸 0개");

    // 1) 의도 한 줄 자동 맞춤
    const intentInput = screen.getByLabelText("창작 의도 한 줄 입력");
    fireEvent.change(intentInput, {
      target: { value: "로맨스 판타지 궁정, 노을 조명, 카카오페이지 출고" },
    });
    fireEvent.click(screen.getByTestId("adapt-intent-apply-btn"));
    expect(screen.getByTestId("pm-console-status-notice").textContent).toContain("빈칸 0%");

    // 2) 3~4화차 로테이션 컨베이어 탭 → 재배정 버튼 적용
    fireEvent.click(screen.getByRole("tab", { name: /3~4화차 로테이션 컨베이어/u }));
    expect(screen.getByTestId("pm-conveyor-tab-panel")).toBeTruthy();
    expect(screen.getByTestId("domino-risk-summary").textContent).toContain("도미노 지연 경보");
    const firstReallocBtn = screen.getByTestId("apply-reallocation-realloc-staff-kim-daon-ep14");
    fireEvent.click(firstReallocBtn);
    expect(screen.getByTestId("pm-console-status-notice").textContent).toContain("Ep.14");

    // 3) 난이도 가중치 정산 탭 → 프리랜서 3.3% ↔ 사업자 VAT 10% 전환
    fireEvent.click(screen.getByRole("tab", { name: /난이도 가중치 정산/u }));
    expect(screen.getByTestId("pm-settlement-tab-panel")).toBeTruthy();
    const beforeFreelancerText = screen.getByTestId("settlement-freelancer-net").textContent;
    const bizButtons = screen.getAllByRole("button", { name: "사업자 세금계산서(10%)" });
    const firstBizButton = bizButtons[0];
    expect(firstBizButton).toBeDefined();
    if (firstBizButton) {
      fireEvent.click(firstBizButton);
    }
    expect(screen.getByTestId("settlement-freelancer-net").textContent).not.toBe(
      beforeFreelancerText,
    );

    // 4) 플랫폼 사전 QC 탭 → 말풍선 잘림 입력 시 반려 위험 전환
    fireEvent.click(screen.getByRole("tab", { name: /플랫폼 사전 QC/u }));
    expect(screen.getByTestId("platform-qc-verdict").textContent).toContain("출고 승인 가능");
    fireEvent.change(screen.getByLabelText("말풍선 잘림 건수"), { target: { value: "2" } });
    expect(screen.getByTestId("platform-qc-verdict").textContent).toContain("반려 위험");
  });

  it("StudioSoloDeadlineMeterPanel의 접힘 details를 열면 대형 스튜디오 PM 콘솔이 안전하게 마운트된다", () => {
    render(<StudioSoloDeadlineMeterPanel today="2026-11-23" activeTaskCount={4} />);

    // 초기에는 접혀 있어 기존 테스트와 충돌하지 않는다
    expect(screen.queryByTestId("studio-large-pm-conveyor-console")).toBeNull();

    const details = screen.getByTestId("deadline-meter-pm-conveyor-details") as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event("toggle"));

    expect(screen.getByTestId("studio-large-pm-conveyor-console")).toBeTruthy();
  });
});
