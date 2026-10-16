import assert from "node:assert/strict";

import { scoreCells, summarize } from "./aggregate.mjs";
import { RUBRIC } from "./rubric.mjs";
import { axeViolation, journeyResult, perfectCell } from "./test-fixtures.mjs";
import {
  WhatIfUsageError,
  computeLowerBound,
  computeRoadmap,
  computeWhatIf,
  fixCell,
  formatWhatIf,
  isSupportedType,
  parseWhatIfArguments,
  rescore,
  simulateFix,
  violationTypes,
} from "./what-if.mjs";

const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

const viewports = [{ id: "mobile", width: 390, height: 844 }, { id: "desktop", width: 1440, height: 900 }];
const routes = [
  { id: "a", label: "화면 A", path: "/a", auth: "public", group: "g" },
  { id: "b", label: "화면 B", path: "/b", auth: "user", group: "g" },
];

function cell(routeId, viewportId, overrides = {}) {
  return perfectCell({ key: `${routeId}@${viewportId}`, routeId, viewportId, ...overrides });
}

function journeysAtBudget() {
  return RUBRIC.journeys.items.map((item) => journeyResult(item.id, { actions: item.maxActions, totalMs: 1000 }));
}

/** report.json 과 같은 모양의 합성 보고서(칸 점수와 요약 포함). */
function buildReport({ timingTrusted = false, cells, journeys = journeysAtBudget() }) {
  const scored = scoreCells(cells, { timingTrusted });
  return {
    generatedAt: "2026-10-16T00:00:00.000Z",
    git: { commit: "abcdef0123456789abcdef" },
    environment: { timingTrusted, server: timingTrusted ? "production" : "dev" },
    plan: { routes: routes.map(({ id, path, auth }) => ({ id, path, auth })), viewports },
    summary: summarize({ scoredCells: scored, routes, viewports, journeyResults: journeys, timingTrusted }),
    cells: scored,
    journeys,
  };
}

function sampleReport(options = {}) {
  return buildReport({
    ...options,
    cells: [
      cell("a", "mobile", { responsive: { tapTargets: { small44: 12, small40: 5, small24: 1 } } }),
      cell("a", "desktop", {
        a11y: { focus: { noIndicator: 2, missingSamples: ["a.sr-only \"본문으로 건너뛰기\"", "summary.flex \"모드 열기\""] } },
        responsive: { tapTargets: { small44: 20, small40: 0, small24: 0 } },
      }),
      cell("b", "mobile", { a11y: { axe: { violations: [axeViolation("color-contrast", "serious", 4), axeViolation("button-name", "critical", 2)] } } }),
      cell("b", "desktop", { copy: { englishSentences: 2 } }),
    ],
  });
}

