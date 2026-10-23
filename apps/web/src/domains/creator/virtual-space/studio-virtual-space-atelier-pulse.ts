import type { StudioVirtualSpaceActivity } from "./studio-virtual-space-model";
import type { StudioUserStatus } from "./studio-virtual-space-user-status";

/**
 * Synesthetic Story-Forge & Atelier Pulse 2.0 (공감각적 웹툰 창작 아틀리에 공명 엔진).
 *
 * 게더타운식 단순 화상 통화 오피스를 넘어, 웹툰 스튜디오의 공간(구역)·작업 호흡(집중 세션)·
 * 동료들의 실시간 활동 밀도를 하나의 '아틀리에 맥박(Atelier Pulse)'으로 합성하는 순수 도메인 모델이다.
 *
 * - `tempo`: 현재 스튜디오의 창작 리듬 4단계
 *   - `serene`: 고요한 준비·탐색 호흡
 *   - `focused-flow`: 개인 딥워크·집중 타이머 가동 중
 *   - `creative-surge`: 원고·배경·콘티 제작 구역에서 다수가 몰입 중
 *   - `ensemble-sync`: 리뷰·합평·회의·동료 근접 협업이 활발한 앙상블 상태
 * - `synergyScore`: 0~200 범위의 공감각 스튜디오 활성 지수 (기본 아틀리에 베이스 116점에서 시작해
 *   구역 적합성·집중 세션·동료 공명·시간대 몰입도에 따라 최대 200점까지 상승)
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

export type StudioAtelierOmniTier =
  | "seed"
  | "flow"
  | "surge"
  | "apex-quantum";

/** 가상 오피스 7대 핵심 역량 지수(각 0~400점). */
export interface StudioAtelierPulseDimensions {
  /** 가상 오피스 구역·책상 정착 및 공간 활용도 (0~400) */
  readonly officePresence: number;
  /** 25분 포모도로 딥워크·집중 몰입도 (0~400) */
  readonly deepWorkFlow: number;
  /** 실시간 원고 합평·회의·허들 협업 밀도 (0~400) */
  readonly reviewCollaboration: number;
  /** 오피스 웰니스(체조·요가·스트레칭·휴식 균형) 활력도 (0~400) */
  readonly wellnessVitality: number;
  /** 스튜디오 테마·물리·캐릭터 코디 조화 완성도 (0~400) */
  readonly atelierAesthetics: number;
  /** 자율 오피스 루틴·맥락 전환·지속 몰입 리듬 지수 (0~400) */
  readonly autonomousRhythm: number;
  /** 에피소드 마감·콘티·작화 추진 가속도 (0~400) */
  readonly creativeVelocity: number;
}

