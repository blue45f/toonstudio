/**
 * 준비 회차(사전제작) 버퍼 가시화 + 소진 경고 — 순수 계산 모듈.
 *
 * 배경: NHN코미코 덩크스튜디오·케나즈 사례처럼 연재 시작 전 사전제작으로
 * 회차를 비축해 두는 운영이 표준이다. 그런데 기존 표면은 연재가 시작된 뒤의
 * 버퍼(serialization-buffer 방패)만 말했고, 연재 시작 전 준비 회차는 회차
 * 흐름 어디에도 "0단계"로 드러나지 않았다. 이 모듈은 그 0단계를 명시한다.
 *
 * 원칙:
 * - 준비 회차도 저장 데이터가 아니라 회차 상태에서 도출되는 순수 계산이다.
 *   "준비됨" 판정은 연재 버퍼와 같은 근거 — 협업 상태 `publish-ready`만
 *   완성으로 센다. cancelled는 판정 불가(unknown)로 분리해 개수를 돌려준다.
 * - 연재 시작일(launch)은 지어내지 않는다. 해석 우선순위:
 *   ① 시즌 계획의 releaseStartsAt → ② 게시 캘린더 예약(releasePlans)의
 *   가장 이른 scheduledAt → ③ 회차 plannedReleaseAt. 셋 다 없으면 null이고
 *   시작까지 남은 일수·필요 제작 속도는 null로 정직하게 돌려준다.
 * - 소진 projection은 순소진(net burn) 기준이다: 연재가 시작되면 주당
 *   게시 소비(7/게시주기)가 쌓이고, 제작 속도(주당 완성 회차)가 이를
 *   상쇄한다. 제작 속도를 모르면(null) 보충 0으로 계산하되 그 사실을
 *   필드 이름이 아니라 digest.assumesNoReplenishment로 노출한다.
 * - 비축 지표는 뷰를 분리한다(projectPreBufferForViewer): PD/운영진(ops)
 *   뷰는 소진율·소진 예상일·위험 등급까지, 작가(author) 뷰는 준비 회차 수·
 *   목표까지 남은 회차·다음 행동만 — 소진율 같은 압박 지표는 작가 뷰
 *   타입에 아예 존재하지 않는다.
 */
import type {
  EpisodeCollaboration,
  EpisodeReleasePlan,
  SeasonPlan,
} from "@toonstudio/core/production";

import type { CreatorRoleLens } from "@/shared/lib/creator-role-contract";

/** 회차 흐름의 0단계 — 연재 시작 전 준비(사전제작). 기존 1~7단계 앞에 온다. */
export const EPISODE_FLOW_STAGE_ZERO = Object.freeze({
  id: "pre-serialization",
  order: 0,
  label: Object.freeze({ ko: "0단계 · 연재 준비(사전제작)", en: "Stage 0 · Pre-serialization prep" }),
});

/** 연재 시작 전 비축 목표 기본값 (회). 플랫폼 사전제작 관행의 하한선. */
export const DEFAULT_PRE_SERIALIZATION_TARGET_COUNT = 5;
export const DEFAULT_PRE_SERIALIZATION_INTERVAL_DAYS = 7;

export type PreBufferPhase = "stage-0" | "serializing";
export type PreBufferRiskLevel = "safe" | "caution" | "danger" | "critical";
export type PreBufferViewer = "ops" | "author";
export type LaunchDateSource = "season-plan" | "release-plan" | "episode-plan" | "none";

/** 역할 렌즈 → 버퍼 뷰. producer 렌즈만 운영진 뷰, 이야기·작화는 작가 뷰. */
export function preBufferViewerForRoleLens(lens: CreatorRoleLens): PreBufferViewer {
  return lens === "producer" ? "ops" : "author";
}

