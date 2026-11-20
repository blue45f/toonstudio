import {
  REALTIME_MAX_INBOUND_FRAME_BYTES,
  REALTIME_MAX_OUTBOUND_FRAME_BYTES,
  isRealtimeId,
  parseRealtimeClientMessage,
  parseRealtimeServerMessage,
  serializeRealtimeServerMessage,
} from "./protocol";
import {
  REALTIME_ALL_CHANNELS,
  REALTIME_SPACE_CHANNEL,
  REALTIME_TICKET_SCOPES,
  isRealtimeSpaceRole,
  isRealtimeTicketScope,
  isRealtimeWireChannel,
  validateSpaceRoomControlPayload,
  type RealtimeSpaceRole,
  type RealtimeTicketScope,
  type RealtimeWireChannel,
  type RealtimeWirePayload,
  type RealtimeWireServerMessage,
  type SpaceRoomControlPayload,
  type SpaceYjsDocKey,
  type WireClientMessageParseResult,
  type WireServerMessageParseResult,
} from "./space-protocol";

import type { RealtimeChannelRateLimit } from "./room-core";
import type {
  HibernatableWebSocket,
  RealtimeWorkerEnv,
  SqlStorageLike,
} from "./runtime-types";

export function parseRealtimeWireClientMessage(
  source: string,
  maximumBytes = REALTIME_MAX_INBOUND_FRAME_BYTES,
): WireClientMessageParseResult {
  return parseRealtimeClientMessage(
    source,
    maximumBytes,
  ) as unknown as WireClientMessageParseResult;
}

export function parseRealtimeWireServerMessage(
  source: string,
): WireServerMessageParseResult {
  return parseRealtimeServerMessage(
    source,
  ) as unknown as WireServerMessageParseResult;
}

export function serializeRealtimeWireServerMessage(
  message: RealtimeWireServerMessage,
): string {
  return serializeRealtimeServerMessage(
    message as unknown as Parameters<typeof serializeRealtimeServerMessage>[0],
  );
}

export const SPACE_KICKED_CLOSE_CODE = 4003 as const;
export const SPACE_KICKED_CLOSE_REASON = "kicked-by-host" as const;

export const DEFAULT_SPACE_YJS_RATE_LIMIT: RealtimeChannelRateLimit = {
  maximumEvents: 600,
  maximumBytes: 8 * 1024 * 1024,
};

/**
 * 파괴적 룸 설정 키: 초대 게스트(`guest-voice`)는 룸 프리셋·조명·구조 데코를
 * 변경할 수 없으며, 화이트보드·스티키 노트·리뷰 핀 등 협업 참여 키만 기록한다.
 */
export const SPACE_DESTRUCTIVE_ROOM_DOC_KEYS: ReadonlySet<SpaceYjsDocKey> =
  new Set<SpaceYjsDocKey>(["roomPreset", "lighting", "decorations"]);

export interface SpaceConnectionAuth {
  readonly clientId: string;
  readonly scopes: readonly RealtimeTicketScope[];
  readonly role?: RealtimeSpaceRole;
}

export interface SpaceRoomControlState {
  readonly roomLocked: boolean;
  readonly editLocked: boolean;
  readonly presenterClientId: string | null;
  readonly mutedClientIds: readonly string[];
}

export const INITIAL_SPACE_ROOM_CONTROL_STATE: SpaceRoomControlState =
  Object.freeze({
    roomLocked: false,
    editLocked: false,
    presenterClientId: null,
    mutedClientIds: Object.freeze([]),
  });

export type SpacePublishAuthorization =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: "scope-denied" };

export type SpaceRoomEntryAuthorization =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: 403; readonly code: "room-locked" };

