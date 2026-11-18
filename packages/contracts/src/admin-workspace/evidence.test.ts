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
    for (const patch of [{ url: `https://github.com/${repo}/actions/runs/999` }, { completedAt: "2026-02-30T10:00:00Z" }, { collectedAt: "2026-11-18T02:00:00Z" }, { url: "https://user:password@example.test" }, { event: "pull_request; command" }]) {
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
  it("문서 버전 또는 내용 해시가 바뀌면 이전 검토 증거를 유지하면서 현재 확인을 해제한다", () => {
    const evidence: WorkspaceDocumentEvidence = { id: "doc-1", kind: "document", documentId: "proposal", version: "v2", contentHash: digest, scope: "submission", verifiedAt: "2026-11-17T04:00:00Z", collectedAt: now.toISOString(), availability: "available", url: "https://example.test/private-document" };
    const target = { kind: "document" as const, documentId: "proposal", version: "v2", contentHash: `sha256:${digest}`, scope: "submission" };
    expect(assessWorkspaceEvidence(evidence, target, now).current).toBe(true);
    expect(assessWorkspaceEvidence(evidence, { ...target, version: "v3" }, now)).toMatchObject({ status: "mismatch", historicalSuccess: true });
    expect(assessWorkspaceEvidence(evidence, { ...target, contentHash: "f".repeat(64) }, now).current).toBe(false);
  });
});
