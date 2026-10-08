/**
 * Studio Export Print Spec Section — 단행본 인쇄 스펙(PDF) 옵션(도련·재단 마크·색상·페이지 배열).
 * 이 섹션 자신은 스펙 상태도 PDF 조립도 소유하지 않는 순수 컨트롤이다(콘택트시트 패널과 동일한
 * 관례) — 스펙 상태·초안 보존(writeStudioPdfPrintSpecDraft)·인쇄 옵션 해석(resolvePdfPrintOptions)·
 * PDF 실행은 StudioExportMenuPanel 이 그대로 소유한다. 켤 때만 PDF가 인쇄용 빌더를 탄다.
 */
import { STUDIO_EXPORT_BLEED_MM_RANGE } from "./studio-export-package-preflight";

import type { StudioPdfPrintSpecState } from "./studio-export-print-spec";
import type { Dispatch, SetStateAction } from "react";

import { cx } from "@/shared/lib/cx";

export interface StudioExportPrintSpecSectionProps {
  /** 현재 인쇄 스펙 — 꺼져 있으면 세부 조절과 한계 안내를 숨긴다. */
  pdfPrintSpec: StudioPdfPrintSpecState;
  setPdfPrintSpec: Dispatch<SetStateAction<StudioPdfPrintSpecState>>;
}

export function StudioExportPrintSpecSection({
  pdfPrintSpec,
  setPdfPrintSpec,
}: StudioExportPrintSpecSectionProps) {
  return (
    <div className="mt-2.5 border-t border-line pt-2.5">
      <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-fg-2">
        <input
          type="checkbox"
          data-testid="export-print-spec-enabled"
          checked={pdfPrintSpec.enabled}
          onChange={(event) =>
            setPdfPrintSpec((current) => ({ ...current, enabled: event.target.checked }))
          }
          className="size-3.5 cursor-pointer accent-[var(--color-accent)]"
        />
        단행본 인쇄 스펙 (PDF)
      </label>
      {pdfPrintSpec.enabled ? (
        <div className="mt-1.5">
          <div className="grid grid-cols-2 items-end gap-1.5">
            <label className="text-[0.62rem] font-medium text-fg-3">
              도련 (mm)
              <input
                type="number"
                data-testid="export-print-spec-bleed"
                min={STUDIO_EXPORT_BLEED_MM_RANGE.min}
                max={STUDIO_EXPORT_BLEED_MM_RANGE.max}
                step={0.5}
                value={pdfPrintSpec.bleedMm === 0 ? "" : pdfPrintSpec.bleedMm}
                placeholder="0 (없음)"
                onChange={(event) => {
                  const raw = event.target.value;
                  const parsed = raw === "" ? 0 : Number(raw);
                  if (!Number.isFinite(parsed)) return;
                  setPdfPrintSpec((current) => ({
                    ...current,
                    bleedMm: Math.min(
                      STUDIO_EXPORT_BLEED_MM_RANGE.max,
                      Math.max(STUDIO_EXPORT_BLEED_MM_RANGE.min, parsed)
                    ),
                  }));
                }}
                className="mt-0.5 h-9 w-full rounded-lg border border-line bg-card px-2 text-xs text-fg outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                aria-label="인쇄 스펙 도련 밀리미터"
              />
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 pb-2.5 text-[0.62rem] font-medium text-fg-3">
              <input
                type="checkbox"
                data-testid="export-print-spec-crop-marks"
                checked={pdfPrintSpec.cropMarks}
                onChange={(event) =>
                  setPdfPrintSpec((current) => ({ ...current, cropMarks: event.target.checked }))
                }
                className="size-3.5 cursor-pointer accent-[var(--color-accent)]"
              />
              재단 마크
            </label>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-fg-2">색상</span>
            <div className="flex items-center gap-1" role="group" aria-label="인쇄 스펙 색상 모드">
              <button
                type="button"
                data-testid="export-print-spec-color-rgb"
                aria-pressed={pdfPrintSpec.colorMode === "rgb"}
                onClick={() =>
                  setPdfPrintSpec((current) => ({ ...current, colorMode: "rgb" }))
                }
                className={cx(
                  "h-7 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
                  pdfPrintSpec.colorMode === "rgb"
                    ? "border-accent bg-accent-soft text-fg"
                    : "border-line bg-card text-fg-2 hover:bg-raised"
                )}
              >
                RGB
              </button>
              <button
                type="button"
                data-testid="export-print-spec-color-cmyk"
                aria-pressed={pdfPrintSpec.colorMode === "cmyk"}
                onClick={() =>
                  setPdfPrintSpec((current) => ({ ...current, colorMode: "cmyk" }))
                }
                className={cx(
                  "h-7 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
                  pdfPrintSpec.colorMode === "cmyk"
                    ? "border-accent bg-accent-soft text-fg"
                    : "border-line bg-card text-fg-2 hover:bg-raised"
                )}
              >
                CMYK
              </button>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-fg-2">페이지 배열</span>
            <div className="flex items-center gap-1" role="group" aria-label="인쇄 스펙 페이지 배열">
              <button
                type="button"
                data-testid="export-print-spec-imposition-none"
                aria-pressed={pdfPrintSpec.imposition === "none"}
                onClick={() =>
                  setPdfPrintSpec((current) => ({ ...current, imposition: "none" }))
                }
                className={cx(
                  "h-7 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
                  pdfPrintSpec.imposition === "none"
                    ? "border-accent bg-accent-soft text-fg"
                    : "border-line bg-card text-fg-2 hover:bg-raised"
                )}
              >
                읽기 순서
              </button>
              <button
                type="button"
                data-testid="export-print-spec-imposition-booklet"
                aria-pressed={pdfPrintSpec.imposition === "booklet"}
                onClick={() =>
                  setPdfPrintSpec((current) => ({ ...current, imposition: "booklet" }))
                }
                className={cx(
                  "h-7 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
                  pdfPrintSpec.imposition === "booklet"
                    ? "border-accent bg-accent-soft text-fg"
                    : "border-line bg-card text-fg-2 hover:bg-raised"
                )}
              >
                중철 스프레드
              </button>
            </div>
          </div>
          <p className="mt-1.5 text-[0.6rem] leading-relaxed text-fg-3">
            도련 영역은 이미지를 균일 확대해 채웁니다 — 재단보다 큰 원본이 없으면 진짜 도련이
            되지 않습니다.
          </p>
          <p className="mt-1 text-[0.6rem] leading-relaxed text-fg-3">
            CMYK 변환은 ICC 프로파일 기반 색관리가 아닙니다 — 렌더링 인텐트·총잉크량(TAC)
            제한·도트 게인 보정이 없어 인쇄소 프로파일 변환과 색이 다를 수 있고, JPEG 대신
            픽셀 그대로 담아 파일이 커질 수 있습니다. PDF/X 같은 규격 적합이 필요한 발행은
            적합성 검사를 거치는 별도 경로를 사용하세요.
          </p>
          <p className="mt-1 text-[0.6rem] leading-relaxed text-fg-3">
            중철 스프레드는 모든 페이지 크기가 같아야 하며, 양면 인쇄를 전제로 펼침면을
            배열합니다.
          </p>
        </div>
      ) : null}
    </div>
  );
}
