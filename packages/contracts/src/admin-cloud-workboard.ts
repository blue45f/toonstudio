import { z } from "zod";

/** 업무 단계는 기존 CI 보드의 검사 결과 상태와 독립적으로 유지한다. */
export const STAGES = ["미확인", "진행 중", "검토 필요", "승인 대기", "검증 완료", "main 머지 완료"] as const;
export const ACTIONS = ["조사·검토", "코드 수정", "main 병합", "외부 배포", "계정·인프라 변경", "운영 데이터 변경", "브랜치 삭제", "변경 사항 폐기", "완료 이력"] as const;
export const SIGNALS = ["미확인", "감지", "미감지"] as const;
export const CI = ["미확인", "대기·실행 중", "통과", "실패", "일부 실패", "취소", "건너뜀"] as const;
export const OPS = ["미확인", "승인 대기", "진행 중", "성공 이력", "현재 확인", "실패", "해당 없음"] as const;
export const MAIN = ["미확인", "미포함 확인", "병합 이력 포함", "현재 내용 확인"] as const;
export const PROJECTS = ["ToonStudio"] as const;
/** 두 칸 들여쓰기 JSON 내보내기와 가져오기에 공통으로 적용하는 UTF-8 바이트 상한. */
export const CLOUD_WORKBOARD_JSON_LIMIT = 1_500_000;
export const RISK_LABELS = { conflict: "충돌", regression: "회귀", ciFailure: "CI 실패", deployBlock: "배포 차단" } as const;

const CLOCK_SKEW_MS = 5 * 60 * 1000;
export const EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const FRESHNESS_MS = EVIDENCE_MAX_AGE_MS;
const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const text = z.string().max(6000);
const short = z.string().max(300);
const requiredShort = short.refine((value) => value.trim().length > 0, "빈 값은 사용할 수 없습니다.");
const isoDate = z.iso.datetime({ offset: true }).max(40).refine(
  (value) => Date.parse(value) <= Date.now() + CLOCK_SKEW_MS,
  "유효한 과거 확인 시각을 입력해 주세요.",
);
const date = z.union([z.literal(""), isoDate]);
const url = z.string().max(2000).refine(
  (value) => value === "" || safeUrl(value) !== null,
  "https 링크만 입력해 주세요. 사용자 정보가 포함된 URL은 저장할 수 없습니다.",
);
const sha = z.string().max(40).refine(
  (value) => value === "" || SHA_PATTERN.test(value),
  "커밋은 전체 40자리 SHA를 입력해 주세요.",
);
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const evidenceSchema = z.object({
  id: requiredShort,
  title: requiredShort,
  url,
  kind: z.enum(["GitHub", "로컬 조사", "운영 기록", "사용자 기록", "과거 대화"]),
  summary: text,
  observedAt: date,
  occurredAt: date,
  subjectSha: sha,
}).strict().superRefine((evidence, context) => {
  if (evidence.observedAt && evidence.occurredAt
    && Date.parse(evidence.occurredAt) > Date.parse(evidence.observedAt) + CLOCK_SKEW_MS) {
    context.addIssue({ code: "custom", path: ["occurredAt"], message: "사건 이후에 확인한 증빙을 기록해 주세요." });
  }
});

export const CHECK_PHASES = ["pre", "post", "deploy", "migration", "cleanup"] as const;
export const CHECK_STATES = ["미확인", "통과", "실패", "해당 없음"] as const;
export const PHASE_LABELS = {
  pre: "병합 전 테스트", post: "병합 후 테스트", deploy: "배포 검증",
  migration: "마이그레이션 검증", cleanup: "작업 사본·브랜치 정리",
} as const;
export type RiskKey = keyof typeof RISK_LABELS;
export type OpsKey = "deploy" | "migration" | "account" | "infra" | "cleanup";
const count = z.number().int().min(0).max(100000).nullable();
const riskEvidenceSchema = z.object({
  conflict: z.array(requiredShort).max(30).default([]),
  regression: z.array(requiredShort).max(30).default([]),
  ciFailure: z.array(requiredShort).max(30).default([]),
  deployBlock: z.array(requiredShort).max(30).default([]),
}).strict();
export const verificationCheckSchema = z.object({
  id: requiredShort, label: requiredShort, phase: z.enum(CHECK_PHASES), state: z.enum(CHECK_STATES),
  subjectSha: sha, environment: short, evidenceUrl: url, logUrl: url,
  observedAt: date, reason: text, required: z.boolean(),
}).strict();
export type VerificationCheck = z.infer<typeof verificationCheckSchema>;

