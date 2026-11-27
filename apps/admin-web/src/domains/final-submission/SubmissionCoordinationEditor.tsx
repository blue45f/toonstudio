import {
  COORDINATION_ACTIONS, COORDINATION_STATUSES, coordinationStatus, isFinalSubmissionDate, isSafeUrl,
  type CoordinationItem,
} from "@toonstudio/contracts/final-submission";
import { useState, type FormEvent } from "react";

import {
  SUBMISSION_DATE_HINT, SubmissionBadge, SubmissionDialog, SubmissionError, SubmissionField,
  SubmissionLinksEditor, SubmissionSelect,
} from "./final-submission-ui";

interface SourceOption { id: string; title: string }
interface EditorProps {
  item: CoordinationItem;
  taskOptions: SourceOption[];
  operationOptions: SourceOption[];
  relatedOptions?: SourceOption[];
  onSave: (item: CoordinationItem) => string | null;
  onClose: () => void;
}

function sourceChoices(options: SourceOption[], selected: string) {
  return [
    { value: "", label: "미연결" },
    ...options.map(({ id, title }) => ({ value: id, label: title })),
    ...(selected && !options.some(({ id }) => id === selected)
      ? [{ value: selected, label: "기존 연결 · 원장 확인 필요" }] : []),
  ];
}

const textFields = [
  ["file", "후보 파일명"], ["version", "후보 버전"], ["approvedVersion", "승인된 정본 버전"], ["digest", "후보 파일 SHA-256"],
  ["repo", "저장소"], ["branch", "브랜치"], ["pr", "PR 번호 또는 주소"], ["commit", "변경 커밋 SHA"],
  ["ciCommit", "CI 검증 커밋 SHA"], ["deployCommit", "배포 커밋 SHA"],
] as const;
const observations = [
  ["merge", "병합 여부", ["미병합", "병합 완료"]],
  ["ci", "CI 결과", ["통과", "실패", "진행 중"]],
  ["deployment", "배포 여부", ["미배포", "배포 완료"]],
  ["smoke", "배포 후 스모크", ["통과", "실패"]],
  ["migration", "마이그레이션 여부", ["대기", "적용 완료"]],
  ["platform", "플랫폼 제출 상태", ["제출 전", "검토 중", "접수 확인", "보완 요청"]],
  ["mentor", "멘토 검토 반영 여부", ["검토 대기", "부분 반영", "반영 완료"]],
] as const;
const tabs = ["항목 연결", "개발·제출 대조", "근거·첨부", "확인·승인"] as const;

function inputError(draft: CoordinationItem) {
  if (!draft.title.trim() || !draft.project.trim()) return "항목 이름과 프로젝트를 입력해 주세요.";
  if (draft.digest && !/^[a-f0-9]{64}$/iu.test(draft.digest)) return "후보 파일의 SHA-256을 64자리 16진수로 입력해 주세요.";
  for (const link of [...draft.refs, ...draft.attachments, ...(draft.basisRefs ?? [])]) {
    if (!link.label.trim() || !isSafeUrl(link.url)) return "근거·첨부에 등록한 모든 링크의 이름과 http 또는 https 주소를 확인해 주세요.";
  }
  for (const date of [draft.evidenceAt, draft.checkedAt]) {
    if (!isFinalSubmissionDate(date) || (date && Date.parse(date) > Date.now())) return "확인 시점에는 현재까지의 유효한 날짜를 입력해 주세요.";
  }
  if (draft.latestVerified && (!draft.evidenceAt || !draft.refs.length && !draft.attachments.length)) return "직접 대조한 근거 링크 또는 첨부 증빙과 그 확인 시점을 기록해 주세요.";
  return "";
}

