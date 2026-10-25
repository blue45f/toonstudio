/**
 * studio-procreate-brush-presets.ts
 *
 * REA(`reverse-engineer-anything`)를 통해 역공학한 Procreate 18대 기본 브러시 세트(`STUDIO_PROCREATE_BRUSH_SETS`)와
 * 25종 시그니처 프리셋 카탈로그(`STUDIO_PROCREATE_BRUSH_PRESETS`).
 */

import type {
  ProcreateApplePencilSettings,
  ProcreateBrushSetCategoryId,
  ProcreateColorDynamicsSettings,
  ProcreateDualBrushSettings,
  ProcreateDynamicsSettings,
  ProcreateGrainSettings,
  ProcreateMaterials3dSettings,
  ProcreatePropertiesSettings,
  ProcreateRenderingSettings,
  ProcreateShapeSettings,
  ProcreateSilicaBrushConfig,
  ProcreateSilicaBrushPreset,
  ProcreateStabilizationSettings,
  ProcreateStrokePathSettings,
  ProcreateTaperSettings,
  ProcreateWetMixSettings,
} from "./studio-procreate-brush-studio";

export const DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG: ProcreateSilicaBrushConfig = {
  strokePath: {
    plotSpacing01: 0.1,
    plotJitter01: 0,
    fallOff01: 0,
  },
  stabilization: {
    streamlineAmount01: 0.45,
    streamlinePressure01: 0.2,
    stabilizationAmount01: 0.15,
    motionFilteringAmount01: 0.25,
    motionFilteringExpression01: 0.35,
  },
  taper: {
    startLength01: 0.15,
    endLength01: 0.22,
    linkStartAndEnd: false,
    pressureSize01: 0.75,
    pressureOpacity01: 0.25,
    touchSize01: 0.85,
    touchOpacity01: 0.4,
    tipSharpness01: 0.15,
    classicTaper: false,
  },
  shape: {
    scatter01: 0,
    rotationFollowStroke: 1,
    azimuth: false,
    count: 1,
    countJitter01: 0,
    randomized: false,
    flipX: false,
    flipY: false,
    roundness01: 1,
    softness01: 0.1,
  },
  grain: {
    mode: "texturized",
    movementRolling01: 1,
    scale01: 0.35,
    zoom01: 0.5,
    depth01: 0.5,
    depthMinimum01: 0.15,
    depthJitter01: 0,
    blendMode: "multiply",
    brightness: 0,
    contrast: 0.1,
    offsetJitter: true,
  },
  rendering: {
    mode: "intense-glaze",
    wetEdges01: 0.1,
    burntEdges01: 0.05,
    burntEdgesBlendMode: "multiply",
    blendMode: "normal",
  },
  wetMix: {
    dilution01: 0,
    charge01: 0.85,
    attack01: 0.65,
    pull01: 0,
    grade01: 0.5,
    blur01: 0,
    wetJitter01: 0,
  },
  colorDynamics: {
    stampHue01: 0,
    stampSaturation01: 0,
    stampBrightness01: 0,
    stampDarkness01: 0,
    stampSecondaryColor01: 0,
    strokeHue01: 0,
    strokeSaturation01: 0,
    strokeBrightness01: 0,
    strokeSecondaryColor01: 0,
    pressureHue01: 0,
    pressureSaturation01: 0,
    pressureBrightness01: 0,
    pressureSecondaryColor01: 0,
    tiltHue01: 0,
    tiltSaturation01: 0,
    tiltBrightness01: 0,
    tiltSecondaryColor01: 0,
    barrelRollHue01: 0,
    barrelRollSecondaryColor01: 0,
  },
  dynamics: {
    speedSize: 0,
    speedOpacity: 0,
    jitterSize01: 0,
    jitterOpacity01: 0,
  },
  applePencil: {
    pressureSize: 0.65,
    pressureOpacity01: 0.35,
    pressureBleed01: 0.1,
    pressureSoftness01: 0,
    tiltAngleThresholdDeg: 35,
    tiltSize01: 0.45,
    tiltOpacity01: 0.25,
    tiltGradation01: 0.35,
    tiltCompression: true,
    barrelRollAzimuth: false,
  },
  properties: {
    orientToScreen: true,
    smudgePull01: 0.5,
    maxSize01: 0.5,
    minSize01: 0.02,
    maxOpacity01: 1,
    minOpacity01: 0.05,
  },
  materials3d: {
    metallicScale01: 0,
    pressureMetallic01: 0,
    tiltMetallic01: 0,
    roughnessScale01: 0.5,
    pressureRoughness01: 0,
    tiltRoughness01: 0,
  },
  dualBrush: {
    enabled: false,
    blendMode: "multiply",
    secondarySpacing01: 0.12,
    secondarySizeRatio01: 0.85,
  },
  authorName: "ToonStudio Procreate Clean-Room Engine",
};

