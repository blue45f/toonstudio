/**
 * 완성 웹툰 바이럴 홍보 스튜디오 — 팬덤 리액션/투표 위젯 생성기,
 * 투명 수식 기반 글로벌 IP 수익 시뮬레이터, D-14~D+7 런칭 홍보 체크리스트.
 *
 * - 가짜 Web3/블록체인/가짜 실시간 서버 통계 일절 금지.
 * - 위젯은 정적 임베드 HTML + 설정 JSON을 생성하며 방문자 브라우저 로컬 저장만 사용한다.
 * - 수익 시뮬레이터는 100% 사용자 입력 가정과 공개 수식에 기반한 추정치만 산출한다.
 */

import {
  PROMO_MOOD_THEMES,
  buildPromoFileSlug,
  escapeHtml,
  type PromoMoodThemeId,
  type WebtoonPromoPlatformLinks,
} from "./viral-landing-builder";

export type FandomReactionId = "heart-flutter" | "chills" | "iconic-line" | "cant-wait";
export type FandomPollCategory = "branch-choice" | "character-popularity";

export interface FandomReactionOption {
  readonly id: FandomReactionId;
  readonly label: string;
  readonly labelEn: string;
  readonly description: string;
}

export interface FandomPollOption {
  readonly id: string;
  readonly label: string;
}

export interface FandomWidgetInput {
  readonly workTitle: string;
  readonly episodeLabel: string;
  readonly authorName: string;
  readonly pollCategory: FandomPollCategory;
  readonly pollQuestion: string;
  readonly pollOptions: readonly string[];
  readonly moodTheme: PromoMoodThemeId;
}

export interface FandomWidgetConfigPayload {
  readonly schemaVersion: "toonstudio.fandom-widget.v1";
  readonly storageMode: "browser-local-only";
  readonly widgetId: string;
  readonly workTitle: string;
  readonly episodeLabel: string;
  readonly authorName: string;
  readonly moodTheme: PromoMoodThemeId;
  readonly reactions: readonly FandomReactionOption[];
  readonly poll: {
    readonly id: string;
    readonly category: FandomPollCategory;
    readonly question: string;
    readonly options: readonly FandomPollOption[];
  };
  readonly honestyNotice: string;
}

export interface FandomReactionWidgetSpec {
  readonly widgetId: string;
  readonly config: FandomWidgetConfigPayload;
  readonly configJson: string;
  readonly embedHtml: string;
  readonly htmlFilename: string;
  readonly jsonFilename: string;
  readonly honestyNotice: string;
  readonly honestyNoticeEn: string;
}

export interface GlobalIpRevenueParams {
  readonly monthlyFreeReaders: number;
  readonly krPaidConversionRatePct: number;
  readonly krPreviewPriceKrw: number;
  readonly krPaidEpisodesPerReader: number;
  readonly krPlatformFeePct: number;
  readonly episodesPerMonth: number;
  readonly productionCostPerEpisodeKrw: number;
  readonly enableJapanLaunch: boolean;
  readonly japanReaderRatioPct: number;
  readonly japanRevenueSharePct: number;
  readonly japanArpuKrw: number;
  readonly enableNorthAmericaLaunch: boolean;
  readonly northAmericaReaderRatioPct: number;
  readonly northAmericaRevenueSharePct: number;
  readonly northAmericaArpuKrw: number;
  readonly goodsKeyringMonthlyUnits: number;
  readonly goodsKeyringNetMarginKrw: number;
  readonly goodsBookSeasonUnits: number;
  readonly goodsBookNetMarginKrw: number;
  readonly withholdingTaxPct: number;
  readonly seasonMonths: number;
}

export type RevenueScenarioId = "conservative" | "base" | "optimistic";

export interface RevenueChannelBreakdown {
  readonly krGrossKrw: number;
  readonly krAfterPlatformKrw: number;
  readonly japanGrossKrw: number;
  readonly japanAfterShareKrw: number;
  readonly northAmericaGrossKrw: number;
  readonly northAmericaAfterShareKrw: number;
  readonly goodsKeyringMonthlyKrw: number;
  readonly goodsBookMonthlyKrw: number;
  readonly goodsMonthlyTotalKrw: number;
}

export interface RevenueScenarioResult {
  readonly id: RevenueScenarioId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly multiplier: number;
  readonly monthlyGrossRevenueKrw: number;
  readonly monthlyPlatformFeesKrw: number;
  readonly monthlyPreTaxPayoutKrw: number;
  readonly monthlyWithholdingTaxKrw: number;
  readonly monthlyNetPayoutKrw: number;
  readonly seasonNetPayoutKrw: number;
  readonly monthlyProductionCostKrw: number;
  readonly monthlyOperatingProfitKrw: number;
  readonly netPayoutPerEpisodeKrw: number;
  readonly breakEvenEpisodeCount: number | null;
  readonly channels: RevenueChannelBreakdown;
}

