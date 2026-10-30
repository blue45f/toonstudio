/**
 * .skp 가져오기 한 번(한 번의 파일 선택)의 실행 묶음 — 가져오기 액션과 화면 저장소 사이의 접합부.
 *
 * 액션은 시작할 때 begin 으로 옵션을 받아 변환 파이프라인에 넘기고, 끝날 때(성공·실패·취소 모두) complete 를
 * 한 번 부른다. 이 모듈이 변환 보고서를 모아 두었다가 결과 화면에 게시하고, 가져오기가 성공했다면 보고서를
 * 자산 메타데이터에 기록한다. 액션이 SKP 세부를 몰라도 되게 하고, 화면 저장소·기록 모듈은 주입해 테스트한다.
 */

import { combineImportAiUseStatusLazy, hasImportAiUseLazy } from "./studio-bg3d-import-ai-use-lazy";
import { persistStudioBg3dSkpAssetMetadata } from "./studio-bg3d-skp-asset-metadata";
import { studioBg3dSkpImportSession } from "./studio-bg3d-skp-import-session";

import type {
  StudioBg3dSkpImportedAsset,
  StudioBg3dSkpMetadataStatus,
} from "./studio-bg3d-skp-asset-metadata";
import type { StudioBg3dImportAiUse, StudioBg3dImportAiUseStatus } from "./studio-bg3d-import-ai-use";
import type { StudioBg3dSkpImportOptions, StudioBg3dSkpReportEvent, StudioBg3dSkpUnitDecision } from "./studio-bg3d-skp-import";
import type { StudioBg3dSkpImportReport } from "./studio-bg3d-skp-import-report";
import type { StudioBg3dSkpActivity, StudioBg3dSkpImportSession, StudioBg3dSkpResultInput } from "./studio-bg3d-skp-import-session";

/** 검증을 마치고 저장된 라이브러리 레코드 중 이 모듈이 읽는 필드. */
export interface StudioBg3dSkpStoredRecordLike {
  readonly name: string;
  readonly contentHash: string;
  readonly byteSize: number;
  readonly validatorMetrics: { readonly triangles: number; readonly textures: number };
  readonly rights: StudioBg3dSkpImportedAsset["rights"];
}

export type StudioBg3dSkpImportOutcome =
  /**
   * 모델이 라이브러리에 저장되고 장면에 배치됐다. records 는 계획 순서의 저장 레코드이고 sourcePaths[i] 는
   * 그 레코드가 나온 .skp 원본 경로다(.skp 가 아닌 파일은 null 이라 건너뛴다).
   */
  | {
    readonly status: "imported";
    readonly records: readonly StudioBg3dSkpStoredRecordLike[];
    readonly sourcePaths: readonly (string | null)[];
    /** 가져오기 권리 폼에서 고른 AI 사용 표기. 변환 보고서와 같은 기록에 담긴다. */
    readonly aiUse?: StudioBg3dImportAiUse;
    /** 가져오기 취소 신호. 기록 저장이 이 신호에 멈춘다(저장소가 응답하지 않아도 시간 한도에서 멈춘다). */
    readonly signal?: AbortSignal;
  }
  | { readonly status: "failed"; readonly reason: string }
  /** 편집 세션이 바뀌어 결과를 보여 줄 곳이 없다. 진행 표시만 거두고 아무것도 게시하지 않는다. */
  | { readonly status: "abandoned" };

/**
 * 저장된 레코드를 가져오기 계획의 순서대로 .skp 원본 경로와 짝짓는다. sourcePaths[i] 가 null 이면
 * (.skp 가 아닌 파일) 그 레코드는 건너뛴다.
 */
export function collectStudioBg3dSkpImportedAssets(
  records: readonly StudioBg3dSkpStoredRecordLike[],
  sourcePaths: readonly (string | null)[],
  aiUse?: StudioBg3dImportAiUse,
): StudioBg3dSkpImportedAsset[] {
  return records.flatMap((record, index) => {
    const sourcePath = sourcePaths[index] ?? null;
    if (sourcePath === null) return [];
    return [{
      sourcePath,
      name: record.name,
      contentHash: record.contentHash,
      byteSize: record.byteSize,
      triangles: record.validatorMetrics.triangles,
      textures: record.validatorMetrics.textures,
      rights: record.rights,
      ...(aiUse ? { aiUse } : {}),
    }];
  });
}

export interface StudioBg3dSkpImportRun {
  /** convertStudioBg3dModelFilesToGlb 의 skp 옵션. */
  readonly options: StudioBg3dSkpImportOptions;
  /**
   * 가져오기가 끝났을 때 한 번 부른다. 어떤 경우에도 던지지 않는다. 돌려주는 값은 가져오기 권리 폼의 AI 사용 표기가
   * 보고서와 같은 기록에 어떻게 저장됐는지다(고른 답이 없었거나 저장을 시도하지 않았으면 skipped).
   */
  readonly complete: (outcome: StudioBg3dSkpImportOutcome) => Promise<StudioBg3dImportAiUseStatus>;
}

export interface StudioBg3dSkpImportRunDeps {
  readonly session?: StudioBg3dSkpImportSession;
  /** 호출자가 캡처한 modal/import generation의 UI 권위. 단순 open Boolean은 ABA를 구분하지 못한다. */
  readonly isCurrent?: () => boolean;
  readonly persist?: (
    asset: StudioBg3dSkpImportedAsset,
    report: StudioBg3dSkpImportReport,
    signal?: AbortSignal,
  ) => Promise<StudioBg3dSkpMetadataStatus>;
}

