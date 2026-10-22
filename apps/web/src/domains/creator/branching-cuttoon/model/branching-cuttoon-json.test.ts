import { describe, expect, it } from "vitest";

import { choice, graphOf, loopGraph, node, validGraph } from "./__tests__/graph-fixtures";
import {
  BRANCHING_IMPORT_LIMITS,
  parseBranchingCuttoonJson,
  parseBranchingCuttoonValue,
  serializeBranchingCuttoon,
} from "./branching-cuttoon-json";
import { BRANCHING_CUTTOON_FORMAT, BRANCHING_CUTTOON_SCHEMA_VERSION } from "./branching-cuttoon-types";
import { validateBranchingCuttoon } from "./branching-cuttoon-validate";

function envelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: BRANCHING_CUTTOON_FORMAT,
    schemaVersion: BRANCHING_CUTTOON_SCHEMA_VERSION,
    title: "이야기",
    startNodeId: "start",
    cuts: [{ id: "k1", caption: "컷" }],
    nodes: [
      { id: "start", kind: "start", title: "시작", cutIds: ["k1"], choices: [{ id: "c1", label: "끝", targetNodeId: "end" }] },
      { id: "end", kind: "ending", title: "끝", cutIds: [], choices: [] },
    ],
    ...overrides,
  };
}

function errorsOf(text: string) {
  const result = parseBranchingCuttoonJson(text);
  return result.ok ? [] : result.errors;
}

describe("내보내기", () => {
  it("형식 이름과 판 번호를 앞에 적는다", () => {
    const parsed: unknown = JSON.parse(serializeBranchingCuttoon(validGraph()));
    expect(parsed).toMatchObject({ format: "toonstudio.branching-cuttoon", schemaVersion: 1 });
  });

  it("같은 그래프는 언제나 같은 글이 된다", () => {
    expect(serializeBranchingCuttoon(validGraph())).toBe(serializeBranchingCuttoon(validGraph()));
  });

  it("필드 순서가 고정되어 있다", () => {
    const keys = Object.keys(JSON.parse(serializeBranchingCuttoon(validGraph())) as Record<string, unknown>);
    expect(keys).toEqual(["format", "schemaVersion", "title", "startNodeId", "cuts", "nodes"]);
  });

  it("그래프 객체에 딸려 온 알 수 없는 속성은 쓰지 않는다", () => {
    const graph = { ...validGraph(), secret: "누출" };
    expect(serializeBranchingCuttoon(graph)).not.toContain("누출");
  });

  it("들여쓰기 2칸의 읽기 좋은 JSON 이다", () => {
    expect(serializeBranchingCuttoon(validGraph()).split("\n")[1]).toBe('  "format": "toonstudio.branching-cuttoon",');
  });
});

describe("내보냈다 가져오기", () => {
  it("그래프가 그대로 돌아온다", () => {
    const original = validGraph();
    const result = parseBranchingCuttoonJson(serializeBranchingCuttoon(original));
    expect(result).toEqual({ ok: true, graph: original, ignoredFieldCount: 0 });
  });

  it("되돌아가는 길이 있는 그래프도 그대로 돌아오고 같은 보고서를 낸다", () => {
    const original = loopGraph();
    const result = parseBranchingCuttoonJson(serializeBranchingCuttoon(original));
    expect(result.ok && validateBranchingCuttoon(result.graph)).toEqual(validateBranchingCuttoon(original));
  });

  it("한도 크기의 그래프도 1MiB 안에서 돌아온다", () => {
    const count = 200;
    const nodes = Array.from({ length: count }, (_unused, position) => (
      position === count - 1
        ? node("end", "ending")
        : node(position === 0 ? "start" : `n${position}`, position === 0 ? "start" : "scene",
          Array.from({ length: 6 }, (_ignored, which) => choice(`c${which}`, "가".repeat(80), position + 1 === count - 1 ? "end" : `n${position + 1}`)),
          [], "가".repeat(80))
    ));
    const text = serializeBranchingCuttoon(graphOf(nodes, { start: "start" }));
    expect(text.length).toBeLessThan(BRANCHING_IMPORT_LIMITS.maxTextLength);
    expect(parseBranchingCuttoonJson(text).ok).toBe(true);
  });

  it("내용이 잘못돼도 모양이 맞으면 그래프로 돌려주고 검증기가 오류를 알린다", () => {
    const text = JSON.stringify(envelope({
      nodes: [{ id: "start", kind: "start", title: "시작", cutIds: ["없는컷"], choices: [{ id: "c1", label: "", targetNodeId: "사라진" }] }],
    }));
    const result = parseBranchingCuttoonJson(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const codes = validateBranchingCuttoon(result.graph).issues.map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining(["cut-ref-dangling", "choice-label-empty", "choice-target-dangling", "dead-end", "ending-missing"]));
  });

  it("알 수 없는 필드는 버리고 개수만 알린다", () => {
    const text = JSON.stringify(envelope({
      extra: 1,
      nodes: [
        { id: "start", kind: "start", title: "시작", cutIds: [], choices: [{ id: "c1", label: "끝", targetNodeId: "end", note: "x" }], mood: "공포" },
        { id: "end", kind: "ending", title: "끝", cutIds: [], choices: [] },
      ],
    }));
    const result = parseBranchingCuttoonJson(text);
    expect(result.ok && result.ignoredFieldCount).toBe(3);
    expect(result.ok && JSON.stringify(result.graph)).not.toContain("공포");
  });
});

