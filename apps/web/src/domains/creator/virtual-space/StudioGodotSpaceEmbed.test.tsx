// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioRealtimeTicketRequest } from "../studio-realtime-provider-protocol";
import type { StudioRealtimeTicketIssuer } from "../studio-realtime-provider-runtime";
import { StudioGodotSpaceEmbed } from "./StudioGodotSpaceEmbed";

const WORK_ID = "work-project-godot";

function ticketResponse() {
  const issued = Date.now() - 5_000;
  return {
    version: 1,
    providerId: "cloudflare-realtime-v1",
    scope: { workId: WORK_ID, roomId: WORK_ID },
    workloads: ["presence", "screen-signaling"],
    capabilities: [
      "presence.snapshot-v1",
      "presence.members-v1",
      "presence.cursor-v1",
      "presence.resume-v1",
      "screen-signaling.session-v1",
      "screen-signaling.webrtc-v1",
      "screen-signaling.resume-v1",
    ],
    issuedAt: new Date(issued).toISOString(),
    expiresAt: new Date(issued + 115_000).toISOString(),
    ticket: "t".repeat(48),
  };
}

interface HostBridge {
  onGodotReady: (json: string) => void;
  onConnectionState: (json: string) => void;
  onTicketNeeded: (json: string) => void;
  onZoneChanged: (json: string) => void;
  onProximityChanged: (json: string) => void;
  onSignal: (json: string) => void;
  onBubble: (json: string) => void;
}

function hostBridge(): HostBridge {
  const host = (window as unknown as { __tsvsHost?: HostBridge }).__tsvsHost;
  if (!host) throw new Error("__tsvsHost was not registered");
  return host;
}

function frameWindow(): Record<string, unknown> {
  const iframe = document.querySelector("iframe");
  if (!iframe?.contentWindow) throw new Error("iframe window missing");
  return iframe.contentWindow as unknown as Record<string, unknown>;
}

function renderEmbed(issuer: StudioRealtimeTicketIssuer, localOnly = false) {
  return render(
    <StudioGodotSpaceEmbed
      workId={WORK_ID}
      displayName="김희준"
      colorHex="#3b82f6"
      skinKey="pink"
      localOnly={localOnly}
      onExitToClassic={() => undefined}
      ticketIssuer={issuer}
    />,
  );
}

