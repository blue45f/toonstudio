/**
 * Wave 106 — 3D 루미스 두상 턴어라운드 리깅 타입 계약, 7종 표정 프리셋 테이블 및 기본 캐논 시트 생성기.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type CharacterStyleArchetype =
  | "webtoon-realistic"
  | "webtoon-stylized"
  | "chibi-expressive"
  | "action-seinen";

export type AsymmetricLandmarkKind =
  | "scar"
  | "beauty-mark"
  | "eyepatch"
  | "earring"
  | "hair-part";

export type AnatomicalSide = "anatomical-left" | "anatomical-right";

export type ScreenSide = "screen-left" | "screen-right" | "center";

export type ExpressionPresetId =
  | "neutral"
  | "joy-grin"
  | "anger-glare"
  | "shock-wide"
  | "sad-teary"
  | "smirk-confident"
  | "exhausted-sigh";

export type ComicExpressionMarkerKind =
  | "blush-lines"
  | "anger-vein"
  | "sweat-drop"
  | "shock-lines"
  | "tear-glint"
  | "confident-glint"
  | "eye-bag-hatch"
  | "sigh-puff";

export interface EarSpanCanon {
  /** 귀 상단 위치 (정수리=0.0, 턱=1.0 기준; 루미스 기준 눈썹선 일치). */
  readonly topRatioFromCrown: number;
  /** 귀 하단 위치 (정수리=0.0, 턱=1.0 기준; 루미스 기준 코밑선 일치). */
  readonly bottomRatioFromCrown: number;
}

export interface AsymmetricFacialLandmark {
  readonly landmarkId: string;
  readonly kind: AsymmetricLandmarkKind;
  readonly labelKo: string;
  readonly anatomicalSide: AnatomicalSide;
  /** 정면 중심선(0°)에서 해당 해부학적 측면(귀=90°, 후두부=180°)까지의 표면 방위각(도, 0..180). */
  readonly surfaceAngleDeg: number;
  /** 정수리(0.0)에서 턱 끝(1.0)까지의 정규화 수직 위치(0.02..0.98). */
  readonly elevationNorm: number;
  /** 시각적 표기 크기 배율(0.4..2.5, 기본 1.0). */
  readonly sizeScale?: number;
}

export interface CharacterHeadCanonSheet {
  readonly characterId: string;
  readonly characterName: string;
  readonly sheetVersion: string;
  readonly styleArchetype?: CharacterStyleArchetype;
  readonly headWidthToHeightRatio: number;
  readonly eyeLineVerticalRatio: number;
  readonly eyeSpacingInEyeWidths: number;
  readonly noseLengthRatio: number;
  readonly chinTaperSharpness: number;
  readonly jawHeightRatio: number;
  readonly earSpanStartToEnd: EarSpanCanon;
  readonly hairVolumeCrownScale: number;
  readonly asymmetricLandmarks: readonly AsymmetricFacialLandmark[];
}

export interface HeadViewAngle {
  readonly yawDeg: number;
  readonly pitchDeg: number;
}

export interface HeadProjectionOptions {
  readonly headScalePx?: number;
  readonly originPx?: Vec2;
  readonly occlusionThreshold?: number;
}

export interface ExpressionRigParameters {
  readonly presetId: ExpressionPresetId;
  readonly labelKo: string;
  readonly eyeOpennessLeft: number;
  readonly eyeOpennessRight: number;
  readonly pupilScale: number;
  readonly browSlantLeftDeg: number;
  readonly browSlantRightDeg: number;
  readonly browElevationOffsetNorm: number;
  readonly mouthCurvature: number;
  readonly mouthOpenness: number;
  readonly mouthSkew: number;
  readonly comicMarkers: readonly ComicExpressionMarkerKind[];
}

export interface ProjectedPoint3D {
  readonly position3D: Vec3;
  readonly position2D: Vec2;
  readonly visible: boolean;
}

export interface ProjectedCanonGuideRails {
  readonly crownY: number;
  readonly hairCrownY: number;
  readonly browY: number;
  readonly eyeY: number;
  readonly noseY: number;
  readonly mouthY: number;
  readonly chinY: number;
}

export interface ProjectedCranialBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly widthToHeightRatio: number;
}

export interface ProjectedLoomisSidePlane {
  readonly anatomicalSide: AnatomicalSide;
  readonly center2D: Vec2;
  readonly radiusXPx: number;
  readonly radiusYPx: number;
  readonly normalDotView: number;
  readonly visible: boolean;
}

export interface ProjectedEyeFeature {
  readonly anatomicalSide: AnatomicalSide;
  readonly center2D: Vec2;
  readonly innerCorner2D: Vec2;
  readonly outerCorner2D: Vec2;
  readonly widthPx: number;
  readonly apertureHeightPx: number;
  readonly pupilRadiusPx: number;
  readonly opennessFactor: number;
  readonly normalDotView: number;
  readonly visible: boolean;
  readonly screenSide: ScreenSide;
}