export interface PreSerializationBufferInput {
  readonly episodes: readonly Pick<EpisodeCollaboration, "episodeId" | "state" | "plannedReleaseAt">[];
  readonly releasePlans?: readonly Pick<EpisodeReleasePlan, "episodeId" | "status" | "scheduledAt">[];
  readonly seasonPlans?: readonly Pick<SeasonPlan, "releaseStartsAt" | "releaseCadenceDays">[];
  readonly today: string; // ISO date
  /** 비축 목표(회). 없으면 기본값. */
  readonly targetPreparedCount?: number;
  /** 최근 제작 속도(주당 완성 회차). 모르면 null/생략 — 보충 0 가정으로 표시된다. */
  readonly productionPacePerWeek?: number | null;
}

export interface PreSerializationBufferDigest {
  readonly phase: PreBufferPhase;
  /** publish-ready 회차 수 — 0단계에서 비축된 준비 회차 */
  readonly preparedCount: number;
  readonly publishedCount: number;
  readonly inProgressCount: number;
  readonly unknownEpisodeCount: number;
  readonly targetPreparedCount: number;
  /** 목표까지 부족한 회차 수 (0 이상) */
  readonly shortfall: number;
  /** prepared/target (상한 없음 — 초과 비축도 보인다) */
  readonly readinessRatio: number;
  readonly launchDate: string | null;
  readonly launchSource: LaunchDateSource;
  readonly daysUntilLaunch: number | null;
  readonly releaseIntervalDays: number;
  /** 준비 회차로 버틸 수 있는 게시 일수 = prepared × 주기 */
  readonly bufferedDays: number;
  /** 연재 시작 후 주당 게시 소비 (회/주) */
  readonly consumptionPerWeek: number;
  /** 제작 속도 (회/주). 입력이 없으면 null */
  readonly replenishmentPerWeek: number | null;
  /** 순소진율 (회/주) = 소비 − 보충. 보충을 모르면 소비와 같다 */
  readonly netBurnPerWeek: number;
  readonly assumesNoReplenishment: boolean;
  /** 순소진 기준 버퍼 소진 예상일. 순소진이 0 이하면 null(지속 가능) */
  readonly projectedExhaustionDate: string | null;
  /** 연재 시작까지 목표를 채우는 데 필요한 제작 속도(회/주). 계산 불가면 null */
  readonly requiredPacePerWeek: number | null;
  readonly riskLevel: PreBufferRiskLevel;
}

const DAY_MS = 86_400_000;

function parseDateMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function dayDiff(laterMs: number, earlierMs: number): number {
  return Math.round((laterMs - earlierMs) / DAY_MS);
}

function resolveLaunch(
  input: PreSerializationBufferInput,
): { launchDate: string | null; source: LaunchDateSource; cadenceDays: number | null } {
  for (const plan of input.seasonPlans ?? []) {
    const ms = parseDateMs(plan.releaseStartsAt);
    if (ms !== null) {
      return {
        launchDate: toIsoDate(ms),
        source: "season-plan",
        cadenceDays: plan.releaseCadenceDays && plan.releaseCadenceDays > 0 ? plan.releaseCadenceDays : null,
      };
    }
  }
  let earliest: number | null = null;
  for (const plan of input.releasePlans ?? []) {
    if (plan.status !== "scheduled" && plan.status !== "ready" && plan.status !== "preflight") continue;
    const ms = parseDateMs(plan.scheduledAt);
    if (ms !== null && (earliest === null || ms < earliest)) earliest = ms;
  }
  if (earliest !== null) return { launchDate: toIsoDate(earliest), source: "release-plan", cadenceDays: null };
  for (const episode of input.episodes) {
    const ms = parseDateMs(episode.plannedReleaseAt);
    if (ms !== null && (earliest === null || ms < earliest)) earliest = ms;
  }
  if (earliest !== null) return { launchDate: toIsoDate(earliest), source: "episode-plan", cadenceDays: null };
  return { launchDate: null, source: "none", cadenceDays: null };
}

