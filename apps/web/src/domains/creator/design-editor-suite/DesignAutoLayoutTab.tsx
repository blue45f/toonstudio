/**
 * Figma Auto-Layout 실시간 제약 솔버 및 컴포넌트 마스터-인스턴스 전파 인스펙터 탭
 */

import { RotateCcw } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  roughifyRectPath,
  type AutoLayoutAlignItems,
  type AutoLayoutDirection,
  type AutoLayoutJustifyContent,
  type AutoLayoutSizingMode,
  type ComponentInstance,
  type ComponentMaster,
  type ComputedAutoLayoutNode,
} from "./figma-autolayout-engine";

export interface DesignAutoLayoutTabProps {
  readonly panelId: string;
  readonly labelledBy: string;
  readonly isEnglish: boolean;
  readonly activeBrandKitClass: string;
  readonly sketchMode: boolean;
  readonly layoutDirection: AutoLayoutDirection;
  readonly layoutGap: number;
  readonly layoutPadding: number;
  readonly layoutAlign: AutoLayoutAlignItems;
  readonly layoutJustify: AutoLayoutJustifyContent;
  readonly childSizingMode: AutoLayoutSizingMode;
  readonly computedAutoLayout: ComputedAutoLayoutNode;
  readonly layoutLeaves: readonly ComputedAutoLayoutNode[];
  readonly componentMaster: ComponentMaster;
  readonly componentInstances: readonly ComponentInstance[];
  readonly onChangeDirection: (dir: AutoLayoutDirection) => void;
  readonly onChangeGap: (gap: number) => void;
  readonly onChangePadding: (padding: number) => void;
  readonly onChangeAlign: (align: AutoLayoutAlignItems) => void;
  readonly onChangeJustify: (justify: AutoLayoutJustifyContent) => void;
  readonly onChangeChildSizing: (mode: AutoLayoutSizingMode) => void;
  readonly onBumpMasterRadius: (radius: number) => void;
  readonly onToggleSecondInstanceOverride: () => void;
}

