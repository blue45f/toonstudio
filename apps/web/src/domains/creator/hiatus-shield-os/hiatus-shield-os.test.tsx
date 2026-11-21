// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assessBufferAndBurnoutRisk,
  buildStyleLockHandoffKit,
  computeHiatusOklchDeltaE,
  createInitialHiatusShieldState,
  declareMemberAbsenceAndReleaseSlices,
  formatHandoffKitChecklistText,
  formatHiatusOklchCss,
  generateEmergencyDefenseScenarios,
  rankEmergencyStandbyArtists,
  serializeHandoffKitToJson,
  splitBottleneckSliceIntoMicroSlices,
  transferSliceLeaseToStandby,
  validateStyleLockHandoffKit,
  verifyCutCoverageInvariant,
  type ActiveCutSlice,
  type MicroSliceAssignee,
  type StandbyArtistCandidate,
} from "./hiatus-delay-prevention-engine";
import { StudioHiatusShieldPanel } from "./StudioHiatusShieldPanel";

import { createProductionDemoProject } from "../production-hub/production-demo";
import { StudioDivisionOsHub } from "../production-hub/division-os/StudioDivisionOsHub";
import { useI18n } from "@/shared/lib/i18n";

const BASE_ISO = "2026-11-21T15:00:00.000Z";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("Pillar 1 — 비축 원고(Buffer) 건강도 & 번아웃 조기 경보 레이더", () => {
  it("1. 비축 원고 주수 경계(>=3주 green, 1~2주 amber, 0주 red)를 정확히 판정한다", () => {
    const seed = createInitialHiatusShieldState({ nowIso: BASE_ISO });
    const safeMembers = seed.members.map((m) => ({
      ...m,
      overtimeHoursThisWeek: 2,
      wristFatigueScore: 20,
      neckFatigueScore: 20,
      dailyCutVelocity: m.baselineDailyVelocity,
      status: "active" as const,
    }));

    const green = assessBufferAndBurnoutRisk({
      episodeId: "ep-14",
      episodeTitle: "밤의 우편배달부",
      bufferWeeks: 3,
      hoursUntilDeadline: 48,
      remainingCuts: 20,
      targetTotalCuts: 80,
      members: safeMembers,
    });
    const amber = assessBufferAndBurnoutRisk({
      episodeId: "ep-14",
      episodeTitle: "밤의 우편배달부",
      bufferWeeks: 2,
      hoursUntilDeadline: 48,
      remainingCuts: 20,
      targetTotalCuts: 80,
      members: safeMembers,
    });
    const red = assessBufferAndBurnoutRisk({
      episodeId: "ep-14",
      episodeTitle: "밤의 우편배달부",
      bufferWeeks: 0,
      hoursUntilDeadline: 48,
      remainingCuts: 20,
      targetTotalCuts: 80,
      members: safeMembers,
    });

    expect(green.bufferTier).toBe("green");
    expect(green.overallTier).toBe("green");
    expect(amber.bufferTier).toBe("amber");
    expect(amber.overallTier).toBe("amber");
    expect(red.bufferTier).toBe("red");
    expect(red.overallTier).toBe("red");
  });

  it("2. 야근·손목·목 피로도·속도 저하를 통합해 번아웃 지수를 결정론적으로 산출하고 고위험 순으로 정렬한다", () => {
    const seed = createInitialHiatusShieldState({ nowIso: BASE_ISO });
    const reportA = assessBufferAndBurnoutRisk({
      episodeId: seed.episodeId,
      episodeTitle: seed.projectTitle,
      bufferWeeks: 2,
      hoursUntilDeadline: 24,
      remainingCuts: 35,
      targetTotalCuts: 80,
      members: seed.members,
    });
    const reportB = assessBufferAndBurnoutRisk({
      episodeId: seed.episodeId,
      episodeTitle: seed.projectTitle,
      bufferWeeks: 2,
      hoursUntilDeadline: 24,
      remainingCuts: 35,
      targetTotalCuts: 80,
      members: seed.members,
    });

    expect(reportA).toEqual(reportB);
    expect(reportA.memberRisks[0]?.memberId).toBe("mem-line-1");
    expect(reportA.memberRisks[0]?.burnoutIndex).toBeGreaterThanOrEqual(75);
    expect(reportA.memberRisks[0]?.alertTier).toBe("red");
    expect(reportA.highBurnoutMemberCount).toBe(1);
  });

  it("3. 마감 잔여 시간이 줄어들수록 지연 예측 시간과 휴재 확률(%)이 단조 증가한다", () => {
    const seed = createInitialHiatusShieldState({ nowIso: BASE_ISO });
    const relaxed = assessBufferAndBurnoutRisk({
      episodeId: seed.episodeId,
      episodeTitle: seed.projectTitle,
      bufferWeeks: 1,
      hoursUntilDeadline: 36,
      remainingCuts: 50,
      targetTotalCuts: 80,
      members: seed.members,
    });
    const tight = assessBufferAndBurnoutRisk({
      episodeId: seed.episodeId,
      episodeTitle: seed.projectTitle,
      bufferWeeks: 1,
      hoursUntilDeadline: 10,
      remainingCuts: 50,
      targetTotalCuts: 80,
      members: seed.members,
    });

    expect(tight.projectedDelayHours).toBeGreaterThan(relaxed.projectedDelayHours);
    expect(tight.hiatusProbabilityPct).toBeGreaterThan(relaxed.hiatusProbabilityPct);
  });

  it("4. 결원 발생 시 휴재 확률이 상승하고, 긴급 대타 투입 보정 시 지연 시간과 휴재 확률이 하락한다", () => {
    const seed = createInitialHiatusShieldState({ nowIso: BASE_ISO });
    const withAbsence = seed.members.map((m) =>
      m.memberId === "mem-line-1"
        ? { ...m, status: "absent" as const, absenceReason: "injury" as const }
        : m,
    );

    const uncovered = assessBufferAndBurnoutRisk({
      episodeId: seed.episodeId,
      episodeTitle: seed.projectTitle,
      bufferWeeks: 1,
      hoursUntilDeadline: 14,
      remainingCuts: 45,
      targetTotalCuts: 80,
      members: withAbsence,
    });
    const covered = assessBufferAndBurnoutRisk({
      episodeId: seed.episodeId,
      episodeTitle: seed.projectTitle,
      bufferWeeks: 1,
      hoursUntilDeadline: 14,
      remainingCuts: 45,
      targetTotalCuts: 80,
      members: withAbsence,
      reliefDailyCuts: 18,
      coveredAbsenceCount: 1,
    });

    expect(uncovered.uncoveredAbsenceCount).toBe(1);
    expect(covered.uncoveredAbsenceCount).toBe(0);
    expect(covered.projectedDelayHours).toBeLessThan(uncovered.projectedDelayHours);
    expect(covered.hiatusProbabilityPct).toBeLessThan(uncovered.hiatusProbabilityPct);
  });

  it("5. 전원 결원(팀 실효 속도 0) 상황에서도 NaN/Infinity 없이 결정론적 지연 시간과 경보를 산출한다", () => {
    const seed = createInitialHiatusShieldState({ nowIso: BASE_ISO });
    const allAbsent = seed.members.map((m) => ({
      ...m,
      status: "absent" as const,
      absenceReason: "illness" as const,
    }));
    const report = assessBufferAndBurnoutRisk({
      episodeId: seed.episodeId,
      episodeTitle: seed.projectTitle,
      bufferWeeks: 0,
      hoursUntilDeadline: 12,
      remainingCuts: 30,
      targetTotalCuts: 80,
      members: allAbsent,
    });

    expect(Number.isFinite(report.projectedDelayHours)).toBe(true);
    expect(report.projectedDelayHours).toBeGreaterThan(0);
    expect(report.hiatusProbabilityPct).toBe(100);
    expect(report.overallTier).toBe("red");
    expect(report.earlyWarnings.length).toBeGreaterThanOrEqual(2);
  });

  it("6. 잔여 컷이 0컷이면 소요 시간과 지연 예측 모두 0시간으로 계산한다", () => {
    const seed = createInitialHiatusShieldState({ nowIso: BASE_ISO });
    const done = assessBufferAndBurnoutRisk({
      episodeId: seed.episodeId,
      episodeTitle: seed.projectTitle,
      bufferWeeks: 3,
      hoursUntilDeadline: 12,
      remainingCuts: 0,
      targetTotalCuts: 80,
      members: seed.members,
    });
    expect(done.estimatedHoursNeeded).toBe(0);
    expect(done.projectedDelayHours).toBe(0);
  });
});

