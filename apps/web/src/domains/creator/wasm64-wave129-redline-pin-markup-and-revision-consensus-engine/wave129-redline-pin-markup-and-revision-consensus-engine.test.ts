import { describe, expect, it } from "vitest";
import {
  canTransitionRedlineStatus,
  clampNormalizedCoord,
  computeCanonicalObjectSha256Hex,
  computeRedlineLedgerSha256Hex,
  createRedlineRevisionSession,
  detectOverlappingRedlinePins,
  diffRevisionRounds,
  escapeRedlineXml,
  evaluateEpisodeRevisionSignOff,
  isVerifierRole,
  normalizeRedlinePin,
  renderRedlineRevisionBoardSvg,
  sha256Utf8Hex,
  summarizeRedlineRevisionAuditKo,
  transitionRedlinePinStatus,
  type RedlinePinItem,
  type StudioCollaboratorRole,
} from "./index";

function makePin(overrides?: Partial<RedlinePinItem>): RedlinePinItem {
  return {
    pinId: "pin-001",
    cutId: "cut-04",
    normX: 0.42,
    normY: 0.36,
    category: "anatomy",
    severity: "blocker",
    authorId: "pd-kim",
    authorRole: "pd-editor",
    assigneeRole: "inker",
    noteKo: "오른손 손가락 관절 비율 보정 필요",
    roundNumber: 1,
    status: "open",
    ...overrides,
  };
}

function advancePinToPendingVerify(
  pin: RedlinePinItem,
  workerActorId: string,
  workerRole: StudioCollaboratorRole,
): RedlinePinItem {
  const s1 = transitionRedlinePinStatus(pin, {
    targetStatus: "in-progress",
    actorId: workerActorId,
    actorRole: workerRole,
  });
  expect(s1.rejected).toBe(false);
  const s2 = transitionRedlinePinStatus(s1.pin, {
    targetStatus: "resolved-pending-verify",
    actorId: workerActorId,
    actorRole: workerRole,
  });
  expect(s2.rejected).toBe(false);
  return s2.pin;
}

