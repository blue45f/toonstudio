import { WORKSPACE_CLAIM_KINDS, WORKSPACE_FACT_STATUSES, WORKSPACE_STATUSES, workspaceNumeric } from "@toonstudio/contracts/admin-workspace";
import { useState } from "react";

import { formDate, formText, WorkspaceBadge, WorkspaceDialog, WorkspaceField, WorkspaceFormError, WorkspaceLink, WorkspaceSection } from "./workspace-ui";
import { WorkspaceEvidencePanel } from "./WorkspaceEvidencePanel";

import type { AdminWorkspace, WorkspaceRecord } from "@toonstudio/contracts/admin-workspace";
import type { FormEvent } from "react";

interface Props {
  state: AdminWorkspace; record: WorkspaceRecord; editable: boolean; busy: boolean; isNew: boolean;
  onSave: (record: WorkspaceRecord) => Promise<string | null>; onClose: () => void;
  onEvidence?: (record: WorkspaceRecord) => void;
}

export function WorkspaceRecordEditor({ state, record, editable, busy, isNew, onSave, onClose, onEvidence }: Props) {
  const [error, setError] = useState("");
  const numeric = record.recordType !== "task";
  const textFields = ["title", "category", "project", "owner", "assignment", "nextAction", "notes", "text", "sourceTitle", "sourceUrl", "quote", "secondSourceTitle", "secondSourceUrl", "reviewer", "verificationNote", "unit", "period", "scope", "formula", "assumptions", "localSha", "remoteSha", "mainSha", "deployedSha"] as const;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable || busy) return;
    const data = new FormData(event.currentTarget);
    const next = { ...record };
    for (const key of textFields) if (data.has(key)) next[key] = formText(data, key);
    const status = WORKSPACE_STATUSES.find(value => value === data.get("status"));
    const factStatus = WORKSPACE_FACT_STATUSES.find(value => value === data.get("factStatus"));
    const kind = WORKSPACE_CLAIM_KINDS.find(value => value === data.get("kind"));
    if (!status || !factStatus) { setError("진행 상태와 사실 확인 상태를 선택하세요."); return; }
    next.status = record.approvalOnly ? "승인 대기" : status;
    next.factStatus = factStatus;
    if (kind) next.kind = kind;
    next.taskId = data.has("taskId") ? formText(data, "taskId") : record.taskId;
    next.sourceDate = formDate(data, "sourceDate", record.sourceDate);
    next.verifiedAt = formDate(data, "verifiedAt", record.verifiedAt);
    next.freshnessDays = Number(formText(data, "freshnessDays"));
    if (data.has("linkedRepository")) {
      const repository = formText(data, "linkedRepository");
      const pullRequest = formText(data, "linkedPr");
      if (repository || pullRequest) next.changeIdentity = { ...record.changeIdentity, repository, pullRequest: Number(pullRequest), pullRequestState: record.changeIdentity?.pullRequestState ?? "unknown" };
    }
    if (data.has("workStatus")) next.operationalState = {
      workStatus: formText(data, "workStatus") as NonNullable<WorkspaceRecord["operationalState"]>["workStatus"],
      pullRequestStatus: record.operationalState?.pullRequestStatus ?? "unknown",
      ciStatus: record.operationalState?.ciStatus ?? "unknown", deploymentStatus: record.operationalState?.deploymentStatus ?? "unknown",
      approvalStatus: record.operationalState?.approvalStatus ?? (record.approvalOnly ? "pending" : "not-requested"),
      ...(record.operationalState?.approvalEvidence ? { approvalEvidence: record.operationalState.approvalEvidence } : {}),
    };
    if (numeric) {
      const value = formText(data, "value");
      if (value !== "" && !workspaceNumeric(value)) { setError("수치는 유효한 숫자로 입력하고, 미확인 값은 비워 두세요."); return; }
      // 숫자 문자열의 자릿수를 보존하고, 다른 필드만 편집했을 때 값의 타입도 바꾸지 않는다.
      next.value = value === "" ? null : value === String(record.value ?? "").trim() ? record.value : value;
    }
    const result = await onSave(next);
    if (result) setError(result);
    else if ((event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "evidence" && onEvidence) onEvidence(next);
    else onClose();
  }
  return <WorkspaceDialog title={isNew ? "새 기록 추가" : record.title} description={editable ? "원문 근거와 현재 검증을 기록합니다. 핵심 내용이 바뀌면 확인 상태가 해제됩니다." : "읽기 전용입니다. 원문과 현재 검증 기록을 확인할 수 있습니다."} busy={busy} onClose={onClose}>
    <form onSubmit={event => void submit(event)}>
      <div className="workspace-dialog-body">
        <WorkspaceFormError error={error} />
        {record.approvalOnly ? <p className="workspace-alert">실행 승인 요청입니다. 진행 상태는 승인 대기로 고정됩니다. {record.approvalReason}</p> : null}
        {isNew ? <p className="workspace-alert">새 기록은 미확인으로 등록한 뒤 원문을 대조해 검증하세요.</p> : null}
        <fieldset disabled={!editable || busy} className="workspace-fieldset">
          <legend className="workspace-sr-only">작업 기록</legend>
          <WorkspaceSection title="작업과 담당">
            <WorkspaceField name="title" label="작업명" value={record.title} required full />
            <WorkspaceField name="status" label="진행 상태" value={record.status} options={record.approvalOnly ? ["승인 대기"] : WORKSPACE_STATUSES} />
            <WorkspaceField name="factStatus" label="사실 확인 상태" value={record.factStatus} options={WORKSPACE_FACT_STATUSES} />
            <WorkspaceField name="category" label="분류" value={record.category} />
            <WorkspaceField name="project" label="프로젝트" value={record.project} />
            <WorkspaceField name="owner" label="담당자" value={record.owner} />
            {record.recordType === "claim" ? <WorkspaceField name="taskId" label="연결 작업" value={record.taskId} options={[{ value: "", label: "연결 작업 미지정" }, ...state.records.filter(item => item.recordType === "task").map(item => ({ value: item.id, label: item.title }))]} /> : null}
            <WorkspaceField name="assignment" label="담당 작업" value={record.assignment} area full />
            <WorkspaceField name="nextAction" label="다음 조치" value={record.nextAction} area full />
            <WorkspaceField name="notes" label="검토 메모" value={record.notes} area full />
          </WorkspaceSection>
          {record.module === "coordination" ? <WorkspaceSection title="기존 작업 연결" help="같은 PR·원본 항목의 작업을 중복 등록하지 않습니다. PR 상태·CI·배포·승인은 각각의 근거로 확인합니다.">
            <WorkspaceField name="linkedRepository" label="연결 저장소 (owner/repo)" value={record.changeIdentity?.repository ?? ""} />
            <WorkspaceField name="linkedPr" label="기존 PR 번호" type="number" value={record.changeIdentity?.pullRequest ?? ""} />
            <WorkspaceField name="workStatus" label="실제 업무 상태" value={record.operationalState?.workStatus ?? "todo"} options={[{ value: "todo", label: "할 일" }, { value: "in_progress", label: "진행 중" }, { value: "blocked", label: "차단됨" }, { value: "done", label: "업무 완료" }]} />
          </WorkspaceSection> : null}
          <WorkspaceSection title="검증할 주장" help="진행 상태와 사실 확인은 별도로 관리합니다. 출처가 없는 수치와 비교는 미확인입니다.">
            <WorkspaceField name="text" label="검증할 원문 문장" value={record.text} area full />
            <WorkspaceField name="kind" label="주장 유형" value={record.kind} options={numeric ? WORKSPACE_CLAIM_KINDS : ["일반"]} />
            <WorkspaceField name="freshnessDays" label="재확인 주기 (일)" value={record.freshnessDays} type="number" help="운영 기준이며 원문 기관이 보증하는 유효기간은 아닙니다." />
            {numeric ? <>
              <WorkspaceField name="value" label="수치" value={record.value} help="숫자의 자릿수와 소수 표현을 보존합니다. 미확인 값은 비워 두며 빈칸을 0으로 바꾸지 않습니다." />
              <WorkspaceField name="unit" label="단위·통화" value={record.unit} />
              <WorkspaceField name="period" label="대상 기간" value={record.period} />
              <WorkspaceField name="scope" label="시장·조사 범위" value={record.scope} />
              <WorkspaceField name="formula" label="전망 산식" value={record.formula} area full />
              <WorkspaceField name="assumptions" label="전망 입력 가정" value={record.assumptions} area full />
            </> : null}
          </WorkspaceSection>
          <WorkspaceSection title="원문 근거" help="시장 규모·매출 전망·비교는 독립된 두 번째 원문과 독립성 대조 기록이 필요합니다.">
            <WorkspaceField name="sourceTitle" label="원문 출처·위치" value={record.sourceTitle} full />
            <WorkspaceField name="sourceUrl" label="근거 링크" value={record.sourceUrl} type="url" full />
            <WorkspaceField name="sourceDate" label="원문 발행일" value={record.sourceDate.slice(0, 10)} type="date" />
            <WorkspaceField name="quote" label="인용·쪽수·대조 내용" value={record.quote} area full />
            <WorkspaceField name="secondSourceTitle" label="두 번째 원문·기관" value={record.secondSourceTitle} full />
            <WorkspaceField name="secondSourceUrl" label="교차검증 원문 링크" value={record.secondSourceUrl} type="url" full />
            <WorkspaceField name="reviewer" label="검증자" value={record.reviewer} />
            <WorkspaceField name="verifiedAt" label="검증일" value={record.verifiedAt.slice(0, 10)} type="date" />
            <WorkspaceField name="verificationNote" label="검증 메모" value={record.verificationNote} area full help="실제 대조 결과와 남은 범위를 적으세요. 비교·시장·전망은 ‘독립성: …’으로 원출처의 독립성을 기록하세요." />
          </WorkspaceSection>
          {record.module !== "business" ? <WorkspaceSection title="반영 범위" help="main 병합·CI 성공·운영 배포를 구분합니다. 빈 값은 미확인입니다.">
            <WorkspaceField name="localSha" label="로컬 SHA (40자리)" value={record.localSha} />
            <WorkspaceField name="remoteSha" label="원격 SHA (40자리)" value={record.remoteSha} />
            <WorkspaceField name="mainSha" label="main 반영 SHA (40자리)" value={record.mainSha} />
            <WorkspaceField name="deployedSha" label="운영 배포 SHA (40자리)" value={record.deployedSha} />
          </WorkspaceSection> : null}
        </fieldset>
        <WorkspaceEvidencePanel record={record} />
        <div className="workspace-inline"><WorkspaceLink url={record.sourceUrl} /><WorkspaceLink url={record.secondSourceUrl}>교차검증 원문</WorkspaceLink></div>
        {record.origin ? <details className="workspace-source-details"><summary>보존한 원본 기록 <WorkspaceBadge>가져온 자료</WorkspaceBadge></summary><p className="workspace-muted">원본 판정은 현재 사실 확인으로 자동 승격하지 않습니다.</p><pre>{JSON.stringify(record.origin.raw, null, 2)}</pre></details> : null}
      </div>
      <footer className="workspace-dialog-footer"><button type="button" onClick={onClose} disabled={busy}>닫기</button>{editable && onEvidence ? <button type="submit" value="evidence" disabled={busy}>기록 저장 후 증거 연결</button> : null}{editable ? <button className="workspace-primary" type="submit" disabled={busy}>{busy ? "저장 중…" : "기록 저장"}</button> : null}</footer>
    </form>
  </WorkspaceDialog>;
}
