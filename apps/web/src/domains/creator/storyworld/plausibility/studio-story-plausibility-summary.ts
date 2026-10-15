/**
 * 개연성 점검 요약 한 줄.
 *
 * 허브가 점검을 마칠 때마다 작품별로 아주 작은 요약(마지막 점검 시각, 오류·경고·제안 건수, 점검 가능
 * 범위)을 남긴다. 작품 준비도 패널이 이 요약을 동기적으로 읽어 "출시 전 권장 점검"으로 보여 주므로,
 * 준비도 쪽 저장소(localStorage)와 같은 곳에 둔다. 본문이나 근거는 담지 않는다.
 *
 * 이 요약은 출시를 막지 않는다. 준비도의 막힘·확인 필요 건수에 더하지 않고 권장 안내로만 쓴다.
 */
import type { StudioProjectDiagnosticSourceStorage } from "../../studio-project-diagnostic-source-store";
import type { PlausibilityDispositionView } from "./studio-story-plausibility-report";
import type { PlausibilityReport } from "./studio-story-plausibility-types";

export const STUDIO_PLAUSIBILITY_SUMMARY_UPDATED_EVENT = "toonspectrum:studio:story-plausibility-summary-updated";

export interface PlausibilitySummarySnapshot {
  readonly version: 1;
  readonly checkedAtIso: string;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly suggestionCount: number;
  /** 점검 가능 범위(0~100). */
  readonly coveragePercent: number;
  readonly sceneCount: number;
  /** 일부 장면만 점검했으면 true. */
  readonly partial: boolean;
}

export interface PlausibilitySummaryEventTarget {
  dispatchEvent(event: Event): boolean;
}

export function plausibilitySummaryStorageKey(projectId: string): string {
  return `toonspectrum:story-plausibility-summary:v1:${encodeURIComponent(projectId)}`;
}

/** 처리 기록을 겹친 건수 기준의 요약을 만든다. */
export function plausibilitySnapshotFromReport(
  report: PlausibilityReport,
  view: PlausibilityDispositionView,
): PlausibilitySummarySnapshot {
  return {
    version: 1,
    checkedAtIso: report.generatedAtIso,
    errorCount: view.summary.counts.error,
    warningCount: view.summary.counts.warning,
    suggestionCount: view.summary.counts.suggestion,
    coveragePercent: view.summary.coverage.percent,
    sceneCount: view.summary.coverage.sceneCount,
    partial: report.scopeSceneIds !== null,
  };
}

function isCount(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePlausibilitySummary(value: unknown): PlausibilitySummarySnapshot | null {
  if (!isRecord(value)) return null;
  const record = value;
  const { checkedAtIso, errorCount, warningCount, suggestionCount, coveragePercent, sceneCount, partial } = record;
  if (
    record.version !== 1
    || typeof checkedAtIso !== "string"
    || !Number.isFinite(Date.parse(checkedAtIso))
    || !isCount(errorCount, 100_000)
    || !isCount(warningCount, 100_000)
    || !isCount(suggestionCount, 100_000)
    || !isCount(coveragePercent, 100)
    || !isCount(sceneCount, 100_000)
    || typeof partial !== "boolean"
  ) {
    return null;
  }
  return { version: 1, checkedAtIso, errorCount, warningCount, suggestionCount, coveragePercent, sceneCount, partial };
}

export function readPlausibilitySummary(
  storage: Pick<StudioProjectDiagnosticSourceStorage, "getItem">,
  projectId: string,
): PlausibilitySummarySnapshot | null {
  if (!projectId.trim()) return null;
  try {
    const raw = storage.getItem(plausibilitySummaryStorageKey(projectId));
    return raw === null ? null : parsePlausibilitySummary(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** 요약을 저장하고 알린다. 저장하지 못해도(용량·차단) 점검 자체는 계속되므로 오류를 던지지 않고 false를 돌려준다. */
export function writePlausibilitySummary(
  storage: Pick<StudioProjectDiagnosticSourceStorage, "setItem">,
  projectId: string,
  snapshot: PlausibilitySummarySnapshot,
  target?: PlausibilitySummaryEventTarget,
): boolean {
  if (!projectId.trim()) return false;
  try {
    storage.setItem(plausibilitySummaryStorageKey(projectId), JSON.stringify(snapshot));
  } catch {
    return false;
  }
  target?.dispatchEvent(new CustomEvent(STUDIO_PLAUSIBILITY_SUMMARY_UPDATED_EVENT, { detail: { projectId, snapshot } }));
  return true;
}

export interface PlausibilitySummaryText {
  readonly ko: string;
  readonly en: string;
}

/**
 * 준비도 패널에 한 줄로 보여 줄 문장. 점검한 적이 없으면 권장 안내를 보여 준다.
 * 시각 표기는 호출하는 쪽 로케일에 맡긴다(순수 함수라서 시각 함수를 받는다).
 */
export function describePlausibilitySummary(
  snapshot: PlausibilitySummarySnapshot | null,
  formatTime: (iso: string, locale: "ko" | "en") => string,
): PlausibilitySummaryText {
  if (snapshot === null) {
    return {
      ko: "개연성 점검 · 아직 점검하지 않았어요 (권장 · 출시를 막지 않아요)",
      en: "Story plausibility review · not run yet (recommended, never blocks publishing)",
    };
  }
  const partialKo = snapshot.partial ? " · 일부 장면만 점검" : "";
  const partialEn = snapshot.partial ? " · selected scenes only" : "";
  return {
    ko: `개연성 점검 요약 · 마지막 점검 ${formatTime(snapshot.checkedAtIso, "ko")} · 오류 ${snapshot.errorCount} · 경고 ${snapshot.warningCount} · 커버리지 ${snapshot.coveragePercent}%${partialKo} (권장 · 출시를 막지 않아요)`,
    en: `Plausibility summary · last run ${formatTime(snapshot.checkedAtIso, "en")} · ${snapshot.errorCount} errors · ${snapshot.warningCount} warnings · ${snapshot.coveragePercent}% coverage${partialEn} (recommended, never blocks publishing)`,
  };
}

/** 허브로 가는 길. 작품 id가 있어야 만들 수 있다. */
export function plausibilityHubHref(projectId: string): string {
  return `/studio/work/${encodeURIComponent(projectId)}/storyworld?view=plausibility`;
}
