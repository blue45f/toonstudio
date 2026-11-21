import { studioSpaceEmoteById, type StudioSpaceEmoteId } from "./studio-virtual-space-emote-catalog";
import type { StudioCharacterMotionState } from "./studio-virtual-space-character-skins";
import type { StudioVirtualSpaceFacing } from "./studio-virtual-space-model";
import { spriteDirectionToFacing, type StudioSpriteDirection } from "./studio-virtual-space-sprite";
import {
  spriteSheetCell,
  spriteSheetIdleCell,
  spriteSheetPreviewFrame,
  spriteSheetWalkFrameCount,
  type StudioSpriteSheetConfig,
} from "./studio-virtual-space-sprite-sheet";
import type { StudioUserStatus } from "./studio-virtual-space-user-status";

/**
 * 캐릭터 모션·감정 시스템 (트랙1 소유: 모션 데이터·블렌딩·렌더링)
 *
 * `studio-virtual-space-motion.ts`(물리 이동: 속도·가감속, 트랙3 소유)와 구분되는
 * 캐릭터 애니메이션 모듈이다.
 *
 * - 감정(Emotion): 기쁨·슬픔·놀람·수면·집중 등 얼굴 표정 변형. presence의
 *   Emote/userStatus와 연동된다 (`resolveAvatarEmotion`).
 * - 모션(Motion): 걷기·뛰기·점프·앉기·눕기·인사·손흔들기·박수·춤·일하기 등
 *   몸 동작. 상태머신이 전이·블렌딩을 맡는다.
 * - 커스텀 스프라이트 시트에는 모션 전용 행이 없으므로, 모든 모션은 시트의
 *   걷기 사이클/정지 프레임에 매핑 + 렌더 변형(bob·기울기·회전)으로 표현한다.
 *   프로시저럴 폴백도 같은 매핑을 쓴다.
 *
 * === 트랙3(이동) 소비 API ===
 * 트랙3은 "언제 어떤 모션으로 전이할지(물리/입력)"를 소유한다. 이 모듈이 제공하는 API:
 * - `createMotionStateMachine(initial, now)` — 장면당 하나의 머신을 만든다.
 * - `requestMotionState(machine, kind, now)` — 물리/입력에서 뽑은 모션을 요청한다.
 *   같은 kind면 머신을 그대로 돌려준다. 새 객체(immutable)를 반환한다.
 * - `sampleMotionRender(machine, now)` — 렌더 샘플(오프셋·회전·스케일·블렌딩).
 * - `motionOneShotFinished(machine, now)` — 점프·인사 같은 단발 모션 종료 여부.
 * - `sampleCustomSheetMotionCell(config, machine, direction, now, reducedMotion)`
 *   — 2D 미리보기/폴백용 셀 샘플.
 * - `motionKindToLegacyState(kind)` — 기존 스킨 파이프라인용 매핑.
 * - `resolveAvatarEmotion(...)` — presence → 감정.
 * 트랙1이 렌더링(Phaser 오버레이·2D 미리보기)을, 트랙3이 전이 결정을 맡는다. 중복 구현 금지.
 */

/* ---------------- 감정 ---------------- */

import {
  STUDIO_EMOTION_KINDS,
  STUDIO_EMOTION_LABELS,
  studioEmotionFace,
  studioFaceSetName,
  type StudioEmotionFace,
  type StudioEmotionKind,
  type StudioFaceSetName,
} from "./studio-virtual-space-character-emotions";

export {
  STUDIO_EMOTION_KINDS,
  STUDIO_EMOTION_LABELS,
  studioEmotionFace,
  studioFaceSetName,
  type StudioEmotionFace,
  type StudioEmotionKind,
  type StudioFaceSetName,
};

const EMOTE_EMOTION: Readonly<Record<StudioSpaceEmoteId, StudioEmotionKind>> = Object.freeze({
  "wave": "joy",
  "heart": "joy",
  "party": "joy",
  "thumbs-up": "joy",
  "laugh": "joy",
  "clap": "joy",
  "dance": "joy",
  "fireworks": "joy",
  "sparkles": "joy",
  "wow": "surprise",
  "question": "surprise",
  "exclaim": "surprise",
  "think": "focus",
  "idea": "focus",
  "coffee": "neutral",
  "music": "neutral",
  "sleep": "sleep",
  "calisthenics": "joy",
  "yoga": "focus",
  "kpop-dance": "joy",
  "shuffle": "joy",
  "neck-stretch": "focus",
  "tai-chi": "focus",
  "cheers": "joy",
  "moonwalk": "joy",
});

/** 이모트 → 감정. 없거나 모르면 neutral. */
export function studioEmotionFromEmote(emote: StudioSpaceEmoteId | null | undefined): StudioEmotionKind {
  if (!emote) return "neutral";
  return EMOTE_EMOTION[emote] ?? "neutral";
}

/** 사용자 상태 → 감정. */
export function studioEmotionFromUserStatus(status: StudioUserStatus | null | undefined): StudioEmotionKind {
  switch (status) {
    case "in-meeting": return "focus";
    case "away":
    case "break": return "sleep";
    case "available":
    default: return "neutral";
  }
}

export interface StudioAvatarEmotionInput {
  readonly emote?: StudioSpaceEmoteId | null;
  /** 이모트 시작 시각(ms epoch). */
  readonly emoteStartedAt?: number;
  readonly userStatus?: StudioUserStatus | null;
  readonly now?: number;
}

/**
 * presence에서 감정을 구한다. 유효한(만료 전) 이모트가 있으면 이모트 감정이,
 * 없으면 사용자 상태 감정이 된다.
 */
export function resolveAvatarEmotion(input: StudioAvatarEmotionInput): StudioEmotionKind {
  const now = input.now ?? Date.now();
  const startedAt = input.emoteStartedAt ?? 0;
  if (input.emote && Number.isFinite(startedAt) && startedAt > 0) {
    const ttl = studioSpaceEmoteById(input.emote)?.durationMs ?? 2_400;
    if (now - startedAt < ttl) return studioEmotionFromEmote(input.emote);
  }
  return studioEmotionFromUserStatus(input.userStatus ?? null);
}

/* ---------------- 모션 ---------------- */

