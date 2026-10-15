/**
 * 스토리 개연성 점검 리포트의 공용 타입과 작가용 범주 정의.
 *
 * 기존 탐지기(인과 엔진, 연속성 검사, 복선 장부, 회차 타임라인, 설정 대조)는 저마다 코드와
 * 심각도 어휘가 달라서, 리포트는 이를 하나의 범주·심각도·신뢰 유형으로 정규화한다.
 *
 * 심각도의 뜻:
 * - error: 입력된 데이터끼리 어긋남이 확정된 것. 항상 confidence=certain 이다.
 * - warning: 높은 의심. 데이터는 확정이지만 작가의 의도일 수 있거나, 글쓰기 관습에 기댄 추정이다.
 * - suggestion: 작가에게 던지는 질문. 틀렸다는 뜻이 아니다.
 *
 * 신뢰 유형의 뜻:
 * - certain: 입력된 데이터만으로 규칙이 성립함을 기계가 확인했다(의도 여부와 무관).
 * - heuristic: 글쓰기 관습이나 임계값에 기댄 추정이다.
 */
import type { StoryworldQuestionId } from "../studio-storyworld-causality";

export const PLAUSIBILITY_CATEGORY_IDS = [
  "cause-effect",
  "motive",
  "information",
  "time-place",
  "setting-rules",
  "foreshadowing",
  "character-consistency",
  "emotion",
  "coincidence",
] as const;

export type PlausibilityCategoryId = (typeof PLAUSIBILITY_CATEGORY_IDS)[number];

export interface PlausibilityCategoryInfo {
  readonly id: PlausibilityCategoryId;
  readonly label: string;
  /** 작가가 스스로에게 하는 질문 한 줄. */
  readonly question: string;
  readonly description: string;
}

export const PLAUSIBILITY_CATEGORIES: readonly PlausibilityCategoryInfo[] = Object.freeze([
  {
    id: "cause-effect",
    label: "원인과 결과",
    question: "이 일은 무엇 때문에 일어났고, 그래서 무엇이 달라졌나?",
    description: "앞 장면의 결과가 다음 장면의 원인이 되는지, 필요한 일이 먼저 일어났는지 봅니다.",
  },
  {
    id: "motive",
    label: "동기",
    question: "인물은 왜 그렇게 행동했나?",
    description: "중요한 선택을 하는 장면에서 행동의 이유가 있는지 봅니다.",
  },
  {
    id: "information",
    label: "정보",
    question: "인물은 그걸 어떻게 알았고, 독자는 언제 알았나?",
    description: "알 수 없는 사실을 쓰는 장면, 너무 이르거나 빠진 독자 공개를 봅니다.",
  },
  {
    id: "time-place",
    label: "시간과 장소",
    question: "이 장면은 언제, 어디에서 벌어지나?",
    description: "시간이 거꾸로 가거나 같은 시간에 두 곳에 있는 인물을 봅니다.",
  },
  {
    id: "setting-rules",
    label: "설정·규칙",
    question: "세계의 규칙과 사실이 앞뒤가 맞나?",
    description: "같은 설정이 서로 다른 값으로 적혀 있거나, 끊어진 참조가 있는지 봅니다.",
  },
  {
    id: "foreshadowing",
    label: "복선과 회수",
    question: "심어 둔 것을 거두었나? 거두는 것은 심은 뒤인가?",
    description: "회수 없는 복선, 심기 전에 나온 회수, 약속한 기한을 봅니다.",
  },
  {
    id: "character-consistency",
    label: "인물 일관성",
    question: "같은 사람으로 읽히나?",
    description: "이름 표기, 나이, 등장 여부가 앞뒤로 맞는지 봅니다.",
  },
  {
    id: "emotion",
    label: "감정 변화",
    question: "감정이 이유 없이 뒤집히지 않나?",
    description: "연결 없이 크게 바뀌는 감정, 장면에 없는 인물의 감정을 봅니다.",
  },
  {
    id: "coincidence",
    label: "우연·해결 방식",
    question: "문제가 풀리는 이유가 앞에서 보였나?",
    description: "해결이 앞에서 준비되지 않은 사실이나 단서 없는 우연에 기대는지 봅니다.",
  },
]);

