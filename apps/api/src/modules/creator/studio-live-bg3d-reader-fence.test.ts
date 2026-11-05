import { StudioLiveRoomTransitionCoordinator } from "./studio-live-room-transition-coordinator";
import { describe, expect, it, vi } from "vitest";
import { STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY as CAP } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";
import { broadcastStudioBg3dReaderSafe, resetStudioBg3dReaderRoom, joinStudioBg3dReaderRoom, studioRequiredReaderRoom, studioSupportedReaderRooms } from "./studio-live-bg3d-reader-fence";
import type { StudioLiveGatewayHost } from "./studio-live-gateway-host";
import type { StudioLiveSocket } from "./studio-live.protocol";

function harness() {
  const emit = vi.fn(), direct = vi.fn(), fetchSockets = vi.fn().mockResolvedValue([]);
  const sender = { id: "sender", to: vi.fn(() => ({ emit })) } as unknown as StudioLiveSocket;
  const host = { server: { in: vi.fn(() => ({ fetchSockets })), to: vi.fn(() => ({ emit: direct })) } } as unknown as StudioLiveGatewayHost;
  return { sender, host, emit, direct, fetchSockets };
}
describe("6패스 수신 reader fence", () => {
  it("일반 v8 작품은 기존 room 전파를 유지한다", async () => {
    const h = harness(); await broadcastStudioBg3dReaderSafe(h.host, h.sender, "work-room", "update", { id: 1 }, undefined);
    expect(h.emit).toHaveBeenCalledWith("update", { id: 1 }); expect(h.fetchSockets).not.toHaveBeenCalled();
  });
  it("이미 참가한 구 peer에는 본문 없이 upgrade 오류만 전달하고 닫는다", async () => {
    const h = harness(), old = { id: "old", data: {}, emit: vi.fn(), disconnect: vi.fn() };
    const current = { id: "current", data: { studioReaderCapabilities: [CAP] }, emit: vi.fn(), disconnect: vi.fn() };
    h.fetchSockets.mockResolvedValue([old, current]);
    await broadcastStudioBg3dReaderSafe(h.host, h.sender, "work-room", "update", { body: "private" }, [CAP]);
    expect(old.emit).toHaveBeenCalledWith("studio:error", expect.objectContaining({ code: "reader_upgrade_required" }));
    expect(old.disconnect).toHaveBeenCalledWith(true); expect(current.disconnect).not.toHaveBeenCalled();
    expect(h.sender.to).toHaveBeenCalledWith("work-room:reader:bg3d-sixpass-bundle.v1");
    expect(h.emit).toHaveBeenCalledWith("update", { body: "private" }); expect(h.host.server.to).not.toHaveBeenCalled();
  });
  it("분산 수신자 확인 실패는 본문을 넓은 방으로 우회 전송하지 않는다", async () => {
    const h = harness(); h.fetchSockets.mockRejectedValue(new Error("adapter unavailable"));
    await expect(broadcastStudioBg3dReaderSafe(h.host, h.sender, "work-room", "update", {}, [CAP])).rejects.toThrow();
    expect(h.sender.to).toHaveBeenCalledOnce(); expect(h.sender.to).toHaveBeenCalledWith("work-room:reader:bg3d-sixpass-bundle.v1"); expect(h.direct).not.toHaveBeenCalled();
  });
  it("BG3D만 지원하는 접속 중 구 peer에는 최초 v7 본문을 보내지 않는다", async () => {
    const preserved = "legacy-pigment-preservation.v1", h = harness();
    const old = { id: "old", data: { studioReaderCapabilities: [CAP] }, emit: vi.fn(), disconnect: vi.fn() };
    const current = { id: "current", data: { studioReaderCapabilities: [CAP, preserved] }, emit: vi.fn(), disconnect: vi.fn() };
    h.fetchSockets.mockResolvedValue([old, current]);
    await broadcastStudioBg3dReaderSafe(h.host, h.sender, "work-room", "update", { body: "v7" }, [CAP, preserved]);
    expect(h.sender.to).toHaveBeenCalledWith(studioRequiredReaderRoom("work-room", [CAP, preserved]));
    expect(h.sender.to).not.toHaveBeenCalledWith("work-room:reader:bg3d-sixpass-bundle.v1");
    expect(old.emit).toHaveBeenCalledExactlyOnceWith("studio:error", expect.objectContaining({ requiredReaderCapabilities: [CAP, preserved] }));
    expect(old.disconnect).toHaveBeenCalledWith(true); expect(current.disconnect).not.toHaveBeenCalled();
    expect(studioSupportedReaderRooms("work-room", [CAP])).not.toContain(studioRequiredReaderRoom("work-room", [CAP, preserved]));
    expect(studioSupportedReaderRooms("work-room", [CAP, preserved])).toContain(studioRequiredReaderRoom("work-room", [CAP, preserved]));
  });
});

