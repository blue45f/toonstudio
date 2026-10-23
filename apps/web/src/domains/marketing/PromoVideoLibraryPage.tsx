import { SITE_URL } from "@toonstudio/core/business";
import { ArrowLeft, ArrowRight, Clapperboard, Download, Sparkles } from "lucide-react";

import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import { normalizeLocaleCode, useI18n } from "@/shared/lib/i18n";
import Link from "@/shared/navigation/router-link";
import {
  useDocumentTitle,
  useMetaDescription,
  usePageSocialMeta,
} from "@/shared/seo/use-document-title";

import {
  PROMO_VIDEO_CATEGORIES,
  PROMO_VIDEO_ITEMS,
  promoVideosByCategory,
  type PromoVideoItem,
} from "./promo-video-library";

import "./marketing-page.css";
import "./promo-video-library.css";

const COPY = {
  ko: {
    pageTitle: "홍보 영상 자료실",
    metaDescription:
      "툰스튜디오 홍보에 쓰는 생성형 AI 영상 123편을 카테고리별로 모았습니다. 미리 보고 원본을 내려받아 쇼츠와 마케팅 소재로 활용하세요.",
    imageAlt: "툰스튜디오 홍보 영상 자료실",
    back: "서비스 소개",
    eyebrow: "PROMO VIDEO LIBRARY",
    title: ["홍보 영상,", "한곳에 모았습니다."],
    lead: "지금까지 만든 홍보 영상을 카테고리별로 모아 둔 자료실입니다. 나중에 쇼츠를 새로 편집하거나 마케팅 소재가 필요할 때, 여기서 미리 보고 원본 파일을 바로 내려받을 수 있습니다.",
    notice:
      "이 자료실의 영상은 전부 생성형 AI로 만든 개념 영상입니다. 실제 제품 화면 캡처가 아니라 분위기와 흐름을 전하는 홍보 소재라, 화면 구성은 실제 제품과 다를 수 있습니다.",
    howto:
      "각 항목의 재생 버튼으로 바로 확인하고, 원본 내려받기로 MP4 파일을 가져가세요. 지금 사이트 어딘가에 걸려 쓰이는 영상은 항목마다 '쓰는 곳'으로 표시했습니다.",
    factsLabel: "자료실 규모",
    jumpLabel: "카테고리 바로가기",
    clipsUnit: "편",
    specLabel: "규격",
    usageLabel: "쓰는 곳",
    download: "원본 내려받기",
    conceptBadge: "개념 영상",
    closingTitle: "영상이 쓰이는 자리도 함께 보세요.",
    closingBody:
      "이 자료실의 영상 상당수는 이미 브랜드 필름과 제품 투어, 기능 요약 페이지에 걸려 있습니다. 완성된 화면에서 어떻게 보이는지 먼저 확인해 보세요.",
    closingBrandFilm: "브랜드 필름 보기",
    closingTour: "제품 투어 보기",
  },
  en: {
    pageTitle: "Promo Video Library",
    metaDescription:
      "All 123 AI-generated ToonStudio promo clips in one library, organized by category. Preview each clip and download the originals for shorts and marketing use.",
    imageAlt: "ToonStudio promo video library",
    back: "About ToonStudio",
    eyebrow: "PROMO VIDEO LIBRARY",
    title: ["Every promo clip,", "in one library."],
    lead: "A library of every promo clip we have made, organized by category. When you need to cut a new short or pull marketing material later, preview a clip here and download the original file right away.",
    notice:
      "Every clip in this library is an AI-generated concept video. They are promotional material that conveys mood and flow — not captures of the actual product — so layouts may differ from the real product.",
    howto:
      "Press play on any item to preview it, and use Download original to take the MP4 with you. Clips already running somewhere on the site are marked with where they are used.",
    factsLabel: "Library at a glance",
    jumpLabel: "Jump to a category",
    clipsUnit: "clips",
    specLabel: "Spec",
    usageLabel: "Used on",
    download: "Download original",
    conceptBadge: "Concept clip",
    closingTitle: "See the clips where they run.",
    closingBody:
      "Many of these clips already run on the brand film, the product tour and the features overview. Check how they look in the finished pages first.",
    closingBrandFilm: "Watch the brand film",
    closingTour: "Watch the product tour",
  },
} as const;