export type PlausibilitySeverity = "error" | "warning" | "suggestion";
export type PlausibilityConfidence = "certain" | "heuristic";

export const PLAUSIBILITY_SEVERITY_LABELS: Readonly<Record<PlausibilitySeverity, string>> = Object.freeze({
  error: "오류",
  warning: "경고",
  suggestion: "제안",
});

export const PLAUSIBILITY_SEVERITY_HINTS: Readonly<Record<PlausibilitySeverity, string>> = Object.freeze({
  error: "입력한 내용끼리 어긋남이 확인됐어요",
  warning: "의심스러워요. 의도라면 처리 기록으로 남겨 주세요",
  suggestion: "작가님께 드리는 질문이에요",
});

export const PLAUSIBILITY_CONFIDENCE_LABELS: Readonly<Record<PlausibilityConfidence, string>> = Object.freeze({
  certain: "확정",
  heuristic: "추정",
});

export type PlausibilityTrust = "low" | "medium" | "high";

export const PLAUSIBILITY_TRUST_LABELS: Readonly<Record<PlausibilityTrust, string>> = Object.freeze({
  low: "낮음",
  medium: "보통",
  high: "높음",
});

/** 점검 가능 범위가 점수를 얼마나 믿을 수 있게 하는지 한 문장으로. */
export const PLAUSIBILITY_TRUST_HINTS: Readonly<Record<PlausibilityTrust, string>> = Object.freeze({
  low: "입력된 칸이 적어서 '문제 없음'이 아니라 '아직 모름'에 가까워요. 점수를 완성도로 읽지 마세요.",
  medium: "절반 안팎을 점검했어요. 비어 있는 칸은 점검하지 못했어요.",
  high: "대부분의 칸을 점검했어요. 그래도 기계가 읽지 못하는 부분은 남아 있어요.",
});

export type PlausibilitySourceModule =
  | "causality"
  | "continuity"
  | "foreshadow-ledger"
  | "promise-ledger"
  | "episode-timeline"
  | "lore"
  | "name-check"
  | "plausibility";

export interface PlausibilitySource {
  readonly module: PlausibilitySourceModule;
  /** 원래 탐지기의 코드. 새 탐지기는 이 허브가 붙인 코드. */
  readonly code: string;
  /** 원래 탐지기가 붙인 이슈 id. 처리 기록을 두 화면이 공유하는 열쇠가 된다. */
  readonly originalId?: string;
}

export type PlausibilityEvidenceKind =
  | "scene"
  | "episode"
  | "fact"
  | "character"
  | "location"
  | "setup"
  | "ledger"
  | "note";

export interface PlausibilityQuote {
  readonly text: string;
  /** text 안에서 강조할 구간(글자 단위, 끝은 포함하지 않음). */
  readonly highlightStart: number;
  readonly highlightEnd: number;
}

export interface PlausibilityEvidence {
  readonly kind: PlausibilityEvidenceKind;
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
  /** 근거가 장면에 걸려 있으면 그 장면 id. 근거 상세에서 장면 카드를 연다. */
  readonly sceneId?: string;
  readonly quote?: PlausibilityQuote;
}

/**
 * 해결 선택지의 동작. 어느 것도 문서를 자동으로 바꾸지 않는다.
 * open-* 은 해당 화면으로 이동만 하고, copy 는 작가가 직접 적용할 안내문을 복사한다.
 */
export type PlausibilityOptionAction =
  | { readonly kind: "open-questionnaire"; readonly sceneId: string; readonly question?: StoryworldQuestionId }
  | { readonly kind: "open-settings"; readonly target: "scene" | "fact" | "character"; readonly id: string }
  | { readonly kind: "copy"; readonly text: string }
  | { readonly kind: "info" };

export interface PlausibilityResolutionOption {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly action: PlausibilityOptionAction;
}

