/**
 * 단위 시험용 합성 입력. 실제 측정값이 아니라 점수 규칙을 확인하려고 코드로 만든 값이다(바이너리·스냅숏 파일 없음).
 */

/** 모든 항목을 측정했고 위반이 하나도 없는 칸. overrides 로 구역별 값을 바꾼다. */
export function perfectCell(overrides = {}) {
  const base = {
    key: "demo@desktop",
    routeId: "demo",
    viewportId: "desktop",
    status: "ok",
    a11y: {
      axe: { measured: true, violations: [] },
      headings: { measured: true, h1Count: 1, skippedLevels: 0, emptyHeadings: 0 },
      landmarks: { measured: true, mainCount: 1, duplicateGroups: 0 },
      focus: { measured: true, tabStops: 20, noIndicator: 0 },
      trap: { measured: true, suspected: false, reason: "" },
    },
    responsive: {
      scroll: { measured: true, overflowPx: 0 },
      clipped: { measured: true, count: 0 },
      obscured: { measured: true, count: 0 },
      tapTargets: { measured: true, total: 30, small44: 0 },
    },
    visual: {
      rawColorClasses: { measured: true, distinct: 0 },
      undeclaredTokens: { measured: true, distinct: 0 },
      inlineColors: { measured: true, elements: 0 },
    },
    performance: {
      measured: true,
      consoleErrors: 0,
      consoleWarnings: 0,
      failedRequests: 0,
      cls: 0.01,
      lcpMs: 1200,
      interactiveMs: 1500,
      routeState: "ready",
    },
    copy: { measured: true, rawKeys: 0, placeholderLeaks: 0, emptyButtons: 0, englishSentences: 0 },
  };
  const merged = { ...base };
  for (const [section, value] of Object.entries(overrides)) {
    merged[section] = typeof value === "object" && value !== null && !Array.isArray(value) && typeof base[section] === "object"
      ? deepMerge(base[section], value)
      : value;
  }
  return merged;
}

function deepMerge(target, patch) {
  const output = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    output[key] = value && typeof value === "object" && !Array.isArray(value) && typeof target[key] === "object" && target[key] !== null
      ? deepMerge(target[key], value)
      : value;
  }
  return output;
}

/** 이름이 정해진 axe 위반 한 건. */
export const axeViolation = (id, impact, nodes = 1) => ({ id, impact, help: id, nodes });

/** 여정 결과 한 건. */
export const journeyResult = (id, overrides = {}) => ({ id, success: true, actions: 1, totalMs: 1000, ...overrides });
