/**
 * 다층 가상 오피스 빌딩(1F~3F 엘리베이터)·방음 회의실 잠금·노크(Knock-to-Enter)·어깨 톡(Shoulder Tap)·
 * 영구 테이블 앱(Persistent Room Table State)·지향성 음성 콘(Directional Voice Cone) 순수 도메인 모델.
 *
 * REA 역공학 근거:
 * - Kumospace (`ev_f7cfcc9da19c4bcd3cdf4581d8fc34691ead224e0471d3a55c5afdfb9294c0bc`): 다층 플로어 및 층별·룸별 채팅 분리
 * - Roam (`ev_2ebb7726bf3fe3edf3834c838739fc577fcf04d7488fb59e7e293dbe78485201`): Cloud HQ 다층 오피스 및 잠긴 방 Knock-to-Enter
 * - oVice (`ev_5817729b10d4fa7dd919e02753d2726b8769bd62e6c56a40a7d6b2ae80454767`): 방음 룸 잠금, Shoulder Tap, 아바타 방향 지향성 음성 콘
 * - Teamflow (`ev_7e75688d019b6f943fd93d2486bb8a3abedcd5d151bbd7f19d59b7f8036413fe`): 퇴실 후에도 유지되는 회의 테이블 영구 문서/앱 상태
 */

export type StudioVirtualOfficeFloorId = "floor-1f" | "floor-2f" | "floor-3f";

export type StudioPersistentTableAppKind =
  | "manuscript-viewer"
  | "storyboard-canvas"
  | "qc-checklist"
  | "color-lut-sheet"
  | "pomodoro-timer";

export interface StudioPersistentRoomTableApp {
  readonly id: string;
  readonly kind: StudioPersistentTableAppKind;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly episodeLabel: string;
  readonly pinnedByName: string;
  readonly updatedAtMs: number;
  readonly stateSummaryKo: string;
}

export interface StudioVirtualOfficeRoom {
  readonly id: string;
  readonly floorId: StudioVirtualOfficeFloorId;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly category: "lobby" | "atelier" | "soundproof-meeting" | "review-booth" | "ai-control";
  readonly capacity: number;
  readonly soundproof: boolean;
  readonly locked: boolean;
  readonly lockReasonKo: string | null;
  readonly occupantIds: readonly string[];
  readonly allowedParticipantIds: readonly string[];
  readonly tableApps: readonly StudioPersistentRoomTableApp[];
}

export interface StudioVirtualOfficeFloor {
  readonly id: StudioVirtualOfficeFloorId;
  readonly levelNumber: 1 | 2 | 3;
  readonly badgeText: string;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly focusSummaryKo: string;
  readonly defaultLobbyRoomId: string;
}

export type StudioKnockUrgency = "normal" | "urgent-deadline";
export type StudioKnockStatus = "pending" | "approved" | "wait-5m" | "declined";

export interface StudioRoomKnockRequest {
  readonly id: string;
  readonly roomId: string;
  readonly floorId: StudioVirtualOfficeFloorId;
  readonly requesterId: string;
  readonly requesterName: string;
  readonly messageKo: string;
  readonly urgency: StudioKnockUrgency;
  readonly status: StudioKnockStatus;
  readonly createdAtMs: number;
  readonly resolvedAtMs: number | null;
  readonly resolvedById: string | null;
}

export type StudioShoulderTapReasonCategory =
  | "conte-confirm"
  | "layer-missing"
  | "color-guide"
  | "urgent-publish";

export interface StudioShoulderTapEvent {
  readonly id: string;
  readonly fromId: string;
  readonly fromName: string;
  readonly toId: string;
  readonly toName: string;
  readonly reasonCategory: StudioShoulderTapReasonCategory;
  readonly messageKo: string;
  readonly deliveryMode: "instant-wave" | "queued-after-focus" | "blocked-by-dnd";
  readonly createdAtMs: number;
}

export type StudioFloorChatScope = "room" | "floor" | "building-announcement";

export interface StudioFloorScopedChatMessage {
  readonly id: string;
  readonly scope: StudioFloorChatScope;
  readonly floorId: StudioVirtualOfficeFloorId;
  readonly roomId: string | null;
  readonly authorId: string;
  readonly authorName: string;
  readonly text: string;
  readonly createdAtMs: number;
}

