import { WORKSPACE_APPROVAL_TYPES, workspacePreflight } from "@toonstudio/contracts/admin-workspace";
import { useState } from "react";

import { formDate, formText, WorkspaceBadge, WorkspaceDialog, WorkspaceField, WorkspaceFormError, WorkspaceSection } from "./workspace-ui";

import type { AdminWorkspace, WorkspaceApproval, WorkspaceCheckItem, WorkspaceMentorItem, WorkspaceRecord } from "@toonstudio/contracts/admin-workspace";
import type { FormEvent } from "react";

export type ReviewTarget = { kind: "mentor"; item: WorkspaceMentorItem } | { kind: "check"; item: WorkspaceCheckItem } | { kind: "approval"; item: WorkspaceApproval } | { kind: "settings" };

export function WorkspaceReview({ state, now, editable, onEdit }: { state: AdminWorkspace; now: Date; editable: boolean; onEdit: (target: ReviewTarget) => void }) {
  const gates = workspacePreflight(state, now);
  const blockers = gates.filter(gate => gate.tone === "bad").length;
  return <section aria-label="멘토와 최종 점검">
    <div className="workspace-section-heading"><div><h2>멘토·최종 점검</h2><p>반영 근거와 제출 전 누락을 함께 확인합니다.</p></div><button onClick={() => onEdit({ kind: "settings" })}>{editable ? "일정·검증 기준" : "일정·검증 기준 보기"}</button></div>
    <div className={"workspace-alert" + (blockers ? "" : " workspace-alert--good")} role="status">{blockers ? "아직 " + blockers + "개 준비 항목을 확인해야 합니다." : "현재 보드의 준비 점검을 충족했습니다."} 외부 제출·코드 반영·설정 변경·배포는 승인 대기로 관리합니다.</div>
    <section className="workspace-panel workspace-gates"><header className="workspace-panel-header"><div><h3>제출 전 누락·오류 점검</h3><p>공식 마감: {state.settings.deadline || "미확인"}</p></div></header><div className="workspace-gate-grid">{gates.map(gate => <article key={gate.id} className={"workspace-gate workspace-gate--" + gate.tone}><div><h4>{gate.title}</h4><WorkspaceBadge tone={gate.tone}>{gate.count ? gate.count + "건 확인 필요" : "조건 충족"}</WorkspaceBadge></div><p>{gate.detail}</p></article>)}</div></section>
    <div className="workspace-review-grid">
      <section className="workspace-panel"><header className="workspace-panel-header"><div><h3>멘토 요청사항</h3><p>원문·반영 위치·증거가 있어야 완료로 기록합니다.</p></div><span className="workspace-count">{state.mentor.length}</span></header><ul className="workspace-check-list">{state.mentor.map(item => <li key={item.id}><div><h4>{item.text}</h4><p>{item.location || "반영 위치 미기록"}</p><WorkspaceBadge tone={item.status === "반영 완료" ? "good" : "warn"}>{item.status}</WorkspaceBadge></div><button onClick={() => onEdit({ kind: "mentor", item })} aria-label={item.text + " 멘토 기록"}>{editable ? "기록" : "보기"}</button></li>)}</ul></section>
      <section className="workspace-panel"><header className="workspace-panel-header"><div><h3>최종 제출 체크리스트</h3><p>확인 근거와 날짜를 함께 남깁니다.</p></div><span className="workspace-count">{state.checklist.filter(item => item.done).length} / {state.checklist.length}</span></header><ul className="workspace-check-list">{state.checklist.map(item => <li key={item.id}><div><h4>{item.label}</h4><p>{item.source || "확인 근거 미기록"}</p><WorkspaceBadge tone={item.done ? "good" : "warn"}>{item.done ? "확인 완료" : "확인 필요"}</WorkspaceBadge></div><button onClick={() => onEdit({ kind: "check", item })} aria-label={item.label + " 점검 기록"}>{editable ? "기록" : "보기"}</button></li>)}</ul></section>
    </div>
  </section>;
}

