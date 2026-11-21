import type {
  PresenceAvatarAppearance,
  PresencePayload,
  RealtimeChannel,
  RealtimeChannelSequenceStates,
  RealtimePayload,
  RealtimeProtocolErrorCode,
  ServerPongMessage,
  ServerPresenceSnapshotMessage,
} from "./protocol";

type SpaceProtocolVersion = "toonstudio.realtime.v1";
const SPACE_REALTIME_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

export const REALTIME_SPACE_CHANNEL = "yjs-space" as const;
export const REALTIME_ALL_CHANNELS = [
  "presence", "comments", "screen-signaling", REALTIME_SPACE_CHANNEL,
] as const;
export const REALTIME_TICKET_SCOPES = [
  ...REALTIME_ALL_CHANNELS, "guest-voice", "room-control",
] as const;
export const REALTIME_SPACE_ROLES = [
  "owner", "admin", "editor", "commenter", "guest-voice", "viewer",
] as const;
export const SPACE_YJS_DOC_KEYS = [
  "roomPreset", "lighting", "decorations", "whiteboardStrokes",
  "stickyNotes", "reviewPins", "bulletinBoard", "deadlineWidgets",
] as const;
export const SPACE_ROOM_CONTROL_ACTIONS = [
  "mute-peer", "lock-room", "unlock-room", "set-presenter", "toggle-edit-lock", "kick-peer",
] as const;

/** 공간 통합 Yjs 업데이트 페이로드(base64) 바이트 상한 (32KB). */
export const REALTIME_MAX_SPACE_YJS_UPDATE_BYTES = 32 * 1024;
/** 공간 통합 Yjs 상태 벡터(base64) 바이트 상한 (4KB). */
export const REALTIME_MAX_SPACE_STATE_VECTOR_BYTES = 4 * 1024;

export type RealtimeSpaceChannel = typeof REALTIME_SPACE_CHANNEL;
export type RealtimeWireChannel = (typeof REALTIME_ALL_CHANNELS)[number];
export type RealtimeTicketScope = (typeof REALTIME_TICKET_SCOPES)[number];
export type RealtimeSpaceRole = (typeof REALTIME_SPACE_ROLES)[number];
export type SpaceYjsDocKey = (typeof SPACE_YJS_DOC_KEYS)[number];
export type SpaceRoomControlAction =
  (typeof SPACE_ROOM_CONTROL_ACTIONS)[number];

export interface SpacePresenceUpdatePayload {
  readonly kind: "presence.update";
  readonly pageId: string | null;
  readonly profile: {
    readonly displayName: string;
    readonly role: RealtimeSpaceRole;
    readonly state: "active" | "idle" | "away";
    readonly avatar?: PresenceAvatarAppearance;
  };
  readonly tool: string | null;
}

export interface SpaceYjsUpdatePayload {
  readonly kind: "space.yjs-update";
  readonly docKey: SpaceYjsDocKey;
  readonly updateBase64: string;
}

export interface SpaceYjsSyncRequestPayload {
  readonly kind: "space.yjs-sync-request";
  readonly docKey?: SpaceYjsDocKey;
  readonly stateVectorBase64?: string;
}

export interface SpaceRoomControlPayload {
  readonly kind: "space.room-control";
  readonly action: SpaceRoomControlAction;
  readonly targetClientId?: string;
  readonly locked?: boolean;
}

export type RealtimeSpacePayload =
  | SpaceYjsUpdatePayload
  | SpaceYjsSyncRequestPayload
  | SpaceRoomControlPayload;

export type RealtimeWirePayload =
  | RealtimePayload
  | Exclude<PresencePayload, { readonly kind: "presence.update" }>
  | SpacePresenceUpdatePayload
  | RealtimeSpacePayload;

export interface ClientWirePublishMessage {
  readonly version: SpaceProtocolVersion;
  readonly type: "publish";
  readonly idempotencyKey: string;
  readonly clientSequence: number;
  readonly sentAtMs: number;
  readonly channel: RealtimeWireChannel;
  readonly payload: RealtimeWirePayload;
}

export interface ClientWireResumeMessage {
  readonly version: SpaceProtocolVersion;
  readonly type: "resume";
  readonly channel: RealtimeWireChannel;
  readonly afterSequence: number;
}

