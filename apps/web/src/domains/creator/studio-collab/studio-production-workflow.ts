/**
 * 제작 흐름 — 순수 상태 전이 (2026-10-25, 3단계 협업 우위).
 *
 * 에피소드 → 공정 → 버전 체인과 활동 로그를 한 모듈에서 다룬다.
 * DB 테이블·마이그레이션 신설 없이, 화면 상태로 동작한다. 서버 영속화는
 * 기존 제작 워크스페이스 API에 얹는 후속 과제이며 이 변경에서는 주장하지 않는다.
 * 역할: PD(일정·공정 조망), 검수자(검수 큐), 작가(인계) — 직군별 화면은
 * StudioProductionWorkflow가 이 전이 함수들 위에 렌더링한다.
 */

export type ProductionStage = "outline" | "sketch" | "color" | "review" | "ready";

export const PRODUCTION_STAGES: ReadonlyArray<{ id: ProductionStage; label: string }> = [
  { id: "outline", label: "기획·콘티" },
  { id: "sketch", label: "스케치·선화" },
  { id: "color", label: "채색" },
  { id: "review", label: "검수" },
  { id: "ready", label: "게시 준비" },
];

export function productionStageLabel(stage: ProductionStage): string {
  return PRODUCTION_STAGES.find((candidate) => candidate.id === stage)?.label ?? stage;
}

export type ProductionRole = "pd" | "reviewer" | "artist";

export const PRODUCTION_ROLE_LABELS: Readonly<Record<ProductionRole, string>> = {
  pd: "PD",
  reviewer: "검수자",
  artist: "작가",
};

export interface ProductionEpisode {
  readonly id: string;
  readonly episodeNo: number;
  readonly title: string;
  readonly stage: ProductionStage;
  /** 현재 공을 쥔 직군. 인계할 때마다 바뀐다. */
  readonly assigneeRole: ProductionRole;
}

export interface ProductionVersion {
  readonly id: string;
  readonly episodeId: string;
  readonly stage: ProductionStage;
  readonly revision: number;
  readonly authorRole: ProductionRole;
  readonly note: string;
  readonly createdAt: string;
}

export type ReviewDecision = "approved" | "changes-requested";
export type ReviewQueueStatus = "pending" | "approved" | "changes-requested" | "resubmitted";

export interface ReviewQueueItem {
  readonly id: string;
  readonly episodeId: string;
  readonly versionId: string;
  readonly status: ReviewQueueStatus;
  readonly reviewerNote: string;
}

export interface ActivityLogEntry {
  readonly id: string;
  readonly at: string;
  readonly actorRole: ProductionRole;
  readonly action: string;
  readonly detail: string;
}

export interface ProductionWorkflowState {
  readonly episodes: readonly ProductionEpisode[];
  readonly versions: readonly ProductionVersion[];
  readonly queue: readonly ReviewQueueItem[];
  readonly log: readonly ActivityLogEntry[];
}

export const EMPTY_PRODUCTION_WORKFLOW: ProductionWorkflowState = {
  episodes: [],
  versions: [],
  queue: [],
  log: [],
};