function resolveRisk(input: {
  phase: PreBufferPhase;
  preparedCount: number;
  shortfall: number;
  daysUntilLaunch: number | null;
  requiredPacePerWeek: number | null;
  replenishmentPerWeek: number | null;
  netBurnPerWeek: number;
  bufferedDays: number;
  releaseIntervalDays: number;
}): PreBufferRiskLevel {
  if (input.preparedCount === 0) return "critical";
  if (input.phase === "stage-0") {
    if (input.shortfall === 0) return "safe";
    if (input.daysUntilLaunch !== null && input.daysUntilLaunch <= input.releaseIntervalDays) return "danger";
    if (
      input.requiredPacePerWeek !== null
      && input.replenishmentPerWeek !== null
      && input.replenishmentPerWeek < input.requiredPacePerWeek
    ) return "danger";
    return "caution";
  }
  // serializing
  if (input.netBurnPerWeek <= 0) return "safe";
  const weeksLeft = input.bufferedDays / 7;
  if (weeksLeft <= 1) return "danger";
  if (weeksLeft <= 3) return "caution";
  return "safe";
}

export function derivePreSerializationBuffer(
  input: PreSerializationBufferInput,
): PreSerializationBufferDigest {
  let preparedCount = 0;
  let publishedCount = 0;
  let inProgressCount = 0;
  let unknownEpisodeCount = 0;
  for (const episode of input.episodes) {
    if (episode.state === "publish-ready") preparedCount += 1;
    else if (episode.state === "published") publishedCount += 1;
    else if (episode.state === "cancelled") unknownEpisodeCount += 1;
    else inProgressCount += 1;
  }
  const phase: PreBufferPhase = publishedCount === 0 ? "stage-0" : "serializing";
  const target = Number.isFinite(input.targetPreparedCount) && (input.targetPreparedCount ?? 0) > 0
    ? Math.floor(input.targetPreparedCount!)
    : DEFAULT_PRE_SERIALIZATION_TARGET_COUNT;
  const shortfall = Math.max(0, target - preparedCount);

  const launch = resolveLaunch(input);
  const interval = launch.cadenceDays ?? DEFAULT_PRE_SERIALIZATION_INTERVAL_DAYS;
  const todayMs = parseDateMs(input.today);
  const launchMs = parseDateMs(launch.launchDate);
  const daysUntilLaunch = todayMs !== null && launchMs !== null ? dayDiff(launchMs, todayMs) : null;

  const bufferedDays = preparedCount * interval;
  const consumptionPerWeek = Math.round((7 / interval) * 100) / 100;
  const pace = typeof input.productionPacePerWeek === "number" && Number.isFinite(input.productionPacePerWeek) && input.productionPacePerWeek >= 0
    ? input.productionPacePerWeek
    : null;
  const netBurnPerWeek = Math.round((consumptionPerWeek - (pace ?? 0)) * 100) / 100;
  const assumesNoReplenishment = pace === null;

  // 소진 예상: 연재 중이면 오늘부터, 0단계면 연재 시작일부터 소진된다.
  let projectedExhaustionDate: string | null = null;
  if (netBurnPerWeek > 0 && preparedCount > 0) {
    const baseMs = phase === "serializing" ? todayMs : launchMs ?? todayMs;
    if (baseMs !== null) {
      const weeksToEmpty = preparedCount / netBurnPerWeek;
      projectedExhaustionDate = toIsoDate(baseMs + Math.round(weeksToEmpty * 7) * DAY_MS);
    }
  }

  let requiredPacePerWeek: number | null = null;
  if (phase === "stage-0" && shortfall > 0 && daysUntilLaunch !== null && daysUntilLaunch > 0) {
    requiredPacePerWeek = Math.round((shortfall / (daysUntilLaunch / 7)) * 100) / 100;
  } else if (phase === "stage-0" && shortfall === 0) {
    requiredPacePerWeek = 0;
  }

  return {
    phase,
    preparedCount,
    publishedCount,
    inProgressCount,
    unknownEpisodeCount,
    targetPreparedCount: target,
    shortfall,
    readinessRatio: Math.round((preparedCount / target) * 100) / 100,
    launchDate: launch.launchDate,
    launchSource: launch.source,
    daysUntilLaunch,
    releaseIntervalDays: interval,
    bufferedDays,
    consumptionPerWeek,
    replenishmentPerWeek: pace,
    netBurnPerWeek,
    assumesNoReplenishment,
    projectedExhaustionDate,
    requiredPacePerWeek,
    riskLevel: resolveRisk({
      phase,
      preparedCount,
      shortfall,
      daysUntilLaunch,
      requiredPacePerWeek,
      replenishmentPerWeek: pace,
      netBurnPerWeek,
      bufferedDays,
      releaseIntervalDays: interval,
    }),
  };
}

