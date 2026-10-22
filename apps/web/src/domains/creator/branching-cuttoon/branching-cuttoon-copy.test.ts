// @vitest-environment jsdom
import {
  BRANCHING_CUTTOON_LIMITS,
  BRANCHING_ISSUE_CODES,
  BRANCHING_ISSUE_SEVERITY,
  validateBranchingCuttoon,
  type BranchingCuttoonGraph,
  type BranchingEditBlock,
  type BranchingIssue,
  type BranchingIssueCode,
  type BranchingLimitName,
  type BranchingParseErrorCode,
} from "./model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  choiceDisplayLabel,
  editBlockMessage,
  issueMessage,
  kindLabel,
  nodeDisplayTitle,
  parseErrorMessage,
} from "./branching-cuttoon-copy";
import { tNow } from "./branching-cuttoon-test-kit";

beforeEach(() => {
  useI18n.getState().setLang("ko");
});
afterEach(() => {
  useI18n.getState().setLang("ko");
});

/** 시험 그래프에 들어 있는 작가의 글(번역 대상이 아니다). */
const USER_TEXT = ["갈림길", "도착지", "왼쪽"];

const GRAPH: BranchingCuttoonGraph = {
  title: "시험 이야기",
  startNodeId: "a",
  cuts: [{ id: "k1", caption: "첫 컷" }],
  nodes: [
    { id: "a", kind: "start", title: "갈림길", cutIds: ["k1"], choices: [{ id: "c1", label: "왼쪽", targetNodeId: "b" }] },
    { id: "b", kind: "ending", title: "도착지", cutIds: [], choices: [] },
    { id: "blank", kind: "scene", title: "  ", cutIds: [], choices: [] },
  ],
};

function issue(code: BranchingIssueCode, extra: Partial<BranchingIssue> = {}): BranchingIssue {
  return { code, severity: BRANCHING_ISSUE_SEVERITY[code], ...extra };
}

/** Record 의 키와 값을 (키, 값) 쌍으로 푼다. 키 집합이 타입으로 정해져 있어 빠진 항목이 컴파일 오류로 드러난다. */
function pairsOf<K extends string>(record: Readonly<Record<K, string>>): Array<[K, string]> {
  const pairs: Array<[K, string]> = [];
  for (const key in record) pairs.push([key, record[key]]);
  return pairs;
}

const LIMITS: Array<[BranchingLimitName, string]> = [
  ["nodes", "장면은 200개까지만"],
  ["choicesPerNode", "갈림길: 선택지는 장면마다 6개까지만"],
  ["cutsPerNode", "갈림길: 컷은 장면마다 30개까지만"],
  ["cuts", "컷은 모두 합쳐 1000개까지만"],
  ["graphTitleLength", "작품 제목은 80자까지만"],
  ["nodeTitleLength", "갈림길: 장면 제목은 80자까지만"],
  ["choiceLabelLength", "갈림길: 선택지 이름은 80자까지만"],
  ["captionLength", "컷 k1: 컷 글은 200자까지만"],
];