let workflowIdCounter = 0;
function nextWorkflowId(prefix: string): string {
  workflowIdCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${workflowIdCounter}`;
}

function logEntry(
  actorRole: ProductionRole,
  action: string,
  detail: string,
): ActivityLogEntry {
  return { id: nextWorkflowId("log"), at: new Date().toISOString(), actorRole, action, detail };
}

function withLog(
  state: ProductionWorkflowState,
  actorRole: ProductionRole,
  action: string,
  detail: string,
): ProductionWorkflowState {
  return { ...state, log: [logEntry(actorRole, action, detail), ...state.log].slice(0, 200) };
}

export type WorkflowResult = { ok: true; state: ProductionWorkflowState } | { ok: false; error: string };

function episodeOf(state: ProductionWorkflowState, episodeId: string): ProductionEpisode | undefined {
  return state.episodes.find((episode) => episode.id === episodeId);
}

export function addProductionEpisode(
  state: ProductionWorkflowState,
  input: { episodeNo: number; title: string },
): WorkflowResult {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "회차 제목을 입력해 주세요." };
  if (!Number.isSafeInteger(input.episodeNo) || input.episodeNo < 1) {
    return { ok: false, error: "회차 번호는 1 이상의 정수여야 합니다." };
  }
  if (state.episodes.some((episode) => episode.episodeNo === input.episodeNo)) {
    return { ok: false, error: "이미 같은 회차 번호가 있습니다." };
  }
  const episode: ProductionEpisode = {
    id: nextWorkflowId("ep"), episodeNo: input.episodeNo, title, stage: "outline", assigneeRole: "artist",
  };
  return { ok: true, state: withLog({ ...state, episodes: [...state.episodes, episode] }, "pd", "회차 추가", `${input.episodeNo}화 ${title}`) };
}

export function addProductionVersion(
  state: ProductionWorkflowState,
  input: { episodeId: string; stage: ProductionStage; authorRole: ProductionRole; note: string },
): WorkflowResult {
  const episode = episodeOf(state, input.episodeId);
  if (!episode) return { ok: false, error: "회차를 찾을 수 없습니다." };
  const revision = state.versions.filter((version) => version.episodeId === input.episodeId).length + 1;
  const version: ProductionVersion = {
    id: nextWorkflowId("ver"), episodeId: input.episodeId, stage: input.stage, revision,
    authorRole: input.authorRole, note: input.note.trim(), createdAt: new Date().toISOString(),
  };
  const next: ProductionWorkflowState = {
    ...state,
    versions: [...state.versions, version],
    episodes: state.episodes.map((candidate) =>
      candidate.id === input.episodeId ? { ...candidate, stage: input.stage } : candidate),
  };
  return { ok: true, state: withLog(next, input.authorRole, "버전 등록", `${episode.episodeNo}화 r${revision} (${productionStageLabel(input.stage)})`) };
}

/** 검수 요청: 해당 버전의 미결 검수 건이 없어야 하며, 에피소드를 검수 공정으로 옮긴다. */
export function requestProductionReview(
  state: ProductionWorkflowState,
  input: { episodeId: string; versionId: string; actorRole: ProductionRole },
): WorkflowResult {
  const episode = episodeOf(state, input.episodeId);
  if (!episode) return { ok: false, error: "회차를 찾을 수 없습니다." };
  const version = state.versions.find((candidate) => candidate.id === input.versionId);
  if (!version || version.episodeId !== input.episodeId) return { ok: false, error: "버전을 찾을 수 없습니다." };
  if (state.queue.some((item) => item.versionId === input.versionId && (item.status === "pending" || item.status === "resubmitted"))) {
    return { ok: false, error: "이미 검수 중인 버전입니다." };
  }
  const item: ReviewQueueItem = {
    id: nextWorkflowId("q"), episodeId: input.episodeId, versionId: input.versionId, status: "pending", reviewerNote: "",
  };
  const next: ProductionWorkflowState = {
    ...state,
    queue: [...state.queue, item],
    episodes: state.episodes.map((candidate) =>
      candidate.id === input.episodeId ? { ...candidate, stage: "review", assigneeRole: "reviewer" } : candidate),
  };
  return { ok: true, state: withLog(next, input.actorRole, "검수 요청", `${episode.episodeNo}화 r${version.revision} 검수 큐 등록`) };
}

/** 검수 결정: 승인하면 게시 준비로, 수정요청이면 채색 공정으로 되돌린다. */
export function decideProductionReview(
  state: ProductionWorkflowState,
  input: { queueId: string; decision: ReviewDecision; note: string },
): WorkflowResult {
  const item = state.queue.find((candidate) => candidate.id === input.queueId);
  if (!item) return { ok: false, error: "검수 건을 찾을 수 없습니다." };
  if (item.status !== "pending" && item.status !== "resubmitted") {
    return { ok: false, error: "이미 결정된 검수 건입니다." };
  }
  const episode = episodeOf(state, item.episodeId);
  if (!episode) return { ok: false, error: "회차를 찾을 수 없습니다." };
  const nextStage: ProductionStage = input.decision === "approved" ? "ready" : "color";
  const nextAssignee: ProductionRole = input.decision === "approved" ? "pd" : "artist";
  const next: ProductionWorkflowState = {
    ...state,
    queue: state.queue.map((candidate) =>
      candidate.id === input.queueId
        ? { ...candidate, status: input.decision === "approved" ? "approved" : "changes-requested", reviewerNote: input.note.trim() }
        : candidate),
    episodes: state.episodes.map((candidate) =>
      candidate.id === item.episodeId ? { ...candidate, stage: nextStage, assigneeRole: nextAssignee } : candidate),
  };
  const action = input.decision === "approved" ? "검수 승인" : "수정 요청";
  return { ok: true, state: withLog(next, "reviewer", action, `${episode.episodeNo}화${input.note.trim() ? ` — ${input.note.trim()}` : ""}`) };
}

/** 수정 반영 뒤 재제출: 다시 검수 대기 상태로 돌아간다. */
export function resubmitProductionReview(
  state: ProductionWorkflowState,
  input: { queueId: string },
): WorkflowResult {
  const item = state.queue.find((candidate) => candidate.id === input.queueId);
  if (!item) return { ok: false, error: "검수 건을 찾을 수 없습니다." };
  if (item.status !== "changes-requested") return { ok: false, error: "수정 요청 상태의 건만 재제출할 수 있습니다." };
  const episode = episodeOf(state, item.episodeId);
  if (!episode) return { ok: false, error: "회차를 찾을 수 없습니다." };
  const next: ProductionWorkflowState = {
    ...state,
    queue: state.queue.map((candidate) => (candidate.id === input.queueId ? { ...candidate, status: "resubmitted" } : candidate)),
    episodes: state.episodes.map((candidate) =>
      candidate.id === item.episodeId ? { ...candidate, stage: "review", assigneeRole: "reviewer" } : candidate),
  };
  return { ok: true, state: withLog(next, "artist", "수정본 재제출", `${episode.episodeNo}화 수정본 검수 재요청`) };
}

/**
 * 작가 인계: 공을 다음 직군으로 넘긴다. 허용 전이만 받는다.
 * 작가 → 검수자(검수 요청과 별개로 인계만 할 때), 검수자 → 작가(반려 인계),
 * 검수자 → PD(승인 인계), PD → 작가(지시 인계).
 */
const HANDOFF_ALLOWED: Readonly<Record<ProductionRole, readonly ProductionRole[]>> = {
  artist: ["reviewer"],
  reviewer: ["artist", "pd"],
  pd: ["artist"],
};

export function handoffProductionEpisode(
  state: ProductionWorkflowState,
  input: { episodeId: string; toRole: ProductionRole },
): WorkflowResult {
  const episode = episodeOf(state, input.episodeId);
  if (!episode) return { ok: false, error: "회차를 찾을 수 없습니다." };
  if (!HANDOFF_ALLOWED[episode.assigneeRole].includes(input.toRole)) {
    return { ok: false, error: `${PRODUCTION_ROLE_LABELS[episode.assigneeRole]}에서 ${PRODUCTION_ROLE_LABELS[input.toRole]}(으)로는 인계할 수 없습니다.` };
  }
  const next: ProductionWorkflowState = {
    ...state,
    episodes: state.episodes.map((candidate) =>
      candidate.id === input.episodeId ? { ...candidate, assigneeRole: input.toRole } : candidate),
  };
  return { ok: true, state: withLog(next, episode.assigneeRole, "인계",
    `${episode.episodeNo}화 ${PRODUCTION_ROLE_LABELS[episode.assigneeRole]} → ${PRODUCTION_ROLE_LABELS[input.toRole]}`) };
}

export interface ProductionOverview {
  readonly totalEpisodes: number;
  readonly byStage: Readonly<Record<ProductionStage, number>>;
  readonly pendingReview: number;
  readonly changesRequested: number;
  readonly ready: number;
}

/** PD 조망: 전체 회차의 공정 분포와 검수 적체, 게시 준비 수를 한 번에 낸다. */
export function productionOverview(state: ProductionWorkflowState): ProductionOverview {
  const byStage: Record<ProductionStage, number> = { outline: 0, sketch: 0, color: 0, review: 0, ready: 0 };
  for (const episode of state.episodes) byStage[episode.stage] += 1;
  return {
    totalEpisodes: state.episodes.length,
    byStage,
    pendingReview: state.queue.filter((item) => item.status === "pending" || item.status === "resubmitted").length,
    changesRequested: state.queue.filter((item) => item.status === "changes-requested").length,
    ready: byStage.ready,
  };
}