export type StudioMotionKind =
  | "idle" | "walk" | "run" | "jump"
  | "sit" | "lie"
  | "wave" | "greet" | "clap" | "dance" | "work"
  | "talk" | "draw" | "review";

export const STUDIO_MOTION_KINDS: readonly StudioMotionKind[] = Object.freeze([
  "idle", "walk", "run", "jump", "sit", "lie",
  "wave", "greet", "clap", "dance", "work",
  "talk", "draw", "review",
]);

export interface StudioMotionProfile {
  readonly kind: StudioMotionKind;
  readonly labelKo: string;
  readonly labelEn: string;
  /** 렌더 프레임 소스: 걷기 사이클 or 정지 프레임. */
  readonly frameSource: "walk-cycle" | "idle-frame";
  /** 걷기 사이클 재생 속도 배율. */
  readonly cycleRate: number;
  /** 단발성 모션 길이(ms). 0이면 루프. */
  readonly oneShotMs: number;
  /** 전이 블렌딩 시간(ms). */
  readonly blendMs: number;
  /** 점프 호핑 높이(px). */
  readonly hopHeightPx: number;
  /** 인사 기울기(rad). */
  readonly tiltRad: number;
  /** 눕기 회전(deg). */
  readonly rotationDeg: number;
  /** 앉기 스쿼시. */
  readonly scaleY: number;
  /** 정적 수직 오프셋(px, 양수=아래). */
  readonly offsetYPx: number;
}

function motionProfile(profile: StudioMotionProfile): StudioMotionProfile {
  return Object.freeze(profile);
}

export const STUDIO_MOTION_PROFILES: Readonly<Record<StudioMotionKind, StudioMotionProfile>> = Object.freeze({
  idle: motionProfile({ kind: "idle", labelKo: "대기", labelEn: "Idle", frameSource: "idle-frame", cycleRate: 1, oneShotMs: 0, blendMs: 150, hopHeightPx: 0, tiltRad: 0, rotationDeg: 0, scaleY: 1, offsetYPx: 0 }),
  walk: motionProfile({ kind: "walk", labelKo: "걷기", labelEn: "Walk", frameSource: "walk-cycle", cycleRate: 1, oneShotMs: 0, blendMs: 120, hopHeightPx: 0, tiltRad: 0, rotationDeg: 0, scaleY: 1, offsetYPx: 0 }),
  run: motionProfile({ kind: "run", labelKo: "뛰기", labelEn: "Run", frameSource: "walk-cycle", cycleRate: 1.8, oneShotMs: 0, blendMs: 120, hopHeightPx: 0, tiltRad: 0.06, rotationDeg: 0, scaleY: 1, offsetYPx: 0 }),
  jump: motionProfile({ kind: "jump", labelKo: "점프", labelEn: "Jump", frameSource: "walk-cycle", cycleRate: 0, oneShotMs: 600, blendMs: 80, hopHeightPx: 26, tiltRad: 0, rotationDeg: 0, scaleY: 1, offsetYPx: 0 }),
  sit: motionProfile({ kind: "sit", labelKo: "앉기", labelEn: "Sit", frameSource: "idle-frame", cycleRate: 1, oneShotMs: 0, blendMs: 250, hopHeightPx: 0, tiltRad: 0, rotationDeg: 0, scaleY: 0.82, offsetYPx: 7 }),
  lie: motionProfile({ kind: "lie", labelKo: "눕기", labelEn: "Lie down", frameSource: "idle-frame", cycleRate: 1, oneShotMs: 0, blendMs: 400, hopHeightPx: 0, tiltRad: 0, rotationDeg: -72, scaleY: 1, offsetYPx: 10 }),
  wave: motionProfile({ kind: "wave", labelKo: "손흔들기", labelEn: "Wave", frameSource: "walk-cycle", cycleRate: 0.8, oneShotMs: 0, blendMs: 150, hopHeightPx: 0, tiltRad: 0, rotationDeg: 0, scaleY: 1, offsetYPx: 0 }),
  greet: motionProfile({ kind: "greet", labelKo: "인사", labelEn: "Greet", frameSource: "idle-frame", cycleRate: 1, oneShotMs: 1200, blendMs: 150, hopHeightPx: 0, tiltRad: 0.22, rotationDeg: 0, scaleY: 0.94, offsetYPx: 3 }),
  clap: motionProfile({ kind: "clap", labelKo: "박수", labelEn: "Clap", frameSource: "walk-cycle", cycleRate: 1.2, oneShotMs: 0, blendMs: 150, hopHeightPx: 0, tiltRad: 0, rotationDeg: 0, scaleY: 1, offsetYPx: 0 }),
  dance: motionProfile({ kind: "dance", labelKo: "춤", labelEn: "Dance", frameSource: "walk-cycle", cycleRate: 1.5, oneShotMs: 0, blendMs: 200, hopHeightPx: 0, tiltRad: 0.1, rotationDeg: 0, scaleY: 1, offsetYPx: 0 }),
  work: motionProfile({ kind: "work", labelKo: "일하기", labelEn: "Work", frameSource: "idle-frame", cycleRate: 1, oneShotMs: 0, blendMs: 200, hopHeightPx: 0, tiltRad: 0.05, rotationDeg: 0, scaleY: 0.97, offsetYPx: 1 }),
  talk: motionProfile({ kind: "talk", labelKo: "대화", labelEn: "Talk", frameSource: "idle-frame", cycleRate: 1, oneShotMs: 0, blendMs: 150, hopHeightPx: 0, tiltRad: 0, rotationDeg: 0, scaleY: 1, offsetYPx: 0 }),
  draw: motionProfile({ kind: "draw", labelKo: "그리기", labelEn: "Draw", frameSource: "idle-frame", cycleRate: 1, oneShotMs: 0, blendMs: 150, hopHeightPx: 0, tiltRad: 0.05, rotationDeg: 0, scaleY: 1, offsetYPx: 0 }),
  review: motionProfile({ kind: "review", labelKo: "검토", labelEn: "Review", frameSource: "idle-frame", cycleRate: 1, oneShotMs: 0, blendMs: 150, hopHeightPx: 0, tiltRad: 0, rotationDeg: 0, scaleY: 1, offsetYPx: 0 }),
});