export interface StudioVirtualOfficeBuildingState {
  readonly activeFloorId: StudioVirtualOfficeFloorId;
  readonly participantFloorMap: Readonly<Record<string, StudioVirtualOfficeFloorId>>;
  readonly participantRoomMap: Readonly<Record<string, string>>;
  readonly floors: readonly StudioVirtualOfficeFloor[];
  readonly rooms: readonly StudioVirtualOfficeRoom[];
  readonly knockQueue: readonly StudioRoomKnockRequest[];
  readonly shoulderTaps: readonly StudioShoulderTapEvent[];
  readonly chatMessages: readonly StudioFloorScopedChatMessage[];
}

export interface StudioDirectionalVoiceConeInput {
  readonly speakerPoint: { readonly x: number; readonly y: number };
  readonly speakerHeadingDeg: number;
  readonly listenerPoint: { readonly x: number; readonly y: number };
  readonly maxRadius?: number;
  readonly coneHalfAngleDeg?: number;
  readonly rearGainFloor?: number;
  readonly megaphoneActive?: boolean;
  readonly differentSoundproofRoom?: boolean;
}

export interface StudioDirectionalVoiceConeResult {
  readonly gain: number;
  readonly pan: number;
  readonly distancePx: number;
  readonly angleDiffDeg: number;
  readonly inFrontCone: boolean;
  readonly distanceAttenuation: number;
  readonly angularAttenuation: number;
  readonly isolatedBySoundproof: boolean;
}

export const DEFAULT_STUDIO_VIRTUAL_OFFICE_FLOORS: readonly StudioVirtualOfficeFloor[] = Object.freeze([
  {
    id: "floor-1f",
    levelNumber: 1,
    badgeText: "1F",
    nameKo: "1F 로비·리셉션·타운홀",
    nameEn: "1F Lobby, Reception & Townhall",
    focusSummaryKo: "외부 담당자 영접, 전체 제작 발표(All-Hands), 오픈 라운지",
    defaultLobbyRoomId: "room-1f-townhall",
  },
  {
    id: "floor-2f",
    levelNumber: 2,
    badgeText: "2F",
    nameKo: "2F 작화·3D배경·채색 아틀리에",
    nameEn: "2F Lineart, 3D Background & Coloring Atelier",
    focusSummaryKo: "선화·배경 블렌더·채색·후보정 집중 제작 포드 및 파트별 허들",
    defaultLobbyRoomId: "room-2f-main-atelier",
  },
  {
    id: "floor-3f",
    levelNumber: 3,
    badgeText: "3F",
    nameKo: "3F 콘티·편집검수·AI관제실",
    nameEn: "3F Storyboard, Editorial QA & AI Control Floor",
    focusSummaryKo: "방음 콘티 회의실, 식자·식별 검수 부스, 24시간 AI 에이전트 관제 데스크",
    defaultLobbyRoomId: "room-3f-ai-control",
  },
]);