export function makeProcreatePresetConfig(
  overrides: {
    readonly strokePath?: Partial<ProcreateStrokePathSettings>;
    readonly stabilization?: Partial<ProcreateStabilizationSettings>;
    readonly taper?: Partial<ProcreateTaperSettings>;
    readonly shape?: Partial<ProcreateShapeSettings>;
    readonly grain?: Partial<ProcreateGrainSettings>;
    readonly rendering?: Partial<ProcreateRenderingSettings>;
    readonly wetMix?: Partial<ProcreateWetMixSettings>;
    readonly colorDynamics?: Partial<ProcreateColorDynamicsSettings>;
    readonly dynamics?: Partial<ProcreateDynamicsSettings>;
    readonly applePencil?: Partial<ProcreateApplePencilSettings>;
    readonly properties?: Partial<ProcreatePropertiesSettings>;
    readonly materials3d?: Partial<ProcreateMaterials3dSettings>;
    readonly dualBrush?: Partial<ProcreateDualBrushSettings>;
  } = {},
): ProcreateSilicaBrushConfig {
  return {
    strokePath: { ...DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG.strokePath, ...overrides.strokePath },
    stabilization: {
      ...DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG.stabilization,
      ...overrides.stabilization,
    },
    taper: { ...DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG.taper, ...overrides.taper },
    shape: { ...DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG.shape, ...overrides.shape },
    grain: { ...DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG.grain, ...overrides.grain },
    rendering: { ...DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG.rendering, ...overrides.rendering },
    wetMix: { ...DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG.wetMix, ...overrides.wetMix },
    colorDynamics: {
      ...DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG.colorDynamics,
      ...overrides.colorDynamics,
    },
    dynamics: { ...DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG.dynamics, ...overrides.dynamics },
    applePencil: {
      ...DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG.applePencil,
      ...overrides.applePencil,
    },
    properties: { ...DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG.properties, ...overrides.properties },
    materials3d: {
      ...DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG.materials3d,
      ...overrides.materials3d,
    },
    dualBrush: { ...DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG.dualBrush, ...overrides.dualBrush },
    authorName: DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG.authorName,
  };
}

/**
 * REA로 확인된 Procreate 18대 기본 브러시 라이브러리 카테고리 메타데이터
 */
