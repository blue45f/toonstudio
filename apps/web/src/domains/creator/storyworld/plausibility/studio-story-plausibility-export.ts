/**
 * 개연성 리포트 내보내기: Markdown과 JSON.
 *
 * 두 형식은 같은 중간 문서(PlausibilityExportDocument)에서 만든다. 그래서 어느 쪽을 받아도 내용이
 * 같고, 가림 처리도 한 곳에서만 일어난다.
 *
 * 내보내는 것: 생성 시각, 점검 범위, 점검 가능 범위(커버리지), 점수와 계산식, 범주별 감점, 발견
 *   (설명·질문·근거·해결 선택지), 처리 기록, 점검 출처, 한계.
 * 내보내지 않는 것: 원고 전문, 사용자 식별 정보, 저장소 키, 토큰. 근거에 붙는 원고 인용은 둘레 24자
 *   안팎의 짧은 발췌뿐이며, 이메일·전화번호·주민번호·카드번호·주소(URL)·파일 경로·긴 토큰은 [가림]으로
 *   바꾼다. 인용을 아예 빼고 싶으면 includeQuotes=false.
 */
import { redactStudioDiagnosticText, STUDIO_REDACTION_PLACEHOLDER } from "../../studio-diagnostic-redaction";
import type { PlausibilityDispositionView } from "./studio-story-plausibility-report";
import {
  PLAUSIBILITY_CONFIDENCE_LABELS,
  PLAUSIBILITY_DISPOSITION_LABELS,
  PLAUSIBILITY_SEVERITY_LABELS,
  PLAUSIBILITY_TRUST_HINTS,
  PLAUSIBILITY_TRUST_LABELS,
  plausibilityCategoryLabel,
  type PlausibilityCategoryId,
  type PlausibilityConfidence,
  type PlausibilityCoverage,
  type PlausibilityDispositionStatus,
  type PlausibilityEvidence,
  type PlausibilityFinding,
  type PlausibilityReport,
  type PlausibilityScoreTerm,
  type PlausibilitySeverity,
  type PlausibilitySourceReport,
  type PlausibilityTrust,
} from "./studio-story-plausibility-types";

export const PLAUSIBILITY_EXPORT_FORMAT = "toonstudio.story-plausibility-report" as const;
export const PLAUSIBILITY_EXPORT_VERSION = 1 as const;

// ── 가림 처리 ─────────────────────────────────────────────────────────

/** 한국 휴대전화·유선전화(국가번호 포함 가능). 구분자는 공백이나 하이픈. */
const PHONE = /(?<![\d-])(?:\+82[\s-]?)?(?:0?1[016789]|0(?:2|[3-6]\d))[\s-]?\d{3,4}[\s-]?\d{4}(?![\d-])/gu;
/** 주민등록번호 모양: 생년월일 6자리 + 성별 1~4로 시작하는 7자리. */
const RESIDENT_NUMBER = /(?<!\d)\d{6}[\s-]?[1-4]\d{6}(?!\d)/gu;
/** 카드번호 모양: 4자리씩 4묶음. */
const CARD_NUMBER = /(?<!\d)(?:\d{4}[\s-]?){3}\d{4}(?!\d)/gu;

export const PLAUSIBILITY_EXPORT_MAX_TEXT = 700;

/** 내보내는 모든 자유 문장이 거치는 하나의 문. 한 줄로 합치고 길이를 제한한다. */
export function redactPlausibilityText(input: string, maxLength: number = PLAUSIBILITY_EXPORT_MAX_TEXT): string {
  const masked = input
    .replace(RESIDENT_NUMBER, STUDIO_REDACTION_PLACEHOLDER)
    .replace(CARD_NUMBER, STUDIO_REDACTION_PLACEHOLDER)
    .replace(PHONE, STUDIO_REDACTION_PLACEHOLDER);
  return redactStudioDiagnosticText(masked, maxLength);
}

// ── 중간 문서 ─────────────────────────────────────────────────────────

export interface PlausibilityExportEvidence {
  readonly kind: PlausibilityEvidence["kind"];
  readonly label: string;
  readonly detail?: string;
  readonly quote?: { readonly text: string; readonly highlighted: string };
}

export interface PlausibilityExportFinding {
  readonly id: string;
  readonly category: PlausibilityCategoryId;
  readonly categoryLabel: string;
  readonly severity: PlausibilitySeverity;
  readonly severityLabel: string;
  readonly confidence: PlausibilityConfidence;
  readonly confidenceLabel: string;
  readonly title: string;
  readonly message: string;
  readonly question: string;
  readonly scenes: readonly string[];
  readonly evidence: readonly PlausibilityExportEvidence[];
  /** 해결 선택지. 어느 것도 문서를 자동으로 바꾸지 않는다. */
  readonly resolutionOptions: readonly { readonly label: string; readonly description: string }[];
  readonly source: { readonly module: string; readonly code: string };
  readonly disposition?: {
    readonly status: PlausibilityDispositionStatus;
    readonly label: string;
    readonly note?: string;
  };
}

