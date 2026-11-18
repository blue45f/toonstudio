import { getChecks, manualComplete, mentorComplete } from "@toonstudio/contracts/business-plan";
import { useState } from "react";

import { BusinessPlanBadge, BusinessPlanDialog, BusinessPlanError, BusinessPlanFormFooter, BusinessPlanPanel, CheckField, SelectField, TextAreaField, TextField, businessPlanDate, businessPlanId, formText } from "./business-plan-ui";

import type { BusinessPlanCommit } from "./business-plan-ui";
import type { BusinessPlanApproval, BusinessPlanManualCheck, BusinessPlanMentorRequest, BusinessPlanState } from "@toonstudio/contracts/business-plan";

export function BusinessPlanReadiness({ board, now }: { board: BusinessPlanState; now: Date }) {
  const checks = getChecks(board, now); const complete = checks.filter((item) => item.pass).length;
  return <BusinessPlanPanel title="제출 전 자동 점검" eyebrow="READINESS" description="기록의 누락·형식·버전 일치를 검사합니다.">
    <div className="bp-readiness"><span className="bp-readiness-ring" aria-label={`${checks.length}개 검사 중 ${complete}개 통과`}>{complete}/{checks.length}</span><div><h3>{complete === checks.length ? "누락 점검 통과" : `${checks.length - complete}개 점검 필요`}</h3><p>주장 자체의 진실성·첨부 파일 내용은 직접 확인해야 합니다.</p></div></div>
    <ul className="bp-check-list">{checks.map((item) => <li key={item.id}><span className="bp-check-symbol" data-pass={item.pass} aria-label={item.pass ? "통과" : "확인 필요"}>{item.pass ? "✓" : "!"}</span><span className="bp-check-copy"><strong><a href={`#bp-${item.target}`}>{item.title}</a></strong><small>{item.detail}</small></span></li>)}</ul>
  </BusinessPlanPanel>;
}

export function BusinessPlanApprovalPanel({ board, onCommit }: { board: BusinessPlanState; onCommit: BusinessPlanCommit }) {
  const [editing, setEditing] = useState<BusinessPlanApproval | null>(null);
  return <BusinessPlanPanel title="승인 대기" eyebrow="APPROVAL ONLY" description="아래 4개 작업은 제안과 메모만 기록합니다."><div className="bp-approval-list">{board.approvals.map((item) => <button type="button" className="bp-approval-row" key={item.id} onClick={() => setEditing(item)} aria-label={`${item.type} 승인 메모 편집`}><span><strong>{item.type}</strong><small>{item.note ? "검토 메모 있음" : "실행 기능 없음"}</small></span><BusinessPlanBadge tone="warn">승인 대기</BusinessPlanBadge></button>)}</div>{editing && <ApprovalEditor key={editing.id} approval={editing} board={board} onCommit={onCommit} onClose={() => setEditing(null)} />}</BusinessPlanPanel>;
}

