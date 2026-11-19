import { useEffect, useState } from "react";

export type EcosystemStreamStatus = "connected" | "reconnecting" | "offline";

export interface EcosystemStreamEvent {
  readonly id: string;
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

function resolveStreamUrl(): string {
  const base = import.meta.env.VITE_API_BASE?.trim().replace(/\/+$/, "") || "";
  return `${base}/api/studio-ecosystem/events/stream`;
}

/**
 * `/api/studio-ecosystem/events/stream` SSE 스트림을 구독해
 * MMORPG 구인 광장, 카페, RBAC 감사, 1:1 고객센터 실시간 이벤트를 수신한다.
 */
export function useStudioEcosystemStream(enabled = true) {
  const [status, setStatus] = useState<EcosystemStreamStatus>(enabled ? "reconnecting" : "offline");
  const [events, setEvents] = useState<readonly EcosystemStreamEvent[]>([]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof window.EventSource !== "function") {
      setStatus("offline");
      return;
    }

    const source = new window.EventSource(resolveStreamUrl(), {
      withCredentials: true,
    });

    source.onopen = () => {
      setStatus("connected");
    };

    source.onmessage = (message) => {
      try {
        const parsed = JSON.parse(String(message.data)) as EcosystemStreamEvent;
        if (parsed && typeof parsed.id === "string" && typeof parsed.type === "string") {
          setEvents((prev) => [parsed, ...prev].slice(0, 30));
        }
      } catch {
        // 잘못된 프레임은 무시하고 스트림 연결을 유지한다.
      }
    };

    source.onerror = () => {
      setStatus("reconnecting");
    };

    return () => {
      source.close();
    };
  }, [enabled]);

  return { status, events };
}