/** 기존 스킨 파이프라인(Phaser 클립)이 아는 상태로 매핑한다. */
export function motionKindToLegacyState(kind: StudioMotionKind): StudioCharacterMotionState {
  switch (kind) {
    case "run":
    case "jump":
    case "dance":
      return "walk";
    case "lie":
      return "sit";
    case "greet":
    case "clap":
      return "wave";
    case "work":
      return "talk";
    default:
      return kind;
  }
}

/* ---------------- 상태머신 ---------------- */

export interface StudioMotionState {
  readonly kind: StudioMotionKind;
  readonly startedAt: number;
  /** 블렌딩 중이면 이전 모션, 아니면 null. */
  readonly blendFrom: StudioMotionKind | null;
  readonly blendUntil: number;
}

/** 장면당 하나의 머신을 만든다. */
export function createMotionStateMachine(initial: StudioMotionKind = "idle", now = 0): StudioMotionState {
  return Object.freeze({ kind: initial, startedAt: now, blendFrom: null, blendUntil: now });
}

/**
 * 모션 전이를 요청한다 (트랙3이 물리/입력에서 호출).
 * 같은 모션이면 머신을 그대로 돌려주고, 단발 모션 재요청이면 처음부터 다시 재생한다.
 */
export function requestMotionState(machine: StudioMotionState, kind: StudioMotionKind, now: number): StudioMotionState {
  const profile = STUDIO_MOTION_PROFILES[kind];
  if (machine.kind === kind) {
    // 단발 모션은 같은 요청이 와도 다시 시작한다 (점프 연타 등).
    if (profile.oneShotMs > 0) {
      return Object.freeze({ kind, startedAt: now, blendFrom: null, blendUntil: now });
    }
    return machine;
  }
  const blendMs = Math.max(0, profile.blendMs);
  return Object.freeze({
    kind,
    startedAt: now,
    blendFrom: blendMs > 0 ? machine.kind : null,
    blendUntil: now + blendMs,
  });
}

/** 블렌딩 진행률 0~1 (smoothstep easing). 블렌딩 중이 아니면 1. */
export function motionBlendFactor(machine: StudioMotionState, now: number): number {
  if (!machine.blendFrom || now >= machine.blendUntil) return 1;
  const total = machine.blendUntil - machine.startedAt;
  if (total <= 0) return 1;
  const raw = Math.max(0, Math.min(1, (now - machine.startedAt) / total));
  return raw * raw * (3 - 2 * raw);
}

/** 단발 모션(점프·인사)이 끝났는지. 루프 모션은 항상 false. */
export function motionOneShotFinished(machine: StudioMotionState, now: number): boolean {
  const profile = STUDIO_MOTION_PROFILES[machine.kind];
  return profile.oneShotMs > 0 && now - machine.startedAt >= profile.oneShotMs;
}

/* ---------------- 렌더 샘플 ---------------- */

export interface StudioMotionRenderSample {
  readonly kind: StudioMotionKind;
  readonly elapsedMs: number;
  readonly blendFactor: number;
  readonly blendFrom: StudioMotionKind | null;
  /** 추가 수직 오프셋(px, 음수=위로). */
  readonly offsetYPx: number;
  readonly rotationDeg: number;
  /** 인사 기울기에 단발 엔벨로프를 곱한 값(rad). */
  readonly tiltRad: number;
  readonly scaleY: number;
  /** 걷기 사이클 재생 속도 배율 (Phaser anim timeScale용). */
  readonly cycleRate: number;
}

function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothstepUnit(value: number): number {
  const t = clampValue(value, 0, 1);
  return t * t * (3 - 2 * t);
}

/** C1 연속 공격·해제 엔벨로프(0~1). 모션 시작·종료 시 뚝 끊기는 팝을 제거한다. */
function smoothEnvelope(elapsedMs: number, durationMs: number, attackMs: number, releaseMs: number): number {
  const attack = attackMs > 0 ? smoothstepUnit(elapsedMs / attackMs) : 1;
  if (!(durationMs > 0)) return attack;
  const remaining = durationMs - elapsedMs;
  if (remaining <= 0) return 0;
  const release = releaseMs > 0 ? smoothstepUnit(remaining / releaseMs) : 1;
  return Math.min(attack, release);
}

/** 렌더러(Phaser 오버레이·2D 미리보기)가 매 프레임 호출한다. */
export function sampleMotionRender(
  machine: StudioMotionState,
  now: number,
  options: { readonly reducedMotion?: boolean; readonly speedRatio?: number } = {},
): StudioMotionRenderSample {
  const profile = STUDIO_MOTION_PROFILES[machine.kind];
  const safeNow = Number.isFinite(now) ? now : machine.startedAt;
  const elapsedMs = Math.max(0, safeNow - machine.startedAt);
  const blendFactor = motionBlendFactor(machine, safeNow);
  const reducedMotion = options.reducedMotion === true;
  const speedGate = options.speedRatio === undefined
    ? 1
    : smoothstepUnit(Number.isFinite(options.speedRatio) ? options.speedRatio : 0);

  let targetOffsetY = profile.offsetYPx;
  let targetTiltRad = reducedMotion ? 0 : profile.tiltRad * (machine.kind === "run" || machine.kind === "walk" ? speedGate : 1);
  const targetRotationDeg = profile.rotationDeg;
  const targetScaleY = profile.scaleY;
  const targetCycleRate = reducedMotion ? 0 : profile.cycleRate;

  if (!reducedMotion) {
    if (machine.kind === "jump" && profile.oneShotMs > 0) {
      const phase = Math.min(1, elapsedMs / profile.oneShotMs);
      targetOffsetY += -profile.hopHeightPx * Math.sin(Math.PI * phase);
    } else if (machine.kind === "greet" && profile.oneShotMs > 0) {
      const phase = Math.min(1, elapsedMs / profile.oneShotMs);
      targetTiltRad *= Math.sin(Math.PI * phase);
    } else if (machine.kind === "dance") {
      const attack = smoothstepUnit(elapsedMs / 160);
      const beat = elapsedMs * 0.012;
      targetTiltRad *= Math.sin(beat) * attack;
      // Math.abs(Math.sin)의 첨점(cusp) 대신 C1 연속 raised-cosine으로 부드러운 바운스를 만든다.
      targetOffsetY += -((1 - Math.cos(beat * 2)) * 0.5) * 4 * attack;
    }
  }

  let offsetYPx = targetOffsetY;
  let rotationDeg = targetRotationDeg;
  let tiltRad = targetTiltRad;
  let scaleY = targetScaleY;
  let cycleRate = targetCycleRate;

  // 전이 블렌딩 구간 동안 이전 모션 포즈에서 목표 모션 포즈로 부드럽게 보간해 1프레임 스냅을 제거한다.
  if (machine.blendFrom && blendFactor < 1) {
    const fromProfile = STUDIO_MOTION_PROFILES[machine.blendFrom];
    const fromTilt = reducedMotion ? 0 : fromProfile.tiltRad;
    const fromCycle = reducedMotion ? 0 : fromProfile.cycleRate;
    offsetYPx = fromProfile.offsetYPx + (targetOffsetY - fromProfile.offsetYPx) * blendFactor;
    rotationDeg = fromProfile.rotationDeg + (targetRotationDeg - fromProfile.rotationDeg) * blendFactor;
    tiltRad = fromTilt + (targetTiltRad - fromTilt) * blendFactor;
    scaleY = fromProfile.scaleY + (targetScaleY - fromProfile.scaleY) * blendFactor;
    cycleRate = fromCycle + (targetCycleRate - fromCycle) * blendFactor;
  }

  return Object.freeze({
    kind: machine.kind,
    elapsedMs,
    blendFactor,
    blendFrom: machine.blendFrom,
    offsetYPx,
    rotationDeg,
    tiltRad,
    scaleY,
    cycleRate,
  });
}

