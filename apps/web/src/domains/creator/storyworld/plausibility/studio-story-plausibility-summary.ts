/**
 * 개연성 점검 요약 한 줄.
 *
 * 허브가 점검을 마칠 때마다 작품별로 아주 작은 요약(마지막 점검 시각, 오류·경고·제안 건수, 점검 가능
 * 범위)을 남긴다. 작품 준비도 패널이 이 요약을 읽어 "출시 전 권장 점검"으로 보여 준다. 본문이나 근거는
 * 담지 않는다.
 *
 * 저장 위치: 공용 SQLite/OPFS 저장소의 전용 이름 공간(`studio-story-plausibility-summary-v1`). 브라우저
 * KV(localStorage 등)는 쓰지 않는다. 저장소는 호출자가 넘기고, 제품에서는 `acquireProductPlausibilitySummaryStore`로
 * 필요할 때 한 번 얻는다(읽기·쓰기가 처음 일어날 때 SQLite 작업자를 연다).
 *
 * 이 요약은 출시를 막지 않는다. 준비도의 막힘·확인 필요 건수에 더하지 않고 권장 안내로만 쓴다.
 */
import type { StudioAsyncKeyValueStore } from "../../studio-local-database";
import type { PlausibilityDispositionView } from "./studio-story-plausibility-report";
import type { PlausibilityReport } from "./studio-story-plausibility-types";

export const STUDIO_PLAUSIBILITY_SUMMARY_UPDATED_EVENT = "toonspectrum:studio:story-plausibility-summary-updated";
export const STUDIO_PLAUSIBILITY_SUMMARY_NAMESPACE = "studio-story-plausibility-summary-v1";

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

/** 요약 저장소: 공용 비동기 키-값 저장소의 읽기·쓰기만 쓴다. */
export type PlausibilitySummaryStore = Pick<StudioAsyncKeyValueStore, "get" | "set">;

export interface PlausibilitySummaryEventTarget {
  dispatchEvent(event: Event): boolean;
}

export interface PlausibilitySummaryEventDetail {
  readonly projectId: string;
  readonly snapshot: PlausibilitySummarySnapshot;
}

/** 이름 공간 안의 열쇠. 작품 id를 그대로 인코딩한다. */
export function plausibilitySummaryKey(projectId: string): string {
  return encodeURIComponent(projectId);
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

export function parsePlausibilitySummaryEvent(event: Event): PlausibilitySummaryEventDetail | null {
  if (!(event instanceof CustomEvent)) return null;
  const detail: unknown = event.detail;
  if (!isRecord(detail) || typeof detail.projectId !== "string") return null;
  const snapshot = parsePlausibilitySummary(detail.snapshot);
  return snapshot === null ? null : { projectId: detail.projectId, snapshot };
}

/**
 * 저장된 요약을 읽는다. 읽을 수 없으면(저장소 오류) 예외를 그대로 던져 호출자가 "모름"과 "점검한 적 없음"을
 * 구별하게 한다. 저장된 값이 없거나 모양이 틀리면 null이다.
 */
export async function readPlausibilitySummary(
  store: Pick<PlausibilitySummaryStore, "get">,
  projectId: string,
): Promise<PlausibilitySummarySnapshot | null> {
  if (!projectId.trim()) return null;
  const raw = await store.get(plausibilitySummaryKey(projectId));
  if (raw === null) return null;
  try {
    return parsePlausibilitySummary(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** 요약을 저장하고 알린다. 저장하지 못해도(용량·차단) 점검 자체는 계속되므로 오류를 던지지 않고 false를 돌려준다. */
export async function writePlausibilitySummary(
  store: Pick<PlausibilitySummaryStore, "set">,
  projectId: string,
  snapshot: PlausibilitySummarySnapshot,
  target?: PlausibilitySummaryEventTarget,
): Promise<boolean> {
  if (!projectId.trim()) return false;
  try {
    await store.set(plausibilitySummaryKey(projectId), JSON.stringify(snapshot));
  } catch {
    return false;
  }
  target?.dispatchEvent(new CustomEvent<PlausibilitySummaryEventDetail>(STUDIO_PLAUSIBILITY_SUMMARY_UPDATED_EVENT, { detail: { projectId, snapshot } }));
  return true;
}

let sharedStore: Promise<PlausibilitySummaryStore> | null = null;

/**
 * 제품의 요약 저장소. 처음 부를 때 공용 SQLite를 열고 전용 이름 공간의 저장소를 돌려준다. 열지 못하면
 * 다음 호출에서 다시 시도할 수 있도록 실패를 기억하지 않는다.
 */
export function acquireProductPlausibilitySummaryStore(): Promise<PlausibilitySummaryStore> {
  sharedStore ??= import("../../studio-local-database-runtime")
    .then(({ acquireStudioLocalDatabase }) => acquireStudioLocalDatabase())
    .then((database) => database.asAsyncKeyValueStore(STUDIO_PLAUSIBILITY_SUMMARY_NAMESPACE))
    .catch((error: unknown) => {
      sharedStore = null;
      throw error;
    });
  return sharedStore;
}

export function resetPlausibilitySummaryStoreForTests(): void {
  sharedStore = null;
}

export interface PlausibilitySummaryText {
  readonly ko: string;
  readonly en: string;
}

/**
 * 준비도 패널에 한 줄로 보여 줄 문장. 점검한 적이 없으면 권장 안내를 보여 주고, 아직 읽는 중이거나 읽지
 * 못했으면(`undefined`) 점검 여부를 단정하지 않는다. 시각 표기는 호출하는 쪽 로케일에 맡긴다(순수 함수라서
 * 시각 함수를 받는다).
 */
export function describePlausibilitySummary(
  snapshot: PlausibilitySummarySnapshot | null | undefined,
  formatTime: (iso: string, locale: "ko" | "en") => string,
): PlausibilitySummaryText {
  if (snapshot === undefined) {
    return {
      ko: "개연성 점검 · 이야기가 앞뒤가 맞는지 확인해 보세요 (권장 · 출시를 막지 않아요)",
      en: "Story plausibility review · check that your story holds together (recommended, never blocks publishing)",
    };
  }
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
