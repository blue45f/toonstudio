/**
 * UI/UX 자동 측정 점수 규칙(100점). 이 파일의 계산 결과가 곧 점수이며, 보고서·문서의 표는 이 상수에서 만든다.
 *
 * 배점: 접근성 25 · 반응형·레이아웃 20 · 사용성(여정) 25 · 시각 일관성 15 · 성능 체감 10 · 카피 5.
 * 화면(라우트×뷰포트)마다 접근성·반응형·시각·성능·카피 75점을 매기고, 사용성 25점은 핵심 여정에서 한 번 매긴다.
 *
 * 원칙
 * - 같은 입력이면 같은 점수(순수 함수, 난수·시계·네트워크 없음). 소수점은 2자리로 반올림한다.
 * - 항목마다 감점 단가와 상한(= 항목 배점)을 둔다. 상한이 있으므로 한 항목이 다른 항목 점수를 깎지 못한다.
 * - 측정하지 못한 항목(measured=false)은 감점하지 않고 분모에서 뺀 뒤 구역 배점으로 환산한다. 임의로 만점을 주지 않는다.
 * - 개발 서버에서 잰 시간 지표(CLS·LCP·첫 상호작용 시간)는 운영 성능을 대표하지 않으므로
 *   timingTrusted=false 이면 점수에서 빼고(분모 제외) 보고서에는 값을 그대로 싣는다.
 * - 사람의 판단이 필요한 항목(시각 위계의 미적 완성도, 정보 구조의 직관성, 카피의 설득력)은 점수에 넣지 않는다(UNMEASURED_HUMAN_ITEMS).
 */

export const RUBRIC_VERSION = "1.0.0";

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const sum = (values) => values.reduce((total, value) => total + value, 0);
const clampLost = (max, lost) => Math.min(max, Math.max(0, lost));

/** 점수 규칙 상수. 바꾸면 RUBRIC_VERSION 을 올리고 보고서의 기준선을 다시 잰다. */
export const RUBRIC = Object.freeze({
  categories: Object.freeze({
    accessibility: Object.freeze({ label: "접근성", max: 25 }),
    responsive: Object.freeze({ label: "반응형·레이아웃", max: 20 }),
    usability: Object.freeze({ label: "사용성(여정)", max: 25 }),
    visual: Object.freeze({ label: "시각 일관성", max: 15 }),
    performance: Object.freeze({ label: "성능 체감", max: 10 }),
    copy: Object.freeze({ label: "카피", max: 5 }),
  }),
  accessibility: Object.freeze({
    axe: Object.freeze({ max: 10, critical: 3, serious: 1, moderate: 0.5, minor: 0.25 }),
    unnamed: Object.freeze({ max: 4, perControl: 0.5 }),
    headings: Object.freeze({ max: 3, noH1: 1.5, multipleH1: 1, perSkippedLevel: 0.5, perEmptyHeading: 0.5 }),
    landmarks: Object.freeze({ max: 3, noMain: 1.5, multipleMain: 1, perDuplicateGroup: 0.5 }),
    focus: Object.freeze({ max: 3, perMissingIndicator: 1, noTabStops: 3 }),
    keyboardTrap: Object.freeze({ max: 2, trap: 2 }),
  }),
  responsive: Object.freeze({
    horizontalScroll: Object.freeze({ max: 6, any: 4, wide: 2, wideThresholdPx: 40 }),
    clipped: Object.freeze({ max: 4, perElement: 0.5 }),
    obscured: Object.freeze({ max: 4, perControl: 1 }),
    tapTargets: Object.freeze({ max: 6, perGroup: 1, groupSize: 5, minimumPx: 44 }),
  }),
  visual: Object.freeze({
    rawColors: Object.freeze({ max: 6, perClass: 0.5 }),
    undeclaredTokens: Object.freeze({ max: 5, perClass: 1 }),
    inlineColors: Object.freeze({ max: 4, perGroup: 1, groupSize: 5 }),
  }),
  performance: Object.freeze({
    consoleErrors: Object.freeze({ max: 3, perError: 1 }),
    consoleWarnings: Object.freeze({ max: 1, perWarning: 0.5 }),
    failedRequests: Object.freeze({ max: 2, perRequest: 1 }),
    readiness: Object.freeze({ max: 1, degraded: 0.5 }),
    cls: Object.freeze({ max: 1, good: 0.1, poor: 0.25 }),
    lcp: Object.freeze({ max: 1, goodMs: 2500, poorMs: 4000 }),
    interactive: Object.freeze({ max: 1, goodMs: 3000, poorMs: 5000 }),
  }),
  copy: Object.freeze({
    rawKeys: Object.freeze({ max: 3, perKey: 1.5 }),
    emptyButtons: Object.freeze({ max: 1, perButton: 0.5 }),
    englishSentences: Object.freeze({ max: 1, perSentence: 0.25 }),
  }),
  journeys: Object.freeze({
    max: 25,
    successShare: 0.7,
    efficiencyShare: 0.2,
    timeShare: 0.1,
    items: Object.freeze([
      Object.freeze({ id: "new-work-to-editor", label: "새 작품 만들기 → 에디터 진입", weight: 5, maxActions: 4, budgetMs: 60_000 }),
      Object.freeze({ id: "open-example-project", label: "예제 프로젝트 열기", weight: 4, maxActions: 2, budgetMs: 45_000 }),
      Object.freeze({ id: "template-to-work", label: "템플릿 고르기 → 작품 생성", weight: 4, maxActions: 3, budgetMs: 60_000 }),
      Object.freeze({ id: "login-logout", label: "로그인 → 로그아웃", weight: 4, maxActions: 7, budgetMs: 30_000 }),
      Object.freeze({ id: "settings-roundtrip", label: "설정 변경 후 복귀", weight: 4, maxActions: 4, budgetMs: 30_000 }),
      Object.freeze({ id: "error-recovery", label: "오류 복구(네트워크 차단 후 재시도 안내)", weight: 4, maxActions: 2, budgetMs: 45_000 }),
    ]),
  }),
});

