/**
 * StudioAiLatentStoryboardPanel 전용 하위 컴포넌트 (Calm Atelier 시맨틱 토큰 전용 · 원시 색상 0건).
 */

import { AlertTriangle } from "lucide-react";
import type { ReactElement } from "react";

import type { ContiCutSpec } from "./script-to-conti-parser";

export function RangeSliderRow({
  id,
  testId,
  label,
  valueText,
  min,
  max,
  step,
  value,
  onChange,
}: {
  readonly id: string;
  readonly testId: string;
  readonly label: string;
  readonly valueText: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly onChange: (next: number) => void;
}): ReactElement {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex justify-between text-xs text-fg-2">
        <span>{label}</span>
        <span className="font-semibold text-fg tabular-nums">{valueText}</span>
      </label>
      <input
        id={id}
        data-testid={testId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-h-11 w-full cursor-pointer accent-accent"
      />
    </div>
  );
}

export function MetricCard({
  label,
  value,
  testId,
  toneClass = "text-fg",
}: {
  readonly label: string;
  readonly value: string;
  readonly testId?: string;
  readonly toneClass?: string;
}): ReactElement {
  return (
    <div className="rounded-md border border-line bg-raised p-2.5 text-xs">
      <div className="text-fg-3">{label}</div>
      <div className={`mt-0.5 font-semibold tabular-nums ${toneClass}`} data-testid={testId}>
        {value}
      </div>
    </div>
  );
}

export function ContiCutCard({
  cut,
  isLast,
  pick,
}: {
  readonly cut: ContiCutSpec;
  readonly isLast: boolean;
  readonly pick: (ko: string, en: string) => string;
}): ReactElement {
  const shotTone =
    cut.shotSize === "ECU"
      ? "border-accent bg-accent-soft text-accent"
      : cut.shotSize === "Bird's-eye" || cut.shotSize === "WS"
        ? "border-cool/40 bg-cool/15 text-cool"
        : "border-line-strong bg-raised text-fg";

  return (
    <div className="space-y-2" data-testid={`conti-cut-card-${cut.cutNumber}`}>
      <article className={`rounded-lg border p-3 ${cut.hasOvercrowding ? "border-warn/40 bg-card" : "border-line bg-card"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-fg tabular-nums">{pick(`컷 ${cut.cutNumber}`, `Cut ${cut.cutNumber}`)}</span>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-semibold ${shotTone}`}>
              {cut.shotSize} · {cut.shotLabelKo}
            </span>
            <span className="rounded border border-line bg-raised px-1.5 py-0.5 text-fg-2 tabular-nums">
              {cut.aspectRatioLabel} ({cut.widthPx}×{cut.heightPx}px)
            </span>
          </div>
          <div className="flex items-center gap-2 text-fg-2 tabular-nums">
            <span>{pick(`스크롤 ${cut.estimatedScrollSec}초`, `${cut.estimatedScrollSec}s scroll`)}</span>
            {cut.hasOvercrowding && (
              <span className="inline-flex items-center gap-1 rounded-full border border-warn/40 bg-warn/15 px-2 py-0.5 font-semibold text-warn">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {pick("텍스트 과밀", "Overcrowded")}
              </span>
            )}
          </div>
        </div>

        <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-5">
          <div
            className="relative min-h-28 overflow-hidden rounded-md border border-line bg-canvas p-2 sm:col-span-2"
            aria-label={pick(`${cut.cutNumber}컷 말풍선 순서·좌표 제안 목록`, `Cut ${cut.cutNumber} balloon order and coordinate suggestions`)}
          >
            <div className="text-[11px] font-medium text-fg-3">{cut.sceneTitle}</div>
            {cut.sfxList.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {cut.sfxList.map((sfx, sIdx) => (
                  <span key={`${cut.cutId}-sfx-${sIdx}`} className="rounded border border-accent bg-accent-soft px-1.5 py-0.5 text-[11px] font-bold text-accent">
                    SFX: {sfx.text}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2 space-y-1.5">
              {cut.balloons.length === 0 ? (
                <div className="rounded border border-dashed border-line px-2 py-2 text-[11px] text-fg-3">
                  {pick("무대사 연출 컷 (시선 호흡)", "Silent visual beat")}
                </div>
              ) : (
                cut.balloons.map((b) => (
                  <div
                    key={b.id}
                    className={`rounded-md border px-2 py-1 text-[11px] ${
                      b.isOvercrowded
                        ? "border-warn/40 bg-warn/15 text-fg"
                        : b.style === "thought"
                          ? "border-cool/40 bg-cool/15 text-fg"
                          : "border-line-strong bg-raised text-fg"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 text-[10px] text-fg-2 tabular-nums">
                      <span className="font-semibold text-accent">
                        Z{b.zOrder} · {b.speaker ?? (b.style === "thought" ? pick("속마음", "Thought") : pick("대사", "Speech"))}
                      </span>
                      <span>X{b.xPct}% · Y{b.yPct}%</span>
                    </div>
                    <p className="mt-0.5 leading-snug text-fg">{b.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-2 text-xs sm:col-span-3">
            <p className="text-fg-2">{cut.shotReasonKo}</p>
            {cut.stageDirections.length > 0 && (
              <div className="rounded-md border border-line bg-raised p-2 text-fg-2">
                <div className="text-[11px] font-semibold text-fg">{pick("지문 · 연출 노트", "Stage Direction")}</div>
                <p className="mt-0.5 leading-relaxed">{cut.stageDirections.join(" ")}</p>
              </div>
            )}
            {cut.balloons.some((b) => b.isOvercrowded) && (
              <div className="rounded-md border border-warn/40 bg-warn/15 p-2 text-fg">
                <div className="font-semibold text-warn">{pick("모바일 분할 말풍선 제안", "Mobile Split Suggestion")}</div>
                {cut.balloons.filter((b) => b.isOvercrowded).map((b) => (
                  <div key={`${b.id}-split`} className="mt-1 text-fg-2">
                    Z{b.zOrder}: {b.suggestedSplits.join(" / ")}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </article>

      <div className="flex items-center justify-center gap-2 text-[11px] text-fg-3 tabular-nums">
        <span className="h-px flex-1 bg-line" aria-hidden="true" />
        <span>
          {isLast ? pick("엔딩 여백", "Ending Gutter") : pick("세로 거터", "Vertical Gutter")} {cut.gutterAfterPx}px · {cut.gutterMoodKo}
        </span>
        <span className="h-px flex-1 bg-line" aria-hidden="true" />
      </div>
    </div>
  );
}