export function BusinessPlanReview({ board, onCommit }: { board: BusinessPlanState; onCommit: BusinessPlanCommit }) {
  const [mentor, setMentor] = useState<BusinessPlanMentorRequest | null>(null);
  const [manual, setManual] = useState<BusinessPlanManualCheck | null>(null);
  const documentIds = new Set(board.documents.map((document) => document.id));
  return <div className="bp-review-grid bp-section">
    <BusinessPlanPanel id="bp-mentor" title="멘토 요청사항" eyebrow="FEEDBACK CHECKLIST" description="요청 원문과 반영 문서·위치·변경 근거를 연결합니다." actions={<button type="button" className="bp-button bp-button--small" onClick={() => setMentor({ id: businessPlanId("mentor"), title: "", request: "", round: "", sourceUrl: "", taskId: "", documentId: "", location: "", reflected: false, evidence: "", note: "" })}>요청 추가</button>}>
      <ul className="bp-review-list">{board.mentor.map((item) => <li key={item.id}><div><strong>{item.title}</strong><small>{item.round || "회차 미등록"} · {item.location || "반영 위치 미등록"}</small><BusinessPlanBadge tone={mentorComplete(item, documentIds) ? "good" : "warn"}>{mentorComplete(item, documentIds) ? "반영 기록 완료" : "반영 검토 필요"}</BusinessPlanBadge></div><button type="button" className="bp-button bp-button--small" onClick={() => setMentor(item)} aria-label={`${item.title} 멘토 요청 편집`}>검토</button></li>)}</ul>
      {!board.mentor.length && <p className="bp-empty">등록된 멘토 요청이 없습니다.<br />실제 받은 요청을 추가해 반영 여부를 확인하세요.</p>}
    </BusinessPlanPanel>
    <BusinessPlanPanel id="bp-review" title="최종 제출 전 수동 점검" eyebrow="FINAL REVIEW" description="캡처·첨부·서식·수치·파일을 실제 확인한 기록을 남깁니다.">
      <ul className="bp-review-list">{board.checks.map((item) => <li key={item.id}><div><strong>{item.title}</strong><small>{item.group} · {item.note || "확인 메모 미등록"}</small><BusinessPlanBadge tone={manualComplete(item) ? "good" : "neutral"}>{manualComplete(item) ? "점검 기록 완료" : item.checked ? "확인 근거 보완 필요" : "미점검"}</BusinessPlanBadge></div><button type="button" className="bp-button bp-button--small" onClick={() => setManual(item)} aria-label={`${item.title} 수동 점검 편집`}>점검</button></li>)}</ul>
      {!board.checks.length && <p className="bp-empty">점검 항목이 없습니다. 기본 점검 목록이 있는 백업을 확인하세요.</p>}
    </BusinessPlanPanel>
    {mentor && <MentorEditor key={mentor.id} item={mentor} board={board} onCommit={onCommit} onClose={() => setMentor(null)} />}
    {manual && <ManualEditor key={manual.id} item={manual} board={board} onCommit={onCommit} onClose={() => setManual(null)} />}
  </div>;
}

function MentorEditor({ item, board, onCommit, onClose }: { item: BusinessPlanMentorRequest; board: BusinessPlanState; onCommit: BusinessPlanCommit; onClose: () => void }) {
  const [error, setError] = useState(""); const [dirty, setDirty] = useState(false);
  const exists = board.mentor.some((current) => current.id === item.id);
  return <BusinessPlanDialog title={exists ? `${item.title} 반영 기록` : "멘토 요청사항 추가"} description="반영 완료에는 연결 문서, 반영 위치, 실제 변경 근거가 모두 필요합니다." dirty={dirty} onClose={onClose}>
    <form noValidate onChange={() => setDirty(true)} onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget); const value = (name: string) => formText(data, name);
      const candidate: BusinessPlanMentorRequest = { ...item, title: value("title"), request: value("request"), round: value("round"), sourceUrl: value("sourceUrl"), taskId: value("taskId"), documentId: value("documentId"), location: value("location"), reflected: data.get("reflected") === "on", evidence: value("evidence"), note: value("note"), updatedAt: new Date().toISOString() };
      if (candidate.reflected && !mentorComplete(candidate, new Set(board.documents.map((document) => document.id)))) { setError("반영 완료에는 반영 문서·위치·실제 변경 근거가 모두 필요합니다."); return; }
      const failure = onCommit({ ...board, mentor: exists ? board.mentor.map((current) => current.id === item.id ? candidate : current) : [...board.mentor, candidate] }, `${candidate.title}: 멘토 요청 ${candidate.reflected ? "반영" : "검토"} 기록`);
      if (failure) setError(failure); else onClose();
    }}><div className="bp-dialog-body"><div className="bp-form-grid">
      <TextField label="멘토 요청 제목" name="title" value={item.title} maxLength={500} required full />
      <TextAreaField label="멘토 요청 원문" name="request" value={item.request} full />
      <TextField label="회차·요청일" name="round" value={item.round} />
      <TextField label="요청 원문 링크" name="sourceUrl" value={item.sourceUrl} type="url" />
      <SelectField label="관련 보완 작업" name="taskId" value={item.taskId} options={[{ value: "", label: "연결 안 함" }, ...board.tasks.map((task) => ({ value: task.id, label: task.title }))]} />
      <SelectField label="반영 문서" name="documentId" value={item.documentId} options={[{ value: "", label: "문서 선택" }, ...board.documents.map((document) => ({ value: document.id, label: document.title }))]} />
      <TextField label="반영 페이지·문단 위치" name="location" value={item.location} full />
      <TextAreaField label="반영 근거·실제 변경 내용" name="evidence" value={item.evidence} full />
      <TextAreaField label="멘토 검토 메모" name="note" value={item.note} full />
    </div><CheckField label="위 근거와 문서 위치에서 반영을 확인했습니다" name="reflected" checked={item.reflected} /><BusinessPlanError error={error} /></div><BusinessPlanFormFooter /></form>
  </BusinessPlanDialog>;
}

