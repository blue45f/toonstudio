/**
 * Clean-Room Virtual Office Wave-3 Domain Model:
 * Backstage Green Room & Speed-Critique Table Hopping (Airmeet, Remo),
 * 3D Spatial Ghost Avatar Recording & Cross-World Portals (ENGAGE XR, Spatial.io),
 * Accountability Focus Sprint Pairing & Host Playbooks (Focusmate, Flow Club),
 * and Fluid Ambient Soundscape Zones (Bramble).
 */

export type StudioWave3BenchmarkPlatformId =
  | "remo" | "spatialio" | "engagevr" | "airmeet" | "bramble" | "focusmate" | "flowclub";

export interface StudioBackstageGreenRoomState {
  readonly presenterMemberId: string;
  readonly presenterDisplayName: string;
  readonly roleTitle: string;
  readonly micReady: boolean;
  readonly camReady: boolean;
  readonly deckSynced: boolean;
  readonly stageLiveState: "in-green-room" | "live-on-main-stage";
  readonly handRaiseQueueCount: number;
}

export interface StudioCritiqueTableSlot {
  readonly tableId: string;
  readonly tableName: string;
  readonly episodeCutRange: string;
  readonly maxSeats: number;
  readonly seatedMemberNames: readonly string[];
  readonly rotationRound: number;
}

export interface StudioStageQnaItem {
  readonly qnaId: string;
  readonly authorName: string;
  readonly questionText: string;
  readonly upvotes: number;
  readonly answeredOnStage: boolean;
}

export type StudioGhostPlaybackStatus = "stopped" | "playing-hologram" | "paused";

export interface StudioSpatialGhostRecording {
  readonly recordingId: string;
  readonly title: string;
  readonly recordedRoomName: string;
  readonly durationSec: number;
  readonly actorNames: readonly string[];
  readonly recordedPropCount: number;
  readonly playbackState: StudioGhostPlaybackStatus;
  readonly currentPlayheadSec: number;
}

export interface StudioSpatialPortalLink {
  readonly portalId: string;
  readonly label: string;
  readonly fromZoneName: string;
  readonly targetWorldName: string;
  readonly targetEpisodeCode: string;
  readonly activeTravellersCount: number;
  readonly portalLocked: boolean;
}

export type StudioFocusSprintPhase =
  | "check-in-intentions"
  | "silent-deep-drawing"
  | "retrospective-celebration";

export interface StudioSprintParticipantIntention {
  readonly memberId: string;
  readonly displayName: string;
  readonly goalText: string;
  readonly completed: boolean;
}

export interface StudioFocusSprintSession {
  readonly sprintId: string;
  readonly sprintTitle: string;
  readonly hostDisplayName: string;
  readonly durationMinutes: 25 | 50 | 75;
  readonly currentPhase: StudioFocusSprintPhase;
  readonly lofiTrackTitle: string;
  readonly participantIntentions: readonly StudioSprintParticipantIntention[];
}

export type StudioAmbientSoundscapePreset =
  | "lofi-atelier"
  | "rainy-rooftop"
  | "cafe-murmur"
  | "cathedral-reverb";

export interface StudioAmbientSoundscapeZone {
  readonly zoneId: string;
  readonly zoneName: string;
  readonly soundscapePreset: StudioAmbientSoundscapePreset;
  readonly ambientVolumePercent: number;
  readonly voiceDuckingEnabled: boolean;
}

export interface StudioStageSprintHoloState {
  readonly greenRoom: StudioBackstageGreenRoomState;
  readonly critiqueTables: readonly StudioCritiqueTableSlot[];
  readonly stageQnaQueue: readonly StudioStageQnaItem[];
  readonly ghostRecordings: readonly StudioSpatialGhostRecording[];
  readonly spatialPortals: readonly StudioSpatialPortalLink[];
  readonly focusSprints: readonly StudioFocusSprintSession[];
  readonly soundscapeZones: readonly StudioAmbientSoundscapeZone[];
}

export interface StudioStageSprintHoloSummary {
  readonly greenRoomAllChecksReady: boolean;
  readonly isMainStageLive: boolean;
  readonly critiqueRotationRound: number;
  readonly totalQnaUpvotes: number;
  readonly activeHologramRecordingCount: number;
  readonly totalPortalTravellersCount: number;
  readonly completedSprintGoalsCount: number;
  readonly totalSprintGoalsCount: number;
  readonly voiceDuckingZoneCount: number;
}

