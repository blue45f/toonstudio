/**
 * 연재 버퍼 방패 (창의 기능 O-1) — 순수 계산 모듈.
 *
 * 원칙 (REPORT ★2):
 * - 버퍼는 저장 데이터가 아니라 회차 상태에서 도출되는 순수 계산이다.
 *   신규 저장은 작가가 정하는 안전선(BufferPolicy)뿐이다.
 * - "완성" 판정은 단계 도출(S2)과 같은 근거를 쓴다: 협업 상태가
 *   `publish-ready`인 회차만 완성으로 센다. 예약 여부는 게시 계획
 *   (EpisodeReleasePlan.status === "scheduled")으로 가른다.
 * - 판정 불가 회차는 버퍼에서 제외하되 개수를 함께 돌려준다 — 침묵하는
 *   거짓 안심을 막기 위해서다. cancelled는 S2 도출에서도 전 단계
 *   unknown이라 여기서도 unknown이다.
 * - 게시 주기는 작품 일정에서 도출한다(deriveReleaseIntervalDays).
 *   일정이 부족하면 호출자가 정한 fallback(기본 주 1회 7일)을 쓴다.
 */
import type { EpisodeCollaboration, EpisodeReleasePlan } from "@toonstudio/core/production";

export type EpisodeBufferState =
  | "published"
  | "scheduled" // 완성 + 예약됨
  | "ready" // 완성, 미예약
  | "inProgress"
  | "unknown"; // 단계 판정 불가

export interface EpisodeBufferFact {
  readonly episodeId: string;
  readonly state: EpisodeBufferState;
  readonly scheduledFor?: string; // ISO date — scheduled 일 때
}

export interface BufferPolicy {
  /** 작가가 정하는 안전선 (단위: 게시 횟수). 기본 2 */
  readonly safeBufferCount: number;
}

export const DEFAULT_SAFE_BUFFER_COUNT = 2;
export const DEFAULT_RELEASE_INTERVAL_DAYS = 7;

export interface SerializationBufferDigest {
  /** 지금부터 몇 번의 게시를 완성 원고로 버틸 수 있는가 */
  readonly bufferedReleases: number;
  /** 작품의 실제 게시 주기로 환산한 버퍼 일수 (격주·월간 대응) */
  readonly bufferedDays: number;
  readonly level: "safe" | "thin" | "empty";
  readonly unknownEpisodeCount: number; // 판정 불가로 제외된 회차
  /** 이 속도가 유지될 때 재고가 소진되는 예상 게시일 (ISO date) */
  readonly projectedEmptyDate?: string;
}

export interface DeriveSerializationBufferInput {
  readonly episodes: readonly EpisodeBufferFact[];
  /** 일정 데이터에서 도출한 평균 게시 간격(일). 주 1회면 7 */
  readonly releaseIntervalDays: number;
  readonly policy: BufferPolicy;
  readonly today: string; // ISO date
}

const DAY_MS = 86_400_000;

function parseDateMs(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function normalizeIntervalDays(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_RELEASE_INTERVAL_DAYS;
}

function normalizeSafeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_SAFE_BUFFER_COUNT;
}

/**
 * 회차 협업 상태 + 게시 계획 → 버퍼 사실.
 * 근거가 없는 상태를 지어내지 않는다: publish-ready가 아니면 완성으로
 * 세지 않고, cancelled는 unknown으로 분리한다.
 */
