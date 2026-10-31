/** main의 실패·완료 안내를 호출 시점 언어로 해소한다. 순수 Worker·커널에는 번역 모듈을 넣지 않는다. */
import { translateNow } from "@/shared/lib/i18n";

import type { StudioBoundaryChordWorkspaceErrorCode } from "./studio-hybrid-dcc-boundary-chord-workspace";
import type { StudioBoundaryChordWorkerErrorCode } from "./studio-hybrid-dcc-boundary-chord-worker-client";

type MessageCode = StudioBoundaryChordWorkspaceErrorCode | StudioBoundaryChordWorkerErrorCode;
export const STUDIO_BOUNDARY_CHORD_MESSAGE_KEYS = Object.freeze({
  "invalid-source": "studio.bg3dScene.boundaryChord.errors.invalidSource",
  "stale-source": "studio.bg3dScene.boundaryChord.errors.staleSource",
  "selection-stale": "studio.bg3dScene.boundaryChord.errors.selectionStale",
  "stale-hit": "studio.bg3dScene.boundaryChord.errors.staleHit",
  "outside-face": "studio.bg3dScene.boundaryChord.errors.outsideFace",
  "invalid-projection": "studio.bg3dScene.boundaryChord.errors.invalidProjection",
  "outside-view": "studio.bg3dScene.boundaryChord.errors.outsideView",
  "outside-boundary": "studio.bg3dScene.boundaryChord.errors.outsideBoundary",
  "degenerate-projection": "studio.bg3dScene.boundaryChord.errors.degenerateProjection",
  "untrusted-endpoint": "studio.bg3dScene.boundaryChord.errors.untrustedEndpoint",
  "stale-endpoint": "studio.bg3dScene.boundaryChord.errors.staleEndpoint",
  "unsupported-uv": "studio.bg3dScene.boundaryChord.errors.unsupportedUv",
  "unsupported-source": "studio.bg3dScene.boundaryChord.errors.unsupportedSource",
  "unsupported-face": "studio.bg3dScene.boundaryChord.errors.unsupportedFace",
  "invalid-anchor": "studio.bg3dScene.boundaryChord.errors.invalidAnchor",
  "degenerate-chord": "studio.bg3dScene.boundaryChord.errors.degenerateChord",
  "budget-exceeded": "studio.bg3dScene.boundaryChord.errors.budgetExceeded",
  "invalid-result": "studio.bg3dScene.boundaryChord.errors.invalidResult",
  "unsupported-uv-mapping": "studio.bg3dScene.boundaryChord.errors.unsupportedUvMapping",
  "unsupported-uv-precision": "studio.bg3dScene.boundaryChord.errors.unsupportedUvPrecision",
  "aborted": "studio.bg3dScene.boundaryChord.errors.aborted",
  "stale-preview": "studio.bg3dScene.boundaryChord.errors.stalePreview",
  "untrusted-plan": "studio.bg3dScene.boundaryChord.errors.untrustedPlan",
  "selection-required": "studio.bg3dScene.boundaryChord.errors.selectionRequired",
  "timeout": "studio.bg3dScene.boundaryChord.errors.timeout",
  "protocol": "studio.bg3dScene.boundaryChord.errors.protocol",
  "invalid-input": "studio.bg3dScene.boundaryChord.errors.invalidInput",
  "worker-unavailable": "studio.bg3dScene.boundaryChord.errors.workerUnavailable",
  "worker-failed": "studio.bg3dScene.boundaryChord.errors.workerFailed",
  "cleanup-failed": "studio.bg3dScene.boundaryChord.errors.cleanupFailed"
}) satisfies Readonly<Record<MessageCode, string>>;
const NOTICE_KEYS = Object.freeze({
  "applied": "studio.bg3dScene.boundaryChord.notice.applied",
  "contextChanged": "studio.bg3dScene.boundaryChord.notice.contextChanged",
  "otherEdit": "studio.bg3dScene.boundaryChord.notice.otherEdit",
  "applyUnconfirmed": "studio.bg3dScene.boundaryChord.notice.applyUnconfirmed",
  "cancelled": "studio.bg3dScene.boundaryChord.notice.cancelled",
  "displayFailed": "studio.bg3dScene.boundaryChord.notice.displayFailed",
  "preparationFailed": "studio.bg3dScene.boundaryChord.notice.preparationFailed",
  "applyFailed": "studio.bg3dScene.boundaryChord.notice.applyFailed"
});

export function studioBoundaryChordMessage(code: MessageCode): string {
  return translateNow(STUDIO_BOUNDARY_CHORD_MESSAGE_KEYS[code]);
}
export function studioBoundaryChordNotice(name: keyof typeof NOTICE_KEYS): string {
  return translateNow(NOTICE_KEYS[name]);
}
export function studioBoundaryChordCommandLabel(): string {
  return translateNow("studio.bg3dScene.boundaryChord.title");
}