/** 코드마다 하나 이상의 사례: [사례 이름, 항목, 한국어 문구에 들어 있어야 하는 글]. */
type IssueCase = [name: string, found: BranchingIssue, expected: string];
const CASES: IssueCase[] = [
  ["start-missing", issue("start-missing"), "시작 장면이 없어요"],
  ["start-dangling", issue("start-dangling", { value: "zz" }), "시작 장면으로 지정한 장면을 찾지 못했어요 (zz)"],
  ["start-kind-mismatch", issue("start-kind-mismatch", { nodeId: "a" }), "갈림길: 시작 장면으로 지정됐지만 종류가 ‘시작’이 아니에요"],
  ["start-duplicate", issue("start-duplicate", { nodeId: "a" }), "갈림길: 종류가 ‘시작’인 장면이 둘 이상이에요"],
  ["node-id-invalid", issue("node-id-invalid", { nodeId: "a", value: "a b" }), "갈림길: 장면 식별자 형식이 맞지 않아요 (a b)"],
  ["node-id-duplicate", issue("node-id-duplicate", { value: "a", count: 2 }), "식별자가 같은 장면이 2개 있어요 (a)"],
  ["choice-id-invalid", issue("choice-id-invalid", { nodeId: "a", value: "x y" }), "갈림길: 선택지 식별자 형식이 맞지 않아요 (x y)"],
  ["choice-id-duplicate", issue("choice-id-duplicate", { nodeId: "a", value: "c1", count: 3 }), "갈림길: 식별자가 같은 선택지가 3개 있어요 (c1)"],
  ["cut-id-invalid", issue("cut-id-invalid", { value: "k 1" }), "컷 식별자 형식이 맞지 않아요 (k 1)"],
  ["cut-id-duplicate", issue("cut-id-duplicate", { value: "k1", count: 2 }), "식별자가 같은 컷이 2개 있어요 (k1)"],
  ["choice-target-empty", issue("choice-target-empty", { nodeId: "a", choiceId: "c1" }), "갈림길 · 선택지 \"왼쪽\": 도착 장면을 아직 고르지 않았어요"],
  ["choice-target-dangling", issue("choice-target-dangling", { nodeId: "a", choiceId: "c1", value: "zz" }), "선택지 \"왼쪽\": 도착 장면을 찾지 못했어요 (zz)"],
  ["cut-ref-dangling", issue("cut-ref-dangling", { nodeId: "a", cutId: "k9" }), "갈림길: 컷 표에서 컷을 찾지 못했어요 (k9)"],
  ["choice-label-empty", issue("choice-label-empty", { nodeId: "a", choiceId: "c1" }), "갈림길: 이름이 비어 있는 선택지가 있어요"],
  ["choice-label-duplicate", issue("choice-label-duplicate", { nodeId: "a", value: "왼쪽" }), "갈림길: 같은 이름의 선택지가 있어요 (왼쪽)"],
  ["text-invalid-character(title)", issue("text-invalid-character", { nodeId: "a", value: "title" }), "갈림길: 장면 제목에 줄바꿈이나 보이지 않는 제어 문자"],
  ["text-invalid-character(label)", issue("text-invalid-character", { nodeId: "a", choiceId: "c1", value: "label" }), "갈림길: 선택지 이름에 줄바꿈이나 보이지 않는 제어 문자"],
  ["text-invalid-character(caption)", issue("text-invalid-character", { cutId: "k1", value: "caption" }), "컷 k1: 컷 글에 보이지 않는 제어 문자"],
  ["text-invalid-character(graphTitle)", issue("text-invalid-character", { value: "graphTitle" }), "작품 제목에 줄바꿈이나 보이지 않는 제어 문자"],
  ["node-unreachable", issue("node-unreachable", { nodeId: "a" }), "갈림길: 시작에서 이 장면으로 올 수 있는 길이 없어요"],
  ["dead-end", issue("dead-end", { nodeId: "a" }), "갈림길: 막다른 길이에요"],
  ["ending-missing", issue("ending-missing"), "결말 장면이 하나도 없어요"],
  ["ending-unreachable", issue("ending-unreachable", { nodeId: "a" }), "갈림길: 이 장면에서는 어떤 결말에도 갈 수 없어요"],
  ["loop-back", issue("loop-back", { nodeId: "a", choiceId: "c1", value: "b" }), "갈림길 · 선택지 \"왼쪽\": ‘도착지’ 장면으로 되돌아가는 길이에요"],
  ["ending-has-choices", issue("ending-has-choices", { nodeId: "b", count: 2 }), "도착지: 결말 장면의 선택지 2개는 독자에게 보이지 않아요"],
  ["node-title-empty", issue("node-title-empty", { nodeId: "blank" }), "제목이 비어 있는 장면이 있어요"],
  ["cut-ref-repeated", issue("cut-ref-repeated", { nodeId: "a", cutId: "k1", count: 2 }), "갈림길: 같은 컷이 2번 들어 있어요 (k1)"],
  ...LIMITS.map(([limit, expected]): IssueCase => [
    `limit-exceeded(${limit})`,
    issue("limit-exceeded", {
      nodeId: limit === "nodes" || limit === "cuts" || limit === "graphTitleLength" ? undefined : "a",
      cutId: limit === "captionLength" ? "k1" : undefined,
      limit,
      max: BRANCHING_CUTTOON_LIMITS[limit],
      actual: BRANCHING_CUTTOON_LIMITS[limit] + 1,
    }),
    expected,
  ]),
];

