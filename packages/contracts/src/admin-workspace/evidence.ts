/** 기록의 성공 이력과 특정 대상·범위에 대한 현재 증거를 분리한다. 외부 조회·승인을 수행하지 않는다. */
export const WORKSPACE_MAIN_FRESHNESS_HOURS = 1;
export const WORKSPACE_EVIDENCE_FRESHNESS_HOURS = 24;
export type WorkspaceEvidenceAvailability = "available" | "expired" | "unavailable";
export interface WorkspaceMainObservation { repository: string; sha: string; observedAt: string; url: string }
interface EvidenceBase {
  id: string; url: string; collectedAt: string; availability: WorkspaceEvidenceAvailability; scope: string;
}
export interface WorkspaceCiEvidence extends EvidenceBase {
  kind: "ci"; repository: string; runId: string; runAttempt: number; event: string; workflow: string; job: string; shard: string;
  testedSha: string; headSha: string; baseSha: string;
  conclusion: "success" | "failure" | "cancelled" | "skipped" | "pending" | "unknown"; completedAt: string; startedAt?: string;
}
export interface WorkspaceDeploymentSmoke {
  status: "passed" | "failed" | "not-run" | "unknown"; testedAt: string; sha: string;
  environment: string; origin: string; scope: string; url: string;
}
export interface WorkspaceOriginReadiness {
  status: "ready" | "not-ready" | "unknown"; observedAt: string; sha: string; environment: string; origin: string; url: string;
}
export interface WorkspaceDeploymentEvidence extends EvidenceBase {
  kind: "deployment"; repository: string; deploymentId: string; provider: string; unit: string; environment: string; origin: string;
  phase: "image-built" | "applied" | "unknown"; artifactSha: string; artifactDigest: string; appliedSha: string; appliedAt: string;
  originReadiness: WorkspaceOriginReadiness; smoke: WorkspaceDeploymentSmoke;
}
export interface WorkspaceDocumentEvidence extends EvidenceBase {
  kind: "document"; documentId: string; version: string; contentHash: string; verifiedAt: string;
}
export type WorkspaceEvidence = WorkspaceCiEvidence | WorkspaceDeploymentEvidence | WorkspaceDocumentEvidence;
interface TargetBase { scope: string; maxAgeHours?: number }
interface CodeTarget extends TargetBase {
  repository: string; targetSha: string; reference: "main" | "pull-request" | "commit";
  main?: WorkspaceMainObservation; mainMaxAgeHours?: number;
}
export interface WorkspaceCiEvidenceTarget extends CodeTarget {
  kind: "ci"; headSha?: string; baseSha?: string; event?: string; workflow?: string; job?: string; shard?: string;
  runId?: string; runAttempt?: number;
}
export interface WorkspaceDeploymentEvidenceTarget extends CodeTarget { kind: "deployment"; provider: string; unit: string; environment: string; origin: string; artifactDigest?: string }
export interface WorkspaceDocumentEvidenceTarget extends TargetBase { kind: "document"; documentId: string; version: string; contentHash: string }
export type WorkspaceEvidenceTarget = WorkspaceCiEvidenceTarget | WorkspaceDeploymentEvidenceTarget | WorkspaceDocumentEvidenceTarget;
export interface WorkspaceEvidenceAssessment {
  status: "current" | "stale" | "mismatch" | "incomplete" | "failed" | "unavailable";
  current: boolean; historicalSuccess: boolean; reasons: string[]; occurredAt: string; ageHours: number | null;
}
export interface WorkspaceEvidenceSetAssessment extends WorkspaceEvidenceAssessment { evidenceId: string | null; supersededEvidenceIds: string[] }

export function workspaceEvidenceObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
export function workspaceEvidenceText(value: unknown, maximum = 4000): value is string {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= maximum;
}
export function workspaceEvidenceSha(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{40}$/iu.test(value); }
export function workspaceEvidenceUrl(value: unknown): boolean {
  if (!workspaceEvidenceText(value)) return false;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}
