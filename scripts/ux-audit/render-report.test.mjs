import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { scoreCells, summarize } from "./aggregate.mjs";
import { renderCategoryTable, renderJourneyTable, renderLowestTable, renderRouteTable, renderRubricMarkdown, renderSummaryMarkdown, renderUnmeasuredTable, renderViolationTable } from "./render-report.mjs";
import { ROUTES } from "./routes.mjs";
import { RUBRIC, UNMEASURED_HUMAN_ITEMS, describeRubric } from "./rubric.mjs";
import { axeViolation, journeyResult, perfectCell } from "./test-fixtures.mjs";

const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

function sampleReport() {
  const routes = [{ id: "a", label: "화면 | A", path: "/a", auth: "public", group: "g" }, { id: "b", label: "화면 B", path: "/b", auth: "user", group: "g" }];
  const viewports = [{ id: "mobile", width: 390, height: 844 }, { id: "desktop", width: 1440, height: 900 }];
  const cells = scoreCells([
    perfectCell({ key: "a@mobile", routeId: "a", viewportId: "mobile" }),
    perfectCell({ key: "a@desktop", routeId: "a", viewportId: "desktop", responsive: { tapTargets: { small44: 12 } } }),
    perfectCell({ key: "b@mobile", routeId: "b", viewportId: "mobile", a11y: { axe: { violations: [axeViolation("color-contrast", "serious", 5)] } } }),
    perfectCell({ key: "b@desktop", routeId: "b", viewportId: "desktop" }),
  ], { timingTrusted: false });
  const journeys = [
    ...RUBRIC.journeys.items.slice(0, 2).map((entry) => ({ ...journeyResult(entry.id, { actions: entry.maxActions }), label: entry.label, frictions: [] })),
    { ...journeyResult("template-to-work", { success: false }), label: "템플릿", blockedAt: { step: "시작", reason: "시간 초과" }, frictions: ["우회"] },
  ];
  const summary = summarize({ scoredCells: cells, routes, viewports, journeyResults: journeys, timingTrusted: false });
  return {
    rubricVersion: "1.0.0",
    generatedAt: "2026-10-16T00:00:00.000Z",
    git: { commit: "0123456789abcdef" },
    environment: { server: "dev", browser: "Chromium 141", axe: "4.13.0" },
    plan: { viewports, skippedRoutes: [] },
    summary,
    cells,
    journeys,
  };
}

describe("render-report: 표 생성", () => {
  it("점수 규칙 표는 모든 항목 행을 포함하고 코드 상수에서 만든다", () => {
    const text = renderRubricMarkdown();
    assert.ok(text.includes("critical 1건당 -3"));
    assert.ok(text.includes("접근성(25)"));
    assert.equal(text.split("\n").length, describeRubric().length + 2, "행 수는 규칙 표 항목 수와 같다");
  });

  it("셀 안의 | 는 이스케이프하고 점수는 소수 둘째 자리까지 쓴다", () => {
    const report = sampleReport();
    const table = renderRouteTable(report);
    assert.ok(table.includes("화면 \\| A"));
    assert.ok(/\| 7\d\.\d \|/u.test(table));
  });

  it("영역별 점수표에 여정 영역과 합계가 들어 있다", () => {
    const table = renderCategoryTable(sampleReport());
    assert.ok(table.includes("사용성(여정)"));
    assert.ok(table.includes("합계(측정한 범위)"));
  });

  it("최저점·위반·여정·미측정 표를 만든다", () => {
    const report = sampleReport();
    assert.ok(renderLowestTable(report).includes("가장 약한 영역"));
    assert.ok(renderViolationTable(report).includes("axe:color-contrast"));
    const journeys = renderJourneyTable(report);
    assert.ok(journeys.includes("시작 — 시간 초과"));
    assert.ok(journeys.includes("우회"));
    assert.equal(renderUnmeasuredTable().split("\n").length, 2 + UNMEASURED_HUMAN_ITEMS.length);
  });

  it("요약 문서에는 모든 절 제목이 있다", () => {
    const text = renderSummaryMarkdown(sampleReport());
    for (const heading of ["영역별 점수", "화면별 점수", "최저점 화면 5개", "위반 상위 10개 유형", "핵심 여정", "측정하지 않은 것"]) {
      assert.ok(text.includes(`## ${heading}`), heading);
    }
  });
});

describe("README: 점수 규칙 표 동기화", () => {
  it("README 의 규칙 표가 rubric.mjs 에서 생성한 표와 같다(바꿨다면 --print-rubric 출력으로 갱신)", () => {
    const readme = readFileSync(new URL("./README.md", import.meta.url), "utf8");
    const block = readme.match(/<!-- rubric:start -->\n([\s\S]*?)\n<!-- rubric:end -->/u)?.[1];
    assert.equal(block, renderRubricMarkdown());
  });

  it("README 가 말하는 라우트 수(공개·로그인)가 routes.mjs 와 같다", () => {
    const readme = readFileSync(new URL("./README.md", import.meta.url), "utf8");
    const publicCount = ROUTES.filter((route) => route.auth === "public").length;
    const userCount = ROUTES.length - publicCount;
    assert.ok(readme.includes(`라우트 ${ROUTES.length}개(공개 ${publicCount} · 로그인 필요 ${userCount})`));
  });
});
