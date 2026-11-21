/**
 * title-detail-decision-model.ts — /title/:slug 3초 작품 결정 & 페이스 리본 순수 모델.
 *
 * 실제 title(회차 수·장르·연재 상태·무료 감상처)와 검증된 episodes 데이터만 사용하며,
 * 회차 수나 무료 회차를 임의로 지어내지 않는다. 완독 시간은 회당 3분 기준 추정값임을
 * 라벨에 명시한다.
 */

import { spectrumGradient } from "@/shared/lib/genre-color";
import { PLATFORMS } from "@/shared/lib/platforms";
import type { ThreeCutRemixBlueprint } from "@/shared/lib/title-to-three-cut-remix-bridge";
import type { SerialStatus, Title } from "@/shared/lib/types";

import { resolveExternalPlatformGuide } from "../title-episode-empty-guide";
import { resolveTotalEpisodes, type TitleEpisode } from "../title-episodes";

export const MINUTES_PER_EPISODE_ESTIMATE = 3;
export const COMMUTE_EPISODES_PER_TRIP = 3;
export const WEEKEND_EPISODES_PER_HOUR = 20;

export type TitleReadingPaceId = "commute-10m" | "weekend-binge";

export type TitleFreeEntryKind = "free" | "wait-free" | "subscription" | "paid" | "unknown";

export interface TitlePacePlan {
  readonly id: TitleReadingPaceId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly recommended: boolean;
}

export interface TitleReadFirstAction {
  readonly kind: "internal" | "external" | "episodes-anchor";
  readonly href: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly platformName: string | null;
}

export interface TitleQuickDecisionModel {
  readonly episodeCount: number | null;
  readonly estimatedMinutes: number | null;
  readonly durationLabelKo: string;
  readonly durationLabelEn: string;
  readonly episodeMetaKo: string;
  readonly episodeMetaEn: string;
  readonly statusBadgeKo: string;
  readonly statusBadgeEn: string;
  readonly freeEntryKind: TitleFreeEntryKind;
  readonly freeEntryLabelKo: string;
  readonly freeEntryLabelEn: string;
  readonly freePlatformCount: number;
  readonly recommendedPaceId: TitleReadingPaceId;
  readonly pacePlans: readonly [TitlePacePlan, TitlePacePlan];
  readonly readFirstAction: TitleReadFirstAction;
  readonly remixHref: string;
  readonly remixLabelKo: string;
  readonly remixLabelEn: string;
  readonly spectrumCss: string;
}

const STATUS_COPY: Readonly<Record<SerialStatus, readonly [string, string]>> = {
  ongoing: ["연재 중", "Ongoing"],
  completed: ["완결작", "Completed"],
  hiatus: ["휴재 중", "On hiatus"],
};

export function formatEstimatedDurationKo(minutes: number): string {
  if (minutes < 60) return `약 ${minutes}분 (추정)`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (remainder === 0) return `약 ${hours}시간 (추정)`;
  return `약 ${hours}시간 ${remainder}분 (추정)`;
}

export function formatEstimatedDurationEn(minutes: number): string {
  if (minutes < 60) return `~${minutes}m (est.)`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (remainder === 0) return `~${hours}h (est.)`;
  return `~${hours}h ${remainder}m (est.)`;
}

function resolveFreeEntry(title: Pick<Title, "availability">, showAvailability: boolean): {
  kind: TitleFreeEntryKind;
  labelKo: string;
  labelEn: string;
  freePlatformCount: number;
} {
  if (!showAvailability || title.availability.length === 0) {
    return {
      kind: "unknown",
      labelKo: "감상 조건 확인",
      labelEn: "Check access",
      freePlatformCount: 0,
    };
  }
  const freeCount = title.availability.filter((item) => item.pricing === "free").length;
  const waitFreeCount = title.availability.filter((item) => item.pricing === "wait-free").length;
  const freePlatformCount = freeCount + waitFreeCount;

  if (freeCount > 0) {
    return {
      kind: "free",
      labelKo: freeCount > 1 ? `무료 진입 ${freeCount}곳` : "무료 회차 시작 가능",
      labelEn: freeCount > 1 ? `Free on ${freeCount} platforms` : "Free start available",
      freePlatformCount,
    };
  }
  if (waitFreeCount > 0) {
    return {
      kind: "wait-free",
      labelKo: "기다리면 무료 진입",
      labelEn: "Wait-free entry",
      freePlatformCount,
    };
  }
  if (title.availability.some((item) => item.pricing === "subscription")) {
    return {
      kind: "subscription",
      labelKo: "구독 이용권 감상",
      labelEn: "Subscription access",
      freePlatformCount: 0,
    };
  }
  return {
    kind: "paid",
    labelKo: "유료 회차 제공",
    labelEn: "Paid episodes",
    freePlatformCount: 0,
  };
}

function resolveRecommendedPace(status: SerialStatus, episodeCount: number | null): TitleReadingPaceId {
  if (status === "completed" && (episodeCount === null || episodeCount >= 20)) {
    return "weekend-binge";
  }
  if (episodeCount !== null && episodeCount >= 60) {
    return "weekend-binge";
  }
  return "commute-10m";
}

