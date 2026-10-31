/** 치유의 실패·완료 안내는 호출 시점 언어를 사용하며 Worker에는 번역 모듈을 넣지 않는다. */
import { translateNow } from "@/shared/lib/i18n";

import { StudioCoplanarEdgeDissolveWorkspaceError, type StudioCoplanarEdgeDissolveWorkspaceFailureCode } from "./studio-hybrid-dcc-coplanar-edge-dissolve-workspace";
import { StudioCoplanarEdgeDissolveWorkerError, type StudioCoplanarEdgeDissolveWorkerErrorCode } from "./studio-hybrid-dcc-coplanar-edge-dissolve-worker-client";

type MessageCode = StudioCoplanarEdgeDissolveWorkspaceFailureCode | StudioCoplanarEdgeDissolveWorkerErrorCode;
export const STUDIO_COPLANAR_EDGE_DISSOLVE_MESSAGE_KEYS = Object.freeze({
  "invalid-source": "studio.bg3dScene.coplanarEdgeHeal.errors.invalidSource",
  "stale-source": "studio.bg3dScene.coplanarEdgeHeal.errors.staleSource",
  "invalid-selection": "studio.bg3dScene.coplanarEdgeHeal.errors.invalidSelection",
  "non-manifold": "studio.bg3dScene.coplanarEdgeHeal.errors.nonManifold",
  "non-coplanar": "studio.bg3dScene.coplanarEdgeHeal.errors.nonCoplanar",
  "unselected-seam": "studio.bg3dScene.coplanarEdgeHeal.errors.unselectedSeam",
  "unsupported-boundary": "studio.bg3dScene.coplanarEdgeHeal.errors.unsupportedBoundary",
  "attribute-conflict": "studio.bg3dScene.coplanarEdgeHeal.errors.attributeConflict",
  "unsupported-uv": "studio.bg3dScene.coplanarEdgeHeal.errors.unsupportedUv",
  "unsupported-normal-field": "studio.bg3dScene.coplanarEdgeHeal.errors.unsupportedNormalField",
  "unrenderable-source": "studio.bg3dScene.coplanarEdgeHeal.errors.unrenderableSource",
  "unrenderable-result": "studio.bg3dScene.coplanarEdgeHeal.errors.unrenderableResult",
  "budget-exceeded": "studio.bg3dScene.coplanarEdgeHeal.errors.budgetExceeded",
  "invalid-result": "studio.bg3dScene.coplanarEdgeHeal.errors.invalidResult",
  "aborted": "studio.bg3dScene.coplanarEdgeHeal.errors.aborted",
  "stale-context": "studio.bg3dScene.coplanarEdgeHeal.errors.staleContext",
  "invalid-plan": "studio.bg3dScene.coplanarEdgeHeal.errors.invalidPlan",
  "plan-already-attempted": "studio.bg3dScene.coplanarEdgeHeal.errors.planAlreadyAttempted",
  "timeout": "studio.bg3dScene.coplanarEdgeHeal.errors.timeout",
  "protocol": "studio.bg3dScene.coplanarEdgeHeal.errors.protocol",
  "invalid-input": "studio.bg3dScene.coplanarEdgeHeal.errors.invalidInput",
  "worker-unavailable": "studio.bg3dScene.coplanarEdgeHeal.errors.workerUnavailable",
  "worker-failed": "studio.bg3dScene.coplanarEdgeHeal.errors.workerFailed",
  "cleanup-failed": "studio.bg3dScene.coplanarEdgeHeal.errors.cleanupFailed",
}) satisfies Readonly<Record<MessageCode, string>>;

const NOTICE_KEYS = Object.freeze({
  applied: "studio.bg3dScene.coplanarEdgeHeal.notice.applied",
  contextChanged: "studio.bg3dScene.coplanarEdgeHeal.notice.contextChanged",
  otherEdit: "studio.bg3dScene.coplanarEdgeHeal.notice.otherEdit",
  applyUnconfirmed: "studio.bg3dScene.coplanarEdgeHeal.notice.applyUnconfirmed",
  cancelled: "studio.bg3dScene.coplanarEdgeHeal.notice.cancelled",
  displayFailed: "studio.bg3dScene.coplanarEdgeHeal.notice.displayFailed",
  preparationFailed: "studio.bg3dScene.coplanarEdgeHeal.notice.preparationFailed",
  applyFailed: "studio.bg3dScene.coplanarEdgeHeal.notice.applyFailed",
});

export function studioCoplanarEdgeDissolveError(cause: unknown): string {
  if (cause instanceof StudioCoplanarEdgeDissolveWorkspaceError || cause instanceof StudioCoplanarEdgeDissolveWorkerError) {
    return translateNow(STUDIO_COPLANAR_EDGE_DISSOLVE_MESSAGE_KEYS[cause.code]);
  }
  return studioCoplanarEdgeDissolveNotice("preparationFailed");
}

export function studioCoplanarEdgeDissolveNotice(name: keyof typeof NOTICE_KEYS): string {
  return translateNow(NOTICE_KEYS[name]);
}

export function studioCoplanarEdgeDissolveCommandLabel(): string {
  return translateNow("studio.bg3dScene.coplanarEdgeHeal.title");
}
