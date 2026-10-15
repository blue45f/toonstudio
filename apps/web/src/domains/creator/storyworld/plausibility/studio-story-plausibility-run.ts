/**
 * 개연성 점검 한 번을 실행한다: 원고 사본을 읽고, 외부 출처를 읽고, 리포트를 만든다.
 *
 * 화면이 아닌 곳에 둔 이유는 시계, 저장소, 원고 사본 보관소를 모두 주입받게 해서 네트워크나 브라우저
 * 없이 테스트하기 위해서다. 실행은 취소할 수 있고, 일부 출처를 읽지 못해도 나머지로 리포트를 만든다.
 */
import type { StudioProjectDiagnosticSourceStorage } from "../../studio-project-diagnostic-source-store";
import type { StoryworldAnalysisResult, StoryworldProject } from "../studio-storyworld-causality";
import type { StoryworldContinuityIssue } from "../studio-storyworld-continuity";
import type { ManuscriptLoadResult } from "./studio-story-manuscript-store";
import { buildPlausibilityReport } from "./studio-story-plausibility-report";
import { loadPlausibilityExtras } from "./studio-story-plausibility-sources";
import type { PlausibilitySummaryStore } from "./studio-story-plausibility-summary";
import type { PlausibilityReport } from "./studio-story-plausibility-types";

export interface PlausibilityRunDeps {
  readonly now: () => Date;
  /** 복선 장부·세계관 설정·기획·바이블을 읽는 저장소. 읽기 전용이다. */
  readonly storage: StudioProjectDiagnosticSourceStorage | null;
  readonly loadManuscript: (scopeKey: string, copyId: string) => Promise<ManuscriptLoadResult>;
  /** 준비도 패널이 읽을 점검 요약을 남길 저장소를 얻는다(공용 SQLite). 없으면 요약을 남기지 않는다. */
  readonly acquireSummaryStore?: () => Promise<PlausibilitySummaryStore>;
  readonly yieldToHost?: () => Promise<void>;
}

export interface PlausibilityRunInput {
  readonly project: StoryworldProject;
  readonly workId: string | null;
  /** 처리 기록·원고 사본을 찾는 열쇠(랩 저장 열쇠). */
  readonly scopeKey: string;
  /** null이면 전체. */
  readonly scopeSceneIds: readonly string[] | null;
  readonly analysis?: StoryworldAnalysisResult;
  readonly continuityIssues?: readonly StoryworldContinuityIssue[];
  readonly signal?: AbortSignal;
}

export interface PlausibilityRunResult {
  readonly report: PlausibilityReport;
  /** 점검하면서 알게 된 점(읽지 못한 출처, 손상된 사본). 화면에만 보이고 리포트에는 담지 않는다. */
  readonly notices: readonly string[];
  /** 장면의 원문을 다시 열 때 쓰는 사본: 사본 id → 원문. */
  readonly manuscripts: ReadonlyMap<string, string>;
}

function referencedCopyIds(project: StoryworldProject): readonly string[] {
  const ids = new Set<string>();
  for (const scene of project.scenes) {
    if (scene.disabled !== true && scene.source?.copy) ids.add(scene.source.copy);
  }
  return [...ids].sort();
}

export async function runPlausibilityCheck(
  input: PlausibilityRunInput,
  deps: PlausibilityRunDeps,
): Promise<PlausibilityRunResult> {
  const notices: string[] = [];
  const manuscripts = new Map<string, string>();
  let corrupted = 0;
  let missing = 0;
  for (const copyId of referencedCopyIds(input.project)) {
    if (input.signal?.aborted) throw new DOMException("점검을 취소했어요.", "AbortError");
    try {
      const loaded = await deps.loadManuscript(input.scopeKey, copyId);
      if (loaded.status === "ok") manuscripts.set(copyId, loaded.text);
      else if (loaded.status === "corrupted") corrupted += 1;
      else missing += 1;
    } catch {
      notices.push("원고 사본을 읽는 중 문제가 생겨 이름 표기 검사를 건너뛰었어요.");
      break;
    }
  }
  if (corrupted > 0) notices.push(`원고 사본 ${corrupted}개가 손상되어 읽지 않았어요. 원고를 다시 붙여 넣으면 복구돼요.`);
  if (missing > 0) notices.push(`원고 사본 ${missing}개를 이 기기에서 찾지 못했어요. 장면의 짧은 발췌만 볼 수 있어요.`);

  const sourced = await loadPlausibilityExtras({
    project: input.project,
    workId: input.workId,
    storage: deps.storage,
    manuscripts,
    ...(input.signal ? { signal: input.signal } : {}),
    ...(deps.yieldToHost ? { yieldToHost: deps.yieldToHost } : {}),
  });
  notices.push(...sourced.notices);

  const report = buildPlausibilityReport({
    project: input.project,
    generatedAtIso: deps.now().toISOString(),
    scopeSceneIds: input.scopeSceneIds,
    extras: sourced.extras,
    ...(input.analysis ? { analysis: input.analysis } : {}),
    ...(input.continuityIssues ? { continuityIssues: input.continuityIssues } : {}),
  });
  return { report, notices, manuscripts };
}
