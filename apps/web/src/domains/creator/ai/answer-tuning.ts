/**
 * 답변 조절(answer-tuning) 공통 부품 — 순수 모듈.
 *
 * 투닝 챗의 "답변 조절"을 흡수한 멘토 챗(creator-mentor-chat)의 난이도·길이·
 * 창의성 조절을, AI 어시스트 허브 패널 전반이 공유하는 정본으로 추출한 것이다.
 * 생성 파라미터(temperature·maxTokens·전문 용어)를 직접 노출하지 않고 일상어
 * 3단계로만 보여주는 것이 핵심이며, 조절값은 장식이 아니라 실제 요청을 바꾼다:
 *
 * - 난이도·창의성·길이는 시스템 프롬프트 지시문으로 변환된다
 *   (buildAnswerTuningDirectives / applyAnswerTuningToSystemPrompt).
 * - 창의성은 temperature를 ±0.2 조정한다 (answerTuningTemperature).
 * - 길이는 maxTokens 배율(짧게 0.6× / 보통 1× / 자세히 1.8×)로 반영된다
 *   (answerTuningMaxTokens).
 *
 * 조절값을 넘기지 않는 기존 호출은 종전과 바이트 단위로 동일하게 동작한다 —
 * 이 모듈의 헬퍼는 호출부가 조절값을 명시했을 때만 적용한다.
 */

/** 답변 난이도 — 일상어 조절값. */
export type AnswerDifficulty = "easy" | "standard" | "deep";
/** 답변 길이. */
export type AnswerLength = "short" | "standard" | "detailed";
/** 답변 창의성 — 사실·근거 위주인지, 제안·확장 위주인지. */
export type AnswerCreativity = "grounded" | "balanced" | "free";

/** 답변 조절값 묶음 — 모든 AI 텍스트 패널이 공유하는 값 계약. */
export interface AnswerTuning {
  readonly difficulty: AnswerDifficulty;
  readonly length: AnswerLength;
  readonly creativity: AnswerCreativity;
}

export const DEFAULT_ANSWER_TUNING: AnswerTuning = {
  difficulty: "standard",
  length: "standard",
  creativity: "balanced",
};

export const ANSWER_DIFFICULTIES: readonly AnswerDifficulty[] = ["easy", "standard", "deep"];
export const ANSWER_LENGTHS: readonly AnswerLength[] = ["short", "standard", "detailed"];
export const ANSWER_CREATIVITIES: readonly AnswerCreativity[] = ["grounded", "balanced", "free"];

/** 조절값 UI 라벨 (ko/en) — 멘토 챗과 AI 패널이 공유한다. */
export const ANSWER_TUNING_LABELS = {
  difficulty: {
    label: { ko: "난이도", en: "Difficulty" },
    options: {
      easy: { ko: "쉽게", en: "Easy" },
      standard: { ko: "보통", en: "Standard" },
      deep: { ko: "깊게", en: "Deep" },
    },
  },
  length: {
    label: { ko: "답변 길이", en: "Length" },
    options: {
      short: { ko: "짧게", en: "Short" },
      standard: { ko: "보통", en: "Standard" },
      detailed: { ko: "자세히", en: "Detailed" },
    },
  },
  creativity: {
    label: { ko: "창의성", en: "Creativity" },
    options: {
      grounded: { ko: "근거 위주", en: "Grounded" },
      balanced: { ko: "균형", en: "Balanced" },
      free: { ko: "자유롭게", en: "Free" },
    },
  },
} as const;

export const ANSWER_DIFFICULTY_DIRECTIVES: Record<AnswerDifficulty, string> = {
  easy: "중학생도 이해할 수 있는 쉬운 말로, 전문 용어는 풀어서 설명한다.",
  standard: "창작 실무자가 쓰는 보통 수준의 용어로 설명한다.",
  deep: "작법 이론과 구조 용어를 적극적으로 쓰고, 근거와 대안까지 깊게 파고든다.",
};

/** 산문(prose) 답변용 길이 지시 — 멘토 챗이 쓰던 문구 그대로가 정본이다. */
export const ANSWER_LENGTH_DIRECTIVES: Record<AnswerLength, string> = {
  short: "답변은 3문장 이내로 핵심만 말한다.",
  standard: "답변은 2~4개 단락으로, 요점과 이유를 함께 말한다.",
  detailed: "답변은 단계별로 나눠 예시까지 들어 자세히 말한다.",
};

/**
 * 구조화(JSON 등 스키마 고정) 답변용 길이 지시 — "3문장 이내" 같은 산문 문구는
 * 스키마를 깨뜨릴 수 있어, 양·상세도만 조절하고 형식 불변을 명시한다.
 */