export const STUDIO_PROCREATE_BRUSH_SETS: readonly {
  readonly id: ProcreateBrushSetCategoryId;
  readonly labelEn: string;
  readonly labelKo: string;
}[] = [
  { id: "sketching", labelEn: "Sketching", labelKo: "스케치" },
  { id: "inking", labelEn: "Inking", labelKo: "잉크" },
  { id: "drawing", labelEn: "Drawing", labelKo: "드로잉" },
  { id: "painting", labelEn: "Painting", labelKo: "페인팅" },
  { id: "artistic", labelEn: "Artistic", labelKo: "아티스틱" },
  { id: "calligraphy", labelEn: "Calligraphy", labelKo: "캘리그라피" },
  { id: "airbrushing", labelEn: "Airbrushing", labelKo: "에어브러시" },
  { id: "textures", labelEn: "Textures", labelKo: "텍스처" },
  { id: "abstract", labelEn: "Abstract", labelKo: "추상" },
  { id: "charcoals", labelEn: "Charcoals", labelKo: "목탄" },
  { id: "elements", labelEn: "Elements", labelKo: "엘리먼트" },
  { id: "spraypaints", labelEn: "Spraypaints", labelKo: "스프레이" },
  { id: "touchups", labelEn: "Touchups", labelKo: "터치업" },
  { id: "vintage", labelEn: "Vintage", labelKo: "빈티지" },
  { id: "luminance", labelEn: "Luminance", labelKo: "루미넌스(발광)" },
  { id: "industrial", labelEn: "Industrial", labelKo: "인더스트리얼" },
  { id: "organic", labelEn: "Organic", labelKo: "오가닉" },
  { id: "water", labelEn: "Water", labelKo: "워터(수채)" },
] as const;

/**
 * Procreate 18대 브러시 세트를 대표하는 25종 핸드크래프트 시그니처 프리셋 카탈로그
 */
