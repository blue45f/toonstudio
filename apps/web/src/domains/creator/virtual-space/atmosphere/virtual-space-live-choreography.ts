import type { StudioEmotionKind } from "../studio-virtual-space-character-emotions";
import type { StudioVirtualSpaceActivity } from "../studio-virtual-space-model";
import type { StudioUserStatus } from "../studio-virtual-space-user-status";
import {
  STUDIO_CHARACTER_BODY_SCALE_LOCK,
  type StudioCharacterBodyScaleLock,
} from "./virtual-space-daylight-shadow";
import type { StudioMinimapLandmarkId } from "./virtual-space-minimap-camera";

/**
 * 가상 스튜디오 실시간 작업 상태 → 캐릭터 동작·상체 제스처·말풍선 매핑기.
 *
 * - 실제 스튜디오 작업 상태 5종(`line-art | coloring | bg3d | deadline-qa | idle-break`)을
 *   캐릭터 동작 4종(`타블렛 작화 · 커피 휴식 · 회의실 착석 · 마감 환호`)과
 *   상체 제스처·말풍선·권장 구역으로 매핑한다.
 * - 몸 크기 변형(`scaleX`, `scaleY`)은 전 구간 0%(`1.0` 고정)으로 유지한다.
 * - 순수 메모리 상태 기계이며 브라우저 키-값 저장소를 직접 호출하지 않는다.
 */

/** 실제 스튜디오 작업 상태 5종. */
export type StudioLiveWorkState =
  | "line-art"
  | "coloring"
  | "bg3d"
  | "deadline-qa"
  | "idle-break";

/** 가상 스튜디오 캐릭터 대표 동작 4종. */
export type StudioLiveCharacterAction =
  | "tablet-drawing"
  | "coffee-break"
  | "meeting-seated"
  | "deadline-cheer";

/** 상체 미세 제스처 종류(몸 크기 변형 없이 팔·손·고개 움직임만 표현). */
export type StudioLiveUpperBodyGesture =
  | "pen-stroke-steady"
  | "brush-blend-sweep"
  | "orbit-review-nod"
  | "qa-check-nod"
  | "cheer-fist-pump"
  | "coffee-sip-steam";

/** 캐릭터 착석·기립 자세. */
export type StudioLivePostureKind =
  | "seated-desk"
  | "seated-meeting"
  | "standing-celebrate"
  | "seated-lounge";

/** 마감 QA 세부 단계(검수 중 vs 통과 환호). */
export type StudioDeadlineQaStage = "cleared" | "checking";

export const STUDIO_LIVE_WORK_STATES: readonly StudioLiveWorkState[] = Object.freeze([
  "line-art",
  "coloring",
  "bg3d",
  "deadline-qa",
  "idle-break",
]);

export const STUDIO_LIVE_CHARACTER_ACTIONS: readonly StudioLiveCharacterAction[] = Object.freeze([
  "tablet-drawing",
  "coffee-break",
  "meeting-seated",
  "deadline-cheer",
]);

/** 작업 상태 전이 블렌딩 기본 길이(ms). */
export const STUDIO_LIVE_CHOREOGRAPHY_TRANSITION_MS = 280;

/** 말풍선 사용자 커스텀 문구 최대 길이. */
export const STUDIO_LIVE_BUBBLE_MAX_LENGTH = 48;

/** 작업 상태별 정적 안무 매핑 결과. */
export interface StudioLiveChoreographyPreset {
  readonly workState: StudioLiveWorkState;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly action: StudioLiveCharacterAction;
  readonly actionLabelKo: string;
  readonly actionLabelEn: string;
  readonly upperBodyGesture: StudioLiveUpperBodyGesture;
  readonly posture: StudioLivePostureKind;
  readonly preferredLandmarkId: StudioMinimapLandmarkId;
  readonly bubbleKo: string;
  readonly bubbleEn: string;
  readonly bubbleIcon: string;
  readonly presenceActivity: StudioVirtualSpaceActivity;
  readonly userStatus: StudioUserStatus;
  readonly emotion: StudioEmotionKind;
  readonly bodyScale: StudioCharacterBodyScaleLock;
  readonly scaleX: 1;
  readonly scaleY: 1;
}

/** 실시간 작업 상태 연동 모션 상태. */
export interface StudioLiveChoreographyState {
  readonly workState: StudioLiveWorkState;
  readonly previousWorkState: StudioLiveWorkState | null;
  readonly deadlineQaStage: StudioDeadlineQaStage;
  readonly customBubble: string | null;
  readonly changedAtMs: number;
  readonly transitionDurationMs: number;
  readonly transitionCount: number;
}

