import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import { ArrowRight, PenLine, Sparkles, UsersRound } from "lucide-react";
import { useParams } from "react-router-dom";

import { FanCafePanel } from "./components/fan-cafe-panel";
import { Container } from "@/shared/components/section";
import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { compactPublicShareDescription } from "@/shared/lib/public-share-policy";
import {
  defineBilingualText,
  formatI18nTemplate,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { useI18n, useT } from "@/shared/lib/i18n";
import Link from "@/shared/navigation/router-link";
import { useDocumentTitle, useMetaDescription, usePageSocialMeta } from "@/shared/seo/use-document-title";

const SharePageButton = lazy(async () => {
  const module = await import("@/shared/components/share-page-button");
  return { default: module.SharePageButton };
});

const COPY = {
  eyebrow: defineBilingualText("pencafePage", "eyebrow", "펜카페", "PENCAFE"),
  feedRegion: defineBilingualText("pencafePage", "feedRegion", "펜카페 피드", "Pencafe feed"),
  titleTemplate: defineBilingualText("pencafePage", "titleTemplate", "{v0} 펜카페", "{v0} Pencafe"),
  fallbackTitle: defineBilingualText("pencafePage", "fallbackTitle", "펜카페", "Pencafe"),
  lede: defineBilingualText(
    "pencafePage",
    "lede",
    "펜카페/번역자/편집자 커뮤니티를 중심으로 대화, 정리, 번역 소식, 창작 노하우를 공유합니다.",
    "Share conversations, digests, translation news, and creation know-how around pencafe, translator, and editor communities.",
  ),
  shareDescriptionTemplate: defineBilingualText(
    "pencafePage",
    "shareDescriptionTemplate",
    "{v0} 독자와 창작자가 대화, 번역 소식과 창작 노하우를 나누는 공개 펜카페입니다.",
    "A public pencafe where {v0} readers and creators talk, share translation news, and exchange creation know-how.",
  ),
  shareDescriptionFallback: defineBilingualText(
    "pencafePage",
    "shareDescriptionFallback",
    "웹툰 독자와 창작자가 함께 이야기하는 공개 펜카페입니다.",
    "A public pencafe where webtoon readers and creators talk together.",
  ),
  shareLabel: defineBilingualText("pencafePage", "shareLabel", "펜카페 공유", "Share pencafe"),
  shareActionLabel: defineBilingualText("pencafePage", "shareActionLabel", "펜카페 보기", "View pencafe"),
  feedErrorTitle: defineBilingualText(
    "pencafePage",
    "feedErrorTitle",
    "펜카페 피드를 불러오지 못했습니다.",
    "Couldn't load the pencafe feed.",
  ),
  feedErrorMessage: defineBilingualText(
    "pencafePage",
    "feedErrorMessage",
    "일시적인 문제일 수 있습니다. 다시 시도해 보세요.",
    "This might be temporary — please try again.",
  ),
  feedErrorRetry: defineBilingualText("pencafePage", "feedErrorRetry", "다시 시도", "Retry"),
} as const;

interface PencafeFeedBoundaryProps {
  title: string;
  message: string;
  retryLabel: string;
  onRetry: () => void;
  children: ReactNode;
}

interface PencafeFeedBoundaryState {
  hasError: boolean;
}

/**
 * 페이지 레벨 에러 경계. FanCafePanel 내부의 로딩/에러 처리를 보완해
 * 렌더 크래시나 지연 로드 실패 시에도 페이지가 빈 화면이 되지 않게 한다.
 */
class PencafeFeedBoundary extends Component<PencafeFeedBoundaryProps, PencafeFeedBoundaryState> {
  state: PencafeFeedBoundaryState = { hasError: false };

  static getDerivedStateFromError(): PencafeFeedBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.error("[PencafePage] pencafe feed crashed", error);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="rounded-3xl border border-bad/35 bg-bad/10 px-6 py-10 text-center" role="alert">
          <p className="text-sm font-medium text-bad">{this.props.title}</p>
          <p className="mt-1 text-xs text-fg-3">{this.props.message}</p>
          <button
            type="button"
            onClick={this.props.onRetry}
            className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-bad/35 px-3 py-2 text-xs font-semibold text-bad"
          >
            {this.props.retryLabel}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

type FandomTierId = "rookie-reader" | "verified-binge-fan" | "patron-inner-circle";
type LiveModeId = "episode-watch-party" | "live-sketch-ama" | "goods-group-order";

const FANDOM_TIER_OPTIONS: readonly {
  readonly id: FandomTierId;
  readonly ko: string;
  readonly en: string;
  readonly detailKo: string;
  readonly detailEn: string;
}[] = [
  {
    id: "rookie-reader",
    ko: "신입 독자 라운지",
    en: "Rookie Reader Lounge",
    detailKo: "첫 방문 독자를 위한 스포일러 방지 환영 게시판과 세계관 입문 가이드를 엽니다.",
    detailEn: "Opens spoiler-safe welcome boards and worldbuilding primers for new readers.",
  },
  {
    id: "verified-binge-fan",
    ko: "정주행 인증 팬 등급",
    en: "Verified Binge Fan",
    detailKo: "최신화 열람 인증 독자에게 복선 해독 스레드와 팬아트 투고 권한을 부여합니다.",
    detailEn: "Unlocks theorycrafting threads and fan-art submission for verified caught-up readers.",
  },
  {
    id: "patron-inner-circle",
    ko: "후원 멤버십 이너서클",
    en: "Patron Inner Circle",
    detailKo: "후원 멤버 전용 비공개 작업일지·보이스 스테이지·투표 게시판을 활성화합니다.",
    detailEn: "Activates patron-only worklogs, voice stages, and poll boards for inner-circle members.",
  },
];

const LIVE_MODE_OPTIONS: readonly {
  readonly id: LiveModeId;
  readonly ko: string;
  readonly en: string;
  readonly detailKo: string;
  readonly detailEn: string;
}[] = [
  {
    id: "episode-watch-party",
    ko: "신작 동시감상 워치파티",
    en: "Episode Watch Party",
    detailKo: "신규 회차 공개 시각에 맞춰 스크롤 타임코드 반응과 실시간 채팅을 동기화합니다.",
    detailEn: "Synchronizes scroll timecode reactions and live chat during new episode drops.",
  },
  {
    id: "live-sketch-ama",
    ko: "작가 라이브 드로잉 AMA",
    en: "Live Sketch AMA",
    detailKo: "작가의 캔버스 드로잉 화면 공유와 음성 Q&A 스테이지 세션을 진행합니다.",
    detailEn: "Hosts live canvas drawing streams paired with moderated voice Q&A stages.",
  },
  {
    id: "goods-group-order",
    ko: "단행본·굿즈 공동구매",
    en: "Goods Group Order",
    detailKo: "아크릴 스탠드·단행본 특전 수요조사와 팬카페 공동구매 수량 집계를 관리합니다.",
    detailEn: "Coordinates demand surveys and group-order tallies for print volumes and acrylic goods.",
  },
];

export function PencafePage() {
  useBilingualI18nRevision();
  const t = useT();
  const lang = useI18n((state) => state.lang);
  const isKo = lang.startsWith("ko");
  const pickLang = (ko: string, en: string) => (isKo ? ko : en);
  const { name } = useParams();
  const targetLabel = name ?? "";
  const [feedRetryTick, setFeedRetryTick] = useState(0);
  const [fandomTier, setFandomTier] = useState<FandomTierId>("rookie-reader");
  const [liveMode, setLiveMode] = useState<LiveModeId>("episode-watch-party");

  const activeTier = FANDOM_TIER_OPTIONS.find((item) => item.id === fandomTier) ?? FANDOM_TIER_OPTIONS[0];
  const activeLive = LIVE_MODE_OPTIONS.find((item) => item.id === liveMode) ?? LIVE_MODE_OPTIONS[0];
  const sharePath = targetLabel
    ? `/pencafe/${encodeURIComponent(targetLabel)}`
    : "/community/pencafe";
  const shareTitle = targetLabel
    ? formatI18nTemplate(t(COPY.titleTemplate), { v0: targetLabel })
    : t(COPY.fallbackTitle);
  const shareDescription = compactPublicShareDescription(
    targetLabel
      ? formatI18nTemplate(t(COPY.shareDescriptionTemplate), { v0: targetLabel })
      : null,
    t(COPY.shareDescriptionFallback),
  );

  useDocumentTitle(shareTitle);
  useMetaDescription(shareDescription);
  usePageSocialMeta({
    canonicalPath: sharePath,
    title: shareTitle,
    description: shareDescription,
    type: "website",
  });

  return (
    <Container size="wide" className="relative py-6 sm:py-10">
      <SiteContextualSubNav pathnameOverride="/community/pencafe" className="mb-5" />
      <header className="relative mb-6 flex flex-col gap-4 overflow-hidden rounded-3xl border border-accent/25 bg-gradient-to-br from-accent/10 via-panel/90 to-card p-5 shadow-sm sm:mb-7 sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-accent via-cool to-accent-2" />
        <div>
          <p className="eyebrow inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-accent">
            <PenLine size={13} />
            {t(COPY.eyebrow)}
          </p>
          <h1 className="mt-3 text-[clamp(1.6rem,7vw,1.875rem)] font-extrabold tracking-tight sm:text-4xl">{shareTitle}</h1>
          <p className="lede mt-2 max-w-xl text-pretty text-sm leading-relaxed text-fg-2">
            {t(COPY.lede)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/showcase"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong/75 bg-card/90 px-3.5 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/55 hover:text-fg"
          >
            <Sparkles size={14} aria-hidden="true" className="text-accent" />
            {pickLang("창작 쇼케이스", "Creator Showcase")}
          </Link>
          <Link
            href="/collaborate"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong/75 bg-card/90 px-3.5 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/55 hover:text-fg"
          >
            <UsersRound size={14} aria-hidden="true" className="text-accent" />
            {pickLang("번역·어시 협업", "Collaborate")}
          </Link>
          <Link
            href="/create"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-accent/45 bg-accent px-3.5 text-xs font-bold text-on-accent shadow-xs transition-colors hover:bg-accent/90"
          >
            {pickLang("새 작품 시작", "Start Creating")}
            <ArrowRight size={13} aria-hidden="true" />
          </Link>
          {targetLabel ? (
            <Suspense fallback={null}>
              <SharePageButton
                path={sharePath}
                text={shareTitle}
                description={shareDescription}
                label={t(COPY.shareLabel)}
                actionLabel={t(COPY.shareActionLabel)}
              />
            </Suspense>
          ) : null}
        </div>
      </header>

      <img
        src="/images/section-community.webp"
        alt=""
        loading="lazy"
        decoding="async"
        className="mb-6 h-36 w-full rounded-3xl border border-line/70 object-cover shadow-xs sm:h-44"
      />

      <section
        data-testid="pencafe-rea-watchparty-bar"
        aria-label={pickLang("펜카페 팬덤 등급·워치파티 워크벤치", "Pencafe fandom tier and watch-party workbench")}
        className="relative mb-5 overflow-hidden rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/10 via-panel/90 to-card p-4 shadow-sm sm:p-5"
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-accent via-cool to-accent-2" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center rounded-full border border-accent/30 bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent">
            {pickLang("REA 팬덤 등급 · 라이브 워치파티 시뮬레이터", "REA Fandom Tier & Live Watch-Party Simulator")}
          </span>
          <span className="rounded-full border border-line/70 bg-card/85 px-3 py-1 font-mono text-xs text-fg-3">
            Naver Cafe · Weverse · Discord Stage · Chzzk Watch Party
          </span>
        </div>
        <div
          className="mt-3.5 flex flex-wrap items-center gap-2"
          role="group"
          aria-label={pickLang("팬덤 커뮤니티 등급", "Fandom community tier")}
        >
          <span className="text-xs font-semibold text-fg-2">
            {pickLang("팬덤 등급", "Fandom Tier")}
          </span>
          {FANDOM_TIER_OPTIONS.map((item) => {
            const active = item.id === fandomTier;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`pencafe-rea-tier-${item.id}`}
                aria-pressed={active}
                onClick={() => setFandomTier(item.id)}
                className={
                  active
                    ? "inline-flex min-h-11 items-center rounded-full border border-accent bg-accent-soft px-3.5 text-xs font-bold text-accent shadow-2xs"
                    : "inline-flex min-h-11 items-center rounded-full border border-line-strong/70 bg-card/85 px-3.5 text-xs font-semibold text-fg-2 hover:border-accent/45 hover:text-fg"
                }
              >
                {pickLang(item.ko, item.en)}
              </button>
            );
          })}
        </div>
        <div
          className="mt-2 flex flex-wrap items-center gap-2"
          role="group"
          aria-label={pickLang("라이브 커뮤니티 모드", "Live community mode")}
        >
          <span className="text-xs font-semibold text-fg-2">
            {pickLang("라이브 모드", "Live Mode")}
          </span>
          {LIVE_MODE_OPTIONS.map((item) => {
            const active = item.id === liveMode;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`pencafe-rea-live-${item.id}`}
                aria-pressed={active}
                onClick={() => setLiveMode(item.id)}
                className={
                  active
                    ? "inline-flex min-h-11 items-center rounded-full border border-accent bg-accent-soft px-3.5 text-xs font-bold text-accent shadow-2xs"
                    : "inline-flex min-h-11 items-center rounded-full border border-line-strong/70 bg-card/85 px-3.5 text-xs font-semibold text-fg-2 hover:border-accent/45 hover:text-fg"
                }
              >
                {pickLang(item.ko, item.en)}
              </button>
            );
          })}
        </div>
        <p
          data-testid="pencafe-rea-status"
          aria-live="polite"
          className="mt-3 rounded-xl border border-line/65 bg-card/85 px-3.5 py-2 font-mono text-xs text-fg"
        >
          {pickLang(
            `${activeTier.ko} + ${activeLive.ko} · ${activeTier.detailKo} (${activeLive.detailKo})`,
            `${activeTier.en} + ${activeLive.en} · ${activeTier.detailEn} (${activeLive.detailEn})`,
          )}
        </p>
      </section>

      <section aria-label={t(COPY.feedRegion)}>
        <PencafeFeedBoundary
          key={feedRetryTick}
          title={t(COPY.feedErrorTitle)}
          message={t(COPY.feedErrorMessage)}
          retryLabel={t(COPY.feedErrorRetry)}
          onRetry={() => setFeedRetryTick((tick) => tick + 1)}
        >
          <FanCafePanel scope="pencafe" targetId={targetLabel} targetLabel={targetLabel} compact />
        </PencafeFeedBoundary>
      </section>
    </Container>
  );
}
