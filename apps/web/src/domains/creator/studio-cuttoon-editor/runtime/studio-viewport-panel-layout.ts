import {
  DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT,
  normalizeStudioDrawingPaletteLayout,
  type StudioDrawingPaletteLayout,
} from "../../brush/studio-drawing-palettes";
import {
  STUDIO_WORKSPACE_LEFT_PANEL_WIDTH,
  STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH,
  type StudioWorkspaceDesktopLayout,
} from "../../studio-workspaces";

/** `xl`(1280px) 미만은 작은·컴팩트 작업 화면, 이상은 큰 데스크톱 화면으로 독립 복원한다. */
export const STUDIO_COMPACT_VIEWPORT_MAX_WIDTH = 1_279;

const COMPACT_RIGHT_PANEL_HARD_MAX = 400;
const COMPACT_LEFT_PANEL_HARD_MAX = 260;

export type StudioViewportPanelBucket = "compact" | "large";

export interface StudioViewportPanelSnapshot {
  readonly desktop: StudioWorkspaceDesktopLayout;
  readonly drawingPalettes: StudioDrawingPaletteLayout;
}

export interface StudioViewportPanelMemoryState {
  readonly version: 1;
  readonly compact: StudioViewportPanelSnapshot | null;
  readonly large: StudioViewportPanelSnapshot | null;
}

