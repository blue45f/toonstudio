import type { LucideIcon } from "lucide-react";

import type { StudioVirtualSpaceActivity } from "../studio-virtual-space-model";
import type { StudioUserStatus } from "../studio-virtual-space-user-status";
import type { SpaceProximityRangeMode } from "./space-proximity-media";

/** 도크에서 여는 작은 창. 한 번에 하나만 열린다. */
export type SpaceDockPopover = "me" | "react" | "more" | "work";

export interface SpaceDockMenuItem {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly icon: LucideIcon;
  readonly onSelect: () => void;
  /** 한 줄 설명. HUD 인벤토리의 오버플로 항목처럼 무엇을 여는지 알려 준다. */
  readonly descriptionKo?: string;
  readonly descriptionEn?: string;
  /** 지금 열려 있는 패널이면 true. 메뉴에서 '열림'으로 표시한다. */
  readonly active?: boolean;
  /** 비활성 사유. 있으면 버튼을 aria-disabled로 두고 사유를 함께 읽어 준다. */
  readonly disabledReasonKo?: string;
  readonly disabledReasonEn?: string;
  readonly shortcut?: string;
  readonly group: "work" | "space" | "help";
}

/**
 * 내 상태 6종. 활동(activity)은 요청 수신·집중 동작을 정하고, 사용자 상태(userStatus)는
 * '회의 중·휴식 중·자리 비움'처럼 이름표와 팀원 목록에 보이는 표시를 정한다.
 * 색 점과 글자를 함께 보여 줘 색만으로 상태를 전달하지 않는다.
 */
export type SpaceStatusId = "available" | "focused" | "reviewing" | "in-meeting" | "break" | "away";

export interface SpaceStatusOption {
  readonly id: SpaceStatusId;
  readonly activity: StudioVirtualSpaceActivity;
  /** null이면 명시 상태를 지워 활동 표시를 그대로 쓴다. */
  readonly userStatus: StudioUserStatus | null;
  readonly labelKo: string;
  readonly labelEn: string;
}

const AVAILABLE_OPTION: SpaceStatusOption = { id: "available", activity: "available", userStatus: null, labelKo: "대화 가능", labelEn: "Available" };

export const SPACE_STATUS_OPTIONS: readonly SpaceStatusOption[] = [
  AVAILABLE_OPTION,
  { id: "focused", activity: "focused", userStatus: null, labelKo: "집중 작업 중", labelEn: "Focusing" },
  { id: "reviewing", activity: "reviewing", userStatus: null, labelKo: "검토 중", labelEn: "Reviewing" },
  // 회의·휴식 중에도 함께 있는 팀원의 대화 요청은 받는다(진행 중인 함께하기를 끝내지 않는다).
  { id: "in-meeting", activity: "available", userStatus: "in-meeting", labelKo: "회의 중", labelEn: "In a meeting" },
  { id: "break", activity: "available", userStatus: "break", labelKo: "휴식 중", labelEn: "On a break" },
  { id: "away", activity: "away", userStatus: "away", labelKo: "자리 비움", labelEn: "Away" },
];

/** 명시 상태가 있으면 그것을, 없으면 활동으로 현재 상태를 고른다. */
export function spaceStatusOption(activity: StudioVirtualSpaceActivity, userStatus?: StudioUserStatus | null): SpaceStatusOption {
  if (userStatus && userStatus !== "available") {
    const explicit = SPACE_STATUS_OPTIONS.find((option) => option.userStatus === userStatus);
    if (explicit) return explicit;
  }
  return SPACE_STATUS_OPTIONS.find((option) => option.userStatus === null && option.activity === activity)
    ?? (activity === "away" ? SPACE_STATUS_OPTIONS[SPACE_STATUS_OPTIONS.length - 1] ?? AVAILABLE_OPTION : AVAILABLE_OPTION);
}

export function spaceStatusOptionById(id: SpaceStatusId): SpaceStatusOption {
  return SPACE_STATUS_OPTIONS.find((option) => option.id === id) ?? AVAILABLE_OPTION;
}

/**
 * 근접 음성 범위 3종(Gather Quiet 대응). 반경 수치는 space-proximity-media의 모드 표가 정본이고,
 * 여기서는 상태 메뉴에 보일 이름·설명만 둔다. 좁게·끄기를 고르면 이름표 상태 점이 빨간색으로 바뀐다.
 */
