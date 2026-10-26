import { describe, expect, it } from "vitest";
import {
  castWarroomDotVote,
  createDefaultVirtualOfficeWave4State,
  detectCursorHighFiveCollision,
  evaluateWave4WarroomAsyncStageCoverage,
  issueWeloVisitorPass,
  postMultiplayerCursorBubble,
  promoteStageHandRaiseToSpeaker,
  revealWarroomPrivateDrafts,
  switchBiophilicHabitatTheme,
  switchGoLiveSpotlightStream,
  toggleThreadHuddleChecklistItem,
  toggleWarroomBringEveryoneToHost,
  triggerThreadHuddleEmojiBurst,
  updateAsyncCutPinDecision,
  WAVE4_VIRTUAL_OFFICE_REA_EVIDENCE_CATALOG,
} from "./studio-virtual-office-warroom-async-stage-model";

describe("studio-virtual-office-warroom-async-stage-model (Wave 4 — 35 platforms total)", () => {
  it("verifies 100% Wave 4 REA evidence chain across all 7 platforms (35 cumulative platforms)", () => {
    const report = evaluateWave4WarroomAsyncStageCoverage();
    expect(report.totalWave4Platforms).toBe(7);
    expect(report.coverageRatio).toBe(1);
    expect(report.totalCumulativePlatformsAcrossAllWaves).toBe(35);

    for (const entry of WAVE4_VIRTUAL_OFFICE_REA_EVIDENCE_CATALOG) {
      expect(entry.captureId).toMatch(/^ev_[0-9a-f]{64}$/);
      expect(entry.exportId).toMatch(/^ev_[0-9a-f]{64}$/);
      expect(entry.astAnalysisId).toMatch(/^ev_[0-9a-f]{64}$/);
      expect(entry.inspectionId).toMatch(/^ev_[0-9a-f]{64}$/);
      expect(entry.visitedAstNodes).toBeGreaterThan(0);
    }
  });

  it("issues a Welo visitor pass and auto-locks the neighborhood boundary when 2+ members gather", () => {
    const initial = createDefaultVirtualOfficeWave4State();
    const bgZoneBefore = initial.neighborhoods.find((z) => z.zoneId === "nb-bg-3d");
    expect(bgZoneBefore?.autoBoundaryLocked).toBe(false);

    const next = issueWeloVisitorPass(initial, "nb-bg-3d", "외부 3D 에셋 감수자");
    const bgZoneAfter = next.neighborhoods.find((z) => z.zoneId === "nb-bg-3d");
    expect(bgZoneAfter?.activeMemberCount).toBe(2);
    expect(bgZoneAfter?.autoBoundaryLocked).toBe(true);
    expect(bgZoneAfter?.visitorGuestNameKo).toBe("외부 3D 에셋 감수자");
  });

  it("updates Claap async cut pin decision status immutably", () => {
    const initial = createDefaultVirtualOfficeWave4State();
    const updated = updateAsyncCutPinDecision(initial, "claap-pin-14-38", "approved-signoff");
    const target = updated.asyncCutPinThreads.find((t) => t.threadId === "claap-pin-14-38");
    expect(target?.decisionStatus).toBe("approved-signoff");
  });

  it("manages Miro storyboard war-room camera lock, private draft reveal, and dot voting budget", () => {
    let state = createDefaultVirtualOfficeWave4State();
    state = toggleWarroomBringEveryoneToHost(state, 42);
    expect(state.warroomBoard.bringEveryoneToHost).toBe(true);
    expect(state.warroomBoard.hostViewportTargetCut).toBe(42);

    state = revealWarroomPrivateDrafts(state);
    expect(state.warroomBoard.privateWritingMode).toBe(false);
    expect(state.warroomBoard.privateDraftsRevealed).toBe(true);

    state = castWarroomDotVote(state, "vote-opt-a");
    state = castWarroomDotVote(state, "vote-opt-a");
    state = castWarroomDotVote(state, "vote-opt-b");
    expect(state.warroomBoard.remainingDots).toBe(0);
    // Extra vote beyond budget should be ignored
    const afterExhausted = castWarroomDotVote(state, "vote-opt-b");
    expect(afterExhausted.warroomBoard.remainingDots).toBe(0);
    expect(
      afterExhausted.warroomBoard.votingOptions.find((o) => o.optionId === "vote-opt-a")?.votes,
    ).toBe(7);
  });

  it("detects FigJam multiplayer cursor High-Five collision physics and posts cursor chat bubbles", () => {
    const hit = detectCursorHighFiveCollision({ x: 224, y: 184 }, { x: 228, y: 186 }, 36);
    expect(hit.collided).toBe(true);
    expect(hit.effectLabelKo).toContain("하이파이브 성공");

    const miss = detectCursorHighFiveCollision({ x: 100, y: 100 }, { x: 300, y: 300 }, 36);
    expect(miss.collided).toBe(false);

    const state = createDefaultVirtualOfficeWave4State();
    const next = postMultiplayerCursorBubble(state, {
      bubbleId: "fjam-bubble-2",
      authorName: "수석 배경 아티스트",
      messageKo: "/38컷 광원 방향 오케이!",
      x: 224,
      y: 184,
      stampKind: "fire-composition",
    });
    expect(next.cursorBubbles[0]?.messageKo).toBe("/38컷 광원 방향 오케이!");
    expect(next.lastHighFiveEffectKo).toContain("하이파이브 성공");
  });

  it("promotes Discord Stage hand-raise listener to active speaker and switches Go-Live spotlight", () => {
    let state = createDefaultVirtualOfficeWave4State();
    state = promoteStageHandRaiseToSpeaker(state, "member-color-lead");
    expect(state.stageTheater.activeSpeakers).toContain("채색 팀장");
    expect(state.stageTheater.handRaiseQueue).toHaveLength(0);

    state = switchGoLiveSpotlightStream(state, "golive-blender-2");
    const blenderStream = state.stageTheater.streams.find((s) => s.streamId === "golive-blender-2");
    expect(blenderStream?.spotlighted).toBe(true);
  });

  it("switches Kosy biophilic habitat themes and updates Slack thread huddle sidecar checklists and emoji bursts", () => {
    let state = createDefaultVirtualOfficeWave4State();
    state = switchBiophilicHabitatTheme(state, "sunlit-greenhouse");
    expect(state.biophilicWellness.activeThemeId).toBe("sunlit-greenhouse");

    state = toggleThreadHuddleChecklistItem(state, "chk-2");
    expect(
      state.threadHuddleSidecar.checklistItems.find((i) => i.itemId === "chk-2")?.completed,
    ).toBe(true);

    state = triggerThreadHuddleEmojiBurst(state, "🚀");
    expect(state.threadHuddleSidecar.emojiBurstHistory[0]).toBe("🚀");
  });
});
