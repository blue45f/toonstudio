import { allowedTransitions, dateLabel, emptyData, STATUS_LABEL } from "@toonstudio/contracts/admin-production-change";
import { useEffect, useState } from "react";

import { ChangeDialog, ChangeError, ChangeIcon, ChangeInfo, ChangeStatus, writeDataPath } from "./production-change-ui";
import { ProductionChangeConflict, ProductionChangeOverview, ProductionChangeVerification } from "./ProductionChangeSections";

import type { RequestData, RequestRecord, Status } from "@toonstudio/contracts/admin-production-change";

type Tab = "overview" | "conflict" | "verification" | "history";
const tabs: readonly [Tab, string][] = [["overview", "요청 개요"], ["conflict", "Conflict Center"], ["verification", "적용·검증"], ["history", "이력"]];
const actionLabels: Record<Status, string> = { draft: "초안으로 재작성", submitted: "요청 제출", analysis: "영향 분석 시작", review: "검토 요청", approved: "승인 기록", rejected: "반려 기록", scheduled: "예약 기록", applied: "적용 결과 기록", verified: "검증 완료 기록", closed: "종료 기록" };
interface Props {
  record: RequestRecord | null; initialTab: Tab; canWrite: boolean; active: boolean; busy: boolean; error: string; conflict: boolean; onClose: () => void;
  onSave: (record: RequestRecord | null, data: RequestData) => Promise<RequestRecord | null>;
  onTransition: (record: RequestRecord, status: Status, note: string) => Promise<RequestRecord | null>;
  onUpload: (file: File) => Promise<string | null>;
  onExportDraft: (record: RequestRecord | null, data: RequestData) => Promise<void>;
  onReload: () => Promise<RequestRecord | null>;
}
export function ProductionChangeEditor({ record, initialTab, canWrite, active, busy, error, conflict, onClose, onSave, onTransition, onUpload, onExportDraft, onReload }: Props) {
  const [data, setData] = useState<RequestData>(() => structuredClone(record?.data ?? emptyData()));
  const [tab, setTab] = useState<Tab>(initialTab);
  const [decision, setDecision] = useState<Status | null>(null);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const dirty = JSON.stringify(data) !== JSON.stringify(record?.data ?? emptyData());
  const editable = canWrite && record?.status !== "closed";
  useEffect(() => setData(structuredClone(record?.data ?? emptyData())), [record]);
  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", listener); return () => window.removeEventListener("beforeunload", listener);
  }, [dirty]);
  function close() { if (busy || uploading) return; if (dirty && !window.confirm("저장하지 않은 변경이 있습니다. 변경을 버리고 닫을까요?")) return; onClose(); }
  async function reload() { if (dirty && !window.confirm("미저장 편집 내용을 버리고 서버의 최신 요청을 불러올까요? 필요하면 먼저 초안을 내보내세요.")) return; const result = await onReload(); if (result) setData(structuredClone(result.data)); }
  async function save() { const result = await onSave(record, data); if (result) setData(structuredClone(result.data)); }
  async function transition() { if (!record || !decision) return; const result = await onTransition(record, decision, note); if (result) { setDecision(null); setNote(""); setData(structuredClone(result.data)); } }
  const sections = { record, data, editable, busy: busy || uploading, onEdit: (path: string, value: unknown) => setData(previous => writeDataPath(previous, path, value)), onUpload, onUploadBusy: setUploading };
  return <ChangeDialog active={active} title={record?.data.title ?? "새 변경 요청"} description={record ? `${record.code} · 기록 v${record.version} · 변경 범위 v${record.scopeVersion}` : "초안으로 시작해 근거와 검증을 이어서 기록합니다."} onClose={close} className={!record ? "pc-dialog--new" : ""}>
    {record && <div className="pc-editor-meta"><ChangeStatus status={record.status} /><span>최근 수정 {dateLabel(record.updatedAt)} KST</span>{!canWrite && <span className="pc-badge">읽기 전용</span>}{record.status === "closed" && <span className="pc-badge">종료된 기록</span>}</div>}
    {record && <nav className="pc-editor-tabs" aria-label="요청 상세 구역">{tabs.map(([value, label]) => <button type="button" key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>)}</nav>}
    <div className="pc-dialog-body"><ChangeError>{error}</ChangeError>{conflict && <div className="pc-recovery"><p>편집 내용이 그대로 남아 있습니다. 초안을 보관하고 최신 기록을 확인하세요.</p><button type="button" className="pc-button" disabled={busy} onClick={() => void onExportDraft(record, data)}><ChangeIcon name="download" />미저장 초안 내보내기</button><button type="button" className="pc-button" disabled={busy} onClick={() => void reload()}><ChangeIcon name="refresh" />최신 요청 다시 읽기</button></div>}
      {(!record || tab === "overview") && <ProductionChangeOverview {...sections} />}
      {record && tab === "conflict" && <ProductionChangeConflict {...sections} />}
      {record && tab === "verification" && <ProductionChangeVerification {...sections} />}
      {record && tab === "history" && <section className="pc-history"><h3>변경과 결정 이력</h3><p>작성자와 시각은 서버에서 기록하며 과거 이력을 변경하지 않습니다.</p>{record.approval && <div className="pc-approval-banner"><ChangeIcon name="shield" /><div><strong>{record.approval.valid ? "유효한 승인" : "이전 승인 · 현재 유효하지 않음"}</strong><p>{record.approval.by} · {dateLabel(record.approval.at)} KST · 범위 v{record.approval.scopeVersion}</p><p>{record.approval.note}</p></div></div>}<ol>{[...record.history].reverse().map(item => <li key={item.id}><header><strong>{item.action}</strong><time dateTime={item.at}>{dateLabel(item.at)} KST</time></header><div><ChangeStatus status={item.from} />{item.from !== item.to && <><span>변경 후</span><ChangeStatus status={item.to} /></>}</div>{item.note && <p>{item.note}</p>}<small>{item.actor} · 기록 v{item.version}</small></li>)}</ol></section>}
    </div>
    {record && canWrite && <div className="pc-transition-strip"><span>{dirty ? "변경 내용을 먼저 저장하세요" : "다음 상태 기록"}</span><div>{allowedTransitions(record).map(status => <button type="button" className={`pc-button pc-button--small${status === "approved" || status === "verified" ? " pc-button--positive" : ""}`} key={status} disabled={dirty || busy || uploading || conflict} onClick={() => { setDecision(status); setNote(""); }}>{actionLabels[status]}</button>)}{!allowedTransitions(record).length && <span>종료된 요청입니다.</span>}</div></div>}
    <footer className="pc-dialog-footer"><span>{dirty ? "저장하지 않은 변경" : record ? "서버 기록과 일치" : "초안 입력"}</span><div>{dirty && <button type="button" className="pc-button" disabled={busy || uploading} onClick={() => void onExportDraft(record, data)}>초안 내보내기</button>}<button type="button" className="pc-button" disabled={busy || uploading} onClick={close}>닫기</button>{editable && <button type="button" className="pc-button pc-button--primary" disabled={busy || uploading || conflict || (!dirty && !!record)} onClick={() => void save()}><ChangeIcon name="save" />{busy ? "저장 중" : record ? "기록 저장" : "초안 저장"}</button>}</div></footer>
    {decision && record && <ChangeDialog active={active} title={actionLabels[decision]} description={`${record.data.title} · ${STATUS_LABEL[decision]} 상태와 판단 근거를 기록합니다.`} onClose={() => { if (!busy) setDecision(null); }} className="pc-dialog--decision"><div className="pc-dialog-body"><label className="pc-field"><span>결정 사유와 다음 조치 *</span><textarea autoFocus rows={5} value={note} disabled={busy} placeholder="승인·반려·종료 판단의 근거를 남겨 주세요." onChange={event => setNote(event.target.value)} /></label><ChangeInfo>상태와 결정 이력만 저장하며 외부 코드·배포·운영 데이터 작업은 실행하지 않습니다.</ChangeInfo><ChangeError>{error}</ChangeError></div><footer className="pc-dialog-footer"><button type="button" className="pc-button" disabled={busy} onClick={() => setDecision(null)}>취소</button><button type="button" className="pc-button pc-button--primary" disabled={busy || !note.trim() || conflict} onClick={() => void transition()}>{busy ? "저장 중" : actionLabels[decision]}</button></footer></ChangeDialog>}
  </ChangeDialog>;
}
