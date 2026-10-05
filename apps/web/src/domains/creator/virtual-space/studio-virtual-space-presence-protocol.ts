/**
 * 가상 스튜디오 presence 와이어 프로토콜.
 *
 * `studio-virtual-space-presence.ts`(컨트롤러)에서 응집 단위로 분리한 파일이다.
 * 와이어 상수·패킷/스냅샷 타입·presence state 검증/살균·패킷 파싱/인코딩만 다루고,
 * 세션 상태나 전송 타이머 같은 컨트롤러 상태는 갖지 않는다.
 * 컨트롤러 파일이 이 모듈을 다시 export하므로 기존 import 경로는 그대로 유지된다.
 */
import { parseStudioVirtualSpaceAppearance, type StudioVirtualSpaceAppearance } from "./studio-virtual-space-appearance";
import {
  isStudioVirtualSpaceChatScope,
  maskStudioChatProfanity,
  type StudioVirtualSpaceChatBubble,
  type StudioVirtualSpaceChatMessage,
  type StudioVirtualSpaceChatScope,
  type StudioVirtualSpaceChatTyping,
} from "./studio-virtual-space-chat";
import type { StudioEmoteKind } from "./studio-virtual-space-emotes";
import type { StudioInteractableStateKey } from "./studio-virtual-space-interactable-objects";
import type { StudioUserStatus } from "./studio-virtual-space-user-status";
import {
  isStudioSpaceEmoteId,
  type StudioSpaceEmoteId,
} from "./studio-virtual-space-emote-catalog";
import {
  STUDIO_VIRTUAL_SPACE_AUTO_AVATAR,
  STUDIO_VIRTUAL_SPACE_AVATAR_COUNT,
  studioVirtualSpaceState,
  type StudioVirtualSpaceActivity,
  type StudioVirtualSpaceFacing,
  type StudioVirtualSpacePeer,
  type StudioVirtualSpacePoint,
  type StudioVirtualSpacePresenceState,
  type StudioVirtualSpaceZoneId,
} from "./studio-virtual-space-model";

export const STUDIO_VIRTUAL_SPACE_WIRE = "toonstudio-space-v1";
export const STUDIO_VIRTUAL_SPACE_PRESENCE_INTERVAL_MS = 90;
export const STUDIO_VIRTUAL_SPACE_HEARTBEAT_MS = 2_500;
export const STUDIO_VIRTUAL_SPACE_STALE_MS = 10_000;
export const STUDIO_VIRTUAL_SPACE_PACKET_MAX_BYTES = 1_024;
/** 기본 리액션 표시 시간. 수신·송신 만료는 이모트별 durationMs(1200~4000ms)를 따른다. */
export const STUDIO_VIRTUAL_SPACE_REACTION_TTL_MS = 2_400;
/** 같은 사용자의 리액션 패킷은 250ms 안에 한 번만 보낸다(단축키 연타 폭주 방지). */
export const STUDIO_VIRTUAL_SPACE_REACTION_THROTTLE_MS = 250;
/** 같은 사용자의 충돌 반발(impact) 패킷도 250ms 안에 한 번만 보낸다(벽 비비기 폭주 방지). */
export const STUDIO_VIRTUAL_SPACE_IMPACT_THROTTLE_MS = 250;
/**
 * 피어 반발의 스냅샷 신선도. 반발 표시는 1초 미만의 순간 연출이라 이 시간을 넘긴
 * impact는 스냅샷에서 거둔다(늦게 합류한 화면에서 과거 반발이 재생되지 않게).
 */
export const STUDIO_VIRTUAL_SPACE_IMPACT_TTL_MS = 1_200;
/** 반발 속도(px/s) 검증 상한. 로컬 반발은 최고 속도의 40%로 제한되므로 넉넉한 값이다. */
export const STUDIO_VIRTUAL_SPACE_IMPACT_MAX_SPEED = 4_000;
/** 오브젝트 상태 경과(ms) 검증 상한. 이보다 오래된 전이는 복원 가치가 없어 버린다. */
export const STUDIO_VIRTUAL_SPACE_OBJECT_ELAPSED_MAX_MS = 86_400_000;
/** 말풍선 텍스트 최대 길이 (1024바이트 패킷 제한 안에서 여유 있게). */
export const STUDIO_PRESENCE_BUBBLE_MAX_LENGTH = 140;
/** 말풍선 표시 시간. 만료되면 송신 측이 직접 지워 브로드캐스트한다. */
export const STUDIO_PRESENCE_BUBBLE_TTL_MS = 5_000;
/**
 * 타이핑 신호 신선도. 입력 중에는 presence가 dirty 전송·하트비트(2.5초)로 계속
 * 갱신되므로, 이 시간 안에 새 패킷이 없으면 송신 측이 비정상 종료한 것으로 보고
 * 수신 측이 타이핑 표시를 스스로 거둔다.
 */