export interface PlausibilityExportDocument {
  readonly format: typeof PLAUSIBILITY_EXPORT_FORMAT;
  readonly formatVersion: typeof PLAUSIBILITY_EXPORT_VERSION;
  readonly generatedAtIso: string;
  readonly project: { readonly title: string };
  readonly scope: { readonly label: string; readonly sceneCount: number };
  readonly summary: {
    readonly counts: { readonly total: number; readonly error: number; readonly warning: number; readonly suggestion: number };
    readonly coverage: PlausibilityCoverage;
    readonly score: {
      readonly value: number;
      readonly formula: string;
      readonly terms: readonly PlausibilityScoreTerm[];
      readonly totalPenalty: number;
    };
    readonly trust: PlausibilityTrust;
    readonly trustLabel: string;
    readonly trustHint: string;
    readonly omittedCount: number;
    readonly handledCounts: Readonly<Record<PlausibilityDispositionStatus, number>>;
  };
  /** 확인할 발견: 처리 기록이 없거나 '나중에'로 미뤄 둔 것. 점수에 반영된다. */
  readonly findings: readonly PlausibilityExportFinding[];
  /** 해결함·의도된 설정·무시함으로 처리한 발견. 점수에 반영되지 않지만 지우지 않고 남긴다. */
  readonly handled: readonly PlausibilityExportFinding[];
  readonly sources: readonly PlausibilitySourceReport[];
  readonly limits: readonly string[];
}

export interface PlausibilityExportInput {
  readonly report: PlausibilityReport;
  /** 처리 기록을 겹친 결과. 점수와 건수는 이 값을 따른다. */
  readonly view: PlausibilityDispositionView;
  /** 점검 범위를 사람이 읽을 말로. 생략하면 리포트의 범위에서 만든다. */
  readonly scopeLabel?: string;
  /** 장면 id → 제목. 발견이 걸린 장면 이름을 적을 때 쓴다. */
  readonly sceneTitles?: ReadonlyMap<string, string>;
  /** 근거의 원고 인용을 넣을지. 기본 true. */
  readonly includeQuotes?: boolean;
}

function exportFinding(
  finding: PlausibilityFinding,
  sceneTitles: ReadonlyMap<string, string> | undefined,
  includeQuotes: boolean,
  disposition?: { readonly status: PlausibilityDispositionStatus; readonly note?: string },
): PlausibilityExportFinding {
  const sceneNameFromEvidence = new Map(
    finding.evidence.filter((item) => item.sceneId !== undefined).map((item) => [item.sceneId ?? "", item.label]),
  );
  const scenes = finding.sceneIds
    .map((id) => sceneTitles?.get(id) ?? sceneNameFromEvidence.get(id) ?? "")
    .filter((title) => title.length > 0)
    .map((title) => redactPlausibilityText(title, 120));
  const evidence = finding.evidence.map((item): PlausibilityExportEvidence => {
    const quote = includeQuotes ? item.quote : undefined;
    const base = {
      kind: item.kind,
      label: redactPlausibilityText(item.label, 160),
    };
    const withDetail = item.detail ? { ...base, detail: redactPlausibilityText(item.detail, 240) } : base;
    if (!quote) return withDetail;
    const chars = Array.from(quote.text);
    return {
      ...withDetail,
      quote: {
        text: redactPlausibilityText(quote.text, 200),
        highlighted: redactPlausibilityText(chars.slice(quote.highlightStart, quote.highlightEnd).join(""), 80),
      },
    };
  });
  return {
    id: finding.id,
    category: finding.category,
    categoryLabel: plausibilityCategoryLabel(finding.category),
    severity: finding.severity,
    severityLabel: PLAUSIBILITY_SEVERITY_LABELS[finding.severity],
    confidence: finding.confidence,
    confidenceLabel: PLAUSIBILITY_CONFIDENCE_LABELS[finding.confidence],
    title: redactPlausibilityText(finding.title, 160),
    message: redactPlausibilityText(finding.message),
    question: redactPlausibilityText(finding.question),
    scenes,
    evidence,
    resolutionOptions: finding.options.map((option) => ({
      label: redactPlausibilityText(option.label, 160),
      description: redactPlausibilityText(option.description, 320),
    })),
    source: { module: finding.source.module, code: finding.source.code },
    ...(disposition
      ? {
        disposition: {
          status: disposition.status,
          label: PLAUSIBILITY_DISPOSITION_LABELS[disposition.status],
          ...(disposition.note ? { note: redactPlausibilityText(disposition.note, 400) } : {}),
        },
      }
      : {}),
  };
}

