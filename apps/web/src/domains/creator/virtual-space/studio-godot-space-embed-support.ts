/**
 * Godot 무대 임베드 셸의 보조 모듈: 마지막 위치 저장(기기 로컬), 셸↔무대 브리지 타입, 통지 페이로드 파싱.
 * 셸 본체(`StudioGodotSpaceEmbed.tsx`)에서 분리한 순수 모듈이며 React에 의존하지 않는다.
 */

import type { StudioRealtimeTicketGuestAccess } from "../studio-realtime-provider-protocol";
import type { StudioRealtimeTicketIssuer } from "../studio-realtime-provider-runtime";

/** 마지막 위치 저장 (위치 복원). 저장은 셸 소유 — 기기 로컬에만 둔다. */
export interface GodotLastPosition {
  readonly spaceId: string;
  readonly x: number;
  readonly y: number;
  readonly at: number;
}

const GODOT_POSITION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function godotPositionKey(workId: string): string {
  return `tsvs-last-position:${workId}`;
}

export function loadGodotLastPosition(workId: string): GodotLastPosition | null {
  try {
    const raw = window.localStorage.getItem(godotPositionKey(workId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (
      typeof record.spaceId !== "string" ||
      typeof record.x !== "number" ||
      typeof record.y !== "number" ||
      typeof record.at !== "number" ||
      Date.now() - record.at > GODOT_POSITION_TTL_MS
    ) {
      return null;
    }
    return {
      spaceId: record.spaceId,
      x: record.x,
      y: record.y,
      at: record.at,
    };
  } catch {
    return null;
  }
}

export function saveGodotLastPosition(workId: string, position: GodotLastPosition): void {
  try {
    window.localStorage.setItem(
      godotPositionKey(workId),
      JSON.stringify(position),
    );
  } catch {
    // 저장 실패는 복원을 포기할 뿐 무대 동작에 영향을 주지 않는다.
  }
}


export interface TsvsGodotFrameWindow {
  __tsvs_setSession?: (json: string) => void;
  __tsvs_setVisibility?: (hidden: boolean) => void;
  __tsvs_bridgePing?: () => void;
  __tsvs_requestReconnect?: () => void;
  __tsvs_sendSignal?: (json: string) => void;
  __tsvs_showBubble?: (json: string) => void;
  // 표면 회귀 복구: 이모트 실행 (셸 이모트 바 → 무대).
  __tsvs_showEmote?: (json: string) => void;
  // 4단계: 배치 저작 채널 (셸→무대).
  __tsvs_setEditMode?: (enabled: boolean) => void;
  __tsvs_applyLayout?: (json: string) => void;
  __tsvs_layoutCommand?: (json: string) => void;
  __tsvs_notifyLayout?: (json: string) => void;
  // 무대 배경 로드 상태 (bg_stage.gd가 window에 표기: idle|loading|ready|failed).
  __godotBgState?: string;
}

export interface TsvsHostBridge {
  onGodotReady: (json: string) => void;
  onConnectionState: (json: string) => void;
  onTicketNeeded: (json: string) => void;
  onZoneChanged: (json: string) => void;
  onProximityChanged: (json: string) => void;
  onSignal: (json: string) => void;
  onBubble: (json: string) => void;
  // 표면 회귀 복구: 이모트 통지·오브젝트 상호작용·위치 저장 (무대→셸).
  onEmote: (json: string) => void;
  onInteract: (json: string) => void;
  onPosition: (json: string) => void;
  // 4단계: 배치 저작 통지 (무대→셸).
  onLayoutChanged: (json: string) => void;
  onLayoutSelection: (json: string) => void;
  onLayoutRemote: (json: string) => void;
}

/** Godot onZoneChanged 통지의 셸 측 표현 (구역 판정은 무대 소유). */
export interface GodotZoneInfo {
  readonly selfZoneId: string;
  readonly selfActorId: string;
  readonly selfClientId: string;
  readonly presenterActorId: string;
  readonly peerClientIds: Readonly<Record<string, string>>;
  readonly names: Readonly<Record<string, string>>;
  readonly zones: readonly {
    readonly zoneId: string;
    readonly kind: string;
    readonly name: string;
    readonly occupants: readonly string[];
  }[];
}

export interface GodotChatEntry {
  readonly id: number;
  readonly fromSelf: boolean;
  readonly name: string;
  readonly text: string;
}


export function parseHostPayload(json: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(json);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}


/** 이모트 바 (표면 회귀 복구). 카탈로그 16종 중 단축키가 있는 10종을
 * 버튼으로 노출한다 — id·글리프는 웹 셸 카탈로그(emote-catalog)와 같다. */
export const GODOT_EMOTE_BAR: readonly { id: string; glyph: string; ko: string; en: string }[] = [
  { id: "wave", glyph: "👋", ko: "손 흔들기", en: "Wave" },
  { id: "heart", glyph: "❤️", ko: "하트", en: "Heart" },
  { id: "party", glyph: "🎉", ko: "축하해요", en: "Celebrate" },
  { id: "thumbs-up", glyph: "👍", ko: "좋아요", en: "Thumbs up" },
  { id: "laugh", glyph: "😂", ko: "웃음", en: "Laugh" },
  { id: "clap", glyph: "👏", ko: "박수", en: "Clap" },
  { id: "wow", glyph: "😮", ko: "놀람", en: "Wow" },
  { id: "think", glyph: "🤔", ko: "생각 중", en: "Thinking" },
  { id: "idea", glyph: "💡", ko: "아이디어", en: "Idea" },
  { id: "dance", glyph: "💃", ko: "춤추기", en: "Dance" },
];

export const GODOT_EMOTE_GLYPHS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries([
    ...GODOT_EMOTE_BAR.map((emote) => [emote.id, emote.glyph] as const),
    ["sparkles", "✨"],
    ["question", "❓"],
    ["exclaim", "❗"],
    ["coffee", "☕"],
    ["music", "🎵"],
    ["sleep", "😴"],
  ]),
);

/** 오브젝트 상호작용 안내 (무대 onInteract 수신 표기). */
export const GODOT_INTERACT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  board: "칠판을 보고 있어요",
  desk: "책상에서 작업을 시작해요",
  stage: "무대에 올랐어요",
  bench: "벤치에 앉아 쉬어요",
  table: "테이블에 앉아 쉬어요",
  storefront: "상점을 둘러봐요",
});