export const STUDIO_PRESENCE_TYPING_STALE_MS = 6_000;

/** 와이어 값은 이모트 카탈로그 id다. 기존 wave·heart·sparkles·thumbs-up 값은 그대로 유지된다. */
export type StudioVirtualSpaceReaction = StudioSpaceEmoteId;

export interface StudioVirtualSpaceReactionSnapshot {
  readonly sessionId: string;
  readonly reaction: StudioVirtualSpaceReaction;
  readonly expiresAt: number;
}

interface StudioVirtualSpacePresencePacket {
  readonly wire: typeof STUDIO_VIRTUAL_SPACE_WIRE;
  readonly worldScope?: string;
  readonly kind: "presence";
  readonly sequence: number;
  readonly at: number;
  readonly state: StudioVirtualSpacePresenceState;
}

interface StudioVirtualSpaceLeavePacket {
  readonly wire: typeof STUDIO_VIRTUAL_SPACE_WIRE;
  readonly worldScope?: string;
  readonly kind: "leave";
  readonly sequence: number;
  readonly at: number;
}

interface StudioVirtualSpaceReactionPacket {
  readonly wire: typeof STUDIO_VIRTUAL_SPACE_WIRE;
  readonly worldScope?: string;
  readonly kind: "reaction";
  readonly sequence: number;
  readonly at: number;
  readonly reaction: StudioVirtualSpaceReaction;
}

/**
 * 플레이어 말풍선 채팅 패킷. 와이어("toonstudio-space-v1")는 그대로 두고 kind만
 * 추가한 하위호환 확장이다 — 구버전 파서는 모르는 kind를 패킷째 무시하므로
 * 구버전 클라이언트가 섞인 방에서도 presence는 깨지지 않는다.
 * 범위(nearby/all)는 발신자가 선언하고, 실제 거리 필터는 수신 측이 자기 위치와
 * 발신자의 마지막 presence 위치로 판정한다.
 */
interface StudioVirtualSpaceChatPacket {
  readonly wire: typeof STUDIO_VIRTUAL_SPACE_WIRE;
  readonly worldScope?: string;
  readonly kind: "chat";
  readonly sequence: number;
  readonly at: number;
  readonly scope: StudioVirtualSpaceChatScope;
  readonly text: string;
}

interface StudioVirtualSpaceTypingPacket {
  readonly wire: typeof STUDIO_VIRTUAL_SPACE_WIRE;
  readonly worldScope?: string;
  readonly kind: "typing";
  readonly sequence: number;
  readonly at: number;
  readonly scope: StudioVirtualSpaceChatScope;
  readonly typing: boolean;
}

/**
 * 충돌 반발 전파 패킷 (VS 120 웨이브 3 · 피어 모션 전파).
 * 와이어는 그대로 두고 kind만 추가한 하위호환 확장이다 — 구버전 파서는 모르는
 * kind를 패킷째 무시한다. presence 위치 스트림만으로는 반발 궤적이 90ms 샘플링과
 * 수신 측 보간에 뭉개져 "벽에서 멈춤"으로 보이므로, 반발이 채택된 순간의 속도를
 * 그대로 실어 보낸다. 수신 측은 같은 감쇠 곡선(stepFeelVelocity)으로 재생한다.
 * vx·vy는 반발 속도(px/s)이며 송신 측 충돌 판정기가 이미 상한을 건 값이다.
 */
interface StudioVirtualSpaceImpactPacket {
  readonly wire: typeof STUDIO_VIRTUAL_SPACE_WIRE;
  readonly worldScope?: string;
  readonly kind: "impact";
  readonly sequence: number;
  readonly at: number;
  readonly vx: number;
  readonly vy: number;
}