function defaultScopeLabel(report: PlausibilityReport): string {
  return report.scopeSceneIds === null ? "전체 장면" : `선택한 장면 ${report.scopeSceneIds.length}개`;
}

export function buildPlausibilityExport(input: PlausibilityExportInput): PlausibilityExportDocument {
  const { report, view } = input;
  const includeQuotes = input.includeQuotes !== false;
  const deferred = view.handled.filter((item) => item.status === "deferred");
  const closed = view.handled.filter((item) => item.status !== "deferred");
  const rank = new Map(report.findings.map((finding, index) => [finding.id, index]));
  const confirm = [
    ...view.open.map((finding) => ({ finding, disposition: undefined })),
    ...deferred.map((item) => ({ finding: item.finding, disposition: { status: item.status, ...(item.note ? { note: item.note } : {}) } })),
  ].sort((a, b) => (rank.get(a.finding.id) ?? 0) - (rank.get(b.finding.id) ?? 0));
  const totalPenalty = view.summary.score.terms.reduce((sum, term) => sum + term.penalty, 0);
  return {
    format: PLAUSIBILITY_EXPORT_FORMAT,
    formatVersion: PLAUSIBILITY_EXPORT_VERSION,
    generatedAtIso: report.generatedAtIso,
    project: { title: redactPlausibilityText(report.projectTitle, 160) },
    scope: {
      label: redactPlausibilityText(input.scopeLabel ?? defaultScopeLabel(report), 160),
      sceneCount: view.summary.coverage.sceneCount,
    },
    summary: {
      counts: view.summary.counts,
      coverage: view.summary.coverage,
      score: {
        value: view.summary.score.value,
        formula: view.summary.score.formula,
        terms: view.summary.score.terms,
        totalPenalty,
      },
      trust: view.summary.trust,
      trustLabel: PLAUSIBILITY_TRUST_LABELS[view.summary.trust],
      trustHint: PLAUSIBILITY_TRUST_HINTS[view.summary.trust],
      omittedCount: view.summary.omittedCount,
      handledCounts: view.handledCounts,
    },
    findings: confirm.map((item) => exportFinding(item.finding, input.sceneTitles, includeQuotes, item.disposition)),
    handled: closed.map((item) => exportFinding(item.finding, input.sceneTitles, includeQuotes, { status: item.status, ...(item.note ? { note: item.note } : {}) })),
    sources: report.sources.map((source) => ({ ...source, detail: redactPlausibilityText(source.detail, 240) })),
    limits: report.limits,
  };
}

