/**
 * 측정 칸 점수를 화면별·전체 점수와 순위로 모으는 순수 함수. 입력이 같으면 출력이 같다(정렬 기준에 항상 id 를 넣는다).
 *
 * 구조: 칸(라우트×뷰포트) 점수 → 화면(라우트) 점수 = 뷰포트 평균 → 전체 화면 평균(라우트 동일 가중) + 여정 점수 = 합계.
 */
import { RUBRIC, SCREEN_MAX, scoreCell, scoreJourneys } from "./rubric.mjs";

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const mean = (values) => (values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length);
const byText = (left, right) => left.localeCompare(right, "en");

/** 칸마다 scoreCell 을 계산해 붙인다. */
export function scoreCells(cells, { timingTrusted }) {
  return cells.map((cell) => ({ ...cell, score: scoreCell(cell, { timingTrusted }) }));
}

/**
 * 화면(라우트)별 점수: 뷰포트 평균. 측정 실패(0점 처리)한 칸도 평균에 들어간다.
 * @param {ReadonlyArray<ReturnType<typeof scoreCells>[number]>} scoredCells
 * @param {ReadonlyArray<{ id: string, label: string, auth: string, group: string, path: string }>} routes 선언 순서
 */
export function scoreRoutes(scoredCells, routes) {
  const result = [];
  for (const route of routes) {
    const cells = scoredCells.filter((cell) => cell.routeId === route.id);
    if (cells.length === 0) continue;
    const totals = cells.map((cell) => cell.score.total).filter((value) => value !== null);
    const sections = {};
    for (const id of ["accessibility", "responsive", "visual", "performance", "copy"]) {
      const values = cells.map((cell) => cell.score.sections[id]?.score).filter((value) => value !== null && value !== undefined);
      sections[id] = values.length ? round2(mean(values)) : null;
    }
    const viewports = Object.fromEntries(
      cells.map((cell) => [cell.viewportId, { total: cell.score.total, failed: cell.score.failed }]).sort((left, right) => byText(left[0], right[0])),
    );
    result.push({
      routeId: route.id,
      label: route.label,
      path: route.path,
      auth: route.auth,
      group: route.group,
      total: totals.length ? round2(mean(totals)) : null,
      worstViewport: totals.length ? round2(Math.min(...totals)) : null,
      sections,
      viewports,
      failedCells: cells.filter((cell) => cell.score.failed).length,
    });
  }
  return result;
}

/** 점수가 낮은 순 N개(동점이면 id 순). 점수가 없는(null) 화면은 제외한다. */
export function lowestRoutes(routeScores, limit = 5) {
  return routeScores
    .filter((entry) => entry.total !== null)
    .sort((left, right) => left.total - right.total || byText(left.routeId, right.routeId))
    .slice(0, limit);
}

/** 점수가 낮은 칸(라우트×뷰포트) N개. */
export function lowestCells(scoredCells, limit = 5) {
  return scoredCells
    .filter((cell) => cell.score.total !== null)
    .map((cell) => ({ key: cell.key, routeId: cell.routeId, viewportId: cell.viewportId, total: cell.score.total }))
    .sort((left, right) => left.total - right.total || byText(left.key, right.key))
    .slice(0, limit);
}

/**
 * 위반 유형 순위: 잃은 점수 합이 큰 순(동점이면 영향받은 칸 수, 유형 이름).
 * 대표 화면은 그 유형으로 가장 많이 잃은 칸(동점이면 칸 키 순)이다.
 */
export function rankViolations(scoredCells, { limit = 10 } = {}) {
  const groups = new Map();
  for (const cell of scoredCells) {
    for (const violation of cell.score.violations) {
      if (violation.lost <= 0) continue;
      let group = groups.get(violation.type);
      if (!group) {
        group = {
          type: violation.type,
          category: violation.category,
          label: violation.label,
          impact: violation.impact ?? null,
          cells: 0,
          routes: new Set(),
          instances: 0,
          lost: 0,
          representative: null,
        };
        groups.set(violation.type, group);
      }
      group.cells += 1;
      group.routes.add(cell.routeId);
      group.instances += violation.count;
      group.lost += violation.lost;
      const better = !group.representative
        || violation.lost > group.representative.lost
        || (violation.lost === group.representative.lost && byText(cell.key, group.representative.key) < 0);
      if (better) group.representative = { key: cell.key, routeId: cell.routeId, viewportId: cell.viewportId, count: violation.count, lost: violation.lost };
    }
  }
  return [...groups.values()]
    .map((group) => ({ ...group, routes: group.routes.size, lost: round2(group.lost) }))
    .sort((left, right) => right.lost - left.lost || right.cells - left.cells || byText(left.type, right.type))
    .slice(0, limit);
}

/** 영역(접근성 등)별 화면 평균. */
export function categoryAverages(routeScores) {
  const result = {};
  for (const id of ["accessibility", "responsive", "visual", "performance", "copy"]) {
    const values = routeScores.map((entry) => entry.sections[id]).filter((value) => value !== null);
    result[id] = { label: RUBRIC.categories[id].label, max: RUBRIC.categories[id].max, score: values.length ? round2(mean(values)) : null };
  }
  return result;
}