function ManualEditor({ item, board, onCommit, onClose }: { item: BusinessPlanManualCheck; board: BusinessPlanState; onCommit: BusinessPlanCommit; onClose: () => void }) {
  const [error, setError] = useState(""); const [dirty, setDirty] = useState(false);
  return <BusinessPlanDialog title={item.title} description="완료에는 근거 링크 또는 실제 확인한 메모가 필요합니다." dirty={dirty} onClose={onClose}>
    <form noValidate onChange={() => setDirty(true)} onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      const candidate: BusinessPlanManualCheck = { ...item, checked: data.get("checked") === "on", note: formText(data, "note"), evidenceUrl: formText(data, "evidenceUrl"), updatedAt: new Date().toISOString() };
      if (candidate.checked && !manualComplete(candidate)) { setError("점검 완료에는 실제 확인 메모 또는 유효한 근거 링크가 필요합니다."); return; }
      const failure = onCommit({ ...board, checks: board.checks.map((current) => current.id === item.id ? candidate : current) }, `${item.title}: 수동 점검 기록`);
      if (failure) setError(failure); else onClose();
    }}><div className="bp-dialog-body"><div className="bp-form-grid"><TextField label="점검 근거 링크" name="evidenceUrl" value={item.evidenceUrl} type="url" full /><TextAreaField label="실제 확인한 내용·남은 오류" name="note" value={item.note} rows={5} full /></div><CheckField label="항목을 실제 확인했습니다" name="checked" checked={item.checked} /><BusinessPlanError error={error} /></div><BusinessPlanFormFooter /></form>
  </BusinessPlanDialog>;
}

function ApprovalEditor({ approval, board, onCommit, onClose }: { approval: BusinessPlanApproval; board: BusinessPlanState; onCommit: BusinessPlanCommit; onClose: () => void }) {
  const [error, setError] = useState(""); const [dirty, setDirty] = useState(false);
  return <BusinessPlanDialog title={`${approval.type} 승인 대기 메모`} description="승인 요청의 범위와 검토 메모만 기록합니다. 실행 상태는 승인 대기로 고정됩니다." dirty={dirty} onClose={onClose}>
    <form noValidate onChange={() => setDirty(true)} onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      const candidate: BusinessPlanApproval = { ...approval, scope: formText(data, "scope"), note: formText(data, "note"), status: "승인 대기", updatedAt: new Date().toISOString() };
      const failure = onCommit({ ...board, approvals: board.approvals.map((item) => item.id === approval.id ? candidate : item) }, `${approval.type}: 승인 대기 메모 수정`);
      if (failure) setError(failure); else onClose();
    }}><div className="bp-dialog-body"><p className="bp-notice bp-notice--warn">{approval.type} · 승인 대기 · 실행 기능 없음</p><div className="bp-form-grid"><TextAreaField label="요청 범위·대상" name="scope" value={approval.scope} full /><TextAreaField label="승인 검토 메모" name="note" value={approval.note} rows={5} full /></div><BusinessPlanError error={error} /></div><BusinessPlanFormFooter label="승인 메모 반영" /></form>
  </BusinessPlanDialog>;
}

