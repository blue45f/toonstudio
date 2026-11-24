import { createEmptyFinalSubmissionBoard, parseFinalSubmissionBoard, reconcileFinalSubmissionBoard } from "@toonstudio/contracts/final-submission";
import { useCallback, useEffect, useRef, useState } from "react";

import { exportFinalSubmission, finalSubmissionAccessDenied, finalSubmissionConflict, finalSubmissionInputRejected, loadFinalSubmission, saveFinalSubmission } from "./final-submission-api";

import type { BoardState, FinalSubmissionRecord, HistoryEntry, SaveFinalSubmissionRequest } from "@toonstudio/contracts/final-submission";

const message = (cause: unknown) => cause instanceof Error ? cause.message : "연결 상태를 확인하고 다시 시도해 주세요.";

/** 계정별 서버 원장만 사용한다. 브라우저 저장소와 제출 플랫폼에는 기록하지 않는다. */
export function useFinalSubmission(userIdentity: string) {
  const [board, setBoard] = useState<BoardState | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [denied, setDenied] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [accessVerified, setAccessVerified] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [hasPendingSave, setHasPendingSave] = useState(false);
  const current = useRef<BoardState | null>(null);
  const baseline = useRef<BoardState | null>(null);
  const revisionRef = useRef<number | null>(null);
  const pending = useRef<SaveFinalSubmissionRequest | null>(null);
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const authEpoch = useRef(0);
  const recheckAfterSave = useRef(false);
  const mounted = useRef(false);
  const saveLock = useRef(false);
  const verified = useRef(false);
  const dirtyRef = useRef(false);
  const conflictRef = useRef(false);
  const summary = useRef("최종 제출 점검 기록 저장");

  const accept = useCallback((result: FinalSubmissionRecord) => {
    const next = result.board ?? createEmptyFinalSubmissionBoard();
    current.current = next; baseline.current = result.board; revisionRef.current = result.revision;
    pending.current = null; dirtyRef.current = result.board === null; verified.current = true; conflictRef.current = false;
    setBoard(next); setRevision(result.revision); setUpdatedAt(result.updatedAt); setHistory(result.history);
    setDirty(dirtyRef.current); setAccessVerified(true); setConflict(false); setDenied(false); setHasPendingSave(false);
  }, []);

  const revoke = useCallback(() => {
    sequence.current += 1; authEpoch.current += 1; request.current?.abort(); pending.current = null; current.current = null; baseline.current = null;
    verified.current = false; dirtyRef.current = false; revisionRef.current = null;
    setBoard(null); setHistory([]); setRevision(null); setUpdatedAt(null); setDirty(false); setDenied(true);
    setAccessVerified(false); setSaving(false); setLoading(false); setHasPendingSave(false); setNotice("");
    setError("최종 제출 점검의 개인 자료 접근 권한을 확인하지 못해 기록을 숨겼습니다.");
    window.dispatchEvent(new Event("toonstudio:final-submission-access-denied"));
  }, []);

  const reload = useCallback(async (preserveDraft = false) => {
    const authority = ++authEpoch.current;
    verified.current = false; setAccessVerified(false);
    if (saveLock.current) { recheckAfterSave.current = true; return; }
    recheckAfterSave.current = false;
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    const run = ++sequence.current; verified.current = false;
    setLoading(true); setAccessVerified(false); setNotice(""); setError("");
    try {
      const result = await loadFinalSubmission(userIdentity, controller.signal);
      if (!mounted.current || controller.signal.aborted || run !== sequence.current || authority !== authEpoch.current) return;
      if (preserveDraft && dirtyRef.current && current.current) {
        verified.current = true; setAccessVerified(true);
        if (!pending.current && result.revision !== revisionRef.current) {
          conflictRef.current = true; setConflict(true);
          setError("다른 창에서 저장 기록이 바뀌었습니다. 현재 초안을 백업한 뒤 최신 기록을 다시 읽어 주세요.");
        }
      } else accept(result);
      setNotice(result.board ? "내 계정의 서버 기록을 불러왔습니다." : "내 계정의 빈 점검 보드입니다. Sites JSON을 가져오거나 확인한 자료부터 기록할 수 있습니다.");
    } catch (cause) {
      if (!mounted.current || controller.signal.aborted || run !== sequence.current || authority !== authEpoch.current) return;
      if (finalSubmissionAccessDenied(cause)) { revoke(); return; }
      setError(`서버 기록을 확인하지 못했습니다. 기존 기록은 그대로 유지됩니다. ${message(cause)}`);
    } finally {
      if (mounted.current && run === sequence.current) setLoading(false);
    }
  }, [accept, revoke, userIdentity]);

  useEffect(() => {
    mounted.current = true; void reload();
    const recheck = () => { void reload(true); };
    const visible = () => {
      if (document.visibilityState === "visible") recheck();
      else {
        authEpoch.current += 1; verified.current = false; setAccessVerified(false);
        if (saveLock.current) recheckAfterSave.current = true;
      }
    };
    window.addEventListener("focus", recheck); window.addEventListener("online", recheck);
    window.addEventListener("toonstudio:auth-session-changed", recheck); document.addEventListener("visibilitychange", visible);
    return () => {
      mounted.current = false; sequence.current += 1; authEpoch.current += 1; request.current?.abort(); pending.current = null;
      current.current = null; baseline.current = null; verified.current = false;
      window.removeEventListener("focus", recheck); window.removeEventListener("online", recheck);
      window.removeEventListener("toonstudio:auth-session-changed", recheck); document.removeEventListener("visibilitychange", visible);
    };
  }, [reload]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function apply(candidate: BoardState, description: string, importing: boolean): string | null {
    if (!verified.current || !current.current || revisionRef.current === null) return "개인 자료 접근 권한과 서버 기록을 먼저 확인해 주세요.";
    if (saveLock.current || pending.current) return "앞선 저장 결과를 먼저 확인해 주세요. 같은 요청으로 재시도할 수 있습니다.";
    if (conflictRef.current) return "저장 버전 충돌을 먼저 해결해 주세요. 초안을 백업한 뒤 최신 기록을 읽을 수 있습니다.";
    if (!description.trim() || description.length > 500) return "변경 설명은 1~500자로 기록해 주세요.";
    const versioned = { ...candidate, revision: revisionRef.current };
    const normalized = importing && baseline.current === null
      ? versioned
      : reconcileFinalSubmissionBoard(versioned, current.current);
    const result = parseFinalSubmissionBoard(normalized, baseline.current ?? undefined);
    if (!result.ok) return result.errors.join(" · ");
    current.current = result.value; dirtyRef.current = true; summary.current = description.trim();
    setBoard(result.value); setDirty(true); setNotice("변경을 화면에 반영했습니다. 상단의 서버 저장을 눌러 보관하세요.");
    return null;
  }

  function commit(candidate: BoardState, description: string): string | null {
    return apply(candidate, description, false);
  }

  function importBoard(candidate: BoardState, description: string): string | null {
    return apply(candidate, description, true);
  }

  async function persist() {
    if (saveLock.current || !verified.current || conflictRef.current || revisionRef.current === null || !current.current || (!dirtyRef.current && !pending.current)) return;
    const authority = authEpoch.current;
    const transaction = pending.current ?? {
      board: structuredClone(current.current), expectedRevision: revisionRef.current,
      mutationId: crypto.randomUUID(), summary: summary.current,
    };
    pending.current = transaction; saveLock.current = true; setHasPendingSave(true); setSaving(true); setError(""); setNotice("");
    request.current?.abort(); const controller = new AbortController(); request.current = controller; const run = ++sequence.current;
    try {
      const result = await saveFinalSubmission(userIdentity, transaction, controller.signal);
      if (!mounted.current || controller.signal.aborted || run !== sequence.current || authority !== authEpoch.current) return;
      accept(result);
      setNotice(result.revision > transaction.expectedRevision + 1
        ? "이 요청은 이미 저장되어 있습니다. 서버의 최신 기록을 불러왔습니다."
        : "내 계정의 최종 제출 점검 기록을 서버에 저장했습니다.");
    } catch (cause) {
      if (!mounted.current || controller.signal.aborted || run !== sequence.current || authority !== authEpoch.current) return;
      if (finalSubmissionAccessDenied(cause)) { revoke(); return; }
      if (finalSubmissionConflict(cause)) {
        pending.current = null; conflictRef.current = true; setHasPendingSave(false); setConflict(true);
        setError("다른 창의 변경을 보호하기 위해 저장을 중단했습니다. 현재 초안을 백업한 뒤 최신 기록을 다시 읽어 주세요.");
      } else if (finalSubmissionInputRejected(cause)) {
        pending.current = null; setHasPendingSave(false);
        setError(`서버가 입력을 거절했습니다. 초안은 유지됩니다. 내용을 보완한 뒤 다시 저장하세요. ${message(cause)}`);
      } else {
        setError(`저장 결과를 확인하지 못했습니다. 입력을 유지하고 같은 요청으로 재시도합니다. ${message(cause)}`);
      }
      dirtyRef.current = true; setDirty(true);
    } finally {
      saveLock.current = false;
      if (mounted.current && run === sequence.current) setSaving(false);
      if (mounted.current && recheckAfterSave.current && document.visibilityState === "visible") void reload(true);
    }
  }

  async function exportBoard(): Promise<BoardState | null> {
    if (!verified.current || !current.current || saveLock.current) return null;
    const run = sequence.current; const authority = authEpoch.current;
    try {
      await exportFinalSubmission(userIdentity);
      if (!mounted.current || run !== sequence.current || authority !== authEpoch.current || !verified.current || !current.current || saveLock.current) return null;
      return structuredClone(current.current);
    } catch (cause) {
      if (!mounted.current || run !== sequence.current || authority !== authEpoch.current) return null;
      if (finalSubmissionAccessDenied(cause)) revoke();
      else setError(`내보내기 권한을 확인하지 못했습니다. ${message(cause)}`);
      return null;
    }
  }

  return { board, revision, updatedAt, history, loading, saving, dirty, denied, conflict, error, notice,
    accessVerified, hasPendingSave, commit, importBoard, persist, reload, exportBoard };
}
