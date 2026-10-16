import assert from "node:assert/strict";

import { RUBRIC, SCREEN_MAX, describeRubric, isNameRule, scoreCell, scoreJourney, scoreJourneys } from "./rubric.mjs";
import { axeViolation, journeyResult, perfectCell } from "./test-fixtures.mjs";

const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

const trusted = { timingTrusted: true };
const item = (result, sectionId, itemId) => result.sections[sectionId].items.find((entry) => entry.id === itemId);

describe("rubric: 배점 구조", () => {
  it("화면 만점은 75점이고 여정 25점을 더해 100점이 된다", () => {
    assert.equal(SCREEN_MAX, 75);
    const total = Object.values(RUBRIC.categories).reduce((sum, category) => sum + category.max, 0);
    assert.equal(total, 100);
  });

  it("describeRubric 의 항목 배점 합이 영역 배점과 일치한다(코드와 문서가 어긋나지 않는다)", () => {
    const sums = new Map();
    for (const row of describeRubric()) sums.set(row.category, (sums.get(row.category) ?? 0) + row.max);
    for (const [id, category] of Object.entries(RUBRIC.categories)) {
      assert.equal(sums.get(id), category.max, `${id} 항목 배점 합`);
    }
  });

  it("모든 규칙 행은 감점 규칙 문장을 가진다", () => {
    for (const row of describeRubric()) assert.ok(row.rule.length > 10, row.id);
  });
});

describe("rubric: 화면 점수 - 접근성", () => {
  it("위반이 없고 전부 측정했으면 75점이다", () => {
    const result = scoreCell(perfectCell(), trusted);
    assert.equal(result.total, 75);
    assert.deepEqual(result.violations, []);
  });

  it("axe 는 critical -3, serious -1, moderate -0.5, minor -0.25 이고 노드 수가 아니라 규칙 수로 센다", () => {
    const cell = perfectCell({
      a11y: { axe: { violations: [
        axeViolation("aria-valid-attr", "critical", 50),
        axeViolation("color-contrast", "serious", 99),
        axeViolation("region", "moderate"),
        axeViolation("tabindex", "minor"),
      ] } },
    });
    const axe = item(scoreCell(cell, trusted), "accessibility", "axe");
    assert.equal(axe.lost, 4.75);
    assert.equal(axe.count, 4);
  });

  it("axe 감점은 항목 배점(10)을 넘지 못한다", () => {
    const violations = Array.from({ length: 6 }, (_, index) => axeViolation(`rule-${index}`, "critical"));
    const result = scoreCell(perfectCell({ a11y: { axe: { violations } } }), trusted);
    assert.equal(item(result, "accessibility", "axe").lost, 10);
    assert.equal(result.sections.accessibility.score, 15);
  });

  it("이름 계열 규칙은 이름 없는 컨트롤 항목에서만 노드 수만큼 센다(이중 감점 없음)", () => {
    assert.equal(isNameRule("button-name"), true);
    assert.equal(isNameRule("color-contrast"), false);
    const cell = perfectCell({ a11y: { axe: { violations: [axeViolation("button-name", "critical", 3), axeViolation("link-name", "serious", 2)] } } });
    const result = scoreCell(cell, trusted);
    assert.equal(item(result, "accessibility", "axe").lost, 0);
    assert.equal(item(result, "accessibility", "unnamed-controls").lost, 2.5);
    assert.equal(item(result, "accessibility", "unnamed-controls").count, 5);
  });

  it("제목 계층: h1 없음 -1.5, h1 중복 -1, 건너뜀·빈 제목 각 -0.5, 상한 3", () => {
    const none = scoreCell(perfectCell({ a11y: { headings: { h1Count: 0 } } }), trusted);
    assert.equal(item(none, "accessibility", "heading-hierarchy").lost, 1.5);
    const many = scoreCell(perfectCell({ a11y: { headings: { h1Count: 2, skippedLevels: 2, emptyHeadings: 1 } } }), trusted);
    assert.equal(item(many, "accessibility", "heading-hierarchy").lost, 2.5);
    const capped = scoreCell(perfectCell({ a11y: { headings: { h1Count: 0, skippedLevels: 9 } } }), trusted);
    assert.equal(item(capped, "accessibility", "heading-hierarchy").lost, 3);
  });

  it("랜드마크: main 없음 -1.5, 중복 그룹 1건당 -0.5", () => {
    const result = scoreCell(perfectCell({ a11y: { landmarks: { mainCount: 0, duplicateGroups: 2 } } }), trusted);
    assert.equal(item(result, "accessibility", "landmarks").lost, 2.5);
  });

  it("포커스 가시성: 표시 없는 정류장 1곳당 -1, 정류장이 없으면 -3, 키보드 함정 -2", () => {
    const missing = scoreCell(perfectCell({ a11y: { focus: { noIndicator: 2 } } }), trusted);
    assert.equal(item(missing, "accessibility", "focus-visibility").lost, 2);
    const noStops = scoreCell(perfectCell({ a11y: { focus: { tabStops: 0, noIndicator: 0 } } }), trusted);
    assert.equal(item(noStops, "accessibility", "focus-visibility").lost, 3);
    const trap = scoreCell(perfectCell({ a11y: { trap: { suspected: true, reason: "제자리" } } }), trusted);
    assert.equal(item(trap, "accessibility", "keyboard-trap").lost, 2);
  });
});

