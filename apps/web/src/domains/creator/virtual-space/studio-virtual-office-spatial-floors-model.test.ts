import { describe, expect, it } from "vitest";

import {
  computeDirectionalVoiceConeGain,
  createDefaultVirtualOfficeBuildingState,
  filterVisibleFloorChatMessages,
  getRoomPersistentTableSnapshot,
  moveParticipantToFloor,
  pinRoomTableApp,
  postFloorScopedChatMessage,
  requestRoomKnock,
  resolveRoomKnock,
  sendShoulderTap,
  toggleVirtualOfficeRoomLock,
  unpinRoomTableApp,
} from "./studio-virtual-office-spatial-floors-model";

describe("studio-virtual-office-spatial-floors-model", () => {
  it("엘리베이터 층 이동 시 열린 방은 즉시 이동하고 잠긴 방은 room-locked로 차단한다", () => {
    const initial = createDefaultVirtualOfficeBuildingState();
    const moved1f = moveParticipantToFloor(initial, "creator-self", "floor-1f");
    expect(moved1f.ok).toBe(true);
    expect(moved1f.state.activeFloorId).toBe("floor-1f");
    expect(moved1f.state.participantRoomMap["creator-self"]).toBe("room-1f-townhall");

    // 3F 스포일러 보안 콘티 회의실(room-3f-conte-vault)은 잠겨 있고 creator-self는 허용 명단에 없음
    const blocked3f = moveParticipantToFloor(
      moved1f.state,
      "creator-self",
      "floor-3f",
      "room-3f-conte-vault",
    );
    expect(blocked3f.ok).toBe(false);
    expect(blocked3f.reason).toBe("room-locked");
  });

  it("잠긴 방에 Knock-to-Enter 요청 후 승인(approved)되면 허용 명단에 추가되고 방으로 입장한다", () => {
    const initial = createDefaultVirtualOfficeBuildingState();
    const withKnock = requestRoomKnock(initial, {
      id: "knock-test-99",
      roomId: "room-3f-conte-vault",
      requesterId: "creator-self",
      requesterName: "수석 배경 아티스트",
      messageKo: "15화 피날레 배경 조명 조율 요청",
      urgency: "urgent-deadline",
      nowMs: 1_730_000_000_000,
    });
    expect(withKnock.knockQueue[0]?.id).toBe("knock-test-99");
    expect(withKnock.knockQueue[0]?.status).toBe("pending");

    const approved = resolveRoomKnock(
      withKnock,
      "knock-test-99",
      "approved",
      "creator-edit-sora",
      1_730_000_010_000,
    );
    const resolvedKnock = approved.knockQueue.find((k) => k.id === "knock-test-99");
    expect(resolvedKnock?.status).toBe("approved");
    expect(approved.participantFloorMap["creator-self"]).toBe("floor-3f");
    expect(approved.participantRoomMap["creator-self"]).toBe("room-3f-conte-vault");
  });

  it("방 잠금 해제 후에는 별도 노크 없이도 입장할 수 있다", () => {
    const initial = createDefaultVirtualOfficeBuildingState();
    const unlocked = toggleVirtualOfficeRoomLock(initial, "room-3f-conte-vault", false);
    const moved = moveParticipantToFloor(
      unlocked,
      "creator-self",
      "floor-3f",
      "room-3f-conte-vault",
    );
    expect(moved.ok).toBe(true);
    expect(moved.state.participantRoomMap["creator-self"]).toBe("room-3f-conte-vault");
  });

  it("Shoulder Tap 전송 시 상대방 상태(available / focusing / dnd)와 긴급도에 따라 전달 모드를 분기한다", () => {
    const initial = createDefaultVirtualOfficeBuildingState();
    const focusingTap = sendShoulderTap(initial, {
      id: "tap-1",
      fromId: "creator-self",
      fromName: "수석 배경 아티스트",
      toId: "creator-art-jun",
      toName: "준 작가",
      targetStatus: "focusing",
      reasonCategory: "conte-confirm",
      messageKo: "34컷 레이어 확인 부탁해요",
      nowMs: 1_730_000_100_000,
    });
    expect(focusingTap.shoulderTaps[0]?.deliveryMode).toBe("queued-after-focus");

    const dndBlockedTap = sendShoulderTap(focusingTap, {
      id: "tap-2",
      fromId: "creator-self",
      fromName: "수석 배경 아티스트",
      toId: "creator-edit-sora",
      toName: "소라 편집자",
      targetStatus: "dnd",
      reasonCategory: "color-guide",
      messageKo: "컬러 가이드 공유",
      nowMs: 1_730_000_200_000,
    });
    expect(dndBlockedTap.shoulderTaps[0]?.deliveryMode).toBe("blocked-by-dnd");

    const dndUrgentTap = sendShoulderTap(dndBlockedTap, {
      id: "tap-3",
      fromId: "creator-self",
      fromName: "수석 배경 아티스트",
      toId: "creator-edit-sora",
      toName: "소라 편집자",
      targetStatus: "dnd",
      reasonCategory: "urgent-publish",
      messageKo: "마감 출고 파일 긴급 오류 확인",
      nowMs: 1_730_000_300_000,
    });
    expect(dndUrgentTap.shoulderTaps[0]?.deliveryMode).toBe("instant-wave");
  });

  it("Teamflow 스타일 영구 회의 테이블은 참석자가 0명인 빈 방에서도 고정된 원고 앱을 유지한다", () => {
    const initial = createDefaultVirtualOfficeBuildingState();
    // room-2f-color-booth는 기본 재실 인원이 0명임
    const snapshot0 = getRoomPersistentTableSnapshot(initial, "room-2f-color-booth");
    expect(snapshot0?.occupantCount).toBe(0);
    expect(snapshot0?.isPersistedWhileEmpty).toBe(true);
    expect(snapshot0?.tableApps.length).toBe(1);

    const pinned = pinRoomTableApp(initial, "room-2f-color-booth", {
      id: "table-app-new",
      kind: "qc-checklist",
      titleKo: "14화 배경 투시선 검수표",
      titleEn: "EP.14 Perspective QC",
      episodeLabel: "EP.14",
      pinnedByName: "수석 배경 아티스트",
      updatedAtMs: 1_730_000_400_000,
      stateSummaryKo: "소실점 오차 0건",
    });
    const snapshot1 = getRoomPersistentTableSnapshot(pinned, "room-2f-color-booth");
    expect(snapshot1?.tableApps.length).toBe(2);

    const unpinned = unpinRoomTableApp(pinned, "room-2f-color-booth", "table-app-new");
    expect(getRoomPersistentTableSnapshot(unpinned, "room-2f-color-booth")?.tableApps.length).toBe(1);
  });

  it("Kumospace 다층 채팅은 room / floor / building-announcement 스코프별로 가시성을 분리한다", () => {
    let state = createDefaultVirtualOfficeBuildingState();
    state = postFloorScopedChatMessage(state, {
      id: "msg-room-3f",
      scope: "room",
      floorId: "floor-3f",
      roomId: "room-3f-conte-vault",
      authorId: "creator-edit-sora",
      authorName: "소라 편집자",
      text: "3층 보안 콘티실 내부 전용 메모",
      nowMs: 1_730_000_500_000,
    });
    state = postFloorScopedChatMessage(state, {
      id: "msg-building-all",
      scope: "building-announcement",
      floorId: "floor-1f",
      roomId: null,
      authorId: "creator-pd-min",
      authorName: "민 프로듀서",
      text: "전 층 10분 뒤 1F 타운홀 집결",
      nowMs: 1_730_000_600_000,
    });

    const visibleOn2f = filterVisibleFloorChatMessages(state, "floor-2f", "room-2f-main-atelier");
    expect(visibleOn2f.some((m) => m.id === "msg-room-3f")).toBe(false);
    expect(visibleOn2f.some((m) => m.id === "msg-building-all")).toBe(true);
  });

  it("oVice 지향성 음성 콘(Directional Voice Cone)은 정면 응시 대비 후방 응시 시 음향 게인을 감쇠한다", () => {
    const front = computeDirectionalVoiceConeGain({
      speakerPoint: { x: 200, y: 200 },
      speakerHeadingDeg: 0,
      listenerPoint: { x: 280, y: 200 },
      maxRadius: 320,
    });
    const rear = computeDirectionalVoiceConeGain({
      speakerPoint: { x: 200, y: 200 },
      speakerHeadingDeg: 180,
      listenerPoint: { x: 280, y: 200 },
      maxRadius: 320,
    });
    expect(front.inFrontCone).toBe(true);
    expect(rear.inFrontCone).toBe(false);
    expect(front.gain).toBeGreaterThan(rear.gain);

    const soundproofBlocked = computeDirectionalVoiceConeGain({
      speakerPoint: { x: 200, y: 200 },
      speakerHeadingDeg: 0,
      listenerPoint: { x: 240, y: 200 },
      differentSoundproofRoom: true,
      megaphoneActive: false,
    });
    expect(soundproofBlocked.gain).toBe(0);
    expect(soundproofBlocked.isolatedBySoundproof).toBe(true);
  });
});
