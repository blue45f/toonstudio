import { describe, expect, it } from "vitest";

import {
  REALTIME_PROTOCOL_VERSION,
  parseRealtimeClientMessage,
  parseRealtimeServerMessage,
} from "./protocol";
import {
  INITIAL_SPACE_ROOM_CONTROL_STATE,
  applySpaceRoomControl,
  authorizeRoomEntry,
  authorizeSpacePublish,
  parseRealtimeWireClientMessage,
  resolveSpaceChannelRateLimit,
} from "./room-space-control";
import {
  REALTIME_MAX_SPACE_STATE_VECTOR_BYTES,
  REALTIME_MAX_SPACE_YJS_UPDATE_BYTES,
  SPACE_ROOM_CONTROL_ACTIONS,
  SPACE_YJS_DOC_KEYS,
  isPureBase64,
  type RealtimeWireChannel,
} from "./space-protocol";
import {
  REALTIME_TICKET_VERSION,
  signRealtimeTicket,
  verifyRealtimeTicket,
  type RealtimeTicketClaims,
} from "./ticket";

const SECRET = "0123456789abcdef0123456789abcdef"; // gitleaks:allow -- deterministic unit-test fixture
const NOW = 1_700_000_000_000;

function publishFrame(channel: RealtimeWireChannel, payload: unknown): string {
  return JSON.stringify({
    version: REALTIME_PROTOCOL_VERSION,
    type: "publish",
    idempotencyKey: "space-event-0001",
    clientSequence: 1,
    sentAtMs: NOW,
    channel,
    payload,
  });
}

function buildClaims(
  overrides: Partial<RealtimeTicketClaims> = {},
): RealtimeTicketClaims {
  return {
    version: REALTIME_TICKET_VERSION,
    issuer: "toonspectrum-api",
    audience: "toonspectrum-realtime",
    subject: "artist-space-1",
    sessionVersion: 1,
    authorizationEpochMs: NOW - 5_000,
    workId: "work-space-1",
    roomId: "room-space-1",
    clientId: "client-space-1",
    origin: "https://toonstudio.cloud",
    scopes: ["presence", "screen-signaling", "yjs-space"],
    nonce: "nonce_space_0123456789",
    issuedAtMs: NOW - 1_000,
    expiresAtMs: NOW + 60_000,
    sessionExpiresAtMs: NOW + 4 * 60 * 1000,
    ...overrides,
  };
}