const taskFieldsSchema = z.object({
  id: requiredShort,
  project: requiredShort,
  title: requiredShort,
  stage: z.enum(STAGES),
  action: z.enum(ACTIONS),
  priority: z.enum(["높음", "보통", "낮음"]),
  owner: short,
  assignment: text,
  scope: text,
  prerequisites: text,
  blockers: text,
  nextAction: text,
  repo: url,
  localPath: short,
  localBranch: short,
  remoteBranch: short,
  pr: url,
  prState: z.enum(["미확인", "열림", "닫힘", "병합됨"]),
  localSha: sha,
  remoteSha: sha,
  mainSha: sha,
  dirtyFiles: z.number().int().min(0).max(100000).nullable(),
  comparisonNote: text,
  comparisonLink: url,
  changeKey: short,
  mainInclusion: z.enum(MAIN),
  ciStatus: z.enum(CI),
  ciSha: sha,
  ciLink: url,
  ciNote: text,
  deployStatus: z.enum(OPS),
  deploySha: sha,
  deployId: short,
  deployEnvironment: short,
  deployLink: url,
  deployNote: text,
  migrationStatus: z.enum(OPS),
  migrationNote: text,
  accountStatus: z.enum(OPS),
  accountNote: text,
  infraStatus: z.enum(OPS),
  infraNote: text,
  risks: z.object({
    conflict: z.enum(SIGNALS),
    regression: z.enum(SIGNALS),
    ciFailure: z.enum(SIGNALS),
    deployBlock: z.enum(SIGNALS),
  }).strict(),
  riskNote: text,
  evidence: z.array(evidenceSchema).max(30),
  logLinks: z.array(z.object({ title: short, url }).strict()).max(20),
  verifiedAt: date,
  updatedAt: date,
  mergedAt: date,
  notes: text,
  // schemaVersion 1의 기존 기록과 Sites 내보내기를 빈 값·미확인 기본값으로 함께 읽는다.
  adminBoardUrl: url.default(""), sourcePageUrl: url.default(""),
  mergeSha: sha.default(""), baseBranch: short.default(""), prDraft: z.boolean().nullable().default(null),
  deployConfigKey: short.default(""), migrationTarget: short.default(""),
  migrationIds: z.array(requiredShort).max(100).default([]),
  cleanupStatus: z.enum(OPS).default("미확인"),
  worktreeCount: count.default(null), unmergedBranchCount: count.default(null), stashCount: count.default(null),
  preservationNote: text.default(""), preservationLink: url.default(""),
  verificationChecks: z.array(verificationCheckSchema).max(60).default([]),
  riskEvidenceIds: riskEvidenceSchema.default({ conflict: [], regression: [], ciFailure: [], deployBlock: [] }),
}).strict();

export type Task = z.infer<typeof taskFieldsSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;

export const taskSchema = taskFieldsSchema.superRefine((task, context) => {
  const error = taskRecordError(task);
  if (error) context.addIssue({ code: "custom", message: error });
});

export const auditSchema = z.object({
  id: requiredShort,
  at: date,
  taskId: requiredShort,
  title: short,
  detail: text,
}).strict();

/** Sites 등의 원본 이력은 서버 감사 기록으로 승격하지 않고 출처 기록으로 보존한다. */
export const sourceAuditSchema = auditSchema.extend({ taskId: short }).strict();

export const boardSchema = z.object({
  schemaVersion: z.literal(1),
  snapshotAt: date,
  tasks: z.array(taskSchema).max(400),
  audit: z.array(auditSchema).max(200),
  sourceHistory: z.array(sourceAuditSchema).max(200).optional(),
}).strict().superRefine((board, context) => {
  if (new TextEncoder().encode(JSON.stringify(board, null, 2)).byteLength > CLOUD_WORKBOARD_JSON_LIMIT) {
    context.addIssue({ code: "custom", message: "작업 보드 JSON 내보내기 크기는 1.5MB 이하여야 합니다." });
  }
  for (const field of ["tasks", "audit"] as const) {
    const ids = new Set<string>();
    board[field].forEach((item, index) => {
      if (ids.has(item.id)) {
        context.addIssue({
          code: "custom",
          path: [field, index, "id"],
          message: field === "tasks" ? "중복 작업 ID입니다." : "중복 변경 이력 ID입니다.",
        });
      }
      ids.add(item.id);
    });
  }
});

export type Board = z.infer<typeof boardSchema>;

export const cloudWorkboardSaveSchema = z.object({
  board: boardSchema,
  expectedRevision: revision,
  mutationId: z.uuid(),
  importHistory: z.boolean().optional(),
}).strict();

