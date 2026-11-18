import { assessWorkspaceChange, assessWorkspaceEvidence, assessWorkspaceEvidenceSet, workspaceDuplicateGroups } from "@toonstudio/contracts/admin-workspace";

import { workspaceDate, WorkspaceBadge, WorkspaceLink } from "./workspace-ui";

import type { WorkspaceRecord } from "@toonstudio/contracts/admin-workspace";

const labels = { current: "저장된 관측 기준 유효", stale: "재확인 필요", mismatch: "대상 불일치", incomplete: "근거 미완성", failed: "실패", unavailable: "근거 접근 불가" } as const;

export function WorkspaceEvidencePanel({ record, now = new Date() }: { record: WorkspaceRecord; now?: Date }) {
  const target = record.evidenceTarget;
  const summary = target ? assessWorkspaceEvidenceSet(record.evidence ?? [], target, now) : null;
  const change = record.changeIdentity ? assessWorkspaceChange(record.changeIdentity, target && target.kind !== "document" ? target.main : undefined, now) : null;
  return <section className="workspace-panel" aria-label="CI·배포 증거">
    <header className="workspace-panel-header"><div><h3>CI·배포 증거</h3><p>성공 이력·현재 대상·실제 배포·승인을 각각 확인합니다.</p></div></header>
    <div className="workspace-panel-body">
      {target ? <p>현재 대조 대상: {target.kind === "document" ? `${target.documentId} · ${target.version}` : `${target.repository} · ${target.targetSha}`} · 범위 {target.scope}</p> : <p>검증 대상과 원격 main 관측이 연결되지 않았습니다.</p>}
      {summary ? <div><WorkspaceBadge tone={summary.current ? "good" : summary.status === "failed" ? "bad" : "warn"}>{labels[summary.status]}</WorkspaceBadge>{summary.reasons.map(reason => <p key={reason}>{reason}</p>)}</div> : null}
      {change ? <div><p>PR 기록: {change.pullRequestState} · main 반영: {change.mainInclusion === "equivalent-change-present" ? "동등 변경 존재 근거 확인" : change.mainInclusion === "merged-at-observed-main" ? "관측한 main에서 병합 확인" : "미확인"}</p>{change.supersededBy.length ? <p>대체 PR: {change.supersededBy.map(number => `#${number}`).join(", ")}</p> : null}{change.reasons.map(reason => <p key={reason} className="workspace-muted">{reason}</p>)}</div> : null}
      {record.operationalState ? <p>업무 {record.operationalState.workStatus} · CI 기록 {record.operationalState.ciStatus} · 배포 기록 {record.operationalState.deploymentStatus} · 승인 {record.operationalState.approvalStatus}</p> : null}
      {record.evidence?.length ? record.evidence.map(evidence => {
        const assessment = target ? assessWorkspaceEvidence(evidence, target, now) : null;
        const current = Boolean(summary?.current && summary.evidenceId === evidence.id);
        const label = summary?.supersededEvidenceIds.includes(evidence.id) ? "이전 실행 이력" : assessment?.current && !current ? "집계 재확인 필요" : assessment ? labels[assessment.status] : "대조 대상 미입력";
        return <article key={evidence.id} className="workspace-evidence-entry">
          <div className="workspace-inline"><strong>{evidence.kind === "ci" ? `${evidence.workflow} · 실행 ${evidence.runId} / 회차 ${evidence.runAttempt}` : evidence.kind === "deployment" ? `${evidence.provider} · ${evidence.unit} · ${evidence.environment}` : `${evidence.documentId} · ${evidence.version}`}</strong><WorkspaceBadge tone={current ? "good" : assessment?.status === "failed" || assessment?.status === "mismatch" ? "bad" : "warn"}>{label}</WorkspaceBadge></div>
          <p>실제 검증·적용: {workspaceDate(evidence.kind === "ci" ? evidence.completedAt : evidence.kind === "deployment" ? evidence.appliedAt : evidence.verifiedAt)} · 수집: {workspaceDate(evidence.collectedAt)}</p>
          {evidence.kind === "deployment" ? <p>이미지 {evidence.artifactDigest} · 적용 {evidence.phase} · 원점 준비 {evidence.originReadiness.status} · 스모크 {evidence.smoke.status}</p> : null}
          {assessment?.historicalSuccess && !current ? <p>과거 성공 이력은 유지됩니다. 현재 검증 완료로 계산하지 않습니다.</p> : null}
          {assessment?.reasons.length ? <ul>{assessment.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul> : null}
          <WorkspaceLink url={evidence.url}>증거 열기</WorkspaceLink>
        </article>;
      }) : <p className="workspace-muted">연결된 실행·배포 증거가 없습니다. 일반 근거 링크와 수동 상태만으로 현재 CI나 배포 성공을 판단하지 않습니다.</p>}
      <p className="workspace-muted">관측 시각과 실제 실행 시각을 따로 기록합니다. 이 화면은 GitHub나 배포 서비스의 현재 상태를 자동 조회하지 않으며 승인 상태를 변경하지 않습니다.</p>
    </div>
  </section>;
}

export function WorkspaceDuplicateNotice({ records }: { records: WorkspaceRecord[] }) {
  const groups = workspaceDuplicateGroups(records);
  if (!groups.length) return null;
  return <section className="workspace-alert" aria-label="중복 작업 확인"><h2>새 작업을 만들기 전에 확인하세요</h2><ul>{groups.map(group => <li key={group.key}>{group.reason === "same-pr" ? "같은 PR" : group.reason === "same-source" ? "같은 원본 항목" : "동일 변경 후보"}: {group.recordIds.map(id => records.find(record => record.id === id)?.title ?? id).join(" · ")}</li>)}</ul><p>PR 번호·원본 항목·실제 diff를 대조하고 기존 작업에 연결하세요. 제목이 비슷하다는 이유로 자동 병합하거나 PR을 새로 만들지 않습니다.</p></section>;
}