describe("6패스 수신 방의 작품 전환", () => {
  function transitionHarness() {
    let current = true;
    const socket = { id: "socket", data: { studioReaderCapabilities: [CAP], studioBg3dReaderRoom: "previous:reader:bg3d-sixpass-bundle.v1" as string | undefined }, join: vi.fn(async () => undefined), leave: vi.fn(async () => undefined) };
    const host = { roomTransitions: new StudioLiveRoomTransitionCoordinator(), currentRoomTransitionState: () => current ? "current" : "generation_stale", disconnectRoomIsolationFailure: vi.fn() } as unknown as StudioLiveGatewayHost;
    return { socket, client: socket as unknown as StudioLiveSocket, host, stale: () => { current = false; } };
  }
  it("이전 기능 방을 떠난 뒤 새 기능 방에 참가한다", async () => {
    const h = transitionHarness(); expect(await resetStudioBg3dReaderRoom(h.host, h.client, 1)).toBe(true);
    expect(h.socket.leave).toHaveBeenCalledWith("previous:reader:bg3d-sixpass-bundle.v1");
    expect(await joinStudioBg3dReaderRoom(h.host, h.client, "next", 1)).toBe(true);
    expect(h.socket.data.studioBg3dReaderRoom).toBe("next:reader:bg3d-sixpass-bundle.v1");
  });
  it("지연된 join이 구 세대에서 끝나면 기능 방을 되돌린다", async () => {
    const h = transitionHarness(); let finish: (() => void) | undefined;
    h.socket.join.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const pending = joinStudioBg3dReaderRoom(h.host, h.client, "next", 1); h.stale(); finish?.();
    expect(await pending).toBe(false); expect(h.socket.leave).toHaveBeenCalledWith("next:reader:bg3d-sixpass-bundle.v1");
  });
  it("이전 기능 방을 비우지 못하면 연결을 닫고 다른 작품 참가를 거부한다", async () => {
    const h = transitionHarness(); h.socket.leave.mockRejectedValueOnce(new Error("adapter failed"));
    expect(await resetStudioBg3dReaderRoom(h.host, h.client, 1)).toBe(false);
    expect(h.host.disconnectRoomIsolationFailure).toHaveBeenCalledWith(h.client); expect(h.socket.join).not.toHaveBeenCalled();
  });
  it("v7과 BG3D 교집합 방도 작품 전환 시 전부 정리한다", async () => {
    const h = transitionHarness(); h.socket.data.studioReaderCapabilities = [CAP, "legacy-pigment-preservation.v1"];
    const rooms = studioSupportedReaderRooms("next", h.socket.data.studioReaderCapabilities);
    expect(await joinStudioBg3dReaderRoom(h.host, h.client, "next", 1)).toBe(true);
    expect(rooms).toHaveLength(3);
    for (const room of rooms) expect(h.socket.join).toHaveBeenCalledWith(room);
    expect(await resetStudioBg3dReaderRoom(h.host, h.client, 1)).toBe(true);
    for (const room of rooms) expect(h.socket.leave).toHaveBeenCalledWith(room);
    expect(h.client.data.studioPreservedDrawReaderRooms).toBeUndefined();
  });
  it("두번째 capability 방의 지연 참가도 구 세대가 되면 모든 이전 참가를 되돌린다", async () => {
    const h = transitionHarness(); h.socket.data.studioReaderCapabilities = [CAP, "legacy-pigment-preservation.v1"];
    let finish: (() => void) | undefined;
    h.socket.join.mockImplementationOnce(async () => undefined).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const pending = joinStudioBg3dReaderRoom(h.host, h.client, "next", 1);
    await vi.waitFor(() => expect(finish).toBeDefined()); h.stale(); finish?.();
    expect(await pending).toBe(false);
    for (const room of studioSupportedReaderRooms("next", h.socket.data.studioReaderCapabilities)) expect(h.socket.leave).toHaveBeenCalledWith(room);
  });
});