export interface StudioMotionCellSample {
  readonly row: number;
  readonly column: number;
  readonly frameIndex: number;
  /** 호흡·호핑 바운스(px, 음수=위로). */
  readonly bobYPx: number;
  readonly rotationDeg: number;
  readonly scaleY: number;
  readonly tiltRad: number;
}

/**
 * 커스텀 시트(또는 프로시저럴 폴백) 2D 미리보기용 셀 샘플.
 * 모션 전용 행이 없어도 걷기 사이클/정지 프레임 매핑 + 변형으로 전부 표현한다.
 */
export function sampleCustomSheetMotionCell(
  config: StudioSpriteSheetConfig,
  machine: StudioMotionState,
  direction: StudioSpriteDirection,
  now: number,
  reducedMotion: boolean,
): StudioMotionCellSample {
  const profile = STUDIO_MOTION_PROFILES[machine.kind];
  const render = sampleMotionRender(machine, now, { reducedMotion });
  const walkFrames = spriteSheetWalkFrameCount(config);
  const ramp = smoothstepUnit(render.elapsedMs / Math.max(80, profile.blendMs));
  let row: number;
  let column: number;
  let bobYPx = 0;
  let extraOffsetY = 0;

  if (profile.frameSource === "walk-cycle") {
    const elapsed = reducedMotion ? 0 : render.elapsedMs;
    if (machine.kind === "jump") {
      // 점프는 중간 스텝 프레임 고정 + 호핑
      const cell = spriteSheetCell(config, direction, Math.min(1, walkFrames - 1));
      row = cell.row; column = cell.column;
      extraOffsetY = render.offsetYPx;
    } else if (machine.kind === "wave") {
      // 손흔들기는 앞 2프레임을 빠르게 왕복
      const frame = spriteSheetPreviewFrame(elapsed, config.frameRate * 1.4, Math.min(2, walkFrames), reducedMotion);
      const cell = spriteSheetCell(config, direction, frame);
      row = cell.row; column = cell.column;
      bobYPx = reducedMotion ? 0 : -((1 - Math.cos(elapsed * 0.04)) * 0.5) * 2.6 * ramp;
    } else if (machine.kind === "clap") {
      const frame = spriteSheetPreviewFrame(elapsed, config.frameRate * 1.2, walkFrames, reducedMotion);
      const cell = spriteSheetCell(config, direction, frame);
      row = cell.row; column = cell.column;
      bobYPx = reducedMotion ? 0 : -((1 - Math.cos(elapsed * 0.05)) * 0.5) * 2 * ramp;
    } else {
      const frame = spriteSheetPreviewFrame(elapsed, config.frameRate * profile.cycleRate, walkFrames, reducedMotion);
      const cell = spriteSheetCell(config, direction, frame);
      row = cell.row; column = cell.column;
      if (machine.kind === "dance") bobYPx = render.offsetYPx;
      else if (machine.kind === "run") bobYPx = reducedMotion ? 0 : -((1 - Math.cos(elapsed * 0.06)) * 0.5) * 2.8 * ramp;
    }
  } else {
    const cell = spriteSheetIdleCell(config, spriteDirectionToFacing(direction));
    row = cell.row; column = cell.column;
    if (!reducedMotion) {
      if (machine.kind === "idle") bobYPx = Math.sin(render.elapsedMs * (Math.PI * 2 / 2400)) * 1.5;
      else if (machine.kind === "work") bobYPx = -((1 - Math.cos(render.elapsedMs * 0.06)) * 0.5) * 1.2 * ramp;
    }
    extraOffsetY = render.offsetYPx;
  }

  return Object.freeze({
    row,
    column,
    frameIndex: row * config.framesPerDirection + column,
    bobYPx: bobYPx + extraOffsetY,
    rotationDeg: render.rotationDeg,
    scaleY: render.scaleY,
    tiltRad: render.tiltRad,
  });
}

/** facing 쿼리용 편의 래퍼 (Phaser는 4 facing만 쓴다). */
export function facingToSpriteDirection(facing: StudioVirtualSpaceFacing): StudioSpriteDirection {
  switch (facing) {
    case "left": return "left";
    case "right": return "right";
    case "up": return "up";
    case "down":
    default: return "down";
  }
}

/* ---------------------------------------------------------------------------------------------- */
/* 확장 18종 자연 모션 레퍼토리 (기본 12종 + 작가 건강 체조 3종 + 신나는 댄스 3종)                      */
/* ---------------------------------------------------------------------------------------------- */

/** 작가 건강 체조 3종(목·어깨, 손목 풀기, 전신 스트레칭). */
export const STUDIO_GYMNASTICS_MOTION_IDS = Object.freeze([
  "neck-shoulder-stretch",
  "wrist-roll-break",
  "standing-gymnastics",
] as const);