export interface SpaceProximityRangeOption {
  readonly id: SpaceProximityRangeMode;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly hintKo: string;
  readonly hintEn: string;
}

export const SPACE_PROXIMITY_RANGE_OPTIONS: readonly SpaceProximityRangeOption[] = [
  { id: "standard", labelKo: "기본 범위", labelEn: "Standard", hintKo: "다가가면 서서히 들려요", hintEn: "Voices fade in as people approach" },
  { id: "quiet", labelKo: "좁게 · 조용히", labelEn: "Quiet · nearby only", hintKo: "바로 옆 사람만 들려요", hintEn: "Only people right next to you" },
  { id: "off", labelKo: "근접 음성 끄기", labelEn: "Proximity voice off", hintKo: "근처 음성·영상을 연결하지 않아요", hintEn: "No nearby voice or video links" },
];

export function spaceProximityRangeOption(mode: SpaceProximityRangeMode): SpaceProximityRangeOption {
  return SPACE_PROXIMITY_RANGE_OPTIONS.find((option) => option.id === mode) ?? SPACE_PROXIMITY_RANGE_OPTIONS[0]!;
}

/**
 * 상태 자동 해제 시간(분, Gather SetStatusV2.statusExpiresAt 대응).
 * null이면 직접 바꿀 때까지 유지하고, 30·60이면 지정 시간 뒤 '대화 가능(available)'으로 자동 복귀한다.
 */
export type SpaceStatusExpiryMinutes = null | 30 | 60;

export interface SpaceStatusExpiryOption {
  readonly minutes: SpaceStatusExpiryMinutes;
  readonly labelKo: string;
  readonly labelEn: string;
}

export const SPACE_STATUS_EXPIRY_OPTIONS: readonly SpaceStatusExpiryOption[] = [
  { minutes: null, labelKo: "바꿀 때까지", labelEn: "Until changed" },
  { minutes: 30, labelKo: "30분 뒤 해제", labelEn: "Clear in 30m" },
  { minutes: 60, labelKo: "1시간 뒤 해제", labelEn: "Clear in 1h" },
];

/**
 * 상태 말풍선 긴급도 배지(oVice Set Customize Status · speechBubble.options 대응).
 * 일반(normal)·주의(warning)·긴급(urgent) 3단계를 지원한다.
 */
export type SpaceStatusUrgency = "normal" | "warning" | "urgent";

export interface SpaceStatusUrgencyOption {
  readonly id: SpaceStatusUrgency;
  readonly badge: string;
  readonly labelKo: string;
  readonly labelEn: string;
}

export const SPACE_STATUS_URGENCY_OPTIONS: readonly SpaceStatusUrgencyOption[] = [
  { id: "normal", badge: "", labelKo: "일반", labelEn: "Normal" },
  { id: "warning", badge: "⚠️", labelKo: "주의", labelEn: "Warning" },
  { id: "urgent", badge: "🚨", labelKo: "긴급 · 마감", labelEn: "Urgent" },
];

export const SPACE_STATUS_URGENCY_STORAGE_KEY = "toonspectrum:virtual-space-status-urgency:v1";

export function spaceStatusUrgencyOptionById(id: SpaceStatusUrgency): SpaceStatusUrgencyOption {
  return SPACE_STATUS_URGENCY_OPTIONS.find((item) => item.id === id) ?? SPACE_STATUS_URGENCY_OPTIONS[0]!;
}

export function readSpaceStatusUrgency(): SpaceStatusUrgency {
  try {
    const raw = globalThis.localStorage?.getItem(SPACE_STATUS_URGENCY_STORAGE_KEY);
    return raw === "warning" || raw === "urgent" ? raw : "normal";
  } catch {
    return "normal";
  }
}

export function writeSpaceStatusUrgency(urgency: SpaceStatusUrgency): void {
  try {
    globalThis.localStorage?.setItem(SPACE_STATUS_URGENCY_STORAGE_KEY, urgency);
  } catch { /* 저장소 비활성 환경에서는 메모리 상태만 유지한다 */ }
}

/**
 * 동행 펫(WorkAdventure LocalUserStore.companion / api/companion/list 대응).
 */
export type SpaceCompanionId = "none" | "cat" | "dog" | "owl" | "fox" | "robot";

export interface SpaceCompanionOption {
  readonly id: SpaceCompanionId;
  readonly emoji: string;
  readonly labelKo: string;
  readonly labelEn: string;
}