/** 특정 시각의 상체 제스처·말풍선 샘플(몸 크기 변형 0 보장). */
export interface StudioLiveUpperBodyPose {
  readonly workState: StudioLiveWorkState;
  readonly action: StudioLiveCharacterAction;
  readonly gesture: StudioLiveUpperBodyGesture;
  readonly posture: StudioLivePostureKind;
  /** 전이 진행도(0~1). `reducedMotion`이면 즉시 1. */
  readonly transitionBlend: number;
  /** 고개 끄덕임/기울임 각도(도, -4~+4). */
  readonly headTiltDeg: number;
  /** 상체 어깨 미세 회전(도, -5~+5). */
  readonly shoulderYawDeg: number;
  /** 주 작업 손 X 오프셋(px). */
  readonly dominantHandOffsetX: number;
  /** 주 작업 손 Y 오프셋(px). */
  readonly dominantHandOffsetY: number;
  /** 팔 들어올림 각도(도, 커피잔·환호 제스처). */
  readonly armRaiseDeg: number;
  /** 커피 김 애니메이션 위상(0~1, 커피 휴식 외 0). */
  readonly steamPhase: number;
  readonly bubbleTextKo: string;
  readonly bubbleTextEn: string;
  readonly bubbleIcon: string;
  readonly bubbleVisible: boolean;
  /** 본체 X 스케일 — 항상 1.0 불변. */
  readonly scaleX: 1;
  /** 본체 Y 스케일 — 항상 1.0 불변. */
  readonly scaleY: 1;
}

export interface StudioLiveChoreographyResolveOptions {
  readonly deadlineQaStage?: StudioDeadlineQaStage;
  readonly customBubble?: string | null;
}

export interface StudioLiveWorkStateTransitionOptions extends StudioLiveChoreographyResolveOptions {
  /** 짧은 상태 깜빡임 방지 최소 유지 시간(ms). 기본 0(즉시 전환). */
  readonly minHoldMs?: number;
  readonly transitionDurationMs?: number;
}

const WORK_STATE_SET: ReadonlySet<string> = new Set(STUDIO_LIVE_WORK_STATES);

const ACTION_LABELS: Readonly<Record<StudioLiveCharacterAction, { readonly ko: string; readonly en: string }>> = Object.freeze({
  "tablet-drawing": Object.freeze({ ko: "타블렛 작화", en: "Tablet drawing" }),
  "coffee-break": Object.freeze({ ko: "커피 휴식", en: "Coffee break" }),
  "meeting-seated": Object.freeze({ ko: "회의실 착석", en: "Seated in meeting" }),
  "deadline-cheer": Object.freeze({ ko: "마감 환호", en: "Deadline cheer" }),
});

function createPreset(
  preset: Omit<StudioLiveChoreographyPreset, "actionLabelKo" | "actionLabelEn" | "bodyScale" | "scaleX" | "scaleY">,
): StudioLiveChoreographyPreset {
  const actionLabel = ACTION_LABELS[preset.action];
  return Object.freeze({
    ...preset,
    actionLabelKo: actionLabel.ko,
    actionLabelEn: actionLabel.en,
    bodyScale: STUDIO_CHARACTER_BODY_SCALE_LOCK,
    scaleX: STUDIO_CHARACTER_BODY_SCALE_LOCK.scaleX,
    scaleY: STUDIO_CHARACTER_BODY_SCALE_LOCK.scaleY,
  });
}

