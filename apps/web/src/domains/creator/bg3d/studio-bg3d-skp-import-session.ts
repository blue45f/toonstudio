/**
 * .skp 가져오기의 진행·단위 확인·결과를 가져오기 액션과 화면 사이에서 주고받는 외부 저장소.
 *
 * 에디터의 가져오기 액션(studio-bg3d-editor-model-import-actions)과 자산 라이브러리 패널은 서로
 * import 하지 않는 별도 경계라서, 둘이 같은 상태를 보려면 중간 저장소가 필요하다. 이 모듈은
 * React 에도 three.js 에도 openskp 에도 의존하지 않는 순수 TypeScript 이고, 화면은
 * useSyncExternalStore 로 구독한다. 호스트(가방) 모듈에 새 상태를 늘리지 않기 위한 선택이다.
 *
 * 규칙:
 * - 단위 질문은 화면(호스트)이 하나라도 등록돼 있을 때만 던진다. 없으면 기다리지 않고 keep 으로 답해
 *   가져오기가 응답할 사람 없이 멈추지 않게 한다(보고서에는 size-abnormal 경고가 남는다).
 * - 질문이 열린 채 취소 신호가 오거나 마지막 호스트가 사라지면 질문을 닫는다(cancel / keep).
 * - 결과는 최근 MAX_RESULTS 개만 유지한다. 영속 저장은 자산 메타데이터(skpImport)가 맡는다.
 */

import type { StudioBg3dSkpMetadataStatus } from "./studio-bg3d-skp-asset-metadata";
import type { StudioBg3dSkpStageProgress } from "./studio-bg3d-skp-contract";
import type {
  StudioBg3dSkpUnitDecision,
  StudioBg3dSkpUnitDecisionRequest,
} from "./studio-bg3d-skp-import";
import type { StudioBg3dSkpImportReport } from "./studio-bg3d-skp-import-report";
import type { StudioBg3dSkpSizeAssessment } from "./studio-bg3d-skp-unit";

export const STUDIO_BG3D_SKP_SESSION_MAX_RESULTS = 8;

export interface StudioBg3dSkpActivity {
  readonly sourceName: string;
  readonly progress: StudioBg3dSkpStageProgress;
}

export interface StudioBg3dSkpUnitQuestion {
  readonly id: number;
  readonly sourceName: string;
  readonly report: StudioBg3dSkpImportReport;
  readonly assessment: StudioBg3dSkpSizeAssessment;
}

export interface StudioBg3dSkpResultEntry {
  readonly id: string;
  readonly sourceName: string;
  readonly report: StudioBg3dSkpImportReport;
  readonly status: "imported" | "not-imported";
  /** not-imported 일 때 사용자에게 보여 줄 사유. imported 면 null. */
  readonly reason: string | null;
  readonly metadata: StudioBg3dSkpMetadataStatus;
}

export type StudioBg3dSkpResultInput = Omit<StudioBg3dSkpResultEntry, "id">;

export interface StudioBg3dSkpSessionSnapshot {
  readonly activity: StudioBg3dSkpActivity | null;
  readonly question: StudioBg3dSkpUnitQuestion | null;
  readonly results: readonly StudioBg3dSkpResultEntry[];
}

interface PendingQuestion {
  readonly id: number;
  readonly settle: (decision: StudioBg3dSkpUnitDecision) => void;
  readonly cleanup: () => void;
}

export interface StudioBg3dSkpImportSession {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => StudioBg3dSkpSessionSnapshot;
  /** 화면이 마운트됐음을 알린다. 반환된 함수로 해제한다(여러 번 호출해도 한 번만 해제된다). */
  readonly registerHost: () => () => void;
  readonly hasHost: () => boolean;
  readonly setActivity: (activity: StudioBg3dSkpActivity | null) => void;
  readonly requestUnit: (
    request: StudioBg3dSkpUnitDecisionRequest,
    signal?: AbortSignal,
  ) => Promise<StudioBg3dSkpUnitDecision>;
  /** 열린 질문(id 가 맞을 때만)에 답한다. 답이 받아들여졌으면 true. */
  readonly answerUnit: (questionId: number, decision: StudioBg3dSkpUnitDecision) => boolean;
  readonly publishResults: (inputs: readonly StudioBg3dSkpResultInput[]) => void;
  readonly dismissResult: (id: string) => void;
  readonly clearResults: () => void;
}

