/**
 * 통합 개연성 리포트.
 *
 * 인과 엔진, 연속성 검사, 새 개연성 규칙, 그리고 호출자가 넘기는 복선 장부·약속 장부·회차
 * 타임라인·설정 검증·고유명사 검사 결과를 하나의 목록으로 합친다. 이 파일은 순수 함수만
 * 담는다: 저장소나 시계를 읽지 않으므로 같은 입력이면 같은 리포트가 나온다.
 *
 * 크기 상한: 발견은 PLAUSIBILITY_DEFAULT_MAX_FINDINGS건(기본 400)까지만 남기고, 넘친 건수는
 * `summary.omittedCount`로 알린다. 근거는 발견당 8개, 문장은 글자 수 상한이 있다.
 */
import {
  analyzeStoryworldProject,
  type StoryworldAnalysisResult,
  type StoryworldProject,
} from "../studio-storyworld-causality";
import { analyzeStoryworldContinuity, type StoryworldContinuityIssue } from "../studio-storyworld-continuity";
import type { StudioWorldLoreIssue } from "../../planning/studio-world-lore";
import { adaptCausalityIssues, adaptContinuityIssues } from "./studio-story-plausibility-adapters";
import {
  adaptEpisodeTimeline,
  adaptForeshadowLedger,
  adaptLoreIssues,
  adaptNameChecks,
  adaptPromiseLedger,
  type PlausibilityForeshadowInput,
  type PlausibilityNameCheckBatch,
  type PlausibilityPromiseInput,
  type PlausibilityTimelineInput,
} from "./studio-story-plausibility-adapters-planning";
import { createPlausibilityContext } from "./studio-story-plausibility-context";
import { detectPlausibilityIssues } from "./studio-story-plausibility-detectors";
import { computePlausibilityCoverage } from "./studio-story-plausibility-status";
import {
  PLAUSIBILITY_CATEGORIES,
  PLAUSIBILITY_CATEGORY_IDS,
  type PlausibilityCategoryId,
  type PlausibilityCategorySummary,
  type PlausibilityCounts,
  type PlausibilityCoverage,
  type PlausibilityDispositionStatus,
  type PlausibilityFinding,
  type PlausibilityHandledFinding,
  type PlausibilityReport,
  type PlausibilityScore,
  type PlausibilityScoreTerm,
  type PlausibilitySeverity,
  type PlausibilitySourceReport,
  type PlausibilitySummary,
  type PlausibilityTrust,
} from "./studio-story-plausibility-types";

export const PLAUSIBILITY_DEFAULT_MAX_FINDINGS = 400;

/** 점수식의 가중치. 화면과 내보내기에 같은 숫자를 적는다. */
export const PLAUSIBILITY_SCORE_WEIGHTS = Object.freeze({
  error: 15,
  certainWarning: 6,
  heuristicWarning: 3,
  suggestion: 1,
  categoryCap: 40,
});

export const PLAUSIBILITY_SCORE_FORMULA =
  "개연성 점수 = 100 − Σ 범주별 감점 (범주마다 최대 40점). "
  + "범주별 감점 = 오류 건수 × 15 + 확정 경고 × 6 + 추정 경고 × 3 + 제안 × 1. "
  + "처리 기록에서 해결함·의도된 설정으로 표시한 발견은 감점하지 않습니다.";

