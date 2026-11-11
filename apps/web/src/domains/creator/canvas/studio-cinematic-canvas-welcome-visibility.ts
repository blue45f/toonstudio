export interface StudioCinematicCanvasWelcomeVisibilityInput {
  readonly elementCount: number;
  readonly canvasStartGuideReady: boolean;
  readonly sourceHydrationPending: boolean;
  readonly workHydrationFailed: boolean;
  readonly collaborationDocumentUnavailable: boolean;
  readonly joinedStudioLiveJam: boolean;
}

/** 로컬 정본 확인 전과 공동 작업 중에는 임시 빈 페이지를 새 그림으로 안내하지 않는다. */
export function shouldShowStudioCinematicCanvasWelcome({
  elementCount,
  canvasStartGuideReady,
  sourceHydrationPending,
  workHydrationFailed,
  collaborationDocumentUnavailable,
  joinedStudioLiveJam,
}: StudioCinematicCanvasWelcomeVisibilityInput): boolean {
  return canvasStartGuideReady && elementCount === 0
    && !sourceHydrationPending
    && !workHydrationFailed
    && !collaborationDocumentUnavailable
    && !joinedStudioLiveJam;
}