export interface PlausibilityFinding {
  /** 입력이 같으면 같은 id. 탐지기 코드와 근거 id에서 도출한다. */
  readonly id: string;
  /** 처리 기록(해결함·의도된 설정·나중에)의 열쇠. 기존 이슈에서 온 것은 원래 이슈 id를 쓴다. */
  readonly dispositionKey: string;
  readonly source: PlausibilitySource;
  readonly category: PlausibilityCategoryId;
  readonly severity: PlausibilitySeverity;
  readonly confidence: PlausibilityConfidence;
  readonly title: string;
  readonly message: string;
  /** 작가에게 던지는 질문. */
  readonly question: string;
  readonly evidence: readonly PlausibilityEvidence[];
  readonly options: readonly PlausibilityResolutionOption[];
  /** 이 발견이 걸린 장면 id(장면 순서대로). 범위 선택과 필터에 쓴다. */
  readonly sceneIds: readonly string[];
  /** 정렬용. 첫 관련 장면의 order, 없으면 Number.MAX_SAFE_INTEGER. */
  readonly sortOrder: number;
}

export interface PlausibilityCoverageItem {
  readonly id: string;
  readonly label: string;
  readonly covered: number;
  readonly total: number;
}

export interface PlausibilityCoverage {
  readonly sceneCount: number;
  readonly coveredCells: number;
  readonly totalCells: number;
  /** 0~100 정수. 장면이 없으면 0. */
  readonly percent: number;
  readonly items: readonly PlausibilityCoverageItem[];
}

export interface PlausibilityScoreTerm {
  readonly category: PlausibilityCategoryId;
  readonly errors: number;
  readonly certainWarnings: number;
  readonly heuristicWarnings: number;
  readonly suggestions: number;
  /** 상한을 적용하기 전 감점. */
  readonly rawPenalty: number;
  /** 상한을 적용한 감점. */
  readonly penalty: number;
}

export interface PlausibilityScore {
  readonly value: number;
  /** 화면과 내보내기에 그대로 적는 공식. */
  readonly formula: string;
  readonly terms: readonly PlausibilityScoreTerm[];
}

export interface PlausibilityCounts {
  readonly total: number;
  readonly error: number;
  readonly warning: number;
  readonly suggestion: number;
}

export interface PlausibilityCategorySummary extends PlausibilityCounts {
  readonly category: PlausibilityCategoryId;
}

export type PlausibilitySourceStatus = "used" | "empty" | "unavailable";

export interface PlausibilitySourceReport {
  readonly id: string;
  readonly label: string;
  readonly status: PlausibilitySourceStatus;
  readonly detail: string;
}

export interface PlausibilitySummary {
  readonly counts: PlausibilityCounts;
  readonly byCategory: readonly PlausibilityCategorySummary[];
  readonly coverage: PlausibilityCoverage;
  readonly score: PlausibilityScore;
  /** 커버리지에 따른 점수 신뢰 안내. */
  readonly trust: PlausibilityTrust;
  /** 상한 때문에 목록에서 빠진 발견 수. */
  readonly omittedCount: number;
}

export interface PlausibilityReport {
  readonly version: 1;
  /** 호출자가 넘긴 시각. 리포트 안의 다른 값은 시각에 의존하지 않는다. */
  readonly generatedAtIso: string;
  readonly projectTitle: string;
  /** 점검한 장면 id. null이면 전체. */
  readonly scopeSceneIds: readonly string[] | null;
  readonly findings: readonly PlausibilityFinding[];
  readonly summary: PlausibilitySummary;
  readonly sources: readonly PlausibilitySourceReport[];
  /** 자동으로 판정하지 못하는 부분에 대한 고정 안내. */
  readonly limits: readonly string[];
}

export type PlausibilityDispositionStatus = "resolved" | "intended" | "deferred" | "ignored";

/** 처리 기록을 리포트에 겹친 결과. */
export interface PlausibilityHandledFinding {
  readonly finding: PlausibilityFinding;
  readonly status: PlausibilityDispositionStatus;
  readonly note?: string;
}

export const PLAUSIBILITY_DISPOSITION_LABELS: Readonly<Record<PlausibilityDispositionStatus, string>> = Object.freeze({
  resolved: "해결함",
  intended: "의도된 설정",
  deferred: "나중에",
  ignored: "무시함",
});

export function plausibilityCategoryInfo(id: PlausibilityCategoryId): PlausibilityCategoryInfo {
  const info = PLAUSIBILITY_CATEGORIES.find((category) => category.id === id);
  if (!info) throw new Error(`알 수 없는 개연성 범주입니다: ${id}`);
  return info;
}

export function plausibilityCategoryLabel(id: PlausibilityCategoryId): string {
  return plausibilityCategoryInfo(id).label;
}
