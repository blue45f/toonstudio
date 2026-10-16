import assert from "node:assert/strict";

import { categoryAverages, compareReports, lowestCells, lowestRoutes, rankViolations, scoreCells, scoreRoutes, summarize, viewportAverages } from "./aggregate.mjs";
import { RUBRIC } from "./rubric.mjs";
import { axeViolation, journeyResult, perfectCell } from "./test-fixtures.mjs";

const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

const routes = [
  { id: "a", label: "화면 A", path: "/a", auth: "public", group: "g" },
  { id: "b", label: "화면 B", path: "/b", auth: "user", group: "g" },
  { id: "c", label: "화면 C", path: "/c", auth: "public", group: "g" },
];
const viewports = [{ id: "mobile" }, { id: "desktop" }];

function cell(routeId, viewportId, overrides = {}) {
  return perfectCell({ key: `${routeId}@${viewportId}`, routeId, viewportId, ...overrides });
}

function withoutScore(scored) {
  const copy = { ...scored };
  delete copy.score;
  return copy;
}

function sampleCells() {
  return scoreCells([
    cell("a", "mobile"),
    cell("a", "desktop", { responsive: { tapTargets: { small44: 5 } } }),
    cell("b", "mobile", { a11y: { axe: { violations: [axeViolation("color-contrast", "serious", 8)] } } }),
    cell("b", "desktop", { a11y: { axe: { violations: [axeViolation("color-contrast", "serious", 3)] } }, responsive: { tapTargets: { small44: 30 } } }),
    cell("c", "mobile", { copy: { rawKeys: 1 } }),
    cell("c", "desktop", { copy: { rawKeys: 1 } }),
  ], { timingTrusted: true });
}

describe("aggregate: 화면별 점수", () => {
  it("화면 점수는 뷰포트 점수의 평균이다", () => {
    const [a, b, c] = scoreRoutes(sampleCells(), routes);
    assert.equal(a.total, 74.5);
    assert.equal(b.total, 71);
    assert.equal(c.total, 73.5);
    assert.deepEqual(Object.keys(a.viewports), ["desktop", "mobile"]);
  });

  it("영역별 점수와 가장 나쁜 뷰포트를 함께 돌려준다", () => {
    const [a, b] = scoreRoutes(sampleCells(), routes);
    assert.equal(a.sections.responsive, 19.5);
    assert.equal(b.worstViewport, 68);
  });

  it("측정 실패한 칸은 0점으로 평균에 들어가고 failedCells 로 센다", () => {
    const cells = scoreCells([cell("a", "mobile"), { key: "a@desktop", routeId: "a", viewportId: "desktop", status: "failed", error: "x" }], { timingTrusted: true });
    const [a] = scoreRoutes(cells, routes);
    assert.equal(a.total, 37.5);
    assert.equal(a.failedCells, 1);
  });

  it("선언 순서와 무관하게 입력 순서가 달라도 같은 요약이 나온다(결정적)", () => {
    const forward = sampleCells();
    const reversed = [...forward].reverse();
    const first = summarize({ scoredCells: forward, routes, viewports, journeyResults: [], timingTrusted: true });
    const second = summarize({ scoredCells: reversed, routes, viewports, journeyResults: [], timingTrusted: true });
    assert.deepEqual(first, second);
  });
});