export const DEFAULT_STUDIO_VIRTUAL_OFFICE_ROOMS: readonly StudioVirtualOfficeRoom[] = Object.freeze([
  {
    id: "room-1f-townhall",
    floorId: "floor-1f",
    nameKo: "1F 메인 타운홀 스테이지",
    nameEn: "1F Main Townhall Stage",
    category: "lobby",
    capacity: 40,
    soundproof: false,
    locked: false,
    lockReasonKo: null,
    occupantIds: ["creator-pd-min"],
    allowedParticipantIds: ["creator-self", "creator-pd-min", "creator-art-jun", "creator-edit-sora"],
    tableApps: [
      {
        id: "table-app-1f-schedule",
        kind: "pomodoro-timer",
        titleKo: "주간 마감 카운트다운 보드",
        titleEn: "Weekly Deadline Countdown",
        episodeLabel: "EP.14",
        pinnedByName: "민 프로듀서",
        updatedAtMs: 1_729_900_000_000,
        stateSummaryKo: "수요일 18:00 최종 식자 검수 마감",
      },
    ],
  },
  {
    id: "room-2f-main-atelier",
    floorId: "floor-2f",
    nameKo: "2F 선화·배경 통합 아틀리에",
    nameEn: "2F Lineart & 3D Background Atelier",
    category: "atelier",
    capacity: 16,
    soundproof: false,
    locked: false,
    lockReasonKo: null,
    occupantIds: ["creator-self", "creator-art-jun"],
    allowedParticipantIds: ["creator-self", "creator-pd-min", "creator-art-jun", "creator-edit-sora"],
    tableApps: [
      {
        id: "table-app-2f-lut",
        kind: "color-lut-sheet",
        titleKo: "14화 옥상 야경 컬러 스크립트 & LUT",
        titleEn: "EP.14 Rooftop Night Color Script & LUT",
        episodeLabel: "EP.14",
        pinnedByName: "수석 배경 아티스트",
        updatedAtMs: 1_729_900_300_000,
        stateSummaryKo: "색온도 4200K · 림라이트 보라 #7C5CFF 고정",
      },
    ],
  },
  {
    id: "room-2f-color-booth",
    floorId: "floor-2f",
    nameKo: "2F 채색·조명 방음 리뷰룸",
    nameEn: "2F Coloring & Lighting Soundproof Booth",
    category: "review-booth",
    capacity: 6,
    soundproof: true,
    locked: false,
    lockReasonKo: null,
    occupantIds: [],
    allowedParticipantIds: ["creator-self", "creator-art-jun"],
    tableApps: [
      {
        id: "table-app-2f-manuscript",
        kind: "manuscript-viewer",
        titleKo: "14화 컷 28~42 조명 리테이크 시트",
        titleEn: "EP.14 Cut 28-42 Lighting Retake Sheet",
        episodeLabel: "EP.14",
        pinnedByName: "준 작가",
        updatedAtMs: 1_729_900_600_000,
        stateSummaryKo: "전원 퇴실 후에도 컷 34 역광 메모가 테이블에 보존됨",
      },
    ],
  },
  {
    id: "room-3f-conte-vault",
    floorId: "floor-3f",
    nameKo: "3F 스포일러 보안 콘티 회의실",
    nameEn: "3F Spoiler-Locked Storyboard Vault",
    category: "soundproof-meeting",
    capacity: 8,
    soundproof: true,
    locked: true,
    lockReasonKo: "시즌 피날레(15~16화) 연출 반전 콘티 집중 회의 중",
    occupantIds: ["creator-edit-sora"],
    allowedParticipantIds: ["creator-edit-sora", "creator-pd-min"],
    tableApps: [
      {
        id: "table-app-3f-storyboard",
        kind: "storyboard-canvas",
        titleKo: "15화 클라이맥스 연출 콘티 보드",
        titleEn: "EP.15 Climax Storyboard Canvas",
        episodeLabel: "EP.15",
        pinnedByName: "소라 편집자",
        updatedAtMs: 1_729_900_900_000,
        stateSummaryKo: "컷 12~19 카메라 워크 확정본 고정",
      },
      {
        id: "table-app-3f-qc",
        kind: "qc-checklist",
        titleKo: "식자·말풍선 잘림 최종 검수표",
        titleEn: "Typesetting & Speech Bubble QC Checklist",
        episodeLabel: "EP.14",
        pinnedByName: "소라 편집자",
        updatedAtMs: 1_729_901_000_000,
        stateSummaryKo: "모바일 세로 스크롤 가독성 18/20 통과",
      },
    ],
  },
  {
    id: "room-3f-ai-control",
    floorId: "floor-3f",
    nameKo: "3F AI 에이전트 관제 데스크",
    nameEn: "3F AI Agent Control Room",
    category: "ai-control",
    capacity: 12,
    soundproof: false,
    locked: false,
    lockReasonKo: null,
    occupantIds: [],
    allowedParticipantIds: ["creator-self", "creator-pd-min", "creator-art-jun", "creator-edit-sora"],
    tableApps: [],
  },
]);

