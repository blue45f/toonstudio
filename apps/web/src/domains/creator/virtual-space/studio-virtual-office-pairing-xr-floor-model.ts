/**
 * Clean-Room Virtual Office Wave-2 Domain Model:
 * Remote Pairing, Ephemeral Screen Ink, Status Hats, Floorplan Media Matrix,
 * AI Floor Coaching/Shadowing, and 3D XR Asset Pedestals.
 *
 * Synthesized from REA static/runtime analysis of 8 additional global platforms:
 * 1. Teemyco (teemyco.com) — Avatar Status Hats, Kudos Shoutout Wall
 * 2. Sococo (sococo.com) — Floorplan Room Media Matrix, "Get Teammate" Summon, Guest Reception Lobby
 * 3. Tuple (tuple.app) & 4. Pop (pop.com) — 5K Low-CPU Pair Drawing, Fading Laser Ink vs Persistent Redline, App Control Handoff
 * 5. Nooks (nooks.ai) — AI Virtual Floor Call-Along Shadowing, Director Whisper Coaching & Battlecard Prompts
 * 6. Virbela (virbela.com), 7. Frame VR (framevr.io), 8. Arthur Digital (arthur.digital) — 3D GLB/VRM Asset Pedestal & Auditorium Camera Presets
 */

export type StudioWave2BenchmarkPlatformId =
  | "teemyco" | "sococo" | "nooks" | "tuple" | "virbela" | "framevr" | "arthur" | "pop";

export type StudioAvatarStatusHatId =
  | "none"
  | "deep-focus-helmet"
  | "coffee-break-cap"
  | "pair-drawing-beret"
  | "review-open-crown"
  | "deadline-sprint-headband";

export interface StudioAvatarStatusHatCatalogEntry {
  readonly hatId: StudioAvatarStatusHatId;
  readonly label: string;
  readonly badgeText: string;
  readonly blocksDirectInterruptions: boolean;
  readonly defaultStatusMessage: string;
  readonly sourcePlatform: "teemyco";
}

export interface StudioMemberHatAssignment {
  readonly memberId: string;
  readonly displayName: string;
  readonly roleLabel: string;
  readonly equippedHatId: StudioAvatarStatusHatId;
  readonly customStatusNote: string;
  readonly updatedAtIso: string;
}

export type StudioKudosCategory =
  | "deadline-hero" | "line-art-mastery" | "bg-3d-wizard" | "color-harmony";

export interface StudioKudosShoutoutCard {
  readonly kudosId: string;
  readonly fromMemberId: string;
  readonly fromDisplayName: string;
  readonly toMemberId: string;
  readonly toDisplayName: string;
  readonly episodeCode: string;
  readonly category: StudioKudosCategory;
  readonly message: string;
  readonly reactionsCount: number;
  readonly createdAtIso: string;
}

export type StudioFloorplanStreamSlot = "screen-1-canvas" | "screen-2-reference";

export interface StudioFloorplanRoomMediaRow {
  readonly roomId: string;
  readonly roomName: string;
  readonly zoneCategory: "production-pod" | "review-stage" | "exec-suite" | "reception-lobby";
  readonly doorLocked: boolean;
  readonly capacity: number;
  readonly occupantMemberIds: readonly string[];
  readonly activeMicCount: number;
  readonly activeCameraCount: number;
  readonly activeScreenStreams: readonly StudioFloorplanStreamSlot[];
  readonly getTeammateSummonAllowed: boolean;
}

export interface StudioTeammateSummonRequest {
  readonly summonId: string;
  readonly fromMemberId: string;
  readonly toMemberId: string;
  readonly toDisplayName: string;
  readonly targetRoomId: string;
  readonly targetRoomName: string;
  readonly reasonNote: string;
  readonly status: "pending" | "accepted" | "declined";
  readonly createdAtIso: string;
}

export interface StudioReceptionGuestEntry {
  readonly guestId: string;
  readonly guestName: string;
  readonly organization: string;
  readonly visitingHostMemberId: string;
  readonly targetRoomId: string;
  readonly verificationCode: string;
  readonly status: "waiting-in-lobby" | "admitted" | "denied";
  readonly arrivedAtIso: string;
}

export type StudioScreenInkMode =
  | "fading-laser-ink" | "persistent-redline-ink" | "region-spotlight-box";

