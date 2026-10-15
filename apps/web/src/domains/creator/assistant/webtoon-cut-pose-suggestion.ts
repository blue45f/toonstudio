/**
 * webtoon-cut-pose-suggestion.ts
 *
 * 컷의 감정·샷 크기·카메라 앵글을 입력으로 포즈 프리셋을 점수화해 상위 몇 개(기본 3)를
 * 이유 문구와 함께 추천하는 순수 로직. 결정적이며 DOM/React/네트워크/시계/난수에 의존하지 않는다.
 *
 * 이 모듈은 "추천"만 한다. 적용은 호출한 화면이 사용자의 명시적 행동으로만 일으키고, 되돌리기는
 * 기존 컷 포즈 계약(`studio-cut-pose.ts`)과 편집기 페이지 히스토리를 쓴다 — 여기에는 상태도
 * 부수효과도 없다.
 *
 * 점수는 휴리스틱이다 (2026-10-15)
 * -------------------------------
 * 프리셋마다의 감정·몸 범위·앵글 특성은 `webtoon-cut-pose-traits.ts` 의 사람이 정리한 표이고,
 * 아래 비중과 적합도 값도 이 저장소가 정했을 뿐 검증된 수치가 아니다. 화면과 문서가 같은 설정
 * 객체(`CUT_POSE_SCORE_CONFIG`)에서 값을 읽는다.
 *
 *   점수 = round(100 × (0.6 × 감정 적합 + 0.25 × 샷 적합 + 0.15 × 앵글 적합))
 *   감정이 표에 없는 포즈는 후보에서 뺀다 — 샷·앵글이 맞는다고 엉뚱한 감정의 포즈를 권하지 않는다.
 *   샷·앵글을 모르면 모든 포즈에 같은 중립값을 줘 순위에 영향을 주지 않고, 그 요소의 이유 문구도 쓰지 않는다.
 */

import { CUT_POSE_TRAITS, type CutPoseBody, type CutPoseTraits } from "./webtoon-cut-pose-traits";
import {
  CUT_CAMERA_ANGLE_LABELS,
  CUT_EMOTION_LABELS,
  CUT_SHOT_SCALE_LABELS,
  isCutCameraAngle,
  isCutEmotion,
  isCutShotScale,
} from "./webtoon-cut-vocabulary";

import type {
  CharacterEmotionalTone,
  StoryboardCameraAngle,
  StoryboardShotScale,
} from "../ai/studio-ai-storyboard-director";

export const CUT_POSE_SUGGESTION_VERSION = 1 as const;

/** 모든 계수와 적합도. 화면의 "추천 방법" 설명과 문서가 이 객체에서 값을 읽는다. */
export const CUT_POSE_SCORE_CONFIG = Object.freeze({
  weights: Object.freeze({ emotion: 0.6, shot: 0.25, angle: 0.15 }),
  /** 표에서 감정이 몇 번째로 적혀 있는지에 따른 적합도(첫째, 둘째, 셋째). */
  emotionRankFit: Object.freeze([1, 0.7, 0.45] as const),
  /** 몸 범위(upper/full) × 샷 크기 적합도. */
  shotFit: Object.freeze({
    upper: Object.freeze({
      "extreme-close-up": 1,
      "close-up": 1,
      "medium-shot": 1,
      "full-shot": 0.7,
      "long-shot": 0.4,
      "birds-eye": 0.5,
      "worms-eye": 0.7,
    } satisfies Record<StoryboardShotScale, number>),
    full: Object.freeze({
      "extreme-close-up": 0.1,
      "close-up": 0.2,
      "medium-shot": 0.6,
      "full-shot": 1,
      "long-shot": 1,
      "birds-eye": 0.9,
      "worms-eye": 1,
    } satisfies Record<StoryboardShotScale, number>),
  }),
  angleFit: Object.freeze({
    /** 아이레벨은 어떤 포즈에도 무난하다. */
    eyeLevel: 0.8,
    /** 포즈가 특히 살아나는 앵글로 표에 적힌 경우. */
    match: 1,
    /** 앵글 특성이 따로 없는 포즈. */
    neutral: 0.55,
    /** 다른 앵글에서 더 잘 읽힌다고 표에 적힌 포즈. */
    mismatch: 0.25,
  }),
  /** 모르는 요소에 모든 포즈 공통으로 주는 중립값(순위에 영향 없음). */
  unknown: Object.freeze({ shot: 0.6, angle: 0.8 }),
  /** 샷 적합도가 이 값 이상이면 "잘 읽혀요", 이하면 "잘릴 수 있어요" 이유를 붙인다. */
  readableShotFit: 0.9,
  croppedShotFit: 0.3,
  defaultLimit: 3,
  maxLimit: 10,
});

/** 추천 대상 포즈 한 개. `StudioPosePreset` 과 구조가 호환된다(필요한 필드만 읽는다). */
export interface CutPoseCandidate {
  readonly id: string;
  readonly label: string;
  readonly tone: string;
}

