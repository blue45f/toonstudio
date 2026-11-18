/**
 * Studio Tone Panel
 * 만화 스크린톤 피커 — TONE_PRESETS를 카테고리(망점/선/그라데이션/교차선)별로 묶어
 * 흰 바탕에 검은 패턴이 보이는 56px 스와치 그리드로 깐다. 클릭하면 onPick으로 톤 SVG를 캔버스에 넘긴다.
 * StudioPage에서 분리한 순수 프레젠테이션 컴포넌트(상태 없음, props만 읽는다).
 * 검색어 필터는 상위에서 제어 — query로 라벨을 거르고, 결과 없는 카테고리는 헤더째 생략한다.
 */
import { useState } from "react";

import {
  DEFAULT_SCREENTONE_LAYER,
  type ScreentoneLayer,
} from "./screentone/screentone-layer";
import { ScreentoneLayerPanel } from "./screentone/ScreentoneLayerPanel";
import {
  DEFAULT_STUDIO_TONE_PATTERN_STATE,
  computeToneCellPeriodPx,
  moveTonePatternOffset,
  type StudioTonePatternState,
} from "./comic/studio-tone-workflow";
import {
  TONE_PRESETS,
  toneCategoryLabel,
  toneDataUrl,
  type ToneCategory,
  type TonePreset,
} from "./studio-tones";

import { cn } from "@/shared/lib/utils";


// 카테고리 표시 순서 고정 — 옅은 망점부터 선·그라데이션·교차선 순으로 읽힌다.
const CATEGORY_ORDER: ToneCategory[] = ["dot", "line", "gradient", "crosshatch"];

// 그룹 헤더 — 인스펙터 다른 패널과 같은 소제목 토큰.
const GROUP_HEADING = "text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider";

