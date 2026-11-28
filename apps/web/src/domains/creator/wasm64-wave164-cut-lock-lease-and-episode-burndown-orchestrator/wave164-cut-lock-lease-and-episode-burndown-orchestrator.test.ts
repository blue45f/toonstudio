import { describe, expect, it } from "vitest";
import {
  acquireCutStageLease,
  canonicalJsonStringify,
  computeBurndownManifestFingerprint,
  computeEpisodeBurndownReport,
  createCutLockLeaseState,
  createSampleStudioBurndownScenario,
  makeCutStageSlotKey,
  mergeCutStagePatches,
  planAssistantRebalanceSuggestions,
  reclaimExpiredLeases,
  releaseCutStageLease,
  renderCutLockBurndownSvg,
  renewCutStageLease,
  runCutLockLeaseAndBurndownOrchestrator,
  sha256StudioOpsHex,
  summarizeCutLockBurndownKo,
  type AssistantCapacityProfile,
  type CutLockLeaseState,
  type CutStagePatch,
  type EpisodeBurndownInput,
  type EpisodeCutStageWorkItem,
  type StudioProductionStage,
} from "./index";

const BASE_TIME = 1_760_000_000_000;
const TTL_10M = 10 * 60 * 1000;

function makeAssistants(): readonly AssistantCapacityProfile[] {
  return [
    { assistantId: "asst-a", nameKo: "김선화", skills: ["line-art", "flat-color"], maxConcurrentLeases: 2, velocityHoursPerDay: 8 },
    { assistantId: "asst-b", nameKo: "이채색", skills: ["line-art", "flat-color", "shading"], maxConcurrentLeases: 2, velocityHoursPerDay: 8 },
    { assistantId: "asst-c", nameKo: "박배경", skills: ["background-3d", "lettering-sfx", "final-qa"], maxConcurrentLeases: 3, velocityHoursPerDay: 8 },
  ];
}

function initState(episodeId = "ep-1", enforceSkillMatch = true): CutLockLeaseState {
  return createCutLockLeaseState({
    episodeId,
    assistants: makeAssistants(),
    defaultLeaseTtlMs: TTL_10M,
    enforceSkillMatch,
  });
}

function acq(
  state: CutLockLeaseState,
  cutId: string,
  stage: StudioProductionStage,
  assistantId: string,
  nowMs = BASE_TIME,
  leaseDurationMs?: number,
) {
  return acquireCutStageLease(state, { cutId, stage, assistantId, nowMs, leaseDurationMs });
}

function work(
  cutId: string,
  stage: StudioProductionStage,
  estimatedHours: number,
  completedHours: number,
  assignedAssistantId?: string,
): EpisodeCutStageWorkItem {
  return { cutId, stage, estimatedHours, completedHours, assignedAssistantId };
}

function makePatch(overrides: Partial<CutStagePatch> & { readonly patchId: string }): CutStagePatch {
  return {
    cutId: "C01",
    stage: "line-art",
    authorId: "asst-a",
    fencingToken: 1,
    baseRevision: 0,
    submittedAtMs: BASE_TIME + 1_000,
    opKind: "stroke-batch",
    layerPath: "cuts/C01/line-art/ink.layer",
    payloadDigestHex: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    progressDeltaHours: 1,
    completedRatio: 0.5,
    summaryKo: "선화 패치 반영",
    ...overrides,
  };
}

function burndownInput(
  workItems: readonly EpisodeCutStageWorkItem[],
  overrides?: Partial<EpisodeBurndownInput>,
): EpisodeBurndownInput {
  return {
    episodeId: "ep-10",
    episodeTitleKo: "제10화: 추격전",
    totalWindowHours: 48,
    elapsedHours: 24,
    deadlineRemainingHours: 24,
    workdayHours: 8,
    assistants: makeAssistants(),
    workItems,
    ...overrides,
  };
}