export interface CutPoseSuggestionInput {
  readonly emotion: CharacterEmotionalTone;
  /** 모르면 생략하거나 null. */
  readonly shotScale?: StoryboardShotScale | null;
  readonly cameraAngle?: StoryboardCameraAngle | null;
}

export type CutPoseReasonCode =
  | "emotion-primary"
  | "emotion-secondary"
  | "emotion-alternative"
  | "shot-readable"
  | "shot-cropped"
  | "angle-match"
  | "angle-mismatch";

export interface CutPoseReasonText {
  readonly ko: string;
  readonly en: string;
}

export interface CutPoseReason {
  readonly code: CutPoseReasonCode;
  /** match = 추천 근거, caution = 쓸 때 주의할 점. */
  readonly tone: "match" | "caution";
  readonly text: CutPoseReasonText;
}

export interface CutPoseSuggestion {
  readonly presetId: string;
  readonly label: string;
  readonly tone: string;
  /** 1부터 시작하는 추천 순위. */
  readonly rank: number;
  /** 0~100 정수. 상대 비교용이며 확률이 아니다. */
  readonly score: number;
  /** 요소별 적합도(0~1). 모르는 샷·앵글은 null. */
  readonly fit: Readonly<{ emotion: number; shot: number | null; angle: number | null }>;
  readonly reasons: readonly CutPoseReason[];
}

/**
 * 0~100 정수 점수. 곱셈의 부동소수 잡음(92.49999999999999 처럼 .5 경계에서 한 칸 틀어지는 값)이
 * 점수를 흔들지 않도록 6자리에서 한 번 정리한 뒤 반올림한다.
 */
function toScore(total: number): number {
  return Math.round(Math.round(total * 100 * 1e6) / 1e6);
}

/** 표에 적힌 감정 순위(0 기반). 없으면 -1. */
function emotionRank(traits: CutPoseTraits, emotion: CharacterEmotionalTone): number {
  return traits.emotions.indexOf(emotion);
}

function shotFitFor(body: CutPoseBody, shotScale: StoryboardShotScale): number {
  return CUT_POSE_SCORE_CONFIG.shotFit[body][shotScale];
}

function angleFitFor(traits: CutPoseTraits, angle: StoryboardCameraAngle): number {
  const { angleFit } = CUT_POSE_SCORE_CONFIG;
  if (angle === "eye-level") return angleFit.eyeLevel;
  if (traits.angles.length === 0) return angleFit.neutral;
  return traits.angles.includes(angle) ? angleFit.match : angleFit.mismatch;
}

function emotionReason(rank: number, emotion: CharacterEmotionalTone): CutPoseReason {
  const label = CUT_EMOTION_LABELS[emotion];
  if (rank === 0) {
    return {
      code: "emotion-primary",
      tone: "match",
      text: {
        ko: `${label.ko} 컷에 가장 잘 어울리는 동작으로 분류했어요`,
        en: `Classified as the best fit for a ${label.en} beat`,
      },
    };
  }
  if (rank === 1) {
    return {
      code: "emotion-secondary",
      tone: "match",
      text: {
        ko: `${label.ko} 컷에도 어울리는 보조 동작이에요`,
        en: `Also works for a ${label.en} beat`,
      },
    };
  }
  return {
    code: "emotion-alternative",
    tone: "match",
    text: {
      ko: `${label.ko} 컷에 쓸 수 있는 대안 동작이에요`,
      en: `A usable alternative for a ${label.en} beat`,
    },
  };
}

function shotReason(fit: number, shotScale: StoryboardShotScale): CutPoseReason | null {
  const { readableShotFit, croppedShotFit } = CUT_POSE_SCORE_CONFIG;
  const label = CUT_SHOT_SCALE_LABELS[shotScale];
  if (fit >= readableShotFit) {
    return {
      code: "shot-readable",
      tone: "match",
      text: {
        ko: `${label.ko}에서 동작이 잘 읽혀요`,
        en: `The pose reads clearly in a ${label.en}`,
      },
    };
  }
  if (fit <= croppedShotFit) {
    return {
      code: "shot-cropped",
      tone: "caution",
      text: {
        ko: `${label.ko}에서는 동작 일부가 화면 밖으로 잘릴 수 있어요`,
        en: `Part of the pose may be cropped in a ${label.en}`,
      },
    };
  }
  return null;
}

