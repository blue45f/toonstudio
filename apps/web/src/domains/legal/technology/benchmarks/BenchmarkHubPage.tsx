import {
  ArrowRight,
  CheckCircle2,
  FileCode2,
  GitCompareArrows,
  Scale,
  ShieldCheck,
} from "lucide-react";

import { AboutSectionNav } from "../../AboutSectionNav";
import { ALL_BENCHMARK_DATASETS, BENCHMARK_CATEGORY_ICONS } from "./benchmark-datasets";
import {
  BENCHMARK_CROSS_LINKS,
  BENCHMARK_SNAPSHOT_DATE,
  pickBenchmarkText,
  summarizeToolSupport,
  type BenchmarkLocale,
} from "./benchmark-types";

import { Container } from "@/shared/components/section";
import { useI18n } from "@/shared/lib/i18n";
import Link from "@/shared/navigation/router-link";
import { useDocumentTitle, useMetaDescription } from "@/shared/seo/use-document-title";

const COPY = {
  ko: {
    eyebrow: `GRANULAR BENCHMARK SUITE · ${BENCHMARK_SNAPSHOT_DATE}`,
    title: "세부 항목별 5대 기술 벤치마크 스위트",
    subtitle:
      "브러시 15종 · 필터 15종 · 실시간 협업/가상 오피스 14종 · 3D/CAD/조형 15종 · AI 보조/저작권 12종을 실제 코드 근거와 경쟁 툴 강점까지 함께 대조했습니다.",
    docTitle: "ToonStudio 세부 항목별 5대 기술 벤치마크 스위트",
    metaDescription:
      "브러시·필터·실시간 협업/가상 오피스·3D/CAD/조형·AI 보조 및 Rights BOM을 경쟁 도구들과 1:1 실측 대조한 기술 벤치마크 허브입니다.",
    statAreas: "세부 벤치마크 영역",
    statItems: "1:1 실측 대조 항목",
    statTools: "비교 대상 도구 (중복 제외)",
    statEvidence: "검증된 코드베이스 근거 파일",
    suitesEyebrow: "5 DEEP-DIVE BENCHMARKS",
    suitesTitle: "영역별 1:1 정밀 벤치마크 바로 열기",
    suitesSubtitle:
      "각 페이지에서 경쟁 툴 열을 골라 비교하고, 항목마다 벤치마킹 원천·저장소 코드 경로·정직한 한계를 펼쳐 확인할 수 있습니다.",
    openDetail: "세부 벤치마크 열기",
    itemsUnit: "항목",
    toolsUnit: "개 도구",
    fullLabel: "완전 지원",
    charterEyebrow: "BENCHMARK HONESTY CHARTER",
    charterTitle: "임의 점수나 과장 없이 세 가지 원칙으로 기록합니다",
    charter1Title: "1. 현재 구현(Current)과 한계의 분리",
    charter1Body:
      "코드로 동작하는 항목만 Current로 적고, `.skp` 256 MiB 브라우저 가드나 경량 스컬프 한계처럼 제약을 숨기지 않습니다.",
    charter2Title: "2. 전 항목 저장소 파일 경로 검증",
    charter2Body:
      "모든 비교 행마다 실제 코드베이스 경로를 붙이며, 테스트가 해당 파일 존재 여부를 자동 검증합니다.",
    charter3Title: "3. 경쟁 도구 강점·생태계 정직 병기",
    charter3Body:
      "CSP Assets, Rebelle 유화, Photoshop Firefly, Blender DCC, Shapr3D CAD, Nomad 스컬프 등 각 도구가 앞서는 영역을 그대로 밝힙니다.",
    crossEyebrow: "CROSS-LINKS",
    crossTitle: "종합 비교표 & 기술 자료 허브로 이어 보기",
  },
  en: {
    eyebrow: `GRANULAR BENCHMARK SUITE · ${BENCHMARK_SNAPSHOT_DATE}`,
    title: "5-Domain Granular Technical Benchmark Suite",
    subtitle:
      "1:1 code-grounded comparisons across 15 brushes, 15 filters, 14 collaboration/virtual-office capabilities, 15 3D/CAD/sculpt items and 12 AI assist & rights controls.",
    docTitle: "ToonStudio 5-Domain Granular Technical Benchmarks",
    metaDescription:
      "Inspect granular 1:1 benchmarks across brushes, filters, realtime collaboration, 3D/CAD/sculpt and deterministic AI assist with verified codebase evidence.",
    statAreas: "Benchmark domains",
    statItems: "1:1 verified criteria",
    statTools: "Unique tools compared",
    statEvidence: "Verified repo evidence files",
    suitesEyebrow: "5 DEEP-DIVE BENCHMARKS",
    suitesTitle: "Open each 1:1 granular benchmark",
    suitesSubtitle:
      "Filter by sub-group, toggle competitor columns and expand every row to inspect benchmark origins, repository paths and honest tradeoffs.",
    openDetail: "Open benchmark",
    itemsUnit: "items",
    toolsUnit: "tools",
    fullLabel: "Full support",
    charterEyebrow: "BENCHMARK HONESTY CHARTER",
    charterTitle: "Three strict principles — zero fabricated scores",
    charter1Title: "1. Clear Current vs. Limit boundary",
    charter1Body:
      "Only live code is marked Current, and practical browser ceilings such as the 256 MiB `.skp` guard or lite sculpt scope are stated openly.",
    charter2Title: "2. Verified repository path per row",
    charter2Body:
      "Every criterion cites real repository files verified automatically by unit tests.",
    charter3Title: "3. Candid competitor advantages",
    charter3Body:
      "Each page explicitly credits where CSP, Rebelle, Photoshop, Blender, Shapr3D, Nomad, Magma, Gather or Tooning Plus hold an edge.",
    crossEyebrow: "CROSS-LINKS",
    crossTitle: "Continue to overview matrices & technology hub",
  },
} as const;

