/**
 * 프로젝트 story 뷰(view=episodes)에 장착되는 회차 시놉시스의 저장소.
 *
 * 배경: StudioEpisodeStoryPage 는 props(SeasonPlan·EpisodePlan[]·onSavePlan)만 받는
 * 표면이라, 셸의 story 뷰에 얹으려면 프로젝트 단위 로드·저장 경로가 필요했다.
 * 이 모듈이 그 경로다 — 진단 소스 스토어와 같은 방식(프로젝트별 localStorage 키,
 * 파서로 검증한 스냅샷, 업데이트 이벤트)으로 기획 상태를 보관한다.
 *
 * - 정본 데이터 모양은 @toonstudio/core/production 의 SeasonPlan / EpisodePlan 을
 *   그대로 쓴다 (goal·synopsis·emotionalArc 는 core 에 합류한 optional 필드).
 * - production-hub 의 운영 aggregate 와는 별개 저장소다. 스튜디오 프로젝트는
 *   production 프로젝트와 id 공간·수명주기가 달라, aggregate 를 끌어오지 않는다.
 */
import type { SeasonPlan } from "@toonstudio/core/production";

import type { StudioProjectDiagnosticSourceStorage } from "../studio-project-diagnostic-source-store";
import type { EpisodePlanWithSynopsis } from "./studio-episode-synopsis";

export const STUDIO_PLANNING_UPDATED_EVENT =
  "toonspectrum:studio:planning-updated";

export interface StudioProjectPlanningState {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly season: SeasonPlan;
  readonly plans: readonly EpisodePlanWithSynopsis[];
}

export interface StudioPlanningEventTarget {
  dispatchEvent(event: Event): boolean;
}

