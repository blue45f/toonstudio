import {
  ArrowRight,
  CalendarDays,
  Clapperboard,
  Megaphone,
  MessageCircle,
  UsersRound,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import "./community-page-layout.css";
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import {
  COMMUNITY_SCOPE_DESCRIPTION_KEYS,
  COMMUNITY_SCOPE_DIRECTORY_DESCRIPTION_KEYS,
  COMMUNITY_SCOPE_DIRECTORY_LABEL_KEYS,
  COMMUNITY_SCOPE_ICONS,
  COMMUNITY_SCOPE_LABEL_KEYS,
} from "./community-cafe-labels";
import { CommunityActivityPreview } from "./components/community-activity-preview";
import { CommunityScopeDirectory } from "./components/community-scope-directory";
import { CommunityUnderlineTabs } from "./components/community-underline-tabs";
import { FanCafePanel } from "./components/fan-cafe-panel";

import type { FanCafeScopeFilter } from "@/shared/lib/types";

import { SiteLinkCard } from "@/domains/legal/public/site-link-card";
import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { Container, Section } from "@/shared/components/section";
import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { SiteArtSurfaceSpotlight } from "@/shared/components/site-experience/SiteArtSurfaceSpotlight";
import {
  workflowIllustrationSource,
  workflowIllustrationSources,
} from "@/shared/components/site-experience/workflow-illustration";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { COMMUNITY_SCOPE_DIRECTORIES } from "@/shared/lib/community-ui";
import { useT } from "@/shared/lib/i18n";
import {
  defineBilingualText,
  formatI18nTemplate,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";
import { COMMUNITY_PROMOTION_LEAGUE_TIERS } from "@/shared/navigation/webtoon-platform-router-ux-model";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

const SCOPES = ["title", "author", "pencafe"] as const;
type SectionViewId = "feed" | "league" | "promote" | "all";

const COPY = {
  browseMenu: defineBilingualText("communityPage", "browseMenu", "커뮤니티 종류 · 참여하기", "Community spaces and participation"),
  sectionView: defineBilingualText("communityPage", "sectionView", "커뮤니티 구역 보기 전환", "Community sections"),
  allSections: defineBilingualText("communityPage", "allSections", "전체 보기", "All sections"),
  leagueSection: defineBilingualText("communityPage", "leagueSection", "승격 리그 · 활동", "Promotion league & activity"),
  feedSection: defineBilingualText("communityPage", "feedSection", "대화방 · 통합 피드", "Conversations & unified feed"),
  promoteSection: defineBilingualText("communityPage", "promoteSection", "작품 홍보 · 예고편", "Promotion & trailers"),
  guideSection: defineBilingualText("communityPage", "guideSection", "커뮤니티 빠른 길잡이", "Community quick guide"),
  quickGuideRegion: defineBilingualText("communityPage", "quickGuideRegion", "커뮤니티 빠른 길잡이", "Community quick guide"),
  quickGuidePrompt: defineBilingualText(
    "communityPage",
    "quickGuidePrompt",
    "처음 방문하셨나요? 관심 있는 활동부터 바로 참여해 보세요",
    "First time here? Jump right into an activity that interests you",
  ),
  quickReviews: defineBilingualText("communityPage", "quickReviews", "작품 리뷰·감상평 보기", "Read work reviews"),
  quickTimelapse: defineBilingualText("communityPage", "quickTimelapse", "작화 타임랩스 갤러리", "Drawing timelapse gallery"),
  quickPromoteNew: defineBilingualText("communityPage", "quickPromoteNew", "내 신작 홍보하기", "Promote my new work"),
  quickPromoVideo: defineBilingualText("communityPage", "quickPromoVideo", "홍보 영상·트레일러 만들기", "Create promo trailer"),
  quickCuts: defineBilingualText("communityPage", "quickCuts", "숏폼 컷츠 피드", "Short-form Cuts feed"),
  quickNewsletter: defineBilingualText("communityPage", "quickNewsletter", "뉴스레터 구독·발송", "Newsletter hub"),
  leagueRegion: defineBilingualText(
    "communityPage",
    "leagueRegion",
    "오픈 연재 승격 리그 및 창작자 성장 트랙",
    "Open serialization promotion league and creator growth tracks",
  ),
  leagueEyebrow: defineBilingualText(
    "communityPage",
    "leagueEyebrow",
    "연재 성장 단계",
    "Serialization growth stages",
  ),
  leagueHeading: defineBilingualText(
    "communityPage",
    "leagueHeading",
    "첫 1화 등록부터 정식 요일연재·수익화까지 4단계 성장 리그",
    "4-stage creator growth league from Episode 1 to weekly Originals and IP monetization",
  ),
  leaguePromoteCta: defineBilingualText("communityPage", "leaguePromoteCta", "내 작품 홍보 등록", "Register work promotion"),
  tierStepTemplate: defineBilingualText("communityPage", "tierStepTemplate", "{v0}단계", "Stage {v0}"),
  tierChallengeBadge: defineBilingualText("communityPage", "tierChallengeBadge", "1단계 · 오픈 연재", "Stage 1 · Open Canvas"),
  tierChallengeLabel: defineBilingualText("communityPage", "tierChallengeLabel", "도전만화 · 오픈 캔버스", "Challenge · Open Canvas"),
  tierChallengeDesc: defineBilingualText(
    "communityPage",
    "tierChallengeDesc",
    "누구나 첫 1화와 세계관을 등록하고 독자 피드백을 받는 오픈 연재 트랙",
    "Open serialization track where anyone publishes Episode 1 and gathers reader feedback",
  ),
  tierChallengeCta: defineBilingualText("communityPage", "tierChallengeCta", "오픈 연재 시작", "Start open series"),
  tierChallengeMeter: defineBilingualText("communityPage", "tierChallengeMeter", "열독 · 피드백 축적", "Reader feedback"),
  tierBestBadge: defineBilingualText("communityPage", "tierBestBadge", "2단계 · 승격 후보", "Stage 2 · Showcase"),
  tierBestLabel: defineBilingualText("communityPage", "tierBestLabel", "베스트도전 · 쇼케이스 승격", "Best Challenge · Showcase"),
  tierBestDesc: defineBilingualText(
    "communityPage",
    "tierBestDesc",
    "열독률·별점·예고편 반응 상위 작품이 모이는 정식 승격 후보 쇼케이스",
    "Promotion-candidate showcase featuring top works by read-through, ratings, and trailer engagement",
  ),
  tierBestCta: defineBilingualText("communityPage", "tierBestCta", "작품 홍보관 등록", "Submit to showcase"),
  tierBestMeter: defineBilingualText("communityPage", "tierBestMeter", "승격 지표 심사", "Promotion index"),
  tierOriginalsBadge: defineBilingualText("communityPage", "tierOriginalsBadge", "3단계 · 정식 연재", "Stage 3 · Originals"),
  tierOriginalsLabel: defineBilingualText("communityPage", "tierOriginalsLabel", "정식 요일연재 · 오리지널", "Weekly Originals"),
  tierOriginalsDesc: defineBilingualText(
    "communityPage",
    "tierOriginalsDesc",
    "요일별 정기 연재와 실시간 랭킹·기다무 편성으로 독자층을 확장하는 단계",
    "Expand readership through weekly schedules, live rankings, and wait-until-free programming",
  ),
  tierOriginalsCta: defineBilingualText("communityPage", "tierOriginalsCta", "요일연재 편성표", "Weekly calendar"),
  tierOriginalsMeter: defineBilingualText("communityPage", "tierOriginalsMeter", "주간 독자 도달", "Weekly reach"),
  tierIpBadge: defineBilingualText("communityPage", "tierIpBadge", "4단계 · 수익·IP", "Stage 4 · Revenue & IP"),
  tierIpLabel: defineBilingualText("communityPage", "tierIpLabel", "수익화 · 2차 IP 사업화", "Monetization & IP Expansion"),
  tierIpDesc: defineBilingualText(
    "communityPage",
    "tierIpDesc",
    "후원·유료분 정산과 영상화·출판·게임 IP 확장을 연결하는 프로 작가 단계",
    "Connect paid episodes, patron support, and print/video/game IP adaptations",
  ),
  tierIpCta: defineBilingualText("communityPage", "tierIpCta", "수익·정산 센터", "Revenue center"),
  tierIpMeter: defineBilingualText("communityPage", "tierIpMeter", "정산 · IP 확장", "IP readiness"),
  reaSupportSummary: defineBilingualText(
    "communityPage",
    "reaSupportSummary",
    "창작 활동 지원 도구",
    "Creator support tools",
  ),
  reaLinkTimelapse: defineBilingualText(
    "communityPage",
    "reaLinkTimelapse",
    "작업 과정 타임랩스 갤러리",
    "Production timelapse gallery",
  ),
  reaLinkHuman: defineBilingualText(
    "communityPage",
    "reaLinkHuman",
    "직접 그린 창작물 모아보기",
    "Hand-drawn creator works",
  ),
  reaLinkAiProvenance: defineBilingualText(
    "communityPage",
    "reaLinkAiProvenance",
    "AI 보조 표기·색상 팔레트 보기",
    "AI disclosure & color palette",
  ),
  reaLinkMembership: defineBilingualText(
    "communityPage",
    "reaLinkMembership",
    "창작자 멤버십·선공개 후원",
    "Creator membership & early access",
  ),
  reaLinkRecruiting: defineBilingualText(
    "communityPage",
    "reaLinkRecruiting",
    "스튜디오 어시스턴트 구인 매칭",
    "Studio assistant recruiting",
  ),
  reaSimulatorGroup: defineBilingualText(
    "communityPage",
    "reaSimulatorGroup",
    "창작 수익·인쇄·저작권 보호 안내",
    "Creator monetization, print, and provenance guide",
  ),
  reaTrackCommission: defineBilingualText(
    "communityPage",
    "reaTrackCommission",
    "무수정 리퀘스트·커미션 슬롯",
    "Request & commission slots",
  ),
  reaTrackTier: defineBilingualText(
    "communityPage",
    "reaTrackTier",
    "후원 달성률·멤버십 단계별 보상",
    "Funding goals & membership tiers",
  ),
  reaTrackBooth: defineBilingualText(
    "communityPage",
    "reaTrackBooth",
    "행사 부스컷·300DPI 인쇄 재단선",
    "Event booth cut & 300DPI print bleed",
  ),
  reaTrackShield: defineBilingualText(
    "communityPage",
    "reaTrackShield",
    "창작 출처 서명·무단 학습 방지",
    "Provenance signature & training shield",
  ),
  configurationPreview: defineBilingualText("communityPage", "configurationPreview", "구성 미리보기:", "Configuration preview:"),
  commissionPreview: defineBilingualText("communityPage", "commissionPreview", "무수정 리퀘스트와 캐릭터 시트 작업 슬롯 예약 구성 예시", "Request and character sheet slot booking configuration example"),
  tierPreview: defineBilingualText("communityPage", "tierPreview", "후원 달성률 게이지와 원본 파일 단계별 배포 구성 예시", "Funding progress gauge and tiered source file distribution example"),
  boothPreview: defineBilingualText("communityPage", "boothPreview", "행사 부스 소개 컷과 300DPI 인쇄용 3mm 재단선 검토 예시", "Event booth artwork and 300DPI 3mm print bleed review example"),
  protectionPreview: defineBilingualText("communityPage", "protectionPreview", "작업 과정 타임랩스와 창작 출처 서명·무단 학습 방지 검토 예시", "Drawing timelapse and provenance signature protection review example"),
  docTitle: defineBilingualText(
    "communityPage",
    "docTitle",
    "커뮤니티 · 웹툰을 함께 읽고 그리는 곳",
    "Community · Read and draw webtoons together",
  ),
  heroTitle: defineBilingualText(
    "communityPage",
    "heroTitle",
    "커뮤니티",
    "Community",
  ),
  heroSummary: defineBilingualText(
    "communityPage",
    "heroSummary",
    "관심 있는 작품과 창작자의 이야기를 나눠요",
    "Talk about the works and creators you love",
  ),
  headerPrimaryCta: defineBilingualText(
    "communityPage",
    "headerPrimaryCta",
    "대화방 · 글쓰기",
    "Open boards & post",
  ),
  headerSecondaryCta: defineBilingualText(
    "communityPage",
    "headerSecondaryCta",
    "신작 홍보 등록",
    "Share a new work",
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
  directoriesTitle: defineBilingualText("communityPage", "directoriesTitle", "어떤 이야기부터 나눌까요?", "Which story will you talk about first?"),
  directoriesCta: defineBilingualText("communityPage", "directoriesCta", "영감을 내 웹툰으로", "Turn inspiration into my webtoon"),
  promoteEyebrow: defineBilingualText("communityPage", "promoteEyebrow", "작품 쇼케이스", "Work showcase"),
  promoteAmateurBody: defineBilingualText("communityPage", "promoteAmateurBody", "첫 연재를 시작한 작가의 소개 글을 모아 봅니다.", "Browse introductions from creators starting their first series."),
  promoteTrailerBody: defineBilingualText("communityPage", "promoteTrailerBody", "작품 소개 영상과 제작 과정 영상을 모아 봅니다.", "Watch work trailers and making-of videos in one place."),
  promoteNewBody: defineBilingualText("communityPage", "promoteNewBody", "내 작품 소개와 홍보 영상을 올리고 피드백을 받아요.", "Post your work intro or trailer and collect feedback."),
  promoteStudio: defineBilingualText("communityPage", "promoteStudio", "홍보 영상 스튜디오", "Promo video studio"),
  promoteStudioBody: defineBilingualText("communityPage", "promoteStudioBody", "웹툰 컷으로 10·15·30·60초 예고편과 세로 쇼츠를 바로 만듭니다.", "Turn webtoon panels into 10, 15, 30, or 60-second trailers and vertical shorts."),
  promoteStudioCta: defineBilingualText("communityPage", "promoteStudioCta", "예고편 만들기", "Create trailer"),
  promoteOpen: defineBilingualText("communityPage", "promoteOpen", "둘러보기", "Browse"),
  unifiedFeedRegion: defineBilingualText("communityPage", "unifiedFeedRegion", "통합 커뮤니티 피드", "Unified community feed"),
  unifiedFeedLabel: defineBilingualText("communityPage", "unifiedFeedLabel", "통합 커뮤니티 피드", "Unified community feed"),
  scopeEyebrow: defineBilingualText("communityPage", "scopeEyebrow", "커뮤니티", "Community"),
  scopeTitleTemplate: defineBilingualText("communityPage", "scopeTitleTemplate", "{v0} 커뮤니티", "{v0} community"),
  scopeDocTitleTemplate: defineBilingualText("communityPage", "scopeDocTitleTemplate", "{v0} 커뮤니티 · 툰스튜디오", "{v0} community · ToonStudio"),
  scopeNotFoundTitle: defineBilingualText("communityPage", "scopeNotFoundTitle", "커뮤니티 범주를 찾을 수 없어요", "We couldn't find that community category"),
  scopeNotFoundCta: defineBilingualText("communityPage", "scopeNotFoundCta", "통합 커뮤니티로 이동", "Go to the unified community"),
} as const;

const LEAGUE_TIER_COPY_KEYS = {
  challenge: { badge: COPY.tierChallengeBadge, label: COPY.tierChallengeLabel, description: COPY.tierChallengeDesc, cta: COPY.tierChallengeCta, meter: COPY.tierChallengeMeter, fillPct: 32 },
  "best-challenge": { badge: COPY.tierBestBadge, label: COPY.tierBestLabel, description: COPY.tierBestDesc, cta: COPY.tierBestCta, meter: COPY.tierBestMeter, fillPct: 58 },
  originals: { badge: COPY.tierOriginalsBadge, label: COPY.tierOriginalsLabel, description: COPY.tierOriginalsDesc, cta: COPY.tierOriginalsCta, meter: COPY.tierOriginalsMeter, fillPct: 82 },
  "creator-101": { badge: COPY.tierIpBadge, label: COPY.tierIpLabel, description: COPY.tierIpDesc, cta: COPY.tierIpCta, meter: COPY.tierIpMeter, fillPct: 100 },
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

function CommunityDisclosure({ title, children, initiallyOpen = false }: {
  title: string;
  children: ReactNode;
  initiallyOpen?: boolean;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || !details?.open) return;
      event.preventDefault();
      event.stopPropagation();
      details.open = false;
      details.querySelector("summary")?.focus();
    }
    details.addEventListener("keydown", closeOnEscape);
    return () => details.removeEventListener("keydown", closeOnEscape);
  }, []);
  return (
    <details className="community-layout-disclosure" ref={detailsRef} open={initiallyOpen}>
      <summary>{title}</summary>
      <div className="community-layout-disclosure-body">{children}</div>
    </details>
  );
}

export function CommunityPage() {
  useBilingualI18nRevision();
  const t = useT();
  useDocumentTitle(t(COPY.docTitle));
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const requestedView = searchParams.get("view");
  const sectionView: SectionViewId =
    requestedView === "all" || requestedView === "league" || requestedView === "promote"
      ? requestedView
      : "feed";

  const setSectionView = (view: SectionViewId) => {
    const next = new URLSearchParams(searchParams);
    if (view === "feed") next.delete("view");
    else next.set("view", view);
    navigate({ pathname: location.pathname, search: next.toString(), hash: location.hash });
  };

  const [activeReaTrack, setActiveReaTrack] = useState<
    "skeb-vgen-commission" | "tumblbug-fantia-tier" | "comiket-booth-cut" | "c2pa-nightshade-shield"
  >("skeb-vgen-commission");

  const showLeague = sectionView === "all" || sectionView === "league";
  const showFeed = sectionView === "all" || sectionView === "feed";
  const showPromote = sectionView === "all" || sectionView === "promote";

  return (
    <Container size="wide" className="community-layout py-6 sm:py-8 lg:py-10">
      <header className="community-layout-header">
        <div>
          <h1>{t(COPY.heroTitle)}</h1>
          <p className="mt-1.5 text-sm text-fg-2">{t(COPY.heroSummary)}</p>
        </div>
        <div className="community-layout-header-actions">
          <Link
            href="/community/cafes"
            className={buttonClass({ variant: "solid", size: "md", className: "min-h-11 gap-1.5 rounded-lg px-4 text-sm font-medium" })}
          >
            <UsersRound size={15} aria-hidden="true" />
            {t(COPY.headerPrimaryCta)}
          </Link>
          <Link
            href="/community/promote/new"
            className="ink-arrow inline-flex min-h-11 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-fg-2 transition-colors duration-150 hover:text-fg motion-reduce:transition-none"
          >
            {t(COPY.headerSecondaryCta)}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <div className="mt-2">
        <p className="sr-only">{t(COPY.tagline)}</p>
        <CommunityUnderlineTabs<SectionViewId>
          mode="group"
          ariaLabel={t(COPY.sectionView)}
          layoutId="community-main-section-underline"
          value={sectionView}
          onChange={setSectionView}
          items={[
            { id: "feed", label: t(COPY.feedSection) },
            { id: "league", label: t(COPY.leagueSection) },
            { id: "promote", label: t(COPY.promoteSection) },
            { id: "all", label: t(COPY.allSections) },
          ]}
        />
      </div>

      <CommunityDisclosure title={t(COPY.browseMenu)}>
        <div className="community-layout-actions">
          <Link href="/showcase" className={buttonClass({ size: "md", className: "min-h-11 rounded-lg" })}>
            {t(COPY.ctaGallery)}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link href="/collaborate" className={buttonClass({ variant: "outline", size: "md", className: "min-h-11 rounded-lg" })}>
            <MessageCircle size={16} aria-hidden="true" />
            {t(COPY.ctaCollab)}
          </Link>
          <Link href="/community/events" className={buttonClass({ variant: "ghost", size: "md", className: "min-h-11 rounded-lg" })}>
            <CalendarDays size={16} aria-hidden="true" />
            {t(COPY.ctaEvents)}
          </Link>
          <Link href="/studio/new" className={buttonClass({ variant: "ghost", size: "md", className: "min-h-11 rounded-lg" })}>
            {t(COPY.directoriesCta)}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <nav className="community-layout-directory" aria-labelledby="community-directory-heading">
          <h2 id="community-directory-heading" className="sr-only">{t(COPY.directoriesTitle)}</h2>
          {COMMUNITY_SCOPE_DIRECTORIES.map((entry) => {
            const Icon = COMMUNITY_SCOPE_ICONS[entry.value];
            return (
              <Link key={entry.value} href={entry.href} className="community-layout-directory-link">
                <Icon size={18} aria-hidden="true" />
                <span>{t(COMMUNITY_SCOPE_DIRECTORY_LABEL_KEYS[entry.value])}</span>
                <span className="sr-only">{t(COMMUNITY_SCOPE_DIRECTORY_DESCRIPTION_KEYS[entry.value])}</span>
              </Link>
            );
          })}
        </nav>
      </CommunityDisclosure>

      <div key={sectionView} className="ink-cascade space-y-6 pt-5">
        {showFeed ? (
          <>
            <section aria-label={t(COPY.unifiedFeedRegion)}>
              <FanCafePanel scope="all" targetLabel={t(COPY.unifiedFeedLabel)} compact hideSpaceGuide />
            </section>
            <CommunityDisclosure title={t(COPY.guideSection)}>
              <SiteContextualSubNav pathnameOverride="/community" className="mt-3" />
              <section
                aria-label={t(COPY.quickGuideRegion)}
                data-testid="community-quick-guide"
                className="mt-5 rounded-xl border border-line bg-panel/45 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium text-fg-2">
                    {t(COPY.quickGuidePrompt)}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {([
                      { href: "/reviews", label: COPY.quickReviews, accent: false },
                      { href: "/community/timelapses", label: COPY.quickTimelapse, accent: false },
                      { href: "/community/promote/new", label: COPY.quickPromoteNew, accent: true },
                      { href: "/showcase/promo", label: COPY.quickPromoVideo, accent: false },
                      { href: "/cuts", label: COPY.quickCuts, accent: false },
                      { href: "/newsletter", label: COPY.quickNewsletter, accent: false },
                    ] as const).map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={
                          item.accent
                            ? "ink-arrow inline-flex min-h-11 items-center gap-1 rounded-lg border border-accent/40 bg-accent-soft px-3 text-xs font-medium text-accent transition-colors duration-150 hover:border-accent motion-reduce:transition-none"
                            : "ink-arrow inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg-2 transition-colors duration-150 hover:border-line-strong hover:text-fg motion-reduce:transition-none"
                        }
                      >
                        {t(item.label)}
                        <ArrowRight size={12} aria-hidden="true" />
                      </Link>
                    ))}
                  </div>
                </div>
              </section>
            </CommunityDisclosure>
          </>
        ) : null}

        {showLeague ? (
          <CommunityDisclosure key={`league-${sectionView}`} title={t(COPY.leagueSection)} initiallyOpen={sectionView === "league"}>
            <section
              aria-label={t(COPY.leagueRegion)}
              data-testid="community-promotion-league-strip"
              className="mt-3 space-y-4"
            >
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <span className="text-xs font-medium text-accent">
                    {t(COPY.leagueEyebrow)}
                  </span>
                  <h2 className="mt-1 text-base font-semibold tracking-tight text-fg [word-break:keep-all] sm:text-lg">
                    {t(COPY.leagueHeading)}
                  </h2>
                </div>
                <Link
                  href="/community/promote"
                  className={buttonClass({ size: "sm", className: "min-h-11 gap-1.5 rounded-lg px-3.5 text-xs font-medium" })}
                >
                  {t(COPY.leaguePromoteCta)}
                  <ArrowRight size={13} aria-hidden="true" />
                </Link>
              </div>
              <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" data-ink-stagger>
                {COMMUNITY_PROMOTION_LEAGUE_TIERS.map((tier, index) => {
                  const copyKeys = LEAGUE_TIER_COPY_KEYS[tier.id];
                  return (
                    <li
                      key={tier.id}
                      className="ink-frame flex flex-col justify-between gap-3 rounded-xl border border-line bg-card/80 p-4 transition-colors duration-150 hover:bg-card motion-reduce:transition-none"
                    >
                      <div>
                        <div className="ink-cover ink-sheen mb-3 aspect-[16/9] w-full overflow-hidden rounded-lg border border-line/60 bg-raised">
                          <img
                            src={LEAGUE_TIER_IMAGES[tier.id] ?? "/assets/site-experience/site-art-v1/cards/nb-community-plaza-640.webp"}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-accent">{t(copyKeys.badge)}</span>
                          <span className="rounded-md bg-raised px-2 py-0.5 text-[11px] font-medium tabular-nums text-fg-2">
                            {formatI18nTemplate(t(COPY.tierStepTemplate), { v0: String(tier.stepNumber) })}
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm font-semibold text-fg [word-break:keep-all]">{t(copyKeys.label)}</p>
                        <p className="mt-1 text-xs leading-relaxed text-fg-2">{t(copyKeys.description)}</p>
                      </div>
                      <div className="space-y-2.5 border-t border-line/70 pt-3">
                        <div>
                          <div className="mb-1 flex items-center justify-between text-[11px] text-fg-3">
                            <span>{t(copyKeys.meter)}</span>
                            <span className="font-medium tabular-nums text-fg-2">{copyKeys.fillPct}%</span>
                          </div>
                          <span className="block h-1.5 w-full overflow-hidden rounded-sm bg-raised" aria-hidden="true">
                            <span
                              className="ink-bar-fill block h-full rounded-sm bg-accent"
                              style={{ width: `${copyKeys.fillPct}%`, "--ink-i": index } as CSSProperties}
                            />
                          </span>
                        </div>
                        <Link
                          href={tier.route}
                          className="ink-arrow inline-flex min-h-11 items-center gap-1 text-xs font-medium text-accent hover:underline"
                        >
                          {t(copyKeys.cta)}
                          <ArrowRight size={12} aria-hidden="true" />
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>

            <CommunityActivityPreview />
          </CommunityDisclosure>
        ) : null}

        {showPromote ? (
          <CommunityDisclosure key={`promote-${sectionView}`} title={t(COPY.promoteSection)} initiallyOpen={sectionView === "promote"}>
            <Section
              className="mt-4 sm:mt-6"
              eyebrow={t(COPY.promoteEyebrow)}
              title={t(COPY.promoteTitle)}
              desc={t(COPY.promoteDescription)}
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-ink-stagger>
                <SiteLinkCard
                  href="/community/promote?stage=amateur"
                  icon={UsersRound}
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
              <details className="mt-4 rounded-xl border border-line bg-panel/45 px-4 py-1 open:pb-3">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 py-2 text-xs font-medium text-fg-2 [&::-webkit-details-marker]:hidden">
                  <span>{t(COPY.reaSupportSummary)}</span>
                </summary>
                <div
                  data-testid="community-rea-creator-showcase-bar"
                  className="space-y-2.5 border-t border-line/70 pt-3 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    {([
                      { href: "/community/timelapses", label: COPY.reaLinkTimelapse },
                      { href: "/community?provenance=human-verified", label: COPY.reaLinkHuman },
                      { href: "/community?provenance=ai-assisted", label: COPY.reaLinkAiProvenance },
                      { href: "/creator/membership", label: COPY.reaLinkMembership },
                      { href: "/team/recruiting", label: COPY.reaLinkRecruiting },
                    ] as const).map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg-2 transition-colors duration-150 hover:border-accent/45 hover:text-fg motion-reduce:transition-none"
                      >
                        {t(item.label)}
                      </Link>
                    ))}
                  </div>
                  <div
                    data-testid="community-rea-interactive-workbench"
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-canvas/55 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t(COPY.reaSimulatorGroup)}>
                      <span className="text-xs font-medium text-fg-2">{t(COPY.configurationPreview)}</span>
                      {([
                        { id: "skeb-vgen-commission", label: COPY.reaTrackCommission },
                        { id: "tumblbug-fantia-tier", label: COPY.reaTrackTier },
                        { id: "comiket-booth-cut", label: COPY.reaTrackBooth },
                        { id: "c2pa-nightshade-shield", label: COPY.reaTrackShield },
                      ] as const).map((track) => (
                        <button
                          key={track.id}
                          type="button"
                          data-testid={`community-rea-track-${track.id}`}
                          aria-pressed={activeReaTrack === track.id}
                          onClick={() => setActiveReaTrack(track.id)}
                          className={`inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none ${
                            activeReaTrack === track.id
                              ? "bg-accent text-on-accent"
                              : "border border-line bg-card text-fg-2 hover:border-accent/45"
                          }`}
                        >
                          {t(track.label)}
                        </button>
                      ))}
                    </div>
                    <span data-testid="community-rea-active-track-summary" className="text-xs text-fg-2">
                      {activeReaTrack === "skeb-vgen-commission"
                        ? t(COPY.commissionPreview)
                        : activeReaTrack === "tumblbug-fantia-tier"
                          ? t(COPY.tierPreview)
                          : activeReaTrack === "comiket-booth-cut"
                            ? t(COPY.boothPreview)
                            : t(COPY.protectionPreview)}
                    </span>
                  </div>
                </div>
              </details>
            </Section>
          </CommunityDisclosure>
        ) : null}

        <CommunityDisclosure title={t(COPY.heroArtCaption)}>
          <figure>
            <img
              src={workflowIllustrationSource("community", 960)}
              srcSet={workflowIllustrationSources("community")}
              sizes="(max-width: 640px) 100vw, 960px"
              alt=""
              loading="lazy"
              className="community-layout-art"
            />
            <figcaption className="mt-2 text-xs text-fg-3">{t(COPY.heroArtCaption)}</figcaption>
          </figure>
          <SiteArtSurfaceSpotlight cardId="nb-community-plaza" compact className="mt-6" />
        </CommunityDisclosure>
      </div>
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
    <Link href="/community" className={buttonClass({ variant: scope ? "ghost" : "solid", size: "sm", className: "min-h-11 gap-1.5 rounded-lg" })}>
      <UsersRound size={15} aria-hidden="true" />
      {t(COPY.scopeNotFoundCta)}
    </Link>
  );
  if (!scope) {
    return (
      <Container size="wide" className="py-10 sm:py-14">
        <SitePageHeader surface="plain" icon={UsersRound} eyebrow={t(COPY.scopeEyebrow)} title={t(COPY.scopeNotFoundTitle)} actions={backToCommunity} />
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
