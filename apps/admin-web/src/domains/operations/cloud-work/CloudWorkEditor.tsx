import { ACTIONS, CI, inputTime, MAIN, OPS, restricted, RISK_LABELS, SIGNALS, STAGES, stampISO, taskSchema } from "@toonstudio/contracts/admin-cloud-workboard";
import { useEffect, useState } from "react";

import { WorkBadge, WorkCallout, WorkDialog, WorkField, WorkIcon, WorkLink, WorkSelect } from "./cloud-work-ui";

import type { Evidence, Task } from "@toonstudio/contracts/admin-cloud-workboard";

const TABS = ["개요", "소스·CI", "운영·신호", "근거·로그"] as const;
type TextKey = { [Key in keyof Task]: Task[Key] extends string ? Key : never }[keyof Task];
type Field = { key: TextKey; label: string; long?: boolean; hint?: string };
const OVERVIEW: Field[] = [
  { key: "assignment", label: "담당 작업", long: true }, { key: "scope", label: "영향 범위", long: true },
  { key: "prerequisites", label: "선행 조건", long: true }, { key: "blockers", label: "차단 요인", long: true },
  { key: "nextAction", label: "다음 조치", long: true }, { key: "notes", label: "추가 메모", long: true },
];
const SOURCE: Field[] = [
  { key: "repo", label: "저장소 URL" }, { key: "localPath", label: "로컬 경로" },
  { key: "localBranch", label: "로컬 브랜치" }, { key: "remoteBranch", label: "원격 브랜치" },
  { key: "localSha", label: "로컬 전체 SHA" }, { key: "remoteSha", label: "원격 전체 SHA" },
  { key: "mainSha", label: "main 전체 SHA" }, { key: "changeKey", label: "동일 변경 그룹", hint: "같은 저장소에서 동일 변경으로 비교할 기록에 같은 값을 입력합니다." },
  { key: "pr", label: "PR URL" }, { key: "comparisonLink", label: "main 비교 근거 URL" },
  { key: "comparisonNote", label: "로컬·원격·main 비교 메모", long: true },
  { key: "ciSha", label: "CI 대상 전체 SHA" }, { key: "ciLink", label: "CI 결과 URL" }, { key: "ciNote", label: "CI 결과 메모", long: true },
];

function TextFields({ fields, task, update }: { fields: Field[]; task: Task; update: (patch: Partial<Task>) => void }) {
  return <>{fields.map(field => <WorkField key={field.key} label={field.label} hint={field.hint} wide={field.long}>
    {field.long ? <textarea rows={3} maxLength={6000} value={task[field.key]} onChange={event => update({ [field.key]: event.target.value })} />
      : <input value={task[field.key]} maxLength={field.key.toLowerCase().includes("sha") ? 40 : field.key.endsWith("Link") || ["repo", "pr"].includes(field.key) ? 2000 : 300} onChange={event => update({ [field.key]: event.target.value })} />}
  </WorkField>)}</>;
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <WorkField label={`${label} (KST)`}><input type="datetime-local" value={inputTime(value)} onChange={event => onChange(stampISO(event.target.value))} /></WorkField>;
}