// 스와치 — CSP 톤 팔레트처럼 패턴 면이 주인공, 카드 프레임은 warm-ink.
const SWATCH_CLASS =
  "size-14 shrink-0 overflow-hidden rounded-xl border border-line bg-card shadow-sm transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function StudioTonePanel({
  onPick,
  query,
}: {
  onPick: (svg: string, label: string) => void;
  query?: string;
}): React.ReactElement {
  const needle = (query ?? "").trim().toLowerCase();
  const [customTone, setCustomTone] = useState<ScreentoneLayer>(DEFAULT_SCREENTONE_LAYER);
  const [patternPhase, setPatternPhase] = useState<StudioTonePatternState>(DEFAULT_STUDIO_TONE_PATTERN_STATE);

  const nudgePatternOffset = (dx: number, dy: number): void => {
    setPatternPhase((prev) =>
      moveTonePatternOffset(
        { ...prev, lpi: customTone.lines, angleDeg: customTone.angle, periodPx: computeToneCellPeriodPx(customTone.lines, prev.dpi) },
        dx,
        dy,
      ),
    );
  };

  const insertCustomScreentoneSvg = (): void => {
    const cell = Math.max(4, Math.round(72 / Math.max(10, customTone.lines)));
    const dotRadius = Math.max(0.6, (cell * 0.5) * Math.sqrt(Math.max(0.02, customTone.density / 100)));
    const ox = patternPhase.patternOffsetX.toFixed(2);
    const oy = patternPhase.patternOffsetY.toFixed(2);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cell * 4}" height="${cell * 4}" viewBox="0 0 ${cell * 4} ${cell * 4}"><defs><pattern id="st" x="${ox}" y="${oy}" width="${cell}" height="${cell}" patternUnits="userSpaceOnUse" patternTransform="rotate(${customTone.angle})">${
      customTone.kind === "line"
        ? `<line x1="0" y1="${cell / 2}" x2="${cell}" y2="${cell / 2}" stroke="#111111" stroke-width="${Math.max(0.8, (cell * customTone.density) / 100)}" />`
        : customTone.kind === "cross"
          ? `<path d="M 0 ${cell / 2} H ${cell} M ${cell / 2} 0 V ${cell}" stroke="#111111" stroke-width="${Math.max(0.6, (cell * customTone.density) / 140)}" />`
          : `<circle cx="${cell / 2}" cy="${cell / 2}" r="${dotRadius.toFixed(2)}" fill="#111111" />`
    }</pattern></defs><rect width="100%" height="100%" fill="url(#st)" /></svg>`;
    onPick(svg, `맞춤톤 ${customTone.lines}선 ${customTone.density}%`);
  };

  return (
    <div className="space-y-3" data-studio-tone-panel="true">
      {CATEGORY_ORDER.map((category) => {
        const presets = TONE_PRESETS.filter(
          (preset) =>
            preset.category === category &&
            (needle === "" || preset.label.toLowerCase().includes(needle))
        );
        if (presets.length === 0) return null;

        return (
          <section key={category} className="space-y-1.5">
            <p className={GROUP_HEADING}>{toneCategoryLabel(category)}</p>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset: TonePreset) => (
                <div key={preset.id} className="flex w-14 shrink-0 flex-col items-center gap-1">
                  <button
                    type="button"
                    title={preset.tip}
                    aria-label={preset.label}
                    data-studio-tone-swatch={preset.id}
                    onClick={() => onPick(preset.svg, preset.label)}
                    style={{
                      // Warm paper (not pure #fff) so DESIGN.md ink canvas stays consistent.
                      backgroundColor: "oklch(0.96 0.012 85)",
                      backgroundImage: `url("${toneDataUrl(preset.svg)}")`,
                      backgroundSize: "cover",
                    }}
                    className={cn(SWATCH_CLASS)}
                  />
                  <span className="text-center text-[10px] font-medium leading-tight text-fg-2">
                    {preset.label}
                  </span>
                </div>
              ))}
            </div>
          </section>
        );
      })}
      <details
        data-studio-custom-screentone-disclosure="true"
        className="rounded-xl border border-line bg-card/55 p-2.5 text-xs [word-break:keep-all]"
      >
        <summary className="flex min-h-11 cursor-pointer items-center justify-between font-semibold text-fg">
          <span>맞춤 망선·각도·농도 톤 만들기</span>
          <span className="tabular-nums text-[0.65rem] text-fg-3">
            {customTone.lines}선 · {customTone.angle}°
          </span>
        </summary>
        <div className="space-y-2 border-t border-line/60 pt-2">
          <ScreentoneLayerPanel value={customTone} onChange={setCustomTone} />
          <div className="flex items-center justify-between gap-1.5 rounded-lg border border-line/60 bg-canvas/70 px-2 py-1.5 text-[11px] text-fg-2">
            <span className="tabular-nums">
              무늬 이동 ({patternPhase.patternOffsetX.toFixed(1)}, {patternPhase.patternOffsetY.toFixed(1)}px)
            </span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => nudgePatternOffset(-1, 0)} className="min-h-8 min-w-8 rounded border border-line bg-card px-1.5 text-fg-2 hover:bg-raised" aria-label="톤 무늬 왼쪽 이동">←</button>
              <button type="button" onClick={() => nudgePatternOffset(1, 0)} className="min-h-8 min-w-8 rounded border border-line bg-card px-1.5 text-fg-2 hover:bg-raised" aria-label="톤 무늬 오른쪽 이동">→</button>
              <button type="button" onClick={() => nudgePatternOffset(0, 1)} className="min-h-8 min-w-8 rounded border border-line bg-card px-1.5 text-fg-2 hover:bg-raised" aria-label="톤 무늬 아래 이동">↓</button>
            </div>
          </div>
          <button
            type="button"
            onClick={insertCustomScreentoneSvg}
            className="flex min-h-11 w-full items-center justify-center rounded-lg bg-accent px-3 text-xs font-bold text-on-accent transition-[background-color,transform] duration-150 enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none"
          >
            이 맞춤 톤을 캔버스에 넣기
          </button>
        </div>
      </details>
    </div>
  );
}