/** 회차 1개가 회차 흐름에서 차지하는 위치 — 준비 회차는 0단계로 명시된다. */
export function episodeFlowPosition(
  state: EpisodeCollaboration["state"],
  phase: PreBufferPhase,
): "stage-0-prepared" | "stage-0-in-progress" | "serializing" | "published" | "unknown" {
  if (state === "published") return "published";
  if (state === "cancelled") return "unknown";
  if (phase === "stage-0") return state === "publish-ready" ? "stage-0-prepared" : "stage-0-in-progress";
  return "serializing";
}

export interface OpsPreBufferView {
  readonly viewer: "ops";
  readonly phase: PreBufferPhase;
  readonly preparedCount: number;
  readonly targetPreparedCount: number;
  readonly shortfall: number;
  readonly readinessRatio: number;
  readonly bufferedDays: number;
  readonly consumptionPerWeek: number;
  readonly replenishmentPerWeek: number | null;
  readonly netBurnPerWeek: number;
  readonly assumesNoReplenishment: boolean;
  readonly projectedExhaustionDate: string | null;
  readonly requiredPacePerWeek: number | null;
  readonly riskLevel: PreBufferRiskLevel;
  readonly launchDate: string | null;
  readonly daysUntilLaunch: number | null;
  readonly unknownEpisodeCount: number;
}

export interface AuthorPreBufferView {
  readonly viewer: "author";
  readonly phase: PreBufferPhase;
  readonly preparedCount: number;
  readonly targetPreparedCount: number;
  readonly shortfall: number;
  readonly launchDate: string | null;
  readonly daysUntilLaunch: number | null;
  /** 작가가 지금 할 일 한 가지. 소진율·소진일은 이 뷰에 없다. */
  readonly nextAction: "prepare-next-episode" | "ready-to-launch" | "keep-buffer";
}

export type PreBufferView = OpsPreBufferView | AuthorPreBufferView;

export function projectPreBufferForViewer(
  digest: PreSerializationBufferDigest,
  viewer: PreBufferViewer,
): PreBufferView {
  if (viewer === "ops") {
    return {
      viewer: "ops",
      phase: digest.phase,
      preparedCount: digest.preparedCount,
      targetPreparedCount: digest.targetPreparedCount,
      shortfall: digest.shortfall,
      readinessRatio: digest.readinessRatio,
      bufferedDays: digest.bufferedDays,
      consumptionPerWeek: digest.consumptionPerWeek,
      replenishmentPerWeek: digest.replenishmentPerWeek,
      netBurnPerWeek: digest.netBurnPerWeek,
      assumesNoReplenishment: digest.assumesNoReplenishment,
      projectedExhaustionDate: digest.projectedExhaustionDate,
      requiredPacePerWeek: digest.requiredPacePerWeek,
      riskLevel: digest.riskLevel,
      launchDate: digest.launchDate,
      daysUntilLaunch: digest.daysUntilLaunch,
      unknownEpisodeCount: digest.unknownEpisodeCount,
    };
  }
  return {
    viewer: "author",
    phase: digest.phase,
    preparedCount: digest.preparedCount,
    targetPreparedCount: digest.targetPreparedCount,
    shortfall: digest.shortfall,
    launchDate: digest.launchDate,
    daysUntilLaunch: digest.daysUntilLaunch,
    nextAction: digest.phase === "stage-0"
      ? digest.shortfall > 0 ? "prepare-next-episode" : "ready-to-launch"
      : "keep-buffer",
  };
}