describe("Wave 129 — 레드라인 핀 상태 머신 & 권한 분리(SoD) 불변식", () => {
  it("1. 정규 경로 open → in-progress → resolved-pending-verify → verified-closed 완주(PD 교차 승인)", () => {
    const s1 = transitionRedlinePinStatus(makePin(), {
      targetStatus: "in-progress",
      actorId: "inker-park",
      actorRole: "inker",
    });
    expect(s1.rejected).toBe(false);
    expect(s1.pin.claimedByActorId).toBe("inker-park");

    const s2 = transitionRedlinePinStatus(s1.pin, {
      targetStatus: "resolved-pending-verify",
      actorId: "inker-park",
      actorRole: "inker",
    });
    expect(s2.rejected).toBe(false);
    expect(s2.pin.resolvedByActorId).toBe("inker-park");
    expect(s2.pin.resolvedByRole).toBe("inker");

    // 핀 최초 작성자(pd-kim)라도 수정자(inker-park)와 다르면 교차 검수 승인 가능
    const s3 = transitionRedlinePinStatus(s2.pin, {
      targetStatus: "verified-closed",
      actorId: "pd-kim",
      actorRole: "pd-editor",
    });
    expect(s3.rejected).toBe(false);
    expect(s3.pin.status).toBe("verified-closed");
    expect(s3.pin.verifiedByActorId).toBe("pd-kim");
    expect(s3.pin.verifiedByRole).toBe("pd-editor");
    expect(s3.pin.history).toHaveLength(3);
  });

  it("2. 아트 디렉터(art-director) 역시 타 작업자가 수정한 핀을 최종 승인할 수 있다", () => {
    const pending = advancePinToPendingVerify(makePin({ assigneeRole: "colorist" }), "color-lee", "colorist");
    const res = transitionRedlinePinStatus(pending, {
      targetStatus: "verified-closed",
      actorId: "ad-choi",
      actorRole: "art-director",
    });
    expect(res.rejected).toBe(false);
    expect(res.pin.status).toBe("verified-closed");
    expect(res.pin.verifiedByRole).toBe("art-director");
  });

  it("3. 재오픈 루프 resolved-pending-verify → reopened → in-progress → resolved-pending-verify → verified-closed", () => {
    const pending = advancePinToPendingVerify(makePin(), "inker-park", "inker");
    const reopened = transitionRedlinePinStatus(pending, {
      targetStatus: "reopened",
      actorId: "pd-kim",
      actorRole: "pd-editor",
      reasonKo: "엄지 길이가 여전히 과장되어 있어 재수정 필요",
      roundNumber: 2,
    });
    expect(reopened.rejected).toBe(false);
    expect(reopened.pin.status).toBe("reopened");
    expect(reopened.pin.reopenCount).toBe(1);
    expect(reopened.pin.roundNumber).toBe(2);
    expect(reopened.pin.lastReopenReasonKo).toContain("엄지 길이");

    const resumed = transitionRedlinePinStatus(reopened.pin, {
      targetStatus: "in-progress",
      actorId: "inker-jung",
      actorRole: "inker",
    });
    expect(resumed.rejected).toBe(false);
    expect(resumed.pin.resolvedByActorId).toBeUndefined();
    expect(resumed.pin.reopenCount).toBe(1);

    const reResolved = transitionRedlinePinStatus(resumed.pin, {
      targetStatus: "resolved-pending-verify",
      actorId: "inker-jung",
      actorRole: "inker",
    });
    const closed = transitionRedlinePinStatus(reResolved.pin, {
      targetStatus: "verified-closed",
      actorId: "ad-choi",
      actorRole: "art-director",
    });
    expect(closed.rejected).toBe(false);
    expect(closed.pin.status).toBe("verified-closed");
    expect(closed.pin.history).toHaveLength(6);
  });

  it("4. 불변식 1 — 수정 완료 어시스턴트 본인의 직접 승인 시도 시 SELF_APPROVAL_FORBIDDEN 차단", () => {
    const pending = advancePinToPendingVerify(makePin(), "assist-min", "colorist");
    const attempt = transitionRedlinePinStatus(pending, {
      targetStatus: "verified-closed",
      actorId: "assist-min",
      actorRole: "colorist",
    });
    expect(attempt.rejected).toBe(true);
    expect(attempt.rejectionCode).toBe("SELF_APPROVAL_FORBIDDEN");
    expect(attempt.pin.status).toBe("resolved-pending-verify");
  });

  it("5. 불변식 1 — PD 본인이 직접 수정 후 자기 승인 시도·공백 포함 동일 ID 사칭도 차단, 타 검수자 교차 승인만 허용", () => {
    const pdFixed = advancePinToPendingVerify(makePin(), "pd-kim", "pd-editor");
    expect(
      transitionRedlinePinStatus(pdFixed, {
        targetStatus: "verified-closed",
        actorId: "pd-kim",
        actorRole: "pd-editor",
      }).rejectionCode,
    ).toBe("SELF_APPROVAL_FORBIDDEN");

    expect(
      transitionRedlinePinStatus(pdFixed, {
        targetStatus: "verified-closed",
        actorId: "  pd-kim  ",
        actorRole: "art-director",
      }).rejectionCode,
    ).toBe("SELF_APPROVAL_FORBIDDEN");

    const crossVerify = transitionRedlinePinStatus(pdFixed, {
      targetStatus: "verified-closed",
      actorId: "ad-choi",
      actorRole: "art-director",
    });
    expect(crossVerify.rejected).toBe(false);
    expect(crossVerify.pin.status).toBe("verified-closed");
  });

  it("6. 불변식 1 — 비검수 역할 5종(lead-artist/inker/colorist/typesetter/bg3d-artist)은 타인 작업 승인 불가", () => {
    const pending = advancePinToPendingVerify(makePin(), "color-lee", "colorist");
    const nonVerifiers: readonly StudioCollaboratorRole[] = [
      "lead-artist",
      "inker",
      "colorist",
      "typesetter",
      "bg3d-artist",
    ];
    for (const role of nonVerifiers) {
      expect(isVerifierRole(role)).toBe(false);
      const attempt = transitionRedlinePinStatus(pending, {
        targetStatus: "verified-closed",
        actorId: `other-${role}`,
        actorRole: role,
      });
      expect(attempt.rejected).toBe(true);
      expect(attempt.rejectionCode).toBe("INSUFFICIENT_VERIFIER_ROLE");
    }
    expect(isVerifierRole("pd-editor")).toBe(true);
    expect(isVerifierRole("art-director")).toBe(true);
  });

  it("7. 불변식 2 — open → verified-closed 직행 및 모든 단계 건너뛰기 불법 전이 차단", () => {
    const illegalPairs: readonly (readonly [RedlinePinItem["status"], RedlinePinItem["status"]])[] = [
      ["open", "verified-closed"],
      ["open", "resolved-pending-verify"],
      ["open", "reopened"],
      ["open", "open"],
      ["in-progress", "verified-closed"],
      ["in-progress", "reopened"],
      ["reopened", "verified-closed"],
      ["reopened", "resolved-pending-verify"],
      ["verified-closed", "reopened"],
      ["verified-closed", "in-progress"],
    ];
    for (const [fromStatus, toStatus] of illegalPairs) {
      expect(canTransitionRedlineStatus(fromStatus, toStatus)).toBe(false);
      const res = transitionRedlinePinStatus(makePin({ status: fromStatus }), {
        targetStatus: toStatus,
        actorId: "pd-kim",
        actorRole: "pd-editor",
        reasonKo: "사유 포함",
      });
      expect(res.rejected).toBe(true);
      expect(res.rejectionCode).toBe("INVALID_STATE_TRANSITION");
      expect(res.pin.status).toBe(fromStatus);
    }
  });

  it("8. 불변식 3 — reopened 전이 시 빈 사유·공백 사유 거부(REOPEN_REASON_REQUIRED)", () => {
    const pending = advancePinToPendingVerify(makePin(), "inker-park", "inker");
    for (const blank of ["", "   \t\n  "]) {
      const res = transitionRedlinePinStatus(pending, {
        targetStatus: "reopened",
        actorId: "pd-kim",
        actorRole: "pd-editor",
        reasonKo: blank,
      });
      expect(res.rejected).toBe(true);
      expect(res.rejectionCode).toBe("REOPEN_REASON_REQUIRED");
    }
  });

  it("9. 빈 actorId 및 엄격 수정자 이력 검사(requireResolverActorId) fail-closed 차단", () => {
    expect(
      transitionRedlinePinStatus(makePin(), {
        targetStatus: "in-progress",
        actorId: "   ",
        actorRole: "inker",
      }).rejectionCode,
    ).toBe("INVALID_ACTOR_ID");

    expect(
      transitionRedlinePinStatus(makePin({ status: "resolved-pending-verify" }), {
        targetStatus: "verified-closed",
        actorId: "pd-kim",
        actorRole: "pd-editor",
        requireResolverActorId: true,
      }).rejectionCode,
    ).toBe("MISSING_RESOLVER_ACTOR");
  });
});

