import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FlaskConical,
  GitCompareArrows,
  Heart,
  Layers,
  Palette,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useMemo, useRef, useState, type CSSProperties } from "react";

import {
  MarketCompareEmptyState,
  MarketCompareSpecMatrix,
} from "../components/MarketCompareSpecMatrix";
import { MarketResourceCover } from "../components/MarketResourceCover";
import {
  MARKET_COMPARE_MAX_ITEMS,
  useMarketCompare,
} from "../hooks/use-market-compare";
import { useMarketWishlist } from "../hooks/use-market-wishlist";
import {
  createMarketComparisonRows,
  summarizeMarketComparison,
  type MarketComparisonRow,
} from "../models/market-comparison";
import {
  formatMarketByteSize,
  marketKindMeta,
  marketLicenseMeta,
} from "../models/market-kind";
import {
  DEFAULT_MARKET_PRODUCTION_PROFILE,
  MARKET_PRODUCTION_PROFILE_STORAGE_KEY,
  evaluateMarketProductionFit,
  marketProductionFitReasonLine,
  parseMarketProductionProfile,
} from "../models/market-production-fit";
import { marketStudioResourceHref } from "../models/market-studio-handoff";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { introItemProps } from "@/shared/components/page-intro/page-intro-utils";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";
import {
  useDocumentTitle,
  useMetaDescription,
} from "@/shared/seo/use-document-title";

function readStoredProductionProfile() {
  if (typeof window === "undefined") return DEFAULT_MARKET_PRODUCTION_PROFILE;
  try {
    const raw = localStorage.getItem(MARKET_PRODUCTION_PROFILE_STORAGE_KEY);
    return raw
      ? parseMarketProductionProfile(JSON.parse(raw) as unknown)
      : DEFAULT_MARKET_PRODUCTION_PROFILE;
  } catch {
    return DEFAULT_MARKET_PRODUCTION_PROFILE;
  }
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\\/gu, "\\\\").replace(/\|/gu, "\\|").replace(/\r?\n/gu, " / ");
}

function buildComparisonMarkdown(
  items: readonly CreatorMarketplaceResourceRecord[],
  rows: readonly MarketComparisonRow[],
  headerLabel: string,
): string {
  const header = `| ${escapeMarkdownCell(headerLabel)} | ${items.map((item) => escapeMarkdownCell(item.name)).join(" | ")} |`;
  const divider = `| --- | ${items.map(() => "---").join(" | ")} |`;
  const body = rows.map(
    (row) => `| ${escapeMarkdownCell(row.label)} | ${row.values.map((val) => escapeMarkdownCell(val)).join(" | ")} |`,
  );
  return [header, divider, ...body].join("\n");
}

