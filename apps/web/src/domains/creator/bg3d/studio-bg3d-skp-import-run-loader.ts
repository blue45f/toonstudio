import { StudioBg3dStaleModalOperationError } from "./studio-bg3d-modal-operation-coordinator";

import type { StudioBg3dSkpImportRun } from "./studio-bg3d-skp-import-run";

type StudioBg3dSkpImportRunModule = Pick<typeof import("./studio-bg3d-skp-import-run"), "beginStudioBg3dSkpImportRun">;
type StudioBg3dSkpImportRunLoader = () => Promise<StudioBg3dSkpImportRunModule>;

/** 지연 모듈을 기다리는 동안 교체·취소된 요청은 singleton과 변환 작업을 시작하지 않는다. */
export async function beginCurrentStudioBg3dSkpImportRun(
  isCurrent: () => boolean,
  load: StudioBg3dSkpImportRunLoader = () => import("./studio-bg3d-skp-import-run"),
): Promise<StudioBg3dSkpImportRun> {
  if (!isCurrent()) throw new StudioBg3dStaleModalOperationError();
  const runtime = await load();
  if (!isCurrent()) throw new StudioBg3dStaleModalOperationError();
  return runtime.beginStudioBg3dSkpImportRun();
}
