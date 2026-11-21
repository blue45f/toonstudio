import { SELF, evictDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  P2P_MESH_SESSION_ID,
  REALTIME_PROTOCOL_VERSION,
  REALTIME_TICKET_PROTOCOL_PREFIX,
  REALTIME_WEBSOCKET_PROTOCOL,
} from "../src/protocol";
import {
  SPACE_KICKED_CLOSE_CODE,
  SPACE_KICKED_CLOSE_REASON,
  parseRealtimeWireServerMessage,
} from "../src/room-space-control";
import {
  normalizeRealtimeRoomObjectName,
  type RealtimeRoomScope,
} from "../src/security";
import {
  REALTIME_MAX_SPACE_YJS_UPDATE_BYTES,
  type RealtimeWireServerMessage,
} from "../src/space-protocol";
import {
  REALTIME_TICKET_VERSION,
  signRealtimeTicket,
  type RealtimeTicketClaims,
} from "../src/ticket";

const TEST_ORIGIN = "https://toonstudio.cloud";
const TEST_SECRET = "toonstudio-cloudflare-test-secret-32-bytes-minimum";

interface UpgradeResponse extends Response {
  readonly webSocket?: WebSocket;
}

interface AcceptedWebSocket extends WebSocket {
  accept(): void;
}

class WireMessageInbox {
  private readonly queued: RealtimeWireServerMessage[] = [];
  private readonly waiters: {
    readonly predicate: (message: RealtimeWireServerMessage) => boolean;
    readonly resolve: (message: RealtimeWireServerMessage) => void;
    readonly reject: (error: Error) => void;
    readonly timeoutId: ReturnType<typeof setTimeout>;
  }[] = [];

  constructor(socket: AcceptedWebSocket) {
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") {
        this.failAll(new Error("Expected textual realtime frame"));
        return;
      }
      const parsed = parseRealtimeWireServerMessage(event.data);
      if (!parsed.ok) {
        this.failAll(new Error(`Invalid server frame: ${parsed.code}`));
        return;
      }
      const idx = this.waiters.findIndex((w) => w.predicate(parsed.value));
      if (idx === -1) {
        this.queued.push(parsed.value);
        return;
      }
      const [waiter] = this.waiters.splice(idx, 1);
      clearTimeout(waiter.timeoutId);
      waiter.resolve(parsed.value);
    });
    socket.accept();
  }

  next(
    predicate: (message: RealtimeWireServerMessage) => boolean,
    label = "matching",
  ): Promise<RealtimeWireServerMessage> {
    const idx = this.queued.findIndex(predicate);
    if (idx !== -1) {
      return Promise.resolve(this.queued.splice(idx, 1)[0]);
    }
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const wIdx = this.waiters.findIndex((w) => w.timeoutId === timeoutId);
        if (wIdx !== -1) this.waiters.splice(wIdx, 1);
        reject(new Error(`Timed out waiting for ${label}`));
      }, 2_500);
      this.waiters.push({ predicate, resolve, reject, timeoutId });
    });
  }

  private failAll(error: Error): void {
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timeoutId);
      waiter.reject(error);
    }
  }
}

async function connectClient(
  scope: RealtimeRoomScope,
  overrides: Partial<RealtimeTicketClaims>,
): Promise<{
  readonly response: UpgradeResponse;
  readonly socket?: AcceptedWebSocket;
  readonly inbox?: WireMessageInbox;
}> {
  const nowMs = Date.now();
  const claims: RealtimeTicketClaims = {
    version: REALTIME_TICKET_VERSION,
    issuer: "toonspectrum-api",
    audience: "toonspectrum-realtime",
    subject: overrides.subject ?? `actor.${crypto.randomUUID()}`,
    sessionVersion: 1,
    authorizationEpochMs: nowMs - 5_000,
    workId: scope.workId,
    roomId: scope.roomId,
    clientId: overrides.clientId ?? `client.${crypto.randomUUID()}`,
    origin: TEST_ORIGIN,
    scopes: overrides.scopes ?? ["presence", "screen-signaling", "yjs-space"],
    ...(overrides.role === undefined ? {} : { role: overrides.role }),
    nonce: `nonce_${crypto.randomUUID().replaceAll("-", "")}`,
    issuedAtMs: nowMs,
    expiresAtMs: nowMs + 60_000,
    sessionExpiresAtMs: nowMs + 4 * 60_000,
  };
  const ticket = await signRealtimeTicket(claims, TEST_SECRET);
  const response = (await SELF.fetch(
    `https://realtime.test/v1/rooms/${encodeURIComponent(scope.workId)}/${encodeURIComponent(scope.roomId)}`,
    {
      headers: {
        Origin: TEST_ORIGIN,
        Upgrade: "websocket",
        "Sec-WebSocket-Protocol": [
          REALTIME_WEBSOCKET_PROTOCOL,
          `${REALTIME_TICKET_PROTOCOL_PREFIX}${ticket}`,
        ].join(", "),
      },
    },
  )) as UpgradeResponse;
  if (response.status !== 101 || !response.webSocket) {
    return { response };
  }
  const socket = response.webSocket as AcceptedWebSocket;
  return { response, socket, inbox: new WireMessageInbox(socket) };
}

