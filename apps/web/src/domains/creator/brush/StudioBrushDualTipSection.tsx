import type { ReactNode } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import {
  normalizeStudioBrushDynamicsSettings,
  type NormalizedStudioBrushDynamicsSettings,
} from "./studio-brush-dynamics";
import {
  STUDIO_BRUSH_DUAL_BRUSH_BLEND_MODES,
  STUDIO_BRUSH_DUAL_BRUSH_SIZE_RATIO_LIMITS,
  normalizeStudioBrushDualBrushSettings,
  type StudioBrushDualBrushBlendMode,
  type StudioBrushDualBrushSettings,
} from "./studio-brush-tip-composition";
import {
  STUDIO_BRUSH_TIP_SHAPE_IDS,
  type NormalizedStudioBrushTipSettings,
  type StudioBrushTipSettings,
  type StudioBrushTipShapeId,
} from "./studio-brush-tip-stamp";
import { TIP_SHAPE_LABELS } from "./studio-brush-studio-constants";
import { RangeRow, ToggleRow } from "./StudioBrushSettingRows";

import { cn } from "@/shared/lib/utils";

export function TipShapeGlyph({ shape, active }: { shape: StudioBrushTipShapeId; active: boolean }) {
  const stroke = active ? "currentColor" : "var(--color-fg-3)";
  const fill = active ? "var(--color-accent-soft)" : "var(--color-raised)";
  return (
    <svg viewBox="0 0 28 18" className="h-4 w-7 text-accent" aria-hidden>
      {shape === "round" || shape === "soft" ? (
        <ellipse
          cx="14"
          cy="9"
          rx={shape === "soft" ? 10 : 7}
          ry={7}
          fill={fill}
          stroke={stroke}
          strokeWidth="1"
        />
      ) : null}
      {shape === "hard" ? (
        <ellipse cx="14" cy="9" rx="8" ry="8" fill={fill} stroke={stroke} strokeWidth="1.4" />
      ) : null}
      {shape === "flake" ? (
        <path d="M14 2 L22 9 L14 16 L6 9 Z" fill={fill} stroke={stroke} strokeWidth="1" />
      ) : null}
      {shape === "grain" ? (
        <>
          <circle cx="9" cy="7" r="2.2" fill={fill} stroke={stroke} strokeWidth="0.8" />
          <circle cx="15" cy="11" r="2.6" fill={fill} stroke={stroke} strokeWidth="0.8" />
          <circle cx="20" cy="6.5" r="1.8" fill={fill} stroke={stroke} strokeWidth="0.8" />
        </>
      ) : null}
      {shape === "bristle" ? (
        <g fill="none" stroke={stroke} strokeLinecap="round">
          <path d="M6 5.5 C10 7 10 12 14 13.5" strokeWidth="1.5" />
          <path d="M10 4 C13 7 14 10 17 14" strokeWidth="1.1" />
          <path d="M14 3.5 C16 7 18 10 21.5 12.5" strokeWidth="1.4" />
        </g>
      ) : null}
      {shape === "sponge" ? (
        <>
          <circle cx="9" cy="6" r="3" fill={fill} stroke={stroke} strokeWidth="0.7" />
          <circle cx="15" cy="10" r="4" fill={fill} stroke={stroke} strokeWidth="0.7" />
          <circle cx="21" cy="6.5" r="2.6" fill={fill} stroke={stroke} strokeWidth="0.7" />
          <circle cx="21" cy="13" r="2" fill={fill} stroke={stroke} strokeWidth="0.7" />
        </>
      ) : null}
      {shape === "sumi" ? (
        <path
          d="M5.5 10.5 C7 5 11 2.8 15.5 4 C21 5.3 23.5 10.4 20.2 14 C17.5 16.4 9.4 15.3 5.5 10.5 Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="0.9"
        />
      ) : null}
      {shape === "halftone" ? (
        <g fill={stroke}>
          {[8, 14, 20].flatMap((x) =>
            [5, 10, 15].map((y) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r={y === 10 ? 1.45 : 1.1} />
            )),
          )}
        </g>
      ) : null}
      {shape === "star" ? (
        <path
          d="M14 2.5 L16.2 7.4 L21.5 7.8 L17.4 11.2 L18.6 16.3 L14 13.7 L9.4 16.3 L10.6 11.2 L6.5 7.8 L11.8 7.4 Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="0.9"
        />
      ) : null}
      {shape === "spatter" ? (
        <g fill={stroke}>
          <circle cx="8" cy="6" r="1.8" />
          <circle cx="14" cy="11" r="2.4" />
          <circle cx="20" cy="7" r="1.3" />
          <circle cx="19" cy="14" r="1.5" />
        </g>
      ) : null}
      {shape === "rake" ? (
        <g fill="none" stroke={stroke} strokeWidth="1.3" strokeLinecap="round">
          <path d="M6 5 H22" />
          <path d="M6 9 H22" />
          <path d="M6 13 H22" />
        </g>
      ) : null}
      {shape === "grass" ? (
        <g fill="none" stroke={stroke} strokeWidth="1.2" strokeLinecap="round">
          <path d="M9 15 C9 10 10 6 11.5 3.5" />
          <path d="M14 15 C14.5 10 15.5 6 17 3" />
          <path d="M19 15 C18.5 11 19.5 7 21 4.5" />
        </g>
      ) : null}
    </svg>
  );
}