describe("aggregate: 최저점과 위반 순위", () => {
  it("최저점 화면은 낮은 순이고 동점이면 id 순이다", () => {
    const tied = scoreCells([cell("b", "desktop", { copy: { rawKeys: 1 } }), cell("a", "desktop", { copy: { rawKeys: 1 } }), cell("c", "desktop")], { timingTrusted: true });
    const lowest = lowestRoutes(scoreRoutes(tied, routes), 2);
    assert.deepEqual(lowest.map((entry) => entry.routeId), ["a", "b"]);
  });

  it("최저점 칸 목록은 limit 개만 돌려준다", () => {
    assert.equal(lowestCells(sampleCells(), 2).length, 2);
    assert.equal(lowestCells(sampleCells(), 2)[0].key, "b@desktop");
  });

  it("위반 유형은 잃은 점수 합이 큰 순이고 대표 화면은 가장 많이 잃은 칸이다", () => {
    const ranked = rankViolations(sampleCells(), { limit: 10 });
    assert.equal(ranked[0].type, "tap-targets");
    assert.equal(ranked[0].lost, 7);
    assert.equal(ranked[0].representative.key, "b@desktop");
    const contrast = ranked.find((entry) => entry.type === "axe:color-contrast");
    assert.equal(contrast.cells, 2);
    assert.equal(contrast.routes, 1);
  });

  it("잃은 점수가 0인 항목은 순위에 넣지 않고 limit 를 지킨다", () => {
    const ranked = rankViolations(sampleCells(), { limit: 2 });
    assert.equal(ranked.length, 2);
    assert.ok(ranked.every((entry) => entry.lost > 0));
  });
});

describe("aggregate: 전체 요약", () => {
  it("합계 = 화면 평균(75점 만점) + 여정 점수(25점 만점)", () => {
    const journeyResults = RUBRIC.journeys.items.map((entry) => journeyResult(entry.id, { actions: entry.maxActions }));
    const summary = summarize({ scoredCells: sampleCells(), routes, viewports, journeyResults, timingTrusted: true });
    assert.equal(summary.screenAverage75, 73);
    assert.equal(summary.journeyScore25, 25);
    assert.equal(summary.total, 98);
    assert.equal(summary.measuredMax, 100);
    assert.equal(summary.normalized100, 98);
  });

  it("여정을 재지 못했으면 측정한 범위(75점)만 말하고 100점 환산을 따로 준다", () => {
    const summary = summarize({ scoredCells: sampleCells(), routes, viewports, journeyResults: [], timingTrusted: true });
    assert.equal(summary.journeyScore25, null);
    assert.equal(summary.measuredMax, 75);
    assert.equal(summary.total, 73);
    assert.equal(summary.normalized100, 97.33);
  });

  it("영역 평균과 뷰포트 평균을 계산한다", () => {
    const routeScores = scoreRoutes(sampleCells(), routes);
    assert.equal(categoryAverages(routeScores).accessibility.score, 24.67);
    assert.deepEqual(viewportAverages(sampleCells(), viewports), { mobile: 74.17, desktop: 71.83 });
  });
});

describe("aggregate: 보고서 비교", () => {
  const report = (cells, summary) => ({ cells, summary });

  it("같은 보고서는 동일하다", () => {
    const cells = sampleCells();
    const first = report(cells, { total: 90, screenAverage75: 70, journeyScore25: 20 });
    assert.equal(compareReports(first, structuredClone(first)).identical, true);
  });

  it("점수 항목이 달라진 칸과 항목을 알려 준다", () => {
    const cells = sampleCells();
    const changed = scoreCells([cell("a", "mobile", { copy: { englishSentences: 2 } }), ...cells.slice(1).map(withoutScore)], { timingTrusted: true });
    const result = compareReports(report(cells, { total: 90, screenAverage75: 70, journeyScore25: 20 }), report(changed, { total: 89.5, screenAverage75: 69.5, journeyScore25: 20 }));
    assert.equal(result.identical, false);
    assert.equal(result.totalDelta, -0.5);
    assert.equal(result.changedCells.length, 1);
    assert.equal(result.changedCells[0].key, "a@mobile");
    assert.equal(result.changedCells[0].items[0].item, "english-sentences");
  });

  it("한쪽에만 있는 칸을 구분한다", () => {
    const cells = sampleCells();
    const result = compareReports(report(cells, { total: 1 }), report(cells.slice(1), { total: 1 }));
    assert.deepEqual(result.onlyInFirst, ["a@mobile"]);
    assert.equal(result.identical, false);
  });
});
