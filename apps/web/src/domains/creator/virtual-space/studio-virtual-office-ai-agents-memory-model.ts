/**
 * AI 에이전트 상주 데스크(Spot Virtual / SoWork 06 Agents)·AI 회의 메모리(SoWork 02 Memory / Cosmos AI Replay / Roam Magic Minutes)·
 * MCP/API 오피스 쿼리 브리지(SoWork 05 MCP/API / Spot OpenClaw)·실시간 DCC 작업 앱 프레즌스(Tandem / Cosmos True Status)·
 * 비동기 데스크 보이스/비디오 노트(Roam Aikido)·다중 화면 동시 공유(최대 4화면)·호스트 관제(ZEP)·주간 인사이트(SoWork 04 Insights) 도메인 모델.
 */

export type StudioAiAgentSpecialty = "meeting-scribe" | "typesetting-qa" | "layer-auditor" | "bg3d-assistant";
export type StudioAiAgentDeskStatus = "standby" | "working" | "completed";

export interface StudioVirtualOfficeAiAgentDesk {
  readonly id: string;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly specialty: StudioAiAgentSpecialty;
  readonly deskCode: string;
  readonly floorId: "floor-2f" | "floor-3f";
  readonly status: StudioAiAgentDeskStatus;
  readonly activeEpisodeCode: string;
  readonly currentTaskKo: string;
  readonly lastOutputKo: string;
  readonly completedCount: number;
  readonly updatedAtMs: number;
}

export interface StudioMeetingActionItem {
  readonly id: string;
  readonly assigneeName: string;
  readonly taskKo: string;
  readonly done: boolean;
}

export interface StudioMeetingTranscriptHighlight {
  readonly speakerName: string;
  readonly timestampLabel: string;
  readonly quoteKo: string;
}

export interface StudioVirtualOfficeMeetingMemory {
  readonly id: string;
  readonly titleKo: string;
  readonly episodeCode: string;
  readonly roomNameKo: string;
  readonly recordedAtMs: number;
  readonly summaryKo: string;
  readonly decisions: readonly string[];
  readonly actionItems: readonly StudioMeetingActionItem[];
  readonly highlights: readonly StudioMeetingTranscriptHighlight[];
  readonly tags: readonly string[];
}

export type StudioMcpQueryIntent =
  | "who-is-around"
  | "last-meeting-decisions"
  | "active-bottlenecks"
  | "agent-desk-status";

export interface StudioVirtualOfficeMcpQueryResponse {
  readonly intent: StudioMcpQueryIntent;
  readonly protocolVersion: "toonstudio-office-mcp/1.0";
  readonly headlineKo: string;
  readonly bulletsKo: readonly string[];
  readonly structuredPayload: Readonly<Record<string, unknown>>;
}

export type StudioCreatorDccAppId =
  | "clip-studio-paint"
  | "blender-3d"
  | "photoshop"
  | "sketchup-pro"
  | "toonstudio-storyboarder";

export interface StudioCreatorTrueStatusEntry {
  readonly participantId: string;
  readonly participantName: string;
  readonly roleKo: string;
  readonly deskLabelKo: string;
  readonly availability: "available" | "focusing" | "in-huddle";
  readonly activeDccApp: StudioCreatorDccAppId;
  readonly activeDocumentTitle: string;
  readonly privacyMasked: boolean;
  readonly updatedAtMs: number;
}

export interface StudioAsyncDeskNote {
  readonly id: string;
  readonly fromName: string;
  readonly targetDeskOwnerId: string;
  readonly targetDeskOwnerName: string;
  readonly mediaKind: "video-clip" | "voice-memo";
  readonly durationSec: number;
  readonly summaryKo: string;
  readonly episodeCutRef: string;
  readonly acknowledged: boolean;
  readonly createdAtMs: number;
  readonly acknowledgedAtMs: number | null;
}

