import {
  studioEmotionFromEmote,
  studioEmotionFromUserStatus,
  studioFaceSetName,
  type StudioEmotionKind,
  type StudioFaceSetName,
} from "./studio-virtual-space-character-motion";
import type {
  StudioCharacterMotionState,
  StudioCharacterPoseSheet,
  StudioCharacterSkin,
} from "./studio-virtual-space-character-skins";
import type { StudioSpaceEmoteId } from "./studio-virtual-space-emote-catalog";
import type { StudioUserStatus } from "./studio-virtual-space-user-status";

/**
 * 라이브 표정 레이어 (순수 판정)
 *
 * 감정 데이터(`resolveAvatarEmotion` 계열)는 그동안 프로시저럴 시트 베이킹에만
 * 쓰이고 실제 장면의 얼굴은 바뀌지 않았다. 이 모듈은 배우의 현재 신호
 * (활성 이모트·사용자 상태·NPC 단계)를 감정으로 해석하고, 스킨이 이름 규칙
 * `face-<감정>`으로 선언한 전신 표정 시트를 조회하는 판정만 담당한다.
 *
 * - 세트 조회는 이름 기반이다: 아트 트랙이 스킨에 `faces`를 채우면 코드 변경
 *   없이 바로 연결되고, 세트가 없으면 null을 돌려 호출 측이 기존 표정 경로
 *   (actor-emotions 시트·깜빡임·정지 프레임)로 폴백한다.
 * - 표정은 정지 상태(idle·talk·draw·review·wave·sit)에만 얹는다. 걷기·눕기는
 *   몸 동작이 우선이라 얼굴 시트로 교체하지 않는다.
 */

/** 표정 시트를 얹는 정지 상태. 걷기(walk)·눕기(lie)는 몸 동작이 우선이라 제외한다. */
export const STUDIO_FACE_LAYER_STATES: readonly StudioCharacterMotionState[] = Object.freeze([
  "idle", "talk", "draw", "review", "wave", "sit",
]);

export function studioFaceLayerApplies(state: StudioCharacterMotionState): boolean {
  return STUDIO_FACE_LAYER_STATES.includes(state);
}

/** NPC 생활 단계 (디렉터의 StudioNpcPhase와 같은 문자열 집합 — 타입 결합 없이 값으로만 받는다). */
export type StudioFaceNpcPhase = "work" | "inspect" | "rest" | "walk" | "yield" | "greet" | "wait";

/**
 * NPC 단계 → 감정. 걷기·양보 중에는 표정을 강제하지 않는다(null).
 * 일·점검은 집중, 휴식은 수면, 인사는 기쁨으로 읽는다.
 */
export function studioFaceEmotionForNpcPhase(phase: StudioFaceNpcPhase | null | undefined): StudioEmotionKind | null {
  switch (phase) {
    case "greet": return "joy";
    case "rest": return "sleep";
    case "work":
    case "inspect": return "focus";
    case "wait": return "neutral";
    case "walk":
    case "yield":
    default: return null;
  }
}

export interface StudioActorFaceEmotionInput {
  /** 지금 활성(만료 전)인 이모트. 없으면 null. */
  readonly emote?: StudioSpaceEmoteId | null;
  /** 사람 배우의 사용자 상태. NPC에게는 없다. */
  readonly userStatus?: StudioUserStatus | null;
  /** NPC 배우의 생활 단계. 사람에게는 없다. */
  readonly npcPhase?: StudioFaceNpcPhase | null;
}

/**
 * 배우 신호 → 감정. 우선순위는 이모트 > NPC 단계 > 사용자 상태.
 * 어떤 신호도 없으면 null (표정을 강제하지 않고 기존 경로 유지).
 * 이모트가 있으면 호출 측이 "활성"임을 보장하므로 TTL 판정은 하지 않는다 —
 * 캔버스의 actorReaction 데이터는 이모트 런타임이 만료 즉시 비운다.
 */
export function studioActorFaceEmotion(input: StudioActorFaceEmotionInput): StudioEmotionKind | null {
  if (input.emote) return studioEmotionFromEmote(input.emote);
  const npcEmotion = studioFaceEmotionForNpcPhase(input.npcPhase);
  if (npcEmotion) return npcEmotion;
  if (input.npcPhase) return null;
  if (input.userStatus) return studioEmotionFromUserStatus(input.userStatus);
  return null;
}

export interface StudioResolvedFaceSheet {
  readonly name: StudioFaceSetName;
  readonly sheet: StudioCharacterPoseSheet;
}

/**
 * 스킨이 선언한 표정 세트를 이름으로 조회한다.
 * 세트가 없으면 null — 호출 측은 기존 표정 경로로 폴백해야 한다.
 */
export function resolveStudioFaceSheet(
  skin: Pick<StudioCharacterSkin, "faces">,
  emotion: StudioEmotionKind,
): StudioResolvedFaceSheet | null {
  const name = studioFaceSetName(emotion);
  const sheet = skin.faces?.[name];
  return sheet ? Object.freeze({ name, sheet }) : null;
}
