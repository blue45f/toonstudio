/**
 * CSP 웹툰 세로 스크롤 여백 편집 (`Edit > Shift drawing`: 여백 추가 / 여백 삭제) 한국어 UI 섹션.
 *
 * 점진적 공개 `<details>` 안에 구성되어 초기 노출 컨트롤 예산을 지키며,
 * `onApplyShiftPlan` 또는 `onCanvasHeightChange`가 연결되어 있을 때 실제 캔버스 높이와 요소를 갱신한다.
 * 편집 콜백이 전혀 없으면 조용한 무동작(no-op) 대신 이유 안내와 함께 실행 버튼을 비활성화한다.
 *
 * Clean-room implementation based on Ghidra/REA behavioral specification:
 * - evidence_id: ev_af42bc7907f5e98eacfcb3b02c9c7f14cbf6c06dd0234d34033ff0059556946b
 * - evidence_id: ev_0c6a677d38f821a7c782b943662be657510c27ee397e744fa128f63a1ca2d1fa
 */

import { ArrowDownWideNarrow, ArrowUpNarrowWide, ScissorsLineDashed } from "lucide-react";
import { useMemo, useState } from "react";

import {
  deleteVerticalDrawingSpace,
  insertVerticalDrawingSpace,
  WEBTOON_SHIFT_DRAWING_PRESETS,
} from "./studio-shift-drawing";

import type {
  ShiftableDrawingElement,
  ShiftDrawingOperation,
  ShiftDrawingPlanResult,
  StraddlingElementHandlingMode,
} from "./studio-shift-drawing";

import { cn } from "@/shared/lib/utils";

export interface StudioShiftDrawingSectionProps {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly elements: readonly ShiftableDrawingElement[];
  readonly initialAnchorY?: number;
  readonly disabled?: boolean;
  readonly onApplyShiftPlan?: (plan: ShiftDrawingPlanResult) => void;
  readonly onCanvasHeightChange?: (nextCanvasHeight: number) => void;
  readonly className?: string;
}

const TRANSITION_CLASS =
  "transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none";

const BUTTON_BASE = cn(
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold [word-break:keep-all] disabled:cursor-not-allowed disabled:opacity-45",
  TRANSITION_CLASS,
);

const NO_MUTATION_REASON = "적용할 페이지 편집 연결이 없어 여백 변경을 실행할 수 없어요.";