/** 화면 한 장(라우트×뷰포트)에 매기는 최대 점수 = 접근성+반응형+시각+성능+카피. */
export const SCREEN_MAX = RUBRIC.categories.accessibility.max
  + RUBRIC.categories.responsive.max
  + RUBRIC.categories.visual.max
  + RUBRIC.categories.performance.max
  + RUBRIC.categories.copy.max;

/**
 * 자동 측정으로 점수화하지 않는 항목. 보고서에 "미측정" 표로 따로 싣는다.
 * 사람의 판단이 필요하거나(미적·직관·설득), 이 도구가 재지 않는 환경(실기기·보조기기·실사용자)이다.
 */
export const UNMEASURED_HUMAN_ITEMS = Object.freeze([
  Object.freeze({ id: "visual-hierarchy", label: "시각 위계의 미적 완성도", why: "대비·크기 같은 수치는 재지만 '보기 좋은가'는 사람이 판단한다" }),
  Object.freeze({ id: "information-architecture", label: "정보 구조의 직관성", why: "메뉴 이름·그룹이 처음 쓰는 사람에게 자연스러운지는 사용자 관찰이 필요하다" }),
  Object.freeze({ id: "copy-persuasion", label: "카피의 설득력·어조", why: "문구가 있는지·깨졌는지만 보며 설득력과 톤은 읽는 사람이 판단한다" }),
  Object.freeze({ id: "assistive-technology", label: "실제 스크린 리더·음성 제어 사용성", why: "axe 와 키보드 순회는 보조기기 사용 경험을 대신하지 못한다" }),
  Object.freeze({ id: "real-device", label: "실기기(iOS Safari·Android Chrome) 동작", why: "Chromium 에뮬레이션만 사용했다" }),
  Object.freeze({ id: "production-performance", label: "운영 빌드의 성능 체감", why: "개발 서버에서 잰 시간 지표는 점수에서 제외했다" }),
]);