describe("가져오기 거절", () => {
  it("빈 글", () => {
    expect(errorsOf("")).toEqual([{ code: "empty", path: "" }]);
    expect(errorsOf("  \n ")).toEqual([{ code: "empty", path: "" }]);
  });

  it("1MiB 를 넘는 글은 읽지 않는다", () => {
    expect(errorsOf(" ".repeat(BRANCHING_IMPORT_LIMITS.maxTextLength) + "x")).toEqual([{ code: "too-large", path: "" }]);
  });

  it("JSON 이 아닌 글", () => {
    expect(errorsOf("{ not json")).toEqual([{ code: "not-json", path: "" }]);
  });

  it.each([["배열", "[]"], ["숫자", "3"], ["문자열", '"x"'], ["null", "null"]])("최상위가 객체가 아니다(%s)", (_name, text) => {
    expect(errorsOf(text)).toEqual([{ code: "not-object", path: "" }]);
  });

  it("다른 형식의 JSON", () => {
    expect(errorsOf(JSON.stringify({ title: "x" }))).toEqual([{ code: "wrong-format", path: "format" }]);
    expect(errorsOf(JSON.stringify(envelope({ format: "other" })))).toEqual([{ code: "wrong-format", path: "format" }]);
  });

  it.each([[2], [0], ["1"], [null]])("지원하지 않는 판 번호(%s)", (version) => {
    expect(errorsOf(JSON.stringify(envelope({ schemaVersion: version })))).toEqual([{ code: "unsupported-version", path: "schemaVersion" }]);
  });

  it("필수 필드가 없다", () => {
    const missing = { ...envelope() };
    delete missing.title;
    expect(errorsOf(JSON.stringify(missing))).toEqual([{ code: "missing-field", path: "title" }]);
  });

  it("필드 형식이 틀리다", () => {
    expect(errorsOf(JSON.stringify(envelope({ title: 3 })))).toEqual([{ code: "wrong-type", path: "title" }]);
    expect(errorsOf(JSON.stringify(envelope({ nodes: {} })))).toEqual([{ code: "wrong-type", path: "nodes" }]);
    expect(errorsOf(JSON.stringify(envelope({ cuts: "x" })))).toEqual([{ code: "wrong-type", path: "cuts" }]);
  });

  it("배열 원소가 객체가 아니다", () => {
    expect(errorsOf(JSON.stringify(envelope({ nodes: [1] })))).toEqual([{ code: "wrong-type", path: "nodes[0]" }]);
    expect(errorsOf(JSON.stringify(envelope({ cuts: [null] })))).toEqual([{ code: "wrong-type", path: "cuts[0]" }]);
  });

  it("알 수 없는 장면 종류", () => {
    const nodes = [{ id: "start", kind: "boss", title: "시작", cutIds: [], choices: [] }];
    expect(errorsOf(JSON.stringify(envelope({ nodes })))).toEqual([{ code: "unknown-kind", path: "nodes[0].kind" }]);
  });

  it("깊은 위치의 오류는 경로로 알린다", () => {
    const nodes = [
      { id: "start", kind: "start", title: "시작", cutIds: [], choices: [{ id: "c1", label: 7, targetNodeId: "end" }] },
    ];
    expect(errorsOf(JSON.stringify(envelope({ nodes })))).toEqual([{ code: "wrong-type", path: "nodes[0].choices[0].label" }]);
  });

  it("컷 식별자 목록의 원소 형식", () => {
    const nodes = [{ id: "start", kind: "start", title: "시작", cutIds: ["k1", 2], choices: [] }];
    expect(errorsOf(JSON.stringify(envelope({ nodes })))).toEqual([{ code: "wrong-type", path: "nodes[0].cutIds[1]" }]);
  });

  it("너무 많은 항목은 읽기 전에 거절한다", () => {
    const nodes = Array.from({ length: BRANCHING_IMPORT_LIMITS.maxNodes + 1 }, (_unused, position) => ({ id: `n${position}`, kind: "scene", title: "", cutIds: [], choices: [] }));
    expect(errorsOf(JSON.stringify(envelope({ nodes })))).toEqual([{ code: "too-many-items", path: "nodes" }]);
    const cutIds = Array.from({ length: BRANCHING_IMPORT_LIMITS.maxCutIdsPerNode + 1 }, () => "k");
    const crowded = [{ id: "start", kind: "start", title: "시작", cutIds, choices: [] }];
    expect(errorsOf(JSON.stringify(envelope({ nodes: crowded })))).toEqual([{ code: "too-many-items", path: "nodes[0].cutIds" }]);
  });

  it("너무 긴 글은 거절한다", () => {
    const long = "가".repeat(BRANCHING_IMPORT_LIMITS.maxStringLength + 1);
    expect(errorsOf(JSON.stringify(envelope({ title: long })))).toEqual([{ code: "string-too-long", path: "title" }]);
  });

  it("오류 목록은 20개까지만 싣는다", () => {
    const nodes = Array.from({ length: 50 }, () => 7);
    expect(errorsOf(JSON.stringify(envelope({ nodes })))).toHaveLength(BRANCHING_IMPORT_LIMITS.maxReportedErrors);
  });

  it("모양이 틀리면 일부만 받지 않고 통째로 거절한다", () => {
    const nodes = [
      { id: "start", kind: "start", title: "시작", cutIds: [], choices: [] },
      { id: "broken", kind: "scene" },
    ];
    expect(parseBranchingCuttoonJson(JSON.stringify(envelope({ nodes }))).ok).toBe(false);
  });
});