/**
 * 오브젝트 상태 전파 패킷 (VS 120 웨이브 3 · 피어 모션 전파).
 * 오브젝트 상태 머신(커피 추출 등)은 클라이언트 로컬에만 있어 전파 경로가 없었고,
 * 같은 와이어에 kind를 추가하는 것이 유일하게 "기존 전송 경로에 얹는" 방법이다.
 * elapsedMs는 송신 측 시계로 잰 상태 경과 시간이며, 수신 측은 자기 시계에서
 * 그만큼을 빼 stateChangedAt을 복원한다 — 추출 진행이 처음부터 다시 시작되지 않는다.
 */
interface StudioVirtualSpaceObjectPacket {
  readonly wire: typeof STUDIO_VIRTUAL_SPACE_WIRE;
  readonly worldScope?: string;
  readonly kind: "object";
  readonly sequence: number;
  readonly at: number;
  readonly objectId: string;
  readonly stateKey: StudioInteractableStateKey;
  readonly elapsedMs: number;
}

export type StudioVirtualSpacePacket =
  | StudioVirtualSpacePresencePacket
  | StudioVirtualSpaceLeavePacket
  | StudioVirtualSpaceReactionPacket
  | StudioVirtualSpaceChatPacket
  | StudioVirtualSpaceTypingPacket
  | StudioVirtualSpaceImpactPacket
  | StudioVirtualSpaceObjectPacket;

/** 피어의 최근 충돌 반발. 수신 측 시계 기준 receivedAt으로 재생 경과를 잰다. */
export interface StudioVirtualSpacePeerImpact {
  readonly sessionId: string;
  readonly vx: number;
  readonly vy: number;
  readonly receivedAt: number;
}

/** 피어에게서 전파된 오브젝트 상태. stateChangedAt은 수신 측 시계로 복원한 값이다. */
export interface StudioVirtualSpaceObjectState {
  readonly objectId: string;
  readonly stateKey: StudioInteractableStateKey;
  readonly stateChangedAt: number;
  readonly senderSessionId: string;
}

export interface StudioVirtualSpaceSnapshot {
  readonly self: StudioVirtualSpacePresenceState;
  readonly peers: readonly StudioVirtualSpacePeer[];
  readonly nearbyPeers: readonly StudioVirtualSpacePeer[];
  readonly selfReaction: StudioVirtualSpaceReaction | null;
  readonly peerReactions: readonly StudioVirtualSpaceReactionSnapshot[];
  /** 말풍선 채팅 로그(오래된 순). nearby 범위는 수신 시점에 거리로 걸러진 것만 남는다. */
  readonly chatMessages: readonly StudioVirtualSpaceChatMessage[];
  /** 피어들의 표시 중 채팅 말풍선. 자기 말풍선은 selfChatBubble로 분리한다. */
  readonly chatBubbles: readonly StudioVirtualSpaceChatBubble[];
  readonly selfChatBubble: StudioVirtualSpaceChatBubble | null;
  /** 입력 중인 피어. nearby 범위는 현재 거리로 다시 걸러진다. */
  readonly peerTyping: readonly StudioVirtualSpaceChatTyping[];
  /** 피어별 최근 충돌 반발(신선도 안의 것만). 렌더 측은 같은 감쇠 곡선으로 재생한다. */
  readonly peerImpacts: readonly StudioVirtualSpacePeerImpact[];
  /** 전파된 오브젝트 상태(오브젝트별 최신 1건). 로컬 상태 머신과 합치지 않는 수신 전용 목록이다. */
  readonly objectStates: readonly StudioVirtualSpaceObjectState[];
  readonly direct: boolean;
}

export interface StudioVirtualSpacePresenceDependencies {
  /** Only the current server publication reader supplies this scope. Absence keeps bundled-world wire compatibility. */
  readonly worldScope?: string;
  readonly appearanceForAvatarIndex?: (avatarIndex: number, identity: string) => StudioVirtualSpaceAppearance;
  readonly now?: () => number;
  readonly setInterval?: (handler: () => void, delayMs: number) => unknown;
  readonly clearInterval?: (handle: unknown) => void;
}

