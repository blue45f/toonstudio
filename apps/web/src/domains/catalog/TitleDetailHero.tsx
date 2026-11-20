import "./title-detail-purpose-layout.css";

import { ArrowRight, ArrowUpRight, BookOpen, Bookmark, BookmarkCheck, Star } from "lucide-react";
import { useRef, type CSSProperties } from "react";
import { useLocation } from "react-router-dom";

import type { Title } from "@/shared/lib/types";

import { isPlaceholderAuthorName } from "./local-catalog-fallback";
import { resolveExternalPlatformGuide } from "./title-episode-empty-guide";
import { useCatalogInkIndicator } from "./use-catalog-ink-indicator";
import { useTitleTrustSeal } from "./use-title-trust-seal";
import { ReaderTrustSealBadge } from "@/shared/components/ReaderTrustSealBadge";
import { TitlePoster } from "@/shared/components/title-poster";
import { proxiedCoverSrc } from "@/shared/lib/cover-proxy";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { useNextgenLabSettings } from "@/shared/hooks/use-nextgen-lab-settings";
import { PLATFORMS } from "@/shared/lib/platforms";
import { useApp, useHydrated } from "@/shared/lib/store";
import { AGE_LABEL, STATUS_LABEL, TYPE_LABEL } from "@/shared/lib/taxonomy";
import { toast } from "@/shared/lib/toast-store";
import { cn, formatCount } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

const bi = (ko: string, en: string) =>
  translateBilingualValueForActiveLocale("TitleDetailHero", ko, en);

function AuthorNames({ raw }: { raw: string }) {
  const names = (raw ?? "")
    .split(/[,/]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.length === 0) {
    return <span>{bi("작가 미상", "Author unknown")}</span>;
  }
  return (
    <>
      {names.map((name, index) => (
        <span key={`${name}-${index}`}>
          {index > 0 && ", "}
          {isPlaceholderAuthorName(name) ? (
            <span>{name}</span>
          ) : (
            <Link
              href={`/author/${encodeURIComponent(name)}`}
              className="rounded-sm underline-offset-2 transition-colors hover:text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {name}
            </Link>
          )}
        </span>
      ))}
    </>
  );
}

