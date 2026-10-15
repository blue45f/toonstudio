/**
 * 계약서 검토 체크리스트 — 타입 정의.
 *
 * 이 체크리스트는 공개된 문화체육관광부 만화 분야 표준계약서와 그 해설집이 다루는 항목을
 * 작가가 자기 계약서와 대조하도록 정리한 참고 자료다. 법률 자문이 아니다.
 * 데이터(항목·출처)는 `contract-review-items.ts`, 순수 로직은 `contract-review-checklist.ts`에 있다.
 */

/** 한국어·영어 문구 한 쌍. 화면은 `useBilingual` 계열로 현재 언어에 맞게 고른다. */
export interface ContractReviewText {
  readonly ko: string;
  readonly en: string;
}

/** "내 계약서에 있나요?" 에 대한 작가의 답. 답하지 않은 항목은 맵에 키가 없다. */
export const CONTRACT_REVIEW_ANSWERS = ["present", "absent", "unsure"] as const;
export type ContractReviewAnswer = (typeof CONTRACT_REVIEW_ANSWERS)[number];

/** 항목 id → 답. 알 수 없는 id·값은 `normalizeContractReviewAnswers` 가 걸러낸다. */
export type ContractReviewAnswers = Readonly<Record<string, ContractReviewAnswer>>;

export const CONTRACT_REVIEW_CATEGORY_IDS = [
  "period-scope",
  "schedule",
  "money",
  "rights",
  "exit",
  "process",
] as const;
export type ContractReviewCategoryId = (typeof CONTRACT_REVIEW_CATEGORY_IDS)[number];

export interface ContractReviewCategory {
  readonly id: ContractReviewCategoryId;
  readonly title: ContractReviewText;
  readonly description: ContractReviewText;
}

export const CONTRACT_REVIEW_SOURCE_IDS = [
  "mcst-standard-contracts",
  "standard-contracts-commentary",
  "mcst-press-2018-fair-council",
  "korea-kr-2024-changes",
] as const;
export type ContractReviewSourceId = (typeof CONTRACT_REVIEW_SOURCE_IDS)[number];

/** 항목 근거로 쓴 공식 공개 문서. 확인일은 이 저장소 작업에서 직접 열어 본 날짜다. */
export interface ContractReviewSource {
  readonly id: ContractReviewSourceId;
  readonly title: ContractReviewText;
  readonly publisher: ContractReviewText;
  readonly url: string;
  /** 문서(또는 게시물)의 날짜. `YYYY-MM-DD`. */
  readonly documentDate: string;
  /** 이 저장소 작업에서 원문을 확인한 날짜. `YYYY-MM-DD`. */
  readonly checkedOn: string;
  readonly note: ContractReviewText;
}

/** 문서 안에서 근거가 되는 위치(조항·쪽). */
export interface ContractReviewReference {
  readonly sourceId: ContractReviewSourceId;
  readonly locator: ContractReviewText;
}

/**
 * 답이 어느 쪽일 때 먼저 살펴봐야 하는가.
 * - `when-absent`: 표준계약서가 다루는 내용이 내 계약서에 없을 때(대부분의 항목)
 * - `when-present`: 표준계약서에 없거나 조건을 따져 봐야 하는 내용이 내 계약서에 있을 때
 */
export type ContractReviewAttention = "when-absent" | "when-present";

export interface ContractReviewItem {
  /** 저장되는 안정 id. 이름을 바꾸면 이미 저장된 답이 사라지므로 바꾸지 않는다. */
  readonly id: string;
  readonly category: ContractReviewCategoryId;
  readonly title: ContractReviewText;
  /** "내 계약서에 …이(가) 있나요?" 에 해당하는 한 문장 질문. */
  readonly question: ContractReviewText;
  /** 표준계약서와 해설집이 이 주제를 다루는 방식. 확인한 문서 내용만 쓴다. */
  readonly standard: ContractReviewText;
  /** 내 계약서에서 확인할 점(질문형). */
  readonly lookFor: readonly ContractReviewText[];
  readonly attention: ContractReviewAttention;
  /** 먼저 살펴봐야 하는 답일 때 보여 줄 다음 행동 안내. */
  readonly attentionNote: ContractReviewText;
  /** 해설집이 중심 조항에 '핵심' 표시를 단 항목인가. */
  readonly standardCore: boolean;
  readonly references: readonly ContractReviewReference[];
}

/** 한 항목이 현재 답과 만났을 때의 분류. */
export type ContractReviewItemStatus = "unchecked" | "unsure" | "attention" | "fine";

export interface ContractReviewSummary {
  readonly total: number;
  readonly answered: number;
  readonly present: number;
  readonly absent: number;
  readonly unsure: number;
  readonly unchecked: number;
  /** 답한 항목 비율(0~100 정수). */
  readonly progressPercent: number;
  /** 먼저 살펴볼 항목 id(표준 목록 순서). 주의 신호·잘 모르겠음·아직 확인 전을 모두 포함한다. */
  readonly followUpIds: readonly string[];
  /** 주의 신호로 분류된 항목 id. */
  readonly attentionIds: readonly string[];
}

export type ContractReviewLocale = "ko" | "en";