describe("rubric: 화면 점수 - 반응형·시각·카피", () => {
  it("가로 스크롤: 1px 이하는 감점 없음, 초과 -4, 40px 이상 -6", () => {
    const lost = (px) => item(scoreCell(perfectCell({ responsive: { scroll: { overflowPx: px } } }), trusted), "responsive", "horizontal-scroll").lost;
    assert.deepEqual([lost(0), lost(1), lost(2), lost(39), lost(40), lost(400)], [0, 0, 4, 4, 6, 6]);
  });

  it("탭 대상 44px 미만은 5개마다 -1, 상한 6", () => {
    const lost = (count) => item(scoreCell(perfectCell({ responsive: { tapTargets: { small44: count } } }), trusted), "responsive", "tap-targets").lost;
    assert.deepEqual([lost(0), lost(1), lost(5), lost(6), lost(26), lost(500)], [0, 1, 1, 2, 6, 6]);
  });

  it("잘린 요소 -0.5, 가려진 컨트롤 -1, 각자 상한 4", () => {
    const result = scoreCell(perfectCell({ responsive: { clipped: { count: 3 }, obscured: { count: 9 } } }), trusted);
    assert.equal(item(result, "responsive", "clipped-elements").lost, 1.5);
    assert.equal(item(result, "responsive", "obscured-controls").lost, 4);
  });

  it("시각 일관성: 원시 색 클래스 -0.5, 미선언 토큰 -1, 인라인 5개마다 -1(상한 각 6·5·4)", () => {
    const result = scoreCell(perfectCell({ visual: {
      rawColorClasses: { distinct: 20 },
      undeclaredTokens: { distinct: 3 },
      inlineColors: { elements: 11 },
    } }), trusted);
    assert.equal(item(result, "visual", "raw-color-classes").lost, 6);
    assert.equal(item(result, "visual", "undeclared-tokens").lost, 3);
    assert.equal(item(result, "visual", "inline-colors").lost, 3);
    assert.equal(result.sections.visual.score, 3);
  });

  it("카피: 번역 키·자리표시자 종류당 -1.5(상한 3), 빈 버튼 -0.5(상한 1), 영어 문장 -0.25(상한 1)", () => {
    const result = scoreCell(perfectCell({ copy: { rawKeys: 1, placeholderLeaks: 2, emptyButtons: 5, englishSentences: 2 } }), trusted);
    assert.equal(item(result, "copy", "raw-keys").lost, 3);
    assert.equal(item(result, "copy", "empty-buttons").lost, 1);
    assert.equal(item(result, "copy", "english-sentences").lost, 0.5);
    assert.equal(result.sections.copy.score, 0.5);
  });
});

