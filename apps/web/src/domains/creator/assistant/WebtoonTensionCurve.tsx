/**
 * WebtoonTensionCurve — 컷별 긴장도 곡선(SVG) + 키보드로 닿는 점.
 *
 * 곡선·면·후보 구간 띠·기준선은 장식용 SVG(aria-hidden)로 그리고, 컷마다 하나씩 겹쳐 놓은 진짜
 * `<button>` 이 "점"이다. 그래서 포커스·Enter/Space·터치 영역·접근성 이름이 브라우저 기본 동작이다.
 * 점은 컷 한 칸 폭 전체(세로 전체)를 차지해 눌러야 하는 크기가 작지 않다.
 *
 * 키보드: Tab 으로 곡선에 들어오면 한 점만 탭 정지점(roving tabindex)이다. ←/→ 는 이웃 점으로,
 * Home/End 는 처음·끝 점으로 포커스를 옮긴다(선택은 바꾸지 않는다). Enter/Space 가 컷을 선택한다.
 * 곡선을 못 보는 사용자를 위한 텍스트 요약·표는 호출한 화면이 곁에 둔다(`describedBy`).
 *
 * 색만으로 구분하지 않는다 — 후보 구간은 띠 색과 함께 글리프(▲ ! …)와 점의 접근성 이름으로도 알린다.
 */

import { useRef, useState } from "react";

import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { STUDIO_EASE } from "../studio-panel-ui";

import { TENSION_KIND_GLYPHS, TENSION_KIND_LABELS } from "./webtoon-tension-copy";
import { TENSION_MAP_CONFIG } from "./webtoon-tension-map";
import { describeTensionPoint } from "./webtoon-tension-text";

import type { KeyboardEvent } from "react";

import type {
  TensionCut,
  TensionSegment,
  TensionSegmentKind,
} from "./webtoon-tension-map";

const bi = (ko: string, en: string): string =>
  translateBilingualValueForActiveLocale("WebtoonTensionCurve", ko, en);

/** 한 컷 칸의 최소 폭(px). 컷이 많으면 곡선이 가로로 스크롤된다. */
const COLUMN_MIN_PX = 36;
/** 위·아래 여백(%) — 긴장도 1 과 0 의 점이 잘리지 않고, 위쪽에 후보 글리프 줄이 들어갈 자리를 남긴다. */
const PLOT_PAD_PCT = 12;

/** 긴장도(0~1) → 플롯 바닥에서 올라온 높이(%). */
function plotBottomPct(tension: number): number {
  return PLOT_PAD_PCT + tension * (100 - 2 * PLOT_PAD_PCT);
}

const BAND_CLASS: Readonly<Record<TensionSegmentKind, string>> = {
  climax: "fill-accent/15",
  rush: "fill-warn/15",
  drag: "fill-cool/15",
};

const GLYPH_CLASS: Readonly<Record<TensionSegmentKind, string>> = {
  climax: "text-accent",
  rush: "text-warn",
  drag: "text-cool",
};

const KIND_ORDER: readonly TensionSegmentKind[] = ["climax", "rush", "drag"];

export interface WebtoonTensionCurveProps {
  readonly cuts: readonly TensionCut[];
  readonly segments: readonly TensionSegment[];
  readonly selectedIndex: number;
  readonly onSelect: (index: number) => void;
  /** 곡선을 글로 요약한 문단의 id — 그룹의 `aria-describedby` 로 이어진다. */
  readonly describedBy?: string;
}

