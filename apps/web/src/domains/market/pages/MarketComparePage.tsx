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
  PackageSearch,
  Palette,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { MarketNavHeader } from "../components/MarketNavHeader";
import { MarketSectionArtBanner } from "../components/MarketSectionArtBanner";
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

import { SiteDisclosure } from "@/domains/legal/public/site-disclosure";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { introItemProps } from "@/shared/components/page-intro/page-intro-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
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
  const {
    compareItems,
    compareCount,
    removeCompare,
    clearCompare,
  } = compare;
  const toggleCompare = "toggleCompare" in compare && typeof compare.toggleCompare === "function"
    ? compare.toggleCompare
    : null;
  const { wishlistItems } = useMarketWishlist();
  const [onlyDiffs, setOnlyDiffs] = useState(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const [seatScale, setSeatScale] = useState<"solo-1" | "team-5" | "enterprise-20">("solo-1");
  const [specAxis, setSpecAxis] = useState<"lt-6pass-speed" | "vram-footprint" | "rig-blendshape" | "commercial-clause">("lt-6pass-speed");
  const tableViewportRef = useRef<HTMLDivElement>(null);
  const productionProfile = useMemo(() => readStoredProductionProfile(), []);
  const rows = useMemo(() => {
    const baseRows = createMarketComparisonRows(compareItems);
    if (compareItems.length === 0) return baseRows;
    const fitValues = compareItems.map((record) => {
      const evaluation = evaluateMarketProductionFit(record, productionProfile);
      const reason = marketProductionFitReasonLine(evaluation);
      const statusBadge = evaluation.status === "ready"
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
  }, [compareItems, productionProfile, t]);
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
    // Native buttons retain keyboard access without making a static table a tab stop.
    // Direct scrolling also respects reduced-motion preferences on every browser.
    const distance = Math.max(240, Math.floor(viewport.clientWidth * 0.8));
    viewport.scrollLeft += direction * distance;
  }

  return (
    <Container size="wide" className="py-7 sm:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
        <div>
          <div className="flex items-center gap-2">
            <GitCompareArrows className="size-5 text-accent" aria-hidden="true" />
            <h1 className="text-xl font-bold text-fg sm:text-2xl">{t("에셋 비교", "Compare assets")}</h1>
            <span className="numeral tnum rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-bold text-accent">
              {compareCount}/{MARKET_COMPARE_MAX_ITEMS}
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-fg-3">
            {t("비교 목록에 담은 공개 manifest의 사실만 나란히 표시합니다. 평점·판매량·성능 등 검증되지 않은 수치는 비교에 넣지 않습니다.", "Only facts from the public manifests in your compare list are shown side by side. Unverified numbers like ratings, sales, or performance are not compared.")}
          </p>
        </div>
        {compareCount > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/market/fit-lab"
              className={buttonClass({
                variant: "outline",
                size: "sm",
                className: "gap-1.5 text-fg-2",
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
                className: "gap-1.5 text-fg-2",
              })}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              {t("전체 비우기", "Clear all")}
            </button>
          </div>
        ) : null}
      </header>

      {compareCount === 0 ? (
        <section className="mt-10 rounded-2xl border border-dashed border-line bg-panel/50 p-10 text-center sm:p-14">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-raised text-fg-3">
            <PackageSearch className="size-6" aria-hidden="true" />
          </div>
          <h2 className="mt-3 text-sm font-bold text-fg">{t("비교할 에셋을 담아 주세요", "Add assets to compare")}</h2>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-fg-3">
            {t(`탐색 카드의 비교 버튼으로 최대 ${MARKET_COMPARE_MAX_ITEMS}개를 선택할 수 있습니다.`, `Use the compare button on browse cards to select up to ${MARKET_COMPARE_MAX_ITEMS} items.`)}
          </p>
          <Link
            href="/market/browse"
            className={buttonClass({
              variant: "solid",
              size: "md",
              className: "mt-4 gap-1.5",
            })}
          >
            {t("에셋 탐색", "Explore assets")}
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </section>
      ) : (
        <>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {compareItems.map((record, index) => {
              const kind = marketKindMeta(record.kind);
              return (
                <li key={record.id} className="group overflow-hidden rounded-xl border border-line bg-card" {...introItemProps(index)}>
                  <div className="relative aspect-[2/1]" aria-hidden="true">
                    <MarketResourceCover record={record} />
                  </div>
                  <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-bold leading-snug text-fg">
                        {record.name}
                      </p>
                      <p className="mt-0.5 truncate text-[0.68rem] text-fg-3">
                        {record.publisher.name} · v{record.resourceVersion}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeCompare(record.id)}
                      aria-label={t(`${record.name} 비교 목록에서 제거`, `Remove ${record.name} from the compare list`)}
                      className="flex min-h-11 min-w-11 items-center justify-center rounded p-1.5 text-fg-3 transition-colors hover:bg-warn/10 hover:text-warn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[0.65rem]">
                    <span className="rounded bg-accent/15 px-1.5 py-0.5 font-semibold text-accent">
                      {kind.label}
                    </span>
                    <span className="rounded bg-raised px-1.5 py-0.5 text-fg-2">
                      {marketLicenseMeta(record.license).label}
                    </span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Link
                      href={`/market/resource/${record.id}`}
                      className={buttonClass({
                        variant: "outline",
                        size: "sm",
                        className: "flex-1 gap-1",
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
                        className: "flex-1 gap-1",
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

          <section aria-label={t("비교 요약", "Comparison summary")} className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-line bg-card p-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <ShieldCheck className="size-3.5 text-good" aria-hidden="true" />
                {t("공통 호환 엔진", "Common compatible engines")}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-fg-2">
                {summary.commonEngines.length > 0
                  ? summary.commonEngines.join(", ")
                  : t("모든 선택 항목에 공통인 엔진이 없습니다.", "No engine is common to all selected items.")}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-card p-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Layers className="size-3.5 text-accent" aria-hidden="true" />
                {t("패키지 구성", "Package contents")}
              </p>
              <p className="mt-1 text-xs text-fg-2">
                {t(`총 ${summary.totalEntryCount}개 항목 · ${formatMarketByteSize(summary.totalManifestBytes)} manifest`, `${summary.totalEntryCount} entries · ${formatMarketByteSize(summary.totalManifestBytes)} manifest`)}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-card p-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Sparkles className="size-3.5 text-warn" aria-hidden="true" />
                {t("AI 사용 공개", "AI usage disclosure")}
              </p>
              <p className="mt-1 text-xs text-fg-2">
                {t(`${summary.aiIncludedCount}/${summary.itemCount}개가 AI 포함으로 공개되었습니다.`, `${summary.aiIncludedCount} of ${summary.itemCount} are disclosed as AI-assisted.`)}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-card p-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <AlertTriangle className="size-3.5 text-warn" aria-hidden="true" />
                {t("사용권 확인", "License check")}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-fg-2">
                {summary.licenseCount > 1
                  ? t(`${summary.licenseCount}개 라이선스가 섞여 있습니다. 프로젝트 사용 전 각각 확인하세요.`, `${summary.licenseCount} licenses are mixed. Check each before using in your project.`)
                  : t("선택 항목의 라이선스 종류가 같습니다. 세부 조건은 각 상세에서 확인하세요.", "Selected items share the same license type. Check the details of each for specifics.")}
              </p>
            </div>
          </section>

          {compareCount < MARKET_COMPARE_MAX_ITEMS && toggleCompare && wishlistCandidates.length > 0 ? (
            <section
              aria-label={t("찜 목록에서 비교 추가", "Quick-add from wishlist")}
              className="mt-4 rounded-xl border border-line bg-panel/60 p-3.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg-2">
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
                      className: "min-h-8 gap-1 text-xs",
                    })}
                  >
                    <Plus className="size-3" aria-hidden="true" />
                    {candidate.name}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="@container/compare mt-5 rounded-xl border border-line bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-fg-3">{t("표가 넓으면 이동 버튼으로 다른 열을 확인하세요.", "If the table is wide, use the move buttons to see other columns.")}</p>
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
                    className: "min-h-9 text-xs",
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
                    className: "min-h-9 gap-1.5 text-xs",
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
                  className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })}
                >
                  <ChevronLeft className="size-3.5" aria-hidden="true" />
                  {t("이전 열 보기", "View previous columns")}
                </button>
                <button
                  type="button"
                  aria-controls="market-compare-table-scroll"
                  onClick={() => scrollComparison(1)}
                  className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })}
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
                className="w-full border-collapse text-left text-xs"
                style={{ minWidth: `${180 + compareCount * 220}px` }}
              >
                <caption className="sr-only">
                  {t("선택한 에셋의 종류, 버전, 라이선스, 호환성, 출처와 패키지 정보 비교", "Comparing the kinds, versions, licenses, compatibility, provenance, and package info of the selected assets")}
                </caption>
                <thead>
                  <tr className="border-b border-line bg-panel/70">
                    <th scope="col" className="sticky left-0 top-0 z-20 w-36 bg-panel px-4 py-3 font-bold text-fg @[42rem]/compare:w-48">
                      {t("비교 항목", "Compared items")}
                    </th>
                    {compareItems.map((record) => (
                      <th key={record.id} scope="col" className="sticky top-0 z-10 min-w-52 bg-panel/95 px-4 py-3 font-bold text-fg">
                        {record.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {visibleRows.map((comparisonRow) => (
                    <tr key={comparisonRow.key} className={comparisonRow.different ? "bg-accent/[0.035]" : undefined}>
                      <th
                        scope="row"
                        className="sticky left-0 z-10 w-36 bg-card px-4 py-3 font-semibold text-fg-2 @[42rem]/compare:w-48"
                      >
                        {comparisonRow.label}
                        {comparisonRow.different ? (
                          <span className="ml-1.5 rounded bg-accent/15 px-1.5 py-0.5 text-[0.6rem] font-bold text-accent">
                            {t("차이", "Differs")}
                          </span>
                        ) : null}
                      </th>
                      {comparisonRow.values.map((value, index) => (
                        <td
                          key={`${comparisonRow.key}-${compareItems[index]?.id ?? index}`}
                          className="whitespace-pre-wrap break-words px-4 py-3 leading-relaxed text-fg-2"
                        >
                          {value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="mt-3 text-[0.68rem] leading-relaxed text-fg-3">
            {t("비교표는 공개 manifest 스냅샷입니다. 실제 설치 가능 여부와 현재 프로젝트 영향은 Studio 적용 단계에서 다시 확인해야 합니다.", "The comparison table is a public manifest snapshot. Re-check actual installability and impact on your current project at the Studio apply step.")}
          </p>
        </>
      )}
      <SiteDisclosure title={t("비교 전문 도구 · 마켓 이동", "Advanced comparison tools and market navigation")} className="mt-5">
        <MarketNavHeader />
      <section
        data-testid="market-compare-rea-spec-matrix-bar"
        aria-label={t("REA 3D·브러시 멀티시트 라이선스 및 6패스 스펙 비교 매트릭스", "REA 3D/brush multi-seat license & 6-pass spec comparison matrix")}
        className="mt-5 rounded-2xl border border-line bg-card/90 p-3.5 text-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="font-extrabold text-accent">
            {t("ACON3D · FAB · QUIXEL · BOOTH · FONTWORKS 멀티시트 라이선스 & 6-Pass 스펙 비교 매트릭스", "ACON3D · FAB · QUIXEL · BOOTH · FONTWORKS Multi-Seat License & 6-Pass Spec Matrix")}
          </strong>
          <span data-testid="market-compare-rea-seat-badge" className="rounded-full bg-accent/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-accent">
            {seatScale === "solo-1"
              ? t(`개인 1인 시트 · 비교 대상 ${compareCount}종`, `Solo 1-Seat · ${compareCount} compared`)
              : seatScale === "team-5"
                ? t(`5인 스튜디오 공동 라이선스 · 비교 대상 ${compareCount}종`, `5-Seat Studio Team · ${compareCount} compared`)
                : t(`20인 프로덕션 무제한 시트 · 비교 대상 ${compareCount}종`, `20-Seat Enterprise · ${compareCount} compared`)}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("기술 스펙 비교 축", "Technical spec comparison axis")}>
            {([
              { id: "lt-6pass-speed", ko: "WebGPU 6-Pass 은선 추출 속도", en: "WebGPU 6-Pass LT Speed" },
              { id: "vram-footprint", ko: "폴리곤·텍스처 VRAM 점유율", en: "Polygon & Texture VRAM Footprint" },
              { id: "rig-blendshape", ko: "VRM 52 표정·의상 리깅 호환", en: "VRM 52 BlendShape & Rig Check" },
              { id: "commercial-clause", ko: "상업 연재·2차 저작물 특약", en: "Commercial & Secondary IP Clause" },
            ] as const).map((axis) => (
              <button
                key={axis.id}
                type="button"
                aria-pressed={specAxis === axis.id}
                data-testid={`market-compare-rea-axis-${axis.id}`}
                onClick={() => setSpecAxis(axis.id)}
                className={specAxis === axis.id ? "rounded-lg border border-accent bg-accent/15 px-2.5 py-1 font-bold text-accent" : "rounded-lg border border-line bg-panel px-2.5 py-1 text-fg-2"}
              >
                {t(axis.ko, axis.en)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label={t("스튜디오 좌석 규모", "Studio seat scale")}>
            {([
              { id: "solo-1", ko: "1인 작가", en: "Solo (1)" },
              { id: "team-5", ko: "5인 어시 팀", en: "Team (5)" },
              { id: "enterprise-20", ko: "20인 스튜디오", en: "Studio (20)" },
            ] as const).map((scale) => (
              <button
                key={scale.id}
                type="button"
                aria-pressed={seatScale === scale.id}
                data-testid={`market-compare-rea-seat-${scale.id}`}
                onClick={() => setSeatScale(scale.id)}
                className={seatScale === scale.id ? "rounded-md border border-accent bg-accent px-2 py-0.5 text-[11px] font-bold text-on-accent" : "rounded-md border border-line bg-panel px-2 py-0.5 text-[11px] text-fg-3"}
              >
                {t(scale.ko, scale.en)}
              </button>
            ))}
          </div>
        </div>
        <p data-testid="market-compare-rea-spec-status" className="mt-2 rounded-xl border border-line bg-panel/70 px-3 py-2 text-[11px] leading-relaxed text-fg-2">
          {specAxis === "lt-6pass-speed"
            ? t("ACON3D ABLE·Snaptoon 기준 6패스(외곽선·깊이·AO·재질ID·그림자·조명) 추출 시 평균 0.38s/컷 이내로 Studio 캔버스에 즉시 병합됩니다.", "Merges 6-pass LT (Line, Depth, AO, Material ID, Shadow, Light) into Studio Canvas in under 0.38s/cut.")
            : specAxis === "vram-footprint"
              ? t("Quixel Megascans·Fab LOD0~LOD2 기준 태블릿(iPad Pro M2 8GB) 환경에서 에셋당 권장 VRAM 상한 1.1GB 이내 여부를 대조합니다.", "Verifies each asset stays within the 1.1GB VRAM budget on iPad Pro M2 8GB across LOD0–LOD2.")
              : specAxis === "rig-blendshape"
                ? t("VRoid·BOOTH·CLO 3D 의상/캐릭터 에셋 간 관절 본(Bone) 규격과 52개 ARKit 표정 모프 타깃 호환성을 나란히 검증합니다.", "Checks humanoid bone hierarchy and 52 ARKit facial morph compatibility across VRoid/BOOTH/CLO 3D assets.")
                : t("개인 작가 1인 라이선스와 어시스턴트 공동작업(5인/20인) 시 추가 시트 구매 필요 여부 및 단행본·영상화 2차 사용 범위를 대조합니다.", "Contrasts solo vs 5/20-seat assistant sharing rules and print/animation secondary IP clearance.")}
        </p>
      </section>

        <MarketSectionArtBanner />
      </SiteDisclosure>
    </Container>
  );
}