export interface GlobalIpRevenueResult {
  readonly sanitizedParams: GlobalIpRevenueParams;
  readonly upfrontLaunchBufferEpisodes: number;
  readonly scenarios: Readonly<{
    readonly conservative: RevenueScenarioResult;
    readonly base: RevenueScenarioResult;
    readonly optimistic: RevenueScenarioResult;
  }>;
  readonly disclaimer: string;
  readonly disclaimerEn: string;
  readonly formulaNotes: readonly string[];
}

export type LaunchChecklistCategory =
  | "rights-bom"
  | "hook-check"
  | "teaser-shortform"
  | "landing-card"
  | "fandom-widget"
  | "community"
  | "retrospective";

export interface LaunchChecklistItem {
  readonly id: string;
  readonly dayOffset: string;
  readonly category: LaunchChecklistCategory;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly detailKo: string;
  readonly detailEn: string;
  readonly required: boolean;
}

export interface LaunchChecklistInput {
  readonly workTitle: string;
  readonly genre: string;
  readonly platformLinks: WebtoonPromoPlatformLinks;
  readonly hasGlobalPlan?: boolean;
  readonly hasGoodsPlan?: boolean;
}

export interface LaunchPromotionChecklist {
  readonly workTitle: string;
  readonly rangeLabel: "D-14 ~ D+7";
  readonly items: readonly LaunchChecklistItem[];
}

export const DEFAULT_FANDOM_REACTIONS: readonly FandomReactionOption[] = [
  {
    id: "heart-flutter",
    label: "심쿵",
    labelEn: "Heart-flutter",
    description: "설렘·감정선 폭발 컷",
  },
  {
    id: "chills",
    label: "소름",
    labelEn: "Chills",
    description: "반전·서스펜스 전율 컷",
  },
  {
    id: "iconic-line",
    label: "명대사",
    labelEn: "Iconic line",
    description: "소장하고 싶은 핵심 대사",
  },
  {
    id: "cant-wait",
    label: "다음화기대",
    labelEn: "Can't wait",
    description: "다음 화 정주행 알림 예약",
  },
];

export const DEFAULT_FANDOM_WIDGET_INPUT: FandomWidgetInput = {
  workTitle: "별빛 종이공방의 마지막 서약",
  episodeLabel: "1화 · 13번째 봉인",
  authorName: "한별 스튜디오",
  pollCategory: "branch-choice",
  pollQuestion: "다음 화에서 주인공이 먼저 열어야 할 문은?",
  pollOptions: [
    "봉인된 지하 서고의 철문",
    "라이벌이 건넨 계약서 뒷장",
    "사라진 스승의 옥상 작업실",
  ],
  moodTheme: "editorial-warm",
};

export const DEFAULT_GLOBAL_IP_REVENUE_PARAMS: GlobalIpRevenueParams = {
  monthlyFreeReaders: 45_000,
  krPaidConversionRatePct: 5.5,
  krPreviewPriceKrw: 200,
  krPaidEpisodesPerReader: 4,
  krPlatformFeePct: 30,
  episodesPerMonth: 4,
  productionCostPerEpisodeKrw: 650_000,
  enableJapanLaunch: true,
  japanReaderRatioPct: 45,
  japanRevenueSharePct: 35,
  japanArpuKrw: 1_400,
  enableNorthAmericaLaunch: true,
  northAmericaReaderRatioPct: 35,
  northAmericaRevenueSharePct: 35,
  northAmericaArpuKrw: 1_300,
  goodsKeyringMonthlyUnits: 120,
  goodsKeyringNetMarginKrw: 5_500,
  goodsBookSeasonUnits: 450,
  goodsBookNetMarginKrw: 2_200,
  withholdingTaxPct: 3.3,
  seasonMonths: 3,
};

const UPFRONT_FREE_LAUNCH_BUFFER_EPISODES = 3;

const SCENARIO_PRESETS: readonly {
  readonly id: RevenueScenarioId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly multiplier: number;
}[] = [
  { id: "conservative", labelKo: "보수 시나리오 (65%)", labelEn: "Conservative (65%)", multiplier: 0.65 },
  { id: "base", labelKo: "기준 시나리오 (100%)", labelEn: "Base (100%)", multiplier: 1.0 },
  { id: "optimistic", labelKo: "낙관 시나리오 (145%)", labelEn: "Optimistic (145%)", multiplier: 1.45 },
];

