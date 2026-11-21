import { GitBranch, Plus, Spline, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import type { BubbleTailDirection, BubbleTailSide, BubbleTailSpec } from "./studio-bubble-path";
import {
  buildSpeechBubbleTailBooleanUnion,
  speechBubbleBooleanPolygonsToSvgPath,
} from "./studio-korean-bubble-boolean-typesetting";

import { useT } from "@/shared/lib/i18n";

export interface StudioBubblePrimaryTailPatch {
  tail?: "left" | "right" | "none";
  tailDirection?: BubbleTailDirection;
  tailXRatio?: number;
  tailHeight?: number;
  tailBase?: number;
  tailBend?: number;
  tailAnchorId?: undefined;
  tailAnchorPoint?: undefined;
}

export interface StudioBubbleTailControlsProps {
  tail: "left" | "right" | "none";
  direction: BubbleTailDirection;
  ratio: number;
  length: number;
  base: number;
  bend: number;
  /** 실제 선택된 말풍선 요소 너비(px). 없으면 기본 미리보기 크기(220px)를 사용한다. */
  bubbleWidth?: number;
  /** 실제 선택된 말풍선 요소 높이(px). 없으면 기본 미리보기 크기(120px)를 사용한다. */
  bubbleHeight?: number;
  extraTails: readonly BubbleTailSpec[];
  anchored: boolean;
  allowMultiple?: boolean;
  onPatchPrimary: (patch: StudioBubblePrimaryTailPatch) => void;
  onChangeExtraTails: (tails: readonly BubbleTailSpec[]) => void;
  /** 계산된 불리언 합집합 단일 외곽선 SVG 경로를 상위 문서/요소에 반영한다. */
  onApplyBooleanOutlinePath?: (svgPath: string) => void;
}

const SEGMENT_CLASS =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-lg px-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function segmentClass(active: boolean): string {
  return `${SEGMENT_CLASS} ${
    active ? "bg-accent text-on-accent shadow-sm" : "text-fg-2 hover:bg-raised hover:text-fg"
  }`;
}

function bendLabel(value: number, t: (key: string) => string): string {
  const percent = Math.round(Math.abs(value) * 100);
  if (percent < 5) return t("studio.bubbleTail.bendLabel.straight");
  return `${value < 0 ? t("studio.bubbleTail.bendDirection.left") : t("studio.bubbleTail.bendDirection.right")} ${percent}%`;
}

function RangeRow({
  label,
  value,
  min,
  max,
  step,
  valueLabel,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  valueLabel: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className={`block ${disabled ? "opacity-45" : ""}`}>
      <span className="flex items-center justify-between gap-3 text-xs text-fg-2">
        <span>{label}</span>
        <output className="min-w-16 text-right font-display text-[0.68rem] tabular-nums text-fg-3">
          {valueLabel}
        </output>
      </span>
      <span className="flex min-h-11 items-center">
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          className="h-2 w-full cursor-pointer accent-accent disabled:cursor-not-allowed"
        />
      </span>
    </label>
  );
}

function updateTail(
  tails: readonly BubbleTailSpec[],
  index: number,
  patch: Partial<BubbleTailSpec>
): BubbleTailSpec[] {
  return tails.map((tail, tailIndex) => (tailIndex === index ? { ...tail, ...patch } : { ...tail }));
}

export function StudioBubbleTailControls({
  tail,
  direction,
  ratio,
  length,
  base,
  bend,
  bubbleWidth,
  bubbleHeight,
  extraTails,
  anchored,
  allowMultiple = true,
  onPatchPrimary,
  onChangeExtraTails,
  onApplyBooleanOutlinePath,
}: StudioBubbleTailControlsProps) {
  const t = useT();
  const safeBubbleW = Math.max(80, Math.round(bubbleWidth && Number.isFinite(bubbleWidth) ? bubbleWidth : 220));
  const safeBubbleH = Math.max(56, Math.round(bubbleHeight && Number.isFinite(bubbleHeight) ? bubbleHeight : 120));
  const [unionPreview, setUnionPreview] = useState<{
    readonly pathD: string;
    readonly viewBox: string;
    readonly polygonCount: number;
    readonly applied: boolean;
  } | null>(null);

  useEffect(() => {
    if (tail === "none") {
      setUnionPreview(null);
      return;
    }
    let cancelled = false;
    void buildSpeechBubbleTailBooleanUnion({
      x: 12,
      y: 12,
      width: safeBubbleW,
      height: safeBubbleH,
      tailSide: tail,
      tailXRatio: ratio,
      tailHeight: length,
      tailBase: base,
      tailBend: bend * 24,
    }).then((result) => {
      if (cancelled || !result.ok) return;
      const pathD = speechBubbleBooleanPolygonsToSvgPath(result.polygons);
      if (!pathD) return;
      const pad = 10;
      const vx = Math.floor(result.bounds.x - pad);
      const vy = Math.floor(result.bounds.y - pad);
      const vw = Math.max(40, Math.ceil(result.bounds.width + pad * 2));
      const vh = Math.max(40, Math.ceil(result.bounds.height + pad * 2));
      setUnionPreview({
        pathD,
        viewBox: `${vx} ${vy} ${vw} ${vh}`,
        polygonCount: result.polygons.length,
        applied: false,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [tail, safeBubbleW, safeBubbleH, ratio, length, base, bend]);

  const applySeamlessBooleanTail = () => {
    // 말풍선 본체 폭 대비 이음새 겹침을 방지하는 안전 밑동/비율로 정렬하고 단일 외곽선 경로를 전달한다.
    const maxSafeBase = Math.max(10, Math.round(safeBubbleW * 0.45));
    const safeRatio = Math.max(0.15, Math.min(0.85, ratio));
    const safeBase = Math.min(base, maxSafeBase);
    onPatchPrimary({
      tail,
      tailXRatio: safeRatio,
      tailBase: safeBase,
    });
    if (unionPreview?.pathD) {
      onApplyBooleanOutlinePath?.(unionPreview.pathD);
      setUnionPreview((prev) => (prev ? { ...prev, applied: true } : prev));
    }
  };
  const visible = tail !== "none";

  const extraDirectionMap: Record<BubbleTailDirection, string> = {
    top: t("studio.bubbleTail.directionLabelTop"),
    bottom: t("studio.bubbleTail.directionLabelBottom"),
    left: t("studio.bubbleTail.directionLabelLeft"),
    right: t("studio.bubbleTail.directionLabelRight"),
  };

  const extraSideMap: Record<BubbleTailSide, string> = {
    left: t("studio.bubbleTail.endAngleLeft"),
    center: t("studio.bubbleTail.endAngleCenter"),
    right: t("studio.bubbleTail.endAngleRight"),
  };

  return (
    <section aria-labelledby="bubble-tail-heading" className="mt-3 space-y-3 border-t border-line/50 pt-3">
      <div className="flex items-start gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <Spline size={15} aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 id="bubble-tail-heading" className="text-sm font-bold text-fg">{t("studio.bubbleTail.title")}</h3>
          <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">
            {t("studio.bubbleTail.description")}
          </p>
        </div>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-xs font-semibold text-fg-2">{t("studio.bubbleTail.speakerDirection")}</legend>
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-card p-1">
          {([
            { value: "left", label: t("studio.bubbleTail.directionLeft") },
            { value: "right", label: t("studio.bubbleTail.directionRight") },
            { value: "none", label: t("studio.bubbleTail.directionNone") },
          ] as const).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={tail === option.value}
              onClick={() =>
                onPatchPrimary({
                  tail: option.value,
                  ...(option.value === "none"
                    ? { tailAnchorId: undefined, tailAnchorPoint: undefined }
                    : {}),
                })
              }
              className={segmentClass(tail === option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      {visible ? (
        <>
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-fg-2">{t("studio.bubbleTail.attachmentSurface")}</legend>
            <div className="grid grid-cols-4 gap-1 rounded-xl border border-line bg-card p-1">
              {([
                { value: "top", label: t("studio.bubbleTail.surfaceLabelTop") },
                { value: "bottom", label: t("studio.bubbleTail.surfaceLabelBottom") },
                { value: "left", label: t("studio.bubbleTail.surfaceLabelLeft") },
                { value: "right", label: t("studio.bubbleTail.surfaceLabelRight") },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={direction === option.value}
                  disabled={anchored}
                  onClick={() => onPatchPrimary({ tailDirection: option.value })}
                  className={`${segmentClass(direction === option.value)} disabled:cursor-not-allowed disabled:opacity-45`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          {anchored ? (
            <p className="rounded-lg border border-cool/30 bg-cool/10 px-3 py-2 text-[0.68rem] leading-relaxed text-cool">
              {t("studio.bubbleTail.autoAttachHint")}
            </p>
          ) : null}

          <div className="space-y-1 rounded-xl border border-line bg-card/35 p-3">
            <RangeRow
              label={
                direction === "left" || direction === "right"
                  ? t("studio.bubbleTail.attachmentPositionVertical")
                  : t("studio.bubbleTail.attachmentPositionHorizontal")
              }
              value={ratio}
              min={0.08}
              max={0.92}
              step={0.01}
              valueLabel={`${Math.round(ratio * 100)}%`}
              disabled={anchored}
              onChange={(value) => onPatchPrimary({ tailXRatio: value })}
            />
            <RangeRow
              label={t("studio.bubbleTail.length")}
              value={length}
              min={8}
              max={120}
              step={1}
              valueLabel={`${Math.round(length)}px`}
              disabled={anchored}
              onChange={(value) => onPatchPrimary({ tailHeight: value })}
            />
            <RangeRow
              label={t("studio.bubbleTail.baseWidth")}
              value={base}
              min={6}
              max={120}
              step={1}
              valueLabel={`${Math.round(base)}px`}
              onChange={(value) => onPatchPrimary({ tailBase: value })}
            />
            <RangeRow
              label={t("studio.bubbleTail.bend")}
              value={bend}
              min={-1}
              max={1}
              step={0.05}
              valueLabel={bendLabel(bend, t)}
              onChange={(value) => onPatchPrimary({ tailBend: value })}
            />
          </div>

          {allowMultiple ? (
            <div className="rounded-xl border border-line bg-card/25 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-bold text-fg">
                    <GitBranch size={13} aria-hidden /> {t("studio.bubbleTail.multiTailTitle")}
                  </p>
                  <p className="mt-0.5 text-[0.65rem] text-fg-3">{t("studio.bubbleTail.multiTailHint")}</p>
                </div>
                <button
                  type="button"
                  disabled={extraTails.length >= 2}
                  onClick={() =>
                    onChangeExtraTails([
                      ...extraTails,
                      {
                        direction: "bottom",
                        ratio: extraTails.length === 0 ? 0.7 : 0.5,
                        length: 26,
                        base: 18,
                        side: "center",
                        bend: 0,
                      },
                    ])
                  }
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus size={14} aria-hidden /> {t("studio.bubbleTail.multiTailAdd")}
                </button>
              </div>

            {extraTails.length === 0 ? (
              <p className="mt-2 rounded-lg border border-dashed border-line px-3 py-3 text-center text-[0.68rem] text-fg-3">
                {t("studio.bubbleTail.multiTailPlaceholder")}
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {extraTails.map((extraTail, index) => (
                  <details key={index} className="group rounded-xl border border-line bg-panel/70">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-xs font-semibold text-fg marker:hidden">
                      <span className="grid size-6 place-items-center rounded-full bg-accent-soft font-display text-[0.65rem] text-accent">
                        {index + 2}
                      </span>
                      <span className="min-w-0 flex-1">
                        {t("studio.bubbleTail.multiTailIndex")} {index + 1}
                      </span>
                      <span className="text-[0.65rem] font-normal text-fg-3 group-open:hidden">
                        {t("studio.bubbleTail.multiTailExpand")}
                      </span>
                    </summary>
                    <div className="space-y-2 border-t border-line px-3 py-3">
                      <div className="flex min-h-11 items-center justify-between gap-3">
                        <p className="text-[0.68rem] leading-relaxed text-fg-3">
                          {t("studio.bubbleTail.multiTailDescription")}
                        </p>
                        <button
                          type="button"
                          aria-label={`${t("studio.bubbleTail.multiTailRemoveLabel")} ${index + 1}`}
                          onClick={() =>
                            onChangeExtraTails(extraTails.filter((_, tailIndex) => tailIndex !== index))
                          }
                          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-fg-3 hover:bg-bad/10 hover:text-bad"
                        >
                          <Trash2 size={14} aria-hidden /> {t("studio.bubbleTail.multiTailRemove")}
                        </button>
                      </div>
                      <fieldset>
                        <legend className="mb-1 text-[0.68rem] font-semibold text-fg-2">{t("studio.bubbleTail.multiTailAttach")}</legend>
                        <div className="grid grid-cols-4 gap-1 rounded-lg bg-card p-1">
                          {(["top", "bottom", "left", "right"] as const).map((value) => (
                            <button
                              key={value}
                              type="button"
                              aria-pressed={extraTail.direction === value}
                              onClick={() => onChangeExtraTails(updateTail(extraTails, index, { direction: value }))}
                              className={segmentClass(extraTail.direction === value)}
                            >
                              {extraDirectionMap[value]}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                      <fieldset>
                        <legend className="mb-1 text-[0.68rem] font-semibold text-fg-2">{t("studio.bubbleTail.endAngle")}</legend>
                        <div className="grid grid-cols-3 gap-1 rounded-lg bg-card p-1">
                          {(["left", "center", "right"] as const).map((value: BubbleTailSide) => (
                            <button
                              key={value}
                              type="button"
                              aria-pressed={extraTail.side === value}
                              onClick={() => onChangeExtraTails(updateTail(extraTails, index, { side: value }))}
                              className={segmentClass(extraTail.side === value)}
                            >
                              {extraSideMap[value]}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                      <RangeRow
                        label={t("studio.bubbleTail.attachmentPosition")}
                        value={extraTail.ratio}
                        min={0.08}
                        max={0.92}
                        step={0.01}
                        valueLabel={`${Math.round(extraTail.ratio * 100)}%`}
                        onChange={(value) => onChangeExtraTails(updateTail(extraTails, index, { ratio: value }))}
                      />
                      <RangeRow
                        label={t("studio.bubbleTail.length")}
                        value={extraTail.length}
                        min={4}
                        max={160}
                        step={1}
                        valueLabel={`${Math.round(extraTail.length)}px`}
                        onChange={(value) => onChangeExtraTails(updateTail(extraTails, index, { length: value }))}
                      />
                      <RangeRow
                        label={t("studio.bubbleTail.baseWidth")}
                        value={extraTail.base}
                        min={4}
                        max={120}
                        step={1}
                        valueLabel={`${Math.round(extraTail.base)}px`}
                        onChange={(value) => onChangeExtraTails(updateTail(extraTails, index, { base: value }))}
                      />
                      <RangeRow
                        label={t("studio.bubbleTail.bend")}
                        value={extraTail.bend ?? 0}
                        min={-1}
                        max={1}
                        step={0.05}
                        valueLabel={bendLabel(extraTail.bend ?? 0, t)}
                        onChange={(value) => onChangeExtraTails(updateTail(extraTails, index, { bend: value }))}
                      />
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
          ) : (
            <p className="rounded-lg border border-line bg-card/35 px-3 py-2 text-[0.68rem] leading-relaxed text-fg-3">
              {t("studio.bubbleTail.continueSpeechSingleTail")}
            </p>
          )}
          <div className="space-y-2 rounded-xl border border-line bg-card/45 p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-fg">단일 외곽선 합집합 미리보기</p>
                <p className="text-[0.65rem] text-fg-3">
                  본체({safeBubbleW}×{safeBubbleH}px)와 꼬리 이음새 선을 실시간 합집합으로 합칩니다
                </p>
              </div>
              <button
                type="button"
                data-studio-bubble-tail-boolean-apply="true"
                disabled={!unionPreview}
                onClick={applySeamlessBooleanTail}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-accent/45 bg-accent-soft px-3 text-xs font-semibold text-accent transition-[transform,background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-accent hover:text-on-accent active:scale-[0.97] disabled:opacity-45 motion-reduce:transition-none motion-reduce:transform-none"
              >
                <Spline size={13} aria-hidden="true" />
                {unionPreview?.applied ? "단일 외곽선 정렬됨" : "단일 외곽선 정렬 적용"}
              </button>
            </div>
            {unionPreview ? (
              <div className="flex items-center gap-3 rounded-lg border border-line/70 bg-canvas/85 p-2">
                <svg
                  data-studio-bubble-boolean-svg="true"
                  viewBox={unionPreview.viewBox}
                  aria-label="말풍선 본체와 꼬리 단일 외곽선 합집합 미리보기"
                  className="h-16 w-28 shrink-0"
                >
                  <path
                    d={unionPreview.pathD}
                    className="fill-card stroke-accent"
                    strokeWidth={3}
                    strokeLinejoin="round"
                  />
                </svg>
                <p role="status" className="text-[0.68rem] leading-relaxed text-fg-2">
                  외곽선 {unionPreview.polygonCount}개로 깔끔하게 결합됨
                  {unionPreview.applied ? " · 선택 말풍선 꼬리 비율을 안전 범위로 맞췄습니다." : ""}
                </p>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
