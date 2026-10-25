/**
 * kaistory-kaitoon-learning.ts — KAITOON (`kaitoon.kaistory.net`)
 * 만화+교육 통합 플랫폼 엔진:
 * - KaTeX 수식 CJK(한·중·일) 조사 경계 정규화기 & 마크다운 헤딩 교정기
 * - 3유형(객관식·단답형·AI 서술형) 채점 및 포인트 지급기
 * - 오답노트(`반복 오답` 감지 · 미해결/해결 필터) & 과목별 우수(≥90%)/부진(≤40%) 성취도 통계
 * - 문항 오류 신고(`표시 문제` · `정답 오류` · `기타`)
 * - 포인트 원장(`첫 정답` · `재도전` · `가입 보너스` · `관리자 조정` · `환불` · `차감`) 및 1주일 에피소드 열람권
 * - 엄선 15개 외부 STEM 학습 리소스 디렉터리
 */

import type { KaionQuestionItem } from "./kaistory-kaion-curriculum";

export type KaitoonPointTransactionType =
  | "FIRST_CORRECT"
  | "RETRY_CORRECT"
  | "SIGNUP_BONUS"
  | "ADMIN_ADJUST"
  | "REFUND"
  | "EPISODE_UNLOCK_DEDUCT";

export const KAITOON_POINT_TRANSACTION_LABELS: Readonly<
  Record<KaitoonPointTransactionType, string>
> = Object.freeze({
  FIRST_CORRECT: "첫 정답",
  RETRY_CORRECT: "재도전",
  SIGNUP_BONUS: "가입 보너스",
  ADMIN_ADJUST: "관리자 조정",
  REFUND: "환불",
  EPISODE_UNLOCK_DEDUCT: "차감",
});

export type KaitoonIssueCategory = "DISPLAY_ISSUE" | "ANSWER_ERROR" | "OTHER";

export const KAITOON_ISSUE_CATEGORY_LABELS: Readonly<Record<KaitoonIssueCategory, string>> =
  Object.freeze({
    DISPLAY_ISSUE: "표시 문제 (수식·이미지 깨짐)",
    ANSWER_ERROR: "정답 오류 (정답·해설 이의)",
    OTHER: "기타",
  });

export interface KaitoonExternalStemSite {
  readonly id: string;
  readonly name: string;
  readonly category: "시뮬레이션·도구" | "교과·백과" | "과학 미디어";
  readonly subjectTags: readonly string[];
  readonly url: string;
  readonly summaryKo: string;
}

/**
 * KAITOON 엄선 15개 외부 수학·과학(STEM) 학습 사이트 디렉터리
 */