describe("what-if: fixCell", () => {
  it("이름 있는 axe 규칙만 없앤다", () => {
    const source = cell("a", "mobile", { a11y: { axe: { violations: [axeViolation("color-contrast", "serious"), axeViolation("region", "moderate")] } } });
    const fixed = fixCell(source, "axe:color-contrast");
    assert.deepEqual(fixed.a11y.axe.violations.map((violation) => violation.id), ["region"]);
    assert.equal(source.a11y.axe.violations.length, 2, "원본은 바뀌지 않는다");
  });

  it("이름 없는 컨트롤 유형은 이름 계열 규칙만 없앤다", () => {
    const source = cell("a", "mobile", { a11y: { axe: { violations: [axeViolation("button-name", "critical", 3), axeViolation("color-contrast", "serious")] } } });
    assert.deepEqual(fixCell(source, "unnamed-controls").a11y.axe.violations.map((violation) => violation.id), ["color-contrast"]);
  });

  it("포커스 표시 없음은 --match 에 맞는 표본만 줄인다", () => {
    const source = cell("a", "desktop", { a11y: { focus: { noIndicator: 3, missingSamples: ["a.sr-only \"본문으로 건너뛰기\"", "input.sr-only", "ol.flex"] } } });
    assert.equal(fixCell(source, "focus-visibility", { match: /본문으로/u }).a11y.focus.noIndicator, 2);
    assert.equal(fixCell(source, "focus-visibility").a11y.focus.noIndicator, 0);
  });

  it("겹침은 요소와 가린 요소 문자열로 걸러 줄인다", () => {
    const source = cell("a", "desktop", {
      responsive: { obscured: { count: 3, samples: [{ element: "a \"환경 설정\"", cover: "div.flex \"오리지널 애니·웹툰 OST\"" }, { element: "button", cover: "aside \"모바일 편집 안내\"" }, { element: "a", cover: "footer.workspace-statusbar" }] } },
    });
    assert.equal(fixCell(source, "obscured-controls", { match: /OST/u }).responsive.obscured.count, 2);
    assert.equal(fixCell(source, "obscured-controls").responsive.obscured.count, 0);
  });

  it("탭 대상은 기준 크기 이상인 컨트롤만 44px 로 올렸다고 가정할 수 있다", () => {
    const source = cell("a", "desktop", { responsive: { tapTargets: { small44: 30, small40: 8, small24: 2 } } });
    assert.equal(fixCell(source, "tap-targets").responsive.tapTargets.small44, 0);
    assert.equal(fixCell(source, "tap-targets", { tapFloor: 40 }).responsive.tapTargets.small44, 8);
    assert.equal(fixCell(source, "tap-targets", { tapFloor: 24 }).responsive.tapTargets.small44, 2);
  });

  it("제목·랜드마크·성능·카피 유형을 문제 없음 상태로 바꾼다", () => {
    const source = cell("a", "desktop", {
      a11y: { headings: { h1Count: 0, skippedLevels: 2, emptyHeadings: 1 }, landmarks: { mainCount: 2, duplicateGroups: 3 } },
      performance: { consoleErrors: 2, consoleWarnings: 3, failedRequests: 1, routeState: "error" },
      copy: { rawKeys: 1, placeholderLeaks: 2, emptyButtons: 4, englishSentences: 5 },
    });
    assert.deepEqual(fixCell(source, "heading-hierarchy").a11y.headings, { measured: true, h1Count: 1, skippedLevels: 0, emptyHeadings: 0 });
    assert.equal(fixCell(source, "landmarks").a11y.landmarks.duplicateGroups, 0);
    assert.equal(fixCell(source, "console-errors").performance.consoleErrors, 0);
    assert.equal(fixCell(source, "console-warnings").performance.consoleWarnings, 0);
    assert.equal(fixCell(source, "failed-requests").performance.failedRequests, 0);
    assert.equal(fixCell(source, "route-readiness").performance.routeState, "ready");
    const copyFixed = fixCell(source, "raw-keys").copy;
    assert.equal(copyFixed.rawKeys + copyFixed.placeholderLeaks, 0);
    assert.equal(fixCell(source, "empty-buttons").copy.emptyButtons, 0);
    assert.equal(fixCell(source, "english-sentences").copy.englishSentences, 0);
  });

  it("지원하지 않는 유형과 맞지 않는 옵션은 한글 오류로 거절한다", () => {
    const source = cell("a", "desktop");
    assert.throws(() => fixCell(source, "page-load-failed"), WhatIfUsageError);
    assert.throws(() => fixCell(source, "tap-targets", { match: /x/u }), /--match/u);
    assert.throws(() => fixCell(source, "landmarks", { tapFloor: 40 }), /--tap-floor/u);
    assert.equal(isSupportedType("axe:scrollable-region-focusable"), true);
    assert.equal(isSupportedType("page-load-failed"), false);
  });
});

describe("what-if: 다시 채점", () => {
  it("보고서의 칸 사실을 다시 채점하면 보고서의 합계와 같다", () => {
    const report = sampleReport();
    assert.equal(rescore(report, report.cells).total, report.summary.total);
    assert.equal(rescore(buildReport({ timingTrusted: true, cells: sampleReport().cells }), sampleReport().cells).total >= 0, true);
  });

  it("보고서에 나온 유형을 영향 칸·화면·건수와 함께 나열한다(화면 열기 실패 제외)", () => {
    const types = violationTypes(sampleReport());
    const tap = types.find((entry) => entry.type === "tap-targets");
    assert.deepEqual({ cells: tap.cells, routes: tap.routes, count: tap.count }, { cells: 2, routes: 1, count: 32 });
    assert.ok(types.some((entry) => entry.type === "axe:color-contrast"));
    assert.ok(types.every((entry) => entry.type !== "page-load-failed"));
  });

  it("없는 위반을 고쳐도 점수는 오르지 않고, 있는 위반을 고치면 오른다", () => {
    const report = sampleReport();
    assert.equal(simulateFix(report, "keyboard-trap").gain, 0);
    assert.ok(simulateFix(report, "tap-targets").gain > 0);
    assert.equal(simulateFix(report, "tap-targets").baseTotal, report.summary.total);
  });

  it("범위를 라우트·뷰포트로 좁히면 그 칸만 고친다", () => {
    const report = sampleReport();
    const all = simulateFix(report, "tap-targets").gain;
    const mobileOnly = simulateFix(report, "tap-targets", { viewportIds: ["mobile"] });
    const desktopOnly = simulateFix(report, "tap-targets", { viewportIds: ["desktop"] });
    assert.equal(mobileOnly.cellsInScope, 2);
    assert.ok(mobileOnly.gain > 0 && desktopOnly.gain > 0);
    assert.ok(Math.abs(mobileOnly.gain + desktopOnly.gain - all) < 0.011, "같은 유형을 나눠 고친 합은 전체와 같다(반올림 오차 이내)");
    assert.equal(simulateFix(report, "tap-targets", { routeIds: ["b"] }).gain, 0);
  });

  it("스킵 링크만 고친 값은 포커스 유형 전체보다 작다", () => {
    const report = sampleReport();
    const skipOnly = simulateFix(report, "focus-visibility", { match: /본문으로/u }).gain;
    const everything = simulateFix(report, "focus-visibility").gain;
    assert.ok(skipOnly > 0 && skipOnly < everything);
  });

  it("회수 점수가 큰 순서로 정렬하고, 같은 점수면 유형 이름 순이다", () => {
    const rows = computeWhatIf(sampleReport());
    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1];
      const current = rows[index];
      assert.ok(previous.gain > current.gain || (previous.gain === current.gain && previous.type.localeCompare(current.type, "en") <= 0));
    }
    assert.deepEqual(computeWhatIf(sampleReport()), rows, "같은 입력이면 같은 결과");
  });

  it("누적 합계는 줄어들지 않고 모두 고치면 화면 점수가 만점에 가까워진다", () => {
    const report = sampleReport();
    const rows = computeWhatIf(report);
    const steps = computeRoadmap(report, rows, 20);
    assert.equal(steps.length, rows.length);
    let previous = report.summary.total;
    for (const step of steps) {
      assert.ok(step.total >= previous);
      previous = step.total;
    }
    assert.equal(rescore(report, report.cells.map((entry) => rows.reduce((acc, row) => fixCell(acc, row.type), entry))).screenAverage75, 75);
  });
});

