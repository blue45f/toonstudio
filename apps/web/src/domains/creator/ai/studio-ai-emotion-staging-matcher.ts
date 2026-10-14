/**
 * Studio AI Emotion Staging Matcher — 대사 텍스트 → 표정·포즈 연출 제안.
 *
 * 투닝의 TTT(Text to Toon: 글이 감정을 읽어 캐릭터 표정·동작을 연출)를
 * 우리 구조로 흡수한 브리지다. 기존 `studio-ai-emotion-bubble-matcher`가
 * 텍스트→감정→말풍선 형태까지만 잇고 있어, 같은 감정 판정을 표정
 * 프리셋(EXPRESSION_PRESETS 28종)과 포즈 프리셋(72종) 추천으로 확장한다.
 * 기존 매처는 건드리지 않는다 (브리지 패턴, bubble-emotion-shapes 선례).
 *
 * 전부 순수·결정적. 규칙 기반이라 AI 연결 없이도 동작하고, 추천 id는
 * 실제 프리셋 id만 쓴다 (테스트가 정본 id 집합과 대조해 고정한다).
 */

import type { SpeechEmotionKind } from "./studio-ai-emotion-bubble-matcher";

/** 세분 감정 — 말풍선 6종보다 표정·포즈 연출에 맞게 나눈 분류. */
export type DialogueEmotionKind =
  | "joy"
  | "love"
  | "shame"
  | "anger"
  | "sorrow"
  | "fear"
  | "surprise"
  | "determination"
  | "confusion"
  | "neutral";

export interface DialogueEmotionDetail {
  readonly kind: DialogueEmotionKind;
  /** 감정 강도 0..1 — 느낌표·반복·매칭 수로 추정. */
  readonly intensity: number;
  /** 판정 신뢰도 0..1 — 매칭 근거가 없으면 낮다. */
  readonly confidence: number;
  /** 판정 근거가 된 어휘 (사용자에게 이유를 보여줄 때 쓴다). */
  readonly matchedTerms: readonly string[];
}

const LEXICON: Record<Exclude<DialogueEmotionKind, "neutral">, readonly string[]> = {
  joy: ["좋아", "행복", "기뻐", "기쁘", "신나", "최고", "웃", "하하", "히히", "ㅋㅋ", "만세", "해냈", "성공했"],
  love: ["사랑", "좋아해", "설레", "두근", "보고 싶", "귀여", "소중", "심쿵"],
  shame: ["부끄", "창피", "민망", "쑥스", "숨고 싶", "얼굴이 뜨거"],
  anger: ["화나", "짜증", "열받", "분노", "미워", "그만해", "시끄러", "꺼져", "죽을래"],
  sorrow: ["슬프", "슬퍼", "울고", "눈물", "미안", "죄송", "그리워", "외로", "ㅠㅠ", "ㅜㅜ", "흑흑"],
  fear: ["무서", "무섭", "두려", "떨려", "소름", "위험", "도망", "살려줘"],
  surprise: ["헐", "대박", "뭐라고", "놀라", "놀랐", "어머", "세상에", "말도 안", "진짜야"],
  determination: ["반드시", "꼭 해내", "포기 안", "포기하지", "각오", "지켜내", "이겨내", "결심"],
  confusion: ["모르겠", "헷갈", "무슨 소리", "이해가 안", "왜지", "글쎄", "뭐지"],
};

const EMOTION_LABELS: Record<DialogueEmotionKind, string> = {
  joy: "기쁨",
  love: "설렘·애정",
  shame: "부끄러움",
  anger: "분노",
  sorrow: "슬픔",
  fear: "공포",
  surprise: "놀람",
  determination: "결의",
  confusion: "당황·의문",
  neutral: "담담함",
};

export function dialogueEmotionLabel(kind: DialogueEmotionKind): string {
  return EMOTION_LABELS[kind];
}

/** 대사 텍스트에서 세분 감정과 강도를 규칙으로 판정한다. */
export function analyzeDialogueEmotionDetail(text: string): DialogueEmotionDetail {
  const source = text.slice(0, 2_000);
  let best: DialogueEmotionKind = "neutral";
  let bestScore = 0;
  let bestTerms: readonly string[] = [];
  (Object.keys(LEXICON) as (keyof typeof LEXICON)[]).forEach((kind) => {
    const terms = LEXICON[kind].filter((term) => source.includes(term));
    if (terms.length > bestScore) {
      best = kind;
      bestScore = terms.length;
      bestTerms = terms;
    }
  });
  const exclamations = (source.match(/!/g) ?? []).length;
  const intensityBase = bestScore === 0 ? 0.2 : 0.4 + 0.2 * bestScore;
  const intensity = Math.min(
    1,
    intensityBase + Math.min(0.3, exclamations * 0.1),
  );
  return {
    kind: best,
    intensity,
    confidence: bestScore === 0 ? 0.25 : Math.min(0.95, 0.5 + 0.2 * bestScore),
    matchedTerms: bestTerms,
  };
}

/** 세분 감정 → 기존 말풍선 감정 종류 (근사 브리지 — 말풍선 체인과 함께 쓰기 위함). */
const SPEECH_KIND_BRIDGE: Record<DialogueEmotionKind, SpeechEmotionKind> = {
  joy: "neutral-calm",
  love: "romance-blush",
  shame: "romance-blush",
  anger: "rage-shout",
  sorrow: "neutral-calm",
  fear: "shock-gasp",
  surprise: "shock-gasp",
  determination: "neutral-calm",
  confusion: "thought-monologue",
  neutral: "neutral-calm",
};

