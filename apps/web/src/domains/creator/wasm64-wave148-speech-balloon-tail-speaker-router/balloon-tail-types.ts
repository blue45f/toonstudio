/**
 * Wave 148 — 웹툰 컷별 말풍선 꼬리(Tail) 기하 곡선 · 화자 얼굴 자동 조준 &
 * 인접 얼굴·꼬리 교차 제로 라우터 공용 타입 및 5종 꼬리 스타일 프리셋.
 */

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
}

export type OffPanelEdge = "left" | "right" | "top" | "bottom";

export const BALLOON_TAIL_STYLE_IDS = [
  "classic-curved-pointer",
  "sharp-shout-spike",
  "thought-bubble-dots",
  "off-panel-edge-arrow",
  "whisper-thin-curve",
] as const;

export type BalloonTailStyleId = (typeof BALLOON_TAIL_STYLE_IDS)[number];

export interface BalloonTailStylePreset {
  readonly id: BalloonTailStyleId;
  readonly labelKo: string;
  readonly defaultBaseHalfWidthPx: number;
  readonly defaultCurveOffsetPx: number;
  readonly defaultStandoffPx: number;
  readonly defaultThoughtDotCount: number;
  readonly taperControlRatio: number;
  readonly dashedStroke: boolean;
  readonly descriptionKo: string;
}

export const BALLOON_TAIL_STYLE_PRESETS: Readonly<Record<BalloonTailStyleId, BalloonTailStylePreset>> = {
  "classic-curved-pointer": {
    id: "classic-curved-pointer",
    labelKo: "곡선 일반 꼬리",
    defaultBaseHalfWidthPx: 13,
    defaultCurveOffsetPx: 18,
    defaultStandoffPx: 20,
    defaultThoughtDotCount: 0,
    taperControlRatio: 0.34,
    dashedStroke: false,
    descriptionKo: "일반 대사에 쓰는 부드러운 2차 베지어 곡선 꼬리",
  },
  "sharp-shout-spike": {
    id: "sharp-shout-spike",
    labelKo: "날카로운 외침 꼬리",
    defaultBaseHalfWidthPx: 18,
    defaultCurveOffsetPx: 0,
    defaultStandoffPx: 16,
    defaultThoughtDotCount: 0,
    taperControlRatio: 0.5,
    dashedStroke: false,
    descriptionKo: "고함·충격 대사에 쓰는 넓은 기저와 예리한 직선형 꼬리",
  },
  "thought-bubble-dots": {
    id: "thought-bubble-dots",
    labelKo: "속마음 원형 도트",
    defaultBaseHalfWidthPx: 10,
    defaultCurveOffsetPx: 12,
    defaultStandoffPx: 24,
    defaultThoughtDotCount: 4,
    taperControlRatio: 0.35,
    dashedStroke: false,
    descriptionKo: "화자 방향으로 반지름이 점차 줄어드는 3~5개 원 체인 꼬리",
  },
  "off-panel-edge-arrow": {
    id: "off-panel-edge-arrow",
    labelKo: "화면 밖 경계 화살표",
    defaultBaseHalfWidthPx: 12,
    defaultCurveOffsetPx: 0,
    defaultStandoffPx: 18,
    defaultThoughtDotCount: 0,
    taperControlRatio: 0.44,
    dashedStroke: false,
    descriptionKo: "컷 바깥에 있는 화자의 방향을 컷 경계 쪽으로 가리키는 꼬리",
  },
  "whisper-thin-curve": {
    id: "whisper-thin-curve",
    labelKo: "속삭임 얇은 곡선",
    defaultBaseHalfWidthPx: 6,
    defaultCurveOffsetPx: 14,
    defaultStandoffPx: 20,
    defaultThoughtDotCount: 0,
    taperControlRatio: 0.3,
    dashedStroke: true,
    descriptionKo: "작은 목소리·혼잣말에 쓰는 가늘고 점선 처리된 곡선 꼬리",
  },
};

export interface SpeakerAnchorSpec {
  readonly speakerId: string;
  readonly nameKo: string;
  readonly faceBounds: Rect2D;
  readonly mouthPos: Vec2;
  readonly isOffPanel?: boolean;
  readonly offPanelEdge?: OffPanelEdge;
}

export interface SpeechBalloonTailSpec {
  readonly balloonId: string;
  readonly speakerId: string;
  readonly centerX: number;
  readonly centerY: number;
  readonly rx: number;
  readonly ry: number;
  readonly tailStyle: BalloonTailStyleId;
  readonly preferredAnchorAngleDeg?: number;
  readonly tipStandoffPx?: number;
  readonly baseHalfWidthPx?: number;
  readonly curveOffsetPx?: number;
  readonly thoughtDotCount?: number;
  readonly dialoguePreviewKo?: string;
}