export interface ClientWirePingMessage {
  readonly version: SpaceProtocolVersion;
  readonly type: "ping";
}

export type RealtimeWireClientMessage =
  | ClientWirePublishMessage
  | ClientWireResumeMessage
  | ClientWirePingMessage;

export interface ServerWireEventMessage {
  readonly version: SpaceProtocolVersion;
  readonly type: "event";
  readonly sequence: number;
  readonly idempotencyKey: string;
  readonly actorId: string;
  readonly clientId: string;
  readonly connectionId: string;
  readonly channel: RealtimeWireChannel;
  readonly serverAtMs: number;
  readonly payload: RealtimeWirePayload;
}

export interface ServerWireWelcomeMessage {
  readonly version: SpaceProtocolVersion;
  readonly type: "welcome";
  readonly workId: string;
  readonly roomId: string;
  readonly connectionId: string;
  readonly actorId: string;
  readonly clientId: string;
  readonly scopes: readonly RealtimeTicketScope[];
  readonly channelStates: RealtimeChannelSequenceStates;
  readonly sessionExpiresAtMs: number;
}

export interface ServerWireAckMessage {
  readonly version: SpaceProtocolVersion;
  readonly type: "ack";
  readonly channel: RealtimeWireChannel;
  readonly idempotencyKey: string;
  readonly sequence: number;
  readonly duplicate: boolean;
}

export interface ServerWireReplayMessage {
  readonly version: SpaceProtocolVersion;
  readonly type: "replay";
  readonly channel: RealtimeWireChannel;
  readonly fromSequence: number;
  readonly toSequence: number;
  readonly currentSequence: number;
  readonly complete: boolean;
  readonly events: readonly ServerWireEventMessage[];
}

export interface ServerWireErrorMessage {
  readonly version: SpaceProtocolVersion;
  readonly type: "error";
  readonly code: RealtimeProtocolErrorCode;
  readonly retryable: boolean;
  readonly channel?: RealtimeWireChannel;
  readonly idempotencyKey?: string;
  readonly currentSequence?: number;
  readonly replayFloorSequence?: number;
}

export type RealtimeWireServerMessage =
  | ServerWireEventMessage
  | ServerWireWelcomeMessage
  | ServerWireAckMessage
  | ServerWireReplayMessage
  | ServerPresenceSnapshotMessage
  | ServerWireErrorMessage
  | ServerPongMessage;

export type WireClientMessageParseResult =
  | { readonly ok: true; readonly value: RealtimeWireClientMessage }
  | {
      readonly ok: false;
      readonly code: Extract<
        RealtimeProtocolErrorCode,
        "frame-too-large" | "invalid-json" | "invalid-envelope" | "invalid-payload"
      >;
    };

export type WireServerMessageParseResult =
  | { readonly ok: true; readonly value: RealtimeWireServerMessage }
  | {
      readonly ok: false;
      readonly code: "frame-too-large" | "invalid-json" | "invalid-envelope";
    };

const PURE_BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const FORBIDDEN_DATA_URI_PATTERN =
  /data:(?:(?:image|audio|video)\/|application\/octet-stream(?:[;,]|$))/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const actualKeys = Object.keys(value);
  const permitted = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    actualKeys.every((key) => permitted.has(key))
  );
}

export function isRealtimeWireChannel(value: unknown): value is RealtimeWireChannel {
  return typeof value === "string" && (REALTIME_ALL_CHANNELS as readonly string[]).includes(value);
}

export function isRealtimeTicketScope(value: unknown): value is RealtimeTicketScope {
  return typeof value === "string" && (REALTIME_TICKET_SCOPES as readonly string[]).includes(value);
}

export function isRealtimeSpaceRole(value: unknown): value is RealtimeSpaceRole {
  return typeof value === "string" && (REALTIME_SPACE_ROLES as readonly string[]).includes(value);
}

export function isSpaceYjsDocKey(value: unknown): value is SpaceYjsDocKey {
  return typeof value === "string" && (SPACE_YJS_DOC_KEYS as readonly string[]).includes(value);
}

export function isSpaceRoomControlAction(value: unknown): value is SpaceRoomControlAction {
  return typeof value === "string" && (SPACE_ROOM_CONTROL_ACTIONS as readonly string[]).includes(value);
}

