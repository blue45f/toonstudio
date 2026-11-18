import { useCallback, useEffect, useRef, useState } from "react";

import { AdminApiError } from "../../../platform/http/admin-api";

import { loadNestBoard, saveNestBoard } from "./nestjs-quality-api";

import type { NestBoardDocument, NestBoardMutation, NestBoardView } from "@toonstudio/contracts/admin-nestjs-quality";

export function useNestBoard(active: boolean, onUnauthorized: (message: string) => void) {
  const [view, setView] = useState<NestBoardView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const current = useRef<NestBoardView | null>(null);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const enabled = useRef(active);
  const deny = useRef(onUnauthorized);
  const pending = useRef<{ encoded: string; mutation: NestBoardMutation } | null>(null);
  enabled.current = active;
  deny.current = onUnauthorized;

  const reject = useCallback((cause: unknown): void => {
    if (cause instanceof AdminApiError && (cause.status === 401 || cause.status === 403)) {
      current.current = null;
      setView(null);
      pending.current = null;
      deny.current("관리자 권한을 다시 확인해야 합니다. 저장된 기록을 닫았습니다.");
      return;
    }
    const collided = cause instanceof AdminApiError && cause.status === 409;
    setConflict(collided);
    setError(collided ? "다른 기록이 먼저 저장되었습니다. 초안을 내보내고 최신 기록을 다시 읽으세요."
      : cause instanceof Error ? cause.message : "서버 기록을 처리하지 못했습니다.");
  }, []);

  const reload = useCallback(async (): Promise<boolean> => {
    if (!enabled.current) return false;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const id = ++sequence.current;
    setBusy(true);
    setError("");
    try {
      const next = await loadNestBoard(request.signal);
      if (request.signal.aborted || id !== sequence.current || !enabled.current) return false;
      current.current = next;
      setView(next);
      setConflict(false);
      pending.current = null;
      return true;
    } catch (cause) {
      if (!request.signal.aborted && id === sequence.current) reject(cause);
      return false;
    } finally { if (id === sequence.current) setBusy(false); }
  }, [reject]);

  useEffect(() => {
    if (active && !current.current) void reload();
    if (!active) {
      controller.current?.abort();
      sequence.current += 1;
      setBusy(false);
    }
    return () => { controller.current?.abort(); sequence.current += 1; };
  }, [active, reload]);

  const save = useCallback(async (document: NestBoardDocument, reason: string): Promise<boolean> => {
    const previous = current.current;
    if (!enabled.current || !previous?.canEdit) return false;
    const encoded = JSON.stringify({ document, reason, expectedRevision: previous.revision });
    if (pending.current?.encoded !== encoded) {
      pending.current = { encoded, mutation: { expectedRevision: previous.revision, mutationId: crypto.randomUUID(), document, reason } };
    }
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const id = ++sequence.current;
    setBusy(true);
    setError("");
    try {
      const next = await saveNestBoard(pending.current.mutation, request.signal);
      if (request.signal.aborted || id !== sequence.current || !enabled.current) return false;
      current.current = next;
      setView(next);
      setConflict(false);
      pending.current = null;
      return true;
    } catch (cause) {
      if (!request.signal.aborted && id === sequence.current) reject(cause);
      return false;
    } finally { if (id === sequence.current) setBusy(false); }
  }, [reject]);

  return { view, busy, error, conflict, reload, save };
}