/** axe 규칙 중 "이름 없는 컨트롤" 항목으로 따로 세는 규칙(이중 감점을 막으려고 일반 axe 항목에서는 뺀다). */
export const NAME_RULE_FAMILIES = Object.freeze({
  buttons: Object.freeze(["button-name", "input-button-name", "aria-command-name"]),
  links: Object.freeze(["link-name"]),
  inputs: Object.freeze(["label", "select-name", "aria-input-field-name", "aria-toggle-field-name", "input-image-alt"]),
});

const NAME_RULE_IDS = new Set(Object.values(NAME_RULE_FAMILIES).flat());
export const isNameRule = (ruleId) => NAME_RULE_IDS.has(ruleId);

function makeItem(id, label, max, rule, { measured = true, count = 0, lost = 0, detail = "" } = {}) {
  return {
    id,
    label,
    max,
    rule,
    measured,
    count,
    available: measured ? max : 0,
    lost: measured ? round2(clampLost(max, lost)) : 0,
    detail,
  };
}

function makeSection(id, items) {
  const { label, max } = RUBRIC.categories[id];
  const available = sum(items.map((entry) => entry.available));
  const lost = sum(items.map((entry) => entry.lost));
  return {
    id,
    label,
    max,
    available,
    lost: round2(lost),
    score: available > 0 ? round2((max * (available - lost)) / available) : null,
    items,
  };
}

const IMPACT_WEIGHT = (impact) => RUBRIC.accessibility.axe[impact] ?? 0;