function isSafeZoneId(value: unknown): value is StudioVirtualSpaceZoneId {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 64
    && /^[a-z0-9][a-z0-9_-]*$/iu.test(value);
}
const FACINGS = new Set<StudioVirtualSpaceFacing>(["down", "left", "right", "up"]);
const ACTIVITIES = new Set<StudioVirtualSpaceActivity>(["available", "focused", "reviewing", "away"]);
// A 트랙 studio-virtual-space-emotes.ts의 StudioEmoteKind와 1:1 대응하는 파싱용 allowlist.
// 값 import는 하지 않고(import type만) 목록을 여기서 유지한다 — A 트랙이 kind를
// 추가하면 이 목록에도 같은 값을 추가해야 피어에게 전달된다. 모르는 값은 필드만
// 무시하고 패킷 전체는 버리지 않아 구버전·신버전 혼재 방에서도 presence가 유지된다.
const EMOTE_KINDS = new Set<string>([
  "wave", "dance", "clap", "cheer", "sit", "sleep", "think", "laugh", "bow", "celebrate",
]);
const USER_STATUSES = new Set<string>(["available", "in-meeting", "presenting", "focusing", "away", "break"]);
// eslint-disable-next-line no-control-regex -- 말풍선 입력에서 제어 문자(U+0000–U+001F, U+007F)를 지우려는 의도된 패턴이다.
const BUBBLE_CONTROL_CHARS = /[\u0000-\u001F\u007F]/gu;

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 10_000;
}

/** 오브젝트 id 검증. 월드 매니페스트의 상호작용 id 규약(영숫자·하이픈·밑줄)을 따른다. */
export function isStudioVirtualSpaceObjectId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 96
    && /^[a-z0-9][a-z0-9_-]*$/iu.test(value);
}

/** 반발 속도 성분 검증. 유한하고 상한 안일 때만 통과한다. */
function isFiniteVelocity(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= STUDIO_VIRTUAL_SPACE_IMPACT_MAX_SPEED;
}

// studio-virtual-space-interactable-objects.ts의 StudioInteractableStateKey와 1:1 대응하는
// 파싱용 allowlist. EMOTE_KINDS와 같은 방식으로 값 import 없이 여기서 유지한다 —
// 상태 키가 추가되면 이 목록에도 같은 값을 추가해야 피어에게 전달된다. 목록 밖의
// stateKey는 패킷째 버린다(로컬 상태 머신에 없는 상태를 만들지 않기 위해서다).
const INTERACTABLE_STATE_KEYS = new Set<string>([
  "chair:empty", "chair:occupied",
  "door:closed", "door:open",
  "bulletin:unread", "bulletin:read",
  "light:off", "light:on",
  "coffee:idle", "coffee:brewing", "coffee:ready",
  "media:closed", "media:open",
]);

/** 오브젝트 상태 키 검증. 송신 측 가드와 수신 측 파싱이 같은 allowlist를 공유한다. */
export function isStudioInteractableStateKey(value: unknown): value is StudioInteractableStateKey {
  return typeof value === "string" && INTERACTABLE_STATE_KEYS.has(value);
}

/** presence state의 optional 확장 필드 묶음. */
export interface StudioVirtualSpacePresenceExtras {
  readonly emote?: StudioEmoteKind;
  readonly bubble?: string;
  readonly userStatus?: StudioUserStatus;
  readonly typing?: boolean;
}

/**
 * 타이핑 신호를 검증한다. 정확히 boolean true일 때만 입력 중으로 본다.
 * 그 외 값(문자열·숫자·false)은 전부 "입력 중 아님" — 패킷은 유지한다.
 */
export function parseStudioPresenceTyping(value: unknown): boolean | undefined {
  return value === true ? true : undefined;
}

/** 이모트 값을 검증한다. 모르는 값은 undefined (패킷은 유지, 필드만 무시). */
export function parseStudioPresenceEmote(value: unknown): StudioEmoteKind | undefined {
  return typeof value === "string" && EMOTE_KINDS.has(value) ? (value as StudioEmoteKind) : undefined;
}

/** 사용자 상태 값을 검증한다. 모르는 값은 undefined. */
export function parseStudioPresenceUserStatus(value: unknown): StudioUserStatus | undefined {
  return typeof value === "string" && USER_STATUSES.has(value) ? (value as StudioUserStatus) : undefined;
}

/** 말풍선 텍스트를 살균한다. 빈 문자열·제어문자는 제거, 최대 길이로 자른다. */
export function sanitizeStudioPresenceBubble(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(BUBBLE_CONTROL_CHARS, "").trim().slice(0, STUDIO_PRESENCE_BUBBLE_MAX_LENGTH);
  return cleaned.length > 0 ? cleaned : undefined;
}

