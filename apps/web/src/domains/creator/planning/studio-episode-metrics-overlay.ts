/**
 * 회차 성과 → 기획 피드백 오버레이 (순수 모델).
 *
 * 목적: 창작자 애널리틱스(creator-analytics)의 "실집계" 회차 지표를 시즌 비트
 * 보드(행=회차)와 캐릭터 커버리지 맵(열=회차)에 회차 번호로 조인해 겹쳐
 * 보여주기 위한 변환 계층. 표면(비트 보드·커버리지 맵)은 이 모델이 만든
 * 오버레이만 읽고, 지표가 없으면 숫자 대신 빈 상태를 그대로 둔다.
 *
 * 절대 원칙 — 목/샘플 숫자를 실제 성과처럼 보이지 않는다:
 * - 입력 응답의 `mock` 이 true 이면(서버 샘플이든 클라이언트 목이든) 실집계가
 *   아닌 것으로 보고 오버레이는 비어 있는 "연결 전(not-connected)"이 된다.
 *   애널리틱스 페이지(CreatorAnalyticsPage)와 API 서비스
 *   (creator-analytics.service.ts)가 지키는 규칙과 동일하다.
 * - 로딩 중·실패·연결 전·미공급 상태에서는 어떤 숫자도 만들지 않는다.
 *   해당 회차의 지표는 `null` 로 명시하고, 표면은 배지를 그리지 않는다.
 * - API가 측정하지 않아 생략한 지표(likes·comments·newSubscribers)는
 *   0 으로 위장하지 않고 `null` 로 둔다 (creator-analytics.dto.ts 계약).
 * - 기획 회차 목록에 없는 회차 번호의 지표는 버리지 않고
 *   `unmatchedEpisodeNumbers` 로 드러낸다 (조용한 누락 금지 — 커버리지
 *   모델의 ignoredRecordCount 와 같은 취지).
 *
 * 조인 키: 회차 번호(episodeNumber). 애널리틱스 계약
 * (CreatorAnalyticsEpisode.episode / CreatorAnalyticsRetentionPoint.episode)이
 * 1-based 회차 번호를 키로 쓰고, 기획 쪽 episodeId 는 프로젝트 로컬 id 라
 * 분석 응답과 직접 맞지 않는다. episodeId 는 표면 행·열 식별용으로만 실어
 * 나르고, 매칭은 번호로만 한다.
 */
import type {
  CreatorAnalyticsPeriod,
  CreatorAnalyticsResponse,
  CreatorAnalyticsTrafficSource,
} from "../analytics/types";

/** 지표 로딩 상태. 표면은 이 상태만으로 "숫자를 그릴 수 있는지"를 판정한다. */
export type EpisodeMetricsLoadStatus =
  | "live"
  | "not-connected"
  | "loading"
  | "error"
  | "idle";

/**
 * 표면이 받는 지표 입력 한 덩어리.
 *
 * - live: 실집계 응답(mock:false)이 있을 때만 이 상태가 될 수 있다.
 * - not-connected: API 404(집계 소스 미연결) 또는 mock:true 응답.
 * - loading / error: 요청 진행 중 / 실패. 기존 기획 표면은 그대로 동작하고
 *   성과 배지만 비운다.
 * - idle: 아직 요청을 시작하지 않았거나 입력이 공급되지 않은 상태.
 */
export interface EpisodeMetricsLoad {
  readonly status: EpisodeMetricsLoadStatus;
  /** live 일 때만 실집계 응답이 들어 있다. 그 외 상태에서는 항상 null. */
  readonly response: CreatorAnalyticsResponse | null;
}

/** 지표 입력이 아예 없을 때의 기본값 — 표면은 성과 영역을 비워 둔다. */
export const IDLE_EPISODE_METRICS_LOAD: EpisodeMetricsLoad = Object.freeze({
  status: "idle",
  response: null,
});

/**
 * useApiResource<CreatorAnalyticsResponse> 결과(또는 동등한 페치 상태)를
 * EpisodeMetricsLoad 로 접는 어댑터. 호스트 컴포넌트는 이 함수 결과만
 * 기획 표면의 `episodeMetrics` prop 으로 넘기면 된다.
 *
 * 판정 순서는 애널리틱스 페이지와 같다: 실집계(mock:false)만 live,
 * 404·mock:true 는 not-connected, 그 다음 loading, error 순.
 * 어떤 경우에도 목 숫자가 live 로 새지 않는다.
 */