export function speechEmotionKindFor(kind: DialogueEmotionKind): SpeechEmotionKind {
  return SPEECH_KIND_BRIDGE[kind];
}

export interface StagingRecommendation {
  /** 추천 표정 프리셋 id — 앞쪽이 1순위. 전부 EXPRESSION_PRESETS 실재 id. */
  readonly expressionIds: readonly string[];
  /** 추천 포즈 프리셋 id — 앞쪽이 1순위. 전부 포즈 프리셋 실재 id. */
  readonly poseIds: readonly string[];
  /** 왜 이 연출인지 한 줄 이유. */
  readonly rationale: string;
}

const STAGING_TABLE: Record<DialogueEmotionKind, StagingRecommendation> = {
  joy: {
    expressionIds: ["xf_joy", "xf_grin", "xf_excited"],
    poseIds: ["xp_jump_joy", "xp_banzai", "xp_double_v"],
    rationale: "밝게 웃는 표정과 뛰거나 만세하는 동작이 기쁨을 바로 읽히게 해요.",
  },
  love: {
    expressionIds: ["xf_love", "xf_shy", "xf_innocent"],
    poseIds: ["xp_finger_heart", "xp_hold_heart", "xp_blush_cover"],
    rationale: "하트·수줍은 표정과 가슴에 손을 얹는 동작으로 설렘을 표현해요.",
  },
  shame: {
    expressionIds: ["xf_shy", "xf_pout", "xf_innocent"],
    poseIds: ["xp_blush_cover", "xp_hug_self", "xp_hands_behind"],
    rationale: "얼굴을 가리거나 몸을 움츠리는 동작이 부끄러움을 보여줘요.",
  },
  anger: {
    expressionIds: ["xf_angry", "xf_grudge", "xf_scream"],
    poseIds: ["xp_point_you", "xp_guard_up", "xp_hands_on_hips"],
    rationale: "삿대질·허리에 손을 얹는 동작이 분노의 방향을 분명히 해요.",
  },
  sorrow: {
    expressionIds: ["xf_sad", "xf_tears", "xf_blank"],
    poseIds: ["xp_teary", "xp_sad_sit", "xp_cry"],
    rationale: "주저앉거나 눈물을 닦는 동작으로 슬픔의 무게를 전달해요.",
  },
  fear: {
    expressionIds: ["xf_surprised", "xf_awe", "xf_blank"],
    poseIds: ["xp_guard", "xp_crouch", "xp_fall_back"],
    rationale: "방어 자세와 움츠린 동작이 위협 앞의 공포를 보여줘요.",
  },
  surprise: {
    expressionIds: ["xf_surprised", "xf_awe", "xf_blank"],
    poseIds: ["xp_shock", "xp_shock_hands", "xp_fall_back"],
    rationale: "두 손을 드는 놀람 동작이 반전 순간의 충격을 키워요.",
  },
  determination: {
    expressionIds: ["xf_determined", "xf_serious", "xf_focus"],
    poseIds: ["xp_fist_up", "xp_sword_ready", "xp_superhero"],
    rationale: "주먹을 쥐거나 무기를 드는 동작이 각오를 선언해요.",
  },
  confusion: {
    expressionIds: ["xf_confused", "xf_blank", "xf_pout"],
    poseIds: ["xp_shrug", "xp_think_chin", "xp_chin_rest"],
    rationale: "어깨를 으쓱하거나 턱을 괴는 동작이 의문을 말없이 전해요.",
  },
  neutral: {
    expressionIds: ["xf_neutral", "xf_cool", "xf_serious"],
    poseIds: ["ni_calm_front", "xp_idle_relax", "xp_lean_wall"],
    rationale: "담담한 대사는 표정·동작을 절제해야 다음 감정 컷이 살아요.",
  },
};

/** 감정이 강할 때(intensity ≥ 0.8) 1순위를 더 강한 변형으로 올린다. */
const INTENSE_FIRST_EXPRESSION: Partial<Record<DialogueEmotionKind, string>> = {
  joy: "xf_excited",
  anger: "xf_scream",
  sorrow: "xf_tears",
  surprise: "xf_awe",
};

export function recommendStagingForEmotion(
  kind: DialogueEmotionKind,
  intensity = 0.5,
): StagingRecommendation {
  const base = STAGING_TABLE[kind];
  const intenseFirst = INTENSE_FIRST_EXPRESSION[kind];
  if (intensity >= 0.8 && intenseFirst && base.expressionIds[0] !== intenseFirst) {
    return {
      ...base,
      expressionIds: [
        intenseFirst,
        ...base.expressionIds.filter((id) => id !== intenseFirst),
      ],
    };
  }
  return base;
}

export interface TextStagingResult {
  readonly detail: DialogueEmotionDetail;
  readonly staging: StagingRecommendation;
  /** 기존 말풍선 매처와 함께 쓸 때의 말풍선 감정 종류. */
  readonly bubbleKind: SpeechEmotionKind;
}

/** 대사 한 줄 → 감정 판정 + 표정·포즈 연출 제안까지 한 번에. */
export function recommendStagingForText(text: string): TextStagingResult {
  const detail = analyzeDialogueEmotionDetail(text);
  return {
    detail,
    staging: recommendStagingForEmotion(detail.kind, detail.intensity),
    bubbleKind: speechEmotionKindFor(detail.kind),
  };
}
