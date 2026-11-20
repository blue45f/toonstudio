import { ChevronDown, SlidersHorizontal } from "lucide-react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import {
  DEFAULT_STUDIO_CSP_BRUSH_EXTENSIONS,
  isStudioCspBrushExtensionsIdentity,
  normalizeStudioCspBrushExtensions,
  type NormalizedStudioCspBrushExtensions,
  type StudioSubColorMixSource,
} from "./studio-brush-stroke-color-dynamics";
import {
  STUDIO_PATTERN_MOTIF_LABELS,
  type StudioBuiltInPatternMotifId,
  type StudioPatternOrderMode,
} from "./studio-pattern-brush";
import type { StudioRuledLineMode } from "./studio-stroke-ruled-line";

import type { ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

export interface StudioBrushAdvancedCspSectionProps {
  readonly value?: NormalizedStudioCspBrushExtensions | null;
  readonly onChange: (next: NormalizedStudioCspBrushExtensions | undefined) => void;
}

const RULED_LINE_OPTIONS: readonly { readonly id: StudioRuledLineMode; readonly label: string }[] = [
  { id: "none", label: "일반 실선" },
  { id: "dashed", label: "파선 (점선 띠)" },
  { id: "dotted", label: "점선 (일정 간격)" },
  { id: "waved", label: "물결선" },
  { id: "rough-edged", label: "거친 펜선" },
  { id: "bumpy", label: "울퉁불퉁선" },
] as const;

const PATTERN_ORDER_OPTIONS: readonly { readonly id: StudioPatternOrderMode; readonly label: string }[] = [
  { id: "repeat", label: "순서 반복" },
  { id: "ping-pong", label: "왕복 반복" },
  { id: "seeded-random", label: "무작위 배치" },
  { id: "per-stroke", label: "획마다 변경" },
] as const;

const SUBCOLOR_SOURCES: readonly { readonly id: StudioSubColorMixSource; readonly label: string }[] = [
  { id: "off", label: "꺼짐" },
  { id: "pressure", label: "필압 연동" },
  { id: "speed", label: "속도 연동" },
  { id: "tilt", label: "펜 기울기" },
] as const;

function countActiveFeatures(ext: NormalizedStudioCspBrushExtensions): number {
  let count = 0;
  if (ext.inOutTaper.useIn || ext.inOutTaper.useOut) count += 1;
  if (ext.sharpCorner.enabled) count += 1;
  if (ext.dwellBuildup.enabled) count += 1;
  if (ext.ruledLine.mode !== "none") count += 1;
  if (ext.patternBrush.motif !== "none") count += 1;
  if (
    ext.strokeColorAndScale.perStrokeColorJitter
    || ext.strokeColorAndScale.subColorMixSource !== "off"
    || ext.strokeColorAndScale.syncSizeWithViewScale
  ) {
    count += 1;
  }
  return count;
}

export function StudioBrushAdvancedCspSection({
  value,
  onChange,
}: StudioBrushAdvancedCspSectionProps): ReactElement {
  const ext = normalizeStudioCspBrushExtensions(value ?? DEFAULT_STUDIO_CSP_BRUSH_EXTENSIONS);
  const activeCount = countActiveFeatures(ext);

  const commit = (patch: Parameters<typeof normalizeStudioCspBrushExtensions>[0]): void => {
    const merged = normalizeStudioCspBrushExtensions({
      inOutTaper: { ...ext.inOutTaper, ...patch?.inOutTaper },
      sharpCorner: { ...ext.sharpCorner, ...patch?.sharpCorner },
      dwellBuildup: { ...ext.dwellBuildup, ...patch?.dwellBuildup },
      ruledLine: { ...ext.ruledLine, ...patch?.ruledLine },
      patternBrush: { ...ext.patternBrush, ...patch?.patternBrush },
      strokeColorAndScale: { ...ext.strokeColorAndScale, ...patch?.strokeColorAndScale },
    });
    onChange(isStudioCspBrushExtensionsIdentity(merged) ? undefined : merged);
  };

  return (
    <details
      data-studio-brush-csp-extensions="true"
      className="group rounded-xl border border-line bg-panel/70"
    >
      <summary
        className={cn(
          "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-fg select-none [word-break:keep-all] [&::-webkit-details-marker]:hidden",
          STUDIO_FOCUS_RING,
        )}
      >
        <span className="flex items-center gap-1.5">
          <SlidersHorizontal className="size-3.5 text-accent" aria-hidden="true" />
          <span>펜선 끝단·예각 모서리·고임·보조색 세밀 조정</span>
        </span>
        <span className="flex items-center gap-1.5">
          {activeCount > 0 ? (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold tabular-nums text-accent">
              {activeCount}개 켜짐
            </span>
          ) : (
            <span className="text-xs text-fg-3">기본</span>
          )}
          <ChevronDown
            className="size-3.5 text-fg-3 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </span>
      </summary>

      <div className="space-y-3 border-t border-line/60 p-3 text-xs [word-break:keep-all]">
        {/* 1. 속도·길이 기반 들어가기/빼기 테이퍼 */}
        <div className="space-y-2 rounded-lg border border-line/70 bg-card/55 p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-fg">시작·끝 필세 감쇠 (들어가기·빼기)</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-pressed={ext.inOutTaper.useIn}
                onClick={() => commit({ inOutTaper: { useIn: !ext.inOutTaper.useIn } })}
                className={cn(
                  "min-h-11 rounded-lg border px-2.5 text-xs font-semibold transition-[background-color,border-color,color,transform] duration-150 enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none",
                  STUDIO_FOCUS_RING,
                  ext.inOutTaper.useIn
                    ? "border-accent bg-accent-soft text-fg"
                    : "border-line bg-card text-fg-2 hover:bg-raised",
                )}
              >
                시작 감쇠
              </button>
              <button
                type="button"
                aria-pressed={ext.inOutTaper.useOut}
                onClick={() => commit({ inOutTaper: { useOut: !ext.inOutTaper.useOut } })}
                className={cn(
                  "min-h-11 rounded-lg border px-2.5 text-xs font-semibold transition-[background-color,border-color,color,transform] duration-150 enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none",
                  STUDIO_FOCUS_RING,
                  ext.inOutTaper.useOut
                    ? "border-accent bg-accent-soft text-fg"
                    : "border-line bg-card text-fg-2 hover:bg-raised",
                )}
              >
                끝단 빼기
              </button>
            </div>
          </div>
          {(ext.inOutTaper.useIn || ext.inOutTaper.useOut) && (
            <div className="space-y-2 pt-1">
              <label className="flex min-h-11 cursor-pointer items-center justify-between gap-2">
                <span className="text-fg-2">빠른 손목 스냅에 비례해 끝선 늘리기</span>
                <input
                  type="checkbox"
                  checked={ext.inOutTaper.bySpeed}
                  onChange={(e) => commit({ inOutTaper: { bySpeed: e.target.checked } })}
                  className={cn("size-4 accent-accent", STUDIO_FOCUS_RING)}
                />
              </label>
              {ext.inOutTaper.useIn && (
                <label className="block">
                  <span className="flex justify-between text-xs text-fg-2">
                    <span>시작 감쇠 길이</span>
                    <span className="tabular-nums font-semibold text-fg">
                      {Math.round(ext.inOutTaper.inLength)}px
                    </span>
                  </span>
                  <input
                    type="range"
                    aria-label="시작 감쇠 길이"
                    min={4}
                    max={200}
                    step={2}
                    value={ext.inOutTaper.inLength}
                    onChange={(e) => commit({ inOutTaper: { inLength: Number(e.target.value) } })}
                    className={cn("min-h-11 w-full cursor-pointer accent-accent", STUDIO_FOCUS_RING)}
                  />
                </label>
              )}
              <label className="block">
                <span className="flex justify-between text-xs text-fg-2">
                  <span>빼기 기준 길이</span>
                  <span className="tabular-nums font-semibold text-fg">
                    {Math.round(ext.inOutTaper.outLength)}px
                  </span>
                </span>
                <input
                  type="range"
                  aria-label="빼기 기준 길이"
                  min={4}
                  max={200}
                  step={2}
                  value={ext.inOutTaper.outLength}
                  onChange={(e) => commit({ inOutTaper: { outLength: Number(e.target.value) } })}
                  className={cn("min-h-11 w-full cursor-pointer accent-accent", STUDIO_FOCUS_RING)}
                />
              </label>
            </div>
          )}
        </div>

        {/* 2. 예각 모서리 보정 · 제자리 고임 누적 · 화면 배율 동기화 */}
        <div className="grid grid-cols-1 gap-2">
          <div className="rounded-lg border border-line/70 bg-card/55 px-2.5 py-1.5">
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-2">
              <span>
                <span className="block font-semibold text-fg">모서리를 뾰족하게</span>
                <span className="block text-xs text-fg-3">꺾이는 옷주름과 머리카락 끝을 날카롭게 정리</span>
              </span>
              <input
                type="checkbox"
                aria-label="모서리를 뾰족하게"
                checked={ext.sharpCorner.enabled}
                onChange={(e) => commit({ sharpCorner: { enabled: e.target.checked } })}
                className={cn("size-4 shrink-0 accent-accent", STUDIO_FOCUS_RING)}
              />
            </label>
            {ext.sharpCorner.enabled && (
              <div className="mt-1 space-y-1.5 border-t border-line/50 pt-2">
                <label className="block">
                  <span className="flex justify-between text-xs text-fg-2">
                    <span>예각 판정 각도</span>
                    <span className="tabular-nums font-semibold text-fg">
                      {Math.round(ext.sharpCorner.minTurnAngleDeg)}°
                    </span>
                  </span>
                  <input
                    type="range"
                    aria-label="예각 판정 각도"
                    min={25}
                    max={165}
                    step={5}
                    value={ext.sharpCorner.minTurnAngleDeg}
                    onChange={(e) =>
                      commit({ sharpCorner: { minTurnAngleDeg: Number(e.target.value) } })
                    }
                    className={cn("min-h-11 w-full cursor-pointer accent-accent", STUDIO_FOCUS_RING)}
                  />
                </label>
                <label className="block">
                  <span className="flex justify-between text-xs text-fg-2">
                    <span>모서리 돌출 한계</span>
                    <span className="tabular-nums font-semibold text-fg">
                      {ext.sharpCorner.miterLimitRatio.toFixed(1)}×
                    </span>
                  </span>
                  <input
                    type="range"
                    aria-label="모서리 돌출 한계"
                    min={1.1}
                    max={4.5}
                    step={0.1}
                    value={ext.sharpCorner.miterLimitRatio}
                    onChange={(e) =>
                      commit({ sharpCorner: { miterLimitRatio: Number(e.target.value) } })
                    }
                    className={cn("min-h-11 w-full cursor-pointer accent-accent", STUDIO_FOCUS_RING)}
                  />
                </label>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-line/70 bg-card/55 px-2.5 py-1.5">
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-2">
              <span>
                <span className="block font-semibold text-fg">누르고 있을 때 농도 쌓기</span>
                <span className="block text-xs text-fg-3">펜을 멈춘 자리에 물감과 잉크가 서서히 고임</span>
              </span>
              <input
                type="checkbox"
                aria-label="누르고 있을 때 농도 쌓기"
                checked={ext.dwellBuildup.enabled}
                onChange={(e) => commit({ dwellBuildup: { enabled: e.target.checked } })}
                className={cn("size-4 shrink-0 accent-accent", STUDIO_FOCUS_RING)}
              />
            </label>
            {ext.dwellBuildup.enabled && (
              <div className="mt-1 space-y-1.5 border-t border-line/50 pt-2">
                <label className="block">
                  <span className="flex justify-between text-xs text-fg-2">
                    <span>고임 최대 농도</span>
                    <span className="tabular-nums font-semibold text-fg">
                      {Math.round(ext.dwellBuildup.maxBuildup * 100)}%
                    </span>
                  </span>
                  <input
                    type="range"
                    aria-label="고임 최대 농도"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={ext.dwellBuildup.maxBuildup}
                    onChange={(e) =>
                      commit({ dwellBuildup: { maxBuildup: Number(e.target.value) } })
                    }
                    className={cn("min-h-11 w-full cursor-pointer accent-accent", STUDIO_FOCUS_RING)}
                  />
                </label>
                <label className="block">
                  <span className="flex justify-between text-xs text-fg-2">
                    <span>고임 분사 간격</span>
                    <span className="tabular-nums font-semibold text-fg">
                      {Math.round(ext.dwellBuildup.intervalMs)}ms
                    </span>
                  </span>
                  <input
                    type="range"
                    aria-label="고임 분사 간격"
                    min={8}
                    max={100}
                    step={2}
                    value={ext.dwellBuildup.intervalMs}
                    onChange={(e) =>
                      commit({ dwellBuildup: { intervalMs: Number(e.target.value) } })
                    }
                    className={cn("min-h-11 w-full cursor-pointer accent-accent", STUDIO_FOCUS_RING)}
                  />
                </label>
              </div>
            )}
          </div>

          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg border border-line/70 bg-card/55 px-2.5 py-1.5">
            <span>
              <span className="block font-semibold text-fg">화면 확대 배율에 브러시 크기 고정</span>
              <span className="block text-xs text-fg-3">확대·축소해도 화면에 보이는 선 두께를 일정하게 유지</span>
            </span>
            <input
              type="checkbox"
              aria-label="화면 확대 배율에 브러시 크기 고정"
              checked={ext.strokeColorAndScale.syncSizeWithViewScale}
              onChange={(e) =>
                commit({ strokeColorAndScale: { syncSizeWithViewScale: e.target.checked } })
              }
              className={cn("size-4 shrink-0 accent-accent", STUDIO_FOCUS_RING)}
            />
          </label>
        </div>

        {/* 3. 괘선(파선/점선/물결선) 및 장식 리본 모티프 */}
        <div className="space-y-2 rounded-lg border border-line/70 bg-card/55 p-2.5">
          <label className="flex min-h-11 items-center justify-between gap-2">
            <span className="font-semibold text-fg">괘선 모양</span>
            <select
              aria-label="괘선 모양"
              value={ext.ruledLine.mode}
              onChange={(e) => commit({ ruledLine: { mode: e.target.value as StudioRuledLineMode } })}
              className={cn("min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs text-fg", STUDIO_FOCUS_RING)}
            >
              {RULED_LINE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-h-11 items-center justify-between gap-2">
            <span className="font-semibold text-fg">장식 패턴 모티프</span>
            <select
              aria-label="장식 패턴 모티프"
              value={ext.patternBrush.motif}
              onChange={(e) =>
                commit({ patternBrush: { motif: e.target.value as StudioBuiltInPatternMotifId } })
              }
              className={cn("min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs text-fg", STUDIO_FOCUS_RING)}
            >
              {(Object.keys(STUDIO_PATTERN_MOTIF_LABELS) as StudioBuiltInPatternMotifId[]).map(
                (motifId) => (
                  <option key={motifId} value={motifId}>
                    {STUDIO_PATTERN_MOTIF_LABELS[motifId]}
                  </option>
                ),
              )}
            </select>
          </label>

          {ext.patternBrush.motif !== "none" && (
            <div className="space-y-2 border-t border-line/50 pt-2">
              <label className="flex min-h-11 cursor-pointer items-center justify-between gap-2">
                <span className="text-fg-2">리본처럼 선을 따라 연속 연결</span>
                <input
                  type="checkbox"
                  aria-label="리본처럼 선을 따라 연속 연결"
                  checked={ext.patternBrush.ribbon}
                  onChange={(e) => commit({ patternBrush: { ribbon: e.target.checked } })}
                  className={cn("size-4 accent-accent", STUDIO_FOCUS_RING)}
                />
              </label>
              <label className="flex min-h-11 items-center justify-between gap-2">
                <span className="text-fg-2">패턴 반복 순서</span>
                <select
                  aria-label="패턴 반복 순서"
                  value={ext.patternBrush.orderMode}
                  onChange={(e) =>
                    commit({ patternBrush: { orderMode: e.target.value as StudioPatternOrderMode } })
                  }
                  className={cn("min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs text-fg", STUDIO_FOCUS_RING)}
                >
                  {PATTERN_ORDER_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>

        {/* 4. 보조색 혼합 및 획별 색 변화 */}
        <div className="space-y-2 rounded-lg border border-line/70 bg-card/55 p-2.5">
          <label className="flex min-h-11 items-center justify-between gap-2">
            <span className="font-semibold text-fg">보조색 섞기 기준</span>
            <select
              aria-label="보조색 섞기 기준"
              value={ext.strokeColorAndScale.subColorMixSource}
              onChange={(e) =>
                commit({
                  strokeColorAndScale: {
                    subColorMixSource: e.target.value as StudioSubColorMixSource,
                  },
                })
              }
              className={cn("min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs text-fg", STUDIO_FOCUS_RING)}
            >
              {SUBCOLOR_SOURCES.map((src) => (
                <option key={src.id} value={src.id}>
                  {src.label}
                </option>
              ))}
            </select>
          </label>

          {ext.strokeColorAndScale.subColorMixSource !== "off" && (
            <div className="space-y-1.5 border-t border-line/50 pt-2">
              <label className="block">
                <span className="flex justify-between text-xs text-fg-2">
                  <span>보조색 최대 혼합량</span>
                  <span className="tabular-nums font-semibold text-fg">
                    {Math.round(ext.strokeColorAndScale.subColorMaxMix * 100)}%
                  </span>
                </span>
                <input
                  type="range"
                  aria-label="보조색 최대 혼합량"
                  min={0}
                  max={1}
                  step={0.05}
                  value={ext.strokeColorAndScale.subColorMaxMix}
                  onChange={(e) =>
                    commit({
                      strokeColorAndScale: { subColorMaxMix: Number(e.target.value) },
                    })
                  }
                  className={cn("min-h-11 w-full cursor-pointer accent-accent", STUDIO_FOCUS_RING)}
                />
              </label>
              <label className="flex min-h-11 cursor-pointer items-center justify-between gap-2">
                <span className="text-fg-2">약한 입력일수록 보조색 더 많이 섞기</span>
                <input
                  type="checkbox"
                  aria-label="보조색 혼합 방향 반전"
                  checked={ext.strokeColorAndScale.subColorInvert}
                  onChange={(e) =>
                    commit({
                      strokeColorAndScale: { subColorInvert: e.target.checked },
                    })
                  }
                  className={cn("size-4 accent-accent", STUDIO_FOCUS_RING)}
                />
              </label>
            </div>
          )}

          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-2">
            <span className="text-fg-2">획마다 색조·명도 미세 변주</span>
            <input
              type="checkbox"
              aria-label="획마다 색조·명도 미세 변주"
              checked={ext.strokeColorAndScale.perStrokeColorJitter}
              onChange={(e) =>
                commit({
                  strokeColorAndScale: {
                    perStrokeColorJitter: e.target.checked,
                    strokeHueJitterDeg: e.target.checked
                      ? Math.max(12, ext.strokeColorAndScale.strokeHueJitterDeg)
                      : 0,
                  },
                })
              }
              className={cn("size-4 accent-accent", STUDIO_FOCUS_RING)}
            />
          </label>
        </div>
      </div>
    </details>
  );
}
