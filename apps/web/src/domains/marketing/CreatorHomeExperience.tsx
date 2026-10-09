import { FolderKanban } from "lucide-react";

import { ProductIntentStart } from "@/domains/creator-resources/ProductIntentStart";
import { PageEntrance } from "@/shared/components/page-entrance/PageEntrance";
import { cx } from "@/shared/lib/cx";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import { useI18n } from "@/shared/lib/i18n";
import { PRODUCT_IDENTITY, resolveProductLocale } from "@/shared/lib/product-identity";
import { useTheme } from "@/shared/lib/theme";
import { usePathname } from "@/shared/navigation/navigation";

// 홈 래퍼 스타일(studio-introduction) → 여백 리듬(creator-home-spacing) → 시작 선택기(intent-start) → 작업실 둘러보기 층(studio-tour) 순서로 덮는다.
import "./studio-introduction.css";
import "./creator-home-spacing.css";
import "./intent-start.css";
import "./studio-tour.css";

import { AboutJourneyPager, IntroPrimaryLink, IntroSecondaryLink } from "./public/intro-primitives";
import { ComicIntroHost } from "./comic-intro/ComicIntroHost";
import { ReferenceCreatorDashboard } from "./ReferenceCreatorDashboard";
import { StudioAnnotatedTour } from "./StudioAnnotatedTour";
import { StudioIntroBridge, StudioIntroClosing, StudioIntroFlow, StudioIntroHeroStage } from "./StudioIntroNarrative";
import { StudioSupportLinks } from "./StudioSupportLinks";
import { useCreatorHomeSectionNavigation } from "./use-creator-home-section-navigation";

const SCOPE = "domains.marketing.CreatorHomeExperience";

/**
 * 공개 홈(/)은 참고 보드형 대시보드, /about/studio는 소개 서사다.
 * 서사는 히어로(전폭 브랜드 아트 무대+마감 카피) → 바로 시작 → 제작 흐름 → 기능 브리지
 * → 화면 구성 둘러보기 → 재료·협업·도움 → 마감 순서로 한 번에 읽힌다. 주석 달린
 * 예시 편집기 둘러보기는 서사 아래의 보조 섹션으로 남는다. 제품 원칙은
 * /about/principles가, 제작 과정 상세는 /about/workflow가 소유하므로 여기서는
 * 중복하지 않는다.
 */
export function CreatorHomeExperience() {
  useCreatorHomeSectionNavigation();
  const pathname = usePathname().replace(/\/+$/u, "").toLowerCase();
  const introduction = pathname === "/about/studio";
  const language = useI18n((state) => state.lang);
  const resolvedTheme = useTheme((state) => state.resolvedTheme);
  const bi = useBilingualLocalizer(SCOPE);
  const identity = PRODUCT_IDENTITY[resolveProductLocale(language)];

  return (
    <div
      // 소개 서사는 Tailwind 부품으로 그려서, 요소 규칙(h2 크기·p 여백 초기화)을 거는 옛 .creator-experience·.creator-flagship 래퍼를 쓰지 않는다.
      className={cx("creator-home", !introduction && "creator-experience creator-flagship")}
      data-creator-home="production-first"
      data-creator-experience="all-in-one-studio-v3"
      data-theme-art={resolvedTheme}
      data-product-direction="planning-to-publishing"
      data-home-view={introduction ? "introduction" : "dashboard"}
      lang={language}
    >
      {!introduction && <ReferenceCreatorDashboard />}
      {introduction && <PageEntrance variant="rise"><>
        <div className="cf-hero cf-shell">
          <StudioIntroHeroStage
            eyebrow={identity.category}
            titleId="creator-hero-title"
            title={identity.headline.join(" ")}
            lede={identity.description}
            actions={(
              <>
                <IntroPrimaryLink href="/studio/new">{bi("새 작품 시작하기", "Start a new work")}</IntroPrimaryLink>
                <IntroSecondaryLink href="/studio" icon={FolderKanban} className="border-white/40 bg-white/5 text-white hover:border-white/60 hover:bg-white/15 hover:text-white">{bi("내 프로젝트 열기", "Open my projects")}</IntroSecondaryLink>
              </>
            )}
          />
        </div>

        <div id="creator-start" className="cf-shell cf-home-wayfinding">
          <ProductIntentStart headingId="creator-toolkit-title" />
        </div>

        <StudioIntroFlow />
        <StudioIntroBridge />

        <section id="creator-tour" className="cf-shell mt-14 sm:mt-20" aria-labelledby="creator-tour-title">
          <h2 id="creator-tour-title" tabIndex={-1} className="mb-3 text-base font-bold text-fg">
            {bi("작업실 화면 구성 · 번호를 눌러 보세요", "Studio screen tour · tap a number")}
          </h2>
          <StudioAnnotatedTour />
        </section>

        <section id="creator-support" className="cf-shell mt-14 sm:mt-20" aria-labelledby="creator-support-title">
          <h2 id="creator-support-title" tabIndex={-1} className="mb-3 text-base font-bold text-fg">
            {bi("작품 밖으로 나가지 않고, 찾고 배우고 함께 만드세요.", "Find, learn and collaborate without leaving the work.")}
          </h2>
          <StudioSupportLinks />
        </section>

        <StudioIntroClosing />

        <div className="cf-shell cf-tour-end">
          <AboutJourneyPager current="/about/studio" />
        </div>
      </></PageEntrance>}
      {!introduction && <ComicIntroHost />}
    </div>
  );
}