export const cloudWorkboardResponseSchema = z.object({
  board: boardSchema,
  revision,
  storedAt: isoDate.nullable(),
}).strict();

export type CloudWorkboardSave = z.infer<typeof cloudWorkboardSaveSchema>;
export type CloudWorkboardResponse = z.infer<typeof cloudWorkboardResponseSchema>;

export function emptyBoard(): Board {
  return { schemaVersion: 1, snapshotAt: "", tasks: [], audit: [] };
}

export function safeUrl(value: string): string | null {
  if (!/^https:\/\//i.test(value) || value.includes("\\")
    || Array.from(value).some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.href : null;
  } catch {
    return null;
  }
}

export function restricted(task: Task): boolean {
  return task.action !== "조사·검토" && task.action !== "완료 이력";
}

function hasObservedEvidence(evidence: Evidence): boolean {
  return evidence.kind !== "과거 대화" && !!evidence.summary.trim() && !!evidence.observedAt
    && Number.isFinite(Date.parse(evidence.observedAt));
}

function sameSha(left: string, right: string): boolean {
  return SHA_PATTERN.test(left) && SHA_PATTERN.test(right) && left.toLowerCase() === right.toLowerCase();
}

function linkedEvidence(task: Task, link: string, subjectSha?: string): Evidence[] {
  const normalized = safeUrl(link);
  return normalized === null ? [] : task.evidence.filter((evidence) => hasObservedEvidence(evidence)
    && safeUrl(evidence.url) === normalized
    && (subjectSha === undefined || sameSha(evidence.subjectSha, subjectSha)));
}

function hasLinkedEvidence(task: Task, link: string, subjectSha?: string): boolean {
  return linkedEvidence(task, link, subjectSha).length > 0;
}

/** 저장된 이력을 읽는 경계에서는 시간이 지났다는 이유로 전체 보드를 거부하지 않는다. */
function taskRecordError(task: Task): string | null {
  if (new Set(task.evidence.map((item) => item.id)).size !== task.evidence.length) {
    return "한 작업 안에 중복 증빙 ID를 기록할 수 없습니다.";
  }
  if (new Set(task.verificationChecks.map((item) => item.id)).size !== task.verificationChecks.length) {
    return "한 작업 안에 중복 검증 ID를 기록할 수 없습니다.";
  }
  if (restricted(task) && task.stage !== "승인 대기") return "실행이 필요한 작업은 승인 대기 상태로 관리합니다.";
  const observedTimes = [
    ...task.evidence.filter(hasObservedEvidence).map((item) => Date.parse(item.observedAt)),
    ...task.verificationChecks.filter((item) => item.state !== "미확인" && item.reason.trim() && item.evidenceUrl && item.observedAt)
      .map((item) => Date.parse(item.observedAt)),
  ];
  if (task.verifiedAt && (!observedTimes.length || Date.parse(task.verifiedAt) > Math.max(...observedTimes))) {
    return "최종 확인 시각은 확인 내용을 기록한 증빙의 확인 시각 이하여야 합니다.";
  }
  return null;
}

export function workingSha(task: Task): string {
  return task.remoteSha || task.localSha || task.mainSha;
}

export function recent(value: string, now = Date.now()): boolean {
  const at = Date.parse(value);
  return Number.isFinite(now) && Number.isFinite(at) && at <= now + CLOCK_SKEW_MS && at >= now - FRESHNESS_MS;
}

function currentLinkedEvidence(task: Task, link: string, subjectSha: string, now: number): boolean {
  return linkedEvidence(task, link, subjectSha).some((item) => recent(item.observedAt, now));
}

export function checkTargetSha(task: Task, check: Pick<VerificationCheck, "phase">): string {
  if (check.phase === "post") return task.mainSha;
  if (check.phase === "deploy") return task.deploySha;
  if (check.phase === "migration") return task.deploySha || task.mainSha;
  if (check.phase === "cleanup") return task.localSha || task.remoteSha || task.mainSha;
  return workingSha(task);
}

export function checkError(task: Task, check: VerificationCheck, now = Date.now()): string | null {
  if (check.state === "미확인") return null;
  if (!check.reason.trim() || !safeUrl(check.evidenceUrl) || !recent(check.observedAt, now)) {
    return "검증 결과와 해당 없음 판단에는 사유·근거 링크·24시간 내 확인 시각이 필요합니다.";
  }
  const target = checkTargetSha(task, check);
  if ((target || check.state !== "해당 없음") && !sameSha(target, check.subjectSha)) {
    return "검증 대상 전체 SHA가 해당 단계의 현재 대상 SHA와 일치해야 합니다.";
  }
  if (check.phase === "deploy" && (!task.deployEnvironment.trim() || check.environment !== task.deployEnvironment)) {
    return "배포 검증 환경이 배포 대상 환경과 일치해야 합니다.";
  }
  if (check.phase === "migration" && (!task.migrationTarget.trim() || check.environment !== task.migrationTarget)) {
    return "마이그레이션 검증 환경에 현재 DB 대상을 동일하게 기록해 주세요.";
  }
  return null;
}