describe("Wave 164: 컷-락 리스 상호 배제 및 병렬 분할", () => {
  it("1. (C01, line-art) 최초 리스 획득 시 fencingToken=1과 정확한 만료 시각을 부여한다", () => {
    const res = acq(initState(), "C01", "line-art", "asst-a");
    expect(res.ok).toBe(true);
    expect(res.lease?.fencingToken).toBe(1);
    expect(res.lease?.expiresAtMs).toBe(BASE_TIME + TTL_10M);
    expect(res.state.nextFencingToken).toBe(2);
  });

  it("2. 동일 (C01, line-art)에 다른 어시스턴트가 중복 락을 요청하면 상호 배제로 거부한다", () => {
    const r1 = acq(initState(), "C01", "line-art", "asst-a");
    const r2 = acq(r1.state, "C01", "line-art", "asst-b", BASE_TIME + 5_000);
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe("already-locked-by-other");
    expect(r2.lease).toBeNull();
    expect(r2.state.nextFencingToken).toBe(2);
  });

  it("3. 동일 컷의 서로 다른 공정(background-3d, lettering-sfx)은 동시 병렬 리스를 허용한다", () => {
    const r1 = acq(initState(), "C01", "line-art", "asst-a", BASE_TIME);
    const r2 = acq(r1.state, "C01", "background-3d", "asst-c", BASE_TIME + 1_000);
    const r3 = acq(r2.state, "C01", "lettering-sfx", "asst-c", BASE_TIME + 2_000);
    expect(r1.ok && r2.ok && r3.ok).toBe(true);
    expect([r1.lease?.fencingToken, r2.lease?.fencingToken, r3.lease?.fencingToken]).toEqual([1, 2, 3]);
    expect(Object.keys(r3.state.activeLeases)).toHaveLength(3);
  });

  it("4. 서로 다른 컷의 동일 공정(C01 line-art, C02 line-art)은 병렬 리스 획득을 허용한다", () => {
    const r1 = acq(initState(), "C01", "line-art", "asst-a", BASE_TIME);
    const r2 = acq(r1.state, "C02", "line-art", "asst-b", BASE_TIME + 1_000);
    expect(r1.ok && r2.ok).toBe(true);
    expect(r2.lease?.fencingToken).toBe(2);
  });

  it("5. 이미 본인이 보유한 활성 슬롯을 재획득 요청하면 already-held-by-self로 안내한다", () => {
    const r1 = acq(initState(), "C01", "line-art", "asst-a");
    const r2 = acq(r1.state, "C01", "line-art", "asst-a", BASE_TIME + 2_000);
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe("already-held-by-self");
  });

  it("6. 미등록 어시스턴트와 비숙련 공정의 리스 요청을 정확히 차단한다", () => {
    const s = initState();
    expect(acq(s, "C01", "line-art", "asst-ghost").reason).toBe("assistant-not-registered");
    expect(acq(s, "C01", "background-3d", "asst-a").reason).toBe("assistant-lacks-stage-skill");
  });

  it("7. enforceSkillMatch=false 설정 시 비숙련 공정도 획득 가능하고 비양수 TTL은 거부한다", () => {
    const s = initState("ep-1", false);
    expect(acq(s, "C01", "background-3d", "asst-a", BASE_TIME, 0).reason).toBe("invalid-duration");
    expect(acq(s, "C01", "background-3d", "asst-a").ok).toBe(true);
  });
});

describe("Wave 164: WIP 상한·리스 연장·반납 및 불변성", () => {
  it("8. maxConcurrentLeases 상한에 도달한 어시스턴트는 추가 컷을 독점할 수 없다", () => {
    const r1 = acq(initState("ep-2"), "C01", "line-art", "asst-a", BASE_TIME);
    const r2 = acq(r1.state, "C02", "line-art", "asst-a", BASE_TIME + 1_000);
    const r3 = acq(r2.state, "C03", "line-art", "asst-a", BASE_TIME + 2_000);
    expect(r1.ok && r2.ok).toBe(true);
    expect(r3.ok).toBe(false);
    expect(r3.reason).toBe("wip-limit-reached");
  });

  it("9. 기존 리스 1건을 반납하면 WIP 여유가 복구되어 새 컷 리스를 더 높은 토큰으로 획득한다", () => {
    const r1 = acq(initState("ep-2"), "C01", "line-art", "asst-a", BASE_TIME);
    const r2 = acq(r1.state, "C02", "line-art", "asst-a", BASE_TIME + 1_000);
    const rel = releaseCutStageLease(r2.state, {
      cutId: "C01",
      stage: "line-art",
      assistantId: "asst-a",
      fencingToken: r1.lease?.fencingToken ?? 0,
      nowMs: BASE_TIME + 5_000,
    });
    expect(rel.ok).toBe(true);
    const r3 = acq(rel.state, "C03", "line-art", "asst-a", BASE_TIME + 6_000);
    expect(r3.ok).toBe(true);
    expect(r3.lease?.fencingToken).toBe(3);
  });

  it("10. renewCutStageLease는 동일 leaseId·fencingToken을 유지한 채 만료 시각을 연장한다", () => {
    const r1 = acq(initState("ep-2"), "C01", "line-art", "asst-a");
    const ren = renewCutStageLease(r1.state, {
      cutId: "C01",
      stage: "line-art",
      assistantId: "asst-a",
      fencingToken: 1,
      nowMs: BASE_TIME + 5 * 60 * 1000,
      extendDurationMs: TTL_10M,
    });
    expect(ren.ok).toBe(true);
    expect(ren.lease?.leaseId).toBe(r1.lease?.leaseId);
    expect(ren.lease?.fencingToken).toBe(1);
    expect(ren.lease?.expiresAtMs).toBe(BASE_TIME + 15 * 60 * 1000);
  });

  it("11. 만료 후 연장, 타인 연장, 구버전 토큰 연장은 각각 명확한 사유로 거부된다", () => {
    const r1 = acq(initState("ep-2"), "C01", "line-art", "asst-a");
    expect(
      renewCutStageLease(r1.state, {
        cutId: "C01", stage: "line-art", assistantId: "asst-a", fencingToken: 1, nowMs: BASE_TIME + TTL_10M,
      }).reason,
    ).toBe("lease-expired");
    expect(
      renewCutStageLease(r1.state, {
        cutId: "C01", stage: "line-art", assistantId: "asst-b", fencingToken: 1, nowMs: BASE_TIME + 1_000,
      }).reason,
    ).toBe("not-lease-holder");
    expect(
      renewCutStageLease(r1.state, {
        cutId: "C01", stage: "line-art", assistantId: "asst-a", fencingToken: 0, nowMs: BASE_TIME + 1_000,
      }).reason,
    ).toBe("stale-fencing-token");
  });

  it("12. 미보유·타인·구토큰 리스 반납 요청을 거부한다", () => {
    const s0 = initState("ep-2");
    expect(
      releaseCutStageLease(s0, { cutId: "C99", stage: "line-art", assistantId: "asst-a", fencingToken: 1, nowMs: BASE_TIME }).reason,
    ).toBe("lease-not-found");
    const r1 = acq(s0, "C01", "line-art", "asst-a");
    expect(
      releaseCutStageLease(r1.state, { cutId: "C01", stage: "line-art", assistantId: "asst-b", fencingToken: 1, nowMs: BASE_TIME + 1_000 }).reason,
    ).toBe("not-lease-holder");
    expect(
      releaseCutStageLease(r1.state, { cutId: "C01", stage: "line-art", assistantId: "asst-a", fencingToken: 0, nowMs: BASE_TIME + 1_000 }).reason,
    ).toBe("stale-fencing-token");
  });

  it("13. 모든 상태 전이 함수는 기존 CutLockLeaseState 스냅샷을 변이하지 않는다", () => {
    const s0 = initState("ep-2");
    const r1 = acq(s0, "C01", "line-art", "asst-a");
    const rel = releaseCutStageLease(r1.state, {
      cutId: "C01", stage: "line-art", assistantId: "asst-a", fencingToken: 1, nowMs: BASE_TIME + 1_000,
    });
    expect(Object.keys(s0.activeLeases)).toHaveLength(0);
    expect(Object.keys(r1.state.activeLeases)).toHaveLength(1);
    expect(Object.keys(rel.state.activeLeases)).toHaveLength(0);
  });
});