/** 자동으로 판정하지 못하는 영역. 화면과 내보내기에 그대로 적는다. */
export const PLAUSIBILITY_LIMITS: readonly string[] = Object.freeze([
  "이야기가 재미있는지, 감동적인지는 판단하지 않습니다.",
  "입력하지 않은 내용은 점검하지 못합니다. 점검 가능 범위가 낮으면 '문제 없음'이 아니라 '아직 모름'입니다.",
  "인물의 성격이 일관적인지, 동기가 설득력 있는지는 문장의 뜻을 이해해야 해서 판정하지 않습니다. 작가가 직접 적은 동기·원인·단서가 서로 어긋나는지만 확인합니다.",
  "회상, 꿈, 예언, 초자연처럼 의도된 연출은 기계가 알 수 없습니다. 장면 성격으로 표시하거나 처리 기록에 '의도된 설정'으로 남겨 주세요.",
  "'추정' 표시가 붙은 발견은 글쓰기 관습에 기댄 의심이라 틀릴 수 있습니다.",
  "원고에서 가져오는 것은 장면 경계, 등록된 이름의 글자 일치, 명시된 시간 표현뿐입니다. 말투, 암시, 반어 같은 문장 속 의미는 읽지 않습니다.",
  "이름 표기 흔들림은 세 글자 이상 이름의 한 글자 안팎 차이만 찾습니다. 두 글자 이름은 다른 이름과 헷갈려 오탐이 많아서 제외했어요.",
  "점수는 점검한 범위 안의 참고값입니다. 점검 가능 범위가 낮을 때의 높은 점수를 완성도로 읽지 마세요.",
]);

export interface PlausibilityExtraSources {
  readonly foreshadow?: PlausibilityForeshadowInput;
  readonly promise?: PlausibilityPromiseInput;
  readonly timeline?: PlausibilityTimelineInput;
  readonly lore?: {
    readonly issues: readonly StudioWorldLoreIssue[];
    readonly entryCount: number;
    /** 항목 id → 이름. 설명에 내부 id 대신 작가가 붙인 이름을 쓴다. */
    readonly entryNames?: Readonly<Record<string, string>>;
  };
  readonly nameChecks?: readonly PlausibilityNameCheckBatch[];
}

export interface PlausibilityReportInput {
  readonly project: StoryworldProject;
  /** 리포트에 적을 생성 시각. 호출자가 정한다(순수성 유지). */
  readonly generatedAtIso: string;
  /** 점검할 장면. 생략하거나 null이면 전체. */
  readonly scopeSceneIds?: readonly string[] | null;
  readonly analysis?: StoryworldAnalysisResult;
  readonly continuityIssues?: readonly StoryworldContinuityIssue[];
  readonly extras?: PlausibilityExtraSources;
  readonly maxFindings?: number;
}

const SEVERITY_RANK: Readonly<Record<PlausibilitySeverity, number>> = { error: 0, warning: 1, suggestion: 2 };
const CATEGORY_RANK: ReadonlyMap<PlausibilityCategoryId, number> = new Map(
  PLAUSIBILITY_CATEGORY_IDS.map((id, index) => [id, index]),
);

export function comparePlausibilityFindings(a: PlausibilityFinding, b: PlausibilityFinding): number {
  return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    || a.sortOrder - b.sortOrder
    || (CATEGORY_RANK.get(a.category) ?? 0) - (CATEGORY_RANK.get(b.category) ?? 0)
    || a.id.localeCompare(b.id);
}

function emptyCounts(): { error: number; warning: number; suggestion: number; certainWarning: number; heuristicWarning: number } {
  return { error: 0, warning: 0, suggestion: 0, certainWarning: 0, heuristicWarning: 0 };
}

function computeScore(findings: readonly PlausibilityFinding[]): PlausibilityScore {
  const terms: PlausibilityScoreTerm[] = PLAUSIBILITY_CATEGORY_IDS.map((category) => {
    const counts = emptyCounts();
    for (const finding of findings) {
      if (finding.category !== category) continue;
      if (finding.severity === "error") counts.error += 1;
      else if (finding.severity === "suggestion") counts.suggestion += 1;
      else if (finding.confidence === "certain") counts.certainWarning += 1;
      else counts.heuristicWarning += 1;
    }
    const rawPenalty = counts.error * PLAUSIBILITY_SCORE_WEIGHTS.error
      + counts.certainWarning * PLAUSIBILITY_SCORE_WEIGHTS.certainWarning
      + counts.heuristicWarning * PLAUSIBILITY_SCORE_WEIGHTS.heuristicWarning
      + counts.suggestion * PLAUSIBILITY_SCORE_WEIGHTS.suggestion;
    return {
      category,
      errors: counts.error,
      certainWarnings: counts.certainWarning,
      heuristicWarnings: counts.heuristicWarning,
      suggestions: counts.suggestion,
      rawPenalty,
      penalty: Math.min(PLAUSIBILITY_SCORE_WEIGHTS.categoryCap, rawPenalty),
    };
  });
  const total = terms.reduce((sum, term) => sum + term.penalty, 0);
  return { value: Math.max(0, 100 - total), formula: PLAUSIBILITY_SCORE_FORMULA, terms };
}

