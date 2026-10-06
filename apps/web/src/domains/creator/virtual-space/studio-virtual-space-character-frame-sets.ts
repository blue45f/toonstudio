import { STUDIO_EXPERIENCE_ATLAS, STUDIO_ACTOR_EXPRESSION_PRESENTATION } from "./studio-virtual-space-scene-art-runtime";
import type { StudioCharacterFramePresentation, StudioCharacterPoseSheet, StudioCharacterSkin } from "./studio-virtual-space-character-skins";
import { studioFaceSetName, type StudioEmotionKind, type StudioFaceSetName } from "./studio-virtual-space-character-motion";
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
 * - 라이브 표정 레이어(트랙 B)는 감정 이름(`face-<감정>`)으로 스킨의 `faces`를
 *   조회한다. `studioCharacterFaceSheets`가 이 등록부의 프레임·좌표를 감정
 *   이름의 포즈 시트로 변환해 드로잉 스킨 선언에 공급하므로, 등록부가 실제
 *   런타임 연결의 데이터 정본이다.
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

/** actor-emotions 시트의 격자 한 변(행·열 모두 4). 프레임 번호는 row * 4 + column이다. */
const FACE_SHEET_GRID = 4;

/**
 * 표정(열) → 감정 이름 변환. 라이브 표정 레이어의 정본 이름은 감정 쪽
 * (`face-<감정>`)이므로, 시트에 열이 있는 표정만 감정에 대응시킨다.
 *
 * - calm(평온) → neutral: 두 체계 모두 라벨이 "평온"인 기본 표정이다.
 * - happy(미소) → joy: 이모트·NPC 인사가 해석하는 기쁨의 얼굴이 활짝 웃음이다.
 * - surprised(놀람) → surprise: 이름·의미가 1:1로 대응한다.
 * - wave(인사)는 대응 감정이 없다. 이모트 wave는 joy로 해석되고 wave 상태는
 *   포즈 시트가 표정보다 우선하므로, 이 열은 기존 표정 경로 전용으로 남긴다.
 * - sadness·sleep·focus는 시트에 열이 없어 대응이 없다. 선언하지 않아야
 *   표정 레이어가 null을 돌려 기존 경로(프로시저럴·깜빡임)로 폴백한다.
 */
export const STUDIO_FACE_EMOTION_BY_EXPRESSION: Readonly<Partial<Record<StudioCharacterExpression, StudioEmotionKind>>> = Object.freeze({
  calm: "neutral",
  happy: "joy",
  surprised: "surprise",
});

/**
 * 드로잉 스킨의 `faces` 선언을 등록부 데이터로 만든다.
 * 행 매핑이 없는 스킨(actor-emotions에 자기 행이 없는 스킨)은 undefined —
 * 표정을 억지로 붙이지 않고 기존 경로를 유지한다.
 *
 * 시트는 정면 초상 하나가 네 방향을 모두 담당한다. 기존 표정 경로도 같은
 * 프레임을 전신 교체로 표시해 온 계약이며, 방향별 표정 작화는 존재하지 않는다.
 * 프레임·표시 좌표·텍스처는 전부 등록부와 장면 아트 런타임에서 가져온다.
 */
export function studioCharacterFaceSheets(
  skinKey: string,
): StudioCharacterSkin["faces"] | undefined {
  if (FACE_ROWS[skinKey] === undefined) return undefined;
  const sheets: Partial<Record<StudioFaceSetName, StudioCharacterPoseSheet>> = {};
  for (const set of STUDIO_CHARACTER_FACE_SETS) {
    const emotion = STUDIO_FACE_EMOTION_BY_EXPRESSION[set.expression];
    if (!emotion) continue;
    const resolved = studioCharacterFaceSetFrame(skinKey, set.name);
    if (!resolved) continue;
    const frame = resolved.frame;
    sheets[studioFaceSetName(emotion)] = Object.freeze({
      textureUrl: resolved.textureUrl,
      frameWidth: STUDIO_CHARACTER_FACE_ATLAS.width / FACE_SHEET_GRID,
      frameHeight: STUDIO_CHARACTER_FACE_ATLAS.height / FACE_SHEET_GRID,
      atlas: STUDIO_CHARACTER_FACE_ATLAS,
      directionFrames: Object.freeze({ down: frame, right: frame, left: frame, up: frame }),
      frames: STUDIO_ACTOR_EXPRESSION_PRESENTATION,
    });
  }
  return Object.freeze(sheets);
}