export interface StudioSimultaneousScreenShareSlot {
  readonly slotId: string;
  readonly presenterId: string;
  readonly presenterName: string;
  readonly streamTitleKo: string;
  readonly dccApp: StudioCreatorDccAppId;
  readonly resolutionLabel: "1080p-60fps" | "1440p-color-calibrated" | "4K-lineart-inspect";
  readonly laserPointer: {
    readonly active: boolean;
    readonly xNorm: number;
    readonly yNorm: number;
    readonly pointerOwnerName: string;
  };
}

export interface StudioSpatialPinnedMediaAsset {
  readonly id: string;
  readonly titleKo: string;
  readonly mediaType: "reference-sheet" | "3d-snapshot" | "color-palette" | "episode-cut";
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly lockedOnCanvas: boolean;
  readonly pinnedByName: string;
}

export interface StudioHostModerationState {
  readonly allMuted: boolean;
  readonly movementFrozen: boolean;
  readonly summonedRoomId: string | null;
  readonly lastCommandLabelKo: string;
  readonly lastExecutedAtMs: number;
  readonly rouletteHistory: readonly string[];
  readonly attendanceCheckedIds: readonly string[];
}

export interface StudioWeeklyOfficePulseInsights {
  readonly deepFocusHours: number;
  readonly meetingHours: number;
  readonly focusToMeetingRatio: number;
  readonly aiMinutesSaved: number;
  readonly asyncNotesResolvedCount: number;
  readonly crossPartHuddleScore: number;
  readonly recommendationKo: string;
}

export interface StudioVirtualOfficeEnterpriseState {
  readonly aiAgentDesks: readonly StudioVirtualOfficeAiAgentDesk[];
  readonly meetingMemories: readonly StudioVirtualOfficeMeetingMemory[];
  readonly creatorTrueStatuses: readonly StudioCreatorTrueStatusEntry[];
  readonly asyncDeskNotes: readonly StudioAsyncDeskNote[];
  readonly screenShareSlots: readonly StudioSimultaneousScreenShareSlot[];
  readonly pinnedCanvasMedia: readonly StudioSpatialPinnedMediaAsset[];
  readonly hostModeration: StudioHostModerationState;
}

export const MAX_SIMULTANEOUS_SCREEN_SHARE_SLOTS = 4;

const DCC_APP_LABELS: Readonly<Record<StudioCreatorDccAppId, string>> = {
  "clip-studio-paint": "Clip Studio Paint EX",
  "blender-3d": "Blender 4.2 LTS",
  photoshop: "Adobe Photoshop",
  "sketchup-pro": "SketchUp Pro",
  "toonstudio-storyboarder": "ToonStudio 콘티 보드",
};

