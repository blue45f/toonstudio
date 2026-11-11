import { describe, expect, it } from "vitest";

import { studioProjectBackupUnavailableReason, type StudioProjectBackupReadiness } from "../save-first/backup-readiness";
import { shouldShowStudioCinematicCanvasWelcome } from "./studio-cinematic-canvas-welcome-visibility";

const ready: StudioProjectBackupReadiness = { documentKey: "local:current", workHydrated: true, autosaveChecked: true, autosaveCheckedDocumentKey: "local:current", autosaveCheckFailed: false, hasAutosave: false };
function visible(state: StudioProjectBackupReadiness, elementCount = 0) {
  return shouldShowStudioCinematicCanvasWelcome({ elementCount, canvasStartGuideReady: studioProjectBackupUnavailableReason(state) === null, sourceHydrationPending: false, workHydrationFailed: false, collaborationDocumentUnavailable: false, joinedStudioLiveJam: false });
}

describe("로컬 그림 확인과 시작 안내", () => {
  it.each([
    { ...ready, autosaveChecked: false, autosaveCheckedDocumentKey: null },
    { ...ready, autosaveCheckedDocumentKey: "local:previous" },
    { ...ready, autosaveCheckFailed: true },
    { ...ready, hasAutosave: true },
    { ...ready, workHydrated: false },
  ])("확인 중·실패·복구 대기의 임시 빈 페이지를 새 그림으로 안내하지 않는다", (state) => {
    expect(visible(state)).toBe(false);
  });
  it("확인을 마친 새 빈 그림은 안내하고, 복원한 실제 내용에는 다시 안내하지 않는다", () => {
    expect(visible(ready)).toBe(true);
    expect(visible(ready, 1)).toBe(false);
  });
});