describe("space-protocol: yjs-space · guest-voice · room-control", () => {
  it("validates pure base64 without colliding with forbidden data URIs", () => {
    expect(isPureBase64("AAECAw==", 16)).toBe(true);
    expect(isPureBase64("AAAA", 4)).toBe(true);
    expect(isPureBase64("A".repeat(REALTIME_MAX_SPACE_YJS_UPDATE_BYTES), REALTIME_MAX_SPACE_YJS_UPDATE_BYTES)).toBe(true);
    expect(isPureBase64("A".repeat(REALTIME_MAX_SPACE_YJS_UPDATE_BYTES + 4), REALTIME_MAX_SPACE_YJS_UPDATE_BYTES)).toBe(false);
    expect(isPureBase64("", 16)).toBe(false);
    expect(isPureBase64("ABC", 16)).toBe(false);
    expect(isPureBase64("data:application/octet-stream;base64,AAEC", 128)).toBe(false);
    expect(isPureBase64("data:image/png;base64,AAEC", 128)).toBe(false);
    expect(isPureBase64("AAEC\nAw==", 16)).toBe(false);
  });

  it("accepts space.yjs-update for every whitelisted docKey up to 32KB and rejects invalid frames", () => {
    for (const docKey of SPACE_YJS_DOC_KEYS) {
      const parsed = parseRealtimeWireClientMessage(
        publishFrame("yjs-space", {
          kind: "space.yjs-update",
          docKey,
          updateBase64: "AQIDBA==",
        }),
      );
      expect(parsed.ok, docKey).toBe(true);
    }

    // 32KB 경계 통과, 32KB+4 초과 거부
    expect(
      parseRealtimeClientMessage(
        publishFrame("yjs-space", {
          kind: "space.yjs-update",
          docKey: "whiteboardStrokes",
          updateBase64: "A".repeat(REALTIME_MAX_SPACE_YJS_UPDATE_BYTES),
        }),
      ).ok,
    ).toBe(true);
    expect(
      parseRealtimeClientMessage(
        publishFrame("yjs-space", {
          kind: "space.yjs-update",
          docKey: "whiteboardStrokes",
          updateBase64: "A".repeat(REALTIME_MAX_SPACE_YJS_UPDATE_BYTES + 4),
        }),
      ),
    ).toEqual({ ok: false, code: "invalid-payload" });

    // 미허용 docKey, data URI, 여분 키, 잘못된 채널 거부
    expect(
      parseRealtimeClientMessage(
        publishFrame("yjs-space", {
          kind: "space.yjs-update",
          docKey: "arbitrarySecretDoc",
          updateBase64: "AQIDBA==",
        }),
      ),
    ).toEqual({ ok: false, code: "invalid-payload" });
    expect(
      parseRealtimeClientMessage(
        publishFrame("yjs-space", {
          kind: "space.yjs-update",
          docKey: "lighting",
          updateBase64: "data:application/octet-stream;base64,AQID",
        }),
      ),
    ).toEqual({ ok: false, code: "invalid-payload" });
    expect(
      parseRealtimeClientMessage(
        publishFrame("presence", {
          kind: "space.yjs-update",
          docKey: "lighting",
          updateBase64: "AQIDBA==",
        }),
      ),
    ).toEqual({ ok: false, code: "invalid-payload" });
  });

  it("validates space.yjs-sync-request with optional docKey and bounded stateVectorBase64", () => {
    expect(
      parseRealtimeClientMessage(
        publishFrame("yjs-space", { kind: "space.yjs-sync-request" }),
      ).ok,
    ).toBe(true);
    expect(
      parseRealtimeClientMessage(
        publishFrame("yjs-space", {
          kind: "space.yjs-sync-request",
          docKey: "stickyNotes",
          stateVectorBase64: "AAAA",
        }),
      ).ok,
    ).toBe(true);
    expect(
      parseRealtimeClientMessage(
        publishFrame("yjs-space", {
          kind: "space.yjs-sync-request",
          stateVectorBase64: "A".repeat(REALTIME_MAX_SPACE_STATE_VECTOR_BYTES + 4),
        }),
      ),
    ).toEqual({ ok: false, code: "invalid-payload" });
    expect(
      parseRealtimeClientMessage(
        publishFrame("yjs-space", {
          kind: "space.yjs-sync-request",
          docKey: "unknownDoc",
        }),
      ),
    ).toEqual({ ok: false, code: "invalid-payload" });
  });

  it("allows guest-voice in presence.update and rejects unknown roles", () => {
    const valid = parseRealtimeClientMessage(
      publishFrame("presence", {
        kind: "presence.update",
        pageId: null,
        profile: {
          displayName: "초대 손님",
          role: "guest-voice",
          state: "active",
        },
        tool: "voice-huddle",
      }),
    );
    expect(valid.ok).toBe(true);

    const invalid = parseRealtimeClientMessage(
      publishFrame("presence", {
        kind: "presence.update",
        pageId: null,
        profile: {
          displayName: "초대 손님",
          role: "superadmin",
          state: "active",
        },
        tool: null,
      }),
    );
    expect(invalid).toEqual({ ok: false, code: "invalid-payload" });
  });

  it("validates all 6 space.room-control actions and rejects malformed combinations", () => {
    const validPayloads = [
      { kind: "space.room-control", action: "mute-peer", targetClientId: "peer-1", locked: true },
      { kind: "space.room-control", action: "lock-room" },
      { kind: "space.room-control", action: "lock-room", locked: true },
      { kind: "space.room-control", action: "unlock-room", locked: false },
      { kind: "space.room-control", action: "set-presenter", targetClientId: "peer-2" },
      { kind: "space.room-control", action: "set-presenter" },
      { kind: "space.room-control", action: "toggle-edit-lock", locked: true },
      { kind: "space.room-control", action: "kick-peer", targetClientId: "peer-3" },
    ] as const;

    expect(SPACE_ROOM_CONTROL_ACTIONS).toHaveLength(6);
    for (const payload of validPayloads) {
      expect(parseRealtimeClientMessage(publishFrame("yjs-space", payload)).ok).toBe(true);
      expect(parseRealtimeClientMessage(publishFrame("presence", payload)).ok).toBe(true);
      expect(parseRealtimeClientMessage(publishFrame("comments", payload))).toEqual({
        ok: false,
        code: "invalid-payload",
      });
    }

    // 잘못된 조합 거부
    for (const bad of [
      { kind: "space.room-control", action: "kick-peer" },
      { kind: "space.room-control", action: "mute-peer" },
      { kind: "space.room-control", action: "kick-peer", targetClientId: "peer-1", locked: true },
      { kind: "space.room-control", action: "lock-room", targetClientId: "peer-1" },
      { kind: "space.room-control", action: "lock-room", locked: false },
      { kind: "space.room-control", action: "unlock-room", locked: true },
      { kind: "space.room-control", action: "destroy-room" },
    ]) {
      expect(parseRealtimeClientMessage(publishFrame("yjs-space", bad))).toEqual({
        ok: false,
        code: "invalid-payload",
      });
    }
  });

  it("signs and verifies guest-voice and host room-control tickets while rejecting contradictory claims", async () => {
    const expectation = {
      issuer: "toonspectrum-api",
      audience: "toonspectrum-realtime",
      workId: "work-space-1",
      roomId: "room-space-1",
      origin: "https://toonstudio.cloud",
      nowMs: NOW,
    };
    const guestClaims = buildClaims({
      scopes: ["presence", "screen-signaling", "yjs-space", "guest-voice"],
      role: "guest-voice",
    });
    const guestTicket = await signRealtimeTicket(guestClaims, SECRET);
    await expect(verifyRealtimeTicket(guestTicket, SECRET, expectation)).resolves.toEqual({
      ok: true,
      claims: guestClaims,
    });

    const hostClaims = buildClaims({
      scopes: ["presence", "comments", "screen-signaling", "yjs-space", "room-control"],
      role: "owner",
    });
    const hostTicket = await signRealtimeTicket(hostClaims, SECRET);
    await expect(verifyRealtimeTicket(hostTicket, SECRET, expectation)).resolves.toEqual({
      ok: true,
      claims: hostClaims,
    });

    // 게스트/뷰어/일반 에디터에 room-control 동시 부여 시 fail-closed 거부
    for (const bad of [
      buildClaims({ scopes: ["presence", "yjs-space", "guest-voice", "room-control"], role: "guest-voice" }),
      buildClaims({ scopes: ["presence", "yjs-space", "room-control"], role: "guest-voice" }),
      buildClaims({ scopes: ["presence", "yjs-space", "room-control"], role: "editor" }),
      buildClaims({ scopes: ["presence", "yjs-space", "room-control"], role: "viewer" }),
      buildClaims({ scopes: ["presence", "yjs-space", "guest-voice"], role: "owner" }),
    ]) {
      await expect(signRealtimeTicket(bad, SECRET)).rejects.toThrow("Invalid realtime ticket claims");
    }
  });

  it("enforces fail-closed server authorization for guest-voice, viewer, editor, and host room-control", () => {
    const host = { clientId: "c-host", scopes: ["presence", "screen-signaling", "yjs-space", "room-control"] as const, role: "owner" as const };
    const editor = { clientId: "c-editor", scopes: ["presence", "screen-signaling", "yjs-space"] as const, role: "editor" as const };
    const guest = { clientId: "c-guest", scopes: ["presence", "screen-signaling", "yjs-space", "guest-voice"] as const, role: "guest-voice" as const };
    const viewer = { clientId: "c-viewer", scopes: ["presence", "yjs-space"] as const, role: "viewer" as const };

    const kickPayload = { kind: "space.room-control", action: "kick-peer", targetClientId: "c-guest" } as const;
    const roomPresetUpdate = { kind: "space.yjs-update", docKey: "roomPreset", updateBase64: "AAAA" } as const;
    const whiteboardUpdate = { kind: "space.yjs-update", docKey: "whiteboardStrokes", updateBase64: "AAAA" } as const;
    const syncRequest = { kind: "space.yjs-sync-request" } as const;

    // 방장 제어 경계
    expect(authorizeSpacePublish(host, "yjs-space", kickPayload, INITIAL_SPACE_ROOM_CONTROL_STATE)).toEqual({ ok: true });
    expect(authorizeSpacePublish(editor, "yjs-space", kickPayload, INITIAL_SPACE_ROOM_CONTROL_STATE)).toEqual({ ok: false, code: "scope-denied" });
    expect(authorizeSpacePublish(guest, "yjs-space", kickPayload, INITIAL_SPACE_ROOM_CONTROL_STATE)).toEqual({ ok: false, code: "scope-denied" });
    expect(authorizeSpacePublish(viewer, "yjs-space", kickPayload, INITIAL_SPACE_ROOM_CONTROL_STATE)).toEqual({ ok: false, code: "scope-denied" });

    // guest-voice: 협업 참여 허용, 파괴적 룸 설정·레이아웃·방장 제어 차단
    expect(authorizeSpacePublish(guest, "yjs-space", syncRequest, INITIAL_SPACE_ROOM_CONTROL_STATE)).toEqual({ ok: true });
    expect(authorizeSpacePublish(guest, "yjs-space", whiteboardUpdate, INITIAL_SPACE_ROOM_CONTROL_STATE)).toEqual({ ok: true });
    expect(authorizeSpacePublish(guest, "yjs-space", roomPresetUpdate, INITIAL_SPACE_ROOM_CONTROL_STATE)).toEqual({ ok: false, code: "scope-denied" });
    expect(
      authorizeSpacePublish(guest, "presence", { kind: "presence.layout", spaceId: "cafe", revision: 2 }, INITIAL_SPACE_ROOM_CONTROL_STATE),
    ).toEqual({ ok: false, code: "scope-denied" });

    // viewer: 읽기(sync-request)만 허용, 쓰기(yjs-update) 차단
    expect(authorizeSpacePublish(viewer, "yjs-space", syncRequest, INITIAL_SPACE_ROOM_CONTROL_STATE)).toEqual({ ok: true });
    expect(authorizeSpacePublish(viewer, "yjs-space", whiteboardUpdate, INITIAL_SPACE_ROOM_CONTROL_STATE)).toEqual({ ok: false, code: "scope-denied" });

    // 편집 잠금·방 잠금 상태 전이
    let state = applySpaceRoomControl(INITIAL_SPACE_ROOM_CONTROL_STATE, { kind: "space.room-control", action: "toggle-edit-lock", locked: true });
    expect(authorizeSpacePublish(editor, "yjs-space", whiteboardUpdate, state)).toEqual({ ok: false, code: "scope-denied" });
    expect(authorizeSpacePublish(host, "yjs-space", whiteboardUpdate, state)).toEqual({ ok: true });

    state = applySpaceRoomControl(state, { kind: "space.room-control", action: "lock-room" });
    expect(authorizeRoomEntry(guest, state)).toEqual({ ok: false, status: 403, code: "room-locked" });
    expect(authorizeRoomEntry(host, state)).toEqual({ ok: true });

    state = applySpaceRoomControl(state, { kind: "space.room-control", action: "mute-peer", targetClientId: "c-guest", locked: true });
    state = applySpaceRoomControl(state, { kind: "space.room-control", action: "set-presenter", targetClientId: "c-editor" });
    expect(state).toEqual({
      roomLocked: true,
      editLocked: true,
      presenterClientId: "c-editor",
      mutedClientIds: ["c-guest"],
    });
  });

  it("parses extended server welcome with optional yjs-space channelStates and validates rate limit config", () => {
    const welcome = {
      version: REALTIME_PROTOCOL_VERSION,
      type: "welcome",
      workId: "work-1",
      roomId: "room-1",
      connectionId: "conn-1",
      actorId: "actor-1",
      clientId: "client-1",
      scopes: ["presence", "screen-signaling", "yjs-space", "guest-voice"],
      channelStates: {
        presence: { currentSequence: 0, replayFloorSequence: 1 },
        comments: { currentSequence: 0, replayFloorSequence: 1 },
        "screen-signaling": { currentSequence: 0, replayFloorSequence: 1 },
        "yjs-space": { currentSequence: 4, replayFloorSequence: 1 },
      },
      sessionExpiresAtMs: NOW + 60_000,
    };
    expect(parseRealtimeServerMessage(JSON.stringify(welcome))).toEqual({
      ok: true,
      value: welcome,
    });
    expect(
      resolveSpaceChannelRateLimit({
        REALTIME_YJS_SPACE_MAX_EVENTS_PER_WINDOW: "300",
        REALTIME_YJS_SPACE_MAX_BYTES_PER_WINDOW: "2097152",
      }),
    ).toEqual({ maximumEvents: 300, maximumBytes: 2_097_152 });
  });
});
