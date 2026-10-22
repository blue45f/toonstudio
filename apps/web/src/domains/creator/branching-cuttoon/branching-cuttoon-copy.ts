/**
 * 분기형 컷툰 문구 도우미 — 검증 코드·가져오기 오류 코드·편집 거절 사유를 화면 문구로 바꾼다.
 *
 * 코드 → 키 표는 `Record<코드, string>` 이라 코드가 늘면 타입 검사가 빠진 문구를 알려 준다. 키는 문자열 리터럴로만 적어
 * 문구 계약 시험(branching-cuttoon-i18n-contract.test.ts)이 소스가 쓰는 키와 사전을 대조할 수 있게 한다.
 * 사용자가 쓴 제목·라벨은 번역 원문이 아니라 {자리표시} 값으로만 넘긴다.
 */
import {
  BRANCHING_CUTTOON_LIMITS,
  BRANCHING_IMPORT_LIMITS,
  type BranchingCuttoonGraph,
  type BranchingEditBlock,
  type BranchingIssue,
  type BranchingIssueCode,
  type BranchingLimitName,
  type BranchingNode,
  type BranchingNodeKind,
  type BranchingParseError,
  type BranchingParseErrorCode,
} from "./model";

import type { BranchingT } from "./use-branching-t";

import "./branching-cuttoon-i18n";

type PlainIssueCode = Exclude<BranchingIssueCode, "limit-exceeded" | "text-invalid-character">;

const ISSUE_KEYS: Readonly<Record<PlainIssueCode, string>> = Object.freeze({
  "start-missing": "branchingCuttoon.issues.startMissing",
  "start-dangling": "branchingCuttoon.issues.startDangling",
  "start-kind-mismatch": "branchingCuttoon.issues.startKindMismatch",
  "start-duplicate": "branchingCuttoon.issues.startDuplicate",
  "node-id-invalid": "branchingCuttoon.issues.nodeIdInvalid",
  "node-id-duplicate": "branchingCuttoon.issues.nodeIdDuplicate",
  "choice-id-invalid": "branchingCuttoon.issues.choiceIdInvalid",
  "choice-id-duplicate": "branchingCuttoon.issues.choiceIdDuplicate",
  "cut-id-invalid": "branchingCuttoon.issues.cutIdInvalid",
  "cut-id-duplicate": "branchingCuttoon.issues.cutIdDuplicate",
  "choice-target-empty": "branchingCuttoon.issues.choiceTargetEmpty",
  "choice-target-dangling": "branchingCuttoon.issues.choiceTargetDangling",
  "cut-ref-dangling": "branchingCuttoon.issues.cutRefDangling",
  "choice-label-empty": "branchingCuttoon.issues.choiceLabelEmpty",
  "choice-label-duplicate": "branchingCuttoon.issues.choiceLabelDuplicate",
  "node-unreachable": "branchingCuttoon.issues.nodeUnreachable",
  "dead-end": "branchingCuttoon.issues.deadEnd",
  "ending-missing": "branchingCuttoon.issues.endingMissing",
  "ending-unreachable": "branchingCuttoon.issues.endingUnreachable",
  "loop-back": "branchingCuttoon.issues.loopBack",
  "ending-has-choices": "branchingCuttoon.issues.endingHasChoices",
  "node-title-empty": "branchingCuttoon.issues.nodeTitleEmpty",
  "cut-ref-repeated": "branchingCuttoon.issues.cutRefRepeated",
});

const LIMIT_KEYS: Readonly<Record<BranchingLimitName, string>> = Object.freeze({
  nodes: "branchingCuttoon.issues.limitNodes",
  choicesPerNode: "branchingCuttoon.issues.limitChoicesPerNode",
  cutsPerNode: "branchingCuttoon.issues.limitCutsPerNode",
  cuts: "branchingCuttoon.issues.limitCuts",
  graphTitleLength: "branchingCuttoon.issues.limitGraphTitleLength",
  nodeTitleLength: "branchingCuttoon.issues.limitNodeTitleLength",
  choiceLabelLength: "branchingCuttoon.issues.limitChoiceLabelLength",
  captionLength: "branchingCuttoon.issues.limitCaptionLength",
});

const TEXT_INVALID_KEYS: Readonly<Record<string, string>> = Object.freeze({
  title: "branchingCuttoon.issues.textInvalidTitle",
  label: "branchingCuttoon.issues.textInvalidLabel",
  caption: "branchingCuttoon.issues.textInvalidCaption",
  graphTitle: "branchingCuttoon.issues.textInvalidGraphTitle",
});

const KIND_KEYS: Readonly<Record<BranchingNodeKind, string>> = Object.freeze({
  start: "branchingCuttoon.common.kindStart",
  scene: "branchingCuttoon.common.kindScene",
  ending: "branchingCuttoon.common.kindEnding",
});

