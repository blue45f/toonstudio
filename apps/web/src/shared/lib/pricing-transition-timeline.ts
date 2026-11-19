import { PLATFORMS } from "./platforms";

import type { Availability, PlatformId, Pricing, SerialStatus } from "./types";

export type PricingTransitionKind =
  | "free-conversion"
  | "wait-free-conversion"
  | "subscription-added"
  | "completed-binge"
  | "model-change";

export interface PricingTransitionEvent {
  readonly id: string;
  readonly observedAt: string;
  readonly kind: PricingTransitionKind;
  readonly platformId?: PlatformId;
  readonly platformName?: string;
  readonly platformColor?: string;
  readonly previousLabel: string;
  readonly currentLabel: string;
  readonly summaryKo: string;
  readonly url?: string;
  /** 모델 전환은 실데이터, 예상 단가는 모델 추정임을 정직하게 구분한다. */
  readonly modelBasedOnly: true;
}

export interface CatalogTitleSnapshot {
  readonly observedAt: string;
  readonly status: SerialStatus;
  readonly availability: readonly Availability[];
}

const PRICING_LABEL_KO: Record<Pricing, string> = {
  free: "완전 무료",
  "wait-free": "기다리면 무료",
  paid: "건별 유료",
  subscription: "월정액 구독",
};

const STATUS_LABEL_KO: Record<SerialStatus, string> = {
  ongoing: "연재중",
  completed: "완결",
  hiatus: "휴재",
};

const PRIORITY_ORDER: Record<PricingTransitionKind, number> = {
  "free-conversion": 0,
  "wait-free-conversion": 1,
  "subscription-added": 2,
  "completed-binge": 3,
  "model-change": 4,
};

/**
 * 이전 스냅샷과 최신 스냅샷을 비교해
 * '무료 전환 · 기다무 전환 · 구독 편입 · 완결 정주행 전환' 이벤트를 결정적으로 추출한다.
 */
export function diffPricingTransitions(
  previous: CatalogTitleSnapshot | null | undefined,
  current: CatalogTitleSnapshot,
): PricingTransitionEvent[] {
  if (!previous) return [];

  const events: PricingTransitionEvent[] = [];
  const prevByPlatform = new Map<PlatformId, Availability>();
  for (const item of previous.availability) {
    prevByPlatform.set(item.platformId, item);
  }

  for (const curr of current.availability) {
    const prev = prevByPlatform.get(curr.platformId);
    if (!prev || prev.pricing === curr.pricing) continue;

    const meta = PLATFORMS[curr.platformId];
    const platformName = meta?.name ?? curr.platformId;
    const platformColor = meta?.color;
    const previousLabel = PRICING_LABEL_KO[prev.pricing];
    const currentLabel = PRICING_LABEL_KO[curr.pricing];

    let kind: PricingTransitionKind = "model-change";
    let summaryKo = `${platformName} 이용 방식이 ${previousLabel}에서 ${currentLabel}로 변경되었습니다.`;

    if (curr.pricing === "free") {
      kind = "free-conversion";
      summaryKo = `${platformName}에서 완전 무료로 전환되었습니다 (모델 기준).`;
    } else if (curr.pricing === "wait-free" && prev.pricing === "paid") {
      kind = "wait-free-conversion";
      summaryKo = `${platformName}에서 기다리면 무료로 전환되었습니다 (모델 기준).`;
    } else if (curr.pricing === "subscription") {
      kind = "subscription-added";
      summaryKo = `${platformName} 월정액 구독 대상에 포함되었습니다 (모델 기준).`;
    }

    events.push({
      id: `${current.observedAt}:${curr.platformId}:${prev.pricing}->${curr.pricing}`,
      observedAt: current.observedAt,
      kind,
      platformId: curr.platformId,
      platformName,
      platformColor,
      previousLabel,
      currentLabel,
      summaryKo,
      url: curr.url,
      modelBasedOnly: true,
    });
  }

  if (previous.status !== "completed" && current.status === "completed") {
    events.push({
      id: `${current.observedAt}:status:${previous.status}->completed`,
      observedAt: current.observedAt,
      kind: "completed-binge",
      previousLabel: STATUS_LABEL_KO[previous.status],
      currentLabel: STATUS_LABEL_KO.completed,
      summaryKo: `${STATUS_LABEL_KO[previous.status]}에서 완결로 전환되어 전 회차 정주행이 가능합니다.`,
      modelBasedOnly: true,
    });
  }

  events.sort(
    (a, b) =>
      PRIORITY_ORDER[a.kind] - PRIORITY_ORDER[b.kind] ||
      a.id.localeCompare(b.id),
  );
  return events;
}