export function MarketComparePage() {
  const t = useBilingual("MarketComparePage");
  useDocumentTitle(t("에셋 비교 · 창작 마켓", "Compare assets · Creator Market"));
  useMetaDescription(
    t(
      "마켓 에셋의 라이선스, Studio 호환성, 버전, 출처와 패키지 구성을 게시 manifest 기준으로 비교합니다.",
      "Compare market assets' licenses, Studio compatibility, versions, provenance, and package contents against their published manifests.",
    ),
  );

  const compare = useMarketCompare();
  const { compareItems, compareCount, removeCompare, clearCompare } = compare;
  const toggleCompare =
    "toggleCompare" in compare && typeof compare.toggleCompare === "function"
      ? compare.toggleCompare
      : null;
  const { wishlistItems } = useMarketWishlist();
  const [onlyDiffs, setOnlyDiffs] = useState(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const tableViewportRef = useRef<HTMLDivElement>(null);
  const productionProfile = useMemo(() => readStoredProductionProfile(), []);

  const evaluations = useMemo(
    () =>
      compareItems.map((record) => {
        const evaluation = evaluateMarketProductionFit(record, productionProfile);
        const reason = marketProductionFitReasonLine(evaluation);
        const total = Math.max(1, evaluation.checks.length);
        const ratioPercent = Math.round((evaluation.passCount / total) * 100);
        return { record, evaluation, reason, ratioPercent };
      }),
    [compareItems, productionProfile],
  );

  const rows = useMemo(() => {
    const baseRows = createMarketComparisonRows(compareItems);
    if (compareItems.length === 0) return baseRows;
    const fitValues = evaluations.map(({ evaluation, reason }) => {
      const statusBadge =
        evaluation.status === "ready"
          ? t("조건 일치", "Ready")
          : evaluation.status === "review"
            ? t("확인 필요", "Review")
            : t("적용 차단", "Blocked");
      return `${statusBadge} (${evaluation.passCount}/${evaluation.checks.length}) · ${reason.text}`;
    });
    const fitRow: MarketComparisonRow = {
      key: "production-fit",
      label: t("내 작업 프로필 적합성", "My production profile fit"),
      values: fitValues,
      different: new Set(fitValues).size > 1,
    };
    return [fitRow, ...baseRows];
  }, [compareItems, evaluations, t]);

  const visibleRows = useMemo(
    () => (onlyDiffs ? rows.filter((row) => row.different) : rows),
    [onlyDiffs, rows],
  );
  const summary = useMemo(
    () => summarizeMarketComparison(compareItems),
    [compareItems],
  );
  const wishlistCandidates = useMemo(
    () => wishlistItems.filter((item) => !compareItems.some((compared) => compared.id === item.id)),
    [compareItems, wishlistItems],
  );

  async function handleCopyMarkdown(): Promise<void> {
    if (compareItems.length === 0) return;
    const md = buildComparisonMarkdown(
      compareItems,
      visibleRows,
      t("비교 항목", "Compared items"),
    );
    try {
      await navigator.clipboard?.writeText(md);
      setCopiedMarkdown(true);
    } catch {
      setCopiedMarkdown(false);
    }
  }

  function scrollComparison(direction: -1 | 1): void {
    const viewport = tableViewportRef.current;
    if (!viewport) return;
    const distance = Math.max(240, Math.floor(viewport.clientWidth * 0.8));
    viewport.scrollLeft += direction * distance;
  }

  return (
    <div>
      <section>
        <div className="border-b border-line bg-canvas">
          <Container size="wide" className="py-6 sm:py-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div data-ink-enter="rise">
              <p className="inline-flex items-center gap-1.5 text-xs font-medium text-fg-3">
                <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
                {t("사양 · 사용권 대조", "Manifest comparison")}
              </p>
              <div className="mt-1.5 flex items-center gap-2.5">
                <GitCompareArrows className="size-5 text-accent" aria-hidden="true" />
                <h1 className="text-2xl font-semibold tracking-tight text-fg [word-break:keep-all] sm:text-3xl">
                  {t("에셋 비교", "Compare assets")}
                </h1>
                <span className="numeral tnum rounded-[6px] border border-line bg-panel px-2 py-0.5 text-xs font-medium text-fg-2 tabular-nums">
                  {compareCount}/{MARKET_COMPARE_MAX_ITEMS}
                </span>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-2 [word-break:keep-all]">
                {t(
                  "비교 목록에 담은 공개 manifest의 사실만 나란히 표시합니다. 평점·판매량·성능 등 검증되지 않은 수치는 비교에 넣지 않습니다.",
                  "Only facts from the public manifests in your compare list are shown side by side. Unverified numbers like ratings, sales, or performance are not compared.",
                )}
              </p>
            </div>

            {compareCount > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/market/fit-lab"
                  className={buttonClass({
                    variant: "outline",
                    size: "sm",
                    className: "min-h-11 min-w-11 gap-1.5 rounded-[8px] text-fg-2",
                  })}
                >
                  <FlaskConical className="size-3.5 text-accent" aria-hidden="true" />
                  {t("적합성 프로필 설정", "Configure fit profile")}
                </Link>
                <button
                  type="button"
                  onClick={clearCompare}
                  className={buttonClass({
                    variant: "outline",
                    size: "sm",
                    className: "min-h-11 min-w-11 gap-1.5 rounded-[8px] text-fg-2",
                  })}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  {t("전체 비우기", "Clear all")}
                </button>
              </div>
            ) : null}
          </div>
          </Container>
        </div>
      </section>

      <Container size="wide" className="py-7 sm:py-10">
        {compareCount === 0 ? (
          <MarketCompareEmptyState />
        ) : (
          <>
            <ul
              data-ink-stagger="panel"
              className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4"
            >
              {evaluations.map(({ record, evaluation, ratioPercent }, index) => {
                const kind = marketKindMeta(record.kind);
                const itemProps = introItemProps(index);
                const meterTone =
                  evaluation.status === "ready"
                    ? "bg-good"
                    : evaluation.status === "review"
                      ? "bg-warn"
                      : "bg-bad";
                return (
                  <li
                    key={record.id}
                    {...itemProps}
                    className="ink-frame group overflow-hidden rounded-[14px] border border-line bg-card"
                    style={
                      {
                        ...itemProps.style,
                        "--ink-radius": "14px",
                      } as CSSProperties
                    }
                  >
                    <div
                      className="ink-cover ink-sheen relative aspect-[2/1] border-b border-line bg-panel"
                      aria-hidden="true"
                    >
                      <MarketResourceCover record={record} />
                    </div>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-sm font-semibold leading-snug text-fg [word-break:keep-all]">
                            {record.name}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-fg-3 tabular-nums">
                            {record.publisher.name} · v{record.resourceVersion}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeCompare(record.id)}
                          aria-label={t(
                            `${record.name} 비교 목록에서 제거`,
                            `Remove ${record.name} from the compare list`,
                          )}
                          className="flex min-h-11 min-w-11 items-center justify-center rounded-[8px] p-1.5 text-fg-3 transition-colors hover:bg-warn/10 hover:text-warn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        </button>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                        <span className="rounded-[6px] border border-accent/35 bg-accent-soft px-2 py-0.5 font-medium text-accent">
                          {kind.label}
                        </span>
                        <span className="rounded-[6px] border border-line bg-panel px-2 py-0.5 text-fg-2">
                          {marketLicenseMeta(record.license).label}
                        </span>
                      </div>

                      <div className="mt-3 rounded-[8px] border border-line bg-panel px-2.5 py-2">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-fg-2">
                            {t("적합성 통과", "Fit checks")}
                          </span>
                          <span className="numeral tnum font-medium text-fg tabular-nums">
                            {evaluation.passCount}/{evaluation.checks.length} ({ratioPercent}%)
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-canvas">
                          <div
                            className={cn("ink-bar-fill h-full rounded-full", meterTone)}
                            style={
                              {
                                width: `${ratioPercent}%`,
                                "--ink-i": index,
                              } as CSSProperties
                            }
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex gap-2">
                        <Link
                          href={`/market/resource/${record.id}`}
                          className={buttonClass({
                            variant: "outline",
                            size: "sm",
                            className: "min-h-11 min-w-11 flex-1 gap-1 rounded-[8px]",
                          })}
                        >
                          {t("상세", "Details")}
                          <ArrowUpRight className="size-3" aria-hidden="true" />
                        </Link>
                        <Link
                          href={marketStudioResourceHref(record.id)}
                          className={buttonClass({
                            variant: "solid",
                            size: "sm",
                            className: "min-h-11 min-w-11 flex-1 gap-1 rounded-[8px]",
                          })}
                        >
                          <Palette className="size-3" aria-hidden="true" />
                          Studio
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <section
              aria-label={t("비교 요약", "Comparison summary")}
              className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            >
              <div className="rounded-[12px] border border-line bg-card p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium text-fg">
                  <ShieldCheck className="size-3.5 text-good" aria-hidden="true" />
                  {t("공통 호환 엔진", "Common compatible engines")}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
                  {summary.commonEngines.length > 0
                    ? summary.commonEngines.join(", ")
                    : t("모든 선택 항목에 공통인 엔진이 없습니다.", "No engine is common to all selected items.")}
                </p>
              </div>
              <div className="rounded-[12px] border border-line bg-card p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium text-fg">
                  <Layers className="size-3.5 text-accent" aria-hidden="true" />
                  {t("패키지 구성", "Package contents")}
                </p>
                <p className="mt-1 text-xs text-fg-2 tabular-nums">
                  {t(
                    `총 ${summary.totalEntryCount}개 항목 · ${formatMarketByteSize(summary.totalManifestBytes)} manifest`,
                    `${summary.totalEntryCount} entries · ${formatMarketByteSize(summary.totalManifestBytes)} manifest`,
                  )}
                </p>
              </div>
              <div className="rounded-[12px] border border-line bg-card p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium text-fg">
                  <Sparkles className="size-3.5 text-warn" aria-hidden="true" />
                  {t("AI 사용 공개", "AI usage disclosure")}
                </p>
                <p className="mt-1 text-xs text-fg-2 tabular-nums">
                  {t(
                    `${summary.aiIncludedCount}/${summary.itemCount}개가 AI 포함으로 공개되었습니다.`,
                    `${summary.aiIncludedCount} of ${summary.itemCount} are disclosed as AI-assisted.`,
                  )}
                </p>
              </div>
              <div className="rounded-[12px] border border-line bg-card p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium text-fg">
                  <AlertTriangle className="size-3.5 text-warn" aria-hidden="true" />
                  {t("사용권 확인", "License check")}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
                  {summary.licenseCount > 1
                    ? t(
                        `${summary.licenseCount}개 라이선스가 섞여 있습니다. 프로젝트 사용 전 각각 확인하세요.`,
                        `${summary.licenseCount} licenses are mixed. Check each before using in your project.`,
                      )
                    : t(
                        "선택 항목의 라이선스 종류가 같습니다. 세부 조건은 각 상세에서 확인하세요.",
                        "Selected items share the same license type. Check the details of each for specifics.",
                      )}
                </p>
              </div>
            </section>

            {compareCount < MARKET_COMPARE_MAX_ITEMS &&
            toggleCompare &&
            wishlistCandidates.length > 0 ? (
              <section
                aria-label={t("찜 목록에서 비교 추가", "Quick-add from wishlist")}
                className="mt-4 rounded-[12px] border border-line bg-panel p-3.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-fg-2">
                    <Heart className="size-3.5 text-accent" aria-hidden="true" />
                    {t("찜한 에셋 바로 비교에 추가:", "Quick-add wishlisted assets:")}
                  </span>
                  {wishlistCandidates.slice(0, 6).map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => {
                        setCopiedMarkdown(false);
                        toggleCompare(candidate);
                      }}
                      className={buttonClass({
                        variant: "outline",
                        size: "sm",
                        className: "min-h-11 min-w-11 gap-1 rounded-[8px] text-xs",
                      })}
                    >
                      <Plus className="size-3" aria-hidden="true" />
                      {candidate.name}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="@container/compare mt-5 overflow-hidden rounded-[14px] border border-line bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs text-fg-3">
                    {t(
                      "표가 넓으면 이동 버튼으로 다른 열을 확인하세요.",
                      "If the table is wide, use the move buttons to see other columns.",
                    )}
                  </p>
                  <button
                    type="button"
                    aria-pressed={onlyDiffs}
                    data-testid="market-compare-diff-toggle"
                    onClick={() => {
                      setCopiedMarkdown(false);
                      setOnlyDiffs((prev) => !prev);
                    }}
                    className={buttonClass({
                      variant: onlyDiffs ? "solid" : "outline",
                      size: "sm",
                      className: "min-h-11 min-w-11 rounded-[8px] text-xs",
                    })}
                  >
                    {onlyDiffs
                      ? t("전체 항목 보기", "Show all rows")
                      : t("차이점만 강조 보기", "Show differences only")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopyMarkdown()}
                    className={buttonClass({
                      variant: "outline",
                      size: "sm",
                      className: "min-h-11 min-w-11 gap-1.5 rounded-[8px] text-xs",
                    })}
                  >
                    {copiedMarkdown ? (
                      <Check className="size-3.5 text-good" aria-hidden="true" />
                    ) : (
                      <Copy className="size-3.5" aria-hidden="true" />
                    )}
                    {copiedMarkdown
                      ? t("비교표 복사됨", "Table copied")
                      : t("비교표 Markdown 복사", "Copy Markdown table")}
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-controls="market-compare-table-scroll"
                    onClick={() => scrollComparison(-1)}
                    className={buttonClass({
                      variant: "outline",
                      size: "sm",
                      className: "min-h-11 gap-1.5 rounded-[8px]",
                    })}
                  >
                    <ChevronLeft className="size-3.5" aria-hidden="true" />
                    {t("이전 열 보기", "View previous columns")}
                  </button>
                  <button
                    type="button"
                    aria-controls="market-compare-table-scroll"
                    onClick={() => scrollComparison(1)}
                    className={buttonClass({
                      variant: "outline",
                      size: "sm",
                      className: "min-h-11 gap-1.5 rounded-[8px]",
                    })}
                  >
                    {t("다음 열 보기", "View next columns")}
                    <ChevronRight className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div
                id="market-compare-table-scroll"
                ref={tableViewportRef}
                role="region"
                aria-label={t("에셋 manifest 비교표", "Asset manifest comparison table")}
                className="overflow-x-auto"
              >
                <table
                  className="w-full border-collapse text-left text-xs tabular-nums"
                  style={{ minWidth: `${180 + compareCount * 220}px` }}
                >
                  <caption className="sr-only">
                    {t(
                      "선택한 에셋의 종류, 버전, 라이선스, 호환성, 출처와 패키지 정보 비교",
                      "Comparing the kinds, versions, licenses, compatibility, provenance, and package info of the selected assets",
                    )}
                  </caption>
                  <thead>
                    <tr className="border-b border-line bg-panel">
                      <th
                        scope="col"
                        className="sticky left-0 top-0 z-20 w-36 bg-panel px-4 py-3 font-semibold text-fg @[42rem]/compare:w-48"
                      >
                        {t("비교 항목", "Compared items")}
                      </th>
                      {compareItems.map((record) => (
                        <th
                          key={record.id}
                          scope="col"
                          className="sticky top-0 z-10 min-w-52 bg-panel px-4 py-3 font-semibold text-fg"
                        >
                          {record.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/70">
                    {visibleRows.map((comparisonRow) => (
                      <tr
                        key={comparisonRow.key}
                        className={comparisonRow.different ? "bg-accent/[0.04]" : undefined}
                      >
                        <th
                          scope="row"
                          className="sticky left-0 z-10 w-36 bg-card px-4 py-3 font-medium text-fg-2 @[42rem]/compare:w-48"
                        >
                          {comparisonRow.label}
                          {comparisonRow.different ? (
                            <span className="ml-1.5 rounded-[4px] bg-accent/15 px-1.5 py-0.5 text-[0.65rem] font-medium text-accent">
                              {t("차이", "Differs")}
                            </span>
                          ) : null}
                        </th>
                        {comparisonRow.values.map((value, index) => {
                          const evalItem =
                            comparisonRow.key === "production-fit"
                              ? evaluations[index]
                              : undefined;
                          return (
                            <td
                              key={`${comparisonRow.key}-${compareItems[index]?.id ?? index}`}
                              className="whitespace-pre-wrap break-words px-4 py-3 leading-relaxed text-fg-2"
                            >
                              <span>{value}</span>
                              {evalItem ? (
                                <span
                                  aria-hidden="true"
                                  className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-panel"
                                >
                                  <span
                                    className={cn(
                                      "ink-bar-fill block h-full rounded-full",
                                      evalItem.evaluation.status === "ready"
                                        ? "bg-good"
                                        : evalItem.evaluation.status === "review"
                                          ? "bg-warn"
                                          : "bg-bad",
                                    )}
                                    style={
                                      {
                                        width: `${evalItem.ratioPercent}%`,
                                        "--ink-i": index + 2,
                                      } as CSSProperties
                                    }
                                  />
                                </span>
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <p className="mt-3 text-xs leading-relaxed text-fg-3 [word-break:keep-all]">
              {t(
                "비교표는 공개 manifest 스냅샷입니다. 실제 설치 가능 여부와 현재 프로젝트 영향은 Studio 적용 단계에서 다시 확인해야 합니다.",
                "The comparison table is a public manifest snapshot. Re-check actual installability and impact on your current project at the Studio apply step.",
              )}
            </p>
          </>
        )}

        <MarketCompareSpecMatrix compareCount={compareCount} />
      </Container>
    </div>
  );
}