describe("Wave 129 — 공간 중복·상충 핀 군집 감지기", () => {
  it("10. 동일 컷 내 반경 0.06 이내 근접 핀을 자동 군집화하고 반경 밖 핀은 분리한다", () => {
    const pins = [
      makePin({ pinId: "p1", cutId: "cut-07", normX: 0.5, normY: 0.5 }),
      makePin({ pinId: "p2", cutId: "cut-07", normX: 0.56, normY: 0.5 }),
      makePin({ pinId: "p3", cutId: "cut-07", normX: 0.72, normY: 0.5 }),
    ];
    const result = detectOverlappingRedlinePins(pins);
    expect(result.clusterRadiusNorm).toBe(0.06);
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0]?.pinIds).toEqual(["p1", "p2"]);
    expect(result.overlappingPinIds).toEqual(["p1", "p2"]);
  });

  it("11. 서로 다른 컷(cutId)의 동일 좌표 핀은 군집으로 묶지 않는다", () => {
    const result = detectOverlappingRedlinePins([
      makePin({ pinId: "p1", cutId: "cut-01", normX: 0.5, normY: 0.5 }),
      makePin({ pinId: "p2", cutId: "cut-02", normX: 0.5, normY: 0.5 }),
    ]);
    expect(result.clusters).toHaveLength(0);
    expect(result.conflictClusterCount).toBe(0);
  });

  it("12. 서로 다른 작성자가 다른 담당 역할/카테고리로 겹쳐 꽂으면 potentialConflict=true", () => {
    const result = detectOverlappingRedlinePins([
      makePin({
        pinId: "p-color", cutId: "cut-09", normX: 0.3, normY: 0.4,
        authorId: "pd-kim", assigneeRole: "colorist", category: "coloring",
      }),
      makePin({
        pinId: "p-type", cutId: "cut-09", normX: 0.33, normY: 0.42,
        authorId: "ad-choi", assigneeRole: "typesetter", category: "typesetting",
      }),
    ]);
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0]?.potentialConflict).toBe(true);
    expect(result.conflictClusterCount).toBe(1);
    expect(result.potentialConflictPinIds).toEqual(["p-color", "p-type"]);
  });

  it("13. 서로 다른 작성자가 같은 담당 역할이더라도 카테고리가 다르면 potentialConflict=true", () => {
    const result = detectOverlappingRedlinePins([
      makePin({ pinId: "p-a", cutId: "cut-10", normX: 0.25, normY: 0.25, authorId: "pd-kim", assigneeRole: "inker", category: "anatomy" }),
      makePin({ pinId: "p-b", cutId: "cut-10", normX: 0.27, normY: 0.27, authorId: "ad-choi", assigneeRole: "inker", category: "continuity" }),
    ]);
    expect(result.clusters[0]?.potentialConflict).toBe(true);
  });

  it("14. 동일 작성자 근접 핀 및 타 작성자의 동일 역할·동일 카테고리 보강 핀은 potentialConflict=false", () => {
    const r1 = detectOverlappingRedlinePins([
      makePin({ pinId: "s1", cutId: "cut-11", normX: 0.4, normY: 0.4, authorId: "pd-kim", assigneeRole: "inker", category: "anatomy" }),
      makePin({ pinId: "s2", cutId: "cut-11", normX: 0.41, normY: 0.41, authorId: "pd-kim", assigneeRole: "colorist", category: "coloring" }),
    ]);
    expect(r1.clusters[0]?.potentialConflict).toBe(false);

    const r2 = detectOverlappingRedlinePins([
      makePin({ pinId: "r1", cutId: "cut-12", normX: 0.6, normY: 0.6, authorId: "pd-kim", assigneeRole: "colorist", category: "coloring" }),
      makePin({ pinId: "r2", cutId: "cut-12", normX: 0.62, normY: 0.61, authorId: "ad-choi", assigneeRole: "colorist", category: "coloring" }),
    ]);
    expect(r2.clusters[0]?.potentialConflict).toBe(false);
  });

  it("15. 단일 연결 체인 3핀 군집화 및 activeOnly 필터링 동작", () => {
    const pins = [
      makePin({ pinId: "c1", cutId: "cut-15", normX: 0.1, normY: 0.5, status: "open" }),
      makePin({ pinId: "c2", cutId: "cut-15", normX: 0.15, normY: 0.5, status: "verified-closed" }),
      makePin({ pinId: "c3", cutId: "cut-15", normX: 0.2, normY: 0.5, status: "open" }),
    ];
    expect(detectOverlappingRedlinePins(pins, { clusterRadiusNorm: 0.055 }).clusters[0]?.pinCount).toBe(3);
    expect(detectOverlappingRedlinePins(pins, { clusterRadiusNorm: 0.055, activeOnly: true }).clusters).toHaveLength(0);
  });

  it("16. 군집 감지 결과는 입력 핀 배열 순서와 무관하게 결정론적이다", () => {
    const a = makePin({ pinId: "p-a", cutId: "cut-03", normX: 0.2, normY: 0.3, authorId: "pd-1", assigneeRole: "inker" });
    const b = makePin({ pinId: "p-b", cutId: "cut-03", normX: 0.22, normY: 0.31, authorId: "ad-2", assigneeRole: "colorist" });
    const c = makePin({ pinId: "p-c", cutId: "cut-08", normX: 0.7, normY: 0.8 });
    expect(detectOverlappingRedlinePins([a, b, c])).toEqual(detectOverlappingRedlinePins([c, b, a]));
  });
});

