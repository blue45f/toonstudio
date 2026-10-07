import { useEffect, useState } from "react";

import { rememberStudioLiveOwnedRoomId } from "../live/studio-live-jam-session";
import {
  holdStudioLocalDraftOwnership,
  readStudioLocalDraftOriginRoom,
  studioLocalDraftOwnerScope,
} from "../live/studio-live-local-draft-owner";

/** Reclaims a browser-local origin only; server auth and shared-document gates stay independent. */
export function useStudioLocalDraftOwner(input: {
  initialInstantWorkId: string; roomId: string | null; workId: string | null; remixId: string | null;
  ownerId: string | null; projectId: string | null; documentId: string | null; draftId: string | null;
}): string {
  const { initialInstantWorkId, workId, remixId } = input;
  const scope = studioLocalDraftOwnerScope(input);
  const room = input.roomId ?? initialInstantWorkId;
  const [recovered, setRecovered] = useState<{ scope: string; room: string } | null>(null);
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
    // 룸을 싣지 않은 재진입(문서 경로·resume=latest "이어서 작업")에서는 새 룸을 이 탭의
    // 소유로 등록하기 전에 원점 영수증이 가리키는 직전 룸을 먼저 후보로 삼는다. 새 룸부터
    // 등록하면 영수증이 덮여 직전 룸 — 과 그 룸에 키잉된 복구 계층 — 에 다시는 닿을 수 없다.
    // 영수증이 없을 때만 기존대로 새 룸이 원점이 된다. 리스가 살아 있는 동안은 hold가
    // 채택을 거부하므로 동행 탭을 소유자로 오인하지 않고 영수증도 그대로 남는다.
    if (!input.roomId && !workId && !remixId && storage) {
      const receiptRoom = readStudioLocalDraftOriginRoom(storage, scope);
      if (receiptRoom && receiptRoom !== initialInstantWorkId) {
        return holdStudioLocalDraftOwnership({
          scope, room: receiptRoom, knownTabOwner: false, workId, remixId, storage, locks,
          onRecovered: () => adopt(receiptRoom),
        });
      }
    }
    return holdStudioLocalDraftOwnership({
      scope, room, workId, remixId, storage, locks,
      knownTabOwner: room === initialInstantWorkId,
      onRecovered: () => adopt(room),
    });
  }, [initialInstantWorkId, input.roomId, remixId, room, scope, workId]);
  return !workId && !remixId && recovered?.scope === scope
    && (input.roomId === null || recovered.room === input.roomId)
    ? recovered.room : initialInstantWorkId;
}
