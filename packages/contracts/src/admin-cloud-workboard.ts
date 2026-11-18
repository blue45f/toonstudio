import { z } from "zod";

/** 업무 단계는 기존 CI 보드의 검사 결과 상태와 독립적으로 유지한다. */
export const STAGES = ["미확인", "진행 중", "검토 필요", "승인 대기", "검증 완료", "main 머지 완료"] as const;
export const ACTIONS = ["조사·검토", "코드 수정", "main 병합", "외부 배포", "계정·인프라 변경", "운영 데이터 변경", "완료 이력"] as const;
export const SIGNALS = ["미확인", "감지", "미감지"] as const;
export const CI = ["미확인", "대기·실행 중", "통과", "실패", "일부 실패", "취소"] as const;
export const OPS = ["미확인", "승인 대기", "진행 중", "성공 이력", "현재 확인", "실패", "해당 없음"] as const;
export const MAIN = ["미확인", "미포함 확인", "병합 이력 포함", "현재 내용 확인"] as const;
export const PROJECTS = ["ToonStudio"] as const;
/** 두 칸 들여쓰기 JSON 내보내기와 가져오기에 공통으로 적용하는 UTF-8 바이트 상한. */
export const CLOUD_WORKBOARD_JSON_LIMIT = 1_500_000;
export const RISK_LABELS = { conflict: "충돌", regression: "회귀", ciFailure: "CI 실패", deployBlock: "배포 차단" } as const;

const CLOCK_SKEW_MS = 5 * 60 * 1000;
const FRESHNESS_MS = 24 * 60 * 60 * 1000;
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
}).strict();

export type Task = z.infer<typeof taskFieldsSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;

export const taskSchema = taskFieldsSchema.superRefine((task, context) => {
  const error = taskError(task);
  if (error) context.addIssue({ code: "custom", message: error });
});

export const auditSchema = z.object({
  id: requiredShort,
  at: date,
  taskId: requiredShort,
  title: short,
  detail: text,
}).strict();

export const boardSchema = z.object({
  schemaVersion: z.literal(1),
  snapshotAt: date,
  tasks: z.array(taskSchema).max(400),
  audit: z.array(auditSchema).max(200),
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

export function taskError(task: Task): string | null {
  if (new Set(task.evidence.map((evidence) => evidence.id)).size !== task.evidence.length) {
    return "한 작업 안에 중복 증빙 ID를 기록할 수 없습니다.";
  }
  if (restricted(task) && task.stage !== "승인 대기") return "실행이 필요한 작업은 승인 대기 상태로 관리합니다.";
  const observed = task.evidence.filter(hasObservedEvidence);
  if (task.verifiedAt && (!observed.length
    || Date.parse(task.verifiedAt) > Math.max(...observed.map((evidence) => Date.parse(evidence.observedAt))))) {
    return "최종 확인 시각은 확인 내용을 기록한 증빙의 확인 시각 이하여야 합니다.";
  }
  if (task.stage === "검증 완료" && (!task.verifiedAt || !observed.length)) {
    return "검증 완료에는 확인 시각과 근거가 필요합니다.";
  }
  if (task.stage === "main 머지 완료" && (task.action !== "완료 이력" || task.prState !== "병합됨"
    || !task.pr || !task.mergedAt || !task.verifiedAt || !hasLinkedEvidence(task, task.pr)
    || !observed.some((evidence) => safeUrl(evidence.url) === safeUrl(task.pr)
      && Date.parse(evidence.observedAt) >= Date.parse(task.mergedAt)))) {
    return "main 머지 완료는 병합 이후 확인한 PR 증빙과 병합 시각이 있는 완료 이력에만 기록할 수 있습니다.";
  }
  if (["성공 이력", "현재 확인"].includes(task.deployStatus)
    && (!task.deploySha || !task.deployEnvironment.trim() || !task.verifiedAt
      || !hasLinkedEvidence(task, task.deployLink, task.deploySha))) {
    return "배포 확인에는 대상 SHA·환경·확인 시각과 같은 링크 및 SHA의 증빙이 필요합니다.";
  }
  for (const key of ["migration", "account", "infra"] as const) {
    if (["성공 이력", "현재 확인"].includes(task[`${key}Status`])
      && (!task[`${key}Note`].trim() || !task.verifiedAt
        || !observed.some((evidence) => ["운영 기록", "사용자 기록"].includes(evidence.kind) && safeUrl(evidence.url)))) {
      return "운영 상태 확인에는 범위 메모·확인 시각·운영 근거 링크가 필요합니다.";
    }
  }
  if (task.ciStatus === "통과" && (!task.ciSha || !task.verifiedAt || !hasLinkedEvidence(task, task.ciLink, task.ciSha))) {
    return "CI 통과에는 대상 전체 SHA·확인 시각과 같은 링크 및 SHA의 결과 증빙이 필요합니다.";
  }
  if (task.mainInclusion !== "미확인"
    && (!task.mainSha || !task.verifiedAt || !hasLinkedEvidence(task, task.comparisonLink, task.mainSha))) {
    return "main 포함 판정에는 main SHA·확인 시각과 같은 링크 및 SHA의 비교 증빙이 필요합니다.";
  }
  return null;
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
  };
}

export function freshness(task: Task, now = Date.now()): "미확인" | "재확인 필요" | "24시간 내 확인" {
  const verifiedAt = Date.parse(task.verifiedAt);
  const observed = task.evidence.filter(hasObservedEvidence);
  if (!Number.isFinite(now) || !Number.isFinite(verifiedAt) || !observed.length
    || verifiedAt > Math.max(...observed.map((evidence) => Date.parse(evidence.observedAt)))) return "미확인";
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
  if (task.changeKey) {
    const related = peers.filter((other) => other.changeKey === task.changeKey);
    if (related.length) notes.push(`같은 변경 그룹 ${related.map((other) => other.id).join(", ")} · 내용 비교 필요`);
  }
  const pullRequest = canonicalUrl(task.pr);
  if (pullRequest && others.some((other) => canonicalUrl(other.pr) === pullRequest)) notes.push("동일 PR을 참조하는 작업 있음");
  if (task.deploySha && task.deployEnvironment && peers.some((other) => sameSha(other.deploySha, task.deploySha)
    && other.deployEnvironment === task.deployEnvironment && ["성공 이력", "현재 확인"].includes(other.deployStatus))) {
    notes.push("같은 환경·버전의 배포 이력 있음");
  }
  if (["병합 이력 포함", "현재 내용 확인"].includes(task.mainInclusion)) {
    notes.push(task.mainInclusion === "병합 이력 포함" ? "main 병합 이력 있음 · 재작업 전 확인" : "현재 main 내용 확인 기록 있음");
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
