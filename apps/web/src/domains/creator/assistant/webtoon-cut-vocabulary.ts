/**
 * webtoon-cut-vocabulary.ts
 *
 * 콘티 컷의 감정·샷 크기·카메라 앵글 어휘를 사람이 읽는 라벨(한/영)로 옮기는 표.
 * 텐션 맵의 표·상세 카드와 포즈 추천의 이유 문구가 같은 낱말을 쓰도록 한 곳에 둔다.
 *
 * 어휘 자체(`CharacterEmotionalTone` 등)의 정본은 `ai/studio-ai-storyboard-director.ts` 다.
 * 여기서는 그 타입을 가져와 `Record` 로 라벨을 달기 때문에, 정본에 값이 늘면 이 표가
 * 컴파일 오류로 먼저 알려 준다. 부수효과 없는 순수 데이터 모듈이다.
 */

import type {
  CharacterEmotionalTone,
  StoryboardCameraAngle,
  StoryboardShotScale,
} from "../ai/studio-ai-storyboard-director";

export interface CutVocabularyLabel {
  readonly ko: string;
  readonly en: string;
}

/** 화면에 나열하는 순서 — 긴장이 높은 감정부터 낮은 감정 순. */
export const CUT_EMOTION_ORDER: readonly CharacterEmotionalTone[] = Object.freeze([
  "rage",
  "shock",
  "determination",
  "sorrow",
  "joy",
  "calm",
]);

/** 화면에 나열하는 순서 — 좁은 화각에서 넓은 화각, 구도형 샷 순. */
export const CUT_SHOT_SCALE_ORDER: readonly StoryboardShotScale[] = Object.freeze([
  "extreme-close-up",
  "close-up",
  "medium-shot",
  "full-shot",
  "long-shot",
  "birds-eye",
  "worms-eye",
]);

export const CUT_CAMERA_ANGLE_ORDER: readonly StoryboardCameraAngle[] = Object.freeze([
  "eye-level",
  "low-angle",
  "high-angle",
  "dutch-tilt",
]);

export const CUT_EMOTION_LABELS: Readonly<Record<CharacterEmotionalTone, CutVocabularyLabel>> =
  Object.freeze({
    rage: Object.freeze({ ko: "분노", en: "Rage" }),
    shock: Object.freeze({ ko: "충격", en: "Shock" }),
    determination: Object.freeze({ ko: "결의", en: "Resolve" }),
    sorrow: Object.freeze({ ko: "슬픔", en: "Sorrow" }),
    joy: Object.freeze({ ko: "기쁨", en: "Joy" }),
    calm: Object.freeze({ ko: "평온", en: "Calm" }),
  });

export const CUT_SHOT_SCALE_LABELS: Readonly<Record<StoryboardShotScale, CutVocabularyLabel>> =
  Object.freeze({
    "extreme-close-up": Object.freeze({ ko: "익스트림 클로즈업", en: "Extreme close-up" }),
    "close-up": Object.freeze({ ko: "클로즈업", en: "Close-up" }),
    "medium-shot": Object.freeze({ ko: "미디엄 샷", en: "Medium shot" }),
    "full-shot": Object.freeze({ ko: "풀 샷", en: "Full shot" }),
    "long-shot": Object.freeze({ ko: "롱 샷", en: "Long shot" }),
    "birds-eye": Object.freeze({ ko: "버즈아이", en: "Bird's-eye" }),
    "worms-eye": Object.freeze({ ko: "웜즈아이", en: "Worm's-eye" }),
  });

export const CUT_CAMERA_ANGLE_LABELS: Readonly<
  Record<StoryboardCameraAngle, CutVocabularyLabel>
> = Object.freeze({
  "eye-level": Object.freeze({ ko: "아이레벨", en: "Eye level" }),
  "low-angle": Object.freeze({ ko: "로우 앵글", en: "Low angle" }),
  "high-angle": Object.freeze({ ko: "하이 앵글", en: "High angle" }),
  "dutch-tilt": Object.freeze({ ko: "더치 앵글", en: "Dutch tilt" }),
});

/** 런타임 값(외부 문서·저장값)이 감정 어휘에 속하는지 좁힌다. */
export function isCutEmotion(value: unknown): value is CharacterEmotionalTone {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CUT_EMOTION_LABELS, value);
}

export function isCutShotScale(value: unknown): value is StoryboardShotScale {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CUT_SHOT_SCALE_LABELS, value);
}

export function isCutCameraAngle(value: unknown): value is StoryboardCameraAngle {
  return (
    typeof value === "string" && Object.prototype.hasOwnProperty.call(CUT_CAMERA_ANGLE_LABELS, value)
  );
}