export const ANSWER_LENGTH_DIRECTIVES_STRUCTURED: Record<AnswerLength, string> = {
  short: "결과의 양은 핵심만 남긴다. 부가 설명 문구는 최소로 쓴다. 정해진 출력 형식(스키마)은 바꾸지 않는다.",
  standard: "결과의 양은 보통 수준으로, 필요한 설명을 함께 낸다. 정해진 출력 형식(스키마)은 바꾸지 않는다.",
  detailed: "결과를 풍부하게 구성하고 항목별 설명을 자세히 쓴다. 정해진 출력 형식(스키마)은 바꾸지 않는다.",
};

export const ANSWER_CREATIVITY_DIRECTIVES: Record<AnswerCreativity, string> = {
  grounded: "확인된 작법 원칙과 근거 중심으로만 답하고, 추측은 추측이라고 밝힌다.",
  balanced: "원칙을 기준으로 하되 작품에 맞는 응용 제안을 함께 낸다.",
  free: "파격적인 대안과 실험적인 제안까지 적극적으로 낸다. 단, 사실과 제안은 구분해 밝힌다.",
};

export type AnswerTuningFormat = "prose" | "structured";

/** 조절값 → 시스템 프롬프트 지시문 3줄(난이도·길이·창의성 순). */
export function buildAnswerTuningDirectives(
  tuning: AnswerTuning,
  format: AnswerTuningFormat = "prose",
): readonly string[] {
  const lengthDirectives =
    format === "structured" ? ANSWER_LENGTH_DIRECTIVES_STRUCTURED : ANSWER_LENGTH_DIRECTIVES;
  return [
    ANSWER_DIFFICULTY_DIRECTIVES[tuning.difficulty],
    lengthDirectives[tuning.length],
    ANSWER_CREATIVITY_DIRECTIVES[tuning.creativity],
  ];
}

/** 기존 시스템 프롬프트 끝에 조절 지시문을 붙인다. 원문은 바꾸지 않는다. */
export function applyAnswerTuningToSystemPrompt(
  systemPrompt: string,
  tuning: AnswerTuning,
  format: AnswerTuningFormat = "prose",
): string {
  return [systemPrompt, ...buildAnswerTuningDirectives(tuning, format)].join("\n");
}

const CREATIVITY_TEMPERATURE_DELTA: Record<AnswerCreativity, number> = {
  grounded: -0.2,
  balanced: 0,
  free: 0.2,
};

/** 창의성 → temperature 조정. 기준값을 0~2 범위로 자르고 소수 1자리로 반올림한다. */
export function answerTuningTemperature(base: number, tuning: AnswerTuning): number {
  const adjusted = Math.round((base + CREATIVITY_TEMPERATURE_DELTA[tuning.creativity]) * 10) / 10;
  return Math.min(2, Math.max(0, adjusted));
}

const LENGTH_MAX_TOKENS_MULTIPLIER: Record<AnswerLength, number> = {
  short: 0.6,
  standard: 1,
  detailed: 1.8,
};

/** 길이 → maxTokens 조정. 10 단위 반올림, 하한 100. */
export function answerTuningMaxTokens(base: number, tuning: AnswerTuning): number {
  const scaled = Math.round((base * LENGTH_MAX_TOKENS_MULTIPLIER[tuning.length]) / 10) * 10;
  return Math.max(100, scaled);
}

export function isDefaultAnswerTuning(tuning: AnswerTuning): boolean {
  return (
    tuning.difficulty === DEFAULT_ANSWER_TUNING.difficulty &&
    tuning.length === DEFAULT_ANSWER_TUNING.length &&
    tuning.creativity === DEFAULT_ANSWER_TUNING.creativity
  );
}

/**
 * 저장소·외부 입력처럼 신뢰할 수 없는 값에서 조절값을 복원한다.
 * 필드별로 검증해, 잘못된 필드만 기본값으로 되돌린다(전체 폐기 아님).
 */
export function normalizeAnswerTuning(input: unknown): AnswerTuning {
  if (!input || typeof input !== "object") return DEFAULT_ANSWER_TUNING;
  const record = input as Record<string, unknown>;
  return {
    difficulty: (ANSWER_DIFFICULTIES as readonly string[]).includes(record.difficulty as string)
      ? (record.difficulty as AnswerDifficulty)
      : DEFAULT_ANSWER_TUNING.difficulty,
    length: (ANSWER_LENGTHS as readonly string[]).includes(record.length as string)
      ? (record.length as AnswerLength)
      : DEFAULT_ANSWER_TUNING.length,
    creativity: (ANSWER_CREATIVITIES as readonly string[]).includes(record.creativity as string)
      ? (record.creativity as AnswerCreativity)
      : DEFAULT_ANSWER_TUNING.creativity,
  };
}