function scoreAccessibility(a11y) {
  const rule = RUBRIC.accessibility;
  const items = [];

  const axe = a11y?.axe;
  const axeMeasured = Boolean(axe?.measured);
  const violations = axeMeasured ? axe.violations ?? [] : [];
  const general = violations.filter((violation) => !isNameRule(violation.id));
  const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const violation of general) {
    if (violation.impact in byImpact) byImpact[violation.impact] += 1;
  }
  const axeLostRaw = sum(Object.entries(byImpact).map(([impact, count]) => IMPACT_WEIGHT(impact) * count));
  items.push(makeItem(
    "axe",
    "axe 규칙 위반(이름 계열 제외)",
    rule.axe.max,
    `critical 1건당 -${rule.axe.critical}, serious -${rule.axe.serious}, moderate -${rule.axe.moderate}, minor -${rule.axe.minor}(위반 규칙 단위, 노드 수와 무관)`,
    {
      measured: axeMeasured,
      count: general.length,
      lost: axeLostRaw,
      detail: `critical ${byImpact.critical} · serious ${byImpact.serious} · moderate ${byImpact.moderate} · minor ${byImpact.minor}`,
    },
  ));

  const unnamedNodes = violations.filter((violation) => isNameRule(violation.id))
    .reduce((total, violation) => total + (violation.nodes ?? 0), 0);
  items.push(makeItem(
    "unnamed-controls",
    "이름 없는 버튼·링크·입력",
    rule.unnamed.max,
    `접근 가능한 이름이 없는 컨트롤 1개당 -${rule.unnamed.perControl}(axe 이름 계열 규칙의 노드 수)`,
    { measured: axeMeasured, count: unnamedNodes, lost: unnamedNodes * rule.unnamed.perControl },
  ));

  const headings = a11y?.headings;
  const h1Count = headings?.h1Count ?? 0;
  const headingsLost = (h1Count === 0 ? rule.headings.noH1 : 0)
    + (h1Count > 1 ? rule.headings.multipleH1 : 0)
    + (headings?.skippedLevels ?? 0) * rule.headings.perSkippedLevel
    + (headings?.emptyHeadings ?? 0) * rule.headings.perEmptyHeading;
  items.push(makeItem(
    "heading-hierarchy",
    "제목 계층",
    rule.headings.max,
    `h1 없음 -${rule.headings.noH1}, h1 2개 이상 -${rule.headings.multipleH1}, 단계 건너뜀 1건당 -${rule.headings.perSkippedLevel}, 빈 제목 1건당 -${rule.headings.perEmptyHeading}`,
    {
      measured: Boolean(headings?.measured),
      count: (headings?.skippedLevels ?? 0) + (headings?.emptyHeadings ?? 0) + (h1Count === 1 ? 0 : 1),
      lost: headingsLost,
      detail: `h1 ${h1Count} · 건너뜀 ${headings?.skippedLevels ?? 0} · 빈 제목 ${headings?.emptyHeadings ?? 0}`,
    },
  ));

  const landmarks = a11y?.landmarks;
  const mainCount = landmarks?.mainCount ?? 0;
  const landmarksLost = (mainCount === 0 ? rule.landmarks.noMain : 0)
    + (mainCount > 1 ? rule.landmarks.multipleMain : 0)
    + (landmarks?.duplicateGroups ?? 0) * rule.landmarks.perDuplicateGroup;
  items.push(makeItem(
    "landmarks",
    "랜드마크",
    rule.landmarks.max,
    `main 없음 -${rule.landmarks.noMain}, main 2개 이상 -${rule.landmarks.multipleMain}, 같은 역할·같은 이름이 겹친 랜드마크 그룹 1건당 -${rule.landmarks.perDuplicateGroup}`,
    {
      measured: Boolean(landmarks?.measured),
      count: (mainCount === 1 ? 0 : 1) + (landmarks?.duplicateGroups ?? 0),
      lost: landmarksLost,
      detail: `main ${mainCount} · 중복 그룹 ${landmarks?.duplicateGroups ?? 0}`,
    },
  ));

  const focus = a11y?.focus;
  const tabStops = focus?.tabStops ?? 0;
  const focusLost = tabStops === 0 ? rule.focus.noTabStops : (focus?.noIndicator ?? 0) * rule.focus.perMissingIndicator;
  items.push(makeItem(
    "focus-visibility",
    "포커스 가시성(Tab 20회)",
    rule.focus.max,
    `Tab 20회 순회 중 포커스 표시가 보이지 않는 정류장 1곳당 -${rule.focus.perMissingIndicator}, 포커스할 수 있는 요소가 없으면 -${rule.focus.noTabStops}`,
    {
      measured: Boolean(focus?.measured),
      count: tabStops === 0 ? 1 : focus?.noIndicator ?? 0,
      lost: focusLost,
      detail: `정류장 ${tabStops} · 표시 없음 ${focus?.noIndicator ?? 0}`,
    },
  ));

  const trap = a11y?.trap;
  items.push(makeItem(
    "keyboard-trap",
    "키보드 함정",
    rule.keyboardTrap.max,
    `Tab 을 4번 연속 눌러도 같은 요소에서 벗어나지 못하거나, 모달이 없는데 정류장 3곳 이하를 맴돌면 -${rule.keyboardTrap.trap}`,
    {
      measured: Boolean(trap?.measured),
      count: trap?.suspected ? 1 : 0,
      lost: trap?.suspected ? rule.keyboardTrap.trap : 0,
      detail: trap?.reason ?? "",
    },
  ));

  const violationsOut = [];
  const weightSum = axeLostRaw || 1;
  const axeItem = items[0];
  for (const violation of general) {
    violationsOut.push({
      type: `axe:${violation.id}`,
      category: "accessibility",
      label: violation.help ?? violation.id,
      count: violation.nodes ?? 1,
      lost: round2((IMPACT_WEIGHT(violation.impact) / weightSum) * axeItem.lost),
      impact: violation.impact,
    });
  }
  return { section: makeSection("accessibility", items), violations: violationsOut };
}

