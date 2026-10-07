import { describe, expect, it } from "vitest";

import {
  addPdfSource,
  buildPdfOutputPlan,
  buildPdfSplitPlans,
  createPdfWorkbenchState,
  movePdfPage,
  movePdfPageTo,
  normalizeRotationDelta,
  parsePdfPageRanges,
  removePdfPage,
  removePdfSource,
  rotatePdfPage,
  suggestPdfOutputName,
  type PdfWorkbenchSource,
  type PdfWorkbenchState,
} from "./pdf-workbench-model";

const sourceA: PdfWorkbenchSource = { id: "a", name: "a.pdf", sizeBytes: 100, pageCount: 3 };
const sourceB: PdfWorkbenchSource = { id: "b", name: "b.pdf", sizeBytes: 200, pageCount: 2 };

function stateWithBoth(): PdfWorkbenchState {
  return addPdfSource(addPdfSource(createPdfWorkbenchState(), sourceA), sourceB);
}

function pageIds(state: PdfWorkbenchState): string[] {
  return state.pages.map((page) => page.id);
}

describe("소스 추가·제거 (병합의 기본 연산)", () => {
  it("두 소스를 붙이면 페이지가 소스 순서대로 한 목록이 된다", () => {
    const state = stateWithBoth();
    expect(state.sources).toHaveLength(2);
    expect(pageIds(state)).toEqual(["a#0", "a#1", "a#2", "b#0", "b#1"]);
  });

  it("같은 소스를 다시 추가하면 중복 없이 그대로다", () => {
    const state = stateWithBoth();
    expect(addPdfSource(state, sourceA)).toBe(state);
  });

  it("소스를 제거하면 그 소스의 페이지만 빠진다", () => {
    const state = removePdfSource(stateWithBoth(), "a");
    expect(state.sources.map((source) => source.id)).toEqual(["b"]);
    expect(pageIds(state)).toEqual(["b#0", "b#1"]);
  });

  it("없는 소스 제거는 상태를 바꾸지 않는다", () => {
    const state = stateWithBoth();
    expect(removePdfSource(state, "missing")).toBe(state);
  });
});

describe("페이지 재배열", () => {
  it("한 칸 이동이 이웃과 자리를 바꾼다", () => {
    const state = stateWithBoth();
    expect(pageIds(movePdfPage(state, "a#0", 1))).toEqual(["a#1", "a#0", "a#2", "b#0", "b#1"]);
    expect(pageIds(movePdfPage(state, "b#0", -1))).toEqual(["a#0", "a#1", "b#0", "a#2", "b#1"]);
  });

  it("경계에서 이동하면 그대로다", () => {
    const state = stateWithBoth();
    expect(movePdfPage(state, "a#0", -1)).toBe(state);
    expect(movePdfPage(state, "b#1", 1)).toBe(state);
  });

  it("목표 위치로 이동하면 사이에 있던 페이지들이 한 칸씩 밀린다", () => {
    const state = stateWithBoth();
    expect(pageIds(movePdfPageTo(state, "a#0", 3))).toEqual(["a#1", "a#2", "b#0", "a#0", "b#1"]);
    expect(pageIds(movePdfPageTo(state, "b#1", 0))).toEqual(["b#1", "a#0", "a#1", "a#2", "b#0"]);
  });

  it("목표 위치가 범위를 벗어나면 양끝으로 clamp된다", () => {
    const state = stateWithBoth();
    expect(pageIds(movePdfPageTo(state, "a#1", 99))).toEqual(["a#0", "a#2", "b#0", "b#1", "a#1"]);
    expect(pageIds(movePdfPageTo(state, "a#1", -5))).toEqual(["a#1", "a#0", "a#2", "b#0", "b#1"]);
  });

  it("다른 소스의 페이지와 섞어 재배열해도 출력 계획이 그 순서를 따른다 (병합 순서)", () => {
    const state = movePdfPageTo(stateWithBoth(), "b#0", 1);
    expect(buildPdfOutputPlan(state)).toEqual([
      { sourceId: "a", sourcePageIndex: 0, rotationDelta: 0 },
      { sourceId: "b", sourcePageIndex: 0, rotationDelta: 0 },
      { sourceId: "a", sourcePageIndex: 1, rotationDelta: 0 },
      { sourceId: "a", sourcePageIndex: 2, rotationDelta: 0 },
      { sourceId: "b", sourcePageIndex: 1, rotationDelta: 0 },
    ]);
  });

  it("페이지를 제거하면 목록에서만 빠지고 소스는 남는다", () => {
    const state = removePdfPage(stateWithBoth(), "a#1");
    expect(pageIds(state)).toEqual(["a#0", "a#2", "b#0", "b#1"]);
    expect(state.sources).toHaveLength(2);
  });
});