const DUAL_BRUSH_BLEND_MODE_LABELS: Record<StudioBrushDualBrushBlendMode, string> = {
  multiply: "곱하기",
  screen: "스크린",
};

const DUAL_BRUSH_BLEND_MODE_HINTS: Record<StudioBrushDualBrushBlendMode, string> = {
  multiply: "2차 팁의 어두운 부분이 1차 팁을 깎아 질감을 만듭니다",
  screen: "2차 팁의 밝은 부분이 1차 팁 커버리지를 밝게 넓힙니다",
};

export interface StudioBrushDualTipSectionProps {
  readonly settings: NormalizedStudioBrushDynamicsSettings;
  readonly onSettingsChange: (settings: NormalizedStudioBrushDynamicsSettings) => void;
  readonly renderTipImport: (
    tip: NormalizedStudioBrushTipSettings,
    onTipChange: (patch: Partial<StudioBrushTipSettings>) => void,
  ) => ReactNode;
}

/**
 * 듀얼 브러시 2차 팁 텍스처 합성 컨트롤 (StudioBrushStudio 서브컴포넌트).
 */
export function StudioBrushDualTipSection({
  settings,
  onSettingsChange,
  renderTipImport,
}: StudioBrushDualTipSectionProps) {
  const dualBrush = settings.dualBrush ?? normalizeStudioBrushDualBrushSettings();
  const update = (patch: Partial<StudioBrushDualBrushSettings>) => {
    onSettingsChange(
      normalizeStudioBrushDynamicsSettings({
        ...settings,
        dualBrush: { ...dualBrush, ...patch },
      }),
    );
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-fg-2">듀얼 브러시</span>
        <span className="text-xs text-fg-3">간격·산포는 1차 브러시를 따릅니다</span>
      </div>
      <ToggleRow
        label="듀얼 브러시 사용"
        description="2차 팁 텍스처가 1차 팁을 도장 텍스처 합성 시점에 변조합니다"
        checked={dualBrush.enabled}
        onChange={(enabled) => update({ enabled })}
      />
      {dualBrush.enabled ? (
        <>
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-fg-2">2차 팁</span>
              <span className="text-xs text-fg-3">선택하면 2차 사용자 PNG가 해제됩니다</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              {STUDIO_BRUSH_TIP_SHAPE_IDS.map((shapeId) => {
                const active = dualBrush.tip.shape === shapeId && !dualBrush.tip.alphaMapBase64;
                return (
                  <button
                    key={shapeId}
                    type="button"
                    aria-pressed={active}
                    aria-label={`2차 팁 ${TIP_SHAPE_LABELS[shapeId]}`}
                    onClick={() =>
                      update({
                        tip: { ...dualBrush.tip, shape: shapeId, alphaMapBase64: null },
                      })
                    }
                    className={cn(
                      "flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs font-semibold transition-colors duration-150",
                      STUDIO_FOCUS_RING,
                      active
                        ? "border-accent bg-accent-soft/55 text-fg ring-1 ring-accent/20"
                        : "border-line bg-card/55 text-fg-2 hover:border-accent/45 hover:bg-raised",
                    )}
                  >
                    <TipShapeGlyph shape={shapeId} active={active} />
                    {TIP_SHAPE_LABELS[shapeId]}
                  </button>
                );
              })}
            </div>
          </div>
          <div role="radiogroup" aria-label="듀얼 브러시 합성 모드" className="grid grid-cols-2 gap-1.5">
            {STUDIO_BRUSH_DUAL_BRUSH_BLEND_MODES.map((blendMode) => {
              const active = dualBrush.blendMode === blendMode;
              return (
                <button
                  key={blendMode}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => update({ blendMode })}
                  className={cn(
                    "min-h-[44px] rounded-xl border px-3 py-2 text-left transition-colors duration-150",
                    STUDIO_FOCUS_RING,
                    active
                      ? "border-accent bg-accent-soft/55 text-fg ring-1 ring-accent/20"
                      : "border-line bg-card/55 text-fg-2 hover:border-accent/45 hover:bg-raised",
                  )}
                >
                  <span className="block text-xs font-semibold">
                    {DUAL_BRUSH_BLEND_MODE_LABELS[blendMode]}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-fg-3">
                    {DUAL_BRUSH_BLEND_MODE_HINTS[blendMode]}
                  </span>
                </button>
              );
            })}
          </div>
          <RangeRow
            label="2차 팁 크기 비율"
            value={dualBrush.sizeRatio}
            min={STUDIO_BRUSH_DUAL_BRUSH_SIZE_RATIO_LIMITS.min}
            max={STUDIO_BRUSH_DUAL_BRUSH_SIZE_RATIO_LIMITS.max}
            step={0.05}
            display={`${Math.round(dualBrush.sizeRatio * 100)}%`}
            hint="1차 팁 지름 대비 2차 팁 지름"
            onChange={(sizeRatio) => update({ sizeRatio })}
          />
          {renderTipImport(dualBrush.tip, (patch) => update({ tip: { ...dualBrush.tip, ...patch } }))}
        </>
      ) : null}
    </div>
  );
}
