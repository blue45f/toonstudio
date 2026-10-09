import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/**
 * 제작 개요 첫 화면의 표지 무대 — aggregate.coverImageUrl이 있을 때만 세워진다.
 * 표지가 없으면 아무것도 그리지 않아, 빈 표지 폴백(헤더의 이니셜 타일)이
 * 그대로 유지된다. 같은 표지를 흐릿한 배경으로 깔아 무대감을 만들고,
 * 주인공 표지는 세로 원본 비율 그대로 크게 세운다.
 */
export function ProductionOverviewCoverStage({ aggregate }: { readonly aggregate: ProductionProjectAggregate }) {
  const bt = useBilingual("ProductionOverviewCoverStage");
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
    </section>
  );
}
