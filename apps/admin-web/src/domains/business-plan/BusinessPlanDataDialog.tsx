import { BUSINESS_PLAN_MAX_IMPORT_BYTES, parseBusinessPlanState, todayKst } from "@toonstudio/contracts/business-plan";
import { useState } from "react";

import { useBusinessPlanPermissions } from "./business-plan-permissions";
import { BusinessPlanDialog, BusinessPlanError, downloadBusinessPlan, errorMessage } from "./business-plan-ui";

import type { BusinessPlanCommit } from "./business-plan-ui";
import type { BusinessPlanState } from "@toonstudio/contracts/business-plan";

export function BusinessPlanDataDialog({ board, initialJson, onCommit, onClose }: { board: BusinessPlanState | null; initialJson: string; onCommit: BusinessPlanCommit; onClose: () => void }) {
  const { canWrite, canExport, exportBoard } = useBusinessPlanPermissions();
  const currentJson = canExport ? initialJson : "";
  const [raw, setRaw] = useState(currentJson);
  const [candidate, setCandidate] = useState<BusinessPlanState | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function review(text: string) {
    setCandidate(null); setNotice("");
    try {
      if (new TextEncoder().encode(text).byteLength > BUSINESS_PLAN_MAX_IMPORT_BYTES) throw new Error("JSON 백업은 2MB 이하여야 합니다.");
      const value: unknown = JSON.parse(text); const result = parseBusinessPlanState(value);
      if (!result.ok) throw new Error(result.errors.join(" · "));
      setCandidate(result.value); setError("");
    } catch (cause) { setError(errorMessage(cause)); }
  }

  return <BusinessPlanDialog title="JSON 백업·가져오기" description="기록의 형식·참조·상태를 검증합니다. 백업에 적힌 주장의 사실성은 별도 확인이 필요합니다." wide dirty={raw !== currentJson} onClose={onClose}>
    <div className="bp-dialog-body">
      <div className="bp-actions"><button type="button" className="bp-button" disabled={!board || !canExport} onClick={async () => {
        const authorized = await exportBoard(); if (!authorized) return;
        try { downloadBusinessPlan(`business-plan-backup-${todayKst()}.json`, JSON.stringify(authorized)); setError(""); setNotice("서버에서 내보내기 권한을 확인한 현재 화면의 JSON 백업 파일을 만들었습니다."); } catch { setError("JSON 파일을 만들지 못했습니다. 내보내기 권한을 다시 확인한 뒤 시도하세요."); }
      }}>현재 기록 JSON 내려받기</button><button type="button" className="bp-button" disabled={!board || !canExport} onClick={async () => {
        const authorized = await exportBoard(); if (!authorized) return;
        setRaw(JSON.stringify(authorized)); setCandidate(null); setError("");
      }}>현재 기록 다시 표시</button><label className="bp-field"><span>JSON 파일 선택</span><input type="file" accept="application/json,.json" disabled={!canWrite} onChange={async (event) => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (!file) return;
        if (file.size > BUSINESS_PLAN_MAX_IMPORT_BYTES) { setError("JSON 백업은 2MB 이하여야 합니다."); setCandidate(null); return; }
        try { const text = await file.text(); setRaw(text); review(text); } catch { setError("백업 파일을 읽지 못했습니다. 파일을 다시 선택하세요."); }
      }} /></label></div>
      <p className="bp-notice">가져오기는 현재 화면의 작업·주장·문서·점검 전체를 교체합니다. 서버 기록은 ‘서버에 저장’을 누를 때 변경됩니다. 자동 파일 백업은 만들지 않습니다. 필요하면 내보내기 권한을 확인한 뒤 직접 보관하세요.</p>
      <label className="bp-field"><span>사업계획서 보드 JSON</span><textarea className="bp-json" value={raw} readOnly={!canWrite} rows={14} spellCheck={false} onChange={(event) => { setRaw(event.target.value); setCandidate(null); setNotice(""); }} /></label>
      {notice && <p role="status" className="bp-notice">{notice}</p>}
      <BusinessPlanError error={error} />
      {candidate && <div className="bp-notice bp-notice--good"><strong>가져오기 검토 완료</strong><p>{candidate.project.title} · 작업 {candidate.tasks.length}개 · 주장 {candidate.claims.length}개 · 문서 {candidate.documents.length}개 · 멘토 요청 {candidate.mentor.length}개</p><p>4개 실행 항목은 승인 대기로 유지됩니다.</p></div>}
    </div>
    <footer className="bp-dialog-footer"><span>원문은 소유자와 명시적으로 권한을 받은 계정만 접근합니다.</span><div className="bp-actions"><button type="button" className="bp-button" disabled={!canWrite} onClick={() => review(raw)}>가져오기 검토</button>{candidate && canWrite && <button type="button" className="bp-button bp-button--primary" onClick={() => {
        const failure = onCommit(candidate, "검증된 JSON으로 전체 작업 기록 교체");
        if (failure) setError(failure); else onClose();
    }}>검토한 기록 가져오기</button>}</div></footer>
  </BusinessPlanDialog>;
}
