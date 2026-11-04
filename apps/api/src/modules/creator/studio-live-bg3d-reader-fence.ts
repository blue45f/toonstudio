import { STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";
import { studioLiveFailure } from "./studio-live-ack";
import { STUDIO_LIVE_ADAPTER_DISCOVERY_TIMEOUT_MS } from "./studio-live-gateway-constants";
import type { StudioLiveGatewayHost } from "./studio-live-gateway-host";
import type { StudioLiveSocket } from "./studio-live.protocol";

export function studioBg3dReaderRoom(room: string): string { return `${room}:reader:bg3d-sixpass-bundle.v1`; }

/** 다음 작품의 방에 들어가기 전에 이전 기능 방을 반드시 비운다. */
export async function resetStudioBg3dReaderRoom(host: StudioLiveGatewayHost, client: StudioLiveSocket, sequence: number): Promise<boolean> {
  const room = client.data.studioBg3dReaderRoom;
  if (!room) return true;
  try {
    const state = await host.roomTransitions.leavePreviousRoom({ socket: client, previousRoom: room, speculativeNextRoom: null,
      currentState: () => host.currentRoomTransitionState(client, sequence), onIsolationFailure: () => host.disconnectRoomIsolationFailure(client) });
    if (client.data.studioBg3dReaderRoom === room) delete client.data.studioBg3dReaderRoom;
    return state === "current";
  } catch { host.disconnectRoomIsolationFailure(client); return false; }
}
export async function joinStudioBg3dReaderRoom(host: StudioLiveGatewayHost, client: StudioLiveSocket, baseRoom: string, sequence: number): Promise<boolean> {
  if (!client.data.studioReaderCapabilities?.includes(STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY)) return true;
  const room = studioBg3dReaderRoom(baseRoom);
  try {
    const state = await host.roomTransitions.enterNextRoom({ socket: client, nextRoom: room, joinNextRoom: true,
      currentState: () => host.currentRoomTransitionState(client, sequence), onIsolationFailure: () => host.disconnectRoomIsolationFailure(client) });
    if (state !== "current") return false;
    client.data.studioBg3dReaderRoom = room; return true;
  } catch { host.disconnectRoomIsolationFailure(client); return false; }
}

/** 일반 v8 작품의 전파는 그대로 두고, 기능 작품만 서버가 기록한 참가 capability로 수신자를 고른다. */
export async function broadcastStudioBg3dReaderSafe(host: StudioLiveGatewayHost, sender: StudioLiveSocket,
  room: string, event: string, payload: unknown, required: readonly string[] | undefined): Promise<void> {
  if (!required?.length) { sender.to(room).emit(event, payload); return; }
  // 검증된 기능 방으로 즉시 보낸다. 구 peer 알림을 위한 분산 탐색이 정상 peer 전파를 지연시키지 않는다.
  sender.to(studioBg3dReaderRoom(room)).emit(event, payload);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const sockets = await Promise.race([
      host.server.in(room).fetchSockets(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("6패스 수신자 확인 시간이 초과되었습니다.")), STUDIO_LIVE_ADAPTER_DISCOVERY_TIMEOUT_MS); }),
    ]);
    for (const socket of sockets) {
      if (socket.id === sender.id) continue;
      if (!socket.data.studioReaderCapabilities?.includes(STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY)) {
        socket.emit("studio:error", { ...studioLiveFailure("reader_upgrade_required", "보존된 6패스를 읽을 수 있는 앱으로 업데이트해 주세요."), requiredReaderCapabilities: required });
        socket.disconnect(true);
      }
    }
  } finally { if (timer) clearTimeout(timer); }
}