export function createDefaultVirtualOfficeEnterpriseState(): StudioVirtualOfficeEnterpriseState {
  return {
    aiAgentDesks: [
      {
        id: "agent-sophia-scribe",
        nameKo: "소피아 회의록·메모리 봇",
        nameEn: "Sophia Meeting Memory Bot",
        specialty: "meeting-scribe",
        deskCode: "3F-AI-01",
        floorId: "floor-3f",
        status: "working",
        activeEpisodeCode: "EP.14",
        currentTaskKo: "2F 채색 리뷰룸 허들 음성 전사 및 액션아이템 추출 중",
        lastOutputKo: "14화 옥상 역광 컷 색온도 4200K 통일 결정사항 기록 완료",
        completedCount: 19,
        updatedAtMs: 1_729_901_200_000,
      },
      {
        id: "agent-typeset-qa",
        nameKo: "식자·말풍선 검수 에이전트",
        nameEn: "Typesetting & Bubble QA Agent",
        specialty: "typesetting-qa",
        deskCode: "3F-AI-02",
        floorId: "floor-3f",
        status: "completed",
        activeEpisodeCode: "EP.14",
        currentTaskKo: "14화 전 컷(1~68컷) 대사 오탈자 및 말풍선 여백 자동 스캔",
        lastOutputKo: "컷 41 말풍선 테두리 겹침 1건 감지 · 오탈자 0건",
        completedCount: 34,
        updatedAtMs: 1_729_901_000_000,
      },
      {
        id: "agent-layer-auditor",
        nameKo: "선화·레이어 무결성 감사 봇",
        nameEn: "Lineart & PSD Layer Auditor",
        specialty: "layer-auditor",
        deskCode: "2F-AI-03",
        floorId: "floor-2f",
        status: "standby",
        activeEpisodeCode: "EP.14",
        currentTaskKo: "신규 PSD/CLIP 원고 업로드 대기 중",
        lastOutputKo: "14화 1~30컷 선화·밑색 레이어 분리 규격 100% 통과",
        completedCount: 27,
        updatedAtMs: 1_729_900_800_000,
      },
      {
        id: "agent-bg3d-assistant",
        nameKo: "3D 배경·렌더 보조 에이전트",
        nameEn: "3D Asset & LUT Assistant",
        specialty: "bg3d-assistant",
        deskCode: "2F-AI-04",
        floorId: "floor-2f",
        status: "working",
        activeEpisodeCode: "EP.15",
        currentTaskKo: "15화 지하철역 추격전 3D 카메라 화각(24mm) 프리셋 추출",
        lastOutputKo: "옥상 야경 3D 씬 안개 뎁스 맵 4종 생성 완료",
        completedCount: 14,
        updatedAtMs: 1_729_901_150_000,
      },
    ],
    meetingMemories: [
      {
        id: "memory-ep14-lighting",
        titleKo: "14화 옥상 클라이맥스 조명·채색 합동 검수 허들",
        episodeCode: "EP.14",
        roomNameKo: "2F 채색·조명 방음 리뷰룸",
        recordedAtMs: 1_729_900_700_000,
        summaryKo: "14화 하이라이트(컷 28~42)의 달빛 역광 림라이트 강도를 높이고, 그림자 영역 채도를 12% 낮추기로 합의함.",
        decisions: [
          "컷 28~42 메인 색온도 4200K 및 보라색 림라이트(#7C5CFF) 확정",
          "컷 34 주인공 클로즈업 눈동자 하이라이트 레이어 분리 유지",
        ],
        actionItems: [
          { id: "act-1", assigneeName: "수석 배경 아티스트", taskKo: "옥상 난간 3D 그림자 패스 재추출 후 2F 테이블에 고정", done: true },
          { id: "act-2", assigneeName: "준 작가", taskKo: "컷 34~36 캐릭터 림라이트 마스크 보정", done: false },
        ],
        highlights: [
          { speakerName: "민 프로듀서", timestampLabel: "02:14", quoteKo: "34컷에서 달빛이 등 뒤에서 강하게 떨어져야 대사의 긴장감이 살아납니다." },
          { speakerName: "수석 배경 아티스트", timestampLabel: "04:08", quoteKo: "블렌더 라이트 각도 15도 낮춰서 바로 4K 뎁스 맵 공유하겠습니다." },
        ],
        tags: ["EP.14", "조명검수", "림라이트", "배경3D"],
      },
      {
        id: "memory-ep15-conte",
        titleKo: "15화 시즌 피날레 콘티 연출 킥오프",
        episodeCode: "EP.15",
        roomNameKo: "3F 스포일러 보안 콘티 회의실",
        recordedAtMs: 1_729_895_000_000,
        summaryKo: "15화 총 72컷 중 전반부 지하철 추격전 호흡을 4컷 단축하고 후반부 감정선에 집중.",
        decisions: ["전반부 액션 컷 수 28컷 → 24컷 압축", "수요일 오후 3시 1차 러프 콘티 마감"],
        actionItems: [{ id: "act-3", assigneeName: "소라 편집자", taskKo: "15화 대사 스크립트 호흡 교정본 공유", done: true }],
        highlights: [{ speakerName: "소라 편집자", timestampLabel: "06:40", quoteKo: "모바일 스크롤 속도 기준으로 12~15컷 사이 세로 여백을 1.4배 확보합시다." }],
        tags: ["EP.15", "콘티", "연출"],
      },
    ],
    creatorTrueStatuses: [
      {
        participantId: "creator-self",
        participantName: "수석 배경 아티스트",
        roleKo: "3D 배경·라이팅 리드",
        deskLabelKo: "2F 배경 포드 #01",
        availability: "available",
        activeDccApp: "blender-3d",
        activeDocumentTitle: "EP14_Rooftop_Night_v4.blend",
        privacyMasked: false,
        updatedAtMs: 1_729_901_200_000,
      },
      {
        participantId: "creator-art-jun",
        participantName: "준 작가",
        roleKo: "메인 선화·작화",
        deskLabelKo: "2F 선화 포드 #02",
        availability: "focusing",
        activeDccApp: "clip-studio-paint",
        activeDocumentTitle: "EP14_Cut34_38_Lineart.clip",
        privacyMasked: false,
        updatedAtMs: 1_729_901_100_000,
      },
      {
        participantId: "creator-edit-sora",
        participantName: "소라 편집자",
        roleKo: "콘티·식자 디렉터",
        deskLabelKo: "3F 보안 콘티실 #01",
        availability: "in-huddle",
        activeDccApp: "toonstudio-storyboarder",
        activeDocumentTitle: "EP15_Finale_Spoiler_Draft.tsboard",
        privacyMasked: true,
        updatedAtMs: 1_729_901_050_000,
      },
    ],
    asyncDeskNotes: [
      {
        id: "desk-note-01",
        fromName: "민 프로듀서",
        targetDeskOwnerId: "creator-art-jun",
        targetDeskOwnerName: "준 작가",
        mediaKind: "video-clip",
        durationSec: 48,
        summaryKo: "집중 작업 끝나면 확인 부탁해요! 14화 36컷 손 클로즈업 각도 레퍼런스 영상 남깁니다.",
        episodeCutRef: "EP.14 · Cut 36",
        acknowledged: false,
        createdAtMs: 1_729_900_950_000,
        acknowledgedAtMs: null,
      },
    ],
    screenShareSlots: [
      {
        slotId: "share-slot-1",
        presenterId: "creator-self",
        presenterName: "수석 배경 아티스트",
        streamTitleKo: "Blender 14화 옥상 라이팅 뷰포트",
        dccApp: "blender-3d",
        resolutionLabel: "1440p-color-calibrated",
        laserPointer: { active: true, xNorm: 0.62, yNorm: 0.38, pointerOwnerName: "준 작가" },
      },
      {
        slotId: "share-slot-2",
        presenterId: "creator-art-jun",
        presenterName: "준 작가",
        streamTitleKo: "Clip Studio 14화 34컷 선화 레이어",
        dccApp: "clip-studio-paint",
        resolutionLabel: "4K-lineart-inspect",
        laserPointer: { active: false, xNorm: 0.5, yNorm: 0.5, pointerOwnerName: "준 작가" },
      },
    ],
    pinnedCanvasMedia: [
      {
        id: "pin-media-1",
        titleKo: "주인공 야간 복장 컬러 파레트 표준시트",
        mediaType: "color-palette",
        x: 120,
        y: 80,
        scale: 1,
        lockedOnCanvas: true,
        pinnedByName: "수석 배경 아티스트",
      },
      {
        id: "pin-media-2",
        titleKo: "14화 옥상 조감도 3D 카메라 동선도",
        mediaType: "3d-snapshot",
        x: 320,
        y: 110,
        scale: 1.15,
        lockedOnCanvas: false,
        pinnedByName: "민 프로듀서",
      },
    ],
    hostModeration: {
      allMuted: false,
      movementFrozen: false,
      summonedRoomId: null,
      lastCommandLabelKo: "정상 자율 협업 모드",
      lastExecutedAtMs: 1_729_900_000_000,
      rouletteHistory: ["준 작가"],
      attendanceCheckedIds: ["creator-self", "creator-pd-min", "creator-art-jun", "creator-edit-sora"],
    },
  };
}