export interface StudioScreenInkStroke {
  readonly strokeId: string;
  readonly authorMemberId: string;
  readonly authorDisplayName: string;
  readonly mode: StudioScreenInkMode;
  readonly colorHex: string;
  readonly targetCutCode: string;
  readonly noteLabel: string;
  readonly pointsCount: number;
  readonly createdAtMs: number;
  readonly expiresAtMs: number | null;
}

export type StudioRemoteAppName =
  | "Clip Studio Paint EX" | "Blender 4.3" | "Photoshop 2026" | "Unreal Stage";

export interface StudioRemoteAppControlSession {
  readonly sessionId: string;
  readonly hostMemberId: string;
  readonly hostDisplayName: string;
  readonly targetAppName: StudioRemoteAppName;
  readonly activeControllerMemberId: string;
  readonly controlDriverState: "host-only" | "shared-driver-active" | "handoff-pending";
  readonly latencyMs: number;
  readonly resolutionLabel: "5K-60fps-444" | "4K-60fps-low-cpu";
}

export type StudioFloorCoachingMode =
  | "listen-only-shadow" | "whisper-director-coaching" | "barge-in-co-lead";

export interface StudioFloorCoachingSession {
  readonly coachingId: string;
  readonly roomId: string;
  readonly roomName: string;
  readonly leadMemberId: string;
  readonly leadDisplayName: string;
  readonly shadowingMemberIds: readonly string[];
  readonly mode: StudioFloorCoachingMode;
  readonly lastWhisperDirective: string | null;
  readonly liveAiBattlecardTip: string;
  readonly transcriptSentimentScore: number;
}

export type StudioAuditoriumCameraPreset =
  | "stage-wide" | "presenter-closeup" | "pedestal-macro-orbit" | "audience-qna-split";

export interface Studio3dAssetPedestalState {
  readonly pedestalId: string;
  readonly title: string;
  readonly assetFormat: "glb" | "vrm" | "usd-stage";
  readonly episodePropCode: string;
  readonly turntableAngleDeg: number;
  readonly autoRotateEnabled: boolean;
  readonly activeScaleMultiplier: number;
  readonly selectedAuditoriumCameraPreset: StudioAuditoriumCameraPreset;
  readonly spatialPinNotes: readonly string[];
}

export interface StudioPairingXrFloorState {
  readonly hatCatalog: readonly StudioAvatarStatusHatCatalogEntry[];
  readonly memberHats: readonly StudioMemberHatAssignment[];
  readonly kudosWall: readonly StudioKudosShoutoutCard[];
  readonly floorplanMediaMatrix: readonly StudioFloorplanRoomMediaRow[];
  readonly summonRequests: readonly StudioTeammateSummonRequest[];
  readonly receptionGuests: readonly StudioReceptionGuestEntry[];
  readonly screenInkStrokes: readonly StudioScreenInkStroke[];
  readonly remoteControlSessions: readonly StudioRemoteAppControlSession[];
  readonly floorCoachingSessions: readonly StudioFloorCoachingSession[];
  readonly assetPedestals: readonly Studio3dAssetPedestalState[];
}

export interface StudioPairingXrFloorSummary {
  readonly activeHatsCount: number;
  readonly interruptProtectedMemberCount: number;
  readonly totalKudosCount: number;
  readonly totalKudosReactions: number;
  readonly activeFloorplanStreamsCount: number;
  readonly lockedRoomCount: number;
  readonly pendingSummonCount: number;
  readonly waitingReceptionGuestCount: number;
  readonly activeFadingInkCount: number;
  readonly activePersistentRedlineCount: number;
  readonly sharedControlActiveSessionCount: number;
  readonly activeShadowingTraineeCount: number;
  readonly totalPedestalSpatialPins: number;
}

export const DEFAULT_FADING_INK_TTL_MS = 3500;

