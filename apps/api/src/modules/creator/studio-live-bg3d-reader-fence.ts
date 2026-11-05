import { STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";
import { STUDIO_LEGACY_PIGMENT_PRESERVATION_CAPABILITY } from "@toonstudio/contracts/studio-legacy-pigment-archive";
import { studioLiveFailure } from "./studio-live-ack";
import { STUDIO_LIVE_ADAPTER_DISCOVERY_TIMEOUT_MS } from "./studio-live-gateway-constants";
import type { StudioLiveGatewayHost } from "./studio-live-gateway-host";
import type { StudioLiveSocket } from "./studio-live.protocol";

export function studioBg3dReaderRoom(room: string): string { return `${room}:reader:bg3d-sixpass-bundle.v1`; }
export function studioRequiredReaderRoom(room: string, required: readonly string[]): string {
  return `${room}:reader:${[...new Set(required)].sort().join("+")}`;
}
/** 각 방은 서버가 확인한 capability의 교집합이다. 구 BG3D reader를 v7 방에 넣지 않는다. */
export function studioSupportedReaderRooms(room: string, capabilities: readonly string[] = []): string[] {
  return [[STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY], [STUDIO_LEGACY_PIGMENT_PRESERVATION_CAPABILITY],
    [STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY, STUDIO_LEGACY_PIGMENT_PRESERVATION_CAPABILITY]]
    .filter((required) => required.every((capability) => capabilities.includes(capability)))
    .map((required) => studioRequiredReaderRoom(room, required));
}
export function studioAllReaderRooms(room: string): string[] {
  return studioSupportedReaderRooms(room, [STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY, STUDIO_LEGACY_PIGMENT_PRESERVATION_CAPABILITY]);
}

/** 다음 작품의 방에 들어가기 전에 이전 기능 방을 반드시 비운다. */
export async function resetStudioBg3dReaderRoom(host: StudioLiveGatewayHost, client: StudioLiveSocket, sequence: number): Promise<boolean> {
  const rooms = [client.data.studioBg3dReaderRoom, ...(client.data.studioPreservedDrawReaderRooms ?? [])].filter((room): room is string => !!room);
  if (!rooms.length) return true;
  try {
    for (const room of rooms) {
      const state = await host.roomTransitions.leavePreviousRoom({ socket: client, previousRoom: room, speculativeNextRoom: null,
        currentState: () => host.currentRoomTransitionState(client, sequence), onIsolationFailure: () => host.disconnectRoomIsolationFailure(client) });
      if (state !== "current") return false;
    }
    delete client.data.studioBg3dReaderRoom; delete client.data.studioPreservedDrawReaderRooms;
    return true;
  } catch { host.disconnectRoomIsolationFailure(client); return false; }
}
export async function joinStudioBg3dReaderRoom(host: StudioLiveGatewayHost, client: StudioLiveSocket, baseRoom: string, sequence: number): Promise<boolean> {
  const rooms = studioSupportedReaderRooms(baseRoom, client.data.studioReaderCapabilities);
  if (!rooms.length) return true;
  const bg3dRoom = studioBg3dReaderRoom(baseRoom);
  if (rooms.includes(bg3dRoom)) client.data.studioBg3dReaderRoom = bg3dRoom;
  client.data.studioPreservedDrawReaderRooms = rooms.filter((room) => room !== bg3dRoom);
  try {
    for (const room of rooms) {
      const state = await host.roomTransitions.enterNextRoom({ socket: client, nextRoom: room, joinNextRoom: true,
        currentState: () => host.currentRoomTransitionState(client, sequence), onIsolationFailure: () => host.disconnectRoomIsolationFailure(client) });
      if (state !== "current") {
        for (const joined of rooms) await client.leave(joined);
        return false;
      }
    }
    return true;
  } catch { host.disconnectRoomIsolationFailure(client); return false; }
}

/** 일반 v8 작품의 전파는 그대로 두고, 기능 작품만 서버가 기록한 참가 capability로 수신자를 고른다. */
export async function broadcastStudioBg3dReaderSafe(host: StudioLiveGatewayHost, sender: StudioLiveSocket,
  room: string, event: string, payload: unknown, required: readonly string[] | undefined): Promise<void> {
  if (!required?.length) { sender.to(room).emit(event, payload); return; }
  // 검증된 기능 방으로 즉시 보낸다. 구 peer 알림을 위한 분산 탐색이 정상 peer 전파를 지연시키지 않는다.
  sender.to(studioRequiredReaderRoom(room, required)).emit(event, payload);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const sockets = await Promise.race([
      host.server.in(room).fetchSockets(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("6패스 수신자 확인 시간이 초과되었습니다.")), STUDIO_LIVE_ADAPTER_DISCOVERY_TIMEOUT_MS); }),
    ]);
    for (const socket of sockets) {
      if (socket.id === sender.id) continue;
      if (!required.every((capability) => socket.data.studioReaderCapabilities?.includes(capability))) {
        socket.emit("studio:error", { ...studioLiveFailure("reader_upgrade_required", "원고의 보존된 편집 정보를 읽을 수 있는 앱으로 업데이트해 주세요."), requiredReaderCapabilities: required });
        socket.disconnect(true);
      }
    }
  } finally { if (timer) clearTimeout(timer); }
}
