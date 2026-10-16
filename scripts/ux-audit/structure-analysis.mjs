/**
 * 페이지에서 모은 구조 사실(제목·랜드마크·포커스 순회)을 판정하는 순수 함수.
 * 브라우저 안에서는 사실만 모으고, 어떤 상태가 위반인지의 판정은 여기서 한다(단위 시험 대상).
 */

/**
 * 제목 계층 판정.
 * @param {ReadonlyArray<{ level: number, text: string }>} headings 문서 순서의 제목(보조기기에 노출되는 것만)
 */
export function analyzeHeadings(headings) {
  let skippedLevels = 0;
  let emptyHeadings = 0;
  let h1Count = 0;
  for (let index = 0; index < headings.length; index += 1) {
    const { level, text } = headings[index];
    if (level === 1) h1Count += 1;
    if (text.trim() === "") emptyHeadings += 1;
    if (index > 0 && level - headings[index - 1].level > 1) skippedLevels += 1;
  }
  return {
    measured: true,
    total: headings.length,
    h1Count,
    skippedLevels,
    emptyHeadings,
    levels: headings.slice(0, 60).map((heading) => heading.level),
  };
}

const UNIQUE_REQUIRED_ROLES = new Set(["banner", "contentinfo", "navigation", "complementary", "search", "form", "region"]);

/**
 * 랜드마크 판정. main 은 개수 자체를 따로 감점하므로 중복 그룹에서는 뺀다.
 * @param {ReadonlyArray<{ role: string, label: string }>} landmarks
 */
export function analyzeLandmarks(landmarks) {
  const counts = { main: 0, banner: 0, contentinfo: 0, navigation: 0, complementary: 0, search: 0, form: 0, region: 0 };
  const groups = new Map();
  for (const landmark of landmarks) {
    if (landmark.role in counts) counts[landmark.role] += 1;
    if (!UNIQUE_REQUIRED_ROLES.has(landmark.role)) continue;
    const key = `${landmark.role}\u0000${landmark.label.trim().toLowerCase()}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  const duplicates = [...groups.entries()]
    .filter(([, size]) => size > 1)
    .map(([key, size]) => {
      const [role, label] = key.split("\u0000");
      return { role, label, size };
    })
    .sort((left, right) => left.role.localeCompare(right.role, "en") || left.label.localeCompare(right.label, "ko"));
  return {
    measured: true,
    mainCount: counts.main,
    bannerCount: counts.banner,
    contentinfoCount: counts.contentinfo,
    navigationCount: counts.navigation,
    duplicateGroups: duplicates.length,
    duplicates: duplicates.slice(0, 10),
  };
}

/**
 * Tab 순회 결과로 포커스 정류장 통계를 만든다.
 * @param {ReadonlyArray<{ id: number | null, label: string, hasIndicator: boolean | null, offscreen: boolean }>} stops 눌러서 도착한 순서. id 가 null 이면 body(포커스 없음).
 * @param {number} presses 누른 횟수
 */
export function analyzeFocusStops(stops, presses) {
  const seen = new Map();
  let bodyStops = 0;
  let maxRepeat = 0;
  let repeat = 0;
  let previous;
  for (const stop of stops) {
    if (stop.id === null) {
      bodyStops += 1;
      repeat = 0;
      previous = null;
      continue;
    }
    repeat = stop.id === previous ? repeat + 1 : 1;
    maxRepeat = Math.max(maxRepeat, repeat);
    previous = stop.id;
    if (!seen.has(stop.id)) seen.set(stop.id, stop);
  }
  const distinct = [...seen.values()];
  const missing = distinct.filter((stop) => stop.hasIndicator === false);
  return {
    measured: true,
    presses,
    tabStops: distinct.length,
    noIndicator: missing.length,
    offscreen: distinct.filter((stop) => stop.offscreen).length,
    bodyStops,
    maxRepeat,
    missingSamples: missing.slice(0, 8).map((stop) => stop.label),
  };
}

/**
 * 키보드 함정 판정.
 * - 같은 요소에서 Tab 을 4번 이상 연속으로 눌러도 벗어나지 못하면 함정.
 * - 모달이 열려 있지 않은데 서로 다른 정류장이 3곳 이하이고 페이지에는 포커스 가능한 요소가 8개 이상이면 작은 순환에 갇힌 것.
 * @param {ReturnType<typeof analyzeFocusStops>} stats
 * @param {{ modalOpen: boolean, focusableCount: number }} page
 */
export function analyzeKeyboardTrap(stats, page) {
  if (stats.maxRepeat >= 4) {
    return { measured: true, suspected: true, reason: `같은 요소에서 Tab ${stats.maxRepeat}회 연속 제자리` };
  }
  if (!page.modalOpen && stats.presses >= 10 && stats.tabStops > 0 && stats.tabStops <= 3 && page.focusableCount >= 8) {
    return { measured: true, suspected: true, reason: `정류장 ${stats.tabStops}곳만 순환(포커스 가능 요소 ${page.focusableCount}개)` };
  }
  return { measured: true, suspected: false, reason: "" };
}

/**
 * 이름 없는 컨트롤을 종류(버튼·링크·입력)별 노드 수로 합산한다(보고용).
 * @param {ReadonlyArray<{ id: string, nodes?: number }>} violations axe 위반 목록
 * @param {Record<string, readonly string[]>} families rubric 의 NAME_RULE_FAMILIES
 */
export function summarizeUnnamedControls(violations, families) {
  const result = { buttons: 0, links: 0, inputs: 0, total: 0 };
  for (const violation of violations) {
    for (const [family, ids] of Object.entries(families)) {
      if (ids.includes(violation.id)) {
        result[family] += violation.nodes ?? 0;
        result.total += violation.nodes ?? 0;
      }
    }
  }
  return result;
}