export const KAITOON_EXTERNAL_STEM_SITES: readonly KaitoonExternalStemSite[] = Object.freeze([
  {
    id: "phet",
    name: "PhET 시뮬레이션",
    category: "시뮬레이션·도구",
    subjectTags: ["물리", "화학", "수학", "생물", "지구과학"],
    url: "https://phet.colorado.edu/ko/",
    summaryKo: "콜로라도 대학교의 대화형 물리·화학·수학 실험 시뮬레이션",
  },
  {
    id: "ptable",
    name: "Ptable 동적 주기율표",
    category: "시뮬레이션·도구",
    subjectTags: ["화학"],
    url: "https://ptable.com/?lang=ko",
    summaryKo: "원소별 전자 배치·동위원소·화합물 특성을 실시간 탐색하는 주기율표",
  },
  {
    id: "desmos",
    name: "Desmos 그래프 계산기",
    category: "시뮬레이션·도구",
    subjectTags: ["수학"],
    url: "https://www.desmos.com/calculator?lang=ko",
    summaryKo: "함수·미적분·기하 그래프를 즉시 시각화하고 슬라이더로 조작하는 계산기",
  },
  {
    id: "khan-math",
    name: "칸아카데미 수학",
    category: "교과·백과",
    subjectTags: ["수학"],
    url: "https://ko.khanacademy.org/math",
    summaryKo: "초·중·고 수학 전 과정 개념 영상과 단계별 연습 문제",
  },
  {
    id: "scienceall",
    name: "사이언스올 (ScienceAll)",
    category: "교과·백과",
    subjectTags: ["물리", "화학", "생물", "지구과학"],
    url: "https://www.scienceall.com/",
    summaryKo: "한국과학창의재단이 운영하는 과학 포털 및 과학백과사전",
  },
  {
    id: "lg-scienceland",
    name: "LG사이언스랜드 과학송·실험",
    category: "교과·백과",
    subjectTags: ["물리", "화학", "생물", "지구과학"],
    url: "https://www.lgsl.kr/",
    summaryKo: "과학송과 생활 속 과학 실험 가이드를 제공하는 청소년 과학 학습관",
  },
  {
    id: "kofac",
    name: "한국과학창의재단 디지털교재",
    category: "교과·백과",
    subjectTags: ["수학", "물리", "화학", "생물", "지구과학"],
    url: "https://www.kofac.re.kr/",
    summaryKo: "STEAM 융합 교육 프로그램과 창의 과학 탐구 교재",
  },
  {
    id: "kisti-scent",
    name: "KISTI 과학향기",
    category: "과학 미디어",
    subjectTags: ["물리", "화학", "생물", "지구과학"],
    url: "https://scent.kisti.re.kr/",
    summaryKo: "최신 과학기술 이슈를 스토리텔링 칼럼과 만화로 풀어낸 과학 웹진",
  },
  {
    id: "ebs-math-sci",
    name: "EBS Math & 과학 클립",
    category: "교과·백과",
    subjectTags: ["수학", "물리", "화학", "생물", "지구과학"],
    url: "https://www.ebsi.co.kr/",
    summaryKo: "교과 단원별 5분 개념 영상과 웹툰형 수학·과학 스토리 콘텐츠",
  },
  {
    id: "math-god",
    name: "수학의 신 (개념 사전)",
    category: "교과·백과",
    subjectTags: ["수학"],
    url: "https://mathworld.wolfram.com/",
    summaryKo: "정의·정리·증명 과정을 체계적으로 연결한 수학 공식 레퍼런스",
  },
  {
    id: "one-min-science",
    name: "1분과학 큐레이션",
    category: "과학 미디어",
    subjectTags: ["물리", "생물", "지구과학"],
    url: "https://www.youtube.com/@1minsci",
    summaryKo: "양자역학·진화·우주론의 핵심 질문을 시각적 비유로 설명하는 과학 채널",
  },
  {
    id: "science-cookie",
    name: "과학쿠키 (Science Cookie)",
    category: "과학 미디어",
    subjectTags: ["물리", "화학"],
    url: "https://www.youtube.com/@ScienceCookie",
    summaryKo: "과학사적 발견 배경과 현대 물리학 개념을 깊이 있게 다루는 과학 해설",
  },
  {
    id: "unreal-science",
    name: "안될과학 (More Science)",
    category: "과학 미디어",
    subjectTags: ["물리", "화학", "생물", "지구과학"],
    url: "https://www.youtube.com/@Unrealscience",
    summaryKo: "최신 논문과 우주·생명·물리 주제를 쉽게 풀어주는 과학 토크 콘텐츠",
  },
  {
    id: "wiki-science-portal",
    name: "위키백과 과학 포털",
    category: "교과·백과",
    subjectTags: ["수학", "물리", "화학", "생물", "지구과학"],
    url: "https://ko.wikipedia.org/wiki/%ED%8F%AC%ED%84%B8:%EA%B3%BC%ED%95%99",
    summaryKo: "법칙·공식·과학자 연표를 교차 검증할 수 있는 오픈 과학 백과",
  },
  {
    id: "tta-sci-dict",
    name: "과학기술용어사전",
    category: "교과·백과",
    subjectTags: ["수학", "물리", "화학", "생물", "지구과학"],
    url: "https://terms.naver.com/",
    summaryKo: "국문·영문 과학기술 표준 용어 정의 및 그림 해설 사전",
  },
]);

/**
 * KAITOON KaTeX 수식 CJK(한·중·일) 조사 경계 정규화기.
 * - `###제목`처럼 공백이 빠진 마크다운 헤딩을 `### 제목`으로 교정한다.
 * - `$F=ma$는`처럼 닫는 `$` 바로 뒤에 한글·히라가나·가타카나·한자가 붙어 파서가 깨지는 현상을
 *   `$F=ma$ 는`으로 공백을 삽입해 방지한다 (`\$([^$\n]+)\$(?=[가-힣ㄱ-ㆎ぀-ゟ゠-ヿ一-鿿])`).
 */
