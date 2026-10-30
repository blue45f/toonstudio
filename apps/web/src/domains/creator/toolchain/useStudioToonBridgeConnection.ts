import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  clearStudioToonBridgeSettings,
  loadStudioToonBridgeSettings,
  saveStudioToonBridgeSettings,
  STUDIO_TOONBRIDGE_DEFAULT_URL,
  StudioToonBridgeClient,
  type StudioToonBridgeSettings,
  type StudioToonBridgeStatus,
  type StudioToonBridgeToolProbe,
} from "./studio-toonbridge-client";

export interface StudioToonBridgeConnectionState {
  readonly settings: StudioToonBridgeSettings;
  readonly status: StudioToonBridgeStatus | null;
  readonly probes: readonly StudioToonBridgeToolProbe[];
  readonly connected: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly client: StudioToonBridgeClient | null;
  setBaseUrl(value: string): void;
  setToken(value: string): void;
  connect(): Promise<void>;
  refresh(): Promise<void>;
  disconnect(): void;
}

function initialSettings(): StudioToonBridgeSettings {
  return loadStudioToonBridgeSettings() ?? {
    baseUrl: STUDIO_TOONBRIDGE_DEFAULT_URL,
    token: "",
  };
}

export function useStudioToonBridgeConnection(): StudioToonBridgeConnectionState {
  const [settings, setSettings] = useState<StudioToonBridgeSettings>(initialSettings);
  const [status, setStatus] = useState<StudioToonBridgeStatus | null>(null);
  const [probes, setProbes] = useState<readonly StudioToonBridgeToolProbe[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRead = useRef<AbortController | null>(null);

  const cancelRead = useCallback(() => {
    pendingRead.current?.abort();
    pendingRead.current = null;
  }, []);

  const client = useMemo(() => {
    if (!settings.token) return null;
    try {
      return new StudioToonBridgeClient(settings);
    } catch {
      return null;
    }
  }, [settings]);

  const readConnection = useCallback(async (
    nextSettings: StudioToonBridgeSettings,
  ): Promise<void> => {
    cancelRead();
    const controller = new AbortController();
    pendingRead.current = controller;
    const current = () => pendingRead.current === controller && !controller.signal.aborted;
    setLoading(true);
    setError(null);
    try {
      const nextClient = new StudioToonBridgeClient(nextSettings);
      const [nextStatus, nextProbes] = await Promise.all([
        nextClient.status(controller.signal),
        nextClient.tools(controller.signal),
      ]);
      if (!current()) return;
      saveStudioToonBridgeSettings(nextSettings);
      setSettings(nextSettings);
      setStatus(nextStatus);
      setProbes(nextProbes);
    } catch (cause) {
      if (!current()) return;
      setStatus(null);
      setProbes([]);
      setError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    } finally {
      if (current()) {
        pendingRead.current = null;
        controller.abort();
        setLoading(false);
      }
    }
  }, [cancelRead]);

  // 같은 탭에서 이미 연결 확인을 마친 실행기는 화면을 옮겨도 다시 조사해 상태를 이어간다.
  // 저장된 연결이 없으면 어떤 요청도 보내지 않는다.
  useEffect(() => {
    const saved = loadStudioToonBridgeSettings();
    if (saved) void readConnection(saved).catch(() => undefined);
    return cancelRead;
  }, [cancelRead, readConnection]);

  const connect = useCallback(async () => {
    await readConnection(settings);
  }, [readConnection, settings]);

  const refresh = useCallback(async () => {
    const saved = loadStudioToonBridgeSettings();
    if (!saved) throw new Error("저장된 로컬 실행기 연결이 없습니다.");
    await readConnection(saved);
  }, [readConnection]);

  const disconnect = useCallback(() => {
    cancelRead();
    clearStudioToonBridgeSettings();
    setSettings({ baseUrl: STUDIO_TOONBRIDGE_DEFAULT_URL, token: "" });
    setStatus(null);
    setProbes([]);
    setError(null);
    setLoading(false);
  }, [cancelRead]);

  const changeSettings = useCallback((update: (settings: StudioToonBridgeSettings) => StudioToonBridgeSettings) => {
    cancelRead();
    setSettings(update);
    setStatus(null);
    setProbes([]);
    setLoading(false);
    setError(null);
  }, [cancelRead]);

  return {
    settings,
    status,
    probes,
    connected: status !== null,
    loading,
    error,
    client,
    setBaseUrl(value) {
      changeSettings((current) => ({ ...current, baseUrl: value }));
    },
    setToken(value) {
      changeSettings((current) => ({ ...current, token: value }));
    },
    connect,
    refresh,
    disconnect,
  };
}