function storageKey(projectId: string): string {
  return `toonstudio:planning:v1:${encodeURIComponent(projectId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function plainClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requireProjectId(projectId: string): string {
  const normalized = projectId.trim();
  if (!normalized || normalized === "." || normalized === ".." || normalized.includes("\\")) {
    throw new Error("A valid Studio project id is required.");
  }
  return normalized;
}

function isPlanLike(value: unknown): boolean {
  return isRecord(value)
    && typeof value.episodeId === "string"
    && value.episodeId.length > 0
    && typeof value.episodeNumber === "number"
    && Number.isFinite(value.episodeNumber)
    && typeof value.title === "string"
    && Array.isArray(value.turningPoints);
}

function isSeasonLike(value: unknown, projectId: string): boolean {
  return isRecord(value)
    && typeof value.seasonId === "string"
    && value.seasonId.length > 0
    && value.projectId === projectId
    && typeof value.title === "string"
    && Array.isArray(value.episodeOrder)
    && value.episodeOrder.every((entry) => typeof entry === "string")
    && Array.isArray(value.plotArc);
}

export function parseStudioProjectPlanning(
  value: unknown,
  expectedProjectId?: string,
): StudioProjectPlanningState | null {
  if (!isRecord(value)) return null;
  if (
    value.schemaVersion !== 1
    || typeof value.projectId !== "string"
    || !value.projectId.trim()
    || (expectedProjectId !== undefined && value.projectId !== expectedProjectId)
    || !isSeasonLike(value.season, value.projectId)
    || !Array.isArray(value.plans)
    || !value.plans.every(isPlanLike)
  ) {
    return null;
  }
  return Object.freeze(plainClone(value) as unknown as StudioProjectPlanningState);
}

/** 처음 여는 프로젝트의 기획 상태 — 시즌 1개와 빈 1화 계획 하나로 시작한다. */
export function createInitialStudioProjectPlanning(
  projectId: string,
  createdAt = new Date().toISOString(),
): StudioProjectPlanningState {
  const normalizedProjectId = requireProjectId(projectId);
  if (!Number.isFinite(Date.parse(createdAt))) {
    throw new Error("A valid Studio planning timestamp is required.");
  }
  const seasonId = `${normalizedProjectId}:season-1`;
  const episodeId = `${normalizedProjectId}:episode-1`;
  const season: SeasonPlan = Object.freeze({
    id: `${normalizedProjectId}:season-plan-1`,
    projectId: normalizedProjectId,
    seasonId,
    revision: 1,
    status: "draft",
    title: "시즌 1",
    goal: "",
    plotArc: Object.freeze([]),
    characterArcRefs: Object.freeze([]),
    episodeOrder: Object.freeze([episodeId]),
    targetEpisodeCount: 1,
    releaseStartsAt: null,
    releaseCadenceDays: null,
    budgetCapMinor: null,
    currency: null,
    approvedByAssignmentIds: Object.freeze([]),
    createdAt,
  });
  const firstPlan: EpisodePlanWithSynopsis = Object.freeze({
    id: `${normalizedProjectId}:episode-plan-1`,
    projectId: normalizedProjectId,
    seasonId,
    episodeId,
    episodeNumber: 1,
    revision: 1,
    status: "draft",
    title: "1화",
    logline: "",
    openingHook: "",
    coreConflict: "",
    turningPoints: Object.freeze([]),
    cliffhanger: "",
    characterRefs: Object.freeze([]),
    locationRefs: Object.freeze([]),
    targetCutCount: 0,
    targetScrollHeightPx: 0,
    dialogueDensity: "medium",
    difficulty: 1,
    riskIds: Object.freeze([]),
    narrativeRevisionRef: null,
    approvedByAssignmentIds: Object.freeze([]),
    createdAt,
  });
  return Object.freeze({
    schemaVersion: 1,
    projectId: normalizedProjectId,
    season,
    plans: Object.freeze([firstPlan]),
  });
}

export function readStudioProjectPlanning(
  storage: StudioProjectDiagnosticSourceStorage,
  projectId: string,
): StudioProjectPlanningState | null {
  if (!projectId.trim()) return null;
  const raw = storage.getItem(storageKey(projectId));
  if (raw === null) return null;
  try {
    return parseStudioProjectPlanning(JSON.parse(raw) as unknown, projectId);
  } catch {
    return null;
  }
}

export function writeStudioProjectPlanning(
  storage: StudioProjectDiagnosticSourceStorage,
  state: StudioProjectPlanningState,
  target?: StudioPlanningEventTarget,
): StudioProjectPlanningState {
  const parsed = parseStudioProjectPlanning(state, state.projectId);
  if (!parsed) throw new Error("A structurally valid project planning state is required.");
  storage.setItem(storageKey(state.projectId), JSON.stringify(parsed));
  target?.dispatchEvent(new CustomEvent(STUDIO_PLANNING_UPDATED_EVENT, {
    detail: parsed,
  }));
  return parsed;
}

/** 저장된 기획 상태를 돌려주고, 없으면 초기 상태를 만들어 저장한 뒤 돌려준다. */
export function ensureStudioProjectPlanning(
  storage: StudioProjectDiagnosticSourceStorage,
  projectId: string,
  createdAt = new Date().toISOString(),
): StudioProjectPlanningState {
  const normalizedProjectId = requireProjectId(projectId);
  const current = readStudioProjectPlanning(storage, normalizedProjectId);
  if (current) return current;
  const initial = createInitialStudioProjectPlanning(normalizedProjectId, createdAt);
  writeStudioProjectPlanning(storage, initial);
  return initial;
}

/**
 * 회차 계획 하나를 저장한다. episodeId 로 교체하고, 없으면 시즌 순서 끝에 붙인다.
 * revision 은 저장할 때마다 1 올린다 — 편집 표면의 초안은 로드 시점 revision 을
 * 그대로 들고 있으므로, 여기서 올려야 "저장된 판"과 "편집 중 초안"이 구분된다.
 */
export function saveStudioEpisodePlan(
  storage: StudioProjectDiagnosticSourceStorage,
  projectId: string,
  plan: EpisodePlanWithSynopsis,
  target?: StudioPlanningEventTarget,
): StudioProjectPlanningState {
  const normalizedProjectId = requireProjectId(projectId);
  const current = ensureStudioProjectPlanning(storage, normalizedProjectId);
  const saved: EpisodePlanWithSynopsis = Object.freeze({
    ...plan,
    projectId: normalizedProjectId,
    revision: plan.revision + 1,
  });
  const exists = current.plans.some((entry) => entry.episodeId === plan.episodeId);
  const plans = exists
    ? current.plans.map((entry) => (entry.episodeId === plan.episodeId ? saved : entry))
    : [...current.plans, saved];
  const season: SeasonPlan = exists || current.season.episodeOrder.includes(plan.episodeId)
    ? current.season
    : Object.freeze({
        ...current.season,
        episodeOrder: Object.freeze([...current.season.episodeOrder, plan.episodeId]),
      });
  return writeStudioProjectPlanning(
    storage,
    Object.freeze({
      schemaVersion: 1,
      projectId: normalizedProjectId,
      season,
      plans: Object.freeze(plans),
    }),
    target,
  );
}

export function studioPlanningStorageKey(projectId: string): string {
  if (!projectId.trim()) throw new Error("Project id is required.");
  return storageKey(projectId);
}
