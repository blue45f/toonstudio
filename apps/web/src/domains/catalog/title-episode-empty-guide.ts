import type { Availability, PlatformId, Pricing } from "@/shared/lib/types";

/**
 * 회차 빈 상태의 "외부 플랫폼에서 보기" 안내 모델 (순수 모듈).
 *
 * 근거 (2026-10-14 실측, 현재 main):
 * - 작품의 외부 연재처는 별도 필드가 아니라 `Title.availability`가 정본이다.
 *   각 항목은 `{ platformId, pricing, isOriginal?, url? }`이며, `url`이 없는
 *   항목도 실제로 존재한다(상세 옆 패널의 AvailabilityRouter가 그런 항목을
 *   링크 없는 "링크 준비 중"으로 그리는 것이 그 증거다).
 * - 그래서 이 모듈은 url을 지어내지 않는다. https URL이 실제로 있는 항목만
 *   외부 링크로 승격하고, 나머지는 "링크 준비 중" 상태로 정직하게 구분한다.
 * - 외부 이동 경로는 AvailabilityRouter와 동일하게 서버 경유
 *   `/api/go/<platformId>?to=<url>`을 쓴다. 서버의 URL 정책(catalog-url-policy)이
 *   https·자격증명 없음만 허용하므로, http·형식 오류·자격증명 포함 URL은
 *   여기서도 링크로 만들지 않는다(눌러도 거절될 죽은 링크 방지).
 */

export interface ExternalPlatformLink {
  readonly platformId: PlatformId;
  readonly pricing: Pricing;
  readonly isOriginal: boolean;
  /** 검증된 원본 연재처 URL (https) */
  readonly url: string;
  /** 서버 경유 이동 경로 — AvailabilityRouter와 동일한 규약 */
  readonly href: string;
}

export type ExternalPlatformGuideState =
  /** 바로 이동할 수 있는 외부 링크가 1개 이상 있다 */
  | "ready"
  /** 연재 플랫폼은 알지만 바로가기 URL이 (아직) 없다 */
  | "no-url"
  /** 연재 플랫폼 정보 자체가 없거나, 노출 킬스위치로 숨겨진 상태 */
  | "none";

export interface ExternalPlatformGuide {
  readonly state: ExternalPlatformGuideState;
  /** 가격 진입 비용이 낮은 순으로 정렬된 외부 링크 (플랫폼당 1개) */
  readonly links: readonly ExternalPlatformLink[];
  /** 대표 링크 = links[0]. 없으면 null. */
  readonly primary: ExternalPlatformLink | null;
  /** URL 유무와 무관하게 알려진 연재 플랫폼 id (중복 제거, 입력 순서) */
  readonly knownPlatformIds: readonly PlatformId[];
}

/** AvailabilityRouter와 같은 정렬 기준: 무료 진입이 먼저 온다. */
const PRICING_ORDER: Record<Pricing, number> = {
  free: 0,
  "wait-free": 1,
  subscription: 2,
  paid: 3,
};

export function buildPlatformGoHref(platformId: PlatformId, url: string): string {
  return `/api/go/${platformId}?to=${encodeURIComponent(url)}`;
}

function usableExternalUrl(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    return trimmed;
  } catch {
    return null;
  }
}

/**
 * 작품의 availability에서 외부 플랫폼 안내를 도출한다.
 *
 * - `availabilityVisible: false`(관리자 킬스위치 `showAvailability` OFF)면
 *   AvailabilityRouter와 마찬가지로 플랫폼 정보를 일절 노출하지 않는다.
 * - 같은 플랫폼이 여러 번 오면 링크가 되는 항목을 우선해 1개로 합친다.
 * - 부수효과 없음. 입력 배열을 바꾸지 않는다.
 */
export function resolveExternalPlatformGuide(
  availability: readonly Availability[] | undefined | null,
  options: { availabilityVisible?: boolean } = {},
): ExternalPlatformGuide {
  if (options.availabilityVisible === false || !availability || availability.length === 0) {
    return { state: "none", links: [], primary: null, knownPlatformIds: [] };
  }

  const knownPlatformIds: PlatformId[] = [];
  const byPlatform = new Map<PlatformId, ExternalPlatformLink>();

  for (const entry of availability) {
    if (!entry || typeof entry.platformId !== "string") continue;
    if (!knownPlatformIds.includes(entry.platformId)) knownPlatformIds.push(entry.platformId);
    const url = usableExternalUrl(entry.url);
    if (!url) continue;
    const candidate: ExternalPlatformLink = {
      platformId: entry.platformId,
      pricing: entry.pricing,
      isOriginal: entry.isOriginal === true,
      url,
      href: buildPlatformGoHref(entry.platformId, url),
    };
    const existing = byPlatform.get(entry.platformId);
    if (!existing) {
      byPlatform.set(entry.platformId, candidate);
      continue;
    }
    // 같은 플랫폼 중복 시: 독점(오리지널) 항목을, 그다음 더 저렴한 진입을 남긴다.
    if (candidate.isOriginal !== existing.isOriginal) {
      if (candidate.isOriginal) byPlatform.set(entry.platformId, candidate);
    } else if (PRICING_ORDER[candidate.pricing] < PRICING_ORDER[existing.pricing]) {
      byPlatform.set(entry.platformId, candidate);
    }
  }

  const links = [...byPlatform.values()].sort((a, b) => {
    const byPricing = PRICING_ORDER[a.pricing] - PRICING_ORDER[b.pricing];
    if (byPricing !== 0) return byPricing;
    if (a.isOriginal !== b.isOriginal) return a.isOriginal ? -1 : 1;
    return knownPlatformIds.indexOf(a.platformId) - knownPlatformIds.indexOf(b.platformId);
  });

  return {
    state: links.length > 0 ? "ready" : knownPlatformIds.length > 0 ? "no-url" : "none",
    links,
    primary: links[0] ?? null,
    knownPlatformIds,
  };
}