/** 뷰포트별 평균 점수(75점 만점). */
export function viewportAverages(scoredCells, viewports) {
  return Object.fromEntries(viewports.map((viewport) => {
    const totals = scoredCells.filter((cell) => cell.viewportId === viewport.id && cell.score.total !== null).map((cell) => cell.score.total);
    return [viewport.id, totals.length ? round2(mean(totals)) : null];
  }));
}

/**
 * 전체 요약. 화면 평균(75점 만점)과 여정 점수(25점 만점)를 더한다.
 * 여정을 하나도 못 쟀으면 합계는 화면 평균을 100점으로 환산한 값(normalized100)으로만 말하고 measuredMax 에 그 사실을 남긴다.
 */
export function summarize({ scoredCells, routes, viewports, journeyResults, timingTrusted }) {
  const routeScores = scoreRoutes(scoredCells, routes);
  const routeTotals = routeScores.map((entry) => entry.total).filter((value) => value !== null);
  const screenAverage75 = routeTotals.length ? round2(mean(routeTotals)) : null;
  const journeys = scoreJourneys(journeyResults, { timingTrusted });
  const journeyScore = journeys.score;
  const measuredMax = (screenAverage75 === null ? 0 : SCREEN_MAX) + (journeyScore === null ? 0 : journeys.max);
  const total = round2((screenAverage75 ?? 0) + (journeyScore ?? 0));
  return {
    screenAverage75,
    screenAverage100: screenAverage75 === null ? null : round2((screenAverage75 / SCREEN_MAX) * 100),
    journeyScore25: journeyScore,
    total: measuredMax > 0 ? total : null,
    measuredMax,
    normalized100: measuredMax > 0 ? round2((total / measuredMax) * 100) : null,
    categories: { ...categoryAverages(routeScores), usability: { label: RUBRIC.categories.usability.label, max: journeys.max, score: journeyScore } },
    viewportAverages: viewportAverages(scoredCells, viewports),
    routeScores,
    lowestRoutes: lowestRoutes(routeScores, 5),
    lowestCells: lowestCells(scoredCells, 5),
    topViolations: rankViolations(scoredCells, { limit: 10 }),
    journeys,
    failedCells: scoredCells.filter((cell) => cell.score.failed).map((cell) => cell.key),
  };
}

/**
 * 같은 명령을 두 번 돌린 보고서 비교. 점수 차이와, 차이가 난 칸·항목을 돌려준다.
 * 시간이 들어가는 항목(timing)은 점수가 같아도 값이 다를 수 있으므로 점수 항목 기준으로만 비교한다.
 */
export function compareReports(first, second) {
  const index = (report) => new Map(report.cells.map((cell) => [cell.key, cell]));
  const left = index(first);
  const right = index(second);
  const keys = [...new Set([...left.keys(), ...right.keys()])].sort(byText);
  const changedCells = [];
  const onlyInFirst = [];
  const onlyInSecond = [];
  for (const key of keys) {
    const a = left.get(key);
    const b = right.get(key);
    if (!a) { onlyInSecond.push(key); continue; }
    if (!b) { onlyInFirst.push(key); continue; }
    const itemDiffs = [];
    for (const sectionId of Object.keys({ ...a.score.sections, ...b.score.sections }).sort(byText)) {
      const itemsA = new Map((a.score.sections[sectionId]?.items ?? []).map((entry) => [entry.id, entry]));
      const itemsB = new Map((b.score.sections[sectionId]?.items ?? []).map((entry) => [entry.id, entry]));
      for (const id of [...new Set([...itemsA.keys(), ...itemsB.keys()])].sort(byText)) {
        const lostA = itemsA.get(id)?.lost ?? null;
        const lostB = itemsB.get(id)?.lost ?? null;
        const countA = itemsA.get(id)?.count ?? null;
        const countB = itemsB.get(id)?.count ?? null;
        if (lostA !== lostB || countA !== countB) itemDiffs.push({ item: id, lostFirst: lostA, lostSecond: lostB, countFirst: countA, countSecond: countB });
      }
    }
    if (a.score.total !== b.score.total || itemDiffs.length > 0) {
      changedCells.push({ key, totalFirst: a.score.total, totalSecond: b.score.total, delta: round2((b.score.total ?? 0) - (a.score.total ?? 0)), items: itemDiffs });
    }
  }
  return {
    identical: changedCells.length === 0 && onlyInFirst.length === 0 && onlyInSecond.length === 0
      && first.summary.total === second.summary.total,
    totalFirst: first.summary.total,
    totalSecond: second.summary.total,
    totalDelta: round2((second.summary.total ?? 0) - (first.summary.total ?? 0)),
    screenAverageDelta: round2((second.summary.screenAverage75 ?? 0) - (first.summary.screenAverage75 ?? 0)),
    journeyDelta: round2((second.summary.journeyScore25 ?? 0) - (first.summary.journeyScore25 ?? 0)),
    changedCells,
    onlyInFirst,
    onlyInSecond,
  };
}