export function currentCheckState(task: Task, check: VerificationCheck, now = Date.now()): VerificationCheck["state"] {
  return checkError(task, check, now) ? "미확인" : check.state;
}

export function currentRisk(task: Task, key: RiskKey, now = Date.now()): Task["risks"][RiskKey] {
  const recorded = task.risks[key];
  if (recorded === "미확인") return recorded;
  const target = key === "deployBlock" ? task.deploySha || workingSha(task) : workingSha(task);
  const ids = task.riskEvidenceIds[key];
  const confirmed = task.evidence.some((item) => ids.includes(item.id) && hasObservedEvidence(item)
    && safeUrl(item.url) && sameSha(item.subjectSha, target) && recent(item.observedAt, now));
  return confirmed ? recorded : "미확인";
}

export function effectiveCI(task: Task, now = Date.now()): Task["ciStatus"] {
  return matchingCI(task) && currentLinkedEvidence(task, task.ciLink, task.ciSha, now) ? task.ciStatus : "미확인";
}

function repoContainsLink(repo: string, link: string): boolean {
  const base = canonicalUrl(repo);
  const value = canonicalUrl(link);
  return !!base && !!value && value.startsWith(`${base}/`);
}

function comparisonProof(task: Task, now: number, current: boolean): boolean {
  const subject = task.mergeSha || task.remoteSha || task.localSha;
  if (!subject || !task.mainSha || !task.comparisonNote.trim() || !repoContainsLink(task.repo, task.comparisonLink)) return false;
  return linkedEvidence(task, task.comparisonLink, task.mainSha).some((item) => (!current || recent(item.observedAt, now))
    && (sameSha(subject, task.mainSha) || item.url.toLowerCase().includes(subject.toLowerCase())
      || item.summary.toLowerCase().includes(subject.toLowerCase())));
}

export function mergeProof(task: Task): boolean {
  if (!task.repo || !task.mergeSha || !task.mergedAt) return false;
  const prProof = task.baseBranch === "main" && task.prState === "병합됨" && repoContainsLink(task.repo, task.pr)
    && linkedEvidence(task, task.pr, task.mergeSha).some((item) => Date.parse(item.observedAt) >= Date.parse(task.mergedAt));
  const ancestryProof = ["병합 이력 포함", "현재 내용 확인"].includes(task.mainInclusion)
    && comparisonProof(task, Date.now(), false)
    && linkedEvidence(task, task.comparisonLink, task.mainSha).some((item) => Date.parse(item.observedAt) >= Date.parse(task.mergedAt));
  return prProof || ancestryProof;
}

export function effectiveMain(task: Task, now = Date.now()): Task["mainInclusion"] {
  if (task.mainInclusion === "미확인") return "미확인";
  if (task.mainInclusion === "병합 이력 포함") {
    return mergeProof(task) || comparisonProof(task, now, false) ? task.mainInclusion : "미확인";
  }
  return comparisonProof(task, now, true) ? task.mainInclusion : "미확인";
}

export function effectiveOps(task: Task, key: OpsKey, now = Date.now()): Task["deployStatus"] {
  const recorded = task[`${key}Status`];
  if (["미확인", "승인 대기", "성공 이력"].includes(recorded)) return recorded;
  const state = recorded === "해당 없음" ? "해당 없음" : recorded === "실패" ? "실패" : "통과";
  const passed = (phase: VerificationCheck["phase"]) => task.verificationChecks
    .some((check) => check.phase === phase && currentCheckState(task, check, now) === state);
  if (key === "deploy") {
    const scoped = task.deployConfigKey.trim() && task.deployEnvironment.trim() && SHA_PATTERN.test(task.deploySha);
    return scoped && passed("deploy") && (recorded === "해당 없음" || currentLinkedEvidence(task, task.deployLink, task.deploySha, now)) ? recorded : "미확인";
  }
  if (key === "migration") {
    return task.migrationTarget.trim() && SHA_PATTERN.test(checkTargetSha(task, { phase: "migration" }))
      && (recorded === "해당 없음" || task.migrationIds.length > 0) && passed("migration") ? recorded : "미확인";
  }
  if (key === "cleanup") {
    return task.preservationLink && SHA_PATTERN.test(checkTargetSha(task, { phase: "cleanup" }))
      && task.worktreeCount !== null && task.unmergedBranchCount !== null
      && task.stashCount !== null && passed("cleanup") ? recorded : "미확인";
  }
  return task[`${key}Note`].trim() && task.evidence.some((item) => ["운영 기록", "사용자 기록"].includes(item.kind)
    && hasObservedEvidence(item) && safeUrl(item.url) && recent(item.observedAt, now)) ? recorded : "미확인";
}

