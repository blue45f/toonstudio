import type { StudioVirtualSpaceActivity } from "./studio-virtual-space-model";
import type { StudioUserStatus } from "./studio-virtual-space-user-status";

/**
 * 아틀리에 작업 상태 스냅샷(Atelier Pulse) 도메인 모델.
 *
 * 공간(구역)·작업 호흡(집중 세션)·동료들의 실시간 활동 밀도를 합성해
 * 실무 협업 배지와 다음 추천 행동(quickActionId)을 산출한다.
 */
export type StudioAtelierPulseTempo =
  | "serene"
  | "focused-flow"
  | "creative-surge"
  | "ensemble-sync";

export type StudioAtelierPulseTone =
  | "violet"
  | "emerald"
  | "amber"
  | "sky"
  | "rose";

export type StudioAtelierQuickActionId =
  | "start-focus"
  | "stop-focus"
  | "open-review"
  | "join-huddle"
  | "find-space";

export interface StudioAtelierPeerSample {
  readonly zoneId?: string | null;
  readonly activity: StudioVirtualSpaceActivity;
  readonly userStatus?: StudioUserStatus | null;
  readonly nearby?: boolean;
}

export interface StudioAtelierPulseInput {
  readonly roomId: string | null;
  readonly privateZone: boolean;
  readonly selfActivity: StudioVirtualSpaceActivity;
  readonly selfUserStatus?: StudioUserStatus | null;
  readonly selfSeated: boolean;
  readonly focusActive: boolean;
  readonly focusPhase?: "idle" | "running" | "paused" | "break" | "done";
  readonly peers: readonly StudioAtelierPeerSample[];
  readonly spotlightActive?: boolean;
}

export interface StudioAtelierZoneResonance {
  readonly zoneId: string | null;
  readonly sameZonePeerCount: number;
  readonly nearbyPeerCount: number;
  readonly focusedPeerCount: number;
  readonly reviewingPeerCount: number;
}

/** 스튜디오 구역·집중·협업 지표(각 0~100%). */
export interface StudioAtelierPulseDimensions {
  readonly officePresence: number;
  readonly deepWorkFlow: number;
  readonly reviewCollaboration: number;
  readonly wellnessVitality: number;
}

export interface StudioAtelierPulseSnapshot {
  readonly tempo: StudioAtelierPulseTempo;
  readonly tone: StudioAtelierPulseTone;
  /** 0~200 범위의 작업 몰입·협업 밀도 지수 */
  readonly synergyScore: number;
  readonly badgeKo: string;
  readonly badgeEn: string;
  /** HUD에 표시할 실무 협업 상태 배지 */
  readonly workStatusBadgeKo: string;
  readonly workStatusBadgeEn: string;
  readonly headlineKo: string;
  readonly headlineEn: string;
  readonly sublineKo: string;
  readonly sublineEn: string;
  readonly recommendedZoneId: string;
  readonly recommendedRoutineKo: string;
  readonly recommendedRoutineEn: string;
  readonly quickActionId: StudioAtelierQuickActionId;
  readonly quickActionLabelKo: string;
  readonly quickActionLabelEn: string;
  readonly zoneResonance: StudioAtelierZoneResonance;
  readonly dimensions: StudioAtelierPulseDimensions;
}

const CREATIVE_ZONE_IDS = new Set([
  "drawing",
  "writers",
  "story",
  "art-lab",
  "coloring",
  "3d-bg",
  "atelier",
  "booth",
]);

const REVIEW_OR_SYNC_ZONE_IDS = new Set([
  "review",
  "meeting",
  "gallery",
  "stage",
  "plaza",
  "lobby",
]);

