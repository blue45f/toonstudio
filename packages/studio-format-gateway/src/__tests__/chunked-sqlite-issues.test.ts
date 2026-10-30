import { describe, expect, it } from "vitest";

import { CLIP_ISSUES_PER_CODE, ClipIssueList, clipDiagnosticText } from "../chunked-sqlite-issues";

describe("clipDiagnosticText", () => {
  it("코드 포인트 수가 한도 이하면 그대로 돌려주고, 하나라도 넘으면 한도까지만 남기고 말줄임표를 붙인다(경계)", () => {
    expect(clipDiagnosticText("abc", 3)).toBe("abc");
    expect(clipDiagnosticText("abcd", 3)).toBe("abc…");
    expect(clipDiagnosticText("", 3)).toBe("");
    expect(clipDiagnosticText("a", 1)).toBe("a");
    expect(clipDiagnosticText("ab", 1)).toBe("a…");
  });

  it("한도가 0이면 빈 문자열만 그대로 두고 나머지는 말줄임표만 남는다", () => {
    expect(clipDiagnosticText("", 0)).toBe("");
    expect(clipDiagnosticText("x", 0)).toBe("…");
  });

  it("기본 한도는 80 코드 포인트다", () => {
    expect(clipDiagnosticText("가".repeat(80))).toBe("가".repeat(80));
    expect(clipDiagnosticText("가".repeat(81))).toBe(`${"가".repeat(80)}…`);
  });

  it("서로게이트 쌍은 한 코드 포인트로 세고 반으로 자르지 않는다", () => {
    expect(clipDiagnosticText("😀😀😀😀😀", 3)).toBe("😀😀😀…");
    expect(clipDiagnosticText("😀😀😀", 3)).toBe("😀😀😀");
    expect(clipDiagnosticText("a😀b😀c", 2)).toBe("a😀…");
  });

  it("아주 긴 입력도 한도에 비례하는 비용으로 자른다(앞 한도+1개 코드 포인트만 훑는다)", () => {
    const stringPrototype = String.prototype as unknown as { [Symbol.iterator]: () => Iterator<string> };
    const original = stringPrototype[Symbol.iterator];
    let steps = 0;
    stringPrototype[Symbol.iterator] = function counting(this: string): Iterator<string> {
      const inner = original.call(this);
      return {
        next: () => {
          steps += 1;
          return inner.next();
        },
        [Symbol.iterator]() {
          return this;
        },
      } as Iterator<string>;
    };
    try {
      expect(clipDiagnosticText("x".repeat(20_000_000), 40)).toBe(`${"x".repeat(40)}…`);
    } finally {
      stringPrototype[Symbol.iterator] = original;
    }

    expect(steps).toBe(41);
  });
});

