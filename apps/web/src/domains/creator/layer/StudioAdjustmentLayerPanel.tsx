/**
 * Studio Adjustment Layer Panel
 * 스택형 조정 레이어 UI — StudioLayerStylePanel 옆에 붙는 순수 프레젠테이션 컴포넌트.
 *
 * - `StudioAdjustmentLayerCreateMenu`: 레이어 패널의 "조정 레이어 추가" 메뉴.
 *   조정 종류 16종을 고르면 onCreate(kind)로 생성만 요청한다(실제 삽입은 호스트가
 *   `createAdjustmentEl` + `insertAdjustmentLayer`로 수행).
 * - `StudioAdjustmentLayerPanel`: 선택된 조정 레이어의 인스펙터. 활성 토글,
 *   불투명도, 블렌드 모드, "아래 레이어에만 적용(클립)" 토글, 위/아래 순서 이동,
 *   삭제를 콜백으로만 요청한다(상태 없음 — StudioLayerStylePanel과 같은 규약).
 */
import { ArrowDown, ArrowUp, Link2, Trash2 } from "lucide-react";

import type { StudioAdjustmentKind } from "../filter/studio-adjustment-effect-graph";

import {
  STUDIO_ADJUSTMENT_KIND_LABELS,
  type StudioAdjustmentLayerSpec,
} from "./studio-adjustment-layer";
import type { AdjustmentElPatch } from "./studio-adjustment-layer-elements";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

const LABEL_ROW = "flex items-center justify-between gap-2 text-xs text-fg-2";
const RANGE_CLASS = "w-24 accent-accent cursor-pointer";
const READOUT_CLASS = "w-8 text-right text-[10px] tabular-nums text-fg-3";
const CHIP_CLASS =
  "rounded-md border border-line bg-card px-2 py-0.5 text-[0.6rem] text-fg-2 transition-colors hover:bg-raised hover:text-fg";

/** 조정 레이어가 고를 수 있는 블렌드 모드(El.blendMode 문자열 규약과 동일). */
export const ADJUSTMENT_LAYER_BLEND_MODES: readonly { value: string; label: string }[] = [
  { value: "source-over", label: "보통" },
  { value: "multiply", label: "곱하기" },
  { value: "screen", label: "스크린" },
  { value: "overlay", label: "오버레이" },
  { value: "soft-light", label: "소프트 라이트" },
  { value: "hard-light", label: "하드 라이트" },
  { value: "darken", label: "어둡게" },
  { value: "lighten", label: "밝게" },
];

export const ADJUSTMENT_LAYER_KIND_OPTIONS: readonly StudioAdjustmentKind[] = [
  "levels",
  "curves",
  "hsl",
  "color-balance",
  "channel-mixer",
  "gradient-map",
  "lab",
  // PSD 확장 판정(2026-10-14)으로 추가된 6종 — 실행기까지 있어 생성 메뉴에 올린다.
  "brightness-contrast",
  "exposure",
  "vibrance",
  "invert",
  "posterize",
  "threshold",
  // PSD 전수 대응(2026-10-15)으로 추가된 종류 — 실행기가 있어 메뉴에 올린다.
  // color-lookup은 LUT 데이터가 없으면 항등이라 생성 메뉴에서는 제외한다
  // (가져온 레이어의 표시·편집은 라벨 Record가 담당한다).
  "black-white",
  "photo-filter",
  "selective-color",
];

export function StudioAdjustmentLayerCreateMenu({
  onCreate,
}: {
  onCreate: (kind: StudioAdjustmentKind) => void;
}): React.ReactElement {
  return (
    <div className="space-y-2">
      <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">조정 레이어 추가</p>
      <div className="flex flex-wrap gap-1.5">
        {ADJUSTMENT_LAYER_KIND_OPTIONS.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => onCreate(kind)}
            title="스택 맨 위에 조정 레이어를 만들어 아래 합성 전체에 적용합니다."
            className={CHIP_CLASS}
          >
            {STUDIO_ADJUSTMENT_KIND_LABELS[kind]}
          </button>
        ))}
      </div>
      <p className="text-[0.6rem] leading-relaxed text-fg-3">
        조정 레이어는 자기보다 아래쪽 그림 전체에 걸려요. 순서를 바꾸거나 지워도 원본 그림은 그대로예요.
      </p>
    </div>
  );
}

export function StudioAdjustmentLayerPanel({
  spec,
  onPatch,
  onMove,
  onDelete,
}: {
  /** 선택된 조정 레이어의 spec(adjustmentSpecFromEl 결과). */
  spec: StudioAdjustmentLayerSpec;
  onPatch: (patch: AdjustmentElPatch) => void;
  onMove: (direction: "up" | "down") => void;
  onDelete: () => void;
}): React.ReactElement {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">
          조정 레이어 ({STUDIO_ADJUSTMENT_KIND_LABELS[spec.adjustment]})
        </p>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMove("up")}
            className={buttonClass({ size: "sm", variant: "quiet" })}
            title="한 칸 위로 — 더 많은 레이어 위에 적용됩니다."
          >
            <ArrowUp className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove("down")}
            className={buttonClass({ size: "sm", variant: "quiet" })}
            title="한 칸 아래로 — 적용 범위가 줄어듭니다."
          >
            <ArrowDown className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className={buttonClass({ size: "sm", variant: "quiet" })}
            title="조정 레이어를 삭제합니다. 아래 그림은 원본 그대로 남습니다."
          >
            <Trash2 className="size-3.5" />
          </button>
        </span>
      </div>

      {/* 활성 토글 — 끄면 조정만 빠지고 레이어는 스택에 남는다. */}
      <label className={cn(LABEL_ROW, "cursor-pointer")}>
        조정 켜기
        <input
          type="checkbox"
          checked={spec.enabled}
          onChange={(e) => onPatch({ enabled: e.target.checked })}
          className="size-4 accent-accent cursor-pointer"
        />
      </label>

      {/* 불투명도 — 조정 강도(그래프 조정 노드 opacity). */}
      <label className={LABEL_ROW}>
        불투명도
        <span className="flex items-center gap-1.5">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(spec.opacity * 100)}
            onChange={(e) => onPatch({ opacity: Number(e.target.value) / 100 })}
            className={RANGE_CLASS}
          />
          <span className={READOUT_CLASS}>{Math.round(spec.opacity * 100)}</span>
        </span>
      </label>

      {/* 블렌드 모드 — 조정 결과를 아래 합성과 섞는 방식. */}
      <label className={LABEL_ROW}>
        블렌드 모드
        <select
          value={spec.blendMode}
          onChange={(e) => onPatch({ blendMode: e.target.value })}
          className="rounded-md border border-line bg-card px-1.5 py-1 text-xs text-fg cursor-pointer"
        >
          {ADJUSTMENT_LAYER_BLEND_MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
      </label>

      {/* 클립 — 바로 아래 레이어 1개에만 적용. */}
      <label className={cn(LABEL_ROW, "cursor-pointer")}>
        <span className="flex items-center gap-1.5">
          <Link2 className="size-3.5" />
          아래 레이어에만 적용
        </span>
        <input
          type="checkbox"
          checked={spec.clipToBelow}
          onChange={(e) => onPatch({ clipToBelow: e.target.checked })}
          className="size-4 accent-accent cursor-pointer"
        />
      </label>
      <p className="text-[0.6rem] leading-relaxed text-fg-3">
        {spec.clipToBelow
          ? "바로 아래 레이어에만 걸려요. 그 아래 그림은 바뀌지 않아요."
          : "이 레이어보다 아래쪽 합성 전체에 걸려요."}
      </p>
    </div>
  );
}