function isSpaceRealtimeId(value: unknown): value is string {
  return typeof value === "string" && SPACE_REALTIME_ID_PATTERN.test(value);
}

function spaceUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/**
 * Data URL(`data:image/...`, `data:application/octet-stream...`)과 충돌하지 않는
 * 순수 표준 base64 문자열을 바이트 상한 안에서 엄격히 검증한다.
 */
export function isPureBase64(
  value: unknown,
  maximumBytes: number,
): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length % 4 !== 0) {
    return false;
  }
  if (
    spaceUtf8ByteLength(value) > maximumBytes ||
    FORBIDDEN_DATA_URI_PATTERN.test(value) ||
    !PURE_BASE64_PATTERN.test(value)
  ) {
    return false;
  }
  return true;
}

export function validateSpaceYjsUpdatePayload(
  value: unknown,
): value is SpaceYjsUpdatePayload {
  return (
    isRecord(value) &&
    value.kind === "space.yjs-update" &&
    hasExactKeys(value, ["kind", "docKey", "updateBase64"]) &&
    isSpaceYjsDocKey(value.docKey) &&
    isPureBase64(value.updateBase64, REALTIME_MAX_SPACE_YJS_UPDATE_BYTES)
  );
}

export function validateSpaceYjsSyncRequestPayload(
  value: unknown,
): value is SpaceYjsSyncRequestPayload {
  return (
    isRecord(value) &&
    value.kind === "space.yjs-sync-request" &&
    hasExactKeys(value, ["kind"], ["docKey", "stateVectorBase64"]) &&
    (value.docKey === undefined || isSpaceYjsDocKey(value.docKey)) &&
    (value.stateVectorBase64 === undefined ||
      isPureBase64(
        value.stateVectorBase64,
        REALTIME_MAX_SPACE_STATE_VECTOR_BYTES,
      ))
  );
}

export function validateSpaceRoomControlPayload(
  value: unknown,
): value is SpaceRoomControlPayload {
  if (
    !isRecord(value) ||
    value.kind !== "space.room-control" ||
    !hasExactKeys(value, ["kind", "action"], ["targetClientId", "locked"]) ||
    !isSpaceRoomControlAction(value.action)
  ) {
    return false;
  }
  if (value.locked !== undefined && typeof value.locked !== "boolean") {
    return false;
  }
  if (value.action === "mute-peer") {
    return isSpaceRealtimeId(value.targetClientId);
  }
  if (value.action === "kick-peer") {
    return isSpaceRealtimeId(value.targetClientId) && value.locked === undefined;
  }
  if (value.action === "set-presenter") {
    return (
      (value.targetClientId === undefined ||
        isSpaceRealtimeId(value.targetClientId)) &&
      value.locked === undefined
    );
  }
  if (value.targetClientId !== undefined) {
    return false;
  }
  if (value.action === "lock-room") {
    return value.locked === undefined || value.locked === true;
  }
  if (value.action === "unlock-room") {
    return value.locked === undefined || value.locked === false;
  }
  return true;
}

export function validateSpaceChannelPayload(
  value: unknown,
): value is RealtimeSpacePayload {
  return (
    validateSpaceYjsUpdatePayload(value) ||
    validateSpaceYjsSyncRequestPayload(value) ||
    validateSpaceRoomControlPayload(value)
  );
}

/**
 * 티켓 발급 클레임의 역할·스코프 정합성을 fail-closed로 검증한다.
 * 초대 게스트(`guest-voice`)·뷰어·일반 에디터는 방장 제어(`room-control`) 스코프를
 * 절대로 함께 가질 수 없다.
 */
export function validateTicketRoleScopeConsistency(
  scopes: readonly RealtimeTicketScope[],
  role: RealtimeSpaceRole | undefined,
): boolean {
  const hasGuestVoiceScope = scopes.includes("guest-voice");
  const hasRoomControlScope = scopes.includes("room-control");
  if (hasGuestVoiceScope && role !== undefined && role !== "guest-voice") {
    return false;
  }
  if (
    hasRoomControlScope &&
    (hasGuestVoiceScope ||
      role === "guest-voice" ||
      role === "viewer" ||
      role === "editor" ||
      role === "commenter")
  ) {
    return false;
  }
  return true;
}

export type RealtimeBaseChannel = RealtimeChannel;