const WORK_STATE_PRESETS: Readonly<Record<StudioLiveWorkState, StudioLiveChoreographyPreset>> = Object.freeze({
  "line-art": createPreset({
    workState: "line-art",
    labelKo: "선화 작화",
    labelEn: "Line art",
    action: "tablet-drawing",
    upperBodyGesture: "pen-stroke-steady",
    posture: "seated-desk",
    preferredLandmarkId: "workroom",
    bubbleKo: "선화 펜선 작업 중",
    bubbleEn: "Inking line art",
    bubbleIcon: "✒️",
    presenceActivity: "focused",
    userStatus: "focusing",
    emotion: "focus",
  }),
  coloring: createPreset({
    workState: "coloring",
    labelKo: "채색·명암",
    labelEn: "Coloring",
    action: "tablet-drawing",
    upperBodyGesture: "brush-blend-sweep",
    posture: "seated-desk",
    preferredLandmarkId: "workroom",
    bubbleKo: "채색과 명암 다듬는 중",
    bubbleEn: "Coloring and shading",
    bubbleIcon: "🎨",
    presenceActivity: "focused",
    userStatus: "focusing",
    emotion: "focus",
  }),
  bg3d: createPreset({
    workState: "bg3d",
    labelKo: "3D 배경 협의",
    labelEn: "3D background",
    action: "meeting-seated",
    upperBodyGesture: "orbit-review-nod",
    posture: "seated-meeting",
    preferredLandmarkId: "meeting-room",
    bubbleKo: "회의실에서 3D 배경 구도 점검 중",
    bubbleEn: "Reviewing 3D scene in meeting room",
    bubbleIcon: "🏛️",
    presenceActivity: "reviewing",
    userStatus: "in-meeting",
    emotion: "focus",
  }),
  "deadline-qa": createPreset({
    workState: "deadline-qa",
    labelKo: "마감 QA",
    labelEn: "Deadline QA",
    action: "deadline-cheer",
    upperBodyGesture: "cheer-fist-pump",
    posture: "standing-celebrate",
    preferredLandmarkId: "outsourcing-plaza",
    bubbleKo: "마감 검수 통과! 원고 완성",
    bubbleEn: "Deadline QA passed! Episode ready",
    bubbleIcon: "🎉",
    presenceActivity: "available",
    userStatus: "available",
    emotion: "joy",
  }),
  "idle-break": createPreset({
    workState: "idle-break",
    labelKo: "커피 휴식",
    labelEn: "Idle break",
    action: "coffee-break",
    upperBodyGesture: "coffee-sip-steam",
    posture: "seated-lounge",
    preferredLandmarkId: "lounge",
    bubbleKo: "휴게실에서 커피 한 잔 쉬는 중",
    bubbleEn: "Taking a coffee break in lounge",
    bubbleIcon: "☕",
    presenceActivity: "away",
    userStatus: "break",
    emotion: "neutral",
  }),
});

const DEADLINE_QA_CHECKING_PRESET: StudioLiveChoreographyPreset = createPreset({
  workState: "deadline-qa",
  labelKo: "마감 QA 검수",
  labelEn: "Deadline QA check",
  action: "meeting-seated",
  upperBodyGesture: "qa-check-nod",
  posture: "seated-meeting",
  preferredLandmarkId: "meeting-room",
  bubbleKo: "마감 체크리스트 최종 확인 중",
  bubbleEn: "Checking deadline QA list",
  bubbleIcon: "📋",
  presenceActivity: "reviewing",
  userStatus: "in-meeting",
  emotion: "focus",
});

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function stripControlChars(input: string): string {
  let out = "";
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    if (code >= 0x20 && code !== 0x7f) {
      out += input[index];
    } else if (code === 0x09 || code === 0x0a || code === 0x0d) {
      out += " ";
    }
  }
  return out;
}

/** 유효한 실제 스튜디오 작업 상태인지 판별한다. */
export function isStudioLiveWorkState(value: unknown): value is StudioLiveWorkState {
  return typeof value === "string" && WORK_STATE_SET.has(value);
}

/** 말풍선 사용자 문구에서 제어 문자를 제거하고 안전한 길이로 자른다. */
export function sanitizeLiveChoreographyBubble(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = stripControlChars(raw).replace(/\s+/gu, " ").trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, STUDIO_LIVE_BUBBLE_MAX_LENGTH);
}

/**
 * 실제 스튜디오 작업 상태를 가상 스튜디오 캐릭터 동작·제스처·말풍선 프리셋으로 매핑한다.
 */
export function resolveVirtualSpaceLiveChoreography(
  workState: StudioLiveWorkState,
  options: StudioLiveChoreographyResolveOptions = {},
): StudioLiveChoreographyPreset {
  const base = workState === "deadline-qa" && options.deadlineQaStage === "checking"
    ? DEADLINE_QA_CHECKING_PRESET
    : WORK_STATE_PRESETS[workState];
  const customBubble = sanitizeLiveChoreographyBubble(options.customBubble);
  if (customBubble === null) return base;
  return Object.freeze({
    ...base,
    bubbleKo: customBubble,
    bubbleEn: customBubble,
  });
}

