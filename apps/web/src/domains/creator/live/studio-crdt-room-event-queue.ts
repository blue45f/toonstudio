import type { StudioLiveCrdtRoomEvent, StudioLiveRoom } from "./studio-live-collaboration-room";

/** 비동기 6패스 입장 검증과 적용이 같은 기준 문서에서 경합하지 않도록 수신 순서를 지킨다. */
export function subscribeStudioCrdtRoomEventsInOrder(
  room: StudioLiveRoom,
  receive: (event: StudioLiveCrdtRoomEvent) => Promise<void>,
): () => void {
  let tail: Promise<void> | null = null;
  return room.subscribeCrdt((event) => {
    if (event.type !== "update") return receive(event);
    const run = tail ? tail.then(() => receive(event), () => receive(event)) : receive(event);
    const settled = run.finally(() => { if (tail === settled) tail = null; });
    tail = settled;
    return settled;
  });
}