function countBySeverity(findings: readonly PlausibilityFinding[]): PlausibilityCounts {
  let error = 0;
  let warning = 0;
  let suggestion = 0;
  for (const finding of findings) {
    if (finding.severity === "error") error += 1;
    else if (finding.severity === "warning") warning += 1;
    else suggestion += 1;
  }
  return { total: findings.length, error, warning, suggestion };
}

function trustFor(percent: number): PlausibilityTrust {
  if (percent < 40) return "low";
  if (percent < 70) return "medium";
  return "high";
}

export function summarizePlausibility(
  findings: readonly PlausibilityFinding[],
  coverage: PlausibilityCoverage,
  omittedCount = 0,
): PlausibilitySummary {
  const byCategory: PlausibilityCategorySummary[] = PLAUSIBILITY_CATEGORY_IDS.map((category) => ({
    category,
    ...countBySeverity(findings.filter((finding) => finding.category === category)),
  }));
  return {
    counts: countBySeverity(findings),
    byCategory,
    coverage,
    score: computeScore(findings),
    trust: trustFor(coverage.percent),
    omittedCount,
  };
}

function buildSources(
  project: StoryworldProject,
  extras: PlausibilityExtraSources | undefined,
): readonly PlausibilitySourceReport[] {
  const activeCount = project.scenes.filter((scene) => scene.disabled !== true).length;
  const roleCount = (role: "decision" | "resolution" | "flashback") =>
    project.scenes.filter((scene) => scene.disabled !== true && scene.plausibility?.roles?.includes(role)).length;
  const sources: PlausibilitySourceReport[] = [
    { id: "causality", label: "인과 엔진", status: "used", detail: `사용 중인 장면 ${activeCount}개를 순서대로 실행했어요` },
    { id: "continuity", label: "설정·연속성 검사", status: "used", detail: "인물·사실·장면 사이의 행정적 불일치를 규칙으로 검사했어요" },
    {
      id: "plausibility",
      label: "해결·동기·나이 규칙",
      status: "used",
      detail: `해결 장면 ${roleCount("resolution")}개 · 결정 장면 ${roleCount("decision")}개 · 회상 장면 ${roleCount("flashback")}개로 표시됨`,
    },
  ];
  const optional = (
    id: string,
    label: string,
    provided: boolean,
    count: number,
    usedDetail: string,
    emptyDetail: string,
    missingDetail: string,
  ): PlausibilitySourceReport => provided
    ? count > 0
      ? { id, label, status: "used", detail: usedDetail }
      : { id, label, status: "empty", detail: emptyDetail }
    : { id, label, status: "unavailable", detail: missingDetail };
  sources.push(
    optional("foreshadow-ledger", "복선 장부", extras?.foreshadow !== undefined, extras?.foreshadow?.totalCount ?? 0,
      `복선 ${extras?.foreshadow?.totalCount ?? 0}건을 확인했어요`, "복선 장부가 비어 있어요", "연결된 복선 장부가 없어요"),
    optional("promise-ledger", "약속·회수 장부", extras?.promise !== undefined, extras?.promise?.totalCount ?? 0,
      `약속 ${extras?.promise?.totalCount ?? 0}건을 확인했어요`, "약속·회수 장부가 비어 있어요", "제작 바이블 안의 약속·회수 장부는 아직 이 허브와 연결되지 않았어요"),
    optional("episode-timeline", "회차 시간 태그", extras?.timeline !== undefined, extras?.timeline?.recordedCount ?? 0,
      `${extras?.timeline?.recordedCount ?? 0}개 회차의 시간 태그를 확인했어요`, "시간 태그가 기록된 회차가 없어요", "시간 태그를 저장하는 곳이 아직 없어요"),
    optional("lore", "세계관 설정 검증", extras?.lore !== undefined, extras?.lore?.entryCount ?? 0,
      `설정 항목 ${extras?.lore?.entryCount ?? 0}개를 확인했어요`, "세계관 설정 항목이 없어요", "연결된 세계관 설정이 없어요"),
    optional("name-check", "이름 표기 검사", extras?.nameChecks !== undefined, extras?.nameChecks?.length ?? 0,
      `원고가 있는 장면 ${extras?.nameChecks?.length ?? 0}개의 이름 표기를 확인했어요`, "검사할 원고가 없어요", "원고 사본이 없어 이름 표기를 검사하지 못했어요"),
  );
  return sources;
}