const FANDOM_HONESTY_NOTICE =
  "이 위젯은 외부 서버·가짜 실시간 집계 없이 방문자 브라우저 로컬(localStorage)에만 참여 상태를 기록하는 정적 임베드입니다.";

const FANDOM_HONESTY_NOTICE_EN =
  "Static embed storing visitor reactions/votes only in browser localStorage with zero external servers or fabricated live counts.";

const REVENUE_DISCLAIMER_KO =
  "본 계산 결과는 사용자가 입력한 독자 수·유료 전환율·글로벌 정산율·굿즈 마진·원천징수(3.3%) 가정에 기반한 로컬 수식 시뮬레이션 추정치이며, 특정 플랫폼의 실제 정산 금액이나 수익을 보장하지 않습니다.";

const REVENUE_DISCLAIMER_EN =
  "All figures are transparent formula-based estimates derived solely from your input assumptions (readers, conversion, share rates, margins, 3.3% withholding) and do not guarantee actual platform payouts.";

function escapeInlineJsonForHtmlScript(jsonText: string): string {
  return jsonText
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function clampFinite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizePollOptions(rawOptions: readonly string[]): readonly FandomPollOption[] {
  const cleaned = rawOptions
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 6);

  const effective =
    cleaned.length >= 2
      ? cleaned
      : ["선택지 A · 정면 돌파", "선택지 B · 숨겨진 단서 추적"];

  return effective.map((label, idx) => ({
    id: `opt-${idx + 1}`,
    label,
  }));
}

/**
 * 독자 참여형 컷 리액션(심쿵/소름/명대사/다음화기대 4종) +
 * 다음 화 분기/인기 캐릭터 팬덤 투표 위젯 설정 JSON & 정적 임베드 HTML 스니펫을 생성한다.
 */