export function SubmissionCoordinationEditor({ item, taskOptions, operationOptions, relatedOptions = [], onSave, onClose }: EditorProps) {
  const [opened] = useState(() => JSON.stringify(item));
  const [draft, setDraft] = useState(() => structuredClone(item));
  const [tab, setTab] = useState<(typeof tabs)[number]>(tabs[0]);
  const [error, setError] = useState("");
  const stale = opened !== JSON.stringify(item);
  const update = (patch: Partial<CoordinationItem>, invalidate = true) => {
    setDraft(current => ({ ...current, ...(invalidate ? { latestVerified: false, checkedAt: "", evidenceAt: "" } : {}), ...patch }));
    setError("");
  };

  function save(event: FormEvent) {
    event.preventDefault();
    if (stale) return;
    const failure = inputError(draft) || onSave(draft);
    if (failure) setError(failure);
    else onClose();
  }

  return <SubmissionDialog title={item.title || "증빙 연결 항목 추가"} description="선택한 원장의 항목 ID와 직접 입력한 대조 기록을 보관합니다." dirty={JSON.stringify(draft) !== opened} onClose={onClose}>
    <form onSubmit={save} noValidate>
      <div className="fs-dialog-body">
        <nav className="fs-tabs" aria-label="조정 항목 입력 구역">{tabs.map(name =>
          <button className="fs-button" type="button" key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</button>
        )}</nav>
        {tab === "항목 연결" && <div className="fs-form-grid">
          <SubmissionField label="항목 이름" required wide value={draft.title} onChange={title => update({ title })} />
          <SubmissionField label="프로젝트" required value={draft.project} onChange={project => update({ project })} />
          <SubmissionField label="담당자" value={draft.owner} onChange={owner => update({ owner })} />
          <SubmissionSelect label="1R 제출 원장 항목" value={draft.sourceTaskId} options={sourceChoices(taskOptions, item.sourceTaskId)} onChange={sourceTaskId => update({ sourceTaskId })} />
          <SubmissionSelect label="관리자 운영 원장 항목" value={draft.operationId} options={sourceChoices(operationOptions, item.operationId)} onChange={operationId => update({ operationId })} />
          <SubmissionField label="원본 기록과 확인 범위" multiline wide value={draft.sourceNote ?? ""} onChange={sourceNote => update({ sourceNote })} />
          <fieldset className="fs-fieldset fs-full"><legend>함께 확인할 조정 항목</legend>
            {relatedOptions.filter(option => option.id !== item.id).map(option =>
              <label key={option.id} className="fs-checkbox"><input type="checkbox" checked={draft.related?.includes(option.id) ?? false}
                onChange={event => update({ related: event.target.checked ? [...(draft.related ?? []), option.id] : (draft.related ?? []).filter(id => id !== option.id) })} />{option.title}</label>
            )}
            {relatedOptions.every(option => option.id === item.id) && <p className="fs-muted">연결할 다른 조정 항목이 없습니다.</p>}
          </fieldset>
          <SubmissionSelect label="우선순위" value={String(draft.priority)} options={[{ value: "1", label: "높음" }, { value: "2", label: "보통" }, { value: "3", label: "낮음" }]} onChange={rank => update({ priority: rank === "1" ? 1 : rank === "3" ? 3 : 2 }, false)} />
          <label className="fs-checkbox"><input type="checkbox" checked={draft.blocking} onChange={event => update({ blocking: event.target.checked }, false)} />해결 전 제출 보류</label>
          <SubmissionField label="다음 조치" multiline wide value={draft.next} onChange={next => update({ next }, false)} />
        </div>}
        {tab === "개발·제출 대조" && <div className="fs-form-grid">
          {textFields.map(([key, label]) => <SubmissionField key={key} label={label} value={draft[key]} onChange={value => update({ [key]: value })} />)}
          <label className="fs-checkbox fs-full"><input type="checkbox" checked={draft.candidate} onChange={event => update({ candidate: event.target.checked })} />별도 제출 후보로 등록해 중복을 비교</label>
          {observations.map(([key, label, values]) => {
            const options = [...new Set<string>([...values, "해당 없음", ...(draft[key] ? [draft[key]] : [])])].filter(value => value !== "미확인");
            return <SubmissionSelect key={key} label={label} value={draft[key] === "미확인" ? "" : draft[key]} options={[{ value: "", label: "미확인" }, ...options]} onChange={value => update({ [key]: value })} />;
          })}
        </div>}
        {tab === "근거·첨부" && <>
          <SubmissionLinksEditor title="근거 링크" links={draft.refs} onChange={refs => update({ refs })} />
          <SubmissionLinksEditor title="첨부 증빙" links={draft.attachments} onChange={attachments => update({ attachments })} />
          <SubmissionLinksEditor title="자료·기준 링크" links={draft.basisRefs ?? []} onChange={basisRefs => update({ basisRefs })} />
        </>}
        {tab === "확인·승인" && <div className="fs-form-grid">
          <SubmissionSelect label="기록할 진행 상태" value={draft.status} options={COORDINATION_STATUSES} onChange={status => update({ status: status as CoordinationItem["status"] }, false)} />
          <SubmissionSelect label="승인 대기 작업" value={draft.action} options={[{ value: "", label: "선택 안 함" }, ...COORDINATION_ACTIONS]} onChange={action => update({ action: action as CoordinationItem["action"] })} />
          <SubmissionField label="증빙 확인 시점" hint={SUBMISSION_DATE_HINT} value={draft.evidenceAt} onChange={evidenceAt => update({ evidenceAt, latestVerified: false, checkedAt: "" }, false)} />
          <SubmissionField label="최종 확인 시점" hint={SUBMISSION_DATE_HINT} value={draft.checkedAt} onChange={checkedAt => update({ checkedAt }, false)} />
          <label className="fs-checkbox fs-full"><input type="checkbox" checked={draft.latestVerified} onChange={event => update(event.target.checked ? { latestVerified: true } : { latestVerified: false, checkedAt: "" }, false)} />현재 항목과 최신 증빙을 직접 대조함</label>
          <p className="fs-notice fs-full">이 항목의 증빙 판정 <SubmissionBadge status={coordinationStatus(draft)} />{draft.action && <> · {draft.action} 승인 대기</>}</p>
        </div>}
        <SubmissionError error={stale ? "편집 중 원본 기록이 바뀌었습니다. 대화상자를 닫고 다시 열어 주세요." : error} />
      </div>
      <footer className="fs-dialog-footer"><button type="submit" className="fs-button fs-button--primary" disabled={stale}>조정 기록 반영</button></footer>
    </form>
  </SubmissionDialog>;
}