export function episodeBufferFacts(
  episodes: readonly Pick<EpisodeCollaboration, "episodeId" | "state">[],
  releasePlans: readonly Pick<EpisodeReleasePlan, "episodeId" | "status" | "scheduledAt">[] = [],
): readonly EpisodeBufferFact[] {
  const scheduledByEpisode = new Map<string, string | undefined>();
  for (const plan of releasePlans) {
    if (plan.status !== "scheduled") continue;
    // 같은 회차에 예약이 여럿이면 가장 이른 예약일을 근거로 삼는다.
    const prev = scheduledByEpisode.get(plan.episodeId);
    if (!scheduledByEpisode.has(plan.episodeId) || (plan.scheduledAt && prev && plan.scheduledAt < prev)) {
      scheduledByEpisode.set(plan.episodeId, plan.scheduledAt ?? prev);
    }
  }
  return episodes.map((episode) => {
    if (episode.state === "published") return { episodeId: episode.episodeId, state: "published" };
    if (episode.state === "cancelled") return { episodeId: episode.episodeId, state: "unknown" };
    if (episode.state === "publish-ready") {
      if (scheduledByEpisode.has(episode.episodeId)) {
        const scheduledFor = scheduledByEpisode.get(episode.episodeId);
        return {
          episodeId: episode.episodeId,
          state: "scheduled",
          ...(scheduledFor ? { scheduledFor } : {}),
        };
      }
      return { episodeId: episode.episodeId, state: "ready" };
    }
    return { episodeId: episode.episodeId, state: "inProgress" };
  });
}

/**
 * 일정 날짜들에서 실제 게시 간격을 도출한다 — 간격들의 중앙값(일).
 * 날짜가 2개 미만이거나 파싱 불가면 fallback을 돌려준다.
 */
export function deriveReleaseIntervalDays(
  dates: readonly (string | null | undefined)[],
  fallback: number = DEFAULT_RELEASE_INTERVAL_DAYS,
): number {
  const times = dates
    .map((d) => (d ? parseDateMs(d) : null))
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  const unique = [...new Set(times)];
  if (unique.length < 2) return normalizeIntervalDays(fallback);
  const gaps: number[] = [];
  for (let i = 1; i < unique.length; i += 1) {
    const gapDays = Math.round((unique[i]! - unique[i - 1]!) / DAY_MS);
    if (gapDays > 0) gaps.push(gapDays);
  }
  if (!gaps.length) return normalizeIntervalDays(fallback);
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)]!;
}

export function deriveSerializationBuffer(
  input: DeriveSerializationBufferInput,
): SerializationBufferDigest {
  const interval = normalizeIntervalDays(input.releaseIntervalDays);
  const safe = normalizeSafeCount(input.policy.safeBufferCount);
  let bufferedReleases = 0;
  let unknownEpisodeCount = 0;
  for (const episode of input.episodes) {
    if (episode.state === "scheduled" || episode.state === "ready") bufferedReleases += 1;
    else if (episode.state === "unknown") unknownEpisodeCount += 1;
  }
  const bufferedDays = bufferedReleases * interval;
  const level: SerializationBufferDigest["level"] =
    bufferedReleases === 0 ? "empty" : bufferedReleases < safe ? "thin" : "safe";
  const todayMs = parseDateMs(input.today);
  return {
    bufferedReleases,
    bufferedDays,
    level,
    unknownEpisodeCount,
    ...(todayMs !== null ? { projectedEmptyDate: toIsoDate(todayMs + bufferedDays * DAY_MS) } : {}),
  };
}

/**
 * 요약 표면(연재 센터 현황)용 도출 — 서버 요약의 readyBufferCount는 이미
 * 완성 회차 집계값이다. 판정 불가 개수는 요약에 없으므로 0으로 두되,
 * 호출 표면은 "판정 불가" 문구를 이 경로로 만들지 않는다(NOTES 참조).
 */
export function deriveBufferFromSummary(input: {
  readonly readyBufferCount: number;
  readonly releaseIntervalDays: number;
  readonly policy: BufferPolicy;
  readonly today: string;
}): SerializationBufferDigest {
  const count = Number.isFinite(input.readyBufferCount) && input.readyBufferCount > 0
    ? Math.floor(input.readyBufferCount)
    : 0;
  return deriveSerializationBuffer({
    episodes: Array.from({ length: count }, (_, i) => ({
      episodeId: `summary-${i}`,
      state: "ready" as const,
    })),
    releaseIntervalDays: input.releaseIntervalDays,
    policy: input.policy,
    today: input.today,
  });
}