describe("Wave 164: 만료 리스 회수 및 단조 펜싱 토큰 좀비 덮어쓰기 차단", () => {
  it("14. nowMs === expiresAtMs 경계에서 정확히 만료되고 expiresAtMs - 1에서는 활성 유지된다", () => {
    const r1 = acq(initState("ep-3"), "C01", "line-art", "asst-a");
    expect(reclaimExpiredLeases(r1.state, BASE_TIME + TTL_10M - 1).reclaimedCount).toBe(0);
    const atBound = reclaimExpiredLeases(r1.state, BASE_TIME + TTL_10M);
    expect(atBound.reclaimedCount).toBe(1);
    expect(Object.keys(atBound.state.activeLeases)).toHaveLength(0);
  });

  it("15. reclaimExpiredLeases는 만료된 리스만 회수하고 유효 리스는 보존한다", () => {
    const r1 = acq(initState("ep-3"), "C01", "line-art", "asst-a", BASE_TIME, 5 * 60 * 1000);
    const r2 = acq(r1.state, "C01", "background-3d", "asst-c", BASE_TIME, 20 * 60 * 1000);
    const rec = reclaimExpiredLeases(r2.state, BASE_TIME + 10 * 60 * 1000);
    expect(rec.reclaimedCount).toBe(1);
    expect(rec.reclaimedLeases[0].stage).toBe("line-art");
    expect(Object.keys(rec.state.activeLeases)).toEqual([makeCutStageSlotKey("C01", "background-3d")]);
  });

  it("16. 만료 회수 후 재획득 시 fencingToken_2 > fencingToken_1이며 지연 좀비 패치는 차단된다", () => {
    const r1 = acq(initState("ep-3"), "C01", "line-art", "asst-a");
    const t1 = r1.lease?.fencingToken ?? 0;
    const rec = reclaimExpiredLeases(r1.state, BASE_TIME + TTL_10M + 5_000);
    const r2 = acq(rec.state, "C01", "line-art", "asst-b", BASE_TIME + TTL_10M + 10_000);
    const t2 = r2.lease?.fencingToken ?? 0;
    expect(t2).toBeGreaterThan(t1);

    const zombie = makePatch({ patchId: "zombie-t1", authorId: "asst-a", fencingToken: t1 });
    const fresh = makePatch({ patchId: "fresh-t2", authorId: "asst-b", fencingToken: t2 });
    const merged = mergeCutStagePatches(r2.state, [zombie, fresh], { nowMs: BASE_TIME + TTL_10M + 20_000 });

    expect(merged.decisions[0].outcome).toBe("rejected-stale-fencing-token");
    expect(merged.decisions[0].expectedFencingToken).toBe(t2);
    expect(merged.decisions[1].outcome).toBe("merged-clean");
    expect(merged.staleTokenRejectionCount).toBe(1);
    expect(merged.mergedSlots[makeCutStageSlotKey("C01", "line-art")].appliedPatchIds).toEqual(["fresh-t2"]);
  });

  it("17. 만료된 리스(미회수 및 회수 직후 미재할당)에 대한 패치는 rejected-lease-expired로 거부한다", () => {
    const r1 = acq(initState("ep-3"), "C01", "line-art", "asst-a");
    const p = makePatch({ patchId: "late-p1", authorId: "asst-a", fencingToken: 1 });
    const before = mergeCutStagePatches(r1.state, [p], { nowMs: BASE_TIME + TTL_10M + 1_000 });
    expect(before.decisions[0].outcome).toBe("rejected-lease-expired");
    const rec = reclaimExpiredLeases(r1.state, BASE_TIME + TTL_10M + 1_000);
    const after = mergeCutStagePatches(rec.state, [p], { nowMs: BASE_TIME + TTL_10M + 2_000 });
    expect(after.decisions[0].outcome).toBe("rejected-lease-expired");
  });

  it("18. 미보유 슬롯 또는 작성자 불일치 패치는 rejected-unowned-lease로 거부한다", () => {
    const r1 = acq(initState("ep-3"), "C01", "line-art", "asst-a");
    const m = mergeCutStagePatches(
      r1.state,
      [
        makePatch({ patchId: "unowned", cutId: "C99", stage: "shading", authorId: "asst-b", fencingToken: 1 }),
        makePatch({ patchId: "impostor", cutId: "C01", stage: "line-art", authorId: "asst-b", fencingToken: 1 }),
      ],
      { nowMs: BASE_TIME + 1_000 },
    );
    expect(m.decisions.map((d) => d.outcome)).toEqual(["rejected-unowned-lease", "rejected-unowned-lease"]);
    expect(m.unownedRejectionCount).toBe(2);
  });

  it("19. 만료된 슬롯에 reclaimExpiredLeases 없이 바로 재획득해도 자동 회수 후 상위 토큰을 발급한다", () => {
    const r1 = acq(initState("ep-3"), "C01", "line-art", "asst-a");
    const r2 = acq(r1.state, "C01", "line-art", "asst-b", BASE_TIME + TTL_10M + 100);
    expect(r2.ok).toBe(true);
    expect(r2.reclaimedPreviousLease?.fencingToken).toBe(1);
    expect(r2.lease?.fencingToken).toBe(2);
  });
});

