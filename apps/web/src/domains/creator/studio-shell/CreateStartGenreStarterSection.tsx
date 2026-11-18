import { ArrowRight } from "lucide-react";

import { useI18n } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

import {
  buildGuidedGenreStarterHref,
  STUDIO_GUIDED_GENRE_STARTERS,
} from "./guided-flow/studio-guided-flow-catalog";

export function CreateStartGenreStarterSection({
  className,
}: {
  readonly className?: string;
} = {}) {
  const bt = useBilingual("CreateStartGenreStarterSection");
  const lang = useI18n((state) => state.lang);
  const locale = lang.toLowerCase().startsWith("ko") ? "ko" : "en";

  return (
    <section
      aria-label={bt("초보자도 쉬운 1초 장르 스타터", "1-second visual genre starters")}
      data-testid="create-start-genre-starters"
      className={cn("mt-6", className)}
    >
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-line pb-3">
        <div>
          <p className="text-xs font-medium text-fg-3">
            {bt("장르 프리셋", "Genre presets")}
          </p>
          <h2 className="mt-1 text-base font-semibold text-fg [word-break:keep-all] sm:text-lg">
            {bt("분위기로 고르는 장르 스타터", "Start quickly with a genre preset")}
          </h2>
        </div>
        <p className="text-xs text-fg-3">
          {bt(
            "분위기 카드를 누르면 캔버스 크기와 첫 작업 단계가 자동으로 준비됩니다",
            "Select any card to prefill canvas dimensions and your starting stage",
          )}
        </p>
      </div>

      <div className="ink-cascade mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4">
        {STUDIO_GUIDED_GENRE_STARTERS.map((starter) => (
          <Link
            key={starter.id}
            href={buildGuidedGenreStarterHref(starter, locale)}
            data-testid={`genre-starter-${starter.id}`}
            style={{ minHeight: "44px" }}
            className="ink-frame group flex min-h-11 scroll-my-24 flex-col overflow-hidden rounded-[14px] border border-line bg-panel transition-colors duration-150 hover:border-line-strong hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
          >
            <span className="ink-cover ink-sheen relative block h-28 w-full overflow-hidden border-b border-line bg-canvas">
              <img
                src={starter.imageUrl}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </span>
            <span className="flex flex-1 flex-col justify-between p-4">
              <span>
                <span className="inline-block text-[11px] font-medium text-fg-3">
                  {bt(starter.badgeKo, starter.badgeEn)}
                </span>
                <strong className="mt-1 block text-sm font-semibold text-fg [word-break:keep-all] sm:text-base">
                  {bt(starter.titleKo, starter.titleEn)}
                </strong>
                <span className="mt-1.5 block text-xs leading-5 text-fg-2 [word-break:keep-all]">
                  {bt(starter.descKo, starter.descEn)}
                </span>
              </span>
              <span className="ink-arrow mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent">
                {bt(starter.ctaKo, starter.ctaEn)}
                <ArrowRight size={14} strokeWidth={1.6} aria-hidden="true" />
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