export const SPACE_COMPANION_OPTIONS: readonly SpaceCompanionOption[] = [
  { id: "none", emoji: "", labelKo: "동행 없음", labelEn: "No companion" },
  { id: "cat", emoji: "🐱", labelKo: "치즈냥", labelEn: "Cheese Cat" },
  { id: "dog", emoji: "🐶", labelKo: "시바견", labelEn: "Shiba Dog" },
  { id: "owl", emoji: "🦉", labelKo: "야근 부엉이", labelEn: "Night Owl" },
  { id: "fox", emoji: "🦊", labelKo: "스토리 여우", labelEn: "Story Fox" },
  { id: "robot", emoji: "🤖", labelKo: "어시스턴트 봇", labelEn: "Assistant Bot" },
];

export const SPACE_COMPANION_STORAGE_KEY = "toonspectrum:virtual-space-companion:v1";

export function spaceCompanionOptionById(id: SpaceCompanionId): SpaceCompanionOption {
  return SPACE_COMPANION_OPTIONS.find((item) => item.id === id) ?? SPACE_COMPANION_OPTIONS[0]!;
}

export function readSpaceCompanionId(): SpaceCompanionId {
  try {
    const raw = globalThis.localStorage?.getItem(SPACE_COMPANION_STORAGE_KEY);
    return SPACE_COMPANION_OPTIONS.some((item) => item.id === raw) ? (raw as SpaceCompanionId) : "none";
  } catch {
    return "none";
  }
}

export function writeSpaceCompanionId(id: SpaceCompanionId): void {
  try {
    globalThis.localStorage?.setItem(SPACE_COMPANION_STORAGE_KEY, id);
  } catch { /* 저장소 비활성 환경에서는 메모리 상태만 유지한다 */ }
}

/**
 * 근접 버블 진입 효과음 및 따라가기 요청 자동 거절(WorkAdventure LocalUserStore.bubbleSound / ignoreFollowRequests 대응).
 */
export type SpaceBubbleSoundMode = "ding" | "wobble" | "off";

export interface SpaceBubbleSoundOption {
  readonly id: SpaceBubbleSoundMode;
  readonly labelKo: string;
  readonly labelEn: string;
}

export const SPACE_BUBBLE_SOUND_OPTIONS: readonly SpaceBubbleSoundOption[] = [
  { id: "ding", labelKo: "맑은 벨 (Ding)", labelEn: "Ding chime" },
  { id: "wobble", labelKo: "물방울 (Wobble)", labelEn: "Wobble sound" },
  { id: "off", labelKo: "효과음 끄기", labelEn: "Sound off" },
];

export interface SpaceProximityPreferences {
  readonly ignoreFollowRequests: boolean;
  readonly bubbleSound: SpaceBubbleSoundMode;
  readonly krispNoiseSuppression?: boolean;
  readonly wherebyFloatingPip?: boolean;
}

export const SPACE_PROXIMITY_PREFS_STORAGE_KEY = "toonspectrum:virtual-space-proximity-prefs:v1";

export function readSpaceProximityPreferences(): SpaceProximityPreferences {
  try {
    const raw = globalThis.localStorage?.getItem(SPACE_PROXIMITY_PREFS_STORAGE_KEY);
    if (!raw) return { ignoreFollowRequests: false, bubbleSound: "ding", krispNoiseSuppression: true, wherebyFloatingPip: false };
    const parsed = JSON.parse(raw) as Partial<SpaceProximityPreferences> | null;
    const bubbleSound: SpaceBubbleSoundMode =
      parsed?.bubbleSound === "wobble" || parsed?.bubbleSound === "off" ? parsed.bubbleSound : "ding";
    return {
      ignoreFollowRequests: Boolean(parsed?.ignoreFollowRequests),
      bubbleSound,
      krispNoiseSuppression: parsed?.krispNoiseSuppression ?? true,
      wherebyFloatingPip: Boolean(parsed?.wherebyFloatingPip),
    };
  } catch {
    return { ignoreFollowRequests: false, bubbleSound: "ding", krispNoiseSuppression: true, wherebyFloatingPip: false };
  }
}

export function writeSpaceProximityPreferences(next: SpaceProximityPreferences): void {
  try {
    globalThis.localStorage?.setItem(SPACE_PROXIMITY_PREFS_STORAGE_KEY, JSON.stringify(next));
  } catch { /* 저장소 비활성 환경에서는 메모리 상태만 유지한다 */ }
}

/**
 * 아바타 상태 모자(Teemyco Status Hat 대응).
 */