export function normalizeWorkspaceRepository(value: string): string | null {
  if (typeof value !== "string") return null;
  let repository = value.trim();
  if (repository.startsWith("https://")) {
    try {
      const url = new URL(repository);
      if (url.hostname !== "github.com" || url.username || url.password || url.search || url.hash) return null;
      repository = url.pathname.replace(/^\/|\/$/gu, "");
    } catch { return null; }
  }
  repository = repository.replace(/\.git$/iu, "");
  return /^[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.-]*$/iu.test(repository) ? repository.toLowerCase() : null;
}
export function workspaceEvidenceInstant(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) return null;
  const day = Date.parse(`${value.slice(0, 10)}T00:00:00Z`), instant = Date.parse(value);
  const time = value.slice(11, 19).split(":").map(Number);
  return Number.isFinite(day) && new Date(day).toISOString().slice(0, 10) === value.slice(0, 10)
    && time[0] <= 23 && time[1] <= 59 && time[2] <= 59 && Number.isFinite(instant) ? instant : null;
}
export function normalizeWorkspaceOrigin(value: string): string | null {
  if (!workspaceEvidenceUrl(value)) return null;
  const url = new URL(value);
  return url.pathname === "/" && !url.search && !url.hash ? url.origin : null;
}
function sameSha(left: string, right: string): boolean { return workspaceEvidenceSha(left) && workspaceEvidenceSha(right) && left.toLowerCase() === right.toLowerCase(); }
function hash(value: unknown): string | null { return typeof value === "string" && /^(?:sha256:)?[a-f0-9]{64}$/iu.test(value) ? value.toLowerCase().replace(/^sha256:/u, "") : null; }
function event(value: unknown): boolean { return typeof value === "string" && /^[a-z][a-z0-9_]{0,79}$/u.test(value); }
function hours(value: number | undefined, fallback: number): number { return value !== undefined && Number.isFinite(value) && value > 0 && value <= 8760 ? value : fallback; }