export function plausibilityExportToJson(doc: PlausibilityExportDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

// ── Markdown ──────────────────────────────────────────────────────────

/** 표와 목록 안에서 서식으로 읽히는 글자를 막는다. */
function md(text: string): string {
  return text
    .replace(/[\\`*_[\]<>|]/gu, (char) => `\\${char}`)
    .replace(/^([#>+-])/u, "\\$1");
}

function formatUtc(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return iso;
  const date = new Date(time);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

function findingMarkdown(finding: PlausibilityExportFinding, index: number): string[] {
  const lines: string[] = [];
  lines.push(`#### ${index}. [${finding.severityLabel} · ${finding.confidenceLabel}] ${md(finding.title)}`);
  lines.push("");
  if (finding.disposition) {
    lines.push(`- 처리 기록: **${finding.disposition.label}**${finding.disposition.note ? ` — ${md(finding.disposition.note)}` : ""}`);
  }
  lines.push(`- 무슨 일인가요: ${md(finding.message)}`);
  lines.push(`- 작가님께 드리는 질문: ${md(finding.question)}`);
  if (finding.scenes.length > 0) lines.push(`- 관련 장면: ${finding.scenes.map(md).join(", ")}`);
  if (finding.evidence.length > 0) {
    lines.push("- 근거:");
    for (const item of finding.evidence) {
      lines.push(`  - ${md(item.label)}${item.detail ? ` — ${md(item.detail)}` : ""}`);
      if (item.quote) lines.push(`    - 원고 인용: “${md(item.quote.text)}” (강조: ${md(item.quote.highlighted)})`);
    }
  }
  if (finding.resolutionOptions.length > 0) {
    lines.push("- 해결 선택지 (자동으로 적용되지 않아요):");
    for (const option of finding.resolutionOptions) lines.push(`  - ${md(option.label)} — ${md(option.description)}`);
  }
  lines.push(`- 출처: ${finding.source.module} / ${finding.source.code}`);
  lines.push("");
  return lines;
}

function groupByCategory(findings: readonly PlausibilityExportFinding[]) {
  const groups = new Map<PlausibilityCategoryId, PlausibilityExportFinding[]>();
  for (const finding of findings) {
    const list = groups.get(finding.category) ?? [];
    list.push(finding);
    groups.set(finding.category, list);
  }
  return [...groups.entries()];
}

function sectionMarkdown(heading: string, findings: readonly PlausibilityExportFinding[]): string[] {
  const lines: string[] = [`## ${heading}`, ""];
  if (findings.length === 0) {
    lines.push("해당하는 항목이 없어요.", "");
    return lines;
  }
  let number = 0;
  for (const [category, list] of groupByCategory(findings)) {
    lines.push(`### ${md(plausibilityCategoryLabel(category))} (${list.length}건)`, "");
    for (const finding of list) {
      number += 1;
      lines.push(...findingMarkdown(finding, number));
    }
  }
  return lines;
}

export function plausibilityExportToMarkdown(doc: PlausibilityExportDocument): string {
  const { summary } = doc;
  const lines: string[] = [];
  lines.push(`# 개연성 점검 리포트 — ${md(doc.project.title)}`, "");
  lines.push(`- 생성 시각: ${formatUtc(doc.generatedAtIso)} (${doc.generatedAtIso})`);
  lines.push(`- 점검 범위: ${md(doc.scope.label)} (사용 중인 장면 ${doc.scope.sceneCount}개)`);
  lines.push(`- 점검 가능 범위(커버리지): **${summary.coverage.percent}%** — 장면 ${summary.coverage.sceneCount}개 × 9칸 중 ${summary.coverage.coveredCells}/${summary.coverage.totalCells}칸을 점검할 수 있었어요`);
  lines.push(`- 개연성 점수: **${summary.score.value} / 100** (참고값, 점수 신뢰: ${summary.trustLabel})`);
  lines.push(`- 확인할 항목: 오류 ${summary.counts.error} · 경고 ${summary.counts.warning} · 제안 ${summary.counts.suggestion}`);
  const handledTotal = Object.values(summary.handledCounts).reduce((sum, value) => sum + value, 0);
  if (handledTotal > 0) {
    lines.push(`- 처리 기록: 해결함 ${summary.handledCounts.resolved} · 의도된 설정 ${summary.handledCounts.intended} · 나중에 ${summary.handledCounts.deferred} · 무시함 ${summary.handledCounts.ignored}`);
  }
  if (summary.omittedCount > 0) lines.push(`- 목록 상한 때문에 ${summary.omittedCount}건은 이 리포트에 담지 못했어요.`);
  lines.push("", `> ${md(summary.trustHint)}`, "");

  lines.push("## 점수 계산식", "", md(summary.score.formula), "");
  lines.push("| 범주 | 오류 | 확정 경고 | 추정 경고 | 제안 | 감점 | 상한 적용 |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const term of summary.score.terms) {
    lines.push(`| ${md(plausibilityCategoryLabel(term.category))} | ${term.errors} | ${term.certainWarnings} | ${term.heuristicWarnings} | ${term.suggestions} | ${term.rawPenalty} | ${term.penalty} |`);
  }
  lines.push("", `감점 합계 ${summary.score.totalPenalty}점 → 100 − ${summary.score.totalPenalty} = **${summary.score.value}점**`, "");

  lines.push("## 점검 가능 범위", "");
  lines.push("입력하지 않은 칸은 '문제 없음'이 아니라 '점검 불가'입니다.", "");
  lines.push("| 칸 | 점검한 장면 | 전체 장면 |", "| --- | ---: | ---: |");
  for (const item of summary.coverage.items) lines.push(`| ${md(item.label)} | ${item.covered} | ${item.total} |`);
  lines.push("");

  lines.push(...sectionMarkdown("확인할 항목", doc.findings));
  if (doc.handled.length > 0) lines.push(...sectionMarkdown("처리한 항목 (점수에서 제외)", doc.handled));

  lines.push("## 점검 출처", "", "| 출처 | 상태 | 설명 |", "| --- | --- | --- |");
  const statusLabels = { used: "사용함", empty: "비어 있음", unavailable: "연결 안 됨" } as const;
  for (const source of doc.sources) lines.push(`| ${md(source.label)} | ${statusLabels[source.status]} | ${md(source.detail)} |`);
  lines.push("");

  lines.push("## 이 리포트의 한계", "");
  for (const limit of doc.limits) lines.push(`- ${md(limit)}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

/** 내려받는 파일 이름. 작품 제목 같은 내용은 넣지 않고 생성 날짜(UTC)만 쓴다. */
export function plausibilityExportFileName(generatedAtIso: string, extension: "md" | "json"): string {
  const time = Date.parse(generatedAtIso);
  const stamp = Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10).replace(/-/gu, "") : "undated";
  return `story-plausibility-report-${stamp}.${extension}`;
}
