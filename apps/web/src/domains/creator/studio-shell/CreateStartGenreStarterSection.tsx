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
      className={cn("mt-6 rounded-2xl border border-line bg-card p-4 sm:p-6", className)}
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-accent">
            {bt("장르 프리셋", "Genre presets")}
          </p>
          <h2 className="mt-1 text-base font-bold text-fg sm:text-lg">
            {bt("분위기로 고르는 장르 스타터", "Start quickly with a genre preset")}
          </h2>
        </div>
        <p className="text-xs text-fg-3">
          {bt(
            "분위기 카드를 누르면 캔버스 크기와 첫 작업 단계가 자동으로 세팅돼요",
            "Tap any card to prefill canvas dimensions and your starting stage",
          )}
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4">
        {STUDIO_GUIDED_GENRE_STARTERS.map((starter) => (
          <Link
            key={starter.id}
            href={buildGuidedGenreStarterHref(starter, locale)}
            data-testid={`genre-starter-${starter.id}`}
            style={{ minHeight: "44px" }}
            className="group flex min-h-11 scroll-my-24 flex-col overflow-hidden rounded-2xl border border-line bg-panel/45 transition-colors duration-150 hover:border-accent/50 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
          >
            <span className="relative block h-32 w-full overflow-hidden bg-canvas">
              <img
                src={starter.imageUrl}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02] motion-reduce:transform-none"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-canvas/85 via-transparent to-transparent"
              />
              <span className="absolute bottom-2.5 left-3 rounded-md border border-line bg-card px-2.5 py-0.5 text-[11px] font-semibold text-fg">
                {bt(starter.badgeKo, starter.badgeEn)}
              </span>
            </span>
            <span className="flex flex-1 flex-col justify-between p-4">
              <span>
                <strong className="block text-sm font-bold text-fg sm:text-base">
                  {bt(starter.titleKo, starter.titleEn)}
                </strong>
                <span className="mt-1.5 block text-xs leading-5 text-fg-2">
                  {bt(starter.descKo, starter.descEn)}
                </span>
              </span>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent">
                {bt(starter.ctaKo, starter.ctaEn)}
                <ArrowRight
                  size={14}
                  aria-hidden="true"
                  className="transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none"
                />
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
