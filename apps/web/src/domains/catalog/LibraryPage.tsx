import { ChevronRight, Library } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { LibraryDiaryTab } from "@/domains/engagement/public/LibraryDiaryTab";
import { useEngagement } from "@/domains/engagement/public/engagement-store";
import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { sitePageHeaderArtFor, sitePageHeaderArtPlacementFor } from "@/domains/legal/public/site-page-header-art";
import { LibraryView } from "@/shared/components/library-view";
import { MySpaceModuleChrome } from "@/shared/components/my-space-module-chrome";
import { Container } from "@/shared/components/section";
import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import {
  translateCurrentStaticSourceText,
  useBilingual,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";
import { LIBRARY_PILLAR_CARDS } from "@/shared/navigation/webtoon-platform-router-ux-model";
import { useApp } from "@/shared/lib/store";

const SCOPE = "domains.catalog.LibraryPage";
const tx = (source: string): string => translateCurrentStaticSourceText(SCOPE, "ko", source);
const txEn = (source: string): string => translateCurrentStaticSourceText(SCOPE, "en", source);

const TABS = ["shelf", "rated", "diary", "alerts", "taste", "collections"] as const;

/** "서재 → 취향 분석 → 추천" 3단계 미니 다이어그램 — 서재가 추천으로 이어지는 흐름을 한눈에. */
const JOURNEY_STEPS = [
  { label: "서재에 모으기", desc: "관심 작품 저장·평가", href: "/library" },
  { label: "취향 분석", desc: "나의 취향 스펙트럼 확인", href: "/library?tab=taste" },
  { label: "맞춤 추천", desc: "취향 기반 다음 작품", href: "/recommend" },
] as const;

export function LibraryPage() {
  useBilingualI18nRevision();
  const bt = useBilingual("LibraryPage");
  const [searchParams] = useSearchParams();
  const tab = TABS.find((entry) => entry === searchParams.get("tab")) ?? "shelf";
  const loggedIn = useApp((s) => Boolean(s.userId));
  const diaryEntries = useEngagement((state) => state.diaryEntries);
  const currentStep = tab === "taste" ? 1 : 0;

  return (
    <Container size="wide" className="py-6 sm:py-10">
      <SiteContextualSubNav pathnameOverride="/library" className="mb-4" />
      <MySpaceModuleChrome />
      <SitePageHeader
        className="mb-5 sm:mb-7"
        icon={Library}
        eyebrow={txEn("MY LIBRARY")}
        title={tx("내 서재")}
        description={`${bt(
          "관심 작품과 평가를 모으면, 툰스튜디오가 취향 스펙트럼을 분석해 다음 작품을 추천합니다.",
          "Collect favorites and ratings, and ToonStudio analyzes your taste spectrum to recommend what to read next.",
        )} ${loggedIn
          ? tx("서재·평가·컬렉션은 계정에 동기화됩니다. 감상 일기와 이 기기 관찰 이력은 현재 브라우저에 저장됩니다.")
          : tx("비로그인 상태에서는 서재와 감상 기록이 이 브라우저에 저장되며, 로그인하면 서재·평가·컬렉션이 계정에 동기화됩니다.")}`}
        art={sitePageHeaderArtFor("/library")}
        artPlacement={sitePageHeaderArtPlacementFor("/library")}
      >
        <ol aria-label={tx("서재에서 추천까지 3단계")} className="flex max-w-xl flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-0">
          {JOURNEY_STEPS.map((step, index) => (
            <li key={step.href} className="flex min-w-0 flex-1 items-stretch">
              <Link
                href={step.href}
                aria-current={index === currentStep ? "step" : undefined}
                className="group flex min-w-0 flex-1 flex-col gap-1 rounded-2xl border border-line bg-card/60 p-2.5 transition-colors hover:border-accent/45 hover:bg-accent-soft/40 sm:p-3"
              >
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent"
                  >
                    {index + 1}
                  </span>
                  <span className="truncate text-xs font-bold text-fg sm:text-sm">{tx(step.label)}</span>
                </span>
                <span className="pl-[1.875rem] text-xs leading-snug text-fg-3 sm:text-xs">
                  {tx(step.desc)}
                </span>
              </Link>
              {index < JOURNEY_STEPS.length - 1 && (
                <span aria-hidden="true" className="hidden w-6 shrink-0 place-items-center text-fg-3 sm:grid">
                  <ChevronRight size={14} />
                </span>
              )}
            </li>
          ))}
        </ol>
      </SitePageHeader>

      <section
        aria-label={bt("4대 개인 서재 허브", "4-pillar personal library hub")}
        data-testid="library-rea-pillar-cards"
        className="mb-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4"
      >
        {LIBRARY_PILLAR_CARDS.map((pillar) => {
          const targetTab =
            pillar.id === "purchases"
              ? "shelf"
              : pillar.id === "view"
                ? "diary"
                : pillar.id === "likes"
                  ? "rated"
                  : "collections";
          const isCurrent = tab === targetTab;
          const href = targetTab === "shelf" ? "/library" : `/library?tab=${targetTab}`;
          return (
            <Link
              key={pillar.id}
              href={href}
              aria-current={isCurrent ? "page" : undefined}
              className={
                isCurrent
                  ? "flex flex-col justify-between gap-1.5 rounded-2xl border border-accent bg-accent/12 p-3.5 shadow-sm transition-colors"
                  : "flex flex-col justify-between gap-1.5 rounded-2xl border border-line bg-card/80 p-3.5 transition-colors hover:border-accent/45 hover:bg-card"
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-fg">{pillar.label}</span>
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-extrabold text-accent">
                  {pillar.badge}
                </span>
              </div>
              <p className="text-[11px] leading-snug text-fg-3">{pillar.description}</p>
            </Link>
          );
        })}
      </section>

      <LibraryView
        initialTab={tab}
        diaryEntries={diaryEntries}
        renderDiaryTab={(titlesById) => <LibraryDiaryTab titlesById={titlesById} />}
      />
    </Container>
  );
}
