/**
 * 원근 투시자(1·2·3·5점 어안) · N-축 대칭자 · 등분 분할자 0ms 자석 스냅 엔진 공용 타입.
 */

export interface SnapPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface PointerSnapInput {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number;
  readonly dx?: number;
  readonly dy?: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
}

export type PerspectiveMode = "1p" | "2p" | "3p" | "5p-fisheye";

export interface VanishingPointSpec {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export interface FivePointFisheyeConfig {
  readonly centerX: number;
  readonly centerY: number;
  readonly radius: number;
  readonly rotationDeg?: number;
  readonly curvature?: number;
  readonly outsidePolicy?: "clamp" | "passthrough";
}

export interface PerspectiveRulerConfig {
  readonly enabled: boolean;
  readonly mode: PerspectiveMode;
  readonly vanishingPoints: readonly VanishingPointSpec[];
  readonly horizonAngleDeg?: number;
  readonly allowHorizonAxis?: boolean;
  readonly allowVerticalAxis?: boolean;
  readonly fisheye?: FivePointFisheyeConfig;
  readonly minLockDistancePx?: number;
  readonly maxSnapAngleDeg?: number;
}

export type SymmetryRulerMode = "off" | "mirror" | "quad" | "radial" | "kaleidoscope";

export interface SymmetryRulerConfig {
  readonly enabled: boolean;
  readonly mode: SymmetryRulerMode;
  readonly centerX: number;
  readonly centerY: number;
  readonly axisAngleDeg?: number;
  readonly axesCount?: number;
  readonly snapToAxisThresholdPx?: number;
}

export type DivisionRulerMode = "equal" | "rule-of-thirds" | "golden-ratio";

export interface DivisionFrameRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DivisionRulerConfig {
  readonly enabled: boolean;
  readonly mode: DivisionRulerMode;
  readonly frame: DivisionFrameRect;
  readonly columns?: number;
  readonly rows?: number;
  readonly snapThresholdPx?: number;
  readonly includeFrameEdges?: boolean;
  readonly snapIntersections?: boolean;
}

export interface MagneticRulerEngineConfig {
  readonly perspective?: PerspectiveRulerConfig | null;
  readonly symmetry?: SymmetryRulerConfig | null;
  readonly division?: DivisionRulerConfig | null;
  readonly priority?: "nearest" | "perspective-first" | "division-first";
}

export interface SymmetryAffineTransform {
  readonly branchIndex: number;
  readonly reflected: boolean;
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly tx: number;
  readonly ty: number;
}

export interface SymmetryMirroredPoint {
  readonly branchIndex: number;
  readonly reflected: boolean;
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly dx: number;
  readonly dy: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
}

export interface FivePointFisheyeVanishingPoints {
  readonly center: SnapPoint2D;
  readonly left: SnapPoint2D;
  readonly right: SnapPoint2D;
  readonly top: SnapPoint2D;
  readonly bottom: SnapPoint2D;
}

export type FivePointFisheyeAxisFamily =
  | "fisheye-horizontal"
  | "fisheye-vertical"
  | "fisheye-radial";

export interface LockedFisheyeAxis {
  readonly kind: "fisheye";
  readonly axisId: FivePointFisheyeAxisFamily;
  readonly config: Required<FivePointFisheyeConfig>;
  readonly startLocal: SnapPoint2D;
  readonly arcCenterLocal: SnapPoint2D | null;
  readonly arcRadius: number | null;
  readonly lineDirLocal: SnapPoint2D | null;
}

export interface LockedLinearPerspectiveAxis {
  readonly kind: "linear";
  readonly axisId: string;
  readonly origin: SnapPoint2D;
  readonly dir: SnapPoint2D;
}

export interface LockedDivisionAxis {
  readonly kind: "division";
  readonly axisId: string;
  readonly orientation: "vertical" | "horizontal";
  readonly coordinate: number;
  readonly frame: DivisionFrameRect;
}

export type LockedGuideAxis =
  | LockedLinearPerspectiveAxis
  | LockedFisheyeAxis
  | LockedDivisionAxis;

export interface MagneticRulerSnapSession {
  readonly config: MagneticRulerEngineConfig;
  readonly start: SnapPoint2D;
  readonly lockedAxis: LockedGuideAxis | null;
  readonly freehandPassthrough: boolean;
  readonly symmetryTransforms: readonly SymmetryAffineTransform[];
}

export type MagneticSnapKind =
  | "none"
  | "perspective-1p"
  | "perspective-2p"
  | "perspective-3p"
  | "perspective-5p-fisheye"
  | "division"
  | "symmetry-axis";

export interface MagneticRulerSnapStepResult {
  readonly session: MagneticRulerSnapSession;
  readonly point: SnapPoint2D;
  readonly snapped: boolean;
  readonly snapKind: MagneticSnapKind;
  readonly axisId: string | null;
  readonly distanceToGuidePx: number;
  readonly mirroredPoints: readonly SymmetryMirroredPoint[];
}

export interface MagneticRulerStrokeResult {
  readonly primaryStroke: readonly SnapPoint2D[];
  readonly mirroredStrokes: readonly (readonly SymmetryMirroredPoint[])[];
  readonly lockedKind: MagneticSnapKind;
  readonly lockedAxisId: string | null;
  readonly maxResidualErrorPx: number;
}

export interface DivisionGuideLine {
  readonly id: string;
  readonly orientation: "vertical" | "horizontal";
  readonly ratio: number;
  readonly coordinate: number;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface DivisionGuideSet {
  readonly verticals: readonly DivisionGuideLine[];
  readonly horizontals: readonly DivisionGuideLine[];
  readonly intersections: readonly SnapPoint2D[];
}

export interface OverlayLineSegment {
  readonly id: string;
  readonly category: "perspective" | "horizon" | "symmetry" | "division";
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface OverlayPolylineGuide {
  readonly id: string;
  readonly category: "fisheye-arc" | "fisheye-rim";
  readonly points: readonly SnapPoint2D[];
  readonly svgPath: string;
}

export interface MagneticRulerOverlayGeometry {
  readonly lines: readonly OverlayLineSegment[];
  readonly polylines: readonly OverlayPolylineGuide[];
  readonly vanishingPoints: readonly VanishingPointSpec[];
  readonly intersections: readonly SnapPoint2D[];
}
