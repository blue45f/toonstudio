import { ChevronDown, Sparkles } from "lucide-react";
import { Suspense, useState } from "react";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";

const LazyStudioZeroBarrierUxPanel = lazyRetry(
  () =>
    import("../zero-barrier-ux/StudioZeroBarrierUxPanel").then((module) => ({
      default: module.StudioZeroBarrierUxPanel,
    })),
  "StudioZeroBarrierUxPanel",
);

/**
 * 제작 개요 첫 화면의 표지 무대 — aggregate.coverImageUrl이 있을 때만 세워진다.
 * 표지가 없으면 아무것도 그리지 않아, 빈 표지 폴백(헤더의 이니셜 타일)이
 * 그대로 유지된다. 같은 표지를 흐릿한 배경으로 깔아 무대감을 만들고,
 * 주인공 표지는 세로 원본 비율 그대로 크게 세운다.
 */
export function ProductionOverviewCoverStage({ aggregate }: { readonly aggregate: ProductionProjectAggregate }) {
  const bt = useBilingual("ProductionOverviewCoverStage");
  const [zeroBarrierOpen, setZeroBarrierOpen] = useState(false);
  const coverImageUrl = aggregate.coverImageUrl ?? null;
  if (!coverImageUrl) return null;
  const brief = [...aggregate.projectBriefs].sort((a, b) => b.revision - a.revision)[0] ?? null;
  const logline = brief?.logline.trim() ? brief.logline : null;
  return (
    <section aria-label={bt("작품 표지와 소개", "Work cover and introduction")} className="relative overflow-hidden rounded-3xl border border-line bg-panel">
      <img
        src={coverImageUrl}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-md"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-panel via-panel/70 to-panel/20" aria-hidden="true" />
      <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
        <img
          src={coverImageUrl}
          alt={bt(`${aggregate.title} 표지`, `${aggregate.title} cover`)}
          width={768}
          height={1024}
          fetchPriority="high"
          className="aspect-[3/4] w-40 shrink-0 rounded-xl border border-line object-cover shadow-2xl motion-safe:animate-fade-up sm:w-52"
        />
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.14em] text-accent">{bt("제작 중인 작품", "NOW IN PRODUCTION")}</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-fg sm:text-3xl">{aggregate.title}</h2>
          {logline ? <p className="mt-3 max-w-2xl text-base leading-7 text-fg-2">{logline}</p> : null}
        </div>
      </div>
      <div className="relative border-t border-line/80 bg-panel/90 px-4 py-3 sm:px-6">
        <details
          data-testid="studio-zero-barrier-ux-disclosure"
          className="group/zero-barrier-ux rounded-2xl border border-line bg-card"
          onToggle={(event) => setZeroBarrierOpen(event.currentTarget.open)}
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-2.5">
              <Sparkles className="size-4 shrink-0 text-accent" aria-hidden="true" />
              <span className="min-w-0 [word-break:keep-all]">
                {bt(
                  "초보 간소화 뷰 · 원클릭 스타터 킷 · 음성 명령 · 1초 안전 복구",
                  "Beginner Simple View · 1-Click Starter Kits · Voice Commands · 1s Safe Recovery",
                )}
              </span>
            </span>
            <ChevronDown
              className="size-4 shrink-0 text-fg-3 transition-transform group-open/zero-barrier-ux:rotate-180 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </summary>
          {zeroBarrierOpen ? (
            <div className="border-t border-line p-3 sm:p-4">
              <Suspense
                fallback={
                  <div role="status" className="rounded-xl border border-line bg-panel p-4 text-xs text-fg-2">
                    {bt(
                      "초보 간소화 뷰와 원클릭 스타터 킷을 불러오는 중입니다.",
                      "Loading beginner adaptive workspace and starter kits.",
                    )}
                  </div>
                }
              >
                <LazyStudioZeroBarrierUxPanel />
              </Suspense>
            </div>
          ) : null}
        </details>
      </div>
    </section>
  );
}