export function dispatchTaskToAiAgentDesk(
  state: StudioVirtualOfficeEnterpriseState,
  agentId: string,
  taskTitleKo: string,
  episodeCode: string,
  nowMs: number,
): StudioVirtualOfficeEnterpriseState {
  const trimmed = taskTitleKo.trim();
  if (!trimmed) return state;
  return {
    ...state,
    aiAgentDesks: state.aiAgentDesks.map((agent) =>
      agent.id === agentId
        ? { ...agent, status: "working", activeEpisodeCode: episodeCode.trim() || agent.activeEpisodeCode, currentTaskKo: trimmed, updatedAtMs: nowMs }
        : agent,
    ),
  };
}

export function completeAiAgentDeskTask(
  state: StudioVirtualOfficeEnterpriseState,
  agentId: string,
  outputSummaryKo: string,
  nowMs: number,
): StudioVirtualOfficeEnterpriseState {
  const summary = outputSummaryKo.trim();
  if (!summary) return state;
  return {
    ...state,
    aiAgentDesks: state.aiAgentDesks.map((agent) =>
      agent.id === agentId
        ? { ...agent, status: "completed", lastOutputKo: summary, completedCount: agent.completedCount + 1, updatedAtMs: nowMs }
        : agent,
    ),
  };
}