function scoreResponsive(responsive) {
  const rule = RUBRIC.responsive;
  const scroll = responsive?.scroll;
  const overflowPx = scroll?.overflowPx ?? 0;
  const scrollLost = overflowPx > 1 ? rule.horizontalScroll.any + (overflowPx >= rule.horizontalScroll.wideThresholdPx ? rule.horizontalScroll.wide : 0) : 0;
  const clipped = responsive?.clipped;
  const obscured = responsive?.obscured;
  const tap = responsive?.tapTargets;
  const tapCount = tap?.small44 ?? 0;
  const items = [
    makeItem(
      "horizontal-scroll",
      "가로 스크롤 발생",
      rule.horizontalScroll.max,
      `문서 폭이 뷰포트를 1px 넘으면 -${rule.horizontalScroll.any}, ${rule.horizontalScroll.wideThresholdPx}px 이상 넘으면 -${rule.horizontalScroll.any + rule.horizontalScroll.wide}`,
      { measured: Boolean(scroll?.measured), count: overflowPx > 1 ? 1 : 0, lost: scrollLost, detail: `넘친 폭 ${overflowPx}px` },
    ),
    makeItem(
      "clipped-elements",
      "뷰포트 밖으로 잘린 요소",
      rule.clipped.max,
      `가로로 뷰포트 밖으로 걸쳐 잘리는 최상위 요소(내부 스크롤 영역 제외) 1개당 -${rule.clipped.perElement}`,
      { measured: Boolean(clipped?.measured), count: clipped?.count ?? 0, lost: (clipped?.count ?? 0) * rule.clipped.perElement },
    ),
    makeItem(
      "obscured-controls",
      "겹침(다른 요소에 가려진 컨트롤)",
      rule.obscured.max,
      `첫 화면에서 컨트롤 안쪽 5개 점 중 3개 이상이 무관한 요소에 덮이면 1개당 -${rule.obscured.perControl}(고정 바·플레이어가 스크롤하는 본문을 일시적으로 덮는 경우는 제외)`,
      { measured: Boolean(obscured?.measured), count: obscured?.count ?? 0, lost: (obscured?.count ?? 0) * rule.obscured.perControl },
    ),
    makeItem(
      "tap-targets",
      `탭 대상 ${rule.tapTargets.minimumPx}×${rule.tapTargets.minimumPx}px 미만`,
      rule.tapTargets.max,
      `보이는 컨트롤(문장 속 인라인 링크 제외)이 ${rule.tapTargets.minimumPx}px 미만인 개수 ${rule.tapTargets.groupSize}개마다 -${rule.tapTargets.perGroup}`,
      {
        measured: Boolean(tap?.measured),
        count: tapCount,
        lost: Math.ceil(tapCount / rule.tapTargets.groupSize) * rule.tapTargets.perGroup,
        detail: `전체 ${tap?.total ?? 0}개 중 44px 미만 ${tapCount}개(40px 미만 ${tap?.small40 ?? 0}개 · 24px 미만 ${tap?.small24 ?? 0}개)`,
      },
    ),
  ];
  return { section: makeSection("responsive", items), violations: [] };
}

function scoreVisual(visual) {
  const rule = RUBRIC.visual;
  const raw = visual?.rawColorClasses;
  const undeclared = visual?.undeclaredTokens;
  const inline = visual?.inlineColors;
  const inlineCount = inline?.elements ?? 0;
  const items = [
    makeItem(
      "raw-color-classes",
      "원시 팔레트·흑백·색 리터럴 클래스",
      rule.rawColors.max,
      `bg-red-500 · bg-white · bg-[#fff] 같은 클래스 종류(중복 제거) 1개당 -${rule.rawColors.perClass}(OKLCH 리터럴은 DESIGN.md 허용 표기라 참고 값으로만 기록)`,
      { measured: Boolean(raw?.measured), count: raw?.distinct ?? 0, lost: (raw?.distinct ?? 0) * rule.rawColors.perClass },
    ),
    makeItem(
      "undeclared-tokens",
      "미선언 테마 색 토큰",
      rule.undeclaredTokens.max,
      `@theme 에 없어 CSS 가 생성되지 않는 색 클래스 종류(예: bg-accent-hover) 1개당 -${rule.undeclaredTokens.perClass}`,
      { measured: Boolean(undeclared?.measured), count: undeclared?.distinct ?? 0, lost: (undeclared?.distinct ?? 0) * rule.undeclaredTokens.perClass },
    ),
    makeItem(
      "inline-colors",
      "인라인 색상 사용",
      rule.inlineColors.max,
      `style 속성·SVG 색 속성에 hex·rgb·hsl·이름 색 리터럴을 쓴 요소(var()·OKLCH 제외, 인라인 SVG 그림은 svg 하나를 1건) ${rule.inlineColors.groupSize}개마다 -${rule.inlineColors.perGroup}`,
      {
        measured: Boolean(inline?.measured),
        count: inlineCount,
        lost: Math.ceil(inlineCount / rule.inlineColors.groupSize) * rule.inlineColors.perGroup,
      },
    ),
  ];
  return { section: makeSection("visual", items), violations: [] };
}