export const STUDIO_AVATAR_STATUS_HAT_CATALOG: readonly StudioAvatarStatusHatCatalogEntry[] = [
  { hatId: "none", label: "기본 상태 (모자 없음)", badgeText: "OPEN", blocksDirectInterruptions: false, defaultStatusMessage: "자유롭게 대화 및 질문 가능", sourcePlatform: "teemyco" },
  { hatId: "deep-focus-helmet", label: "초집중 원고 헬멧", badgeText: "FOCUS", blocksDirectInterruptions: true, defaultStatusMessage: "마감 펜선 작업 중 — 긴급 외 호출 자동 보류", sourcePlatform: "teemyco" },
  { hatId: "coffee-break-cap", label: "커피·휴식 캡", badgeText: "BREAK", blocksDirectInterruptions: false, defaultStatusMessage: "잠시 자리 비움 / 라운지 티타임 환영", sourcePlatform: "teemyco" },
  { hatId: "pair-drawing-beret", label: "페어 드로잉 베레모", badgeText: "PAIR", blocksDirectInterruptions: false, defaultStatusMessage: "5K 화면공유 공동 작화·리터칭 진행 중", sourcePlatform: "teemyco" },
  { hatId: "review-open-crown", label: "피드백 오픈 크라운", badgeText: "REVIEW", blocksDirectInterruptions: false, defaultStatusMessage: "콘티·채색 검수 즉시 가능 — 언제든 노크하세요", sourcePlatform: "teemyco" },
  { hatId: "deadline-sprint-headband", label: "마감 스퍼트 머리띠", badgeText: "SPRINT", blocksDirectInterruptions: true, defaultStatusMessage: "업로드 직전 최종 식자·후보정 검수 중", sourcePlatform: "teemyco" },
];