/** 실시간 작업 상태 연동 모션의 초기 상태를 만든다(순수 메모리 상태). */
export function createVirtualSpaceLiveChoreographyState(
  initialWorkState: StudioLiveWorkState = "line-art",
  nowMs = 0,
  options: StudioLiveChoreographyResolveOptions = {},
): StudioLiveChoreographyState {
  const safeNow = Number.isFinite(nowMs) ? nowMs : 0;
  return Object.freeze({
    workState: initialWorkState,
    previousWorkState: null,
    deadlineQaStage: options.deadlineQaStage ?? "cleared",
    customBubble: sanitizeLiveChoreographyBubble(options.customBubble),
    changedAtMs: safeNow,
    transitionDurationMs: STUDIO_LIVE_CHOREOGRAPHY_TRANSITION_MS,
    transitionCount: 0,
  });
}

/**
 * 실제 스튜디오 작업 상태 변화를 반영해 불변 상태를 전이한다.
 * 동일한 상태·단계·말풍선이면 기존 상태 참조를 그대로 돌려준다.
 */
export function transitionVirtualSpaceLiveWorkState(
  state: StudioLiveChoreographyState,
  nextWorkState: StudioLiveWorkState,
  nowMs: number,
  options: StudioLiveWorkStateTransitionOptions = {},
): StudioLiveChoreographyState {
  const safeNow = Number.isFinite(nowMs) ? nowMs : state.changedAtMs;
  const nextStage: StudioDeadlineQaStage = options.deadlineQaStage
    ?? (nextWorkState === "deadline-qa" ? state.deadlineQaStage : "cleared");
  const nextBubble = options.customBubble !== undefined
    ? sanitizeLiveChoreographyBubble(options.customBubble)
    : state.customBubble;

  if (
    state.workState === nextWorkState
    && state.deadlineQaStage === nextStage
    && state.customBubble === nextBubble
  ) {
    return state;
  }

  const minHoldMs = Math.max(0, Number.isFinite(options.minHoldMs) ? (options.minHoldMs as number) : 0);
  if (state.workState !== nextWorkState && minHoldMs > 0 && safeNow - state.changedAtMs < minHoldMs) {
    return state;
  }

  const transitionDurationMs = Number.isFinite(options.transitionDurationMs) && (options.transitionDurationMs as number) > 0
    ? (options.transitionDurationMs as number)
    : state.transitionDurationMs;

  return Object.freeze({
    workState: nextWorkState,
    previousWorkState: state.workState,
    deadlineQaStage: nextStage,
    customBubble: nextBubble,
    changedAtMs: safeNow,
    transitionDurationMs,
    transitionCount: state.transitionCount + 1,
  });
}

/**
 * 현재 시각의 캐릭터 상체 제스처·말풍선 포즈를 샘플링한다.
 *
 * - 몸 크기(`scaleX`, `scaleY`)는 항상 `1.0`으로 고정한다.
 * - `reducedMotion === true`일 때는 모든 진동 제스처를 정지하고 말풍선·상태 표시만 유지한다.
 */
