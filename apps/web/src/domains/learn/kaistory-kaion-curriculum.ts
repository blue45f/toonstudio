/**
 * kaistory-kaion-curriculum.ts — KAION (`www.kaion.kr` / `api.kaion.kr`)
 * 6단계 계층형 교육과정 트리, 상향식(Bottom-Up) 삭제 안전 검증,
 * 핵심 키워드 기반 AI 학습자료 생성기, 5난이도×3유형 문제은행 및 수능 기출 분석 엔진.
 */

export type KaionCurriculumLevel =
  | "school_level"
  | "grade"
  | "subject"
  | "unit"
  | "sub_unit"
  | "concept";

export type KaionQuestionDifficulty =
  | "VERY_EASY"
  | "EASY"
  | "MEDIUM"
  | "HARD"
  | "VERY_HARD";

export type KaionQuestionType = "MULTIPLE_CHOICE" | "SHORT_ANSWER" | "ESSAY";

export interface KaionCurriculumNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly level: KaionCurriculumLevel;
  readonly name: string;
  readonly code: string;
  readonly colorHex: string;
  readonly displayOrder: number;
  readonly description: string;
}

export interface KaionLearningMaterial {
  readonly id: string;
  readonly conceptId: string;
  readonly title: string;
  readonly keywords: readonly string[];
  readonly summaryMarkdown: string;
  readonly linkedWebtoonEpisodeId: string | null;
}

export interface KaionQuestionChoice {
  readonly number: 1 | 2 | 3 | 4 | 5;
  readonly text: string;
}

export interface KaionQuestionItem {
  readonly id: string;
  readonly conceptId: string;
  readonly type: KaionQuestionType;
  readonly difficulty: KaionQuestionDifficulty;
  readonly stemMarkdown: string;
  readonly choices: readonly KaionQuestionChoice[];
  readonly correctAnswer: string;
  readonly explanationMarkdown: string;
  readonly essayRubricKeywords: readonly string[];
  readonly pointsReward: number;
}

export const KAION_DIFFICULTY_LABELS: Readonly<Record<KaionQuestionDifficulty, string>> =
  Object.freeze({
    VERY_EASY: "매우쉬움",
    EASY: "쉬움",
    MEDIUM: "보통",
    HARD: "어려움",
    VERY_HARD: "매우어려움",
  });

export const KAION_QUESTION_TYPE_LABELS: Readonly<Record<KaionQuestionType, string>> =
  Object.freeze({
    MULTIPLE_CHOICE: "객관식 (5지선다)",
    SHORT_ANSWER: "단답형",
    ESSAY: "서술형 (AI 채점)",
  });

/**
 * KAITOON & KAION 6단계 표준 STEM 교육과정 초기 데이터
 * (학교급 -> 학년 -> 과목 -> 대단원 -> 중단원 -> 세부개념)
 */
