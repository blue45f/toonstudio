/**
 * 복선 장부 (P-1) — 심은 복선을 회수할 때까지 상태로 추적하는 기획 모델 + 저장소.
 *
 * 근거: creative-features REPORT ★1. 드라마 작가실에서 script coordinator가
 * 전담하는 "심은 약속"의 기록을, 웹툰 기획 표면(story 뷰)의 탭으로 옮긴 것이다.
 * 스토리 바이블이 "이미 확정된 사실"을 추적한다면, 이 장부는 "미래에 회수할
 * 약속"을 추적한다 — 그래서 별도 모델·별도 저장소를 둔다.
 *
 * 원칙 (REPORT 실패 케이스에서 그대로 가져온 것):
 * - 회수 판정은 자동화하지 않는다. 상태는 `changeForeshadowStatus` 하나로만,
 *   작가가 명시적으로 바꿀 때만 바뀐다. 이 모듈의 어떤 도출 함수도 상태를
 *   바꾸지 않고, 시스템이 계산하는 것은 "회수 예정 구간이 지났는가"뿐이다.
 * - 예정 구간을 비워 둔 복선은 "장기 복선"으로만 분류하고 경고를 만들지 않는다.
 * - 구간·현재 회차를 회차 순서에서 찾을 수 없으면 판정하지 않는다 —
 *   침묵하는 거짓말(없는 경과를 있는 셈 치는 것)을 만들지 않기 위해서다.
 * - 복선은 스포일러 그 자체라 카드별 공개 범위(visibility)를 가진다.
 *
 * 저장 방식은 studio-planning-store 와 같은 관례(프로젝트별 localStorage 키,
 * 파서로 검증한 스냅샷, 업데이트 이벤트)를 따른다.
 */
import type { StudioProjectDiagnosticSourceStorage } from "../studio-project-diagnostic-source-store";

export const FORESHADOW_STATUSES = [
  "planted",
  "growing",
  "paidOff",
  "dropped",
] as const;

export type ForeshadowStatus = (typeof FORESHADOW_STATUSES)[number];

export const FORESHADOW_VISIBILITIES = ["author", "team", "reviewers"] as const;

export type ForeshadowVisibility = (typeof FORESHADOW_VISIBILITIES)[number];

export interface EpisodeRange {
  readonly fromEpisodeId: string;
  /** null = 구간 끝 미정 (열린 구간 — 경과 판정을 하지 않는다) */
  readonly toEpisodeId: string | null;
}