describe("Pillar 2 — 결원 선언 컷 무손실/무중복 이관 & 국내+글로벌 10분 긴급 대타 매칭", () => {
  it("7. 결원 선언 시 완료 컷(6컷)은 무손실 잠금 보존하고 미완료 컷(19컷)만 해제하며 전체 80컷 무중복/무누락을 유지한다", () => {
    const seed = createInitialHiatusShieldState({ nowIso: BASE_ISO });
    const res = declareMemberAbsenceAndReleaseSlices({
      members: seed.members,
      slices: seed.slices,
      targetTotalCuts: seed.targetTotalCuts,
      memberId: "mem-line-1",
      reason: "injury",
      nowIso: BASE_ISO,
    });

    expect(res.ok).toBe(true);
    expect(res.preservedCompletedCuts).toBe(6);
    expect(res.releasedUnfinishedCuts).toBe(19);
    expect(res.releasedSliceIds).toEqual(["ep-14-slice-02-sos"]);
    expect(res.invariant.preserved).toBe(true);
    expect(res.invariant.overlapCount).toBe(0);
    expect(res.invariant.gapCount).toBe(0);
    expect(res.invariant.coveredCutCount).toBe(80);

    const donePart = res.slices.find((s) => s.sliceId === "ep-14-slice-02-done");
    const sosPart = res.slices.find((s) => s.sliceId === "ep-14-slice-02-sos");
    expect(donePart?.startCut).toBe(21);
    expect(donePart?.endCut).toBe(26);
    expect(donePart?.lockStatus).toBe("completed_locked");
    expect(sosPart?.startCut).toBe(27);
    expect(sosPart?.endCut).toBe(45);
    expect(sosPart?.lockStatus).toBe("released_sos");
    expect(sosPart?.holderId).toBeNull();
  });

  it("8. 완료 컷이 0컷인 슬라이스는 분리 없이 통째로 잠금 해제되며 컷 불변성을 유지한다", () => {
    const seed = createInitialHiatusShieldState({ nowIso: BASE_ISO });
    const zeroDoneSlices: ActiveCutSlice[] = seed.slices.map((s) =>
      s.sliceId === "ep-14-slice-02" ? { ...s, completedCount: 0 } : s,
    );
    const res = declareMemberAbsenceAndReleaseSlices({
      members: seed.members,
      slices: zeroDoneSlices,
      targetTotalCuts: 80,
      memberId: "mem-line-1",
      reason: "unresponsive",
      nowIso: BASE_ISO,
    });

    expect(res.ok).toBe(true);
    expect(res.preservedCompletedCuts).toBe(0);
    expect(res.releasedUnfinishedCuts).toBe(25);
    expect(res.releasedSliceIds).toEqual(["ep-14-slice-02"]);
    expect(res.invariant.preserved).toBe(true);
  });

  it("9. OKLCH 색차 ΔE와 순수 OKLCH CSS 포맷이 정확하고 원시 HEX를 출력하지 않는다", () => {
    expect(
      computeHiatusOklchDeltaE({ l: 0.34, c: 0.08, h: 248 }, { l: 0.34, c: 0.08, h: 248 }),
    ).toBe(0);
    expect(
      computeHiatusOklchDeltaE({ l: 0.34, c: 0.08, h: 248 }, { l: 0.72, c: 0.2, h: 35 }),
    ).toBeGreaterThan(25);
    const css = formatHiatusOklchCss({ l: 0.87, c: 0.05, h: 58 });
    expect(css).toBe("oklch(0.87 0.05 58)");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}/iu);
  });

  it("10. 국내+동남아/글로벌 검증 예비 풀 랭킹은 공정 일치 후보만 선별하며 반복 실행 시 100% 결정론적이다", () => {
    const seed = createInitialHiatusShieldState({ nowIso: BASE_ISO });
    const first = rankEmergencyStandbyArtists({
      pool: seed.standbyPool,
      neededStage: "line",
      remainingCuts: 19,
      styleTarget: seed.styleTarget,
      topN: 5,
    });
    const second = rankEmergencyStandbyArtists({
      pool: seed.standbyPool,
      neededStage: "line",
      remainingCuts: 19,
      styleTarget: seed.styleTarget,
      topN: 5,
    });

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThanOrEqual(4);
    expect(first.every((m) => m.candidate.stages.includes("line"))).toBe(true);
    expect(first.some((m) => m.candidate.regionGroup === "domestic")).toBe(true);
    expect(first.some((m) => m.candidate.regionGroup === "global_sea")).toBe(true);
    for (let i = 1; i < first.length; i += 1) {
      expect((first[i - 1]?.totalScore ?? 0) >= (first[i]?.totalScore ?? 0)).toBe(true);
    }
  });

  it("11. 10분 즉시 투입 가능하고 화풍 호환(선폭·OKLCH ΔE·톤)이 높은 대타가 오프라인·이질 화풍 대타보다 우선 추천된다", () => {
    const seed = createInitialHiatusShieldState({ nowIso: BASE_ISO });
    const ranked = rankEmergencyStandbyArtists({
      pool: seed.standbyPool,
      neededStage: "line",
      remainingCuts: 19,
      styleTarget: seed.styleTarget,
      topN: 5,
    });

    const top = ranked[0];
    const offline = ranked.find((m) => m.candidate.artistId === "sos-ph-01");
    expect(top?.canDeployInTenMinutes).toBe(true);
    expect(top?.oklchDeltaE).toBeLessThan(3);
    expect(offline?.canDeployInTenMinutes).toBe(false);
    expect((top?.totalScore ?? 0) - (offline?.totalScore ?? 0)).toBeGreaterThan(15);
  });

  it("12. 예산 상한 초과 대타는 budgetFitScore가 감점되고, 국내/글로벌 지역 필터가 정확히 동작한다", () => {
    const seed = createInitialHiatusShieldState({ nowIso: BASE_ISO });
    const rankedAll = rankEmergencyStandbyArtists({
      pool: seed.standbyPool,
      neededStage: "line",
      remainingCuts: 20,
      styleTarget: seed.styleTarget,
      topN: 10,
    });
    const overBudgetJp = rankedAll.find((m) => m.candidate.artistId === "sos-jp-01");
    const underBudgetVn = rankedAll.find((m) => m.candidate.artistId === "sos-vn-01");
    expect((underBudgetVn?.budgetFitScore ?? 0)).toBeGreaterThan(overBudgetJp?.budgetFitScore ?? 100);

    const domesticOnly = rankEmergencyStandbyArtists({
      pool: seed.standbyPool,
      neededStage: "line",
      remainingCuts: 20,
      styleTarget: seed.styleTarget,
      regionFilter: "domestic",
    });
    const globalOnly = rankEmergencyStandbyArtists({
      pool: seed.standbyPool,
      neededStage: "line",
      remainingCuts: 20,
      styleTarget: seed.styleTarget,
      regionFilter: "global_sea",
    });
    expect(domesticOnly.every((m) => m.candidate.regionGroup === "domestic")).toBe(true);
    expect(globalOnly.every((m) => m.candidate.regionGroup === "global_sea")).toBe(true);
  });

  it("13. 1클릭 리스 이관은 leaseToken 발급과 80컷 무결성을 보장하고, 미해제·미자격 이관은 Fail-Closed 차단한다", () => {
    const seed = createInitialHiatusShieldState({ nowIso: BASE_ISO });
    const released = declareMemberAbsenceAndReleaseSlices({
      members: seed.members,
      slices: seed.slices,
      targetTotalCuts: 80,
      memberId: "mem-line-1",
      reason: "illness",
      nowIso: BASE_ISO,
    });
    const topArtist = seed.standbyPool[0] as StandbyArtistCandidate;
    const bgOnlyArtist = seed.standbyPool.find((c) => c.artistId === "sos-kr-02") as StandbyArtistCandidate;

    // 미해제 슬라이스 이관 차단
    const lockedAttempt = transferSliceLeaseToStandby({
      slices: seed.slices,
      targetTotalCuts: 80,
      sliceId: "ep-14-slice-02",
      candidate: topArtist,
      handoffKitId: "kit-test",
      nowIso: BASE_ISO,
    });
    expect(lockedAttempt.ok).toBe(false);

    // 공정 불일치 대타 차단
    const wrongStage = transferSliceLeaseToStandby({
      slices: released.slices,
      targetTotalCuts: 80,
      sliceId: "ep-14-slice-02-sos",
      candidate: bgOnlyArtist,
      handoffKitId: "kit-test",
      nowIso: BASE_ISO,
    });
    expect(wrongStage.ok).toBe(false);

    // 정상 이관 성공 및 무결성 유지
    const transferred = transferSliceLeaseToStandby({
      slices: released.slices,
      targetTotalCuts: 80,
      sliceId: "ep-14-slice-02-sos",
      candidate: topArtist,
      handoffKitId: "kit-ep-14-sos-kr-01",
      nowIso: BASE_ISO,
    });
    expect(transferred.ok).toBe(true);
    expect(transferred.leaseToken).toMatch(/^sos-lease-ep-14-/u);
    expect(transferred.invariant.preserved).toBe(true);

    // 이미 이관된 슬라이스 재이관 차단
    const duplicate = transferSliceLeaseToStandby({
      slices: transferred.slices,
      targetTotalCuts: 80,
      sliceId: "ep-14-slice-02-sos",
      candidate: topArtist,
      handoffKitId: "kit-dup",
      nowIso: BASE_ISO,
    });
    expect(duplicate.ok).toBe(false);
  });
});