describe("ClipIssueList", () => {
  it("totals는 코드별로 add가 불린 횟수를 센다(코드당·전체 한도로 목록에서 빠진 것도 포함한다)", () => {
    const list = new ClipIssueList(3, 2);
    for (let index = 0; index < 5; index += 1) list.add("semantic", "a", "m");
    for (let index = 0; index < 4; index += 1) list.add("semantic", "b", "m");

    expect(list.totals()).toEqual({ a: 5, b: 4 });
    // 목록에는 a 둘과 b 하나만 실렸고 나머지는 요약으로 남았다.
    expect(list.toArray().filter((issue) => issue.code === "a" || issue.code === "b")).toHaveLength(3);
    expect(new ClipIssueList(5).totals()).toEqual({});
  });

  it("totals를 고쳐도 목록의 집계는 바뀌지 않는다(복사본이다)", () => {
    const list = new ClipIssueList(5);
    list.add("semantic", "a", "m");
    const totals = list.totals();
    totals.a = 99;

    expect(list.totals()).toEqual({ a: 1 });
  });

  it("넣은 순서대로 담고 path는 있을 때만 필드로 둔다", () => {
    const list = new ClipIssueList(10);
    list.add("semantic", "a", "첫째");
    list.add("resource", "b", "둘째", "layers[0]");

    const [first, second] = list.toArray();
    expect(first).toEqual({ scope: "semantic", code: "a", message: "첫째" });
    expect(Object.hasOwn(first!, "path")).toBe(false);
    expect(second).toEqual({ scope: "resource", code: "b", message: "둘째", path: "layers[0]" });
  });

  it("전체 한도를 넘는 진단은 버리고 건수를 한 건으로 요약한다(정확한 문구와 범위)", () => {
    const list = new ClipIssueList(3);
    for (let index = 0; index < 8; index += 1) list.add("semantic", `code-${index}`, `m${index}`);

    const result = list.toArray();
    expect(result).toHaveLength(4);
    expect(result.slice(0, 3).map((issue) => issue.code)).toEqual(["code-0", "code-1", "code-2"]);
    expect(result[3]).toEqual({ scope: "container", code: "clip-issues-truncated", message: "진단 5건을 생략했다 (한도 3건)" });
  });

  it("전체 한도와 같은 개수까지는 요약 없이 담는다", () => {
    const list = new ClipIssueList(3);
    for (let index = 0; index < 3; index += 1) list.add("semantic", `code-${index}`, "m");

    expect(list.toArray()).toHaveLength(3);
    list.add("semantic", "code-3", "m");
    expect(list.toArray()).toHaveLength(4);
    expect(list.toArray().at(-1)!.code).toBe("clip-issues-truncated");
  });

  it("전체 한도가 0이면 아무것도 담지 않고 요약만 남긴다", () => {
    const list = new ClipIssueList(0);
    list.add("semantic", "x", "m");
    list.add("semantic", "y", "m");

    expect(list.toArray()).toEqual([{ scope: "container", code: "clip-issues-truncated", message: "진단 2건을 생략했다 (한도 0건)" }]);
  });

  it("같은 코드는 코드당 한도(기본 50)까지만 담고 넘는 건수를 코드별 요약으로 남긴다", () => {
    expect(CLIP_ISSUES_PER_CODE).toBe(50);
    const list = new ClipIssueList(500);
    for (let index = 0; index < 60; index += 1) list.add("resource", "same", `m${index}`, `p${index}`);

    const result = list.toArray();
    expect(result).toHaveLength(51);
    expect(result.slice(0, 50).every((issue) => issue.code === "same")).toBe(true);
    expect(result[49]!.path).toBe("p49");
    expect(result[50]).toEqual({ scope: "resource", code: "clip-issues-collapsed", message: "same 진단 10건을 더 생략했다 (코드당 최대 50건)" });
  });

  it("코드당 한도 경계: 정확히 한도만큼은 요약이 없고 하나 넘으면 1건을 요약한다", () => {
    const exact = new ClipIssueList(100, 3);
    for (let index = 0; index < 3; index += 1) exact.add("semantic", "k", "m");
    expect(exact.toArray()).toHaveLength(3);

    const over = new ClipIssueList(100, 3);
    for (let index = 0; index < 4; index += 1) over.add("semantic", "k", "m");
    expect(over.toArray()).toHaveLength(4);
    expect(over.toArray()[3]!.message).toBe("k 진단 1건을 더 생략했다 (코드당 최대 3건)");
  });

  it("코드마다 한도를 따로 센다: 한 코드가 넘쳐도 다른 코드는 밀려나지 않는다", () => {
    const list = new ClipIssueList(100, 2);
    for (let index = 0; index < 5; index += 1) list.add("resource", "noisy", "m");
    list.add("semantic", "rare", "중요");

    const result = list.toArray();
    expect(result.map((issue) => issue.code)).toEqual(["noisy", "noisy", "rare", "clip-issues-collapsed"]);
  });

  it("코드별 요약은 코드가 처음 넘친 순서로 붙고 범위는 그 코드의 첫 넘침 때 범위다", () => {
    const list = new ClipIssueList(100, 1);
    list.add("semantic", "first", "m");
    list.add("resource", "second", "m");
    list.add("container", "second", "m");
    list.add("metadata", "first", "m");
    list.add("metadata", "first", "m");

    const collapsed = list.toArray().filter((issue) => issue.code === "clip-issues-collapsed");
    expect(collapsed.map((issue) => [issue.scope, issue.message])).toEqual([
      ["container", "second 진단 1건을 더 생략했다 (코드당 최대 1건)"],
      ["metadata", "first 진단 2건을 더 생략했다 (코드당 최대 1건)"],
    ]);
  });

  it("코드당 한도로 생략한 진단은 전체 한도에서 버린 건수에 세지 않는다", () => {
    const list = new ClipIssueList(2, 2);
    for (let index = 0; index < 5; index += 1) list.add("semantic", "a", "m");
    list.add("semantic", "b", "m");
    list.add("semantic", "c", "m");

    const result = list.toArray();
    // 전체 한도 2건은 a가 이미 채웠다. b와 c는 전체 한도로 버려지고(2건), a의 넘침 3건은 코드별 요약이다.
    expect(result.map((issue) => [issue.code, issue.message])).toEqual([
      ["a", "m"],
      ["a", "m"],
      ["clip-issues-collapsed", "a 진단 3건을 더 생략했다 (코드당 최대 2건)"],
      ["clip-issues-truncated", "진단 2건을 생략했다 (한도 2건)"],
    ]);
  });

  it("toArray는 호출할 때마다 새 배열이고 고쳐도 목록에 영향이 없다", () => {
    const list = new ClipIssueList(5);
    list.add("semantic", "a", "m");

    const first = list.toArray();
    first.push({ scope: "semantic", code: "intruder", message: "x" });
    first[0]!.message = "mutated";

    expect(list.toArray()).toHaveLength(1);
    expect(list.toArray()).not.toBe(first);
    expect(list.toArray()).toEqual(list.toArray());
  });
});
