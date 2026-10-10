import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { resolveStudioCloudflareRealtimeOrigin } from "../studio-realtime-provider-cloudflare-adapter";
import {
  StudioRealtimeTicketSchema,
  type StudioRealtimeTicketRequest,
} from "../studio-realtime-provider-protocol";
import {
  StudioRealtimeTicketDeniedError,
  type StudioRealtimeTicketIssuer,
} from "../studio-realtime-provider-runtime";
import { createStudioRealtimeHttpTicketIssuer } from "../studio-realtime-ticket-client";
import {
  acquireStudioVoiceIcePolicyLease,
  type StudioVoiceIcePolicyLease,
} from "../studio-voice-ice-policy";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  StudioGodotMeetingSession,
  type GodotMeetingRoute,
} from "./studio-godot-meeting-session";
import { StudioGodotMeetingPanel } from "./StudioGodotMeetingPanel";

/**
 * Godot 무대 임베드 셸 (가상스튜디오 재개발 2단계 — DESIGN §4 이층 구조).
 *
 * 셸이 소유하는 것: 계정 세션·티켓 발급/갱신·연결 생존성(visibility·워치독 ping)·
 * 로딩과 연결 상태 표기. Godot 무대는 공간 렌더와 이동만 소유하고, 경계는
 * `window.__tsvsHost`(Godot→셸)와 iframe 전역 콜백(셸→Godot)뿐이다.
 * 티켓은 메모리에만 두고 저장·URL·로그에 남기지 않는다.
 */

export const GODOT_SPACE_EMBED_PATH = "/godot-space/index.html";