export function BenchmarkHubPage() {
  const lang = useI18n((state) => state.lang);
  const locale: BenchmarkLocale = lang === "en" ? "en" : "ko";
  const copy = COPY[locale];

  useDocumentTitle(copy.docTitle);
  useMetaDescription(copy.metaDescription);

  const totalItems = ALL_BENCHMARK_DATASETS.reduce((sum, ds) => sum + ds.rows.length, 0);
  const uniqueToolNames = new Set(ALL_BENCHMARK_DATASETS.flatMap((ds) => ds.tools.map((tool) => tool.name)));
  const uniqueEvidencePaths = new Set(
    ALL_BENCHMARK_DATASETS.flatMap((ds) => ds.rows.flatMap((row) => row.evidencePaths)),
  );

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <AboutSectionNav variant="compact" />

      <header className="mt-5 rounded-[2rem] border border-line/75 bg-panel/80 p-6 shadow-sm sm:p-8 lg:p-10">
        <p className="inline-flex items-center gap-2 font-display text-xs font-bold tracking-[0.12em] text-accent uppercase">
          <Scale size={15} aria-hidden="true" />
          {copy.eyebrow}
        </p>
        <h1 className="mt-3 max-w-4xl break-keep text-3xl font-black tracking-tight text-fg sm:text-4xl">
          {copy.title}
        </h1>
        <p className="mt-3 max-w-3xl break-keep text-sm leading-7 text-fg-2 sm:text-base">
          {copy.subtitle}
        </p>

        <dl className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-line/75 bg-card/85 px-4 py-4">
            <dd className="font-display text-2xl font-black tabular-nums text-fg sm:text-3xl">
              {ALL_BENCHMARK_DATASETS.length}
            </dd>
            <dt className="mt-1 break-keep text-xs font-semibold text-fg-3">{copy.statAreas}</dt>
          </div>
          <div className="rounded-2xl border border-line/75 bg-card/85 px-4 py-4">
            <dd className="font-display text-2xl font-black tabular-nums text-fg sm:text-3xl">
              {totalItems}
            </dd>
            <dt className="mt-1 break-keep text-xs font-semibold text-fg-3">{copy.statItems}</dt>
          </div>
          <div className="rounded-2xl border border-line/75 bg-card/85 px-4 py-4">
            <dd className="font-display text-2xl font-black tabular-nums text-fg sm:text-3xl">
              {uniqueToolNames.size}
            </dd>
            <dt className="mt-1 break-keep text-xs font-semibold text-fg-3">{copy.statTools}</dt>
          </div>
          <div className="rounded-2xl border border-line/75 bg-card/85 px-4 py-4">
            <dd className="font-display text-2xl font-black tabular-nums text-accent sm:text-3xl">
              {uniqueEvidencePaths.size}
            </dd>
            <dt className="mt-1 break-keep text-xs font-semibold text-fg-3">{copy.statEvidence}</dt>
          </div>
        </dl>
      </header>

      {/* 5대 세부 벤치마크 카드 */}
      <section className="mt-10 sm:mt-12" aria-labelledby="benchmark-suites-heading">
        <p className="font-display text-xs font-bold tracking-[0.12em] text-accent uppercase">
          {copy.suitesEyebrow}
        </p>
        <h2 id="benchmark-suites-heading" className="mt-1 break-keep text-2xl font-black text-fg sm:text-3xl">
          {copy.suitesTitle}
        </h2>
        <p className="mt-2 max-w-3xl break-keep text-sm leading-6 text-fg-2">
          {copy.suitesSubtitle}
        </p>

        <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ALL_BENCHMARK_DATASETS.map((dataset) => {
            const Icon = BENCHMARK_CATEGORY_ICONS[dataset.id];
            const toonSummary = summarizeToolSupport(dataset.rows, "toonstudio");
            const competitors = dataset.tools.filter((tool) => tool.id !== "toonstudio");

            return (
              <li key={dataset.id} className="flex">
                <article
                  data-testid={`benchmark-hub-card-${dataset.id}`}
                  className="flex w-full flex-col gap-4 rounded-3xl border border-line/75 bg-card/85 p-5 shadow-sm transition-colors hover:border-accent/50 sm:p-6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-accent/35 bg-accent-soft text-accent">
                      <Icon size={20} aria-hidden="true" />
                    </span>
                    <div className="flex flex-wrap justify-end gap-1.5 text-[11px] font-bold tabular-nums">
                      <span className="rounded-full border border-line bg-panel px-2.5 py-0.5 text-fg-2">
                        {dataset.rows.length} {copy.itemsUnit}
                      </span>
                      <span className="rounded-full border border-line bg-panel px-2.5 py-0.5 text-fg-2">
                        {dataset.tools.length} {copy.toolsUnit}
                      </span>
                    </div>
                  </div>

                  <div>
                    <h3 className="break-keep text-lg font-black tracking-tight text-fg">
                      {pickBenchmarkText(dataset.title, locale)}
                    </h3>
                    <p className="mt-2 break-keep text-sm leading-6 text-fg-2">
                      {pickBenchmarkText(dataset.subtitle, locale)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {competitors.map((tool) => (
                      <span
                        key={tool.id}
                        className="rounded-full border border-line/75 bg-panel/75 px-2.5 py-0.5 text-[11px] font-semibold text-fg-3"
                      >
                        {tool.shortName}
                      </span>
                    ))}
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-line/60 pt-3.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold tabular-nums text-good">
                      <CheckCircle2 size={14} aria-hidden="true" />
                      {copy.fullLabel} {toonSummary.full}/{toonSummary.total}
                    </span>
                    <Link
                      href={dataset.path}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-bold text-on-accent transition-colors hover:bg-accent-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {copy.openDetail}
                      <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 측정 및 정직성 원칙 */}
      <section className="mt-12 sm:mt-14" aria-labelledby="benchmark-charter-heading">
        <p className="font-display text-xs font-bold tracking-[0.12em] text-accent uppercase">
          {copy.charterEyebrow}
        </p>
        <h2 id="benchmark-charter-heading" className="mt-1 break-keep text-xl font-black text-fg sm:text-2xl">
          {copy.charterTitle}
        </h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <article className="rounded-3xl border border-line/75 bg-panel/70 p-5">
            <ShieldCheck size={20} className="text-accent" aria-hidden="true" />
            <h3 className="mt-3 break-keep text-base font-black text-fg">{copy.charter1Title}</h3>
            <p className="mt-1.5 break-keep text-xs leading-6 text-fg-2">{copy.charter1Body}</p>
          </article>
          <article className="rounded-3xl border border-line/75 bg-panel/70 p-5">
            <FileCode2 size={20} className="text-accent" aria-hidden="true" />
            <h3 className="mt-3 break-keep text-base font-black text-fg">{copy.charter2Title}</h3>
            <p className="mt-1.5 break-keep text-xs leading-6 text-fg-2">{copy.charter2Body}</p>
          </article>
          <article className="rounded-3xl border border-line/75 bg-panel/70 p-5">
            <Scale size={20} className="text-accent" aria-hidden="true" />
            <h3 className="mt-3 break-keep text-base font-black text-fg">{copy.charter3Title}</h3>
            <p className="mt-1.5 break-keep text-xs leading-6 text-fg-2">{copy.charter3Body}</p>
          </article>
        </div>
      </section>

      {/* 교차 이동 링크 */}
      <section
        className="mt-12 rounded-[2rem] border border-line/75 bg-panel/75 p-6 sm:p-8"
        aria-labelledby="benchmark-cross-heading"
      >
        <p className="font-display text-xs font-bold tracking-[0.12em] text-accent uppercase">
          {copy.crossEyebrow}
        </p>
        <h2 id="benchmark-cross-heading" className="mt-1 break-keep text-xl font-black text-fg sm:text-2xl">
          {copy.crossTitle}
        </h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {BENCHMARK_CROSS_LINKS.map((link) => (
            <Link
              key={link.id}
              href={link.path}
              data-testid={`benchmark-cross-link-${link.id}`}
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
    </Container>
  );
}
