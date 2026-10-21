/**
 * 독자 반응 인용 카드 (순수 모델) — F3 회차 성과 → 기획 피드백 맵의 인용 부분.
 *
 * 체크리스트 '독자 반응 인용 카드'를 F3에 병합한 것이다: 직전 회차까지의
 * 실집계 반응을 다음 회차 기획 시작 화면에 인용 카드로 띄우고, 인용한 내용을
 * 기획 메모로 저장할 수 있게 한다.
 *
 * 정직성 원칙 (오버레이·애널리틱스와 동일):
 * - 인용은 F1 실집계 범위(조회수·회차별 조회수·리텐션·유입) 안에서만 만든다.
 *   mock 응답·연결 전·로딩·실패 상태에서는 인용 문장이 하나도 생기지 않는다.
 * - 실집계가 없는 지표는 지어내지 않고 "미수집"으로 명시한다:
 *   좋아요·댓글·새 구독은 회차 단위 수집 저장소가 없어 API가 생략하고
 *   (creator-analytics.traffic-source.ts), 별점과 댓글 반응 상위 문장은
 *   DTO에 필드 자체가 없다. 단, 응답이 실제로 값을 실어 온 회차는 그 값을
 *   인용한다 — 생략(null)일 때만 미수집이다.
 * - 댓글 "문장"을 인용하는 척하지 않는다. 수집된 문장이 없으므로 인용 카드는
 *   측정된 숫자의 사실 문장만 인용하고, 문장 인용은 미수집으로 고지한다.
 */
import {
  buildEpisodeMetricsOverlay,
  episodeMetricsStatusLine,
  formatMetricCount,
  formatMetricPct,
  type EpisodeMetrics,
  type EpisodeMetricsLoad,
  type EpisodeMetricsOverlay,
} from "./studio-episode-metrics-overlay";

export type ReaderReactionQuoteId = "latest-episode" | "total-views" | "traffic";

export interface ReaderReactionQuote {
  readonly id: ReaderReactionQuoteId;
  readonly label: string;
  readonly text: string;
}

export type ReaderReactionUncollectedKey =
  | "likes"
  | "comments"
  | "newSubscribers"
  | "rating"
  | "topCommentSentences";

export interface ReaderReactionUncollected {
  readonly key: ReaderReactionUncollectedKey;
  readonly label: string;
  readonly reason: string;
}

/** 수집 저장소가 없어 항상 미수집인 지표 — DTO에 필드 자체가 없다. */
const ALWAYS_UNCOLLECTED: readonly ReaderReactionUncollected[] = Object.freeze([
  Object.freeze({
    key: "rating" as const,
    label: "별점",
    reason: "별점을 수집하는 저장소가 없어요",
  }),
  Object.freeze({
    key: "topCommentSentences" as const,
    label: "댓글 반응 상위 문장",
    reason: "댓글 문장을 수집하는 저장소가 없어 인용할 문장이 없어요",
  }),
]);

const EPISODE_UNCOLLECTED_REASON = "회차 단위 수집 저장소가 없어요";

export interface ReaderReactionQuoteCardModel {
  readonly status: EpisodeMetricsOverlay["status"];
  readonly isLive: boolean;
  /** 인용의 기준이 된 가장 최근 측정 회차. 측정 회차가 없으면 null. */
  readonly sourceEpisode: EpisodeMetrics | null;
  readonly quotes: readonly ReaderReactionQuote[];
  /** 미수집으로 정직하게 표시할 지표. 측정값이 실제로 있는 지표는 빠진다. */
  readonly uncollected: readonly ReaderReactionUncollected[];
  /** 기획 메모로 저장할 본문. 인용이 없으면 null — 빈 메모를 저장하지 않는다. */
  readonly memoText: string | null;
  /** 성과 상태 한 줄 (오버레이와 같은 문구). */
  readonly statusLine: string;
  /** 인용이 없을 때의 빈 상태 안내. 인용이 있으면 null. */
  readonly emptyLine: string | null;
}