describe("검증 항목 문구", () => {
  it("모든 검증 코드에 사례가 하나 이상 있다(코드가 늘면 이 시험이 문구 누락을 알린다)", () => {
    const covered = new Set(CASES.map(([, found]) => found.code));
    expect([...covered].sort()).toEqual([...BRANCHING_ISSUE_CODES].sort());
  });

  it.each(CASES)("%s: 한국어 문구가 맞고 자리표시가 남지 않으며 다음 행동을 안내한다", (_name, found, expected) => {
    const message = issueMessage(tNow, found, GRAPH);
    expect(message).toContain(expected);
    expect(message).not.toMatch(/[{}]/u);
    expect(message).not.toContain("branchingCuttoon.");
  });

  it.each(CASES)("%s: 영어 문구도 있고, 작가가 쓴 글을 뺀 나머지에 한글과 자리표시가 남지 않는다", (_name, found) => {
    useI18n.getState().setLang("en");
    const message = issueMessage(tNow, found, GRAPH);
    expect(message.length).toBeGreaterThan(10);
    // 장면 제목·선택지 이름은 작가가 쓴 글이라 번역하지 않고 그대로 보인다. 그 글을 빼고 보면 문구는 모두 영어다.
    const withoutAuthorText = USER_TEXT.reduce((rest, text) => rest.replaceAll(text, ""), message);
    expect(withoutAuthorText).not.toMatch(/[ㄱ-ㆎ가-힣]/u);
    expect(message).not.toMatch(/[{}]/u);
  });

  it("장면 제목이 비어 있으면 ‘제목 없는 장면’으로 부른다", () => {
    expect(issueMessage(tNow, issue("dead-end", { nodeId: "blank" }), GRAPH)).toContain("제목 없는 장면: 막다른 길이에요");
  });

  it("그래프에 없는 장면을 가리키는 항목도 던지지 않는다", () => {
    expect(() => issueMessage(tNow, issue("dead-end", { nodeId: "missing" }), GRAPH)).not.toThrow();
    expect(() => issueMessage(tNow, issue("choice-target-dangling", { nodeId: "missing", choiceId: "none", value: "zz" }), GRAPH)).not.toThrow();
  });

  it("사용자가 쓴 글에 중괄호가 있어도 자리표시로 다시 풀지 않는다", () => {
    const braces: BranchingCuttoonGraph = {
      ...GRAPH,
      nodes: [{ id: "a", kind: "start", title: "{count}번째 {title}", cutIds: [], choices: [] }, ...GRAPH.nodes.slice(1)],
    };
    expect(issueMessage(tNow, issue("dead-end", { nodeId: "a" }), braces)).toContain("{count}번째 {title}: 막다른 길이에요");
  });

  it("실제 검증기가 내는 항목도 모두 문구로 바뀐다", () => {
    const broken: BranchingCuttoonGraph = {
      title: "깨진 이야기",
      startNodeId: "nope",
      cuts: [{ id: "k1", caption: "글" }],
      nodes: [
        { id: "a", kind: "scene", title: "", cutIds: ["k1", "k1", "k9"], choices: [{ id: "c1", label: "", targetNodeId: "" }, { id: "c1", label: " ", targetNodeId: "zz" }] },
        { id: "a", kind: "ending", title: "끝", cutIds: [], choices: [{ id: "c2", label: "되돌아", targetNodeId: "a" }] },
        { id: "lonely", kind: "scene", title: "외딴 장면", cutIds: [], choices: [] },
      ],
    };
    const report = validateBranchingCuttoon(broken);
    expect(report.issues.length).toBeGreaterThan(8);
    for (const found of report.issues) {
      const message = issueMessage(tNow, found, broken);
      expect(message, found.code).not.toMatch(/[{}]/u);
      expect(message, found.code).not.toContain("branchingCuttoon.");
      expect(message.length, found.code).toBeGreaterThan(8);
    }
  });
});