export interface ProjectedBrowFeature {
  readonly anatomicalSide: AnatomicalSide;
  readonly inner2D: Vec2;
  readonly peak2D: Vec2;
  readonly outer2D: Vec2;
  readonly slantDeg: number;
  readonly normalDotView: number;
  readonly visible: boolean;
}

export interface ProjectedNoseFeature {
  readonly bridge2D: Vec2;
  readonly tip2D: Vec2;
  readonly base2D: Vec2;
  readonly normalDotView: number;
  readonly visible: boolean;
  readonly profileProtrusionPx: number;
}

export interface ProjectedMouthFeature {
  readonly leftCorner2D: Vec2;
  readonly centerTop2D: Vec2;
  readonly centerBottom2D: Vec2;
  readonly rightCorner2D: Vec2;
  readonly curvature: number;
  readonly openness: number;
  readonly skew: number;
  readonly normalDotView: number;
  readonly visible: boolean;
}

export interface ProjectedEarFeature {
  readonly anatomicalSide: AnatomicalSide;
  readonly top2D: Vec2;
  readonly outer2D: Vec2;
  readonly bottom2D: Vec2;
  readonly normalDotView: number;
  readonly visible: boolean;
  readonly screenSide: ScreenSide;
}

export interface ProjectedAsymmetricLandmark {
  readonly landmarkId: string;
  readonly kind: AsymmetricLandmarkKind;
  readonly labelKo: string;
  readonly anatomicalSide: AnatomicalSide;
  readonly surfaceAngleDeg: number;
  readonly elevationNorm: number;
  readonly position3D: Vec3;
  readonly normal3D: Vec3;
  readonly position2D: Vec2;
  readonly normalDotView: number;
  readonly occlusionThreshold: number;
  readonly visible: boolean;
  readonly expectedScreenSide: ScreenSide;
  readonly sizePx: number;
}

export interface ProjectedComicMarker {
  readonly kind: ComicExpressionMarkerKind;
  readonly anchor2D: Vec2;
  readonly scalePx: number;
  readonly visible: boolean;
}

export interface ProjectedCharacterHeadView {
  readonly characterId: string;
  readonly characterName: string;
  readonly viewAngle: HeadViewAngle;
  readonly expressionPreset: ExpressionPresetId;
  readonly expressionParams: ExpressionRigParameters;
  readonly headScalePx: number;
  readonly originPx: Vec2;
  readonly canonGuideRails: ProjectedCanonGuideRails;
  readonly cranialBounds: ProjectedCranialBounds;
  readonly craniumSphere: {
    readonly center2D: Vec2;
    readonly radiusXPx: number;
    readonly radiusYPx: number;
    readonly leftSidePlane: ProjectedLoomisSidePlane;
    readonly rightSidePlane: ProjectedLoomisSidePlane;
  };
  readonly centerlineCurve: readonly ProjectedPoint3D[];
  readonly browBeltCurve: readonly ProjectedPoint3D[];
  readonly jawlineContour: readonly ProjectedPoint3D[];
  readonly hairSilhouetteCurve: readonly ProjectedPoint3D[];
  readonly facialFeatures: {
    readonly leftEye: ProjectedEyeFeature;
    readonly rightEye: ProjectedEyeFeature;
    readonly leftBrow: ProjectedBrowFeature;
    readonly rightBrow: ProjectedBrowFeature;
    readonly nose: ProjectedNoseFeature;
    readonly mouth: ProjectedMouthFeature;
    readonly leftEar: ProjectedEarFeature;
    readonly rightEar: ProjectedEarFeature;
    readonly effectiveEyeSpacingRatio: number;
    readonly effectiveJawToHeadRatio: number;
    readonly effectiveEyeLineVerticalRatio: number;
  };
  readonly asymmetricLandmarks: readonly ProjectedAsymmetricLandmark[];
  readonly activeComicMarkers: readonly ProjectedComicMarker[];
}

export const ALL_EXPRESSION_PRESET_IDS: readonly ExpressionPresetId[] = [
  "neutral",
  "joy-grin",
  "anger-glare",
  "shock-wide",
  "sad-teary",
  "smirk-confident",
  "exhausted-sigh",
];

