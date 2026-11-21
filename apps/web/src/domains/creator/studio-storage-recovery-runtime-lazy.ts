/**
 * 저장 실패·권위 저하 복구 런타임의 지연 경계.
 * 정상 저장 경로에서는 OPFS/자동저장 오류 사전을 로드하지 않고 신뢰성 채널만 정리한다.
 */
import { createStudioIntentLazyLoader } from "./studio-intent-lazy-loader";
import {
  clearStudioReliabilityChannel,
  getStudioReliabilityStatusSnapshot,
  resolveStudioSafeModeReason,
} from "./studio-reliability-status-store";

const storageRecoveryLoader = createStudioIntentLazyLoader(
  () => import("./studio-storage-recovery-runtime"),
);

export function noteStudioSaveSucceeded(
  authority: "opfs-journal" | "sqlite-fallback" = "opfs-journal",
): void {
  void authority;
  clearStudioReliabilityChannel("save");
  const snapshot = getStudioReliabilityStatusSnapshot();
  if (snapshot.safeMode.reasons.includes("storage-pressure")) {
    resolveStudioSafeModeReason("storage-pressure");
  }
  if (snapshot.storage?.level === "failed") {
    clearStudioReliabilityChannel("storage");
  }
}

export function reportStudioAutosaveFailure(cause: unknown): Promise<void> {
  return storageRecoveryLoader.load().then(
    (mod) => mod.reportStudioAutosaveFailure(cause),
    () => undefined,
  );
}

export function reportStudioSaveAuthorityDegraded(cause: unknown): void {
  void storageRecoveryLoader.load().then(
    (mod) => { mod.reportStudioSaveAuthorityDegraded(cause); },
    () => undefined,
  );
}