export function createDefaultVirtualOfficeBuildingState(): StudioVirtualOfficeBuildingState {
  return {
    activeFloorId: "floor-2f",
    participantFloorMap: {
      "creator-self": "floor-2f",
      "creator-pd-min": "floor-1f",
      "creator-art-jun": "floor-2f",
      "creator-edit-sora": "floor-3f",
    },
    participantRoomMap: {
      "creator-self": "room-2f-main-atelier",
      "creator-pd-min": "room-1f-townhall",
      "creator-art-jun": "room-2f-main-atelier",
      "creator-edit-sora": "room-3f-conte-vault",
    },
    floors: DEFAULT_STUDIO_VIRTUAL_OFFICE_FLOORS,
    rooms: DEFAULT_STUDIO_VIRTUAL_OFFICE_ROOMS,
    knockQueue: [
      {
        id: "knock-init-01",
        roomId: "room-3f-conte-vault",
        floorId: "floor-3f",
        requesterId: "creator-art-jun",
        requesterName: "준 작가 (선화)",
        messageKo: "15화 14컷 캐릭터 감정선 스케치 확인차 3분만 입장 요청드립니다.",
        urgency: "normal",
        status: "pending",
        createdAtMs: 1_729_901_100_000,
        resolvedAtMs: null,
        resolvedById: null,
      },
    ],
    shoulderTaps: [],
    chatMessages: [
      {
        id: "chat-init-2f",
        scope: "floor",
        floorId: "floor-2f",
        roomId: "room-2f-main-atelier",
        authorId: "creator-art-jun",
        authorName: "준 작가",
        text: "2층 배경팀, 14화 31컷 원경 건물 3D 스냅샷 공유 완료했습니다!",
        createdAtMs: 1_729_900_500_000,
      },
    ],
  };
}

export interface StudioFloorMoveResult {
  readonly ok: boolean;
  readonly reason: "moved" | "room-locked" | "room-full" | "invalid-target";
  readonly state: StudioVirtualOfficeBuildingState;
}

/**
 * 엘리베이터를 통해 층(1F/2F/3F) 및 룸을 이동한다.
 * 목표 룸이 잠겨 있고 입장 허용 명단에 없으면 노크가 필요하므로 `room-locked`를 반환한다.
 */
export function moveParticipantToFloor(
  state: StudioVirtualOfficeBuildingState,
  participantId: string,
  targetFloorId: StudioVirtualOfficeFloorId,
  targetRoomId?: string,
): StudioFloorMoveResult {
  const floor = state.floors.find((item) => item.id === targetFloorId);
  if (!floor) {
    return { ok: false, reason: "invalid-target", state };
  }
  const resolvedRoomId = targetRoomId ?? floor.defaultLobbyRoomId;
  const targetRoom = state.rooms.find((room) => room.id === resolvedRoomId && room.floorId === targetFloorId);
  if (!targetRoom) {
    return { ok: false, reason: "invalid-target", state };
  }

  const isAlreadyInside = targetRoom.occupantIds.includes(participantId);
  if (
    targetRoom.locked &&
    !isAlreadyInside &&
    !targetRoom.allowedParticipantIds.includes(participantId)
  ) {
    return { ok: false, reason: "room-locked", state };
  }

  if (!isAlreadyInside && targetRoom.occupantIds.length >= targetRoom.capacity) {
    return { ok: false, reason: "room-full", state };
  }

  const updatedRooms = state.rooms.map((room) => {
    const withoutParticipant = room.occupantIds.filter((id) => id !== participantId);
    if (room.id === targetRoom.id) {
      return {
        ...room,
        occupantIds: [...withoutParticipant, participantId],
      };
    }
    if (withoutParticipant.length !== room.occupantIds.length) {
      return {
        ...room,
        occupantIds: withoutParticipant,
      };
    }
    return room;
  });

  return {
    ok: true,
    reason: "moved",
    state: {
      ...state,
      activeFloorId: participantId === "creator-self" ? targetFloorId : state.activeFloorId,
      participantFloorMap: {
        ...state.participantFloorMap,
        [participantId]: targetFloorId,
      },
      participantRoomMap: {
        ...state.participantRoomMap,
        [participantId]: targetRoom.id,
      },
      rooms: updatedRooms,
    },
  };
}