/** 값이 불완전한 옛 기록은 이 새 계약으로 자동 승격하지 않고 원문에 남긴다. */
export function workspaceTypedEvidenceIssues(value: unknown, now = new Date()): string[] {
  if (!workspaceEvidenceObject(value)) return ["증거는 일반 객체여야 합니다."];
  const issues: string[] = [];
  const text = (key: string, maximum = 4000) => { if (!workspaceEvidenceText(value[key], maximum)) issues.push(`${key}: 비어 있지 않은 문자열이 필요합니다.`); };
  const sha = (key: string, optional = false) => { if (!(optional && value[key] === "") && !workspaceEvidenceSha(value[key])) issues.push(`${key}: 전체 40자리 SHA가 필요합니다.`); };
  const date = (key: string, optional = false) => {
    if (optional && value[key] === "") return;
    const timestamp = workspaceEvidenceInstant(value[key]);
    if (timestamp === null || timestamp > now.getTime()) issues.push(`${key}: 시간대가 포함된 과거 또는 현재 시각이 필요합니다.`);
  };
  text("id", 200); text("scope", 500); date("collectedAt");
  if (!workspaceEvidenceUrl(value.url)) issues.push("증거 URL은 자격증명이 없는 HTTPS 주소여야 합니다.");
  if (!["available", "expired", "unavailable"].includes(String(value.availability))) issues.push("증거 접근 상태가 올바르지 않습니다.");
  if (value.kind === "ci" || value.kind === "deployment") {
    if (typeof value.repository !== "string" || !normalizeWorkspaceRepository(value.repository)) issues.push("GitHub 저장소 식별자가 필요합니다.");
  }
  if (value.kind === "ci") {
    if (typeof value.runId !== "string" || !/^[1-9]\d{0,29}$/u.test(value.runId)) issues.push("CI run ID가 필요합니다.");
    if (!Number.isSafeInteger(value.runAttempt) || Number(value.runAttempt) < 1) issues.push("CI 실행 회차는 1 이상의 정수여야 합니다.");
    if (!event(value.event)) issues.push("CI event는 GitHub 이벤트 식별자여야 합니다.");
    text("workflow", 500);
    for (const key of ["job", "shard"]) if (typeof value[key] !== "string" || value[key].length > 500) issues.push(`${key}: 500자 이하 문자열이 필요합니다.`);
    sha("testedSha"); sha("headSha", true); sha("baseSha", true);
    if (Boolean(value.headSha) !== Boolean(value.baseSha)) issues.push("PR 검증에는 head와 base SHA가 함께 필요합니다.");
    if (["pull_request", "pull_request_target", "merge_group"].includes(String(value.event)) && (!workspaceEvidenceSha(value.headSha) || !workspaceEvidenceSha(value.baseSha))) issues.push("PR·merge group 이벤트에는 실제 head와 base SHA가 필요합니다.");
    if (!["success", "failure", "cancelled", "skipped", "pending", "unknown"].includes(String(value.conclusion))) issues.push("CI 결과가 올바르지 않습니다.");
    date("completedAt", value.conclusion === "pending" || value.conclusion === "unknown");
    if (value.startedAt !== undefined) {
      date("startedAt");
      const started = workspaceEvidenceInstant(value.startedAt), completed = workspaceEvidenceInstant(value.completedAt);
      if (started !== null && completed !== null && started > completed) issues.push("CI 시작 시각은 완료 시각보다 빠르거나 같아야 합니다.");
    }
    if (value.conclusion === "pending" && value.completedAt !== "") issues.push("진행 중 CI를 완료된 실행으로 기록할 수 없습니다.");
    if (workspaceEvidenceUrl(value.url) && typeof value.repository === "string") {
      const url = new URL(String(value.url)), repository = normalizeWorkspaceRepository(value.repository);
      const path = url.pathname.match(/^\/([^/]+\/[^/]+)\/actions\/runs\/([1-9]\d*)(?:\/attempts\/([1-9]\d*))?\/?$/u);
      if (url.hostname !== "github.com" || !path || path[1].toLowerCase() !== repository || path[2] !== value.runId || (path[3] && Number(path[3]) !== value.runAttempt)) issues.push("CI 링크의 저장소·실행·회차가 기록과 일치해야 합니다.");
    }
  } else if (value.kind === "deployment") {
    text("deploymentId", 500); text("provider", 200); text("unit", 200); text("environment", 200); sha("artifactSha");
    if (!hash(value.artifactDigest)) issues.push("배포 아티팩트의 SHA-256 digest가 필요합니다.");
    if (typeof value.origin !== "string" || !normalizeWorkspaceOrigin(value.origin)) issues.push("배포 origin은 HTTPS 원점 주소여야 합니다.");
    if (!["image-built", "applied", "unknown"].includes(String(value.phase))) issues.push("배포 적용 단계가 올바르지 않습니다.");
    sha("appliedSha", value.phase !== "applied"); date("appliedAt", value.phase !== "applied");
    if (!workspaceEvidenceObject(value.originReadiness)) issues.push("실제 origin readiness 기록이 필요합니다.");
    else {
      const readiness = value.originReadiness, observedAt = workspaceEvidenceInstant(readiness.observedAt);
      if (!["ready", "not-ready", "unknown"].includes(String(readiness.status))) issues.push("origin readiness 상태가 올바르지 않습니다.");
      for (const key of ["observedAt", "sha", "environment", "origin", "url"]) if (typeof readiness[key] !== "string" || readiness[key].length > 4000) issues.push(`origin readiness ${key} 형식이 올바르지 않습니다.`);
      if (readiness.status !== "unknown") {
        if (observedAt === null || observedAt > now.getTime() || !workspaceEvidenceSha(readiness.sha) || !workspaceEvidenceUrl(readiness.url)
          || !workspaceEvidenceText(readiness.environment) || typeof readiness.origin !== "string" || !normalizeWorkspaceOrigin(readiness.origin)) issues.push("origin readiness에는 SHA·환경·origin·시각·근거가 필요합니다.");
        const appliedAt = workspaceEvidenceInstant(value.appliedAt);
        if (appliedAt !== null && observedAt !== null && observedAt < appliedAt) issues.push("origin readiness는 이미지 적용 이후에 확인해야 합니다.");
      }
    }
    if (!workspaceEvidenceObject(value.smoke)) issues.push("배포 스모크 기록이 필요합니다.");
    else {
      const smoke = value.smoke, testedAt = workspaceEvidenceInstant(smoke.testedAt);
      if (!["passed", "failed", "not-run", "unknown"].includes(String(smoke.status))) issues.push("스모크 상태가 올바르지 않습니다.");
      for (const key of ["testedAt", "sha", "environment", "origin", "scope", "url"]) if (typeof smoke[key] !== "string" || smoke[key].length > 4000) issues.push(`스모크 ${key} 형식이 올바르지 않습니다.`);
      if (["passed", "failed"].includes(String(smoke.status))) {
        if (testedAt === null || testedAt > now.getTime() || !workspaceEvidenceSha(smoke.sha) || !workspaceEvidenceUrl(smoke.url)
          || !workspaceEvidenceText(smoke.environment) || !workspaceEvidenceText(smoke.scope) || typeof smoke.origin !== "string" || !normalizeWorkspaceOrigin(smoke.origin)) issues.push("실행된 스모크에는 SHA·환경·origin·범위·시각·결과 링크가 필요합니다.");
        const appliedAt = workspaceEvidenceInstant(value.appliedAt);
        if (appliedAt !== null && testedAt !== null && testedAt < appliedAt) issues.push("스모크는 실제 이미지 적용 이후의 결과여야 합니다.");
      }
    }
  } else if (value.kind === "document") {
    text("documentId", 200); text("version", 500); date("verifiedAt");
    if (!hash(value.contentHash)) issues.push("문서 내용의 SHA-256 해시가 필요합니다.");
  } else issues.push("지원하지 않는 증거 종류입니다.");
  const collected = workspaceEvidenceInstant(value.collectedAt);
  const occurred = workspaceEvidenceInstant(value.kind === "ci" ? value.completedAt : value.kind === "document" ? value.verifiedAt : value.appliedAt);
  if (collected !== null && occurred !== null && collected < occurred) issues.push("수집 시각은 실제 검증·적용 시각보다 빠를 수 없습니다.");
  if (value.kind === "deployment" && workspaceEvidenceObject(value.smoke)) {
    const tested = workspaceEvidenceInstant(value.smoke.testedAt);
    if (tested !== null && collected !== null && collected < tested) issues.push("스모크 수집 시각은 실행 시각보다 빠를 수 없습니다.");
  }
  if (value.kind === "deployment" && workspaceEvidenceObject(value.originReadiness)) {
    const observed = workspaceEvidenceInstant(value.originReadiness.observedAt);
    if (observed !== null && collected !== null && collected < observed) issues.push("origin readiness 수집 시각은 실제 관측보다 빠를 수 없습니다.");
  }
  return issues;
}