export function buildFandomReactionWidgetSpec(
  input: FandomWidgetInput,
): FandomReactionWidgetSpec {
  const theme = PROMO_MOOD_THEMES[input.moodTheme] ?? PROMO_MOOD_THEMES["editorial-warm"];
  const workTitle = input.workTitle.trim() || "무제 웹툰";
  const episodeLabel = input.episodeLabel.trim() || "1화";
  const authorName = input.authorName.trim() || "작가 미상";
  const pollCategory: FandomPollCategory =
    input.pollCategory === "character-popularity" ? "character-popularity" : "branch-choice";
  const pollQuestion =
    input.pollQuestion.trim() ||
    (pollCategory === "character-popularity"
      ? "이번 화에서 가장 매력적이었던 캐릭터는?"
      : "다음 화에서 보고 싶은 전개 분기는?");
  const pollOptions = normalizePollOptions(input.pollOptions);
  const slug = buildPromoFileSlug(workTitle);
  const widgetId = `ts-fandom-${slug}-${pollCategory}`;

  const config: FandomWidgetConfigPayload = {
    schemaVersion: "toonstudio.fandom-widget.v1",
    storageMode: "browser-local-only",
    widgetId,
    workTitle,
    episodeLabel,
    authorName,
    moodTheme: theme.id,
    reactions: DEFAULT_FANDOM_REACTIONS,
    poll: {
      id: `${widgetId}-poll`,
      category: pollCategory,
      question: pollQuestion,
      options: pollOptions,
    },
    honestyNotice: FANDOM_HONESTY_NOTICE,
  };

  const configJson = JSON.stringify(config, null, 2);
  const safeWidgetIdAttr = escapeHtml(widgetId);
  const safeWorkTitle = escapeHtml(workTitle);
  const safeEpisodeLabel = escapeHtml(episodeLabel);
  const safeAuthorName = escapeHtml(authorName);
  const safePollQuestion = escapeHtml(pollQuestion);
  const pollBadgeLabel =
    pollCategory === "character-popularity" ? "인기 캐릭터 투표" : "다음 화 분기 투표";

  const reactionButtonsHtml = DEFAULT_FANDOM_REACTIONS.map(
    (reaction) =>
      `      <button type="button" class="tsw-chip" data-reaction-id="${reaction.id}" aria-pressed="false">
        <span class="tsw-chip-label">${escapeHtml(reaction.label)}</span>
        <span class="tsw-chip-desc">${escapeHtml(reaction.description)}</span>
      </button>`,
  ).join("\n");

  const pollOptionsHtml = pollOptions
    .map(
      (option) =>
        `      <button type="button" class="tsw-option" role="radio" aria-checked="false" data-option-id="${option.id}">
        <span class="tsw-option-dot" aria-hidden="true"></span>
        <span class="tsw-option-label">${escapeHtml(option.label)}</span>
      </button>`,
    )
    .join("\n");

  const safeScriptWidgetId = escapeInlineJsonForHtmlScript(JSON.stringify(widgetId));

  const embedHtml = `<!-- ToonStudio 정적 팬덤 리액션·투표 위젯 (외부 CDN·서버 추적 0건) -->
<section class="tsw-root" id="${safeWidgetIdAttr}" data-widget-schema="toonstudio.fandom-widget.v1" aria-label="${safeWorkTitle} 팬덤 리액션 및 투표 위젯">
  <style>
    #${safeWidgetIdAttr} {
      --tsw-bg: ${theme.bg};
      --tsw-surface: ${theme.surface};
      --tsw-surface-alt: ${theme.surfaceAlt};
      --tsw-border: ${theme.border};
      --tsw-ink: ${theme.ink};
      --tsw-ink-muted: ${theme.inkMuted};
      --tsw-accent: ${theme.accent};
      --tsw-on-accent: ${theme.onAccent};
      --tsw-badge-bg: ${theme.badgeBg};
      --tsw-badge-ink: ${theme.badgeInk};
      max-width: 640px;
      margin: 0 auto;
      padding: 20px;
      border-radius: 16px;
      border: 1px solid var(--tsw-border);
      background: var(--tsw-surface);
      color: var(--tsw-ink);
      font-family: "Pretendard", "Apple SD Gothic Neo", system-ui, sans-serif;
      word-break: keep-all;
    }
    #${safeWidgetIdAttr} * { box-sizing: border-box; }
    #${safeWidgetIdAttr} .tsw-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; margin-bottom: 14px; }
    #${safeWidgetIdAttr} .tsw-badge { padding: 4px 10px; border-radius: 999px; background: var(--tsw-badge-bg); color: var(--tsw-badge-ink); font-size: 12px; font-weight: 700; }
    #${safeWidgetIdAttr} .tsw-meta { font-size: 12px; color: var(--tsw-ink-muted); }
    #${safeWidgetIdAttr} .tsw-title { margin: 0 0 12px; font-size: 18px; font-weight: 800; }
    #${safeWidgetIdAttr} .tsw-group-label { margin: 16px 0 8px; font-size: 13px; font-weight: 700; color: var(--tsw-ink-muted); }
    #${safeWidgetIdAttr} .tsw-reactions { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 8px; }
    #${safeWidgetIdAttr} .tsw-chip, #${safeWidgetIdAttr} .tsw-option {
      display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 10px 12px;
      border-radius: 10px; border: 1px solid var(--tsw-border); background: var(--tsw-surface-alt);
      color: var(--tsw-ink); cursor: pointer; text-align: left; font: inherit;
    }
    #${safeWidgetIdAttr} .tsw-chip { flex-direction: column; align-items: flex-start; gap: 2px; }
    #${safeWidgetIdAttr} .tsw-chip-label { font-size: 14px; font-weight: 700; }
    #${safeWidgetIdAttr} .tsw-chip-desc { font-size: 11px; color: var(--tsw-ink-muted); }
    #${safeWidgetIdAttr} .tsw-chip[aria-pressed="true"], #${safeWidgetIdAttr} .tsw-option[aria-checked="true"] {
      background: var(--tsw-accent); color: var(--tsw-on-accent); border-color: var(--tsw-accent);
    }
    #${safeWidgetIdAttr} .tsw-chip[aria-pressed="true"] .tsw-chip-desc { color: var(--tsw-on-accent); }
    #${safeWidgetIdAttr} .tsw-poll { display: flex; flex-direction: column; gap: 8px; }
    #${safeWidgetIdAttr} .tsw-option-dot { width: 12px; height: 12px; border-radius: 999px; border: 2px solid currentColor; flex-shrink: 0; }
    #${safeWidgetIdAttr} .tsw-status { margin: 14px 0 0; font-size: 12px; color: var(--tsw-ink-muted); }
  </style>
  <div class="tsw-head">
    <span class="tsw-badge">${pollBadgeLabel}</span>
    <span class="tsw-meta">${safeEpisodeLabel} · ${safeAuthorName}</span>
  </div>
  <h3 class="tsw-title">${safeWorkTitle}</h3>
  <p class="tsw-group-label">이번 화 컷 리액션 (복수 선택 가능)</p>
  <div class="tsw-reactions" role="group" aria-label="컷 리액션 선택">
${reactionButtonsHtml}
  </div>
  <p class="tsw-group-label">${safePollQuestion}</p>
  <div class="tsw-poll" role="radiogroup" aria-label="${safePollQuestion}">
${pollOptionsHtml}
  </div>
  <p class="tsw-status" data-status-line>${escapeHtml(FANDOM_HONESTY_NOTICE)}</p>
  <script>
    (function () {
      var widgetId = ${safeScriptWidgetId};
      var root = document.getElementById(widgetId);
      if (!root) return;
      var storageKey = "toonstudio:widget:" + widgetId;
      var state = { reactions: [], vote: null };
      try {
        var saved = window.localStorage.getItem(storageKey);
        if (saved) state = JSON.parse(saved);
      } catch (e) {}
      function persist() {
        try { window.localStorage.setItem(storageKey, JSON.stringify(state)); } catch (e) {}
      }
      function render() {
        root.querySelectorAll("[data-reaction-id]").forEach(function (btn) {
          var id = btn.getAttribute("data-reaction-id");
          btn.setAttribute("aria-pressed", state.reactions.indexOf(id) >= 0 ? "true" : "false");
        });
        root.querySelectorAll("[data-option-id]").forEach(function (btn) {
          var id = btn.getAttribute("data-option-id");
          btn.setAttribute("aria-checked", state.vote === id ? "true" : "false");
        });
        var statusEl = root.querySelector("[data-status-line]");
        if (statusEl) {
          statusEl.textContent = "내 선택 저장됨(리액션 " + state.reactions.length + "개 · 투표 " + (state.vote ? "완료" : "미선택") + ") · 브라우저 로컬 저장 기준";
        }
      }
      root.querySelectorAll("[data-reaction-id]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = btn.getAttribute("data-reaction-id");
          if (!id) return;
          var idx = state.reactions.indexOf(id);
          if (idx >= 0) state.reactions.splice(idx, 1);
          else state.reactions.push(id);
          persist();
          render();
        });
      });
      root.querySelectorAll("[data-option-id]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          state.vote = btn.getAttribute("data-option-id");
          persist();
          render();
        });
      });
      render();
    })();
  </script>
</section>`;

  return {
    widgetId,
    config,
    configJson,
    embedHtml,
    htmlFilename: `${slug}-fandom-widget.html`,
    jsonFilename: `${slug}-fandom-widget.json`,
    honestyNotice: FANDOM_HONESTY_NOTICE,
    honestyNoticeEn: FANDOM_HONESTY_NOTICE_EN,
  };
}