function timingLoss(value, good, poor, max) {
  if (value === null || value === undefined || Number.isNaN(value)) return 0;
  if (value <= good) return 0;
  return value <= poor ? max / 2 : max;
}

function scorePerformance(performance, { timingTrusted }) {
  const rule = RUBRIC.performance;
  const measured = Boolean(performance?.measured);
  const timingMeasured = measured && timingTrusted;
  const readiness = performance?.routeState ?? "pending";
  const readinessLost = readiness === "ready" ? 0 : readiness === "degraded" ? rule.readiness.degraded : rule.readiness.max;
  const items = [
    makeItem(
      "console-errors",
      "콘솔 오류",
      rule.consoleErrors.max,
      `console.error·미처리 예외 1건당 -${rule.consoleErrors.perError}(네트워크 실패는 '요청 실패'에서 센다)`,
      { measured, count: performance?.consoleErrors ?? 0, lost: (performance?.consoleErrors ?? 0) * rule.consoleErrors.perError },
    ),
    makeItem(
      "console-warnings",
      "콘솔 경고",
      rule.consoleWarnings.max,
      `console.warn 1건당 -${rule.consoleWarnings.perWarning}`,
      { measured, count: performance?.consoleWarnings ?? 0, lost: (performance?.consoleWarnings ?? 0) * rule.consoleWarnings.perWarning },
    ),
    makeItem(
      "failed-requests",
      "요청 실패",
      rule.failedRequests.max,
      `HTTP 4xx·5xx 응답과 네트워크 실패 1건당 -${rule.failedRequests.perRequest}(취소된 요청·측정 환경 한계는 제외)`,
      { measured, count: performance?.failedRequests ?? 0, lost: (performance?.failedRequests ?? 0) * rule.failedRequests.perRequest },
    ),
    makeItem(
      "route-readiness",
      "화면 준비 상태",
      rule.readiness.max,
      `앱의 route-stage 판정이 ready 가 아니면 감점(degraded -${rule.readiness.degraded}, blocked·error·stalled -${rule.readiness.max})`,
      { measured, count: readiness === "ready" ? 0 : 1, lost: readinessLost, detail: readiness },
    ),
    makeItem(
      "cls",
      "누적 레이아웃 이동(CLS)",
      rule.cls.max,
      `${rule.cls.good} 이하 0, ${rule.cls.poor} 이하 -${rule.cls.max / 2}, 초과 -${rule.cls.max}(개발 서버에서는 점수 제외)`,
      { measured: timingMeasured && performance?.cls != null, count: 0, lost: timingLoss(performance?.cls, rule.cls.good, rule.cls.poor, rule.cls.max), detail: `${performance?.cls ?? "-"}` },
    ),
    makeItem(
      "lcp",
      "LCP 프록시",
      rule.lcp.max,
      `${rule.lcp.goodMs}ms 이하 0, ${rule.lcp.poorMs}ms 이하 -${rule.lcp.max / 2}, 초과 -${rule.lcp.max}(개발 서버에서는 점수 제외)`,
      { measured: timingMeasured && performance?.lcpMs != null, count: 0, lost: timingLoss(performance?.lcpMs, rule.lcp.goodMs, rule.lcp.poorMs, rule.lcp.max), detail: `${performance?.lcpMs ?? "-"}ms` },
    ),
    makeItem(
      "interactive",
      "첫 상호작용 가능 시간",
      rule.interactive.max,
      `이동 시작부터 화면 준비까지 ${rule.interactive.goodMs}ms 이하 0, ${rule.interactive.poorMs}ms 이하 -${rule.interactive.max / 2}, 초과 -${rule.interactive.max}(개발 서버에서는 점수 제외)`,
      {
        measured: timingMeasured && performance?.interactiveMs != null,
        count: 0,
        lost: timingLoss(performance?.interactiveMs, rule.interactive.goodMs, rule.interactive.poorMs, rule.interactive.max),
        detail: `${performance?.interactiveMs ?? "-"}ms`,
      },
    ),
  ];
  return { section: makeSection("performance", items), violations: [] };
}