describe("Wave 129 — PD 출고 승인 게이트 & 수정 라운드 차분", () => {
  it("17. blocker 핀 1건이라도 verified-closed 미달이면 완화 옵션에도 출고 차단(fail-closed)", () => {
    const signOff = evaluateEpisodeRevisionSignOff(
      [
        makePin({ pinId: "blk-1", severity: "blocker", status: "resolved-pending-verify" }),
        makePin({ pinId: "pol-1", severity: "polish", status: "verified-closed" }),
      ],
      { episodeId: "EP-21", episodeTitleKo: "제21화 옥상 결전", allowUnresolvedPolish: true, allowUnresolvedMajor: true },
    );
    expect(signOff.episodeSignOffReady).toBe(false);
    expect(signOff.signOffDecision).toBe("blocked");
    expect(signOff.blockingCodes).toContain("UNRESOLVED_BLOCKER_PINS");
    expect(signOff.unresolvedBlockerPinIds).toEqual(["blk-1"]);
  });

  it("18. blocker·major 전수 완료 후 polish만 남은 경우 기본 차단 vs allowUnresolvedPolish 조건부 승인", () => {
    const pins = [
      makePin({ pinId: "blk-1", severity: "blocker", status: "verified-closed" }),
      makePin({ pinId: "maj-1", severity: "major", status: "verified-closed" }),
      makePin({ pinId: "pol-1", severity: "polish", status: "open", assigneeRole: "colorist" }),
    ];
    const strictGate = evaluateEpisodeRevisionSignOff(pins);
    expect(strictGate.episodeSignOffReady).toBe(false);
    expect(strictGate.blockingCodes).toEqual(["UNRESOLVED_POLISH_PINS"]);

    const conditionalGate = evaluateEpisodeRevisionSignOff(pins, { allowUnresolvedPolish: true });
    expect(conditionalGate.episodeSignOffReady).toBe(true);
    expect(conditionalGate.signOffDecision).toBe("conditional-pass-with-polish");
    expect(conditionalGate.deferredPolishPinIds).toEqual(["pol-1"]);
  });

  it("19. major 미완료 시 기본 차단, 전수 verified-closed 완료 시 최종 승인된다", () => {
    const blocked = evaluateEpisodeRevisionSignOff([
      makePin({ pinId: "maj-1", severity: "major", status: "in-progress" }),
    ]);
    expect(blocked.episodeSignOffReady).toBe(false);
    expect(blocked.blockingCodes).toContain("UNRESOLVED_MAJOR_PINS");

    const approved = evaluateEpisodeRevisionSignOff([
      makePin({ pinId: "blk-1", severity: "blocker", status: "verified-closed" }),
      makePin({ pinId: "maj-1", severity: "major", status: "verified-closed" }),
      makePin({ pinId: "pol-1", severity: "polish", status: "verified-closed" }),
    ]);
    expect(approved.episodeSignOffReady).toBe(true);
    expect(approved.signOffDecision).toBe("approved");
    expect(approved.completionRatio).toBe(1);
    expect(approved.remainingPinCount).toBe(0);
  });

  it("20. blockOnPotentialConflicts=true 옵션은 활성 상충 군집 존재 시 출고를 차단한다", () => {
    const res = evaluateEpisodeRevisionSignOff(
      [
        makePin({ pinId: "cf-1", cutId: "cut-05", normX: 0.5, normY: 0.5, severity: "polish", authorId: "pd-1", assigneeRole: "colorist", category: "coloring" }),
        makePin({ pinId: "cf-2", cutId: "cut-05", normX: 0.52, normY: 0.5, severity: "polish", authorId: "ad-2", assigneeRole: "typesetter", category: "typesetting" }),
      ],
      { allowUnresolvedPolish: true, blockOnPotentialConflicts: true },
    );
    expect(res.episodeSignOffReady).toBe(false);
    expect(res.blockingCodes).toContain("UNRESOLVED_PIN_CONFLICT");
    expect(res.activeConflictClusterCount).toBe(1);
  });

  it("21. 라운드 1→2→3 차분에서 신규·해결·회귀 재오픈·진척 및 역할별 잔여 작업량을 정확히 계산한다", () => {
    const round1 = [
      makePin({ pinId: "p1", assigneeRole: "inker", status: "open", roundNumber: 1 }),
      makePin({ pinId: "p2", assigneeRole: "colorist", status: "resolved-pending-verify", roundNumber: 1 }),
      makePin({ pinId: "p3", assigneeRole: "typesetter", status: "open", roundNumber: 1 }),
      makePin({ pinId: "p4", assigneeRole: "bg3d-artist", status: "in-progress", roundNumber: 1 }),
    ];
    const round2 = [
      makePin({ pinId: "p1", assigneeRole: "inker", status: "verified-closed", roundNumber: 2 }),
      makePin({ pinId: "p2", assigneeRole: "colorist", status: "reopened", reopenCount: 1, lastReopenReasonKo: "그림자 경계 얼룩 잔존", roundNumber: 2 }),
      makePin({ pinId: "p3", assigneeRole: "typesetter", status: "in-progress", roundNumber: 2 }),
      makePin({ pinId: "p4", assigneeRole: "bg3d-artist", status: "in-progress", roundNumber: 2 }),
      makePin({ pinId: "p5", assigneeRole: "lead-artist", status: "open", roundNumber: 2 }),
    ];
    const diff12 = diffRevisionRounds(round1, round2);
    expect(diff12.fromRoundNumber).toBe(1);
    expect(diff12.toRoundNumber).toBe(2);
    expect(diff12.addedPinIds).toEqual(["p5"]);
    expect(diff12.closedPinIds).toEqual(["p1"]);
    expect(diff12.reopenedPinIds).toEqual(["p2"]);
    expect(diff12.progressedPinIds).toEqual(["p3"]);
    expect(diff12.unchangedPinIds).toEqual(["p4"]);
    expect(diff12.remainingByRole).toEqual({
      "pd-editor": 0, "art-director": 0, "lead-artist": 1,
      inker: 0, colorist: 1, typesetter: 1, "bg3d-artist": 1,
    });
    expect(diff12.netRemainingDelta).toBe(0);

    const round3 = [
      makePin({ pinId: "p1", assigneeRole: "inker", status: "reopened", reopenCount: 1, roundNumber: 3 }),
      makePin({ pinId: "p2", assigneeRole: "colorist", status: "verified-closed", reopenCount: 1, roundNumber: 3 }),
      makePin({ pinId: "p3", assigneeRole: "typesetter", status: "verified-closed", roundNumber: 3 }),
      makePin({ pinId: "p4", assigneeRole: "bg3d-artist", status: "verified-closed", roundNumber: 3 }),
      makePin({ pinId: "p5", assigneeRole: "lead-artist", status: "verified-closed", roundNumber: 3 }),
    ];
    const diff23 = diffRevisionRounds(round2, round3);
    expect(diff23.closedPinIds).toEqual(["p2", "p3", "p4", "p5"]);
    expect(diff23.reopenedPinIds).toEqual(["p1"]);
    expect(diff23.roundBRemainingCount).toBe(1);
    expect(diff23.netRemainingDelta).toBe(-3);
    expect(diff23.remainingByRole.inker).toBe(1);
  });

  it("22. 재오픈 뒤 곧바로 수정 중(in-progress)으로 넘어간 핀도 reopenCount 증가로 회귀 감지한다", () => {
    const r1 = [makePin({ pinId: "p-reg", status: "resolved-pending-verify", reopenCount: 0, roundNumber: 1 })];
    const r2 = [makePin({ pinId: "p-reg", status: "in-progress", reopenCount: 1, roundNumber: 2 })];
    expect(diffRevisionRounds(r1, r2).reopenedPinIds).toEqual(["p-reg"]);
  });

  it("23. 세션 래퍼(createRedlineRevisionSession)는 거부된 전이에서 원장을 불변 유지하고 승인 시 해시를 갱신한다", () => {
    const session = createRedlineRevisionSession(
      [makePin({ pinId: "s-1", severity: "blocker", assigneeRole: "inker" })],
      { episodeId: "EP-05", episodeTitleKo: "제5화 골목 추격" },
    );
    const hashBefore = session.getLedgerSha256Hex();
    expect(session.transitionPin("s-1", { targetStatus: "verified-closed", actorId: "pd-kim", actorRole: "pd-editor" })?.rejected).toBe(true);
    expect(session.getLedgerSha256Hex()).toBe(hashBefore);

    session.transitionPin("s-1", { targetStatus: "in-progress", actorId: "inker-1", actorRole: "inker" });
    session.transitionPin("s-1", { targetStatus: "resolved-pending-verify", actorId: "inker-1", actorRole: "inker" });
    expect(session.transitionPin("s-1", { targetStatus: "verified-closed", actorId: "inker-1", actorRole: "pd-editor" })?.rejectionCode).toBe("SELF_APPROVAL_FORBIDDEN");
    expect(session.evaluateSignOff().episodeSignOffReady).toBe(false);

    expect(session.transitionPin("s-1", { targetStatus: "verified-closed", actorId: "pd-kim", actorRole: "pd-editor" })?.rejected).toBe(false);
    expect(session.getLedgerSha256Hex()).not.toBe(hashBefore);
    expect(session.evaluateSignOff().episodeSignOffReady).toBe(true);
  });
});

