import { getActiveI18nLocale, useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import { SITE_URL } from "@toonstudio/core/business";
import { ArrowRight, ArrowUpRight, ChevronDown, CirclePlay, Clapperboard, Download, FileText, Film, ImageIcon, Sparkles, Users } from "lucide-react";
import { useRef, type MouseEvent } from "react";
import { useSearchParams } from "react-router-dom";

import Link from "@/shared/navigation/router-link";
import { useDocumentTitle, useJsonLd, useMetaDescription, usePageSocialMeta } from "@/shared/seo/use-document-title";
import { useI18n } from "@/shared/lib/i18n";
import { ServiceStoryJourney } from "@/shared/components/service-story-journey";

import { creatorHomeLocale } from "./creator-home-content";
import { ProductTourPlayer } from "./ProductTourPlayer";
import { ProductTourAdditions } from "./ProductTourAdditions";
import { ProductTourShorts } from "./ProductTourShorts";
import { ProductTourChapterBackdrop, ProductTourIntroBackdrop, ProductTourOutroBand } from "./ProductTourAmbientClips";
import { ProductTourMadeNote } from "./ProductTourMadeNote";
import { ProductTourTechLinks } from "./ProductTourTechLinks";
import { RouteConditionBadges } from "./RouteConditionBadges";
import { ServiceFlowNext } from "./public/intro-primitives";
import { IntroTabs, type IntroTab } from "./public/intro-tabs";
import { parseProductTourLocation } from "./product-tour-location";
import type { ProductTourPlaybackController } from "./product-tour-playback";
import {
  PRODUCT_ROLES,
  PRODUCT_TOUR,
  PRODUCT_TOUR_COPY,
  formatProductTourTime,
  productTourChapterHref,
  productTourIsoDuration,
} from "./product-tour-content";

import "./marketing-page.css";
import "./product-tour-page.css";

const POSTER_URL = `${SITE_URL}${PRODUCT_TOUR.poster}`;

/** 영상 아래 보조 탭: 챕터별 기능 · 역할별 시작 · 영상 이후 더해진 기능. */
type TourMoreTab = "chapters" | "roles" | "new";

export function ProductTourPage() {
  const bi = useBilingualLocalizer("domains.marketing.ProductTourPage");
  const language = useI18n((state) => state.lang);
  const locale = creatorHomeLocale(language);
  const copy = bi(PRODUCT_TOUR_COPY.ko, PRODUCT_TOUR_COPY.en);
  const [searchParams] = useSearchParams();
  const tourStartParam = searchParams.get("t") ?? "0";
  const heroStart = parseProductTourLocation(`?${searchParams.toString()}`).seconds;
  const playerController = useRef<ProductTourPlaybackController>(null);

  useDocumentTitle(copy.pageTitle);
  useMetaDescription(copy.metaDescription);
  usePageSocialMeta({
    canonicalPath: "/product-tour",
    title: copy.pageTitle,
    description: copy.metaDescription,
    image: POSTER_URL,
    imageAlt: copy.pageTitle,
  });
  useJsonLd({
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: copy.pageTitle,
    description: copy.metaDescription,
    thumbnailUrl: POSTER_URL,
    contentUrl: `${SITE_URL}${PRODUCT_TOUR.src}`,
    embedUrl: `${SITE_URL}/product-tour#product-tour-video`,
    duration: productTourIsoDuration(PRODUCT_TOUR.duration),
    inLanguage: getActiveI18nLocale(),
    isFamilyFriendly: true,
    hasPart: PRODUCT_TOUR.chapters.map((chapter) => ({
      "@type": "Clip",
      name: bi(chapter.ko, chapter.en),
      startOffset: chapter.start,
      endOffset: chapter.end,
      url: `${SITE_URL}${productTourChapterHref(chapter.start)}`,
    })),
  });

  /**
   * 재생은 사용자 클릭 안에서 시작해야 소리가 막히지 않는다(재생 전에는 영상·음성을 받지 않는다).
   * 히어로 버튼과 '이 장면부터 보기'가 모두 이 경로로 한 번에 재생한다. 제어기가 없으면 딥링크로 이동한다.
   */
  const watchScene = (seconds: number) => (event: MouseEvent<HTMLAnchorElement>) => {
    const controller = playerController.current;
    if (!controller || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    document.getElementById("product-tour-video")?.scrollIntoView({ block: "start" });
    controller.playFrom(seconds, event);
  };

  const moreTabs: readonly IntroTab<TourMoreTab>[] = [
    { id: "chapters", label: bi("챕터별 기능", "Chapter features"), icon: Film },
    { id: "roles", label: bi("역할별 시작", "By role"), icon: Users },
    { id: "new", label: bi("새로 더해진 기능", "New since the tour"), icon: Sparkles },
  ];

  return (
    <div className="mk-page product-tour" lang={locale}>
      <header className="mk-shell product-tour__hero">
        <ProductTourIntroBackdrop />
        <div className="product-tour__hero-copy">
          <p className="mk-eyebrow">
            <Clapperboard size={15} aria-hidden="true" />
            <span aria-hidden="true">{copy.eyebrow}</span>
            <span className="sr-only">{copy.eyebrowSr}</span>
          </p>
          <h1 className="mk-title">{copy.title[0]} <em>{copy.title[1]}</em></h1>
          <p className="mk-lead">{copy.intro}</p>
          <div className="mk-actions">
            <a className="mk-button mk-button--primary" href="#product-tour-video" onClick={watchScene(heroStart)}><CirclePlay size={18} aria-hidden="true" />{copy.watch}</a>
            <Link className="mk-button" href="/studio/new">{copy.start}<ArrowRight size={17} aria-hidden="true" /></Link>
          </div>
          <ul className="mk-chip-list mk-chip-list--rail" aria-label={copy.factsLabel}>
            {copy.facts.map((fact) => <li key={fact} className="mk-chip">{fact}</li>)}
          </ul>
        </div>
      </header>

      <section className="product-tour__player-shell" aria-label={copy.watch}>
        <ProductTourPlayer key={tourStartParam} locale={locale} controllerRef={playerController} />
      </section>

      <section className="mk-shell product-tour__more" aria-labelledby="product-tour-features-title">
        <div className="product-tour__more-head">
          <p className="mk-eyebrow">{copy.featuresEyebrow}</p>
          <h2 id="product-tour-features-title" className="mk-h2">{copy.featuresTitle}</h2>
        </div>
        <IntroTabs
          tabs={moreTabs}
          fallback="chapters"
          label={bi("영상 이후 둘러보기", "After the film")}
          idPrefix="product-tour-more"
          param="view"
          mount="all"
          className="product-tour__tabs"
          panelClassName="mt-4"
        >
          {(id) => id === "chapters" ? (
            <>
              <p className="mk-body product-tour__note">{copy.featuresBody}</p>
              <p className="mk-body product-tour__note">{bi(
                "각 카드 배경에 은은하게 흐르는 영상은 챕터 분위기를 그린 생성형 AI 루프 영상입니다. 실제 제품 화면이 아니라 장식용 배경입니다.",
                "The soft motion behind each card is an AI-generated loop drawn for the chapter's mood — a decorative backdrop, not an actual product screen.",
              )}</p>
              <ol className="product-tour-page__journey-grid mk-rail">
                {PRODUCT_TOUR.chapters.map((chapter, index) => {
                  const title = bi(chapter.ko, chapter.en);
                  return (
                    <li key={chapter.id} className="product-tour__feature mk-card">
                      <ProductTourChapterBackdrop chapterId={chapter.id} />
                      <figure data-visual={chapter.visual}>
                        <img src={chapter.image} alt="" width={1440} height={1000} loading="lazy" decoding="async" />
                        <figcaption><span>{String(index + 1).padStart(2, "0")}</span>{formatProductTourTime(chapter.start)}</figcaption>
                        <span className="product-tour__visual-badge">
                          {chapter.visual === "concept" ? <Sparkles size={13} aria-hidden="true" /> : <ImageIcon size={13} aria-hidden="true" />}
                          {chapter.visual === "concept" ? copy.conceptBadge : copy.captureBadge}
                        </span>
                      </figure>
                      <div className="product-tour__feature-copy">
                        <h3>{title}</h3>
                        <p>{bi(chapter.summary.ko, chapter.summary.en)}</p>
                        <div className="product-tour__feature-actions">
                          <span className="product-tour__feature-open">
                            <Link className="mk-link" href={chapter.feature.href}>
                              {copy.visualOpen}<span className="product-tour__feature-name">· {bi(chapter.feature.ko, chapter.feature.en)}</span><ArrowUpRight size={15} aria-hidden="true" />
                            </Link>
                            <RouteConditionBadges href={chapter.feature.href} />
                          </span>
                          <a className="product-tour__scene-link" href={productTourChapterHref(chapter.start)} onClick={watchScene(chapter.start)}>
                            <CirclePlay size={15} aria-hidden="true" />{copy.watchScene}
                          </a>
                        </div>
                        <ProductTourTechLinks chapterId={chapter.id} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          ) : id === "roles" ? (
            <>
              <p className="mk-body product-tour__note">{copy.rolesBody}</p>
              <div className="product-tour__role-grid mk-rail">
                {PRODUCT_ROLES.map((role) => {
                  const [title, body] = bi(role.ko, role.en);
                  return (
                    <Link href={role.href} key={role.tag} className="product-tour__role mk-card">
                      <span className="mk-badge"><Users size={13} aria-hidden="true" />{role.tag}</span>
                      <h3>{title}</h3>
                      <p>{body}</p>
                      <small>{bi("이 역할로 시작", "Start in this role")}<ArrowRight size={14} aria-hidden="true" /></small>
                    </Link>
                  );
                })}
              </div>
            </>
          ) : (
            <ProductTourAdditions />
          )}
        </IntroTabs>
      </section>

      <ProductTourShorts />

      <section className="mk-shell product-tour__downloads" aria-labelledby="product-tour-downloads-title">
        <div className="product-tour__more-head">
          <p className="mk-eyebrow">{bi("자료 다운로드", "Downloads")}</p>
          <h2 id="product-tour-downloads-title" className="mk-h2">{bi("문서로 받아 가세요", "Take the documents with you")}</h2>
        </div>
        <p className="mk-body product-tour__note">{bi("제품 소개서와 IR 발표 덱을 파일로 준비해 뒀어요. 영상에서 본 내용을 문서로 천천히 읽어 보세요.", "The product brief and the IR deck are ready as files — read what you saw in the film, in document form.")}</p>
        <div className="product-tour__role-grid mk-rail">
          <a className="product-tour__role mk-card" href="/brand/toonstudio-intro.pdf" download>
            <span className="mk-badge"><FileText size={13} aria-hidden="true" />PDF</span>
            <h3>{bi("제품 소개서", "Product brief")}</h3>
            <p>{bi("ToonStudio가 뭘 하는 서비스인지, 네 쪽으로 정리했어요.", "What ToonStudio does, in four pages.")}</p>
            <small>{bi("PDF 내려받기", "Download the PDF")}<Download size={14} aria-hidden="true" /></small>
          </a>
          <a className="product-tour__role mk-card" href="/brand/toonstudio-ir-deck.pdf" download>
            <span className="mk-badge"><FileText size={13} aria-hidden="true" />PDF</span>
            <h3>{bi("IR 발표 덱", "IR pitch deck")}</h3>
            <p>{bi("시장과 경쟁, 제품과 만드는 사람까지 담은 발표 자료예요. 27쪽이에요.", "The full pitch — market, landscape, product and the builder. 27 pages.")}</p>
            <small>{bi("PDF 내려받기", "Download the PDF")}<Download size={14} aria-hidden="true" /></small>
          </a>
          <a className="product-tour__role mk-card" href="/brand/toonstudio-ir-deck.pptx" download>
            <span className="mk-badge"><FileText size={13} aria-hidden="true" />PPTX</span>
            <h3>{bi("IR 발표 덱 (편집용)", "IR pitch deck (editable)")}</h3>
            <p>{bi("파워포인트에서 바로 열리고, 필요하면 고쳐 쓸 수 있어요.", "Opens right in PowerPoint, ready to edit if you need to.")}</p>
            <small>{bi("PPTX 내려받기", "Download the PPTX")}<Download size={14} aria-hidden="true" /></small>
          </a>
        </div>
      </section>

      <ProductTourOutroBand />

      <section className="mk-shell product-tour__next" aria-label={bi("이어서 보기", "Keep exploring")}>
        <ServiceFlowNext current="tour" />
        <div className="product-tour__next-links">
          <Link className="mk-link" href="/ir">{copy.irDeck}<ArrowRight size={14} aria-hidden="true" /></Link>
          <Link className="mk-link" href="/brand-film">{copy.brandFilm}<ArrowRight size={14} aria-hidden="true" /></Link>
          <Link className="mk-link" href="/features">{copy.nextFeatures}<ArrowRight size={14} aria-hidden="true" /></Link>
          <Link className="mk-link" href="/about/workflow">{copy.nextWorkflow}<ArrowRight size={14} aria-hidden="true" /></Link>
          <Link className="mk-link" href="/about/technology">{copy.nextTechnology}<ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
        <ProductTourMadeNote />
        <details className="mk-fold">
          <summary>
            <span className="mk-fold__text"><span className="mk-fold__title">{bi("기술·발표 자료 이어 보기", "Continue with the engineering and presentation material")}</span></span>
            <ChevronDown size={18} aria-hidden="true" />
          </summary>
          <ServiceStoryJourney current="tour" />
        </details>
      </section>
    </div>
  );
}