export function effectiveStage(task: Task, now = Date.now()): Task["stage"] {
  if (restricted(task)) return "승인 대기";
  if (task.stage === "main 머지 완료") return task.action === "완료 이력" && mergeProof(task) ? task.stage : "미확인";
  if (task.stage === "검증 완료") {
    const required = task.verificationChecks.filter((check) => check.required);
    if (!recent(task.verifiedAt, now) || !required.length
      || required.some((check) => !["통과", "해당 없음"].includes(currentCheckState(task, check, now)))) return "미확인";
  }
  return task.stage;
}

function claimChanged(task: Task, previous: Task | undefined, keys: (keyof Task)[]): boolean {
  return !previous || keys.some((key) => JSON.stringify(task[key]) !== JSON.stringify(previous[key]));
}

/** 변경된 주장만 재검증하므로 지난 증빙을 보존한 메모 편집과 멱등 재시도를 막지 않는다. */
export function taskError(task: Task, previous?: Task, now = Date.now()): string | null {
  const recordError = taskRecordError(task);
  if (recordError) return recordError;
  for (const check of task.verificationChecks) {
    const old = previous?.verificationChecks.find((item) => item.id === check.id);
    if (!old || JSON.stringify(old) !== JSON.stringify(check)
      || checkTargetSha(task, check) !== checkTargetSha(previous!, check)
      || ((check.phase === "deploy" || check.phase === "migration")
        && (task.deployEnvironment !== previous?.deployEnvironment || task.migrationTarget !== previous?.migrationTarget))) {
      const error = checkError(task, check, now);
      if (error) return `${check.label}: ${error}`;
    }
  }
  if (task.stage === "검증 완료" && claimChanged(task, previous, ["stage", "verifiedAt", "verificationChecks", "localSha", "remoteSha", "mainSha", "deploySha", "deployEnvironment", "migrationTarget"])
    && effectiveStage(task, now) !== "검증 완료") {
    return "검증 완료에는 24시간 내 확인 시각과 현재 대상에 대한 모든 필수 검증 통과 또는 적용 제외 사유가 필요합니다.";
  }
  if (task.stage === "main 머지 완료" && claimChanged(task, previous, ["stage", "action", "repo", "mergeSha", "pr", "prState", "baseBranch", "prDraft", "mergedAt", "evidence", "comparisonLink", "comparisonNote", "mainSha", "mainInclusion"])
    && (task.action !== "완료 이력" || !mergeProof(task))) {
    return "main 머지 완료에는 저장소·병합 SHA·병합 시각과 main 대상 PR의 동일 SHA 병합 증빙 또는 main 조상 관계 근거가 필요합니다. CI 결과는 별도로 기록합니다.";
  }
  if (task.ciStatus === "통과" && claimChanged(task, previous, ["ciStatus", "ciSha", "ciLink", "evidence", "localSha", "remoteSha", "mainSha"])
    && (effectiveCI(task, now) !== "통과" || !task.verifiedAt)) {
    return "CI 통과에는 현재 작업과 같은 전체 SHA·결과 링크·24시간 내 해당 SHA의 증빙과 확인 시각이 필요합니다.";
  }
  if (["성공 이력", "현재 확인"].includes(task.deployStatus)
    && claimChanged(task, previous, ["deployStatus", "deploySha", "deployEnvironment", "deployConfigKey", "deployLink", "evidence", "verifiedAt", "verificationChecks"])) {
    const current = task.deployStatus === "현재 확인";
    if (!task.deploySha || !task.deployEnvironment.trim() || !task.deployConfigKey.trim() || !task.verifiedAt
      || !hasLinkedEvidence(task, task.deployLink, task.deploySha)
      || (current && effectiveOps(task, "deploy", now) !== "현재 확인")) {
      return "배포 확인에는 같은 전체 SHA·환경·설정 식별값의 근거와 확인 시각이 필요합니다. 현재 확인에는 해당 대상의 최신 배포 검증도 필요합니다.";
    }
  }
  for (const key of ["migration", "account", "infra", "cleanup"] as const) {
    const keys: (keyof Task)[] = [`${key}Status`, key === "cleanup" ? "preservationNote" : `${key}Note`, "evidence", "verifiedAt"];
    if (key === "migration") keys.push("migrationTarget", "migrationIds", "verificationChecks", "deploySha", "mainSha");
    if (key === "cleanup") keys.push("worktreeCount", "unmergedBranchCount", "stashCount", "preservationLink", "verificationChecks", "localSha", "remoteSha", "mainSha");
    if (!["성공 이력", "현재 확인"].includes(task[`${key}Status`]) || !claimChanged(task, previous, keys)) continue;
    const note = key === "cleanup" ? task.preservationNote : task[`${key}Note`];
    const current = task[`${key}Status`] === "현재 확인";
    if (!note.trim() || !task.verifiedAt || !task.evidence.some((item) => ["운영 기록", "사용자 기록", "로컬 조사"].includes(item.kind)
      && hasObservedEvidence(item) && safeUrl(item.url) && (!current || recent(item.observedAt, now)))) {
      return "운영·정리 확인에는 범위 메모·확인 시각·운영 근거 링크가 필요합니다.";
    }
    if (key === "migration" && (!task.migrationTarget.trim() || !task.migrationIds.length
      || (current && effectiveOps(task, key, now) !== "현재 확인"))) {
      return "마이그레이션 확인에는 대상 DB·마이그레이션 식별자와 해당 대상 검증 결과가 필요합니다.";
    }
    if (key === "cleanup" && (!task.preservationLink || task.worktreeCount === null || task.unmergedBranchCount === null || task.stashCount === null
      || (current && effectiveOps(task, key, now) !== "현재 확인"))) {
      return "정리 확인에는 워킹트리·미병합 브랜치·stash 수와 보존 근거 및 해당 대상 검증 결과가 필요합니다.";
    }
  }
  if (task.mainInclusion !== "미확인" && claimChanged(task, previous, ["mainInclusion", "mainSha", "comparisonLink", "comparisonNote", "evidence", "mergeSha", "localSha", "remoteSha"])
    && (!task.verifiedAt || !comparisonProof(task, now, task.mainInclusion !== "병합 이력 포함"))) {
    return "main 포함 판정에는 main 전체 SHA·비교 설명·해당 변경을 명시한 비교 근거가 필요합니다. 현재 판정은 24시간 내 확인해야 합니다.";
  }
  for (const key of ["deploy", "migration", "account", "infra", "cleanup"] as const) {
    if (task[`${key}Status`] !== "해당 없음") continue;
    const keys: (keyof Task)[] = [`${key}Status`, "verificationChecks", "evidence", "verifiedAt", "localSha", "remoteSha", "mainSha", "deploySha", "deployEnvironment", "deployConfigKey", "migrationTarget", "worktreeCount", "unmergedBranchCount", "stashCount", "preservationLink", "accountNote", "infraNote"];
    if (claimChanged(task, previous, keys) && (!task.verifiedAt || effectiveOps(task, key, now) !== "해당 없음")) {
      return "운영·정리의 해당 없음 판단에는 대상 범위와 최신 근거·사유 및 확인 시각이 필요합니다.";
    }
  }
  for (const key of Object.keys(RISK_LABELS) as RiskKey[]) {
    if (task.risks[key] !== "미확인" && (!previous || task.risks[key] !== previous.risks[key]
      || JSON.stringify(task.riskEvidenceIds[key]) !== JSON.stringify(previous.riskEvidenceIds[key])
      || claimChanged(task, previous, ["localSha", "remoteSha", "mainSha", "deploySha", "evidence"])) && currentRisk(task, key, now) === "미확인") {
      return `${RISK_LABELS[key]} 판정에는 선택한 24시간 내 근거와 현재 대상 전체 SHA의 일치가 필요합니다. 이전 결과는 근거 이력으로 보존해 주세요.`;
    }
  }
  return null;
}