describe("Wave 164: 입력 순서 무관 충돌 제로 병합 및 SHA-256 상태 수렴", () => {
  it("20. 독립 패치 3건을 [P1, P2, P3] vs [P3, P1, P2] vs [P2, P3, P1] 순서로 병합해도 비트 단위 동일 상태와 해시를 얻는다", () => {
    let s = initState("ep-4");
    s = acq(s, "C01", "line-art", "asst-a", BASE_TIME).state;
    s = acq(s, "C01", "background-3d", "asst-c", BASE_TIME + 100).state;
    s = acq(s, "C02", "flat-color", "asst-b", BASE_TIME + 200).state;

    const p1 = makePatch({ patchId: "P1", cutId: "C01", stage: "line-art", authorId: "asst-a", fencingToken: 1, progressDeltaHours: 1.25 });
    const p2 = makePatch({ patchId: "P2", cutId: "C01", stage: "background-3d", authorId: "asst-c", fencingToken: 2, opKind: "background-render", layerPath: "cuts/C01/bg3d/main.layer", progressDeltaHours: 2.0 });
    const p3 = makePatch({ patchId: "P3", cutId: "C02", stage: "flat-color", authorId: "asst-b", fencingToken: 3, opKind: "flat-fill", layerPath: "cuts/C02/flat/base.layer", progressDeltaHours: 0.75 });

    const m123 = mergeCutStagePatches(s, [p1, p2, p3], { nowMs: BASE_TIME + 5_000 });
    const m312 = mergeCutStagePatches(s, [p3, p1, p2], { nowMs: BASE_TIME + 5_000 });
    const m231 = mergeCutStagePatches(s, [p2, p3, p1], { nowMs: BASE_TIME + 5_000 });

    expect(m123.mergedCleanCount).toBe(3);
    expect(m123.mergeStateSha256Hex).toMatch(/^[0-9a-f]{64}$/);
    expect(m312.mergeStateSha256Hex).toBe(m123.mergeStateSha256Hex);
    expect(m231.mergeStateSha256Hex).toBe(m123.mergeStateSha256Hex);
    expect(m312.mergedSlots).toEqual(m123.mergedSlots);
    expect(canonicalJsonStringify(m231.mergedSlots)).toBe(canonicalJsonStringify(m123.mergedSlots));
  });

  it("21. 동일 슬롯에 도착 순서가 뒤바뀐 복수 패치도 정규 순서로 수렴해 동일 해시를 만든다", () => {
    const s = acq(initState("ep-4"), "C01", "line-art", "asst-a").state;
    const pa = makePatch({ patchId: "slot-p1", baseRevision: 0, submittedAtMs: BASE_TIME + 1_000, layerPath: "cuts/C01/line-art/fg.layer", progressDeltaHours: 0.5, completedRatio: 0.3 });
    const pb = makePatch({ patchId: "slot-p2", baseRevision: 1, submittedAtMs: BASE_TIME + 2_000, layerPath: "cuts/C01/line-art/bg.layer", progressDeltaHours: 0.75, completedRatio: 0.7 });

    const mAB = mergeCutStagePatches(s, [pa, pb], { nowMs: BASE_TIME + 5_000 });
    const mBA = mergeCutStagePatches(s, [pb, pa], { nowMs: BASE_TIME + 5_000 });
    expect(mAB.mergeStateSha256Hex).toBe(mBA.mergeStateSha256Hex);
    expect(mAB.mergedSlots).toEqual(mBA.mergedSlots);
    expect(mAB.mergedSlots[makeCutStageSlotKey("C01", "line-art")].accumulatedProgressHours).toBe(1.25);
  });

  it("22. 정상·구토큰·만료·미보유 패치가 혼재된 배치에서 각 거부 사유를 누락 없이 집계한다", () => {
    let s = initState("ep-4");
    s = acq(s, "C01", "line-art", "asst-a", BASE_TIME, 1_000).state;
    s = reclaimExpiredLeases(s, BASE_TIME + 2_000).state;
    s = acq(s, "C01", "line-art", "asst-b", BASE_TIME + 3_000, TTL_10M).state;
    s = acq(s, "C02", "background-3d", "asst-c", BASE_TIME + 3_000, 1_000).state;

    const m = mergeCutStagePatches(
      s,
      [
        makePatch({ patchId: "ok", cutId: "C01", stage: "line-art", authorId: "asst-b", fencingToken: 2 }),
        makePatch({ patchId: "stale", cutId: "C01", stage: "line-art", authorId: "asst-a", fencingToken: 1 }),
        makePatch({ patchId: "expired", cutId: "C02", stage: "background-3d", authorId: "asst-c", fencingToken: 3 }),
        makePatch({ patchId: "unowned", cutId: "C05", stage: "shading", authorId: "asst-b", fencingToken: 1 }),
      ],
      { nowMs: BASE_TIME + 5_000 },
    );
    expect([m.mergedCleanCount, m.rejectedCount, m.staleTokenRejectionCount, m.expiredRejectionCount, m.unownedRejectionCount]).toEqual([1, 3, 1, 1, 1]);
  });

  it("23. 빈 패치 배치 병합은 빈 정규 맵의 결정론적 SHA-256 해시를 반환한다", () => {
    const res = mergeCutStagePatches(initState("ep-4"), [], { nowMs: BASE_TIME });
    expect(res.mergedCleanCount).toBe(0);
    expect(res.mergeStateSha256Hex).toBe(sha256StudioOpsHex("{}"));
  });

  it("24. initialMergedSlots를 전달한 증분 병합은 기존 리비전과 누적 작업 시간을 이어서 갱신한다", () => {
    const s = acq(initState("ep-4"), "C01", "line-art", "asst-a").state;
    const b1 = mergeCutStagePatches(s, [makePatch({ patchId: "inc-1", progressDeltaHours: 1.5, completedRatio: 0.4 })], { nowMs: BASE_TIME + 1_000 });
    const b2 = mergeCutStagePatches(s, [makePatch({ patchId: "inc-2", baseRevision: 1, progressDeltaHours: 1.0, completedRatio: 0.8 })], { nowMs: BASE_TIME + 2_000, initialMergedSlots: b1.mergedSlots });
    const slot = b2.mergedSlots[makeCutStageSlotKey("C01", "line-art")];
    expect(slot.revision).toBe(2);
    expect(slot.accumulatedProgressHours).toBe(2.5);
    expect(slot.appliedPatchIds).toEqual(["inc-1", "inc-2"]);
  });
});

