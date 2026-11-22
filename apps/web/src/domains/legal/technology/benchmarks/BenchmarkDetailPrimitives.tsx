import {
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Cpu,
  GitCompareArrows,
  LayoutGrid,
  Minus,
} from "lucide-react";

import { BENCHMARK_CATEGORY_ICONS } from "./benchmark-datasets";
import {
  BENCHMARK_CATEGORY_NAV,
  BENCHMARK_CROSS_LINKS,
  BENCHMARK_HUB_PATH,
  BENCHMARK_MATURITY_META,
  BENCHMARK_SUPPORT_META,
  pickBenchmarkText,
  type BenchmarkCategoryId,
  type BenchmarkCell,
  type BenchmarkDataset,
  type BenchmarkLocale,
  type BenchmarkRow,
  type BenchmarkSupportLevel,
} from "./benchmark-types";

import { cx } from "@/shared/lib/cx";
import Link from "@/shared/navigation/router-link";

function SupportIcon({ level }: { readonly level: BenchmarkSupportLevel }) {
  if (level === "full") return <CheckCircle2 size={13} className="shrink-0 text-good" aria-hidden="true" />;
  if (level === "partial") return <CircleDot size={13} className="shrink-0 text-warn" aria-hidden="true" />;
  if (level === "plugin") return <Cpu size={13} className="shrink-0 text-cool" aria-hidden="true" />;
  return <Minus size={13} className="shrink-0 text-fg-3" aria-hidden="true" />;
}

function BenchmarkSupportBadge({
  level,
  locale,
  compact = false,
}: {
  readonly level: BenchmarkSupportLevel;
  readonly locale: BenchmarkLocale;
  readonly compact?: boolean;
}) {
  const meta = BENCHMARK_SUPPORT_META[level];
  const toneClass =
    meta.tone === "good"
      ? "border-good/35 bg-good/10 text-good"
      : meta.tone === "warn"
        ? "border-warn/35 bg-warn/10 text-warn"
        : meta.tone === "cool"
          ? "border-cool/35 bg-cool/10 text-cool"
          : "border-line bg-raised/70 text-fg-3";

  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold",
        toneClass,
      )}
    >
      <SupportIcon level={level} />
      <span>{pickBenchmarkText(compact ? meta.shortLabel : meta.label, locale)}</span>
    </span>
  );
}

function BenchmarkMaturityChip({
  row,
  locale,
}: {
  readonly row: BenchmarkRow;
  readonly locale: BenchmarkLocale;
}) {
  const meta = BENCHMARK_MATURITY_META[row.toonstudioMaturity];
  const toneClass =
    meta.tone === "good"
      ? "border-good/35 bg-good/10 text-good"
      : meta.tone === "warn"
        ? "border-warn/35 bg-warn/10 text-warn"
        : "border-cool/35 bg-cool/10 text-cool";

  return (
    <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold", toneClass)}>
      {pickBenchmarkText(meta.label, locale)}
    </span>
  );
}

export function BenchmarkCategoryNavBar({
  activeId,
  locale,
  navAria,
  hubTabLabel,
}: {
  readonly activeId: BenchmarkCategoryId;
  readonly locale: BenchmarkLocale;
  readonly navAria: string;
  readonly hubTabLabel: string;
}) {
  return (
    <nav
      aria-label={navAria}
      className="mt-5 flex items-center gap-2 overflow-x-auto overscroll-x-contain rounded-2xl border border-line/75 bg-panel/75 p-2 [scrollbar-width:thin]"
    >
      <Link
        href={BENCHMARK_HUB_PATH}
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-line bg-card px-3.5 text-xs font-bold text-fg-2 transition-colors hover:border-accent/45 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <LayoutGrid size={14} aria-hidden="true" />
        {hubTabLabel}
      </Link>
      <span aria-hidden="true" className="h-5 w-px shrink-0 bg-line" />
      {BENCHMARK_CATEGORY_NAV.map((item) => {
        const Icon = BENCHMARK_CATEGORY_ICONS[item.id];
        const active = item.id === activeId;
        return (
          <Link
            key={item.id}
            href={item.path}
            aria-current={active ? "page" : undefined}
            className={cx(
              "inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              active
                ? "border-accent bg-accent text-on-accent"
                : "border-transparent bg-card/70 text-fg-2 hover:border-line hover:bg-raised hover:text-fg",
            )}
          >
            <Icon size={14} aria-hidden="true" />
            {pickBenchmarkText(item.shortLabel, locale)}
          </Link>
        );
      })}
    </nav>
  );
}

