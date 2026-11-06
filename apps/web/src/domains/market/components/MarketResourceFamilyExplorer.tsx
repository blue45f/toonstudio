import { ArrowRight, ChevronDown, Sparkles } from "lucide-react";

import { MARKET_FAMILY_ART } from "../models/market-family-art";
import {
  MARKET_RESOURCE_FAMILIES,
  marketResourceBrowseHref,
  type MarketResourceFamily,
} from "../models/market-resource-taxonomy";

import { SiteRail } from "@/domains/legal/public/site-rail";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

interface MarketResourceFamilyExplorerProps {
  readonly className?: string;
  readonly compact?: boolean;
}

function FamilyCard({
  family,
  featured = false,
  compact = false,
}: {
  readonly family: MarketResourceFamily;
  readonly featured?: boolean;
  readonly compact?: boolean;
}) {
  const bt = useBilingual("MarketResourceFamilyExplorer");
  const Icon = family.icon;
  const primary = family.subcategories.slice(0, 3);
  const rest = family.subcategories.slice(3);
  const first = family.subcategories[0];
  const study = MARKET_FAMILY_ART[family.id];

  return (
    <article
      className="group relative flex min-w-0 w-full flex-col overflow-hidden rounded-2xl border border-line bg-card p-4 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong motion-reduce:transform-none motion-reduce:transition-none"
    >
      {!compact ? <figure className="relative mb-4 overflow-hidden rounded-lg border border-line"><img src={study.image} alt="" loading="lazy" width={640} height={360} className="h-32 w-full object-cover sm:h-36" style={{ objectPosition: study.position }} /><figcaption className="absolute inset-x-0 bottom-0 bg-panel/90 px-3 py-2 text-xs text-fg-2">{bt(study.label[0], study.label[1])} · {bt("탐색 예시", "example")}</figcaption></figure> : null}
      <div className="relative flex min-h-12 items-start justify-between gap-3">
        <span
          className="grid size-12 shrink-0 place-items-center rounded-xl border bg-panel"
          style={{ color: `oklch(0.76 0.13 ${family.accentHue})` }}
        >
          <Icon className="size-6" strokeWidth={1.7} aria-hidden="true" />
        </span>
        {featured ? (
          <span className="rounded-full border border-accent/30 bg-accent-soft px-2.5 py-1 text-xs font-black text-accent">
            {bt("추천", "Start here")}
          </span>
        ) : null}
      </div>

      <h3 className="relative mt-4 text-lg font-bold text-fg">{family.label}</h3>
      <p className="relative mt-1 text-xs font-bold tracking-[0.12em] text-fg-2">{family.english}</p>
      <p className="relative mt-2 break-keep text-sm leading-6 text-fg-2 [overflow-wrap:anywhere]">
        {bt(family.description, family.descriptionEn)}
      </p>

      <div className="relative mt-4 grid gap-1.5">
        {primary.map((subcategory) => (
          <Link
            key={subcategory.id}
            href={marketResourceBrowseHref(subcategory)}
            className="group/sub flex min-h-12 items-center justify-between gap-2 rounded-xl border border-line/70 bg-panel/55 px-3 text-left transition-colors hover:border-accent/35 hover:bg-raised"
          >
            <span className="min-w-0">
              <strong className="block truncate text-sm text-fg group-hover/sub:text-accent">{bt(subcategory.label, subcategory.labelEn)}</strong>
              {!compact ? <span className="mt-0.5 block truncate text-xs text-fg-2">{bt(subcategory.description, subcategory.descriptionEn)}</span> : null}
            </span>
            <ArrowRight className="size-3.5 shrink-0 text-fg-3 transition-transform group-hover/sub:translate-x-0.5 group-hover/sub:text-accent" aria-hidden="true" />
          </Link>
        ))}
      </div>

      {rest.length > 0 ? (
        <details className="relative mt-2 group/more">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-fg-2 hover:bg-raised hover:text-fg [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-3.5 shrink-0 transition-transform group-open/more:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
            {bt(`카테고리 ${rest.length}개 더 보기`, `${rest.length} more categories`)}
          </summary>
          <div className="mt-1.5 grid gap-1.5">
            {rest.map((subcategory) => (
              <Link
                key={subcategory.id}
                href={marketResourceBrowseHref(subcategory)}
                className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-line/60 bg-panel/40 px-3 py-2 text-sm font-semibold text-fg-2 hover:border-accent/30 hover:text-accent"
              >
                <span className="min-w-0 [overflow-wrap:anywhere]">{bt(subcategory.label, subcategory.labelEn)}</span>
                <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </details>
      ) : null}

      <div className="relative mt-auto pt-4">
        <Link
          href={marketResourceBrowseHref(first)}
          className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-accent-soft px-3 py-2 text-sm font-bold text-accent transition-colors hover:bg-accent hover:text-on-accent"
        >
          <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{bt(`${family.label} 둘러보기`, `Browse ${family.labelEn}`)}</span>
        </Link>
      </div>
    </article>
  );
}

export function MarketResourceFamilyExplorer({ className, compact = false }: MarketResourceFamilyExplorerProps) {
  const bt = useBilingual("MarketResourceFamilyExplorer");

  return (
    <section className={cn("min-w-0", className)} aria-labelledby="market-resource-family-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-accent">Resource Library</p>
          <h2 id="market-resource-family-title" className="mt-1 text-xl font-bold text-fg sm:text-2xl">{bt("장면을 만들 순서대로 고르세요", "Pick in the order you build a scene")}</h2>
          <p className="mt-1.5 max-w-3xl break-keep text-sm leading-6 text-fg-2">
            {bt(
              "템플릿부터 배경, 브러시까지 필요한 소재를 찾아보세요.",
              "Find the templates, backgrounds and brushes your scene needs.",
            )}
          </p>
        </div>
        <Link href="/market/browse" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-accent hover:text-accent-2">
          {bt("전체 리소스 보기", "View all resources")} <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-4 flex min-w-0 flex-col items-start gap-3 sm:flex-row">
        <details
          data-testid="market-usage-guide"
          className="group/usage min-w-0 w-full flex-1 rounded-2xl border border-line bg-card"
        >
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-fg hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
            <span>{bt("소재 사용 전 확인할 것", "Before using an asset")}</span>
            <ChevronDown className="size-4 shrink-0 transition-transform group-open/usage:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
          </summary>
          <div className="space-y-3 border-t border-line px-4 py-4 text-sm leading-6 text-fg-2">
            <p>{bt("사용 허용 범위는 소재마다 달라요. 각 소재의 설명과 원본 라이선스를 먼저 확인해 주세요.", "Permissions vary by asset. Check its description and original license first.")}</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>{bt("상업 이용, 팀 공유, 굿즈 제작이 허용되는지 확인하세요.", "Check permission for commercial use, team sharing and merchandise.")}</li>
              <li>{bt("파일 형식과 용량이 사용하는 앱에 맞는지 확인하세요.", "Check that the file format and size suit your app.")}</li>
              <li>{bt("폰트·음원은 출처 표시와 배포 조건도 확인하세요.", "For fonts and audio, also check attribution and distribution terms.")}</li>
            </ul>
            <p className="text-fg">{bt("이 안내는 개별 소재의 사용 허가나 호환성을 보증하지 않아요.", "This guide does not guarantee an individual asset's permissions or compatibility.")}</p>
          </div>
        </details>
        <Link
          href="/studio/canvas"
          className="inline-flex min-h-[50px] w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-line px-4 py-3 text-sm font-bold text-accent hover:border-accent hover:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"
        >
          {bt("캔버스 열기", "Open canvas")} <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
        </Link>
      </div>

      {/* 휴대폰은 가로 레일, 넓은 화면은 격자로 제작 순서를 유지한다. */}
      <SiteRail
        label={bt("리소스 작업군", "Resource families")}
        ordered
        className="mt-5 gap-3"
        columns="sm:grid-cols-2 xl:grid-cols-3"
        itemClassName="w-[min(82vw,20rem)]"
      >
        {MARKET_RESOURCE_FAMILIES.map((family) => (
          <FamilyCard key={family.id} family={family} featured={family.id === "template" || family.id === "2d"} compact={compact} />
        ))}
      </SiteRail>
    </section>
  );
}