export interface ForeshadowSeed {
  readonly id: string;
  readonly projectId: string;
  /** 예: "주인공이 숨긴 편지" — 줄거리 키워드 재등장 제안의 기준 문자열이기도 하다 */
  readonly title: string;
  readonly note: string;
  readonly plantedIn: {
    readonly episodeId: string;
    readonly cutId?: string;
    /** 회차 줄거리 칸에서의 언급 위치 (자유 표기) */
    readonly synopsisRef?: string;
  };
  /** 회수 예정 구간 — 없으면 장기 복선으로 분류해 경고를 만들지 않는다 */
  readonly expectedPayoff?: EpisodeRange;
  readonly status: ForeshadowStatus;
  /** 스토리 바이블 사실·캐릭터와의 연결 (fact.characterIds 패턴 재사용) */
  readonly linkedFactIds: readonly string[];
  readonly linkedCharacterIds: readonly string[];
  /** 스포일러 보호: 누가 이 카드를 볼 수 있는가 */
  readonly visibility: ForeshadowVisibility;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** 도출 결과 — 저장하지 않고 매번 계산한다 */
export interface ForeshadowLedgerDigest {
  /** 예정 구간이 지났는데 아직 회수되지 않은 복선 */
  readonly overdue: readonly ForeshadowSeed[];
  /** 현재 회차가 예정 구간 안에 들어온 복선 */
  readonly dueSoon: readonly ForeshadowSeed[];
  /** 구간 미정 장기 복선 */
  readonly longRunning: readonly ForeshadowSeed[];
  readonly counts: Readonly<Record<ForeshadowStatus, number>>;
}

export interface DeriveForeshadowDigestInput {
  readonly seeds: readonly ForeshadowSeed[];
  /** 프로젝트 회차 순서 (구간 경과 판정의 기준) */
  readonly episodeOrder: readonly string[];
  readonly currentEpisodeId: string;
}

/** 회수 판정 대상인 상태인가 — 심음/자라는 중만 "아직 약속이 살아 있는" 복선이다 */
export function isActiveForeshadow(seed: ForeshadowSeed): boolean {
  return seed.status === "planted" || seed.status === "growing";
}

function episodeIndex(
  episodeOrder: readonly string[],
  episodeId: string | null | undefined,
): number | null {
  if (!episodeId) return null;
  const index = episodeOrder.indexOf(episodeId);
  return index >= 0 ? index : null;
}

/**
 * 장부 요약 도출 — 순수 함수. 상태를 바꾸지 않는다.
 * 현재 회차나 구간 경계를 회차 순서에서 찾지 못하면 그 복선은 경과 판정에서
 * 제외한다(장기 복선 분류와 개수도 건드리지 않는다 — 판정 불가와 "없음"은 다르다).
 */
export function deriveForeshadowDigest(
  input: DeriveForeshadowDigestInput,
): ForeshadowLedgerDigest {
  const counts: Record<ForeshadowStatus, number> = {
    planted: 0,
    growing: 0,
    paidOff: 0,
    dropped: 0,
  };
  for (const seed of input.seeds) counts[seed.status] += 1;

  const overdue: ForeshadowSeed[] = [];
  const dueSoon: ForeshadowSeed[] = [];
  const longRunning: ForeshadowSeed[] = [];
  const currentIndex = episodeIndex(input.episodeOrder, input.currentEpisodeId);

  for (const seed of input.seeds) {
    if (!isActiveForeshadow(seed)) continue;
    if (!seed.expectedPayoff) {
      longRunning.push(seed);
      continue;
    }
    if (currentIndex === null) continue;
    const fromIndex = episodeIndex(input.episodeOrder, seed.expectedPayoff.fromEpisodeId);
    if (fromIndex === null) continue;
    const toIndex = seed.expectedPayoff.toEpisodeId === null
      ? null
      : episodeIndex(input.episodeOrder, seed.expectedPayoff.toEpisodeId);
    // 구간 끝이 정해졌는데 순서에서 못 찾으면 경과를 단정하지 않는다.
    if (seed.expectedPayoff.toEpisodeId !== null && toIndex === null) continue;
    if (toIndex !== null && currentIndex > toIndex) {
      overdue.push(seed);
    } else if (currentIndex >= fromIndex) {
      dueSoon.push(seed);
    }
  }

  return Object.freeze({
    overdue: Object.freeze(overdue),
    dueSoon: Object.freeze(dueSoon),
    longRunning: Object.freeze(longRunning),
    counts: Object.freeze(counts),
  });
}

/** 회차 줄거리 칸과의 양방향 연결 — 한 회차에서 본 복선의 양방향 목록 */
export interface EpisodeForeshadowLinks {
  /** 이 회차에 심은 복선 */
  readonly plantedHere: readonly ForeshadowSeed[];
  /** 회수 예정 구간에 이 회차가 들어가는, 아직 살아 있는 복선 */
  readonly payoffPlannedHere: readonly ForeshadowSeed[];
}

export function deriveEpisodeForeshadowLinks(
  seeds: readonly ForeshadowSeed[],
  episodeId: string,
  episodeOrder: readonly string[],
): EpisodeForeshadowLinks {
  const targetIndex = episodeIndex(episodeOrder, episodeId);
  const plantedHere = seeds.filter((seed) => seed.plantedIn.episodeId === episodeId);
  const payoffPlannedHere = seeds.filter((seed) => {
    if (!isActiveForeshadow(seed) || !seed.expectedPayoff) return false;
    if (targetIndex === null) return seed.expectedPayoff.fromEpisodeId === episodeId;
    const fromIndex = episodeIndex(episodeOrder, seed.expectedPayoff.fromEpisodeId);
    if (fromIndex === null) return false;
    const toIndex = seed.expectedPayoff.toEpisodeId === null
      ? null
      : episodeIndex(episodeOrder, seed.expectedPayoff.toEpisodeId);
    if (seed.expectedPayoff.toEpisodeId !== null && toIndex === null) return false;
    return targetIndex >= fromIndex && (toIndex === null || targetIndex <= toIndex);
  });
  return Object.freeze({
    plantedHere: Object.freeze(plantedHere),
    payoffPlannedHere: Object.freeze(payoffPlannedHere),
  });
}

/**
 * 줄거리·대사에 복선 제목이 다시 등장하면 "혹시 이 복선?"으로 조용히 제안만
 * 하기 위한 후보 도출. 판정이 아니라 제안이다 — 이 함수의 결과를 보고 상태를
 * 바꾸는 코드는 어디에도 없다(회수 확정은 작가만 한다).
 * 제목이 2자 미만이면 오탐이 많아 제안하지 않는다.
 */
export function suggestForeshadowMentions(
  seeds: readonly ForeshadowSeed[],
  episodeId: string,
  text: string,
): readonly ForeshadowSeed[] {
  const haystack = text.trim();
  if (!haystack) return Object.freeze([]);
  return Object.freeze(seeds.filter((seed) => (
    isActiveForeshadow(seed)
    && seed.plantedIn.episodeId !== episodeId
    && seed.title.trim().length >= 2
    && haystack.includes(seed.title.trim())
  )));
}

export interface CreateForeshadowSeedInput {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly note?: string;
  readonly plantedIn: ForeshadowSeed["plantedIn"];
  readonly expectedPayoff?: EpisodeRange;
  readonly linkedFactIds?: readonly string[];
  readonly linkedCharacterIds?: readonly string[];
  readonly visibility?: ForeshadowVisibility;
  readonly now: string;
}

/** 새 복선 카드 — 상태는 항상 "심음"으로 시작한다 */
export function createForeshadowSeed(input: CreateForeshadowSeedInput): ForeshadowSeed {
  if (!input.id.trim() || !input.projectId.trim() || !input.title.trim()) {
    throw new Error("A foreshadow seed requires an id, a project id and a title.");
  }
  if (!input.plantedIn.episodeId.trim()) {
    throw new Error("A foreshadow seed requires the episode it was planted in.");
  }
  if (!Number.isFinite(Date.parse(input.now))) {
    throw new Error("A valid foreshadow timestamp is required.");
  }
  return Object.freeze({
    id: input.id,
    projectId: input.projectId,
    title: input.title.trim(),
    note: input.note ?? "",
    plantedIn: Object.freeze({ ...input.plantedIn }),
    ...(input.expectedPayoff
      ? { expectedPayoff: Object.freeze({ ...input.expectedPayoff }) }
      : {}),
    status: "planted",
    linkedFactIds: Object.freeze([...(input.linkedFactIds ?? [])]),
    linkedCharacterIds: Object.freeze([...(input.linkedCharacterIds ?? [])]),
    visibility: input.visibility ?? "author",
    createdAt: input.now,
    updatedAt: input.now,
  });
}

/** id 기준으로 교체하거나 끝에 붙인다 — 등록·수정의 유일한 경로 */
export function upsertForeshadowSeed(
  seeds: readonly ForeshadowSeed[],
  seed: ForeshadowSeed,
): readonly ForeshadowSeed[] {
  const exists = seeds.some((entry) => entry.id === seed.id);
  return Object.freeze(exists
    ? seeds.map((entry) => (entry.id === seed.id ? seed : entry))
    : [...seeds, seed]);
}

/**
 * 상태 전이의 유일한 함수. 작가 수동 조작에서만 호출한다 —
 * 도출·제안·저장 어떤 자동 경로도 이 함수를 부르지 않는다.
 */
export function changeForeshadowStatus(
  seeds: readonly ForeshadowSeed[],
  seedId: string,
  status: ForeshadowStatus,
  updatedAt: string,
): readonly ForeshadowSeed[] {
  if (!Number.isFinite(Date.parse(updatedAt))) {
    throw new Error("A valid foreshadow timestamp is required.");
  }
  return Object.freeze(seeds.map((seed) => (
    seed.id === seedId
      ? Object.freeze({ ...seed, status, updatedAt })
      : seed
  )));
}

/** 개요 NowCard가 읽는 신호 — 미회수(예정 경과) 복선이 있을 때만 값을 돌려준다 */
export interface ForeshadowOverdueNotice {
  readonly overdueCount: number;
  /** 가장 오래 밀린 복선 제목 (근거 문장에 쓴다) */
  readonly firstTitle: string;
}

export function deriveForeshadowOverdueNotice(
  digest: ForeshadowLedgerDigest,
): ForeshadowOverdueNotice | null {
  const first = digest.overdue[0];
  if (!first) return null;
  return Object.freeze({ overdueCount: digest.overdue.length, firstTitle: first.title });
}

// ── 저장소 (studio-planning-store 와 같은 관례) ─────────────────────────────

export const STUDIO_FORESHADOW_UPDATED_EVENT =
  "toonspectrum:studio:foreshadow-updated";

export interface StudioForeshadowLedgerState {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly seeds: readonly ForeshadowSeed[];
}

export interface StudioForeshadowEventTarget {
  dispatchEvent(event: Event): boolean;
}

function storageKey(projectId: string): string {
  return `toonstudio:foreshadow:v1:${encodeURIComponent(projectId)}`;
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isSeedLike(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== "string" || !value.id
    || typeof value.projectId !== "string" || !value.projectId
    || typeof value.title !== "string"
    || typeof value.note !== "string"
    || !isRecord(value.plantedIn)
    || typeof value.plantedIn.episodeId !== "string" || !value.plantedIn.episodeId
    || !(FORESHADOW_STATUSES as readonly string[]).includes(value.status as string)
    || !isStringArray(value.linkedFactIds)
    || !isStringArray(value.linkedCharacterIds)
    || !(FORESHADOW_VISIBILITIES as readonly string[]).includes(value.visibility as string)
    || typeof value.createdAt !== "string"
    || typeof value.updatedAt !== "string"
  ) {
    return false;
  }
  if (value.expectedPayoff !== undefined) {
    if (!isRecord(value.expectedPayoff)) return false;
    if (typeof value.expectedPayoff.fromEpisodeId !== "string" || !value.expectedPayoff.fromEpisodeId) {
      return false;
    }
    if (value.expectedPayoff.toEpisodeId !== null && typeof value.expectedPayoff.toEpisodeId !== "string") {
      return false;
    }
  }
  return true;
}

export function parseStudioForeshadowLedger(
  value: unknown,
  expectedProjectId?: string,
): StudioForeshadowLedgerState | null {
  if (!isRecord(value)) return null;
  if (
    value.schemaVersion !== 1
    || typeof value.projectId !== "string"
    || !value.projectId.trim()
    || (expectedProjectId !== undefined && value.projectId !== expectedProjectId)
    || !Array.isArray(value.seeds)
    || !value.seeds.every(isSeedLike)
    || !value.seeds.every((seed) => isRecord(seed) && seed.projectId === value.projectId)
  ) {
    return null;
  }
  return Object.freeze(plainClone(value) as unknown as StudioForeshadowLedgerState);
}

export function readStudioForeshadowLedger(
  storage: StudioProjectDiagnosticSourceStorage,
  projectId: string,
): StudioForeshadowLedgerState | null {
  if (!projectId.trim()) return null;
  const raw = storage.getItem(storageKey(projectId));
  if (raw === null) return null;
  try {
    return parseStudioForeshadowLedger(JSON.parse(raw) as unknown, projectId);
  } catch {
    return null;
  }
}

export function writeStudioForeshadowLedger(
  storage: StudioProjectDiagnosticSourceStorage,
  state: StudioForeshadowLedgerState,
  target?: StudioForeshadowEventTarget,
): StudioForeshadowLedgerState {
  const parsed = parseStudioForeshadowLedger(state, state.projectId);
  if (!parsed) throw new Error("A structurally valid foreshadow ledger state is required.");
  storage.setItem(storageKey(state.projectId), JSON.stringify(parsed));
  target?.dispatchEvent(new CustomEvent(STUDIO_FORESHADOW_UPDATED_EVENT, {
    detail: parsed,
  }));
  return parsed;
}

/** 저장된 장부를 돌려주고, 없으면 빈 장부를 만들어 저장한 뒤 돌려준다 */
export function ensureStudioForeshadowLedger(
  storage: StudioProjectDiagnosticSourceStorage,
  projectId: string,
): StudioForeshadowLedgerState {
  const normalizedProjectId = requireProjectId(projectId);
  const current = readStudioForeshadowLedger(storage, normalizedProjectId);
  if (current) return current;
  const initial: StudioForeshadowLedgerState = Object.freeze({
    schemaVersion: 1,
    projectId: normalizedProjectId,
    seeds: Object.freeze([]),
  });
  return writeStudioForeshadowLedger(storage, initial);
}

export function saveStudioForeshadowSeed(
  storage: StudioProjectDiagnosticSourceStorage,
  projectId: string,
  seed: ForeshadowSeed,
  target?: StudioForeshadowEventTarget,
): StudioForeshadowLedgerState {
  const normalizedProjectId = requireProjectId(projectId);
  if (seed.projectId !== normalizedProjectId) {
    throw new Error("A foreshadow seed belongs to another project.");
  }
  const current = ensureStudioForeshadowLedger(storage, normalizedProjectId);
  return writeStudioForeshadowLedger(
    storage,
    Object.freeze({
      schemaVersion: 1,
      projectId: normalizedProjectId,
      seeds: upsertForeshadowSeed(current.seeds, seed),
    }),
    target,
  );
}

export function saveStudioForeshadowStatus(
  storage: StudioProjectDiagnosticSourceStorage,
  projectId: string,
  seedId: string,
  status: ForeshadowStatus,
  target?: StudioForeshadowEventTarget,
  updatedAt = new Date().toISOString(),
): StudioForeshadowLedgerState {
  const normalizedProjectId = requireProjectId(projectId);
  const current = ensureStudioForeshadowLedger(storage, normalizedProjectId);
  return writeStudioForeshadowLedger(
    storage,
    Object.freeze({
      schemaVersion: 1,
      projectId: normalizedProjectId,
      seeds: changeForeshadowStatus(current.seeds, seedId, status, updatedAt),
    }),
    target,
  );
}

export function studioForeshadowStorageKey(projectId: string): string {
  if (!projectId.trim()) throw new Error("Project id is required.");
  return storageKey(projectId);
}
