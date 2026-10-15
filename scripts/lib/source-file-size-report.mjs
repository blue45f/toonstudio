/**
 * 소스 파일 크기 래칫 — 사람이 읽는 보고서.
 *
 * 위반 파일·줄 수·기준선·고치는 방법(분할 가이드 링크)을 한 화면에 보여 주고, 통과해도 요약에
 * 상위 초과 파일 10개와 총 초과 줄 수를 항상 포함한다.
 */
export const GUIDE_PATH = "docs/engineering/code-structure-and-bundle-patterns.md";
const MAX_SHOWN_VIOLATIONS = 20;

const count = (value) => value.toLocaleString("en-US");

function describeViolation(violation, index) {
  const label = `${String(index + 1).padStart(2)}. ${violation.file}`;
  switch (violation.kind) {
    case "new-over-limit":
      return `${label}\n      새 파일/기준선 밖 파일이 ${count(violation.lines)}줄입니다 (상한 ${violation.limit}줄, 초과 +${count(violation.lines - violation.limit)}).`;
    case "grew":
      return `${label}\n      ${count(violation.lines)}줄 > 기준선 ${count(violation.recorded)}줄 (+${count(violation.lines - violation.recorded)}줄). 기록된 초과 파일은 늘 수 없습니다.`;
    case "new-ts-nocheck":
      return `${label}\n      새 // @ts-nocheck 입니다. 기준선 목록 밖의 파일에는 둘 수 없습니다.`;
    default:
      return `${label}\n      알 수 없는 위반 ${JSON.stringify(violation)}`;
  }
}

/** 위반 목록(최대 20건 표시). */
export function formatViolations(violations) {
  const shown = violations.slice(0, MAX_SHOWN_VIOLATIONS).map(describeViolation);
  if (violations.length > shown.length) shown.push(`    … 외 ${violations.length - shown.length}건 (전체는 --json)`);
  return shown;
}

export function fixGuideLines(limit) {
  return [
    "고치는 방법",
    `  1) 새 코드는 책임 하나씩 ${limit}줄 이하 파일로 나눈다: 순수 로직(.ts) / 상태 훅 / 표시 컴포넌트 / 타입·상수 / 지연 경계 파일.`,
    "  2) 기록된 초과 파일에는 새 로직을 더하지 말고 새 파일로 추출한 뒤 호출만 남긴다. 줄었다면 `--tighten` 으로 기준선을 낮춘다.",
    "  3) 새 // @ts-nocheck 는 쓰지 않는다. 호스트 백(h) 대신 타입이 있는 인자 객체·훅 반환 타입으로 바꾼다.",
    "  4) 정말 나눌 수 없는 신규 파일(예: 대용량 데이터 표)만 `--update-baseline --reason \"<사유>\"` 로 등록하고 PR 에서 승인받는다.",
    `  분할 가이드: ${GUIDE_PATH} (거대 파일 분해 절차)`,
  ];
}

/** 통과·실패와 무관하게 항상 출력하는 요약. */
export function formatSummary({ summary, improvements, stale, staleTsNoCheck }) {
  const lines = [
    "요약",
    `  대상 소스 ${count(summary.scanned)}개 · 상한 ${summary.limit}줄 초과 파일 ${count(summary.overLimitFiles)}개`
    + ` · 총 초과 줄 수 ${count(summary.totalExcessLines)} (기준선 ${count(summary.recordedExcessLines)})`,
    `  // @ts-nocheck 파일 ${summary.tsNoCheckFiles}개 (기준선 ${summary.recordedTsNoCheckFiles}개, 늘릴 수 없음)`,
    `  상위 초과 파일 ${summary.topExcess.length}개 (줄 수, 상한 대비 초과분):`,
  ];
  for (const item of summary.topExcess) {
    lines.push(`    ${count(item.lines).padStart(7)}줄 (+${count(item.excess)})  ${item.file}`);
  }
  if (improvements.length > 0) {
    const shrunk = improvements.reduce((sum, item) => sum + (item.from - item.to), 0);
    lines.push(
      "",
      `개선됨: ${improvements.length}개 파일이 기준선보다 줄었습니다 (−${count(shrunk)}줄). 잠그려면: node scripts/check-source-file-size.mjs --tighten`,
    );
  }
  const staleCount = stale.length + staleTsNoCheck.length;
  if (staleCount > 0) {
    lines.push(`정리 가능: 더 이상 없는 기준선 항목 ${staleCount}개 (--tighten 으로 정리)`);
  }
  return lines;
}
