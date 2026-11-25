// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DRIFT_METRIC_KEYS,
  MODEL_SHEET_ACCESSORIES,
  MODEL_SHEET_ARCHETYPES,
  StudioModelSheetDriftCoachPanel,
  applyCutCorrection,
  auditEpisodeModelSheetDrift,
  auditSingleCutDrift,
  createDriftCoachSession,
  exportDriftReportJson,
  exportDriftReportMarkdown,
  generateEpisodeSampleCuts,
  getAccessoryMeta,
  getHairPartMeta,
  getModelSheetSpec,
  previewCutCorrection,
  proposeCutDriftCorrectionsTop3,
  revertAllCutCorrections,
  revertCutCorrection,
  selectDriftCoachCut,
  simulateCutMetricUpdate,
  type EpisodeCutMetric,
} from "./index";

afterEach(cleanup);

function makeCleanCut(archetypeId: "romance-lead" | "action-hero" | "school-boy" | "fantasy-sidekick", cutNumber = 1): EpisodeCutMetric {
  const spec = getModelSheetSpec(archetypeId);
  return {
    cutId: `cut-${String(cutNumber).padStart(2, "0")}`,
    cutNumber,
    sceneTagKo: "테스트 컷",
    sceneTagEn: "Test Cut",
    cameraShot: "bust",
    headToBodyRatio: spec.headToBodyRatio,
    eyeSpacingRatio: spec.eyeSpacingRatio,
    eyeHeightRatio: spec.eyeHeightRatio,
    jawWidthRatio: spec.jawWidthRatio,
    hairPartSide: spec.hairPartSide,
    presentAccessories: [...spec.requiredAccessories],
  };
}

describe("1. 4종 웹툰 캐릭터 설정집(Model Sheet) 아키타입 기준 프리셋", () => {
  it("4종 대표 아키타입(7.0 / 7.8 / 6.5 / 5.5등신) 기준 비율이 정확히 정의되어 있다", () => {
    expect(MODEL_SHEET_ARCHETYPES).toHaveLength(4);
    expect(getModelSheetSpec("romance-lead").headToBodyRatio).toBe(7.0);
    expect(getModelSheetSpec("action-hero").headToBodyRatio).toBe(7.8);
    expect(getModelSheetSpec("school-boy").headToBodyRatio).toBe(6.5);
    expect(getModelSheetSpec("fantasy-sidekick").headToBodyRatio).toBe(5.5);
  });

  it("모든 아키타입은 유효한 필수 의상·장신구 체크리스트와 가르마 기준을 가진다", () => {
    const validAccIds = new Set(MODEL_SHEET_ACCESSORIES.map((item) => item.id));
    expect(validAccIds.size).toBe(6);
    for (const spec of MODEL_SHEET_ARCHETYPES) {
      expect(spec.requiredAccessories.length).toBeGreaterThanOrEqual(2);
      for (const acc of spec.requiredAccessories) {
        expect(validAccIds.has(acc)).toBe(true);
        expect(getAccessoryMeta(acc).labelKo.length).toBeGreaterThan(0);
      }
      expect(getHairPartMeta(spec.hairPartSide).labelKo.length).toBeGreaterThan(0);
    }
  });

  it("4대 비율 지표 키가 모두 메타·임계치와 매핑되어 있다", () => {
    expect(DRIFT_METRIC_KEYS).toEqual([
      "headToBodyRatio", "eyeSpacingRatio", "eyeHeightRatio", "jawWidthRatio",
    ]);
  });
});