/** 실제 표지와 읽기 행동을 먼저 두고 상세 정보는 목적별 영역으로 연결한다. */
export function TitleDetailHero({
  title,
  reviewAvg,
  reviewCount,
  estimated,
  showSynopsis,
  showAvailability = true,
  firstEpisodeHref,
}: {
  title: Title;
  reviewAvg: number;
  reviewCount: number;
  estimated: boolean;
  showSynopsis: boolean;
  showAvailability?: boolean;
  /** 확인된 공개 회차의 내부 안내 경로. 회차가 확인되지 않으면 null이다. */
  firstEpisodeHref: string | null;
}) {
  useBilingualI18nRevision();
  const location = useLocation();
  const sectionNavRef = useRef<HTMLElement>(null);
  const selectedAnchor = ["#title-introduction", "#title-reviews"].includes(location.hash)
    ? location.hash
    : ["#title-detail-secondary-tools", "#title-availability", "#metrics", "#title-character-talk"].includes(location.hash)
      ? "#title-detail-secondary-tools"
      : "#title-episodes-anchor";
  const navInk = useCatalogInkIndicator(sectionNavRef, selectedAnchor, {
    activeSelector: '[aria-current="location"]',
    itemSelector: "a",
    maxInsetPx: 8,
  });
  const sectionHref = (anchor: string) => `${location.pathname}${location.search}${anchor}`;
  const hydrated = useHydrated();
  const labSettings = useNextgenLabSettings();
  const current = useApp((s) => s.reads[title.id]);
  const setRead = useApp((s) => s.setRead);
  const saved = hydrated && current != null && current !== "dropped";
  const externalGuide = resolveExternalPlatformGuide(title.availability, { availabilityVisible: showAvailability });
  const official = externalGuide.primary;
  const officialPlatformName = official ? PLATFORMS[official.platformId]?.name ?? official.platformId : null;
  const showBlurredBackdrop = Boolean(title.coverImage && title.ageRating !== "19");
  const trustSeal = useTitleTrustSeal(title.slug, title.title);

  const handleSaveToggle = () => {
    if (current === "want") {
      setRead(title.id, null);
      toast(bi("서재에서 뺐어요", "Removed from your library"), { tone: "default" });
    } else if (current == null || current === "dropped") {
      setRead(title.id, "want");
      toast(bi("서재에 담았어요", "Saved to your library"), { tone: "success" });
    } else {
      toast(bi("이미 서재에 담겨 있어요", "Already in your library"), { tone: "default" });
    }
  };

  return (
    <section aria-label={bi("작품 소개", "About this title")} className="title-detail-hero">
      <div className="title-detail-hero-stage">
        {showBlurredBackdrop && title.coverImage ? (
          <div aria-hidden="true" className="title-detail-stage-backdrop">
            <img
              src={proxiedCoverSrc(title.coverImage)}
              alt=""
              loading="eager"
              decoding="async"
              className="title-detail-stage-backdrop-img"
            />
            <span className="title-detail-stage-backdrop-scrim" />
          </div>
        ) : null}

        <div
          data-ink-enter="panel"
          style={{ "--ink-radius": "12px" } as CSSProperties}
          className="title-detail-cover ink-cover ink-sheen"
        >
          <TitlePoster title={title} size="hero" priority titleAs="div" />
        </div>

        <div className="title-detail-identity [overflow-wrap:anywhere]">
          <div className="title-detail-badges">
            <span>{TYPE_LABEL[title.type]}</span>
            <span>{STATUS_LABEL[title.status]}</span>
            <span>{AGE_LABEL[title.ageRating]}</span>
            <ReaderTrustSealBadge seal={trustSeal.seal} liveStatus={trustSeal.liveStatus} compact />
          </div>
          <h1>{title.title}</h1>
          <p className="title-detail-byline">
            <AuthorNames raw={title.author} />
            {title.artist && title.artist !== title.author && !isPlaceholderAuthorName(title.artist) && (
              <> · {bi("그림", "Art")} <AuthorNames raw={title.artist} /></>
            )}
          </p>
          <p className="title-detail-rating tabular-nums">
            <Star size={14} strokeWidth={1.5} aria-hidden="true" />
            <strong>{reviewAvg.toFixed(1)}</strong>
            <span>
              {estimated
                ? formatI18nTemplate(bi("약 {v0}개 평가 (추정)", "≈ {v0} ratings (est.)"), { v0: formatCount(reviewCount) })
                : formatI18nTemplate(bi("{v0}개의 평가", "{v0} ratings"), { v0: formatCount(reviewCount) })}
            </span>
          </p>
        </div>

        <div className="title-detail-actions">
          {official && (
            <a
              data-testid="title-official-read-link"
              href={official.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={formatI18nTemplate(bi("{v0}에서 보기 (새 탭)", "Read on {v0} (new tab)"), { v0: officialPlatformName ?? "" })}
              className="title-detail-action title-detail-action-primary min-h-12 [min-block-size:3rem]!"
            >
              <BookOpen size={17} strokeWidth={1.5} aria-hidden="true" />
              {formatI18nTemplate(bi("{v0}에서 보기", "Read on {v0}"), { v0: officialPlatformName ?? "" })}
              <ArrowUpRight size={15} strokeWidth={1.5} aria-hidden="true" />
            </a>
          )}
          {firstEpisodeHref && (
            <Link
              href={firstEpisodeHref}
              viewTransition={labSettings.viewTransitions}
              className={cn("title-detail-action min-h-12 [min-block-size:3rem]!", !official && "title-detail-action-primary")}
            >
              {bi("회차 안내 보기", "View episode guide")}
            </Link>
          )}
          <button
            type="button"
            onClick={handleSaveToggle}
            aria-pressed={saved}
            className={cn("title-detail-action min-h-12 [min-block-size:3rem]!", saved && "title-detail-action-saved")}
          >
            {saved ? <BookmarkCheck size={17} strokeWidth={1.5} aria-hidden="true" /> : <Bookmark size={17} strokeWidth={1.5} aria-hidden="true" />}
            {saved ? bi("서재에 담김", "In your library") : bi("서재에 담기", "Save to library")}
          </button>
        </div>

        {showSynopsis && title.synopsis && (
          <div className="title-detail-synopsis-preview">
            <p aria-hidden="true">{title.synopsis}</p>
            <Link href={sectionHref("#title-introduction")} className="ink-arrow">
              {bi("소개 더 보기", "Read the synopsis")}
              <ArrowRight size={13} strokeWidth={1.5} aria-hidden="true" />
            </Link>
          </div>
        )}

        {showAvailability && (
          <p className="title-detail-reading-note">
            {official
              ? bi("공식 플랫폼을 새 탭으로 열어요.", "Opens the official platform in a new tab.")
              : bi("공식 감상 링크가 아직 연결되지 않았어요. 아래 감상 플랫폼 안내를 확인해 주세요.", "An official reading link is not connected yet. Check the platform information below.")}
          </p>
        )}
      </div>

      <nav
        ref={sectionNavRef}
        data-testid="title-detail-section-nav"
        aria-label={bi("작품 상세 섹션 바로가기", "Jump to title section")}
        onPointerMove={navInk.onPointerMove}
        onPointerLeave={navInk.onPointerLeave}
        onFocusCapture={navInk.onFocusCapture}
        onBlurCapture={navInk.onBlurCapture}
        className="title-detail-purpose-nav"
      >
        {(
          [
            { href: "#title-episodes-anchor", ko: "회차", en: "Episodes" },
            { href: "#title-introduction", ko: "작품 소개", en: "About" },
            { href: "#title-reviews", ko: "리뷰", en: "Reviews" },
            { href: "#title-detail-secondary-tools", ko: "더 보기", en: "More" },
          ] as const
        ).map((item) => (
          <Link
            key={item.href}
            href={sectionHref(item.href)}
            aria-current={selectedAnchor === item.href ? "location" : undefined}
            className="min-h-12 [min-block-size:3rem]!"
          >
            {bi(item.ko, item.en)}
          </Link>
        ))}
        <span aria-hidden="true" className="title-detail-ink-indicator" style={navInk.style} />
      </nav>
    </section>
  );
}
