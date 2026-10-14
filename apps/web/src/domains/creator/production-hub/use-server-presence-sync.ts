import { useEffect, useRef } from "react";

import type { PagePresenceEntry } from "./page-edit-lock-model";
import type { LiveViewState } from "./live-view-sync-model";
import {
  applyPresenceSnapshot,
  createPresenceTransport,
  type PresenceSyncRequest,
} from "./presence-transport";
import type { ReviewSession } from "./review-session-model";

import { api } from "@/platform/api";

/** 서버 동기화 주기. 라이브 뷰 하트비트(5초)와 같아 커서 지연이 탭 간 동기화와 비슷하게 유지된다. */
export const SERVER_PRESENCE_SYNC_MS = 5_000;

export interface ServerPresenceBridge {
  /** 지금 로컬에 아는 이 페이지의 프레즌스 전부와 내 라이브 뷰·세션. */
  readLocal(): {
    readonly presence: readonly PagePresenceEntry[];
    readonly liveViews: readonly LiveViewState[];
    readonly ownLiveView: LiveViewState | null;
    readonly session: ReviewSession | null;
  };
  /** 합류 결과를 로컬 상태에 반영한다(호출측이 자기 merge 규칙으로 이미 합친 값을 받는다). */
  applyMerged(next: {
    readonly presence: readonly PagePresenceEntry[];
    readonly liveViews: readonly LiveViewState[];
    readonly session: ReviewSession | null;
  }): void;
}

/**
 * 서버 프레즌스 동기화 훅 — UI를 바꾸지 않는 전송 확장.
 *
 * 회차 룸의 기존 상태(프레즌스·라이브 뷰·세션)를 브리지로 읽고, 주기적으로
 * 서버와 왕복해 합류 결과를 돌려준다. 서버가 없거나 실패하면 조용히 물러나
 * 기존 BroadcastChannel(탭 간) 동작만으로 계속된다 — 전송 실패가 편집
 * 흐름을 막지 않는 것이 원칙이다. 데모(샘플)에서는 enabled=false로 끈다.
 */
export function useServerPresenceSync(options: {
  readonly enabled: boolean;
  readonly projectId: string;
  readonly episodeId: string;
  readonly pageId: string;
  readonly bridge: ServerPresenceBridge;
}): void {
  const bridgeRef = useRef(options.bridge);
  bridgeRef.current = options.bridge;
  const { enabled, projectId, episodeId, pageId } = options;

  useEffect(() => {
    if (!enabled) return;
    const transport = createPresenceTransport(projectId, (path, body) => api.post(path, body));
    let stopped = false;

    const roundTrip = async (leaving: boolean) => {
      const local = bridgeRef.current.readLocal();
      const request: PresenceSyncRequest = {
        episodeId,
        pageId,
        presence: local.presence.filter((entry) => entry.pageId === pageId),
        liveView: local.ownLiveView,
        session: local.session,
        leaving,
      };
      try {
        const snapshot = await transport.sync(request);
        if (stopped || leaving) return;
        const current = bridgeRef.current.readLocal();
        bridgeRef.current.applyMerged(applyPresenceSnapshot({
          localPresence: current.presence,
          localLiveViews: current.liveViews,
          localSession: current.session,
          snapshot,
          pageId,
          now: new Date(),
        }));
      } catch {
        /* 전송 실패는 로컬(탭 간) 동기화로 계속 동작한다. 다음 주기에 다시 시도한다. */
      }
    };

    void roundTrip(false);
    const timer = setInterval(() => { void roundTrip(false); }, SERVER_PRESENCE_SYNC_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
      void roundTrip(true);
    };
  }, [enabled, projectId, episodeId, pageId]);
}