describe("2. 1~60컷 회차 스캔 및 비율·소품 드리프트 감사 엔진", () => {
  it("기본 60컷 생성 및 컷 수 클램핑(0 이하→1, 80→60, NaN→60)이 안전하게 동작한다", () => {
    expect(generateEpisodeSampleCuts("romance-lead")).toHaveLength(60);
    expect(generateEpisodeSampleCuts("romance-lead", 0)).toHaveLength(1);
    expect(generateEpisodeSampleCuts("romance-lead", 120)).toHaveLength(60);
    expect(generateEpisodeSampleCuts("romance-lead", Number.NaN)).toHaveLength(60);
  });

  it("설정집 기준과 100% 일치하는 컷은 ok 등급·최대 편차 0.0%·100점을 반환한다", () => {
    const spec = getModelSheetSpec("action-hero");
    const audit = auditSingleCutDrift(spec, makeCleanCut("action-hero", 3));
    expect(audit.severity).toBe("ok");
    expect(audit.maxDeviationPct).toBe(0);
    expect(audit.missingAccessories).toHaveLength(0);
    expect(audit.hairPartMismatch).toBe(false);
    expect(audit.cutScore).toBe(100);
  });

  it("등신 비율이 허용 오차를 약간 넘기면 notice, 9% 초과 이탈하면 drift로 판정한다", () => {
    const spec = getModelSheetSpec("romance-lead");
    const noticeCut = { ...makeCleanCut("romance-lead"), headToBodyRatio: 7.45 }; // +6.4%
    const driftCut = { ...makeCleanCut("romance-lead"), headToBodyRatio: 6.1 }; // -12.9%

    expect(auditSingleCutDrift(spec, noticeCut).severity).toBe("notice");
    const driftAudit = auditSingleCutDrift(spec, driftCut);
    expect(driftAudit.severity).toBe("drift");
    expect(driftAudit.metrics.headToBodyRatio.signedPct).toBeLessThan(-10);
    expect(driftAudit.redPenCalloutsKo.some((c) => c.includes("등신 비율"))).toBe(true);
  });

  it("가르마 좌우 반전을 감지해 notice 이상으로 표시하고 붉은 펜 메모에 기록한다", () => {
    const spec = getModelSheetSpec("romance-lead");
    const flippedCut = { ...makeCleanCut("romance-lead"), hairPartSide: "right" as const };
    const audit = auditSingleCutDrift(spec, flippedCut);
    expect(audit.hairPartMismatch).toBe(true);
    expect(audit.severity).toBe("notice");
    expect(audit.cutScore).toBeLessThan(100);
    expect(audit.redPenCalloutsKo.some((c) => c.includes("가르마 반전"))).toBe(true);
  });

  it("필수 의상·장신구 1종 누락 시 notice, 2종 이상 누락 시 drift로 승격한다", () => {
    const spec = getModelSheetSpec("school-boy");
    const missOne = { ...makeCleanCut("school-boy"), presentAccessories: ["uniform-badge" as const] };
    const missTwo = { ...makeCleanCut("school-boy"), presentAccessories: [] };

    const a1 = auditSingleCutDrift(spec, missOne);
    expect(a1.missingAccessories).toEqual(["glasses"]);
    expect(a1.severity).toBe("notice");

    const a2 = auditSingleCutDrift(spec, missTwo);
    expect(a2.missingAccessories).toEqual(["uniform-badge", "glasses"]);
    expect(a2.severity).toBe("drift");
    expect(a2.cutScore).toBeLessThan(a1.cutScore);
  });

  it("60컷 전체 회차 감사에서 ok+notice+drift 합계가 60이고 최악 컷과 누락 소품을 정확히 집계한다", () => {
    const spec = getModelSheetSpec("romance-lead");
    const cuts = generateEpisodeSampleCuts("romance-lead", 60);
    const report = auditEpisodeModelSheetDrift({ spec, cuts });

    expect(report.totalCuts).toBe(60);
    expect(report.counts.ok + report.counts.notice + report.counts.drift).toBe(60);
    expect(report.counts.drift).toBeGreaterThanOrEqual(4);
    expect(report.consistencyScore).toBeGreaterThanOrEqual(0);
    expect(report.consistencyScore).toBeLessThanOrEqual(100);
    expect(report.topDriftCutNumbers[0]).toBe(report.worstCutNumber);
    expect(report.missingAccessoryTotals["earring-left"]).toBeGreaterThan(0);
  });

  it("빈 컷 배열이 전달돼도 안전하게 1컷 폴백으로 감사한다", () => {
    const spec = getModelSheetSpec("fantasy-sidekick");
    const report = auditEpisodeModelSheetDrift({ spec, cuts: [] });
    expect(report.totalCuts).toBe(1);
    expect(report.cutAudits).toHaveLength(1);
  });

  it("4종 아키타입 전부에 대해 60컷 감사 결과가 완전 결정론적이다", () => {
    for (const spec of MODEL_SHEET_ARCHETYPES) {
      const r1 = auditEpisodeModelSheetDrift({ spec, cuts: generateEpisodeSampleCuts(spec.id, 60) });
      const r2 = auditEpisodeModelSheetDrift({ spec, cuts: generateEpisodeSampleCuts(spec.id, 60) });
      expect(r1.consistencyScore).toBe(r2.consistencyScore);
      expect(r1.worstCutNumber).toBe(r2.worstCutNumber);
      expect(r1.counts).toEqual(r2.counts);
    }
  });
});