function EvidenceEditor({ task, update }: { task: Task; update: (patch: Partial<Task>) => void }) {
  const evidenceChange = (index: number, patch: Partial<Evidence>) => update({ evidence: task.evidence.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  const addEvidence = () => update({ evidence: [...task.evidence, { id: crypto.randomUUID(), title: "", url: "", kind: "GitHub", summary: "", observedAt: "", occurredAt: "", subjectSha: "" }] });
  return <>
    <WorkCallout>확인 시각은 직접 관측한 시점으로 입력하세요. CI·배포·main 판정에는 해당 URL과 전체 SHA가 일치하는 증빙이 필요합니다. 과거 대화만으로 검증 완료를 기록할 수 없습니다.</WorkCallout>
    <div className="cw-section-heading"><h3>근거 자료 <span>{task.evidence.length}/30</span></h3><button type="button" disabled={task.evidence.length >= 30} onClick={addEvidence}><WorkIcon name="add" />근거 추가</button></div>
    {task.evidence.map((item, index) => <fieldset className="cw-evidence-card" key={item.id}><legend>근거 {index + 1}</legend>
      <div className="cw-form-grid">
        <WorkField label={`근거 ${index + 1} 제목`}><input value={item.title} maxLength={300} onChange={event => evidenceChange(index, { title: event.target.value })} /></WorkField>
        <WorkField label={`근거 ${index + 1} 유형`}><WorkSelect value={item.kind} options={["GitHub", "로컬 조사", "운영 기록", "사용자 기록", "과거 대화"]} onChange={kind => evidenceChange(index, { kind: kind as Evidence["kind"] })} /></WorkField>
        <WorkField label={`근거 ${index + 1} URL`}><input value={item.url} maxLength={2000} onChange={event => evidenceChange(index, { url: event.target.value })} /></WorkField>
        <WorkField label={`근거 ${index + 1} 대상 전체 SHA`}><input maxLength={40} value={item.subjectSha} onChange={event => evidenceChange(index, { subjectSha: event.target.value })} /></WorkField>
        <TimeField label={`근거 ${index + 1} 확인 시각`} value={item.observedAt} onChange={observedAt => evidenceChange(index, { observedAt })} />
        <TimeField label={`근거 ${index + 1} 사건 시각`} value={item.occurredAt} onChange={occurredAt => evidenceChange(index, { occurredAt })} />
        <WorkField label={`근거 ${index + 1} 확인 내용`} wide><textarea rows={3} maxLength={6000} value={item.summary} onChange={event => evidenceChange(index, { summary: event.target.value })} /></WorkField>
      </div>
      <div className="cw-spread"><WorkLink url={item.url}>근거 열기</WorkLink><button type="button" className="cw-danger-text" onClick={() => update({ evidence: task.evidence.filter((_, itemIndex) => itemIndex !== index) })}>근거 {index + 1} 제거</button></div>
    </fieldset>)}
    <div className="cw-section-heading"><h3>로그 링크 <span>{task.logLinks.length}/20</span></h3><button type="button" disabled={task.logLinks.length >= 20} onClick={() => update({ logLinks: [...task.logLinks, { title: "", url: "" }] })}><WorkIcon name="add" />로그 추가</button></div>
    {task.logLinks.map((link, index) => <div className="cw-log-row" key={index}>
      <WorkField label={`로그 ${index + 1} 이름`}><input value={link.title} maxLength={300} onChange={event => update({ logLinks: task.logLinks.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item) })} /></WorkField>
      <WorkField label={`로그 ${index + 1} URL`}><input value={link.url} maxLength={2000} onChange={event => update({ logLinks: task.logLinks.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item) })} /></WorkField>
      <button type="button" aria-label={`로그 ${index + 1} 제거`} onClick={() => update({ logLinks: task.logLinks.filter((_, itemIndex) => itemIndex !== index) })}><WorkIcon name="x" /></button>
    </div>)}
  </>;
}

interface Props {
  initial: Task; projects: string[]; openedRevision: number; revision: number; latest?: Task;
  saving: boolean; unavailable: boolean; conflict: boolean; error: string;
  onSave: (task: Task) => Promise<boolean>; onClose: () => void; onReload: () => void; onBackup: (task: Task) => void;
}

