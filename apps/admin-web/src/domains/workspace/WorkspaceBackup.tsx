import { importAdminWorkspace, MAX_WORKSPACE_RECOVERY_BYTES, projectWorkspaceScope, reviewWorkspaceImport, workspaceImportSizeAllowed } from "@toonstudio/contracts/admin-workspace";
import { useEffect, useId, useRef, useState } from "react";

import { workspaceDate, WorkspaceBadge, WorkspaceDialog, WorkspaceFormError } from "./workspace-ui";

import type { AdminWorkspace, AdminWorkspaceScope, WorkspaceImport } from "@toonstudio/contracts/admin-workspace";

export function WorkspaceImportDialog({ state, scope, busy, editable, canExport, backup, onSave, onClose }: { state: AdminWorkspace; scope: AdminWorkspaceScope; busy: boolean; editable: boolean; canExport: boolean; backup: () => Promise<boolean>; onSave: (next: AdminWorkspace, message: string) => Promise<string | null>; onClose: () => void }) {
  const [preview, setPreview] = useState<AdminWorkspace | null>(null);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [backupRequested, setBackupRequested] = useState(false);
  const selection = useRef(0);
  const inputId = useId();
  useEffect(() => () => { selection.current += 1; }, []);
  async function read(file?: File) {
    const token = ++selection.current;
    setPreview(null); setError(""); setFilename(file?.name ?? "");
    if (!file || !editable) return;
    if (file.size > MAX_WORKSPACE_RECOVERY_BYTES) { setError("일반 JSON은 12MiB, 복구 파일은 64MiB 이하만 가져올 수 있습니다."); return; }
    setReading(true);
    try {
      const value: unknown = JSON.parse(await file.text());
      if (token !== selection.current) return;
      const recovery = value !== null && typeof value === "object" && "kind" in value && value.kind === "toonstudio-admin-recovery";
      if (!workspaceImportSizeAllowed(file.size, recovery)) { setError("일반 JSON은 12MiB, 복구 파일은 64MiB 이하여야 합니다."); return; }
      const result = importAdminWorkspace(value, state);
      if (!result.ok) { setError(result.errors.join("\n")); return; }
      setPreview(projectWorkspaceScope(result.value, scope));
    } catch { if (token === selection.current) setError("JSON 파일을 읽을 수 없습니다. 올바른 작업실·통합 보드 백업인지 확인하세요."); }
    finally { if (token === selection.current) setReading(false); }
  }
  async function apply() {
    if (!preview || !editable || busy) return;
    if (scope === "operations" || backupRequested) {
      try { if (!canExport || !(await backup())) { setError("내보내기 권한과 현재 기록의 백업을 확인하지 못해 가져오기를 중단했습니다."); return; } }
      catch { setError("백업을 확인하지 못해 가져오기를 중단했습니다."); return; }
    }
    const error = await onSave(preview, "검증한 JSON 기록을 가져왔습니다. 원본과 현재 확인 상태를 구분해 보존했습니다.");
    if (error) setError(error); else onClose();
  }
  const review = preview ? reviewWorkspaceImport(state, preview) : null;
  return <WorkspaceDialog title="JSON 기록 가져오기" description={scope === "business" ? "허용된 담당자만 비공개 보관함에 이전 자료를 가져올 수 있습니다. 파일 다운로드는 별도로 선택한 경우에만 수행합니다." : "인증된 관리자만 운영 범위의 참조 자료를 저장할 수 있습니다. 적용 전 현재 운영 기록을 백업합니다."} onClose={onClose} busy={busy}>
    <div className="workspace-dialog-body"><WorkspaceFormError error={error} /><div className="workspace-field"><label htmlFor={inputId}>백업 JSON 파일</label><input id={inputId} type="file" accept="application/json,.json" disabled={!editable || busy || reading} onChange={event => { void read(event.target.files?.[0]); event.target.value = ""; }} /><small>현재 작업실 JSON, 이전 사업계획·통합 보드 JSON, 복구 파일을 지원합니다.</small></div>
      <p className="workspace-alert">이전 보드의 완료·확인 표시는 원문에 보존하고 현재 검증으로 자동 승격하지 않습니다. 기존 원문·고정본을 삭제하거나 승인 제한을 해제하는 가져오기는 거부합니다.</p>
      {scope === "business" && canExport ? <label><input type="checkbox" checked={backupRequested} disabled={busy || reading} onChange={event => setBackupRequested(event.target.checked)} />현재 비공개 기록을 JSON으로 먼저 내보내기</label> : null}
      {reading ? <p role="status">파일 구조와 근거 기록을 확인하고 있습니다.</p> : null}
      {preview && review ? <section className="workspace-import-preview" aria-label="가져오기 미리보기"><h3>{filename}</h3><div className="workspace-import-counts">{[["추가 기록", review.added], ["현재 편집 보존", review.preserved], ["원문 변경 확인", review.changedSources.length], ["원본 묶음 추가", review.newArchives]].map(([label, count]) => <div key={label}><strong>{count}</strong><span>{label}</span></div>)}</div><p>{review.unchanged ? "이미 가져온 동일한 자료입니다. 추가 저장이 필요하지 않습니다." : "현재 선택한 저장 범위에 적용할 차이입니다. 같은 출처의 기록은 중복 생성하지 않습니다."}</p>{scope === "operations" ? <p>사업계획서 본문·인용·원문 묶음은 운영 저장본에 포함하지 않습니다.</p> : null}<ul>{review.changedSources.map(record => <li key={record.id}>{record.title}: 원문이 바뀌었습니다. 현재 편집은 유지하며 원문 묶음에서 차이를 검토하세요.</li>)}</ul><small>파일의 HTML·스크립트는 실행하지 않습니다. 출처 링크의 내용이나 최신성을 자동 검증하지 않습니다.</small></section> : null}
    </div><footer className="workspace-dialog-footer"><button type="button" onClick={onClose} disabled={busy}>닫기</button><button type="button" className="workspace-primary" onClick={() => void apply()} disabled={!preview || !editable || busy || reading || review?.unchanged}>{busy ? "저장 중…" : scope === "operations" || backupRequested ? "현재 기록 백업 후 가져오기" : "검토한 기록 가져오기"}</button></footer>
  </WorkspaceDialog>;
}

