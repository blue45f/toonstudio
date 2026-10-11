// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioRealtimeTicketRequest } from "../studio-realtime-provider-protocol";
import type { StudioRealtimeTicketIssuer } from "../studio-realtime-provider-runtime";
import { StudioGodotSpaceEmbed } from "./StudioGodotSpaceEmbed";

const WORK_ID = "work-project-godot";

const ROOM_DEF = {
  v: 1 as const,
  id: "studio-room",
  name: "작업실",
  size: [1600, 1200] as [number, number],
  zones: [
    { id: "meeting", kind: "meeting" as const, name: "회의 구역", rect: [480, 140, 640, 660] as [number, number, number, number] },
  ],
  props: [],
};
const STREET_DEF = {
  v: 1 as const,
  id: "street",
  name: "거리",
  size: [2400, 1200] as [number, number],
  zones: [
    { id: "plaza", kind: "meeting" as const, name: "광장", rect: [780, 310, 840, 460] as [number, number, number, number] },
    { id: "stage", kind: "presentation" as const, name: "거리 무대", rect: [970, 250, 460, 170] as [number, number, number, number] },
  ],
  props: [],
};

const spaceMocks = vi.hoisted(() => ({
  fetchCatalog: vi.fn(),
  fetchLayout: vi.fn(),
  saveLayout: vi.fn(),
}));