describe("Pillar 3 — 10분 작화 통일 인계 키트(Style-Lock Continuity Handoff Kit)", () => {
  it("14. 인계 키트 5대 필수 항목이 완비되고 validateStyleLockHandoffKit 100% 통과한다", () => {
    const kit = buildStyleLockHandoffKit({
      episodeId: "ep-14",
      sliceId: "ep-14-slice-02-sos",
      stage: "line",
      startCut: 27,
      endCut: 45,
      targetArtistId: "sos-vn-01",
      targetArtistName: "Nguyen Minh Anh",
      targetLineWidthPx: 2.3,
      nowIso: BASE_ISO,
    });

    expect(kit.onboardingBudgetMinutes).toBe(10);
    expect(kit.artBiblePalette.length).toBeGreaterThanOrEqual(4);
    expect(kit.brushLineSpecs.length).toBeGreaterThanOrEqual(3);
    expect(kit.previousTwoCuts).toHaveLength(2);
    expect(kit.previousTwoCuts[0]?.cutIndex).toBe(25);
    expect(kit.previousTwoCuts[1]?.cutIndex).toBe(26);
    expect(kit.bg3dCameraPresets.length).toBeGreaterThanOrEqual(2);
    expect(kit.forbiddenChecklist.length).toBeGreaterThanOrEqual(5);
    expect(kit.validation.valid).toBe(true);
    expect(kit.validation.completenessPct).toBe(100);
    expect(kit.validation.missingSections).toHaveLength(0);
  });

  it("15. 회차 시작 경계(startCut = 1, 2)에서도 직전 2컷 레퍼런스 안전 폴백을 생성한다", () => {
    const cut1Kit = buildStyleLockHandoffKit({
      episodeId: "ep-14",
      sliceId: "ep-14-slice-01",
      stage: "line",
      startCut: 1,
      endCut: 15,
      targetArtistId: "sos-kr-01",
      targetArtistName: "김하린",
      targetLineWidthPx: 2.2,
      nowIso: BASE_ISO,
    });
    expect(cut1Kit.previousTwoCuts).toHaveLength(2);
    expect(cut1Kit.previousTwoCuts[0]?.cutIndex).toBe(1);
    expect(cut1Kit.previousTwoCuts[1]?.cutIndex).toBe(2);
    expect(cut1Kit.previousTwoCuts[0]?.isBoundaryFallback).toBe(true);
    expect(cut1Kit.validation.valid).toBe(true);
  });

  it("16. 필수 항목이 누락되거나 브러시 규격이 잘못되면 validateStyleLockHandoffKit이 Fail-Closed 차단한다", () => {
    const validKit = buildStyleLockHandoffKit({
      episodeId: "ep-14",
      sliceId: "ep-14-slice-02",
      stage: "line",
      startCut: 21,
      endCut: 45,
      targetArtistId: "sos-kr-01",
      targetArtistName: "김하린",
      targetLineWidthPx: 2.3,
      nowIso: BASE_ISO,
    });

    const broken = validateStyleLockHandoffKit({
      ...validKit,
      artBiblePalette: [],
      previousTwoCuts: validKit.previousTwoCuts.slice(0, 1),
      forbiddenChecklist: [],
    });

    expect(broken.valid).toBe(false);
    expect(broken.completenessPct).toBe(40);
    expect(broken.missingSections).toEqual([
      "artBiblePalette",
      "previousTwoCuts",
      "forbiddenChecklist",
    ]);
  });

  it("17. 인계 키트 JSON 직렬화는 원시 HEX 없이 파싱 가능하며 체크리스트 텍스트에 5대 섹션이 모두 담긴다", () => {
    const kit = buildStyleLockHandoffKit({
      episodeId: "ep-14",
      sliceId: "ep-14-slice-02",
      stage: "line",
      startCut: 21,
      endCut: 45,
      targetArtistId: "sos-kr-01",
      targetArtistName: "김하린",
      targetLineWidthPx: 2.3,
      nowIso: BASE_ISO,
    });
    const json = serializeHandoffKitToJson(kit);
    expect(json).toContain("oklch(");
    expect(json).not.toMatch(/#[0-9a-f]{6}/iu);
    const parsed = JSON.parse(json) as { kitId: string; onboardingBudgetMinutes: number };
    expect(parsed.kitId).toBe(kit.kitId);
    expect(parsed.onboardingBudgetMinutes).toBe(10);

    const text = formatHandoffKitChecklistText(kit);
    expect(text).toContain("아트 바이블 OKLCH 팔레트");
    expect(text).toContain("브러시·선폭 규격");
    expect(text).toContain("직전 2컷 연속성 레퍼런스");
    expect(text).toContain("3D 배경 카메라 프리셋");
    expect(text).toContain("금지 표현 체크리스트");
  });
});

describe("Pillar 4 — 스마트 마이크로 슬라이스(25컷→8/8/9컷) & 3단계 비상 연재 방어 플랜", () => {
  const threeAssignees: readonly MicroSliceAssignee[] = [
    {
      assigneeId: "mem-flat-1",
      assigneeName: "최도현",
      roleTagKo: "잔여 팀원",
      roleTagEn: "Team",
      region: "kr",
      cutsPerHour: 2,
    },
    {
      assigneeId: "sos-kr-01",
      assigneeName: "김하린",
      roleTagKo: "국내 대타",
      roleTagEn: "Domestic SOS",
      region: "kr",
      cutsPerHour: 2,
    },
    {
      assigneeId: "sos-vn-01",
      assigneeName: "Nguyen Minh Anh",
      roleTagKo: "베트남 대타",
      roleTagEn: "Vietnam SOS",
      region: "sea_vn",
      cutsPerHour: 2.25,
    },
  ];

  it("18. 25컷 병목 슬라이스(21~45컷)를 3인 병렬 8/8/9컷으로 무중복·무누락 자동 분할하고 전체 80컷 합계를 보존한다", () => {
    const seed = createInitialHiatusShieldState({ nowIso: BASE_ISO });
    const split = splitBottleneckSliceIntoMicroSlices({
      slices: seed.slices,
      sliceId: "ep-14-slice-02",
      assignees: threeAssignees,
      nowIso: BASE_ISO,
    });

    expect(split.ok).toBe(true);
    expect(split.microSlices.map((m) => m.cutCount)).toEqual([8, 8, 9]);
    expect(split.microSlices[0]).toMatchObject({ startCut: 21, endCut: 28, previousCutContextIndex: 20, nextCutContextIndex: 29 });
    expect(split.microSlices[1]).toMatchObject({ startCut: 29, endCut: 36, previousCutContextIndex: 28, nextCutContextIndex: 37 });
    expect(split.microSlices[2]).toMatchObject({ startCut: 37, endCut: 45, previousCutContextIndex: 36, nextCutContextIndex: 46 });
    expect(split.integrityCheck).toEqual({
      totalOriginalCuts: 25,
      totalSplitCuts: 25,
      overlapCount: 0,
      gapCount: 0,
      preserved: true,
    });
    expect(split.parallelSpeedupFactor).toBeGreaterThan(2.5);

    const episodeInvariant = verifyCutCoverageInvariant(split.updatedSlices, 80);
    expect(episodeInvariant.preserved).toBe(true);
    expect(episodeInvariant.overlapCount).toBe(0);
    expect(episodeInvariant.gapCount).toBe(0);
  });

  it("19. 임의 컷 수(20컷→6/7/7, 말단 15컷→5/5/5) 분할에서도 경계 컨텍스트와 합계 보존 불변성이 유지된다", () => {
    const seed = createInitialHiatusShieldState({ nowIso: BASE_ISO });
    const split20 = splitBottleneckSliceIntoMicroSlices({
      slices: seed.slices,
      sliceId: "ep-14-slice-03",
      assignees: threeAssignees,
      nowIso: BASE_ISO,
    });
    expect(split20.microSlices.map((m) => m.cutCount)).toEqual([6, 7, 7]);
    expect(split20.integrityCheck.preserved).toBe(true);

    const splitTail = splitBottleneckSliceIntoMicroSlices({
      slices: seed.slices,
      sliceId: "ep-14-slice-04",
      assignees: threeAssignees,
      nowIso: BASE_ISO,
    });
    expect(splitTail.microSlices.map((m) => m.cutCount)).toEqual([5, 5, 5]);
    expect(splitTail.microSlices[2]?.nextCutContextIndex).toBeNull();
    expect(verifyCutCoverageInvariant(splitTail.updatedSlices, 80).preserved).toBe(true);
  });

  it("20. 마감 18시간 이내는 극한 위기(isExtremeCrisis=true), 19시간 이상은 일반 대기로 정확히 분기한다", () => {
    const crisis18 = generateEmergencyDefenseScenarios({
      seriesTitle: "밤의 우편배달부",
      episodeNumber: 14,
      hoursUntilDeadline: 18,
      remainingCuts: 35,
      targetTotalCuts: 80,
      completedCuts: 45,
      availableTeamCutsPerHour: 1.5,
      standbyBoostCutsPerHour: 2.0,
    });
    const normal24 = generateEmergencyDefenseScenarios({
      seriesTitle: "밤의 우편배달부",
      episodeNumber: 14,
      hoursUntilDeadline: 24,
      remainingCuts: 35,
      targetTotalCuts: 80,
      completedCuts: 45,
      availableTeamCutsPerHour: 1.5,
      standbyBoostCutsPerHour: 2.0,
    });
    expect(crisis18.isExtremeCrisis).toBe(true);
    expect(normal24.isExtremeCrisis).toBe(false);
    expect(crisis18.scenarios).toHaveLength(3);
  });

  it("21. B안은 55컷 본편+특별 후기/설정화 5컷 합본(총 60컷), C안은 상/하 분할+독자 사전 공지 초안을 포함한다", () => {
    const plan = generateEmergencyDefenseScenarios({
      seriesTitle: "밤의 우편배달부",
      episodeNumber: 14,
      hoursUntilDeadline: 12,
      remainingCuts: 50,
      targetTotalCuts: 80,
      completedCuts: 30,
      availableTeamCutsPerHour: 0.9,
      standbyBoostCutsPerHour: 1.1,
    });
    const planB = plan.scenarios.find((s) => s.code === "B");
    const planC = plan.scenarios.find((s) => s.code === "C");

    expect(planB?.mainCutsCount).toBe(55);
    expect(planB?.bonusCutsCount).toBe(5);
    expect((planB?.mainCutsCount ?? 0) + (planB?.bonusCutsCount ?? 0)).toBe(60);
    expect(planB?.readerNoticeDraftKo).toContain("55컷");
    expect(planB?.readerNoticeDraftKo).toContain("5컷");

    expect(planC?.partTwoDeferredCuts).toBeGreaterThan(0);
    expect((planC?.mainCutsCount ?? 0) + (planC?.partTwoDeferredCuts ?? 0)).toBe(80);
    expect(planC?.readerNoticeDraftKo).toContain("밤의 우편배달부");
    expect(planC?.readerNoticeDraftKo).toContain("14화");
    expect(planC?.readerNoticeDraftKo).toContain("상편");
    expect(planC?.readerNoticeDraftKo).toContain("하편");
  });

  it("22. 마감 잔여 시간과 가용 속도 조건에 따라 최적 방어 시나리오(A/B/C)를 자동 추천한다", () => {
    const recA = generateEmergencyDefenseScenarios({
      seriesTitle: "밤의 우편배달부",
      episodeNumber: 14,
      hoursUntilDeadline: 16,
      remainingCuts: 24,
      targetTotalCuts: 80,
      completedCuts: 56,
      availableTeamCutsPerHour: 2.0,
      standbyBoostCutsPerHour: 2.0,
    });
    const recB = generateEmergencyDefenseScenarios({
      seriesTitle: "밤의 우편배달부",
      episodeNumber: 14,
      hoursUntilDeadline: 10,
      remainingCuts: 40,
      targetTotalCuts: 80,
      completedCuts: 40,
      availableTeamCutsPerHour: 1.5,
      standbyBoostCutsPerHour: 1.5,
    });
    const recC = generateEmergencyDefenseScenarios({
      seriesTitle: "밤의 우편배달부",
      episodeNumber: 14,
      hoursUntilDeadline: 6,
      remainingCuts: 52,
      targetTotalCuts: 80,
      completedCuts: 28,
      availableTeamCutsPerHour: 0.7,
      standbyBoostCutsPerHour: 0.8,
    });

    expect(recA.recommendedCode).toBe("A");
    expect(recB.recommendedCode).toBe("B");
    expect(recC.recommendedCode).toBe("C");
  });
});

describe("Pillar 5 — 휴재·지각 제로 관제실 UI 및 Division OS 지연 마운트 통합 검증", () => {
  it("23. 관제실 초기 화면이 한글 기본 UI, 비축 원고 게이지, 80/80 컷 무결성 배지를 렌더링한다", () => {
    render(<StudioHiatusShieldPanel projectTitle="밤의 우편배달부" episodeId="ep-14" />);

    expect(screen.getByTestId("studio-hiatus-shield-panel")).toBeTruthy();
    expect(screen.getByText("휴재·지각 제로 SOS 관제실")).toBeTruthy();
    expect(screen.getByTestId("hshield-coverage-badge").textContent).toContain("80/80");
    expect(screen.getByTestId("hshield-buffer-tier").textContent).toContain("1주");
  });

  it("24. 비축 0주 및 마감 12h 전환 시 OKLCH 위험(red) 신호등과 극한 위기 배지가 즉시 반응한다", () => {
    render(<StudioHiatusShieldPanel />);

    fireEvent.click(screen.getByRole("button", { name: "0주" }));
    fireEvent.click(screen.getByRole("button", { name: "12h (위기)" }));

    expect(screen.getByTestId("hshield-buffer-tier").getAttribute("data-tier")).toBe("red");
    expect(screen.getByTestId("hshield-overall-tier").getAttribute("data-tier")).toBe("red");
    expect(screen.getByTestId("hshield-crisis-badge").textContent).toContain("극한 위기");
  });

  it("25. 원클릭 결원 선언 → 미완료 컷 해제 → 글로벌 대타 필터·USD 토글 → 1클릭 리스 이관 & 인계 키트 자동 갱신 워크플로", () => {
    render(<StudioHiatusShieldPanel />);

    // 결원 사유 변경 후 선화 메인 결원 선언
    fireEvent.change(screen.getByLabelText("결원 사유 선택"), {
      target: { value: "illness" },
    });
    fireEvent.click(screen.getByTestId("hshield-declare-absent-mem-line-1"));

    expect(screen.getByTestId("hshield-status-toast").textContent).toContain("완료 6컷 보존");
    expect(screen.getByTestId("hshield-coverage-badge").textContent).toContain("80/80");

    // 동남아·글로벌 필터 + USD 통화 보기 전환
    fireEvent.click(screen.getByRole("button", { name: "동남아·글로벌" }));
    fireEvent.click(screen.getByRole("button", { name: "KRW (₩)" }));
    expect(screen.getByTestId("hshield-candidate-sos-vn-01").textContent).toContain("$");

    // 베트남 검증 대타에게 1클릭 리스 이관 + 인계 키트 발송
    fireEvent.click(screen.getByTestId("hshield-transfer-btn-sos-vn-01"));
    expect(screen.getByTestId("hshield-status-toast").textContent).toContain("Nguyen Minh Anh");
    expect(screen.getByTestId("hshield-handoff-kit").textContent).toContain("Nguyen Minh Anh");
    expect(screen.getByTestId("hshield-coverage-badge").textContent).toContain("80/80");
  });

  it("26. 10분 작화 통일 인계 키트의 금지 체크리스트 토글, JSON 패키지 보기 전환, 복사 피드백이 동작한다", () => {
    render(<StudioHiatusShieldPanel />);

    const checkboxes = within(screen.getByTestId("hshield-handoff-kit")).getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThanOrEqual(5);
    fireEvent.click(checkboxes[0] as HTMLElement);
    expect(screen.getByTestId("hshield-checklist-progress").textContent).toContain("1/");

    fireEvent.click(screen.getByRole("button", { name: "JSON 패키지 보기" }));
    expect(screen.getByTestId("hshield-kit-preview").textContent).toContain('"onboardingBudgetMinutes": 10');

    fireEvent.click(screen.getByRole("button", { name: "인계 키트 복사" }));
    expect(screen.getByTestId("hshield-status-toast").textContent).toContain("복사");
  });

  it("27. 25컷 병목 8/8/9 분할 실행과 3단계 비상 연재 방어 시나리오(B/C안) 및 독자 공지 초안 전환이 동작한다", () => {
    render(<StudioHiatusShieldPanel />);

    fireEvent.click(screen.getByTestId("hshield-micro-split-btn"));
    const splitBox = screen.getByTestId("hshield-micro-split-result");
    expect(splitBox.textContent).toContain("25/25컷 보존");
    expect(splitBox.textContent).toContain("8컷");
    expect(splitBox.textContent).toContain("9컷");
    expect(screen.getByTestId("hshield-coverage-badge").textContent).toContain("80/80");

    // B안 → C안 전환 시 독자 사전 공지 초안 갱신 확인
    fireEvent.click(screen.getByTestId("hshield-defense-card-B"));
    expect(screen.getByTestId("hshield-reader-notice-text").textContent).toContain("55컷 본편");

    fireEvent.click(screen.getByTestId("hshield-defense-card-C"));
    expect(screen.getByTestId("hshield-reader-notice-text").textContent).toContain("상편");
    expect(screen.getByTestId("hshield-reader-notice-text").textContent).toContain("무단 휴재 없이");
  });

  it("28. StudioDivisionOsHub의 '휴재·지각 방지 SOS' 탭에서 지연 로드(lazyRetry+Suspense) 및 영문 로케일이 정상 동작한다", async () => {
    const aggregate = createProductionDemoProject();
    render(<StudioDivisionOsHub aggregate={aggregate} />);

    // 초기에는 PD 탭이므로 휴재 방지 관제실 미마운트
    expect(screen.queryByTestId("studio-hiatus-shield-panel")).toBeNull();

    // 휴재·지각 방지 SOS 탭 클릭 → 지연 마운트
    fireEvent.click(screen.getByRole("tab", { name: "휴재·지각 방지 SOS" }));
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    await waitFor(() => {
      expect(screen.getByTestId("studio-hiatus-shield-panel")).toBeTruthy();
    });

    // 영문 로케일 전환 검증
    const prevLang = useI18n.getState().lang;
    try {
      act(() => useI18n.setState({ lang: "en" }));
      await waitFor(() => {
        expect(screen.getByRole("tab", { name: "Hiatus Shield SOS" })).toBeTruthy();
        expect(screen.getByText("Zero-Hiatus & Delay Shield SOS")).toBeTruthy();
      });
    } finally {
      act(() => useI18n.setState({ lang: prevLang }));
    }
  });
});