function sanitizeRevenueParams(params: GlobalIpRevenueParams): GlobalIpRevenueParams {
  return {
    monthlyFreeReaders: clampFinite(params.monthlyFreeReaders, 0, 50_000_000),
    krPaidConversionRatePct: clampFinite(params.krPaidConversionRatePct, 0, 100),
    krPreviewPriceKrw: clampFinite(params.krPreviewPriceKrw, 0, 50_000),
    krPaidEpisodesPerReader: clampFinite(params.krPaidEpisodesPerReader, 0, 120),
    krPlatformFeePct: clampFinite(params.krPlatformFeePct, 0, 95),
    episodesPerMonth: clampFinite(params.episodesPerMonth, 1, 31),
    productionCostPerEpisodeKrw: clampFinite(params.productionCostPerEpisodeKrw, 0, 100_000_000),
    enableJapanLaunch: Boolean(params.enableJapanLaunch),
    japanReaderRatioPct: clampFinite(params.japanReaderRatioPct, 0, 500),
    japanRevenueSharePct: clampFinite(params.japanRevenueSharePct, 0, 100),
    japanArpuKrw: clampFinite(params.japanArpuKrw, 0, 100_000),
    enableNorthAmericaLaunch: Boolean(params.enableNorthAmericaLaunch),
    northAmericaReaderRatioPct: clampFinite(params.northAmericaReaderRatioPct, 0, 500),
    northAmericaRevenueSharePct: clampFinite(params.northAmericaRevenueSharePct, 0, 100),
    northAmericaArpuKrw: clampFinite(params.northAmericaArpuKrw, 0, 100_000),
    goodsKeyringMonthlyUnits: clampFinite(params.goodsKeyringMonthlyUnits, 0, 500_000),
    goodsKeyringNetMarginKrw: clampFinite(params.goodsKeyringNetMarginKrw, 0, 100_000),
    goodsBookSeasonUnits: clampFinite(params.goodsBookSeasonUnits, 0, 1_000_000),
    goodsBookNetMarginKrw: clampFinite(params.goodsBookNetMarginKrw, 0, 100_000),
    withholdingTaxPct: clampFinite(params.withholdingTaxPct, 0, 50),
    seasonMonths: Math.round(clampFinite(params.seasonMonths, 1, 12)),
  };
}