const EMPTY_SNAPSHOT: StudioBg3dSkpSessionSnapshot = Object.freeze({
  activity: null,
  question: null,
  results: Object.freeze([]),
});

/** 독립된 저장소 인스턴스를 만든다(앱은 아래 싱글턴 하나를 쓰고, 테스트는 각자 만든다). */
export function createStudioBg3dSkpImportSession(): StudioBg3dSkpImportSession {
  let snapshot: StudioBg3dSkpSessionSnapshot = EMPTY_SNAPSHOT;
  const listeners = new Set<() => void>();
  let hostCount = 0;
  let nextQuestionId = 1;
  let nextResultId = 1;
  let pending: PendingQuestion | null = null;

  const publish = (next: StudioBg3dSkpSessionSnapshot): void => {
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };

  const closeQuestion = (decision: StudioBg3dSkpUnitDecision): void => {
    const current = pending;
    if (!current) return;
    pending = null;
    current.cleanup();
    publish({ ...snapshot, question: null });
    current.settle(decision);
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    registerHost() {
      hostCount += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        hostCount -= 1;
        // 응답할 화면이 모두 사라졌다면 기다리지 않고 기본 해석으로 진행한다.
        if (hostCount === 0) closeQuestion({ kind: "keep" });
      };
    },
    hasHost: () => hostCount > 0,
    setActivity(activity) {
      if (snapshot.activity === activity) return;
      publish({ ...snapshot, activity });
    },
    requestUnit(request, signal) {
      if (hostCount === 0) return Promise.resolve<StudioBg3dSkpUnitDecision>({ kind: "keep" });
      // 정상 흐름에서는 파일을 하나씩 변환하므로 겹치지 않지만, 남은 질문은 취소로 정리해 둔다.
      closeQuestion({ kind: "cancel" });
      return new Promise<StudioBg3dSkpUnitDecision>((resolve) => {
        const id = nextQuestionId;
        nextQuestionId += 1;
        const onAbort = (): void => {
          if (pending?.id === id) closeQuestion({ kind: "cancel" });
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        pending = {
          id,
          settle: resolve,
          cleanup: () => signal?.removeEventListener("abort", onAbort),
        };
        publish({
          ...snapshot,
          question: {
            id,
            sourceName: request.sourceName,
            report: request.report,
            assessment: request.assessment,
          },
        });
        if (signal?.aborted) onAbort();
      });
    },
    answerUnit(questionId, decision) {
      if (!pending || pending.id !== questionId) return false;
      closeQuestion(decision);
      return true;
    },
    publishResults(inputs) {
      if (inputs.length === 0) return;
      const entries = inputs.map((input): StudioBg3dSkpResultEntry => {
        const id = `skp-result-${nextResultId}`;
        nextResultId += 1;
        return { ...input, id };
      });
      // 이번 가져오기의 결과가 (가져온 순서대로) 위에 오고, 오래된 결과는 MAX_RESULTS 를 넘으면 밀려난다.
      publish({
        ...snapshot,
        results: [...entries, ...snapshot.results].slice(0, STUDIO_BG3D_SKP_SESSION_MAX_RESULTS),
      });
    },
    dismissResult(id) {
      const results = snapshot.results.filter((entry) => entry.id !== id);
      if (results.length === snapshot.results.length) return;
      publish({ ...snapshot, results });
    },
    clearResults() {
      if (snapshot.results.length === 0) return;
      publish({ ...snapshot, results: [] });
    },
  };
}

/** 앱 전체가 공유하는 저장소. 패널과 가져오기 액션이 같은 인스턴스를 본다. */
export const studioBg3dSkpImportSession: StudioBg3dSkpImportSession = createStudioBg3dSkpImportSession();