describe("3. 비파괴 Top-3 교정 후보 제안(최소 미세 보정 / 설정집 정밀 정합 / 의상·소품 복구)", () => {
  it("드리프트 컷에 대해 항상 3종 전략과 작가 승인 플래그를 생성한다", () => {
    const spec = getModelSheetSpec("romance-lead");
    const cut31 = generateEpisodeSampleCuts("romance-lead", 60)[30];
    expect(cut31).toBeDefined();
    if (!cut31) return;

    const top3 = proposeCutDriftCorrectionsTop3(spec, cut31);
    expect(top3).toHaveLength(3);
    expect(top3.map((c) => c.strategy)).toEqual(["minimal-nudge", "spec-exact", "accessory-full-restore"]);
    expect(top3.every((c) => c.requiresAuthorApproval)).toBe(true);
  });

  it("후보 1(최소 미세 보정)은 이탈 비율만 허용 오차 안으로 최소 이동하고 원래 편차 방향을 보존한다", () => {
    const spec = getModelSheetSpec("romance-lead");
    const drifted: EpisodeCutMetric = {
      ...makeCleanCut("romance-lead", 7),
      headToBodyRatio: 6.0, // -14.3%
      jawWidthRatio: 0.72,  // +16.1%
      presentAccessories: ["hairpin"],
    };
    const [minimal] = proposeCutDriftCorrectionsTop3(spec, drifted);
    expect(minimal.projectedAudit.metrics.headToBodyRatio.severity).toBe("ok");
    expect(minimal.projectedAudit.metrics.jawWidthRatio.severity).toBe("ok");
    // 원래 음수/양수 방향(개성) 유지
    expect(minimal.proposedMetrics.headToBodyRatio).toBeLessThan(spec.headToBodyRatio);
    expect(minimal.proposedMetrics.jawWidthRatio).toBeGreaterThan(spec.jawWidthRatio);
    // 소품은 비침습 유지
    expect(minimal.addedAccessories).toHaveLength(0);
  });

  it("후보 2(설정집 정밀 정합)는 4대 비율과 가르마를 설정집 기준 100%(편차 0.0%)에 맞춘다", () => {
    const spec = getModelSheetSpec("action-hero");
    const drifted: EpisodeCutMetric = {
      ...makeCleanCut("action-hero", 19),
      headToBodyRatio: 6.8,
      eyeSpacingRatio: 1.24,
      eyeHeightRatio: 0.56,
      jawWidthRatio: 0.62,
      hairPartSide: "left",
    };
    const [, exact] = proposeCutDriftCorrectionsTop3(spec, drifted);
    expect(exact.proposedMetrics.headToBodyRatio).toBe(spec.headToBodyRatio);
    expect(exact.proposedMetrics.eyeSpacingRatio).toBe(spec.eyeSpacingRatio);
    expect(exact.proposedMetrics.eyeHeightRatio).toBe(spec.eyeHeightRatio);
    expect(exact.proposedMetrics.jawWidthRatio).toBe(spec.jawWidthRatio);
    expect(exact.proposedMetrics.hairPartSide).toBe(spec.hairPartSide);
    expect(exact.projectedAudit.maxDeviationPct).toBe(0);
    expect(exact.restoresHairPart).toBe(true);
  });

  it("후보 3(의상·소품 체크 복구)은 누락 장신구 오버레이를 전량 복구하고 점수를 크게 올린다", () => {
    const spec = getModelSheetSpec("fantasy-sidekick");
    const drifted: EpisodeCutMetric = {
      ...makeCleanCut("fantasy-sidekick", 31),
      headToBodyRatio: 4.8,
      hairPartSide: "right",
      presentAccessories: [],
    };
    const [, , restore] = proposeCutDriftCorrectionsTop3(spec, drifted);
    expect(restore.addedAccessories).toEqual(spec.requiredAccessories);
    expect(restore.projectedAudit.missingAccessories).toHaveLength(0);
    expect(restore.projectedAudit.hairPartMismatch).toBe(false);
    expect(restore.projectedAudit.severity).toBe("ok");
    expect(restore.scoreGain).toBeGreaterThan(25);
  });

  it("정상 컷에서도 오류 없이 무변형 후보를 반환한다", () => {
    const spec = getModelSheetSpec("school-boy");
    const clean = makeCleanCut("school-boy", 2);
    const top3 = proposeCutDriftCorrectionsTop3(spec, clean);
    expect(top3[0].adjustedFields).toHaveLength(0);
    expect(top3[2].projectedAudit.cutScore).toBe(100);
  });
});

