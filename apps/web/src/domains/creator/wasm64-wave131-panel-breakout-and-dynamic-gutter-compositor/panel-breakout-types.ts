/**
 * Wave 131 — 만화·웹툰 사선/찢김 컷 경계 돌출(Panel-Breakout) 동적 레이아웃 &
 * 인접 컷 무침범 Z-오더 합성 컴파일러 공용 타입·상수 정의.
 */

export type PanelFrameStyleId =
  | "classic-rect"
  | "diagonal-slash-cut"
  | "impact-shattered-border"
  | "borderless-full-bleed"
  | "inset-floating-overlay";

export type PanelWindingOrder = "cw" | "ccw";

export type BreakoutMode =
  | "clipped-inside"
  | "gutter-breakout"
  | "cross-panel-bridge";

export type BreakoutSubjectKind =
  | "fist"
  | "blade"
  | "character-torso"
  | "sfx-polygon"
  | "prop";

export type CriticalZoneKind =
  | "character-face"
  | "speech-balloon"
  | "caption-safe";

export type CompositorLayerKind =
  | "panel-background"
  | "base-art"
  | "clipped-subject"
  | "panel-border-stroke"
  | "gutter-breakout-subject"
  | "cross-panel-bridge-subject";

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Rect2D {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Bounds2D {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

export interface PanelFrameStyleSpec {
  readonly id: PanelFrameStyleId;
  readonly labelKo: string;
  readonly defaultBorderStrokeWidthPx: number;
  readonly isConvexByDefault: boolean;
  readonly zBandBoost: number;
  readonly fillOklchLight: string;
  readonly fillOklchDark: string;
  readonly strokeOklchLight: string;
  readonly strokeOklchDark: string;
}

export const PANEL_FRAME_STYLES: Readonly<Record<PanelFrameStyleId, PanelFrameStyleSpec>> = {
  "classic-rect": {
    id: "classic-rect",
    labelKo: "정통 직사각 컷",
    defaultBorderStrokeWidthPx: 3.5,
    isConvexByDefault: true,
    zBandBoost: 0,
    fillOklchLight: "oklch(0.992 0.004 92)",
    fillOklchDark: "oklch(0.21 0.014 155)",
    strokeOklchLight: "oklch(0.22 0.02 155)",
    strokeOklchDark: "oklch(0.90 0.01 92)",
  },
  "diagonal-slash-cut": {
    id: "diagonal-slash-cut",
    labelKo: "사선 분할 액션 컷",
    defaultBorderStrokeWidthPx: 4,
    isConvexByDefault: true,
    zBandBoost: 0,
    fillOklchLight: "oklch(0.975 0.016 78)",
    fillOklchDark: "oklch(0.23 0.024 68)",
    strokeOklchLight: "oklch(0.28 0.06 32)",
    strokeOklchDark: "oklch(0.86 0.065 65)",
  },
  "impact-shattered-border": {
    id: "impact-shattered-border",
    labelKo: "파열 찢김 충격 컷",
    defaultBorderStrokeWidthPx: 4.5,
    isConvexByDefault: false,
    zBandBoost: 5,
    fillOklchLight: "oklch(0.968 0.022 30)",
    fillOklchDark: "oklch(0.24 0.036 28)",
    strokeOklchLight: "oklch(0.45 0.175 26)",
    strokeOklchDark: "oklch(0.76 0.165 28)",
  },
  "borderless-full-bleed": {
    id: "borderless-full-bleed",
    labelKo: "무테 전면 블리드 컷",
    defaultBorderStrokeWidthPx: 0,
    isConvexByDefault: true,
    zBandBoost: 0,
    fillOklchLight: "oklch(0.96 0.018 220)",
    fillOklchDark: "oklch(0.22 0.026 225)",
    strokeOklchLight: "oklch(0.55 0.045 220)",
    strokeOklchDark: "oklch(0.68 0.055 220)",
  },
  "inset-floating-overlay": {
    id: "inset-floating-overlay",
    labelKo: "부유 인셋 오버레이 컷",
    defaultBorderStrokeWidthPx: 3,
    isConvexByDefault: true,
    zBandBoost: 40,
    fillOklchLight: "oklch(0.978 0.018 158)",
    fillOklchDark: "oklch(0.25 0.028 158)",
    strokeOklchLight: "oklch(0.32 0.095 155)",
    strokeOklchDark: "oklch(0.76 0.115 155)",
  },
};

export const PANEL_FRAME_STYLE_IDS: readonly PanelFrameStyleId[] = [
  "classic-rect",
  "diagonal-slash-cut",
  "impact-shattered-border",
  "borderless-full-bleed",
  "inset-floating-overlay",
];

export interface ComicPanelFrameGeometrySpec {
  readonly panelId: string;
  readonly style: PanelFrameStyleId;
  readonly bounds: Rect2D;
  readonly canvasWidthPx?: number;
  readonly winding?: PanelWindingOrder;
  readonly borderStrokeWidthPx?: number;
  /** diagonal-slash-cut 전용: 상단·하단 또는 좌·우 사선 기울기 오프셋(px) */
  readonly slashTopSkewPx?: number;
  readonly slashBottomSkewPx?: number;
  /** impact-shattered-border 전용: 변당 파열 톱니 수 및 깊이 비율(0.03~0.14) */
  readonly shatterTeethPerEdge?: number;
  readonly shatterDepthRatio?: number;
  readonly shatterSeed?: number;
  /** inset-floating-overlay 전용: 모서리 모따기 크기(px) */
  readonly chamferSizePx?: number;
}

export interface BreakoutSubjectInput {
  readonly subjectId: string;
  readonly labelKo: string;
  readonly kind: BreakoutSubjectKind;
  readonly breakoutMode: BreakoutMode;
  readonly polygon: readonly Vec2[];
  readonly zOffset?: number;
  readonly allowHorizontalClamp?: boolean;
}

export interface PanelCriticalZoneInput {
  readonly zoneId: string;
  readonly labelKo: string;
  readonly kind: CriticalZoneKind;
  readonly bounds: Rect2D;
  readonly polygon?: readonly Vec2[];
}

export interface ComicPanelInput {
  readonly panelId: string;
  readonly titleKo: string;
  readonly style: PanelFrameStyleId;
  readonly bounds: Rect2D;
  readonly baseArtBounds?: Rect2D;
  readonly borderStrokeWidthPx?: number;
  readonly winding?: PanelWindingOrder;
  readonly slashTopSkewPx?: number;
  readonly slashBottomSkewPx?: number;
  readonly shatterTeethPerEdge?: number;
  readonly shatterDepthRatio?: number;
  readonly shatterSeed?: number;
  readonly chamferSizePx?: number;
  readonly breakoutSubjects?: readonly BreakoutSubjectInput[];
  readonly criticalZones?: readonly PanelCriticalZoneInput[];
}

export interface PanelBreakoutDocument {
  readonly documentId: string;
  readonly titleKo: string;
  readonly canvasWidthPx: number;
  readonly minGutterPx?: number;
  readonly maxHorizontalClipRatio?: number;
  readonly panels: readonly ComicPanelInput[];
}

export interface BuiltPanelFramePolygon {
  readonly panelId: string;
  readonly style: PanelFrameStyleId;
  readonly winding: PanelWindingOrder;
  readonly vertices: readonly Vec2[];
  readonly signedAreaPx2: number;
  readonly areaPx2: number;
  readonly bounds: Bounds2D;
  readonly centroid: Vec2;
  readonly isConvex: boolean;
  readonly borderStrokeWidthPx: number;
}

export interface CompiledBreakoutSubject {
  readonly subjectId: string;
  readonly panelId: string;
  readonly labelKo: string;
  readonly kind: BreakoutSubjectKind;
  readonly breakoutMode: BreakoutMode;
  readonly zIndex: number;
  readonly borderStrokeZ: number;
  readonly promotedAboveBorder: boolean;
  readonly originalPolygon: readonly Vec2[];
  readonly renderPolygon: readonly Vec2[];
  readonly clippedPieces: readonly (readonly Vec2[])[];
  readonly originalAreaPx2: number;
  readonly insideFrameAreaPx2: number;
  readonly renderAreaPx2: number;
  readonly breakoutOverflowAreaPx2: number;
  readonly allRenderVerticesInsideFrame: boolean;
  readonly bounds: Bounds2D;
  readonly allowHorizontalClamp: boolean;
}

export interface CompiledCriticalZone {
  readonly zoneId: string;
  readonly panelId: string;
  readonly labelKo: string;
  readonly kind: CriticalZoneKind;
  readonly bounds: Bounds2D;
  readonly polygon: readonly Vec2[];
  readonly areaPx2: number;
}

export interface CompiledPanelEntry {
  readonly panelId: string;
  readonly titleKo: string;
  readonly style: PanelFrameStyleId;
  readonly orderIndex: number;
  readonly frame: BuiltPanelFramePolygon;
  readonly panelBaseZ: number;
  readonly borderStrokeZ: number;
  readonly baseArtOriginalPolygon: readonly Vec2[];
  readonly baseArtClippedPolygon: readonly Vec2[];
  readonly baseArtClippedPieces: readonly (readonly Vec2[])[];
  readonly baseArtOriginalAreaPx2: number;
  readonly baseArtClippedAreaPx2: number;
  readonly subjects: readonly CompiledBreakoutSubject[];
  readonly criticalZones: readonly CompiledCriticalZone[];
}

export interface CompiledCompositorLayer {
  readonly layerId: string;
  readonly panelId: string;
  readonly subjectId: string | null;
  readonly kind: CompositorLayerKind;
  readonly zIndex: number;
  readonly clippedToPanelFrame: boolean;
  readonly polygon: readonly Vec2[];
  readonly pieces: readonly (readonly Vec2[])[];
  readonly areaPx2: number;
  readonly labelKo: string;
}

export interface CompiledPanelBreakoutLayout {
  readonly documentId: string;
  readonly titleKo: string;
  readonly canvasWidthPx: number;
  readonly contentHeightPx: number;
  readonly minGutterPx: number;
  readonly maxHorizontalClipRatio: number;
  readonly panels: readonly CompiledPanelEntry[];
  readonly zStack: readonly CompiledCompositorLayer[];
  readonly totalBreakoutSubjectCount: number;
  readonly totalBreakoutOverflowAreaPx2: number;
  readonly manifestSha256Hex: string;
}

export interface NeighborCriticalZoneCollision {
  readonly ownerPanelId: string;
  readonly subjectId: string;
  readonly subjectLabelKo: string;
  readonly breakoutMode: BreakoutMode;
  readonly neighborPanelId: string;
  readonly zoneId: string;
  readonly zoneLabelKo: string;
  readonly zoneKind: CriticalZoneKind;
  readonly overlapAreaPx2: number;
  readonly penetrationDepthPx: number;
  readonly requiredVerticalShiftPx: number;
}

export interface CanvasHorizontalClipViolation {
  readonly panelId: string;
  readonly subjectId: string;
  readonly subjectLabelKo: string;
  readonly breakoutMode: BreakoutMode;
  readonly totalAreaPx2: number;
  readonly clippedOutsideAreaPx2: number;
  readonly clippedOutsideRatio: number;
  readonly maxAllowedRatio: number;
  readonly leftOverflowPx: number;
  readonly rightOverflowPx: number;
}

export interface BreakoutCollisionAudit {
  readonly passed: boolean;
  readonly verdict: "pass" | "warn" | "fail";
  readonly neighborCriticalZoneCollisionCount: number;
  readonly canvasHorizontalClipViolationCount: number;
  readonly neighborCriticalZoneCollisions: readonly NeighborCriticalZoneCollision[];
  readonly canvasHorizontalClipViolations: readonly CanvasHorizontalClipViolation[];
  readonly totalBreakoutSubjectCount: number;
  readonly totalBreakoutOverflowAreaPx2: number;
  readonly maxHorizontalClipRatioObserved: number;
  readonly zeroOverflowBreakoutSubjectIds: readonly string[];
}

export interface PanelGutterShiftRecord {
  readonly panelId: string;
  readonly addedShiftYPx: number;
  readonly reasonKo: string;
}

export interface BreakoutHorizontalClampRecord {
  readonly panelId: string;
  readonly subjectId: string;
  readonly shiftXPx: number;
  readonly scaleX: number;
  readonly beforeClipRatio: number;
  readonly afterClipRatio: number;
}

export interface SolveBreakoutLayoutOptions {
  readonly safetyPaddingPx?: number;
  readonly canvasSafeMarginPx?: number;
  readonly maxIterations?: number;
}

export interface CollisionFreeBreakoutSolveResult {
  readonly solved: boolean;
  readonly iterationsUsed: number;
  readonly totalAddedGutterPx: number;
  readonly gutterShifts: readonly PanelGutterShiftRecord[];
  readonly horizontalClamps: readonly BreakoutHorizontalClampRecord[];
  readonly beforeCompiled: CompiledPanelBreakoutLayout;
  readonly beforeAudit: BreakoutCollisionAudit;
  readonly afterDocument: PanelBreakoutDocument;
  readonly afterCompiled: CompiledPanelBreakoutLayout;
  readonly afterAudit: BreakoutCollisionAudit;
}