export function DesignAutoLayoutTab({
  panelId,
  labelledBy,
  isEnglish,
  activeBrandKitClass,
  sketchMode,
  layoutDirection,
  layoutGap,
  layoutPadding,
  layoutAlign,
  layoutJustify,
  childSizingMode,
  computedAutoLayout,
  layoutLeaves,
  componentMaster,
  componentInstances,
  onChangeDirection,
  onChangeGap,
  onChangePadding,
  onChangeAlign,
  onChangeJustify,
  onChangeChildSizing,
  onBumpMasterRadius,
  onToggleSecondInstanceOverride,
}: DesignAutoLayoutTabProps) {
  const bt = useBilingual("DesignAutoLayoutTab");

  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={labelledBy}
      className="des-panel-body"
      data-testid="des-autolayout-panel"
    >
      <div className="des-subsection">
        <h3 className="des-subsection-title">
          {bt("Auto-Layout 실시간 제약 솔버", "Live Auto-Layout Constraint Solver")}
        </h3>

        <div className="des-control-row">
          {(["row", "column", "wrap"] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              className="des-chip-btn"
              aria-pressed={layoutDirection === dir}
              data-active={layoutDirection === dir ? "true" : "false"}
              data-testid={`des-al-dir-${dir}`}
              onClick={() => onChangeDirection(dir)}
            >
              {dir === "row"
                ? bt("가로 Row", "Row")
                : dir === "column"
                  ? bt("세로 Column", "Column")
                  : bt("줄바꿈 Wrap", "Wrap")}
            </button>
          ))}
          {(["fixed", "hug", "fill"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className="des-chip-btn"
              aria-pressed={childSizingMode === mode}
              data-active={childSizingMode === mode ? "true" : "false"}
              data-testid={`des-al-size-${mode}`}
              onClick={() => onChangeChildSizing(mode)}
            >
              {mode === "fixed"
                ? bt("고정 Fixed", "Fixed")
                : mode === "hug"
                  ? bt("콘텐츠 Hug", "Hug")
                  : bt("채움 Fill", "Fill")}
            </button>
          ))}
        </div>

        <div className="des-slider-grid">
          <label className="des-slider-label">
            <span>
              {bt("간격 Gap", "Gap")}: <strong className="des-num">{layoutGap}px</strong>
            </span>
            <input
              type="range"
              min={0}
              max={36}
              value={layoutGap}
              data-testid="des-al-gap-slider"
              onChange={(event) => onChangeGap(Number(event.target.value))}
            />
          </label>
          <label className="des-slider-label">
            <span>
              {bt("패딩 Padding", "Padding")}: <strong className="des-num">{layoutPadding}px</strong>
            </span>
            <input
              type="range"
              min={0}
              max={40}
              value={layoutPadding}
              data-testid="des-al-padding-slider"
              onChange={(event) => onChangePadding(Number(event.target.value))}
            />
          </label>
        </div>

        <div className="des-control-row">
          {(["start", "center", "end", "stretch"] as const).map((align) => (
            <button
              key={align}
              type="button"
              className="des-chip-btn"
              aria-pressed={layoutAlign === align}
              data-active={layoutAlign === align ? "true" : "false"}
              onClick={() => onChangeAlign(align)}
            >
              {bt("교차", "Align")}: {align}
            </button>
          ))}
          {(["start", "center", "end", "space-between"] as const).map((justify) => (
            <button
              key={justify}
              type="button"
              className="des-chip-btn"
              aria-pressed={layoutJustify === justify}
              data-active={layoutJustify === justify ? "true" : "false"}
              onClick={() => onChangeJustify(justify)}
            >
              {justify}
            </button>
          ))}
        </div>

        <div className={`des-al-preview-box ${activeBrandKitClass}`}>
          <svg
            className="des-al-svg"
            viewBox={`0 0 ${computedAutoLayout.width} ${Math.max(164, computedAutoLayout.height)}`}
            role="img"
            aria-label={bt("Auto-Layout 실시간 배치 미리보기", "Live Auto-Layout preview")}
            data-testid="des-autolayout-svg"
          >
            <rect
              x={0}
              y={0}
              width={computedAutoLayout.width}
              height={computedAutoLayout.height}
              rx={12}
              fill="var(--des-kit-bg)"
              stroke="var(--des-kit-border)"
              strokeWidth={1.5}
            />
            {layoutLeaves.map((leaf, idx) => (
              <g key={leaf.id} data-al-leaf={leaf.id}>
                <rect
                  x={leaf.x}
                  y={leaf.y}
                  width={leaf.width}
                  height={leaf.height}
                  rx={8}
                  fill={leaf.tokenRole === "cta" ? "var(--des-kit-accent)" : "var(--des-kit-surface)"}
                  stroke="var(--des-kit-accent)"
                  strokeWidth={1.5}
                />
                {sketchMode && (
                  <path
                    d={roughifyRectPath(leaf.x, leaf.y, leaf.width, leaf.height, 90 + idx * 13)}
                    fill="none"
                    stroke="var(--des-kit-ink)"
                    strokeWidth={1.2}
                  />
                )}
                <text
                  x={leaf.x + leaf.width / 2}
                  y={leaf.y + leaf.height / 2}
                  dominantBaseline="central"
                  textAnchor="middle"
                  fill={leaf.tokenRole === "cta" ? "var(--des-kit-on-accent)" : "var(--des-kit-ink)"}
                  fontSize={11}
                  fontWeight={700}
                >
                  {isEnglish ? leaf.labelEn : leaf.labelKo}
                </text>
              </g>
            ))}
          </svg>
          <p className="des-meta-line des-num" data-testid="des-al-metrics">
            {layoutLeaves
              .map(
                (leaf) =>
                  `${leaf.id}(${Math.round(leaf.x)},${Math.round(leaf.y)} ${Math.round(leaf.width)}×${Math.round(leaf.height)})`,
              )
              .join(" · ")}
          </p>
        </div>
      </div>

      <div className="des-subsection">
        <div className="des-subsection-head">
          <h3 className="des-subsection-title">
            {bt("컴포넌트 마스터 → 인스턴스 오버라이드 전파", "Master → Instance Override Sync")}
          </h3>
          <div className="des-control-row">
            {([4, 12, 24] as const).map((radius) => (
              <button
                key={radius}
                type="button"
                className="des-chip-btn des-num"
                aria-pressed={componentMaster.props.borderRadius === radius}
                data-active={componentMaster.props.borderRadius === radius ? "true" : "false"}
                data-testid={`des-master-radius-${radius}`}
                onClick={() => onBumpMasterRadius(radius)}
              >
                {bt("마스터 R", "Master R")}: {radius}px
              </button>
            ))}
            <button
              type="button"
              className="des-chip-btn"
              data-testid="des-toggle-override-btn"
              onClick={onToggleSecondInstanceOverride}
            >
              <RotateCcw size={14} aria-hidden="true" />
              <span>{bt("인스턴스 #2 라벨 오버라이드 토글", "Toggle Instance #2 Override")}</span>
            </button>
          </div>
        </div>
        <div className="des-instance-list" data-testid="des-instance-list">
          {componentInstances.map((inst) => {
            const hasOverride = Object.keys(inst.overrides).length > 0;
            return (
              <div key={inst.id} className="des-instance-row" data-testid={`des-instance-${inst.id}`}>
                <span className="des-instance-name">{inst.name}</span>
                <span className="des-instance-pill des-num">
                  {isEnglish ? inst.resolvedProps.labelEn : inst.resolvedProps.labelKo} · R
                  {inst.resolvedProps.borderRadius}px
                </span>
                <span className="des-pill" data-tone={hasOverride ? "warn" : "good"}>
                  {hasOverride
                    ? bt("오버라이드 보존", "Override Kept")
                    : bt("마스터 동기화", "Master Synced")}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