describe("Wave 129 — FIPS 180-4 SHA-256 검수 원장 해시 & 결정론", () => {
  it("24. NIST FIPS 180-4 공식 테스트 벡터 3종과 100% 일치한다", () => {
    expect(sha256Utf8Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Utf8Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Utf8Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("25. 객체 키 삽입 순서 및 핀 배열 순서가 달라도 동일한 원장 SHA-256 해시를 산출한다", () => {
    const pinA1: RedlinePinItem = {
      pinId: "pin-10", cutId: "cut-02", normX: 0.25, normY: 0.75,
      category: "coloring", severity: "major", authorId: "pd-kim", authorRole: "pd-editor",
      assigneeRole: "colorist", noteKo: "야간 림라이트 채도 낮춤", roundNumber: 2, status: "open",
    };
    const pinA2: RedlinePinItem = {
      status: "open", roundNumber: 2, noteKo: "야간 림라이트 채도 낮춤", assigneeRole: "colorist",
      authorRole: "pd-editor", authorId: "pd-kim", severity: "major", category: "coloring",
      normY: 0.75, normX: 0.25, cutId: "cut-02", pinId: "pin-10",
    };
    const pinB = makePin({ pinId: "pin-20", cutId: "cut-08" });

    const hash1 = computeRedlineLedgerSha256Hex([pinA1, pinB]);
    const hash2 = computeRedlineLedgerSha256Hex([pinB, pinA2]);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/u);
    expect(hash1).toBe(hash2);
    expect(computeCanonicalObjectSha256Hex({ b: 2, a: { y: true, x: "한글" } })).toBe(
      computeCanonicalObjectSha256Hex({ a: { x: "한글", y: true }, b: 2 }),
    );
  });

  it("26. 핀 메모 1글자 또는 상태 변경 시 원장 해시가 즉시 달라진다(변조 감지)", () => {
    const hBase = computeRedlineLedgerSha256Hex([makePin({ noteKo: "말풍선 꼬리 방향 수정" })]);
    expect(computeRedlineLedgerSha256Hex([makePin({ noteKo: "말풍선 꼬리 위치 수정" })])).not.toBe(hBase);
    expect(computeRedlineLedgerSha256Hex([makePin({ noteKo: "말풍선 꼬리 방향 수정", status: "in-progress" })])).not.toBe(hBase);
  });
});

describe("Wave 129 — 경계 조건·비정상 좌표 정규화 & 빈 목록 방어", () => {
  it("27. 범위 밖 좌표(-0.5, 1.8) 및 NaN/Infinity 좌표를 안전하게 [0, 1]로 보정한다", () => {
    expect(clampNormalizedCoord(-0.5)).toBe(0);
    expect(clampNormalizedCoord(1.8)).toBe(1);
    expect(clampNormalizedCoord(Number.NaN)).toBe(0);
    expect(clampNormalizedCoord(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampNormalizedCoord(-0)).toBe(0);

    const norm = normalizeRedlinePin(makePin({ normX: Number.NaN, normY: 2.5, roundNumber: -3, reopenCount: -5 }));
    expect(norm.normX).toBe(0);
    expect(norm.normY).toBe(1);
    expect(norm.roundNumber).toBe(1);
    expect(norm.reopenCount).toBe(0);
  });

  it("28. 빈 핀 목록에서도 출고 승인·군집·라운드 차분·SVG·브리프가 NaN 없이 정상 동작한다", () => {
    const signOff = evaluateEpisodeRevisionSignOff([], { episodeId: "EP-00", episodeTitleKo: "프롤로그" });
    expect(signOff.episodeSignOffReady).toBe(true);
    expect(signOff.signOffDecision).toBe("approved");
    expect(signOff.completionRatio).toBe(1);

    const diff = diffRevisionRounds([], []);
    expect(diff.closureRateRatio).toBe(1);
    expect(diff.netRemainingDelta).toBe(0);

    const svg = renderRedlineRevisionBoardSvg([], signOff);
    expect(svg).toContain("등록된 레드라인 핀 없음");
    expect(svg).not.toMatch(/NaN|Infinity/u);

    const report = summarizeRedlineRevisionAuditKo([], signOff, diff);
    expect(report).toContain("출고 승인 가능");
    expect(report).toContain("전 역할 잔여 작업 없음");
  });
});

describe("Wave 129 — 순수 OKLCH SVG 보드 & XSS 방어 & 한국어 PD 브리프", () => {
  it("29. SVG에 대표 컷 핀 번호, 군집 원형 영역, 심각도 배지(BLOCKER/MAJOR/POLISH), 역할 막대, 승인 배지가 렌더링된다", () => {
    const pins = [
      makePin({ pinId: "p-1", cutId: "cut-04", normX: 0.4, normY: 0.35, severity: "blocker", authorId: "pd-kim", assigneeRole: "inker", category: "anatomy" }),
      makePin({ pinId: "p-2", cutId: "cut-04", normX: 0.43, normY: 0.37, severity: "major", authorId: "ad-choi", assigneeRole: "colorist", category: "coloring" }),
      makePin({ pinId: "p-3", cutId: "cut-04", normX: 0.78, normY: 0.72, severity: "polish", authorId: "pd-kim", assigneeRole: "typesetter", category: "typesetting", status: "verified-closed" }),
    ];
    const signOff = evaluateEpisodeRevisionSignOff(pins, { episodeId: "EP-12", episodeTitleKo: "제12화 지하 서고" });
    const svg = renderRedlineRevisionBoardSvg(pins, signOff);

    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    for (const token of ["BLOCKER", "MAJOR", "POLISH", "출고 차단", "상충", "선화", "채색", "<circle", "oklch("]) {
      expect(svg).toContain(token);
    }
  });

  it("30. SVG 출력에 원시 hex/rgb/rgba/hsl 색상이 0건이고 NaN/Infinity가 0건이다", () => {
    const pins = [
      makePin({ normX: Number.NaN, normY: Number.POSITIVE_INFINITY, severity: "blocker" }),
      makePin({ pinId: "p-2", normX: 0.02, normY: 0.98, severity: "major", status: "reopened" }),
      makePin({ pinId: "p-3", normX: 0.5, normY: 0.5, severity: "polish", status: "verified-closed" }),
    ];
    const svg = renderRedlineRevisionBoardSvg(pins, evaluateEpisodeRevisionSignOff(pins));
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(svg).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\s*\(/iu);
    expect(svg).not.toMatch(/\b(?:NaN|Infinity|-Infinity)\b/u);
  });

  it("31. XML 특수문자(<, >, &, \", ') 및 스크립트 주입 시도가 완벽히 이스케이프된다", () => {
    expect(escapeRedlineXml(`<script>alert("a&b'c")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;a&amp;b&apos;c&quot;)&lt;/script&gt;",
    );
    const maliciousPins = [
      makePin({
        pinId: `pin-<1>&"2"`,
        cutId: `cut-<img src=x onerror=alert(1)>`,
        noteKo: `대사 수정 <script>alert('xss')</script> & "강조"`,
      }),
    ];
    const signOff = evaluateEpisodeRevisionSignOff(maliciousPins, { episodeTitleKo: `제1화 <특수&"테스트'>` });
    const svg = renderRedlineRevisionBoardSvg(maliciousPins, signOff);
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<img ");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&quot;");
    expect(svg).toContain("&apos;");
  });

  it("32. 한국어 PD 마감 검수 브리프는 번역투 없이 차단 사유·상충·라운드 차분·SHA-256을 명확히 보고한다", () => {
    const round1 = [
      makePin({ pinId: "b-1", cutId: "cut-04", normX: 0.5, normY: 0.5, severity: "blocker", authorId: "pd-kim", assigneeRole: "inker", category: "anatomy", status: "open", roundNumber: 1 }),
      makePin({ pinId: "m-1", cutId: "cut-04", normX: 0.52, normY: 0.51, severity: "major", authorId: "ad-choi", assigneeRole: "colorist", category: "coloring", status: "resolved-pending-verify", roundNumber: 1 }),
    ];
    const round2 = [
      makePin({ pinId: "b-1", cutId: "cut-04", normX: 0.5, normY: 0.5, severity: "blocker", authorId: "pd-kim", assigneeRole: "inker", category: "anatomy", status: "resolved-pending-verify", resolvedByActorId: "inker-park", roundNumber: 2 }),
      makePin({ pinId: "m-1", cutId: "cut-04", normX: 0.52, normY: 0.51, severity: "major", authorId: "ad-choi", assigneeRole: "colorist", category: "coloring", status: "reopened", reopenCount: 1, lastReopenReasonKo: "피부 톤이 앞 컷과 다름", roundNumber: 2 }),
    ];
    const diff = diffRevisionRounds(round1, round2);
    const signOff = evaluateEpisodeRevisionSignOff(round2, { episodeId: "EP-19", episodeTitleKo: "제19화 비 오는 역 앞" });
    const report = summarizeRedlineRevisionAuditKo(round2, signOff, diff);

    for (const token of [
      "[웹툰 마감 검수 브리프]", "출고 보류", "출고 차단(BLOCKER) 1건",
      "라운드 변화(R1 → R2)", "회귀 재수정 1건", "지시 충돌 확인 필요",
      "수정자 본인이 아닌 담당 PD 또는 아트 디렉터", signOff.ledgerSha256Hex,
    ]) {
      expect(report).toContain(token);
    }
    for (const bad of ["가능하게 합니다", "직관적인 경험을 제공합니다", "원활한 워크플로우를 보장합니다", "극대화합니다", "혁신적인"]) {
      expect(report).not.toContain(bad);
    }
  });

  it("33. 조건부 출고 통과 시 SVG 배지와 한국어 브리프 모두 조건부 출고 상태와 이월 보완 건수를 반영한다", () => {
    const pins = [
      makePin({ pinId: "blk-ok", severity: "blocker", status: "verified-closed" }),
      makePin({ pinId: "pol-defer", severity: "polish", status: "open", assigneeRole: "typesetter" }),
    ];
    const signOff = evaluateEpisodeRevisionSignOff(pins, {
      episodeId: "EP-22", episodeTitleKo: "제22화 최종 교정", allowUnresolvedPolish: true,
    });
    expect(renderRedlineRevisionBoardSvg(pins, signOff)).toContain("조건부 출고");
    const report = summarizeRedlineRevisionAuditKo(pins, signOff);
    expect(report).toContain("조건부 출고 가능");
    expect(report).toContain("pol-defer");
  });

  it("34. 7개 스튜디오 역할의 잔여 작업량 세부 집계(blocker/major/polish·상태별)가 정확하다", () => {
    const pins = [
      makePin({ pinId: "r-pd", assigneeRole: "pd-editor", severity: "polish", status: "open" }),
      makePin({ pinId: "r-ad", assigneeRole: "art-director", severity: "major", status: "in-progress" }),
      makePin({ pinId: "r-lead", assigneeRole: "lead-artist", severity: "blocker", status: "reopened" }),
      makePin({ pinId: "r-ink", assigneeRole: "inker", severity: "blocker", status: "resolved-pending-verify" }),
      makePin({ pinId: "r-col", assigneeRole: "colorist", severity: "major", status: "verified-closed" }),
      makePin({ pinId: "r-typ", assigneeRole: "typesetter", severity: "polish", status: "open" }),
      makePin({ pinId: "r-bg", assigneeRole: "bg3d-artist", severity: "major", status: "open" }),
    ];
    const signOff = evaluateEpisodeRevisionSignOff(pins);
    expect(signOff.remainingByRole).toEqual({
      "pd-editor": 1, "art-director": 1, "lead-artist": 1,
      inker: 1, colorist: 0, typesetter: 1, "bg3d-artist": 1,
    });
    expect(signOff.remainingDetailByRole["lead-artist"].blocker).toBe(1);
    expect(signOff.remainingDetailByRole["lead-artist"].reopened).toBe(1);
    expect(signOff.remainingDetailByRole.inker.pendingVerify).toBe(1);
    expect(signOff.remainingDetailByRole.colorist.total).toBe(0);
    expect(signOff.remainingDetailByRole["bg3d-artist"].major).toBe(1);
  });
});
