import { workspaceEvidenceTargetIssues, workspaceTypedEvidenceIssues } from "@toonstudio/contracts/admin-workspace";
import { useState } from "react";

import { workspaceId } from "./useAdminWorkspace";
import { formText, WorkspaceDialog, WorkspaceField, WorkspaceFormError, WorkspaceSection } from "./workspace-ui";

import type { WorkspaceCiEvidence, WorkspaceDeploymentEvidence, WorkspaceEvidence, WorkspaceEvidenceTarget, WorkspaceRecord } from "@toonstudio/contracts/admin-workspace";
import type { FormEvent } from "react";

interface Props { record: WorkspaceRecord; busy: boolean; onSave: (record: WorkspaceRecord) => Promise<string | null>; onClose: () => void }
const resultOptions = ["unknown", "pending", "success", "failure", "cancelled", "skipped"] as const;

/** 실행 결과를 수동으로 연결하며 실행·상태 승격은 수행하지 않는다. */
export function WorkspaceEvidenceEditor({ record, busy, onSave, onClose }: Props) {
  const [kind, setKind] = useState<"ci" | "deployment">("ci");
  const [reference, setReference] = useState<"main" | "pull-request" | "commit">("main");
  const [error, setError] = useState("");
  const previousTarget = record.evidenceTarget && record.evidenceTarget.kind !== "document" ? record.evidenceTarget : null;
  const repository = previousTarget?.repository ?? record.changeIdentity?.repository ?? (record.project.toLowerCase() === "toonstudio" ? "blue45f/toonstudio" : "");
  const prior = record.evidence?.findLast(value => value.kind === kind);
  const previousCi = prior?.kind === "ci" ? prior : null;
  const previousDeployment = prior?.kind === "deployment" ? prior : null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const text = (key: string) => formText(data, key);
    const targetBase = {
      repository: text("repository"), targetSha: text("targetSha"), scope: text("targetScope"), reference,
      ...(reference !== "commit" ? { main: { repository: text("repository"), sha: text("mainSha"), observedAt: text("mainObservedAt"), url: text("mainUrl") } } : {}),
    };
    const base = {
      id: workspaceId("evidence"), repository: text("repository"), scope: text("scope"), url: text("url"),
      collectedAt: text("collectedAt"), availability: text("availability") as WorkspaceEvidence["availability"],
    };
    let evidence: WorkspaceEvidence;
    let target: WorkspaceEvidenceTarget;
    if (kind === "ci") {
      evidence = {
        ...base, kind, runId: text("runId"), runAttempt: Number(text("runAttempt")), event: text("event"), workflow: text("workflow"),
        job: text("job"), shard: text("shard"), testedSha: text("testedSha"), headSha: text("headSha"), baseSha: text("baseSha"),
        completedAt: text("completedAt"), conclusion: text("conclusion") as WorkspaceCiEvidence["conclusion"],
        ...(text("startedAt") ? { startedAt: text("startedAt") } : {}),
      };
      target = { ...targetBase, kind, workflow: text("workflow"), job: text("job"), shard: text("shard"), event: text("event"), ...(reference === "pull-request" ? { headSha: text("targetHeadSha"), baseSha: text("targetBaseSha") } : {}) };
    } else {
      evidence = {
        ...base, kind, provider: text("provider"), unit: text("unit"), deploymentId: text("deploymentId"), environment: text("environment"), origin: text("origin"),
        phase: text("phase") as WorkspaceDeploymentEvidence["phase"], artifactSha: text("artifactSha"), artifactDigest: text("artifactDigest"), appliedSha: text("appliedSha"), appliedAt: text("appliedAt"),
        originReadiness: { status: text("readyStatus") as WorkspaceDeploymentEvidence["originReadiness"]["status"], observedAt: text("readyAt"), sha: text("readySha"), environment: text("readyEnvironment"), origin: text("readyOrigin"), url: text("readyUrl") },
        smoke: { status: text("smokeStatus") as WorkspaceDeploymentEvidence["smoke"]["status"], testedAt: text("smokeAt"), sha: text("smokeSha"), environment: text("smokeEnvironment"), origin: text("smokeOrigin"), scope: text("smokeScope"), url: text("smokeUrl") },
      };
      target = { ...targetBase, kind, provider: text("provider"), unit: text("unit"), environment: text("targetEnvironment"), origin: text("targetOrigin"), artifactDigest: text("targetDigest") };
    }
    const issues = [...workspaceTypedEvidenceIssues(evidence), ...workspaceEvidenceTargetIssues(target)];
    if (issues.length) { setError(issues.join("\n")); return; }
    const result = await onSave({ ...record, evidence: [...(record.evidence ?? []), evidence], evidenceTarget: target });
    if (result) setError(result); else onClose();
  }
  return <WorkspaceDialog title="검증 증거 연결" description="실제로 확인한 실행과 배포의 주소·시각·대상을 기록합니다. 모르는 값은 추측하지 말고 기존 근거 메모에 남기세요." busy={busy} onClose={onClose}>
    <form onSubmit={event => void submit(event)}><div className="workspace-dialog-body"><WorkspaceFormError error={error} />
      <fieldset disabled={busy} className="workspace-fieldset">
        <WorkspaceSection title="증거와 대조 대상">
          <label>증거 종류<select value={kind} onChange={event => { const nextKind = event.target.value === "deployment" ? "deployment" : "ci"; setKind(nextKind); if (nextKind === "deployment" && reference === "pull-request") setReference("main"); }}><option value="ci">CI 실행</option><option value="deployment">배포 적용</option></select></label>
          <label>대조 기준<select value={reference} onChange={event => setReference(event.target.value as typeof reference)}><option value="main">관측한 원격 main</option>{kind === "ci" ? <option value="pull-request">PR 검증 대상</option> : null}<option value="commit">특정 커밋</option></select></label>
          <WorkspaceField name="repository" label="저장소 (owner/repo)" value={repository} required />
          <WorkspaceField name="targetSha" label="검증 대상 SHA (40자리)" value={previousTarget?.targetSha ?? ""} required />
          <WorkspaceField name="targetScope" label="확인해야 할 범위" value={previousTarget?.scope ?? record.scope} required />
          <WorkspaceField name="scope" label="실제로 검증한 범위" value={prior?.scope ?? ""} required />
          <WorkspaceField name="url" label="실행·배포 증거 주소" type="url" required full />
          <WorkspaceField name="collectedAt" label="실제로 수집한 시각 (시간대 포함)" help="예: 2026-11-18T13:00:00+09:00. 실행 완료 시각과 구분합니다." required />
          <WorkspaceField name="availability" label="로그·증거 접근" value="available" options={[{ value: "available", label: "열람 확인" }, { value: "expired", label: "보존 기간 만료" }, { value: "unavailable", label: "열람 불가" }]} />
          {reference !== "commit" ? <>
            <WorkspaceField name="mainSha" label="직접 확인한 원격 main SHA" value={previousTarget?.main?.sha ?? ""} required />
            <WorkspaceField name="mainObservedAt" label="원격 main 확인 시각 (시간대 포함)" required />
            <WorkspaceField name="mainUrl" label="main 관측 증거 주소" type="url" required full />
          </> : null}
          {reference === "pull-request" && kind === "ci" ? <>
            <WorkspaceField name="targetHeadSha" label="현재 PR head SHA" required />
            <WorkspaceField name="targetBaseSha" label="현재 PR base SHA" required />
          </> : null}
        </WorkspaceSection>
        {kind === "ci" ? <WorkspaceSection title="CI 실행 정보" help="같은 SHA여도 실행 회차·검증 범위가 다르면 별개의 결과입니다. 재실행은 수행하지 않습니다.">
          <WorkspaceField name="runId" label="Actions 실행 번호" required />
          <WorkspaceField name="runAttempt" label="실행 회차" type="number" value={1} required />
          <WorkspaceField name="event" label="실행 이벤트" value={previousCi?.event ?? "push"} options={["push", "pull_request", "merge_group", "workflow_dispatch", "workflow_run", "schedule"]} />
          <WorkspaceField name="workflow" label="워크플로" value={previousCi?.workflow ?? ""} required />
          <WorkspaceField name="job" label="Job (전체 실행이면 빈칸)" value={previousCi?.job ?? ""} />
          <WorkspaceField name="shard" label="Shard (해당 없으면 빈칸)" value={previousCi?.shard ?? ""} />
          <WorkspaceField name="testedSha" label="실제로 테스트한 SHA" required />
          <WorkspaceField name="headSha" label="실행 당시 PR head SHA" />
          <WorkspaceField name="baseSha" label="실행 당시 PR base SHA" />
          <WorkspaceField name="conclusion" label="실행 결과" value="unknown" options={resultOptions} />
          <WorkspaceField name="startedAt" label="해당 회차의 실제 시작 시각 (시간대 포함)" help="최초 run 생성이나 수집 시각과 구분합니다. 모르면 빈칸으로 두며 서로 다른 실행의 선후 판정은 보류될 수 있습니다." />
          <WorkspaceField name="completedAt" label="실제 실행 완료 시각 (시간대 포함)" />
        </WorkspaceSection> : <>
          <WorkspaceSection title="배포 산출물과 적용">
            <WorkspaceField name="provider" label="배포 서비스" value={previousDeployment?.provider ?? ""} required />
            <WorkspaceField name="unit" label="배포 단위" value={previousDeployment?.unit ?? ""} required />
            <WorkspaceField name="deploymentId" label="배포 식별자" required />
            <WorkspaceField name="environment" label="실제 배포 환경" value={previousDeployment?.environment ?? ""} required />
            <WorkspaceField name="origin" label="실제 서비스 원점 주소" type="url" value={previousDeployment?.origin ?? ""} required />
            <WorkspaceField name="phase" label="배포 단계" value="unknown" options={["unknown", "image-built", "applied"]} />
            <WorkspaceField name="artifactSha" label="이미지의 소스 SHA" required />
            <WorkspaceField name="artifactDigest" label="이미지 SHA-256 digest" required />
            <WorkspaceField name="appliedSha" label="실제 적용된 소스 SHA" />
            <WorkspaceField name="appliedAt" label="실제 적용 시각 (시간대 포함)" />
            <WorkspaceField name="targetEnvironment" label="확인할 대상 환경" required />
            <WorkspaceField name="targetOrigin" label="확인할 대상 원점 주소" type="url" required />
            <WorkspaceField name="targetDigest" label="확인할 이미지 digest" required />
          </WorkspaceSection>
          <WorkspaceSection title="원점 준비 상태와 스모크" help="이미지 생성·적용·원점 준비·스모크를 각각 확인해야 현재 배포 증거가 됩니다.">
            <WorkspaceField name="readyStatus" label="원점 준비 상태" value="unknown" options={["unknown", "not-ready", "ready"]} />
            <WorkspaceField name="readyAt" label="원점 확인 시각" />
            <WorkspaceField name="readySha" label="원점에서 확인한 SHA" />
            <WorkspaceField name="readyEnvironment" label="원점 확인 환경" />
            <WorkspaceField name="readyOrigin" label="확인한 원점 주소" type="url" />
            <WorkspaceField name="readyUrl" label="원점 준비 증거 주소" type="url" />
            <WorkspaceField name="smokeStatus" label="스모크 결과" value="not-run" options={["not-run", "unknown", "failed", "passed"]} />
            <WorkspaceField name="smokeAt" label="실제 스모크 시각" />
            <WorkspaceField name="smokeSha" label="스모크에서 확인한 SHA" />
            <WorkspaceField name="smokeEnvironment" label="스모크 환경" />
            <WorkspaceField name="smokeOrigin" label="스모크 원점 주소" type="url" />
            <WorkspaceField name="smokeScope" label="스모크 검증 범위" />
            <WorkspaceField name="smokeUrl" label="스모크 결과 주소" type="url" />
          </WorkspaceSection>
        </>}
      </fieldset></div><footer className="workspace-dialog-footer"><button type="button" onClick={onClose} disabled={busy}>닫기</button><button className="workspace-primary" type="submit" disabled={busy}>증거 연결 저장</button></footer></form>
  </WorkspaceDialog>;
}