function evaluateScenario(
  p: GlobalIpRevenueParams,
  preset: (typeof SCENARIO_PRESETS)[number],
): RevenueScenarioResult {
  const m = preset.multiplier;

  // 1) 한국 유료 미리보기
  const krPaidReaders = p.monthlyFreeReaders * (p.krPaidConversionRatePct / 100) * m;
  const krGrossKrw = krPaidReaders * p.krPreviewPriceKrw * p.krPaidEpisodesPerReader;
  const krPlatformFeeKrw = krGrossKrw * (p.krPlatformFeePct / 100);
  const krAfterPlatformKrw = krGrossKrw - krPlatformFeeKrw;

  // 2) 일본 번역 연재
  const jpPaidReaders = p.enableJapanLaunch
    ? p.monthlyFreeReaders * (p.japanReaderRatioPct / 100) * (p.krPaidConversionRatePct / 100) * m
    : 0;
  const japanGrossKrw = jpPaidReaders * p.japanArpuKrw;
  const japanAfterShareKrw = japanGrossKrw * (p.japanRevenueSharePct / 100);
  const japanFeeKrw = japanGrossKrw - japanAfterShareKrw;

  // 3) 북미 번역 연재
  const naPaidReaders = p.enableNorthAmericaLaunch
    ? p.monthlyFreeReaders *
      (p.northAmericaReaderRatioPct / 100) *
      (p.krPaidConversionRatePct / 100) *
      m
    : 0;
  const northAmericaGrossKrw = naPaidReaders * p.northAmericaArpuKrw;
  const northAmericaAfterShareKrw = northAmericaGrossKrw * (p.northAmericaRevenueSharePct / 100);
  const northAmericaFeeKrw = northAmericaGrossKrw - northAmericaAfterShareKrw;

  // 4) 아크릴 키링 + 단행본 굿즈 순마진
  const goodsKeyringMonthlyKrw = p.goodsKeyringMonthlyUnits * p.goodsKeyringNetMarginKrw * m;
  const goodsBookMonthlyKrw = (p.goodsBookSeasonUnits / p.seasonMonths) * p.goodsBookNetMarginKrw * m;
  const goodsMonthlyTotalKrw = goodsKeyringMonthlyKrw + goodsBookMonthlyKrw;

  // 5) 합산 · 수수료 · 원천징수(3.3%) · 손익분기 회차
  const monthlyGrossRevenueKrw = Math.max(
    0,
    Math.round(krGrossKrw + japanGrossKrw + northAmericaGrossKrw + goodsMonthlyTotalKrw),
  );
  const monthlyPlatformFeesKrw = Math.max(
    0,
    Math.round(krPlatformFeeKrw + japanFeeKrw + northAmericaFeeKrw),
  );
  const monthlyPreTaxExact = Math.max(
    0,
    krAfterPlatformKrw + japanAfterShareKrw + northAmericaAfterShareKrw + goodsMonthlyTotalKrw,
  );
  const monthlyWithholdingTaxExact = monthlyPreTaxExact * (p.withholdingTaxPct / 100);
  const monthlyNetPayoutExact = Math.max(0, monthlyPreTaxExact - monthlyWithholdingTaxExact);

  const monthlyPreTaxPayoutKrw = Math.round(monthlyPreTaxExact);
  const monthlyWithholdingTaxKrw = Math.round(monthlyWithholdingTaxExact);
  const monthlyNetPayoutKrw = Math.max(0, Math.round(monthlyNetPayoutExact));
  const seasonNetPayoutKrw = Math.max(0, Math.round(monthlyNetPayoutExact * p.seasonMonths));

  const monthlyProductionCostKrw = Math.round(p.productionCostPerEpisodeKrw * p.episodesPerMonth);
  const monthlyOperatingProfitKrw = monthlyNetPayoutKrw - monthlyProductionCostKrw;
  const netPayoutPerEpisodeExact = monthlyNetPayoutExact / p.episodesPerMonth;
  const netPayoutPerEpisodeKrw = Math.max(0, Math.round(netPayoutPerEpisodeExact));

  let breakEvenEpisodeCount: number | null = null;
  if (monthlyNetPayoutExact > 0) {
    if (p.productionCostPerEpisodeKrw <= 0) {
      breakEvenEpisodeCount = 1;
    } else {
      const unitContribution = netPayoutPerEpisodeExact - p.productionCostPerEpisodeKrw;
      if (unitContribution > 0) {
        const upfrontBufferCost =
          UPFRONT_FREE_LAUNCH_BUFFER_EPISODES * p.productionCostPerEpisodeKrw;
        breakEvenEpisodeCount =
          UPFRONT_FREE_LAUNCH_BUFFER_EPISODES + Math.ceil(upfrontBufferCost / unitContribution);
      }
    }
  }

  return {
    id: preset.id,
    labelKo: preset.labelKo,
    labelEn: preset.labelEn,
    multiplier: m,
    monthlyGrossRevenueKrw,
    monthlyPlatformFeesKrw,
    monthlyPreTaxPayoutKrw,
    monthlyWithholdingTaxKrw,
    monthlyNetPayoutKrw,
    seasonNetPayoutKrw,
    monthlyProductionCostKrw,
    monthlyOperatingProfitKrw,
    netPayoutPerEpisodeKrw,
    breakEvenEpisodeCount,
    channels: {
      krGrossKrw: Math.round(krGrossKrw),
      krAfterPlatformKrw: Math.round(krAfterPlatformKrw),
      japanGrossKrw: Math.round(japanGrossKrw),
      japanAfterShareKrw: Math.round(japanAfterShareKrw),
      northAmericaGrossKrw: Math.round(northAmericaGrossKrw),
      northAmericaAfterShareKrw: Math.round(northAmericaAfterShareKrw),
      goodsKeyringMonthlyKrw: Math.round(goodsKeyringMonthlyKrw),
      goodsBookMonthlyKrw: Math.round(goodsBookMonthlyKrw),
      goodsMonthlyTotalKrw: Math.round(goodsMonthlyTotalKrw),
    },
  };
}

