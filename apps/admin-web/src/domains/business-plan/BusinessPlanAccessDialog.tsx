import { useEffect, useRef, useState } from "react";

import { changeBusinessPlanAccess, isBusinessPlanAccessDenied, loadBusinessPlanAccess } from "./business-plan-api";
import { BusinessPlanDialog, BusinessPlanError, errorMessage } from "./business-plan-ui";

import type { BusinessPlanAccessList, ChangeBusinessPlanAccessRequest } from "@toonstudio/contracts/business-plan";

export function BusinessPlanAccessDialog({ onClose, onDenied }: { onClose: () => void; onDenied: () => void }) {
  const [list, setList] = useState<BusinessPlanAccessList | null>(null);
  const [userId, setUserId] = useState("");
  const [canWrite, setCanWrite] = useState(false);
  const [canExport, setCanExport] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef<ChangeBusinessPlanAccessRequest | null>(null);
  const controller = useRef<AbortController | null>(null);
  const lock = useRef(false);

  useEffect(() => {
    const request = new AbortController(); controller.current = request;
    void loadBusinessPlanAccess(request.signal).then((value) => {
      if (!request.signal.aborted) setList(value);
    }).catch((cause: unknown) => {
      if (request.signal.aborted) return;
      if (isBusinessPlanAccessDenied(cause)) onDenied(); else setError(errorMessage(cause));
    });
    return () => { controller.current?.abort(); pending.current = null; };
  }, [onDenied]);

  async function change(input: Omit<ChangeBusinessPlanAccessRequest, "mutationId">) {
    if (lock.current || !list) return;
    const transaction = pending.current ?? { ...input, mutationId: crypto.randomUUID() };
    pending.current = transaction; lock.current = true; setBusy(true); setError(""); setNotice("");
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    try {
      await changeBusinessPlanAccess(transaction, request.signal);
      if (request.signal.aborted) return;
      pending.current = null;
      const refreshed = await loadBusinessPlanAccess(request.signal);
      if (request.signal.aborted) return;
      setList(refreshed); setNotice(transaction.canRead ? "지정한 계정의 접근 권한을 저장했습니다." : "지정한 계정의 접근 권한을 철회했습니다.");
    } catch (cause) {
      if (request.signal.aborted) return;
      if (isBusinessPlanAccessDenied(cause)) onDenied();
      else setError(`${errorMessage(cause)} 결과가 불분명한 경우 같은 요청으로 다시 확인합니다.`);
    } finally {
      lock.current = false; if (!request.signal.aborted) setBusy(false);
    }
  }

  return <BusinessPlanDialog title="사업 자료 접근 권한" description="소유자만 기존 계정 ID를 지정해 읽기·수정·내보내기 권한을 부여하거나 철회할 수 있습니다." onClose={onClose}>
    <div className="bp-dialog-body">
      <BusinessPlanError error={error} />
      {!list && !error && <p role="status">접근 권한을 확인하고 있습니다.</p>}
      {notice && <p className="bp-notice" role="status">{notice}</p>}
      {list && <>
        <p className="bp-private-identity">소유자: {list.ownerUserId}</p>
        <form onSubmit={(event) => { event.preventDefault(); void change({ userId: userId.trim(), canRead: true, canWrite, canExport }); }}>
          <label className="bp-field"><span>권한을 받을 기존 계정 ID</span><input value={userId} onChange={(event) => setUserId(event.target.value)} maxLength={255} required disabled={busy || Boolean(pending.current)} /></label>
          <p className="bp-muted">활성 관리자 또는 운영자 계정을 입력하세요. 기본 부여 범위는 읽기이며, 수정과 내보내기는 각각 선택합니다.</p>
          <label className="bp-checkbox"><input type="checkbox" checked={canWrite} onChange={(event) => setCanWrite(event.target.checked)} disabled={busy || Boolean(pending.current)} /><span>수정 허용</span></label>
          <label className="bp-checkbox"><input type="checkbox" checked={canExport} onChange={(event) => setCanExport(event.target.checked)} disabled={busy || Boolean(pending.current)} /><span>내보내기 허용</span></label>
          <button type="submit" className="bp-button bp-button--primary" disabled={busy || (!userId.trim() && !pending.current)}>{busy ? "권한 확인 중…" : pending.current ? "같은 권한 변경 다시 확인" : "지정 계정에 권한 부여"}</button>
        </form>
        <ul className="bp-review-list bp-access-grants">{list.grants.map((grant) => <li key={grant.userId}>
          <div><strong>{grant.userId}</strong><small>읽기 · 수정 {grant.canWrite ? "허용" : "불가"} · 내보내기 {grant.canExport ? "허용" : "불가"}</small></div>
          <button type="button" className="bp-button bp-button--danger" disabled={busy || Boolean(pending.current)} onClick={() => void change({ userId: grant.userId, canRead: false, canWrite: false, canExport: false })}>권한 철회</button>
        </li>)}</ul>
        {!list.grants.length && <p className="bp-empty">명시적으로 권한을 받은 계정이 없습니다.</p>}
      </>}
    </div>
  </BusinessPlanDialog>;
}