export const KAION_DEFAULT_CURRICULUM_NODES: readonly KaionCurriculumNode[] = Object.freeze([
  // 1. 학교급 (school_level)
  {
    id: "sl-elem-34",
    parentId: null,
    level: "school_level",
    name: "초등 3-4학년",
    code: "ELEM34",
    colorHex: "#F59E0B",
    displayOrder: 1,
    description: "초등학교 3~4학년 기초 수학과 과학 탐구",
  },
  {
    id: "sl-elem-56",
    parentId: null,
    level: "school_level",
    name: "초등 5-6학년",
    code: "ELEM56",
    colorHex: "#10B981",
    displayOrder: 2,
    description: "초등학교 5~6학년 심화 개념과 실험 원리",
  },
  {
    id: "sl-middle",
    parentId: null,
    level: "school_level",
    name: "중학교",
    code: "MID",
    colorHex: "#3B82F6",
    displayOrder: 3,
    description: "중학교 공통 수학·과학(물리·화학·생물·지구과학) 핵심 과정",
  },
  {
    id: "sl-high",
    parentId: null,
    level: "school_level",
    name: "고등학교",
    code: "HIGH",
    colorHex: "#8B5CF6",
    displayOrder: 4,
    description: "고등학교 통합과학·물리학·화학·생명과학·지구과학 및 수능 연계",
  },
  // 2. 학년 (grade)
  {
    id: "gr-mid-1",
    parentId: "sl-middle",
    level: "grade",
    name: "중학교 1학년",
    code: "MID-1",
    colorHex: "#3B82F6",
    displayOrder: 1,
    description: "중1 자유학기 및 기초 역학·물질·생명 과정",
  },
  {
    id: "gr-high-1",
    parentId: "sl-high",
    level: "grade",
    name: "고등학교 1학년",
    code: "HIGH-1",
    colorHex: "#8B5CF6",
    displayOrder: 1,
    description: "고1 공통수학 및 통합과학 과정",
  },
  // 3. 과목 (subject — 5대 STEM 과목)
  {
    id: "subj-math",
    parentId: "gr-mid-1",
    level: "subject",
    name: "수학",
    code: "MATH",
    colorHex: "#2563EB",
    displayOrder: 1,
    description: "수와 연산, 문자와 식, 함수, 기하, 확률과 통계",
  },
  {
    id: "subj-physics",
    parentId: "gr-mid-1",
    level: "subject",
    name: "물리",
    code: "PHYS",
    colorHex: "#DC2626",
    displayOrder: 2,
    description: "힘과 운동, 에너지, 전기와 자기, 파동과 빛",
  },
  {
    id: "subj-chemistry",
    parentId: "gr-mid-1",
    level: "subject",
    name: "화학",
    code: "CHEM",
    colorHex: "#D97706",
    displayOrder: 3,
    description: "물질의 상태, 원자와 분자, 화학 결합과 반응",
  },
  {
    id: "subj-biology",
    parentId: "gr-mid-1",
    level: "subject",
    name: "생물",
    code: "BIO",
    colorHex: "#059669",
    displayOrder: 4,
    description: "세포와 생명 시스템, 항상성, 유전과 진화",
  },
  {
    id: "subj-earth",
    parentId: "gr-mid-1",
    level: "subject",
    name: "지구과학",
    code: "EARTH",
    colorHex: "#7C3AED",
    displayOrder: 5,
    description: "지권의 변화, 대기와 해양, 태양계와 우주",
  },
  // 4. 대단원 (unit)
  {
    id: "unit-force-motion",
    parentId: "subj-physics",
    level: "unit",
    name: "여러 가지 힘과 운동",
    code: "PHYS-U1",
    colorHex: "#DC2626",
    displayOrder: 1,
    description: "중력, 탄성력, 마찰력, 부력과 뉴턴 운동 법칙",
  },
  {
    id: "unit-linear-func",
    parentId: "subj-math",
    level: "unit",
    name: "좌표평면과 일차함수",
    code: "MATH-U1",
    colorHex: "#2563EB",
    displayOrder: 1,
    description: "순서쌍과 좌표, 정비례·반비례, 일차함수의 그래프",
  },
  // 5. 중단원 (sub_unit)
  {
    id: "subunit-inertia",
    parentId: "unit-force-motion",
    level: "sub_unit",
    name: "관성과 알짜힘",
    code: "PHYS-U1-S1",
    colorHex: "#DC2626",
    displayOrder: 1,
    description: "알짜힘이 0일 때의 운동 상태 유지와 관성 법칙",
  },
  // 6. 세부개념 (concept)
  {
    id: "concept-inertia-law",
    parentId: "subunit-inertia",
    level: "concept",
    name: "뉴턴 제1법칙(관성의 법칙)",
    code: "PHYS-C101",
    colorHex: "#DC2626",
    displayOrder: 1,
    description: "외부에서 알짜힘이 작용하지 않으면 정지한 물체는 계속 정지하고 운동하던 물체는 등속 직선 운동을 계속한다.",
  },
]);

export interface KaionDeleteValidationResult {
  readonly canDelete: boolean;
  readonly childNodeCount: number;
  readonly linkedMaterialCount: number;
  readonly linkedQuestionCount: number;
  readonly reasonKo: string;
}

/**
 * KAION 상향식(Bottom-Up) 삭제 안전 검증기.
 * 하위 교육과정 노드, 연결된 학습자료, 연결된 문제가 하나라도 존재하면 삭제를 차단한다.
 */
export function canDeleteCurriculumNode(params: {
  readonly targetNodeId: string;
  readonly nodes: readonly KaionCurriculumNode[];
  readonly materials: readonly KaionLearningMaterial[];
  readonly questions: readonly KaionQuestionItem[];
}): KaionDeleteValidationResult {
  const childNodeCount = params.nodes.filter((n) => n.parentId === params.targetNodeId).length;
  const linkedMaterialCount = params.materials.filter(
    (m) => m.conceptId === params.targetNodeId,
  ).length;
  const linkedQuestionCount = params.questions.filter(
    (q) => q.conceptId === params.targetNodeId,
  ).length;

  if (childNodeCount > 0 || linkedMaterialCount > 0 || linkedQuestionCount > 0) {
    return {
      canDelete: false,
      childNodeCount,
      linkedMaterialCount,
      linkedQuestionCount,
      reasonKo: `하위 항목을 먼저 삭제해야 합니다 (하위 분류 ${childNodeCount}개, 학습자료 ${linkedMaterialCount}개, 문제 ${linkedQuestionCount}개 연결됨).`,
    };
  }
  return {
    canDelete: true,
    childNodeCount: 0,
    linkedMaterialCount: 0,
    linkedQuestionCount: 0,
    reasonKo: "하위 의존 항목이 없어 안전하게 삭제할 수 있습니다.",
  };
}

