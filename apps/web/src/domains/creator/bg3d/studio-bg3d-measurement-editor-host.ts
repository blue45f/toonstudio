import {
  applyStudioBg3dMeasurementDocument,
  type StudioBg3dMeasurementCommandHost,
  type StudioBg3dMeasurementCommandResult,
} from "./studio-bg3d-measurement-command";
import type { StudioBg3dMeasurementDocument } from "./studio-bg3d-measurement";
import { isStudioBg3dPhysicsTransientPhase, type StudioBg3dPhysicsPhase } from "./studio-bg3d-physics-ui";

export type StudioBg3dMeasurementEditorHost = Partial<StudioBg3dMeasurementCommandHost> & {
  readonly physicsPhaseRef?: { readonly current: StudioBg3dPhysicsPhase };
  readonly sceneRestoreAbortRef?: { readonly current: AbortController | null };
};

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("현재 장면의 가이드 편집 연결을 읽을 수 없습니다.");
  return value;
}

/** 렌더 시점 값을 복사하지 않고 호출 시점의 장면과 잠금을 명령에 전달한다. */
export function commitStudioBg3dMeasurementEditorDocument(
  host: StudioBg3dMeasurementEditorHost,
  next: StudioBg3dMeasurementDocument,
  expectedCurrent: StudioBg3dMeasurementDocument,
): StudioBg3dMeasurementCommandResult {
  if (!host.physicsRuntimeSourceRef || !host.attachmentByStorageModelIdRef
    || !host.captureInFlightRef || !host.modalAssetSessionRef
    || !host.commitImmediateHistoryTransition || !host.replaceCanonicalDocumentState) {
    return { ok: false, code: "scene-unavailable", messageKo: "장면 준비가 끝난 뒤 가이드를 변경해 주세요." };
  }
  const live: StudioBg3dMeasurementCommandHost = {
    get open() { return host.open === true; },
    get modelRenderer() { return host.modelRenderer; },
    get isRestoringScene() {
      return host.isRestoringScene === true || host.sceneRestoreAbortRef?.current != null;
    },
    get isCapturing() { return host.isCapturing === true; },
    get isBatchRenderingShots() { return host.isBatchRenderingShots === true; },
    get physicsInteractionLocked() {
      return host.physicsInteractionLocked === true || (host.physicsPhaseRef !== undefined
        && isStudioBg3dPhysicsTransientPhase(host.physicsPhaseRef.current));
    },
    get captureInFlightRef() { return required(host.captureInFlightRef); },
    get physicsRuntimeSourceRef() { return required(host.physicsRuntimeSourceRef); },
    get modalAssetSessionRef() { return required(host.modalAssetSessionRef); },
    get attachmentByStorageModelIdRef() { return required(host.attachmentByStorageModelIdRef); },
    commitImmediateHistoryTransition(...args) {
      required(host.commitImmediateHistoryTransition).call(host, ...args);
    },
    replaceCanonicalDocumentState(mutation) {
      return required(host.replaceCanonicalDocumentState).call(host, mutation);
    },
  };
  return applyStudioBg3dMeasurementDocument(live, { expectedCurrent, next });
}