function scoreCopy(copy) {
  const rule = RUBRIC.copy;
  const measured = Boolean(copy?.measured);
  const keyCount = (copy?.rawKeys ?? 0) + (copy?.placeholderLeaks ?? 0);
  const items = [
    makeItem(
      "raw-keys",
      "번역 키·자리표시자 노출",
      rule.rawKeys.max,
      `route.studioNew·{value0}·undefined 같은 문자열이 그대로 보이면 종류 1개당 -${rule.rawKeys.perKey}`,
      { measured, count: keyCount, lost: keyCount * rule.rawKeys.perKey },
    ),
    makeItem(
      "empty-buttons",
      "빈 문자열 버튼",
      rule.emptyButtons.max,
      `글자·아이콘·이름이 모두 없는 버튼 1개당 -${rule.emptyButtons.perButton}`,
      { measured, count: copy?.emptyButtons ?? 0, lost: (copy?.emptyButtons ?? 0) * rule.emptyButtons.perButton },
    ),
    makeItem(
      "english-sentences",
      "영어/한국어 혼재 의심",
      rule.englishSentences.max,
      `한글 없는 3단어 이상 영어 문장(대문자 라벨·브랜드 문구 제외, 휴리스틱) 종류 1개당 -${rule.englishSentences.perSentence}`,
      { measured, count: copy?.englishSentences ?? 0, lost: (copy?.englishSentences ?? 0) * rule.englishSentences.perSentence },
    ),
  ];
  return { section: makeSection("copy", items), violations: [] };
}

function collectItemViolations(sectionId, section, skipIds = []) {
  return section.items
    .filter((entry) => entry.lost > 0 && !skipIds.includes(entry.id))
    .map((entry) => ({
      type: entry.id,
      category: sectionId,
      label: entry.label,
      count: entry.count,
      lost: entry.lost,
    }));
}

/**
 * 화면 한 장(라우트×뷰포트)의 점수.
 * @param {object} cell 측정 사실(measure.mjs 의 결과 형식)
 * @param {{ timingTrusted?: boolean }} [options]
 */
export function scoreCell(cell, options = {}) {
  const timingTrusted = options.timingTrusted === true;
  if (cell.status === "failed") {
    return {
      total: 0,
      max: SCREEN_MAX,
      failed: true,
      sections: {},
      violations: [{ type: "page-load-failed", category: "performance", label: "화면을 열지 못함", count: 1, lost: SCREEN_MAX }],
    };
  }
  const accessibility = scoreAccessibility(cell.a11y);
  const responsive = scoreResponsive(cell.responsive);
  const visual = scoreVisual(cell.visual);
  const performance = scorePerformance(cell.performance, { timingTrusted });
  const copy = scoreCopy(cell.copy);
  const sections = {
    accessibility: accessibility.section,
    responsive: responsive.section,
    visual: visual.section,
    performance: performance.section,
    copy: copy.section,
  };
  const measuredSections = Object.values(sections).filter((entry) => entry.score !== null);
  const measuredMax = sum(measuredSections.map((entry) => entry.max));
  const earned = sum(measuredSections.map((entry) => entry.score));
  const total = measuredMax > 0 ? round2((earned / measuredMax) * SCREEN_MAX) : null;
  const violations = [
    ...accessibility.violations,
    ...collectItemViolations("accessibility", accessibility.section, ["axe"]),
    ...collectItemViolations("responsive", responsive.section),
    ...collectItemViolations("visual", visual.section),
    ...collectItemViolations("performance", performance.section),
    ...collectItemViolations("copy", copy.section),
  ];
  return { total, max: SCREEN_MAX, failed: false, measuredMax, sections, violations };
}