function clampScore200(value: number): number {
  if (!Number.isFinite(value)) return 116;
  return Math.max(0, Math.min(200, Math.round(value)));
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isCreativeZone(roomId: string | null): boolean {
  if (!roomId) return false;
  const normalized = roomId.toLowerCase();
  if (CREATIVE_ZONE_IDS.has(normalized)) return true;
  return (
    normalized.includes("draw")
    || normalized.includes("write")
    || normalized.includes("story")
    || normalized.includes("studio")
    || normalized.includes("desk")
    || normalized.includes("booth")
  );
}

function isSyncZone(roomId: string | null): boolean {
  if (!roomId) return false;
  const normalized = roomId.toLowerCase();
  if (REVIEW_OR_SYNC_ZONE_IDS.has(normalized)) return true;
  return (
    normalized.includes("review")
    || normalized.includes("meet")
    || normalized.includes("gallery")
    || normalized.includes("lounge")
    || normalized.includes("cafe")
  );
}

export function computeStudioAtelierPulse(
  input: StudioAtelierPulseInput,
): StudioAtelierPulseSnapshot {
  const roomId = input.roomId ?? null;
  let sameZonePeerCount = 0;
  let nearbyPeerCount = 0;
  let focusedPeerCount = 0;
  let reviewingPeerCount = 0;

  for (const peer of input.peers) {
    if (roomId && peer.zoneId === roomId) sameZonePeerCount += 1;
    if (peer.nearby) nearbyPeerCount += 1;
    if (peer.activity === "focused" || peer.userStatus === "focusing") focusedPeerCount += 1;
    if (peer.activity === "reviewing" || peer.userStatus === "in-meeting") reviewingPeerCount += 1;
  }

  const zoneResonance: StudioAtelierZoneResonance = Object.freeze({
    zoneId: roomId,
    sameZonePeerCount,
    nearbyPeerCount,
    focusedPeerCount,
    reviewingPeerCount,
  });

  const selfFocusing =
    input.focusActive
    || input.selfActivity === "focused"
    || input.selfUserStatus === "focusing";
  const selfReviewingOrMeeting =
    input.selfActivity === "reviewing"
    || input.selfUserStatus === "in-meeting"
    || Boolean(input.spotlightActive);
  const creativeRoom = isCreativeZone(roomId);
  const syncRoom = isSyncZone(roomId) || input.privateZone;

  let rawScore = 120;
  if (roomId) rawScore += 10;
  if (creativeRoom) rawScore += 12;
  if (syncRoom) rawScore += 10;
  if (input.selfSeated) rawScore += 12;
  if (selfFocusing) rawScore += 22;
  if (input.focusPhase === "running") rawScore += 10;
  if (selfReviewingOrMeeting) rawScore += 18;
  rawScore += Math.min(24, sameZonePeerCount * 8);
  rawScore += Math.min(18, nearbyPeerCount * 9);
  rawScore += Math.min(16, focusedPeerCount * 6);
  rawScore += Math.min(16, reviewingPeerCount * 8);
  if (input.selfActivity === "away" || input.selfUserStatus === "break" || input.selfUserStatus === "away") {
    rawScore = Math.max(96, rawScore - 26);
  }
  const synergyScore = clampScore200(rawScore);

  const dimensions: StudioAtelierPulseDimensions = Object.freeze({
    officePresence: clampPercent(55 + (roomId ? 10 : 0) + (input.selfSeated ? 20 : 0) + Math.min(15, sameZonePeerCount * 5)),
    deepWorkFlow: clampPercent(45 + (selfFocusing ? 35 : 0) + (creativeRoom ? 10 : 0) + Math.min(10, focusedPeerCount * 5)),
    reviewCollaboration: clampPercent(45 + (selfReviewingOrMeeting ? 30 : 0) + (syncRoom ? 10 : 0) + Math.min(15, (nearbyPeerCount + reviewingPeerCount) * 5)),
    wellnessVitality: clampPercent(input.focusPhase === "break" ? 100 : 72 + (input.selfSeated ? 12 : 8) + (sameZonePeerCount > 0 ? 10 : 4)),
  });

  if (
    selfReviewingOrMeeting
    || (nearbyPeerCount > 0 && (syncRoom || reviewingPeerCount > 0))
  ) {
    return Object.freeze({
      tempo: "ensemble-sync",
      tone: "amber",
      synergyScore,
      badgeKo: `합평 협업 ${synergyScore}`,
      badgeEn: `Review sync ${synergyScore}`,
      workStatusBadgeKo: nearbyPeerCount > 0 ? `근처 협업 ${nearbyPeerCount}명` : "원고 검수·회의",
      workStatusBadgeEn: nearbyPeerCount > 0 ? `${nearbyPeerCount} nearby` : "Review & meeting",
      headlineKo: "원고 검수·회의 진행 중",
      headlineEn: "Review & meeting active",
      sublineKo: nearbyPeerCount > 0
        ? `근처 동료 ${nearbyPeerCount}명과 실시간 합평·대화가 연결되어 있어요.`
        : "원고 검수와 피드백을 진행하기 좋은 회의 구역이에요.",
      sublineEn: nearbyPeerCount > 0
        ? `Connected with ${nearbyPeerCount} nearby teammate(s) for live review.`
        : "Ready for manuscript review and live feedback.",
      recommendedZoneId: input.focusPhase === "break" ? "lounge" : "review",
      recommendedRoutineKo: "합평 후 결정 사항을 오늘 보드에 고정하고 5분 휴식으로 전환하세요.",
      recommendedRoutineEn: "Pin review decisions to Today Board and take a 5m break.",
      quickActionId: "open-review",
      quickActionLabelKo: "검수 보드 열기",
      quickActionLabelEn: "Open review board",
      zoneResonance,
      dimensions,
    });
  }

  if (
    (creativeRoom && (selfFocusing || input.selfSeated) && (focusedPeerCount > 0 || sameZonePeerCount > 0))
    || (selfFocusing && focusedPeerCount >= 2)
  ) {
    return Object.freeze({
      tempo: "creative-surge",
      tone: "rose",
      synergyScore,
      badgeKo: `공동 집중 ${synergyScore}`,
      badgeEn: `Team focus ${synergyScore}`,
      workStatusBadgeKo: `공동 작업 ${focusedPeerCount + 1}명`,
      workStatusBadgeEn: `${focusedPeerCount + 1} working`,
      headlineKo: "팀 공동 집중 작업 중",
      headlineEn: "Team deep-work session",
      sublineKo: `동료 ${focusedPeerCount + 1}명이 같은 흐름으로 원고 작업에 집중하고 있어요.`,
      sublineEn: `${focusedPeerCount + 1} creators are in deep focus on the episode.`,
      recommendedZoneId: "review",
      recommendedRoutineKo: "세션이 끝나면 검수실에서 동료들과 15분 합평을 진행해 보세요.",
      recommendedRoutineEn: "After this session, run a 15m sync in the Review Room.",
      quickActionId: input.focusActive ? "stop-focus" : "start-focus",
      quickActionLabelKo: input.focusActive ? "집중 세션 완료" : "집중 세션 시작",
      quickActionLabelEn: input.focusActive ? "Finish focus" : "Start focus",
      zoneResonance,
      dimensions,
    });
  }

  if (selfFocusing || (input.selfSeated && creativeRoom)) {
    return Object.freeze({
      tempo: "focused-flow",
      tone: "emerald",
      synergyScore,
      badgeKo: `집중 몰입 ${synergyScore}`,
      badgeEn: `Deep work ${synergyScore}`,
      workStatusBadgeKo: input.focusPhase === "break" ? "휴식 중" : "집중 작업 중",
      workStatusBadgeEn: input.focusPhase === "break" ? "Break" : "Deep work",
      headlineKo: "개인 집중 작업 중",
      headlineEn: "Focused work active",
      sublineKo: input.focusPhase === "break"
        ? "집중 세션 뒤 짧은 휴식 구간이에요. 눈과 손목을 풀어 주세요."
        : "알림을 낮추고 원고 작업에 집중하는 시간이에요.",
      sublineEn: input.focusPhase === "break"
        ? "Short recharge after focus. Rest your eyes and wrists."
        : "Notifications are softened for uninterrupted work.",
      recommendedZoneId: input.focusPhase === "break" ? "lounge" : "drawing",
      recommendedRoutineKo: input.focusPhase === "break"
        ? "짧은 스트레칭으로 손목과 어깨 긴장을 풀어 주세요."
        : "25분 집중 완주 후 라운지에서 5분 휴식을 권장해요.",
      recommendedRoutineEn: input.focusPhase === "break"
        ? "Stretch your wrists and shoulders during your break."
        : "Complete your 25m focus block, then take a 5m break.",
      quickActionId: input.focusActive ? "stop-focus" : "start-focus",
      quickActionLabelKo: input.focusActive ? "집중 마침" : "25분 집중 시작",
      quickActionLabelEn: input.focusActive ? "End focus" : "Start 25m focus",
      zoneResonance,
      dimensions,
    });
  }

  return Object.freeze({
    tempo: "serene",
    tone: sameZonePeerCount > 0 ? "sky" : "violet",
    synergyScore,
    badgeKo: `아틀리에 ${synergyScore}`,
    badgeEn: `Atelier ${synergyScore}`,
    workStatusBadgeKo: sameZonePeerCount > 0 ? `구역 내 ${sameZonePeerCount}명` : "작업 대기",
    workStatusBadgeEn: sameZonePeerCount > 0 ? `${sameZonePeerCount} in zone` : "Ready",
    headlineKo: "스튜디오 대기 중",
    headlineEn: "Studio ready",
    sublineKo: sameZonePeerCount > 0
      ? `같은 구역에 동료 ${sameZonePeerCount}명이 있어요. 다가가 인사하거나 자리에 앉아 보세요.`
      : "책상에 앉아 25분 집중 세션을 시작하거나 K 키로 작업실로 이동해 보세요.",
    sublineEn: sameZonePeerCount > 0
      ? `${sameZonePeerCount} teammate(s) in this zone. Walk over or take a desk.`
      : "Take a desk to start a 25m focus session, or press K to jump to a room.",
    recommendedZoneId: "drawing",
    recommendedRoutineKo: "작업석에 앉아 25분 집중 타이머를 시작해 보세요.",
    recommendedRoutineEn: "Take a desk and start a 25m focus timer.",
    quickActionId: nearbyPeerCount > 0 ? "join-huddle" : "start-focus",
    quickActionLabelKo: nearbyPeerCount > 0 ? "근처 대화 열기" : "25분 집중 시작",
    quickActionLabelEn: nearbyPeerCount > 0 ? "Open nearby chat" : "Start 25m focus",
    zoneResonance,
    dimensions,
  });
}