const PERIOD_DAYS: Readonly<Record<string, number>> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function latestEpisodeQuote(metrics: EpisodeMetrics): ReaderReactionQuote {
  const parts: string[] = [];
  if (metrics.views !== null) parts.push(`조회 ${formatMetricCount(metrics.views)}`);
  if (metrics.retentionPct !== null) {
    parts.push(`1화 대비 잔존 ${formatMetricPct(metrics.retentionPct)}%`);
  }
  if (metrics.dropOffPct !== null && metrics.dropOffPct > 0) {
    parts.push(`직전 화 대비 이탈 ${formatMetricPct(metrics.dropOffPct)}%`);
  }
  if (metrics.likes !== null) parts.push(`좋아요 ${formatMetricCount(metrics.likes)}`);
  if (metrics.comments !== null) parts.push(`댓글 ${formatMetricCount(metrics.comments)}`);
  if (metrics.newSubscribers !== null) {
    parts.push(`새 구독 ${formatMetricCount(metrics.newSubscribers)}`);
  }
  const verdict = metrics.isDropOff
    ? " 이탈 지점으로 판정된 회차예요 — 비트와 마무리 훅을 점검해 보세요."
    : "";
  return Object.freeze({
    id: "latest-episode" as const,
    label: `${metrics.episodeNumber}화 독자 반응`,
    text: `가장 최근에 측정된 회차는 ${metrics.episodeNumber}화예요. ${parts.join(" · ")}.${verdict}`,
  });
}

function episodeUncollected(
  sourceEpisode: EpisodeMetrics | null,
): readonly ReaderReactionUncollected[] {
  const items: ReaderReactionUncollected[] = [];
  if (sourceEpisode?.likes === null || sourceEpisode === null) {
    items.push(
      Object.freeze({ key: "likes" as const, label: "좋아요", reason: EPISODE_UNCOLLECTED_REASON }),
    );
  }
  if (sourceEpisode?.comments === null || sourceEpisode === null) {
    items.push(
      Object.freeze({ key: "comments" as const, label: "댓글 수", reason: EPISODE_UNCOLLECTED_REASON }),
    );
  }
  if (sourceEpisode?.newSubscribers === null || sourceEpisode === null) {
    items.push(
      Object.freeze({
        key: "newSubscribers" as const,
        label: "새 구독",
        reason: EPISODE_UNCOLLECTED_REASON,
      }),
    );
  }
  return Object.freeze(items);
}

/**
 * 실집계 로드 상태를 인용 카드 모델로 접는다.
 *
 * 기준 회차는 "측정된 회차 중 가장 큰 회차 번호"다. 아직 발행되지 않은
 * 기획 회차는 응답에 없으므로, 인용은 항상 이미 독자 반응이 쌓인 회차에서만
 * 나온다.
 */
