/**
 * 개연성 점검을 화면에서 실행하는 훅.
 *
 * 문서·범위·다시 점검 신호가 바뀔 때마다 점검을 새로 돌린다. 새 결과가 오기 전에는 이전 리포트를 그대로
 * 보여 주고(깜빡임 없음) `refreshing`만 켠다. 이전 실행은 취소하고 늦게 온 결과는 버린다.
 */
import { useEffect, useMemo, useState } from "react";

import type { StudioProjectDiagnosticSourceStorage } from "../../studio-project-diagnostic-source-store";
import type { StoryworldAnalysisResult, StoryworldProject } from "../studio-storyworld-causality";
import type { StoryworldContinuityIssue } from "../studio-storyworld-continuity";
import { storyworldManuscriptStore } from "./studio-story-manuscript-store";
import { runPlausibilityCheck, type PlausibilityRunDeps } from "./studio-story-plausibility-run";
import { acquireProductPlausibilitySummaryStore } from "./studio-story-plausibility-summary";
import type { PlausibilityReport } from "./studio-story-plausibility-types";

export type PlausibilityCheckStatus = "loading" | "ready" | "error";

export interface PlausibilityCheckState {
  readonly status: PlausibilityCheckStatus;
  readonly report: PlausibilityReport | null;
  readonly notices: readonly string[];
  readonly manuscripts: ReadonlyMap<string, string>;
  /** 작가에게 보여 줄 오류 문장. status가 error일 때만 있다. */
  readonly error: string | null;
  /** 이전 리포트를 보여 주면서 새 점검을 돌리는 중. */
  readonly refreshing: boolean;
}

const EMPTY_MANUSCRIPTS: ReadonlyMap<string, string> = new Map();

const INITIAL_STATE: PlausibilityCheckState = {
  status: "loading",
  report: null,
  notices: [],
  manuscripts: EMPTY_MANUSCRIPTS,
  error: null,
  refreshing: true,
};

function browserStorage(): StudioProjectDiagnosticSourceStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** 실제 환경의 의존성: 시스템 시계, 이 브라우저의 읽기용 저장소, 이 기기의 원고 사본 보관소와 점검 요약 저장소. */
export function defaultPlausibilityRunDeps(): PlausibilityRunDeps {
  return {
    now: () => new Date(),
    storage: browserStorage(),
    loadManuscript: (scopeKey, copyId) => storyworldManuscriptStore.load(scopeKey, copyId),
    acquireSummaryStore: acquireProductPlausibilitySummaryStore,
  };
}

export function friendlyPlausibilityError(caught: unknown): string {
  const detail = caught instanceof Error && caught.message ? ` (${caught.message})` : "";
  return `점검을 마치지 못했어요. 저장된 설정은 그대로예요. 잠시 뒤 다시 시도해 주세요.${detail}`;
}

export interface UsePlausibilityCheckInput {
  readonly project: StoryworldProject;
  readonly workId: string | null;
  readonly scopeKey: string;
  /** null이면 전체. */
  readonly scopeSceneIds: readonly string[] | null;
  readonly analysis?: StoryworldAnalysisResult;
  readonly continuityIssues?: readonly StoryworldContinuityIssue[];
  /** 올리면 같은 문서로 다시 점검한다(외부 출처를 다시 읽는다). */
  readonly nonce: number;
  readonly deps?: PlausibilityRunDeps;
}

export function usePlausibilityCheck(input: UsePlausibilityCheckInput): PlausibilityCheckState {
  const { project, workId, scopeKey, scopeSceneIds, analysis, continuityIssues, nonce } = input;
  const fallbackDeps = useMemo(() => defaultPlausibilityRunDeps(), []);
  const deps = input.deps ?? fallbackDeps;
  const [state, setState] = useState<PlausibilityCheckState>(INITIAL_STATE);

  useEffect(() => {
    const controller = new AbortController();
    setState((previous) => ({ ...previous, refreshing: true, ...(previous.report ? {} : { status: "loading" as const }) }));
    runPlausibilityCheck(
      {
        project,
        workId,
        scopeKey,
        scopeSceneIds,
        signal: controller.signal,
        ...(analysis ? { analysis } : {}),
        ...(continuityIssues ? { continuityIssues } : {}),
      },
      deps,
    ).then((result) => {
      if (controller.signal.aborted) return;
      setState({
        status: "ready",
        report: result.report,
        notices: result.notices,
        manuscripts: result.manuscripts,
        error: null,
        refreshing: false,
      });
    }).catch((caught: unknown) => {
      if (controller.signal.aborted) return;
      setState((previous) => ({
        ...previous,
        status: "error",
        error: friendlyPlausibilityError(caught),
        refreshing: false,
      }));
    });
    return () => controller.abort();
  }, [project, workId, scopeKey, scopeSceneIds, analysis, continuityIssues, nonce, deps]);

  return state;
}
