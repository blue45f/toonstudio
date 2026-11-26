import { CheckCircle2, Scale, ShieldCheck } from "lucide-react";
import { useId, useState } from "react";

import "./interactive-showcase.css";
import {
  TCO_BENCHMARK_DIMENSIONS,
  type EvidenceVerificationKind,
} from "./interactive-showcase-data";
import { pickShowcaseText, showcaseBi } from "./interactive-showcase-models";

import { cx } from "@/shared/lib/cx";
import { useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";

type EvidenceFilter = "all" | EvidenceVerificationKind;

const EVIDENCE_FILTERS: ReadonlyArray<{
  readonly id: EvidenceFilter;
  readonly ko: string;
  readonly en: string;
}> = [
  { id: "all", ko: "전체 6개 지표", en: "All 6 Dimensions" },
  { id: "measured", ko: "실측 (Measured)", en: "Measured" },
  { id: "design", ko: "구현 구조", en: "Architecture" },
];

export interface TcoAndBenchmarkMatrixProps {
  readonly className?: string;
}

export function TcoAndBenchmarkMatrix({ className }: TcoAndBenchmarkMatrixProps) {
  useBilingualI18nRevision();
  const baseId = useId();
  const [filter, setFilter] = useState<EvidenceFilter>("all");

  const visibleRows =
    filter === "all"
      ? TCO_BENCHMARK_DIMENSIONS
      : TCO_BENCHMARK_DIMENSIONS.filter((row) => row.evidenceKind === filter);

  const headingId = `${baseId}-tco-heading`;

  return (
    <section
      aria-labelledby={headingId}
      data-showcase-widget="tco-benchmark-matrix"
      className={cx(
        "rounded-3xl border border-line/80 bg-panel/75 p-5 shadow-sm sm:p-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent">
            {showcaseBi("총소유비용(TCO) · 엔지니어링 대조표", "TCO & Engineering Comparison Matrix")}
          </p>
          <h3
            id={headingId}
            className="mt-1.5 text-balance break-keep text-xl font-black tracking-tight text-fg sm:text-2xl"
          >
            {showcaseBi(
              "작업 위치별 저장·연산 방식",
              "Storage and compute by execution environment",
            )}
          </h3>
        </div>

      </div>

      {/* 근거 구분 필터: 실측(Measured) vs 아키텍처 보장(Guaranteed) */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label={showcaseBi("근거 유형 필터", "Filter by verification kind")}
          className="flex flex-wrap gap-2"
        >
          {EVIDENCE_FILTERS.map((item) => {
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(item.id)}
                className={cx(
                  "tech-showcase-node min-h-11 rounded-xl border px-3.5 py-2 text-xs font-black break-keep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  active
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card/75 text-fg-2 hover:border-line-strong hover:text-fg",
                )}
              >
                {showcaseBi(item.ko, item.en)}
              </button>
            );
          })}
        </div>

        <p className="text-xs break-keep text-fg-3">
          {showcaseBi(
            "클라우드와 데스크톱 열은 각 방식의 구성 예입니다.",
            "The cloud and desktop columns illustrate deployment patterns.",
          )}
        </p>
      </div>

      {/* 6개 엔지니어링 차원 고대비 비교 표 */}
      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-card/80">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <caption className="sr-only">
            {showcaseBi(
              "ToonStudio 로컬-퍼스트 아키텍처와 클라우드 종속·데스크톱 설치형 도구의 6대 엔지니어링 지표 비교",
              "6-dimension engineering comparison across ToonStudio Local-First, Cloud-Bound, and Desktop-Install tools",
            )}
          </caption>
          <thead>
            <tr className="border-b border-line-strong bg-panel/90 text-xs font-black text-fg">
              <th scope="col" className="px-4 py-3.5">
                {showcaseBi("비교 차원 · 검증 구분", "Engineering Dimension & Basis")}
              </th>
              <th scope="col" className="px-4 py-3.5 text-accent">
                {showcaseBi("ToonStudio", "ToonStudio")}
              </th>
              <th scope="col" className="px-4 py-3.5 text-fg-2">
                {showcaseBi("클라우드 종속형 웹 툴", "Cloud-Bound Web Tool")}
              </th>
              <th scope="col" className="px-4 py-3.5 text-fg-2">
                {showcaseBi("데스크톱 설치형 패키지", "Desktop-Install Suite")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            {visibleRows.map((row) => {
              const isMeasured = row.evidenceKind === "measured";
              return (
                <tr key={row.id} className="align-top hover:bg-panel/45">
                  <th scope="row" className="px-4 py-3.5 font-black text-fg">
                    <div className="grid gap-1.5">
                      <span className="break-keep">{pickShowcaseText(row.dimension)}</span>
                      <span
                        className={cx(
                          "inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.68rem] font-extrabold",
                          isMeasured
                            ? "border-cool/40 bg-info-soft text-cool"
                            : "border-good/40 bg-good-soft text-good",
                        )}
                      >
                        {isMeasured ? (
                          <Scale size={11} aria-hidden="true" />
                        ) : (
                          <ShieldCheck size={11} aria-hidden="true" />
                        )}
                        {isMeasured
                          ? showcaseBi("실측 (Measured)", "Measured")
                          : showcaseBi("구현 구조", "Architecture")}
                      </span>
                      <span className="text-[0.7rem] font-medium leading-5 break-keep text-fg-3">
                        {pickShowcaseText(row.evidenceNote)}
                      </span>
                    </div>
                  </th>

                  <td className="bg-accent-soft/25 px-4 py-3.5">
                    <div className="flex items-start gap-2">
                      <CheckCircle2
                        size={15}
                        className="mt-0.5 shrink-0 text-good"
                        aria-hidden="true"
                      />
                      <span className="text-xs font-bold leading-6 break-keep text-fg">
                        {pickShowcaseText(row.toonstudioValue)}
                      </span>
                    </div>
                  </td>

                  <td className="px-4 py-3.5 text-xs leading-6 break-keep text-fg-2">
                    {pickShowcaseText(row.cloudBoundValue)}
                  </td>

                  <td className="px-4 py-3.5 text-xs leading-6 break-keep text-fg-2">
                    {pickShowcaseText(row.desktopInstallValue)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