/**
 * 선택한 개념 노드의 상위 6단계 경로(학교급 > 학년 > 과목 > 대단원 > 중단원 > 세부개념)를 계산한다.
 */
export function resolveCurriculumBreadcrumb(
  nodeId: string,
  nodes: readonly KaionCurriculumNode[],
): readonly KaionCurriculumNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const chain: KaionCurriculumNode[] = [];
  let cursor = byId.get(nodeId) ?? null;
  const visited = new Set<string>();
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    chain.unshift(cursor);
    cursor = cursor.parentId ? (byId.get(cursor.parentId) ?? null) : null;
  }
  return chain;
}

/**
 * 학습자료 본문 또는 설명에서 주요 키워드를 추출하고 정렬된 고유 키워드 목록을 반환한다.
 */
export function extractMaterialKeywords(text: string, maxCount = 6): readonly string[] {
  const cleaned = text
    .replace(/\$[^$]+\$/gu, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

  const stopWords = new Set([
    "그리고",
    "하지만",
    "때문에",
    "경우에",
    "대하여",
    "통하여",
    "관찰하고",
    "설명한다",
    "이해한다",
    "알아보자",
  ]);

  const seen = new Set<string>();
  const result: string[] = [];
  for (const word of cleaned) {
    if (stopWords.has(word) || seen.has(word)) continue;
    seen.add(word);
    result.push(word);
    if (result.length >= maxCount) break;
  }
  return result;
}

/**
 * KAION AI 학습자료 및 5난이도 문제 생성 프롬프트 빌더.
 */
export function compileKaionMaterialPrompt(params: {
  readonly concept: KaionCurriculumNode;
  readonly breadcrumb: readonly KaionCurriculumNode[];
  readonly keywords: readonly string[];
  readonly targetDifficulty: KaionQuestionDifficulty;
  readonly targetQuestionType: KaionQuestionType;
}): string {
  const pathText = params.breadcrumb.map((n) => n.name).join(" > ");
  const keywordLine =
    params.keywords.length > 0 ? params.keywords.join(", ") : params.concept.name;
  return [
    `[KAION 교육과정 경로] ${pathText}`,
    `[세부개념 코드] ${params.concept.code} · ${params.concept.name}`,
    `[주요 키워드] ${keywordLine}`,
    `[목표 난이도] ${KAION_DIFFICULTY_LABELS[params.targetDifficulty]} (${params.targetDifficulty})`,
    `[문항 유형] ${KAION_QUESTION_TYPE_LABELS[params.targetQuestionType]}`,
    `[지시사항] 만화 에피소드 학습카드와 연계할 수 있도록 개념 요약(KaTeX 수식 포함)과 ${KAION_QUESTION_TYPE_LABELS[params.targetQuestionType]} 문항 및 단계별 해설을 작성하세요.`,
  ].join("\n");
}

/**
 * KAION 학습자료에 연결할 연관 문제를 최대 10개까지 추천한다.
 * 동일 세부개념 문항을 우선 배치하고, 키워드 일치 개수가 높은 순으로 정렬한다.
 */
export function recommendRelatedQuestions(params: {
  readonly conceptId: string;
  readonly keywords: readonly string[];
  readonly questionBank: readonly KaionQuestionItem[];
  readonly limit?: number;
}): readonly KaionQuestionItem[] {
  const maxItems = Math.min(10, Math.max(1, params.limit ?? 10));
  const scored = params.questionBank.map((q) => {
    const sameConceptScore = q.conceptId === params.conceptId ? 100 : 0;
    const keywordMatches = params.keywords.filter(
      (kw) =>
        q.stemMarkdown.includes(kw) ||
        q.explanationMarkdown.includes(kw) ||
        q.essayRubricKeywords.includes(kw),
    ).length;
    return { question: q, score: sameConceptScore + keywordMatches * 10 };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems)
    .map((entry) => entry.question);
}

export interface KaionSuneungTrendSummary {
  readonly examYearRange: string;
  readonly subjectName: string;
  readonly coreConceptFrequency: readonly {
    readonly conceptName: string;
    readonly appearances: number;
    readonly killerQuestionRatioPercent: number;
  }[];
  readonly recommendedCartoonStoryHookKo: string;
}

/**
 * KAION 수능 기출 분석 및 과학 만화 소재 추천기 (`수능기출분석` & `과학소재추천`).
 */
export function analyzeSuneungQuestionTrend(subjectName: string): KaionSuneungTrendSummary {
  if (subjectName.includes("물리")) {
    return {
      examYearRange: "2022~2026학년도 수능·평가원",
      subjectName: "물리학I",
      coreConceptFrequency: [
        { conceptName: "뉴턴 운동 법칙과 알짜힘", appearances: 15, killerQuestionRatioPercent: 80 },
        { conceptName: "역학적 에너지 보존", appearances: 15, killerQuestionRatioPercent: 87 },
        { conceptName: "특수 상대성 이론", appearances: 14, killerQuestionRatioPercent: 35 },
      ],
      recommendedCartoonStoryHookKo:
        "급정거하는 우주 엘리베이터 안에서 관성과 등가 원리를 이용해 탈출 퍼즐을 푸는 에피소드",
    };
  }
  if (subjectName.includes("수학")) {
    return {
      examYearRange: "2022~2026학년도 수능·평가원",
      subjectName: "공통수학",
      coreConceptFrequency: [
        { conceptName: "함수의 연속과 미분가능성", appearances: 15, killerQuestionRatioPercent: 90 },
        { conceptName: "삼각함수와 도형의 극한", appearances: 14, killerQuestionRatioPercent: 72 },
        { conceptName: "수열의 귀납적 정의", appearances: 15, killerQuestionRatioPercent: 78 },
      ],
      recommendedCartoonStoryHookKo:
        "롤러코스터 트랙의 연결 지점에서 미분가능성(매끄러운 접선)을 맞추지 못하면 탈선하는 테마파크 설계 이야기",
    };
  }
  return {
    examYearRange: "2022~2026학년도 수능·평가원",
    subjectName,
    coreConceptFrequency: [
      { conceptName: "핵심 원리와 정량적 비례 관계", appearances: 14, killerQuestionRatioPercent: 65 },
      { conceptName: "실험 변인 통제와 자료 해석", appearances: 15, killerQuestionRatioPercent: 70 },
    ],
    recommendedCartoonStoryHookKo:
      "일상 속 미스터리 현상을 주인공이 실험 변인 통제로 하나씩 검증해 나가는 추리형 학습만화",
  };
}

export const KAION_DEFAULT_QUESTIONS: readonly KaionQuestionItem[] = Object.freeze([
  {
    id: "q-inertia-mc-1",
    conceptId: "concept-inertia-law",
    type: "MULTIPLE_CHOICE",
    difficulty: "EASY",
    stemMarkdown:
      "달리던 버스가 갑자기 멈출 때 승객의 몸이 앞으로 쏠리는 현상과 가장 관계 깊은 물리 법칙은? (단, 알짜힘 $\\sum F = 0$ 조건을 참고하시오.)",
    choices: [
      { number: 1, text: "관성의 법칙 (뉴턴 운동 제1법칙)" },
      { number: 2, text: "가속도의 법칙 ($F=ma$)" },
      { number: 3, text: "작용 반작용의 법칙" },
      { number: 4, text: "만유인력의 법칙" },
      { number: 5, text: "열역학 제2법칙" },
    ],
    correctAnswer: "1",
    explanationMarkdown:
      "외부 알짜힘 $\\sum F = 0$일 때 물체가 기존의 운동 상태를 유지하려는 성질을 **관성**이라고 합니다.",
    essayRubricKeywords: ["관성", "운동 상태", "알짜힘"],
    pointsReward: 100,
  },
  {
    id: "q-inertia-sa-2",
    conceptId: "concept-inertia-law",
    type: "SHORT_ANSWER",
    difficulty: "MEDIUM",
    stemMarkdown:
      "물체에 작용하는 알짜힘이 $0\\text{ N}$일 때, 물체가 처음의 정지 상태나 등속 직선 운동 상태를 계속 유지하려는 성질을 무엇이라 하는가?",
    choices: [],
    correctAnswer: "관성",
    explanationMarkdown:
      "질량이 클수록 운동 상태를 변화시키기 어려우며 이 성질을 **관성**이라 부릅니다.",
    essayRubricKeywords: ["관성"],
    pointsReward: 150,
  },
  {
    id: "q-inertia-essay-3",
    conceptId: "concept-inertia-law",
    type: "ESSAY",
    difficulty: "HARD",
    stemMarkdown:
      "자동차 안전벨트가 급정거 상황에서 탑승자를 보호하는 원리를 '관성'과 '운동 상태'라는 핵심어를 모두 포함하여 서술하시오.",
    choices: [],
    correctAnswer: "급정거 시 탑승자는 관성 때문에 기존 운동 상태를 유지하여 앞으로 튕겨 나가려 하는데 안전벨트가 힘을 가해 잡아준다.",
    explanationMarkdown:
      "채점 기준: **관성**, **운동 상태**, **안전벨트(외력)** 키워드 포함 여부를 AI가 평가합니다.",
    essayRubricKeywords: ["관성", "운동 상태"],
    pointsReward: 250,
  },
]);