export function boardUpdateError(next: Board, previous: Board, now = Date.now()): string | null {
  const oldTasks = new Map(previous.tasks.map((task) => [task.id, task]));
  for (const task of next.tasks) {
    const old = oldTasks.get(task.id);
    const error = taskError(task, old, now);
    if (error) return `${task.title}: ${error}`;
  }
  return null;
}

export function blankCheck(phase: VerificationCheck["phase"] = "pre"): VerificationCheck {
  return {
    id: `C-${globalThis.crypto.randomUUID()}`, label: PHASE_LABELS[phase], phase, state: "미확인",
    subjectSha: "", environment: "", evidenceUrl: "", logUrl: "", observedAt: "", reason: "", required: true,
  };
}

export function blankTask(project = "ToonStudio"): Task {
  return {
    id: `W-${globalThis.crypto.randomUUID().toUpperCase()}`, project, title: "", stage: "미확인", action: "조사·검토", priority: "보통",
    owner: "", assignment: "", scope: "", prerequisites: "", blockers: "", nextAction: "",
    repo: "", localPath: "", localBranch: "", remoteBranch: "", pr: "", prState: "미확인",
    localSha: "", remoteSha: "", mainSha: "", dirtyFiles: null, comparisonNote: "", comparisonLink: "", changeKey: "", mainInclusion: "미확인",
    ciStatus: "미확인", ciSha: "", ciLink: "", ciNote: "",
    deployStatus: "미확인", deploySha: "", deployId: "", deployEnvironment: "", deployLink: "", deployNote: "",
    migrationStatus: "미확인", migrationNote: "", accountStatus: "미확인", accountNote: "", infraStatus: "미확인", infraNote: "",
    risks: { conflict: "미확인", regression: "미확인", ciFailure: "미확인", deployBlock: "미확인" }, riskNote: "",
    evidence: [], logLinks: [], verifiedAt: "", updatedAt: "", mergedAt: "", notes: "",
    adminBoardUrl: "", sourcePageUrl: "", mergeSha: "", baseBranch: "", prDraft: null, deployConfigKey: "",
    migrationTarget: "", migrationIds: [], cleanupStatus: "미확인", worktreeCount: null, unmergedBranchCount: null, stashCount: null,
    preservationNote: "", preservationLink: "", verificationChecks: [],
    riskEvidenceIds: { conflict: [], regression: [], ciFailure: [], deployBlock: [] },
  };
}

