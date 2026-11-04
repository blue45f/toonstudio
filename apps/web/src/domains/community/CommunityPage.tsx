import {
  ArrowRight,
  CalendarDays,
  Clapperboard,
  Megaphone,
  MessageCircle,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { Navigate, useParams } from "react-router-dom";

import { CommunityScopeDirectory } from "./components/community-scope-directory";
import { CommunityActivityPreview } from "./components/community-activity-preview";
import {
  COMMUNITY_SCOPE_DESCRIPTION_KEYS,
  COMMUNITY_SCOPE_DIRECTORY_DESCRIPTION_KEYS,
  COMMUNITY_SCOPE_DIRECTORY_LABEL_KEYS,
  COMMUNITY_SCOPE_ICONS,
  COMMUNITY_SCOPE_LABEL_KEYS,
} from "./community-cafe-labels";

import type { FanCafeScopeFilter } from "@/shared/lib/types";

import { SiteLinkCard } from "@/domains/legal/public/site-link-card";
import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { FanCafePanel } from "./components/fan-cafe-panel";
import {
  workflowIllustrationSource,
  workflowIllustrationSources,
} from "@/shared/components/site-experience/workflow-illustration";
import { Container, Section } from "@/shared/components/section";
import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { SiteArtSurfaceSpotlight } from "@/shared/components/site-experience/SiteArtSurfaceSpotlight";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { introItemProps } from "@/shared/components/page-intro/page-intro-utils";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { COMMUNITY_SCOPE_DIRECTORIES } from "@/shared/lib/community-ui";
import Link from "@/shared/navigation/router-link";
import { COMMUNITY_PROMOTION_LEAGUE_TIERS } from "@/shared/navigation/webtoon-platform-router-ux-model";
import {
  defineBilingualText,
  formatI18nTemplate,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { useT } from "@/shared/lib/i18n";

const SCOPES = ["title", "author", "pencafe"] as const;

const COPY = {
  docTitle: defineBilingualText(
    "communityPage",
    "docTitle",
    "커뮤니티 · 웹툰을 함께 읽고 그리는 곳",
    "Community · Read and draw webtoons together",
  ),
  heroEyebrow: defineBilingualText(
    "communityPage",
    "heroEyebrow",
    "COMMUNITY · 이야기가 우리를 잇다",
    "COMMUNITY · STORIES BRING US TOGETHER",
  ),
  heroTitle: defineBilingualText(
    "communityPage",
    "heroTitle",
    "혼자 그린 이야기, 함께 넓어지는 세계.",
    "A story drawn alone, a world widened together.",
  ),
  heroSummary: defineBilingualText(
    "communityPage",
    "heroSummary",
    "작품·작가·펜카페·회원 카페를 따라 대화를 찾고, 창작자 갤러리와 리뷰로 감상을 이어가세요.",
    "Follow works, creators, pencafes and member cafés to find conversations, then keep going with the creator gallery and reviews.",
  ),
  heroArtCaption: defineBilingualText(
    "communityPage",
    "heroArtCaption",
    "브랜드 콘셉트 아트 · 실제 커뮤니티 화면이 아닙니다",
    "Brand concept art · not a live community screen",
  ),
  tagline: defineBilingualText(
    "communityPage",
    "tagline",
    "Together, We Create More",
    "Together, We Create More",
  ),
  ctaGallery: defineBilingualText("communityPage", "ctaGallery", "창작자 갤러리", "Creator gallery"),
  ctaCollab: defineBilingualText("communityPage", "ctaCollab", "웹툰 구인·의뢰", "Jobs & commissions"),
  ctaEvents: defineBilingualText("communityPage", "ctaEvents", "이벤트 게시판", "Events board"),
  promoteTitle: defineBilingualText(
    "communityPage",
    "promoteTitle",
    "아마추어 작가의 첫 연재, 새로운 웹툰의 첫 독자",
    "An amateur creator's first series, a new webtoon's first readers",
  ),
  promoteDescription: defineBilingualText(
    "communityPage",
    "promoteDescription",
    "작품 소개·홍보 영상·제작 과정을 공개하고 응원과 피드백을 나눠요. 홍보 게시물은 전용 공간에서 모아볼 수 있습니다.",
    "Share your work intro, trailers, and production process — and trade cheers and feedback. Promotion posts are collected in a dedicated space.",
  ),
  promoteAmateur: defineBilingualText("communityPage", "promoteAmateur", "아마추어 작가 찾기", "Find amateur creators"),
  promoteTrailer: defineBilingualText("communityPage", "promoteTrailer", "트레일러 상영관", "Trailer theater"),
  promoteNew: defineBilingualText("communityPage", "promoteNew", "내 작품 소개하기", "Introduce my work"),
  directoriesEyebrow: defineBilingualText(
    "communityPage",
    "directoriesEyebrow",
    "FIND YOUR CONVERSATION",
    "FIND YOUR CONVERSATION",
  ),
  directoriesTitle: defineBilingualText(
    "communityPage",
    "directoriesTitle",
    "어떤 이야기부터 나눌까요?",
    "Which story will you talk about first?",
  ),
  directoriesCta: defineBilingualText(
    "communityPage",
    "directoriesCta",
    "영감을 내 웹툰으로",
    "Turn inspiration into my webtoon",
  ),
  directoriesDescription: defineBilingualText(
    "communityPage",
    "directoriesDescription",
    "관심 있는 작품이나 작가, 모임부터 들어가 지금 오가는 대화를 확인하세요.",
    "Start from a work, creator or club you care about and see what people are talking about.",
  ),
  promoteEyebrow: defineBilingualText("communityPage", "promoteEyebrow", "SHOWCASE", "SHOWCASE"),
  promoteAmateurBody: defineBilingualText(
    "communityPage",
    "promoteAmateurBody",
    "첫 연재를 시작한 작가의 소개 글을 모아 봅니다.",
    "Browse introductions from creators starting their first series.",
  ),
  promoteTrailerBody: defineBilingualText(
    "communityPage",
    "promoteTrailerBody",
    "작품 소개 영상과 제작 과정 영상을 모아 봅니다.",
    "Watch work trailers and making-of videos in one place.",
  ),
  promoteNewBody: defineBilingualText(
    "communityPage",
    "promoteNewBody",
    "내 작품 소개와 홍보 영상을 올리고 피드백을 받아요.",
    "Post your work intro or trailer and collect feedback.",
  ),
  promoteStudio: defineBilingualText(
    "communityPage",
    "promoteStudio",
    "홍보 영상 스튜디오",
    "Promo video studio",
  ),
  promoteStudioBody: defineBilingualText(
    "communityPage",
    "promoteStudioBody",
    "웹툰 컷으로 10·15·30·60초 예고편과 세로 쇼츠를 바로 만듭니다.",
    "Turn webtoon panels into 10, 15, 30, or 60-second trailers and vertical shorts.",
  ),
  promoteStudioCta: defineBilingualText(
    "communityPage",
    "promoteStudioCta",
    "예고편 만들기",
    "Create trailer",
  ),
  promoteOpen: defineBilingualText("communityPage", "promoteOpen", "둘러보기", "Browse"),
  unifiedFeedRegion: defineBilingualText("communityPage", "unifiedFeedRegion", "통합 커뮤니티 피드", "Unified community feed"),
  unifiedFeedLabel: defineBilingualText("communityPage", "unifiedFeedLabel", "통합 커뮤니티 피드", "Unified community feed"),
  scopeEyebrow: defineBilingualText("communityPage", "scopeEyebrow", "COMMUNITY DIRECTORY", "COMMUNITY DIRECTORY"),
  scopeTitleTemplate: defineBilingualText("communityPage", "scopeTitleTemplate", "{v0} 커뮤니티", "{v0} community"),
  scopeDocTitleTemplate: defineBilingualText(
    "communityPage",
    "scopeDocTitleTemplate",
    "{v0} 커뮤니티 · 툰스튜디오",
    "{v0} community · ToonStudio",
  ),
  scopeNotFoundTitle: defineBilingualText(
    "communityPage",
    "scopeNotFoundTitle",
    "커뮤니티 범주를 찾을 수 없어요",
    "We couldn't find that community category",
  ),
  scopeNotFoundCta: defineBilingualText("communityPage", "scopeNotFoundCta", "통합 커뮤니티로 이동", "Go to the unified community"),
} as const;

function parseScope(raw: string | undefined): Exclude<FanCafeScopeFilter, "all" | "cafe"> | null {
  return SCOPES.find((scope) => scope === raw) ?? null;
}

const LEAGUE_TIER_IMAGES: Readonly<Record<string, string>> = {
  challenge: "/assets/site-experience/site-art-v1/cards/nb-create-canvas-640.webp",
  "best-challenge": "/assets/site-experience/site-art-v1/cards/nb-showcase-premiere-640.webp",
  originals: "/assets/site-experience/site-art-v1/cards/nb-ranking-constellation-640.webp",
  "creator-101": "/assets/site-experience/site-art-v1/cards/nb-production-control-640.webp",
};

export function CommunityPage() {
  useBilingualI18nRevision();
  const t = useT();
  useDocumentTitle(t(COPY.docTitle));
  const [sectionView, setSectionView] = useState<"all" | "league" | "feed" | "promote">("all");
  const showLeague = sectionView === "all" || sectionView === "league";
  const showFeed = sectionView === "all" || sectionView === "feed";
  const showPromote = sectionView === "all" || sectionView === "promote";

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <SiteContextualSubNav pathnameOverride="/community" className="mb-5" />
      <SitePageHeader
        size="hero"
        icon={UsersRound}
        eyebrow={t(COPY.heroEyebrow)}
        title={t(COPY.heroTitle)}
        description={t(COPY.heroSummary)}
        art="community"
        artSrc={workflowIllustrationSource("community", 960)}
        artSrcSet={workflowIllustrationSources("community")}
        artPlacement="banner"
        artCaption={t(COPY.heroArtCaption)}
        actions={
          <>
            <Link href="/showcase" className={buttonClass({ size: "md", className: "min-h-11" })}>
              {t(COPY.ctaGallery)}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link href="/collaborate" className={buttonClass({ variant: "outline", size: "md", className: "min-h-11" })}>
              <MessageCircle size={16} aria-hidden="true" />
              {t(COPY.ctaCollab)}
            </Link>
            <Link href="/community/events" className={buttonClass({ variant: "ghost", size: "md", className: "min-h-11" })}>
              <CalendarDays size={16} aria-hidden="true" />
              {t(COPY.ctaEvents)}
            </Link>
          </>
        }
      />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-center text-xs font-black uppercase tracking-[0.28em] text-fg-3 lg:text-left">
          {t(COPY.tagline)}
        </p>
        <div role="group" aria-label="커뮤니티 구역 보기 전환" className="flex flex-wrap gap-1.5">
          {([
            ["all", "전체 보기"],
            ["league", "승격 리그 · 활동"],
            ["feed", "대화방 · 통합 피드"],
            ["promote", "작품 홍보 · 예고편"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={sectionView === id}
              onClick={() => setSectionView(id)}
              className={`min-h-8 rounded-full border px-3 text-xs font-bold transition-colors ${
                sectionView === id
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-panel/70 text-fg-2 hover:border-accent/50 hover:text-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <SiteArtSurfaceSpotlight cardId="nb-community-plaza" compact className="mt-6" />

      {showLeague ? (
      <>
      <section
        aria-label="오픈 연재 승격 리그 및 창작자 성장 트랙"
        data-testid="community-promotion-league-strip"
        className="mt-6 rounded-2xl border border-line bg-card/85 p-4 shadow-sm sm:p-5"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-accent">
              OPEN SERIALIZATION LEAGUE · CHALLENGE → BEST → ORIGINALS → IP BIZ
            </span>
            <h2 className="mt-0.5 text-sm font-bold text-fg sm:text-base">
              첫 1화 등록부터 정식 요일연재·수익화까지 4단계 성장 리그
            </h2>
          </div>
          <Link
            href="/community/promote"
            className={buttonClass({ size: "sm", className: "min-h-9 gap-1.5 rounded-full px-3.5 text-xs font-bold" })}
          >
            내 작품 홍보 등록
            <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </div>
        <ol className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {COMMUNITY_PROMOTION_LEAGUE_TIERS.map((tier) => (
            <li
              key={tier.id}
              className="flex flex-col justify-between gap-2 rounded-2xl border border-line bg-panel/65 p-3.5 transition-colors hover:border-accent/45"
            >
              <div>
                <span
                  aria-hidden="true"
                  className="mb-2.5 block h-20 w-full rounded-xl border border-line/60 bg-cover bg-center"
                  style={{ backgroundImage: `url(${LEAGUE_TIER_IMAGES[tier.id] ?? "/assets/site-experience/site-art-v1/cards/nb-community-plaza-640.webp"})` }}
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold text-accent">{tier.badge}</span>
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent">
                    STEP {tier.stepNumber}
                  </span>
                </div>
                <p className="mt-1 text-xs font-extrabold text-fg sm:text-sm">{tier.label}</p>
                <p className="mt-1 text-[11px] leading-snug text-fg-3">{tier.description}</p>
              </div>
              <Link
                href={tier.route}
                className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline"
              >
                {tier.ctaLabel}
                <ArrowRight size={12} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <CommunityActivityPreview />
      </>
      ) : null}

      {showFeed ? (
      <>
      <Section
        className="mt-10 sm:mt-12"
        eyebrow={t(COPY.directoriesEyebrow)}
        title={t(COPY.directoriesTitle)}
        desc={t(COPY.directoriesDescription)}
        action={{ label: t(COPY.directoriesCta), href: "/studio/new" }}
      >
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          {COMMUNITY_SCOPE_DIRECTORIES.map((entry, index) => (
            <div key={entry.value} {...introItemProps(index)}>
              <SiteLinkCard
                layout="tile"
                className="h-full"
                href={entry.href}
                icon={COMMUNITY_SCOPE_ICONS[entry.value]}
                title={t(COMMUNITY_SCOPE_DIRECTORY_LABEL_KEYS[entry.value])}
                description={t(COMMUNITY_SCOPE_DIRECTORY_DESCRIPTION_KEYS[entry.value])}
              />
            </div>
          ))}
        </div>
      </Section>

      <section
        aria-label="커뮤니티 빠른 길잡이"
        data-testid="community-quick-guide"
        className="mt-8 rounded-2xl border border-line bg-card/65 p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold text-fg">
            처음 방문하셨나요? 관심 있는 활동부터 바로 참여해 보세요
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/community/reviews"
              className="inline-flex min-h-8 items-center gap-1 rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent"
            >
              작품 리뷰·감상평 보기
              <ArrowRight size={12} aria-hidden="true" />
            </Link>
            <Link
              href="/community/timelapse"
              className="inline-flex min-h-8 items-center gap-1 rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent"
            >
              작화 타임랩스 갤러리
              <ArrowRight size={12} aria-hidden="true" />
            </Link>
            <Link
              href="/community/promote/new"
              className="inline-flex min-h-8 items-center gap-1 rounded-full border border-accent/35 bg-accent/10 px-3 py-1 text-xs font-bold text-accent transition-colors hover:bg-accent/15"
            >
              내 신작 홍보하기
              <ArrowRight size={12} aria-hidden="true" />
            </Link>
            <Link
              href="/showcase/promo"
              className="inline-flex min-h-8 items-center gap-1 rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent"
            >
              홍보 영상·트레일러 만들기
              <ArrowRight size={12} aria-hidden="true" />
            </Link>
            <Link
              href="/cuts"
              className="inline-flex min-h-8 items-center gap-1 rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent"
            >
              숏폼 컷츠 피드
              <ArrowRight size={12} aria-hidden="true" />
            </Link>
            <Link
              href="/newsletter"
              className="inline-flex min-h-8 items-center gap-1 rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent"
            >
              뉴스레터 구독·발송
              <ArrowRight size={12} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-line bg-panel/45 p-1" aria-label={t(COPY.unifiedFeedRegion)}>
        <FanCafePanel scope="all" targetLabel={t(COPY.unifiedFeedLabel)} compact hideSpaceGuide />
      </section>
      </>
      ) : null}

      {showPromote ? (
      <Section
        className="mt-12 sm:mt-14"
        eyebrow={t(COPY.promoteEyebrow)}
        title={t(COPY.promoteTitle)}
        desc={t(COPY.promoteDescription)}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SiteLinkCard
            href="/community/promote?stage=amateur"
            icon={Sparkles}
            title={t(COPY.promoteAmateur)}
            description={t(COPY.promoteAmateurBody)}
            cta={t(COPY.promoteOpen)}
          />
          <SiteLinkCard
            href="/community/promote?kind=trailer"
            icon={Clapperboard}
            title={t(COPY.promoteTrailer)}
            description={t(COPY.promoteTrailerBody)}
            cta={t(COPY.promoteOpen)}
          />
          <SiteLinkCard
            href="/showcase/promo"
            icon={Clapperboard}
            title={t(COPY.promoteStudio)}
            description={t(COPY.promoteStudioBody)}
            cta={t(COPY.promoteStudioCta)}
          />
          <SiteLinkCard
            href="/community/promote/new"
            icon={Megaphone}
            title={t(COPY.promoteNew)}
            description={t(COPY.promoteNewBody)}
            cta={t(COPY.promoteNew)}
          />
        </div>
        <div
          data-testid="community-rea-creator-showcase-bar"
          className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-card/85 px-4 py-3 text-xs"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-extrabold text-accent">
              CARA · PIXIV · ARTSTATION · BEHANCE SHOWCASE · DRIBBBLE · PATREON · POSTYPE
            </span>
            {[
              { href: "/community/timelapse", ko: "직무별 WIP 타임랩스·pixiv Sketch 라이브", en: "Role WIP & Live Sketch" },
              { href: "/community?provenance=human-verified", ko: "인간 순수 창작 (Cara/DeviantArt No-AI)", en: "Human-Verified Art" },
              { href: "/community?provenance=ai-assisted", ko: "AI 보조 투명성·Dribbble 5색 팔레트 스와치", en: "AI Provenance & 5-Color Swatch" },
              { href: "/monetization", ko: "Patreon·FANBOX·포스타입 선공개/PSD 후원 티어", en: "Patreon/FANBOX/Postype Tiers" },
              { href: "/collaboration", ko: "스튜디오·어시스턴트 구인 매칭", en: "Studio & Assistant Recruiting" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full border border-line bg-panel px-2.5 py-1 text-[11px] font-semibold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent"
              >
                {item.ko}
              </Link>
            ))}
          </div>
        </div>
      </Section>
      ) : null}
    </Container>
  );
}

export function CommunityScopePage() {
  useBilingualI18nRevision();
  const t = useT();
  const { scope: rawScope } = useParams();
  const scope = parseScope(rawScope);
  const scopeLabel = scope ? t(COMMUNITY_SCOPE_LABEL_KEYS[scope]) : "";
  useDocumentTitle(
    scope
      ? formatI18nTemplate(t(COPY.scopeDocTitleTemplate), { v0: scopeLabel })
      : t(COPY.scopeNotFoundTitle),
  );
  if (rawScope === "cafe" || rawScope === "cafes") return <Navigate to="/community/cafes" replace />;
  const backToCommunity = (
    <Link href="/community" className={buttonClass({ variant: scope ? "ghost" : "solid", size: "sm", className: "min-h-11 gap-1.5" })}>
      <UsersRound size={15} aria-hidden="true" />
      {t(COPY.scopeNotFoundCta)}
    </Link>
  );
  if (!scope) {
    return (
      <Container size="wide" className="py-10 sm:py-14">
        <SitePageHeader surface="plain" icon={UsersRound} eyebrow="COMMUNITY" title={t(COPY.scopeNotFoundTitle)} actions={backToCommunity} />
      </Container>
    );
  }
  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <SiteContextualSubNav pathnameOverride="/community" className="mb-5" />
      <SitePageHeader
        surface="plain"
        className="mb-6 sm:mb-8"
        icon={COMMUNITY_SCOPE_ICONS[scope]}
        eyebrow={t(COPY.scopeEyebrow)}
        title={formatI18nTemplate(t(COPY.scopeTitleTemplate), { v0: scopeLabel })}
        description={t(COMMUNITY_SCOPE_DESCRIPTION_KEYS[scope])}
        actions={backToCommunity}
      />
      <CommunityScopeDirectory key={scope} scope={scope} />
    </Container>
  );
}