function parsePositiveBoundedInt(
  source: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  if (source === undefined || source.trim() === "") {
    return fallback;
  }
  if (!/^[1-9][0-9]*$/u.test(source)) {
    throw new Error(`${name} must be a positive base-10 integer`);
  }
  const parsed = Number(source);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} is outside the supported range`);
  }
  return parsed;
}

export function resolveSpaceChannelRateLimit(
  env: Pick<
    RealtimeWorkerEnv,
    | "REALTIME_YJS_SPACE_MAX_EVENTS_PER_WINDOW"
    | "REALTIME_YJS_SPACE_MAX_BYTES_PER_WINDOW"
  >,
): RealtimeChannelRateLimit {
  return {
    maximumEvents: parsePositiveBoundedInt(
      env.REALTIME_YJS_SPACE_MAX_EVENTS_PER_WINDOW,
      DEFAULT_SPACE_YJS_RATE_LIMIT.maximumEvents,
      1, 100_000, "REALTIME_YJS_SPACE_MAX_EVENTS_PER_WINDOW",
    ),
    maximumBytes: parsePositiveBoundedInt(
      env.REALTIME_YJS_SPACE_MAX_BYTES_PER_WINDOW,
      DEFAULT_SPACE_YJS_RATE_LIMIT.maximumBytes,
      REALTIME_MAX_OUTBOUND_FRAME_BYTES, 64 * 1024 * 1024,
      "REALTIME_YJS_SPACE_MAX_BYTES_PER_WINDOW",
    ),
  };
}

export function isGuestVoiceConnection(auth: SpaceConnectionAuth): boolean {
  return auth.role === "guest-voice" || auth.scopes.includes("guest-voice");
}

export function isViewerConnection(auth: SpaceConnectionAuth): boolean {
  return auth.role === "viewer";
}

/**
 * 방장 제어 권한은 HMAC 서명 티켓에서 유래한 서버 소유 스코프·역할만 신뢰한다.
 * 클라이언트가 보내는 presence.update display role은 절대 사용하지 않는다.
 */
export function isHostControlAuthorized(auth: SpaceConnectionAuth): boolean {
  if (
    isGuestVoiceConnection(auth) ||
    auth.role === "viewer" || auth.role === "editor" || auth.role === "commenter"
  ) {
    return false;
  }
  return auth.role === "owner" || auth.role === "admin" || auth.scopes.includes("room-control");
}

export function authorizeRoomEntry(
  auth: SpaceConnectionAuth,
  controlState: SpaceRoomControlState,
): SpaceRoomEntryAuthorization {
  if (controlState.roomLocked && !isHostControlAuthorized(auth)) {
    return { ok: false, status: 403, code: "room-locked" };
  }
  return { ok: true };
}

export function authorizeSpacePublish(
  auth: SpaceConnectionAuth,
  channel: RealtimeWireChannel,
  payload: RealtimeWirePayload,
  controlState: SpaceRoomControlState,
): SpacePublishAuthorization {
  if (!auth.scopes.includes(channel)) {
    return { ok: false, code: "scope-denied" };
  }
  if (payload.kind === "space.room-control") {
    return isHostControlAuthorized(auth)
      ? { ok: true }
      : { ok: false, code: "scope-denied" };
  }
  if (payload.kind === "presence.layout") {
    if (isGuestVoiceConnection(auth) || isViewerConnection(auth)) {
      return { ok: false, code: "scope-denied" };
    }
    if (controlState.editLocked && !isHostControlAuthorized(auth)) {
      return { ok: false, code: "scope-denied" };
    }
    return { ok: true };
  }
  if (payload.kind === "space.yjs-update") {
    if (isViewerConnection(auth)) {
      return { ok: false, code: "scope-denied" };
    }
    if (
      isGuestVoiceConnection(auth) &&
      SPACE_DESTRUCTIVE_ROOM_DOC_KEYS.has(payload.docKey)
    ) {
      return { ok: false, code: "scope-denied" };
    }
    if (controlState.editLocked && !isHostControlAuthorized(auth)) {
      return { ok: false, code: "scope-denied" };
    }
    return { ok: true };
  }
  return { ok: true };
}

export function applySpaceRoomControl(
  state: SpaceRoomControlState,
  payload: SpaceRoomControlPayload,
): SpaceRoomControlState {
  switch (payload.action) {
    case "lock-room":
      return Object.freeze({ ...state, roomLocked: true });
    case "unlock-room":
      return Object.freeze({ ...state, roomLocked: false });
    case "toggle-edit-lock":
      return Object.freeze({
        ...state,
        editLocked: payload.locked ?? !state.editLocked,
      });
    case "set-presenter":
      return Object.freeze({
        ...state,
        presenterClientId: payload.targetClientId ?? null,
      });
    case "mute-peer": {
      if (!payload.targetClientId) return state;
      const muted = new Set(state.mutedClientIds);
      if (payload.locked === false) {
        muted.delete(payload.targetClientId);
      } else {
        muted.add(payload.targetClientId);
      }
      return Object.freeze({
        ...state,
        mutedClientIds: Object.freeze([...muted]),
      });
    }
    case "kick-peer":
      return state;
  }
}

interface SpaceControlEventRow extends Record<string, unknown> {
  readonly envelope_json: string;
}

/**
 * Durable Object 하이버네이션·재기동 뒤에도 잠금/편집잠금/발표자/음소거 상태를
 * 추가 마이그레이션 없이 event_log에서 결정론적으로 복원한다.
 */
export function reconstructSpaceRoomControlState(
  sql: SqlStorageLike,
): SpaceRoomControlState {
  const rows = sql
    .exec<SpaceControlEventRow>(
      `SELECT envelope_json
       FROM event_log
       WHERE channel IN ('yjs-space', 'presence')
         AND envelope_json LIKE '%"space.room-control"%'
       ORDER BY rowid ASC`,
    )
    .toArray();
  let state = INITIAL_SPACE_ROOM_CONTROL_STATE;
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.envelope_json) as { payload?: unknown };
      if (validateSpaceRoomControlPayload(parsed.payload)) {
        state = applySpaceRoomControl(state, parsed.payload);
      }
    } catch {
      // 손상된 로그는 무시하고 fail-closed 기본 상태를 유지한다.
    }
  }
  return state;
}

export function ensureSpaceChannelRow(sql: SqlStorageLike): void {
  sql.exec(
    `INSERT OR IGNORE INTO channel_state
      (channel, current_sequence, replay_floor_sequence)
     VALUES (?, 0, 1)`,
    REALTIME_SPACE_CHANNEL,
  );
}

interface ChannelPresenceRow extends Record<string, unknown> {
  readonly present: number;
}

export function hasSpaceChannelRow(sql: SqlStorageLike): boolean {
  const rows = sql
    .exec<ChannelPresenceRow>(
      "SELECT COUNT(*) AS present FROM channel_state WHERE channel = ?",
      REALTIME_SPACE_CHANNEL,
    )
    .toArray();
  return rows.length > 0 && rows[0].present > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isSafePositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

const ATTACHMENT_REQUIRED_KEYS = [
  "version", "workId", "roomId", "connectionId", "actorId", "clientId", "scopes",
  "sessionVersion", "authorizationEpochMs", "sessionExpiresAtMs", "lastClientSequence",
  "protocolViolations", "resumeWindowStartedAtMs", "resumeRequestCount",
  "resumeEgressBytes", "resumeFrontiers", "completedResumeChannels",
] as const;
const ATTACHMENT_PERMITTED_KEYS = new Set<string>([...ATTACHMENT_REQUIRED_KEYS, "role"]);

export function isValidConnectionAttachmentCore(
  value: unknown,
  version: string,
  maxProtocolViolations: number,
): boolean {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (
    !ATTACHMENT_REQUIRED_KEYS.every((key) => Object.hasOwn(value, key)) ||
    !keys.every((key) => ATTACHMENT_PERMITTED_KEYS.has(key))
  ) {
    return false;
  }
  return (
    value.version === version &&
    isRealtimeId(value.workId) && isRealtimeId(value.roomId) &&
    isRealtimeId(value.connectionId) && isRealtimeId(value.actorId) && isRealtimeId(value.clientId) &&
    Array.isArray(value.scopes) &&
    value.scopes.length >= 1 && value.scopes.length <= REALTIME_TICKET_SCOPES.length &&
    value.scopes.every(isRealtimeTicketScope) &&
    new Set(value.scopes).size === value.scopes.length &&
    (value.role === undefined || isRealtimeSpaceRole(value.role)) &&
    isSafePositiveInt(value.sessionVersion) &&
    isSafePositiveInt(value.authorizationEpochMs) &&
    isSafePositiveInt(value.sessionExpiresAtMs) &&
    isSafeNonNegativeInt(value.lastClientSequence) &&
    isSafeNonNegativeInt(value.protocolViolations) && value.protocolViolations <= maxProtocolViolations &&
    isSafeNonNegativeInt(value.resumeWindowStartedAtMs) &&
    isSafeNonNegativeInt(value.resumeRequestCount) &&
    isSafeNonNegativeInt(value.resumeEgressBytes) &&
    isRecord(value.resumeFrontiers) &&
    Object.keys(value.resumeFrontiers).length >= 3 &&
    Object.keys(value.resumeFrontiers).length <= REALTIME_ALL_CHANNELS.length &&
    Object.keys(value.resumeFrontiers).every(isRealtimeWireChannel) &&
    Object.values(value.resumeFrontiers).every((f) => f === null || isSafeNonNegativeInt(f)) &&
    Array.isArray(value.completedResumeChannels) &&
    value.completedResumeChannels.length <= REALTIME_ALL_CHANNELS.length &&
    value.completedResumeChannels.every(isRealtimeWireChannel) &&
    new Set(value.completedResumeChannels).size === value.completedResumeChannels.length
  );
}

export function collectKickedTargets<
  TAttachment extends { readonly clientId: string },
>(
  sockets: readonly HibernatableWebSocket[],
  targetClientId: string,
  parseAttachment: (value: unknown) => TAttachment | null,
): readonly {
  readonly socket: HibernatableWebSocket;
  readonly attachment: TAttachment;
}[] {
  const targets: {
    readonly socket: HibernatableWebSocket;
    readonly attachment: TAttachment;
  }[] = [];
  for (const socket of sockets) {
    const attachment = parseAttachment(socket.deserializeAttachment());
    if (attachment !== null && attachment.clientId === targetClientId) {
      targets.push({ socket, attachment });
    }
  }
  return targets;
}