/**
 * 방음 회의실의 잠금 상태 및 잠금 사유를 전환한다.
 */
export function toggleVirtualOfficeRoomLock(
  state: StudioVirtualOfficeBuildingState,
  roomId: string,
  locked: boolean,
  lockReasonKo: string | null = null,
): StudioVirtualOfficeBuildingState {
  return {
    ...state,
    rooms: state.rooms.map((room) =>
      room.id === roomId
        ? {
            ...room,
            locked,
            lockReasonKo: locked ? (lockReasonKo?.trim() || "회의 집중 보호 잠금") : null,
          }
        : room,
    ),
  };
}

/**
 * 잠긴 방에 Knock-to-Enter(노크 입장 요청)를 등록한다.
 */
export function requestRoomKnock(
  state: StudioVirtualOfficeBuildingState,
  input: {
    readonly id: string;
    readonly roomId: string;
    readonly requesterId: string;
    readonly requesterName: string;
    readonly messageKo: string;
    readonly urgency: StudioKnockUrgency;
    readonly nowMs: number;
  },
): StudioVirtualOfficeBuildingState {
  const room = state.rooms.find((item) => item.id === input.roomId);
  const trimmedMsg = input.messageKo.trim();
  if (!room || !trimmedMsg) return state;

  const knock: StudioRoomKnockRequest = {
    id: input.id,
    roomId: room.id,
    floorId: room.floorId,
    requesterId: input.requesterId,
    requesterName: input.requesterName.trim() || input.requesterId,
    messageKo: trimmedMsg,
    urgency: input.urgency,
    status: "pending",
    createdAtMs: input.nowMs,
    resolvedAtMs: null,
    resolvedById: null,
  };

  return {
    ...state,
    knockQueue: [knock, ...state.knockQueue],
  };
}

/**
 * 방 내부 참석자가 노크 요청을 승인(`approved`), 5분 대기(`wait-5m`), 거절(`declined`)로 처리한다.
 * 승인 시 요청자를 `allowedParticipantIds`에 추가하고 즉시 해당 방으로 입장시킨다.
 */
export function resolveRoomKnock(
  state: StudioVirtualOfficeBuildingState,
  knockId: string,
  resolution: Exclude<StudioKnockStatus, "pending">,
  responderId: string,
  nowMs: number,
): StudioVirtualOfficeBuildingState {
  const targetKnock = state.knockQueue.find((item) => item.id === knockId);
  if (!targetKnock || targetKnock.status !== "pending") {
    return state;
  }

  const nextKnockQueue = state.knockQueue.map((item) =>
    item.id === knockId
      ? {
          ...item,
          status: resolution,
          resolvedAtMs: nowMs,
          resolvedById: responderId,
        }
      : item,
  );

  if (resolution !== "approved") {
    return {
      ...state,
      knockQueue: nextKnockQueue,
    };
  }

  const roomsWithPermission = state.rooms.map((room) => {
    if (room.id !== targetKnock.roomId) return room;
    const allowed = room.allowedParticipantIds.includes(targetKnock.requesterId)
      ? room.allowedParticipantIds
      : [...room.allowedParticipantIds, targetKnock.requesterId];
    return {
      ...room,
      allowedParticipantIds: allowed,
    };
  });

  const intermediateState: StudioVirtualOfficeBuildingState = {
    ...state,
    rooms: roomsWithPermission,
    knockQueue: nextKnockQueue,
  };

  const moved = moveParticipantToFloor(
    intermediateState,
    targetKnock.requesterId,
    targetKnock.floorId,
    targetKnock.roomId,
  );
  return moved.state;
}

/**
 * 동료에게 가벼운 어깨 톡(Shoulder Tap)을 보낸다.
 * 상대방 상태가 `dnd`(방해금지)이면 긴급 출고(`urgent-publish`) 외에는 차단(`blocked-by-dnd`)하고,
 * `focusing`(집중 작업)이면 집중 종료 후 알림 큐(`queued-after-focus`)로 전달한다.
 */
