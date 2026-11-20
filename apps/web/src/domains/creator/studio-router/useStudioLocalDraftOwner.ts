import { useEffect, useState } from "react";

import { createStudioLiveInstantWorkId, rememberStudioLiveOwnedRoomId } from "../live/studio-live-jam-session";
import {
  holdStudioLocalDraftOwnership,
  readStudioLocalDraftOriginRoom,
  studioLocalDraftOwnerScope,
} from "../live/studio-live-local-draft-owner";

/** Reclaims a browser-local origin only; server auth and shared-document gates stay independent. */
export function useStudioLocalDraftOwner(input: {
  initialInstantWorkId: string; roomId: string | null; workId: string | null; remixId: string | null;
  ownerId: string | null; projectId: string | null; documentId: string | null; draftId: string | null;
}): { readonly instantWorkId: string; readonly canPublishRoom: boolean } {
  const { workId, remixId } = input;
  const scope = studioLocalDraftOwnerScope(input);
  const [restoredPage, setRestoredPage] = useState<{ scope: string; sourceId: string; id: string } | null>(null);
  const initialInstantWorkId = restoredPage?.scope === scope && restoredPage.sourceId === input.initialInstantWorkId
    ? restoredPage.id : input.initialInstantWorkId;
  const room = input.roomId ?? initialInstantWorkId;
  const [recovered, setRecovered] = useState<{ scope: string; room: string } | null>(null);
  // 이 탭이 회복해 소유자가 된 룸은 처음 연 탭의 룸과 같은 소유 리스다. 회복 직후나 ?room= 게시로 효과가
  // 다시 돌 때 동행 후보처럼 ifAvailable로 다시 잡으면 자기 리스와 경합해 놓치고, 복제 탭이 그 룸을 가져간다.
  const recoveredRoom = recovered?.scope === scope ? recovered.room : null;
  useEffect(() => {
    let storage: Storage | null = null;
    let locks: LockManager | null = null;
    try { storage = window.localStorage; locks = navigator.locks ?? null; } catch { /* Denied browser storage. */ }
    const adopt = (candidate: string) => {
      let session: Storage | null = null;
      try { session = window.sessionStorage; } catch { /* The held lease still protects this mount. */ }
      rememberStudioLiveOwnedRoomId(session, candidate);
      setRecovered({ scope, room: candidate });
    };
    // 룸 없는 링크는 새 룸을 만들기 전에 원고의 기존 영수증부터 확인한다.
    const previousRoom = !input.roomId && !workId && !remixId && storage
      ? readStudioLocalDraftOriginRoom(storage, scope) : null;
    const candidate = previousRoom ?? room;
    const knownTabOwner = candidate === initialInstantWorkId || candidate === recoveredRoom;
    if (knownTabOwner && !workId && !remixId) adopt(candidate);
    const release = holdStudioLocalDraftOwnership({
      scope, room: candidate, workId, remixId, storage, locks, knownTabOwner,
      onRecovered: () => adopt(candidate),
    });
    if (workId || remixId) return release;

    // 뒤로/앞으로 캐시에 들어간 화면은 언마운트되지 않는다. 다음 화면이 원점 리스를 받을 수 있게
    // 이탈 시 해제하고, 복귀하면 그 사이 다른 탭이 소유자가 됐는지 새 참가자와 같은 방식으로 확인한다.
    const restore = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      setRecovered(null);
      setRestoredPage({ scope, sourceId: input.initialInstantWorkId, id: createStudioLiveInstantWorkId() });
    };
    window.addEventListener("pagehide", release);
    window.addEventListener("pageshow", restore);
    return () => {
      window.removeEventListener("pagehide", release);
      window.removeEventListener("pageshow", restore);
      release();
    };
  }, [initialInstantWorkId, input.initialInstantWorkId, input.roomId, recoveredRoom, remixId, room, scope, workId]);
  const confirmed = !workId && !remixId && recovered?.scope === scope
    && (input.roomId === null || recovered.room === input.roomId)
    ? recovered : null;
  return {
    instantWorkId: confirmed?.room ?? initialInstantWorkId,
    canPublishRoom: confirmed !== null,
  };
}