/**
 * 투명 수식 기반 글로벌 IP 수익화 시뮬레이터.
 * 한국 유료 미리보기 + 일본/북미 번역 연재 + 아크릴 키링/단행본 굿즈 마진에서
 * 플랫폼 수수료와 원천징수(기본 3.3%)를 차감해 보수/기준/낙관 3시나리오와 손익분기 회차를 계산한다.
 */
export function simulateGlobalIpRevenue(params: GlobalIpRevenueParams): GlobalIpRevenueResult {
  const sanitized = sanitizeRevenueParams(params);
  const conservative = evaluateScenario(sanitized, SCENARIO_PRESETS[0]);
  const base = evaluateScenario(sanitized, SCENARIO_PRESETS[1]);
  const optimistic = evaluateScenario(sanitized, SCENARIO_PRESETS[2]);

  return {
    sanitizedParams: sanitized,
    upfrontLaunchBufferEpisodes: UPFRONT_FREE_LAUNCH_BUFFER_EPISODES,
    scenarios: {
      conservative,
      base,
      optimistic,
    },
    disclaimer: REVENUE_DISCLAIMER_KO,
    disclaimerEn: REVENUE_DISCLAIMER_EN,
    formulaNotes: [
      `한국 유료 미리보기 = 월 무료 독자 × 전환율(${sanitized.krPaidConversionRatePct}%) × 회당 단가(${sanitized.krPreviewPriceKrw.toLocaleString("ko-KR")}원) × 구매 회차(${sanitized.krPaidEpisodesPerReader}화) × (1 - 수수료 ${sanitized.krPlatformFeePct}%)`,
      `글로벌 번역 연재 = 한국 독자 대비 권역 비율 × 전환율 × 권역 월 ARPU × 작가 정산율 (일본 ${sanitized.enableJapanLaunch ? "포함" : "제외"}, 북미 ${sanitized.enableNorthAmericaLaunch ? "포함" : "제외"})`,
      `굿즈·단행본 월 순마진 = 키링 월 판매량 × 개당 마진 + (단행본 시즌 판매량 ÷ ${sanitized.seasonMonths}개월) × 권당 마진`,
      `최종 예상 실수령액 = 정산 합계 × (1 - 원천징수 ${sanitized.withholdingTaxPct}%) · 손익분기 회차는 무료 3화 선제작 원가 회수 기준`,
    ],
  };
}

/**
 * D-14 ~ D+7 웹툰 런칭 홍보 실행 체크리스트를 생성한다.
 * Rights BOM 확인, 무료 공개 3화 훅 점검, 티저 숏폼, SNS 카드, 커뮤니티 홍보, 위젯 오픈을 포함한다.
 */