export const EMPTY_STUDIO_VIEWPORT_PANEL_MEMORY: StudioViewportPanelMemoryState = Object.freeze({
  version: 1,
  compact: null,
  large: null,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampInt(value: number, min: number, max: number): number {
  const safeMax = Math.max(min, max);
  if (!Number.isFinite(value)) return min;
  return Math.min(safeMax, Math.max(min, Math.round(value)));
}

export function resolveStudioViewportPanelBucket(
  viewportWidth: number | null | undefined,
): StudioViewportPanelBucket {
  if (
    typeof viewportWidth === "number"
    && Number.isFinite(viewportWidth)
    && viewportWidth > 0
    && viewportWidth <= STUDIO_COMPACT_VIEWPORT_MAX_WIDTH
  ) {
    return "compact";
  }
  return "large";
}

/**
 * 뷰포트 폭에 따른 우측 작업·도구 옵션 패널의 안전 최대 폭.
 * - 작은 화면(`< 1280px`)에서는 뷰포트의 36%(최대 400px)로 제한해 캔버스가 잠식되지 않게 한다.
 * - 큰 화면(`>= 1280px`)에서는 최대 720px(뷰포트의 50% 이하)까지 허용한다.
 */
export function resolveStudioViewportMaxRightPanelWidth(
  viewportWidth: number | null | undefined,
): number {
  if (typeof viewportWidth !== "number" || !Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH.maximum;
  }
  if (resolveStudioViewportPanelBucket(viewportWidth) === "compact") {
    return clampInt(
      Math.floor(viewportWidth * 0.36),
      STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH.minimum,
      COMPACT_RIGHT_PANEL_HARD_MAX,
    );
  }
  return clampInt(
    Math.floor(viewportWidth * 0.5),
    STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH.minimum,
    STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH.maximum,
  );
}

export function resolveStudioViewportMaxLeftPanelWidth(
  viewportWidth: number | null | undefined,
): number {
  if (typeof viewportWidth !== "number" || !Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return STUDIO_WORKSPACE_LEFT_PANEL_WIDTH.maximum;
  }
  if (resolveStudioViewportPanelBucket(viewportWidth) === "compact") {
    return clampInt(
      Math.floor(viewportWidth * 0.24),
      STUDIO_WORKSPACE_LEFT_PANEL_WIDTH.minimum,
      COMPACT_LEFT_PANEL_HARD_MAX,
    );
  }
  return clampInt(
    Math.floor(viewportWidth * 0.3),
    STUDIO_WORKSPACE_LEFT_PANEL_WIDTH.minimum,
    STUDIO_WORKSPACE_LEFT_PANEL_WIDTH.maximum,
  );
}

const DEFAULT_DESKTOP: StudioWorkspaceDesktopLayout = Object.freeze({
  leftPanelOpen: true,
  rightPanelOpen: true,
  leftPanelWidth: STUDIO_WORKSPACE_LEFT_PANEL_WIDTH.default,
  rightPanelWidth: STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH.default,
});

export function normalizeStudioViewportPanelSnapshot(
  value: unknown,
  fallback?: StudioViewportPanelSnapshot,
  viewportWidth?: number | null,
): StudioViewportPanelSnapshot | null {
  if (!isRecord(value)) return fallback ?? null;
  const rawDesktop = isRecord(value.desktop) ? value.desktop : {};
  const baseDesktop = fallback?.desktop ?? DEFAULT_DESKTOP;
  const maxLeft = viewportWidth
    ? resolveStudioViewportMaxLeftPanelWidth(viewportWidth)
    : STUDIO_WORKSPACE_LEFT_PANEL_WIDTH.maximum;
  const maxRight = viewportWidth
    ? resolveStudioViewportMaxRightPanelWidth(viewportWidth)
    : STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH.maximum;
  const desktop: StudioWorkspaceDesktopLayout = Object.freeze({
    leftPanelOpen:
      typeof rawDesktop.leftPanelOpen === "boolean"
        ? rawDesktop.leftPanelOpen
        : baseDesktop.leftPanelOpen,
    rightPanelOpen:
      typeof rawDesktop.rightPanelOpen === "boolean"
        ? rawDesktop.rightPanelOpen
        : baseDesktop.rightPanelOpen,
    leftPanelWidth: clampInt(
      typeof rawDesktop.leftPanelWidth === "number"
        ? rawDesktop.leftPanelWidth
        : baseDesktop.leftPanelWidth,
      STUDIO_WORKSPACE_LEFT_PANEL_WIDTH.minimum,
      maxLeft,
    ),
    rightPanelWidth: clampInt(
      typeof rawDesktop.rightPanelWidth === "number"
        ? rawDesktop.rightPanelWidth
        : baseDesktop.rightPanelWidth,
      STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH.minimum,
      maxRight,
    ),
  });
  const drawingPalettes = normalizeStudioDrawingPaletteLayout(
    value.drawingPalettes,
    fallback?.drawingPalettes ?? DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT,
  );
  return Object.freeze({ desktop, drawingPalettes });
}

export function normalizeStudioViewportPanelMemoryState(
  value: unknown,
): StudioViewportPanelMemoryState {
  if (!isRecord(value)) return EMPTY_STUDIO_VIEWPORT_PANEL_MEMORY;
  const compact = normalizeStudioViewportPanelSnapshot(
    value.compact,
    undefined,
    STUDIO_COMPACT_VIEWPORT_MAX_WIDTH,
  );
  const large = normalizeStudioViewportPanelSnapshot(value.large);
  if (!compact && !large) return EMPTY_STUDIO_VIEWPORT_PANEL_MEMORY;
  return Object.freeze({ version: 1, compact, large });
}

/** 큰 화면 스냅샷에서 작은 화면 초기값을 시드할 때 뷰포트 안전 폭으로 클램프한다. */
export function seedCompactViewportPanelSnapshot(
  source: StudioViewportPanelSnapshot,
  viewportWidth: number | null | undefined,
): StudioViewportPanelSnapshot {
  const safeWidth =
    typeof viewportWidth === "number" && Number.isFinite(viewportWidth) && viewportWidth > 0
      ? Math.min(viewportWidth, STUDIO_COMPACT_VIEWPORT_MAX_WIDTH)
      : 1_040;
  return normalizeStudioViewportPanelSnapshot(source, source, safeWidth) ?? source;
}

export function areStudioViewportPanelSnapshotsEqual(
  first: StudioViewportPanelSnapshot | null,
  second: StudioViewportPanelSnapshot | null,
): boolean {
  if (first === second) return true;
  if (!first || !second) return false;
  const a = first.desktop;
  const b = second.desktop;
  if (
    a.leftPanelOpen !== b.leftPanelOpen
    || a.rightPanelOpen !== b.rightPanelOpen
    || a.leftPanelWidth !== b.leftPanelWidth
    || a.rightPanelWidth !== b.rightPanelWidth
  ) {
    return false;
  }
  const pa = first.drawingPalettes;
  const pb = second.drawingPalettes;
  return (
    Boolean(pa.libraryDockOpen) === Boolean(pb.libraryDockOpen)
    && pa.order.length === pb.order.length
    && pa.order.every((id, index) => pb.order[index] === id)
    && pa.collapsed["sub-tools"] === pb.collapsed["sub-tools"]
    && pa.collapsed["tool-properties"] === pb.collapsed["tool-properties"]
    && pa.sizes["sub-tools"] === pb.sizes["sub-tools"]
    && pa.sizes["tool-properties"] === pb.sizes["tool-properties"]
    && Boolean(pa.locks?.["sub-tools"].position) === Boolean(pb.locks?.["sub-tools"].position)
    && Boolean(pa.locks?.["sub-tools"].height) === Boolean(pb.locks?.["sub-tools"].height)
    && Boolean(pa.locks?.["tool-properties"].position)
      === Boolean(pb.locks?.["tool-properties"].position)
    && Boolean(pa.locks?.["tool-properties"].height)
      === Boolean(pb.locks?.["tool-properties"].height)
  );
}
