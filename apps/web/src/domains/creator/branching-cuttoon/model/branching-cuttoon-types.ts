/**
 * 분기형 컷툰 그래프 v1 — 데이터 모델과 상수.
 *
 * 독자가 선택지를 눌러 다음 컷 묶음(장면)으로 가는 컷툰의 순수 데이터 계약이다. 서버 저장, 독자 통계, 정산은 이 계약의 범위 밖이다.
 * 이 폴더의 모듈은 모두 순수 함수이고 결정적이다. 네트워크·시간·난수·브라우저 API 에 의존하지 않는다.
 *
 * 구조
 * - 장면(노드): 식별자·제목·종류(start | scene | ending)·컷 참조 목록·선택지 목록.
 * - 선택지: 식별자·라벨·도착 장면. 독자는 장면의 컷을 위에서 아래로 읽고, 끝에서 선택지 하나를 고른다.
 * - 컷: 그래프가 가진 컷 표(`cuts`)의 한 줄. v1 의 컷은 글 카드(캡션)이며 이미지 연결은 목표 상태다.
 * - 시작 장면: `startNodeId` 가 가리키는 장면. 종류도 `start` 여야 하고 `start` 종류는 하나뿐이다.
 */

/** 파일에 적는 형식 이름. 가져올 때 이 값이 다르면 이 형식의 파일이 아니라고 보고 거절한다. */
export const BRANCHING_CUTTOON_FORMAT = "toonstudio.branching-cuttoon";
export const BRANCHING_CUTTOON_SCHEMA_VERSION = 1;

export const BRANCHING_NODE_KINDS = ["start", "scene", "ending"] as const;
export type BranchingNodeKind = (typeof BRANCHING_NODE_KINDS)[number];

/** 편집 화면에서 고를 수 있는 종류. 시작 장면은 "시작 장면으로 지정"으로만 바뀐다. */
export type BranchingEditableNodeKind = Exclude<BranchingNodeKind, "start">;

export interface BranchingCut {
  readonly id: string;
  /** 컷에 보이는 글. v1 의 컷은 글 카드다. */
  readonly caption: string;
}

export interface BranchingChoice {
  /** 같은 장면 안에서만 유일하면 된다. */
  readonly id: string;
  readonly label: string;
  /** 도착 장면의 식별자. 비어 있으면 아직 고르지 않은 선택지다. */
  readonly targetNodeId: string;
}

export interface BranchingNode {
  readonly id: string;
  readonly kind: BranchingNodeKind;
  readonly title: string;
  /** 컷 표의 컷 식별자를 읽는 순서대로 적는다(컷 참조 목록). */
  readonly cutIds: readonly string[];
  readonly choices: readonly BranchingChoice[];
}

export interface BranchingCuttoonGraph {
  readonly title: string;
  readonly startNodeId: string;
  readonly cuts: readonly BranchingCut[];
  readonly nodes: readonly BranchingNode[];
}

/**
 * 크기 한도. 검증기는 한도를 넘으면 `limit-exceeded` 오류를 내고, 편집 함수는 한도를 넘기는 추가를 거절한다.
 * 글자 수는 UTF-16 코드 단위가 아니라 코드 포인트로 센다. 이 값은 docs/features/branching-cuttoon.md 의 표와 같아야 한다.
 */
export const BRANCHING_CUTTOON_LIMITS = Object.freeze({
  nodes: 200,
  choicesPerNode: 6,
  cutsPerNode: 30,
  cuts: 1000,
  graphTitleLength: 80,
  nodeTitleLength: 80,
  choiceLabelLength: 80,
  captionLength: 200,
  idLength: 48,
});

/** `limit-exceeded` 가 가리킬 수 있는 한도 이름. 식별자 길이는 `*-id-invalid` 가 맡는다. */
export type BranchingLimitName = Exclude<keyof typeof BRANCHING_CUTTOON_LIMITS, "idLength">;

/** 읽기 진행 기록의 길이 상한. 되돌리기 스택이 이보다 길어지면 가장 오래된 단계부터 버린다. */
export const BRANCHING_TRAIL_LIMIT = 400;

/**
 * 검증 코드. 화면은 이 코드로 문구를 고르고, 시험은 이 코드로 판정한다. 문구를 바꿔도 코드는 바뀌지 않는다.
 * 순서는 보고서 정렬의 2차 기준이다.
 */
