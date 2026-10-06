import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { CREATOR_HIRING_ROLES } from "../../../../../../packages/contracts/src/creator-hiring";

import type { CreatorCareerPublic } from "../../../../../../packages/contracts/src/creator-hiring";

import { useReducedMotionPreference } from "@/shared/ambient/useAmbientExperience";
import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

/** 커버가 없을 때의 아카이브 폴백 아트 — 기존 브랜드 아트(작업실과 떠오르는 원고 페이지)를 재사용한다. */
const ARCHIVE_ART_SRC = "/images/hero-main.webp";
const ROTATE_MS = 6000;
const MAX_FEATURED = 6;

/**
 * 커리어 갤러리 히어로 — 첫 화면의 주인공은 실제 작품 커버다.
 *
 * - 커버 보유 항목이 있으면 그 커버가 "이번 주 표지"로 히어로를 채우고 순환 전시한다.
 * - 커버가 없거나 데이터가 실패하면 홍보 문구가 아니라 브랜드 아카이브 아트로 차분히 대체한다.
 * - 로딩 중에는 아트 자리만 스켈레톤으로 비워 두고, 어떤 상태에서도 히어로의 높이와
 *   제목 자리는 유지해 첫 화면 구도가 무너지지 않게 한다.
 * 히어로의 커버 이미지는 같은 항목이 아래 카드에서 대체 텍스트와 함께 다시 나오므로
 * 여기서는 장식으로 두고, 표지 정보는 크레딧 텍스트가 전달한다.
 */
export function CareerGalleryHero({
  items,
  failed,
}: {
  /** null이면 아직 불러오는 중이거나 실패한 상태다. */
  items: CreatorCareerPublic[] | null;
  /** 데이터 불러오기가 실패했는지. 실패 시 스켈레톤이 아니라 아카이브 아트를 보인다. */
  failed: boolean;
}) {
  const reducedMotion = useReducedMotionPreference();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [brokenIds, setBrokenIds] = useState<ReadonlySet<string>>(() => new Set());

  const featuredItems = useMemo(
    () =>
      (items ?? [])
        .filter((item) => item.coverImageUrl && !brokenIds.has(item.id))
        .slice(0, MAX_FEATURED),
    [items, brokenIds],
  );
  const activeIndex = featuredItems.length > 0 ? index % featuredItems.length : 0;
  const featured = featuredItems[activeIndex] ?? null;
  const loading = items === null && !failed;

  useEffect(() => {
    if (featuredItems.length < 2 || paused || reducedMotion) return;
    const timer = window.setInterval(() => setIndex((value) => value + 1), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [featuredItems.length, paused, reducedMotion]);

  const title = translateCurrentStaticSourceText(
    "domains.collaboration.hiring.CreatorCareerPanel",
    "ko",
    "창작자 커리어 갤러리",
  );

  return (
    <section
      data-gallery-hero=""
      aria-label={title}
      className="relative isolate overflow-hidden rounded-3xl border border-line bg-panel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="relative h-[320px] sm:h-[360px] lg:h-[400px]">
        {loading ? (
          <div className="skeleton absolute inset-0" aria-hidden="true" />
        ) : featured ? (
          <img
            key={featured.id}
            src={featured.coverImageUrl ?? undefined}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
            style={reducedMotion ? undefined : { animation: "fade-in 0.6s ease-out" }}
            fetchPriority="high"
            decoding="async"
            onError={() =>
              setBrokenIds((previous) => {
                const next = new Set(previous);
                next.add(featured.id);
                return next;
              })
            }
          />
        ) : (
          <img
            src={ARCHIVE_ART_SRC}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
            fetchPriority="high"
            decoding="async"
          />
        )}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-black/5" />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-black/45 via-transparent to-transparent" />

        <div className="absolute inset-0 flex flex-col justify-end gap-2 p-6 text-white sm:p-8 lg:p-10">
          <p className="text-[11px] font-bold uppercase tracking-[.3em] text-white/75">Creator Gallery</p>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">{title}</h1>
          <p className="max-w-xl text-sm leading-6 text-white/85">
            포트폴리오는 아트가 전부입니다 — 대표작이 가장 먼저 보이는 자리에서 창작자들의 커리어를 전시합니다.
          </p>

          {featured ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold backdrop-blur-sm">이번 주 표지</span>
                <a
                  href={`#career-card-${featured.id}`}
                  className="font-bold text-white underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {featured.title}
                </a>
                <span className="text-white/80">
                  {featured.displayName} · {CREATOR_HIRING_ROLES[featured.role]}
                </span>
              </p>
              {featuredItems.length > 1 ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="이전 표지"
                    onClick={() => setIndex((value) => value - 1 + featuredItems.length)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    <ChevronLeft size={16} aria-hidden="true" />
                  </button>
                  {featuredItems.map((item, dotIndex) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-label={`${dotIndex + 1}번 표지 보기: ${item.title}`}
                      aria-current={dotIndex === activeIndex || undefined}
                      onClick={() => setIndex(dotIndex)}
                      className={cn(
                        "h-2 rounded-full backdrop-blur-sm transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                        dotIndex === activeIndex ? "w-6 bg-white" : "w-2 bg-white/45 hover:bg-white/70",
                      )}
                    />
                  ))}
                  <button
                    type="button"
                    aria-label="다음 표지"
                    onClick={() => setIndex((value) => value + 1)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </div>
              ) : null}
            </div>
          ) : !loading && items && items.length > 0 ? (
            <p className="mt-3 text-xs leading-5 text-white/70">
              표지는 창작자가 등록한 대표작 커버로 채워집니다. 아직 등록된 커버가 없어 아카이브 아트를 보여 드려요.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
