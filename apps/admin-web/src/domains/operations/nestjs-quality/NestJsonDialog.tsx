import { parseNestBoardImport } from "@toonstudio/contracts/admin-nestjs-quality";
import { useEffect, useRef, useState } from "react";

import { NestDialog, nestDate, nestExport } from "./nestjs-quality-ui";

import type { NestBoardDocument, NestBoardView } from "@toonstudio/contracts/admin-nestjs-quality";

interface Props {
  view: NestBoardView; canEdit: boolean; busy: boolean; error: string; conflict: boolean;
  onSave: (document: NestBoardDocument, reason: string) => Promise<string | null>;
  onReload: () => Promise<boolean>; onDirty: (dirty: boolean) => void; onClose: () => void;
}

export function NestJsonDialog({ view, canEdit, busy, error, conflict, onSave, onReload, onDirty, onClose }: Props) {
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState<NestBoardDocument | null>(null);
  const [validation, setValidation] = useState("");
  const [reason, setReason] = useState("검토한 JSON으로 NestJS 검증 기록 갱신");
  const [confirmed, setConfirmed] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const inputGeneration = useRef(0);
  useEffect(() => { onDirty(raw.length > 0); return () => onDirty(false); }, [raw, onDirty]);
  useEffect(() => () => { inputGeneration.current += 1; }, []);
  function close(): void { if (busy) return; if (raw) setConfirmClose(true); else onClose(); }
  function changeRaw(value: string): void { inputGeneration.current += 1; setRaw(value); setPreview(null); setConfirmed(false); setValidation(""); }
  function validate(): void {
    try {
      const next = parseNestBoardImport(raw);
      for (const task of view.document.tasks.filter((item) => item.approvalRequired)) {
        const replacement = next.tasks.find((item) => item.id === task.id);
        if (!replacement?.approvalRequired) throw new Error(`${task.id}: 기존 승인 필요 항목을 삭제하거나 승인을 해제할 수 없습니다.`);
      }
      setPreview(next); setValidation(""); setConfirmed(false);
    }
    catch (cause) { setPreview(null); setValidation(cause instanceof Error ? cause.message : "JSON을 확인하세요."); }
  }
  async function readFile(file: File | undefined): Promise<void> {
    if (!file) return;
    const generation = ++inputGeneration.current;
    setPreview(null); setConfirmed(false); setValidation("");
    if (file.size > 2_000_000) { setValidation("JSON 파일은 2MB 이하여야 합니다."); return; }
    try { const content = await file.text(); if (generation === inputGeneration.current) changeRaw(content); }
    catch { if (generation === inputGeneration.current) setValidation("파일을 읽지 못했습니다. JSON 원문을 붙여넣거나 다시 선택하세요."); }
  }
  async function save(): Promise<void> {
    if (!preview || !confirmed || !canEdit || busy || conflict) return;
    if (!reason.trim()) { setValidation("변경 이유를 입력하세요."); return; }
    const problem = await onSave(preview, reason.trim());
    if (problem) setValidation(problem);
  }
  const changedTasks = preview?.tasks.filter((task) => JSON.stringify(view.document.tasks.find((item) => item.id === task.id)) !== JSON.stringify(task)) ?? [];
  const removedTasks = preview ? view.document.tasks.filter((task) => !preview.tasks.some((item) => item.id === task.id)) : [];

  return <NestDialog title="NestJS JSON 관리" description="문서 전체와 서버 변경 이력 요약을 내보냅니다. 가져오기는 검증·검토·확인 후 서버에 저장합니다." onClose={close}>
    <div className="nest-dialog-body">
      <button type="button" onClick={() => nestExport(view.document, view)}>전체 기록 JSON 내보내기</button>
      <p>현재 서버 버전 {view.revision} · 서버 이력 요약 {view.history.length}건 · 원본 출처 이력 {view.document.sourceHistory.length}건</p>
      <p className="nest-muted">현재 문서의 시나리오 전후 증거는 모두 포함합니다. 과거 서버 버전별 문서 전후 사본을 포함하는 전체 감사 내보내기는 아닙니다.</p>
      {!canEdit ? <p className="nest-notice">operator는 읽기·내보내기만 가능합니다. 가져오기는 관리자 권한이 필요합니다.</p> : <>
        <p className="nest-muted">패키지·PR·CI·실행 경로·정렬 순서도 JSON에서 수정할 수 있습니다. 기존 Sites 내보내기와 새 문서 형식을 모두 검증합니다. 가져온 서버 이력으로 실제 감사 이력을 덮어쓰지 않습니다.</p>
        <label>JSON 파일 선택<input type="file" accept="application/json,.json" disabled={busy} onChange={(event) => void readFile(event.target.files?.[0])} /></label>
        <label>가져올 JSON<textarea rows={10} value={raw} disabled={busy} onChange={(event) => changeRaw(event.target.value)} spellCheck={false} /></label>
        <button type="button" disabled={!raw || busy} onClick={validate}>JSON 검증·미리보기</button>
        {preview && <section className="nest-panel" aria-label="가져오기 미리보기">
          <h3>가져오기 미리보기</h3><dl className="nest-facts"><dt>기준 SHA</dt><dd>{preview.snapshot.mainSha}</dd><dt>자료 확인</dt><dd>{nestDate(preview.snapshot.observedAt)}</dd><dt>항목</dt><dd>{preview.tasks.length}개 · 변경·추가 {changedTasks.length}개 · 제거 {removedTasks.length}개</dd><dt>비교 자료</dt><dd>패키지 {preview.snapshot.packages.length}개 · PR {preview.snapshot.prs.length}개 · CI {preview.snapshot.ci.length}개 · 실행 경로 {preview.snapshot.paths.length}개</dd><dt>스냅샷</dt><dd>{JSON.stringify(preview.snapshot) === JSON.stringify(view.document.snapshot) ? "기존 비교 자료 유지" : "비교 자료 변경 있음"}</dd></dl>
          {changedTasks.length > 0 && <details><summary>변경·추가 항목 {changedTasks.length}개 확인</summary><ul>{changedTasks.map((task) => <li key={task.id}>{task.id} · {task.title} · {task.status} · 실제 결과 {task.result}</li>)}</ul></details>}
          {removedTasks.length > 0 && <div className="nest-notice"><strong>제거될 항목</strong><ul>{removedTasks.map((task) => <li key={task.id}>{task.id} · {task.title}</li>)}</ul></div>}
          <details><summary>패키지 버전 미리보기</summary><ul>{preview.snapshot.packages.map((row) => <li key={row.name}><strong>{row.name}</strong> · 선언 {row.declared} · 잠금 {row.locked} · 목표 {row.target}<p>{row.targetNote} · {row.assessment}</p></li>)}</ul></details>
          <p>실행 결과가 미확인인 시나리오 {preview.tasks.filter((task) => task.category === "검증 시나리오" && task.result === "미확인").length}개 · 승인 대기 {preview.tasks.filter((task) => task.approvalRequired).length}개</p>
          <label>가져오기 변경 이유<input value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} /></label>
          <label className="nest-check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />비교 내용과 제거 항목을 검토했으며 전체 기록 교체를 확인합니다.</label>
          <button type="button" className="nest-primary" disabled={!confirmed || busy || conflict} onClick={() => void save()}>{busy ? "저장 중…" : "검토한 JSON으로 서버 기록 교체"}</button>
        </section>}
      </>}
      {(validation || error) && <p className="nest-error" role="alert">{error || validation}</p>}
      {conflict && <div className="nest-notice"><p>최신 서버 기록을 덮어쓰지 않았습니다. 가져오기 초안을 보관한 뒤 다시 비교하세요.</p>{preview && <button type="button" onClick={() => nestExport(preview, view, true)}>가져오기 초안 내보내기</button>}<button type="button" onClick={() => setConfirmReload(true)}>최신 기록 읽기</button></div>}
      {confirmReload && <div className="nest-notice" role="alert"><p>가져오기 초안을 버리고 서버 기록을 다시 읽습니다.</p><button type="button" disabled={busy} onClick={() => void onReload()}>초안을 버리고 최신 기록 읽기</button><button type="button" onClick={() => setConfirmReload(false)}>계속 검토</button></div>}
      {confirmClose && <div className="nest-notice" role="alert"><p>가져오기 초안은 아직 저장되지 않았습니다.</p><button type="button" onClick={() => setConfirmClose(false)}>계속 검토</button><button type="button" onClick={() => { onDirty(false); onClose(); }}>초안 버리고 닫기</button></div>}
    </div>
  </NestDialog>;
}
