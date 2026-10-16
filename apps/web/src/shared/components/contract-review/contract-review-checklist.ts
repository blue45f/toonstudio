/**
 * 계약서 검토 체크리스트 — 순수 로직(답 정규화·분류·요약·Markdown 내보내기).
 *
 * 공개된 문화체육관광부 만화 분야 표준계약서(2024-06-13 고시)와 2025년 해설집이 다루는 항목을
 * 작가가 자기 계약서와 대조하게 돕는다. 법률 자문이 아니며, 특정 계약서의 유효성·공정성을
 * 판단하지 않는다. React/DOM/저장소에 의존하지 않아 웹의 학습 화면과 제작 관리 화면이 함께 쓴다.
 */
import { CONTRACT_REVIEW_ITEMS, CONTRACT_REVIEW_SOURCES } from "./contract-review-items";
import {
  CONTRACT_REVIEW_ANSWERS,
  type ContractReviewAnswer,
  type ContractReviewAnswers,
  type ContractReviewItem,
  type ContractReviewItemStatus,
  type ContractReviewLocale,
  type ContractReviewSummary,
  type ContractReviewText,
} from "./contract-review-types";

export * from "./contract-review-items";
export * from "./contract-review-types";

/** 이 체크리스트가 따르는 표준계약서 판. 화면·내보내기 문구가 같은 값을 쓴다. */
export const CONTRACT_REVIEW_STANDARD_EDITION = Object.freeze({
  noticeNumber: "2024-0032",
  revisedOn: "2024-06-13",
  commentaryDistributedFrom: "2025-06-13",
});

export function isContractReviewAnswer(value: unknown): value is ContractReviewAnswer {
  return typeof value === "string" && (CONTRACT_REVIEW_ANSWERS as readonly string[]).includes(value);
}