export function createInitialStudioPairingXrFloorState(): StudioPairingXrFloorState {
  return {
    hatCatalog: STUDIO_AVATAR_STATUS_HAT_CATALOG,
    memberHats: [
      { memberId: "mem-lead-line", displayName: "김선화 메인작가", roleLabel: "선화·연출 총괄", equippedHatId: "pair-drawing-beret", customStatusNote: "EP.42 하이라이트 컷 24~29 공동 펜터치 중", updatedAtIso: "2026-10-26T10:00:00.000Z" },
      { memberId: "mem-bg-3d", displayName: "박배경 3D디렉터", roleLabel: "배경·언리얼 에셋", equippedHatId: "deep-focus-helmet", customStatusNote: "블렌더 성채 외부 조명 베이킹 중 (호출 자제)", updatedAtIso: "2026-10-26T10:05:00.000Z" },
      { memberId: "mem-pd-review", displayName: "이피디 총괄PD", roleLabel: "편집·일정 프로듀서", equippedHatId: "review-open-crown", customStatusNote: "42화 가편집 검수 오픈 — 즉시 입장 가능", updatedAtIso: "2026-10-26T10:10:00.000Z" },
    ],
    kudosWall: [
      { kudosId: "kudos-1", fromMemberId: "mem-pd-review", fromDisplayName: "이피디 총괄PD", toMemberId: "mem-lead-line", toDisplayName: "김선화 메인작가", episodeCode: "EP.41", category: "line-art-mastery", message: "41화 클라이맥스 양페이지 액션씬 역동성 덕분에 독자 별점 9.98 달성했습니다!", reactionsCount: 14, createdAtIso: "2026-10-26T09:30:00.000Z" },
      { kudosId: "kudos-2", fromMemberId: "mem-lead-line", fromDisplayName: "김선화 메인작가", toMemberId: "mem-bg-3d", toDisplayName: "박배경 3D디렉터", episodeCode: "EP.42", category: "bg-3d-wizard", message: "황실 대성당 GLB 페데스탈 프리뷰 덕분에 로우앵글 투시 시간 4시간 단축했어요!", reactionsCount: 9, createdAtIso: "2026-10-26T09:50:00.000Z" },
    ],
    floorplanMediaMatrix: [
      { roomId: "room-line-pod-a", roomName: "A동 선화·펜터치 페어링 포드", zoneCategory: "production-pod", doorLocked: false, capacity: 6, occupantMemberIds: ["mem-lead-line", "mem-color-sub"], activeMicCount: 2, activeCameraCount: 1, activeScreenStreams: ["screen-1-canvas", "screen-2-reference"], getTeammateSummonAllowed: true },
      { roomId: "room-3d-bake-lab", roomName: "B동 3D 배경·라이팅 베이크 랩", zoneCategory: "production-pod", doorLocked: true, capacity: 4, occupantMemberIds: ["mem-bg-3d"], activeMicCount: 0, activeCameraCount: 0, activeScreenStreams: ["screen-1-canvas"], getTeammateSummonAllowed: false },
      { roomId: "room-xr-auditorium", roomName: "XR 품평회 오디토리움 & 3D 페데스탈 홀", zoneCategory: "review-stage", doorLocked: false, capacity: 24, occupantMemberIds: ["mem-pd-review", "mem-jr-assist"], activeMicCount: 2, activeCameraCount: 2, activeScreenStreams: ["screen-1-canvas"], getTeammateSummonAllowed: true },
      { roomId: "room-guest-reception", roomName: "외부 외주·클라이언트 리셉션 로비", zoneCategory: "reception-lobby", doorLocked: false, capacity: 8, occupantMemberIds: [], activeMicCount: 0, activeCameraCount: 0, activeScreenStreams: [], getTeammateSummonAllowed: true },
    ],
    summonRequests: [
      { summonId: "sum-1", fromMemberId: "mem-pd-review", toMemberId: "mem-lead-line", toDisplayName: "김선화 메인작가", targetRoomId: "room-xr-auditorium", targetRoomName: "XR 품평회 오디토리움 & 3D 페데스탈 홀", reasonNote: "EP.42 컷28 표정 데포르메 최종 컨펌 (약 3분 소요)", status: "pending", createdAtIso: "2026-10-26T10:15:00.000Z" },
    ],
    receptionGuests: [
      { guestId: "guest-ext-sound", guestName: "정사운드 감독", organization: "웨이브오디오 스튜디오 (외부 BGM 파트너)", visitingHostMemberId: "mem-pd-review", targetRoomId: "room-xr-auditorium", verificationCode: "TOON-4209", status: "waiting-in-lobby", arrivedAtIso: "2026-10-26T10:18:00.000Z" },
    ],
    screenInkStrokes: [
      { strokeId: "ink-1", authorMemberId: "mem-pd-review", authorDisplayName: "이피디 총괄PD", mode: "persistent-redline-ink", colorHex: "oklch(0.63 0.24 29)", targetCutCode: "EP42-CUT24", noteLabel: "어깨 역동선 각도 +12도 상향 보정 지시", pointsCount: 42, createdAtMs: 1761473400000, expiresAtMs: null },
      { strokeId: "ink-2", authorMemberId: "mem-lead-line", authorDisplayName: "김선화 메인작가", mode: "fading-laser-ink", colorHex: "oklch(0.75 0.15 230)", targetCutCode: "EP42-CUT24", noteLabel: "시선 집중 하이라이트 레이저 포인터", pointsCount: 18, createdAtMs: 1761473402000, expiresAtMs: 1761473405500 },
    ],
    remoteControlSessions: [
      { sessionId: "rcs-csp-1", hostMemberId: "mem-lead-line", hostDisplayName: "김선화 메인작가", targetAppName: "Clip Studio Paint EX", activeControllerMemberId: "mem-lead-line", controlDriverState: "shared-driver-active", latencyMs: 11, resolutionLabel: "5K-60fps-444" },
      { sessionId: "rcs-blender-2", hostMemberId: "mem-bg-3d", hostDisplayName: "박배경 3D디렉터", targetAppName: "Blender 4.3", activeControllerMemberId: "mem-bg-3d", controlDriverState: "host-only", latencyMs: 14, resolutionLabel: "4K-60fps-low-cpu" },
    ],
    floorCoachingSessions: [
      { coachingId: "coach-1", roomId: "room-xr-auditorium", roomName: "XR 품평회 오디토리움 & 3D 페데스탈 홀", leadMemberId: "mem-lead-line", leadDisplayName: "김선화 메인작가", shadowingMemberIds: ["mem-jr-assist"], mode: "whisper-director-coaching", lastWhisperDirective: "PD 귓속말: 외주 BGM 감독님께 컷28 호흡을 1.8초 더 길게 가져간다고 안내해 주세요.", liveAiBattlecardTip: "AI 배틀카드: 이전 38화 전투씬과 템포 일관성을 위해 BPM 138 레퍼런스 시트를 함께 제시하세요.", transcriptSentimentScore: 94 },
    ],
    assetPedestals: [
      { pedestalId: "pedestal-throne-hall", title: "황실 대성당 중앙 제단 & 마법진 프롭", assetFormat: "glb", episodePropCode: "EP42-PROP-ALTAR-01", turntableAngleDeg: 45, autoRotateEnabled: true, activeScaleMultiplier: 1.25, selectedAuditoriumCameraPreset: "pedestal-macro-orbit", spatialPinNotes: ["북쪽 스테인드글라스 역광 각도 32도 고정", "컷27 주인공 착지 위치 마커 확인 완료"] },
    ],
  };
}

