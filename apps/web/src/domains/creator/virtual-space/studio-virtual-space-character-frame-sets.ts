import { STUDIO_EXPERIENCE_ATLAS, STUDIO_ACTOR_EXPRESSION_PRESENTATION } from "./studio-virtual-space-scene-art-runtime";
import type { StudioCharacterFramePresentation, StudioCharacterSkin } from "./studio-virtual-space-character-skins";
import type { StudioCharacterExpression } from "./studio-virtual-space-expressions";
import type { StudioVirtualSpaceFacing } from "./studio-virtual-space-model";

/**
 * 이름으로 조회하는 캐릭터 프레임 세트 등록부 (웨이브 6 모션 트랙 계약).
 *
 * - 앉기 세트 이름은 `sit` 하나다. 실제 프레임은 스킨 종류마다 다른 원본
 *   (드로잉 포즈 시트·테마/네이티브 8×4 시트·스타일 팩 포즈 시트)에 있으므로
 *   `studioCharacterSitSetFrame`이 스킨의 pose 시트를 이름으로 해석한다.
 * - 표정 세트 이름은 `face-*`다. 표정 원본(actor-emotions)은 드로잉 플레이어
 *   4종 전용 4×4 시트이며, 행=캐릭터·열=표정 순서가 기존 표정 런타임
 *   (`studioCharacterExpressionFrame`)과 동일하다. 이 등록부가 그 매핑에
 *   이름을 부여한 것이며, 테스트가 런타임 함수와 프레임 일치를 고정한다.
 */
export const STUDIO_CHARACTER_SIT_SET_NAME = "sit" as const;

export type StudioCharacterFaceSetName = "face-calm" | "face-happy" | "face-wave" | "face-surprised";
export type StudioCharacterFrameSetName = typeof STUDIO_CHARACTER_SIT_SET_NAME | StudioCharacterFaceSetName;

export interface StudioCharacterFaceSet {
  readonly name: StudioCharacterFaceSetName;
  readonly labelKo: string;
  /** 기존 표정 런타임의 표정 키와 1:1로 대응한다. */
  readonly expression: StudioCharacterExpression;
  /** actor-emotions 시트의 열 번호. */
  readonly column: number;
}

export const STUDIO_CHARACTER_FACE_SETS: readonly StudioCharacterFaceSet[] = Object.freeze([
  Object.freeze({ name: "face-calm", labelKo: "기본 · 평온", expression: "calm", column: 0 }),
  Object.freeze({ name: "face-happy", labelKo: "미소", expression: "happy", column: 1 }),
  Object.freeze({ name: "face-wave", labelKo: "인사", expression: "wave", column: 2 }),
  Object.freeze({ name: "face-surprised", labelKo: "놀람", expression: "surprised", column: 3 }),
] as const);

export const STUDIO_CHARACTER_FACE_TEXTURE_URL = "/assets/virtual-studio/experience-v8/actor-emotions.png";

/** actor-emotions 시트의 행 순서(드로잉 플레이어 4종). 표정이 없는 스킨은 조회 결과가 null이다. */
const FACE_ROWS: Readonly<Record<string, number>> = Object.freeze({ pink: 0, silver: 1, dark: 2, purple: 3 });

export interface StudioCharacterFrameSetFrame {
  readonly textureUrl: string;
  readonly frame: number;
  readonly presentation: StudioCharacterFramePresentation | undefined;
}

/** 표정 세트를 이름으로 조회한다. 지원하지 않는 스킨·세트 이름이면 null(기존 자세 유지). */
export function studioCharacterFaceSetFrame(
  skinKey: string,
  setName: StudioCharacterFaceSetName,
): StudioCharacterFrameSetFrame | null {
  const row = FACE_ROWS[skinKey];
  const set = STUDIO_CHARACTER_FACE_SETS.find((candidate) => candidate.name === setName);
  if (row === undefined || !set) return null;
  const frame = row * 4 + set.column;
  return {
    textureUrl: STUDIO_CHARACTER_FACE_TEXTURE_URL,
    frame,
    presentation: STUDIO_ACTOR_EXPRESSION_PRESENTATION[frame],
  };
}

/** 앉기 세트(`sit`)를 이름으로 조회한다. 포즈 시트가 없는 스킨이면 null(폴백 자세 유지). */
export function studioCharacterSitSetFrame(
  skin: StudioCharacterSkin,
  facing: StudioVirtualSpaceFacing,
): StudioCharacterFrameSetFrame | null {
  const pose = skin.poses?.[STUDIO_CHARACTER_SIT_SET_NAME];
  if (!pose) return null;
  const frame = pose.directionFrames[facing];
  return { textureUrl: pose.textureUrl, frame, presentation: pose.frames[frame] };
}

/** 표정 아틀라스(1254×1254, 4×4 rounded-grid). 텍스처 등록은 장면 아트 런타임이 소유한다. */
export const STUDIO_CHARACTER_FACE_ATLAS = STUDIO_EXPERIENCE_ATLAS;