export function sampleVirtualSpaceLiveChoreographyPose(
  state: StudioLiveChoreographyState,
  nowMs: number,
  reducedMotion = false,
): StudioLiveUpperBodyPose {
  const preset = resolveVirtualSpaceLiveChoreography(state.workState, {
    deadlineQaStage: state.deadlineQaStage,
    customBubble: state.customBubble,
  });

  if (reducedMotion) {
    return Object.freeze({
      workState: preset.workState,
      action: preset.action,
      gesture: preset.upperBodyGesture,
      posture: preset.posture,
      transitionBlend: 1,
      headTiltDeg: 0,
      shoulderYawDeg: 0,
      dominantHandOffsetX: 0,
      dominantHandOffsetY: 0,
      armRaiseDeg: preset.action === "deadline-cheer" ? 18 : 0,
      steamPhase: 0,
      bubbleTextKo: preset.bubbleKo,
      bubbleTextEn: preset.bubbleEn,
      bubbleIcon: preset.bubbleIcon,
      bubbleVisible: true,
      scaleX: STUDIO_CHARACTER_BODY_SCALE_LOCK.scaleX,
      scaleY: STUDIO_CHARACTER_BODY_SCALE_LOCK.scaleY,
    });
  }

  const safeNow = Number.isFinite(nowMs) ? nowMs : 0;
  const elapsedMs = Math.max(0, safeNow - state.changedAtMs);
  const rawBlend = state.transitionDurationMs > 0
    ? clamp01(elapsedMs / state.transitionDurationMs)
    : 1;
  const transitionBlend = roundTo(rawBlend * rawBlend * (3 - 2 * rawBlend), 4);
  const seconds = safeNow / 1_000;

  let headTiltDeg = 0;
  let shoulderYawDeg = 0;
  let dominantHandOffsetX = 0;
  let dominantHandOffsetY = 0;
  let armRaiseDeg = 0;
  let steamPhase = 0;

  switch (preset.upperBodyGesture) {
    case "pen-stroke-steady": {
      // 정교한 선화 펜선: 좁은 왕복 스트로크와 차분한 시선 고정
      headTiltDeg = Math.sin(seconds * 1.4) * 1.4;
      shoulderYawDeg = Math.sin(seconds * 2.8) * 1.2;
      dominantHandOffsetX = Math.sin(seconds * 5.6) * 3.4;
      dominantHandOffsetY = Math.cos(seconds * 2.8) * 1.8;
      armRaiseDeg = 6;
      break;
    }
    case "brush-blend-sweep": {
      // 채색 브러시: 부드럽고 넓은 팔목 스윕
      headTiltDeg = Math.sin(seconds * 1.8) * 2.0;
      shoulderYawDeg = Math.sin(seconds * 2.2) * 2.4;
      dominantHandOffsetX = Math.sin(seconds * 3.4) * 5.2;
      dominantHandOffsetY = Math.sin(seconds * 6.8) * 2.2;
      armRaiseDeg = 10;
      break;
    }
    case "orbit-review-nod": {
      // 3D 배경 회의실 착석 검토: 화면 주시 + 간헐적 끄덕임
      headTiltDeg = Math.sin(seconds * 2.1) * 2.8;
      shoulderYawDeg = Math.cos(seconds * 1.2) * 1.8;
      dominantHandOffsetX = Math.cos(seconds * 1.6) * 2.0;
      dominantHandOffsetY = Math.sin(seconds * 1.6) * 1.2;
      armRaiseDeg = 4;
      break;
    }
    case "qa-check-nod": {
      // 마감 체크리스트 검수: 또렷한 리듬 끄덕임 + 체크 모션
      headTiltDeg = Math.sin(seconds * 3.0) * 2.6;
      shoulderYawDeg = Math.sin(seconds * 1.5) * 1.4;
      dominantHandOffsetX = Math.sin(seconds * 4.2) * 2.6;
      dominantHandOffsetY = Math.cos(seconds * 4.2) * 1.6;
      armRaiseDeg = 8;
      break;
    }
    case "cheer-fist-pump": {
      // 마감 환호: 경쾌한 상체 팔 들기(몸 크기 확대 없이 팔 각도만 상승)
      const pulse = 0.5 + 0.5 * Math.sin(seconds * 5.2);
      headTiltDeg = Math.sin(seconds * 2.6) * 3.4;
      shoulderYawDeg = Math.sin(seconds * 5.2) * 4.2;
      dominantHandOffsetX = Math.sin(seconds * 5.2) * 3.0;
      dominantHandOffsetY = -4.0 - pulse * 5.0;
      armRaiseDeg = 28 + pulse * 26;
      break;
    }
    case "coffee-sip-steam": {
      // 휴게실 커피 휴식: 천천히 컵을 들어 올리고 김 위상이 올라간다
      const sipWave = Math.max(0, Math.sin(seconds * 0.9));
      headTiltDeg = -1.2 * sipWave;
      shoulderYawDeg = Math.sin(seconds * 0.7) * 1.0;
      dominantHandOffsetX = 1.6 * sipWave;
      dominantHandOffsetY = -4.2 * sipWave;
      armRaiseDeg = 12 + 16 * sipWave;
      steamPhase = ((seconds * 0.45) % 1 + 1) % 1;
      break;
    }
  }

  return Object.freeze({
    workState: preset.workState,
    action: preset.action,
    gesture: preset.upperBodyGesture,
    posture: preset.posture,
    transitionBlend,
    headTiltDeg: roundTo(headTiltDeg * transitionBlend, 2),
    shoulderYawDeg: roundTo(shoulderYawDeg * transitionBlend, 2),
    dominantHandOffsetX: roundTo(dominantHandOffsetX * transitionBlend, 2),
    dominantHandOffsetY: roundTo(dominantHandOffsetY * transitionBlend, 2),
    armRaiseDeg: roundTo(armRaiseDeg * transitionBlend, 2),
    steamPhase: roundTo(steamPhase, 4),
    bubbleTextKo: preset.bubbleKo,
    bubbleTextEn: preset.bubbleEn,
    bubbleIcon: preset.bubbleIcon,
    bubbleVisible: true,
    scaleX: STUDIO_CHARACTER_BODY_SCALE_LOCK.scaleX,
    scaleY: STUDIO_CHARACTER_BODY_SCALE_LOCK.scaleY,
  });
}