export function WorkspaceApprovals({ state, onEdit, onRecord, editable }: { state: AdminWorkspace; onEdit: (target: ReviewTarget) => void; onRecord: (record: WorkspaceRecord) => void; editable: boolean }) {
  const requests = state.records.filter(record => record.approvalOnly || record.status === "승인 대기");
  return <section aria-label="승인 대기 요청"><div className="workspace-section-heading"><div><h2>승인 대기</h2><p>요청의 대상·이유·영향을 검토합니다. 이 화면은 외부 작업을 실행하지 않습니다.</p></div></div>
    <div className="workspace-approval-grid">{state.approvals.map(item => <article className="workspace-panel workspace-approval" key={item.id}><div className="workspace-inline"><WorkspaceBadge tone="approval">승인 대기</WorkspaceBadge><span>{item.type}</span></div><h3>{item.title}</h3><p>{item.description}</p><button onClick={() => onEdit({ kind: "approval", item })}>{editable ? "검토 기록" : "내용 보기"}</button></article>)}</div>
    {requests.length ? <section className="workspace-panel"><header className="workspace-panel-header"><h3>운영 항목의 승인 요청</h3><span className="workspace-count">{requests.length}</span></header><ul className="workspace-check-list">{requests.map(record => <li key={record.id}><div><h4>{record.title}</h4><p>{record.approvalReason || record.nextAction || "요청 범위 확인 필요"}</p><small>{record.project}</small></div><button onClick={() => onRecord(record)}>요청 보기</button></li>)}</ul></section> : null}
  </section>;
}

