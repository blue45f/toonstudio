/**
 * 글로벌 무료 마스터 브러시 60종 컬렉션의 강타입 도메인 계약.
 *
 * 기존 Core+Pro(246종) + MyPaint CC0(196종) = 442종에 더해,
 * 글로벌 대표 브러시 60종을 100% 무료 기본 내장(총 502종)으로 제공하기 위한
 * 물리·스탬프·듀얼팁·입자·KM7 혼색 및 2D 캔버스 렌더러 타입을 정의한다.
 */

export const GLOBAL_MASTER_BRUSH_CATEGORY_IDS = [
  "webtoon-ink",
  "rofan-deco",
  "nature-foliage",
  "oriental-calligraphy",
  "granulating-watercolor",
  "impasto-oil",
  "alcohol-marker",
  "graphite-pastel",
  "light-fx-glitter",
  "manga-tone-speed",
  "hair-fabric-surface",
  "blender-eraser-pro",
] as const;

export type GlobalMasterBrushCategory =
  (typeof GLOBAL_MASTER_BRUSH_CATEGORY_IDS)[number];

export type GlobalMasterCompetitorSource =
  | "CSP"
  | "Procreate"
  | "Photoshop"
  | "Rebelle"
  | "ibisPaint"
  | "PaintTool SAI"
  | "Krita";

export type GlobalMasterBrushLocale = "ko" | "en";

export type GlobalMasterRgbTuple = readonly [
  red: number,
  green: number,
  blue: number,
];

export type GlobalMasterBlendBehavior =
  | "normal"
  | "multiply"
  | "screen"
  | "additive-glow"
  | "smudge"
  | "erase"
  | "chroma-bleed";

export type GlobalMasterTipShape =
  | "gpen-nib"
  | "maru-hairline"
  | "rough-sumi-nib"
  | "speed-dip"
  | "felt-liner"
  | "frill-ribbon"
  | "antique-lace"
  | "diamond-brooch-chain"
  | "pearl-strand"
  | "gold-embroidery"
  | "watercolor-cloud"
  | "sakura-petal"
  | "broadleaf-cluster"
  | "grass-tuft"
  | "rose-blossom"
  | "dry-sumi"
  | "hanji-bleed"
  | "hangul-fine"
  | "flat-calligraphy"
  | "ink-splatter"
  | "granulating-wash"
  | "wet-edge-backrun"
  | "flat-wash"
  | "salt-crystal"
  | "wet-bleed"
  | "palette-knife"
  | "hog-filbert"
  | "bristle-rib"
  | "wet-oil-mix"
  | "gold-foil"
  | "copic-brush"
  | "chisel-marker"
  | "alcohol-blender"
  | "dry-board-marker"
  | "highlighter"
  | "graphite-6b"
  | "square-charcoal"
  | "pastel-chalk"
  | "oil-pastel"
  | "colored-pencil"
  | "neon-rim"
  | "sparkle-bokeh"
  | "anamorphic-flare"
  | "nebula-dust"
  | "magic-rune"
  | "focus-speedline"
  | "crosshatch-pen"
  | "halftone-dot"
  | "sand-noise"
  | "action-speed"
  | "glossy-hair"
  | "braid-plait"
  | "brick-mortar"
  | "knit-weave"
  | "fur-tuft"
  | "wet-blender"
  | "oil-smudge"
  | "kneaded-eraser"
  | "micro-eraser"
  | "chroma-bleed";

export interface GlobalMasterTipProfile {
  readonly shape: GlobalMasterTipShape;
  /** 세로 대비 가로 비율(0.12 ~ 1.0). 낮을수록 납작한 칼끝·평붓 형태. */
  readonly aspectRatio: number;
  /** 기본 팁 회전 각도(도, -180 ~ 180). */
  readonly angleDeg: number;
  /** 가장자리 경도(0 = 극도로 부드러움, 1 = 날카로운 잉크 엣지). */
  readonly hardness: number;
  /** 강모/섬유 가닥 수(1 = 단일 팁, 2 이상 = 다중 브리스틀·헤어·해칭). */
  readonly bristleCount: number;
  /** 강모 간격 및 불규칙 갈필 편차(0 ~ 1). */
  readonly bristleJitter: number;
  /** 스트로크 접선 방향 자동 추적 여부. */
  readonly followDirection: boolean;
  /** 장식 리본·체인·평붓 폭 확장 계수(0.5 ~ 2.4). */
  readonly ribbonWidthFactor: number;
}

export type GlobalMasterDualTipShape =
  | "fine-grain-ring"
  | "bristle-rake"
  | "cold-press-speckle"
  | "lace-eyelet"
  | "sparkle-halo"
  | "halftone-mesh"
  | "dry-crack"
  | "oil-ridge"
  | "fiber-weave"
  | "salt-bloom";

export type GlobalMasterDualTipBlendMode =
  | "multiply"
  | "subtract"
  | "darken"
  | "screen"
  | "overlay";

export interface GlobalMasterDualTipProfile {
  readonly enabled: boolean;
  readonly shape: GlobalMasterDualTipShape;
  readonly blendMode: GlobalMasterDualTipBlendMode;
  readonly scaleRatio: number;
  readonly spacingRatio: number;
  readonly rotationOffsetDeg: number;
  readonly opacity: number;
}

export type GlobalMasterGrainKind =
  | "none"
  | "smooth-bristol"
  | "cold-press-cotton"
  | "rough-arches"
  | "hanji-mulberry"
  | "linen-canvas"
  | "tooth-charcoal"
  | "mineral-granulation"
  | "screentone-paper"
  | "metallic-foil"
  | "woven-fabric";