function PromoVideoCard({ item }: { readonly item: PromoVideoItem }) {
  const bi = useBilingualLocalizer("domains.marketing.PromoVideoLibraryPage");
  const copy = bi(COPY.ko, COPY.en);
  const itemCopy = bi(item.ko, item.en);
  const usage = bi(item.usage.ko, item.usage.en);
  const note = item.note ? bi(item.note.ko, item.note.en) : undefined;
  return (
    <li className="promo-library__card mk-card" data-promo-video={item.id}>
      {/*
        자료실은 목록 페이지라 자동재생을 쓰지 않는다. 수십 개 영상이 한꺼번에
        움직이면 어지럽고 데이터도 많이 쓰며, 움직임 최소화를 선호하는
        사용자에게도 안전하지 않다. 재생은 사용자가 직접 누를 때만 일어난다.
      */}
      <video
        controls
        muted
        playsInline
        preload="metadata"
        src={item.src}
        width={item.width}
        height={item.height}
        aria-label={itemCopy.title}
      />
      <div className="promo-library__card-copy">
        <h3>{itemCopy.title}</h3>
        <p>{itemCopy.body}</p>
        {note ? <p className="promo-library__note">{note}</p> : null}
        <div className="promo-library__meta">
          <span className="mk-badge">
            <Sparkles size={13} aria-hidden="true" />
            {copy.conceptBadge}
          </span>
          <span className="promo-library__spec">
            {copy.specLabel} {item.width}×{item.height} · {item.durationLabel}
          </span>
        </div>
        <p className="promo-library__usage">
          <span>{copy.usageLabel}</span>
          {usage}
        </p>
        <div className="promo-library__card-actions">
          <a href={item.src} download className="mk-button">
            <Download size={15} aria-hidden="true" />
            {copy.download}
          </a>
        </div>
      </div>
    </li>
  );
}

export function PromoVideoLibraryPage() {
  const bi = useBilingualLocalizer("domains.marketing.PromoVideoLibraryPage");
  const language = useI18n((state) => state.lang);
  const documentLocale = normalizeLocaleCode(language) || "en";
  const copy = bi(COPY.ko, COPY.en);

  useDocumentTitle(copy.pageTitle);
  useMetaDescription(copy.metaDescription);
  usePageSocialMeta({
    canonicalPath: "/promo-library",
    title: copy.pageTitle,
    description: copy.metaDescription,
    image: `${SITE_URL}/brand/toonstudio-og.png`,
    imageAlt: copy.imageAlt,
  });

  const facts = [
    `${PROMO_VIDEO_ITEMS.length}${copy.clipsUnit}`,
    `${PROMO_VIDEO_CATEGORIES.length}${bi("개 카테고리", " categories")}`,
    bi("세로 쇼츠 28편 포함", "28 vertical shorts included"),
    bi("전부 생성형 AI 개념 영상", "All AI-generated concept clips"),
  ];

  return (
    <div className="mk-page promo-library" lang={documentLocale}>
      <header className="mk-shell promo-library__hero">
        <p className="mk-eyebrow">
          <Clapperboard size={15} aria-hidden="true" />
          {copy.eyebrow}
        </p>
        <h1 className="mk-title">
          {copy.title[0]} <em>{copy.title[1]}</em>
        </h1>
        <p className="mk-lead">{copy.lead}</p>
        <p className="mk-body promo-library__notice">{copy.notice}</p>
        <p className="mk-body">{copy.howto}</p>
        <ul className="mk-chip-list" aria-label={copy.factsLabel}>
          {facts.map((fact) => (
            <li key={fact} className="mk-chip">{fact}</li>
          ))}
        </ul>
        <nav className="promo-library__nav" aria-label={copy.jumpLabel}>
          {PROMO_VIDEO_CATEGORIES.map((category) => {
            const categoryCopy = bi(category.ko, category.en);
            const count = promoVideosByCategory(category.id).length;
            return (
              <a key={category.id} href={`#promo-category-${category.id}`} className="mk-chip promo-library__nav-chip">
                {categoryCopy.title} · {count}
              </a>
            );
          })}
        </nav>
      </header>

      {PROMO_VIDEO_CATEGORIES.map((category) => {
        const categoryCopy = bi(category.ko, category.en);
        const items = promoVideosByCategory(category.id);
        return (
          <section
            key={category.id}
            id={`promo-category-${category.id}`}
            className="mk-shell promo-library__section"
            aria-labelledby={`promo-category-${category.id}-title`}
          >
            <div className="promo-library__section-head">
              <h2 id={`promo-category-${category.id}-title`} className="mk-h2">{categoryCopy.title}</h2>
              <span className="promo-library__count">{items.length}{copy.clipsUnit}</span>
            </div>
            <p className="mk-body">{categoryCopy.body}</p>
            <ul className={`promo-library__grid${category.id === "shorts" ? " promo-library__grid--portrait" : ""}`}>
              {items.map((item) => (
                <PromoVideoCard key={item.id} item={item} />
              ))}
            </ul>
          </section>
        );
      })}

      <div className="mk-shell promo-library__footer">
        <section className="mk-closing promo-library__closing" aria-labelledby="promo-library-closing-title">
          <div>
            <h2 id="promo-library-closing-title" className="mk-h2">{copy.closingTitle}</h2>
            <p className="mk-body">{copy.closingBody}</p>
          </div>
          <div className="mk-actions">
            <Link href="/brand-film" className="mk-button mk-button--primary">
              {copy.closingBrandFilm}
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link href="/product-tour" className="mk-button">
              {copy.closingTour}
            </Link>
          </div>
        </section>
        <div className="promo-library__back">
          <Link href="/about" className="mk-back">
            <ArrowLeft size={16} aria-hidden="true" />
            {copy.back}
          </Link>
        </div>
      </div>
    </div>
  );
}