export function sendShoulderTap(
  state: StudioVirtualOfficeBuildingState,
  input: {
    readonly id: string;
    readonly fromId: string;
    readonly fromName: string;
    readonly toId: string;
    readonly toName: string;
    readonly targetStatus: "available" | "focusing" | "dnd";
    readonly reasonCategory: StudioShoulderTapReasonCategory;
    readonly messageKo: string;
    readonly nowMs: number;
  },
): StudioVirtualOfficeBuildingState {
  const text = input.messageKo.trim();
  if (!text) return state;

  let deliveryMode: StudioShoulderTapEvent["deliveryMode"] = "instant-wave";
  if (input.targetStatus === "dnd" && input.reasonCategory !== "urgent-publish") {
    deliveryMode = "blocked-by-dnd";
  } else if (input.targetStatus === "focusing" && input.reasonCategory !== "urgent-publish") {
    deliveryMode = "queued-after-focus";
  }

  const tap: StudioShoulderTapEvent = {
    id: input.id,
    fromId: input.fromId,
    fromName: input.fromName,
    toId: input.toId,
    toName: input.toName,
    reasonCategory: input.reasonCategory,
    messageKo: text,
    deliveryMode,
    createdAtMs: input.nowMs,
  };

  return {
    ...state,
    shoulderTaps: [tap, ...state.shoulderTaps],
  };
}

/**
 * Teamflow 스타일 영구 테이블 앱 고정: 방에서 모든 인원이 퇴실해도 원고·화이트보드·검수표가 테이블에 유지된다.
 */
export function pinRoomTableApp(
  state: StudioVirtualOfficeBuildingState,
  roomId: string,
  app: StudioPersistentRoomTableApp,
): StudioVirtualOfficeBuildingState {
  return {
    ...state,
    rooms: state.rooms.map((room) => {
      if (room.id !== roomId) return room;
      const filtered = room.tableApps.filter((existing) => existing.id !== app.id);
      return {
        ...room,
        tableApps: [app, ...filtered],
      };
    }),
  };
}

export function unpinRoomTableApp(
  state: StudioVirtualOfficeBuildingState,
  roomId: string,
  appId: string,
): StudioVirtualOfficeBuildingState {
  return {
    ...state,
    rooms: state.rooms.map((room) =>
      room.id === roomId
        ? {
            ...room,
            tableApps: room.tableApps.filter((app) => app.id !== appId),
          }
        : room,
    ),
  };
}

export interface StudioRoomPersistentTableSnapshot {
  readonly roomId: string;
  readonly roomNameKo: string;
  readonly occupantCount: number;
  readonly isPersistedWhileEmpty: boolean;
  readonly tableApps: readonly StudioPersistentRoomTableApp[];
}

export function getRoomPersistentTableSnapshot(
  state: StudioVirtualOfficeBuildingState,
  roomId: string,
): StudioRoomPersistentTableSnapshot | null {
  const room = state.rooms.find((item) => item.id === roomId);
  if (!room) return null;
  return {
    roomId: room.id,
    roomNameKo: room.nameKo,
    occupantCount: room.occupantIds.length,
    isPersistedWhileEmpty: room.occupantIds.length === 0 && room.tableApps.length > 0,
    tableApps: room.tableApps,
  };
}

/**
 * Kumospace / Gather 2.0 다층 채팅 라우팅:
 * - `room`: 현재 방음 룸 참석자에게만 전달
 * - `floor`: 해당 층(1F/2F/3F) 전체에 전달
 * - `building-announcement`: 전 층 공지
 */
export function postFloorScopedChatMessage(
  state: StudioVirtualOfficeBuildingState,
  input: {
    readonly id: string;
    readonly scope: StudioFloorChatScope;
    readonly floorId: StudioVirtualOfficeFloorId;
    readonly roomId: string | null;
    readonly authorId: string;
    readonly authorName: string;
    readonly text: string;
    readonly nowMs: number;
  },
): StudioVirtualOfficeBuildingState {
  const trimmed = input.text.trim();
  if (!trimmed) return state;

  const message: StudioFloorScopedChatMessage = {
    id: input.id,
    scope: input.scope,
    floorId: input.floorId,
    roomId: input.scope === "room" ? input.roomId : null,
    authorId: input.authorId,
    authorName: input.authorName,
    text: trimmed,
    createdAtMs: input.nowMs,
  };

  return {
    ...state,
    chatMessages: [message, ...state.chatMessages],
  };
}