function angleReason(
  traits: CutPoseTraits,
  angle: StoryboardCameraAngle,
): CutPoseReason | null {
  if (angle === "eye-level" || traits.angles.length === 0) return null;
  const label = CUT_CAMERA_ANGLE_LABELS[angle];
  if (traits.angles.includes(angle)) {
    return {
      code: "angle-match",
      tone: "match",
      text: {
        ko: `${label.ko}에서 실루엣이 살아요`,
        en: `The silhouette works well from a ${label.en}`,
      },
    };
  }
  const preferred = traits.angles.map((candidate) => CUT_CAMERA_ANGLE_LABELS[candidate]);
  return {
    code: "angle-mismatch",
    tone: "caution",
    text: {
      ko: `이 포즈는 ${preferred.map((entry) => entry.ko).join("·")}에서 더 잘 읽혀요`,
      en: `This pose reads better from a ${preferred.map((entry) => entry.en).join(" / ")}`,
    },
  };
}

function clampLimit(limit: number | undefined): number {
  const { defaultLimit, maxLimit } = CUT_POSE_SCORE_CONFIG;
  if (limit === undefined || !Number.isFinite(limit)) return defaultLimit;
  return Math.min(maxLimit, Math.max(1, Math.floor(limit)));
}

/**
 * 카탈로그를 점수화해 상위 `limit` 개(기본 3)를 순위대로 돌려준다.
 * 감정이 어휘에 없거나 카탈로그가 비면 빈 배열. 점수 동률은 감정 순위가 앞선 것, 그다음 이 감정
 * 하나에 더 특화된 것(표에 적힌 감정 수가 적은 것), 마지막으로 id 순이다 — 카탈로그 순서에 따라
 * 결과가 달라지지 않는다. 특성 표에 없는 프리셋은 근거가 없어 후보에서 빠진다.
 */
export function suggestCutPoses(
  input: CutPoseSuggestionInput,
  catalog: readonly CutPoseCandidate[],
  options: { readonly limit?: number } = {},
): readonly CutPoseSuggestion[] {
  if (!isCutEmotion(input.emotion)) return Object.freeze([]);
  const emotion = input.emotion;
  const shotScale = isCutShotScale(input.shotScale) ? input.shotScale : null;
  const cameraAngle = isCutCameraAngle(input.cameraAngle) ? input.cameraAngle : null;
  const { weights, emotionRankFit, unknown } = CUT_POSE_SCORE_CONFIG;

  const scored: {
    suggestion: Omit<CutPoseSuggestion, "rank">;
    emotionRank: number;
    emotionCount: number;
  }[] = [];
  const seen = new Set<string>();
  for (const candidate of catalog) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    const traits = Object.prototype.hasOwnProperty.call(CUT_POSE_TRAITS, candidate.id)
      ? CUT_POSE_TRAITS[candidate.id]
      : undefined;
    if (traits === undefined) continue;
    const rank = emotionRank(traits, emotion);
    if (rank < 0) continue;

    const emotionFit = emotionRankFit[Math.min(rank, emotionRankFit.length - 1)];
    const shotFit = shotScale === null ? null : shotFitFor(traits.body, shotScale);
    const angleFit = cameraAngle === null ? null : angleFitFor(traits, cameraAngle);
    const total =
      weights.emotion * emotionFit +
      weights.shot * (shotFit ?? unknown.shot) +
      weights.angle * (angleFit ?? unknown.angle);

    const reasons: CutPoseReason[] = [emotionReason(rank, emotion)];
    const shot = shotScale === null || shotFit === null ? null : shotReason(shotFit, shotScale);
    if (shot !== null) reasons.push(shot);
    const angle = cameraAngle === null ? null : angleReason(traits, cameraAngle);
    if (angle !== null) reasons.push(angle);

    scored.push({
      emotionRank: rank,
      emotionCount: traits.emotions.length,
      suggestion: {
        presetId: candidate.id,
        label: candidate.label,
        tone: candidate.tone,
        score: toScore(total),
        fit: Object.freeze({ emotion: emotionFit, shot: shotFit, angle: angleFit }),
        reasons: Object.freeze(
          reasons.map((reason) => Object.freeze({ ...reason, text: Object.freeze(reason.text) })),
        ),
      },
    });
  }

  scored.sort(
    (a, b) =>
      b.suggestion.score - a.suggestion.score ||
      a.emotionRank - b.emotionRank ||
      a.emotionCount - b.emotionCount ||
      (a.suggestion.presetId < b.suggestion.presetId
        ? -1
        : a.suggestion.presetId > b.suggestion.presetId
          ? 1
          : 0),
  );

  return Object.freeze(
    scored
      .slice(0, clampLimit(options.limit))
      .map((entry, index) => Object.freeze({ ...entry.suggestion, rank: index + 1 })),
  );
}

/** 프리셋 목록(`StudioPosePreset` 구조 호환)에서 추천에 필요한 필드만 뽑아 카탈로그를 만든다. */
export function poseCandidatesFromPresets(
  ...lists: readonly (readonly CutPoseCandidate[])[]
): readonly CutPoseCandidate[] {
  return Object.freeze(
    lists.flatMap((list) =>
      list.map((preset) => Object.freeze({ id: preset.id, label: preset.label, tone: preset.tone })),
    ),
  );
}