describe("StudioGodotSpaceEmbed", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_STUDIO_REALTIME_ORIGIN", "https://realtime.example.com");
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("registers the host bridge before loading the frame, then injects a session on ready", async () => {
    const issue = vi.fn(
      async (_request: StudioRealtimeTicketRequest, _signal: AbortSignal) =>
        ticketResponse(),
    );
    renderEmbed({ issue });
    const iframe = document.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBe("/godot-space/index.html");
    const setSession = vi.fn();
    frameWindow().__tsvs_setSession = setSession;

    act(() => hostBridge().onGodotReady("{}"));
    await waitFor(() => expect(issue).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(setSession).toHaveBeenCalledTimes(1));

    const request = issue.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      version: 1,
      providerId: "cloudflare-realtime-v1",
      scope: { workId: WORK_ID, roomId: WORK_ID },
      workloads: ["presence", "screen-signaling"],
    });
    expect(request?.capabilities).toContain("screen-signaling.webrtc-v1");
    const payload = JSON.parse(setSession.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(payload).toMatchObject({
      v: 1,
      ticket: "t".repeat(48),
      ws: "wss://realtime.example.com",
      workId: WORK_ID,
      roomId: WORK_ID,
      name: "김희준",
      color: "#3b82f6",
      skinKey: "pink",
    });

    act(() => hostBridge().onConnectionState(JSON.stringify({ state: "connected" })));
    expect(screen.getByText("연결됨")).toBeTruthy();
  });

  it("re-issues a ticket when the stage asks for one", async () => {
    const issue = vi.fn(async () => ticketResponse());
    renderEmbed({ issue });
    frameWindow().__tsvs_setSession = vi.fn();
    act(() => hostBridge().onGodotReady("{}"));
    await waitFor(() => expect(issue).toHaveBeenCalledTimes(1));
    act(() => hostBridge().onTicketNeeded("{}"));
    await waitFor(() => expect(issue).toHaveBeenCalledTimes(2));
  });

  it("forwards visibility changes to the stage for shell-owned liveness", async () => {
    const issue = vi.fn(async () => ticketResponse());
    renderEmbed({ issue });
    const setVisibility = vi.fn();
    frameWindow().__tsvs_setVisibility = setVisibility;
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    fireEvent(document, new Event("visibilitychange"));
    expect(setVisibility).toHaveBeenCalledWith(true);
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    fireEvent(document, new Event("visibilitychange"));
    expect(setVisibility).toHaveBeenCalledWith(false);
  });

  it("shows a denied state instead of retrying forever when the ticket is refused", async () => {
    const { StudioRealtimeTicketDeniedError } = await import(
      "../studio-realtime-provider-runtime"
    );
    const issue = vi.fn(async () => {
      throw new StudioRealtimeTicketDeniedError();
    });
    renderEmbed({ issue });
    act(() => hostBridge().onGodotReady("{}"));
    await waitFor(() =>
      expect(screen.getByText("이 공간에 들어갈 권한이 없어요.")).toBeTruthy(),
    );
    expect(issue).toHaveBeenCalledTimes(1);
  });

  it("loads local-only mode without issuing tickets", () => {
    const issue = vi.fn(async () => ticketResponse());
    renderEmbed({ issue }, true);
    const iframe = document.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBe("/godot-space/index.html?local=1");
    act(() => hostBridge().onGodotReady("{}"));
    expect(issue).not.toHaveBeenCalled();
    expect(screen.getByText("로컬 모드 — 혼자 둘러보는 중이에요.")).toBeTruthy();
  });

  it("opens the meeting panel when the stage reports the meeting zone with both occupants", async () => {
    const issue = vi.fn(async () => ticketResponse());
    renderEmbed({ issue });
    frameWindow().__tsvs_setSession = vi.fn();
    act(() => hostBridge().onGodotReady("{}"));
    await waitFor(() => expect(issue).toHaveBeenCalledTimes(1));
    act(() =>
      hostBridge().onZoneChanged(
        JSON.stringify({
          v: 1,
          selfZoneId: "meeting",
          selfActorId: "actor-me",
          selfClientId: "client-me",
          presenterActorId: "actor-peer",
          peerClientIds: { "actor-peer": "client-peer" },
          names: { "actor-me": "김희준", "actor-peer": "테스터B" },
          zones: [
            { zoneId: "meeting", kind: "meeting", name: "회의 구역", occupants: ["actor-me", "actor-peer"] },
            { zoneId: "presentation", kind: "presentation", name: "발표 구역", occupants: ["actor-peer"] },
          ],
        }),
      ),
    );
    expect(screen.getByTestId("godot-meeting-panel")).toBeTruthy();
    expect(screen.getByTestId("godot-presenter-label").textContent).toContain("테스터B");
    expect(screen.getByTestId("godot-meeting-route").textContent).toContain("함께 있어요");
    expect(screen.getByTestId("godot-current-zone").textContent).toContain("회의 구역");
  });

  it("sends chat as a stage bubble and logs incoming bubbles", async () => {
    const issue = vi.fn(async () => ticketResponse());
    renderEmbed({ issue });
    frameWindow().__tsvs_setSession = vi.fn();
    const showBubble = vi.fn();
    frameWindow().__tsvs_showBubble = showBubble;
    act(() => hostBridge().onGodotReady("{}"));
    await waitFor(() => expect(issue).toHaveBeenCalledTimes(1));
    act(() =>
      hostBridge().onZoneChanged(
        JSON.stringify({
          v: 1,
          selfZoneId: "",
          selfActorId: "actor-me",
          selfClientId: "client-me",
          presenterActorId: "",
          peerClientIds: {},
          names: { "actor-peer": "테스터B" },
          zones: [],
        }),
      ),
    );
    const input = screen.getByLabelText("말풍선 채팅");
    fireEvent.change(input, { target: { value: "이쪽으로 와 주세요" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    expect(showBubble).toHaveBeenCalledTimes(1);
    expect(JSON.parse(showBubble.mock.calls[0]?.[0] as string)).toEqual({
      actorId: "actor-me",
      text: "이쪽으로 와 주세요",
    });
    expect(screen.getByText(/이쪽으로 와 주세요/)).toBeTruthy();

    act(() =>
      hostBridge().onBubble(
        JSON.stringify({ v: 1, fromActorId: "actor-peer", text: "지금 갈게요" }),
      ),
    );
    expect(screen.getByText(/지금 갈게요/)).toBeTruthy();
    expect(screen.getByText(/테스터B/)).toBeTruthy();
  });

  it("shows the proximity indicator for nearby groups", async () => {
    const issue = vi.fn(async () => ticketResponse());
    renderEmbed({ issue });
    frameWindow().__tsvs_setSession = vi.fn();
    act(() => hostBridge().onGodotReady("{}"));
    await waitFor(() => expect(issue).toHaveBeenCalledTimes(1));
    act(() =>
      hostBridge().onProximityChanged(
        JSON.stringify({ v: 1, members: ["actor-me", "actor-peer"], size: 2 }),
      ),
    );
    expect(screen.getByTestId("godot-proximity").textContent).toContain("2명");
  });
});