export function filterVisibleFloorChatMessages(
  state: StudioVirtualOfficeBuildingState,
  viewerFloorId: StudioVirtualOfficeFloorId,
  viewerRoomId: string | null,
): readonly StudioFloorScopedChatMessage[] {
  return state.chatMessages.filter((msg) => {
    if (msg.scope === "building-announcement") return true;
    if (msg.scope === "floor") return msg.floorId === viewerFloorId;
    return msg.floorId === viewerFloorId && msg.roomId !== null && msg.roomId === viewerRoomId;
  });
}

function normalizeAngleDiffDeg(aDeg: number, bDeg: number): number {
  const raw = Math.abs(((aDeg - bDeg) % 360) + 540) % 360 - 180;
  return Math.abs(raw);
}

/**
 * oVice / Topia 스타일 지향성 음성 콘(Directional Voice Cone) 물리 감쇠 계산.
 * 화자의 시선 방향(heading)과 청자의 방위각 차이를 계산하여 정면 콘 내부에서는 선명하게 전달하고,
 * 등 뒤쪽(후방)으로 갈수록 `rearGainFloor`까지 부드럽게 감쇠한다.
 */
export function computeDirectionalVoiceConeGain(
  input: StudioDirectionalVoiceConeInput,
): StudioDirectionalVoiceConeResult {
  const maxRadius = Math.max(40, input.maxRadius ?? 320);
  const coneHalfAngleDeg = Math.min(170, Math.max(15, input.coneHalfAngleDeg ?? 60));
  const rearGainFloor = Math.min(1, Math.max(0.05, input.rearGainFloor ?? 0.28));

  const dx = input.listenerPoint.x - input.speakerPoint.x;
  const dy = input.listenerPoint.y - input.speakerPoint.y;
  const distancePx = Math.hypot(dx, dy);
  const pan = Number(Math.max(-1, Math.min(1, dx / (maxRadius * 0.75))).toFixed(2));

  if (input.differentSoundproofRoom && !input.megaphoneActive) {
    return {
      gain: 0,
      pan: 0,
      distancePx: Math.round(distancePx),
      angleDiffDeg: 0,
      inFrontCone: false,
      distanceAttenuation: 0,
      angularAttenuation: 0,
      isolatedBySoundproof: true,
    };
  }

  if (input.megaphoneActive) {
    return {
      gain: 1,
      pan,
      distancePx: Math.round(distancePx),
      angleDiffDeg: 0,
      inFrontCone: true,
      distanceAttenuation: 1,
      angularAttenuation: 1,
      isolatedBySoundproof: false,
    };
  }

  if (distancePx >= maxRadius) {
    return {
      gain: 0,
      pan,
      distancePx: Math.round(distancePx),
      angleDiffDeg: 180,
      inFrontCone: false,
      distanceAttenuation: 0,
      angularAttenuation: rearGainFloor,
      isolatedBySoundproof: false,
    };
  }

  const bearingDeg = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
  const angleDiffDeg = distancePx < 1e-3 ? 0 : normalizeAngleDiffDeg(input.speakerHeadingDeg, bearingDeg);
  const inFrontCone = angleDiffDeg <= coneHalfAngleDeg;

  const distanceAttenuation = Number((1 - distancePx / maxRadius).toFixed(3));
  let angularAttenuation = 1;
  if (!inFrontCone) {
    const excessRatio = Math.min(1, (angleDiffDeg - coneHalfAngleDeg) / Math.max(1, 180 - coneHalfAngleDeg));
    angularAttenuation = Number((1 - excessRatio * (1 - rearGainFloor)).toFixed(3));
  }

  const gain = Number((distanceAttenuation * angularAttenuation).toFixed(3));

  return {
    gain,
    pan,
    distancePx: Math.round(distancePx),
    angleDiffDeg: Math.round(angleDiffDeg),
    inFrontCone,
    distanceAttenuation,
    angularAttenuation,
    isolatedBySoundproof: false,
  };
}
