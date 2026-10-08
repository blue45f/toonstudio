/**
 * Studio Export Open Raster Section — 공개 래스터 포맷(QOI·TGA·PAM·BMP·PPM·TIFF) 선택 + 저장 버튼.
 * 이 섹션 자신은 인코딩도 파일 저장도 하지 않는 순수 컨트롤이다(콘택트시트 패널과 동일한 관례) —
 * 실제 인코딩(exportCurrentPageToRasterInterchange)·다운로드·busy/상태 관리는 StudioExportMenuPanel 이
 * 다른 내보내기 버튼과 같은 busy 잠금 아래에서 소유한다.
 */
import { FileImage } from "lucide-react";

import type { StudioRasterInterchangeFormat } from "../render/studio-raster-interchange";

import { cx } from "@/shared/lib/cx";

const OPEN_RASTER_FORMATS: readonly {
  id: StudioRasterInterchangeFormat;
  label: string;
  detail: string;
}[] = [
  { id: "qoi", label: "QOI", detail: "빠른 무손실 RGBA" },
  { id: "tga", label: "TGA", detail: "게임·3D RGBA" },
  { id: "pam", label: "PAM", detail: "Netpbm RGBA" },
  { id: "bmp", label: "BMP", detail: "범용 24-bit" },
  { id: "ppm", label: "PPM", detail: "범용 RGB" },
  { id: "tiff", label: "TIFF", detail: "무압축 RGBA 교환" },
] as const;

export interface StudioExportOpenRasterSectionProps {
  openRasterFormat: StudioRasterInterchangeFormat;
  setOpenRasterFormat: (format: StudioRasterInterchangeFormat) => void;
  /** 공개 래스터 인코딩 자체가 진행 중인지. */
  openRasterBusy: boolean;
  /** 툴바 내보내기가 진행 중이면 형식 선택도 잠근다. */
  isExporting: boolean;
  /** 이 인코딩이나 다른 내보내기(PDF/규격/PSD/SVG/콘택트시트/교환)가 실행 중이면 true — 저장 버튼을 잠근다. */
  disabled: boolean;
  openRasterStatus: { tone: "info" | "good" | "warn"; text: string } | null;
  onExport: () => void;
}

export function StudioExportOpenRasterSection({
  openRasterFormat,
  setOpenRasterFormat,
  openRasterBusy,
  isExporting,
  disabled,
  openRasterStatus,
  onExport,
}: StudioExportOpenRasterSectionProps) {
  return (
    <section className="mt-2.5 rounded-xl border border-line bg-card/45 p-2" aria-label="공개 래스터 포맷">
      <div className="flex items-center gap-2">
        <FileImage size={14} className="shrink-0 text-accent" aria-hidden />
        <label className="min-w-0 flex-1 text-[0.65rem] font-semibold text-fg-2">
          공개 래스터 포맷
          <select
            value={openRasterFormat}
            onChange={(event) => setOpenRasterFormat(event.target.value as StudioRasterInterchangeFormat)}
            aria-label="공개 래스터 내보내기 형식"
            disabled={openRasterBusy || isExporting}
            className="mt-1 min-h-11 w-full rounded-lg border border-line bg-panel px-2 text-xs text-fg outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
          >
            {OPEN_RASTER_FORMATS.map((format) => (
              <option key={format.id} value={format.id}>
                {format.label} · {format.detail}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        onClick={onExport}
        disabled={disabled}
        className="mt-1.5 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-accent/35 bg-accent/10 px-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
      >
        <FileImage size={13} aria-hidden />
        {openRasterBusy ? "픽셀 인코딩 중" : `${openRasterFormat.toUpperCase()} 저장`}
      </button>
      <p className="mt-1 text-[0.6rem] leading-relaxed text-fg-3">
        QOI·TGA·PAM·TIFF는 투명도를 보존합니다. BMP·PPM은 호환성을 위해 흰색 배경에 합성합니다.
      </p>
      <p
        aria-live="polite"
        className={cx(
          openRasterStatus ? "mt-1.5 rounded-md border px-2 py-1 text-[10px] leading-snug" : "sr-only",
          openRasterStatus?.tone === "info" && "border-line bg-panel text-fg-3",
          openRasterStatus?.tone === "good" && "border-good/40 bg-good/10 text-good",
          openRasterStatus?.tone === "warn" && "border-warn/40 bg-warn/10 text-warn"
        )}
      >
        {openRasterStatus?.text}
      </p>
    </section>
  );
}
