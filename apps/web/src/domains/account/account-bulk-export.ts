import { readStudioProjectDocuments } from "@/domains/creator/studio-project-document-store";
import { readStudioProjectLibrary } from "@/domains/creator/studio-project-library-store";
import { buildStudioProjectPackageWithWorkspace } from "@/domains/creator/save-first/studio-project-package-with-workspace";
import { writeStudioProjectPackageToTarget } from "@/domains/creator/save-first/studio-project-package";
import { studioSaveProfileForProject } from "@/domains/creator/save-first/studio-save-profile";
import { studioSubmissionsForProject } from "@/domains/creator/save-first/studio-submission-store";

import {
  ACCOUNT_BULK_EXPORT_MARKER_KEY,
  parseAccountProjectInventory,
  planBulkProjectExport,
  serializeBulkExportMarker,
  summarizeBulkExportOutcomes,
  STUDIO_PROJECT_LIBRARY_STORAGE_KEY_FOR_PORTABILITY,
  type AccountBulkExportMarker,
  type AccountPortabilityProject,
  type BulkExportOutcome,
  type BulkExportSummary,
  type BulkProjectExportPlan,
} from "./account-data-portability";

/**
 * 작품 일괄 다운로드 실행기 (G4).
 *
 * 작품 1개 내보내기와 같은 패키지(.toonstudio — 원고 스냅샷 포함)를 작품마다
 * 만들어 브라우저 다운로드로 내보낸다. 파일 선택 창을 작품 수만큼 띄우지
 * 않기 위해 저장은 download 타깃으로 고정한다.
 *
 * 정직성 규칙: 한 작품이 실패해도 나머지는 계속 시도하고, 결과는 성공/실패를
 * 나눠 보고한다. 완료 표식(marker)은 실행이 끝난 사실 그대로(실패 수 포함)
 * 기록하므로, 부분 실패를 "백업 완료"로 오인해 탈퇴 게이트가 열리는 일이 없다.
 */

export interface BulkExportDeps {
  readonly exportOne: (project: AccountPortabilityProject) => Promise<{ readonly fileName: string }>;
  readonly onProgress?: (done: number, total: number, last: BulkExportOutcome) => void;
}

/** 계획 순서대로 1개씩 실행한다. 실패는 outcome으로 모으고 던지지 않는다. */
export async function runBulkProjectExport(
  plan: BulkProjectExportPlan,
  deps: BulkExportDeps,
): Promise<readonly BulkExportOutcome[]> {
  const outcomes: BulkExportOutcome[] = [];
  for (const project of plan.items) {
    let outcome: BulkExportOutcome;
    try {
      const { fileName } = await deps.exportOne(project);
      outcome = Object.freeze({ projectId: project.id, title: project.title, ok: true, fileName, error: null });
    } catch (err) {
      outcome = Object.freeze({
        projectId: project.id,
        title: project.title,
        ok: false,
        fileName: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    outcomes.push(outcome);
    deps.onProgress?.(outcomes.length, plan.items.length, outcome);
  }
  return Object.freeze(outcomes);
}

export interface DownloadAllStudioProjectsResult {
  readonly plan: BulkProjectExportPlan;
  readonly outcomes: readonly BulkExportOutcome[];
  readonly summary: BulkExportSummary;
  readonly marker: AccountBulkExportMarker;
}

const MULTI_DOWNLOAD_GAP_MS = 350;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

/**
 * 이 기기의 작품 전체(또는 onlyIds)를 일괄 다운로드하고 완료 표식을 남긴다.
 * 표식 저장은 부수효과라 실패해도 다운로드 결과 자체는 반환한다.
 */
export async function downloadAllStudioProjects(input: {
  readonly storage: Storage;
  readonly authUserId?: string | null;
  readonly onlyIds?: readonly string[];
  readonly now?: string;
  readonly onProgress?: (done: number, total: number, last: BulkExportOutcome) => void;
}): Promise<DownloadAllStudioProjectsResult> {
  const { storage } = input;
  const inventory = parseAccountProjectInventory(
    storage.getItem(STUDIO_PROJECT_LIBRARY_STORAGE_KEY_FOR_PORTABILITY),
  );
  const plan = planBulkProjectExport(inventory, { onlyIds: input.onlyIds });
  const library = readStudioProjectLibrary(storage);
  const projectById = new Map(library.projects.map((project) => [project.id, project]));

  let index = 0;
  const outcomes = await runBulkProjectExport(plan, {
    onProgress: input.onProgress,
    exportOne: async (planned) => {
      if (index > 0) await sleep(MULTI_DOWNLOAD_GAP_MS);
      index += 1;
      const project = projectById.get(planned.id);
      if (!project) throw new Error("project-not-found");
      const documents = readStudioProjectDocuments(storage, project.id).documents;
      const profile = studioSaveProfileForProject(storage, project.id);
      const submissions = studioSubmissionsForProject(storage, project.id);
      const { packageResult } = await buildStudioProjectPackageWithWorkspace({
        storage,
        project,
        documents,
        profile,
        submissions,
        authUserId: input.authUserId ?? null,
      });
      await writeStudioProjectPackageToTarget(packageResult, {
        kind: "download",
        ownerWindow: window,
      });
      return { fileName: packageResult.fileName };
    },
  });

  const summary = summarizeBulkExportOutcomes(outcomes, plan.items.length);
  const marker: AccountBulkExportMarker = Object.freeze({
    exportedAt: input.now ?? new Date().toISOString(),
    successCount: summary.succeeded,
    failureCount: summary.failed,
    successIds: Object.freeze(
      outcomes.filter((outcome) => outcome.ok).map((outcome) => outcome.projectId),
    ),
  });
  try {
    storage.setItem(ACCOUNT_BULK_EXPORT_MARKER_KEY, serializeBulkExportMarker(marker));
  } catch {
    // 표식을 못 남기면 탈퇴 게이트는 닫힌 채로 남는다 — 안전한 쪽 실패.
  }
  return Object.freeze({ plan, outcomes, summary, marker });
}