describe("what-if: 시간 지표 하한", () => {
  it("개발 서버 측정의 하한은 합계보다 낮고 성능 3점과 여정 시간 10%가 빠진 값이다", () => {
    const report = buildReport({ timingTrusted: false, cells: [cell("a", "mobile"), cell("b", "desktop")] });
    assert.equal(report.summary.screenAverage75, 75);
    assert.equal(report.summary.journeyScore25, 25);
    const lower = computeLowerBound(report);
    assert.equal(lower.screenAverage75, 72);
    assert.equal(lower.journeyScore25, 22.5);
    assert.equal(lower.total, 94.5);
    assert.ok(lower.total < report.summary.total);
  });

  it("하한 계산은 보고서의 칸과 여정을 바꾸지 않는다", () => {
    const report = sampleReport();
    const snapshot = JSON.stringify(report);
    computeLowerBound(report);
    assert.equal(JSON.stringify(report), snapshot);
  });
});

describe("what-if: 인자와 출력", () => {
  it("인자를 해석하고 잘못된 값은 거절한다", () => {
    const parsed = parseWhatIfArguments(["report.json", "--type", "tap-targets", "--routes", "a,b", "--viewports", "mobile", "--tap-floor", "40", "--json"]);
    assert.deepEqual({ report: parsed.report, type: parsed.type, routeIds: parsed.routeIds, viewportIds: parsed.viewportIds, tapFloor: parsed.tapFloor, json: parsed.json }, {
      report: "report.json", type: "tap-targets", routeIds: ["a", "b"], viewportIds: ["mobile"], tapFloor: 40, json: true,
    });
    assert.throws(() => parseWhatIfArguments([]), /보고서/u);
    assert.throws(() => parseWhatIfArguments(["r.json", "--tap-floor", "30", "--type", "tap-targets"]), /24 또는 40/u);
    assert.throws(() => parseWhatIfArguments(["r.json", "--match", "x"]), /--type/u);
    // --match 는 정규식이 아니라 문자열 조각이다: 정규식 특수문자도 그대로 글자로 취급한다.
    const literal = parseWhatIfArguments(["r.json", "--match", "a(b.", "--type", "focus-visibility"]).match;
    assert.equal(literal.test("xA(B.y"), true);
    assert.equal(literal.test("a(bz"), false);
    assert.throws(() => parseWhatIfArguments(["r.json", "--roadmap", "-1"]), /정수/u);
    assert.throws(() => parseWhatIfArguments(["r.json", "--nope"]), /알 수 없는 옵션/u);
    assert.throws(() => parseWhatIfArguments(["a.json", "b.json"]), /하나만/u);
    assert.equal(parseWhatIfArguments(["--help"]).help, true);
  });

  it("출력 표에 합계·하한·유형별 회수 점수가 들어간다", () => {
    const report = sampleReport();
    const rows = computeWhatIf(report);
    const text = formatWhatIf(report, rows, computeRoadmap(report, rows, 2), computeLowerBound(report), { routeIds: [], viewportIds: [] });
    assert.match(text, /합계 \d+\.\d{2} \/ 100/u);
    assert.match(text, /하한 \d+\.\d{2}/u);
    assert.match(text, /\| 탭 대상 44×44px 미만 \(tap-targets\) \|/u);
    assert.match(text, /\| 순서 \| 추가로 고치는 유형 \| 누적 합계 \|/u);
  });
});