/**
 * 여정 하나의 점수.
 * @param {{ success: boolean, actions: number, totalMs: number } | null | undefined} result
 * @param {{ weight: number, maxActions: number, budgetMs: number }} definition
 */
export function scoreJourney(result, definition, { timingTrusted = false } = {}) {
  const rule = RUBRIC.journeys;
  const available = definition.weight * (rule.successShare + rule.efficiencyShare + (timingTrusted ? rule.timeShare : 0));
  if (!result || result.skipped) return { measured: false, earned: 0, available: 0, weight: definition.weight };
  const success = result.success ? 1 : 0;
  const efficiency = result.success ? Math.min(1, definition.maxActions / Math.max(1, result.actions)) : 0;
  let time = 0;
  if (result.success) {
    if (result.totalMs <= definition.budgetMs) time = 1;
    else if (result.totalMs <= definition.budgetMs * 2) time = 0.5;
  }
  const earned = definition.weight * (rule.successShare * success + rule.efficiencyShare * efficiency + (timingTrusted ? rule.timeShare * time : 0));
  return { measured: true, earned: round2(earned), available: round2(available), weight: definition.weight, success: Boolean(result.success), efficiency: round2(efficiency), time };
}

/**
 * 여정 전체의 사용성 점수(25점 만점, 측정한 여정만 분모에 넣어 환산).
 * @param {ReadonlyArray<{ id: string, success: boolean, actions: number, totalMs: number, skipped?: boolean }>} results
 */
export function scoreJourneys(results, { timingTrusted = false } = {}) {
  const rule = RUBRIC.journeys;
  const byId = new Map(results.map((entry) => [entry.id, entry]));
  const items = rule.items.map((definition) => ({
    id: definition.id,
    label: definition.label,
    ...scoreJourney(byId.get(definition.id), definition, { timingTrusted }),
  }));
  const earned = sum(items.map((entry) => entry.earned));
  const available = sum(items.map((entry) => entry.available));
  const measuredWeight = sum(items.filter((entry) => entry.measured).map((entry) => entry.weight));
  return {
    max: rule.max,
    score: available > 0 ? round2((rule.max * earned) / available) : null,
    measuredWeight,
    items,
  };
}

/** 문서·보고서용 점수 규칙 표 행. 상수에서 만들기 때문에 코드와 어긋나지 않는다. */
export function describeRubric() {
  const dummy = scoreCell({ status: "ok", a11y: {}, responsive: {}, visual: {}, performance: {}, copy: {} }, { timingTrusted: true });
  const rows = [];
  for (const section of Object.values(dummy.sections)) {
    for (const entry of section.items) {
      rows.push({ category: section.id, categoryLabel: section.label, categoryMax: section.max, id: entry.id, label: entry.label, max: entry.max, rule: entry.rule });
    }
  }
  const journeyRule = RUBRIC.journeys;
  for (const definition of journeyRule.items) {
    rows.push({
      category: "usability",
      categoryLabel: RUBRIC.categories.usability.label,
      categoryMax: RUBRIC.categories.usability.max,
      id: definition.id,
      label: definition.label,
      max: definition.weight,
      rule: `완주 ${journeyRule.successShare * 100}% + 단계 효율 ${journeyRule.efficiencyShare * 100}%(사용자 조작 ${definition.maxActions}회 이내면 만점) + 소요 시간 ${journeyRule.timeShare * 100}%(${definition.budgetMs / 1000}초 이내 만점, 2배 이내 절반, 개발 서버에서는 제외)`,
    });
  }
  return rows;
}
