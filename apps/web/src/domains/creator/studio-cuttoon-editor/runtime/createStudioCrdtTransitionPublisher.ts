import {
  canMirrorStudioOfflinePendingStrokeTransition,
  stageStudioOfflineSceneTransition,
} from "../../offline-branch/studio-offline-host-integration";

import { resolveStudioCrdtScenePublishNotice } from "../../status-i18n/studio-producer-error-i18n-live-crdt";

import type { StudioCrdtDocument } from "../../live/studio-crdt-document";
import type { StudioCrdtSceneGraphRuntime } from "../../live/StudioLiveCollaborationProvider";
import type { PageState } from "../../studio-page-state";

export interface StudioCrdtTransitionPublisherInput {
  readonly actorId: string | null;
  readonly automaticRasterPublicationEnabled: boolean;
  readonly getDocument: () => StudioCrdtDocument | null;
  readonly getRuntime: () => StudioCrdtSceneGraphRuntime | null;
  readonly reportError: (message: string) => void;
  readonly reportNotice: (message: string) => void;
}

export interface StudioCrdtTransitionPublisher {
  readonly publishSceneTransition: (
    previousPages: readonly PageState[],
    nextPages: readonly PageState[],
    registerNewDraws?: boolean,
    offlineRealtimeStrokeIds?: readonly string[],
  ) => boolean;
  readonly publishHistoryTransition: (
    previousPages: readonly PageState[],
    nextPages: readonly PageState[],
    offlineRealtimeStrokeIds?: readonly string[],
  ) => boolean;
}

export function createStudioCrdtTransitionPublisher(
  input: StudioCrdtTransitionPublisherInput,
): StudioCrdtTransitionPublisher {
  const publishSceneTransition = (
    previousPages: readonly PageState[],
    nextPages: readonly PageState[],
    registerNewDraws = true,
    offlineRealtimeStrokeIds: readonly string[] = [],
  ): boolean => {
    const document = input.getDocument();
    const runtime = input.getRuntime();
    const stagedOffline = stageStudioOfflineSceneTransition(
      runtime,
      previousPages,
      nextPages,
      input.reportNotice,
      input.reportError,
    );
    const mirrorOfflinePendingStroke = stagedOffline === true
      && canMirrorStudioOfflinePendingStrokeTransition(
        runtime,
        previousPages,
        nextPages,
        offlineRealtimeStrokeIds,
      );
    if (stagedOffline !== null && !mirrorOfflinePendingStroke) return stagedOffline;
    if (!document && !runtime) return true;
    if (!document || !runtime) return false;
    try {
      if (input.automaticRasterPublicationEnabled && input.actorId) {
        runtime.publishRasterHistoryTransition({
          document,
          previousPages,
          nextPages,
          actorId: input.actorId,
        });
      }
      runtime.publish(document, previousPages, nextPages, { registerNewDraws });
      return true;
    } catch (cause) {
      // A4 D4 (R13): scene·page-bridge 구조화 오류는 표시 지점인 여기서 해석한다(설계 §3.2·§3.6).
      input.reportError(resolveStudioCrdtScenePublishNotice(cause));
      return false;
    }
  };

  const publishHistoryTransition = (
    previousPages: readonly PageState[],
    nextPages: readonly PageState[],
    offlineRealtimeStrokeIds: readonly string[] = [],
  ): boolean => publishSceneTransition(
    previousPages,
    nextPages,
    false,
    offlineRealtimeStrokeIds,
  );

  return { publishHistoryTransition, publishSceneTransition };
}