export function runtimePresenceState(
  point: StudioVirtualSpacePoint,
  facing: StudioVirtualSpaceFacing = "down",
  activity: StudioVirtualSpaceActivity = "available",
  moving = false,
  avatarIndex = STUDIO_VIRTUAL_SPACE_AUTO_AVATAR,
  zoneId?: StudioVirtualSpaceZoneId,
  appearance?: StudioVirtualSpaceAppearance,
  extras: StudioVirtualSpacePresenceExtras = {},
): StudioVirtualSpacePresenceState {
  // The Phaser/Tiled world may be larger than the built-in 850×798 master scene. Use the
  // model helper for avatar/facing/activity sanitization and default-room fallback, but preserve
  // the engine-clamped world coordinates so P2P peers do not snap to the default-world edge.
  const fallback = studioVirtualSpaceState(point, facing, activity, moving, avatarIndex, zoneId);
  return Object.freeze({
    ...fallback,
    x: point.x,
    y: point.y,
    zoneId: zoneId ?? fallback.zoneId,
    ...(appearance ? { appearance } : {}),
    ...(extras.emote ? { emote: extras.emote } : {}),
    ...(extras.bubble ? { bubble: extras.bubble } : {}),
    ...(extras.userStatus ? { userStatus: extras.userStatus } : {}),
    ...(extras.typing ? { typing: true } : {}),
  });
}

function packetBytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function parseStudioVirtualSpacePacket(raw: string): StudioVirtualSpacePacket | null {
  if (typeof raw !== "string" || raw.length === 0 || packetBytes(raw) > STUDIO_VIRTUAL_SPACE_PACKET_MAX_BYTES) {
    return null;
  }
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const packet = candidate as Record<string, unknown>;
  if (
    packet.wire !== STUDIO_VIRTUAL_SPACE_WIRE
    || (packet.kind !== "presence" && packet.kind !== "leave" && packet.kind !== "reaction" && packet.kind !== "chat" && packet.kind !== "typing" && packet.kind !== "impact" && packet.kind !== "object")
    || !Number.isSafeInteger(packet.sequence)
    || Number(packet.sequence) < 0
    || !Number.isFinite(packet.at)
  ) {
    return null;
  }
  if (packet.worldScope !== undefined && (typeof packet.worldScope !== "string" || !/^[a-f0-9]{64}$/u.test(packet.worldScope))) return null;
  const scope = typeof packet.worldScope === "string" ? { worldScope: packet.worldScope } : {};
  if (packet.kind === "leave") {
    return {
      wire: STUDIO_VIRTUAL_SPACE_WIRE,
      ...scope,
      kind: "leave",
      sequence: Number(packet.sequence),
      at: Number(packet.at),
    };
  }
  if (packet.kind === "reaction") {
    // 모르는 이모트 값은 구버전과 같이 패킷째 버린다.
    if (!isStudioSpaceEmoteId(packet.reaction)) return null;
    return {
      wire: STUDIO_VIRTUAL_SPACE_WIRE,
      ...scope,
      kind: "reaction",
      sequence: Number(packet.sequence),
      at: Number(packet.at),
      reaction: packet.reaction,
    };
  }
  if (packet.kind === "chat") {
    // 범위를 모르거나 살균 후 빈 문장이면 패킷째 버린다. 금칙 마스킹은 수신 측에서도
    // 한 번 더 적용해 변조 클라이언트가 우회하지 못하게 한다.
    if (!isStudioVirtualSpaceChatScope(packet.scope)) return null;
    const text = sanitizeStudioPresenceBubble(packet.text);
    if (!text) return null;
    return {
      wire: STUDIO_VIRTUAL_SPACE_WIRE,
      ...scope,
      kind: "chat",
      sequence: Number(packet.sequence),
      at: Number(packet.at),
      scope: packet.scope,
      text: maskStudioChatProfanity(text),
    };
  }
  if (packet.kind === "typing") {
    if (!isStudioVirtualSpaceChatScope(packet.scope) || typeof packet.typing !== "boolean") return null;
    return {
      wire: STUDIO_VIRTUAL_SPACE_WIRE,
      ...scope,
      kind: "typing",
      sequence: Number(packet.sequence),
      at: Number(packet.at),
      scope: packet.scope,
      typing: packet.typing,
    };
  }
  if (packet.kind === "impact") {
    // 속도가 유한 범위를 벗어나면 패킷째 버린다(변조 클라이언트의 과대 반발 방지).
    if (!isFiniteVelocity(packet.vx) || !isFiniteVelocity(packet.vy)) return null;
    return {
      wire: STUDIO_VIRTUAL_SPACE_WIRE,
      ...scope,
      kind: "impact",
      sequence: Number(packet.sequence),
      at: Number(packet.at),
      vx: packet.vx,
      vy: packet.vy,
    };
  }
  if (packet.kind === "object") {
    // 모르는 오브젝트 id·상태 키·범위 밖 경과는 패킷째 버린다.
    if (!isStudioVirtualSpaceObjectId(packet.objectId)) return null;
    if (!isStudioInteractableStateKey(packet.stateKey)) return null;
    if (typeof packet.elapsedMs !== "number" || !Number.isFinite(packet.elapsedMs)
      || packet.elapsedMs < 0 || packet.elapsedMs > STUDIO_VIRTUAL_SPACE_OBJECT_ELAPSED_MAX_MS) return null;
    return {
      wire: STUDIO_VIRTUAL_SPACE_WIRE,
      ...scope,
      kind: "object",
      sequence: Number(packet.sequence),
      at: Number(packet.at),
      objectId: packet.objectId,
      stateKey: packet.stateKey as StudioInteractableStateKey,
      elapsedMs: packet.elapsedMs,
    };
  }
  if (!packet.state || typeof packet.state !== "object" || Array.isArray(packet.state)) return null;
  const state = packet.state as Record<string, unknown>;
  if (
    !isFiniteCoordinate(state.x)
    || !isFiniteCoordinate(state.y)
    || !isSafeZoneId(state.zoneId)
    || typeof state.facing !== "string"
    || !FACINGS.has(state.facing as StudioVirtualSpaceFacing)
    || typeof state.activity !== "string"
    || !ACTIVITIES.has(state.activity as StudioVirtualSpaceActivity)
  ) {
    return null;
  }
  const point = { x: state.x, y: state.y };
  const appearance = state.appearance === undefined ? undefined : parseStudioVirtualSpaceAppearance(state.appearance);
  if (appearance === null) return null;
  // emote/bubble/userStatus는 optional 확장 필드: 모르는 값이어도 패킷은 유지하고
  // 필드만 무시한다. 구버전 패킷(필드 없음)은 그대로 파싱된다.
  const extras: StudioVirtualSpacePresenceExtras = {
    ...(state.emote !== undefined ? { emote: parseStudioPresenceEmote(state.emote) } : {}),
    ...(state.bubble !== undefined ? (() => {
      const bubble = sanitizeStudioPresenceBubble(state.bubble);
      return bubble ? { bubble } : {};
    })() : {}),
    ...(state.userStatus !== undefined ? (() => {
      const userStatus = parseStudioPresenceUserStatus(state.userStatus);
      return userStatus ? { userStatus } : {};
    })() : {}),
    ...(state.typing !== undefined ? (() => {
      const typing = parseStudioPresenceTyping(state.typing);
      return typing ? { typing } : {};
    })() : {}),
  };
  return {
    wire: STUDIO_VIRTUAL_SPACE_WIRE,
    ...scope,
    kind: "presence",
    sequence: Number(packet.sequence),
    at: Number(packet.at),
    state: runtimePresenceState(
      point,
      state.facing as StudioVirtualSpaceFacing,
      state.activity as StudioVirtualSpaceActivity,
      typeof state.moving === "boolean" ? state.moving : false,
      Number.isInteger(state.avatarIndex)
        && Number(state.avatarIndex) >= 0
        && Number(state.avatarIndex) < STUDIO_VIRTUAL_SPACE_AVATAR_COUNT
        ? Number(state.avatarIndex)
        : STUDIO_VIRTUAL_SPACE_AUTO_AVATAR,
      state.zoneId as StudioVirtualSpaceZoneId,
      appearance,
      extras,
    ),
  };
}

export function encodePacket(packet: StudioVirtualSpacePacket): string | null {
  const raw = JSON.stringify(packet);
  return packetBytes(raw) <= STUDIO_VIRTUAL_SPACE_PACKET_MAX_BYTES ? raw : null;
}