export const EXPRESSION_PRESET_TABLE: Readonly<Record<ExpressionPresetId, ExpressionRigParameters>> = {
  neutral: {
    presetId: "neutral",
    labelKo: "무표정 (기본)",
    eyeOpennessLeft: 1.0,
    eyeOpennessRight: 1.0,
    pupilScale: 1.0,
    browSlantLeftDeg: 0,
    browSlantRightDeg: 0,
    browElevationOffsetNorm: 0,
    mouthCurvature: 0.0,
    mouthOpenness: 0.04,
    mouthSkew: 0.0,
    comicMarkers: [],
  },
  "joy-grin": {
    presetId: "joy-grin",
    labelKo: "활짝 웃음",
    eyeOpennessLeft: 0.72,
    eyeOpennessRight: 0.72,
    pupilScale: 1.08,
    browSlantLeftDeg: 6,
    browSlantRightDeg: 6,
    browElevationOffsetNorm: -0.018,
    mouthCurvature: 0.92,
    mouthOpenness: 0.56,
    mouthSkew: 0.0,
    comicMarkers: ["blush-lines"],
  },
  "anger-glare": {
    presetId: "anger-glare",
    labelKo: "분노·노려봄",
    eyeOpennessLeft: 0.76,
    eyeOpennessRight: 0.76,
    pupilScale: 0.78,
    browSlantLeftDeg: -22,
    browSlantRightDeg: -22,
    browElevationOffsetNorm: 0.022,
    mouthCurvature: -0.68,
    mouthOpenness: 0.42,
    mouthSkew: -0.08,
    comicMarkers: ["anger-vein"],
  },
  "shock-wide": {
    presetId: "shock-wide",
    labelKo: "경악·놀람",
    eyeOpennessLeft: 1.42,
    eyeOpennessRight: 1.42,
    pupilScale: 0.56,
    browSlantLeftDeg: 14,
    browSlantRightDeg: 14,
    browElevationOffsetNorm: -0.032,
    mouthCurvature: -0.18,
    mouthOpenness: 0.94,
    mouthSkew: 0.0,
    comicMarkers: ["shock-lines", "sweat-drop"],
  },
  "sad-teary": {
    presetId: "sad-teary",
    labelKo: "슬픔·글썽임",
    eyeOpennessLeft: 0.88,
    eyeOpennessRight: 0.88,
    pupilScale: 1.18,
    browSlantLeftDeg: 20,
    browSlantRightDeg: 20,
    browElevationOffsetNorm: -0.008,
    mouthCurvature: -0.54,
    mouthOpenness: 0.14,
    mouthSkew: 0.0,
    comicMarkers: ["tear-glint"],
  },
  "smirk-confident": {
    presetId: "smirk-confident",
    labelKo: "자신감 있는 미소",
    eyeOpennessLeft: 0.82,
    eyeOpennessRight: 0.96,
    pupilScale: 0.94,
    browSlantLeftDeg: 11,
    browSlantRightDeg: -7,
    browElevationOffsetNorm: -0.01,
    mouthCurvature: 0.46,
    mouthOpenness: 0.08,
    mouthSkew: 0.64,
    comicMarkers: ["confident-glint"],
  },
  "exhausted-sigh": {
    presetId: "exhausted-sigh",
    labelKo: "지침·한숨",
    eyeOpennessLeft: 0.36,
    eyeOpennessRight: 0.36,
    pupilScale: 0.86,
    browSlantLeftDeg: 9,
    browSlantRightDeg: 9,
    browElevationOffsetNorm: 0.012,
    mouthCurvature: -0.26,
    mouthOpenness: 0.28,
    mouthSkew: -0.12,
    comicMarkers: ["eye-bag-hatch", "sigh-puff"],
  },
};

/** 표준 웹툰 주인공 비율의 기본 캐릭터 두상 캐논 시트를 생성한다. */
export function createDefaultCharacterHeadCanonSheet(
  overrides?: Partial<CharacterHeadCanonSheet>,
): CharacterHeadCanonSheet {
  const base: CharacterHeadCanonSheet = {
    characterId: "char-canon-01",
    characterName: "강세현",
    sheetVersion: "1.0.0",
    styleArchetype: "webtoon-stylized",
    headWidthToHeightRatio: 0.76,
    eyeLineVerticalRatio: 0.48,
    eyeSpacingInEyeWidths: 1.0,
    noseLengthRatio: 0.19,
    chinTaperSharpness: 0.62,
    jawHeightRatio: 0.32,
    earSpanStartToEnd: {
      topRatioFromCrown: 0.395,
      bottomRatioFromCrown: 0.67,
    },
    hairVolumeCrownScale: 1.12,
    asymmetricLandmarks: [
      {
        landmarkId: "left-cheek-scar",
        kind: "scar",
        labelKo: "왼쪽 뺨 사선 흉터",
        anatomicalSide: "anatomical-left",
        surfaceAngleDeg: 40,
        elevationNorm: 0.58,
      },
      {
        landmarkId: "right-under-eye-mole",
        kind: "beauty-mark",
        labelKo: "오른쪽 눈밑 점",
        anatomicalSide: "anatomical-right",
        surfaceAngleDeg: 28,
        elevationNorm: 0.53,
      },
    ],
  };

  return {
    ...base,
    ...overrides,
    earSpanStartToEnd: overrides?.earSpanStartToEnd ?? base.earSpanStartToEnd,
    asymmetricLandmarks: overrides?.asymmetricLandmarks ?? base.asymmetricLandmarks,
  };
}