/** 에피소드 번호로 장면 id 목록을 만든다. 번호가 없는 장면은 어느 회차에도 속하지 않는다. */
export function sceneIdsForEpisodes(project: StoryworldProject, episodeNumbers: readonly number[]): readonly string[] {
  const wanted = new Set(episodeNumbers);
  return project.scenes
    .filter((scene) => scene.disabled !== true && scene.episodeNumber !== undefined && wanted.has(scene.episodeNumber))
    .map((scene) => scene.id);
}

export function buildPlausibilityReport(input: PlausibilityReportInput): PlausibilityReport {
  const { project } = input;
  const ctx = createPlausibilityContext(project);
  const analysis = input.analysis ?? analyzeStoryworldProject(project);
  const continuity = input.continuityIssues ?? analyzeStoryworldContinuity(project);
  const extras = input.extras;

  const collected: PlausibilityFinding[] = [
    ...adaptCausalityIssues(ctx, analysis),
    ...adaptContinuityIssues(ctx, continuity),
    ...detectPlausibilityIssues(ctx),
    ...(extras?.foreshadow ? adaptForeshadowLedger(ctx, extras.foreshadow) : []),
    ...(extras?.promise ? adaptPromiseLedger(ctx, extras.promise) : []),
    ...(extras?.timeline ? adaptEpisodeTimeline(ctx, extras.timeline) : []),
    ...(extras?.lore ? adaptLoreIssues(ctx, extras.lore.issues, extras.lore.entryNames) : []),
    ...(extras?.nameChecks ? adaptNameChecks(ctx, extras.nameChecks) : []),
  ];

  const scope = input.scopeSceneIds ? new Set(input.scopeSceneIds) : null;
  const seen = new Set<string>();
  const unique: PlausibilityFinding[] = [];
  for (const finding of collected) {
    if (seen.has(finding.id)) continue;
    seen.add(finding.id);
    if (scope && !finding.sceneIds.some((sceneId) => scope.has(sceneId))) continue;
    unique.push(finding);
  }
  unique.sort(comparePlausibilityFindings);

  const limit = Math.max(1, input.maxFindings ?? PLAUSIBILITY_DEFAULT_MAX_FINDINGS);
  const kept = unique.slice(0, limit);
  const omitted = unique.length - kept.length;
  const coverage = computePlausibilityCoverage(project, scope);

  return {
    version: 1,
    generatedAtIso: input.generatedAtIso,
    projectTitle: project.title,
    scopeSceneIds: input.scopeSceneIds ? [...input.scopeSceneIds] : null,
    findings: kept,
    summary: summarizePlausibility(kept, coverage, omitted),
    sources: buildSources(project, extras),
    limits: PLAUSIBILITY_LIMITS,
  };
}