export interface StudioAtelierPulseSnapshot {
  readonly tempo: StudioAtelierPulseTempo;
  readonly tone: StudioAtelierPulseTone;
  readonly synergyScore: number;
  /** 기존 200점 만점 대비 10배 확장된 하이퍼 오피스 아틀리에 총점 (0~2,000). */
  readonly hyperScore: number;
  /** 200% 추가 고도화된 옴니 아틀리에 4.0 총점 (0~4,000, 기본 200점 대비 20.0x). */
  readonly omniScore: number;
  /** 궁극의 퀀텀 아틀리에 5.0 총점 (0~10,000, 기본 200점 대비 50.0x). */
  readonly quantumScore: number;
  /** 옴니 아틀리에 등급 (seed | flow | surge | apex-quantum). */
  readonly omniTier: StudioAtelierOmniTier;
  /** 시너지 배율 (1.0x ~ 10.0x). */
  readonly comboMultiplier: number;
  /** 옴니 시너지 배율 (2.0x ~ 20.0x). */
  readonly omniMultiplier: number;
  /** 퀀텀 시너지 배율 (5.0x ~ 50.0x). */
  readonly quantumMultiplier: number;
  readonly badgeKo: string;
  readonly badgeEn: string;
  readonly hyperBadgeKo: string;
  readonly hyperBadgeEn: string;
  readonly omniBadgeKo: string;
  readonly omniBadgeEn: string;
  readonly quantumBadgeKo: string;
  readonly quantumBadgeEn: string;
  /** 게임형 점수 대신 HUD에 바로 표시할 실무 협업 상태 배지. */
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

function clampDimension400(value: number): number {
  if (!Number.isFinite(value)) return 240;
  return Math.max(0, Math.min(400, Math.round(value)));
}

function isCreativeZone(roomId: string | null): boolean {
  if (!roomId) return false;
  const normalized = roomId.toLowerCase();
  if (CREATIVE_ZONE_IDS.has(normalized)) return true;
  return (
    normalized.includes("draw") ||
    normalized.includes("write") ||
    normalized.includes("story") ||
    normalized.includes("studio") ||
    normalized.includes("desk") ||
    normalized.includes("booth")
  );
}

function isSyncZone(roomId: string | null): boolean {
  if (!roomId) return false;
  const normalized = roomId.toLowerCase();
  if (REVIEW_OR_SYNC_ZONE_IDS.has(normalized)) return true;
  return (
    normalized.includes("review") ||
    normalized.includes("meet") ||
    normalized.includes("gallery") ||
    normalized.includes("lounge") ||
    normalized.includes("cafe")
  );
}

/**
 * 현재 공간 맥락과 본인의 자세·집중 상태·주변 동료 분포를 종합하여
 * 아틀리에 맥박(Atelier Pulse) 스냅샷을 계산한다.
 */
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
    if (peer.activity === "focused" || peer.userStatus === "focusing") {
      focusedPeerCount += 1;
    }
    if (
      peer.activity === "reviewing" ||
      peer.userStatus === "in-meeting"
    ) {
      reviewingPeerCount += 1;
    }
  }

  const zoneResonance: StudioAtelierZoneResonance = Object.freeze({
    zoneId: roomId,
    sameZonePeerCount,
    nearbyPeerCount,
    focusedPeerCount,
    reviewingPeerCount,
  });

  const selfFocusing =
    input.focusActive ||
    input.selfActivity === "focused" ||
    input.selfUserStatus === "focusing";
  const selfReviewingOrMeeting =
    input.selfActivity === "reviewing" ||
    input.selfUserStatus === "in-meeting" ||
    Boolean(input.spotlightActive);
  const creativeRoom = isCreativeZone(roomId);
  const syncRoom = isSyncZone(roomId) || input.privateZone;

  // 기본 아틀리에 베이스 점수 120점에서 시작해 상태·공간·협업 시너지로 최대 200점까지 확장
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
  const hyperScore = synergyScore * 10;
  const omniScore = hyperScore * 2;
  const quantumScore = synergyScore * 50;
  const comboMultiplier = Number((hyperScore / 200).toFixed(1));
  const omniMultiplier = Number((omniScore / 200).toFixed(1));
  const quantumMultiplier = Number((quantumScore / 200).toFixed(1));
  const omniTier: StudioAtelierOmniTier =
    omniScore >= 3600
      ? "apex-quantum"
      : omniScore >= 3200
        ? "surge"
        : omniScore >= 2600
          ? "flow"
          : "seed";
  const dimensions: StudioAtelierPulseDimensions = Object.freeze({
    officePresence: clampDimension400(240 + (roomId ? 40 : 0) + (input.selfSeated ? 60 : 0) + Math.min(60, sameZonePeerCount * 20)),
    deepWorkFlow: clampDimension400(220 + (selfFocusing ? 110 : 0) + (creativeRoom ? 35 : 0) + Math.min(35, focusedPeerCount * 18)),
    reviewCollaboration: clampDimension400(220 + (selfReviewingOrMeeting ? 100 : 0) + (syncRoom ? 40 : 0) + Math.min(40, (nearbyPeerCount + reviewingPeerCount) * 20)),
    wellnessVitality: clampDimension400(input.focusPhase === "break" ? 400 : 310 + (input.selfSeated ? 45 : 30) + (sameZonePeerCount > 0 ? 45 : 25)),
    atelierAesthetics: clampDimension400(320 + (creativeRoom || syncRoom ? 50 : 25) + (input.selfSeated || selfFocusing || selfReviewingOrMeeting ? 30 : 15)),
    autonomousRhythm: clampDimension400(260 + (input.selfSeated ? 45 : 0) + (selfFocusing || selfReviewingOrMeeting ? 55 : 0) + Math.min(40, (sameZonePeerCount + nearbyPeerCount) * 20)),
    creativeVelocity: clampDimension400(250 + (creativeRoom || syncRoom ? 55 : 20) + (selfFocusing || selfReviewingOrMeeting ? 55 : 0) + Math.min(40, (focusedPeerCount + reviewingPeerCount) * 20)),
  });

  // 1) Ensemble Sync: 회의·검토·스포트라이트 또는 근처 동료와 합평 공명 중
  if (
    selfReviewingOrMeeting ||
    (nearbyPeerCount > 0 && (syncRoom || reviewingPeerCount > 0))
  ) {
    return Object.freeze({
      tempo: "ensemble-sync",
      tone: "amber",
      synergyScore,
      hyperScore,
      omniScore,
      quantumScore,
      omniTier,
      comboMultiplier,
      omniMultiplier,
      quantumMultiplier,
      badgeKo: `앙상블 공명 ${synergyScore}`,
      badgeEn: `Ensemble ${synergyScore}`,
      hyperBadgeKo: `앙상블 오피스 ${hyperScore.toLocaleString("en-US")}pt`,
      hyperBadgeEn: `Ensemble Office ${hyperScore.toLocaleString("en-US")}pt`,
      omniBadgeKo: `옴니 앙상블 ${omniScore.toLocaleString("en-US")}pt (${omniMultiplier}x)`,
      omniBadgeEn: `Omni Ensemble ${omniScore.toLocaleString("en-US")}pt (${omniMultiplier}x)`,
      quantumBadgeKo: `퀀텀 앙상블 ${quantumScore.toLocaleString("en-US")}pt (${quantumMultiplier}x)`,
      quantumBadgeEn: `Quantum Ensemble ${quantumScore.toLocaleString("en-US")}pt (${quantumMultiplier}x)`,
      workStatusBadgeKo: nearbyPeerCount > 0 ? `근처 협업 ${nearbyPeerCount}명` : "원고 검수·회의",
      workStatusBadgeEn: nearbyPeerCount > 0 ? `${nearbyPeerCount} nearby` : "Review & meeting",
      headlineKo: "크리에이티브 앙상블 동기화 중",
      headlineEn: "Creative ensemble in sync",
      sublineKo:
        nearbyPeerCount > 0
          ? `근처 동료 ${nearbyPeerCount}명과 실시간 합평·대화 호흡이 연결되어 있어요.`
          : "원고 검수·라이브 피드백에 최적화된 아틀리에 채널이 열려 있어요.",
      sublineEn:
        nearbyPeerCount > 0
          ? `Connected with ${nearbyPeerCount} nearby teammate(s) for live review and dialogue.`
          : "Atelier channel tuned for manuscript review and live feedback.",
      recommendedZoneId: input.focusPhase === "break" ? "lounge" : "review",
      recommendedRoutineKo: "합평 후 결정 사항을 오늘 보드에 고정하고 5분 스트레칭으로 전환하세요.",
      recommendedRoutineEn: "Pin review decisions to Today Board and transition with a 5m stretch.",
      quickActionId: "open-review",
      quickActionLabelKo: "검수 보드 열기",
      quickActionLabelEn: "Open review board",
      zoneResonance,
      dimensions,
    });
  }

  // 2) Creative Surge: 창작 구역에서 다수가 집중하거나 착석 + 동료 집중 공명
  if (
    (creativeRoom && (selfFocusing || input.selfSeated) && (focusedPeerCount > 0 || sameZonePeerCount > 0)) ||
    (selfFocusing && focusedPeerCount >= 2)
  ) {
    return Object.freeze({
      tempo: "creative-surge",
      tone: "rose",
      synergyScore,
      hyperScore,
      omniScore,
      quantumScore,
      omniTier,
      comboMultiplier,
      omniMultiplier,
      quantumMultiplier,
      badgeKo: `창작 파동 ${synergyScore}`,
      badgeEn: `Surge ${synergyScore}`,
      hyperBadgeKo: `하이퍼 포지 ${hyperScore.toLocaleString("en-US")}pt`,
      hyperBadgeEn: `Hyper Forge ${hyperScore.toLocaleString("en-US")}pt`,
      omniBadgeKo: `옴니 포지 ${omniScore.toLocaleString("en-US")}pt (${omniMultiplier}x)`,
      omniBadgeEn: `Omni Forge ${omniScore.toLocaleString("en-US")}pt (${omniMultiplier}x)`,
      quantumBadgeKo: `퀀텀 포지 ${quantumScore.toLocaleString("en-US")}pt (${quantumMultiplier}x)`,
      quantumBadgeEn: `Quantum Forge ${quantumScore.toLocaleString("en-US")}pt (${quantumMultiplier}x)`,
      workStatusBadgeKo: `공동 작업 ${focusedPeerCount + 1}명`,
      workStatusBadgeEn: `${focusedPeerCount + 1} working`,
      headlineKo: "스토리포지 창작 파동 최고조",
      headlineEn: "Story-Forge creative surge",
      sublineKo: `동료 ${focusedPeerCount + 1}명이 함께 몰입하며 마스터피스 원고를 빚어내고 있어요.`,
      sublineEn: `${focusedPeerCount + 1} creators are in deep flow forging the episode together.`,
      recommendedZoneId: "review",
      recommendedRoutineKo: "세션 완료 후 검수룸에서 동료들과 15분 퀵 합평을 진행해 보세요.",
      recommendedRoutineEn: "After this session, run a 15m quick sync in the Review Room.",
      quickActionId: input.focusActive ? "stop-focus" : "start-focus",
      quickActionLabelKo: input.focusActive ? "집중 세션 완료" : "딥워크 부스트",
      quickActionLabelEn: input.focusActive ? "Finish focus" : "Boost deep work",
      zoneResonance,
      dimensions,
    });
  }

  // 3) Focused Flow: 개인 집중 타이머 또는 책상 착석 몰입
  if (selfFocusing || (input.selfSeated && creativeRoom)) {
    return Object.freeze({
      tempo: "focused-flow",
      tone: "emerald",
      synergyScore,
      hyperScore,
      omniScore,
      quantumScore,
      omniTier,
      comboMultiplier,
      omniMultiplier,
      quantumMultiplier,
      badgeKo: `집중 몰입 ${synergyScore}`,
      badgeEn: `Flow ${synergyScore}`,
      hyperBadgeKo: `딥워크 오피스 ${hyperScore.toLocaleString("en-US")}pt`,
      hyperBadgeEn: `Deep-Work Office ${hyperScore.toLocaleString("en-US")}pt`,
      omniBadgeKo: `옴니 플로우 ${omniScore.toLocaleString("en-US")}pt (${omniMultiplier}x)`,
      omniBadgeEn: `Omni Flow ${omniScore.toLocaleString("en-US")}pt (${omniMultiplier}x)`,
      quantumBadgeKo: `퀀텀 플로우 ${quantumScore.toLocaleString("en-US")}pt (${quantumMultiplier}x)`,
      quantumBadgeEn: `Quantum Flow ${quantumScore.toLocaleString("en-US")}pt (${quantumMultiplier}x)`,
      workStatusBadgeKo: input.focusPhase === "break" ? "휴식·리프레시" : "집중 작업 중",
      workStatusBadgeEn: input.focusPhase === "break" ? "Break" : "Deep work",
      headlineKo: "아틀리에 딥워크 몰입 기류",
      headlineEn: "Atelier deep-work flow",
      sublineKo:
        input.focusPhase === "break"
          ? "집중 호흡 뒤 짧은 재충전 구간이에요. 눈과 손목을 풀어 주세요."
          : "방해 알림을 낮추고 오롯이 선과 서사에 집중하는 시간이에요.",
      sublineEn:
        input.focusPhase === "break"
          ? "Short recharge after deep focus. Rest your eyes and wrists."
          : "Notifications are softened so you can stay immersed in line and story.",
      recommendedZoneId: input.focusPhase === "break" ? "lounge" : "drawing",
      recommendedRoutineKo:
        input.focusPhase === "break"
          ? "아침 체조·요가 이모트로 손목과 어깨 긴장을 풀어 주세요."
          : "25분 딥워크 완주 후 라운지에서 5분 리프레시 루틴을 권장해요.",
      recommendedRoutineEn:
        input.focusPhase === "break"
          ? "Release wrist and shoulder tension with morning calisthenics or yoga."
          : "Complete your 25m deep-work block, then take a 5m lounge refresh.",
      quickActionId: input.focusActive ? "stop-focus" : "start-focus",
      quickActionLabelKo: input.focusActive ? "집중 마침" : "25분 집중 시작",
      quickActionLabelEn: input.focusActive ? "End focus" : "Start 25m focus",
      zoneResonance,
      dimensions,
    });
  }

  // 4) Serene: 기본 평온·탐색 상태
  return Object.freeze({
    tempo: "serene",
    tone: sameZonePeerCount > 0 ? "sky" : "violet",
    synergyScore,
    hyperScore,
    omniScore,
    quantumScore,
    omniTier,
    comboMultiplier,
    omniMultiplier,
    quantumMultiplier,
    badgeKo: `아틀리에 ${synergyScore}`,
    badgeEn: `Atelier ${synergyScore}`,
    hyperBadgeKo: `아틀리에 오피스 ${hyperScore.toLocaleString("en-US")}pt`,
    hyperBadgeEn: `Atelier Office ${hyperScore.toLocaleString("en-US")}pt`,
    omniBadgeKo: `옴니 아틀리에 ${omniScore.toLocaleString("en-US")}pt (${omniMultiplier}x)`,
    omniBadgeEn: `Omni Atelier ${omniScore.toLocaleString("en-US")}pt (${omniMultiplier}x)`,
    quantumBadgeKo: `퀀텀 아틀리에 ${quantumScore.toLocaleString("en-US")}pt (${quantumMultiplier}x)`,
    quantumBadgeEn: `Quantum Atelier ${quantumScore.toLocaleString("en-US")}pt (${quantumMultiplier}x)`,
    workStatusBadgeKo: sameZonePeerCount > 0 ? `구역 내 ${sameZonePeerCount}명` : "작업 대기",
    workStatusBadgeEn: sameZonePeerCount > 0 ? `${sameZonePeerCount} in zone` : "Ready",
    headlineKo: "공감각 아틀리에 탐색 호흡",
    headlineEn: "Synesthetic atelier exploration",
    sublineKo:
      sameZonePeerCount > 0
        ? `같은 구역에 동료 ${sameZonePeerCount}명이 있어요. 다가가 인사하거나 작업 자리에 앉아 보세요.`
        : "책상에 앉아 25분 딥워크를 시작하거나 K 키로 원하는 작업실로 이동해 보세요.",
    sublineEn:
      sameZonePeerCount > 0
        ? `${sameZonePeerCount} teammate(s) in this zone. Walk over to wave or take a desk.`
        : "Take a desk to start a 25m deep-work pulse, or press K to jump to any room.",
    recommendedZoneId: "drawing",
    recommendedRoutineKo: "선호 작업석에 착석해 25분 집중 타이머와 로파이 사운드스케이프를 켜 보세요.",
    recommendedRoutineEn: "Take your preferred desk and start a 25m focus timer with lo-fi soundscape.",
    quickActionId: nearbyPeerCount > 0 ? "join-huddle" : "start-focus",
    quickActionLabelKo: nearbyPeerCount > 0 ? "근처 대화 열기" : "집중 펄스 시작",
    quickActionLabelEn: nearbyPeerCount > 0 ? "Open nearby chat" : "Start focus pulse",
    zoneResonance,
    dimensions,
  });
}
