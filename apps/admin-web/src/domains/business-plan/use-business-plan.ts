import { createEmptyBusinessPlanState, parseBusinessPlanState } from "@toonstudio/contracts/business-plan";
import { useCallback, useEffect, useRef, useState } from "react";

import { claimBusinessPlan, exportBusinessPlan, isBusinessPlanAccessDenied, isBusinessPlanConflict, loadBusinessPlan, saveBusinessPlan } from "./business-plan-api";
import { businessPlanId, errorMessage } from "./business-plan-ui";

import type { BusinessPlanAccess, BusinessPlanRecord, BusinessPlanState, SaveBusinessPlanRequest } from "@toonstudio/contracts/business-plan";

const closedAccess: BusinessPlanAccess = { canRead: false, canWrite: false, canExport: false, canManageAccess: false, canClaimOwnership: false };

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
  const [access, setAccess] = useState<BusinessPlanAccess>(closedAccess);
  const [accessVerified, setAccessVerified] = useState(false);
  const boardRef = useRef<BusinessPlanState | null>(null);
  const pending = useRef<SaveBusinessPlanRequest | null>(null);
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const mounted = useRef(true);
  const saveLock = useRef(false);
  const accessRef = useRef<BusinessPlanAccess>(closedAccess);
  const dirtyRef = useRef(false);
  const revisionRef = useRef<number | null>(null);
  const claimRequest = useRef<string | null>(null);

  const accept = useCallback((record: BusinessPlanRecord) => {
    const next = record.board ?? (record.access.canWrite ? createEmptyBusinessPlanState() : null);
    boardRef.current = next; revisionRef.current = record.revision; pending.current = null;
    dirtyRef.current = record.board === null && next !== null; accessRef.current = record.access;
    setBoard(next); setRevision(record.revision); setUpdatedAt(record.updatedAt); setDirty(dirtyRef.current);
    setAccess(record.access); setAccessVerified(true); setConflict(false); setDenied(false); setHasPendingSave(false);
  }, []);

  const revoke = useCallback(() => {
    sequence.current += 1; request.current?.abort(); pending.current = null; boardRef.current = null;
    accessRef.current = closedAccess; dirtyRef.current = false; revisionRef.current = null; claimRequest.current = null;
    setAccess(closedAccess); setAccessVerified(false);
    setBoard(null); setRevision(null); setUpdatedAt(null); setDirty(false); setDenied(true); setSaving(false); setLoading(false); setHasPendingSave(false); setNotice("");
    setError("사업계획서 접근 권한을 확인하지 못해 기록을 숨겼습니다. 관리자 권한을 다시 확인하세요.");
    window.dispatchEvent(new Event("toonstudio:business-plan-access-denied"));
  }, []);

  const reload = useCallback(async (preserveDraft = false) => {
    if (preserveDraft && saveLock.current) return;
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    const run = ++sequence.current; setLoading(true); setAccessVerified(false); setNotice(""); setError("");
    try {
      const record = await loadBusinessPlan(controller.signal);
      if (!mounted.current || controller.signal.aborted || run !== sequence.current) return;
      if (preserveDraft && dirtyRef.current && accessRef.current.canWrite && record.access.canWrite) {
        accessRef.current = record.access; setAccess(record.access); setAccessVerified(true);
        if (!pending.current && record.revision !== revisionRef.current) {
          setConflict(true); setError("서버 기록이 바뀌었습니다. 현재 변경을 검토한 뒤 최신 기록을 다시 읽으세요.");
        }
      } else accept(record);
      setNotice(record.access.canClaimOwnership ? "비어 있는 보드입니다. 자료를 입력하기 전에 소유권을 명시적으로 설정하세요." : record.board ? "서버의 저장 기록을 불러왔습니다." : "소유자 전용 새 보드입니다. 아직 원문을 저장하지 않았습니다.");
    } catch (cause) {
      if (!mounted.current || controller.signal.aborted || run !== sequence.current) return;
      if (isBusinessPlanAccessDenied(cause)) { revoke(); return; }
      setError(`서버 기록을 불러오지 못했습니다. 기존 기록을 초기화하지 않았습니다. ${errorMessage(cause)}`);
    } finally {
      if (mounted.current && run === sequence.current) setLoading(false);
    }
  }, [accept, revoke]);

  useEffect(() => {
    mounted.current = true; void reload();
    const recheck = () => { void reload(true); };
    const visible = () => { if (document.visibilityState === "visible") recheck(); };
    window.addEventListener("focus", recheck); window.addEventListener("online", recheck);
    window.addEventListener("toonstudio:auth-session-changed", recheck); document.addEventListener("visibilitychange", visible);
    return () => {
      mounted.current = false; sequence.current += 1; request.current?.abort(); pending.current = null; boardRef.current = null;
      window.removeEventListener("focus", recheck); window.removeEventListener("online", recheck);
      window.removeEventListener("toonstudio:auth-session-changed", recheck); document.removeEventListener("visibilitychange", visible);
    };
  }, [reload]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function commit(candidate: BusinessPlanState, description: string): string | null {
    if (denied || !accessVerified || !accessRef.current.canWrite) return "사업계획서 수정 권한이 없습니다. 소유자의 명시적 권한 부여가 필요합니다.";
    if (loading) return "서버 최신 기록을 불러온 뒤 변경 내용을 반영하세요. 현재 기록은 유지됩니다.";
    const at = new Date().toISOString();
    const result = parseBusinessPlanState({ ...candidate, activity: [...candidate.activity, { id: businessPlanId("activity"), at, type: "수동 기록", text: description }].slice(-1000), savedAt: at });
    if (!result.ok) return result.errors.join(" · ");
    boardRef.current = result.value; dirtyRef.current = true; setBoard(result.value); setDirty(true);
    setNotice("변경을 현재 화면에 반영했습니다. 서버에 아직 저장하지 않았습니다.");
    return null;
  }

  async function persist() {
    if (saveLock.current || saving || loading || denied || !accessVerified || !accessRef.current.canWrite || conflict || revision === null || !boardRef.current) return;
    const transaction = pending.current ?? { board: structuredClone(boardRef.current), expectedRevision: revision, mutationId: crypto.randomUUID() };
    pending.current = transaction; setHasPendingSave(true); saveLock.current = true; setSaving(true); setError(""); setNotice("");
    request.current?.abort(); const controller = new AbortController(); request.current = controller; const run = ++sequence.current;
    try {
      const record = await saveBusinessPlan(transaction, controller.signal);
      if (!mounted.current || controller.signal.aborted || run !== sequence.current) return;
      pending.current = null; setHasPendingSave(false); setRevision(record.revision); setUpdatedAt(record.updatedAt);
      revisionRef.current = record.revision; accessRef.current = record.access; setAccess(record.access);
      if (JSON.stringify(boardRef.current) === JSON.stringify(transaction.board)) {
        boardRef.current = record.board; dirtyRef.current = false; setBoard(record.board); setDirty(false); setNotice("사업계획서 기록을 서버에 저장했습니다.");
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
      dirtyRef.current = true;
    } finally {
      saveLock.current = false;
      if (mounted.current && run === sequence.current) setSaving(false);
    }
  }

  async function claimOwnership() {
    if (!accessRef.current.canClaimOwnership || !accessVerified || saveLock.current || loading) return;
    const mutationId = claimRequest.current ?? crypto.randomUUID(); claimRequest.current = mutationId;
    saveLock.current = true; setSaving(true); setError("");
    request.current?.abort(); const controller = new AbortController(); request.current = controller; const run = ++sequence.current;
    try {
      const record = await claimBusinessPlan(mutationId, controller.signal);
      if (!mounted.current || controller.signal.aborted || run !== sequence.current) return;
      claimRequest.current = null; accept(record);
      setNotice("빈 보드의 소유권을 설정했습니다. 필요한 계정에 읽기·수정·내보내기 권한을 각각 부여할 수 있습니다.");
    } catch (cause) {
      if (!mounted.current || controller.signal.aborted || run !== sequence.current) return;
      if (isBusinessPlanAccessDenied(cause)) { revoke(); return; }
      setError(`소유권 설정 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인할 수 있습니다. ${errorMessage(cause)}`);
    } finally {
      saveLock.current = false;
      if (mounted.current && run === sequence.current) setSaving(false);
    }
  }

  async function exportBoard(): Promise<BusinessPlanState | null> {
    if (!accessVerified || !accessRef.current.canExport || !boardRef.current || loading || denied) return null;
    const run = sequence.current;
    try {
      const record = await exportBusinessPlan();
      if (!mounted.current || run !== sequence.current || !record.access.canExport) return null;
      accessRef.current = record.access; setAccess(record.access);
      // 직전 서버 인가를 통과한 사용자가 현재 화면의 미저장 편집도 명시적으로 보관할 수 있다.
      return boardRef.current ? structuredClone(boardRef.current) : null;
    } catch (cause) {
      if (!mounted.current || run !== sequence.current) return null;
      if (isBusinessPlanAccessDenied(cause)) revoke();
      else setError(`내보내기 권한을 확인하지 못해 파일을 만들지 않았습니다. ${errorMessage(cause)}`);
      return null;
    }
  }

  return { board, revision, updatedAt, loading, saving, dirty, denied, conflict, error, notice, hasPendingSave, access, accessVerified, commit, persist, reload, claimOwnership, exportBoard, revoke };
}