export function createInitialStudioStageSprintHoloState(): StudioStageSprintHoloState {
  return {
    greenRoom: {
      presenterMemberId: "mem-lead-line",
      presenterDisplayName: "김선화 메인작가",
      roleTitle: "EP.42 총괄 연출 브리핑",
      micReady: true,
      camReady: true,
      deckSynced: false,
      stageLiveState: "in-green-room",
      handRaiseQueueCount: 3,
    },
    critiqueTables: [
      { tableId: "tbl-cut-1-20", tableName: "테이블 A · 도입부 콘티·선화", episodeCutRange: "EP42 컷 01~20", maxSeats: 6, seatedMemberNames: ["김선화 메인작가", "최컬러 수석"], rotationRound: 1 },
      { tableId: "tbl-cut-21-45", tableName: "테이블 B · 성채 전투 클라이맥스", episodeCutRange: "EP42 컷 21~45", maxSeats: 6, seatedMemberNames: ["박배경 3D디렉터", "정사운드 감독"], rotationRound: 1 },
      { tableId: "tbl-cut-46-65", tableName: "테이블 C · 엔딩 식자·후보정", episodeCutRange: "EP42 컷 46~65", maxSeats: 6, seatedMemberNames: ["이피디 총괄PD", "한식자 디자이너"], rotationRound: 1 },
    ],
    stageQnaQueue: [
      { qnaId: "qna-1", authorName: "최컬러 수석", questionText: "컷 31 마법진 발광 레이어 블렌드 모드를 Color Dodge로 통일할까요?", upvotes: 11, answeredOnStage: false },
      { qnaId: "qna-2", authorName: "한식자 디자이너", questionText: "42화 엔딩 타이틀 효과음 타이밍과 말풍선 여백 가이드를 공유해 주세요.", upvotes: 7, answeredOnStage: false },
    ],
    ghostRecordings: [
      { recordingId: "ghost-rec-1", title: "EP.42 성채 대성당 카메라 동선 3D 홀로그램 블로킹", recordedRoomName: "XR 품평회 오디토리움", durationSec: 185, actorNames: ["김선화 메인작가", "박배경 3D디렉터"], recordedPropCount: 6, playbackState: "playing-hologram", currentPlayheadSec: 42 },
      { recordingId: "ghost-rec-2", title: "EP.41 액션 합 맞추기 아바타 모션 리플레이", recordedRoomName: "2F 작화 아틀리에", durationSec: 120, actorNames: ["김선화 메인작가"], recordedPropCount: 3, playbackState: "stopped", currentPlayheadSec: 0 },
    ],
    spatialPortals: [
      { portalId: "portal-ep42-cathedral", label: "황실 대성당 3D 갤러리 월드 포털", fromZoneName: "1F 타운홀 로비", targetWorldName: "Spatial Cathedral Gallery", targetEpisodeCode: "EP.42", activeTravellersCount: 4, portalLocked: false },
      { portalId: "portal-ep43-dungeon", label: "지하 심연 던전 프리비즈 월드 포털", fromZoneName: "2F 3D 배경 랩", targetWorldName: "Abyss Dungeon Previz", targetEpisodeCode: "EP.43", activeTravellersCount: 2, portalLocked: false },
    ],
    focusSprints: [
      {
        sprintId: "sprint-50m-night",
        sprintTitle: "마감 D-1 50분 초집중 펜터치·채색 딥워크 스프린트",
        hostDisplayName: "이피디 총괄PD",
        durationMinutes: 50,
        currentPhase: "check-in-intentions",
        lofiTrackTitle: "Midnight Webtoon Atelier Lo-Fi Beats (84 BPM)",
        participantIntentions: [
          { memberId: "mem-lead-line", displayName: "김선화 메인작가", goalText: "EP.42 컷 24~29 인물 펜선 마감 완주", completed: true },
          { memberId: "mem-bg-3d", displayName: "박배경 3D디렉터", goalText: "대성당 스테인드글라스 광원 렌더 패스 추출", completed: false },
          { memberId: "mem-color-sub", displayName: "최컬러 수석", goalText: "컷 12~18 피부 밑색 및 역광 그라데이션 완료", completed: false },
        ],
      },
    ],
    soundscapeZones: [
      { zoneId: "zone-sound-atelier", zoneName: "2F 작화 아틀리에 사운드스케이프", soundscapePreset: "lofi-atelier", ambientVolumePercent: 35, voiceDuckingEnabled: true },
      { zoneId: "zone-sound-lounge", zoneName: "1F 카페 라운지 사운드스케이프", soundscapePreset: "rainy-rooftop", ambientVolumePercent: 45, voiceDuckingEnabled: true },
    ],
  };
}

