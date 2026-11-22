/**
 * 절차적 만화 효과선 벡터 생성기 공용 타입 정의.
 */

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface RectCutFrame {
  readonly kind: "rect";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PolygonCutFrame {
  readonly kind: "polygon";
  /** 볼록(convex) 컷 프레임 정점 목록(3개 이상). 시계/반시계 모두 허용한다. */
  readonly vertices: readonly Point2D[];
}

export type CutFrameClip = RectCutFrame | PolygonCutFrame;
export type EffectTaperMode = "inward" | "outward" | "both" | "none";
export type ProceduralEffectLineKind = "concentration" | "speed" | "flow" | "burst";
export type CubicBezierControlPoints = readonly [Point2D, Point2D, Point2D, Point2D];

export interface EffectPolygonStrip {
  readonly id: string;
  readonly kind: ProceduralEffectLineKind;
  readonly points: readonly Point2D[];
  readonly centerline: readonly Point2D[];
  readonly width: number;
  readonly opacity: number;
  readonly clipped: boolean;
  readonly svgPath: string;
}

export interface EffectLineBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface ProceduralEffectLineResult {
  readonly kind: ProceduralEffectLineKind;
  readonly seed: number;
  readonly strips: readonly EffectPolygonStrip[];
  readonly combinedSvgPath: string;
  readonly bounds: EffectLineBounds;
  readonly clipFrame: CutFrameClip | null;
  readonly stats: {
    readonly stripCount: number;
    readonly vertexCount: number;
    readonly clippedStripCount: number;
  };
}

export interface ConcentrationEffectLineOptions {
  readonly kind?: "concentration";
  readonly seed: number;
  readonly center: Point2D;
  readonly innerRadiusX: number;
  readonly innerRadiusY: number;
  readonly ellipseRotationDeg?: number;
  readonly outerRadius: number;
  readonly lineCount: number;
  readonly baseWidth: number;
  readonly widthJitter?: number;
  readonly angleJitterDeg?: number;
  readonly innerRadiusJitter?: number;
  readonly lengthJitter?: number;
  readonly unevenSpacing?: number;
  readonly clusterCount?: number;
  readonly taperMode?: EffectTaperMode;
  readonly tipWidth?: number;
  readonly taperExponent?: number;
  readonly excludeAngleDeg?: { readonly from: number; readonly to: number } | null;
  readonly opacity?: number;
  readonly clipFrame?: CutFrameClip | null;
}

export interface SpeedEffectLineOptions {
  readonly kind?: "speed";
  readonly seed: number;
  readonly center: Point2D;
  readonly angleDeg: number;
  readonly spanWidth: number;
  readonly length: number;
  readonly lineCount: number;
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly unevenSpacing?: number;
  readonly positionJitter?: number;
  readonly lengthJitter?: number;
  readonly taperMode?: EffectTaperMode;
  readonly dashEnabled?: boolean;
  readonly dashLength?: number;
  readonly gapLength?: number;
  readonly dashJitter?: number;
  readonly opacity?: number;
  readonly clipFrame?: CutFrameClip | null;
}

export interface FlowEffectLineOptions {
  readonly kind?: "flow";
  readonly seed: number;
  readonly curve: CubicBezierControlPoints;
  readonly lineCount: number;
  readonly bandWidth: number;
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly samplesPerLine?: number;
  readonly unevenSpacing?: number;
  readonly offsetJitter?: number;
  readonly trimJitter?: number;
  readonly taperMode?: EffectTaperMode;
  readonly dashEnabled?: boolean;
  readonly dashLength?: number;
  readonly gapLength?: number;
  readonly opacity?: number;
  readonly clipFrame?: CutFrameClip | null;
}

export interface BurstEffectLineOptions {
  readonly kind?: "burst";
  readonly seed: number;
  readonly center: Point2D;
  readonly innerRadiusX: number;
  readonly innerRadiusY: number;
  readonly outerRadius: number;
  readonly spikeCount: number;
  readonly spikeJitter?: number;
  readonly rotationDeg?: number;
  readonly burstStyle?: "star-shockwave" | "spike-wedges" | "star-plus-rays";
  readonly baseWidth?: number;
  readonly secondaryRayCount?: number;
  readonly opacity?: number;
  readonly clipFrame?: CutFrameClip | null;
}

export type ProceduralEffectLineConfig =
  | ({ readonly kind: "concentration" } & Omit<ConcentrationEffectLineOptions, "kind">)
  | ({ readonly kind: "speed" } & Omit<SpeedEffectLineOptions, "kind">)
  | ({ readonly kind: "flow" } & Omit<FlowEffectLineOptions, "kind">)
  | ({ readonly kind: "burst" } & Omit<BurstEffectLineOptions, "kind">);

export interface ProceduralEffectLinePreset {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly config: ProceduralEffectLineConfig;
}