const NOT_SAVED_REASON = "이번 가져오기에서 저장되지 않았습니다.";
// 마지막 실행 표지를 지우면 먼저 시작한 실행이 되살아날 수 있어 session 수명 동안 하나를 유지한다.
const currentRuns = new WeakMap<StudioBg3dSkpImportSession, AbortController>();

export function beginStudioBg3dSkpImportRun(deps: StudioBg3dSkpImportRunDeps = {}): StudioBg3dSkpImportRun {
  const session = deps.session ?? studioBg3dSkpImportSession;
  const persist = deps.persist ?? ((asset, report, signal) => persistStudioBg3dSkpAssetMetadata(asset, report, { signal }));
  const reports: StudioBg3dSkpReportEvent[] = [];
  const questionOwner = new AbortController();
  // lazy import가 늦게 끝난 이전 modal은 현재 run의 질문·표지를 선점하지 않는다.
  if (deps.isCurrent?.() ?? true) {
    const previous = currentRuns.get(session);
    currentRuns.set(session, questionOwner);
    previous?.abort();
  }
  const ownsUi = (): boolean => currentRuns.get(session) === questionOwner && (deps.isCurrent?.() ?? true);
  let ownedActivity: StudioBg3dSkpActivity | null = null;
  let completion: Promise<StudioBg3dImportAiUseStatus> | null = null;
  let completing = false;

  const resultFor = async (
    event: StudioBg3dSkpReportEvent,
    outcome: StudioBg3dSkpImportOutcome,
  ): Promise<{ readonly input: StudioBg3dSkpResultInput; readonly aiUse: StudioBg3dImportAiUseStatus }> => {
    const asset = outcome.status === "imported"
      ? collectStudioBg3dSkpImportedAssets(outcome.records, outcome.sourcePaths, outcome.aiUse)
        .find((candidate) => candidate.sourcePath === event.sourcePath)
      : undefined;
    // 여러 파일을 함께 가져오다 실패하면 모두 저장되지 않는다. 사유가 다른 파일의 것일 수 있어 그렇게 밝힌다.
    const failureReason = outcome.status === "failed"
      ? (reports.length > 1 ? `함께 선택한 파일과 같이 저장되지 않았습니다 — ${outcome.reason}` : outcome.reason)
      : NOT_SAVED_REASON;
    if (asset) {
      let metadata: StudioBg3dSkpMetadataStatus;
      try {
        metadata = await persist(asset, event.report, outcome.status === "imported" ? outcome.signal : undefined);
      } catch {
        metadata = "failed";
      }
      return {
        input: { sourceName: event.sourceName, report: event.report, status: "imported", reason: null, metadata },
        // AI 표기는 보고서와 같은 기록에 담기므로 기록 결과가 곧 AI 표기의 결과다.
        aiUse: hasImportAiUseLazy(asset.aiUse) ? metadata : "skipped",
      };
    }
    return {
      input: {
        sourceName: event.sourceName,
        report: event.report,
        status: "not-imported",
        reason: failureReason,
        metadata: "skipped",
      },
      aiUse: "skipped",
    };
  };

  return {
    options: {
      async resolveUnit(request, signal): Promise<StudioBg3dSkpUnitDecision> {
        if (completing || !ownsUi() || signal?.aborted) return { kind: "cancel" };
        const controller = new AbortController();
        const abort = (): void => controller.abort();
        questionOwner.signal.addEventListener("abort", abort, { once: true });
        signal?.addEventListener("abort", abort, { once: true });
        try {
          if (questionOwner.signal.aborted || signal?.aborted) controller.abort();
          const decision = await session.requestUnit(request, controller.signal);
          return !completing && ownsUi() && !signal?.aborted ? decision : { kind: "cancel" };
        } finally {
          questionOwner.signal.removeEventListener("abort", abort);
          signal?.removeEventListener("abort", abort);
        }
      },
      onStage: (event) => {
        if (!completing && ownsUi()) {
          ownedActivity = { sourceName: event.sourceName, progress: event.progress };
          session.setActivity(ownedActivity);
        }
      },
      onReport: (event) => {
        // 오래된 실행이라도 이미 저장한 모델의 보고서 기록은 완료할 수 있게 유지한다.
        if (!completing) reports.push(event);
      },
    },
    complete(outcome) {
      if (completion) return completion;
      completing = true;
      const completedReports = [...reports];
      // Promise를 먼저 고정해 동기 session listener가 complete를 다시 불러도 기록을 중복하지 않는다.
      completion = Promise.resolve().then(async (): Promise<StudioBg3dImportAiUseStatus> => {
        questionOwner.abort();
        // modal 권위가 바뀌어도 자기 표시만 회수하고, 다음 run/외부가 놓은 표시는 지우지 않는다.
        if (ownedActivity !== null && session.getSnapshot().activity === ownedActivity) session.setActivity(null);
        ownedActivity = null;
        if (completedReports.length === 0 || outcome.status === "abandoned") return "skipped";
        const inputs: StudioBg3dSkpResultInput[] = [];
        let aiUse: StudioBg3dImportAiUseStatus = "skipped";
        for (const event of completedReports) {
          const result = await resultFor(event, outcome);
          inputs.push(result.input);
          aiUse = combineImportAiUseStatusLazy(aiUse, result.aiUse);
        }
        // 각 persist await 중 새 실행이 시작될 수 있다. 영속 기록과 화면 게시의 권위를 분리한다.
        if (ownsUi()) session.publishResults(inputs);
        return aiUse;
      });
      return completion;
    },
  };
}
