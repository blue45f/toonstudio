import { describe, expect, it } from "vitest";

import { assessWorkspaceEvidence, assessWorkspaceEvidenceSet, workspaceEvidenceTargetIssues, workspaceTypedEvidenceIssues } from "./evidence";

import type {
  WorkspaceCiEvidence, WorkspaceCiEvidenceTarget, WorkspaceDeploymentEvidence, WorkspaceDeploymentEvidenceTarget,
  WorkspaceDocumentEvidence, WorkspaceMainObservation,
} from "./evidence";

const now = new Date("2026-11-18T04:00:00Z");
const sha = "a".repeat(40), head = "b".repeat(40), merge = "c".repeat(40);
const digest = "d".repeat(64), repo = "sample/toonstudio";
const main: WorkspaceMainObservation = { repository: repo, sha, observedAt: "2026-11-18T03:55:00Z", url: `https://github.com/${repo}/commit/${sha}` };
function ci(): WorkspaceCiEvidence {
  return {
    id: "ci-1", kind: "ci", repository: repo, runId: "123", runAttempt: 2, event: "push", workflow: "core.yml", job: "product", shard: "2/4", scope: "core-product-2",
    testedSha: sha, headSha: "", baseSha: "", conclusion: "success", completedAt: "2026-11-18T03:40:00Z", collectedAt: "2026-11-18T03:50:00Z",
    availability: "available", url: `https://github.com/${repo}/actions/runs/123/attempts/2`,
  };
}
function ciTarget(): WorkspaceCiEvidenceTarget {
  return { kind: "ci", repository: repo, scope: "core-product-2", targetSha: sha, reference: "main", main, workflow: "core.yml", job: "product", shard: "2/4", runId: "123", runAttempt: 2 };
}
function deploy(): WorkspaceDeploymentEvidence {
  return {
    id: "deployment-1", kind: "deployment", repository: repo, deploymentId: "release-1", provider: "sample-host", unit: "api", environment: "production", origin: "https://origin.example.test", scope: "api-runtime",
    phase: "applied", artifactSha: sha, artifactDigest: `sha256:${digest}`, appliedSha: sha, appliedAt: "2026-11-18T03:20:00Z",
    collectedAt: "2026-11-18T03:50:00Z", availability: "available", url: "https://example.test/deployments/release-1",
    originReadiness: { status: "ready", sha, observedAt: "2026-11-18T03:25:00Z", environment: "production", origin: "https://origin.example.test", url: "https://example.test/readiness/release-1" },
    smoke: { status: "passed", sha, testedAt: "2026-11-18T03:30:00Z", environment: "production", origin: "https://origin.example.test", scope: "api-runtime", url: "https://example.test/smoke/release-1" },
  };
}
function deployTarget(): WorkspaceDeploymentEvidenceTarget {
  return { kind: "deployment", repository: repo, provider: "sample-host", unit: "api", environment: "production", origin: "https://origin.example.test", scope: "api-runtime", targetSha: sha, reference: "main", main, artifactDigest: digest };
}