/** 신나는 댄스 3종(리듬 댄스, 마감 축하 댄스, 팀 동기화 댄스). */
export const STUDIO_DANCE_MOTION_IDS = Object.freeze([
  "groove-dance",
  "deadline-victory-dance",
  "sync-group-dance",
] as const);

/** 가상 스튜디오 공통 18종 풍부한 모션 프로파일 ID. */
export const STUDIO_RICH_MOTION_IDS = Object.freeze([
  "idle-breathe",
  "walk-natural",
  "jog-brisk",
  "sprint-dash",
  "tiptoe-sneak",
  "hop-skip",
  "sit-draw",
  "stretch-break",
  "celebrate-spin",
  "wave-greet",
  "focus-typing",
  "dramatic-entrance",
  ...STUDIO_GYMNASTICS_MOTION_IDS,
  ...STUDIO_DANCE_MOTION_IDS,
] as const);

export type StudioRichMotionId = (typeof STUDIO_RICH_MOTION_IDS)[number];
export type StudioRichMotionCategory = "locomotion" | "work" | "expression" | "gymnastics" | "dance";

export interface StudioRichMotionProfile {
  readonly id: StudioRichMotionId;
  readonly category: StudioRichMotionCategory;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly glyph: string;
  readonly legacyMotionKind: StudioMotionKind;
  readonly defaultDurationMs: number;
  readonly oneShot: boolean;
  readonly attackMs: number;
  readonly releaseMs: number;
  readonly maxBouncePx: number;
  readonly maxTiltRad: number;
  readonly staticScaleY: number;
  /** true이면 전역 시각(nowMs)에 위상을 고정해 여러 캐릭터가 한 박자로 동기화된다. */
  readonly globalPhaseSync: boolean;
}

function richProfile(spec: StudioRichMotionProfile): StudioRichMotionProfile {
  return Object.freeze(spec);
}

export const STUDIO_RICH_MOTION_PROFILES: Readonly<Record<StudioRichMotionId, StudioRichMotionProfile>> = Object.freeze({
  "idle-breathe": richProfile({ id: "idle-breathe", category: "locomotion", labelKo: "자연 호흡 대기", labelEn: "Idle Breathe", glyph: "😌", legacyMotionKind: "idle", defaultDurationMs: 0, oneShot: false, attackMs: 140, releaseMs: 160, maxBouncePx: 1.5, maxTiltRad: 0.018, staticScaleY: 1, globalPhaseSync: false }),
  "walk-natural": richProfile({ id: "walk-natural", category: "locomotion", labelKo: "자연 보행", labelEn: "Natural Walk", glyph: "🚶", legacyMotionKind: "walk", defaultDurationMs: 0, oneShot: false, attackMs: 120, releaseMs: 160, maxBouncePx: 2.4, maxTiltRad: 0.045, staticScaleY: 1, globalPhaseSync: false }),
  "jog-brisk": richProfile({ id: "jog-brisk", category: "locomotion", labelKo: "경쾌한 조깅", labelEn: "Brisk Jog", glyph: "🏃", legacyMotionKind: "run", defaultDurationMs: 0, oneShot: false, attackMs: 110, releaseMs: 160, maxBouncePx: 3.8, maxTiltRad: 0.068, staticScaleY: 1, globalPhaseSync: false }),
  "sprint-dash": richProfile({ id: "sprint-dash", category: "locomotion", labelKo: "전력 질주 대시", labelEn: "Sprint Dash", glyph: "💨", legacyMotionKind: "run", defaultDurationMs: 0, oneShot: false, attackMs: 90, releaseMs: 160, maxBouncePx: 4.6, maxTiltRad: 0.095, staticScaleY: 1, globalPhaseSync: false }),
  "tiptoe-sneak": richProfile({ id: "tiptoe-sneak", category: "locomotion", labelKo: "살금살금 발끝 걷기", labelEn: "Tiptoe Sneak", glyph: "🤫", legacyMotionKind: "walk", defaultDurationMs: 0, oneShot: false, attackMs: 150, releaseMs: 180, maxBouncePx: 2.8, maxTiltRad: 0.062, staticScaleY: 1, globalPhaseSync: false }),
  "hop-skip": richProfile({ id: "hop-skip", category: "locomotion", labelKo: "깡충 스킵", labelEn: "Hop & Skip", glyph: "🐇", legacyMotionKind: "walk", defaultDurationMs: 0, oneShot: false, attackMs: 120, releaseMs: 180, maxBouncePx: 6.4, maxTiltRad: 0.085, staticScaleY: 1, globalPhaseSync: false }),
  "sit-draw": richProfile({ id: "sit-draw", category: "work", labelKo: "착석 원고 드로잉", labelEn: "Seated Drawing", glyph: "✏️", legacyMotionKind: "draw", defaultDurationMs: 0, oneShot: false, attackMs: 200, releaseMs: 200, maxBouncePx: 1.4, maxTiltRad: 0.055, staticScaleY: 0.88, globalPhaseSync: false }),
  "stretch-break": richProfile({ id: "stretch-break", category: "work", labelKo: "기지개 휴식", labelEn: "Stretch Break", glyph: "🙆", legacyMotionKind: "idle", defaultDurationMs: 3_200, oneShot: true, attackMs: 260, releaseMs: 320, maxBouncePx: 4.2, maxTiltRad: 0.08, staticScaleY: 1, globalPhaseSync: false }),
  "celebrate-spin": richProfile({ id: "celebrate-spin", category: "expression", labelKo: "축하 회전 점프", labelEn: "Celebrate Spin", glyph: "🎉", legacyMotionKind: "dance", defaultDurationMs: 2_800, oneShot: true, attackMs: 150, releaseMs: 240, maxBouncePx: 7.5, maxTiltRad: 0.12, staticScaleY: 1, globalPhaseSync: false }),
  "wave-greet": richProfile({ id: "wave-greet", category: "expression", labelKo: "손 흔들어 인사", labelEn: "Wave Greet", glyph: "👋", legacyMotionKind: "wave", defaultDurationMs: 2_200, oneShot: true, attackMs: 140, releaseMs: 220, maxBouncePx: 3.0, maxTiltRad: 0.11, staticScaleY: 1, globalPhaseSync: false }),
  "focus-typing": richProfile({ id: "focus-typing", category: "work", labelKo: "집중 타이핑", labelEn: "Focus Typing", glyph: "⌨️", legacyMotionKind: "work", defaultDurationMs: 0, oneShot: false, attackMs: 160, releaseMs: 180, maxBouncePx: 1.4, maxTiltRad: 0.045, staticScaleY: 0.96, globalPhaseSync: false }),
  "dramatic-entrance": richProfile({ id: "dramatic-entrance", category: "expression", labelKo: "화려한 등장", labelEn: "Dramatic Entrance", glyph: "✨", legacyMotionKind: "jump", defaultDurationMs: 1_400, oneShot: true, attackMs: 110, releaseMs: 260, maxBouncePx: 8.5, maxTiltRad: 0.14, staticScaleY: 1, globalPhaseSync: false }),
  "neck-shoulder-stretch": richProfile({ id: "neck-shoulder-stretch", category: "gymnastics", labelKo: "목·어깨 체조", labelEn: "Neck & Shoulder Stretch", glyph: "💆", legacyMotionKind: "idle", defaultDurationMs: 3_800, oneShot: false, attackMs: 260, releaseMs: 300, maxBouncePx: 3.4, maxTiltRad: 0.13, staticScaleY: 1, globalPhaseSync: false }),
  "wrist-roll-break": richProfile({ id: "wrist-roll-break", category: "gymnastics", labelKo: "손목 풀기 체조", labelEn: "Wrist Roll Break", glyph: "🙌", legacyMotionKind: "wave", defaultDurationMs: 3_400, oneShot: false, attackMs: 220, releaseMs: 260, maxBouncePx: 2.6, maxTiltRad: 0.09, staticScaleY: 1, globalPhaseSync: false }),
  "standing-gymnastics": richProfile({ id: "standing-gymnastics", category: "gymnastics", labelKo: "전신 스트레칭 체조", labelEn: "Standing Gymnastics", glyph: "🤸", legacyMotionKind: "dance", defaultDurationMs: 4_000, oneShot: false, attackMs: 240, releaseMs: 280, maxBouncePx: 5.4, maxTiltRad: 0.15, staticScaleY: 1, globalPhaseSync: false }),
  "groove-dance": richProfile({ id: "groove-dance", category: "dance", labelKo: "리듬 댄스", labelEn: "Groove Dance", glyph: "🕺", legacyMotionKind: "dance", defaultDurationMs: 4_000, oneShot: false, attackMs: 180, releaseMs: 240, maxBouncePx: 5.8, maxTiltRad: 0.14, staticScaleY: 1, globalPhaseSync: false }),
  "deadline-victory-dance": richProfile({ id: "deadline-victory-dance", category: "dance", labelKo: "마감 축하 댄스", labelEn: "Deadline Victory Dance", glyph: "🏆", legacyMotionKind: "dance", defaultDurationMs: 4_000, oneShot: false, attackMs: 160, releaseMs: 240, maxBouncePx: 7.4, maxTiltRad: 0.16, staticScaleY: 1, globalPhaseSync: false }),
  "sync-group-dance": richProfile({ id: "sync-group-dance", category: "dance", labelKo: "팀 동기화 댄스", labelEn: "Sync Group Dance", glyph: "🪩", legacyMotionKind: "dance", defaultDurationMs: 4_000, oneShot: false, attackMs: 180, releaseMs: 240, maxBouncePx: 6.2, maxTiltRad: 0.15, staticScaleY: 1, globalPhaseSync: true }),
});

