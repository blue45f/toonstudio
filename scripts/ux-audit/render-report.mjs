/**
 * 보고서(report.json)를 Markdown 표로 바꾸는 순수 함수. summary.md 와 docs/reports 문서의 표가 같은 코드에서 나온다.
 */
import { RUBRIC, SCREEN_MAX, UNMEASURED_HUMAN_ITEMS, describeRubric } from "./rubric.mjs";

// Markdown 표 칸 안전화. 역슬래시를 먼저 이스케이프해야 입력의 `\|` 가 칸 경계로 풀리지 않는다.
export const escapeCell = (text) => String(text ?? "").replace(/\\/gu, "\\\\").replace(/\|/gu, "\\|").replace(/\n/gu, " ");
const fmt = (value, digits = 2) => (value === null || value === undefined ? "미측정" : Number(value).toFixed(digits));

function table(header, rows) {
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
  ].join("\n");
}

/** 점수 규칙 표(코드 상수에서 생성). */
export function renderRubricMarkdown() {
  const rows = describeRubric();
  const lines = [];
  lines.push(table(
    ["영역(배점)", "항목", "배점", "감점 규칙"],
    rows.map((row) => [`${row.categoryLabel}(${row.categoryMax})`, row.label, String(row.max), row.rule]),
  ));
  return lines.join("\n");
}

/** 영역별 점수표. */
export function renderCategoryTable(report) {
  const { categories } = report.summary;
  const order = ["accessibility", "responsive", "usability", "visual", "performance", "copy"];
  const rows = order.map((id) => [categories[id].label, String(categories[id].max), fmt(categories[id].score)]);
  rows.push(["합계(측정한 범위)", String(report.summary.measuredMax), fmt(report.summary.total)]);
  return table(["영역", "배점", "점수"], rows);
}

/** 화면(라우트)별 점수표: 뷰포트별 75점 만점 점수와 평균. */
export function renderRouteTable(report) {
  const viewportIds = report.plan.viewports.map((viewport) => viewport.id);
  const rows = report.summary.routeScores.map((entry) => [
    entry.label,
    entry.path,
    entry.auth === "user" ? "로그인" : "공개",
    ...viewportIds.map((id) => (entry.viewports[id] ? fmt(entry.viewports[id].total, 1) : "-")),
    fmt(entry.total, 1),
  ]);
  return table(["화면", "경로", "상태", ...viewportIds, `평균(${SCREEN_MAX}점 만점)`], rows);
}

/** 최저점 화면 5개. */
export function renderLowestTable(report) {
  const rows = report.summary.lowestRoutes.map((entry, index) => {
    const weakest = Object.entries(entry.sections)
      .filter(([, score]) => score !== null)
      .map(([id, score]) => ({ id, ratio: score / RUBRIC.categories[id].max, score }))
      .sort((left, right) => left.ratio - right.ratio || left.id.localeCompare(right.id, "en"))[0];
    return [
      String(index + 1),
      entry.label,
      entry.path,
      fmt(entry.total, 1),
      `${fmt((entry.total / SCREEN_MAX) * 100, 1)}`,
      weakest ? `${RUBRIC.categories[weakest.id].label} ${fmt(weakest.score, 1)}/${RUBRIC.categories[weakest.id].max}` : "-",
    ];
  });
  return table(["순위", "화면", "경로", `점수(${SCREEN_MAX})`, "100점 환산", "가장 약한 영역"], rows);
}

/** 위반 상위 유형. */
export function renderViolationTable(report) {
  const rows = report.summary.topViolations.map((entry, index) => [
    String(index + 1),
    entry.type,
    entry.label,
    String(entry.cells),
    String(entry.routes),
    String(entry.instances),
    fmt(entry.lost),
    entry.representative ? `${entry.representative.key} (${entry.representative.count}건)` : "-",
  ]);
  return table(["순위", "유형", "설명", "영향 칸", "영향 화면", "건수 합", "잃은 점수 합", "대표 화면"], rows);
}

/** 여정 결과표. */
export function renderJourneyTable(report) {
  const rows = report.journeys.map((journey) => {
    if (journey.skipped) return [journey.label, "건너뜀", "-", "-", journey.skipReason, "-"];
    return [
      journey.label,
      journey.success ? "성공" : "실패",
      String(journey.actions),
      `${(journey.totalMs / 1000).toFixed(1)}초`,
      journey.success ? "-" : `${journey.blockedAt.step} — ${journey.blockedAt.reason}`,
      journey.frictions?.length ? journey.frictions.join(" / ") : "-",
    ];
  });
  return table(["여정", "결과", "조작 수", "소요", "막힌 지점·원인", "마찰(우회·중복 조치)"], rows);
}

/** 미측정 항목표. */
export function renderUnmeasuredTable() {
  return table(["항목", "점수에 넣지 않은 이유"], UNMEASURED_HUMAN_ITEMS.map((entry) => [entry.label, entry.why]));
}

/** summary.md 전체. */
export function renderSummaryMarkdown(report) {
  const { summary, environment } = report;
  const lines = [];
  lines.push("# UI/UX 자동 측정 요약");
  lines.push("");
  lines.push(`- 생성: ${report.generatedAt} · 커밋 ${report.git.commit.slice(0, 12)} · 점수 규칙 ${report.rubricVersion}`);
  lines.push(`- 환경: ${environment.server === "dev" ? "Vite 개발 서버(시간 지표 점수 제외)" : "운영형 서버"} · ${environment.browser} · axe ${environment.axe || "?"}`);
  lines.push(`- 화면 평균 ${fmt(summary.screenAverage75)} / ${SCREEN_MAX} · 여정 ${fmt(summary.journeyScore25)} / ${RUBRIC.journeys.max} · 합계 ${fmt(summary.total)} / ${summary.measuredMax}`);
  lines.push("");
  lines.push("## 영역별 점수");
  lines.push("");
  lines.push(renderCategoryTable(report));
  lines.push("");
  lines.push("## 화면별 점수");
  lines.push("");
  lines.push(renderRouteTable(report));
  lines.push("");
  lines.push("## 최저점 화면 5개");
  lines.push("");
  lines.push(renderLowestTable(report));
  lines.push("");
  lines.push("## 위반 상위 10개 유형");
  lines.push("");
  lines.push(renderViolationTable(report));
  lines.push("");
  lines.push("## 핵심 여정");
  lines.push("");
  lines.push(renderJourneyTable(report));
  lines.push("");
  lines.push("## 측정하지 않은 것");
  lines.push("");
  lines.push(renderUnmeasuredTable());
  if (report.plan.skippedRoutes.length > 0) {
    lines.push("");
    lines.push(`건너뛴 칸 ${report.plan.skippedRoutes.length}개: ${report.plan.skippedRoutes[0].reason}`);
  }
  return `${lines.join("\n")}\n`;
}