describe("Wave 164: 번다운 궤적·선행 대기 및 마감 위험 등급 판정", () => {
  it("25. 전체·완료·잔여 작업 시간과 완료율을 정확히 계산하고 초과 보고된 완료 시간을 상한 클램프한다", () => {
    const report = computeEpisodeBurndownReport(
      burndownInput([work("C01", "line-art", 4, 6, "asst-a"), work("C02", "line-art", 6, 3, "asst-a")]),
    );
    expect([report.totalEffortHours, report.completedEffortHours, report.remainingEffortHours, report.completionRatio]).toEqual([10, 7, 3, 0.7]);
  });

  it("26. 번다운 타임라인은 0h 착수점(전체 물량)에서 시작해 현재 잔여 물량과 완료 예상 시점을 포함한다", () => {
    const report = computeEpisodeBurndownReport(
      burndownInput(
        [work("C01", "line-art", 10, 6, "asst-a"), work("C02", "background-3d", 10, 4, "asst-c")],
        { historicalObservations: [{ elapsedHours: 12, actualRemainingHours: 15 }] },
      ),
    );
    expect(report.timeline[0].idealRemainingHours).toBe(20);
    expect(report.timeline.find((pt) => pt.labelKo === "현재")?.actualRemainingHours).toBe(10);
    const endPt = report.timeline[report.timeline.length - 1];
    expect(endPt.isProjected && endPt.actualRemainingHours === 0).toBe(true);
  });

  it("27. 충분한 마감 여유가 있는 회차는 on-track으로 분류한다", () => {
    const report = computeEpisodeBurndownReport(
      burndownInput([work("C01", "line-art", 8, 4, "asst-a"), work("C01", "background-3d", 8, 4, "asst-c")], {
        deadlineRemainingHours: 24,
      }),
    );
    expect(report.projectedFinishHours).toBe(4);
    expect(report.deadlineMarginHours).toBe(20);
    expect(report.riskTier).toBe("on-track");
  });

  it("28. 좁은 마감 여유는 tight-buffer, 매우 촉박한 여유는 at-risk로 구분한다", () => {
    const tight = computeEpisodeBurndownReport(burndownInput([work("C01", "line-art", 20, 0, "asst-a")], { deadlineRemainingHours: 24 }));
    const atRisk = computeEpisodeBurndownReport(burndownInput([work("C01", "line-art", 22.5, 0, "asst-a")], { deadlineRemainingHours: 24 }));
    expect(tight.riskTier).toBe("tight-buffer");
    expect(atRisk.riskTier).toBe("at-risk");
  });

  it("29. 잔여 작업량이 마감 전 처리 가능 시간을 넘기면 deadline-breach와 음수 여유를 보고한다", () => {
    const report = computeEpisodeBurndownReport(
      burndownInput([work("C01", "line-art", 14, 0, "asst-a"), work("C02", "line-art", 14, 0, "asst-a")], { deadlineRemainingHours: 20 }),
    );
    expect(report.projectedFinishHours).toBe(28);
    expect(report.deadlineMarginHours).toBe(-8);
    expect(report.riskTier).toBe("deadline-breach");
  });

  it("30. 선행 공정 대기 카운트(flat-color 대기, background-3d 병렬 비대기)와 크리티컬 패스를 정확히 계산한다", () => {
    const report = computeEpisodeBurndownReport(
      burndownInput([
        work("C01", "line-art", 4, 0, "asst-a"),
        work("C01", "flat-color", 3, 0, "asst-b"),
        work("C01", "shading", 3, 0, "asst-b"),
        work("C01", "background-3d", 5, 0, "asst-c"),
        work("C01", "final-qa", 2, 0, "asst-c"),
      ]),
    );
    expect(report.stageBacklogs.find((s) => s.stage === "flat-color")?.blockedByUpstreamCount).toBe(1);
    expect(report.stageBacklogs.find((s) => s.stage === "background-3d")?.blockedByUpstreamCount).toBe(0);
    expect(report.stageBacklogs.find((s) => s.stage === "final-qa")?.blockedByUpstreamCount).toBe(1);
    expect(report.criticalPathHours).toBe(12);
    expect(report.projectedFinishHours).toBe(12);
  });

  it("31. 숙련 어시스턴트가 없는 미배치 공정은 unstaffedStages와 deadline-breach로 감지하되 유한 수치를 유지한다", () => {
    const report = computeEpisodeBurndownReport(
      burndownInput([work("C01", "background-3d", 4, 0)], {
        assistants: [{ assistantId: "asst-only-line", nameKo: "한선화", skills: ["line-art"], maxConcurrentLeases: 2, velocityHoursPerDay: 8 }],
      }),
    );
    expect(report.unstaffedStages).toEqual(["background-3d"]);
    expect(report.riskTier).toBe("deadline-breach");
    expect(Number.isFinite(report.projectedFinishHours) && Number.isFinite(report.deadlineMarginHours)).toBe(true);
  });
});