export interface GlobalMasterGrainTexture {
  readonly kind: GlobalMasterGrainKind;
  readonly scale: number;
  readonly contrast: number;
  readonly depth: number;
  readonly invert: boolean;
  readonly paperAbsorption: number;
}

export interface GlobalMasterScattering {
  /** 스트로크 수직 방향 산란 반경 배수(0 ~ 3.0). */
  readonly scatterX: number;
  /** 스트로크 진행 방향 산란 반경 배수(0 ~ 2.5). */
  readonly scatterY: number;
  /** 스텝당 기본 입자/스탬프 개수(1 ~ 10). */
  readonly count: number;
  /** 스텝당 개수 변동률(0 ~ 1). */
  readonly countJitter: number;
  /** 양축 산란 활성화 여부. */
  readonly bothAxes: boolean;
}

export interface GlobalMasterColorJitter {
  /** 색상(Hue) 최대 편차(도, 0 ~ 60). */
  readonly hue: number;
  /** 채도(Saturation) 변동 폭(0 ~ 0.6). */
  readonly saturation: number;
  /** 명도(Luminance) 변동 폭(0 ~ 0.5). */
  readonly luminance: number;
  /** 댑마다 색 변동을 적용할지 여부. */
  readonly perDab: boolean;
}

export interface GlobalMasterPressureCurve {
  /** 필압 감마(0.45 = 약한 필압에도 굵게, 1.0 = 선형, 1.8 = 강한 필압에서 급격히 굵게). */
  readonly gamma: number;
  /** 최소 필압 시 크기 비율(0.02 ~ 0.95). */
  readonly minSizeRatio: number;
  /** 최소 필압 시 불투명도 비율(0.05 ~ 1.0). */
  readonly minOpacityRatio: number;
  /** 속도 연동 강도(-0.6 ~ 0.6; 양수면 빠를수록 얇고 날카롭게). */
  readonly velocityInfluence: number;
  /** 스타일러스 기울기 쉐이딩 반응(0 ~ 1). */
  readonly tiltShading: number;
}

export interface GlobalMasterBrushPreset {
  readonly id: string;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly category: GlobalMasterBrushCategory;
  readonly competitorEquivalents: readonly string[];
  readonly competitorSources: readonly GlobalMasterCompetitorSource[];
  readonly freeByDefault: true;
  readonly tipProfile: GlobalMasterTipProfile;
  readonly dualTipProfile: GlobalMasterDualTipProfile | null;
  readonly grainTexture: GlobalMasterGrainTexture;
  readonly scattering: GlobalMasterScattering;
  /** 회전 지터 강도(0 = 고정, 1 = 360도 전방위 무작위 회전). */
  readonly rotationJitter: number;
  readonly colorJitter: GlobalMasterColorJitter;
  /** 습도·웨트 엣지 확산 강도(0 ~ 1). */
  readonly wetness: number;
  /** 유화·임파스토 물감 두께 융기 높이(0 ~ 1). */
  readonly impastoHeight: number;
  /** Kubelka-Munk 7채널 분광 안료 혼색 비율(0 ~ 1). */
  readonly km7PigmentMix: number;
  /** 스트로크 시작 테이퍼 구간(0 ~ 0.5). */
  readonly taperStart: number;
  /** 스트로크 끝 테이퍼 구간(0 ~ 0.5). */
  readonly taperEnd: number;
  readonly pressureCurve: GlobalMasterPressureCurve;
  /** 댑 간격 비율(브러시 지름 대비 0.04 ~ 1.5). */
  readonly spacing: number;
  readonly defaultSizePx: number;
  readonly defaultOpacity: number;
  readonly signatureFeelKo: string;
  readonly signatureFeelEn: string;
  readonly defaultInkRgb: GlobalMasterRgbTuple;
  readonly blendBehavior: GlobalMasterBlendBehavior;
  readonly searchKeywords: readonly string[];
}

export interface GlobalMasterCategoryMeta {
  readonly id: GlobalMasterBrushCategory;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly count: number;
}

export interface GlobalMasterBrushCounts {
  readonly coreAndPro: 246;
  readonly mypaintCc0: 196;
  readonly globalMaster: 60;
  readonly totalFreeSelectable: 502;
}

export interface GlobalMasterStrokePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
  readonly timestampMs?: number;
}

export interface GlobalMasterBrushDab {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly angleRad: number;
  readonly opacity: number;
  readonly pressure: number;
  readonly progress: number;
  readonly seed: number;
  readonly rgb: GlobalMasterRgbTuple;
  readonly wetEdgeStrength: number;
  readonly impastoRidge: number;
  readonly grainFactor: number;
  readonly dualTipScale: number;
  readonly dualTipAngleRad: number;
  readonly tipShape: GlobalMasterTipShape;
  readonly blendBehavior: GlobalMasterBlendBehavior;
}

export interface GenerateMasterBrushDabsOptions {
  readonly sizeScale?: number;
  readonly inkRgb?: GlobalMasterRgbTuple;
  readonly maxDabs?: number;
}

export interface RenderMasterBrushStrokeOptions {
  readonly sizeScale?: number;
  readonly inkRgb?: GlobalMasterRgbTuple;
  readonly darkPaper?: boolean;
  readonly clearCanvas?: boolean;
  readonly maxDabs?: number;
}

export interface GlobalMasterStrokeRenderResult {
  readonly presetId: string;
  readonly dabCount: number;
  readonly boundingWidth: number;
  readonly boundingHeight: number;
}
