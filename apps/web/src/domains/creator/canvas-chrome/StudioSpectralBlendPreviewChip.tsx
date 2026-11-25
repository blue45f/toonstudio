/**
 * 실시간 7밴드 분광 안료 혼색 프리뷰 칩 (Calm Atelier · Zero UI Slop).
 *
 * - 현재 전경색과 캔버스 바탕/보조색이 만났을 때의 7밴드 Kubelka-Munk 물리 혼색 결과와
 *   일반 sRGB 선형 혼색 비교, 미세 종이 광택·습도 프리뷰를 콤팩트한 스와치 칩으로 보여준다.
 * - 보라-블루 네온 그라디언트·과한 글래스 슬롭을 배제하고 ToonStudio 의미 토큰과
 *   1px 헤어라인 보더, 최소 44×44px 터치 타깃을 지킨다.
 */

import { Droplets, SlidersHorizontal, Sun } from "lucide-react";
import { useId, useMemo, useState } from "react";

import {
  CALM_ATELIER_SPECTRAL_TOKENS,
  computeSpectralBlendPreview,
} from "./studio-spectral-blend-preview";

import "./studio-vibrant-chrome.css";

export interface StudioSpectralBlendPreviewChipProps {
  /** 현재 선택된 전경색 HEX (#rrggbb). */
  readonly foregroundHex: string;
  /** 캔버스 바탕색 또는 보조색 HEX (기본 Calm Atelier Alabaster #FAF8F3). */
  readonly canvasBaseHex?: string;
  /** 혼색 비율 초기값 (0..1, 기본 0.5). */
  readonly initialMixRatio?: number;
  /** 습도 초기값 (0..1, 기본 0.35). */
  readonly initialWetness?: number;
  /** 미세 종이 광택 초기값 (0..1, 기본 0.25). */
  readonly initialPaperGloss?: number;
  /** 물리 혼색 결과 스와치를 클릭했을 때 선택 색으로 적용하는 콜백. */
  readonly onPickMixedColor?: (hex: string) => void;
  readonly compact?: boolean;
}