function Archive({ item }: { item: WorkspaceImport }) {
  const [open, setOpen] = useState(false);
  return <article className="workspace-panel"><header className="workspace-panel-header"><div><h3>{item.label}</h3><p>{workspaceDate(item.importedAt)}</p></div><WorkspaceBadge tone="info">원본 보존</WorkspaceBadge></header><div className="workspace-panel-body"><p className="workspace-muted">가져올 당시의 원본 전체입니다. 여기에 적힌 과거 판정·수치·일정은 현재 검증과 구분됩니다.</p><details className="workspace-source-details" onToggle={event => setOpen(event.currentTarget.open)}><summary>가져온 원본 전체 보기</summary>{open ? <pre>{JSON.stringify(item.archive, null, 2)}</pre> : null}</details></div></article>;
}
export function WorkspaceSources({ state }: { state: AdminWorkspace }) {
  return <section aria-label="가져온 원문"><div className="workspace-section-heading"><div><h2>가져온 원문</h2><p>원본 전체와 가져온 시각을 보존합니다. 기존 서비스의 이후 편집과 자동 동기화하지 않습니다.</p></div></div>{state.imports.length ? <div className="workspace-source-grid">{state.imports.map(item => <Archive key={item.id} item={item} />)}</div> : <div className="workspace-panel workspace-empty"><h3>가져온 원문이 없습니다.</h3><p>현재 화면은 일반 초기 템플릿입니다. 관리자 권한으로 기존 JSON을 가져오면 원문이 이곳에 연결됩니다.</p></div>}</section>;
}