describe("운영 증거의 대상·시점 판정", () => {
  it("같은 SHA·범위·실행 회차와 최근 main 관측이 일치할 때만 현재 증거로 표시한다", () => {
    const result = assessWorkspaceEvidence(ci(), ciTarget(), now);
    expect(result).toMatchObject({ status: "current", current: true, historicalSuccess: true });
    expect(result.reasons.join(" ")).toContain("실행 승인을 뜻하지 않습니다");
  });
  it("성공한 과거 증거를 새로 수집·가져와도 실제 완료 시각의 만료를 초기화하지 않는다", () => {
    const evidence = { ...ci(), completedAt: "2026-11-16T03:40:00Z", collectedAt: now.toISOString() };
    expect(assessWorkspaceEvidence(evidence, ciTarget(), now)).toMatchObject({ status: "stale", current: false, historicalSuccess: true });
  });
  it("CI가 최근에 성공해도 main 관측이 오래되면 현재 main 성공으로 승격하지 않는다", () => {
    const target = { ...ciTarget(), main: { ...main, observedAt: "2026-11-18T01:00:00Z" } };
    expect(workspaceEvidenceTargetIssues(target, now)).toEqual([]);
    expect(assessWorkspaceEvidence(ci(), target, now)).toMatchObject({ status: "stale", current: false, historicalSuccess: true });
  });
  it("현재 원격 main이 바뀌면 같은 날의 성공을 다른 SHA에 적용하지 않는다", () => {
    expect(assessWorkspaceEvidence(ci(), { ...ciTarget(), main: { ...main, sha: head } }, now).status).toBe("mismatch");
  });
  it("다른 샤드·범위·job·회차의 성공을 요청한 검증으로 취급하지 않는다", () => {
    for (const patch of [{ scope: "all-core" }, { shard: "1/4" }, { job: "build" }, { runAttempt: 3 }, { workflow: "verify.yml" }]) {
      expect(assessWorkspaceEvidence(ci(), { ...ciTarget(), ...patch }, now)).toMatchObject({ status: "mismatch", current: false, historicalSuccess: true });
    }
  });
  it("최신 실패 회차가 있으면 이전 성공 회차를 현재 녹색으로 선택하지 않는다", () => {
    const success = ci(), failure = { ...ci(), id: "ci-rerun-failed", runAttempt: 3, conclusion: "failure" as const, completedAt: "2026-11-18T03:55:00Z", collectedAt: now.toISOString(), url: `https://github.com/${repo}/actions/runs/123/attempts/3` };
    const result = assessWorkspaceEvidenceSet([failure, success], ciTarget(), now);
    expect(result).toMatchObject({ current: false, evidenceId: failure.id, supersededEvidenceIds: [success.id] });
    expect(assessWorkspaceEvidenceSet([success, failure], { ...ciTarget(), runAttempt: 3 }, now)).toMatchObject({ status: "failed", current: false });
  });
  it("다른 run의 새 실패도 실행 ID 숫자나 최근 가져온 옛 성공보다 우선한다", () => {
    const old = { ...ci(), collectedAt: now.toISOString() };
    const latest = { ...ci(), id: "newer-run", runId: "100", runAttempt: 1, startedAt: "2026-11-18T03:45:00Z", completedAt: "2026-11-18T03:55:00Z", collectedAt: "2026-11-18T03:56:00Z", conclusion: "failure" as const, url: `https://github.com/${repo}/actions/runs/100` };
    const result = assessWorkspaceEvidenceSet([old, latest], { ...ciTarget(), runId: undefined, runAttempt: undefined }, now);
    expect(result).toMatchObject({ status: "failed", current: false, evidenceId: "newer-run" });
  });
  it.each(["pending", "failure"] as const)("옛 run이 늦게 완료돼도 이후에 시작한 %s 실행을 가리지 않는다", conclusion => {
    const old = { ...ci(), startedAt: "2026-11-18T03:00:00Z", completedAt: "2026-11-18T03:50:00Z", collectedAt: "2026-11-18T03:59:00Z" };
    const latest: WorkspaceCiEvidence = {
      ...ci(), id: "newer-run", runId: "100", runAttempt: 1, conclusion,
      startedAt: "2026-11-18T03:40:00Z", completedAt: conclusion === "pending" ? "" : "2026-11-18T03:45:00Z",
      collectedAt: "2026-11-18T03:55:00Z", url: `https://github.com/${repo}/actions/runs/100`,
    };
    const target = { ...ciTarget(), runId: undefined, runAttempt: undefined };
    for (const evidence of [[old, latest], [latest, old]]) {
      expect(assessWorkspaceEvidenceSet(evidence, target, now)).toMatchObject({ status: conclusion === "pending" ? "incomplete" : "failed", current: false, evidenceId: latest.id, supersededEvidenceIds: [old.id] });
    }
  });
  it.each(["pending", "failure"] as const)("서로 다른 run의 시작을 모르면 수집·완료 순서로 %s를 가린 성공을 추정하지 않는다", conclusion => {
    const old = { ...ci(), completedAt: "2026-11-18T03:50:00Z", collectedAt: "2026-11-18T03:59:00Z" };
    const other: WorkspaceCiEvidence = { ...ci(), id: "unknown-order", runId: "100", runAttempt: 1, conclusion, completedAt: conclusion === "pending" ? "" : "2026-11-18T03:45:00Z", collectedAt: "2026-11-18T03:55:00Z", url: `https://github.com/${repo}/actions/runs/100` };
    const result = assessWorkspaceEvidenceSet([old, other], { ...ciTarget(), runId: undefined, runAttempt: undefined }, now);
    expect(result).toMatchObject({ status: "incomplete", current: false, evidenceId: null });
    expect(result.reasons.join(" ")).toContain("실제 시작 시각");
  });
  it("같은 run의 새 회차가 진행 중이면 시작 시각이 없어도 이전 성공 회차를 제외한다", () => {
    const pending: WorkspaceCiEvidence = { ...ci(), id: "rerun-pending", runAttempt: 3, conclusion: "pending", completedAt: "", collectedAt: now.toISOString(), url: `https://github.com/${repo}/actions/runs/123/attempts/3` };
    expect(assessWorkspaceEvidenceSet([ci(), pending], { ...ciTarget(), runAttempt: undefined }, now)).toMatchObject({ status: "incomplete", current: false, evidenceId: pending.id });
  });
  it("재실행 순서는 최초 run 생성이나 옛 회차가 아닌 해당 회차의 시작으로 비교한다", () => {
    const old = { ...ci(), startedAt: "2026-11-18T03:00:00Z" };
    const other = { ...ci(), id: "other-run", runId: "100", runAttempt: 1, startedAt: "2026-11-18T03:45:00Z", completedAt: "2026-11-18T03:50:00Z", collectedAt: "2026-11-18T03:59:00Z", url: `https://github.com/${repo}/actions/runs/100` };
    const rerun: WorkspaceCiEvidence = { ...ci(), id: "rerun", runAttempt: 3, startedAt: "2026-11-18T03:55:00Z", conclusion: "pending", completedAt: "", collectedAt: "2026-11-18T03:56:00Z", url: `https://github.com/${repo}/actions/runs/123/attempts/3` };
    expect(assessWorkspaceEvidenceSet([old, other, rerun], { ...ciTarget(), runId: undefined, runAttempt: undefined }, now)).toMatchObject({ current: false, evidenceId: rerun.id, status: "incomplete" });
  });
  it("같은 회차의 시작 시각이 서로 다르면 성공을 확정하지 않는다", () => {
    const first = { ...ci(), startedAt: "2026-11-18T03:00:00Z" };
    const conflict = { ...ci(), id: "conflicting-start", startedAt: "2026-11-18T03:10:00Z" };
    expect(assessWorkspaceEvidenceSet([first, conflict], ciTarget(), now)).toMatchObject({ status: "incomplete", current: false, evidenceId: null });
  });
  it("같은 회차의 상충 결과는 보류하고 옛 진행 스냅샷은 완료 상태를 덮어쓰지 않는다", () => {
    const pending = { ...ci(), id: "pending-snapshot", conclusion: "pending" as const, completedAt: "", collectedAt: now.toISOString() };
    expect(assessWorkspaceEvidenceSet([ci(), pending], ciTarget(), now).current).toBe(true);
    expect(assessWorkspaceEvidenceSet([ci(), { ...ci(), id: "contradiction", conclusion: "failure" }], ciTarget(), now)).toMatchObject({ current: false, status: "incomplete" });
  });
  it("PR merge ref의 실제 tested SHA와 head·base를 각각 비교한다", () => {
    const evidence = { ...ci(), event: "pull_request", testedSha: merge, headSha: head, baseSha: sha };
    const target: WorkspaceCiEvidenceTarget = { ...ciTarget(), reference: "pull-request", targetSha: merge, headSha: head, baseSha: sha };
    expect(assessWorkspaceEvidence(evidence, target, now).current).toBe(true);
    expect(assessWorkspaceEvidence(evidence, { ...target, headSha: merge }, now).current).toBe(false);
    expect(assessWorkspaceEvidence(evidence, { ...target, targetSha: head }, now).current).toBe(false);
    expect(workspaceTypedEvidenceIssues({ ...evidence, baseSha: "" }, now).join(" ")).toContain("base SHA");
  });
  it("증거 만료·접근 불가와 실패·취소·skip·진행 상태를 성공과 분리한다", () => {
    expect(assessWorkspaceEvidence({ ...ci(), availability: "expired" }, ciTarget(), now)).toMatchObject({ status: "unavailable", historicalSuccess: true, current: false });
    for (const conclusion of ["failure", "cancelled", "skipped"] as const) expect(assessWorkspaceEvidence({ ...ci(), conclusion }, ciTarget(), now)).toMatchObject({ current: false, historicalSuccess: false });
    expect(assessWorkspaceEvidence({ ...ci(), conclusion: "pending", completedAt: "" }, ciTarget(), now).status).toBe("incomplete");
  });
  it("다른 실행 URL·잘못된 시각·수집 전 완료·unsafe URL을 거부한다", () => {
    for (const patch of [{ url: `https://github.com/${repo}/actions/runs/999` }, { completedAt: "2026-02-30T10:00:00Z" }, { collectedAt: "2026-11-18T02:00:00Z" }, { startedAt: "2026-11-18T03:55:00Z", completedAt: "", conclusion: "pending" }, { url: "https://user:password@example.test" }, { event: "pull_request; command" }]) {
      expect(workspaceTypedEvidenceIssues({ ...ci(), ...patch }, now).length).toBeGreaterThan(0);
    }
  });
  it("실제 적용·origin readiness·스모크가 같은 환경에서 일치해야 배포 증거가 된다", () => {
    expect(assessWorkspaceEvidence(deploy(), deployTarget(), now)).toMatchObject({ current: true, historicalSuccess: true });
    for (const patch of [{ environment: "staging" }, { origin: "https://elsewhere.example.test" }, { unit: "web" }, { artifactDigest: "f".repeat(64) }]) {
      expect(assessWorkspaceEvidence(deploy(), { ...deployTarget(), ...patch }, now).current).toBe(false);
    }
  });
  it("이미지 빌드 성공을 운영 적용으로 승격하지 않는다", () => {
    const evidence: WorkspaceDeploymentEvidence = { ...deploy(), phase: "image-built", appliedSha: "", appliedAt: "", originReadiness: { status: "unknown", observedAt: "", sha: "", environment: "", origin: "", url: "" }, smoke: { status: "not-run", testedAt: "", sha: "", environment: "", origin: "", scope: "", url: "" } };
    expect(assessWorkspaceEvidence(evidence, deployTarget(), now)).toMatchObject({ status: "incomplete", current: false, historicalSuccess: false });
  });
  it("잘못된 환경의 스모크와 origin 준비 미확인을 차단한다", () => {
    const evidence = deploy();
    expect(assessWorkspaceEvidence({ ...evidence, smoke: { ...evidence.smoke, environment: "staging" } }, deployTarget(), now)).toMatchObject({ status: "mismatch", current: false, historicalSuccess: false });
    expect(assessWorkspaceEvidence({ ...evidence, originReadiness: { ...evidence.originReadiness, status: "not-ready" } }, deployTarget(), now).status).toBe("failed");
    expect(assessWorkspaceEvidence({ ...evidence, originReadiness: { ...evidence.originReadiness, sha: head } }, deployTarget(), now).current).toBe(false);
  });
  it("적용 전 스모크와 다른 아티팩트의 적용을 성공으로 취급하지 않는다", () => {
    const evidence = deploy();
    expect(workspaceTypedEvidenceIssues({ ...evidence, smoke: { ...evidence.smoke, testedAt: "2026-11-18T03:10:00Z" } }, now).length).toBeGreaterThan(0);
    expect(assessWorkspaceEvidence({ ...evidence, artifactSha: head }, deployTarget(), now)).toMatchObject({ current: false, historicalSuccess: false });
  });
  it.each(["smoke", "readiness"] as const)("같은 배포의 이후 %s 실패를 나중에 수집한 옛 성공이 가리지 않는다", field => {
    const old = { ...deploy(), collectedAt: "2026-11-18T03:59:00Z" };
    const failed: WorkspaceDeploymentEvidence = {
      ...deploy(), id: "later-failure", collectedAt: "2026-11-18T03:50:00Z",
      ...(field === "smoke"
        ? { smoke: { ...deploy().smoke, status: "failed", testedAt: "2026-11-18T03:45:00Z" } }
        : { originReadiness: { ...deploy().originReadiness, status: "not-ready", observedAt: "2026-11-18T03:45:00Z" } }),
    };
    for (const evidence of [[old, failed], [failed, old]]) {
      expect(assessWorkspaceEvidenceSet(evidence, deployTarget(), now)).toMatchObject({ status: "failed", current: false, evidenceId: failed.id, supersededEvidenceIds: [old.id] });
    }
  });
  it("readiness와 smoke 관측이 교차하면 더 늦은 하나만 골라 배포 성공으로 합성하지 않는다", () => {
    const recoveredReadiness = { ...deploy(), id: "readiness-recovered", collectedAt: "2026-11-18T03:59:00Z", originReadiness: { ...deploy().originReadiness, observedAt: "2026-11-18T03:55:00Z" } };
    const failedSmoke: WorkspaceDeploymentEvidence = { ...deploy(), id: "smoke-failed", collectedAt: "2026-11-18T03:50:00Z", smoke: { ...deploy().smoke, status: "failed", testedAt: "2026-11-18T03:45:00Z" } };
    expect(assessWorkspaceEvidenceSet([recoveredReadiness, failedSmoke], deployTarget(), now)).toMatchObject({ status: "incomplete", current: false, evidenceId: null });
  });
  it("같은 실제 관측 시각의 성공·실패가 상충하면 수집 시각이 늦은 성공으로 덮지 않는다", () => {
    const old = { ...deploy(), collectedAt: "2026-11-18T03:59:00Z" };
    const failed: WorkspaceDeploymentEvidence = { ...deploy(), id: "conflicting-smoke", smoke: { ...deploy().smoke, status: "failed" } };
    expect(assessWorkspaceEvidenceSet([old, failed], deployTarget(), now)).toMatchObject({ status: "incomplete", current: false, evidenceId: null });
  });
  it("동일 배포·아티팩트의 빌드 기록 뒤 실제 적용·readiness·smoke가 연결되면 적용 증거를 사용한다", () => {
    const built: WorkspaceDeploymentEvidence = { ...deploy(), id: "built", phase: "image-built", appliedSha: "", appliedAt: "", originReadiness: { status: "unknown", observedAt: "", sha: "", environment: "", origin: "", url: "" }, smoke: { status: "not-run", testedAt: "", sha: "", environment: "", origin: "", scope: "", url: "" }, collectedAt: "2026-11-18T03:59:00Z" };
    expect(assessWorkspaceEvidenceSet([built, deploy()], deployTarget(), now)).toMatchObject({ current: true, evidenceId: deploy().id });
    expect(assessWorkspaceEvidenceSet([{ ...built, deploymentId: "different-release", artifactSha: head }, deploy()], deployTarget(), now)).toMatchObject({ current: true, evidenceId: deploy().id });
  });
  it("같은 서비스에 다른 SHA가 실제 적용되면 옛 대상 SHA의 성공을 현재 배포로 남기지 않는다", () => {
    const old = { ...deploy(), collectedAt: "2026-11-18T03:59:00Z" };
    const latest: WorkspaceDeploymentEvidence = { ...deploy(), id: "new-deploy", deploymentId: "release-2", artifactSha: head, appliedSha: head, appliedAt: "2026-11-18T03:35:00Z", originReadiness: { ...deploy().originReadiness, sha: head, observedAt: "2026-11-18T03:40:00Z" }, smoke: { ...deploy().smoke, sha: head, testedAt: "2026-11-18T03:45:00Z" } };
    for (const evidence of [[old, latest], [latest, old]]) {
      const result = assessWorkspaceEvidenceSet(evidence, deployTarget(), now);
      expect(result).toMatchObject({ status: "mismatch", current: false, evidenceId: latest.id, supersededEvidenceIds: [old.id] });
      expect(result.reasons.join(" ")).toContain("적용 SHA가 대상 SHA와 다릅니다");
    }
    const pendingHealth: WorkspaceDeploymentEvidence = { ...latest, originReadiness: { status: "unknown", observedAt: "", sha: "", environment: "", origin: "", url: "" }, smoke: { status: "not-run", testedAt: "", sha: "", environment: "", origin: "", scope: "", url: "" } };
    expect(assessWorkspaceEvidenceSet([old, pendingHealth], deployTarget(), now)).toMatchObject({ status: "mismatch", current: false, evidenceId: latest.id });
    const otherScope = { ...latest, scope: "another-smoke-scope", smoke: { ...latest.smoke, scope: "another-smoke-scope" } };
    expect(assessWorkspaceEvidenceSet([old, otherScope], deployTarget(), now)).toMatchObject({ status: "mismatch", current: false, evidenceId: latest.id });
    expect(assessWorkspaceEvidenceSet([old, { ...latest, environment: "staging", origin: "https://staging.example.test" }], deployTarget(), now)).toMatchObject({ current: true, evidenceId: old.id });
  });
  it("문서 버전 또는 내용 해시가 바뀌면 이전 검토 증거를 유지하면서 현재 확인을 해제한다", () => {
    const evidence: WorkspaceDocumentEvidence = { id: "doc-1", kind: "document", documentId: "proposal", version: "v2", contentHash: digest, scope: "submission", verifiedAt: "2026-11-17T04:00:00Z", collectedAt: now.toISOString(), availability: "available", url: "https://example.test/private-document" };
    const target = { kind: "document" as const, documentId: "proposal", version: "v2", contentHash: `sha256:${digest}`, scope: "submission" };
    expect(assessWorkspaceEvidence(evidence, target, now).current).toBe(true);
    expect(assessWorkspaceEvidence(evidence, { ...target, version: "v3" }, now)).toMatchObject({ status: "mismatch", historicalSuccess: true });
    expect(assessWorkspaceEvidence(evidence, { ...target, contentHash: "f".repeat(64) }, now).current).toBe(false);
  });
});
