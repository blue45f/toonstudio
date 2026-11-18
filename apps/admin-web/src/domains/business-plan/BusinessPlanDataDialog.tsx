import { BUSINESS_PLAN_MAX_IMPORT_BYTES, parseBusinessPlanState, todayKst } from "@toonstudio/contracts/business-plan";
import { useId, useState } from "react";

import { BusinessPlanDialog, BusinessPlanError, downloadBusinessPlan, errorMessage } from "./business-plan-ui";

import type { BusinessPlanCommit } from "./business-plan-ui";
import type { BusinessPlanState } from "@toonstudio/contracts/business-plan";

export function BusinessPlanDataDialog({ board, onCommit, onClose }: { board: BusinessPlanState | null; onCommit: BusinessPlanCommit; onClose: () => void }) {
  const jsonId = useId();
  const currentJson = board ? JSON.stringify(board) : "";
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
      <div className="bp-actions"><button type="button" className="bp-button" disabled={!board} onClick={() => {
        try { downloadBusinessPlan(`business-plan-backup-${todayKst()}.json`, currentJson); setError(""); setNotice("현재 화면의 JSON 백업 파일을 만들었습니다. 서버 저장 상태는 변경되지 않습니다."); } catch { setError("JSON 파일을 만들지 못했습니다. 아래 현재 기록을 복사해 보관하세요."); }
      }}>현재 기록 JSON 내려받기</button><button type="button" className="bp-button" disabled={!board} onClick={() => { setRaw(currentJson); setCandidate(null); setError(""); }}>현재 기록 다시 표시</button><label className="bp-field"><span>JSON 파일 선택</span><input type="file" accept="application/json,.json" onChange={async (event) => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (!file) return;
        if (file.size > BUSINESS_PLAN_MAX_IMPORT_BYTES) { setError("JSON 백업은 2MB 이하여야 합니다."); setCandidate(null); return; }
        try { const text = await file.text(); setRaw(text); review(text); } catch { setError("백업 파일을 읽지 못했습니다. 파일을 다시 선택하세요."); }
      }} /></label></div>
      <p className="bp-notice">가져오기는 현재 화면의 작업·주장·문서·점검 전체를 교체합니다. 서버 기록은 ‘서버에 저장’을 누를 때 변경됩니다. 다른 관리자의 최신 기록과 충돌하면 덮어쓰기를 차단합니다.</p>
      <label className="bp-field" htmlFor={jsonId}><span id={`${jsonId}-label`}>사업계획서 보드 JSON</span><textarea id={jsonId} aria-labelledby={`${jsonId}-label`} className="bp-json" value={raw} rows={14} spellCheck={false} onChange={(event) => { setRaw(event.target.value); setCandidate(null); setNotice(""); }} /></label>
      {notice && <p role="status" className="bp-notice">{notice}</p>}
      <BusinessPlanError error={error} />
      {candidate && <div className="bp-notice bp-notice--good"><strong>가져오기 검토 완료</strong><p>{candidate.project.title} · 작업 {candidate.tasks.length}개 · 주장 {candidate.claims.length}개 · 문서 {candidate.documents.length}개 · 멘토 요청 {candidate.mentor.length}개</p><p>4개 실행 항목은 승인 대기로 유지됩니다.</p></div>}
    </div>
    <footer className="bp-dialog-footer"><span>실제 원문이나 개인 정보는 필요한 관리자 기록에만 넣으세요.</span><div className="bp-actions"><button type="button" className="bp-button" onClick={() => review(raw)}>가져오기 검토</button>{candidate && <button type="button" className="bp-button bp-button--primary" onClick={() => {
      try {
        if (board) downloadBusinessPlan(`business-plan-before-import-${todayKst()}.json`, currentJson);
        const failure = onCommit(candidate, "검증된 JSON으로 전체 작업 기록 교체");
        if (failure) setError(failure); else onClose();
      } catch { setError("현재 기록의 백업 파일을 만들지 못해 가져오기를 중단했습니다. 현재 JSON을 보관한 후 다시 시도하세요."); }
    }}>{board ? "현재 기록 백업 후 가져오기" : "검토한 기록 가져오기"}</button>}</div></footer>
  </BusinessPlanDialog>;
}