// ── 필터·묶음·처리 기록 ─────────────────────────────────────────────

export interface PlausibilityFilters {
  readonly severity?: PlausibilitySeverity | "all";
  readonly category?: PlausibilityCategoryId | "all";
  readonly query?: string;
}

function searchableText(finding: PlausibilityFinding): string {
  const parts = [finding.title, finding.message, finding.question, finding.source.code];
  for (const evidence of finding.evidence) {
    parts.push(evidence.label);
    if (evidence.detail) parts.push(evidence.detail);
    if (evidence.quote) parts.push(evidence.quote.text);
  }
  return parts.join("\n").toLocaleLowerCase();
}

export function filterPlausibilityFindings(
  findings: readonly PlausibilityFinding[],
  filters: PlausibilityFilters,
): readonly PlausibilityFinding[] {
  const query = (filters.query ?? "").trim().toLocaleLowerCase();
  return findings.filter((finding) => {
    if (filters.severity && filters.severity !== "all" && finding.severity !== filters.severity) return false;
    if (filters.category && filters.category !== "all" && finding.category !== filters.category) return false;
    if (query && !searchableText(finding).includes(query)) return false;
    return true;
  });
}

export interface PlausibilityCategoryGroup {
  readonly category: PlausibilityCategoryId;
  readonly label: string;
  readonly findings: readonly PlausibilityFinding[];
}

/** 범주 순서대로 묶는다. 비어 있는 범주는 뺀다. */
export function groupPlausibilityFindings(findings: readonly PlausibilityFinding[]): readonly PlausibilityCategoryGroup[] {
  return PLAUSIBILITY_CATEGORIES
    .map((info) => ({
      category: info.id,
      label: info.label,
      findings: findings.filter((finding) => finding.category === info.id),
    }))
    .filter((group) => group.findings.length > 0);
}

export interface PlausibilityDispositionRecord {
  readonly issueKey: string;
  readonly status: PlausibilityDispositionStatus;
  readonly note?: string;
}

export interface PlausibilityDispositionView {
  /** 처리 기록이 없는 발견. 화면의 기본 목록이다. */
  readonly open: readonly PlausibilityFinding[];
  /** 처리 기록이 있는 발견. 접어서 보여 주되 숨기지 않는다. */
  readonly handled: readonly PlausibilityHandledFinding[];
  /** 점수·건수에 반영되는 발견(미처리 + 나중에). */
  readonly counted: readonly PlausibilityFinding[];
  readonly summary: PlausibilitySummary;
  readonly handledCounts: Readonly<Record<PlausibilityDispositionStatus, number>>;
}

/** 리포트에 처리 기록을 겹쳐 건수와 점수를 다시 계산한다. 리포트 자체는 바꾸지 않는다. */
export function applyPlausibilityDispositions(
  report: PlausibilityReport,
  records: readonly PlausibilityDispositionRecord[],
): PlausibilityDispositionView {
  const byKey = new Map(records.map((record) => [record.issueKey, record]));
  const open: PlausibilityFinding[] = [];
  const handled: PlausibilityHandledFinding[] = [];
  const handledCounts: Record<PlausibilityDispositionStatus, number> = { resolved: 0, intended: 0, deferred: 0, ignored: 0 };
  for (const finding of report.findings) {
    const record = byKey.get(finding.dispositionKey);
    if (!record) {
      open.push(finding);
      continue;
    }
    handledCounts[record.status] += 1;
    handled.push({ finding, status: record.status, ...(record.note ? { note: record.note } : {}) });
  }
  const counted = [
    ...open,
    ...handled.filter((item) => item.status === "deferred").map((item) => item.finding),
  ].sort(comparePlausibilityFindings);
  return {
    open,
    handled,
    counted,
    summary: summarizePlausibility(counted, report.summary.coverage, report.summary.omittedCount),
    handledCounts,
  };
}