export function CloudWorkEditor(props: Props) {
  const [task, setTask] = useState(props.initial);
  const [tab, setTab] = useState<(typeof TABS)[number]>("개요");
  const [error, setError] = useState("");
  const [discard, setDiscard] = useState(false);
  const [reviewedRevision, setReviewedRevision] = useState(props.openedRevision);
  const remoteUpdated = props.openedRevision !== props.revision;
  const revisionChanged = reviewedRevision !== props.revision;
  const dirty = JSON.stringify(task) !== JSON.stringify(props.initial);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  const update = (patch: Partial<Task>) => {
    setTask(current => ({ ...current, ...patch, updatedAt: new Date().toISOString() }));
    setError("");
    setDiscard(false);
  };
  const close = () => { if (props.saving) return; if (dirty) setDiscard(true); else props.onClose(); };
  const save = async () => {
    const result = taskSchema.safeParse(task);
    if (!result.success) { setError(result.error.issues[0]?.message || "입력 내용을 확인해 주세요."); return; }
    if (await props.onSave(result.data)) props.onClose();
  };
  return <WorkDialog title={props.initial.title || "새 작업 기록"} onClose={close} wide>
    <div className="cw-dialog-summary"><span className="cw-meta">{task.id}</span><WorkBadge>{task.project}</WorkBadge><span className="cw-meta">기록 수정은 외부 작업을 실행하지 않습니다.</span></div>
    <div className="cw-editor-tabs" role="tablist" aria-label="작업 상세 구분">{TABS.map(name => <button type="button" role="tab" aria-selected={tab === name} key={name} onClick={() => setTab(name)}>{name}</button>)}</div>
    <div className="cw-dialog-body" role="tabpanel" aria-label={tab}>
      {(props.error || error) && <div className="cw-error" role="alert">{error || props.error}</div>}
      {props.conflict && <WorkCallout tone="warning" title="저장 충돌 · 편집본 유지"><p>편집본을 내려받고 최신 기록을 불러오세요. 재조회 후에는 변경 내용을 직접 비교해야 다시 저장할 수 있습니다.</p><button type="button" disabled={props.saving} onClick={props.onReload}><WorkIcon name="refresh" />최신 기록 불러오기</button></WorkCallout>}
      {remoteUpdated && <WorkCallout tone="warning" title="최신 기록이 변경되었습니다"><p>아래 최신 작업과 현재 편집본을 비교하세요. 저장하면 이 작업의 편집 내용이 최신 기록에 반영됩니다.</p><details><summary>최신 서버 작업 보기</summary><pre>{props.latest ? JSON.stringify(props.latest, null, 2) : "최신 서버에 이 작업이 없습니다."}</pre></details><label className="cw-check"><input type="checkbox" checked={!revisionChanged} onChange={event => setReviewedRevision(event.target.checked ? props.revision : props.openedRevision)} />최신 기록과 편집본을 비교했습니다</label></WorkCallout>}
      {tab === "개요" && <div className="cw-form-grid">
        <WorkField label="작업 제목" wide><input data-autofocus value={task.title} maxLength={300} onChange={event => update({ title: event.target.value })} /></WorkField>
        <WorkField label="프로젝트"><input list="cloud-work-projects" value={task.project} maxLength={300} onChange={event => update({ project: event.target.value })} /><datalist id="cloud-work-projects">{props.projects.map(project => <option key={project} value={project} />)}</datalist></WorkField>
        <WorkField label="담당자"><input value={task.owner} maxLength={300} onChange={event => update({ owner: event.target.value })} /></WorkField>
        <WorkField label="담당 조치 유형"><WorkSelect value={task.action} options={ACTIONS} onChange={value => { const action = value as Task["action"]; update({ action, stage: restricted({ ...task, action }) ? "승인 대기" : task.stage }); }} /></WorkField>
        <WorkField label="현재 상태" hint={restricted(task) ? "실행 조치는 승인 대기로 고정됩니다." : undefined}><WorkSelect value={task.stage} options={restricted(task) ? ["승인 대기"] : STAGES} onChange={stage => update({ stage: stage as Task["stage"] })} /></WorkField>
        <WorkField label="우선순위"><WorkSelect value={task.priority} options={["높음", "보통", "낮음"]} onChange={priority => update({ priority: priority as Task["priority"] })} /></WorkField>
        <TimeField label="최종 확인 시점" value={task.verifiedAt} onChange={verifiedAt => update({ verifiedAt })} />
        <TextFields fields={OVERVIEW} task={task} update={update} />
      </div>}
      {tab === "소스·CI" && <div className="cw-form-grid">
        <TextFields fields={SOURCE} task={task} update={update} />
        <WorkField label="로컬 변경 파일 수" hint="미확인은 빈칸으로 둡니다."><input type="number" min={0} max={100000} value={task.dirtyFiles ?? ""} onChange={event => update({ dirtyFiles: event.target.value === "" ? null : Number(event.target.value) })} /></WorkField>
        <WorkField label="PR 상태"><WorkSelect value={task.prState} options={["미확인", "열림", "닫힘", "병합됨"]} onChange={prState => update({ prState: prState as Task["prState"] })} /></WorkField>
        <WorkField label="main 포함 판정"><WorkSelect value={task.mainInclusion} options={MAIN} onChange={mainInclusion => update({ mainInclusion: mainInclusion as Task["mainInclusion"] })} /></WorkField>
        <WorkField label="CI 결과"><WorkSelect value={task.ciStatus} options={CI} onChange={ciStatus => update({ ciStatus: ciStatus as Task["ciStatus"] })} /></WorkField>
        <TimeField label="PR 병합 시각" value={task.mergedAt} onChange={mergedAt => update({ mergedAt })} />
      </div>}
      {tab === "운영·신호" && <>
        <WorkCallout>운영 상태는 관측한 범위의 기록입니다. 배포·마이그레이션·계정 변경은 이 화면에서 실행되지 않습니다.</WorkCallout>
        <div className="cw-form-grid">
          {([ ["deploy", "배포"], ["migration", "마이그레이션"], ["account", "계정 설정"], ["infra", "인프라 설정"] ] as const).map(([key, label]) => <WorkField key={key} label={`${label} 상태`}><WorkSelect value={task[`${key}Status`]} options={OPS} onChange={value => update({ [`${key}Status`]: value })} /></WorkField>)}
          <TextFields fields={[{ key: "deploySha", label: "배포 전체 SHA" }, { key: "deployId", label: "배포 ID" }, { key: "deployEnvironment", label: "배포 환경" }, { key: "deployLink", label: "배포 근거 URL" }, { key: "deployNote", label: "배포 범위 메모", long: true }, { key: "migrationNote", label: "마이그레이션 범위 메모", long: true }, { key: "accountNote", label: "계정 설정 범위 메모", long: true }, { key: "infraNote", label: "인프라 설정 범위 메모", long: true }]} task={task} update={update} />
          {Object.entries(RISK_LABELS).map(([key, label]) => <WorkField key={key} label={`${label} 신호`}><WorkSelect value={task.risks[key as keyof Task["risks"]]} options={SIGNALS} onChange={value => update({ risks: { ...task.risks, [key]: value } })} /></WorkField>)}
          <TextFields fields={[{ key: "riskNote", label: "신호 근거와 차단 내용", long: true }]} task={task} update={update} />
        </div>
      </>}
      {tab === "근거·로그" && <EvidenceEditor task={task} update={update} />}
      {discard && <WorkCallout tone="warning" title="저장하지 않은 편집 내용이 있습니다"><p>편집본을 내려받거나 편집을 계속할 수 있습니다.</p><button type="button" onClick={props.onClose}>편집 취소하고 닫기</button><button type="button" onClick={() => setDiscard(false)}>계속 편집</button></WorkCallout>}
    </div>
    <footer className="cw-dialog-footer"><button type="button" onClick={() => props.onBackup(task)}><WorkIcon name="download" />편집본 JSON</button><div><button type="button" disabled={props.saving} onClick={close}>닫기</button><button type="button" className="cw-primary" disabled={props.saving || props.unavailable || props.conflict || revisionChanged} onClick={() => void save()}>{props.saving ? "저장 중…" : "작업 기록 저장"}</button></div></footer>
  </WorkDialog>;
}
