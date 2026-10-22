// 저장 브러시 획 미리보기 — StudioBrushLibraryPanel.tsx에서 추출했다(동작 무변경,
// 소스 크기 래칫 대응).
import { studioCoreBrushCatalogItemById } from "./studio-brush-catalog-core";
import type { StudioSavedBrush } from "./studio-brush-library";
import { studioBrushPackDescriptorById } from "./studio-brush-pack-index";
import {
  studioBrushPreviewDashArray,
  studioBrushPreviewDotCenters,
  studioBrushPreviewOpacity,
  studioBrushPreviewPathD,
  studioBrushPreviewRibbonD,
  studioBrushPreviewStrokeWidth,
} from "./studio-brush-visual";
import { StudioMaterialBrushThumbnail } from "./StudioMaterialBrushThumbnail";

const SAVED_PREVIEW_WIDTH = 84;
const SAVED_PREVIEW_HEIGHT = 28;

export function SavedBrushStrokePreview({ brush }: { brush: StudioSavedBrush }) {
  if (brush.enginePrograms?.material) {
    return <StudioMaterialBrushThumbnail brush={brush} className="h-9 w-24 shrink-0 rounded-md border border-line" />;
  }
  const sourceDescriptor = studioBrushPackDescriptorById(brush.sourcePresetId);
  const catalogItem = studioCoreBrushCatalogItemById(
    brush.sourcePresetId ?? brush.brushId
  ) ?? studioCoreBrushCatalogItemById(brush.brushId);
  const style = sourceDescriptor?.previewStyle ?? catalogItem?.previewStyle ?? "solid";
  const weight = Math.min(1, Math.max(0.18, brush.strokeWidth / 36));
  const strokeWidth = studioBrushPreviewStrokeWidth(weight, style);
  const path = studioBrushPreviewPathD(style, SAVED_PREVIEW_WIDTH, SAVED_PREVIEW_HEIGHT);
  const ribbon = studioBrushPreviewRibbonD(
    style,
    SAVED_PREVIEW_WIDTH,
    SAVED_PREVIEW_HEIGHT,
    weight
  );
  const dash = studioBrushPreviewDashArray(style);
  const opacity = studioBrushPreviewOpacity(brush.brushOpacity);
  const dotStyle = style === "dashed" ? "texture" : style;
  const dots = studioBrushPreviewDotCenters(dotStyle, 36, 16).map((dot) => ({
    x: 4 + dot.x * ((SAVED_PREVIEW_WIDTH - 8) / 36),
    y: 3 + dot.y * ((SAVED_PREVIEW_HEIGHT - 6) / 16),
    r: dot.r * Math.min(
      (SAVED_PREVIEW_WIDTH - 8) / 36,
      (SAVED_PREVIEW_HEIGHT - 6) / 16
    ),
  }));
  const diffuse = style === "soft" || style === "glow" || style === "neon";

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${SAVED_PREVIEW_WIDTH} ${SAVED_PREVIEW_HEIGHT}`}
      data-studio-saved-brush-preview={style}
      data-studio-saved-brush-preview-opacity={opacity}
      className="h-9 w-24 shrink-0"
    >
      <rect
        x={0.5}
        y={0.5}
        width={(SAVED_PREVIEW_WIDTH - 1) / 2}
        height={SAVED_PREVIEW_HEIGHT - 1}
        rx={5}
        fill="var(--color-raised)"
      />
      <rect
        x={SAVED_PREVIEW_WIDTH / 2}
        y={0.5}
        width={(SAVED_PREVIEW_WIDTH - 1) / 2}
        height={SAVED_PREVIEW_HEIGHT - 1}
        rx={5}
        fill="var(--color-reader-panel)"
      />
      <rect
        x={0.5}
        y={0.5}
        width={SAVED_PREVIEW_WIDTH - 1}
        height={SAVED_PREVIEW_HEIGHT - 1}
        rx={5}
        fill="none"
        stroke="var(--color-fg-3)"
        strokeOpacity={0.7}
      />
      {dots.length > 0 ? (
        <g fill={brush.color} opacity={opacity}>
          {dots.map((dot, index) => (
            <circle key={index} cx={dot.x} cy={dot.y} r={dot.r} />
          ))}
        </g>
      ) : (
        <>
          {diffuse ? (
            <path
              d={path}
              fill="none"
              stroke={brush.color}
              strokeWidth={strokeWidth * 2.1}
              strokeLinecap="round"
              opacity={opacity * 0.18}
            />
          ) : null}
          {ribbon ? (
            <path d={ribbon} fill={brush.color} opacity={opacity} />
          ) : (
            <path
              d={path}
              fill="none"
              stroke={brush.color}
              strokeWidth={strokeWidth}
              strokeLinecap={brush.tipRoundness < 0.35 ? "butt" : "round"}
              strokeLinejoin="round"
              strokeDasharray={dash}
              opacity={opacity}
            />
          )}
        </>
      )}
    </svg>
  );
}
