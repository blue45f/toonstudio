// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  createStudioMemoryLiveTransportFactory,
  StudioMemoryBroadcastHub,
} from "../live/studio-live-collaboration-transport";
import { StudioVirtualSpacePresenceController } from "./studio-virtual-space-presence";
import {
  createStudioVirtualDemoPreviewTransportFactory,
  isStudioVirtualDemoPreviewProject,
  STUDIO_VSPACE_PREVIEW_NETWORK_EVENT,
} from "./studio-virtual-space-local-preview-transport";
import {
  deriveStudioVirtualPeerConnectionList,
  STUDIO_PEER_RECONNECTING_AFTER_MS,
} from "./use-studio-virtual-peer-connection-tracker";
import { StudioVirtualSpaceUserList } from "./StudioVirtualSpaceUserList";

afterEach(cleanup);

describe("studio-virtual-space-local-preview-reconnect (P0-05)", () => {
  it("recognizes virtual-demo preview project ids without matching real projects", () => {
    expect(isStudioVirtualDemoPreviewProject("virtual-demo")).toBe(true);
    expect(isStudioVirtualDemoPreviewProject("virtual-demo:preview")).toBe(true);
    expect(isStudioVirtualDemoPreviewProject("virtual-demo_local")).toBe(true);
    expect(isStudioVirtualDemoPreviewProject("customer-project-123")).toBe(false);
  });

  it("tracks two local users across connected -> reconnecting -> disconnected -> reconnected", async () => {
    let clock = 10_000;
    const hub = new StudioMemoryBroadcastHub();
    const factory = createStudioVirtualDemoPreviewTransportFactory(
      createStudioMemoryLiveTransportFactory(hub),
      {
        createChannel: hub.create,
        now: () => clock,
        setInterval: () => 1,
        clearInterval: () => undefined,
      },
    );

    const participantA = { sessionId: "sess-a", displayName: "작가A · 이 탭", role: "editor" as const };
    const participantB = { sessionId: "sess-b", displayName: "어시B · 이 탭", role: "editor" as const };
    const transportA = factory({ workId: "virtual-demo:preview", roomName: "room-demo", participant: participantA });
    const transportB = factory({ workId: "virtual-demo:preview", roomName: "room-demo", participant: participantB });

    await transportA.connect();
    await transportB.connect();

    expect(transportA.direct).toBeDefined();
    expect(transportB.direct).toBeDefined();
    expect(transportA.direct!.getPeers().map((p) => p.sessionId)).toEqual(["sess-b"]);
    expect(transportB.direct!.getPeers().map((p) => p.sessionId)).toEqual(["sess-a"]);

    const controllerA = new StudioVirtualSpacePresenceController(
      participantA,
      transportA.direct!,
      { x: 120, y: 160 },
      { now: () => clock, setInterval: () => 1, clearInterval: () => undefined },
    );
    const controllerB = new StudioVirtualSpacePresenceController(
      participantB,
      transportB.direct!,
      { x: 200, y: 180 },
      { now: () => clock, setInterval: () => 1, clearInterval: () => undefined },
    );
    controllerA.start();
    controllerB.start();
    controllerA.refresh();

    const snapA1 = controllerA.snapshot();
    expect(snapA1.peers).toHaveLength(1);
    expect(snapA1.peers[0]?.participant.displayName).toBe("어시B · 이 탭");

    // 1. 연결됨 (connected)
    const step1 = deriveStudioVirtualPeerConnectionList({
      selfId: "sess-a",
      selfName: "작가A",
      self: snapA1.self,
      peers: snapA1.peers,
      previousActivePeers: new Map(),
      previousGhosts: new Map(),
      selfConnectionState: "connected",
      now: clock,
    });
    const { rerender } = render(
      <StudioVirtualSpaceUserList
        users={step1.users}
        zones={[]}
        selfId="sess-a"
      />,
    );
    expect(screen.getAllByText("연결됨")).toHaveLength(2);
    expect(screen.getByRole("status").textContent).toContain("총 2명 작업 중");

    // 2. 하트비트 지연 -> 재연결 중 (reconnecting)
    clock += STUDIO_PEER_RECONNECTING_AFTER_MS + 200;
    const step2 = deriveStudioVirtualPeerConnectionList({
      selfId: "sess-a",
      selfName: "작가A",
      self: snapA1.self,
      peers: controllerA.snapshot().peers,
      previousActivePeers: step1.nextActivePeers,
      previousGhosts: step1.nextGhosts,
      selfConnectionState: "connected",
      now: clock,
    });
    rerender(<StudioVirtualSpaceUserList users={step2.users} zones={[]} selfId="sess-a" />);
    expect(screen.getByText("재연결 중")).not.toBeNull();
    expect(screen.getByRole("status").textContent).toContain("재연결 중 1명");

    // 3. 연결 끊김 (disconnected) — 어시B 네트워크 이탈 시뮬레이션
    globalThis.dispatchEvent(
      new CustomEvent(STUDIO_VSPACE_PREVIEW_NETWORK_EVENT, {
        detail: { paused: true, drop: true },
      }),
    );
    // transportA도 같은 globalThis 이벤트를 받았으므로 A만 다시 복구해 B의 이탈을 관찰한다.
    controllerA.refresh();
    const step3 = deriveStudioVirtualPeerConnectionList({
      selfId: "sess-a",
      selfName: "작가A",
      self: snapA1.self,
      peers: [],
      previousActivePeers: step2.nextActivePeers,
      previousGhosts: step2.nextGhosts,
      selfConnectionState: "connected",
      now: clock + 500,
    });
    rerender(<StudioVirtualSpaceUserList users={step3.users} zones={[]} selfId="sess-a" />);
    expect(screen.getByText("연결 끊김")).not.toBeNull();
    expect(screen.getByRole("status").textContent).toContain("연결 끊김 1명");

    // 4. 재연결 복구 (reconnected) — 어시B 복귀 시 끊김 배지가 해제되고 '연결됨'으로 돌아온다
    globalThis.dispatchEvent(
      new CustomEvent(STUDIO_VSPACE_PREVIEW_NETWORK_EVENT, {
        detail: { paused: false },
      }),
    );
    clock += 1_000;
    controllerB.refresh();
    controllerA.refresh();
    const step4 = deriveStudioVirtualPeerConnectionList({
      selfId: "sess-a",
      selfName: "작가A",
      self: controllerA.snapshot().self,
      peers: controllerA.snapshot().peers,
      previousActivePeers: step3.nextActivePeers,
      previousGhosts: step3.nextGhosts,
      selfConnectionState: "connected",
      now: clock,
    });
    rerender(<StudioVirtualSpaceUserList users={step4.users} zones={[]} selfId="sess-a" />);
    expect(screen.queryByText("연결 끊김")).toBeNull();
    expect(screen.getAllByText("연결됨")).toHaveLength(2);

    controllerA.close();
    controllerB.close();
    transportA.close();
    transportB.close();
  });
});