export const STUDIO_PROCREATE_BRUSH_PRESETS: readonly ProcreateSilicaBrushPreset[] = [
  {
    id: "procreate-peppermint",
    nameEn: "Peppermint",
    nameKo: "페퍼민트 스케치 펜슬",
    setCategory: "sketching",
    descriptionKo: "가벼운 종이 그레인과 자연스러운 틸트 셰이딩을 갖춘 Procreate 대표 러프 스케치 연필.",
    crafts: ["sketch"],
    config: makeProcreatePresetConfig({
      grain: { mode: "texturized", depth01: 0.62, scale01: 0.28 },
      applePencil: { tiltAngleThresholdDeg: 28, tiltSize01: 0.72, tiltGradation01: 0.55 },
      rendering: { mode: "light-glaze", wetEdges01: 0.05 },
    }),
  },
  {
    id: "procreate-6b-pencil",
    nameEn: "6B Pencil",
    nameKo: "6B 무른 흑연 연필",
    setCategory: "sketching",
    descriptionKo: "진하고 거친 흑연 입자감과 기울기 면적 확장으로 선화와 음영을 동시에 소화하는 연필.",
    crafts: ["sketch", "lineart"],
    config: makeProcreatePresetConfig({
      grain: { mode: "texturized", depth01: 0.78, contrast: 0.35 },
      applePencil: { pressureSize: 0.45, pressureOpacity01: 0.55, tiltSize01: 0.85 },
      rendering: { mode: "intense-glaze", burntEdges01: 0.12 },
    }),
  },
  {
    id: "procreate-syrup",
    nameEn: "Syrup",
    nameKo: "시럽 잉크 펜",
    setCategory: "inking",
    descriptionKo: "탄력 있는 StreamLine과 면도날처럼 매끄러운 외곽선·필압 대비를 제공하는 베스트셀러 펜.",
    crafts: ["lineart"],
    config: makeProcreatePresetConfig({
      strokePath: { plotSpacing01: 0.03 },
      stabilization: { streamlineAmount01: 0.78, motionFilteringAmount01: 0.42 },
      shape: { softness01: 0.01, roundness01: 0.95 },
      grain: { depth01: 0 },
      rendering: { mode: "heavy-glaze", wetEdges01: 0 },
      applePencil: { pressureSize: 0.88, pressureOpacity01: 0.05, tiltSize01: 0 },
    }),
  },
  {
    id: "procreate-studio-pen",
    nameEn: "Studio Pen",
    nameKo: "스튜디오 펜",
    setCategory: "inking",
    descriptionKo: "웹툰·일러스트 깔끔한 펜선과 테이퍼 끝빠짐에 최적화된 정밀 잉크 브러시.",
    crafts: ["lineart"],
    config: makeProcreatePresetConfig({
      strokePath: { plotSpacing01: 0.04 },
      stabilization: { streamlineAmount01: 0.72, stabilizationAmount01: 0.25 },
      taper: { startLength01: 0.22, endLength01: 0.28, pressureSize01: 0.92, tipSharpness01: 0.05 },
      grain: { depth01: 0 },
      rendering: { mode: "heavy-glaze" },
    }),
  },
  {
    id: "procreate-gesinski-ink",
    nameEn: "Gesinski Ink",
    nameKo: "게신스키 드라이 잉크",
    setCategory: "inking",
    descriptionKo: "마른 붓끝의 갈라짐과 먹물 농담이 동시에 살아나는 다이나믹 듀얼 텍스처 잉크.",
    crafts: ["lineart", "effect"],
    config: makeProcreatePresetConfig({
      shape: { scatter01: 0.18, count: 2 },
      grain: { mode: "moving", movementRolling01: 0.65, depth01: 0.74 },
      rendering: { mode: "intense-glaze", burntEdges01: 0.22 },
      dualBrush: { enabled: true, blendMode: "multiply", secondarySpacing01: 0.09, secondarySizeRatio01: 0.9 },
    }),
  },
  {
    id: "procreate-oberon",
    nameEn: "Oberon",
    nameKo: "오베론 드로잉 초크",
    setCategory: "drawing",
    descriptionKo: "압력에 따라 부드러운 파스텔 결에서 짙은 벨벳 밀도로 전이되는 드로잉 브러시.",
    crafts: ["sketch", "coloring"],
    config: makeProcreatePresetConfig({
      grain: { mode: "texturized", depth01: 0.68, depthMinimum01: 0.2 },
      rendering: { mode: "uniform-glaze", wetEdges01: 0.14 },
      applePencil: { pressureBleed01: 0.35, tiltSize01: 0.6 },
    }),
  },
  {
    id: "procreate-nikko-rull",
    nameEn: "Nikko Rull",
    nameKo: "니코 룰 평붓 롤러",
    setCategory: "painting",
    descriptionKo: "방향 추종 평붓 셰이프와 캔버스 직조 질감이 결합된 시그니처 디지털 페인팅 브러시.",
    crafts: ["coloring"],
    config: makeProcreatePresetConfig({
      shape: { roundness01: 0.42, rotationFollowStroke: 1, count: 2 },
      grain: { mode: "texturized", depth01: 0.72, scale01: 0.42 },
      rendering: { mode: "intense-blending", burntEdges01: 0.15 },
      wetMix: { dilution01: 0.22, charge01: 0.78, pull01: 0.48, attack01: 0.6 },
    }),
  },
  {
    id: "procreate-turpentine",
    nameEn: "Turpentine",
    nameKo: "테레빈유 용제 브러시",
    setCategory: "painting",
    descriptionKo: "높은 용제 희석(Dilution)과 탄 가장자리(Burnt Edges)로 유화 밑칠 워시 효과를 내는 브러시.",
    crafts: ["coloring", "effect"],
    config: makeProcreatePresetConfig({
      grain: { mode: "moving", movementRolling01: 0.45, depth01: 0.64 },
      rendering: { mode: "uniform-blending", wetEdges01: 0.45, burntEdges01: 0.35 },
      wetMix: { dilution01: 0.68, charge01: 0.55, pull01: 0.62, attack01: 0.5 },
    }),
  },
  {
    id: "procreate-salamanca",
    nameEn: "Salamanca",
    nameKo: "살라망카 유화 임파스토",
    setCategory: "painting",
    descriptionKo: "물감 끌림(Pull)과 미세 색조 다이나믹스가 살아 있는 두터운 습식 유화 브러시.",
    crafts: ["coloring"],
    config: makeProcreatePresetConfig({
      rendering: { mode: "intense-blending", wetEdges01: 0.25 },
      wetMix: { dilution01: 0.18, charge01: 0.88, pull01: 0.76, attack01: 0.72 },
      colorDynamics: {
        ...DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG.colorDynamics,
        stampHue01: 0.04,
        stampBrightness01: 0.06,
        pressureSecondaryColor01: 0.25,
      },
      materials3d: {
        ...DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG.materials3d,
        roughnessScale01: 0.28,
      },
    }),
  },
  {
    id: "procreate-old-beach",
    nameEn: "Old Beach",
    nameKo: "올드 비치 아티스틱",
    setCategory: "artistic",
    descriptionKo: "거친 모래사장 입자와 스트로크 색상 변조가 어우러진 표현주의 아티스틱 브러시.",
    crafts: ["coloring", "tone"],
    config: makeProcreatePresetConfig({
      shape: { scatter01: 0.32, count: 3 },
      grain: { mode: "moving", movementRolling01: 0.3, depth01: 0.82 },
      wetMix: { dilution01: 0.35, pull01: 0.55, charge01: 0.65 },
      colorDynamics: {
        ...DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG.colorDynamics,
        strokeHue01: 0.08,
        tiltSecondaryColor01: 0.4,
      },
    }),
  },
  {
    id: "procreate-monoline",
    nameEn: "Monoline",
    nameKo: "모노라인 캘리그라피",
    setCategory: "calligraphy",
    descriptionKo: "두께 변화 없이 일정한 선폭과 강력한 StreamLine·Motion Filtering으로 도형·로고 작화에 적합한 펜.",
    crafts: ["lineart"],
    config: makeProcreatePresetConfig({
      strokePath: { plotSpacing01: 0.02 },
      stabilization: { streamlineAmount01: 0.88, stabilizationAmount01: 0.4, motionFilteringAmount01: 0.6 },
      taper: { pressureSize01: 0, touchSize01: 0, startLength01: 0, endLength01: 0 },
      applePencil: { pressureSize: 0, pressureOpacity01: 0, tiltSize01: 0 },
      grain: { depth01: 0 },
    }),
  },
  {
    id: "procreate-shale-brush",
    nameEn: "Shale Brush",
    nameKo: "셰일 캘리그라피 브러시",
    setCategory: "calligraphy",
    descriptionKo: "배럴 롤 방위각과 결이 살아있는 사선 납작 붓끝으로 동양화·타이포그래피를 표현하는 브러시.",
    crafts: ["lineart", "effect"],
    config: makeProcreatePresetConfig({
      shape: { roundness01: 0.28, azimuth: true },
      applePencil: { barrelRollAzimuth: true, pressureSize: 0.78 },
      grain: { depth01: 0.42 },
    }),
  },
  {
    id: "procreate-soft-airbrush",
    nameEn: "Soft Brush",
    nameKo: "소프트 에어브러시",
    setCategory: "airbrushing",
    descriptionKo: "매끄러운 가우시안 소프트니스와 글레이즈 누적으로 웹툰 피부 홍조·역광 그라데이션을 만드는 에어브러시.",
    crafts: ["coloring", "effect"],
    config: makeProcreatePresetConfig({
      shape: { softness01: 0.92 },
      grain: { depth01: 0 },
      rendering: { mode: "light-glaze" },
      applePencil: { pressureOpacity01: 0.85, pressureSize: 0.25 },
    }),
  },
  {
    id: "procreate-hartz",
    nameEn: "Hartz",
    nameKo: "하츠 건축 텍스처",
    setCategory: "textures",
    descriptionKo: "불규칙한 벽면·돌담 스탬프와 그레인 오프셋 지터로 배경 질감을 즉시 입히는 브러시.",
    crafts: ["tone", "coloring"],
    config: makeProcreatePresetConfig({
      strokePath: { plotSpacing01: 0.24, plotJitter01: 0.35 },
      grain: { mode: "texturized", depth01: 0.88, offsetJitter: true },
      rendering: { mode: "uniform-glaze" },
    }),
  },
  {
    id: "procreate-abstract-spires",
    nameEn: "Spires",
    nameKo: "스파이어 기하 추상",
    setCategory: "abstract",
    descriptionKo: "속도 연동 크기 변조와 듀얼 브러시 Difference 합성으로 독창적인 기하학 패턴을 생성하는 추상 브러시.",
    crafts: ["effect", "tone"],
    config: makeProcreatePresetConfig({
      dynamics: { speedSize: 0.65, jitterSize01: 0.25, speedOpacity: -0.2, jitterOpacity01: 0.1 },
      dualBrush: { enabled: true, blendMode: "difference", secondarySpacing01: 0.15, secondarySizeRatio01: 0.75 },
    }),
  },
  {
    id: "procreate-vine-charcoal",
    nameEn: "Vine Charcoal",
    nameKo: "바인 천연 버드나무 목탄",
    setCategory: "charcoals",
    descriptionKo: "기울기 임계각 이후 폭발적으로 넓어지는 목탄 면적과 파우더리한 그레인 블리드를 재현한 목탄.",
    crafts: ["sketch", "tone"],
    config: makeProcreatePresetConfig({
      grain: { mode: "texturized", depth01: 0.86, contrast: 0.4 },
      applePencil: {
        tiltAngleThresholdDeg: 25,
        tiltSize01: 0.95,
        tiltGradation01: 0.65,
        pressureBleed01: 0.5,
      },
      rendering: { mode: "uniform-glaze", burntEdges01: 0.18 },
    }),
  },
  {
    id: "procreate-elements-clouds",
    nameEn: "Clouds",
    nameKo: "클라우드 구름 엘리먼트",
    setCategory: "elements",
    descriptionKo: "다중 스탬프 카운트와 부드러운 Wet Mix 블러로 뭉게구름·연기 볼륨을 단번에 피워올리는 브러시.",
    crafts: ["effect", "coloring"],
    config: makeProcreatePresetConfig({
      strokePath: { plotSpacing01: 0.28, plotJitter01: 0.42 },
      shape: { scatter01: 0.65, count: 4, softness01: 0.68 },
      rendering: { mode: "uniform-blending" },
      wetMix: { dilution01: 0.4, blur01: 0.55, pull01: 0.35 },
    }),
  },
  {
    id: "procreate-spray-flicks",
    nameEn: "Flicks",
    nameKo: "플릭스 물감 스플래터",
    setCategory: "spraypaints",
    descriptionKo: "높은 플롯 지터와 스탬프 크기 지터로 역동적인 물감 튐·별자리 효과를 뿌리는 스프레이 브러시.",
    crafts: ["effect", "tone"],
    config: makeProcreatePresetConfig({
      strokePath: { plotSpacing01: 0.45, plotJitter01: 0.85 },
      shape: { scatter01: 0.9, randomized: true, count: 3, countJitter01: 0.6 },
      dynamics: { jitterSize01: 0.75, jitterOpacity01: 0.35, speedSize: 0.4, speedOpacity: 0 },
    }),
  },
  {
    id: "procreate-touchup-noise",
    nameEn: "Noise Brush",
    nameKo: "노이즈 피부·필름 터치업",
    setCategory: "touchups",
    descriptionKo: "미세한 입자 그레인으로 일러스트 피부 질감과 필름 그레인 마감 디테일을 더하는 터치업 브러시.",
    crafts: ["tone", "effect"],
    config: makeProcreatePresetConfig({
      grain: { mode: "texturized", scale01: 0.12, depth01: 0.9, offsetJitter: true },
      rendering: { mode: "light-glaze" },
    }),
  },
  {
    id: "procreate-vintage-halftone",
    nameEn: "Halftone",
    nameKo: "빈티지 하프톤 망점",
    setCategory: "vintage",
    descriptionKo: "필압에 따라 망점 밀도가 자라나는 코믹·레트로 인쇄풍 하프톤 스크린 브러시.",
    crafts: ["tone"],
    config: makeProcreatePresetConfig({
      grain: { mode: "texturized", scale01: 0.22, zoom01: 1, depth01: 0.95, contrast: 0.65 },
      applePencil: { pressureBleed01: 0.45, pressureOpacity01: 0.6 },
    }),
  },
  {
    id: "procreate-lightpen",
    nameEn: "Lightpen",
    nameKo: "라이트펜 네온 발광",
    setCategory: "luminance",
    descriptionKo: "Add 발광 블렌딩과 코어-할로 이중 구조로 마법 이펙트·사이버펑크 네온 광선을 그리는 발광 펜.",
    crafts: ["effect"],
    config: makeProcreatePresetConfig({
      rendering: { mode: "intense-glaze", blendMode: "add", wetEdges01: 0.35 },
      colorDynamics: {
        ...DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG.colorDynamics,
        pressureBrightness01: 0.65,
      },
    }),
  },
  {
    id: "procreate-nebula",
    nameEn: "Nebula",
    nameKo: "네뷸라 성운 발광",
    setCategory: "luminance",
    descriptionKo: "보조색 컬러 다이나믹스와 구름 그레인이 결합되어 환상적인 오로라·성운 빛무리를 만드는 브러시.",
    crafts: ["effect", "coloring"],
    config: makeProcreatePresetConfig({
      strokePath: { plotSpacing01: 0.22, plotJitter01: 0.38 },
      rendering: { mode: "uniform-glaze", blendMode: "screen" },
      colorDynamics: {
        ...DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG.colorDynamics,
        stampHue01: 0.18,
        stampSecondaryColor01: 0.55,
        barrelRollHue01: 0.35,
      },
    }),
  },
  {
    id: "procreate-heavy-metal",
    nameEn: "Heavy Metal",
    nameKo: "헤비 메탈 3D 금속",
    setCategory: "industrial",
    descriptionKo: "3D PBR 메탈릭·러프니스 채널과 거친 금속 스크래치 그레인을 동시에 칠하는 인더스트리얼 브러시.",
    crafts: ["coloring", "tone"],
    config: makeProcreatePresetConfig({
      grain: { mode: "texturized", depth01: 0.76, contrast: 0.45 },
      materials3d: {
        metallicScale01: 0.92,
        pressureMetallic01: 0.25,
        tiltMetallic01: 0.15,
        roughnessScale01: 0.22,
        pressureRoughness01: 0.3,
        tiltRoughness01: 0.2,
      },
    }),
  },
  {
    id: "procreate-swordgrass",
    nameEn: "Swordgrass",
    nameKo: "소드그래스 유기적 풀잎",
    setCategory: "organic",
    descriptionKo: "스트로크 방향 회전과 속도 크기 다이나믹스로 자연스러운 수풀·잔디 군락을 심는 오가닉 브러시.",
    crafts: ["coloring", "effect"],
    config: makeProcreatePresetConfig({
      strokePath: { plotSpacing01: 0.18, plotJitter01: 0.28 },
      shape: { rotationFollowStroke: 1, scatter01: 0.22, count: 2 },
      colorDynamics: {
        ...DEFAULT_PROCREATE_SILICA_BRUSH_CONFIG.colorDynamics,
        stampBrightness01: 0.12,
        stampSecondaryColor01: 0.3,
      },
    }),
  },
  {
    id: "procreate-wet-sponge",
    nameEn: "Wet Sponge",
    nameKo: "웨트 스펀지 수채 번짐",
    setCategory: "water",
    descriptionKo: "높은 희석도(Dilution)와 젖은 외곽 림(Wet Edges)·번트 에지로 수채화 물 번짐을 표현하는 브러시.",
    crafts: ["coloring", "effect"],
    config: makeProcreatePresetConfig({
      grain: { mode: "moving", movementRolling01: 0.5, depth01: 0.58 },
      rendering: { mode: "light-glaze", wetEdges01: 0.82, burntEdges01: 0.28 },
      wetMix: { dilution01: 0.78, charge01: 0.45, pull01: 0.35, grade01: 0.7 },
    }),
  },
] as const;
