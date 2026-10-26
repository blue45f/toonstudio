import { Clapperboard, Compass, Library, MessageSquareText } from "lucide-react";

import type { Title } from "@/shared/lib/types";

import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

const bi = (ko: string, en: string) =>
  translateBilingualValueForActiveLocale("TitleReaderReaBridgeCard", ko, en);

/**
 * Pixiv Comic (`/finish_reading/[sku]`), NAVER WEBTOON Cuts, RIDI 독서노트, Tapas 크리에이터 후원의
 * 완독 직후 후속 동선(Post-Episode Onward Bridge)을 내재화한 회차 뷰어 하단 카드.
 */
export function TitleReaderReaBridgeCard({
  title,
  episode,
}: {
  readonly title: Title;
  readonly episode: number;
}) {
  useBilingualI18nRevision();
  const detailPath = `/title/${encodeURIComponent(title.slug)}`;
  const pencafePath = `/pencafe/${encodeURIComponent(title.title)}`;

  const bridges = [
    {
      id: "cuts",
      href: "/cuts/studio",
      icon: Clapperboard,
      badge: "NAVER CUTS",
      label: bi("명장면 숏폼 컷츠 제작", "Create Short-form Cuts"),
      desc: bi("인상 깊은 장면을 숏폼 예고편으로 리믹스", "Remix memorable scenes into a trailer"),
    },
    {
      id: "pencafe",
      href: pencafePath,
      icon: MessageSquareText,
      badge: "PIXIV · FANCAFE",
      label: bi("펜카페 감상 토크", "Pencafe Episode Talk"),
      desc: formatI18nTemplate(bi("{v0}화 독자 감상평과 팬아트 나누기", "Share Ep.{v0} reactions & fan art"), {
        v0: String(episode),
      }),
    },
    {
      id: "library",
      href: "/library?tab=diary",
      icon: Library,
      badge: "RIDI · DIARY",
      label: bi("내 서재 · 감상 일기 기록", "Save to Reading Diary"),
      desc: bi("읽은 회차와 평점·문장 메모를 서재에 보관", "Log episode progress and notes in Library"),
    },
    {
      id: "recommend",
      href: `/DetailRecommendRedirect?from=${encodeURIComponent(detailPath)}`.startsWith("/Detail")
        ? "/recommend"
        : "/explore",
      icon: Compass,
      badge: "TAPAS · FOR YOU",
      label: bi("비슷한 결 맞춤 추천", "Similar Story Recommendations"),
      desc: bi("장르·분위기 스펙트럼이 닮은 후속작 탐색", "Discover next reads with matching genre DNA"),
    },
  ] as const;

  return (
    <section
      aria-label={bi("회차 감상 후 이어지는 활동", "Post-episode next steps")}
      data-testid="reader-rea-finish-bridge"
      className="mt-4 rounded-2xl border border-white/12 bg-reader-panel/80 p-4 sm:p-5"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-white/60">
            FINISH READING BRIDGE · PIXIV / CUTS / RIDI / TAPAS
          </span>
          <h3 className="mt-0.5 text-sm font-bold text-white">
            {formatI18nTemplate(bi("{v0}화 감상 후 이어가기", "After Episode {v0}"), {
              v0: String(episode),
            })}
          </h3>
        </div>
        <Link
          href={`${detailPath}#reviews`}
          className="text-xs font-semibold text-white/75 underline-offset-4 hover:text-white hover:underline"
        >
          {bi("작품 리뷰 남기기 →", "Write a review →")}
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {bridges.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              className="group flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left transition-colors hover:border-white/25 hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 text-white/85">
                <Icon size={16} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold tracking-wider text-white/50">
                  {item.badge}
                </span>
                <span className="mt-0.5 block text-xs font-bold text-white group-hover:underline">
                  {item.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-white/60">
                  {item.desc}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
