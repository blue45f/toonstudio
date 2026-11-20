import { useCallback, useEffect, useRef, useState } from "react";

import { AdminApiError } from "../../../platform/http/admin-api";

import { createProductionChange, loadProductionChanges, saveProductionChange, transitionProductionChange, uploadProductionCapture } from "./production-change-api";

import type { RequestData, RequestRecord, Status } from "@toonstudio/contracts/admin-production-change";

/** 인증 재검사 동안 요청을 중단하고, 저장 충돌에는 편집 중인 화면을 덮어쓰지 않는다. */
export function useProductionChanges(verified: boolean, canWrite: boolean, onUnauthorized: (message: string) => void) {
  const [records, setRecords] = useState<RequestRecord[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [authorizationLost, setAuthorizationLost] = useState(false);
  const enabled = useRef(verified);
  const writable = useRef(canWrite);
  const deny = useRef(onUnauthorized);
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const pending = useRef<{ fingerprint: string; mutationId: string } | null>(null);
  enabled.current = verified && !authorizationLost;
  writable.current = canWrite && !authorizationLost;
  deny.current = onUnauthorized;

  const reject = useCallback((cause: unknown) => {
    if (cause instanceof AdminApiError && (cause.status === 401 || cause.status === 403)) {
      controller.current?.abort();
      sequence.current += 1;
      setRecords(null);
      setAuthorizationLost(true);
      enabled.current = false;
      writable.current = false;
      pending.current = null;
      deny.current("제작 변경 보드 접근 권한을 다시 확인해야 합니다. 이전 계정의 기록을 닫았습니다.");
      return;
    }
    const collided = cause instanceof AdminApiError && cause.status === 409;
    setConflict(collided);
    setError(collided ? "다른 변경이 먼저 저장되었습니다. 미저장 초안을 내보낸 뒤 최신 요청을 다시 불러오세요. 이전 버전으로 덮어쓰지 않았습니다."
      : cause instanceof Error ? cause.message : "제작 변경 기록을 처리하지 못했습니다.");
  }, []);

  const load = useCallback(async (): Promise<RequestRecord[] | null> => {
    if (!enabled.current) return null;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    const version = ++sequence.current;
    setBusy(true); setError("");
    try {
      const next = await loadProductionChanges(request.signal);
      if (request.signal.aborted || version !== sequence.current || !enabled.current) return null;
      setRecords(next); setConflict(false);
      return next;
    } catch (cause) {
      if (!request.signal.aborted && version === sequence.current) reject(cause);
      return null;
    } finally { if (version === sequence.current) setBusy(false); }
  }, [reject]);

  useEffect(() => {
    if (verified) void load();
    else { controller.current?.abort(); sequence.current += 1; setBusy(false); }
    return () => { controller.current?.abort(); sequence.current += 1; };
  }, [verified, load]);

  const mutate = useCallback(async (fingerprint: string, operation: (mutationId: string, signal: AbortSignal) => Promise<RequestRecord>): Promise<RequestRecord | null> => {
    if (!enabled.current || !writable.current) return null;
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, mutationId: crypto.randomUUID() };
    const mutationId = pending.current.mutationId;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    const version = ++sequence.current;
    setBusy(true); setError(""); setConflict(false);
    try {
      const next = await operation(mutationId, request.signal);
      if (request.signal.aborted || version !== sequence.current || !enabled.current) return null;
      setRecords(previous => previous?.some(record => record.id === next.id)
        ? previous.map(record => record.id === next.id ? next : record) : [next, ...(previous ?? [])]);
      pending.current = null;
      return next;
    } catch (cause) {
      if (!request.signal.aborted && version === sequence.current) reject(cause);
      return null;
    } finally { if (version === sequence.current) setBusy(false); }
  }, [reject]);

  const save = useCallback((record: RequestRecord | null, data: RequestData): Promise<RequestRecord | null> => {
    const input = { id: record?.id ?? null, expectedVersion: record?.version ?? null, data };
    return mutate(JSON.stringify({ kind: "save", ...input }), (mutationId, signal) => record
      ? saveProductionChange(record.id, { data, expectedVersion: record.version, mutationId }, signal)
      : createProductionChange({ data, mutationId }, signal));
  }, [mutate]);

  const transition = useCallback((record: RequestRecord, status: Status, note: string): Promise<RequestRecord | null> => {
    const input = { status, note, expectedVersion: record.version };
    return mutate(JSON.stringify({ kind: "transition", id: record.id, ...input }), (mutationId, signal) => transitionProductionChange(record.id, { ...input, mutationId }, signal));
  }, [mutate]);

  const upload = useCallback(async (file: File): Promise<string | null> => {
    if (!enabled.current || !writable.current) return null;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    const version = ++sequence.current;
    setBusy(true); setError("");
    try {
      const url = await uploadProductionCapture(file, request.signal);
      if (request.signal.aborted || version !== sequence.current || !enabled.current) return null;
      return url;
    } catch (cause) {
      if (!request.signal.aborted && version === sequence.current) reject(cause);
      return null;
    } finally { if (version === sequence.current) setBusy(false); }
  }, [reject]);

  return { records, busy, error, conflict, authorizationLost, load, save, transition, upload, clearError: () => { setError(""); setConflict(false); } };
}