export function freshness(task: Task, now = Date.now()): "미확인" | "재확인 필요" | "24시간 내 확인" {
  const verifiedAt = Date.parse(task.verifiedAt);
  const observed = task.evidence.filter(hasObservedEvidence);
  const observedTimes = [...observed.map((item) => Date.parse(item.observedAt)),
    ...task.verificationChecks.filter((item) => item.state !== "미확인" && item.reason.trim() && item.evidenceUrl && item.observedAt)
      .map((item) => Date.parse(item.observedAt))];
  if (!Number.isFinite(now) || !Number.isFinite(verifiedAt) || !observedTimes.length
    || verifiedAt > Math.max(...observedTimes)) return "미확인";
  // 다른 근거를 새로 읽어도 이전 CI·배포·main 증빙의 확인 시각은 갱신되지 않는다.
  const confirmedTimes = [verifiedAt];
  const addLinkedTime = (link: string, subjectSha: string) => {
    confirmedTimes.push(Math.max(...linkedEvidence(task, link, subjectSha).map((evidence) => Date.parse(evidence.observedAt))));
  };
  if (task.ciStatus === "통과") addLinkedTime(task.ciLink, task.ciSha);
  if (task.mainInclusion !== "미확인") addLinkedTime(task.comparisonLink, task.mainSha);
  if (["성공 이력", "현재 확인"].includes(task.deployStatus)) addLinkedTime(task.deployLink, task.deploySha);
  if ([task.migrationStatus, task.accountStatus, task.infraStatus].some((status) => ["성공 이력", "현재 확인"].includes(status))) {
    confirmedTimes.push(Math.max(...observed.filter((evidence) => ["운영 기록", "사용자 기록"].includes(evidence.kind) && safeUrl(evidence.url))
      .map((evidence) => Date.parse(evidence.observedAt))));
  }
  const confirmedAt = Math.min(...confirmedTimes);
  if (!Number.isFinite(confirmedAt)) return "미확인";
  const age = now - confirmedAt;
  return age < 0 ? "미확인" : age > FRESHNESS_MS ? "재확인 필요" : "24시간 내 확인";
}

export function sourceComparison(task: Task): string {
  if (!task.localSha || !task.remoteSha) return "원격 대조 미확인";
  if (sameSha(task.localSha, task.remoteSha)) {
    return task.dirtyFiles === 0 ? "HEAD 일치" : task.dirtyFiles === null ? "HEAD 일치 · 작업 파일 미확인" : "HEAD 일치 · 로컬 변경 있음";
  }
  return "SHA 다름 · 내용 대조 필요";
}

export function matchingCI(task: Task): boolean {
  return sameSha(task.remoteSha || task.localSha || task.mainSha, task.ciSha);
}

export function canonicalUrl(value: string): string {
  const valid = safeUrl(value);
  if (!valid) return "";
  const parsed = new URL(valid);
  parsed.search = "";
  parsed.hash = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "").replace(/\.git$/i, "");
  if (parsed.hostname === "github.com") parsed.pathname = parsed.pathname.toLowerCase();
  return parsed.toString().replace(/\/$/, "");
}

