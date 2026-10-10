import { useCallback, useEffect, useRef, useState } from "react";

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

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

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
] as const;

const BRIDGE_PING_INTERVAL_MS = 20_000;
const TICKET_EXPIRY_MARGIN_MS = 10_000;

interface TsvsGodotFrameWindow {
  __tsvs_setSession?: (json: string) => void;
  __tsvs_setVisibility?: (hidden: boolean) => void;
  __tsvs_bridgePing?: () => void;
  __tsvs_requestReconnect?: () => void;
}

interface TsvsHostBridge {
  onGodotReady: (json: string) => void;
  onConnectionState: (json: string) => void;
  onTicketNeeded: (json: string) => void;
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

  const frameWindow = useCallback((): TsvsGodotFrameWindow | null => {
    const frame = iframeRef.current;
    if (!frame?.contentWindow) return null;
    return frame.contentWindow as unknown as TsvsGodotFrameWindow;
  }, []);

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
        workloads: ["presence"],
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
  }, [issueAndInject, localOnly]);

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
            <p className="text-sm font-semibold text-muted-foreground">
              {statusCopy[phase]}
            </p>
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <p role="status" className="text-sm font-semibold">
          {statusCopy[phase]}
        </p>
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
    </section>
  );
}

export default StudioGodotSpaceEmbed;