export function resolveEpisodeMetricsLoad(input: {
  readonly data?: CreatorAnalyticsResponse | null;
  readonly notFound?: boolean;
  readonly loading?: boolean;
  readonly error?: unknown;
}): EpisodeMetricsLoad {
  const data = input.data ?? null;
  if (data && !data.mock) {
    return Object.freeze({ status: "live", response: data });
  }
  if (input.notFound || data?.mock) {
    return Object.freeze({ status: "not-connected", response: null });
  }
  if (input.loading) {
    return Object.freeze({ status: "loading", response: null });
  }
  if (input.error) {
    return Object.freeze({ status: "error", response: null });
  }
  return IDLE_EPISODE_METRICS_LOAD;
}

/**
 * 실집계 응답을 그대로 받았을 때의 방어적 진입점. mock:true 응답이 어떤
 * 경로로 들어와도 live 로 승격하지 않는다 (서비스 레이어의 강제와 이중화).
 */
export function episodeMetricsLoadFromResponse(
  response: CreatorAnalyticsResponse | null | undefined,
): EpisodeMetricsLoad {
  if (!response) return IDLE_EPISODE_METRICS_LOAD;
  if (response.mock) {
    return Object.freeze({ status: "not-connected", response: null });
  }
  return Object.freeze({ status: "live", response });
}

/** 회차 1개의 실측 지표. 측정되지 않은 항목은 null (0 으로 위장하지 않음). */
export interface EpisodeMetrics {
  readonly episodeNumber: number;
  readonly title: string | null;
  readonly publishedAt: string | null;
  readonly views: number | null;
  readonly likes: number | null;
  readonly comments: number | null;
  readonly newSubscribers: number | null;
  /** 1화 대비 잔존율(%). 리텐션 포인트가 없으면 null. */
  readonly retentionPct: number | null;
  /** 직전 회차 대비 이탈률(%). 리텐션 포인트가 없으면 null. */
  readonly dropOffPct: number | null;
  /** 이탈 지점 판정(임계값은 API computeRetentionPoints 가 이미 적용). */
  readonly isDropOff: boolean;
}

/** 기획 표면의 회차 참조 최소 모양 — 비트 보드 행·커버리지 열이 모두 만족한다. */
export interface EpisodeMetricsEpisodeRef {
  readonly episodeId?: string;
  readonly episodeNumber: number;
}

/** 회차 참조 1개에 겹친 오버레이. metrics 가 null 이면 "이 회차는 측정 없음". */
export interface EpisodeMetricsOverlayEntry {
  readonly episodeId: string | null;
  readonly episodeNumber: number;
  readonly metrics: EpisodeMetrics | null;
  /** 한 줄 배지 텍스트. metrics 가 null 이면 null — 표면은 아무것도 그리지 않는다. */
  readonly badge: string | null;
  /** 툴팁용 상세 한 줄. metrics 가 null 이면 null. */
  readonly detail: string | null;
}

export interface EpisodeMetricsOverlay {
  readonly status: EpisodeMetricsLoadStatus;
  /** 숫자를 그려도 되는 상태인지 (status === "live" 와 동일). */
  readonly isLive: boolean;
  /** 입력 참조 순서 그대로의 항목. 길이는 입력 참조 수와 같다. */
  readonly entries: readonly EpisodeMetricsOverlayEntry[];
  /** 회차 번호 → 지표. live 가 아니면 빈 맵. */
  readonly byEpisodeNumber: ReadonlyMap<number, EpisodeMetrics>;
  /** 지표가 실제로 붙은 회차 수. */
  readonly measuredCount: number;
  /** 기획 참조에 없어 겹치지 못한 지표의 회차 번호(오름차순). */
  readonly unmatchedEpisodeNumbers: readonly number[];
  /** 이탈 지점으로 판정된 회차 번호(오름차순, 기획 참조 안의 것만). */
  readonly dropOffEpisodeNumbers: readonly number[];
  readonly period: CreatorAnalyticsPeriod | null;
  readonly generatedAt: string | null;
  /**
   * 시리즈 단위 유입 경로(실집계). 유입은 회차 단위로 측정되지 않으므로
   * 회차 항목(entries)에 나누지 않고 오버레이 전체에 한 번만 싣는다.
   * live 가 아니면 빈 목록이다.
   */
  readonly trafficSources: readonly CreatorAnalyticsTrafficSource[];
  /** 방문이 가장 많은 유입 경로. 측정된 유입이 없으면 null. */
  readonly topTrafficSource: CreatorAnalyticsTrafficSource | null;
  /** 측정된 유입 방문 합계. live 가 아니거나 유입이 없으면 0. */
  readonly totalTrafficVisits: number;
  /** 기간 전체 조회 KPI(kpis 의 views). KPI 가 없으면 null — 0 으로 위장하지 않는다. */
  readonly totalViews: number | null;
  /** 기간 전체 조회의 직전 기간 대비 증감(%). 음수 허용, 없으면 null. */
  readonly totalViewsDeltaPct: number | null;
}

function sanitizeCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.floor(value);
}

function sanitizePct(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.round(value * 10) / 10;
}

function sanitizeEpisodeNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const number = Math.floor(value);
  return number >= 1 ? number : null;
}

/** 숫자 표기 — 애널리틱스 표면과 같은 천 단위 구분(ko-KR). */
export function formatMetricCount(value: number): string {
  return Math.floor(value).toLocaleString("ko-KR");
}

function formatPct(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

/** 백분율 표기 — 인용 카드 등 다른 기획 표면과 같은 규칙을 쓰도록 공개한다. */
export function formatMetricPct(value: number): string {
  return formatPct(value);
}

function sanitizeDeltaPct(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function sanitizeTrafficSources(
  sources: readonly CreatorAnalyticsTrafficSource[] | undefined,
): readonly CreatorAnalyticsTrafficSource[] {
  const cleaned: CreatorAnalyticsTrafficSource[] = [];
  for (const source of sources ?? []) {
    const visits = sanitizeCount(source?.visits);
    if (visits === null || visits <= 0) continue;
    const labelKo = source.labelKo?.trim() ? source.labelKo : source.source;
    if (!labelKo) continue;
    cleaned.push(
      Object.freeze({
        source: source.source,
        labelKo,
        labelEn: source.labelEn?.trim() ? source.labelEn : labelKo,
        visits,
        sharePct: Math.min(100, sanitizePct(source.sharePct) ?? 0),
      }),
    );
  }
  return Object.freeze(cleaned.sort((a, b) => b.visits - a.visits));
}

/**
 * 시리즈 유입 요약 한 줄: "시리즈 유입 1위 직접 방문 · 방문 1,200 (42%)".
 * 유입은 시리즈 단위 실측이라 회차 배지와 섞지 않고 별도 줄로만 낸다.
 * live 가 아니거나 측정된 유입이 없으면 null — 빈 줄을 만들지 않는다.
 */
export function formatEpisodeTrafficSummary(
  overlay: EpisodeMetricsOverlay,
): string | null {
  if (!overlay.isLive || !overlay.topTrafficSource) return null;
  const top = overlay.topTrafficSource;
  return `시리즈 유입 1위 ${top.labelKo} · 방문 ${formatMetricCount(top.visits)} (${formatPct(top.sharePct)}%)`;
}

/**
 * 배지 한 줄: "조회 12,300 · 잔존 84%" (+ 이탈 지점이면 "· 이탈 지점").
 * 조회·잔존 둘 다 없으면 배지 자체가 없다(null) — 빈 배지를 만들지 않는다.
 */
export function formatEpisodeMetricsBadge(
  metrics: EpisodeMetrics | null,
): string | null {
  if (!metrics) return null;
  const parts: string[] = [];
  if (metrics.views !== null) parts.push(`조회 ${formatMetricCount(metrics.views)}`);
  if (metrics.retentionPct !== null) parts.push(`잔존 ${formatPct(metrics.retentionPct)}%`);
  if (parts.length === 0) return null;
  if (metrics.isDropOff) parts.push("이탈 지점");
  return parts.join(" · ");
}

/**
 * 툴팁 상세 한 줄. 측정된 항목만 넣는다 — 측정되지 않은 좋아요·댓글은
 * "—"로도 쓰지 않고 아예 빼서, 없는 숫자가 있는 것처럼 읽히지 않게 한다.
 */
export function formatEpisodeMetricsDetail(
  metrics: EpisodeMetrics | null,
): string | null {
  if (!metrics) return null;
  const parts: string[] = [];
  if (metrics.views !== null) parts.push(`조회 ${formatMetricCount(metrics.views)}`);
  if (metrics.likes !== null) parts.push(`좋아요 ${formatMetricCount(metrics.likes)}`);
  if (metrics.comments !== null) parts.push(`댓글 ${formatMetricCount(metrics.comments)}`);
  if (metrics.newSubscribers !== null) {
    parts.push(`새 구독 ${formatMetricCount(metrics.newSubscribers)}`);
  }
  if (metrics.retentionPct !== null) parts.push(`잔존율 ${formatPct(metrics.retentionPct)}%`);
  if (metrics.dropOffPct !== null && metrics.dropOffPct > 0) {
    parts.push(`직전 화 대비 이탈 ${formatPct(metrics.dropOffPct)}%`);
  }
  if (parts.length === 0) return null;
  return `${metrics.episodeNumber}화 성과 — ${parts.join(" · ")}`;
}

const PERIOD_DAYS: Readonly<Record<CreatorAnalyticsPeriod, number>> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/**
 * 표면 상단에 한 번만 보여 주는 성과 상태 한 줄.
 * live 가 아닌 상태에서는 숫자가 전혀 들어가지 않는다.
 */
export function episodeMetricsStatusLine(overlay: EpisodeMetricsOverlay): string {
  switch (overlay.status) {
    case "live": {
      const days = overlay.period ? PERIOD_DAYS[overlay.period] : null;
      const scope = days ? `최근 ${days}일 실집계` : "실집계";
      return overlay.measuredCount > 0
        ? `회차 성과 (${scope} · ${overlay.measuredCount}개 회차 측정)`
        : "회차 성과가 연결됐지만 아직 측정된 회차가 없어요.";
    }
    case "loading":
      return "회차 성과를 불러오는 중이에요.";
    case "error":
      return "회차 성과를 불러오지 못했어요. 기획 내용은 그대로 볼 수 있어요.";
    case "not-connected":
    case "idle":
    default:
      return "회차 성과가 아직 연결되지 않았어요. 작품을 발행하고 독자 반응이 쌓이면 회차별 조회·잔존이 여기에 겹쳐 보여요.";
  }
}

/**
 * 기획 피드백 힌트 — 이탈 지점 회차만 사실 문장으로 만든다.
 * live 가 아니거나 이탈 지점이 없으면 빈 목록이다 (추측성 조언을 만들지 않음).
 */
export function episodeMetricsFeedbackHints(
  overlay: EpisodeMetricsOverlay,
): readonly string[] {
  if (!overlay.isLive) return Object.freeze([]);
  const hints: string[] = [];
  for (const entry of overlay.entries) {
    const metrics = entry.metrics;
    if (!metrics?.isDropOff) continue;
    const drop =
      metrics.dropOffPct !== null && metrics.dropOffPct > 0
        ? ` 직전 화보다 ${formatPct(metrics.dropOffPct)}% 줄었어요.`
        : " 직전 화보다 크게 줄었어요.";
    const views =
      metrics.views !== null ? ` (조회 ${formatMetricCount(metrics.views)})` : "";
    hints.push(
      `${metrics.episodeNumber}화에서 독자가 많이 이탈했어요.${drop}${views} 이 회차의 비트와 마무리 훅을 점검해 보세요.`,
    );
  }
  return Object.freeze(hints);
}

/**
 * 회차 참조 목록에 지표 오버레이를 겹친다.
 *
 * - load 가 없거나 live 가 아니면 entries 의 metrics 는 전부 null 이고
 *   배지·상세도 null 이다 — 표면은 숫자 없이 기존 모습 그대로 남는다.
 * - live 여도 그 회차의 실측이 없으면 metrics 는 null (0 으로 채우지 않음).
 * - episodes[] 와 retention[] 를 회차 번호로 합친다. 한쪽에만 있는 회차도
 *   있는 쪽 값으로 지표를 만든다 (조회는 episodes 우선, 없으면 retention).
 */
export function buildEpisodeMetricsOverlay(
  refs: readonly EpisodeMetricsEpisodeRef[],
  load: EpisodeMetricsLoad | null | undefined,
): EpisodeMetricsOverlay {
  const status = load?.status ?? "idle";
  // 이중 방어: live 라고 적혀 있어도 응답이 없거나 mock 이면 숫자를 만들지 않는다.
  const response =
    status === "live" && load?.response && !load.response.mock
      ? load.response
      : null;
  const isLive = response !== null;
  // live 라고 적힌 입력이 목이거나 응답이 비어 실제로는 숫자를 만들 수 없으면
  // 상태를 "연결됨"으로 남기지 않고 연결 전으로 강등한다 — 상태 문구가
  // 연결됐다고 거짓말하는 일을 막기 위해서다.
  const effectiveStatus: EpisodeMetricsLoadStatus =
    status === "live" && !isLive ? "not-connected" : status;

  const byEpisodeNumber = new Map<number, EpisodeMetrics>();
  if (response) {
    const dropOffSet = new Set(
      (response.dropOffEpisodes ?? [])
        .map((episode) => sanitizeEpisodeNumber(episode))
        .filter((episode): episode is number => episode !== null),
    );
    const retentionByEpisode = new Map<number, (typeof response.retention)[number]>();
    for (const point of response.retention ?? []) {
      const episodeNumber = sanitizeEpisodeNumber(point?.episode);
      if (episodeNumber === null || retentionByEpisode.has(episodeNumber)) continue;
      retentionByEpisode.set(episodeNumber, point);
    }
    const seen = new Set<number>();
    for (const episode of response.episodes ?? []) {
      const episodeNumber = sanitizeEpisodeNumber(episode?.episode);
      if (episodeNumber === null || seen.has(episodeNumber)) continue;
      seen.add(episodeNumber);
      const point = retentionByEpisode.get(episodeNumber);
      byEpisodeNumber.set(
        episodeNumber,
        Object.freeze({
          episodeNumber,
          title: episode.title?.trim() ? episode.title : (point?.title ?? null),
          publishedAt: episode.publishedAt ?? null,
          views: sanitizeCount(episode.views) ?? sanitizeCount(point?.views),
          likes: sanitizeCount(episode.likes),
          comments: sanitizeCount(episode.comments),
          newSubscribers: sanitizeCount(episode.newSubscribers),
          retentionPct: sanitizePct(point?.retentionPct),
          dropOffPct: sanitizePct(point?.dropOffPct),
          isDropOff: Boolean(point?.isDropOff) || dropOffSet.has(episodeNumber),
        }),
      );
    }
    // retention 에만 있는 회차(회차 목록 응답에서 빠진 경우)도 지표로 살린다.
    for (const [episodeNumber, point] of retentionByEpisode) {
      if (byEpisodeNumber.has(episodeNumber)) continue;
      byEpisodeNumber.set(
        episodeNumber,
        Object.freeze({
          episodeNumber,
          title: point.title ?? null,
          publishedAt: null,
          views: sanitizeCount(point.views),
          likes: null,
          comments: null,
          newSubscribers: null,
          retentionPct: sanitizePct(point.retentionPct),
          dropOffPct: sanitizePct(point.dropOffPct),
          isDropOff: Boolean(point.isDropOff) || dropOffSet.has(episodeNumber),
        }),
      );
    }
  }

  // 유입·전체 조회는 시리즈 단위 실측이다. live 응답에서만 읽고, 없으면
  // 빈 값으로 둔다 (회차 지표와 같은 정직성 규칙).
  const trafficSources = response
    ? sanitizeTrafficSources(response.trafficSources)
    : Object.freeze([]);
  const viewsKpi = response?.kpis?.find((kpi) => kpi?.key === "views") ?? null;
  const totalViews = viewsKpi ? sanitizeCount(viewsKpi.value) : null;
  const totalViewsDeltaPct = viewsKpi
    ? sanitizeDeltaPct(viewsKpi.deltaPct)
    : null;

  const referencedNumbers = new Set(refs.map((ref) => ref.episodeNumber));
  const entries: EpisodeMetricsOverlayEntry[] = refs.map((ref) => {
    const metrics = byEpisodeNumber.get(ref.episodeNumber) ?? null;
    return Object.freeze({
      episodeId: ref.episodeId ?? null,
      episodeNumber: ref.episodeNumber,
      metrics,
      badge: formatEpisodeMetricsBadge(metrics),
      detail: formatEpisodeMetricsDetail(metrics),
    });
  });

  return Object.freeze({
    status: effectiveStatus,
    isLive,
    entries: Object.freeze(entries),
    byEpisodeNumber,
    measuredCount: entries.filter((entry) => entry.metrics !== null).length,
    unmatchedEpisodeNumbers: Object.freeze(
      [...byEpisodeNumber.keys()]
        .filter((episodeNumber) => !referencedNumbers.has(episodeNumber))
        .sort((a, b) => a - b),
    ),
    dropOffEpisodeNumbers: Object.freeze(
      entries
        .filter((entry) => entry.metrics?.isDropOff)
        .map((entry) => entry.episodeNumber)
        .sort((a, b) => a - b),
    ),
    period: response?.period ?? null,
    generatedAt: response?.generatedAt ?? null,
    trafficSources,
    topTrafficSource: trafficSources[0] ?? null,
    totalTrafficVisits: trafficSources.reduce((sum, source) => sum + source.visits, 0),
    totalViews,
    totalViewsDeltaPct,
  });
}
