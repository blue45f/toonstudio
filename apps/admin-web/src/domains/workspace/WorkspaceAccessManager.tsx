import { useEffect, useRef, useState } from "react";

import { AdminApiError } from "../../platform/http/admin-api";
import { loadWorkspaceAccess, saveWorkspaceAccess } from "../../platform/http/workspace-api";

import { WorkspaceDialog, WorkspaceFormError } from "./workspace-ui";

import type { WorkspaceAccessList } from "../../platform/http/workspace-api";
import type { AdminWorkspaceGrantInput } from "@toonstudio/contracts/admin-workspace";

/** 소유자만 허용 계정을 변경하며 저장 성공 전에는 화면 권한을 낙관적으로 바꾸지 않는다. */
export function WorkspaceAccessManager({ onClose, onDenied }: { onClose: () => void; onDenied: () => void }) {
  const [access, setAccess] = useState<WorkspaceAccessList | null>(null);
  const [userId, setUserId] = useState("");
  const [canRead, setRead] = useState(true);
  const [canWrite, setWrite] = useState(false);
  const [canExport, setExport] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef<AdminWorkspaceGrantInput | null>(null);
  const request = useRef<AbortController | null>(null);
  const onDeniedRef = useRef(onDenied);
  onDeniedRef.current = onDenied;
  useEffect(() => {
    const controller = new AbortController(); request.current = controller;
    void loadWorkspaceAccess(controller.signal).then(value => { if (!controller.signal.aborted) setAccess(value); }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      if (cause instanceof AdminApiError && [401, 403].includes(cause.status)) onDeniedRef.current();
      else setError(cause instanceof Error ? cause.message : "권한 목록을 읽지 못했습니다.");
    });
    return () => { controller.abort(); request.current?.abort(); pending.current = null; };
  }, []);
  async function save() {
    if (busy || !access || !userId.trim()) return;
    if (typeof crypto.randomUUID !== "function") { setError("안전한 변경 식별자를 만들 수 없습니다."); return; }
    const value = { userId: userId.trim(), canRead, canWrite: canRead && canWrite, canExport: canRead && canExport };
    const previous = pending.current;
    const input = previous && previous.userId === value.userId && previous.canRead === value.canRead && previous.canWrite === value.canWrite && previous.canExport === value.canExport
      ? previous : { ...value, mutationId: crypto.randomUUID() };
    pending.current = input;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(""); setNotice("");
    try {
      await saveWorkspaceAccess(input, controller.signal);
      const latest = await loadWorkspaceAccess(controller.signal);
      if (controller.signal.aborted) return;
      pending.current = null; setAccess(latest); setNotice("비공개 이전 자료의 접근 권한을 저장했습니다.");
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof AdminApiError && [401, 403].includes(cause.status)) { setAccess(null); pending.current = null; onDeniedRef.current(); }
      else setError(cause instanceof Error ? cause.message : "접근 권한을 저장하지 못했습니다.");
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <WorkspaceDialog title="비공개 이전 자료 접근 권한" description="이 보관함의 소유자가 허용한 활성 관리자·운영자만 자료를 볼 수 있습니다. 전문 사업계획서 보드의 권한은 해당 보드에서 관리합니다." busy={busy} onClose={onClose}>
    <div className="workspace-dialog-body"><WorkspaceFormError error={error} /><p role="status">{notice}</p>
      {!access ? <p>소유자 권한을 확인하고 있습니다.</p> : <>
        <p>소유자: {access.ownerUserId}</p>
        <ul>{access.grants.map(grant => <li key={grant.userId}><button type="button" disabled={busy} onClick={() => { setUserId(grant.userId); setRead(true); setWrite(grant.canWrite); setExport(grant.canExport); }}>{grant.userId}</button> · 읽기{grant.canWrite ? " · 편집" : ""}{grant.canExport ? " · 내보내기" : ""}</li>)}</ul>
        <fieldset disabled={busy}><legend>허용 계정 변경</legend>
          <label>사용자 ID<input value={userId} onChange={event => setUserId(event.target.value)} /></label>
          <label><input type="checkbox" checked={canRead} onChange={event => { setRead(event.target.checked); if (!event.target.checked) { setWrite(false); setExport(false); } }} />자료 읽기 허용</label>
          <label><input type="checkbox" checked={canWrite} disabled={!canRead} onChange={event => setWrite(event.target.checked)} />이전 자료 가져오기 허용</label>
          <label><input type="checkbox" checked={canExport} disabled={!canRead} onChange={event => setExport(event.target.checked)} />JSON 내보내기 허용</label>
        </fieldset>
        <p>{canRead ? `${userId.trim() || "선택한 계정"}에게 선택한 권한을 적용합니다.` : `${userId.trim() || "선택한 계정"}의 비공개 이전 자료 접근을 회수합니다. 다음 서버 요청부터 거부됩니다.`}</p>
      </>}
    </div><footer className="workspace-dialog-footer"><button type="button" onClick={onClose} disabled={busy}>닫기</button><button type="button" onClick={() => void save()} disabled={busy || !access || !userId.trim() || userId.trim() === access.ownerUserId}>접근 권한 적용</button></footer>
  </WorkspaceDialog>;
}