export function equipStudioMemberStatusHat(
  state: StudioPairingXrFloorState,
  memberId: string,
  hatId: StudioAvatarStatusHatId,
  customStatusNote?: string,
  nowIso: string = new Date().toISOString(),
): StudioPairingXrFloorState {
  const catalogEntry = state.hatCatalog.find((entry) => entry.hatId === hatId) ?? STUDIO_AVATAR_STATUS_HAT_CATALOG[0];
  const resolvedNote = customStatusNote !== undefined && customStatusNote.trim().length > 0 ? customStatusNote.trim() : catalogEntry.defaultStatusMessage;
  return {
    ...state,
    memberHats: state.memberHats.map((member) =>
      member.memberId === memberId ? { ...member, equippedHatId: hatId, customStatusNote: resolvedNote, updatedAtIso: nowIso } : member,
    ),
  };
}

export interface PostStudioKudosInput {
  readonly fromMemberId: string;
  readonly fromDisplayName: string;
  readonly toMemberId: string;
  readonly toDisplayName: string;
  readonly episodeCode: string;
  readonly category: StudioKudosCategory;
  readonly message: string;
}

export function postStudioKudosShoutout(
  state: StudioPairingXrFloorState,
  input: PostStudioKudosInput,
  nowIso: string = new Date().toISOString(),
): StudioPairingXrFloorState {
  const trimmedMessage = input.message.trim();
  if (!trimmedMessage) return state;
  const newCard: StudioKudosShoutoutCard = {
    kudosId: `kudos-${state.kudosWall.length + 1}-${Date.now()}`,
    fromMemberId: input.fromMemberId,
    fromDisplayName: input.fromDisplayName,
    toMemberId: input.toMemberId,
    toDisplayName: input.toDisplayName,
    episodeCode: input.episodeCode.trim() || "EP.42",
    category: input.category,
    message: trimmedMessage,
    reactionsCount: 1,
    createdAtIso: nowIso,
  };
  return { ...state, kudosWall: [newCard, ...state.kudosWall] };
}

export function reactToStudioKudosShoutout(state: StudioPairingXrFloorState, kudosId: string): StudioPairingXrFloorState {
  return {
    ...state,
    kudosWall: state.kudosWall.map((card) => (card.kudosId === kudosId ? { ...card, reactionsCount: card.reactionsCount + 1 } : card)),
  };
}

export function summonTeammateToStudioRoom(
  state: StudioPairingXrFloorState,
  fromMemberId: string,
  toMemberId: string,
  toDisplayName: string,
  targetRoomId: string,
  reasonNote: string,
  nowIso: string = new Date().toISOString(),
): StudioPairingXrFloorState {
  const targetRoom = state.floorplanMediaMatrix.find((room) => room.roomId === targetRoomId);
  if (!targetRoom || !targetRoom.getTeammateSummonAllowed) return state;
  const targetHatAssignment = state.memberHats.find((item) => item.memberId === toMemberId);
  const hatSpec = state.hatCatalog.find((entry) => entry.hatId === targetHatAssignment?.equippedHatId);
  if (hatSpec?.blocksDirectInterruptions) return state;
  const request: StudioTeammateSummonRequest = {
    summonId: `sum-${state.summonRequests.length + 1}`,
    fromMemberId,
    toMemberId,
    toDisplayName,
    targetRoomId,
    targetRoomName: targetRoom.roomName,
    reasonNote: reasonNote.trim() || "즉시 룸 합류 요청",
    status: "pending",
    createdAtIso: nowIso,
  };
  return { ...state, summonRequests: [request, ...state.summonRequests] };
}

export function respondToTeammateSummon(
  state: StudioPairingXrFloorState,
  summonId: string,
  decision: "accepted" | "declined",
): StudioPairingXrFloorState {
  const targetSummon = state.summonRequests.find((req) => req.summonId === summonId);
  if (!targetSummon || targetSummon.status !== "pending") return state;
  const nextSummons = state.summonRequests.map((req) => (req.summonId === summonId ? { ...req, status: decision } : req));
  if (decision === "declined") return { ...state, summonRequests: nextSummons };

  const nextRooms = state.floorplanMediaMatrix.map((room) => {
    const withoutMember = room.occupantMemberIds.filter((id) => id !== targetSummon.toMemberId);
    return room.roomId === targetSummon.targetRoomId
      ? { ...room, occupantMemberIds: [...withoutMember, targetSummon.toMemberId] }
      : { ...room, occupantMemberIds: withoutMember };
  });
  return { ...state, summonRequests: nextSummons, floorplanMediaMatrix: nextRooms };
}