export function WorkspaceReviewEditor({ state, target, editable, busy, onSave, onClose }: { state: AdminWorkspace; target: ReviewTarget; editable: boolean; busy: boolean; onSave: (next: AdminWorkspace, message: string) => Promise<string | null>; onClose: () => void }) {
  const [error, setError] = useState("");
  const title = target.kind === "mentor" ? "멘토 요청 기록" : target.kind === "check" ? "제출 점검 기록" : target.kind === "approval" ? "승인 요청 검토" : "일정·검증 기준";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable || busy) return;
    const data = new FormData(event.currentTarget);
    let next: AdminWorkspace;
    let message = "검토 기록을 저장했습니다.";
    if (target.kind === "mentor") {
      const previous = target.item;
      const status = formText(data, "status");
      if (status !== "미반영" && status !== "반영 중" && status !== "반영 완료") { setError("멘토 반영 상태를 확인하세요."); return; }
      const item: WorkspaceMentorItem = { ...previous, text: formText(data, "text"), taskId: formText(data, "taskId"), status, source: formText(data, "source"), location: formText(data, "location"), evidence: formText(data, "evidence"), notes: formText(data, "notes") };
      const changed = (["text", "taskId", "source", "location", "evidence"] as const).some(key => previous[key] !== item[key]);
      if (previous.status === "반영 완료" && changed) { item.status = "미반영"; message = "요청이나 근거가 바뀌어 반영 완료를 해제했습니다. 다시 대조하세요."; }
      next = { ...state, mentor: state.mentor.map(value => value.id === item.id ? item : value) };
    } else if (target.kind === "check") {
      const previous = target.item;
      const item: WorkspaceCheckItem = { ...previous, label: formText(data, "label"), done: data.get("done") === "true", source: formText(data, "source"), verifiedAt: formDate(data, "verifiedAt", previous.verifiedAt), notes: formText(data, "notes") };
      if (previous.done && (previous.label !== item.label || previous.source !== item.source)) { item.done = false; item.verifiedAt = ""; message = "점검 항목이나 근거가 바뀌어 확인 완료를 해제했습니다."; }
      next = { ...state, checklist: state.checklist.map(value => value.id === item.id ? item : value) };
    } else if (target.kind === "approval") {
      const item: WorkspaceApproval = { ...target.item, title: formText(data, "title"), description: formText(data, "description"), notes: formText(data, "notes"), status: "승인 대기" };
      next = { ...state, approvals: state.approvals.map(value => value.id === item.id ? item : value) };
      message = "승인 대기 내용을 저장했습니다. 외부 실행은 없습니다.";
    } else {
      next = { ...state, settings: { ...state.settings, freshnessDays: Number(formText(data, "freshnessDays")), deadline: formText(data, "deadline"), deadlineSource: formText(data, "deadlineSource") } };
    }
    const result = await onSave(next, message);
    if (result) setError(result); else onClose();
  }
  return <WorkspaceDialog title={title} description={editable ? "확인한 원문과 실제 반영 증거를 기록하세요." : "읽기 전용으로 확인 기록을 표시합니다."} onClose={onClose} busy={busy}>
    <form onSubmit={event => void submit(event)}><div className="workspace-dialog-body"><WorkspaceFormError error={error} /><fieldset disabled={!editable || busy} className="workspace-fieldset"><legend className="workspace-sr-only">{title}</legend>
      {target.kind === "mentor" ? <WorkspaceSection title="요청과 반영">
        <WorkspaceField name="text" label="멘토 요청 내용" value={target.item.text} area required full />
        <WorkspaceField name="taskId" label="연결 작업" value={target.item.taskId} options={[{ value: "", label: "미지정" }, ...state.records.filter(record => record.module === "business" && record.recordType === "task").map(record => ({ value: record.id, label: record.title }))]} />
        <WorkspaceField name="status" label="반영 상태" value={target.item.status} options={["미반영", "반영 중", "반영 완료"]} />
        <WorkspaceField name="source" label="멘토 원문 출처" value={target.item.source} area full />
        <WorkspaceField name="location" label="반영 위치" value={target.item.location} area full />
        <WorkspaceField name="evidence" label="반영 증거" value={target.item.evidence} area full />
        <WorkspaceField name="notes" label="메모" value={target.item.notes} area full />
      </WorkspaceSection> : target.kind === "check" ? <WorkspaceSection title="확인 근거">
        <WorkspaceField name="label" label="점검 항목" value={target.item.label} required full />
        <WorkspaceField name="done" label="점검 상태" value={String(target.item.done)} options={[{ value: "false", label: "확인 필요" }, { value: "true", label: "확인 완료" }]} />
        <WorkspaceField name="verifiedAt" label="확인일" value={target.item.verifiedAt.slice(0, 10)} type="date" />
        <WorkspaceField name="source" label="확인 근거" value={target.item.source} area full />
        <WorkspaceField name="notes" label="점검 메모" value={target.item.notes} area full />
      </WorkspaceSection> : target.kind === "approval" ? <WorkspaceSection title="요청 범위" help="외부 작업 상태는 승인 대기로 고정됩니다.">
        <WorkspaceField name="type" label="요청 종류" value={target.item.type} options={WORKSPACE_APPROVAL_TYPES} disabled />
        <WorkspaceField name="title" label="요청 제목" value={target.item.title} required full />
        <WorkspaceField name="description" label="대상·이유·영향" value={target.item.description} area full />
        <WorkspaceField name="notes" label="검토 메모" value={target.item.notes} area full />
      </WorkspaceSection> : <WorkspaceSection title="공식 일정과 검증 기준">
        <WorkspaceField name="deadline" label="공식 제출 마감" value={state.settings.deadline} full help="미확인이면 비워 두세요. 확인한 날짜·시간·시간대(YYYY-MM-DDTHH:mm+09:00)를 기록하세요." />
        <WorkspaceField name="deadlineSource" label="공식 마감 안내 출처" value={state.settings.deadlineSource} area full />
        <WorkspaceField name="freshnessDays" label="기본 재확인 주기 (일)" value={state.settings.freshnessDays} type="number" help="1~365일. 기존 항목의 개별 기준은 유지합니다." />
      </WorkspaceSection>}
    </fieldset></div><footer className="workspace-dialog-footer"><button type="button" onClick={onClose} disabled={busy}>닫기</button>{editable ? <button type="submit" className="workspace-primary" disabled={busy}>검토 기록 저장</button> : null}</footer></form>
  </WorkspaceDialog>;
}