/** 휴재 시나리오 계산 (O-3 키트로 넘기는 값) */
export interface HiatusScenario {
  readonly startsOn: string;
  readonly weeks: number;
  readonly coveredByBufferWeeks: number; // 버퍼만으로 게시를 유지할 수 있는 주
  readonly resumeDate: string;
  readonly gapReleases: number; // 실제 결방이 되는 게시 횟수
  /** 버퍼가 소진되는 날짜 (ISO date) — 커버가 휴재보다 짧을 때만 */
  readonly bufferRunsOutOn?: string;
}

export function planHiatus(
  digest: SerializationBufferDigest,
  input: { readonly startsOn: string; readonly weeks: number; readonly releaseIntervalDays: number },
): HiatusScenario {
  const interval = normalizeIntervalDays(input.releaseIntervalDays);
  const weeks = Number.isFinite(input.weeks) && input.weeks > 0 ? input.weeks : 0;
  const hiatusDays = Math.round(weeks * 7);
  const releasesDuring = hiatusDays === 0 ? 0 : Math.ceil(hiatusDays / interval);
  const covered = Math.min(digest.bufferedReleases, releasesDuring);
  const startMs = parseDateMs(input.startsOn);
  return {
    startsOn: input.startsOn,
    weeks,
    coveredByBufferWeeks: Math.round(((covered * interval) / 7) * 10) / 10,
    resumeDate: startMs !== null ? toIsoDate(startMs + hiatusDays * DAY_MS) : input.startsOn,
    gapReleases: releasesDuring - covered,
    ...(startMs !== null && covered < releasesDuring
      ? { bufferRunsOutOn: toIsoDate(startMs + covered * interval * DAY_MS) }
      : {}),
  };
}

export type BufferLocalize = (ko: string, en: string) => string;

/**
 * NowCard 경고 규칙 — 안전선 하회일 때만 카드 내용을 돌려준다.
 * 표면은 이 결과를 자기 NowCard 슬롯/경고 자리에 그대로 싣는다.
 * 안전하면 null: 경고가 상시 떠 있으면 작가가 경고를 끈다(REPORT 실패 케이스 b).
 */
export function serializationBufferWarning(
  digest: SerializationBufferDigest,
  localize: BufferLocalize,
): { readonly tone: "danger" | "warning"; readonly title: string; readonly reason: string } | null {
  if (digest.level === "safe") return null;
  const unknownNote = digest.unknownEpisodeCount > 0
    ? localize(
        ` 판정할 수 없는 회차 ${digest.unknownEpisodeCount}개는 버퍼에서 뺐어요.`,
        ` ${digest.unknownEpisodeCount} episode(s) that could not be assessed were left out of the buffer.`,
      )
    : "";
  if (digest.level === "empty") {
    return {
      tone: "danger",
      title: localize("연재 버퍼가 비었어요", "Your serialization buffer is empty"),
      reason: localize(
        `완성된 회차가 없어 다음 게시를 버틸 재고가 없어요.${unknownNote}`,
        `No finished episodes are left to cover the next release.${unknownNote}`,
      ),
    };
  }
  return {
    tone: "warning",
    title: localize(
      `연재 버퍼가 ${digest.bufferedReleases}회분뿐이에요`,
      `Only ${digest.bufferedReleases} release(s) left in your buffer`,
    ),
    reason: localize(
      `안전선 아래예요. 지금 속도면 ${digest.projectedEmptyDate ?? "-"}쯤 재고가 소진돼요.${unknownNote}`,
      `Below your safety line. At the current pace the buffer runs out around ${digest.projectedEmptyDate ?? "-"}.${unknownNote}`,
    ),
  };
}