const RICH_MOTION_ID_SET = new Set<string>(STUDIO_RICH_MOTION_IDS);

export function isStudioRichMotionId(value: string | null | undefined): value is StudioRichMotionId {
  return typeof value === "string" && RICH_MOTION_ID_SET.has(value);
}

const EMOTE_TO_RICH_MOTION: Readonly<Record<string, StudioRichMotionId>> = Object.freeze({
  wave: "wave-greet",
  greet: "wave-greet",
  "neck-stretch": "neck-shoulder-stretch",
  calisthenics: "standing-gymnastics",
  yoga: "stretch-break",
  "tai-chi": "stretch-break",
  coffee: "wrist-roll-break",
  dance: "groove-dance",
  shuffle: "groove-dance",
  moonwalk: "groove-dance",
  cheers: "deadline-victory-dance",
  party: "celebrate-spin",
  fireworks: "deadline-victory-dance",
  "kpop-dance": "sync-group-dance",
  draw: "sit-draw",
  work: "focus-typing",
});

/** 이모트·모션 식별자를 18종 풍부한 모션 프로파일 ID로 해석한다. */
export function resolveStudioRichMotionId(kindOrEmote: string | null | undefined): StudioRichMotionId | null {
  if (!kindOrEmote) return null;
  if (isStudioRichMotionId(kindOrEmote)) return kindOrEmote;
  return EMOTE_TO_RICH_MOTION[kindOrEmote] ?? null;
}

export interface StudioRichMotionSampleInput {
  readonly elapsedMs: number;
  /** 전역 시각(ms). `sync-group-dance`처럼 팀 동기화 모션의 공용 위상에 쓴다. */
  readonly nowMs?: number;
  /** 총 길이(ms). 0이면 무한 루프. */
  readonly durationMs?: number;
  /** 이동 속도 비율(0=정지, 1=표준 걷기, 1.5=질주). 보행 계열 바운스·기울기 램프인/아웃에 쓴다. */
  readonly speedRatio?: number;
  /** 거리 기반 보행 위상(rad). 주어지면 시간 대신 실제 이동 위상에 바운스를 잠근다. */
  readonly stridePhase?: number;
  readonly reducedMotion?: boolean;
}

export interface StudioRichMotionPose {
  readonly id: StudioRichMotionId;
  readonly category: StudioRichMotionCategory;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly tiltRad: number;
  /** 3D 요(yaw) 회전(rad). 2D에서는 무시하거나 방향 순환 힌트로 쓴다. */
  readonly yawRad: number;
  /** 팔 스윙 위상(-1~1, rad 기준). */
  readonly armSwingRad: number;
  /** 다리 스윙 위상(-1~1, rad 기준). */
  readonly legSwingRad: number;
  /** 방향 순환 인덱스(0~3, 없으면 null). */
  readonly facingCycleIndex: number | null;
  readonly shadowScale: number;
  readonly intensity: number;
}