describe("Cloudflare realtime Worker space extensions integration", () => {
  it("relays and replays yjs-space updates across eviction and enforces the 32KB bound", async () => {
    const scope: RealtimeRoomScope = {
      workId: "work.space.yjs",
      roomId: `room-${crypto.randomUUID()}`,
    };
    const host = await connectClient(scope, {
      subject: "actor.host.yjs",
      clientId: "client.host.yjs",
      scopes: ["presence", "comments", "screen-signaling", "yjs-space", "room-control"],
      role: "owner",
    });
    const peer = await connectClient(scope, {
      subject: "actor.peer.yjs",
      clientId: "client.peer.yjs",
      scopes: ["presence", "screen-signaling", "yjs-space"],
      role: "editor",
    });
    expect(host.response.status).toBe(101);
    expect(peer.response.status).toBe(101);

    const hostWelcome = await host.inbox!.next((m) => m.type === "welcome", "host welcome");
    await peer.inbox!.next((m) => m.type === "welcome", "peer welcome");
    expect(hostWelcome).toMatchObject({
      type: "welcome",
      channelStates: {
        "yjs-space": { currentSequence: 0, replayFloorSequence: 1 },
      },
    });

    // 정상 Yjs 업데이트 중계
    const updateKey = `yjs-upd-${crypto.randomUUID()}`;
    host.socket!.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "publish",
        idempotencyKey: updateKey,
        clientSequence: 1,
        sentAtMs: Date.now(),
        channel: "yjs-space",
        payload: {
          kind: "space.yjs-update",
          docKey: "whiteboardStrokes",
          updateBase64: "AQIDBAUGBwg=",
        },
      }),
    );
    await expect(
      host.inbox!.next((m) => m.type === "ack" && m.idempotencyKey === updateKey, "yjs ack"),
    ).resolves.toMatchObject({ channel: "yjs-space", sequence: 1, duplicate: false });
    await expect(
      peer.inbox!.next((m) => m.type === "event" && m.idempotencyKey === updateKey, "peer yjs event"),
    ).resolves.toMatchObject({
      channel: "yjs-space",
      sequence: 1,
      payload: {
        kind: "space.yjs-update",
        docKey: "whiteboardStrokes",
        updateBase64: "AQIDBAUGBwg=",
      },
    });

    // 상태 벡터 동기화 요청 중계
    const syncKey = `yjs-sync-${crypto.randomUUID()}`;
    peer.socket!.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "publish",
        idempotencyKey: syncKey,
        clientSequence: 1,
        sentAtMs: Date.now(),
        channel: "yjs-space",
        payload: {
          kind: "space.yjs-sync-request",
          docKey: "whiteboardStrokes",
          stateVectorBase64: "AAAA",
        },
      }),
    );
    await expect(
      host.inbox!.next((m) => m.type === "event" && m.idempotencyKey === syncKey, "sync request"),
    ).resolves.toMatchObject({ channel: "yjs-space", sequence: 2 });

    // 32KB 초과 업데이트 프레임 거부
    peer.socket!.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "publish",
        idempotencyKey: `yjs-oversized-${crypto.randomUUID()}`,
        clientSequence: 2,
        sentAtMs: Date.now(),
        channel: "yjs-space",
        payload: {
          kind: "space.yjs-update",
          docKey: "whiteboardStrokes",
          updateBase64: "A".repeat(REALTIME_MAX_SPACE_YJS_UPDATE_BYTES + 4),
        },
      }),
    );
    await expect(
      peer.inbox!.next((m) => m.type === "error", "oversized yjs error"),
    ).resolves.toMatchObject({ type: "error", code: "invalid-payload" });

    // DO 퇴거 후 신규 참가자 resume 리플레이 검증
    const roomStub = env.REALTIME_ROOMS.get(
      env.REALTIME_ROOMS.idFromName(normalizeRealtimeRoomObjectName(scope)),
    );
    await evictDurableObject(roomStub);

    const lateJoiner = await connectClient(scope, {
      subject: "actor.late.yjs",
      clientId: "client.late.yjs",
      scopes: ["presence", "yjs-space"],
      role: "editor",
    });
    const lateWelcome = await lateJoiner.inbox!.next((m) => m.type === "welcome", "late welcome");
    expect(lateWelcome).toMatchObject({
      channelStates: { "yjs-space": { currentSequence: 2, replayFloorSequence: 1 } },
    });
    lateJoiner.socket!.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "resume",
        channel: "yjs-space",
        afterSequence: 0,
      }),
    );
    const replay = await lateJoiner.inbox!.next((m) => m.type === "replay" && m.channel === "yjs-space", "yjs replay");
    expect(replay).toMatchObject({
      type: "replay",
      channel: "yjs-space",
      fromSequence: 1,
      toSequence: 2,
      complete: true,
    });
    if (replay.type === "replay") {
      expect(replay.events).toHaveLength(2);
    }

    host.socket!.close(1000, "done");
    peer.socket!.close(1000, "done");
    lateJoiner.socket!.close(1000, "done");
  });

  it("enforces guest-voice boundaries: allows presence/voice-signaling/collab-yjs, blocks destructive & room-control", async () => {
    const scope: RealtimeRoomScope = {
      workId: "work.space.guest",
      roomId: `room-${crypto.randomUUID()}`,
    };
    const host = await connectClient(scope, {
      subject: "actor.host.guest",
      clientId: "client.host.guest",
      scopes: ["presence", "screen-signaling", "yjs-space", "room-control"],
      role: "owner",
    });
    const guest = await connectClient(scope, {
      subject: "actor.guest.voice",
      clientId: "client.guest.voice",
      scopes: ["presence", "screen-signaling", "yjs-space", "guest-voice"],
      role: "guest-voice",
    });
    await host.inbox!.next((m) => m.type === "welcome", "host welcome");
    await guest.inbox!.next((m) => m.type === "welcome", "guest welcome");

    // 1. guest-voice presence 허용
    const presKey = `guest-pres-${crypto.randomUUID()}`;
    guest.socket!.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "publish",
        idempotencyKey: presKey,
        clientSequence: 1,
        sentAtMs: Date.now(),
        channel: "presence",
        payload: {
          kind: "presence.update",
          pageId: null,
          profile: { displayName: "초대 게스트", role: "guest-voice", state: "active" },
          tool: "mic",
        },
      }),
    );
    await expect(
      host.inbox!.next((m) => m.type === "event" && m.idempotencyKey === presKey, "guest presence"),
    ).resolves.toMatchObject({
      payload: { kind: "presence.update", profile: { role: "guest-voice" } },
    });

    // 2. 음성 허들 P2P 시그널링(p2p-mesh-v1) 허용
    const voiceOfferKey = `guest-voice-offer-${crypto.randomUUID()}`;
    guest.socket!.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "publish",
        idempotencyKey: voiceOfferKey,
        clientSequence: 2,
        sentAtMs: Date.now(),
        channel: "screen-signaling",
        payload: {
          kind: "signal.offer",
          sessionId: P2P_MESH_SESSION_ID,
          peerConnectionId: "voice-pc-1",
          targetClientId: "client.host.guest",
          sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111",
        },
      }),
    );
    await expect(
      host.inbox!.next((m) => m.type === "event" && m.idempotencyKey === voiceOfferKey, "guest voice offer"),
    ).resolves.toMatchObject({ channel: "screen-signaling", clientId: "client.guest.voice" });

    // 3. 협업 yjs-space 참여(stickyNotes) 허용
    const stickyKey = `guest-sticky-${crypto.randomUUID()}`;
    guest.socket!.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "publish",
        idempotencyKey: stickyKey,
        clientSequence: 3,
        sentAtMs: Date.now(),
        channel: "yjs-space",
        payload: { kind: "space.yjs-update", docKey: "stickyNotes", updateBase64: "AQIDBA==" },
      }),
    );
    await expect(
      guest.inbox!.next((m) => m.type === "ack" && m.idempotencyKey === stickyKey, "guest sticky ack"),
    ).resolves.toMatchObject({ channel: "yjs-space", duplicate: false });

    // 4. 표시 프로필 role을 owner로 위조해도 방장 제어·파괴적 룸 설정은 fail-closed(scope-denied) 차단
    const spoofKey = `guest-spoof-${crypto.randomUUID()}`;
    guest.socket!.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "publish",
        idempotencyKey: spoofKey,
        clientSequence: 4,
        sentAtMs: Date.now(),
        channel: "presence",
        payload: {
          kind: "presence.update",
          pageId: null,
          profile: { displayName: "위조 시도", role: "owner", state: "active" },
          tool: null,
        },
      }),
    );
    await guest.inbox!.next((m) => m.type === "ack" && m.idempotencyKey === spoofKey, "spoof ack");

    const blockedControlKey = `guest-ctrl-${crypto.randomUUID()}`;
    guest.socket!.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "publish",
        idempotencyKey: blockedControlKey,
        clientSequence: 5,
        sentAtMs: Date.now(),
        channel: "yjs-space",
        payload: { kind: "space.room-control", action: "lock-room" },
      }),
    );
    await expect(
      guest.inbox!.next((m) => m.type === "error" && m.idempotencyKey === blockedControlKey, "guest ctrl denied"),
    ).resolves.toMatchObject({ type: "error", code: "scope-denied", channel: "yjs-space" });

    const blockedPresetKey = `guest-preset-${crypto.randomUUID()}`;
    guest.socket!.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "publish",
        idempotencyKey: blockedPresetKey,
        clientSequence: 5,
        sentAtMs: Date.now(),
        channel: "yjs-space",
        payload: { kind: "space.yjs-update", docKey: "roomPreset", updateBase64: "AAAA" },
      }),
    );
    await expect(
      guest.inbox!.next((m) => m.type === "error" && m.idempotencyKey === blockedPresetKey, "guest preset denied"),
    ).resolves.toMatchObject({ type: "error", code: "scope-denied", channel: "yjs-space" });

    host.socket!.close(1000, "done");
    guest.socket!.close(1000, "done");
  });

  it("enforces host room-control (edit-lock, lock/unlock persistence, non-host denial, kick-peer 4003)", async () => {
    const scope: RealtimeRoomScope = {
      workId: "work.space.ctrl",
      roomId: `room-${crypto.randomUUID()}`,
    };
    const host = await connectClient(scope, {
      subject: "actor.host.ctrl",
      clientId: "client.host.ctrl",
      scopes: ["presence", "screen-signaling", "yjs-space", "room-control"],
      role: "owner",
    });
    const editor = await connectClient(scope, {
      subject: "actor.editor.ctrl",
      clientId: "client.editor.ctrl",
      scopes: ["presence", "screen-signaling", "yjs-space"],
      role: "editor",
    });
    await host.inbox!.next((m) => m.type === "welcome", "host welcome");
    await editor.inbox!.next((m) => m.type === "welcome", "editor welcome");

    // 비권한 에디터의 room-control 차단
    const editorDenyKey = `ed-ctrl-${crypto.randomUUID()}`;
    editor.socket!.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "publish",
        idempotencyKey: editorDenyKey,
        clientSequence: 1,
        sentAtMs: Date.now(),
        channel: "yjs-space",
        payload: { kind: "space.room-control", action: "mute-peer", targetClientId: "client.host.ctrl" },
      }),
    );
    await expect(
      editor.inbox!.next((m) => m.type === "error" && m.idempotencyKey === editorDenyKey, "editor denied"),
    ).resolves.toMatchObject({ type: "error", code: "scope-denied" });

    // 방장 toggle-edit-lock 활성화 -> 에디터 Yjs 쓰기 차단
    const editLockKey = `host-edit-lock-${crypto.randomUUID()}`;
    host.socket!.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "publish",
        idempotencyKey: editLockKey,
        clientSequence: 1,
        sentAtMs: Date.now(),
        channel: "yjs-space",
        payload: { kind: "space.room-control", action: "toggle-edit-lock", locked: true },
      }),
    );
    await host.inbox!.next((m) => m.type === "ack" && m.idempotencyKey === editLockKey, "edit-lock ack");

    const blockedWriteKey = `ed-write-locked-${crypto.randomUUID()}`;
    editor.socket!.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "publish",
        idempotencyKey: blockedWriteKey,
        clientSequence: 1,
        sentAtMs: Date.now(),
        channel: "yjs-space",
        payload: { kind: "space.yjs-update", docKey: "whiteboardStrokes", updateBase64: "AAAA" },
      }),
    );
    await expect(
      editor.inbox!.next((m) => m.type === "error" && m.idempotencyKey === blockedWriteKey, "locked write denied"),
    ).resolves.toMatchObject({ type: "error", code: "scope-denied" });

    // 방장 lock-room -> DO 퇴거 후에도 신규 비권한 입장 403(room-locked) 차단
    const lockRoomKey = `host-lock-${crypto.randomUUID()}`;
    host.socket!.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "publish",
        idempotencyKey: lockRoomKey,
        clientSequence: 2,
        sentAtMs: Date.now(),
        channel: "yjs-space",
        payload: { kind: "space.room-control", action: "lock-room" },
      }),
    );
    await host.inbox!.next((m) => m.type === "ack" && m.idempotencyKey === lockRoomKey, "lock-room ack");

    const roomStub = env.REALTIME_ROOMS.get(
      env.REALTIME_ROOMS.idFromName(normalizeRealtimeRoomObjectName(scope)),
    );
    await evictDurableObject(roomStub);

    const blockedJoin = await connectClient(scope, {
      subject: "actor.blocked.join",
      clientId: "client.blocked.join",
      scopes: ["presence", "screen-signaling", "yjs-space", "guest-voice"],
      role: "guest-voice",
    });
    expect(blockedJoin.response.status).toBe(403);
    await expect(blockedJoin.response.json()).resolves.toMatchObject({ code: "room-locked" });

    // 방장 재접속 후 unlock-room 및 kick-peer (대상 소켓 통지 + 4003 "kicked-by-host" 종료)
    const host2 = await connectClient(scope, {
      subject: "actor.host.ctrl2",
      clientId: "client.host.ctrl2",
      scopes: ["presence", "screen-signaling", "yjs-space", "room-control"],
      role: "admin",
    });
    expect(host2.response.status).toBe(101);
    await host2.inbox!.next((m) => m.type === "welcome", "host2 welcome");

    const unlockKey = `host-unlock-${crypto.randomUUID()}`;
    host2.socket!.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "publish",
        idempotencyKey: unlockKey,
        clientSequence: 1,
        sentAtMs: Date.now(),
        channel: "yjs-space",
        payload: { kind: "space.room-control", action: "unlock-room" },
      }),
    );
    await host2.inbox!.next((m) => m.type === "ack" && m.idempotencyKey === unlockKey, "unlock ack");

    const victim = await connectClient(scope, {
      subject: "actor.victim",
      clientId: "client.victim",
      scopes: ["presence", "screen-signaling", "yjs-space", "guest-voice"],
      role: "guest-voice",
    });
    expect(victim.response.status).toBe(101);
    await victim.inbox!.next((m) => m.type === "welcome", "victim welcome");

    const victimClosed = new Promise<{ code: number; reason: string }>((resolve) => {
      victim.socket!.addEventListener("close", (event) => {
        const closeEvent = event as CloseEvent;
        resolve({ code: closeEvent.code, reason: closeEvent.reason });
      });
    });

    const kickKey = `host-kick-${crypto.randomUUID()}`;
    host2.socket!.send(
      JSON.stringify({
        version: REALTIME_PROTOCOL_VERSION,
        type: "publish",
        idempotencyKey: kickKey,
        clientSequence: 2,
        sentAtMs: Date.now(),
        channel: "yjs-space",
        payload: { kind: "space.room-control", action: "kick-peer", targetClientId: "client.victim" },
      }),
    );
    await expect(
      victim.inbox!.next((m) => m.type === "event" && m.idempotencyKey === kickKey, "victim kick notice"),
    ).resolves.toMatchObject({
      payload: { kind: "space.room-control", action: "kick-peer", targetClientId: "client.victim" },
    });
    await expect(victimClosed).resolves.toEqual({
      code: SPACE_KICKED_CLOSE_CODE,
      reason: SPACE_KICKED_CLOSE_REASON,
    });

    host.socket!.close(1000, "done");
    editor.socket!.close(1000, "done");
    host2.socket!.close(1000, "done");
  });
});