export function recordVirtualOfficeMeetingMemory(
  state: StudioVirtualOfficeEnterpriseState,
  memory: StudioVirtualOfficeMeetingMemory,
): StudioVirtualOfficeEnterpriseState {
  if (!memory.titleKo.trim() || !memory.summaryKo.trim()) return state;
  return { ...state, meetingMemories: [memory, ...state.meetingMemories] };
}

export function toggleMeetingActionItemDone(
  state: StudioVirtualOfficeEnterpriseState,
  memoryId: string,
  actionItemId: string,
): StudioVirtualOfficeEnterpriseState {
  return {
    ...state,
    meetingMemories: state.meetingMemories.map((memory) =>
      memory.id === memoryId
        ? { ...memory, actionItems: memory.actionItems.map((item) => (item.id === actionItemId ? { ...item, done: !item.done } : item)) }
        : memory,
    ),
  };
}

export function searchVirtualOfficeMeetingMemories(
  state: StudioVirtualOfficeEnterpriseState,
  query: string,
): readonly StudioVirtualOfficeMeetingMemory[] {
  const q = query.trim().toLowerCase();
  if (!q) return state.meetingMemories;
  return state.meetingMemories.filter((memory) => {
    const haystack = [
      memory.titleKo,
      memory.episodeCode,
      memory.roomNameKo,
      memory.summaryKo,
      ...memory.decisions,
      ...memory.tags,
      ...memory.actionItems.map((a) => `${a.assigneeName} ${a.taskKo}`),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function executeVirtualOfficeMcpQuery(
  state: StudioVirtualOfficeEnterpriseState,
  intent: StudioMcpQueryIntent,
): StudioVirtualOfficeMcpQueryResponse {
  if (intent === "who-is-around") {
    const bullets = state.creatorTrueStatuses.map((entry) => {
      const docLabel = entry.privacyMasked ? "[보안 마스킹 원고]" : entry.activeDocumentTitle;
      return `${entry.participantName}(${entry.deskLabelKo}) — ${DCC_APP_LABELS[entry.activeDccApp]} · ${docLabel}`;
    });
    return {
      intent,
      protocolVersion: "toonstudio-office-mcp/1.0",
      headlineKo: `현재 접속 크리에이터 ${state.creatorTrueStatuses.length}명 실시간 작업 컨텍스트`,
      bulletsKo: bullets,
      structuredPayload: { onlineCount: state.creatorTrueStatuses.length, creators: state.creatorTrueStatuses },
    };
  }
  if (intent === "last-meeting-decisions") {
    const latest = state.meetingMemories[0];
    const openActions = state.meetingMemories.flatMap((m) =>
      m.actionItems.filter((a) => !a.done).map((a) => `[${m.episodeCode}] ${a.assigneeName}: ${a.taskKo}`),
    );
    return {
      intent,
      protocolVersion: "toonstudio-office-mcp/1.0",
      headlineKo: latest
        ? `최근 회의(${latest.titleKo}) 핵심 결정사항 및 미완료 액션 ${openActions.length}건`
        : "기록된 회의 메모리가 없습니다.",
      bulletsKo: [...(latest?.decisions ?? []), ...openActions],
      structuredPayload: { latestMeetingId: latest?.id ?? null, openActionCount: openActions.length },
    };
  }
  if (intent === "active-bottlenecks") {
    const pendingNotes = state.asyncDeskNotes.filter((n) => !n.acknowledged);
    const openActions = state.meetingMemories.flatMap((m) => m.actionItems.filter((a) => !a.done));
    return {
      intent,
      protocolVersion: "toonstudio-office-mcp/1.0",
      headlineKo: `미확인 비동기 데스크 노트 ${pendingNotes.length}건 · 미완료 회의 액션 ${openActions.length}건`,
      bulletsKo: [
        ...pendingNotes.map((n) => `[데스크 노트 대기] ${n.targetDeskOwnerName} (${n.episodeCutRef}): ${n.summaryKo}`),
        ...openActions.map((a) => `[액션 미완료] ${a.assigneeName}: ${a.taskKo}`),
      ],
      structuredPayload: { pendingDeskNotes: pendingNotes.length, openActionItems: openActions.length },
    };
  }
  const workingCount = state.aiAgentDesks.filter((a) => a.status === "working").length;
  return {
    intent: "agent-desk-status",
    protocolVersion: "toonstudio-office-mcp/1.0",
    headlineKo: `AI 에이전트 데스크 ${state.aiAgentDesks.length}기 중 ${workingCount}기 실시간 작업 수행 중`,
    bulletsKo: state.aiAgentDesks.map((a) => `[${a.deskCode}] ${a.nameKo} (${a.status}) — 최근 산출: ${a.lastOutputKo}`),
    structuredPayload: { totalAgents: state.aiAgentDesks.length, workingCount },
  };
}

export function updateCreatorDccTrueStatus(
  state: StudioVirtualOfficeEnterpriseState,
  participantId: string,
  activeDccApp: StudioCreatorDccAppId,
  activeDocumentTitle: string,
  privacyMasked: boolean,
  nowMs: number,
): StudioVirtualOfficeEnterpriseState {
  return {
    ...state,
    creatorTrueStatuses: state.creatorTrueStatuses.map((entry) =>
      entry.participantId === participantId
        ? { ...entry, activeDccApp, activeDocumentTitle: activeDocumentTitle.trim() || entry.activeDocumentTitle, privacyMasked, updatedAtMs: nowMs }
        : entry,
    ),
  };
}

export function formatCreatorDccTrueStatusBadge(entry: StudioCreatorTrueStatusEntry): string {
  const appLabel = DCC_APP_LABELS[entry.activeDccApp];
  const docLabel = entry.privacyMasked ? "보안 마스킹 작업 파일" : entry.activeDocumentTitle;
  return `${appLabel} · ${docLabel}`;
}

export function leaveAsyncDeskNote(
  state: StudioVirtualOfficeEnterpriseState,
  input: {
    readonly id: string;
    readonly fromName: string;
    readonly targetDeskOwnerId: string;
    readonly targetDeskOwnerName: string;
    readonly mediaKind: "video-clip" | "voice-memo";
    readonly durationSec: number;
    readonly summaryKo: string;
    readonly episodeCutRef: string;
    readonly nowMs: number;
  },
): StudioVirtualOfficeEnterpriseState {
  const summary = input.summaryKo.trim();
  if (!summary) return state;
  const note: StudioAsyncDeskNote = {
    id: input.id,
    fromName: input.fromName.trim() || "동료 작가",
    targetDeskOwnerId: input.targetDeskOwnerId,
    targetDeskOwnerName: input.targetDeskOwnerName,
    mediaKind: input.mediaKind,
    durationSec: Math.max(5, Math.min(300, Math.round(input.durationSec))),
    summaryKo: summary,
    episodeCutRef: input.episodeCutRef.trim() || "EP.14",
    acknowledged: false,
    createdAtMs: input.nowMs,
    acknowledgedAtMs: null,
  };
  return { ...state, asyncDeskNotes: [note, ...state.asyncDeskNotes] };
}

export function acknowledgeAsyncDeskNote(
  state: StudioVirtualOfficeEnterpriseState,
  noteId: string,
  nowMs: number,
): StudioVirtualOfficeEnterpriseState {
  return {
    ...state,
    asyncDeskNotes: state.asyncDeskNotes.map((note) =>
      note.id === noteId ? { ...note, acknowledged: true, acknowledgedAtMs: nowMs } : note,
    ),
  };
}

export function startSimultaneousScreenShareSlot(
  state: StudioVirtualOfficeEnterpriseState,
  slot: StudioSimultaneousScreenShareSlot,
): { readonly ok: boolean; readonly reason: "added" | "replaced" | "limit-reached"; readonly state: StudioVirtualOfficeEnterpriseState } {
  const existingIdx = state.screenShareSlots.findIndex((item) => item.slotId === slot.slotId);
  if (existingIdx >= 0) {
    const nextSlots = state.screenShareSlots.map((item, idx) => (idx === existingIdx ? slot : item));
    return { ok: true, reason: "replaced", state: { ...state, screenShareSlots: nextSlots } };
  }
  if (state.screenShareSlots.length >= MAX_SIMULTANEOUS_SCREEN_SHARE_SLOTS) {
    return { ok: false, reason: "limit-reached", state };
  }
  return { ok: true, reason: "added", state: { ...state, screenShareSlots: [...state.screenShareSlots, slot] } };
}

export function stopSimultaneousScreenShareSlot(
  state: StudioVirtualOfficeEnterpriseState,
  slotId: string,
): StudioVirtualOfficeEnterpriseState {
  return { ...state, screenShareSlots: state.screenShareSlots.filter((slot) => slot.slotId !== slotId) };
}

export function moveScreenShareLaserPointer(
  state: StudioVirtualOfficeEnterpriseState,
  slotId: string,
  xNorm: number,
  yNorm: number,
  pointerOwnerName: string,
): StudioVirtualOfficeEnterpriseState {
  const clampedX = Number(Math.max(0, Math.min(1, xNorm)).toFixed(2));
  const clampedY = Number(Math.max(0, Math.min(1, yNorm)).toFixed(2));
  return {
    ...state,
    screenShareSlots: state.screenShareSlots.map((slot) =>
      slot.slotId === slotId
        ? { ...slot, laserPointer: { active: true, xNorm: clampedX, yNorm: clampedY, pointerOwnerName: pointerOwnerName.trim() || slot.laserPointer.pointerOwnerName } }
        : slot,
    ),
  };
}

export function pinCanvasReferenceMedia(
  state: StudioVirtualOfficeEnterpriseState,
  asset: StudioSpatialPinnedMediaAsset,
): StudioVirtualOfficeEnterpriseState {
  if (!asset.titleKo.trim()) return state;
  const filtered = state.pinnedCanvasMedia.filter((item) => item.id !== asset.id);
  return { ...state, pinnedCanvasMedia: [asset, ...filtered] };
}

export function togglePinCanvasReferenceMediaLock(
  state: StudioVirtualOfficeEnterpriseState,
  assetId: string,
): StudioVirtualOfficeEnterpriseState {
  return {
    ...state,
    pinnedCanvasMedia: state.pinnedCanvasMedia.map((item) =>
      item.id === assetId ? { ...item, lockedOnCanvas: !item.lockedOnCanvas } : item,
    ),
  };
}

export type StudioHostModerationCommand =
  | "summon-all"
  | "mute-all"
  | "unmute-all"
  | "freeze-movement"
  | "unfreeze-movement";

export function executeHostModerationCommand(
  state: StudioVirtualOfficeEnterpriseState,
  command: StudioHostModerationCommand,
  targetRoomId: string | null,
  nowMs: number,
): StudioVirtualOfficeEnterpriseState {
  const prev = state.hostModeration;
  if (command === "summon-all") {
    const room = targetRoomId ?? "room-1f-townhall";
    return { ...state, hostModeration: { ...prev, summonedRoomId: room, lastCommandLabelKo: `전원 소환 완료 (${room})`, lastExecutedAtMs: nowMs } };
  }
  if (command === "mute-all" || command === "unmute-all") {
    const allMuted = command === "mute-all";
    return { ...state, hostModeration: { ...prev, allMuted, lastCommandLabelKo: allMuted ? "전체 참석자 마이크 일괄 음소거" : "전체 마이크 음소거 해제", lastExecutedAtMs: nowMs } };
  }
  const movementFrozen = command === "freeze-movement";
  return { ...state, hostModeration: { ...prev, movementFrozen, lastCommandLabelKo: movementFrozen ? "발표 집중용 아바타 이동 잠금" : "아바타 이동 잠금 해제", lastExecutedAtMs: nowMs } };
}

export function spinVirtualOfficeRoulette(
  state: StudioVirtualOfficeEnterpriseState,
  candidates: readonly string[],
  seedValue: number,
): { readonly winner: string; readonly state: StudioVirtualOfficeEnterpriseState } {
  const validCandidates = candidates.map((c) => c.trim()).filter(Boolean);
  if (validCandidates.length === 0) return { winner: "후보 없음", state };
  const index = Math.abs(Math.floor(seedValue)) % validCandidates.length;
  const winner = validCandidates[index] ?? validCandidates[0]!;
  return {
    winner,
    state: {
      ...state,
      hostModeration: { ...state.hostModeration, rouletteHistory: [winner, ...state.hostModeration.rouletteHistory.slice(0, 9)] },
    },
  };
}

export function computeWeeklyOfficePulseInsights(
  state: StudioVirtualOfficeEnterpriseState,
): StudioWeeklyOfficePulseInsights {
  const totalAgentTasks = state.aiAgentDesks.reduce((acc, item) => acc + item.completedCount, 0);
  const aiMinutesSaved = totalAgentTasks * 14;
  const meetingHours = Number((state.meetingMemories.length * 1.4).toFixed(1));
  const deepFocusHours = Number((26.5 + state.creatorTrueStatuses.length * 4.2).toFixed(1));
  const focusToMeetingRatio = Number((deepFocusHours / Math.max(0.5, meetingHours)).toFixed(2));
  const asyncNotesResolvedCount = state.asyncDeskNotes.filter((n) => n.acknowledged).length;
  const crossPartHuddleScore = Math.min(100, Math.round(72 + state.screenShareSlots.length * 6 + state.pinnedCanvasMedia.length * 4));
  const recommendationKo =
    focusToMeetingRatio >= 6
      ? "집중 작화 시간 비중이 매우 우수합니다. 비동기 데스크 노트 활용으로 불필요한 회의를 효과적으로 줄이고 있습니다."
      : "실시간 회의 비중이 높습니다. Roam Aikido 비동기 데스크 노트와 소피아 회의 요약 봇을 활용해 집중 작화 시간을 확보하세요.";
  return { deepFocusHours, meetingHours, focusToMeetingRatio, aiMinutesSaved, asyncNotesResolvedCount, crossPartHuddleScore, recommendationKo };
}
