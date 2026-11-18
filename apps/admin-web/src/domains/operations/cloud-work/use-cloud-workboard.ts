import { useCallback, useEffect, useRef, useState } from "react";

import { AdminApiError } from "../../../platform/http/admin-api";
import { loadCloudWorkboard, saveCloudWorkboard } from "../../../platform/http/cloud-workboard-api";

import type { Board } from "@toonstudio/contracts/admin-cloud-workboard";

function message(error: unknown): string {
  if (error instanceof AdminApiError && error.status === 503) {
    return "작업 기록 저장소를 사용할 수 없습니다. 마이그레이션 적용 및 저장소 연결 상태를 확인해야 합니다. 저장 완료를 확인할 수 없으며 같은 요청으로 재시도할 수 있습니다.";
  }
  return error instanceof Error ? error.message : "작업 기록 요청을 완료하지 못했습니다.";
}

export function useCloudWorkboard(onAccessDenied: (message: string) => void) {
  const [board, setBoard] = useState<Board | null>(null);
  const [revision, setRevision] = useState(0);
  const [storedAt, setStoredAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [conflict, setConflict] = useState(false);
  const mounted = useRef(false);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const revisionRef = useRef(0);
  const pendingSave = useRef<{ fingerprint: string; mutationId: string } | null>(null);
  const denied = useRef(onAccessDenied);
  denied.current = onAccessDenied;

  const failClosed = useCallback((error: unknown) => {
    if (!(error instanceof AdminApiError) || ![401, 403].includes(error.status)) return false;
    sequence.current += 1;
    controller.current?.abort();
    setBoard(null);
    pendingSave.current = null;
    denied.current("관리자 권한을 다시 확인해야 합니다. 이전 작업 기록을 닫았습니다.");
    return true;
  }, []);

  const reload = useCallback(async (): Promise<boolean> => {
    if (!mounted.current || busy.current) return false;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const current = ++sequence.current;
    setLoading(true);
    setLoadError("");
    try {
      const result = await loadCloudWorkboard(request.signal);
      if (!mounted.current || current !== sequence.current || request.signal.aborted) return false;
      setBoard(result.board);
      setRevision(result.revision);
      revisionRef.current = result.revision;
      setStoredAt(result.storedAt);
      setConflict(false);
      setSaveError("");
      return true;
    } catch (error) {
      if (!mounted.current || current !== sequence.current || request.signal.aborted) return false;
      if (!failClosed(error)) setLoadError(message(error));
      return false;
    } finally {
      if (mounted.current && current === sequence.current) setLoading(false);
    }
  }, [failClosed]);

  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => {
      mounted.current = false;
      sequence.current += 1;
      controller.current?.abort();
      pendingSave.current = null;
    };
  }, [reload]);

  const commit = useCallback(async (next: Board): Promise<boolean> => {
    if (!mounted.current || busy.current || loading || loadError || !board || conflict) return false;
    busy.current = true;
    setSaving(true);
    setSaveError("");
    const expectedRevision = revisionRef.current;
    const fingerprint = JSON.stringify({ board: next, expectedRevision });
    if (pendingSave.current?.fingerprint !== fingerprint) {
      pendingSave.current = { fingerprint, mutationId: crypto.randomUUID() };
    }
    const mutationId = pendingSave.current.mutationId;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const current = ++sequence.current;
    try {
      const result = await saveCloudWorkboard(next, expectedRevision, mutationId, request.signal);
      if (!mounted.current || current !== sequence.current || request.signal.aborted) return false;
      setBoard(result.board);
      setRevision(result.revision);
      revisionRef.current = result.revision;
      setStoredAt(result.storedAt);
      pendingSave.current = null;
      setConflict(false);
      return true;
    } catch (error) {
      if (!mounted.current || current !== sequence.current || request.signal.aborted) return false;
      if (failClosed(error)) return false;
      const isConflict = error instanceof AdminApiError && error.status === 409;
      setConflict(isConflict);
      setSaveError(isConflict
        ? "다른 기기에서 기록이 변경되었습니다. 편집본은 유지했습니다. 백업한 뒤 최신 기록을 불러와 비교해 주세요."
        : message(error));
      return false;
    } finally {
      busy.current = false;
      if (mounted.current && current === sequence.current) setSaving(false);
    }
  }, [board, conflict, failClosed, loadError, loading]);

  return { board, revision, storedAt, loading, saving, loadError, saveError, conflict, reload, commit };
}