export function StudioShiftDrawingSection({
  canvasWidth,
  canvasHeight,
  elements,
  initialAnchorY,
  disabled = false,
  onApplyShiftPlan,
  onCanvasHeightChange,
  className,
}: StudioShiftDrawingSectionProps) {
  const safeH = Math.max(64, Math.round(canvasHeight));
  const [operation, setOperation] = useState<ShiftDrawingOperation>("insertion");
  const [anchorY, setAnchorY] = useState<number>(() =>
    Math.min(safeH, Math.max(0, Math.round(initialAnchorY ?? safeH * 0.5))),
  );
  const [amountPx, setAmountPx] = useState<number>(300);
  const [straddlingMode, setStraddlingMode] =
    useState<StraddlingElementHandlingMode>("stretch");

  const hasMutationTarget = Boolean(onApplyShiftPlan || onCanvasHeightChange);

  const previewPlan = useMemo(() => {
    const input = {
      canvasWidth,
      canvasHeight: safeH,
      anchorY,
      amountPx,
      elements,
      straddlingMode,
    };
    return operation === "insertion"
      ? insertVerticalDrawingSpace(input)
      : deleteVerticalDrawingSpace(input);
  }, [anchorY, amountPx, canvasWidth, elements, operation, safeH, straddlingMode]);

  return (
    <details
      data-studio-shift-drawing="true"
      className={cn(
        "mt-2 rounded-xl border border-line bg-panel/90 p-2.5 text-xs text-fg [word-break:keep-all]",
        className,
      )}
    >
      <summary
        className={cn(
          "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md px-2 font-semibold text-fg hover:bg-raised/60",
          TRANSITION_CLASS,
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          <ScissorsLineDashed size={15} aria-hidden />
          <span>세로 스크롤 여백 벌리기·좁히기</span>
        </span>
        <span className="rounded border border-line bg-card px-2 py-0.5 text-xs tabular-nums text-fg-2">
          {previewPlan.previousCanvasHeight}px → {previewPlan.nextCanvasHeight}px
        </span>
      </summary>

      <div className="mt-2.5 flex flex-col gap-3 px-1">
        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="여백 편집 방식">
          <button
            type="button"
            disabled={disabled}
            aria-pressed={operation === "insertion"}
            onClick={() => setOperation("insertion")}
            className={cn(
              BUTTON_BASE,
              operation === "insertion"
                ? "border-accent bg-accent-soft/65 text-fg"
                : "border-line bg-card text-fg-2 hover:bg-raised",
            )}
          >
            <ArrowDownWideNarrow size={14} aria-hidden />
            여백 추가 (밀기)
          </button>
          <button
            type="button"
            disabled={disabled}
            aria-pressed={operation === "deletion"}
            onClick={() => setOperation("deletion")}
            className={cn(
              BUTTON_BASE,
              operation === "deletion"
                ? "border-accent bg-accent-soft/65 text-fg"
                : "border-line bg-card text-fg-2 hover:bg-raised",
            )}
          >
            <ArrowUpNarrowWide size={14} aria-hidden />
            여백 삭제 (당기기)
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="웹툰 연출 호흡 프리셋">
          {WEBTOON_SHIFT_DRAWING_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              onClick={() => {
                setOperation(preset.operation);
                setAmountPx(preset.amountPx);
              }}
              className={cn(
                BUTTON_BASE,
                "border-line bg-card text-fg-2 hover:bg-raised tabular-nums",
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-fg-2">
            <span>기준선 세로 위치 (px)</span>
            <input
              type="number"
              aria-label="기준선 Y 좌표"
              min={0}
              max={safeH}
              disabled={disabled}
              value={anchorY}
              onChange={(e) => setAnchorY(Math.max(0, Number(e.target.value)))}
              className="min-h-11 rounded border border-line bg-panel px-2 text-xs font-medium tabular-nums text-fg"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-2">
            <span>여백 변화량 (px)</span>
            <input
              type="number"
              aria-label="여백 변화량"
              min={0}
              max={10000}
              step={20}
              disabled={disabled}
              value={amountPx}
              onChange={(e) => setAmountPx(Math.max(0, Number(e.target.value)))}
              className="min-h-11 rounded border border-line bg-panel px-2 text-xs font-medium tabular-nums text-fg"
            />
          </label>
        </div>

        <details className="rounded-lg border border-line/75 bg-card/45 p-2">
          <summary
            className={cn(
              "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded px-2 font-semibold text-fg-2 hover:bg-raised/60",
              TRANSITION_CLASS,
            )}
          >
            <span>걸침 요소 처리 및 영향 미리보기</span>
            <span className="tabular-nums text-xs text-fg-3">
              이동 {previewPlan.shiftedElementCount}개 · 걸침 {previewPlan.straddlingSplits.length}개
            </span>
          </summary>

          <div className="mt-2 flex flex-col gap-2 px-1">
            <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="기준선 걸침 요소 처리">
              <button
                type="button"
                disabled={disabled}
                aria-pressed={straddlingMode === "stretch"}
                onClick={() => setStraddlingMode("stretch")}
                className={cn(
                  BUTTON_BASE,
                  straddlingMode === "stretch"
                    ? "border-cool/60 bg-cool/15 text-cool"
                    : "border-line bg-card text-fg-2 hover:bg-raised",
                )}
              >
                높이 신축 유지
              </button>
              <button
                type="button"
                disabled={disabled}
                aria-pressed={straddlingMode === "split"}
                onClick={() => setStraddlingMode("split")}
                className={cn(
                  BUTTON_BASE,
                  straddlingMode === "split"
                    ? "border-cool/60 bg-cool/15 text-cool"
                    : "border-line bg-card text-fg-2 hover:bg-raised",
                )}
              >
                상·하단 요소 분할
              </button>
            </div>

            {previewPlan.straddlingSplits.length > 0 ? (
              <ul className="flex flex-col gap-1 rounded border border-line/60 bg-panel/70 p-2 text-xs text-fg-2">
                {previewPlan.straddlingSplits.map((split) => (
                  <li key={split.elementId} className="flex justify-between gap-2 tabular-nums">
                    <span className="truncate font-medium">
                      {split.elementName ?? split.elementId}
                    </span>
                    <span className="shrink-0 text-fg-3">
                      {split.fullyDeleted
                        ? "구간 내 삭제"
                        : `${Math.round(split.originalTopY)}~${Math.round(split.originalBottomY)}px`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-fg-3">
                현재 기준선에 걸친 레이어나 컷이 없어 깔끔하게 이동됩니다.
              </p>
            )}
          </div>
        </details>

        {!hasMutationTarget ? (
          <p className="text-xs text-fg-3">{NO_MUTATION_REASON}</p>
        ) : null}

        <button
          type="button"
          disabled={disabled || !hasMutationTarget || previewPlan.effectiveAmountPx <= 0}
          title={!hasMutationTarget ? NO_MUTATION_REASON : undefined}
          onClick={() => {
            onApplyShiftPlan?.(previewPlan);
            onCanvasHeightChange?.(previewPlan.nextCanvasHeight);
          }}
          className={cn(
            BUTTON_BASE,
            "border-accent bg-accent text-on-accent hover:brightness-105",
          )}
        >
          {operation === "insertion" ? "여백 추가 적용" : "여백 삭제 적용"}
        </button>
      </div>
    </details>
  );
}