function kstInput(value: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const part = (name: string) => parts.find((item) => item.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function BusinessPlanProject({ board, onCommit }: { board: BusinessPlanState; onCommit: BusinessPlanCommit }) {
  const [open, setOpen] = useState(false);
  return <BusinessPlanPanel title="공식 일정·프로젝트" description="제출 일정과 공식 공고 확인 기록을 관리합니다." actions={<button type="button" className="bp-button bp-button--small" onClick={() => setOpen(true)}>일정·프로젝트 편집</button>}>
    <div className="bp-deadlines">{board.project.deadlines.map((item) => <div key={item.id} className="bp-deadline"><strong>{item.label} · {businessPlanDate(item.at)}</strong><small>{item.verified ? "공식 출처 확인 기록 있음" : "공식 일정 미확인"}</small></div>)}{!board.project.deadlines.length && <p className="bp-muted">등록된 공식 일정이 없습니다.</p>}</div>
    {open && <ProjectEditor board={board} onCommit={onCommit} onClose={() => setOpen(false)} />}
  </BusinessPlanPanel>;
}

function ProjectEditor({ board, onCommit, onClose }: { board: BusinessPlanState; onCommit: BusinessPlanCommit; onClose: () => void }) {
  const [error, setError] = useState(""); const [dirty, setDirty] = useState(false);
  const deadlines = board.project.deadlines.length ? board.project.deadlines : [{ id: businessPlanId("deadline"), label: "제출 마감", at: "", sourceUrl: "", verified: false, note: "" }];
  return <BusinessPlanDialog title="공식 일정·프로젝트 편집" description="일정은 한국 시간(KST)으로 입력합니다. 모르는 날짜는 비워 두세요." dirty={dirty} onClose={onClose}>
    <form noValidate onChange={() => setDirty(true)} onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      const project = { ...board.project, title: formText(data, "title"), subtitle: formText(data, "subtitle"), deadlines: deadlines.map((item) => {
        const at = formText(data, `${item.id}-at`);
        return { ...item, label: formText(data, `${item.id}-label`), at: at === kstInput(item.at) ? item.at : at ? `${at}:00+09:00` : "", sourceUrl: formText(data, `${item.id}-sourceUrl`), note: formText(data, `${item.id}-note`), verified: data.get(`${item.id}-verified`) === "on" };
      }) };
      if (project.deadlines.some((item) => item.verified && !item.note.trim())) { setError("확인한 일정에는 공식 원문을 대조한 메모가 필요합니다."); return; }
      const failure = onCommit({ ...board, project }, "프로젝트·공식 일정 확인 기록 수정");
      if (failure) setError(failure); else onClose();
    }}><div className="bp-dialog-body"><div className="bp-form-grid"><TextField label="프로젝트 제목" name="title" value={board.project.title} maxLength={500} required full /><TextAreaField label="프로젝트 설명" name="subtitle" value={board.project.subtitle} full />{deadlines.map((item, index) => <fieldset key={item.id} className="bp-form-section bp-full"><legend>일정 {index + 1}</legend><div className="bp-form-grid"><TextField label={`일정 ${index + 1} 이름`} name={`${item.id}-label`} value={item.label} maxLength={500} /><TextField label={`일정 ${index + 1} 일시 (KST)`} name={`${item.id}-at`} value={kstInput(item.at)} type="datetime-local" /><TextField label={`일정 ${index + 1} 공식 출처`} name={`${item.id}-sourceUrl`} value={item.sourceUrl} type="url" full /><TextAreaField label={`일정 ${index + 1} 확인 메모`} name={`${item.id}-note`} value={item.note} full /></div><CheckField label={`일정 ${index + 1}을 공식 원문에서 확인했습니다`} name={`${item.id}-verified`} checked={item.verified} /></fieldset>)}</div><BusinessPlanError error={error} /></div><BusinessPlanFormFooter /></form>
  </BusinessPlanDialog>;
}