export function StudioSpectralBlendPreviewChip({
  foregroundHex,
  canvasBaseHex = CALM_ATELIER_SPECTRAL_TOKENS.alabasterPaperHex,
  initialMixRatio = 0.5,
  initialWetness = 0.35,
  initialPaperGloss = 0.25,
  onPickMixedColor,
  compact = false,
}: StudioSpectralBlendPreviewChipProps) {
  const id = useId();
  const [mixPct, setMixPct] = useState(() => Math.round(initialMixRatio * 100));
  const [wetPct, setWetPct] = useState(() => Math.round(initialWetness * 100));
  const [glossPct, setGlossPct] = useState(() => Math.round(initialPaperGloss * 100));
  const [controlsOpen, setControlsOpen] = useState(false);

  const preview = useMemo(
    () =>
      computeSpectralBlendPreview({
        foregroundHex,
        canvasBaseHex,
        mixRatio: mixPct / 100,
        wetness: wetPct / 100,
        paperGloss: glossPct / 100,
      }),
    [canvasBaseHex, foregroundHex, glossPct, mixPct, wetPct],
  );

  // 습도·종이 광택을 물리 계산 색(wetSurfaceHex → paperSheenHex)만으로 표현한다(장식용 네온 금지).
  const wetPaperSurfaceBackground = `linear-gradient(135deg, ${preview.paperSheenHex} 0%, ${preview.spectralHex} 52%, ${preview.wetSurfaceHex} 100%)`;

  return (
    <section
      aria-label="7밴드 분광 안료 혼색 프리뷰"
      data-studio-spectral-blend-chip="true"
      data-spectral-hex={preview.spectralHex}
      data-srgb-hex={preview.srgbLinearHex}
      className="rounded-xl border border-line bg-card p-2.5 text-xs text-fg"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-semibold text-fg">
            <Droplets size={14} aria-hidden="true" className="shrink-0 text-fg-2" />
            <span className="truncate">물감 섞임 미리보기</span>
          </div>
          <p className="mt-0.5 truncate text-xs text-fg-2" data-spectral-summary="true">
            {preview.summaryKo}
          </p>
        </div>
        <button
          type="button"
          aria-expanded={controlsOpen}
          aria-controls={`${id}-controls`}
          aria-label={controlsOpen ? "습도와 광택 조절 접기" : "습도와 광택 조절 열기"}
          onClick={() => setControlsOpen((open) => !open)}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-panel px-2 text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <SlidersHorizontal size={15} aria-hidden="true" />
        </button>
      </div>

      {/* 물리 혼색(KM7) vs 일반 sRGB 비교 스와치 행 */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          data-spectral-pick-button="true"
          aria-label={`7밴드 물리 혼색 ${preview.spectralHex.toUpperCase()} 적용`}
          onClick={() => onPickMixedColor?.(preview.spectralHex)}
          disabled={!onPickMixedColor}
          className="group flex min-h-11 items-center gap-2 rounded-lg border border-line-strong bg-panel p-1.5 text-left transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default"
        >
          <span
            aria-hidden="true"
            data-spectral-swatch="km7"
            className="size-8 shrink-0 rounded-md border border-line-strong"
            style={{ background: wetPaperSurfaceBackground }}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-fg">물감 섞임</span>
            <output
              data-spectral-output="km7"
              className="block font-mono text-xs text-fg-2 tabular-nums"
            >
              {preview.spectralHex.toUpperCase()}
            </output>
          </span>
        </button>

        <div
          className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-panel/70 p-1.5"
          aria-label={`일반 sRGB 혼색 비교 ${preview.srgbLinearHex.toUpperCase()}`}
        >
          <span
            aria-hidden="true"
            data-spectral-swatch="srgb"
            className="size-8 shrink-0 rounded-md border border-line"
            style={{ backgroundColor: preview.srgbLinearHex }}
          />
          <div className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-fg-2">기본 섞임</span>
            <output
              data-spectral-output="srgb"
              className="block font-mono text-xs text-fg-3 tabular-nums"
            >
              {preview.srgbLinearHex.toUpperCase()}
            </output>
          </div>
        </div>
      </div>

      {/* 전경·바탕 기준점 + 7밴드 반사율 미니 바 */}
      {!compact ? (
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-line/60 pt-2">
          <div className="flex items-center gap-1.5 text-xs text-fg-2">
            <span
              aria-hidden="true"
              className="inline-block size-3.5 rounded-sm border border-line-strong"
              style={{ backgroundColor: preview.foregroundHex }}
            />
            <span>+</span>
            <span
              aria-hidden="true"
              className="inline-block size-3.5 rounded-sm border border-line-strong"
              style={{ backgroundColor: preview.canvasBaseHex }}
            />
            <span className="font-mono tabular-nums text-fg-3">
              습도 {wetPct}% · 광택 {glossPct}%
            </span>
          </div>

          <div
            className="flex h-4 items-end gap-0.5"
            role="img"
            aria-label={`7밴드 분광 반사율 분포 (${preview.wavelengthsNm[0]}~${preview.wavelengthsNm[6]}nm)`}
          >
            {preview.spectralBands.map((reflectance, index) => {
              const wavelengthNm = preview.wavelengthsNm[index];
              return (
                <span
                  key={wavelengthNm}
                  aria-hidden="true"
                  data-spectral-band={wavelengthNm}
                  className="studio-spectral-band-bar w-1.5 rounded-t-xs"
                  style={{
                    height: `${Math.max(18, Math.round(reflectance * 100))}%`,
                  }}
                />
              );
            })}
          </div>
        </div>
      ) : null}

      {/* 접이식 정밀 조절(혼색 비율 · 습도 · 미세 종이 광택) */}
      {controlsOpen ? (
        <div
          id={`${id}-controls`}
          className="mt-2 space-y-2 border-t border-line/70 pt-2 text-xs text-fg-2"
        >
          <label className="grid gap-1" htmlFor={`${id}-ratio`}>
            <span className="flex items-center justify-between">
              <span>바탕 혼색 비율</span>
              <span className="font-mono tabular-nums">{mixPct}%</span>
            </span>
            <input
              id={`${id}-ratio`}
              type="range"
              min={0}
              max={100}
              value={mixPct}
              aria-label="바탕 혼색 비율"
              onChange={(event) => setMixPct(Number(event.currentTarget.value))}
              className="min-h-11 w-full cursor-pointer accent-accent"
            />
          </label>
          <label className="grid gap-1" htmlFor={`${id}-wetness`}>
            <span className="flex items-center justify-between">
              <span>붓 습도</span>
              <span className="font-mono tabular-nums">{wetPct}%</span>
            </span>
            <input
              id={`${id}-wetness`}
              type="range"
              min={0}
              max={100}
              value={wetPct}
              aria-label="붓 습도"
              onChange={(event) => setWetPct(Number(event.currentTarget.value))}
              className="min-h-11 w-full cursor-pointer accent-accent"
            />
          </label>
          <label className="grid gap-1" htmlFor={`${id}-gloss`}>
            <span className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1">
                <Sun size={12} aria-hidden="true" />
                종이 광택
              </span>
              <span className="font-mono tabular-nums">{glossPct}%</span>
            </span>
            <input
              id={`${id}-gloss`}
              type="range"
              min={0}
              max={100}
              value={glossPct}
              aria-label="종이 광택"
              onChange={(event) => setGlossPct(Number(event.currentTarget.value))}
              className="min-h-11 w-full cursor-pointer accent-accent"
            />
          </label>
        </div>
      ) : null}
    </section>
  );
}