describe("Wave 164: 병목 감지 및 어시스턴트 재배정 단축 증명", () => {
  const fourLineCuts = [
    work("C01", "line-art", 6, 0, "asst-a"),
    work("C02", "line-art", 6, 0, "asst-a"),
    work("C03", "line-art", 6, 0, "asst-a"),
    work("C04", "line-art", 6, 0, "asst-a"),
  ];

  it("32. 선화 과부하 담당자에서 유휴 숙련 어시스턴트로 재배정 시 hoursSaved > 0을 증명한다", () => {
    const plan = planAssistantRebalanceSuggestions(burndownInput(fourLineCuts, { deadlineRemainingHours: 16 }));
    expect(plan.baselineProjectedFinishHours).toBe(24);
    expect(plan.rebalancedProjectedFinishHours).toBe(12);
    expect(plan.hoursSaved).toBe(12);
    expect(plan.overloadedAssistantIds).toContain("asst-a");
    expect(plan.suggestions.every((s) => s.toAssistantId === "asst-b")).toBe(true);
  });

  it("33. 재배정을 통해 deadline-breach 위험 등급을 on-track으로 회복시킬 수 있다", () => {
    const plan = planAssistantRebalanceSuggestions(burndownInput(fourLineCuts, { deadlineRemainingHours: 20 }));
    expect(plan.baselineRiskTier).toBe("deadline-breach");
    expect(plan.rebalancedRiskTier).toBe("on-track");
    expect(plan.hoursSaved).toBe(12);
  });

  it("34. 해당 공정 스킬이 없는 어시스턴트에게는 절대 재배정 제안을 만들지 않는다", () => {
    const plan = planAssistantRebalanceSuggestions(
      burndownInput([work("C01", "background-3d", 8, 0, "asst-c"), work("C02", "background-3d", 8, 0, "asst-c")], { deadlineRemainingHours: 10 }),
    );
    expect(plan.suggestions).toHaveLength(0);
    expect(plan.hoursSaved).toBe(0);
  });

  it("35. respectActiveLeases=true(기본값)에서는 활성 락이 걸린 컷을 빼앗지 않고 대기 중인 컷만 재배정한다", () => {
    const leaseState = acq(initState("ep-lock-respect"), "C01", "line-art", "asst-a").state;
    const plan = planAssistantRebalanceSuggestions(
      burndownInput([work("C01", "line-art", 8, 0, "asst-a"), work("C02", "line-art", 8, 0, "asst-a")], {
        deadlineRemainingHours: 14,
        leaseState,
        nowMs: BASE_TIME + 1_000,
      }),
    );
    expect(plan.suggestions).toHaveLength(1);
    expect(plan.suggestions[0].cutId).toBe("C02");
    expect(plan.hoursSaved).toBe(8);
  });

  it("36. 이미 균형 잡힌 배분에서는 불필요한 재배정 제안을 생성하지 않는다", () => {
    const plan = planAssistantRebalanceSuggestions(
      burndownInput([work("C01", "line-art", 6, 0, "asst-a"), work("C02", "line-art", 6, 0, "asst-b"), work("C03", "background-3d", 6, 0, "asst-c")]),
    );
    expect(plan.suggestions).toHaveLength(0);
    expect(plan.hoursSaved).toBe(0);
  });
});