describe("프로토타입 오염", () => {
  it("__proto__ 키는 읽지도 복사하지도 않는다", () => {
    const text = '{"format":"toonstudio.branching-cuttoon","schemaVersion":1,"title":"x","startNodeId":"s","cuts":[],'
      + '"nodes":[{"id":"s","kind":"start","title":"t","cutIds":[],"choices":[],"__proto__":{"polluted":true}}],"__proto__":{"polluted":true}}';
    const result = parseBranchingCuttoonJson(text);
    expect(result.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    if (result.ok) expect(Object.prototype.hasOwnProperty.call(result.graph.nodes[0], "polluted")).toBe(false);
  });

  it("값 파서도 객체가 아닌 값을 거절한다", () => {
    expect(parseBranchingCuttoonValue(undefined)).toEqual({ ok: false, errors: [{ code: "not-object", path: "" }] });
    expect(parseBranchingCuttoonValue([])).toEqual({ ok: false, errors: [{ code: "not-object", path: "" }] });
  });

  it("상속받은 속성은 필드로 인정하지 않는다", () => {
    const inherited = Object.create({ format: BRANCHING_CUTTOON_FORMAT, schemaVersion: 1 }) as Record<string, unknown>;
    expect(parseBranchingCuttoonValue(inherited)).toEqual({ ok: false, errors: [{ code: "wrong-format", path: "format" }] });
  });
});
