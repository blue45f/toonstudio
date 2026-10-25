import { describe, expect, it } from "vitest";

import {
  acknowledgeAsyncDeskNote,
  completeAiAgentDeskTask,
  computeWeeklyOfficePulseInsights,
  createDefaultVirtualOfficeEnterpriseState,
  dispatchTaskToAiAgentDesk,
  executeHostModerationCommand,
  executeVirtualOfficeMcpQuery,
  formatCreatorDccTrueStatusBadge,
  leaveAsyncDeskNote,
  moveScreenShareLaserPointer,
  pinCanvasReferenceMedia,
  searchVirtualOfficeMeetingMemories,
  spinVirtualOfficeRoulette,
  startSimultaneousScreenShareSlot,
  stopSimultaneousScreenShareSlot,
  toggleMeetingActionItemDone,
  togglePinCanvasReferenceMediaLock,
  updateCreatorDccTrueStatus,
} from "./studio-virtual-office-ai-agents-memory-model";

describe("studio-virtual-office-ai-agents-memory-model", () => {
  it("Spot Virtual / SoWork 스타일 AI 에이전트 데스크에 태스크를 배정하고 완료 산출물을 누적한다", () => {
    const initial = createDefaultVirtualOfficeEnterpriseState();
    const dispatched = dispatchTaskToAiAgentDesk(
      initial,
      "agent-layer-auditor",
      "14화 31~50컷 PSD 레이어 분리 규격 감사",
      "EP.14",
      1_730_000_000_000,
    );
    const workingAgent = dispatched.aiAgentDesks.find((a) => a.id === "agent-layer-auditor");
    expect(workingAgent?.status).toBe("working");
    expect(workingAgent?.currentTaskKo).toContain("31~50컷");

    const completed = completeAiAgentDeskTask(
      dispatched,
      "agent-layer-auditor",
      "전 컷 레이어 규격 일치 · 누락 픽셀 0건",
      1_730_000_060_000,
    );
    const doneAgent = completed.aiAgentDesks.find((a) => a.id === "agent-layer-auditor");
    expect(doneAgent?.status).toBe("completed");
    expect(doneAgent?.completedCount).toBe((workingAgent?.completedCount ?? 0) + 1);
  });

  it("SoWork Memory / Cosmos AI Replay 회의록 검색 및 액션아이템 완료 토글을 처리한다", () => {
    const initial = createDefaultVirtualOfficeEnterpriseState();
    const searchHits = searchVirtualOfficeMeetingMemories(initial, "림라이트");
    expect(searchHits.length).toBe(1);
    expect(searchHits[0]?.id).toBe("memory-ep14-lighting");

    const toggled = toggleMeetingActionItemDone(initial, "memory-ep14-lighting", "act-2");
    const updatedAct = toggled.meetingMemories
      .find((m) => m.id === "memory-ep14-lighting")
      ?.actionItems.find((a) => a.id === "act-2");
    expect(updatedAct?.done).toBe(true);
  });

  it("MCP / OpenClaw 오피스 컨텍스트 쿼리 인텐트 4종에 대해 구조화된 응답을 반환한다", () => {
    const state = createDefaultVirtualOfficeEnterpriseState();
    const who = executeVirtualOfficeMcpQuery(state, "who-is-around");
    expect(who.protocolVersion).toBe("toonstudio-office-mcp/1.0");
    expect(who.bulletsKo.length).toBeGreaterThanOrEqual(3);

    const decisions = executeVirtualOfficeMcpQuery(state, "last-meeting-decisions");
    expect(decisions.headlineKo).toContain("14화 옥상 클라이맥스");

    const bottlenecks = executeVirtualOfficeMcpQuery(state, "active-bottlenecks");
    expect(bottlenecks.bulletsKo.length).toBeGreaterThan(0);

    const agents = executeVirtualOfficeMcpQuery(state, "agent-desk-status");
    expect(agents.headlineKo).toContain("AI 에이전트 데스크");
  });

  it("Tandem / Cosmos True Status 창작 툴 프레즌스 갱신 및 보안 마스킹 배지를 생성한다", () => {
    const state = createDefaultVirtualOfficeEnterpriseState();
    const updated = updateCreatorDccTrueStatus(
      state,
      "creator-self",
      "photoshop",
      "EP15_Secret_Ending_LUT.psd",
      true,
      1_730_000_100_000,
    );
    const selfEntry = updated.creatorTrueStatuses.find((c) => c.participantId === "creator-self")!;
    expect(selfEntry.privacyMasked).toBe(true);
    expect(formatCreatorDccTrueStatusBadge(selfEntry)).toBe("Adobe Photoshop · 보안 마스킹 작업 파일");
  });

  it("Roam Aikido 비동기 데스크 노트 드롭 및 수신 확인을 처리한다", () => {
    const state = createDefaultVirtualOfficeEnterpriseState();
    const dropped = leaveAsyncDeskNote(state, {
      id: "note-99",
      fromName: "수석 배경 아티스트",
      targetDeskOwnerId: "creator-art-jun",
      targetDeskOwnerName: "준 작가",
      mediaKind: "voice-memo",
      durationSec: 55,
      summaryKo: "38컷 배경 소실점 보정 안내",
      episodeCutRef: "EP.14 · Cut 38",
      nowMs: 1_730_000_200_000,
    });
    expect(dropped.asyncDeskNotes[0]?.id).toBe("note-99");
    expect(dropped.asyncDeskNotes[0]?.acknowledged).toBe(false);

    const acked = acknowledgeAsyncDeskNote(dropped, "note-99", 1_730_000_300_000);
    expect(acked.asyncDeskNotes[0]?.acknowledged).toBe(true);
  });

  it("동시 화면 공유 그리드는 최대 4개 슬롯 제한을 준수하고 레이저 포인터 좌표를 정규화한다", () => {
    let state = createDefaultVirtualOfficeEnterpriseState();
    expect(state.screenShareSlots.length).toBe(2);

    const slot3 = startSimultaneousScreenShareSlot(state, {
      slotId: "share-slot-3",
      presenterId: "creator-pd-min",
      presenterName: "민 프로듀서",
      streamTitleKo: "14화 콘티 비교 뷰",
      dccApp: "toonstudio-storyboarder",
      resolutionLabel: "1080p-60fps",
      laserPointer: { active: true, xNorm: 0.2, yNorm: 0.3, pointerOwnerName: "민 프로듀서" },
    });
    expect(slot3.ok).toBe(true);
    state = slot3.state;

    const slot4 = startSimultaneousScreenShareSlot(state, {
      slotId: "share-slot-4",
      presenterId: "creator-edit-sora",
      presenterName: "소라 편집자",
      streamTitleKo: "식자 검수 시트",
      dccApp: "photoshop",
      resolutionLabel: "1440p-color-calibrated",
      laserPointer: { active: true, xNorm: 0.4, yNorm: 0.4, pointerOwnerName: "소라 편집자" },
    });
    expect(slot4.ok).toBe(true);
    state = slot4.state;

    const slot5Overflow = startSimultaneousScreenShareSlot(state, {
      slotId: "share-slot-5",
      presenterId: "creator-extra",
      presenterName: "추가 발표자",
      streamTitleKo: "초과 슬롯",
      dccApp: "blender-3d",
      resolutionLabel: "1080p-60fps",
      laserPointer: { active: false, xNorm: 0.5, yNorm: 0.5, pointerOwnerName: "추가 발표자" },
    });
    expect(slot5Overflow.ok).toBe(false);
    expect(slot5Overflow.reason).toBe("limit-reached");

    const pointerMoved = moveScreenShareLaserPointer(state, "share-slot-1", 1.5, -0.2, "민 프로듀서");
    const s1 = pointerMoved.screenShareSlots.find((s) => s.slotId === "share-slot-1");
    expect(s1?.laserPointer.xNorm).toBe(1);
    expect(s1?.laserPointer.yNorm).toBe(0);

    const afterStop = stopSimultaneousScreenShareSlot(pointerMoved, "share-slot-4");
    expect(afterStop.screenShareSlots.length).toBe(3);
  });

  it("ZEP 호스트 관제, SpatialChat 미디어 핀, SoWork 주간 인사이트를 계산한다", () => {
    let state = createDefaultVirtualOfficeEnterpriseState();
    state = executeHostModerationCommand(state, "summon-all", "room-1f-townhall", 1_730_000_400_000);
    expect(state.hostModeration.summonedRoomId).toBe("room-1f-townhall");

    state = executeHostModerationCommand(state, "mute-all", null, 1_730_000_410_000);
    expect(state.hostModeration.allMuted).toBe(true);

    const spin = spinVirtualOfficeRoulette(state, ["갑", "을", "병"], 4);
    expect(spin.winner).toBe("을");

    const pinned = pinCanvasReferenceMedia(spin.state, {
      id: "pin-new-99",
      titleKo: "15화 액션 구도 레퍼런스",
      mediaType: "reference-sheet",
      x: 100,
      y: 120,
      scale: 1,
      lockedOnCanvas: true,
      pinnedByName: "준 작가",
    });
    const unlockedPin = togglePinCanvasReferenceMediaLock(pinned, "pin-new-99");
    expect(unlockedPin.pinnedCanvasMedia.find((p) => p.id === "pin-new-99")?.lockedOnCanvas).toBe(false);

    const pulse = computeWeeklyOfficePulseInsights(unlockedPin);
    expect(pulse.deepFocusHours).toBeGreaterThan(pulse.meetingHours);
    expect(pulse.aiMinutesSaved).toBeGreaterThan(0);
  });
});