describe("가져오기 오류 문구", () => {
  const CODES: Readonly<Record<BranchingParseErrorCode, string>> = {
    empty: "비어 있어요",
    "too-large": "파일이 너무 커요. 1MiB 이하의 파일만 읽어요",
    "not-json": "JSON 형식이 아니에요",
    "not-object": "맨 바깥이 객체가 아니에요",
    "wrong-format": "분기형 컷툰 파일이 아니에요",
    "unsupported-version": "지원하지 않는 판 번호예요",
    "missing-field": "nodes[0].title 항목이 없어요",
    "wrong-type": "nodes[0].title 항목의 형식이 맞지 않아요",
    "unknown-kind": "nodes[0].title 항목의 장면 종류를 알 수 없어요",
    "too-many-items": "nodes[0].title 항목이 너무 많아요",
    "string-too-long": "nodes[0].title 항목의 글이 너무 길어요",
  };

  it.each(pairsOf(CODES))("%s 는 원인과 다음 행동을 안내한다", (code, expected) => {
    const message = parseErrorMessage(tNow, { code, path: "nodes[0].title" });
    expect(message).toContain(expected);
    expect(message).not.toMatch(/[{}]/u);
  });

  it("영어에서도 문구가 있다", () => {
    useI18n.getState().setLang("en");
    for (const [code] of pairsOf(CODES)) {
      const message = parseErrorMessage(tNow, { code, path: "nodes[0]" });
      expect(message, code).not.toMatch(/[ㄱ-ㆎ가-힣{}]/u);
      expect(message.length, code).toBeGreaterThan(8);
    }
  });
});

describe("편집 거절 문구", () => {
  const BLOCKS: Readonly<Record<BranchingEditBlock, string>> = {
    "node-limit": "장면은 200개까지만",
    "choice-limit": "선택지는 장면마다 6개까지만",
    "cut-limit": "컷은 장면마다 30개까지만",
    "cut-table-limit": "컷은 모두 합쳐 1000개까지만",
    "node-not-found": "고칠 대상을 찾지 못했어요",
    "choice-not-found": "고칠 대상을 찾지 못했어요",
    "cut-not-found": "고칠 대상을 찾지 못했어요",
    "start-protected": "시작 장면은 지우거나 종류를 바꿀 수 없어요",
    "id-exhausted": "새 식별자를 만들 수 없어요",
  };

  it.each(pairsOf(BLOCKS))("%s 는 이유와 다음 행동을 안내한다", (reason, expected) => {
    const message = editBlockMessage(tNow, reason);
    expect(message).toContain(expected);
    expect(message).not.toMatch(/[{}]/u);
  });
});

describe("이름 도우미", () => {
  it("종류 이름", () => {
    expect(kindLabel(tNow, "start")).toBe("시작");
    expect(kindLabel(tNow, "scene")).toBe("장면");
    expect(kindLabel(tNow, "ending")).toBe("결말");
  });

  it("비었거나 공백뿐인 이름은 안내 이름으로 바꾼다", () => {
    expect(nodeDisplayTitle(tNow, undefined)).toBe("제목 없는 장면");
    expect(nodeDisplayTitle(tNow, { title: " \t " })).toBe("제목 없는 장면");
    expect(nodeDisplayTitle(tNow, { title: "  골목  " })).toBe("골목");
    expect(choiceDisplayLabel(tNow, undefined)).toBe("이름 없는 선택지");
    expect(choiceDisplayLabel(tNow, "")).toBe("이름 없는 선택지");
    expect(choiceDisplayLabel(tNow, " 문을 연다 ")).toBe("문을 연다");
  });
});