export function toggleGreenRoomDeviceCheck(
  state: StudioStageSprintHoloState,
  device: "mic" | "cam" | "deck",
): StudioStageSprintHoloState {
  const nextGreenRoom: StudioBackstageGreenRoomState = {
    ...state.greenRoom,
    micReady: device === "mic" ? !state.greenRoom.micReady : state.greenRoom.micReady,
    camReady: device === "cam" ? !state.greenRoom.camReady : state.greenRoom.camReady,
    deckSynced: device === "deck" ? !state.greenRoom.deckSynced : state.greenRoom.deckSynced,
  };
  return { ...state, greenRoom: nextGreenRoom };
}

export function promoteGreenRoomPresenterToMainStage(
  state: StudioStageSprintHoloState,
): StudioStageSprintHoloState {
  if (!state.greenRoom.micReady || !state.greenRoom.camReady || !state.greenRoom.deckSynced) {
    return state;
  }
  return {
    ...state,
    greenRoom: { ...state.greenRoom, stageLiveState: "live-on-main-stage" },
  };
}

export function rotateSpeedCritiqueTables(
  state: StudioStageSprintHoloState,
): StudioStageSprintHoloState {
  if (state.critiqueTables.length < 2) return state;
  const groups = state.critiqueTables.map((t) => t.seatedMemberNames);
  const rotatedGroups = groups.map((_, idx) => groups[(idx + groups.length - 1) % groups.length]);
  return {
    ...state,
    critiqueTables: state.critiqueTables.map((table, idx) => ({
      ...table,
      seatedMemberNames: rotatedGroups[idx],
      rotationRound: table.rotationRound + 1,
    })),
  };
}

export function upvoteStageQnaItem(
  state: StudioStageSprintHoloState,
  qnaId: string,
): StudioStageSprintHoloState {
  const updated = state.stageQnaQueue
    .map((item) => (item.qnaId === qnaId ? { ...item, upvotes: item.upvotes + 1 } : item))
    .sort((a, b) => b.upvotes - a.upvotes);
  return { ...state, stageQnaQueue: updated };
}

export function setSpatialGhostPlaybackState(
  state: StudioStageSprintHoloState,
  recordingId: string,
  nextState: StudioGhostPlaybackStatus,
  playheadSec?: number,
): StudioStageSprintHoloState {
  return {
    ...state,
    ghostRecordings: state.ghostRecordings.map((rec) =>
      rec.recordingId === recordingId
        ? {
            ...rec,
            playbackState: nextState,
            currentPlayheadSec:
              playheadSec !== undefined ? Math.min(rec.durationSec, Math.max(0, playheadSec)) : rec.currentPlayheadSec,
          }
        : rec,
    ),
  };
}

export function recordNewSpatialGhostClip(
  state: StudioStageSprintHoloState,
  title: string,
  recordedRoomName: string,
  durationSec: number = 90,
): StudioStageSprintHoloState {
  const trimmed = title.trim();
  if (!trimmed) return state;
  const clip: StudioSpatialGhostRecording = {
    recordingId: `ghost-rec-${state.ghostRecordings.length + 1}`,
    title: trimmed,
    recordedRoomName: recordedRoomName.trim() || "XR 품평회 오디토리움",
    durationSec,
    actorNames: ["김선화 메인작가", "이피디 총괄PD"],
    recordedPropCount: 4,
    playbackState: "playing-hologram",
    currentPlayheadSec: 0,
  };
  return { ...state, ghostRecordings: [clip, ...state.ghostRecordings] };
}

export function traverseSpatialPortal(
  state: StudioStageSprintHoloState,
  portalId: string,
): StudioStageSprintHoloState {
  return {
    ...state,
    spatialPortals: state.spatialPortals.map((portal) =>
      portal.portalId === portalId && !portal.portalLocked
        ? { ...portal, activeTravellersCount: portal.activeTravellersCount + 1 }
        : portal,
    ),
  };
}