export function duplicateNotes(task: Task, tasks: Task[]): string[] {
  const notes: string[] = [];
  const others = tasks.filter((other) => other.id !== task.id);
  const repository = canonicalUrl(task.repo);
  const peers = repository ? others.filter((other) => canonicalUrl(other.repo) === repository) : [];
  const sameGroup = (other: Task) => !!task.changeKey && other.changeKey === task.changeKey;
  const sameHead = (other: Task) => sameSha(task.remoteSha || task.localSha, other.remoteSha || other.localSha);
  const open = peers.filter((other) => other.prState === "열림" && other.pr && (sameGroup(other) || sameHead(other)));
  if (open.length) notes.push(`같은 변경의 열린 PR 후보 ${open.map((other) => other.id).join(", ")} · 기존 PR 확인`);
  const related = peers.filter(sameGroup);
  if (related.length && !open.length) notes.push(`같은 변경 그룹 ${related.map((other) => other.id).join(", ")} · 내용 비교 필요`);
  const pullRequest = canonicalUrl(task.pr);
  if (pullRequest && others.some((other) => canonicalUrl(other.pr) === pullRequest)) notes.push("동일 PR을 참조하는 작업 있음");
  const deployed = peers.filter((other) => sameSha(other.deploySha, task.deploySha)
    && other.deployEnvironment === task.deployEnvironment && ["성공 이력", "현재 확인"].includes(other.deployStatus));
  if (task.deploySha && task.deployEnvironment && task.deployConfigKey.trim()
    && deployed.some((other) => other.deployConfigKey === task.deployConfigKey)) {
    const proven = deployed.some((other) => other.deployConfigKey === task.deployConfigKey
      && hasLinkedEvidence(other, other.deployLink, other.deploySha));
    notes.push(proven ? "같은 저장소·SHA·환경·설정의 배포 이력 있음"
      : "같은 저장소·SHA·환경·설정의 배포 기록 후보 · 근거 재확인");
  } else if (task.deploySha && task.deployEnvironment
    && deployed.some((other) => !other.deployConfigKey.trim() || !task.deployConfigKey.trim())) {
    notes.push("같은 SHA·환경 기록 · 설정 식별값 미확인으로 배포 중복 판정 보류");
  }
  if (["병합 이력 포함", "현재 내용 확인"].includes(task.mainInclusion)) {
    const confirmed = effectiveMain(task);
    notes.push(confirmed === "병합 이력 포함" ? "main 병합 이력 있음 · 현재 포함 여부 재확인"
      : confirmed === "현재 내용 확인" ? "현재 main 내용 확인 기록 있음 · 증빙 시각 확인"
      : "원본 main 포함 기록 · 근거 재확인");
  }
  return notes;
}

export function formatTime(value: string): string {
  if (!value) return "미확인";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date(value)) + " KST";
  } catch {
    return "미확인";
  }
}

export function stampISO(local: string): string {
  if (!local) return "";
  const withSeconds = local.length === 16 ? `${local}:00` : local;
  const value = `${withSeconds}+09:00`;
  if (!z.iso.datetime({ offset: true }).safeParse(value).success) throw new RangeError("시각 형식을 확인해 주세요.");
  return new Date(value).toISOString();
}

export function inputTime(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp + 9 * 60 * 60 * 1000).toISOString().slice(0, 16) : "";
}

export function stageTone(stage: string): string {
  const tones: Record<string, string> = { "미확인": "gray", "진행 중": "blue", "검토 필요": "amber", "승인 대기": "purple", "검증 완료": "teal", "main 머지 완료": "green" };
  return tones[stage] || "gray";
}

export function olderMain(task: Task, tasks: Task[]): boolean {
  const repository = canonicalUrl(task.repo);
  if (!task.mainSha || !repository) return false;
  const refs = tasks.filter((other) => canonicalUrl(other.repo) === repository)
    .flatMap((other) => other.evidence.filter((evidence) => evidence.kind === "GitHub"
      && evidence.title.includes("원격 main") && SHA_PATTERN.test(evidence.subjectSha) && hasObservedEvidence(evidence))
      .map((evidence) => ({ sha: evidence.subjectSha, at: Date.parse(evidence.observedAt) })))
    .sort((left, right) => right.at - left.at);
  const latest = refs[0];
  if (!latest || refs.some((ref) => ref.at === latest.at && !sameSha(ref.sha, latest.sha))) return false;
  return !sameSha(latest.sha, task.mainSha);
}