describe("4. 비파괴 상태 머신(미리보기·적용·원복·이력) 및 Markdown/JSON 리포트", () => {
  it("세션 초기화 시 60컷을 스캔하고 가장 심한 문제 컷을 자동 선택한다", () => {
    const session = createDriftCoachSession("romance-lead", 60);
    const audit = auditEpisodeModelSheetDrift({ spec: getModelSheetSpec("romance-lead"), cuts: session.workingCuts });
    expect(session.workingCuts).toHaveLength(60);
    expect(session.selectedCutNumber).toBe(audit.worstCutNumber);
    expect(session.approvalHistory).toHaveLength(0);
  });

  it("미리보기 토글은 workingCuts를 전혀 변경하지 않으며 같은 후보 재클릭 시 해제된다", () => {
    const s0 = createDriftCoachSession("romance-lead", 60);
    const spec = getModelSheetSpec("romance-lead");
    const targetCut = s0.workingCuts.find((c) => c.cutNumber === s0.selectedCutNumber);
    expect(targetCut).toBeDefined();
    if (!targetCut) return;
    const [cand] = proposeCutDriftCorrectionsTop3(spec, targetCut);

    const s1 = previewCutCorrection(s0, cand.id);
    expect(s1.previewCandidateId).toBe(cand.id);
    expect(s1.workingCuts).toEqual(s0.workingCuts);

    const s2 = previewCutCorrection(s1, cand.id);
    expect(s2.previewCandidateId).toBeNull();
  });

  it("동일 컷에 보정을 2회 연속 적용해도 원복 시 최초 원본 스냅샷으로 100% 복원된다", () => {
    const s0 = createDriftCoachSession("romance-lead", 60);
    const spec = getModelSheetSpec("romance-lead");
    const cutNum = s0.selectedCutNumber;
    const origCut = s0.workingCuts.find((c) => c.cutNumber === cutNum);
    expect(origCut).toBeDefined();
    if (!origCut) return;

    const [cand1, , cand3] = proposeCutDriftCorrectionsTop3(spec, origCut);
    const s1 = applyCutCorrection(s0, cutNum, cand1);
    const s2 = applyCutCorrection(s1, cutNum, cand3);
    expect(s2.appliedFixByCut[cutNum]?.strategy).toBe("accessory-full-restore");
    expect(s2.approvalHistory).toHaveLength(2);

    const s3 = revertCutCorrection(s2, cutNum);
    expect(s3.appliedFixByCut[cutNum]).toBeUndefined();
    expect(s3.workingCuts.find((c) => c.cutNumber === cutNum)).toEqual(origCut);
    expect(s3.approvalHistory[0]?.action).toBe("revert");
  });

  it("전체 원복은 여러 컷에 적용된 보정과 시뮬레이션 수정을 모두 초기 스캔 기준으로 되돌린다", () => {
    let s = createDriftCoachSession("action-hero", 60);
    const spec = getModelSheetSpec("action-hero");
    const c7 = s.workingCuts.find((c) => c.cutNumber === 7);
    const c31 = s.workingCuts.find((c) => c.cutNumber === 31);
    if (!c7 || !c31) return;

    s = applyCutCorrection(s, 7, proposeCutDriftCorrectionsTop3(spec, c7)[2]);
    s = applyCutCorrection(s, 31, proposeCutDriftCorrectionsTop3(spec, c31)[2]);
    expect(Object.keys(s.appliedFixByCut)).toHaveLength(2);

    const reset = revertAllCutCorrections(s);
    expect(Object.keys(reset.appliedFixByCut)).toHaveLength(0);
    expect(reset.workingCuts).toEqual(reset.baselineCuts);
    expect(reset.approvalHistory[0]?.action).toBe("revert-all");
  });

  it("시뮬레이션 업데이트는 극단값을 안전하게 클램핑하고 존재하지 않는 컷은 무시한다", () => {
    const s0 = createDriftCoachSession("school-boy", 20);
    const s1 = simulateCutMetricUpdate(s0, 1, {
      headToBodyRatio: 99,
      eyeSpacingRatio: -5,
      presentAccessories: ["glasses", "glasses"],
    });
    const cut1 = s1.workingCuts[0];
    expect(cut1?.headToBodyRatio).toBe(9.0);
    expect(cut1?.eyeSpacingRatio).toBe(0.72);
    expect(cut1?.presentAccessories).toEqual(["glasses"]);

    expect(simulateCutMetricUpdate(s0, 999, { headToBodyRatio: 7.0 })).toBe(s0);
    expect(selectDriftCoachCut(s0, 999)).toBe(s0);
  });

  it("Markdown 검수 리포트는 국문/영문 헤더·점수·검수 대상 컷·승인 이력을 포함한다", () => {
    let s = createDriftCoachSession("romance-lead", 60);
    const spec = getModelSheetSpec("romance-lead");
    const cut = s.workingCuts.find((c) => c.cutNumber === s.selectedCutNumber);
    if (!cut) return;
    s = applyCutCorrection(s, cut.cutNumber, proposeCutDriftCorrectionsTop3(spec, cut)[2]);
    const audit = auditEpisodeModelSheetDrift({ spec, cuts: s.workingCuts });

    const mdKo = exportDriftReportMarkdown({ audit, session: s, locale: "ko" });
    expect(mdKo).toContain("# 회차 캐릭터 작화·비율 흔들림 검수 리포트");
    expect(mdKo).toContain("로맨스 여주");
    expect(mdKo).toContain("적용됨 (의상·소품 체크 복구)");

    const mdEn = exportDriftReportMarkdown({ audit, session: s, locale: "en" });
    expect(mdEn).toContain("# Cross-Cut Model Sheet Drift Audit Report");
    expect(mdEn).toContain("Applied (Costume & Prop Restore)");
  });

  it("JSON 검수 리포트는 스키마 버전·요약·문제 컷·적용 이력을 유효한 JSON으로 직렬화한다", () => {
    const s = createDriftCoachSession("action-hero", 60);
    const audit = auditEpisodeModelSheetDrift({ spec: getModelSheetSpec("action-hero"), cuts: s.workingCuts });
    const parsed = JSON.parse(exportDriftReportJson({ audit, session: s })) as {
      schema: string;
      summary: { totalCuts: number; consistencyScore: number };
      flaggedCuts: readonly unknown[];
    };
    expect(parsed.schema).toBe("toonstudio.crosscut-modelsheet-drift-coach.v1");
    expect(parsed.summary.totalCuts).toBe(60);
    expect(parsed.flaggedCuts.length).toBeGreaterThan(0);
  });
});

