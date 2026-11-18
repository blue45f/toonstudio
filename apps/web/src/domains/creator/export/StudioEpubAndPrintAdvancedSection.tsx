/**
 * 고정 레이아웃 EPUB 3.0 내보내기, 1비트 모노크롬 망점 인쇄, 중철 밀림 보정 고급 설정 섹션.
 *
 * 역공학 근거(REA evidence_id):
 * - ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68
 * - ev_4571415adae1548e2078cdaf17fdc17fc7b43d1c9bdbbb5a58461c885bbdd64d
 */

import { BookOpen, Printer, Scissors } from "lucide-react";

import { computeSaddleStitchSheetCreepMm } from "./studio-imposition-creep";

import type { EpubRenditionSpread } from "./studio-epub-fixed-layout";
import type { StudioEpubAndPrintAdvancedState } from "./studio-export-print-spec";
import type { PrintHalftoneSpotShape } from "./studio-print-monochrome";
import type { ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

export type { StudioEpubAndPrintAdvancedState };

export interface StudioEpubAndPrintAdvancedSectionProps {
  readonly value: StudioEpubAndPrintAdvancedState;
  readonly pageCount?: number;
  readonly busy?: boolean;
  readonly onChange: (patch: Partial<StudioEpubAndPrintAdvancedState>) => void;
  readonly onExportEpub?: () => void;
}

const INTERACTIVE_CHIP_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-lg border px-2.5 py-1.5 text-xs font-semibold [word-break:keep-all] transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45";

const SUMMARY_CLASS =
  "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-fg [word-break:keep-all] transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none hover:bg-raised/70";

export function StudioEpubAndPrintAdvancedSection({
  value,
  pageCount = 16,
  busy = false,
  onChange,
  onExportEpub,
}: StudioEpubAndPrintAdvancedSectionProps): ReactElement {
  const sheetCount = Math.max(1, Math.ceil(Math.max(1, pageCount) / 4));
  const innerSheetCreepMm = value.saddleCreepEnabled
    ? computeSaddleStitchSheetCreepMm({
        sheetIndex: sheetCount - 1,
        sheetCount,
        maxCreepMm: value.maxCreepMm,
      })
    : 0;

  return (
    <section
      aria-label="단행본 EPUB 3.0 및 고급 인쇄 설정"
      className="space-y-2.5 rounded-xl border border-line bg-card/50 p-2.5 [word-break:keep-all]"
    >
      {/* 1. 고정 레이아웃 EPUB 3.0 내보내기 */}
      <details className="rounded-lg border border-line/70 bg-panel/60 p-1.5">
        <summary className={SUMMARY_CLASS}>
          <span className="inline-flex items-center gap-2">
            <BookOpen className="size-4 shrink-0 text-accent" aria-hidden />
            <span>고정 레이아웃 EPUB 3.0 내보내기</span>
          </span>
          <span className="rounded-full border border-line bg-card px-2 py-0.5 text-xs font-medium tabular-nums text-fg-3">
            {value.epubProgressionDirection === "rtl" ? "우철 (오른쪽 넘김)" : "좌철 (왼쪽 넘김)"}
          </span>
        </summary>

        <div className="space-y-2.5 px-2 pb-2 pt-1.5">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-fg-3">제본·페이지 넘김 방향</p>
            <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="EPUB 페이지 넘김 방향">
              {(
                [
                  { id: "ltr", label: "좌철 (왼쪽 넘김)" },
                  { id: "rtl", label: "우철 (오른쪽 넘김)" },
                ] as const
              ).map((item) => {
                const active = value.epubProgressionDirection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    disabled={busy}
                    onClick={() => onChange({ epubProgressionDirection: item.id })}
                    className={cn(
                      INTERACTIVE_CHIP_CLASS,
                      active
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-line bg-card text-fg-2 hover:border-accent/45 hover:text-fg",
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex min-h-11 items-center justify-between gap-2 text-xs text-fg-2">
            <span>양면 펼침 표시</span>
            <select
              aria-label="양면 펼침 표시"
              disabled={busy}
              value={value.epubSpread}
              onChange={(e) =>
                onChange({ epubSpread: e.currentTarget.value as EpubRenditionSpread })
              }
              className="min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs text-fg transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none focus-visible:border-accent"
            >
              <option value="landscape">가로 회전 시 양면 펼침</option>
              <option value="both">항상 양면 펼침</option>
              <option value="none">단면 전용</option>
              <option value="auto">뷰어 자동</option>
            </select>
          </label>

          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg border border-line/70 bg-card/60 px-2.5 py-1.5 text-xs text-fg-2">
            <span>Kindle KDP 코믹 호환 메타데이터 포함</span>
            <input
              type="checkbox"
              aria-label="Kindle KDP 코믹 호환 메타데이터 포함"
              disabled={busy}
              checked={value.kdpComicCompatible}
              onChange={(e) => onChange({ kdpComicCompatible: e.currentTarget.checked })}
              className="size-4 shrink-0 cursor-pointer accent-accent"
            />
          </label>

          {onExportEpub ? (
            <button
              type="button"
              disabled={busy}
              onClick={onExportEpub}
              className={cn(
                INTERACTIVE_CHIP_CLASS,
                "w-full border-accent bg-accent text-on-accent hover:opacity-95",
              )}
            >
              EPUB 3.0 전자책 패키지 생성 ({pageCount}쪽)
            </button>
          ) : null}
        </div>
      </details>

      {/* 2. 1비트 모노크롬 망점 인쇄 */}
      <details className="rounded-lg border border-line/70 bg-panel/60 p-1.5">
        <summary className={SUMMARY_CLASS}>
          <span className="inline-flex items-center gap-2">
            <Printer className="size-4 shrink-0 text-accent" aria-hidden />
            <span>1비트 모노크롬·회색조 망점 인쇄</span>
          </span>
          <span className="rounded-full border border-line bg-card px-2 py-0.5 text-xs font-medium tabular-nums text-fg-3">
            {value.monochromeEnabled ? `${value.halftoneLpi}LPI · ${value.halftoneDpi}DPI` : "꺼짐"}
          </span>
        </summary>

        <div className="space-y-2.5 px-2 pb-2 pt-1.5">
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg border border-line/70 bg-card/60 px-2.5 py-1.5 text-xs text-fg-2">
            <span>흑백 출판 인쇄 래스터화 사용</span>
            <input
              type="checkbox"
              aria-label="흑백 출판 인쇄 래스터화 사용"
              disabled={busy}
              checked={value.monochromeEnabled}
              onChange={(e) => onChange({ monochromeEnabled: e.currentTarget.checked })}
              className="size-4 shrink-0 cursor-pointer accent-accent"
            />
          </label>

          {value.monochromeEnabled ? (
            <>
              <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="흑백 출력 방식">
                {(
                  [
                    { id: "monochrome-1bit", label: "1비트 망점 (순흑 먹선)" },
                    { id: "grayscale", label: "회색조 농담 인쇄" },
                  ] as const
                ).map((mode) => {
                  const active = value.monochromeMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      aria-pressed={active}
                      disabled={busy}
                      onClick={() => onChange({ monochromeMode: mode.id })}
                      className={cn(
                        INTERACTIVE_CHIP_CLASS,
                        active
                          ? "border-accent bg-accent/15 text-accent"
                          : "border-line bg-card text-fg-2 hover:border-accent/45 hover:text-fg",
                      )}
                    >
                      {mode.label}
                    </button>
                  );
                })}
              </div>

              {value.monochromeMode === "monochrome-1bit" ? (
                <>
                  <label className="flex min-h-11 items-center justify-between gap-2 text-xs text-fg-2">
                    <span>망점 선수 (LPI)</span>
                    <span className="flex min-h-11 items-center gap-2">
                      <input
                        type="range"
                        aria-label="망점 선수 (LPI)"
                        min={30}
                        max={85}
                        step={5}
                        disabled={busy}
                        value={value.halftoneLpi}
                        onChange={(e) => onChange({ halftoneLpi: Number(e.currentTarget.value) })}
                        className="min-h-11 w-24 cursor-pointer accent-accent"
                      />
                      <span className="w-12 text-right tabular-nums text-fg-3">
                        {value.halftoneLpi}LPI
                      </span>
                    </span>
                  </label>

                  <label className="flex min-h-11 items-center justify-between gap-2 text-xs text-fg-2">
                    <span>출력 해상도 (DPI)</span>
                    <select
                      aria-label="출력 해상도 (DPI)"
                      disabled={busy}
                      value={value.halftoneDpi}
                      onChange={(e) =>
                        onChange({ halftoneDpi: Number(e.currentTarget.value) as 600 | 1200 })
                      }
                      className="min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs tabular-nums text-fg transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none"
                    >
                      <option value={600}>600 DPI (표준 단행본)</option>
                      <option value={1200}>1200 DPI (고정밀 상업 인쇄)</option>
                    </select>
                  </label>

                  <label className="flex min-h-11 items-center justify-between gap-2 text-xs text-fg-2">
                    <span>망점 모양</span>
                    <select
                      aria-label="망점 모양"
                      disabled={busy}
                      value={value.halftoneSpotShape}
                      onChange={(e) =>
                        onChange({
                          halftoneSpotShape: e.currentTarget.value as PrintHalftoneSpotShape,
                        })
                      }
                      className="min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs text-fg transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none"
                    >
                      <option value="dot">원형 점 (표준 45°)</option>
                      <option value="line">선형 만선</option>
                      <option value="cross">십자 교차</option>
                    </select>
                  </label>

                  <label className="flex min-h-11 items-center justify-between gap-2 text-xs text-fg-2">
                    <span>순흑 먹선 보호 임계값</span>
                    <span className="flex min-h-11 items-center gap-2">
                      <input
                        type="range"
                        aria-label="순흑 먹선 보호 임계값"
                        min={10}
                        max={110}
                        step={5}
                        disabled={busy}
                        value={value.solidInkThreshold}
                        onChange={(e) =>
                          onChange({ solidInkThreshold: Number(e.currentTarget.value) })
                        }
                        className="min-h-11 w-24 cursor-pointer accent-accent"
                      />
                      <span className="w-10 text-right tabular-nums text-fg-3">
                        {value.solidInkThreshold}
                      </span>
                    </span>
                  </label>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </details>

      {/* 3. 중철 밀림 보정 */}
      <details className="rounded-lg border border-line/70 bg-panel/60 p-1.5">
        <summary className={SUMMARY_CLASS}>
          <span className="inline-flex items-center gap-2">
            <Scissors className="size-4 shrink-0 text-accent" aria-hidden />
            <span>중철 밀림 보정</span>
          </span>
          <span className="rounded-full border border-line bg-card px-2 py-0.5 text-xs font-medium tabular-nums text-fg-3">
            {value.saddleCreepEnabled ? `${value.maxCreepMm.toFixed(1)}mm` : "꺼짐"}
          </span>
        </summary>

        <div className="space-y-2.5 px-2 pb-2 pt-1.5">
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg border border-line/70 bg-card/60 px-2.5 py-1.5 text-xs text-fg-2">
            <span>중철 접지 안쪽 밀림 보정 적용</span>
            <input
              type="checkbox"
              aria-label="중철 접지 안쪽 밀림 보정 적용"
              disabled={busy}
              checked={value.saddleCreepEnabled}
              onChange={(e) => onChange({ saddleCreepEnabled: e.currentTarget.checked })}
              className="size-4 shrink-0 cursor-pointer accent-accent"
            />
          </label>

          {value.saddleCreepEnabled ? (
            <>
              <label className="flex min-h-11 items-center justify-between gap-2 text-xs text-fg-2">
                <span>최대 안쪽 당김 폭</span>
                <span className="flex min-h-11 items-center gap-2">
                  <input
                    type="range"
                    aria-label="최대 안쪽 당김 폭"
                    min={0.2}
                    max={5}
                    step={0.1}
                    disabled={busy}
                    value={value.maxCreepMm}
                    onChange={(e) => onChange({ maxCreepMm: Number(e.currentTarget.value) })}
                    className="min-h-11 w-24 cursor-pointer accent-accent"
                  />
                  <span className="w-12 text-right tabular-nums text-fg-3">
                    {value.maxCreepMm.toFixed(1)}mm
                  </span>
                </span>
              </label>

              <p
                role="status"
                className="rounded-lg border border-line/60 bg-card/70 px-2.5 py-1.5 text-xs leading-relaxed tabular-nums text-fg-3"
              >
                총 {sheetCount}장 접지 기준 · 겉장 0.00mm → 가운데장 {innerSheetCreepMm.toFixed(2)}mm
                척추 방향으로 자동 보정합니다.
              </p>
            </>
          ) : null}

          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg border border-line/70 bg-card/60 px-2.5 py-1.5 text-xs text-fg-2">
            <span>바깥 여백 작품명·회차·쪽번호 스탬프 인쇄</span>
            <input
              type="checkbox"
              aria-label="바깥 여백 작품명·회차·쪽번호 스탬프 인쇄"
              disabled={busy}
              checked={value.runningStampEnabled}
              onChange={(e) => onChange({ runningStampEnabled: e.currentTarget.checked })}
              className="size-4 shrink-0 cursor-pointer accent-accent"
            />
          </label>
        </div>
      </details>
    </section>
  );
}