export function WebtoonTensionCurve({
  cuts,
  segments,
  selectedIndex,
  onSelect,
  describedBy,
}: WebtoonTensionCurveProps) {
  useBilingualI18nRevision();
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [focusIndex, setFocusIndex] = useState(selectedIndex);

  const count = cuts.length;
  if (count === 0) return null;
  const selected = Math.min(Math.max(selectedIndex, 0), count - 1);
  // 컷 수가 줄어 포커스 위치가 범위를 벗어나도 곡선 전체가 키보드로 닿지 않는 일이 없게 한다.
  const tabbable = Math.min(Math.max(focusIndex, 0), count - 1);

  const x = (index: number): number => ((index + 0.5) / count) * 100;
  const y = (tension: number): number => 100 - plotBottomPct(tension);
  const linePoints = cuts.map((cut, index) => `${x(index)},${y(cut.tension)}`).join(" ");
  const areaPoints = `${x(0)},100 ${linePoints} ${x(count - 1)},100`;
  const { climaxMinTension, dragMaxTension } = TENSION_MAP_CONFIG.segments;

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = count - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = Math.min(index + 1, last);
    else if (event.key === "ArrowLeft") next = Math.max(index - 1, 0);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;
    // 스튜디오의 전역 방향키 이동이 같은 입력으로 선택 원고까지 움직이지 않게 막는다.
    event.preventDefault();
    event.stopPropagation();
    buttonRefs.current[next]?.focus();
    setFocusIndex(next);
  }

  return (
    <div
      role="group"
      aria-label={bi("컷별 긴장도 곡선", "Per-cut tension curve")}
      aria-describedby={describedBy}
      data-testid="tension-curve"
      className="flex flex-col gap-2"
    >
      <div className="flex gap-1">
        <div
          aria-hidden="true"
          className="relative h-48 w-6 shrink-0 text-right text-[0.58rem] tabular-nums text-fg-3"
        >
          {([1, 0.5, 0] as const).map((tick) => (
            <span
              key={tick}
              className="absolute right-0 translate-y-1/2 leading-none"
              style={{ bottom: `${plotBottomPct(tick)}%` }}
            >
              {tick}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-line bg-card">
          <div className="relative" style={{ minWidth: `${count * COLUMN_MIN_PX}px` }}>
            <svg
              aria-hidden="true"
              focusable="false"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute left-0 top-0 h-48 w-full"
            >
              {segments.map((segment) => (
                <rect
                  key={`${segment.kind}-${segment.reason}-${segment.startIndex}-${segment.endIndex}`}
                  x={(segment.startIndex / count) * 100}
                  y={0}
                  width={((segment.endIndex - segment.startIndex + 1) / count) * 100}
                  height={100}
                  className={BAND_CLASS[segment.kind]}
                />
              ))}
              <line
                x1={0}
                x2={100}
                y1={y(climaxMinTension)}
                y2={y(climaxMinTension)}
                className="stroke-line-strong"
                strokeWidth={1}
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={0}
                x2={100}
                y1={y(dragMaxTension)}
                y2={y(dragMaxTension)}
                className="stroke-line-strong"
                strokeWidth={1}
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
              {count > 1 ? (
                <>
                  <polygon points={areaPoints} className="fill-accent/10" />
                  <polyline
                    points={linePoints}
                    fill="none"
                    className="stroke-accent"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              ) : null}
            </svg>

            <div className="relative flex">
              {cuts.map((cut, index) => {
                const isSelected = index === selected;
                return (
                  <button
                    key={cut.id}
                    ref={(element) => {
                      buttonRefs.current[index] = element;
                    }}
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={describeTensionPoint(cut)}
                    tabIndex={index === tabbable ? 0 : -1}
                    data-tension-point={index}
                    onClick={() => onSelect(index)}
                    onFocus={() => setFocusIndex(index)}
                    onKeyDown={(event) => moveFocus(event, index)}
                    className={cn(
                      "group flex min-w-9 flex-1 flex-col pointer-coarse:min-w-11",
                      STUDIO_EASE,
                      // 점이 가로 스크롤 영역에 꽉 차서 바깥 윤곽선은 잘린다 — 안쪽으로 그린다.
                      "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
                      isSelected ? "bg-accent-soft" : "hover:bg-raised/60",
                    )}
                  >
                    <span className="relative block h-48 w-full">
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 top-1 flex justify-center gap-px text-[0.62rem] font-bold leading-none"
                      >
                        {KIND_ORDER.filter((kind) => cut.flags.includes(kind)).map((kind) => (
                          <span key={kind} className={GLYPH_CLASS[kind]}>
                            {TENSION_KIND_GLYPHS[kind]}
                          </span>
                        ))}
                      </span>
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute left-1/2 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-card bg-accent",
                          isSelected ? "size-4 ring-2 ring-accent" : "size-2.5",
                        )}
                        style={{ bottom: `${plotBottomPct(cut.tension)}%` }}
                      />
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex h-6 items-center justify-center text-[0.6rem] tabular-nums",
                        isSelected ? "font-bold text-accent" : "text-fg-3",
                      )}
                    >
                      {index + 1}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.62rem] text-fg-3">
        {KIND_ORDER.map((kind) => (
          <li key={kind} className="inline-flex items-center gap-1">
            <span aria-hidden="true" className={cn("font-bold", GLYPH_CLASS[kind])}>
              {TENSION_KIND_GLYPHS[kind]}
            </span>
            {bi(TENSION_KIND_LABELS[kind].ko, TENSION_KIND_LABELS[kind].en)}
          </li>
        ))}
        <li className="inline-flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block w-4 border-t border-dashed border-line-strong"
          />
          {formatI18nTemplate(
            bi("점선: 절정선 {climax} · 늘어짐선 {drag}", "Dashed: climax line {climax} · drag line {drag}"),
            { climax: climaxMinTension, drag: dragMaxTension },
          )}
        </li>
      </ul>
      <p className="text-[0.62rem] text-fg-3">
        {bi(
          "← → 로 점을 옮기고 Enter 로 컷을 선택해요. Home/End 는 처음·끝 점으로 가요.",
          "Use ← → to move between points and Enter to pick a cut. Home/End jump to the first/last point.",
        )}
      </p>
    </div>
  );
}
