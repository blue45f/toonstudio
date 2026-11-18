import { createEmptyBusinessPlanState, parseBusinessPlanState } from "@toonstudio/contracts/business-plan";
import { useCallback, useEffect, useRef, useState } from "react";

import { isBusinessPlanAccessDenied, isBusinessPlanConflict, loadBusinessPlan, saveBusinessPlan } from "./business-plan-api";
import { businessPlanId, errorMessage } from "./business-plan-ui";

import type { BusinessPlanState, SaveBusinessPlanRequest } from "@toonstudio/contracts/business-plan";

export function useBusinessPlan() {
  const [board, setBoard] = useState<BusinessPlanState | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [denied, setDenied] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [hasPendingSave, setHasPendingSave] = useState(false);
  const boardRef = useRef<BusinessPlanState | null>(null);
  const pending = useRef<SaveBusinessPlanRequest | null>(null);
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const mounted = useRef(true);
  const saveLock = useRef(false);

  const revoke = useCallback(() => {
    sequence.current += 1; request.current?.abort(); pending.current = null; boardRef.current = null;
    setBoard(null); setRevision(null); setUpdatedAt(null); setDirty(false); setDenied(true); setSaving(false); setLoading(false); setHasPendingSave(false); setNotice("");
    setError("사업계획서 접근 권한을 확인하지 못해 기록을 숨겼습니다. 관리자 권한을 다시 확인하세요.");
    window.dispatchEvent(new Event("toonstudio:business-plan-access-denied"));
  }, []);

  const reload = useCallback(async () => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    const run = ++sequence.current; setLoading(true); setNotice(""); setError("");
    try {
      const record = await loadBusinessPlan(controller.signal);
      if (!mounted.current || controller.signal.aborted || run !== sequence.current) return;
      const next = record.board ?? createEmptyBusinessPlanState();
      boardRef.current = next; pending.current = null;
      setBoard(next); setRevision(record.revision); setUpdatedAt(record.updatedAt); setDirty(record.board === null); setConflict(false); setDenied(false); setHasPendingSave(false);
      setNotice(record.board ? "서버의 저장 기록을 불러왔습니다." : "새 기본 보드입니다. 아직 서버에 저장되지 않았습니다.");
    } catch (cause) {
      if (!mounted.current || controller.signal.aborted || run !== sequence.current) return;
      if (isBusinessPlanAccessDenied(cause)) { revoke(); return; }
      setError(`서버 기록을 불러오지 못했습니다. 기존 기록을 초기화하지 않았습니다. ${errorMessage(cause)}`);
    } finally {
      if (mounted.current && run === sequence.current) setLoading(false);
    }
  }, [revoke]);

  useEffect(() => {
    mounted.current = true; void reload();
    return () => { mounted.current = false; sequence.current += 1; request.current?.abort(); pending.current = null; boardRef.current = null; };
  }, [reload]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function commit(candidate: BusinessPlanState, description: string): string | null {
    if (denied) return "접근 권한을 다시 확인하세요.";
    if (loading) return "서버 최신 기록을 불러온 뒤 변경 내용을 반영하세요. 현재 기록은 유지됩니다.";
    const at = new Date().toISOString();
    const result = parseBusinessPlanState({ ...candidate, activity: [...candidate.activity, { id: businessPlanId("activity"), at, type: "수동 기록", text: description }].slice(-1000), savedAt: at });
    if (!result.ok) return result.errors.join(" · ");
    boardRef.current = result.value; setBoard(result.value); setDirty(true);
    setNotice("변경을 현재 화면에 반영했습니다. 서버에 아직 저장하지 않았습니다.");
    return null;
  }

  async function persist() {
    if (saveLock.current || saving || loading || denied || conflict || revision === null || !boardRef.current) return;
    const transaction = pending.current ?? { board: structuredClone(boardRef.current), expectedRevision: revision, mutationId: crypto.randomUUID() };
    pending.current = transaction; setHasPendingSave(true); saveLock.current = true; setSaving(true); setError(""); setNotice("");
    request.current?.abort(); const controller = new AbortController(); request.current = controller; const run = ++sequence.current;
    try {
      const record = await saveBusinessPlan(transaction, controller.signal);
      if (!mounted.current || controller.signal.aborted || run !== sequence.current) return;
      pending.current = null; setHasPendingSave(false); setRevision(record.revision); setUpdatedAt(record.updatedAt);
      if (JSON.stringify(boardRef.current) === JSON.stringify(transaction.board)) {
        boardRef.current = record.board; setBoard(record.board); setDirty(false); setNotice("사업계획서 기록을 서버에 저장했습니다.");
      } else {
        setDirty(true); setNotice("앞서 요청한 기록을 서버에 저장했습니다. 이후 추가한 편집 내용은 다시 저장하세요.");
      }
    } catch (cause) {
      if (!mounted.current || controller.signal.aborted || run !== sequence.current) return;
      if (isBusinessPlanAccessDenied(cause)) { revoke(); return; }
      if (isBusinessPlanConflict(cause)) {
        pending.current = null; setHasPendingSave(false); setConflict(true);
        setError("다른 관리자 또는 창에서 서버 기록을 변경했습니다. 덮어쓰기를 중단했습니다. 현재 JSON을 백업한 뒤 최신 기록을 불러와 변경 내용을 다시 반영하세요.");
      } else {
        setError(`서버에 저장하지 못했습니다. 현재 입력은 화면에 남아 있지만 새로고침하면 사라질 수 있습니다. JSON 백업을 보관하세요. ${errorMessage(cause)}`);
      }
      setDirty(true);
    } finally {
      saveLock.current = false;
      if (mounted.current && run === sequence.current) setSaving(false);
    }
  }

  return { board, revision, updatedAt, loading, saving, dirty, denied, conflict, error, notice, hasPendingSave, commit, persist, reload };
}
