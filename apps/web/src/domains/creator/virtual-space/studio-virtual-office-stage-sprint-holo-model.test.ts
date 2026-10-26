import { describe, expect, it } from "vitest";
import {
  addFocusSprintIntention,
  advanceFocusSprintPhase,
  buildStudioStageSprintHoloSummary,
  createInitialStudioStageSprintHoloState,
  promoteGreenRoomPresenterToMainStage,
  recordNewSpatialGhostClip,
  rotateSpeedCritiqueTables,
  setSpatialGhostPlaybackState,
  toggleFocusSprintIntentionCompleted,
  toggleGreenRoomDeviceCheck,
  traverseSpatialPortal,
  updateAmbientSoundscapeZone,
  upvoteStageQnaItem,
} from "./studio-virtual-office-stage-sprint-holo-model";

describe("studio-virtual-office-stage-sprint-holo-model (Wave 3: Remo, Spatial.io, ENGAGE XR, Airmeet, Bramble, Focusmate, Flow Club)", () => {
  it("creates initial Wave-3 state and computes accurate summary metrics", () => {
    const state = createInitialStudioStageSprintHoloState();
    const summary = buildStudioStageSprintHoloSummary(state);

    expect(summary.greenRoomAllChecksReady).toBe(false);
    expect(summary.isMainStageLive).toBe(false);
    expect(summary.critiqueRotationRound).toBe(1);
    expect(summary.totalQnaUpvotes).toBe(18);
    expect(summary.activeHologramRecordingCount).toBe(1);
    expect(summary.totalPortalTravellersCount).toBe(6);
    expect(summary.completedSprintGoalsCount).toBe(1);
    expect(summary.totalSprintGoalsCount).toBe(3);
    expect(summary.voiceDuckingZoneCount).toBe(2);
  });

  it("gates Airmeet Backstage Green Room promotion until mic, cam, and deck checks are all ready", () => {
    let state = createInitialStudioStageSprintHoloState();

    // Cannot promote before deckSynced is true
    state = promoteGreenRoomPresenterToMainStage(state);
    expect(state.greenRoom.stageLiveState).toBe("in-green-room");

    // Toggle deck check -> now all 3 ready -> promote to main stage
    state = toggleGreenRoomDeviceCheck(state, "deck");
    expect(buildStudioStageSprintHoloSummary(state).greenRoomAllChecksReady).toBe(true);

    state = promoteGreenRoomPresenterToMainStage(state);
    expect(state.greenRoom.stageLiveState).toBe("live-on-main-stage");
  });

  it("rotates Remo speed-critique tables cyclically and sorts Q&A items by upvotes", () => {
    let state = createInitialStudioStageSprintHoloState();
    const initialTableA = state.critiqueTables[0].seatedMemberNames;

    state = rotateSpeedCritiqueTables(state);
    expect(state.critiqueTables[0].rotationRound).toBe(2);
    expect(state.critiqueTables[1].seatedMemberNames).toEqual(initialTableA);

    // Upvote qna-2 five times so it overtakes qna-1 (7 + 5 = 12 > 11)
    for (let i = 0; i < 5; i++) {
      state = upvoteStageQnaItem(state, "qna-2");
    }
    expect(state.stageQnaQueue[0].qnaId).toBe("qna-2");
    expect(state.stageQnaQueue[0].upvotes).toBe(12);
  });

  it("records and controls ENGAGE XR 3D ghost avatar holograms and traverses Spatial.io portals", () => {
    let state = createInitialStudioStageSprintHoloState();

    state = recordNewSpatialGhostClip(
      state,
      "EP.42 마법진 폭발 이펙트 공간 동선 리허설",
      "2F 3D 배경 랩",
      150,
    );
    expect(state.ghostRecordings).toHaveLength(3);
    expect(state.ghostRecordings[0].playbackState).toBe("playing-hologram");

    state = setSpatialGhostPlaybackState(state, "ghost-rec-1", "paused", 95);
    const rec1 = state.ghostRecordings.find((r) => r.recordingId === "ghost-rec-1");
    expect(rec1?.playbackState).toBe("paused");
    expect(rec1?.currentPlayheadSec).toBe(95);

    state = traverseSpatialPortal(state, "portal-ep42-cathedral");
    const portal = state.spatialPortals.find((p) => p.portalId === "portal-ep42-cathedral");
    expect(portal?.activeTravellersCount).toBe(5);
  });

  it("advances Focusmate / Flow Club focus sprint phases, toggles goal completion, and updates Bramble soundscapes", () => {
    let state = createInitialStudioStageSprintHoloState();

    state = advanceFocusSprintPhase(state, "sprint-50m-night");
    expect(state.focusSprints[0].currentPhase).toBe("silent-deep-drawing");

    state = toggleFocusSprintIntentionCompleted(state, "sprint-50m-night", "mem-bg-3d");
    state = addFocusSprintIntention(
      state,
      "sprint-50m-night",
      "정어시 배경팀",
      "성채 복도 횃불 파티클 배치 완료",
    );

    const summary = buildStudioStageSprintHoloSummary(state);
    expect(summary.completedSprintGoalsCount).toBe(2);
    expect(summary.totalSprintGoalsCount).toBe(4);

    state = updateAmbientSoundscapeZone(
      state,
      "zone-sound-atelier",
      "cathedral-reverb",
      60,
      false,
    );
    expect(state.soundscapeZones[0].soundscapePreset).toBe("cathedral-reverb");
    expect(state.soundscapeZones[0].ambientVolumePercent).toBe(60);
    expect(state.soundscapeZones[0].voiceDuckingEnabled).toBe(false);
  });
});