describe("5. StudioModelSheetDriftCoachPanel UI 인터랙션 및 SVG 붉은 펜 실시간 반영", () => {
  it("Props 없이 단독 렌더되며 60컷 타임라인·점수 배지·붉은 펜 SVG를 표시한다", () => {
    render(<StudioModelSheetDriftCoachPanel />);
    expect(screen.getByTestId("modelsheet-drift-coach-panel")).toBeTruthy();
    expect(screen.getByTestId("drift-approval-badge").textContent).toContain("작가 승인 후 적용");
    expect(screen.getByTestId("episode-consistency-badge")).toBeTruthy();
    expect(screen.getByTestId("modelsheet-redpen-svg")).toBeTruthy();
    expect(screen.getByTestId("drift-cut-btn-1")).toBeTruthy();
    expect(screen.getByTestId("drift-cut-btn-60")).toBeTruthy();
  });

  it("아키타입 버튼 전환 시 설정집 기준(액션 남주 7.8등신)으로 즉시 재스캔한다", () => {
    render(<StudioModelSheetDriftCoachPanel />);
    fireEvent.click(screen.getByTestId("archetype-btn-action-hero"));
    expect(screen.getByTestId("archetype-btn-action-hero").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("modelsheet-redpen-svg").textContent).toContain("7.8등신");
    expect(screen.getByTestId("acc-toggle-cheek-scar")).toBeTruthy();
  });

  it("컷 필터(문제 컷/전체)와 타임라인 컷 선택이 정상 동작한다", () => {
    render(<StudioModelSheetDriftCoachPanel />);
    fireEvent.click(screen.getByTestId("cut-filter-flagged"));
    expect(screen.queryByTestId("drift-cut-btn-1")).toBeNull();
    expect(screen.getByTestId("drift-cut-btn-31")).toBeTruthy();

    fireEvent.click(screen.getByTestId("drift-cut-btn-19"));
    expect(screen.getByTestId("selected-cut-heading").textContent).toContain("19컷");
    expect(screen.getByTestId("redpen-hair-flag")).toBeTruthy();
  });

  it("슬라이더 조작과 필수 소품 토글이 SVG 붉은 펜 오버레이에 실시간 반영된다", () => {
    render(<StudioModelSheetDriftCoachPanel />);
    fireEvent.click(screen.getByTestId("drift-cut-btn-1"));
    expect(screen.getByTestId("modelsheet-redpen-svg").getAttribute("data-severity")).toBe("ok");

    fireEvent.change(screen.getByTestId("slider-headToBodyRatio"), { target: { value: "5.8" } });
    expect(screen.getByTestId("modelsheet-redpen-svg").getAttribute("data-severity")).toBe("drift");
    expect(screen.getByTestId("modelsheet-redpen-svg").getAttribute("data-head-ratio")).toBe("5.80");

    fireEvent.click(screen.getByTestId("acc-toggle-earring-left"));
    expect(screen.getByTestId("redpen-acc-earring-left").getAttribute("data-missing")).toBe("true");
  });

  it("Top-3 후보 미리보기 → 비파괴 적용 → 선택 컷 원복 흐름이 SVG·점수·콜백과 동기화된다", () => {
    const onApply = vi.fn();
    const onRevert = vi.fn();
    render(<StudioModelSheetDriftCoachPanel onApplyFix={onApply} onRevertFix={onRevert} />);

    // 초기 최악 컷(31컷)에서 후보 3 미리보기
    fireEvent.click(screen.getByTestId("proposal-preview-btn-3"));
    expect(screen.getByTestId("redpen-preview-banner")).toBeTruthy();
    expect(screen.getByTestId("modelsheet-redpen-svg").getAttribute("data-preview-mode")).toBe("true");
    expect(screen.getByTestId("modelsheet-redpen-svg").getAttribute("data-missing-count")).toBe("0");
    expect(onApply).not.toHaveBeenCalled();

    // 비파괴 적용
    fireEvent.click(screen.getByTestId("proposal-apply-btn-3"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("kpi-applied-count").textContent).toBe("1");
    expect(screen.getByTestId("modelsheet-redpen-svg").getAttribute("data-severity")).toBe("ok");
    expect((screen.getByTestId("revert-selected-cut-btn") as HTMLButtonElement).disabled).toBe(false);

    // 선택 컷 원복
    fireEvent.click(screen.getByTestId("proposal-revert-btn-3"));
    expect(onRevert).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("kpi-applied-count").textContent).toBe("0");
    expect((screen.getByTestId("revert-selected-cut-btn") as HTMLButtonElement).disabled).toBe(true);
  });

  it("전체 원복 버튼이 onRevertFix('all') 콜백을 호출하고 이력을 갱신한다", () => {
    const onRevert = vi.fn();
    render(<StudioModelSheetDriftCoachPanel onRevertFix={onRevert} />);
    fireEvent.click(screen.getByTestId("proposal-apply-btn-2"));
    fireEvent.click(screen.getByTestId("revert-all-cuts-btn"));
    expect(onRevert).toHaveBeenCalledWith("all", expect.any(Object));
    expect(screen.getByTestId("kpi-applied-count").textContent).toBe("0");
  });

  it("Markdown 및 JSON 리포트 복사 버튼이 콜백을 호출하고 미리보기를 토글한다", () => {
    const onExport = vi.fn();
    render(<StudioModelSheetDriftCoachPanel onExportReport={onExport} />);

    expect(screen.queryByTestId("drift-report-preview")).toBeNull();
    fireEvent.click(screen.getByTestId("export-markdown-btn"));
    expect(onExport).toHaveBeenCalledWith("markdown", expect.stringContaining("# 회차 캐릭터"), expect.any(Object));
    expect(screen.getByTestId("drift-report-preview").getAttribute("data-format")).toBe("markdown");

    fireEvent.click(screen.getByTestId("export-json-btn"));
    expect(onExport).toHaveBeenCalledWith("json", expect.stringContaining("toonstudio.crosscut-modelsheet-drift-coach.v1"), expect.any(Object));
    expect(screen.getByTestId("drift-report-preview").getAttribute("data-format")).toBe("json");

    fireEvent.click(screen.getByTestId("toggle-report-preview-btn"));
    expect(screen.queryByTestId("drift-report-preview")).toBeNull();
  });

  it("영문 로케일(locale='en')이 UI·승인 배지·리포트에 일관되게 반영된다", () => {
    render(<StudioModelSheetDriftCoachPanel locale="en" initialArchetypeId="school-boy" />);
    expect(screen.getByTestId("drift-approval-badge").textContent).toContain("Author Approval Required");
    expect(screen.getByTestId("modelsheet-redpen-svg").textContent).toContain("6.5H SPEC");
  });
});