function buildPacePlans(
  status: SerialStatus,
  episodeCount: number | null,
  recommendedPaceId: TitleReadingPaceId,
): readonly [TitlePacePlan, TitlePacePlan] {
  const commuteTrips =
    episodeCount !== null ? Math.max(1, Math.ceil(episodeCount / COMMUTE_EPISODES_PER_TRIP)) : null;
  const weekendHours =
    episodeCount !== null ? Math.max(1, Math.ceil(episodeCount / WEEKEND_EPISODES_PER_HOUR)) : null;

  const commutePlan: TitlePacePlan = {
    id: "commute-10m",
    labelKo: "출퇴근 10분",
    labelEn: "10m Commute",
    summaryKo:
      commuteTrips !== null
        ? `한 번에 3화씩 · 출퇴근 ${commuteTrips}회 완독 (회당 3분 추정)`
        : status === "ongoing"
          ? "회당 3분 추정 · 출퇴근길 하루 3화씩 연재 따라잡기"
          : "회당 3분 추정 · 출퇴근길 가볍게 3화씩 시작",
    summaryEn:
      commuteTrips !== null
        ? `3 eps/trip · est. ${commuteTrips} commutes (3m/ep est.)`
        : status === "ongoing"
          ? "Est. 3m/ep · catch up 3 episodes per commute"
          : "Est. 3m/ep · easy 3-episode commute starter",
    recommended: recommendedPaceId === "commute-10m",
  };

  const weekendPlan: TitlePacePlan = {
    id: "weekend-binge",
    labelKo: "주말 정주행",
    labelEn: "Weekend Binge",
    summaryKo:
      weekendHours !== null
        ? `시간당 20화 페이스 · 주말 약 ${weekendHours}시간 정주행 (추정)`
        : status === "completed"
          ? "완결 흐름 그대로 · 주말에 끊김 없이 몰아보기 (회당 3분 추정)"
          : "주말 집중 몰아보기 · 초반 회차 흐름 한 번에 파악 (회당 3분 추정)",
    summaryEn:
      weekendHours !== null
        ? `~20 eps/hr · est. ~${weekendHours}h weekend binge`
        : status === "completed"
          ? "Completed arc · uninterrupted weekend binge (3m/ep est.)"
          : "Weekend focus run · dive into the opening arc (3m/ep est.)",
    recommended: recommendedPaceId === "weekend-binge",
  };

  return [commutePlan, weekendPlan];
}

function resolveReadFirstAction(input: {
  readonly title: Pick<Title, "availability">;
  readonly showAvailability: boolean;
  readonly firstEpisodeHref: string | null;
}): TitleReadFirstAction {
  if (input.firstEpisodeHref) {
    return {
      kind: "internal",
      href: input.firstEpisodeHref,
      labelKo: "1화 바로 읽기",
      labelEn: "Read Ep. 1",
      platformName: null,
    };
  }

  const externalGuide = resolveExternalPlatformGuide(input.title.availability, {
    availabilityVisible: input.showAvailability,
  });
  if (externalGuide.primary) {
    const platformName = PLATFORMS[externalGuide.primary.platformId]?.name ?? externalGuide.primary.platformId;
    return {
      kind: "external",
      href: externalGuide.primary.href,
      labelKo: "1화 바로 읽기",
      labelEn: "Read Ep. 1",
      platformName,
    };
  }

  return {
    kind: "episodes-anchor",
    href: "#title-episodes-anchor",
    labelKo: "1화·회차 확인",
    labelEn: "Check Ep. 1",
    platformName: null,
  };
}

export function buildTitleQuickDecision(input: {
  readonly title: Pick<Title, "slug" | "genres" | "status" | "totalEpisodes" | "availability">;
  readonly episodes?: readonly TitleEpisode[];
  readonly showAvailability: boolean;
  readonly firstEpisodeHref: string | null;
  readonly remixBlueprint: ThreeCutRemixBlueprint;
}): TitleQuickDecisionModel {
  const episodeCount = resolveTotalEpisodes(input.title, input.episodes) ?? null;
  const estimatedMinutes = episodeCount !== null ? episodeCount * MINUTES_PER_EPISODE_ESTIMATE : null;
  const durationLabelKo =
    estimatedMinutes !== null
      ? formatEstimatedDurationKo(estimatedMinutes)
      : "회당 3분 기준 (추정)";
  const durationLabelEn =
    estimatedMinutes !== null
      ? formatEstimatedDurationEn(estimatedMinutes)
      : "3m/ep baseline (est.)";
  const episodeMetaKo =
    episodeCount !== null
      ? `총 ${episodeCount.toLocaleString("ko-KR")}화 · 회당 3분 추정`
      : "총 회차 수 미공개 · 회당 3분 추정";
  const episodeMetaEn =
    episodeCount !== null
      ? `${episodeCount.toLocaleString("en-US")} eps · est. 3m/ep`
      : "Total episodes pending · est. 3m/ep";

  const [statusBadgeKo, statusBadgeEn] = STATUS_COPY[input.title.status];
  const freeEntry = resolveFreeEntry(input.title, input.showAvailability);
  const recommendedPaceId = resolveRecommendedPace(input.title.status, episodeCount);
  const pacePlans = buildPacePlans(input.title.status, episodeCount, recommendedPaceId);
  const readFirstAction = resolveReadFirstAction({
    title: input.title,
    showAvailability: input.showAvailability,
    firstEpisodeHref: input.firstEpisodeHref,
  });

  return {
    episodeCount,
    estimatedMinutes,
    durationLabelKo,
    durationLabelEn,
    episodeMetaKo,
    episodeMetaEn,
    statusBadgeKo,
    statusBadgeEn,
    freeEntryKind: freeEntry.kind,
    freeEntryLabelKo: freeEntry.labelKo,
    freeEntryLabelEn: freeEntry.labelEn,
    freePlatformCount: freeEntry.freePlatformCount,
    recommendedPaceId,
    pacePlans,
    readFirstAction,
    remixHref: input.remixBlueprint.studioLaunchHref,
    remixLabelKo: "이 작품 분위기로 3컷 리믹스",
    remixLabelEn: "3-cut remix in this mood",
    spectrumCss: spectrumGradient(input.title.genres, 90),
  };
}