describe("Wave 164: FIPS 180-4 SHA-256·지문·순수 OKLCH SVG 및 한국어 QA 브리프", () => {
  it("37. sha256StudioOpsHex는 FIPS 180-4 표준 벡터('', 'abc', 2블록 UTF-8)와 정확히 일치한다", () => {
    expect(sha256StudioOpsHex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256StudioOpsHex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256StudioOpsHex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
    expect(sha256StudioOpsHex("웹툰 마감 번다운 오케스트레이터 🎬")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("38. computeBurndownManifestFingerprint는 리스 변경이나 작업 진행률 변화 시 결정론적으로 변경된다", () => {
    const out1 = runCutLockLeaseAndBurndownOrchestrator(createSampleStudioBurndownScenario());
    const out2 = runCutLockLeaseAndBurndownOrchestrator(createSampleStudioBurndownScenario());
    expect(out1.manifestFingerprintSha256Hex).toBe(out2.manifestFingerprintSha256Hex);
    expect(out1.manifestFingerprintSha256Hex).toMatch(/^[0-9a-f]{64}$/);

    const renewed = renewCutStageLease(out1.leaseState, {
      cutId: "C01", stage: "shading", assistantId: "asst-jihu", fencingToken: 1, nowMs: out1.evaluatedAtMs, extendDurationMs: TTL_10M * 4,
    });
    expect(
      computeBurndownManifestFingerprint({ leaseState: renewed.state, mergeResult: out1.mergeResult, burndownReport: out1.burndownReport, rebalancePlan: out1.rebalancePlan }),
    ).not.toBe(out1.manifestFingerprintSha256Hex);
    expect(
      computeBurndownManifestFingerprint({ leaseState: out1.leaseState, mergeResult: out1.mergeResult, burndownReport: out1.postRebalanceBurndownReport, rebalancePlan: out1.rebalancePlan }),
    ).not.toBe(out1.manifestFingerprintSha256Hex);
  });

  it("39. renderCutLockBurndownSvg는 순수 oklch(...) 색만 사용하고 원시 hex/rgb/hsl 및 NaN/Infinity가 전혀 없다", () => {
    const svg = runCutLockLeaseAndBurndownOrchestrator(createSampleStudioBurndownScenario()).burndownSvg;
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("oklch(");
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svg).not.toMatch(/\brgba?\s*\(/i);
    expect(svg).not.toMatch(/\bhsla?\s*\(/i);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });

  it("40. renderCutLockBurndownSvg는 제목과 어시스턴트 이름의 XML 특수문자(<, >, &, \", ')를 안전하게 이스케이프한다", () => {
    const base = createSampleStudioBurndownScenario();
    const out = runCutLockLeaseAndBurndownOrchestrator({
      ...base,
      episodeTitleKo: `제43화 <빛 & "그림자"> '특집'`,
      assistants: base.assistants.map((a) =>
        a.assistantId === "asst-doyun" ? { ...a, nameKo: `김<도&윤>"팀장"` } : a,
      ),
    });
    expect(out.burndownSvg).toContain("&lt;빛 &amp; &quot;그림자&quot;&gt; &apos;특집&apos;");
    expect(out.burndownSvg).toContain("김&lt;도&amp;윤&gt;&quot;팀장&quot;");
    expect(out.burndownSvg).not.toContain("&amp;amp;");
  });

  it("41. summarizeCutLockBurndownKo는 위험 등급별 PASS/WARN/FAIL 판정과 번역투 없는 한국어 요약을 생성한다", () => {
    const leaseState = initState("ep-qa");
    const emptyMerge = mergeCutStagePatches(leaseState, [], { nowMs: BASE_TIME });
    const passRep = computeEpisodeBurndownReport(burndownInput([work("C01", "line-art", 6, 2, "asst-a")], { deadlineRemainingHours: 24 }));
    const warnRep = computeEpisodeBurndownReport(burndownInput([work("C01", "line-art", 8.5, 0, "asst-a")], { deadlineRemainingHours: 10 }));
    const failRep = computeEpisodeBurndownReport(burndownInput([work("C01", "line-art", 14, 0, "asst-a")], { deadlineRemainingHours: 6 }));

    const passQa = summarizeCutLockBurndownKo({ burndownReport: passRep, leaseState, mergeResult: emptyMerge });
    const warnQa = summarizeCutLockBurndownKo({ burndownReport: warnRep, leaseState, mergeResult: emptyMerge });
    const failQa = summarizeCutLockBurndownKo({ burndownReport: failRep, leaseState, mergeResult: emptyMerge });

    expect([passQa.verdict, warnQa.verdict, failQa.verdict]).toEqual(["PASS", "WARN", "FAIL"]);
    expect(passQa.fullReportKo).toContain("[PASS]");
    expect(warnQa.fullReportKo).toContain("[WARN]");
    expect(failQa.fullReportKo).toContain("[FAIL]");
    expect(passQa.fullReportKo).not.toContain("하는 것을 가능하게");
    expect(failQa.fullReportKo).not.toContain("원활한 워크플로우를 보장");
  });

  it("42. 잔여 작업이 0인 빈 회차도 NaN/Infinity 없는 SVG와 PASS 브리프를 생성한다", () => {
    const leaseState = initState("ep-empty");
    const emptyMerge = mergeCutStagePatches(leaseState, [], { nowMs: BASE_TIME });
    const report = computeEpisodeBurndownReport(burndownInput([], { episodeTitleKo: "제0화: 프롤로그 완료" }));
    const svg = renderCutLockBurndownSvg({ burndownReport: report, leaseState, mergeResult: emptyMerge });
    const qa = summarizeCutLockBurndownKo({ burndownReport: report, leaseState, mergeResult: emptyMerge });
    expect(report.riskTier).toBe("on-track");
    expect(qa.verdict).toBe("PASS");
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });
});

describe("Wave 164: 최상위 오케스트레이터 엔드투엔드 파이프라인", () => {
  it("43. 기본 샘플 시나리오를 엔드투엔드 실행하면 병렬 리스·충돌 제로 병합·재배정 단축이 모두 증명된다", () => {
    const out = runCutLockLeaseAndBurndownOrchestrator(createSampleStudioBurndownScenario());
    expect(out.episodeId).toBe("ep-042");
    expect(out.leaseAcquisitions.every((a) => a.ok)).toBe(true);
    expect(Object.keys(out.leaseState.activeLeases)).toHaveLength(4);
    expect(out.mergeResult.mergedCleanCount).toBe(3);
    expect(out.burndownReport.riskTier).toBe("deadline-breach");
    expect(out.rebalancePlan.hoursSaved).toBeGreaterThan(0);
    expect(out.postRebalanceBurndownReport.projectedFinishHours).toBeLessThan(out.burndownReport.projectedFinishHours);
    expect(out.postRebalanceBurndownReport.deadlineMarginHours).toBeGreaterThan(0);
    expect(out.qaSummary.verdict).toBe("FAIL");
  });

  it("44. 인자 없이 호출해도 기본 샘플 시나리오로 결정론적 결과를 반복 재현한다", () => {
    const a = runCutLockLeaseAndBurndownOrchestrator();
    const b = runCutLockLeaseAndBurndownOrchestrator();
    expect(a.manifestFingerprintSha256Hex).toBe(b.manifestFingerprintSha256Hex);
    expect(a.mergeResult.mergeStateSha256Hex).toBe(b.mergeResult.mergeStateSha256Hex);
    expect(a.burndownSvg).toBe(b.burndownSvg);
    expect(a.qaSummary.fullReportKo).toBe(b.qaSummary.fullReportKo);
  });

  it("45. 만료 리스 자동 회수 + 지연 좀비 패치 차단 + 마감 초과가 결합된 커스텀 시나리오를 정확히 처리한다", () => {
    const nowMs = BASE_TIME + TTL_10M + 30_000;
    const scenario = createSampleStudioBurndownScenario({
      episodeId: "ep-099",
      episodeTitleKo: "제99화: 긴급 마감",
      nowMs,
      deadlineRemainingHours: 8,
      defaultLeaseTtlMs: TTL_10M,
      initialLeaseRequests: [
        { cutId: "C02", stage: "line-art", assistantId: "asst-doyun", nowMs: BASE_TIME, leaseDurationMs: TTL_10M },
        { cutId: "C02", stage: "line-art", assistantId: "asst-seoyeon", nowMs: BASE_TIME + TTL_10M + 5_000, leaseDurationMs: TTL_10M },
      ],
      submittedPatches: [
        makePatch({ patchId: "zombie-doyun-t1", cutId: "C02", stage: "line-art", authorId: "asst-doyun", fencingToken: 1 }),
        makePatch({ patchId: "valid-seoyeon-t2", cutId: "C02", stage: "line-art", authorId: "asst-seoyeon", fencingToken: 2, progressDeltaHours: 1.5 }),
      ],
    });
    const out = runCutLockLeaseAndBurndownOrchestrator(scenario);
    expect(out.leaseAcquisitions[1].reclaimedPreviousLease?.fencingToken).toBe(1);
    expect(out.leaseAcquisitions[1].lease?.fencingToken).toBe(2);
    expect(out.mergeResult.staleTokenRejectionCount).toBe(1);
    expect(out.mergeResult.mergedCleanCount).toBe(1);
    expect(out.qaSummary.verdict).toBe("FAIL");
    expect(out.qaSummary.fullReportKo).toContain("구버전 펜싱 토큰 패치 1건");
  });
});