function mainObservationShapeIssues(observation: unknown, now: Date): string[] {
  if (!workspaceEvidenceObject(observation)) return ["현재 main 관측 기록이 필요합니다."];
  const reasons: string[] = [];
  if (typeof observation.repository !== "string" || !normalizeWorkspaceRepository(observation.repository) || !workspaceEvidenceSha(observation.sha) || !workspaceEvidenceUrl(observation.url)) reasons.push("main 관측에는 저장소·전체 SHA·근거 URL이 필요합니다.");
  const observed = workspaceEvidenceInstant(observation.observedAt);
  if (observed === null || observed > now.getTime()) reasons.push("main 관측 시각이 올바르지 않습니다.");
  return reasons;
}
export function workspaceMainObservationIssues(observation: unknown, now = new Date(), maximumAgeHours = WORKSPACE_MAIN_FRESHNESS_HOURS): string[] {
  const reasons = mainObservationShapeIssues(observation, now);
  if (reasons.length || !workspaceEvidenceObject(observation)) return reasons;
  if (now.getTime() - workspaceEvidenceInstant(observation.observedAt)! > hours(maximumAgeHours, WORKSPACE_MAIN_FRESHNESS_HOURS) * 3_600_000) reasons.push("main 관측이 오래되었습니다. 현재 원격 기준을 다시 확인하세요.");
  return reasons;
}
export function workspaceEvidenceTargetIssues(value: unknown, now = new Date()): string[] {
  if (!workspaceEvidenceObject(value)) return ["검증 대상은 일반 객체여야 합니다."];
  const issues: string[] = [];
  if (!workspaceEvidenceText(value.scope, 500)) issues.push("검증 대상 범위가 필요합니다.");
  for (const key of ["maxAgeHours", "mainMaxAgeHours"]) if (value[key] !== undefined && (typeof value[key] !== "number" || !Number.isFinite(value[key]) || value[key] <= 0 || value[key] > 8760)) issues.push(`${key}: 최대 8760시간의 양수가 필요합니다.`);
  if (value.kind === "document") {
    if (!workspaceEvidenceText(value.documentId, 200) || !workspaceEvidenceText(value.version, 500) || !hash(value.contentHash)) issues.push("문서 대상에는 식별자·버전·내용 해시가 필요합니다.");
  } else if (value.kind === "ci" || value.kind === "deployment") {
    if (typeof value.repository !== "string" || !normalizeWorkspaceRepository(value.repository) || !workspaceEvidenceSha(value.targetSha)) issues.push("대상 저장소와 전체 SHA가 필요합니다.");
    if (!["main", "pull-request", "commit"].includes(String(value.reference))) issues.push("검증 기준 유형이 올바르지 않습니다.");
    if (value.main !== undefined) issues.push(...mainObservationShapeIssues(value.main, now));
    if (value.kind === "ci") {
      for (const key of ["headSha", "baseSha"]) if (value[key] !== undefined && !workspaceEvidenceSha(value[key])) issues.push(`${key}: 전체 SHA가 필요합니다.`);
      if (value.reference === "pull-request" && (!workspaceEvidenceSha(value.headSha) || !workspaceEvidenceSha(value.baseSha))) issues.push("PR 대상에는 head·base SHA가 필요합니다.");
      if (value.event !== undefined && !event(value.event)) issues.push("대상 CI event가 올바르지 않습니다.");
      for (const key of ["workflow", "job", "shard"]) if (value[key] !== undefined && (typeof value[key] !== "string" || value[key].length > 500)) issues.push(`대상 ${key} 형식이 올바르지 않습니다.`);
      if (value.runId !== undefined && (typeof value.runId !== "string" || !/^[1-9]\d{0,29}$/u.test(value.runId))) issues.push("대상 run ID가 올바르지 않습니다.");
      if (value.runAttempt !== undefined && (!Number.isSafeInteger(value.runAttempt) || Number(value.runAttempt) < 1)) issues.push("대상 실행 회차가 올바르지 않습니다.");
    } else {
      if (!["provider", "unit", "environment"].every(key => workspaceEvidenceText(value[key], 200)) || typeof value.origin !== "string" || !normalizeWorkspaceOrigin(value.origin)) issues.push("배포 대상에는 provider·unit·환경·origin이 필요합니다.");
      if (value.reference === "pull-request") issues.push("배포 대상은 main 또는 정확한 commit이어야 합니다.");
      if (value.artifactDigest !== undefined && !hash(value.artifactDigest)) issues.push("대상 아티팩트 digest가 올바르지 않습니다.");
    }
  } else issues.push("지원하지 않는 검증 대상 종류입니다.");
  return issues;
}