export function advanceFocusSprintPhase(
  state: StudioStageSprintHoloState,
  sprintId: string,
): StudioStageSprintHoloState {
  const order: readonly StudioFocusSprintPhase[] = [
    "check-in-intentions",
    "silent-deep-drawing",
    "retrospective-celebration",
  ];
  return {
    ...state,
    focusSprints: state.focusSprints.map((sprint) => {
      if (sprint.sprintId !== sprintId) return sprint;
      const idx = order.indexOf(sprint.currentPhase);
      const nextPhase = order[(idx + 1) % order.length];
      return { ...sprint, currentPhase: nextPhase };
    }),
  };
}

export function toggleFocusSprintIntentionCompleted(
  state: StudioStageSprintHoloState,
  sprintId: string,
  memberId: string,
): StudioStageSprintHoloState {
  return {
    ...state,
    focusSprints: state.focusSprints.map((sprint) =>
      sprint.sprintId === sprintId
        ? {
            ...sprint,
            participantIntentions: sprint.participantIntentions.map((item) =>
              item.memberId === memberId ? { ...item, completed: !item.completed } : item,
            ),
          }
        : sprint,
    ),
  };
}

export function addFocusSprintIntention(
  state: StudioStageSprintHoloState,
  sprintId: string,
  displayName: string,
  goalText: string,
): StudioStageSprintHoloState {
  const trimmedGoal = goalText.trim();
  if (!trimmedGoal) return state;
  return {
    ...state,
    focusSprints: state.focusSprints.map((sprint) =>
      sprint.sprintId === sprintId
        ? {
            ...sprint,
            participantIntentions: [
              ...sprint.participantIntentions,
              {
                memberId: `mem-sprint-${sprint.participantIntentions.length + 1}`,
                displayName: displayName.trim() || "신규 어시스턴트",
                goalText: trimmedGoal,
                completed: false,
              },
            ],
          }
        : sprint,
    ),
  };
}

export function updateAmbientSoundscapeZone(
  state: StudioStageSprintHoloState,
  zoneId: string,
  soundscapePreset: StudioAmbientSoundscapePreset,
  ambientVolumePercent?: number,
  voiceDuckingEnabled?: boolean,
): StudioStageSprintHoloState {
  return {
    ...state,
    soundscapeZones: state.soundscapeZones.map((zone) =>
      zone.zoneId === zoneId
        ? {
            ...zone,
            soundscapePreset,
            ambientVolumePercent:
              ambientVolumePercent !== undefined ? Math.max(0, Math.min(100, ambientVolumePercent)) : zone.ambientVolumePercent,
            voiceDuckingEnabled: voiceDuckingEnabled ?? zone.voiceDuckingEnabled,
          }
        : zone,
    ),
  };
}

export function buildStudioStageSprintHoloSummary(
  state: StudioStageSprintHoloState,
): StudioStageSprintHoloSummary {
  const greenRoomAllChecksReady =
    state.greenRoom.micReady && state.greenRoom.camReady && state.greenRoom.deckSynced;
  const isMainStageLive = state.greenRoom.stageLiveState === "live-on-main-stage";
  const critiqueRotationRound = state.critiqueTables[0]?.rotationRound ?? 1;
  const totalQnaUpvotes = state.stageQnaQueue.reduce((acc, item) => acc + item.upvotes, 0);
  const activeHologramRecordingCount = state.ghostRecordings.filter(
    (rec) => rec.playbackState === "playing-hologram",
  ).length;
  const totalPortalTravellersCount = state.spatialPortals.reduce(
    (acc, portal) => acc + portal.activeTravellersCount,
    0,
  );
  const allGoals = state.focusSprints.flatMap((s) => s.participantIntentions);
  const completedSprintGoalsCount = allGoals.filter((g) => g.completed).length;
  const totalSprintGoalsCount = allGoals.length;
  const voiceDuckingZoneCount = state.soundscapeZones.filter((z) => z.voiceDuckingEnabled).length;

  return {
    greenRoomAllChecksReady,
    isMainStageLive,
    critiqueRotationRound,
    totalQnaUpvotes,
    activeHologramRecordingCount,
    totalPortalTravellersCount,
    completedSprintGoalsCount,
    totalSprintGoalsCount,
    voiceDuckingZoneCount,
  };
}