/**
 * 18종 풍부한 캐릭터 모션의 공통 수학 평가기(2D·Phaser·3D 공유).
 * - 모든 모션은 C1 smoothstep 공격·해제 엔벨로프로 시작/종료 시 끊김이 없다.
 * - 보행 계열은 `speedRatio`에 비례해 부드럽게 램프인·램프아웃하며 과도 진폭 상한을 지킨다.
 * - `reducedMotion=true`에서는 모든 동적 진동·회전·스윙을 0으로 감쇠해 전정 안전을 보장한다.
 */
export function sampleStudioRichMotion(
  id: StudioRichMotionId,
  input: StudioRichMotionSampleInput,
): StudioRichMotionPose {
  const profile = STUDIO_RICH_MOTION_PROFILES[id];
  if (input.reducedMotion) {
    return Object.freeze({
      id, category: profile.category, offsetX: 0, offsetY: 0, scaleX: 1, scaleY: profile.staticScaleY,
      tiltRad: 0, yawRad: 0, armSwingRad: 0, legSwingRad: 0, facingCycleIndex: null, shadowScale: 1, intensity: 0,
    });
  }

  const elapsedMs = Math.max(0, Number.isFinite(input.elapsedMs) ? input.elapsedMs : 0);
  const durationMs = input.durationMs !== undefined && Number.isFinite(input.durationMs)
    ? Math.max(0, input.durationMs) : profile.defaultDurationMs;
  const env = smoothEnvelope(elapsedMs, durationMs, profile.attackMs, profile.releaseMs);
  const clockMs = profile.globalPhaseSync && Number.isFinite(input.nowMs) ? Math.max(0, input.nowMs ?? elapsedMs) : elapsedMs;
  const speedRatio = clampValue(Number.isFinite(input.speedRatio) ? (input.speedRatio ?? 1) : 1, 0, 1.8);
  const speedGate = smoothstepUnit(speedRatio);
  const stride = Number.isFinite(input.stridePhase) ? (input.stridePhase ?? 0) : null;
  const wave = (periodMs: number) => (clockMs / periodMs) * Math.PI * 2;
  const liftCos = (rad: number) => (1 - Math.cos(rad)) * 0.5;

  let offsetX = 0;
  let offsetY: number;
  let scaleYDelta = 0;
  let tiltRad: number;
  let yawRad = 0;
  let armSwingRad = 0;
  let legSwingRad = 0;
  let facingCycleIndex: number | null = null;

  if (id === "walk-natural" || id === "jog-brisk" || id === "sprint-dash" || id === "tiptoe-sneak" || id === "hop-skip") {
    const spec = id === "walk-natural" ? { period: 560, bounce: 2.2, scale: 0.016, lean: 0, sway: 0.032, arm: 0.42, leg: 0.46, xAmp: 0 }
      : id === "jog-brisk" ? { period: 400, bounce: 3.5, scale: 0.024, lean: 0.042, sway: 0.022, arm: 0.65, leg: 0.68, xAmp: 0 }
      : id === "sprint-dash" ? { period: 290, bounce: 4.4, scale: 0.032, lean: 0.072, sway: 0.022, arm: 0.88, leg: 0.85, xAmp: 0 }
      : id === "tiptoe-sneak" ? { period: 780, bounce: 2.6, scale: 0.018, lean: 0, sway: 0.055, arm: 0.24, leg: 0.28, xAmp: 1.4 }
      : { period: 460, bounce: 6.0, scale: 0.045, lean: 0, sway: 0.072, arm: 0.72, leg: 0.64, xAmp: 0 };
    const p = stride ?? wave(spec.period);
    const g = env * speedGate;
    const lift = liftCos(p * 2);
    offsetX = Math.sin(p) * spec.xAmp * g;
    offsetY = -lift * spec.bounce * g;
    scaleYDelta = (id === "hop-skip" ? lift * spec.scale - (1 - lift) * 0.028 : id === "tiptoe-sneak" ? spec.scale : Math.cos(p * 2) * spec.scale) * g;
    tiltRad = (spec.lean + Math.sin(p) * spec.sway) * g;
    armSwingRad = Math.sin(p) * spec.arm * g;
    legSwingRad = -Math.sin(p) * spec.leg * g;
  } else if (id === "idle-breathe") {
    const p = wave(3_800);
    offsetY = -liftCos(p) * 1.1 * env;
    scaleYDelta = Math.sin(p) * 0.012 * env;
    tiltRad = Math.sin(p * 0.5) * 0.01 * env;
  } else if (id === "sit-draw") {
    const p = wave(920);
    offsetX = Math.sin(p) * 0.9 * env;
    offsetY = -liftCos(p * 2) * 1.0 * env;
    tiltRad = (0.035 + Math.sin(p * 0.5) * 0.018) * env;
    armSwingRad = Math.sin(p * 2) * 0.22 * env;
  } else if (id === "focus-typing") {
    const p = wave(420);
    offsetY = -liftCos(p) * 1.1 * env;
    tiltRad = (0.03 + Math.sin(p * 0.5) * 0.012) * env;
    armSwingRad = Math.sin(p) * 0.26 * env;
  } else if (id === "stretch-break") {
    const p = wave(2_800);
    const lift = liftCos(p);
    offsetY = -lift * 3.8 * env;
    scaleYDelta = lift * 0.052 * env;
    tiltRad = Math.sin(p) * 0.068 * env;
    armSwingRad = -(0.5 + lift * 0.85) * env;
  } else if (id === "celebrate-spin") {
    const p = wave(700);
    const lift = liftCos(p);
    offsetX = Math.sin(p * 0.5) * 3.2 * env;
    offsetY = -lift * 7.2 * env;
    scaleYDelta = (lift * 0.045 - 0.015) * env;
    tiltRad = Math.sin(p * 0.5) * 0.1 * env;
    yawRad = (elapsedMs / Math.max(700, durationMs)) * Math.PI * 2 * env;
    armSwingRad = -(0.9 + Math.sin(p) * 0.35) * env;
    facingCycleIndex = Math.floor(elapsedMs / 220) % 4;
  } else if (id === "wave-greet") {
    const p = wave(460);
    offsetY = -liftCos(p) * 2.6 * env;
    tiltRad = (0.055 + Math.sin(p * 0.5) * 0.045) * env;
    armSwingRad = (-1.15 + Math.sin(p) * 0.45) * env;
  } else if (id === "dramatic-entrance") {
    const u = clampValue(elapsedMs / Math.max(800, durationMs || 1_400), 0, 1);
    const arc = Math.sin(Math.PI * Math.min(1, u * 1.45));
    const settle = u > 0.65 ? Math.sin(((u - 0.65) / 0.35) * Math.PI) : 0;
    offsetX = (1 - smoothstepUnit(u * 1.3)) * -5.2 * env;
    offsetY = (-arc * 8.2 + settle * 1.8) * env;
    scaleYDelta = (arc * 0.048 - settle * 0.055) * env;
    tiltRad = ((1 - smoothstepUnit(u)) * 0.12 - settle * 0.04) * env;
    yawRad = (1 - smoothstepUnit(u * 1.2)) * Math.PI * 0.75 * env;
    armSwingRad = (-0.85 * arc - 0.35 * settle) * env;
  } else if (id === "neck-shoulder-stretch") {
    // 작가 건강 체조 1: 목 좌우 천천히 기울이기 + 어깨 으쓱 이완 (저속 C1 웨이브)
    const p = wave(1_800);
    const shrug = liftCos(p * 2);
    offsetX = Math.sin(p) * 2.1 * env;
    offsetY = (-1.2 - shrug * 2.0) * env;
    scaleYDelta = (shrug * 0.032 - 0.01) * env;
    tiltRad = Math.sin(p) * 0.12 * env;
    yawRad = Math.sin(p) * 0.18 * env;
    armSwingRad = (-0.25 - shrug * 0.32) * env;
  } else if (id === "wrist-roll-break") {
    // 작가 건강 체조 2: 팔뚝을 들고 부드러운 8자 손목 풀기 리듬
    const p = wave(860);
    offsetX = Math.sin(p) * 2.4 * env;
    offsetY = (-1.0 - liftCos(p * 2) * 1.5) * env;
    scaleYDelta = Math.sin(p * 2) * 0.016 * env;
    tiltRad = Math.sin(p) * 0.075 * env;
    armSwingRad = (-0.72 + Math.sin(p * 2) * 0.32) * env;
  } else if (id === "standing-gymnastics") {
    // 작가 건강 체조 3: 전신 좌우 옆구리 스트레칭 + 머리 위 기지개 + 무릎 반동
    const p = wave(1_100);
    const reach = liftCos(p * 2);
    offsetX = Math.sin(p) * 4.0 * env;
    offsetY = -reach * 5.0 * env;
    scaleYDelta = (reach * 0.048 - 0.02) * env;
    tiltRad = Math.sin(p) * 0.14 * env;
    yawRad = Math.sin(p * 0.5) * 0.22 * env;
    armSwingRad = (-0.95 - reach * 0.55) * env;
    legSwingRad = Math.sin(p) * 0.24 * env;
  } else {
    // 신나는 댄스 3종: groove-dance / deadline-victory-dance / sync-group-dance(전역 박자 동기화)
    const spec = id === "groove-dance" ? { period: 640, x: 4.8, y: 5.4, sc: 0.04, tilt: 0.125, yaw: 0.36, leg: 0.36, cycleMs: 0 }
      : id === "deadline-victory-dance" ? { period: 500, x: 5.2, y: 7.0, sc: 0.048, tilt: 0.145, yaw: 0.55, leg: 0.42, cycleMs: 360 }
      : { period: 560, x: 5.4, y: 6.0, sc: 0.042, tilt: 0.135, yaw: 0.48, leg: 0.38, cycleMs: 560 };
    const beat = wave(spec.period);
    const bounce = liftCos(beat * 2);
    offsetX = Math.sin(beat) * spec.x * env;
    offsetY = -bounce * spec.y * env;
    scaleYDelta = (bounce * spec.sc - 0.022) * env;
    tiltRad = (id === "deadline-victory-dance" ? Math.sin(beat) : Math.cos(beat)) * spec.tilt * env;
    yawRad = Math.sin(id === "groove-dance" ? beat : beat * 0.5) * spec.yaw * env;
    armSwingRad = (id === "groove-dance" ? Math.sin(beat) * 0.85 : id === "deadline-victory-dance" ? -1.15 + Math.sin(beat * 2) * 0.45 : -0.85 + Math.cos(beat) * 0.55) * env;
    legSwingRad = Math.sin(beat) * spec.leg * env;
    if (spec.cycleMs > 0) facingCycleIndex = Math.floor((profile.globalPhaseSync ? clockMs : elapsedMs) / spec.cycleMs) % 4;
  }

  const cleanZero = (value: number) => (Object.is(value, -0) || Math.abs(value) < 1e-12 ? 0 : value);
  const clampedOffsetX = cleanZero(clampValue(offsetX, -8, 8));
  const clampedOffsetY = cleanZero(clampValue(offsetY, -profile.maxBouncePx, 8));
  const clampedTilt = cleanZero(clampValue(tiltRad, -profile.maxTiltRad, profile.maxTiltRad));
  const scaleY = clampValue(profile.staticScaleY + scaleYDelta, 0.82, 1.1);
  const scaleX = clampValue(1 / Math.sqrt(scaleY / profile.staticScaleY), 0.9, 1.1);
  const shadowScale = clampValue(1 - clampValue(-clampedOffsetY / 10, 0, 1) * 0.22, 0.72, 1.12);

  return Object.freeze({
    id, category: profile.category, offsetX: clampedOffsetX, offsetY: clampedOffsetY, scaleX, scaleY,
    tiltRad: clampedTilt, yawRad: cleanZero(yawRad), armSwingRad: cleanZero(armSwingRad), legSwingRad: cleanZero(legSwingRad),
    facingCycleIndex, shadowScale,
    intensity: cleanZero(env * (profile.category === "locomotion" && id !== "idle-breathe" ? speedGate : 1)),
  });
}