export function assessWorkspaceEvidence(evidence: WorkspaceEvidence, target: WorkspaceEvidenceTarget, now = new Date()): WorkspaceEvidenceAssessment {
  const invalid = workspaceTypedEvidenceIssues(evidence, now);
  const occurredAt = evidence.kind === "ci" ? evidence.completedAt : evidence.kind === "document" ? evidence.verifiedAt : evidence.smoke?.testedAt || evidence.appliedAt;
  const occurred = workspaceEvidenceInstant(occurredAt);
  const ageHours = occurred === null ? null : (now.getTime() - occurred) / 3_600_000;
  const historicalSuccess = invalid.length === 0 && (evidence.kind === "ci" ? evidence.conclusion === "success" : evidence.kind === "document" ? true
    : evidence.phase === "applied" && sameSha(evidence.artifactSha, evidence.appliedSha) && evidence.smoke.status === "passed" && evidence.originReadiness.status === "ready"
      && sameSha(evidence.appliedSha, evidence.smoke.sha) && sameSha(evidence.appliedSha, evidence.originReadiness.sha)
      && evidence.environment === evidence.smoke.environment && evidence.environment === evidence.originReadiness.environment
      && evidence.scope === evidence.smoke.scope && normalizeWorkspaceOrigin(evidence.origin) === normalizeWorkspaceOrigin(evidence.smoke.origin)
      && normalizeWorkspaceOrigin(evidence.origin) === normalizeWorkspaceOrigin(evidence.originReadiness.origin));
  const result = (status: WorkspaceEvidenceAssessment["status"], reasons: string[]): WorkspaceEvidenceAssessment => ({ status, current: status === "current", historicalSuccess, reasons, occurredAt, ageHours });
  if (invalid.length) return result("incomplete", invalid);
  const targetIssues = workspaceEvidenceTargetIssues(target, now);
  if (targetIssues.length) return result("incomplete", targetIssues);
  if (evidence.kind !== target.kind) return result("mismatch", ["증거 종류와 검증 대상이 다릅니다."]);
  const mismatch: string[] = [];
  if (!workspaceEvidenceText(target.scope, 500) || evidence.scope !== target.scope) mismatch.push("증거의 검증 범위가 요청 범위와 일치하지 않습니다.");
  if (evidence.kind !== "document" && target.kind !== "document") {
    if (normalizeWorkspaceRepository(evidence.repository) !== normalizeWorkspaceRepository(target.repository)) mismatch.push("증거의 저장소가 다릅니다.");
    const sha = evidence.kind === "ci" ? evidence.testedSha : evidence.appliedSha;
    if (!sameSha(sha, target.targetSha)) mismatch.push("실제 검증·적용 SHA가 대상 SHA와 다릅니다.");
    if (target.reference !== "commit") {
      const reasons = workspaceMainObservationIssues(target.main, now, target.mainMaxAgeHours);
      if (reasons.length) return result("stale", reasons);
      const main = target.main!;
      if (normalizeWorkspaceRepository(main.repository) !== normalizeWorkspaceRepository(target.repository)) mismatch.push("main 관측의 저장소가 다릅니다.");
      const base = target.kind === "ci" && target.reference === "pull-request" ? target.baseSha ?? "" : target.targetSha;
      if (!sameSha(main.sha, base)) mismatch.push("현재 관측한 main SHA와 검증 기준이 다릅니다.");
    }
  }
  if (evidence.kind === "ci" && target.kind === "ci") {
    if (target.reference === "pull-request" && (!sameSha(evidence.headSha, target.headSha ?? "") || !sameSha(evidence.baseSha, target.baseSha ?? ""))) mismatch.push("PR의 head·base SHA가 검증 대상과 다릅니다.");
    for (const key of ["event", "workflow", "job", "shard", "runId", "runAttempt"] as const) if (target[key] !== undefined && evidence[key] !== target[key]) mismatch.push(`CI ${key}가 요청한 실행·범위와 다릅니다.`);
  } else if (evidence.kind === "deployment" && target.kind === "deployment") {
    if (evidence.provider !== target.provider || evidence.unit !== target.unit || (target.artifactDigest !== undefined && hash(evidence.artifactDigest) !== hash(target.artifactDigest))) mismatch.push("배포 공급자·서비스 단위·아티팩트 digest가 대상과 다릅니다.");
    if (evidence.environment !== target.environment || !normalizeWorkspaceOrigin(target.origin) || normalizeWorkspaceOrigin(evidence.origin) !== normalizeWorkspaceOrigin(target.origin)) mismatch.push("실제 배포 환경·origin이 대상과 다릅니다.");
    if (evidence.phase !== "applied") return result("incomplete", ["이미지 빌드만으로 실제 배포 적용을 확인할 수 없습니다.", ...mismatch]);
    if (!sameSha(evidence.artifactSha, evidence.appliedSha)) mismatch.push("빌드한 아티팩트와 실제 적용 SHA가 다릅니다.");
    if (evidence.originReadiness.status !== "ready") return result(evidence.originReadiness.status === "not-ready" ? "failed" : "incomplete", ["적용한 origin의 readiness 증거가 필요합니다.", ...mismatch]);
    if (!sameSha(evidence.originReadiness.sha, target.targetSha) || evidence.originReadiness.environment !== target.environment || normalizeWorkspaceOrigin(evidence.originReadiness.origin) !== normalizeWorkspaceOrigin(target.origin)) mismatch.push("origin readiness의 SHA·환경·origin이 대상과 다릅니다.");
    if (evidence.smoke.status !== "passed") return result(evidence.smoke.status === "failed" ? "failed" : "incomplete", ["실제 적용 환경의 통과한 스모크 증거가 필요합니다.", ...mismatch]);
    if (!sameSha(evidence.smoke.sha, target.targetSha) || evidence.smoke.environment !== target.environment || evidence.smoke.scope !== target.scope || normalizeWorkspaceOrigin(evidence.smoke.origin) !== normalizeWorkspaceOrigin(target.origin)) mismatch.push("스모크의 SHA·환경·origin·범위가 대상과 다릅니다.");
  } else if (evidence.kind === "document" && target.kind === "document") {
    if (evidence.documentId !== target.documentId || evidence.version !== target.version || !hash(target.contentHash) || hash(evidence.contentHash) !== hash(target.contentHash)) mismatch.push("문서 식별자·버전·내용 해시가 현재 검토본과 다릅니다.");
  }
  if (mismatch.length) return result("mismatch", mismatch);
  if (evidence.availability !== "available") return result("unavailable", ["증거가 만료됐거나 현재 접근할 수 없습니다. 과거 결과만 보존합니다."]);
  if (!historicalSuccess) return result(evidence.kind === "ci" && evidence.conclusion === "pending" ? "incomplete" : "failed", ["현재 대상에 대한 성공 증거가 아닙니다."]);
  const maximumAge = hours(target.maxAgeHours, evidence.kind === "document" ? 30 * 24 : WORKSPACE_EVIDENCE_FRESHNESS_HOURS);
  const readinessAge = evidence.kind === "deployment" ? (now.getTime() - workspaceEvidenceInstant(evidence.originReadiness.observedAt)!) / 3_600_000 : 0;
  if (ageHours === null || ageHours > maximumAge || readinessAge > maximumAge) return result("stale", ["실제 검증·origin·스모크 시각이 재확인 주기를 넘었습니다. 가져오기·수집 시각은 최신성을 갱신하지 않습니다."]);
  return result("current", ["관측한 대상 SHA·버전과 검증 범위가 일치합니다. 실행 승인을 뜻하지 않습니다."]);
}