export function buildReaderReactionQuoteCard(
  load: EpisodeMetricsLoad | null | undefined,
): ReaderReactionQuoteCardModel {
  // 응답에 실린 회차 번호를 참조로 삼아 오버레이를 만든다 — 기획 회차 목록이
  // 없어도 인용은 응답 자체만으로 성립한다.
  const response = load?.status === "live" && load.response && !load.response.mock
    ? load.response
    : null;
  const refNumbers = new Set<number>();
  for (const episode of response?.episodes ?? []) {
    if (Number.isFinite(episode?.episode) && episode.episode >= 1) {
      refNumbers.add(Math.floor(episode.episode));
    }
  }
  for (const point of response?.retention ?? []) {
    if (Number.isFinite(point?.episode) && point.episode >= 1) {
      refNumbers.add(Math.floor(point.episode));
    }
  }
  const refs = [...refNumbers]
    .sort((a, b) => a - b)
    .map((episodeNumber) => ({ episodeNumber }));
  const overlay = buildEpisodeMetricsOverlay(refs, load ?? null);
  const statusLine = episodeMetricsStatusLine(overlay);

  const measured = overlay.entries
    .map((entry) => entry.metrics)
    .filter((metrics): metrics is EpisodeMetrics => metrics !== null);
  const sourceEpisode = measured[measured.length - 1] ?? null;
  const uncollected = Object.freeze([
    ...episodeUncollected(sourceEpisode),
    ...ALWAYS_UNCOLLECTED,
  ]);

  if (!overlay.isLive || !sourceEpisode) {
    return Object.freeze({
      status: overlay.status,
      isLive: overlay.isLive,
      sourceEpisode: null,
      quotes: Object.freeze([]),
      uncollected,
      memoText: null,
      statusLine,
      emptyLine:
        overlay.isLive
          ? "회차 성과가 연결됐지만 아직 측정된 회차가 없어요. 작품을 발행하고 조회가 쌓이면 직전 회차 반응을 여기에 인용해 드려요."
          : statusLine,
    });
  }

  const quotes: ReaderReactionQuote[] = [latestEpisodeQuote(sourceEpisode)];
  if (overlay.totalViews !== null) {
    const days = overlay.period ? PERIOD_DAYS[overlay.period] : null;
    const scope = days ? `최근 ${days}일` : "집계 기간";
    let delta = "";
    if (overlay.totalViewsDeltaPct !== null && overlay.totalViewsDeltaPct !== 0) {
      const direction = overlay.totalViewsDeltaPct > 0 ? "늘었어요" : "줄었어요";
      delta = ` 직전 기간보다 ${formatMetricPct(Math.abs(overlay.totalViewsDeltaPct))}% ${direction}.`;
    }
    quotes.push(
      Object.freeze({
        id: "total-views" as const,
        label: "기간 전체 조회",
        text: `${scope} 전체 조회는 ${formatMetricCount(overlay.totalViews)}예요.${delta}`,
      }),
    );
  }
  if (overlay.topTrafficSource) {
    const top = overlay.topTrafficSource;
    quotes.push(
      Object.freeze({
        id: "traffic" as const,
        label: "유입",
        text: `가장 큰 유입은 ${top.labelKo}예요. 방문 ${formatMetricCount(top.visits)} · 전체 유입의 ${formatMetricPct(top.sharePct)}%.`,
      }),
    );
  }

  const frozenQuotes = Object.freeze(quotes);
  const days = overlay.period ? PERIOD_DAYS[overlay.period] : null;
  const generatedDate = overlay.generatedAt ? overlay.generatedAt.slice(0, 10) : null;
  const memoLines = [
    `[독자 반응 인용] ${sourceEpisode.episodeNumber}화까지의 실집계${days ? ` · 최근 ${days}일` : ""}${generatedDate ? ` · ${generatedDate} 기준` : ""}`,
    ...frozenQuotes.map((quote) => `- ${quote.label}: ${quote.text}`),
    `- 미수집(인용하지 않음): ${uncollected.map((item) => item.label).join(" · ")}`,
  ];

  return Object.freeze({
    status: overlay.status,
    isLive: true,
    sourceEpisode,
    quotes: frozenQuotes,
    uncollected,
    memoText: memoLines.join("\n"),
    statusLine,
    emptyLine: null,
  });
}

/**
 * 인용 메모를 저장할 "다음 회차" 기획 플랜을 고른다.
 *
 * 기준 회차보다 큰 가장 작은 회차 번호가 다음 회차다. 그런 회차가 아직
 * 기획에 없으면 가장 큰 회차 번호의 플랜(지금 짜고 있는 회차)에 저장한다.
 * 기준 회차가 없거나 플랜이 없으면 null — 저장할 메모도, 자리도 없다.
 */
export function pickReaderReactionMemoTarget<
  T extends { readonly episodeId: string; readonly episodeNumber: number },
>(
  plans: readonly T[],
  sourceEpisodeNumber: number | null,
): T | null {
  if (sourceEpisodeNumber === null || plans.length === 0) return null;
  const sorted = [...plans].sort((a, b) => a.episodeNumber - b.episodeNumber);
  return (
    sorted.find((plan) => plan.episodeNumber > sourceEpisodeNumber) ??
    sorted[sorted.length - 1] ??
    null
  );
}