export function normalizeKatexMarkdownForCjk(markdown: string): string {
  const fixedHeadings = markdown.replace(/^(#{1,6})([^\s#])/gmu, "$1 $2");
  return fixedHeadings.replace(
    /\$([^$\n]+)\$(?=[가-힣ㄱ-ㆎ぀-ゟ゠-ヿ一-鿿])/gu,
    "$$$1$$ ",
  );
}

export interface KaitoonGradingOutcome {
  readonly isCorrect: boolean;
  readonly scorePercent: number;
  readonly matchedKeywords: readonly string[];
  readonly missingKeywords: readonly string[];
  readonly earnedPoints: number;
  readonly transactionType: "FIRST_CORRECT" | "RETRY_CORRECT" | null;
  readonly feedbackKo: string;
}

/**
 * KAITOON 3유형(객관식·단답형·서술형 AI 채점) 문항 채점 및 포인트 산정기.
 * - 첫 시도에 정답이면 `pointsReward` 100% (`첫 정답`), 재도전 정답이면 50% (`재도전`)를 지급한다.
 */
export function gradeKaitoonQuestionAttempt(params: {
  readonly question: KaionQuestionItem;
  readonly submittedAnswer: string;
  readonly previousAttemptCount: number;
  readonly alreadySolvedBefore: boolean;
}): KaitoonGradingOutcome {
  const trimmed = params.submittedAnswer.trim();

  if (params.question.type === "MULTIPLE_CHOICE" || params.question.type === "SHORT_ANSWER") {
    const normalizedSubmitted = trimmed.replace(/\s+/gu, "").toLowerCase();
    const normalizedExpected = params.question.correctAnswer.replace(/\s+/gu, "").toLowerCase();
    const isCorrect = normalizedSubmitted.length > 0 && normalizedSubmitted === normalizedExpected;
    const isFirstSolve = isCorrect && !params.alreadySolvedBefore;
    const txType = !isCorrect
      ? null
      : params.previousAttemptCount === 0 && isFirstSolve
        ? "FIRST_CORRECT"
        : isFirstSolve
          ? "RETRY_CORRECT"
          : null;
    const earnedPoints =
      txType === "FIRST_CORRECT"
        ? params.question.pointsReward
        : txType === "RETRY_CORRECT"
          ? Math.round(params.question.pointsReward * 0.5)
          : 0;

    return {
      isCorrect,
      scorePercent: isCorrect ? 100 : 0,
      matchedKeywords: isCorrect ? [params.question.correctAnswer] : [],
      missingKeywords: isCorrect ? [] : [params.question.correctAnswer],
      earnedPoints,
      transactionType: txType,
      feedbackKo: isCorrect
        ? earnedPoints > 0
          ? `정답입니다! (${KAITOON_POINT_TRANSACTION_LABELS[txType!]} +${earnedPoints}P)`
          : "정답입니다! (이미 포인트를 획득한 문항입니다)"
        : "아쉽네요! 해설과 개념 카드를 확인한 뒤 다시 도전해 보세요.",
    };
  }

  // 서술형 (ESSAY) AI 루브릭 키워드 채점
  const rubric = params.question.essayRubricKeywords;
  const matchedKeywords = rubric.filter((kw) => trimmed.includes(kw));
  const missingKeywords = rubric.filter((kw) => !trimmed.includes(kw));
  const scorePercent =
    rubric.length === 0 ? (trimmed.length >= 10 ? 100 : 0) : Math.round((matchedKeywords.length / rubric.length) * 100);
  const isCorrect = scorePercent >= 80;
  const isFirstSolve = isCorrect && !params.alreadySolvedBefore;
  const txType = !isCorrect
    ? null
    : params.previousAttemptCount === 0 && isFirstSolve
      ? "FIRST_CORRECT"
      : isFirstSolve
        ? "RETRY_CORRECT"
        : null;
  const earnedPoints =
    txType === "FIRST_CORRECT"
      ? params.question.pointsReward
      : txType === "RETRY_CORRECT"
        ? Math.round(params.question.pointsReward * 0.5)
        : 0;

  return {
    isCorrect,
    scorePercent,
    matchedKeywords,
    missingKeywords,
    earnedPoints,
    transactionType: txType,
    feedbackKo: isCorrect
      ? `AI 서술형 채점 통과 (${scorePercent}점 · 핵심어 ${matchedKeywords.join(", ")} 포함)`
      : `AI 서술형 보완 필요 (${scorePercent}점 · 누락 핵심어: ${missingKeywords.join(", ")})`,
  };
}

export interface KaitoonQuestionAttemptRecord {
  readonly questionId: string;
  readonly subjectName: string;
  readonly conceptName: string;
  readonly isCorrect: boolean;
  readonly submittedAnswer: string;
  readonly attemptedAtIso: string;
}

export interface KaitoonWrongNoteEntry {
  readonly questionId: string;
  readonly subjectName: string;
  readonly conceptName: string;
  readonly totalAttempts: number;
  readonly wrongCount: number;
  readonly resolved: boolean;
  readonly isRepeatedWrong: boolean;
  readonly lastSubmittedAnswer: string;
}

/**
 * KAITOON 오답노트 집계기.
 * - 한 번이라도 틀린 적이 있는 문항을 수집한다.
 * - `wrongCount >= 2`이고 마지막 시도가 오답(`!resolved`)이면 `반복 오답`(`isRepeatedWrong: true`) 배지를 부여한다.
 */
export function buildWrongAnswerNote(
  attempts: readonly KaitoonQuestionAttemptRecord[],
): readonly KaitoonWrongNoteEntry[] {
  const grouped = new Map<string, KaitoonQuestionAttemptRecord[]>();
  for (const attempt of attempts) {
    const bucket = grouped.get(attempt.questionId) ?? [];
    bucket.push(attempt);
    grouped.set(attempt.questionId, bucket);
  }

  const entries: KaitoonWrongNoteEntry[] = [];
  for (const [questionId, list] of grouped.entries()) {
    const wrongCount = list.filter((a) => !a.isCorrect).length;
    if (wrongCount === 0) continue;
    const latest = list[list.length - 1]!;
    const resolved = latest.isCorrect;
    entries.push({
      questionId,
      subjectName: latest.subjectName,
      conceptName: latest.conceptName,
      totalAttempts: list.length,
      wrongCount,
      resolved,
      isRepeatedWrong: wrongCount >= 2 && !resolved,
      lastSubmittedAnswer: latest.submittedAnswer,
    });
  }

  return entries.sort((a, b) => Number(b.isRepeatedWrong) - Number(a.isRepeatedWrong));
}

export interface KaitoonSubjectMasteryStat {
  readonly subjectName: string;
  readonly totalAttempted: number;
  readonly correctCount: number;
  readonly accuracyPercent: number;
  readonly gradeBand: "우수" | "보통" | "부진";
}

/**
 * KAITOON 과목별 성취도 통계 계산기.
 * - 정답률 ≥ 90%: `우수`
 * - 정답률 ≤ 40%: `부진`
 * - 그 외: `보통`
 */
export function computeSubjectMasteryStats(
  attempts: readonly KaitoonQuestionAttemptRecord[],
): readonly KaitoonSubjectMasteryStat[] {
  const bySubject = new Map<string, { total: number; correct: number }>();
  for (const attempt of attempts) {
    const prev = bySubject.get(attempt.subjectName) ?? { total: 0, correct: 0 };
    bySubject.set(attempt.subjectName, {
      total: prev.total + 1,
      correct: prev.correct + (attempt.isCorrect ? 1 : 0),
    });
  }

  const stats: KaitoonSubjectMasteryStat[] = [];
  for (const [subjectName, counts] of bySubject.entries()) {
    const accuracyPercent =
      counts.total === 0 ? 0 : Math.round((counts.correct / counts.total) * 100);
    const gradeBand =
      accuracyPercent >= 90 ? "우수" : accuracyPercent <= 40 ? "부진" : "보통";
    stats.push({
      subjectName,
      totalAttempted: counts.total,
      correctCount: counts.correct,
      accuracyPercent,
      gradeBand,
    });
  }
  return stats;
}

export interface KaitoonEpisodeUnlockPass {
  readonly episodeId: string;
  readonly episodeTitle: string;
  readonly costPoints: number;
  readonly unlockedAtIso: string;
  readonly expiresAtIso: string;
  readonly noticeKo: string;
}

/**
 * KAITOON 포인트 기반 유료 에피소드 1주일(7일) 열람권 해금기.
 * (`포인트를 사용하여 1주일 동안 볼 수 있습니다`)
 */
export function unlockEpisodeWithPoints(params: {
  readonly currentPoints: number;
  readonly costPoints: number;
  readonly episodeId: string;
  readonly episodeTitle: string;
  readonly nowIso: string;
}): {
  readonly ok: boolean;
  readonly remainingPoints: number;
  readonly pass: KaitoonEpisodeUnlockPass | null;
  readonly messageKo: string;
} {
  if (params.currentPoints < params.costPoints) {
    return {
      ok: false,
      remainingPoints: params.currentPoints,
      pass: null,
      messageKo: `포인트가 부족합니다 (보유 ${params.currentPoints}P / 필요 ${params.costPoints}P). 학습 문제를 풀고 포인트를 모아 보세요!`,
    };
  }

  const startMs = Date.parse(params.nowIso);
  const expiresMs = (Number.isNaN(startMs) ? Date.now() : startMs) + 7 * 24 * 60 * 60 * 1000;
  const expiresAtIso = new Date(expiresMs).toISOString();
  const remainingPoints = params.currentPoints - params.costPoints;

  return {
    ok: true,
    remainingPoints,
    pass: {
      episodeId: params.episodeId,
      episodeTitle: params.episodeTitle,
      costPoints: params.costPoints,
      unlockedAtIso: params.nowIso,
      expiresAtIso,
      noticeKo: `${params.costPoints}포인트를 사용하여 1주일 동안 볼 수 있습니다 (만료: ${expiresAtIso.slice(0, 10)}).`,
    },
    messageKo: `에피소드 '${params.episodeTitle}' 1주일 열람권이 활성화되었습니다 (잔여 ${remainingPoints}P).`,
  };
}