describe("6. 코드 위생 · 탈-바이올렛 OKLCH · Calm Atelier 계약 자가 검증", () => {
  it("4개 소유 파일 800줄 이하 및 금지 패턴(원시 색·transition-all·= {}·스토리지·private Map store·BigInt·Sparkles) 0건", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "modelsheet-drift-engine.ts",
      "StudioModelSheetDriftCoachPanel.tsx",
      "index.ts",
      "modelsheet-drift-coach.test.tsx",
    ];
    for (const file of required) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allFiles.sort()).toEqual([...required].sort());

    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);

      if (file !== "modelsheet-drift-coach.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
        expect(src).not.toContain("Sparkles");
        expect(src).not.toContain("하는 것을 가능하게 합니다");
        expect(src).not.toContain("직관적인 경험을 제공합니다");
        expect(src).not.toContain("원활한 워크플로우를 보장합니다");
      }

      if (file === "StudioModelSheetDriftCoachPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("motion-reduce:transition-none");
      }
    }
  });

  it("SVG 및 스타일의 모든 oklch() 색상이 바이올렛 휴 대역(270~320도)을 0% 배제한다", () => {
    const panelSrc = readFileSync(
      path.resolve(import.meta.dirname, "StudioModelSheetDriftCoachPanel.tsx"),
      "utf8",
    );
    const matches = [...panelSrc.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s*\)/gu)];
    expect(matches.length).toBeGreaterThanOrEqual(4);
    for (const match of matches) {
      const hue = Number(match[1]);
      expect(hue < 270 || hue > 320).toBe(true);
    }
  });

  it("렌더된 패널 내 모든 버튼이 min-h-11 접근성 터치 타깃을 충족한다", () => {
    const { container } = render(<StudioModelSheetDriftCoachPanel />);
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThan(60);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }
  });
});