export function BenchmarkRowEvidenceDetails({
  row,
  locale,
  surface,
  labels,
}: {
  readonly row: BenchmarkRow;
  readonly locale: BenchmarkLocale;
  readonly surface: "table" | "card";
  readonly labels: {
    readonly origin: string;
    readonly evidence: string;
    readonly limit: string;
  };
}) {
  return (
    <div
      data-testid={`benchmark-evidence-${surface}-${row.id}`}
      className="grid gap-3 rounded-2xl border border-line/70 bg-raised/70 p-4 text-xs leading-6 text-fg-2 md:grid-cols-3"
    >
      <div>
        <p className="font-bold text-fg">{labels.origin}</p>
        <p className="mt-1 break-keep">{pickBenchmarkText(row.benchmarkOrigin, locale)}</p>
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold text-fg">{labels.evidence}</p>
          <BenchmarkMaturityChip row={row} locale={locale} />
        </div>
        <p className="mt-1 break-keep">{pickBenchmarkText(row.evidenceSummary, locale)}</p>
        <ul className="mt-2 space-y-1 font-mono text-[11px] text-fg-3">
          {row.evidencePaths.map((repoPath) => (
            <li key={repoPath} className="break-all">
              {repoPath}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="font-bold text-warn">{labels.limit}</p>
        <p className="mt-1 break-keep">{pickBenchmarkText(row.honestLimit, locale)}</p>
      </div>
    </div>
  );
}

export function BenchmarkCellView({
  cell,
  locale,
  highlighted,
}: {
  readonly cell: BenchmarkCell | undefined;
  readonly locale: BenchmarkLocale;
  readonly highlighted: boolean;
}) {
  const resolved: BenchmarkCell = cell ?? {
    level: "none",
    summary: { ko: "미지원", en: "Not supported" },
  };
  return (
    <div className={cx("grid gap-1.5", highlighted && "font-medium")}>
      <div>
        <BenchmarkSupportBadge level={resolved.level} locale={locale} compact />
      </div>
      <p className="break-keep text-xs leading-5 text-fg-2">{pickBenchmarkText(resolved.summary, locale)}</p>
    </div>
  );
}

export function BenchmarkFooterSections({
  dataset,
  locale,
  labels,
}: {
  readonly dataset: BenchmarkDataset;
  readonly locale: BenchmarkLocale;
  readonly labels: {
    readonly tradeoffsEyebrow: string;
    readonly tradeoffsTitle: string;
    readonly tradeoffsSubtitle: string;
    readonly competitorEdge: string;
    readonly toonstudioPos: string;
    readonly profilesEyebrow: string;
    readonly profilesTitle: string;
    readonly pricing: string;
    readonly platform: string;
    readonly takeaway: string;
    readonly strength: string;
    readonly nextEyebrow: string;
    readonly nextTitle: string;
  };
}) {
  return (
    <>
      <section className="mt-12 sm:mt-16" aria-labelledby="benchmark-tradeoffs-heading">
        <p className="font-display text-xs font-bold tracking-[0.12em] text-accent uppercase">
          {labels.tradeoffsEyebrow}
        </p>
        <h2 id="benchmark-tradeoffs-heading" className="mt-1 break-keep text-xl font-black text-fg sm:text-2xl">
          {labels.tradeoffsTitle}
        </h2>
        <p className="mt-2 max-w-3xl break-keep text-sm leading-6 text-fg-2">{labels.tradeoffsSubtitle}</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {dataset.honestTradeoffs.map((item) => (
            <article
              key={`${item.competitorId}-${item.competitorName}`}
              className="rounded-3xl border border-line/75 bg-card/80 p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-black text-fg">{item.competitorName}</h3>
                <span className="rounded-full border border-line bg-panel px-2.5 py-0.5 text-[11px] font-bold text-fg-2">
                  {pickBenchmarkText(item.area, locale)}
                </span>
              </div>
              <dl className="mt-3.5 space-y-2.5 border-t border-line/60 pt-3 text-xs leading-6">
                <div>
                  <dt className="font-bold text-warn">{labels.competitorEdge}</dt>
                  <dd className="mt-0.5 break-keep text-fg-2">{pickBenchmarkText(item.competitorEdge, locale)}</dd>
                </div>
                <div>
                  <dt className="font-bold text-accent">{labels.toonstudioPos}</dt>
                  <dd className="mt-0.5 break-keep text-fg-2">{pickBenchmarkText(item.toonstudioPosition, locale)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 sm:mt-14" aria-labelledby="benchmark-profiles-heading">
        <p className="font-display text-xs font-bold tracking-[0.12em] text-accent uppercase">
          {labels.profilesEyebrow}
        </p>
        <h2 id="benchmark-profiles-heading" className="mt-1 break-keep text-xl font-black text-fg sm:text-2xl">
          {labels.profilesTitle}
        </h2>
        <div className="mt-5 grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {dataset.tools.map((tool) => (
            <article
              key={tool.id}
              className={cx(
                "rounded-3xl border p-5",
                tool.id === "toonstudio" ? "border-accent/55 bg-panel" : "border-line/70 bg-card/75",
              )}
            >
              <h3 className="text-base font-black text-fg">{tool.name}</h3>
              <p className="mt-0.5 break-keep text-xs text-fg-3">{pickBenchmarkText(tool.role, locale)}</p>
              <dl className="mt-3 space-y-2 border-t border-line/60 pt-3 text-xs leading-5">
                <div>
                  <dt className="font-bold text-fg-3">{labels.pricing}</dt>
                  <dd className="break-keep text-fg">{pickBenchmarkText(tool.pricing, locale)}</dd>
                </div>
                <div>
                  <dt className="font-bold text-fg-3">{labels.platform}</dt>
                  <dd className="break-keep text-fg-2">{pickBenchmarkText(tool.platform, locale)}</dd>
                </div>
                <div>
                  <dt className="font-bold text-fg-3">{labels.takeaway}</dt>
                  <dd className="break-keep text-fg-2">{pickBenchmarkText(tool.benchmarkTakeaway, locale)}</dd>
                </div>
                <div>
                  <dt className="font-bold text-fg-3">{labels.strength}</dt>
                  <dd className="break-keep text-fg-2">{pickBenchmarkText(tool.honestStrength, locale)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-[2rem] border border-line/75 bg-panel/75 p-6 sm:p-8" aria-labelledby="benchmark-next-heading">
        <p className="font-display text-xs font-bold tracking-[0.12em] text-accent uppercase">{labels.nextEyebrow}</p>
        <h2 id="benchmark-next-heading" className="mt-1 break-keep text-xl font-black text-fg sm:text-2xl">
          {labels.nextTitle}
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {BENCHMARK_CROSS_LINKS.map((link) => (
            <Link
              key={link.id}
              href={link.path}
              className="group flex min-h-11 flex-col justify-between gap-2 rounded-2xl border border-line/70 bg-card/80 p-4 transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <div>
                <span className="inline-flex items-center gap-1 rounded-full border border-line bg-panel px-2 py-0.5 text-[11px] font-bold text-fg-3">
                  <GitCompareArrows size={11} aria-hidden="true" />
                  {pickBenchmarkText(link.badge, locale)}
                </span>
                <p className="mt-2 break-keep text-sm font-black text-fg group-hover:text-accent">
                  {pickBenchmarkText(link.label, locale)}
                </p>
                <p className="mt-1 break-keep text-xs leading-5 text-fg-3">
                  {pickBenchmarkText(link.description, locale)}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-accent">
                <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