export function resolveReceptionLobbyGuest(
  state: StudioPairingXrFloorState,
  guestId: string,
  decision: "admitted" | "denied",
): StudioPairingXrFloorState {
  const guest = state.receptionGuests.find((item) => item.guestId === guestId);
  if (!guest || guest.status !== "waiting-in-lobby") return state;
  const nextGuests = state.receptionGuests.map((item) => (item.guestId === guestId ? { ...item, status: decision } : item));
  if (decision === "denied") return { ...state, receptionGuests: nextGuests };

  const nextRooms = state.floorplanMediaMatrix.map((room) =>
    room.roomId === guest.targetRoomId && !room.occupantMemberIds.includes(guest.guestId)
      ? { ...room, occupantMemberIds: [...room.occupantMemberIds, guest.guestId] }
      : room,
  );
  return { ...state, receptionGuests: nextGuests, floorplanMediaMatrix: nextRooms };
}

export function toggleStudioRoomDoorLock(state: StudioPairingXrFloorState, roomId: string): StudioPairingXrFloorState {
  return {
    ...state,
    floorplanMediaMatrix: state.floorplanMediaMatrix.map((room) =>
      room.roomId === roomId ? { ...room, doorLocked: !room.doorLocked, getTeammateSummonAllowed: room.doorLocked } : room,
    ),
  };
}

export interface AddStudioScreenInkStrokeInput {
  readonly authorMemberId: string;
  readonly authorDisplayName: string;
  readonly mode: StudioScreenInkMode;
  readonly colorHex?: string;
  readonly targetCutCode: string;
  readonly noteLabel: string;
  readonly pointsCount?: number;
  readonly ttlMs?: number;
}

export function addStudioScreenInkStroke(
  state: StudioPairingXrFloorState,
  input: AddStudioScreenInkStrokeInput,
  nowMs: number = Date.now(),
): StudioPairingXrFloorState {
  const isFading = input.mode === "fading-laser-ink";
  const ttl = input.ttlMs ?? DEFAULT_FADING_INK_TTL_MS;
  const stroke: StudioScreenInkStroke = {
    strokeId: `ink-${state.screenInkStrokes.length + 1}-${nowMs}`,
    authorMemberId: input.authorMemberId,
    authorDisplayName: input.authorDisplayName,
    mode: input.mode,
    colorHex: input.colorHex ?? (isFading ? "oklch(0.75 0.15 230)" : input.mode === "persistent-redline-ink" ? "oklch(0.63 0.24 29)" : "oklch(0.77 0.16 70)"),
    targetCutCode: input.targetCutCode.trim() || "EP42-CUT24",
    noteLabel: input.noteLabel.trim() || "화면 드로잉 마킹",
    pointsCount: input.pointsCount ?? 24,
    createdAtMs: nowMs,
    expiresAtMs: isFading ? nowMs + ttl : null,
  };
  return { ...state, screenInkStrokes: [stroke, ...state.screenInkStrokes] };
}

export function pruneExpiredFadingInkStrokes(state: StudioPairingXrFloorState, nowMs: number): StudioPairingXrFloorState {
  return {
    ...state,
    screenInkStrokes: state.screenInkStrokes.filter((stroke) => stroke.expiresAtMs === null || stroke.expiresAtMs > nowMs),
  };
}

export function handoffRemoteAppControlDriver(
  state: StudioPairingXrFloorState,
  sessionId: string,
  nextControllerMemberId: string,
): StudioPairingXrFloorState {
  return {
    ...state,
    remoteControlSessions: state.remoteControlSessions.map((session) => {
      if (session.sessionId !== sessionId) return session;
      const isHost = nextControllerMemberId === session.hostMemberId;
      return {
        ...session,
        activeControllerMemberId: nextControllerMemberId,
        controlDriverState: isHost ? "host-only" : "shared-driver-active",
      };
    }),
  };
}