export type SpaceStatusHatId = "none" | "focus-cap" | "question-hat" | "pair-crown" | "coffee-mug" | "on-air-mic";

export interface SpaceStatusHatOption {
  readonly id: SpaceStatusHatId;
  readonly emoji: string;
  readonly labelKo: string;
  readonly labelEn: string;
}

export const SPACE_STATUS_HAT_OPTIONS: readonly SpaceStatusHatOption[] = [
  { id: "none", emoji: "", labelKo: "모자 없음", labelEn: "No hat" },
  { id: "focus-cap", emoji: "🧢", labelKo: "집중 캡", labelEn: "Focus Cap" },
  { id: "question-hat", emoji: "👒", labelKo: "질문 환영", labelEn: "Open for Questions" },
  { id: "pair-crown", emoji: "👑", labelKo: "페어 작화", labelEn: "Pair Drawing" },
  { id: "coffee-mug", emoji: "☕", labelKo: "커피 타임", labelEn: "Coffee Break" },
  { id: "on-air-mic", emoji: "🎙️", labelKo: "녹음·방송 중", labelEn: "On-Air Recording" },
];

export const SPACE_STATUS_HAT_STORAGE_KEY = "toonspectrum:virtual-space-status-hat:v1";

export function spaceStatusHatOptionById(id: SpaceStatusHatId): SpaceStatusHatOption {
  return SPACE_STATUS_HAT_OPTIONS.find((item) => item.id === id) ?? SPACE_STATUS_HAT_OPTIONS[0]!;
}

export function readSpaceStatusHatId(): SpaceStatusHatId {
  try {
    const raw = globalThis.localStorage?.getItem(SPACE_STATUS_HAT_STORAGE_KEY);
    return SPACE_STATUS_HAT_OPTIONS.some((item) => item.id === raw) ? (raw as SpaceStatusHatId) : "none";
  } catch {
    return "none";
  }
}

export function writeSpaceStatusHatId(id: SpaceStatusHatId): void {
  try {
    globalThis.localStorage?.setItem(SPACE_STATUS_HAT_STORAGE_KEY, id);
  } catch { /* 저장소 비활성 환경에서는 메모리 상태만 유지한다 */ }
}

/**
 * 실행 중인 창작 앱 표시(Tandem / Cosmos Video True Status 대응).
 */
export type SpaceActiveDccId = "none" | "clip-studio" | "blender-3d" | "photoshop" | "storyboard";

export interface SpaceActiveDccOption {
  readonly id: SpaceActiveDccId;
  readonly badge: string;
  readonly labelKo: string;
  readonly labelEn: string;
}

export const SPACE_ACTIVE_DCC_OPTIONS: readonly SpaceActiveDccOption[] = [
  { id: "none", badge: "", labelKo: "작업 툴 숨김", labelEn: "Hide active app" },
  { id: "clip-studio", badge: "🎨", labelKo: "클립스튜디오 EX", labelEn: "Clip Studio Paint" },
  { id: "blender-3d", badge: "🧊", labelKo: "블렌더·스케치업 3D", labelEn: "Blender & SketchUp" },
  { id: "photoshop", badge: "✨", labelKo: "포토샵·후보정", labelEn: "Photoshop & LUT" },
  { id: "storyboard", badge: "📝", labelKo: "콘티·대본", labelEn: "Storyboard & Script" },
];

export const SPACE_ACTIVE_DCC_STORAGE_KEY = "toonspectrum:virtual-space-active-dcc:v1";

export function spaceActiveDccOptionById(id: SpaceActiveDccId): SpaceActiveDccOption {
  return SPACE_ACTIVE_DCC_OPTIONS.find((item) => item.id === id) ?? SPACE_ACTIVE_DCC_OPTIONS[0]!;
}

export function readSpaceActiveDccId(): SpaceActiveDccId {
  try {
    const raw = globalThis.localStorage?.getItem(SPACE_ACTIVE_DCC_STORAGE_KEY);
    return SPACE_ACTIVE_DCC_OPTIONS.some((item) => item.id === raw) ? (raw as SpaceActiveDccId) : "none";
  } catch {
    return "none";
  }
}

export function writeSpaceActiveDccId(id: SpaceActiveDccId): void {
  try {
    globalThis.localStorage?.setItem(SPACE_ACTIVE_DCC_STORAGE_KEY, id);
  } catch { /* 저장소 비활성 환경에서는 메모리 상태만 유지한다 */ }
}
