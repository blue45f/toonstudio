import { describe, expect, it } from "vitest";
import {
  addStudioScreenInkStroke,
  buildStudioPairingXrFloorSummary,
  createInitialStudioPairingXrFloorState,
  equipStudioMemberStatusHat,
  handoffRemoteAppControlDriver,
  joinFloorShadowingSession,
  postStudioKudosShoutout,
  pruneExpiredFadingInkStrokes,
  reactToStudioKudosShoutout,
  resolveReceptionLobbyGuest,
  respondToTeammateSummon,
  sendDirectorWhisperDirective,
  summonTeammateToStudioRoom,
  toggleStudioRoomDoorLock,
  update3dAssetPedestalInspection,
} from "./studio-virtual-office-pairing-xr-floor-model";

describe("studio-virtual-office-pairing-xr-floor-model (Wave 2: Teemyco, Sococo, Tuple, Pop, Nooks, Virbela, FrameVR, Arthur)", () => {
  it("creates initial Wave-2 state and computes accurate summary metrics", () => {
    const state = createInitialStudioPairingXrFloorState();
    const summary = buildStudioPairingXrFloorSummary(state);

    expect(summary.activeHatsCount).toBe(3);
    expect(summary.interruptProtectedMemberCount).toBe(1);
    expect(summary.totalKudosCount).toBe(2);
    expect(summary.totalKudosReactions).toBe(23);
    expect(summary.activeFloorplanStreamsCount).toBe(4);
    expect(summary.lockedRoomCount).toBe(1);
    expect(summary.pendingSummonCount).toBe(1);
    expect(summary.waitingReceptionGuestCount).toBe(1);
    expect(summary.activeFadingInkCount).toBe(1);
    expect(summary.activePersistentRedlineCount).toBe(1);
    expect(summary.sharedControlActiveSessionCount).toBe(1);
    expect(summary.activeShadowingTraineeCount).toBe(1);
    expect(summary.totalPedestalSpatialPins).toBe(2);
  });

  it("equips Teemyco status hats and blocks direct summons when wearing a focus/sprint hat", () => {
    let state = createInitialStudioPairingXrFloorState();
    state = equipStudioMemberStatusHat(
      state,
      "mem-lead-line",
      "deadline-sprint-headband",
      "",
      "2026-10-26T11:00:00.000Z",
    );

    const updatedLead = state.memberHats.find(
      (item) => item.memberId === "mem-lead-line",
    );
    expect(updatedLead?.equippedHatId).toBe("deadline-sprint-headband");
    expect(updatedLead?.customStatusNote).toContain("업로드 직전 최종 식자");

    // Attempt to summon member wearing interrupt-blocking hat should be ignored
    const beforeSummonCount = state.summonRequests.length;
    state = summonTeammateToStudioRoom(
      state,
      "mem-pd-review",
      "mem-lead-line",
      "김선화 메인작가",
      "room-xr-auditorium",
      "긴급 호출 테스트",
    );
    expect(state.summonRequests.length).toBe(beforeSummonCount);
  });

  it("posts Teemyco kudos shoutouts and increments reaction counts", () => {
    let state = createInitialStudioPairingXrFloorState();
    state = postStudioKudosShoutout(
      state,
      {
        fromMemberId: "mem-pd-review",
        fromDisplayName: "이피디 총괄PD",
        toMemberId: "mem-bg-3d",
        toDisplayName: "박배경 3D디렉터",
        episodeCode: "EP.42",
        category: "deadline-hero",
        message: "야간 성채 렌더링 마감 사수 정말 감사합니다!",
      },
      "2026-10-26T11:05:00.000Z",
    );

    expect(state.kudosWall).toHaveLength(3);
    const topCard = state.kudosWall[0];
    expect(topCard.message).toBe("야간 성채 렌더링 마감 사수 정말 감사합니다!");
    expect(topCard.reactionsCount).toBe(1);

    state = reactToStudioKudosShoutout(state, topCard.kudosId);
    expect(state.kudosWall[0].reactionsCount).toBe(2);
  });

  it("handles Sococo Get-Teammate summons, door locks, and Guest Reception Lobby queue", () => {
    let state = createInitialStudioPairingXrFloorState();

    // Accept pending summon sum-1 -> moves mem-lead-line to room-xr-auditorium
    state = respondToTeammateSummon(state, "sum-1", "accepted");
    const auditorium = state.floorplanMediaMatrix.find(
      (room) => room.roomId === "room-xr-auditorium",
    );
    expect(auditorium?.occupantMemberIds).toContain("mem-lead-line");

    // Admit external guest in reception lobby
    state = resolveReceptionLobbyGuest(state, "guest-ext-sound", "admitted");
    const updatedGuest = state.receptionGuests.find(
      (g) => g.guestId === "guest-ext-sound",
    );
    expect(updatedGuest?.status).toBe("admitted");
    const auditoriumAfterGuest = state.floorplanMediaMatrix.find(
      (room) => room.roomId === "room-xr-auditorium",
    );
    expect(auditoriumAfterGuest?.occupantMemberIds).toContain(
      "guest-ext-sound",
    );

    // Toggle room lock on room-line-pod-a
    state = toggleStudioRoomDoorLock(state, "room-line-pod-a");
    const podA = state.floorplanMediaMatrix.find(
      (room) => room.roomId === "room-line-pod-a",
    );
    expect(podA?.doorLocked).toBe(true);
    expect(podA?.getTeammateSummonAllowed).toBe(false);
  });

  it("manages Tuple/Pop ephemeral fading laser ink vs persistent redline ink and remote control handoff", () => {
    let state = createInitialStudioPairingXrFloorState();
    const nowMs = 1761475000000;

    state = addStudioScreenInkStroke(
      state,
      {
        authorMemberId: "mem-pd-review",
        authorDisplayName: "이피디 총괄PD",
        mode: "fading-laser-ink",
        targetCutCode: "EP42-CUT28",
        noteLabel: "손가락 각도 레이저 포인터",
        ttlMs: 3000,
      },
      nowMs,
    );
    state = addStudioScreenInkStroke(
      state,
      {
        authorMemberId: "mem-pd-review",
        authorDisplayName: "이피디 총괄PD",
        mode: "persistent-redline-ink",
        targetCutCode: "EP42-CUT28",
        noteLabel: "망토 주름선 영구 보정 지시",
      },
      nowMs,
    );

    // Prune after 4 seconds -> fading ink expires, persistent redline remains
    state = pruneExpiredFadingInkStrokes(state, nowMs + 4000);
    expect(
      state.screenInkStrokes.every(
        (stroke) => stroke.mode !== "fading-laser-ink",
      ),
    ).toBe(true);
    expect(
      state.screenInkStrokes.some(
        (stroke) => stroke.noteLabel === "망토 주름선 영구 보정 지시",
      ),
    ).toBe(true);

    // Remote app control handoff on Blender 4.3
    state = handoffRemoteAppControlDriver(
      state,
      "rcs-blender-2",
      "mem-lead-line",
    );
    const blenderSession = state.remoteControlSessions.find(
      (s) => s.sessionId === "rcs-blender-2",
    );
    expect(blenderSession?.activeControllerMemberId).toBe("mem-lead-line");
    expect(blenderSession?.controlDriverState).toBe("shared-driver-active");
  });

  it("updates Nooks floor coaching whisper directives and FrameVR/Virbela/Arthur 3D pedestal inspection", () => {
    let state = createInitialStudioPairingXrFloorState();

    state = joinFloorShadowingSession(state, "coach-1", "mem-new-intern");
    state = sendDirectorWhisperDirective(
      state,
      "coach-1",
      "PD 귓속말: 43화 예고편 떡밥 컷은 대외비로 가리고 보여주세요.",
    );

    const coaching = state.floorCoachingSessions[0];
    expect(coaching.shadowingMemberIds).toContain("mem-new-intern");
    expect(coaching.lastWhisperDirective).toContain("43화 예고편 떡밥 컷");

    state = update3dAssetPedestalInspection(state, "pedestal-throne-hall", {
      turntableAngleDeg: 405,
      selectedAuditoriumCameraPreset: "presenter-closeup",
      appendSpatialPinNote: "천장 샹들리에 그림자 텍스처 해상도 4K 업스케일",
    });

    const pedestal = state.assetPedestals[0];
    expect(pedestal.turntableAngleDeg).toBe(45);
    expect(pedestal.selectedAuditoriumCameraPreset).toBe("presenter-closeup");
    expect(pedestal.spatialPinNotes).toHaveLength(3);
  });
});
