import { Gauge, Layers, ListOrdered, Ruler } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import { STUDIO_EXPORT_PAGE_SELECTION_MAX_LENGTH } from "../export/studio-export-page-selection";
import type { StudioExportPreExportScopeSummary } from "../studio-project-export-snapshot";

function formatPixels(value: number): string {
  return value.toLocaleString("en-US");
}

function formatMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  if (mb < 0.1) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(Math.round(mb * 10) / 10).toFixed(mb < 1 ? 2 : 1)} MB`;
}

export interface StudioExportScopeSummaryCardProps {
  readonly format: string;
  readonly summary: StudioExportPreExportScopeSummary;
  readonly onChangeSelectionMode: (mode: "all" | "custom") => void;
  readonly onChangeSelectionExpression: (expression: string) => void;
}

export function StudioExportScopeSummaryCard({
  format,
  summary,
  onChangeSelectionMode,
  onChangeSelectionExpression,
}: StudioExportScopeSummaryCardProps) {
  const bt = useBilingual("StudioExportScopeSummaryCard");
  const { actual, platformRecommendation, estimate } = summary;
  const formatUpper = format.trim().toUpperCase();

  const widthRuleText =
    platformRecommendation.exactWidth !== null
      ? bt(
          `가로 폭 ${formatPixels(platformRecommendation.exactWidth)} px 고정`,
          `Exact width ${formatPixels(platformRecommendation.exactWidth)} px`,
        )
      : platformRecommendation.maxWidth !== null
        ? bt(
            `최대 가로 폭 ${formatPixels(platformRecommendation.maxWidth)} px`,
            `Max width ${formatPixels(platformRecommendation.maxWidth)} px`,
          )
        : bt("가로 폭 고정 제한 없음", "No fixed width limit");

  const segmentRuleText =
    platformRecommendation.maxSegmentHeight !== null
      ? bt(
          `1장 분할 상한 ${formatPixels(platformRecommendation.maxSegmentHeight)} px`,
          `Max ${formatPixels(platformRecommendation.maxSegmentHeight)} px per slice`,
        )
      : bt("단일 세로 분할 제한 없음", "No slice height limit");

  const capRuleText =
    platformRecommendation.maxFileSizeBytes !== null
      ? bt(
          `파일 용량 상한 ${formatMegabytes(platformRecommendation.maxFileSizeBytes)}`,
          `File size cap ${formatMegabytes(platformRecommendation.maxFileSizeBytes)}`,
        )
      : bt("고정 용량 상한 없음", "No fixed file size cap");

  return (
    <section
      data-testid="studio-export-scope-summary"
      aria-label={bt("내보내기 전 범위 요약", "Pre-export scope summary")}
      className="mt-4 rounded-2xl border border-line bg-panel/45 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-black text-fg">
            {bt(
              "내보내기 전 범위 요약 · 실측 / 플랫폼 추천치 / 추정치 구분",
              "Pre-export scope summary · Actual vs Platform spec vs Estimate",
            )}
          </h3>
          <p className="mt-0.5 text-xs text-fg-3">
            {bt(
              "실제 원고 해상도·선택 순서와 플랫폼 권장 기준, 인코딩 전 용량 추정치를 섞지 않고 각각 보여 드립니다.",
              "Actual manuscript resolution and selection order are separated from platform specs and file-size estimates.",
            )}
          </p>
        </div>
        <span className="rounded-full border border-line bg-card px-2.5 py-1 text-[0.68rem] font-bold text-fg-2">
          {actual.sourceAuthority === "manuscript-snapshot"
            ? bt("실제 편집 원고 연결됨", "Live manuscript linked")
            : actual.sourceAuthority === "document-metadata"
              ? bt("원고 문서 규격 연결됨", "Document metadata linked")
              : bt("기본 점검 모드", "Default preflight mode")}
        </span>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        {/* 1. 실제 해상도 · 페이지 범위 · 선택 순서 */}
        <div
          data-testid="studio-export-scope-actual"
          className="rounded-xl border border-accent/35 bg-card p-3.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-fg">
              <ListOrdered size={14} className="text-accent" aria-hidden="true" />
              {bt("① 실제 해상도 · 선택 순서", "1. Actual resolution & order")}
            </span>
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.62rem] font-bold text-accent">
              {bt("실제 출력 기준", "Actual output")}
            </span>
          </div>

          <dl className="mt-2.5 space-y-1.5 text-xs">
            {actual.sourceCanvasWidth !== null && actual.sourceFirstPageHeight !== null ? (
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="text-fg-3">{bt("원고 원본 캔버스", "Source canvas")}</dt>
                <dd className="font-semibold tabular-nums text-fg">
                  {bt(
                    `1장 ${formatPixels(actual.sourceCanvasWidth)} × ${formatPixels(actual.sourceFirstPageHeight)} px · 총 ${actual.totalPageCount}P`,
                    `${formatPixels(actual.sourceCanvasWidth)} × ${formatPixels(actual.sourceFirstPageHeight)} px · ${actual.totalPageCount}P`,
                  )}
                </dd>
              </div>
            ) : null}

            <div
              data-testid="studio-export-scope-output-px"
              className="flex flex-wrap items-baseline justify-between gap-2"
            >
              <dt className="text-fg-3">{bt("로컬 출력 해상도", "Local output px")}</dt>
              <dd className="font-bold tabular-nums text-fg">
                {`${formatUpper} · ${formatPixels(actual.plannedOutputWidth)} × ${formatPixels(actual.plannedFirstPageOutputHeight)} px`}
                {actual.hasLocalManuscript ? ` (${actual.plannedExportScale}×)` : ""}
              </dd>
            </div>

            {actual.selectedPages.length > 1 ||
            actual.plannedTotalOutputHeight !== actual.plannedFirstPageOutputHeight ? (
              <div
                data-testid="studio-export-scope-total-px"
                className="flex flex-wrap items-baseline justify-between gap-2"
              >
                <dt className="text-fg-3">{bt("선택 전체 세로 합산", "Selected total px")}</dt>
                <dd className="font-semibold tabular-nums text-fg-2">
                  {`${formatPixels(actual.plannedOutputWidth)} × ${formatPixels(actual.plannedTotalOutputHeight)} px (${actual.selectedPages.length}P)`}
                </dd>
              </div>
            ) : null}

            <div
              data-testid="studio-export-scope-order"
              className="border-t border-line/70 pt-1.5"
            >
              <dt className="text-fg-3">{bt("선택 순서 (원고 출력 순)", "Selected output order")}</dt>
              <dd className="mt-0.5 font-semibold text-fg">
                {bt(actual.selectionOrderSequenceKo, actual.selectionOrderSequenceEn)}
                {actual.selectionValid
                  ? ` (${actual.selectionRangeLabel} · ${actual.selectedPages.length}P)`
                  : ""}
              </dd>
            </div>
          </dl>

          {actual.hasLocalManuscript ? (
            <div className="mt-2.5 space-y-1.5 border-t border-line/70 pt-2">
              <div
                className="flex flex-wrap items-center gap-1.5"
                role="group"
                aria-label={bt("내보낼 페이지 범위 선택", "Select export page scope")}
              >
                <button
                  type="button"
                  data-testid="studio-export-scope-select-all"
                  aria-pressed={actual.selectionMode === "all"}
                  onClick={() => onChangeSelectionMode("all")}
                  className={cn(
                    "min-h-8 rounded-lg border px-2.5 text-[0.68rem] font-bold transition-colors",
                    actual.selectionMode === "all"
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-panel text-fg-2 hover:bg-raised",
                  )}
                >
                  {bt(`전체 (1–${actual.totalPageCount})`, `All (1–${actual.totalPageCount})`)}
                </button>
                <button
                  type="button"
                  data-testid="studio-export-scope-select-custom"
                  aria-pressed={actual.selectionMode === "custom"}
                  onClick={() => onChangeSelectionMode("custom")}
                  className={cn(
                    "min-h-8 rounded-lg border px-2.5 text-[0.68rem] font-bold transition-colors",
                    actual.selectionMode === "custom"
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-panel text-fg-2 hover:bg-raised",
                  )}
                >
                  {bt("페이지 직접 지정", "Custom pages")}
                </button>
              </div>

              {actual.selectionMode === "custom" ? (
                <div>
                  <input
                    type="text"
                    data-testid="studio-export-scope-page-input"
                    aria-label={bt("내보낼 페이지 번호 지정", "Pages to export")}
                    aria-invalid={!actual.selectionValid}
                    maxLength={STUDIO_EXPORT_PAGE_SELECTION_MAX_LENGTH}
                    value={actual.selectionExpression}
                    onChange={(event) => onChangeSelectionExpression(event.target.value)}
                    placeholder={bt("예: 1, 3–5", "e.g. 1, 3–5")}
                    className="min-h-9 w-full rounded-lg border border-line bg-panel px-2.5 text-xs text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  />
                  {!actual.selectionValid && actual.selectionError ? (
                    <p
                      role="alert"
                      data-testid="studio-export-scope-selection-error"
                      className="mt-1 text-[0.68rem] font-semibold text-danger"
                    >
                      {actual.selectionError}
                    </p>
                  ) : actual.selectionReorderedToDocumentOrder ? (
                    <p
                      data-testid="studio-export-scope-reorder-note"
                      className="mt-1 text-[0.68rem] text-fg-3"
                    >
                      {bt(
                        "중복을 제외하고 원고 페이지 순서대로 정렬해 편집기 로컬 출력과 동일하게 저장합니다.",
                        "Duplicates are removed and pages are ordered in manuscript sequence to match editor output.",
                      )}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* 2. 플랫폼 추천치 · 규격 */}
        <div
          data-testid="studio-export-scope-recommended"
          className="rounded-xl border border-line bg-card p-3.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-fg">
              <Ruler size={14} className="text-fg-2" aria-hidden="true" />
              {bt("② 플랫폼 추천치 · 규격", "2. Platform recommended spec")}
            </span>
            <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-[0.62rem] font-bold text-fg-2">
              {bt("플랫폼 기준", "Platform rule")}
            </span>
          </div>

          <dl className="mt-2.5 space-y-1.5 text-xs">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-fg-3">{bt("대상 플랫폼", "Destination")}</dt>
              <dd className="font-semibold text-fg">
                {bt(platformRecommendation.targetLabelKo, platformRecommendation.targetLabelEn)}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-fg-3">{bt("권장 가로 폭", "Width rule")}</dt>
              <dd className="font-semibold tabular-nums text-fg">{widthRuleText}</dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-fg-3">{bt("분할 높이 기준", "Slice height limit")}</dt>
              <dd className="font-semibold tabular-nums text-fg-2">{segmentRuleText}</dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-fg-3">{bt("허용 형식 · 상한", "Formats & cap")}</dt>
              <dd className="font-semibold text-fg-2">
                {`${platformRecommendation.allowedFormats.map((item) => item.toUpperCase()).join("/")} · ${capRuleText}`}
              </dd>
            </div>
            {platformRecommendation.minimumDpi !== null ? (
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="text-fg-3">{bt("권장 최소 DPI", "Min DPI")}</dt>
                <dd className="font-semibold tabular-nums text-fg-2">
                  {`${platformRecommendation.minimumDpi} DPI`}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        {/* 3. 추정치 (용량 · 분할 수) */}
        <div
          data-testid="studio-export-scope-estimate"
          className="rounded-xl border border-line bg-card p-3.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-fg">
              <Gauge size={14} className="text-fg-2" aria-hidden="true" />
              {bt("③ 용량 · 분할 추정치", "3. File size & slice estimate")}
            </span>
            <span className="rounded-full border border-warning/35 bg-warning-soft/20 px-2 py-0.5 text-[0.62rem] font-bold text-warning">
              {bt("사전 추정치", "Estimate")}
            </span>
          </div>

          <dl className="mt-2.5 space-y-1.5 text-xs">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-fg-3">{bt("예상 파일 용량", "Estimated size")}</dt>
              <dd className="font-bold tabular-nums text-fg">
                {bt(
                  `약 ${formatMegabytes(estimate.estimatedFileSizeBytes)} (추정)`,
                  `~${formatMegabytes(estimate.estimatedFileSizeBytes)} (est.)`,
                )}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-fg-3">{bt("산출 기준", "Estimate source")}</dt>
              <dd className="text-fg-2">
                {estimate.isUserOverridden
                  ? bt("고급 설정 직접 입력 추정치", "User-entered estimate")
                  : bt(`${formatUpper} 픽셀 면적 기반 자동 추정`, `Auto-estimated from ${formatUpper} area`)}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-fg-3">{bt("예상 세로 분할", "Estimated slices")}</dt>
              <dd className="inline-flex items-center gap-1 font-semibold tabular-nums text-fg-2">
                <Layers size={12} aria-hidden="true" />
                {bt(`${estimate.segmentCount}구간`, `${estimate.segmentCount} slices`)}
              </dd>
            </div>
          </dl>
          <p className="mt-2.5 border-t border-line/70 pt-2 text-[0.68rem] leading-4 text-fg-3">
            {bt(
              "위 용량은 인코딩 전 추정치이며, 실제 로컬 파일 바이트 크기는 편집기에서 저장을 마칠 때 확정됩니다.",
              "File size above is a pre-encoding estimate; exact byte length is finalized when exported locally.",
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