export interface PanelBalloonTailDocument {
  readonly panelId: string;
  readonly titleKo?: string;
  readonly panelBounds: Rect2D;
  readonly speakers: readonly SpeakerAnchorSpec[];
  readonly balloons: readonly SpeechBalloonTailSpec[];
}

export interface ThoughtBubbleDot {
  readonly center: Vec2;
  readonly radius: number;
}

export interface BalloonTailBuildOverride {
  readonly anchorAngleDeg?: number;
  readonly curveOffsetPx?: number;
  readonly tipApproachAngleOffsetDeg?: number;
  readonly tipStandoffPx?: number;
  readonly offPanelEdgeTargetOffsetPx?: number;
  readonly customTip?: Vec2;
}

export interface BuiltBalloonTailGeometry {
  readonly balloonId: string;
  readonly speakerId: string;
  readonly tailStyle: BalloonTailStyleId;
  readonly anchorAngleDeg: number;
  readonly anchorPoint: Vec2;
  readonly baseLeft: Vec2;
  readonly baseRight: Vec2;
  readonly baseHalfWidthPx: number;
  readonly leftControl: Vec2;
  readonly rightControl: Vec2;
  readonly centerControl: Vec2;
  readonly curveOffsetPx: number;
  readonly tip: Vec2;
  readonly aimTarget: Vec2;
  readonly tipDirectionUnit: Vec2;
  readonly tipStandoffPx: number;
  readonly distanceTipToMouthPx: number;
  readonly tipInsideSpeakerFace: boolean;
  readonly arcLengthPx: number;
  readonly centerlineSamples: readonly Vec2[];
  readonly outlinePolygon: readonly Vec2[];
  readonly svgPathD: string;
  readonly thoughtDots: readonly ThoughtBubbleDot[];
  readonly offPanelEdge: OffPanelEdge | null;
  readonly dashedStroke: boolean;
  readonly bounds: Bounds2D;
}

export type BalloonTailDefectKind =
  | "tail-crosses-other-face"
  | "tail-tail-crossing"
  | "tail-pierces-speaker-face"
  | "ambiguous-speaker-aim";

export interface BalloonTailDefect {
  readonly kind: BalloonTailDefectKind;
  readonly severity: "error" | "warn";
  readonly balloonId: string;
  readonly otherBalloonId: string | null;
  readonly speakerId: string;
  readonly blockingSpeakerId: string | null;
  readonly intersectionPoint: Vec2;
  readonly detailKo: string;
}

export interface SpeakerAimDiagnostic {
  readonly balloonId: string;
  readonly speakerId: string;
  readonly aimAngleErrorDeg: number;
  readonly speakerForwardDistPx: number;
  readonly speakerPerpDistPx: number;
  readonly closestCompetingSpeakerId: string | null;
  readonly closestCompetingRayCostPx: number | null;
  readonly speakerRayCostPx: number;
  readonly isAmbiguous: boolean;
}

export interface PanelBalloonTailAudit {
  readonly panelId: string;
  readonly passed: boolean;
  readonly verdict: "pass" | "warn" | "fail";
  readonly totalDefectCount: number;
  readonly faceCrossingCount: number;
  readonly tailCrossingCount: number;
  readonly speakerFacePiercingCount: number;
  readonly ambiguousAimCount: number;
  readonly missingSpeakerBalloonIds: readonly string[];
  readonly defects: readonly BalloonTailDefect[];
  readonly speakerAimDiagnostics: readonly SpeakerAimDiagnostic[];
}

export interface BalloonTailRouterOptions {
  readonly maxCandidatesPerBalloon?: number;
  readonly beamWidth?: number;
  readonly preferredFaceClearancePx?: number;
  readonly preferredTailSeparationPx?: number;
}

export interface BalloonTailRoutingComparison {
  readonly baselineDefectCount: number;
  readonly routedDefectCount: number;
  readonly resolvedDefectCount: number;
  readonly baselineFaceCrossings: number;
  readonly routedFaceCrossings: number;
  readonly resolvedFaceCrossings: number;
  readonly baselineTailCrossings: number;
  readonly routedTailCrossings: number;
  readonly resolvedTailCrossings: number;
  readonly baselineFacePiercings: number;
  readonly routedFacePiercings: number;
  readonly resolvedFacePiercings: number;
  readonly baselineAmbiguousAims: number;
  readonly routedAmbiguousAims: number;
  readonly resolvedAmbiguousAims: number;
  readonly defectReductionRatio: number;
  readonly allDefectsResolved: boolean;
}

export interface BalloonTailRoutingResult {
  readonly panelId: string;
  readonly baselineTails: readonly BuiltBalloonTailGeometry[];
  readonly baselineAudit: PanelBalloonTailAudit;
  readonly routedTails: readonly BuiltBalloonTailGeometry[];
  readonly routedAudit: PanelBalloonTailAudit;
  readonly comparison: BalloonTailRoutingComparison;
  readonly evaluatedCandidateCount: number;
  readonly tailRoutingSha256Hex: string;
}
