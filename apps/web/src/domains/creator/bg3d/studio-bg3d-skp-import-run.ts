/**
 * .skp 가져오기 한 번(한 번의 파일 선택)의 실행 묶음 — 가져오기 액션과 화면 저장소 사이의 접합부.
 *
 * 액션은 시작할 때 begin 으로 옵션을 받아 변환 파이프라인에 넘기고, 끝날 때(성공·실패·취소 모두) complete 를
 * 한 번 부른다. 이 모듈이 변환 보고서를 모아 두었다가 결과 화면에 게시하고, 가져오기가 성공했다면 보고서를
 * 자산 메타데이터에 기록한다. 액션이 SKP 세부를 몰라도 되게 하고, 화면 저장소·기록 모듈은 주입해 테스트한다.
 */

import { persistStudioBg3dSkpAssetMetadata } from "./studio-bg3d-skp-asset-metadata";
import { studioBg3dSkpImportSession } from "./studio-bg3d-skp-import-session";

import type {
  StudioBg3dSkpImportedAsset,
  StudioBg3dSkpMetadataStatus,
} from "./studio-bg3d-skp-asset-metadata";
import type { StudioBg3dSkpImportOptions, StudioBg3dSkpReportEvent } from "./studio-bg3d-skp-import";
import type { StudioBg3dSkpImportReport } from "./studio-bg3d-skp-import-report";
import type { StudioBg3dSkpImportSession, StudioBg3dSkpResultInput } from "./studio-bg3d-skp-import-session";

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
    }];
  });
}

export interface StudioBg3dSkpImportRun {
  /** convertStudioBg3dModelFilesToGlb 의 skp 옵션. */
  readonly options: StudioBg3dSkpImportOptions;
  /** 가져오기가 끝났을 때 한 번 부른다. 어떤 경우에도 던지지 않는다. */
  readonly complete: (outcome: StudioBg3dSkpImportOutcome) => Promise<void>;
}

export interface StudioBg3dSkpImportRunDeps {
  readonly session?: StudioBg3dSkpImportSession;
  readonly persist?: (
    asset: StudioBg3dSkpImportedAsset,
    report: StudioBg3dSkpImportReport,
  ) => Promise<StudioBg3dSkpMetadataStatus>;
}

const NOT_SAVED_REASON = "이번 가져오기에서 저장되지 않았습니다.";

export function beginStudioBg3dSkpImportRun(deps: StudioBg3dSkpImportRunDeps = {}): StudioBg3dSkpImportRun {
  const session = deps.session ?? studioBg3dSkpImportSession;
  const persist = deps.persist ?? ((asset, report) => persistStudioBg3dSkpAssetMetadata(asset, report));
  const reports: StudioBg3dSkpReportEvent[] = [];

  const resultFor = async (
    event: StudioBg3dSkpReportEvent,
    outcome: StudioBg3dSkpImportOutcome,
  ): Promise<StudioBg3dSkpResultInput> => {
    const asset = outcome.status === "imported"
      ? collectStudioBg3dSkpImportedAssets(outcome.records, outcome.sourcePaths)
        .find((candidate) => candidate.sourcePath === event.sourcePath)
      : undefined;
    // 여러 파일을 함께 가져오다 실패하면 모두 저장되지 않는다. 사유가 다른 파일의 것일 수 있어 그렇게 밝힌다.
    const failureReason = outcome.status === "failed"
      ? (reports.length > 1 ? `함께 선택한 파일과 같이 저장되지 않았습니다 — ${outcome.reason}` : outcome.reason)
      : NOT_SAVED_REASON;
    if (asset) {
      let metadata: StudioBg3dSkpMetadataStatus;
      try {
        metadata = await persist(asset, event.report);
      } catch {
        metadata = "failed";
      }
      return { sourceName: event.sourceName, report: event.report, status: "imported", reason: null, metadata };
    }
    return {
      sourceName: event.sourceName,
      report: event.report,
      status: "not-imported",
      reason: failureReason,
      metadata: "skipped",
    };
  };

  return {
    options: {
      resolveUnit: (request, signal) => session.requestUnit(request, signal),
      onStage: (event) => session.setActivity({ sourceName: event.sourceName, progress: event.progress }),
      onReport: (event) => {
        reports.push(event);
      },
    },
    async complete(outcome) {
      session.setActivity(null);
      if (reports.length === 0 || outcome.status === "abandoned") return;
      const inputs: StudioBg3dSkpResultInput[] = [];
      for (const event of reports) inputs.push(await resultFor(event, outcome));
      session.publishResults(inputs);
    },
  };
}
