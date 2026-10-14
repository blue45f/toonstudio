/**
 * Studio Export Book Layout Section — 단행본 조판(판형 프리셋·도련·안전 영역) 옵션.
 * 이 섹션 자신은 상태도 PDF 조립도 소유하지 않는 순수 컨트롤이다(인쇄 스펙 섹션과 같은
 * 관례) — 상태·초안 보존·요청 해석·PDF 실행은 StudioExportMenuPanel이 소유한다.
 * 켜면 PDF 내보내기가 단행본 빌더를 타며, 인쇄 스펙보다 우선한다.
 * 판형을 고르면 재단·도련·안전 박스 수치를 그 자리에서 보여줘, 내보내기 전에
 * "무엇이 어디까지 찍히고 무엇이 위험한지"를 작가가 확인할 수 있게 한다.
 */
import {
  BOOK_TRIM_PRESETS,
  bookPagePixelSize,
  computeBookPageBoxes,
  findBookTrimPreset,
} from "./studio-book-layout-model";

import type { StudioBookLayoutSpecState } from "./studio-export-book-spec";
import type { Dispatch, SetStateAction } from "react";

import { cx } from "@/shared/lib/cx";

export interface StudioExportBookLayoutSectionProps {
  bookLayoutSpec: StudioBookLayoutSpecState;
  setBookLayoutSpec: Dispatch<SetStateAction<StudioBookLayoutSpecState>>;
}

function mm1(value: number): string {
  return `${Math.round(value * 10) / 10}mm`;
}

export function StudioExportBookLayoutSection({
  bookLayoutSpec,
  setBookLayoutSpec,
}: StudioExportBookLayoutSectionProps) {
  const preset = findBookTrimPreset(bookLayoutSpec.presetId) ?? BOOK_TRIM_PRESETS[0];
  const boxes = computeBookPageBoxes(preset.spec, "single");
  const pixels = bookPagePixelSize(preset.spec, bookLayoutSpec.dpi);
  const pt = (value: number): number => Math.round(value * 100) / 100;
  return (
    <div className="mt-2.5 border-t border-line pt-2.5">
      <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-fg-2">
        <input
          type="checkbox"
          data-testid="export-book-layout-enabled"
          checked={bookLayoutSpec.enabled}
          onChange={(event) =>
            setBookLayoutSpec((current) => ({ ...current, enabled: event.target.checked }))
          }
          className="size-3.5 cursor-pointer accent-[var(--color-accent)]"
        />
        단행본 조판 (인쇄용 PDF)
      </label>
      {bookLayoutSpec.enabled ? (
        <div className="mt-1.5">
          <div
            className="flex flex-wrap items-center gap-1"
            role="group"
            aria-label="단행본 판형 프리셋"
          >
            {BOOK_TRIM_PRESETS.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`export-book-layout-preset-${item.id}`}
                aria-pressed={bookLayoutSpec.presetId === item.id}
                onClick={() =>
                  setBookLayoutSpec((current) => ({ ...current, presetId: item.id }))
                }
                className={cx(
                  "h-7 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
                  bookLayoutSpec.presetId === item.id
                    ? "border-accent bg-accent-soft text-fg"
                    : "border-line bg-card text-fg-2 hover:bg-raised"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <dl
            className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[0.62rem] leading-relaxed text-fg-3"
            data-testid="export-book-layout-boxes"
          >
            <div className="flex justify-between gap-2">
              <dt>재단 (Trim)</dt>
              <dd>
                {mm1(preset.spec.trimWidthMm)} × {mm1(preset.spec.trimHeightMm)} ·{" "}
                {pt(boxes.trim.width)}×{pt(boxes.trim.height)}pt
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>도련 포함 (Bleed)</dt>
              <dd>
                {mm1(preset.spec.trimWidthMm + preset.spec.bleedMm * 2)} ×{" "}
                {mm1(preset.spec.trimHeightMm + preset.spec.bleedMm * 2)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>안전 영역</dt>
              <dd>
                재단에서 {mm1(preset.spec.safeMarginMm)} 안쪽 (제본 +{mm1(preset.spec.gutterMm)})
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>렌더 크기</dt>
              <dd>
                {pixels.width}×{pixels.height}px · {bookLayoutSpec.dpi}dpi
              </dd>
            </div>
          </dl>
          <div className="mt-2 flex items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-[0.62rem] font-medium text-fg-3">
              <input
                type="checkbox"
                data-testid="export-book-layout-crop-marks"
                checked={bookLayoutSpec.cropMarks}
                onChange={(event) =>
                  setBookLayoutSpec((current) => ({
                    ...current,
                    cropMarks: event.target.checked,
                  }))
                }
                className="size-3.5 cursor-pointer accent-[var(--color-accent)]"
              />
              재단 마크
            </label>
            <div className="flex items-center gap-1" role="group" aria-label="단행본 렌더 해상도">
              {[150, 300].map((dpi) => (
                <button
                  key={dpi}
                  type="button"
                  data-testid={`export-book-layout-dpi-${dpi}`}
                  aria-pressed={bookLayoutSpec.dpi === dpi}
                  onClick={() => setBookLayoutSpec((current) => ({ ...current, dpi }))}
                  className={cx(
                    "h-7 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
                    bookLayoutSpec.dpi === dpi
                      ? "border-accent bg-accent-soft text-fg"
                      : "border-line bg-card text-fg-2 hover:bg-raised"
                  )}
                >
                  {dpi}dpi
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1.5 text-[0.6rem] leading-relaxed text-fg-3">
            판형 박스(Media·Trim·Bleed)가 PDF에 그대로 기록됩니다. 말풍선·대사처럼 중요한
            요소가 안전 영역을 벗어나면 내보내기 결과에 경고가 표시됩니다. 켜면 위쪽 인쇄
            스펙보다 단행본 조판이 우선합니다.
          </p>
        </div>
      ) : null}
    </div>
  );
}