/** 이미 수집된 같은 범위의 새 실행이 옛 녹색 결과에 가려지지 않도록 한다. 원격의 최신 실행을 조회하는 함수는 아니다. */
export function assessWorkspaceEvidenceSet(evidences: readonly WorkspaceEvidence[], target: WorkspaceEvidenceTarget, now = new Date()): WorkspaceEvidenceSetAssessment {
  const empty = (reasons: string[]): WorkspaceEvidenceSetAssessment => ({ status: "incomplete", current: false, historicalSuccess: false, reasons, occurredAt: "", ageHours: null, evidenceId: null, supersededEvidenceIds: [] });
  const targetIssues = workspaceEvidenceTargetIssues(target, now);
  if (targetIssues.length) return empty(targetIssues);
  const candidates = evidences.filter(evidence => {
    if (evidence.kind !== target.kind || evidence.scope !== target.scope) return false;
    if (evidence.kind === "ci" && target.kind === "ci") {
      return normalizeWorkspaceRepository(evidence.repository) === normalizeWorkspaceRepository(target.repository)
        && sameSha(evidence.testedSha, target.targetSha)
        && (["event", "workflow", "job", "shard"] as const).every(key => target[key] === undefined || target[key] === evidence[key])
        && (target.reference !== "commit" || ((target.runId === undefined || target.runId === evidence.runId) && (target.runAttempt === undefined || target.runAttempt === evidence.runAttempt)));
    }
    if (evidence.kind === "deployment" && target.kind === "deployment") {
      return normalizeWorkspaceRepository(evidence.repository) === normalizeWorkspaceRepository(target.repository)
        && (sameSha(evidence.appliedSha, target.targetSha) || sameSha(evidence.artifactSha, target.targetSha))
        && evidence.provider === target.provider && evidence.unit === target.unit && evidence.environment === target.environment
        && normalizeWorkspaceOrigin(evidence.origin) === normalizeWorkspaceOrigin(target.origin);
    }
    return evidence.kind === "document" && target.kind === "document" && evidence.documentId === target.documentId;
  });
  if (!candidates.length) return empty(["지정한 대상·범위에 연결된 증거가 없습니다."]);
  let eligible = candidates;
  const selectionTime = (evidence: WorkspaceEvidence): number => {
    if (evidence.kind === "ci") return workspaceEvidenceInstant(evidence.completedAt) ?? workspaceEvidenceInstant(evidence.startedAt) ?? workspaceEvidenceInstant(evidence.collectedAt) ?? 0;
    return workspaceEvidenceInstant(evidence.kind === "deployment" ? evidence.appliedAt : evidence.verifiedAt) ?? workspaceEvidenceInstant(evidence.collectedAt) ?? 0;
  };
  if (target.kind === "ci") {
    const ci = candidates.filter((evidence): evidence is WorkspaceCiEvidence => evidence.kind === "ci");
    const scopes = new Set(ci.map(evidence => JSON.stringify([evidence.event, evidence.workflow, evidence.job, evidence.shard])));
    if (scopes.size > 1) return empty(["여러 CI workflow·event·job·shard가 있습니다. 집계할 단일 검증 범위를 지정하세요."]);
    const attempts = new Map<string, number>();
    for (const evidence of ci) attempts.set(evidence.runId, Math.max(attempts.get(evidence.runId) ?? 0, evidence.runAttempt));
    const latestAttempts = ci.filter(evidence => evidence.runAttempt === attempts.get(evidence.runId));
    for (const runId of attempts.keys()) {
      const terminal = new Set(latestAttempts.filter(evidence => evidence.runId === runId && !["pending", "unknown"].includes(evidence.conclusion)).map(evidence => evidence.conclusion));
      if (terminal.size > 1) return empty(["같은 CI 실행 회차의 결과가 서로 상충합니다. 원본 실행을 다시 확인하세요."]);
    }
    // 동일 회차의 진행 중 스냅샷은 이후의 완료 결과를 덮어쓰지 않는다.
    eligible = latestAttempts.filter(evidence => !["pending", "unknown"].includes(evidence.conclusion)
      || !latestAttempts.some(other => other.runId === evidence.runId && !["pending", "unknown"].includes(other.conclusion)));
  }
  const sorted = [...eligible].sort((left, right) => selectionTime(right) - selectionTime(left)
    || (workspaceEvidenceInstant(right.collectedAt) ?? 0) - (workspaceEvidenceInstant(left.collectedAt) ?? 0));
  const selected = sorted[0];
  if (!selected) return empty(["현재 검증에 사용할 실행 기록이 없습니다."]);
  const assessment = assessWorkspaceEvidence(selected, target, now);
  return { ...assessment, evidenceId: selected.id, supersededEvidenceIds: candidates.filter(evidence => evidence.id !== selected.id).map(evidence => evidence.id) };
}