const PARSE_KEYS: Readonly<Record<BranchingParseErrorCode, string>> = Object.freeze({
  empty: "branchingCuttoon.transfer.parseEmpty",
  "too-large": "branchingCuttoon.transfer.parseTooLarge",
  "not-json": "branchingCuttoon.transfer.parseNotJson",
  "not-object": "branchingCuttoon.transfer.parseNotObject",
  "wrong-format": "branchingCuttoon.transfer.parseWrongFormat",
  "unsupported-version": "branchingCuttoon.transfer.parseUnsupportedVersion",
  "missing-field": "branchingCuttoon.transfer.parseMissingField",
  "wrong-type": "branchingCuttoon.transfer.parseWrongType",
  "unknown-kind": "branchingCuttoon.transfer.parseUnknownKind",
  "too-many-items": "branchingCuttoon.transfer.parseTooManyItems",
  "string-too-long": "branchingCuttoon.transfer.parseStringTooLong",
});

const BLOCK_KEYS: Readonly<Record<BranchingEditBlock, string>> = Object.freeze({
  "node-limit": "branchingCuttoon.editor.blockNodeLimit",
  "choice-limit": "branchingCuttoon.editor.blockChoiceLimit",
  "cut-limit": "branchingCuttoon.editor.blockCutLimit",
  "cut-table-limit": "branchingCuttoon.editor.blockCutTableLimit",
  "node-not-found": "branchingCuttoon.editor.blockNotFound",
  "choice-not-found": "branchingCuttoon.editor.blockNotFound",
  "cut-not-found": "branchingCuttoon.editor.blockNotFound",
  "start-protected": "branchingCuttoon.editor.blockStartProtected",
  "id-exhausted": "branchingCuttoon.editor.blockIdExhausted",
});

export function kindLabel(t: BranchingT, kind: BranchingNodeKind): string {
  return t(KIND_KEYS[kind]);
}

/** 목록·안내에 보일 장면 이름. 제목이 비었으면 "제목 없는 장면". */
export function nodeDisplayTitle(t: BranchingT, node: Pick<BranchingNode, "title"> | undefined): string {
  const title = node?.title.trim() ?? "";
  return title === "" ? t("branchingCuttoon.common.untitledNode") : title;
}

/** 선택지 이름. 비었으면 "이름 없는 선택지". */
export function choiceDisplayLabel(t: BranchingT, label: string | undefined): string {
  const trimmed = label?.trim() ?? "";
  return trimmed === "" ? t("branchingCuttoon.common.unnamedChoice") : trimmed;
}

/** 검증 항목 하나를 문장으로. 장면·선택지 이름은 그래프에서 찾아 자리표시로 넘긴다. */
export function issueMessage(t: BranchingT, issue: BranchingIssue, graph: BranchingCuttoonGraph): string {
  const node = issue.nodeId === undefined ? undefined : graph.nodes.find((candidate) => candidate.id === issue.nodeId);
  const choice = node?.choices.find((candidate) => candidate.id === issue.choiceId);
  const target = graph.nodes.find((candidate) => candidate.id === issue.value);
  const values = {
    title: nodeDisplayTitle(t, node),
    label: choiceDisplayLabel(t, choice?.label ?? issue.value),
    target: nodeDisplayTitle(t, target),
    value: issue.value ?? "",
    cutId: issue.cutId ?? "",
    count: issue.count ?? 0,
    max: issue.max ?? 0,
    actual: issue.actual ?? 0,
  };
  if (issue.code === "limit-exceeded") return t(LIMIT_KEYS[issue.limit ?? "nodes"], values);
  if (issue.code === "text-invalid-character") {
    return t(TEXT_INVALID_KEYS[issue.value ?? ""] ?? "branchingCuttoon.issues.textInvalidTitle", values);
  }
  return t(ISSUE_KEYS[issue.code], values);
}

/** 가져오기 오류 한 줄. 위치(path)는 파일 안의 경로라 번역하지 않고 값으로만 넘긴다. */
export function parseErrorMessage(t: BranchingT, error: BranchingParseError): string {
  return t(PARSE_KEYS[error.code], { path: error.path, max: Math.round(BRANCHING_IMPORT_LIMITS.maxTextLength / 1_048_576) });
}

export function editBlockMessage(t: BranchingT, reason: BranchingEditBlock): string {
  return t(BLOCK_KEYS[reason], {
    max: reason === "node-limit"
      ? BRANCHING_CUTTOON_LIMITS.nodes
      : reason === "choice-limit"
        ? BRANCHING_CUTTOON_LIMITS.choicesPerNode
        : reason === "cut-limit"
          ? BRANCHING_CUTTOON_LIMITS.cutsPerNode
          : BRANCHING_CUTTOON_LIMITS.cuts,
  });
}