describe("rubric: 성능 체감과 미측정 처리", () => {
  const noisy = perfectCell({ performance: { consoleErrors: 2, consoleWarnings: 1, failedRequests: 1, cls: 0.3, lcpMs: 5000, interactiveMs: 6000 } });

  it("개발 서버(시간 지표 불신)에서는 CLS·LCP·준비 시간을 분모에서 빼고 10점으로 환산한다", () => {
    const result = scoreCell(noisy, { timingTrusted: false });
    const performance = result.sections.performance;
    assert.equal(performance.available, 7);
    assert.equal(performance.lost, 3.5);
    assert.equal(performance.score, 5);
    assert.equal(item(result, "performance", "cls").measured, false);
  });

  it("시간 지표를 믿을 수 있으면 모두 감점한다", () => {
    const performance = scoreCell(noisy, trusted).sections.performance;
    assert.equal(performance.available, 10);
    assert.equal(performance.lost, 6.5);
    assert.equal(performance.score, 3.5);
  });

  it("route-stage 가 stalled·error 이면 화면 준비 상태에서 -1, degraded 는 -0.5", () => {
    const lost = (routeState) => item(scoreCell(perfectCell({ performance: { routeState } }), trusted), "performance", "route-readiness").lost;
    assert.deepEqual([lost("ready"), lost("degraded"), lost("stalled"), lost("error")], [0, 0.5, 1, 1]);
  });

  it("측정하지 못한 구역은 감점하지 않고 합계를 측정한 구역으로 환산한다", () => {
    const cell = perfectCell({ a11y: { axe: { measured: false }, headings: { measured: false }, landmarks: { measured: false }, focus: { measured: false }, trap: { measured: false } } });
    const result = scoreCell(cell, trusted);
    assert.equal(result.sections.accessibility.score, null);
    assert.equal(result.measuredMax, 50);
    assert.equal(result.total, 75);
  });

  it("화면을 열지 못한 칸은 0점이고 page-load-failed 위반을 남긴다", () => {
    const result = scoreCell({ status: "failed", error: "시간 초과" }, trusted);
    assert.equal(result.total, 0);
    assert.equal(result.failed, true);
    assert.equal(result.violations[0].type, "page-load-failed");
  });

  it("같은 입력은 같은 점수를 내고 입력을 바꾸지 않는다(결정적)", () => {
    const cell = perfectCell({ a11y: { axe: { violations: [axeViolation("color-contrast", "serious", 4)] } }, responsive: { tapTargets: { small44: 7 } } });
    const snapshot = JSON.stringify(cell);
    const first = scoreCell(cell, trusted);
    const second = scoreCell(cell, trusted);
    assert.deepEqual(first, second);
    assert.equal(JSON.stringify(cell), snapshot);
  });

  it("axe 위반 목록은 규칙별 잃은 점수를 항목 상한에 맞춰 나눠 돌려준다", () => {
    const violations = Array.from({ length: 6 }, (_, index) => axeViolation(`rule-${index}`, "critical"));
    const result = scoreCell(perfectCell({ a11y: { axe: { violations } } }), trusted);
    const axeLoss = result.violations.filter((entry) => entry.type.startsWith("axe:")).reduce((sum, entry) => sum + entry.lost, 0);
    assert.ok(Math.abs(axeLoss - 10) < 0.05, `axe 손실 합 ${axeLoss}`);
  });
});

describe("rubric: 여정 점수", () => {
  const definition = RUBRIC.journeys.items[0];

  it("완주하고 조작 수가 예산 이내면 가중치 전부를 얻는다(시간 지표 불신일 때 효율까지)", () => {
    const result = scoreJourney(journeyResult(definition.id, { actions: definition.maxActions }), definition, { timingTrusted: false });
    assert.equal(result.earned, result.available);
  });

  it("실패한 여정은 0점이다", () => {
    const result = scoreJourney(journeyResult(definition.id, { success: false }), definition, { timingTrusted: true });
    assert.equal(result.earned, 0);
    assert.equal(result.measured, true);
  });

  it("조작이 예산의 2배면 효율 구성(20%)이 절반이 된다", () => {
    const result = scoreJourney(journeyResult(definition.id, { actions: definition.maxActions * 2 }), definition, { timingTrusted: false });
    assert.equal(result.earned, Math.round((definition.weight * (0.7 + 0.2 * 0.5)) * 100) / 100);
  });

  it("시간 지표를 믿을 때만 소요 시간이 점수에 들어간다", () => {
    const slow = journeyResult(definition.id, { actions: definition.maxActions, totalMs: definition.budgetMs * 3 });
    const withTime = scoreJourney(slow, definition, { timingTrusted: true });
    const withoutTime = scoreJourney(slow, definition, { timingTrusted: false });
    assert.equal(withTime.earned, Math.round(definition.weight * 0.9 * 100) / 100);
    assert.equal(withoutTime.earned, withoutTime.available);
  });

  it("전부 만점이면 25점, 건너뛴 여정은 분모에서 빠진다", () => {
    const perfect = RUBRIC.journeys.items.map((entry) => journeyResult(entry.id, { actions: entry.maxActions, totalMs: 1 }));
    assert.equal(scoreJourneys(perfect, { timingTrusted: true }).score, 25);
    const partial = perfect.map((entry, index) => (index === 0 ? { id: entry.id, skipped: true } : entry));
    const result = scoreJourneys(partial, { timingTrusted: true });
    assert.equal(result.score, 25);
    assert.equal(result.items[0].measured, false);
  });

  it("측정한 여정이 하나도 없으면 점수는 null 이다", () => {
    assert.equal(scoreJourneys([], { timingTrusted: false }).score, null);
  });

  it("여정 일부가 실패하면 실패한 가중치만큼 점수가 줄어든다", () => {
    const results = RUBRIC.journeys.items.map((entry, index) => journeyResult(entry.id, { actions: entry.maxActions, success: index !== 1 }));
    const score = scoreJourneys(results, { timingTrusted: false }).score;
    const failedWeight = RUBRIC.journeys.items[1].weight;
    assert.equal(score, Math.round((25 - failedWeight) * 100) / 100);
  });
});