const GODOT_PRESENCE_CAPABILITIES = [
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

const BRIDGE_PING_INTERVAL_MS = 20_000;
const TICKET_EXPIRY_MARGIN_MS = 10_000;

interface TsvsGodotFrameWindow {
  __tsvs_setSession?: (json: string) => void;
  __tsvs_setVisibility?: (hidden: boolean) => void;
  __tsvs_bridgePing?: () => void;
  __tsvs_requestReconnect?: () => void;
  __tsvs_sendSignal?: (json: string) => void;
  __tsvs_showBubble?: (json: string) => void;
}

interface TsvsHostBridge {
  onGodotReady: (json: string) => void;
  onConnectionState: (json: string) => void;
  onTicketNeeded: (json: string) => void;
  onZoneChanged: (json: string) => void;
  onProximityChanged: (json: string) => void;
  onSignal: (json: string) => void;
  onBubble: (json: string) => void;
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

interface GodotChatEntry {
  readonly id: number;
  readonly fromSelf: boolean;
  readonly name: string;
  readonly text: string;
}

declare global {
  interface Window {
    __tsvsHost?: TsvsHostBridge;
  }
}

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
  /** 개인 공간·게스트처럼 티켓을 발급할 수 없는 경우: 무대만 로컬로 띄운다. */
  readonly localOnly?: boolean;
  readonly onExitToClassic: () => void;
  /** 테스트 주입용. 기본값은 운영 HTTP 발급기. */
  readonly ticketIssuer?: StudioRealtimeTicketIssuer;
}

function parseHostPayload(json: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(json);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function StudioGodotSpaceEmbed({
  workId,
  displayName,
  colorHex,
  skinKey,
  localOnly = false,
  onExitToClassic,
  ticketIssuer,
}: StudioGodotSpaceEmbedProps) {
  const bt = useBilingual("StudioGodotSpaceEmbed");
  const [phase, setPhase] = useState<StudioGodotSpacePhase>(
    localOnly ? "local" : "booting",
  );
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const sessionIdRef = useRef<string | null>(null);
  const issuingRef = useRef(false);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 3단계: 구역·근접·화상·말풍선 상태. 구역 판정은 Godot가 소유하고 셸은 통지를 받는다.
  const [zoneInfo, setZoneInfo] = useState<GodotZoneInfo | null>(null);
  const zoneInfoRef = useRef<GodotZoneInfo | null>(null);
  zoneInfoRef.current = zoneInfo;
  const [proximitySize, setProximitySize] = useState(0);
  const [chatLog, setChatLog] = useState<readonly GodotChatEntry[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const chatSeqRef = useRef(0);
  const [meetingRoute, setMeetingRoute] = useState<GodotMeetingRoute>("idle");
  const [meetingLocalStream, setMeetingLocalStream] =
    useState<MediaStream | null>(null);
  const [meetingRemoteStream, setMeetingRemoteStream] =
    useState<MediaStream | null>(null);
  const meetingSessionRef = useRef<StudioGodotMeetingSession | null>(null);
  const iceLeaseRef = useRef<StudioVoiceIcePolicyLease | null>(null);
  const iceLeasePromiseRef = useRef<Promise<void> | null>(null);

  const frameWindow = useCallback((): TsvsGodotFrameWindow | null => {
    const frame = iframeRef.current;
    if (!frame?.contentWindow) return null;
    return frame.contentWindow as unknown as TsvsGodotFrameWindow;
  }, []);

  // 회의 맥락은 구역 통지에서 도출한다: 발표 구역은 회의 구역 안에 있으므로
  // 두 구역의 점유를 합쳐 판정한다.
  const meetingContext = useMemo(() => {
    if (!zoneInfo) return null;
    const inMeetingKind = (zoneId: string) =>
      zoneId === "meeting" || zoneId === "presentation";
    const selfInMeeting = inMeetingKind(zoneInfo.selfZoneId);
    const occupantIds = new Set<string>();
    for (const zone of zoneInfo.zones) {
      if (inMeetingKind(zone.zoneId)) {
        for (const occupant of zone.occupants) occupantIds.add(occupant);
      }
    }
    const peerActorId =
      [...occupantIds].find((actor) => actor !== zoneInfo.selfActorId) ?? null;
    return {
      selfInMeeting,
      peerInMeeting: peerActorId !== null,
      peerActorId,
      peerClientId: peerActorId
        ? (zoneInfo.peerClientIds[peerActorId] ?? null)
        : null,
      selfClientId: zoneInfo.selfClientId || null,
      presenterName: zoneInfo.presenterActorId
        ? (zoneInfo.names[zoneInfo.presenterActorId] ?? null)
        : null,
      peerName: peerActorId
        ? (zoneInfo.names[peerActorId] ?? null)
        : null,
    };
  }, [zoneInfo]);

  // 화상 세션은 한 번만 만들고, ICE 리스는 연결 확정 뒤에 미리 받아 둔다.
  useEffect(() => {
    if (localOnly) return;
    const session = new StudioGodotMeetingSession({
      sendSignal: (payload) => {
        frameWindow()?.__tsvs_sendSignal?.(JSON.stringify(payload));
      },
      createPeerConnection: () => {
        const lease = iceLeaseRef.current;
        if (!lease) {
          throw new Error("ICE 정책 리스가 아직 준비되지 않았습니다.");
        }
        return lease.createPeerConnection();
      },
      getLocalStream: () =>
        navigator.mediaDevices.getUserMedia({ audio: true, video: true }),
      onRoute: (route) => setMeetingRoute(route),
      onRemoteStream: (stream) => setMeetingRemoteStream(stream),
      onLocalStream: (stream) => setMeetingLocalStream(stream),
    });
    meetingSessionRef.current = session;
    return () => {
      session.close();
      meetingSessionRef.current = null;
      iceLeaseRef.current?.close();
      iceLeaseRef.current = null;
      iceLeasePromiseRef.current = null;
    };
  }, [frameWindow, localOnly]);

  useEffect(() => {
    if (localOnly || phase !== "connected" || iceLeasePromiseRef.current) {
      return;
    }
    iceLeasePromiseRef.current = acquireStudioVoiceIcePolicyLease(workId)
      .then((lease) => {
        iceLeaseRef.current = lease;
      })
      .catch(() => {
        // 리스 실패는 화상 시작 시점에 "failed"로 정직하게 드러난다.
        iceLeasePromiseRef.current = null;
      });
  }, [localOnly, phase, workId]);

  useEffect(() => {
    const session = meetingSessionRef.current;
    if (!session || !meetingContext) return;
    session.setContext({
      selfInMeeting: meetingContext.selfInMeeting,
      peerInMeeting: meetingContext.peerInMeeting,
      peerClientId: meetingContext.peerClientId,
      selfClientId: meetingContext.selfClientId,
    });
  }, [meetingContext]);

  const injectSession = useCallback(
    (ticket: string) => {
      const origin = resolveStudioCloudflareRealtimeOrigin(
        import.meta.env.VITE_STUDIO_REALTIME_ORIGIN,
      );
      if (!origin) {
        setPhase("unavailable");
        return;
      }
      const payload: Record<string, unknown> = {
        v: 1,
        ticket,
        ws: origin.replace(/^https:/, "wss:"),
        workId,
        roomId: workId,
        name: displayName,
        color: colorHex,
      };
      if (skinKey) payload.skinKey = skinKey;
      frameWindow()?.__tsvs_setSession?.(JSON.stringify(payload));
      if (document.hidden) {
        frameWindow()?.__tsvs_setVisibility?.(true);
      }
      setPhase("connecting");
    },
    [colorHex, displayName, frameWindow, skinKey, workId],
  );

  const issueAndInject = useCallback(async () => {
    if (localOnly || issuingRef.current) return;
    const issuer =
      ticketIssuer ?? createStudioRealtimeHttpTicketIssuer({});
    issuingRef.current = true;
    setPhase((current) => (current === "connected" ? current : "ticket"));
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      sessionIdRef.current ??=
        globalThis.crypto?.randomUUID?.() ??
        `godot-shell-${Date.now().toString(36)}`;
      const providerId =
        import.meta.env.VITE_STUDIO_REALTIME_PROVIDER_ID?.trim() ||
        "cloudflare-realtime-v1";
      const request: StudioRealtimeTicketRequest = {
        version: 1,
        providerId,
        sessionId: sessionIdRef.current,
        scope: { workId, roomId: workId },
        workloads: ["presence", "screen-signaling"],
        capabilities: [...GODOT_PRESENCE_CAPABILITIES],
      };
      const raw = await issuer.issue(request, controller.signal);
      const parsed = StudioRealtimeTicketSchema.safeParse(raw);
      if (!parsed.success || parsed.data.providerId !== providerId) {
        setPhase("unavailable");
        return;
      }
      injectSession(parsed.data.ticket);
      // 접속이 끝나기 전에 티켓이 만료되면 새 티켓으로 다시 주입한다.
      // 이미 접속된 뒤에는 티켓 수명이 연결과 무관하므로 재발급하지 않는다.
      if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
      const delay = Math.max(
        1_000,
        Date.parse(parsed.data.expiresAt) - Date.now() - TICKET_EXPIRY_MARGIN_MS,
      );
      expiryTimerRef.current = setTimeout(() => {
        if (phaseRef.current !== "connected") void issueAndInject();
      }, delay);
    } catch (error) {
      if (controller.signal.aborted) return;
      setPhase(
        error instanceof StudioRealtimeTicketDeniedError
          ? "denied"
          : "unavailable",
      );
    } finally {
      issuingRef.current = false;
    }
  }, [injectSession, localOnly, ticketIssuer, workId]);

  const appendChat = useCallback(
    (fromSelf: boolean, name: string, text: string) => {
      chatSeqRef.current += 1;
      const entry: GodotChatEntry = {
        id: chatSeqRef.current,
        fromSelf,
        name,
        text,
      };
      setChatLog((current) => [...current.slice(-49), entry]);
    },
    [],
  );

  // 호스트 브리지 등록이 iframe 로드보다 먼저 끝나야 onGodotReady를 놓치지 않는다.
  useEffect(() => {
    const host: TsvsHostBridge = {
      onGodotReady: () => {
        void issueAndInject();
      },
      onConnectionState: (json) => {
        const payload = parseHostPayload(json);
        if (payload?.state === "connected") setPhase("connected");
        else if (payload?.state === "disconnected") setPhase("disconnected");
      },
      onTicketNeeded: () => {
        void issueAndInject();
      },
      onZoneChanged: (json) => {
        const payload = parseHostPayload(json);
        if (!payload) return;
        const zones = Array.isArray(payload.zones)
          ? payload.zones.flatMap((zone) => {
              if (typeof zone !== "object" || zone === null) return [];
              const record = zone as Record<string, unknown>;
              return [
                {
                  zoneId: String(record.zoneId ?? ""),
                  kind: String(record.kind ?? ""),
                  name: String(record.name ?? ""),
                  occupants: Array.isArray(record.occupants)
                    ? record.occupants.map((value) => String(value))
                    : [],
                },
              ];
            })
          : [];
        setZoneInfo({
          selfZoneId: String(payload.selfZoneId ?? ""),
          selfActorId: String(payload.selfActorId ?? ""),
          selfClientId: String(payload.selfClientId ?? ""),
          presenterActorId: String(payload.presenterActorId ?? ""),
          peerClientIds: (payload.peerClientIds ?? {}) as Record<
            string,
            string
          >,
          names: (payload.names ?? {}) as Record<string, string>,
          zones,
        });
      },
      onProximityChanged: (json) => {
        const payload = parseHostPayload(json);
        if (payload && typeof payload.size === "number") {
          setProximitySize(payload.size);
        }
      },
      onSignal: (json) => {
        const payload = parseHostPayload(json);
        const signal = payload?.payload;
        if (
          payload &&
          typeof signal === "object" &&
          signal !== null &&
          !Array.isArray(signal)
        ) {
          void meetingSessionRef.current?.handleSignal(
            String(payload.fromClientId ?? ""),
            signal as Record<string, unknown>,
          );
        }
      },
      onBubble: (json) => {
        const payload = parseHostPayload(json);
        if (!payload || typeof payload.text !== "string") return;
        const fromActorId = String(payload.fromActorId ?? "");
        const name =
          zoneInfoRef.current?.names[fromActorId] ??
          bt("상대", "Partner");
        appendChat(false, name, payload.text);
      },
    };
    window.__tsvsHost = host;
    setFrameSrc(
      localOnly ? `${GODOT_SPACE_EMBED_PATH}?local=1` : GODOT_SPACE_EMBED_PATH,
    );
    return () => {
      if (window.__tsvsHost === host) delete window.__tsvsHost;
      abortRef.current?.abort();
      if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    };
  }, [appendChat, bt, issueAndInject, localOnly]);

  // 생존성은 셸이 소유한다 (DESIGN §4.4): visibility를 무대에 전파하고,
  // 무대 루프가 얼어도 셸 타이머가 ping 발행을 대신 지시한다.
  useEffect(() => {
    if (localOnly) return;
    const forwardVisibility = () => {
      frameWindow()?.__tsvs_setVisibility?.(document.hidden);
    };
    document.addEventListener("visibilitychange", forwardVisibility);
    const pingTimer = setInterval(() => {
      if (phaseRef.current === "connected") {
        frameWindow()?.__tsvs_bridgePing?.();
      }
    }, BRIDGE_PING_INTERVAL_MS);
    return () => {
      document.removeEventListener("visibilitychange", forwardVisibility);
      clearInterval(pingTimer);
    };
  }, [frameWindow, localOnly]);

  const statusCopy: Record<StudioGodotSpacePhase, string> = {
    booting: bt("공간 엔진을 불러오는 중이에요…", "Loading the space engine…"),
    ticket: bt("입장권을 발급하는 중이에요…", "Issuing your entry ticket…"),
    connecting: bt("공간에 연결하는 중이에요…", "Connecting to the space…"),
    connected: bt("연결됨", "Connected"),
    disconnected: bt(
      "연결이 끊겨 다시 연결하는 중이에요…",
      "Connection lost — reconnecting…",
    ),
    denied: bt(
      "이 공간에 들어갈 권한이 없어요.",
      "You don't have access to this space.",
    ),
    unavailable: bt(
      "실시간 공간에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
      "Couldn't reach the live space. Please try again shortly.",
    ),
    local: bt(
      "로컬 모드 — 혼자 둘러보는 중이에요.",
      "Local mode — exploring on your own.",
    ),
  };
  const showOverlay =
    phase === "booting" || phase === "ticket" || phase === "connecting";
  const showRetry = phase === "denied" || phase === "unavailable";

  return (
    <section
      aria-label={bt("가상 스튜디오 공간", "Virtual studio space")}
      className="relative mx-auto w-full max-w-[1152px] px-4 py-4"
    >
      <div className="relative overflow-hidden rounded-3xl border border-line bg-card">
        {frameSrc ? (
          <iframe
            ref={iframeRef}
            src={frameSrc}
            title={bt("가상 스튜디오 공간 (Godot)", "Virtual studio space (Godot)")}
            className="block aspect-[3/2] w-full border-0"
            allow="autoplay; fullscreen"
          />
        ) : (
          <div className="aspect-[3/2] w-full" aria-hidden="true" />
        )}
        {showOverlay ? (
          <div
            className="absolute inset-0 grid place-items-center bg-card/80"
            role="status"
          >
            <p className="text-sm font-semibold text-fg-2">
              {statusCopy[phase]}
            </p>
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <p role="status" className="text-sm font-semibold">
          {statusCopy[phase]}
        </p>
        {zoneInfo?.selfZoneId ? (
          <p className="text-sm text-fg-2" data-testid="godot-current-zone">
            {bt(
              `현재 구역: ${zoneInfo.zones.find((zone) => zone.zoneId === zoneInfo.selfZoneId)?.name ?? zoneInfo.selfZoneId}`,
              `Current zone: ${zoneInfo.selfZoneId}`,
            )}
          </p>
        ) : null}
        {proximitySize >= 2 ? (
          <p className="text-sm text-fg-2" data-testid="godot-proximity">
            {bt(
              `근처 ${proximitySize}명과 말풍선 대화 중`,
              `Chatting with ${proximitySize} nearby`,
            )}
          </p>
        ) : null}
        {showRetry ? (
          <button
            type="button"
            className="text-sm font-bold underline underline-offset-4"
            onClick={() => void issueAndInject()}
          >
            {bt("다시 시도", "Retry")}
          </button>
        ) : null}
        <button
          type="button"
          className="text-sm font-bold underline underline-offset-4"
          onClick={onExitToClassic}
        >
          {bt("기존 스페이스로 돌아가기", "Back to the classic space")}
        </button>
      </div>
      {!localOnly && meetingContext?.selfInMeeting ? (
        <StudioGodotMeetingPanel
          route={meetingRoute}
          localStream={meetingLocalStream}
          remoteStream={meetingRemoteStream}
          selfName={displayName}
          peerName={meetingContext.peerName}
          presenterName={meetingContext.presenterName}
          onStart={() => void meetingSessionRef.current?.start()}
          onStop={() => meetingSessionRef.current?.stop()}
          onToggleMic={(enabled) =>
            meetingSessionRef.current?.setMicEnabled(enabled)
          }
          onToggleCam={(enabled) =>
            meetingSessionRef.current?.setCamEnabled(enabled)
          }
        />
      ) : null}
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const text = chatDraft.trim();
          if (!text) return;
          setChatDraft("");
          appendChat(true, displayName, text);
          frameWindow()?.__tsvs_showBubble?.(
            JSON.stringify({
              actorId: zoneInfoRef.current?.selfActorId ?? "",
              text,
            }),
          );
        }}
      >
        <label className="grid gap-1 text-sm font-semibold">
          {bt("말풍선 채팅", "Bubble chat")}
          <input
            value={chatDraft}
            onChange={(event) => setChatDraft(event.target.value)}
            maxLength={200}
            placeholder={bt(
              "가까운 상대에게 말풍선으로 보여요",
              "Shown as a bubble to nearby partners",
            )}
            className="w-72 rounded-xl border border-line bg-card px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="text-sm font-bold underline underline-offset-4"
        >
          {bt("보내기", "Send")}
        </button>
      </form>
      {chatLog.length > 0 ? (
        <ul
          aria-label={bt("말풍선 채팅 기록", "Bubble chat log")}
          className="mt-2 grid gap-1 text-sm"
        >
          {chatLog.map((entry) => (
            <li key={entry.id}>
              <b>{entry.fromSelf ? bt("나", "Me") : entry.name}</b>
              {": "}
              {entry.text}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default StudioGodotSpaceEmbed;
