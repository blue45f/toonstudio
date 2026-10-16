import assert from "node:assert/strict";

import { analyzeFocusStops, analyzeHeadings, analyzeKeyboardTrap, analyzeLandmarks, summarizeUnnamedControls } from "./structure-analysis.mjs";

const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

describe("structure-analysis: 제목 계층", () => {
  it("h1 개수, 단계 건너뜀, 빈 제목을 센다", () => {
    const result = analyzeHeadings([{ level: 1, text: "제목" }, { level: 3, text: "건너뜀" }, { level: 2, text: "" }, { level: 2, text: "정상" }]);
    assert.equal(result.h1Count, 1);
    assert.equal(result.skippedLevels, 1);
    assert.equal(result.emptyHeadings, 1);
  });

  it("첫 제목이 h2 여도 건너뜀으로 세지 않는다(h1 없음은 따로 감점)", () => {
    const result = analyzeHeadings([{ level: 2, text: "a" }, { level: 3, text: "b" }]);
    assert.equal(result.skippedLevels, 0);
    assert.equal(result.h1Count, 0);
  });
});

describe("structure-analysis: 랜드마크", () => {
  it("main 개수와 같은 역할·같은 이름의 중복 그룹을 센다", () => {
    const result = analyzeLandmarks([
      { role: "main", label: "" }, { role: "navigation", label: "주 메뉴" }, { role: "navigation", label: "주 메뉴" },
      { role: "navigation", label: "푸터" }, { role: "complementary", label: "" }, { role: "complementary", label: "" },
    ]);
    assert.equal(result.mainCount, 1);
    assert.equal(result.duplicateGroups, 2);
    assert.equal(result.navigationCount, 3);
  });

  it("main 이 여러 개여도 중복 그룹에는 넣지 않는다", () => {
    const result = analyzeLandmarks([{ role: "main", label: "" }, { role: "main", label: "" }]);
    assert.equal(result.mainCount, 2);
    assert.equal(result.duplicateGroups, 0);
  });
});

describe("structure-analysis: 포커스 순회", () => {
  const stop = (id, hasIndicator = true) => ({ id, label: `요소${id}`, hasIndicator, offscreen: false });

  it("서로 다른 정류장 수와 표시 없는 정류장을 센다(같은 요소 재방문은 한 번)", () => {
    const stats = analyzeFocusStops([stop(1), stop(2, false), stop(3), stop(2, false), { id: null, label: "", hasIndicator: null, offscreen: false }], 5);
    assert.equal(stats.tabStops, 3);
    assert.equal(stats.noIndicator, 1);
    assert.equal(stats.bodyStops, 1);
    assert.deepEqual(stats.missingSamples, ["요소2"]);
  });

  it("판정 불가(null)는 표시 없음으로 세지 않는다", () => {
    assert.equal(analyzeFocusStops([stop(1, null)], 1).noIndicator, 0);
  });

  it("같은 요소에서 4번 연속 제자리면 키보드 함정이다", () => {
    const stats = analyzeFocusStops([stop(1), stop(2), stop(2), stop(2), stop(2)], 5);
    assert.equal(analyzeKeyboardTrap(stats, { modalOpen: false, focusableCount: 3 }).suspected, true);
  });

  it("정류장 3곳만 순환하고 페이지에 포커스 가능 요소가 많으면 함정, 모달이 열려 있으면 아니다", () => {
    const stops = Array.from({ length: 12 }, (_, index) => stop((index % 3) + 1));
    const stats = analyzeFocusStops(stops, 12);
    assert.equal(analyzeKeyboardTrap(stats, { modalOpen: false, focusableCount: 30 }).suspected, true);
    assert.equal(analyzeKeyboardTrap(stats, { modalOpen: true, focusableCount: 30 }).suspected, false);
    assert.equal(analyzeKeyboardTrap(stats, { modalOpen: false, focusableCount: 3 }).suspected, false);
  });
});

describe("structure-analysis: 이름 없는 컨트롤 요약", () => {
  it("버튼·링크·입력 계열로 노드 수를 합산한다", () => {
    const families = { buttons: ["button-name"], links: ["link-name"], inputs: ["label"] };
    const result = summarizeUnnamedControls([{ id: "button-name", nodes: 2 }, { id: "link-name", nodes: 1 }, { id: "label", nodes: 4 }, { id: "color-contrast", nodes: 9 }], families);
    assert.deepEqual(result, { buttons: 2, links: 1, inputs: 4, total: 7 });
  });
});
