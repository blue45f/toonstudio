import { FolderKanban } from "lucide-react";

import { ProductIntentStart } from "@/domains/creator-resources/ProductIntentStart";
import { PageEntrance } from "@/shared/components/page-entrance/PageEntrance";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import { useI18n } from "@/shared/lib/i18n";
import { PRODUCT_IDENTITY, resolveProductLocale } from "@/shared/lib/product-identity";

import { AboutJourneyPager, IntroPrimaryLink, IntroSecondaryLink } from "./public/intro-primitives";
import { StudioAnnotatedTour } from "./StudioAnnotatedTour";
import { StudioIntroBridge, StudioIntroClosing, StudioIntroFlow, StudioIntroHeroStage } from "./StudioIntroNarrative";
import { StudioSupportLinks } from "./StudioSupportLinks";

import "./intent-start.css";
import "./studio-tour.css";

const SCOPE = "domains.marketing.CreatorHomeExperience";

export function CreatorStudioIntroduction() {
  const language = useI18n((state) => state.lang);
  const bi = useBilingualLocalizer(SCOPE);
  const identity = PRODUCT_IDENTITY[resolveProductLocale(language)];

  return (
    <PageEntrance variant="rise"><>
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
    </></PageEntrance>
  );
}