describe("페이지 회전", () => {
  it("시계 방향 회전이 90도씩 누적되고 360에서 0으로 돌아온다", () => {
    let state = stateWithBoth();
    state = rotatePdfPage(state, "a#1", 1);
    expect(state.pages[1]?.rotationDelta).toBe(90);
    state = rotatePdfPage(state, "a#1", 1);
    state = rotatePdfPage(state, "a#1", 1);
    state = rotatePdfPage(state, "a#1", 1);
    expect(state.pages[1]?.rotationDelta).toBe(0);
  });

  it("반시계 방향 회전은 270으로 감긴다", () => {
    const state = rotatePdfPage(stateWithBoth(), "a#0", -1);
    expect(state.pages[0]?.rotationDelta).toBe(270);
  });

  it("normalizeRotationDelta가 임의 각도를 90도 격자로 정규화한다", () => {
    expect(normalizeRotationDelta(450)).toBe(90);
    expect(normalizeRotationDelta(-90)).toBe(270);
    expect(normalizeRotationDelta(0)).toBe(0);
  });

  it("회전이 출력 계획에 실린다", () => {
    const state = rotatePdfPage(stateWithBoth(), "b#1", 1);
    expect(buildPdfOutputPlan(state).at(-1)).toEqual({
      sourceId: "b",
      sourcePageIndex: 1,
      rotationDelta: 90,
    });
  });
});

describe("페이지 범위 파싱·분할", () => {
  it("단일·범위·목록 표기를 모두 읽는다", () => {
    expect(parsePdfPageRanges("1-3, 5, 8-10", 10)).toEqual({
      ok: true,
      ranges: [
        { start: 1, end: 3 },
        { start: 5, end: 5 },
        { start: 8, end: 10 },
      ],
    });
  });

  it("빈 입력·형식 오류·역전·초과를 한글 오류로 돌려준다", () => {
    expect(parsePdfPageRanges("  ", 10).ok).toBe(false);
    expect(parsePdfPageRanges("a-b", 10).ok).toBe(false);
    expect(parsePdfPageRanges("5-3", 10).ok).toBe(false);
    expect(parsePdfPageRanges("1-11", 10).ok).toBe(false);
    expect(parsePdfPageRanges("0", 10).ok).toBe(false);
    const overflow = parsePdfPageRanges("1-11", 10);
    if (!overflow.ok) expect(overflow.error).toContain("10페이지");
  });

  it("분할 계획이 범위마다 결합 순서의 페이지를 골라 담는다", () => {
    const state = stateWithBoth();
    const parsed = parsePdfPageRanges("2-3, 5", state.pages.length);
    if (!parsed.ok) throw new Error("파싱 실패");
    const plans = buildPdfSplitPlans(state, parsed.ranges);
    expect(plans.map((plan) => plan.label)).toEqual(["2-3", "5"]);
    expect(plans[0]?.steps).toEqual([
      { sourceId: "a", sourcePageIndex: 1, rotationDelta: 0 },
      { sourceId: "a", sourcePageIndex: 2, rotationDelta: 0 },
    ]);
    expect(plans[1]?.steps).toEqual([{ sourceId: "b", sourcePageIndex: 1, rotationDelta: 0 }]);
  });

  it("재배열된 목록 기준으로 분할한다 (분할은 보이는 순서가 기준)", () => {
    const state = movePdfPageTo(stateWithBoth(), "b#1", 0);
    const parsed = parsePdfPageRanges("1", state.pages.length);
    if (!parsed.ok) throw new Error("파싱 실패");
    const plans = buildPdfSplitPlans(state, parsed.ranges);
    expect(plans[0]?.steps).toEqual([{ sourceId: "b", sourcePageIndex: 1, rotationDelta: 0 }]);
  });
});

describe("출력 파일 이름", () => {
  it("접미사와 확장자를 정리한다", () => {
    expect(suggestPdfOutputName("단행본.pdf")).toBe("단행본.pdf");
    expect(suggestPdfOutputName("단행본.pdf", "1-3")).toBe("단행본-1-3.pdf");
    expect(suggestPdfOutputName("단행본", "병합")).toBe("단행본-병합.pdf");
    expect(suggestPdfOutputName("")).toBe("워크벤치.pdf");
  });
});