export type PreBufferLocalize = (ko: string, en: string) => string;

/**
 * 소진 경고 문구 — 위험할 때만 카드 내용을 돌려준다(안전하면 null).
 * 문구는 전부 숫자를 포함한다: 부족 회차·소진 예상일·시작까지 남은 일수.
 * 작가 뷰에서도 경고 자체는 보이되, 문구는 "소진" 압박 대신 준비 행동으로 쓴다.
 */
export function preSerializationBufferWarning(
  digest: PreSerializationBufferDigest,
  localize: PreBufferLocalize,
): { readonly tone: "danger" | "warning"; readonly title: string; readonly reason: string } | null {
  if (digest.riskLevel === "safe") return null;
  const unknownNote = digest.unknownEpisodeCount > 0
    ? localize(
        ` 판정할 수 없는 회차 ${digest.unknownEpisodeCount}개는 준비 회차에서 뺐어요.`,
        ` ${digest.unknownEpisodeCount} episode(s) that could not be assessed were left out.`,
      )
    : "";
  if (digest.riskLevel === "critical") {
    return {
      tone: "danger",
      title: localize("준비된 회차가 없어요", "No prepared episodes yet"),
      reason: localize(
        digest.phase === "stage-0"
          ? `연재를 시작하려면 먼저 ${digest.targetPreparedCount}회분을 미리 만들어 두는 게 안전해요. 지금은 완성된 준비 회차가 0개예요.${unknownNote}`
          : `완성된 회차가 0개라 다음 게시에 쓸 원고가 없어요.${unknownNote}`,
        digest.phase === "stage-0"
          ? `It is safest to prepare ${digest.targetPreparedCount} episode(s) before launch. None are finished yet.${unknownNote}`
          : `No finished episodes remain for the next release.${unknownNote}`,
      ),
    };
  }
  if (digest.phase === "stage-0") {
    return {
      tone: digest.riskLevel === "danger" ? "danger" : "warning",
      title: localize(
        `연재 시작까지 준비 회차가 ${digest.shortfall}회 부족해요`,
        `${digest.shortfall} more prepared episode(s) needed before launch`,
      ),
      reason: localize(
        `지금 ${digest.preparedCount}/${digest.targetPreparedCount}회가 준비됐어요.${digest.daysUntilLaunch !== null ? ` 시작일까지 ${digest.daysUntilLaunch}일 남았어요.` : ""}${digest.requiredPacePerWeek !== null && digest.requiredPacePerWeek > 0 ? ` 목표를 채우려면 주 ${digest.requiredPacePerWeek}회 속도가 필요해요.` : ""}${unknownNote}`,
        `${digest.preparedCount} of ${digest.targetPreparedCount} episode(s) are ready.${digest.daysUntilLaunch !== null ? ` ${digest.daysUntilLaunch} day(s) left until launch.` : ""}${digest.requiredPacePerWeek !== null && digest.requiredPacePerWeek > 0 ? ` Finishing the target needs ${digest.requiredPacePerWeek} episode(s) per week.` : ""}${unknownNote}`,
      ),
    };
  }
  return {
    tone: digest.riskLevel === "danger" ? "danger" : "warning",
    title: localize(
      `준비 회차가 ${digest.preparedCount}회분뿐이에요`,
      `Only ${digest.preparedCount} prepared episode(s) left`,
    ),
    reason: localize(
      `주당 ${digest.netBurnPerWeek}회씩 줄고 있어요.${digest.projectedExhaustionDate ? ` 지금 속도면 ${digest.projectedExhaustionDate}쯤 준비 회차가 소진돼요.` : ""}${unknownNote}`,
      `The buffer shrinks by ${digest.netBurnPerWeek} episode(s) per week.${digest.projectedExhaustionDate ? ` At this pace it runs out around ${digest.projectedExhaustionDate}.` : ""}${unknownNote}`,
    ),
  };
}