export const GODOT_PRESENCE_CAPABILITIES = [
  "presence.snapshot-v1",
  "presence.members-v1",
  "presence.cursor-v1",
  "presence.resume-v1",
  // 3단계: 회의 구역 화상 브리지 — Godot 연결이 screen-signaling 채널을
  // 중계할 수 있어야 셸 소유 화상이 같은 룸에서 협상된다.
  "screen-signaling.session-v1",
  "screen-signaling.webrtc-v1",
  "screen-signaling.resume-v1",
] as const;

/** 게스트 티켓은 서버 계약상 presence 전용이다 (게스트 인가 분기가
 * 그 외 워크로드를 거부한다). 회의·댓글 채널은 게스트에게 열지 않는다. */
export const GODOT_GUEST_PRESENCE_CAPABILITIES = [
  "presence.snapshot-v1",
  "presence.members-v1",
  "presence.cursor-v1",
  "presence.resume-v1",
] as const;

export type StudioGodotSpacePhase =
  | "booting"
  | "ticket"
  | "connecting"
  | "connected"
  | "disconnected"
  | "denied"
  | "unavailable"
  | "local";

export interface StudioGodotSpaceEmbedProps {
  readonly workId: string;
  readonly displayName: string;
  /** "#rrggbb" — 서버 계약 profile.avatar.color와 같은 형식. */
  readonly colorHex: string;
  readonly skinKey?: string;
  /** 개인 공간처럼 티켓을 발급할 수 없는 경우: 무대만 로컬로 띄운다. */
  readonly localOnly?: boolean;
  /**
   * 프로젝트 공간 게스트 자격. 서버 검증을 통과한 게스트 세션의 자격만
   * 전달된다 — 임베드는 이 자격으로 게스트 티켓(presence 전용)을 발급해
   * 접속한다. 자격이 없으면 게스트는 localOnly 로컬 무대에 머문다.
   */
  readonly guestAccess?: StudioRealtimeTicketGuestAccess;
  readonly onExitToClassic: () => void;
  /** 테스트 주입용. 기본값은 운영 HTTP 발급기. */
  readonly ticketIssuer?: StudioRealtimeTicketIssuer;
}