vi.mock("./studio-godot-space", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./studio-godot-space")>();
  return {
    ...actual,
    fetchGodotSpaceCatalog: spaceMocks.fetchCatalog,
    fetchGodotSpaceLayout: spaceMocks.fetchLayout,
    saveGodotSpaceLayout: spaceMocks.saveLayout,
    isGodotSpaceLayoutConflict: (error: unknown) =>
      (error as { code?: string } | null)?.code === "conflict",
  };
});

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
  onEmote: (json: string) => void;
  onInteract: (json: string) => void;
  onPosition: (json: string) => void;
  onLayoutChanged: (json: string) => void;
  onLayoutSelection: (json: string) => void;
  onLayoutRemote: (json: string) => void;
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
    spaceMocks.fetchCatalog.mockReset().mockResolvedValue([ROOM_DEF, STREET_DEF]);
    spaceMocks.fetchLayout.mockReset().mockResolvedValue(null);
    spaceMocks.saveLayout
      .mockReset()
      .mockImplementation(
        async (
          _workId: string,
          _spaceId: string,
          definition: typeof ROOM_DEF,
          expectedRevision: number,
        ) => ({
          definition,
          revision: expectedRevision + 1,
          updatedByUserId: "user-1",
          updatedAt: "2026-10-11T00:00:00.000Z",
        }),
      );
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

  it("issues a presence-only guest ticket with the verified qualification", async () => {
    const issue = vi.fn(
      async (_request: StudioRealtimeTicketRequest, _signal: AbortSignal) =>
        ticketResponse(),
    );
    render(
      <StudioGodotSpaceEmbed
        workId={WORK_ID}
        displayName="게스트"
        colorHex="#3b82f6"
        localOnly={false}
        guestAccess={{
          kind: "invite",
          token:
            "T".repeat(43),
          guestSessionId: "Ab3dEf6hJkLmNpQr",
        }}
        onExitToClassic={() => undefined}
        ticketIssuer={{ issue }}
      />,
    );
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
      scope: { workId: WORK_ID, roomId: WORK_ID },
      workloads: ["presence"],
      guestAccess: {
        kind: "invite",
        guestSessionId: "Ab3dEf6hJkLmNpQr",
      },
    });
    expect(request?.capabilities).not.toContain("screen-signaling.session-v1");
    expect(request?.capabilities).toContain("presence.cursor-v1");
    // 게스트는 저장본 레이아웃을 조회하지 않고 카탈로그 기본 정의를 쓴다.
    expect(spaceMocks.fetchLayout).not.toHaveBeenCalled();
  });

  it("does not open the meeting panel for a guest in the meeting zone", async () => {
    const issue = vi.fn(async () => ticketResponse());
    render(
      <StudioGodotSpaceEmbed
        workId={WORK_ID}
        displayName="게스트"
        colorHex="#3b82f6"
        localOnly={false}
        guestAccess={{
          kind: "entry-code",
          code: "ABC234",
          guestSessionId: "Ab3dEf6hJkLmNpQr",
        }}
        onExitToClassic={() => undefined}
        ticketIssuer={{ issue }}
      />,
    );
    frameWindow().__tsvs_setSession = vi.fn();
    act(() => hostBridge().onGodotReady("{}"));
    await waitFor(() => expect(issue).toHaveBeenCalledTimes(1));
    act(() =>
      hostBridge().onZoneChanged(
        JSON.stringify({
          v: 1,
          selfZoneId: "meeting",
          selfActorId: "guest:Ab3dEf6hJkLmNpQr",
          selfClientId: "client-guest",
          presenterActorId: "",
          peerClientIds: { "actor-host": "client-host" },
          names: { "actor-host": "호스트" },
          zones: [
            { zoneId: "meeting", kind: "meeting", name: "회의 구역", occupants: ["guest:Ab3dEf6hJkLmNpQr", "actor-host"] },
          ],
        }),
      ),
    );
    expect(screen.queryByTestId("godot-meeting-panel")).toBeNull();
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

describe("StudioGodotSpaceEmbed — 4단계 공간·배치", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_STUDIO_REALTIME_ORIGIN", "https://realtime.example.com");
    spaceMocks.fetchCatalog.mockReset().mockResolvedValue([ROOM_DEF, STREET_DEF]);
    spaceMocks.fetchLayout.mockReset().mockResolvedValue(null);
    spaceMocks.saveLayout
      .mockReset()
      .mockImplementation(
        async (
          _workId: string,
          _spaceId: string,
          definition: typeof ROOM_DEF,
          expectedRevision: number,
        ) => ({
          definition,
          revision: expectedRevision + 1,
          updatedByUserId: "user-1",
          updatedAt: "2026-10-11T00:00:00.000Z",
        }),
      );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("renders space tabs from the catalog and carries the definition in the session", async () => {
    const issue = vi.fn(async () => ticketResponse());
    renderEmbed({ issue });
    const setSession = vi.fn();
    frameWindow().__tsvs_setSession = setSession;
    expect(await screen.findByTestId("godot-space-tab-street")).toBeTruthy();
    act(() => hostBridge().onGodotReady("{}"));
    await waitFor(() => expect(setSession).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(setSession.mock.calls[0]?.[0] as string) as {
      space?: { id: string };
    };
    expect(payload.space?.id).toBe("studio-room");
  });

  it("switches to the street space by reloading the stage with the space param", async () => {
    const issue = vi.fn(async () => ticketResponse());
    renderEmbed({ issue });
    const setSession = vi.fn();
    frameWindow().__tsvs_setSession = setSession;
    act(() => hostBridge().onGodotReady("{}"));
    await waitFor(() => expect(setSession).toHaveBeenCalledTimes(1));

    fireEvent.click(await screen.findByTestId("godot-space-tab-street"));
    const iframe = document.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBe("/godot-space/index.html?space=street");
    await waitFor(() =>
      expect(spaceMocks.fetchLayout).toHaveBeenCalledWith(WORK_ID, "street"),
    );
    // 무대 리로드로 iframe 창이 교체된다 — 새 무대는 부팅 때 콜백을 다시
    // 등록하므로 테스트도 새 창에 목을 다시 건다.
    frameWindow().__tsvs_setSession = setSession;
    act(() => hostBridge().onGodotReady("{}"));
    await waitFor(() => expect(setSession).toHaveBeenCalledTimes(2));
    const payload = JSON.parse(setSession.mock.calls[1]?.[0] as string) as {
      space?: { id: string };
    };
    expect(payload.space?.id).toBe("street");
  });

  it("opens the meeting panel on the street by zone kind, not zone id", async () => {
    const issue = vi.fn(async () => ticketResponse());
    renderEmbed({ issue });
    frameWindow().__tsvs_setSession = vi.fn();
    act(() => hostBridge().onGodotReady("{}"));
    await waitFor(() => expect(issue).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByTestId("godot-space-tab-street"));
    act(() =>
      hostBridge().onZoneChanged(
        JSON.stringify({
          v: 1,
          selfZoneId: "plaza",
          selfActorId: "actor-me",
          selfClientId: "client-me",
          presenterActorId: "actor-peer",
          peerClientIds: { "actor-peer": "client-peer" },
          names: { "actor-me": "김희준", "actor-peer": "테스터B" },
          zones: [
            { zoneId: "plaza", kind: "meeting", name: "광장", occupants: ["actor-me", "actor-peer"] },
            { zoneId: "stage", kind: "presentation", name: "거리 무대", occupants: ["actor-peer"] },
          ],
        }),
      ),
    );
    expect(screen.getByTestId("godot-meeting-panel")).toBeTruthy();
    expect(screen.getByTestId("godot-presenter-label").textContent).toContain("테스터B");
  });

  it("saves stage edits through the API and notifies the room", async () => {
    const issue = vi.fn(async () => ticketResponse());
    renderEmbed({ issue });
    frameWindow().__tsvs_setSession = vi.fn();
    const notifyLayout = vi.fn();
    frameWindow().__tsvs_notifyLayout = notifyLayout;
    act(() => hostBridge().onGodotReady("{}"));
    await waitFor(() => expect(issue).toHaveBeenCalledTimes(1));
    await screen.findByTestId("godot-space-tab-street");

    const edited = {
      ...ROOM_DEF,
      props: [
        { kind: "bench" as const, rect: [900, 800, 120, 48] as [number, number, number, number] },
      ],
    };
    act(() =>
      hostBridge().onLayoutChanged(
        JSON.stringify({ v: 1, spec: edited, rev: 1 }),
      ),
    );
    const saveButton = screen.getByRole("button", { name: "배치 저장" });
    await waitFor(() => expect((saveButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(saveButton);
    await waitFor(() => expect(spaceMocks.saveLayout).toHaveBeenCalledTimes(1));
    expect(spaceMocks.saveLayout).toHaveBeenCalledWith(
      WORK_ID,
      "studio-room",
      expect.objectContaining({ id: "studio-room" }),
      0,
    );
    await waitFor(() => expect(notifyLayout).toHaveBeenCalledTimes(1));
    expect(JSON.parse(notifyLayout.mock.calls[0]?.[0] as string)).toEqual({
      spaceId: "studio-room",
      revision: 1,
    });
  });

  it("maps a stage selection (type key) into the panel form and deletes via command", async () => {
    const issue = vi.fn(async () => ticketResponse());
    renderEmbed({ issue });
    frameWindow().__tsvs_setSession = vi.fn();
    const layoutCommand = vi.fn();
    frameWindow().__tsvs_layoutCommand = layoutCommand;
    act(() => hostBridge().onGodotReady("{}"));
    await waitFor(() => expect(issue).toHaveBeenCalledTimes(1));
    await screen.findByTestId("godot-space-tab-street");

    // 배치 패널은 카탈로그·배치 조회가 끝난 뒤에야 그려지므로(느린 CI에서 경쟁) 버튼이 나타날 때까지 기다린다.
    fireEvent.click(await screen.findByRole("button", { name: "편집 모드 켜기" }));
    act(() =>
      hostBridge().onLayoutSelection(
        JSON.stringify({
          v: 1,
          selection: {
            type: "zone",
            index: 0,
            id: "meeting",
            kind: "meeting",
            name: "회의 구역",
            rect: [480, 140, 640, 660],
          },
        }),
      ),
    );
    expect(screen.getByTestId("layout-selection").textContent).toContain("회의 구역");
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(layoutCommand).toHaveBeenCalledWith(
      JSON.stringify({ op: "delete", category: "zone", index: 0 }),
    );
  });

  it("re-fetches and applies the layout when a remote save notice arrives", async () => {
    const issue = vi.fn(async () => ticketResponse());
    renderEmbed({ issue });
    frameWindow().__tsvs_setSession = vi.fn();
    const applyLayout = vi.fn();
    frameWindow().__tsvs_applyLayout = applyLayout;
    act(() => hostBridge().onGodotReady("{}"));
    await waitFor(() => expect(issue).toHaveBeenCalledTimes(1));
    await screen.findByTestId("godot-space-tab-street");
    spaceMocks.fetchLayout.mockClear();
    applyLayout.mockClear();

    const savedDef = { ...ROOM_DEF, name: "작업실 (수정)" };
    spaceMocks.fetchLayout.mockResolvedValue({
      definition: savedDef,
      revision: 5,
      updatedByUserId: "user-2",
      updatedAt: "2026-10-11T01:00:00.000Z",
    });
    act(() =>
      hostBridge().onLayoutRemote(
        JSON.stringify({ v: 1, spaceId: "studio-room", revision: 5 }),
      ),
    );
    await waitFor(() => expect(spaceMocks.fetchLayout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(applyLayout).toHaveBeenCalled());
    const applied = JSON.parse(applyLayout.mock.calls[0]?.[0] as string) as {
      spec: { name: string };
    };
    expect(applied.spec.name).toBe("작업실 (수정)");
  });
});

describe("StudioGodotSpaceEmbed — 표면 회귀 복구 (이모트·상호작용·위치 복원)", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_STUDIO_REALTIME_ORIGIN", "https://realtime.example.com");
    window.localStorage.clear();
    spaceMocks.fetchCatalog.mockReset().mockResolvedValue([ROOM_DEF, STREET_DEF]);
    spaceMocks.fetchLayout.mockReset().mockResolvedValue(null);
    spaceMocks.saveLayout.mockReset().mockImplementation(
      async (
        _workId: string,
        _spaceId: string,
        definition: typeof ROOM_DEF,
        expectedRevision: number,
      ) => ({
        definition,
        revision: expectedRevision + 1,
        updatedByUserId: "user-1",
        updatedAt: "2026-10-11T00:00:00.000Z",
      }),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("sends emote bar clicks to the stage", async () => {
    const issue = vi.fn(async () => ticketResponse());
    renderEmbed({ issue });
    const showEmote = vi.fn();
    frameWindow().__tsvs_showEmote = showEmote;
    fireEvent.click(screen.getByTestId("godot-emote-dance"));
    expect(showEmote).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(showEmote.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(payload).toMatchObject({ emote: "dance" });
  });

  it("logs incoming emotes and shows interact notices", async () => {
    const issue = vi.fn(async () => ticketResponse());
    renderEmbed({ issue });
    act(() =>
      hostBridge().onZoneChanged(
        JSON.stringify({
          selfZoneId: "meeting",
          selfActorId: "actor-self",
          selfClientId: "client-self",
          presenterActorId: "",
          peerClientIds: {},
          names: { "actor-peer": "파트너" },
          zones: [
            { zoneId: "meeting", kind: "meeting", name: "회의 구역", occupants: ["actor-self", "actor-peer"] },
          ],
        }),
      ),
    );
    act(() =>
      hostBridge().onEmote(
        JSON.stringify({ v: 1, fromActorId: "actor-peer", emote: "heart" }),
      ),
    );
    expect(screen.getByText("❤️")).toBeTruthy();
    act(() =>
      hostBridge().onInteract(
        JSON.stringify({ v: 1, kind: "board", zoneId: "meeting", x: 0.5, y: 0.2 }),
      ),
    );
    expect(screen.getByTestId("godot-interact-notice").textContent).toBe(
      "칠판을 보고 있어요",
    );
  });

  it("stores stage positions and restores them on the next session", async () => {
    const issue = vi.fn(async () => ticketResponse());
    renderEmbed({ issue });
    act(() =>
      hostBridge().onPosition(
        JSON.stringify({ v: 1, spaceId: "studio-room", x: 0.25, y: 0.75 }),
      ),
    );
    const stored = window.localStorage.getItem(`tsvs-last-position:${WORK_ID}`);
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored as string)).toMatchObject({
      spaceId: "studio-room",
      x: 0.25,
      y: 0.75,
    });

    const setSession = vi.fn();
    frameWindow().__tsvs_setSession = setSession;
    act(() => hostBridge().onGodotReady("{}"));
    await waitFor(() => expect(setSession).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(setSession.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(payload.restore).toMatchObject({ spaceId: "studio-room", x: 0.25, y: 0.75 });
  });
});