/** 앱 언어 코드를 이 체크리스트가 가진 두 언어 중 하나로 고른다(한국어가 아니면 영어). */
export function resolveContractReviewLocale(language: string | null | undefined): ContractReviewLocale {
  return typeof language === "string" && language.trim().toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

export function pickContractReviewText(text: ContractReviewText, locale: ContractReviewLocale): string {
  return text[locale];
}

/**
 * 저장된(또는 전달받은) 값에서 유효한 답만 남긴다. 알 수 없는 항목 id, 알 수 없는 답, 객체가 아닌 입력은
 * 조용히 버린다 — 항목이 개정되어도 오래된 저장본이 화면을 깨뜨리지 않게 한다. 결과 키 순서는 항목 순서다.
 */
export function normalizeContractReviewAnswers(value: unknown): ContractReviewAnswers {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return Object.freeze({});
  const record = value as Record<string, unknown>;
  const next: Record<string, ContractReviewAnswer> = {};
  for (const item of CONTRACT_REVIEW_ITEMS) {
    if (!Object.hasOwn(record, item.id)) continue;
    const answer = record[item.id];
    if (isContractReviewAnswer(answer)) next[item.id] = answer;
  }
  return Object.freeze(next);
}

/** 답 하나를 바꾼 새 맵을 돌려준다. `null`은 "아직 확인 전"으로 되돌린다. 모르는 id는 무시한다. */
export function setContractReviewAnswer(
  answers: ContractReviewAnswers,
  itemId: string,
  answer: ContractReviewAnswer | null,
): ContractReviewAnswers {
  if (!CONTRACT_REVIEW_ITEMS.some((item) => item.id === itemId)) return answers;
  const next: Record<string, ContractReviewAnswer> = { ...answers };
  if (answer === null) delete next[itemId];
  else next[itemId] = answer;
  return normalizeContractReviewAnswers(next);
}

/** 한 항목이 현재 답과 만났을 때의 분류. */
export function contractReviewItemStatus(
  item: Pick<ContractReviewItem, "attention">,
  answer: ContractReviewAnswer | undefined,
): ContractReviewItemStatus {
  if (answer === undefined) return "unchecked";
  if (answer === "unsure") return "unsure";
  const flagged = item.attention === "when-absent" ? answer === "absent" : answer === "present";
  return flagged ? "attention" : "fine";
}

export function summarizeContractReview(answers: ContractReviewAnswers): ContractReviewSummary {
  let present = 0;
  let absent = 0;
  let unsure = 0;
  const followUpIds: string[] = [];
  const attentionIds: string[] = [];
  for (const item of CONTRACT_REVIEW_ITEMS) {
    const answer = answers[item.id];
    if (answer === "present") present += 1;
    else if (answer === "absent") absent += 1;
    else if (answer === "unsure") unsure += 1;
    const status = contractReviewItemStatus(item, answer);
    if (status !== "fine") followUpIds.push(item.id);
    if (status === "attention") attentionIds.push(item.id);
  }
  const total = CONTRACT_REVIEW_ITEMS.length;
  const answered = present + absent + unsure;
  return Object.freeze({
    total,
    answered,
    present,
    absent,
    unsure,
    unchecked: total - answered,
    progressPercent: total === 0 ? 0 : Math.round((answered / total) * 100),
    followUpIds: Object.freeze(followUpIds),
    attentionIds: Object.freeze(attentionIds),
  });
}

interface MarkdownLabels {
  readonly title: string;
  readonly createdOn: string;
  readonly basis: string;
  readonly basisValue: string;
  readonly scope: string;
  readonly disclaimer: string;
  readonly progress: string;
  readonly progressLine: (summary: ContractReviewSummary) => string;
  readonly followUp: string;
  readonly followUpEmpty: string;
  readonly done: string;
  readonly doneEmpty: string;
  readonly sources: string;
  readonly answerWord: Readonly<Record<ContractReviewAnswer | "none", string>>;
  readonly statusWord: Readonly<Record<ContractReviewItemStatus, string>>;
  readonly question: string;
  readonly myAnswer: string;
  readonly basisLine: string;
  readonly nextStep: string;
  readonly checkedOn: string;
  readonly closing: readonly string[];
}

const MARKDOWN_LABELS: Readonly<Record<ContractReviewLocale, MarkdownLabels>> = Object.freeze({
  ko: {
    title: "# 계약서 검토 체크리스트 요약",
    createdOn: "작성일",
    basis: "기준 문서",
    basisValue: `문화체육관광부 만화 분야 표준계약서(고시 제${CONTRACT_REVIEW_STANDARD_EDITION.noticeNumber}호, ${CONTRACT_REVIEW_STANDARD_EDITION.revisedOn} 개정)와 2025년 해설집`,
    scope: "범위",
    disclaimer:
      "> 이 문서는 법률 자문이 아닙니다. 공개된 표준계약서와 해설집이 다루는 항목을 정리한 참고 자료이며, 내 계약서가 유효한지·공정한지는 판단하지 않습니다. 서명 전에 변호사나 공공 상담 창구의 도움을 받으세요.",
    progress: "## 진행 현황",
    progressLine: (summary) =>
      `- 답한 항목: ${summary.answered} / ${summary.total} (${summary.progressPercent}%)\n- 계약서에 있음 ${summary.present} · 없음 ${summary.absent} · 잘 모르겠음 ${summary.unsure} · 아직 확인 전 ${summary.unchecked}`,
    followUp: "## 먼저 확인할 항목",
    followUpEmpty:
      "- 먼저 살펴볼 항목으로 분류된 것이 없습니다. 이 목록은 표준계약서가 다루는 주제만 점검하므로, 서명 전 전문가 상담은 여전히 권합니다.",
    done: "## 문제 신호 없이 답한 항목",
    doneEmpty: "- 아직 없습니다.",
    sources: "## 근거 문서",
    answerWord: { present: "있음", absent: "없음", unsure: "잘 모르겠음", none: "아직 확인 전" },
    statusWord: { attention: "먼저 확인 필요", unsure: "다시 확인 필요", unchecked: "아직 확인 전", fine: "표시된 문제 신호 없음" },
    question: "질문",
    myAnswer: "내 답",
    basisLine: "근거",
    nextStep: "다음 행동",
    checkedOn: "확인일",
    closing: [
      "---",
      "표준계약서는 확정된 계약서가 아니라 개별 계약을 체결할 때 참고하는 샘플이며, 표준과 다른 내용이 항상 불리한 것은 아닙니다(해설집 안내). 이 체크리스트는 법률 자문이 아닙니다.",
    ],
  },
  en: {
    title: "# Contract review checklist summary",
    createdOn: "Created on",
    basis: "Reference documents",
    basisValue: `MCST standard contracts for the comics field (Notice No. ${CONTRACT_REVIEW_STANDARD_EDITION.noticeNumber}, revised ${CONTRACT_REVIEW_STANDARD_EDITION.revisedOn}) and the 2025 commentary`,
    scope: "Scope",
    disclaimer:
      "> This document is not legal advice. It organizes the topics covered by the published standard contracts and commentary as a reference, and does not judge whether your contract is valid or fair. Get help from a lawyer or a public advice service before you sign.",
    progress: "## Progress",
    progressLine: (summary) =>
      `- Answered: ${summary.answered} / ${summary.total} (${summary.progressPercent}%)\n- In my contract ${summary.present} · Not in my contract ${summary.absent} · Not sure ${summary.unsure} · Not checked yet ${summary.unchecked}`,
    followUp: "## Check these first",
    followUpEmpty:
      "- Nothing is flagged yet. This list only covers topics in the standard contracts, so we still recommend expert advice before signing.",
    done: "## Answered with no flag",
    doneEmpty: "- None yet.",
    sources: "## Sources",
    answerWord: { present: "In my contract", absent: "Not in my contract", unsure: "Not sure", none: "Not checked yet" },
    statusWord: { attention: "Check first", unsure: "Needs another look", unchecked: "Not checked yet", fine: "No flag" },
    question: "Question",
    myAnswer: "My answer",
    basisLine: "Basis",
    nextStep: "Next step",
    checkedOn: "Checked on",
    closing: [
      "---",
      "The standard contracts are samples to consult when drafting an individual contract, not finished contracts, and terms that differ from them are not always worse (per the commentary). This checklist is not legal advice.",
    ],
  },
});

const CONTRACT_REVIEW_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function isoDate(value: Date): string {
  const date = Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  if (!CONTRACT_REVIEW_DATE_PATTERN.test(date)) {
    throw new Error("A valid date is required to export the contract review checklist.");
  }
  return date;
}

function itemLines(
  item: ContractReviewItem,
  answers: ContractReviewAnswers,
  labels: MarkdownLabels,
  locale: ContractReviewLocale,
  withNextStep: boolean,
): string[] {
  const answer = answers[item.id];
  const status = contractReviewItemStatus(item, answer);
  const box = status === "fine" ? "[x]" : "[ ]";
  const answerWord = labels.answerWord[answer ?? "none"];
  const lines = [
    `- ${box} **${item.title[locale]}** — ${labels.myAnswer}: ${answerWord} · ${labels.statusWord[status]}`,
    `  - ${labels.question}: ${item.question[locale]}`,
    `  - ${labels.basisLine}: ${item.references.map((reference) => reference.locator[locale]).join(" / ")}`,
  ];
  if (withNextStep) lines.push(`  - ${labels.nextStep}: ${item.attentionNote[locale]}`);
  return lines;
}

export interface ContractReviewMarkdownOptions {
  readonly answers: ContractReviewAnswers;
  readonly locale: ContractReviewLocale;
  /** 작성일. 내보내기 순간의 시계를 호출자가 넘겨 결과를 결정적으로 만든다. */
  readonly generatedAt: Date;
}

/** 요약 Markdown. 서버로 보내지 않고 브라우저에서 내려받는 문서이며, 사용자 입력 문자열을 담지 않는다. */
export function buildContractReviewMarkdown(options: ContractReviewMarkdownOptions): string {
  const { locale } = options;
  const labels = MARKDOWN_LABELS[locale];
  const answers = normalizeContractReviewAnswers(options.answers);
  const summary = summarizeContractReview(answers);
  const date = isoDate(options.generatedAt);

  const followUp = CONTRACT_REVIEW_ITEMS.filter((item) => summary.followUpIds.includes(item.id));
  const settled = CONTRACT_REVIEW_ITEMS.filter((item) => !summary.followUpIds.includes(item.id));

  const lines: string[] = [
    labels.title,
    "",
    `- ${labels.createdOn}: ${date}`,
    `- ${labels.basis}: ${labels.basisValue}`,
    `- ${labels.scope}: ${
      locale === "ko"
        ? "웹툰 연재 계약(2차적저작물작성권 이용허락·양도 계약 포함)"
        : "Webtoon serialization contracts (including secondary-works license and assignment contracts)"
    }`,
    "",
    labels.disclaimer,
    "",
    labels.progress,
    labels.progressLine(summary),
    "",
    labels.followUp,
    ...(followUp.length === 0 ? [labels.followUpEmpty] : followUp.flatMap((item) => itemLines(item, answers, labels, locale, true))),
    "",
    labels.done,
    ...(settled.length === 0 ? [labels.doneEmpty] : settled.flatMap((item) => itemLines(item, answers, labels, locale, false))),
    "",
    labels.sources,
    ...CONTRACT_REVIEW_SOURCES.map(
      (source, index) =>
        `${index + 1}. ${source.title[locale]} — ${source.publisher[locale]} (${source.documentDate}, ${labels.checkedOn} ${source.checkedOn}) <${source.url}>`,
    ),
    "",
    ...labels.closing,
    "",
  ];
  return lines.join("\n");
}