export function buildLaunchPromotionChecklist(
  input: LaunchChecklistInput,
): LaunchPromotionChecklist {
  const workTitle = input.workTitle.trim() || "신작 웹툰";
  const genre = input.genre.trim() || "웹툰";
  const activeChannelCount = Object.values(input.platformLinks).filter(
    (link) => typeof link === "string" && link.trim().length > 0,
  ).length;

  const items: LaunchChecklistItem[] = [
    {
      id: "d14-rights-bom",
      dayOffset: "D-14",
      category: "rights-bom",
      titleKo: "Rights BOM 상업·홍보 라이선스 최종 확인",
      titleEn: "Verify Rights BOM commercial & promo licenses",
      detailKo: `<${workTitle}> 1~3화 및 홍보 카드에 쓰인 폰트·3D 배경·브러시·효과음의 상업 연재/SNS 배포 허용 범위를 Rights BOM에서 확인합니다.`,
      detailEn: `Verify commercial and SNS promo rights for fonts, 3D sets, brushes, and SFX in Rights BOM.`,
      required: true,
    },
    {
      id: "d10-free3-hook",
      dayOffset: "D-10",
      category: "hook-check",
      titleKo: "무료 공개 3화 훅·엔딩 절단 점검",
      titleEn: "Audit free episodes 1-3 cliffhanger hooks",
      detailKo: `모바일 첫 화면 3초 흡인력과 3화 마지막 컷 유료 전환 훅이 <${genre}> 독자 기대와 맞는지 세로 스크롤로 점검합니다.`,
      detailEn: `Review mobile first-fold appeal and episode-3 cliffhanger pacing in vertical scroll preview.`,
      required: true,
    },
    {
      id: "d07-teaser-shortform",
      dayOffset: "D-7",
      category: "teaser-shortform",
      titleKo: "15초 세로 티저 숏폼 & SNS 3종 카드 팩 준비",
      titleEn: "Prepare 15s vertical teaser short & 3 SNS SVG cards",
      detailKo: "인스타그램 4:5 · X 16:9 · 유튜브 커뮤니티 1:1 카드 SVG와 3컷 하이라이트 기반 15초 티저 숏폼을 예약 대기열에 등록합니다.",
      detailEn: "Export 4:5 IG, 16:9 X, and 1:1 YouTube cards plus a 15s 3-cut vertical teaser short.",
      required: true,
    },
    {
      id: "d03-landing-meta",
      dayOffset: "D-3",
      category: "landing-card",
      titleKo: "정적 홍보 랜딩 HTML 배포 및 OpenGraph 미리보기 검증",
      titleEn: "Deploy standalone promo HTML & check OpenGraph cards",
      detailKo: `단일 HTML 파일을 게시하고 메신저·X 링크 카드(og:title/description)와 연결된 ${activeChannelCount}개 구독 링크 동작을 확인합니다.`,
      detailEn: `Host the static HTML page and test OpenGraph/Twitter card previews plus ${activeChannelCount} platform CTA links.`,
      required: true,
    },
    {
      id: "d00-fandom-widget",
      dayOffset: "D-Day",
      category: "fandom-widget",
      titleKo: "런칭 동시 공지 및 팬덤 리액션·투표 위젯 게시",
      titleEn: "Publish launch notice with fandom reaction & poll widget",
      detailKo: "연재 공개 시각에 맞춰 작품 공지·블로그에 4종 컷 리액션(심쿵/소름/명대사/다음화기대)과 다음 화 분기 투표 위젯을 오픈합니다.",
      detailEn: "Open the 4-reaction cut bar and next-episode poll embed alongside launch announcements.",
      required: true,
    },
    {
      id: "d03-community-promo",
      dayOffset: "D+3",
      category: "community",
      titleKo: "장르 독자 커뮤니티 홍보 및 하이라이트 2차 확산",
      titleEn: "Share highlight strip in genre reader communities",
      detailKo: `<${genre}> 독자 커뮤니티·카페·SNS 타래에 3컷 하이라이트 카드와 작가 제작 비하인드 1컷을 공유합니다.`,
      detailEn: "Post the 3-cut highlight card and one behind-the-scenes process cut in reader communities.",
      required: false,
    },
    {
      id: "d07-retrospective",
      dayOffset: "D+7",
      category: "retrospective",
      titleKo: "1주차 유입·전환 가정 점검 및 2주차 홍보 보정",
      titleEn: "Review week-1 retention assumptions & refine week-2 promo",
      detailKo:
        input.hasGlobalPlan || input.hasGoodsPlan
          ? "1주차 실측 유입·댓글 반응을 기준으로 IP 수익 시뮬레이터 가정치와 글로벌 번역·굿즈 일정을 보정합니다."
          : "1주차 실측 조회·좋아요·댓글 반응을 기준으로 IP 수익 시뮬레이터 가정치와 2주차 대표 컷을 보정합니다.",
      detailEn:
        "Update IP revenue simulator assumptions using actual week-1 reader engagement and adjust week-2 teaser cuts.",
      required: false,
    },
  ];

  return {
    workTitle,
    rangeLabel: "D-14 ~ D+7",
    items,
  };
}