export function sendDirectorWhisperDirective(
  state: StudioPairingXrFloorState,
  coachingId: string,
  directiveText: string,
): StudioPairingXrFloorState {
  const trimmed = directiveText.trim();
  if (!trimmed) return state;
  return {
    ...state,
    floorCoachingSessions: state.floorCoachingSessions.map((session) =>
      session.coachingId === coachingId ? { ...session, mode: "whisper-director-coaching", lastWhisperDirective: trimmed } : session,
    ),
  };
}

export function joinFloorShadowingSession(
  state: StudioPairingXrFloorState,
  coachingId: string,
  traineeMemberId: string,
): StudioPairingXrFloorState {
  return {
    ...state,
    floorCoachingSessions: state.floorCoachingSessions.map((session) =>
      session.coachingId !== coachingId || session.shadowingMemberIds.includes(traineeMemberId)
        ? session
        : { ...session, shadowingMemberIds: [...session.shadowingMemberIds, traineeMemberId] },
    ),
  };
}

export interface Update3dAssetPedestalPatch {
  readonly turntableAngleDeg?: number;
  readonly autoRotateEnabled?: boolean;
  readonly activeScaleMultiplier?: number;
  readonly selectedAuditoriumCameraPreset?: StudioAuditoriumCameraPreset;
  readonly appendSpatialPinNote?: string;
}

export function update3dAssetPedestalInspection(
  state: StudioPairingXrFloorState,
  pedestalId: string,
  patch: Update3dAssetPedestalPatch,
): StudioPairingXrFloorState {
  return {
    ...state,
    assetPedestals: state.assetPedestals.map((pedestal) => {
      if (pedestal.pedestalId !== pedestalId) return pedestal;
      const normalizedAngle = patch.turntableAngleDeg !== undefined ? ((patch.turntableAngleDeg % 360) + 360) % 360 : pedestal.turntableAngleDeg;
      const nextPins = patch.appendSpatialPinNote && patch.appendSpatialPinNote.trim().length > 0
        ? [...pedestal.spatialPinNotes, patch.appendSpatialPinNote.trim()]
        : pedestal.spatialPinNotes;
      return {
        ...pedestal,
        turntableAngleDeg: normalizedAngle,
        autoRotateEnabled: patch.autoRotateEnabled ?? pedestal.autoRotateEnabled,
        activeScaleMultiplier: patch.activeScaleMultiplier ?? pedestal.activeScaleMultiplier,
        selectedAuditoriumCameraPreset: patch.selectedAuditoriumCameraPreset ?? pedestal.selectedAuditoriumCameraPreset,
        spatialPinNotes: nextPins,
      };
    }),
  };
}

export function buildStudioPairingXrFloorSummary(state: StudioPairingXrFloorState): StudioPairingXrFloorSummary {
  return {
    activeHatsCount: state.memberHats.filter((m) => m.equippedHatId !== "none").length,
    interruptProtectedMemberCount: state.memberHats.filter((m) => Boolean(state.hatCatalog.find((h) => h.hatId === m.equippedHatId)?.blocksDirectInterruptions)).length,
    totalKudosCount: state.kudosWall.length,
    totalKudosReactions: state.kudosWall.reduce((acc, card) => acc + card.reactionsCount, 0),
    activeFloorplanStreamsCount: state.floorplanMediaMatrix.reduce((acc, room) => acc + room.activeScreenStreams.length, 0),
    lockedRoomCount: state.floorplanMediaMatrix.filter((room) => room.doorLocked).length,
    pendingSummonCount: state.summonRequests.filter((req) => req.status === "pending").length,
    waitingReceptionGuestCount: state.receptionGuests.filter((guest) => guest.status === "waiting-in-lobby").length,
    activeFadingInkCount: state.screenInkStrokes.filter((stroke) => stroke.mode === "fading-laser-ink").length,
    activePersistentRedlineCount: state.screenInkStrokes.filter((stroke) => stroke.mode === "persistent-redline-ink").length,
    sharedControlActiveSessionCount: state.remoteControlSessions.filter((s) => s.controlDriverState === "shared-driver-active").length,
    activeShadowingTraineeCount: state.floorCoachingSessions.reduce((acc, s) => acc + s.shadowingMemberIds.length, 0),
    totalPedestalSpatialPins: state.assetPedestals.reduce((acc, p) => acc + p.spatialPinNotes.length, 0),
  };
}