export const BRANCHING_ISSUE_CODES = [
  "start-missing",
  "start-dangling",
  "start-kind-mismatch",
  "start-duplicate",
  "node-id-invalid",
  "node-id-duplicate",
  "choice-id-invalid",
  "choice-id-duplicate",
  "cut-id-invalid",
  "cut-id-duplicate",
  "choice-target-empty",
  "choice-target-dangling",
  "cut-ref-dangling",
  "choice-label-empty",
  "choice-label-duplicate",
  "text-invalid-character",
  "limit-exceeded",
  "node-unreachable",
  "dead-end",
  "ending-missing",
  "ending-unreachable",
  "loop-back",
  "ending-has-choices",
  "node-title-empty",
  "cut-ref-repeated",
] as const;

export type BranchingIssueCode = (typeof BRANCHING_ISSUE_CODES)[number];
export type BranchingIssueSeverity = "error" | "warning";

/** 경고는 읽기를 막지 않는다. 나머지는 모두 오류이고, 오류가 하나라도 있으면 그래프는 읽을 수 없다(fail-closed). */
export const BRANCHING_ISSUE_SEVERITY: Readonly<Record<BranchingIssueCode, BranchingIssueSeverity>> = Object.freeze({
  "start-missing": "error",
  "start-dangling": "error",
  "start-kind-mismatch": "error",
  "start-duplicate": "error",
  "node-id-invalid": "error",
  "node-id-duplicate": "error",
  "choice-id-invalid": "error",
  "choice-id-duplicate": "error",
  "cut-id-invalid": "error",
  "cut-id-duplicate": "error",
  "choice-target-empty": "error",
  "choice-target-dangling": "error",
  "cut-ref-dangling": "error",
  "choice-label-empty": "error",
  "choice-label-duplicate": "error",
  "text-invalid-character": "error",
  "limit-exceeded": "error",
  "node-unreachable": "error",
  "dead-end": "error",
  "ending-missing": "error",
  "ending-unreachable": "error",
  "loop-back": "warning",
  "ending-has-choices": "warning",
  "node-title-empty": "warning",
  "cut-ref-repeated": "warning",
});

export interface BranchingIssue {
  readonly code: BranchingIssueCode;
  readonly severity: BranchingIssueSeverity;
  /** 문제가 있는 장면. 있으면 화면이 그 장면으로 이동시킨다. */
  readonly nodeId?: string;
  readonly choiceId?: string;
  readonly cutId?: string;
  /** 문제가 된 값(식별자·라벨 등). 문구 자리표시에 쓴다. */
  readonly value?: string;
  /** 겹친 개수 등. */
  readonly count?: number;
  /** `limit-exceeded` 일 때 어느 한도인지와 한도·실제 값. */
  readonly limit?: BranchingLimitName;
  readonly max?: number;
  readonly actual?: number;
}

export interface BranchingGraphStats {
  readonly nodeCount: number;
  readonly endingCount: number;
  readonly choiceCount: number;
  readonly cutCount: number;
  /** 시작 장면에서 선택지를 따라 닿을 수 있는 장면 수. */
  readonly reachableNodeCount: number;
  readonly loopBackCount: number;
  /** 시작 장면에서 가장 가까운 결말까지의 선택 횟수. 닿을 수 없으면 null. */
  readonly shortestPathSteps: number | null;
  /** 열거한 길(같은 장면을 두 번 지나지 않는 길)의 수. 상한에서 멈췄으면 `pathCountExact` 가 false 다. */
  readonly pathCount: number;
  readonly pathCountExact: boolean;
  /** 열거한 길 중 가장 긴 길의 선택 횟수. 열거한 길이 없으면 null. */
  readonly longestPathSteps: number | null;
}

export interface BranchingValidationReport {
  /** 오류가 없다. 이 값이 true 일 때만 독자에게 보여 줄 수 있다. */
  readonly valid: boolean;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly issues: readonly BranchingIssue[];
  readonly stats: BranchingGraphStats;
  /** 읽기 진행 기록이 가리키는 그래프 판(장면·선택지 연결의 지문). 글만 고치면 바뀌지 않는다. */
  readonly graphVersion: string;
}
