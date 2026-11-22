/**
 * 드로잉 툴 통합 정본 필터 레지스트리(Canonical Filter Registry).
 *
 * 여러 필터 진입점(스마트 필터 86종 · 모달 필터 다이얼로그 58종 · 필터 갤러리 107종
 * [WebGPU 7밴드 KM 분광 안료 필터 4종 포함] · CSP REA 필터 46종 · 인스펙터 개별
 * 레거시 패널 21종) 사이에 분산·중복된 필터 기능을 단일 정본 ID와 권한 계층으로 통합한다.
 *
 * - 신규 작업의 단일 정본(Primary Authority): 비파괴 스마트 필터 스택(`StudioSmartFiltersPanel`)
 *   + 물리 7밴드 분광 안료 필터(`filter-gallery` KM7) + 레이어 스타일(`StudioLayerStylePanel`).
 * - 인스펙터 개별 레거시 패널 21종은 기존 저장 문서 호환을 위해 `StudioLegacyFilterCompatibilityDrawer`
 *   단일 접이식 서랍으로 격리한다(props·데이터 필드 100% 하위 호환 유지).
 */

export type StudioFilterSurface =
  | "smart-filter"
  | "dialog"
  | "filter-gallery"
  | "csp-rea"
  | "legacy-inspector"
  | "layer-style";

export type StudioCanonicalFilterFamily =
  | "blur"
  | "sharpen-detail"
  | "noise-grain"
  | "color-tone"
  | "spectral-km7"
  | "distort-warp"
  | "light-optics"
  | "stylize-toon"
  | "line-repair"
  | "layer-outline";

export interface StudioCanonicalFilterCapability {
  readonly canonicalId: string;
  readonly labelKo: string;
  readonly family: StudioCanonicalFilterFamily;
  readonly authoritySurface: "smart-filter" | "filter-gallery" | "layer-style";
  readonly smartFilterEngines: readonly string[];
  readonly dialogAliases: readonly string[];
  readonly galleryEffectIds: readonly string[];
  readonly cspReaIds: readonly string[];
  readonly legacyInspectorPanelIds: readonly string[];
  readonly distinctionNoteKo: string;
}

export interface StudioLegacyInspectorPanelSpec {
  readonly panelId: string;
  readonly sectionKey: string;
  readonly titleKo: string;
  readonly canonicalCapabilityId: string;
  readonly canonicalSurface: "smart-filter" | "filter-gallery" | "layer-style";
  readonly canonicalTargetLabelKo: string;
  readonly canonicalEngineIds: readonly string[];
  readonly guidanceKo: string;
  readonly legacyFields: readonly string[];
}

/**
 * 모달 필터 다이얼로그(`STUDIO_FILTER_DIALOG_CATALOG`)에서 스마트 필터 엔진과 이름이 달랐던 6종 별칭.
 */
export const STUDIO_DIALOG_FILTER_ALIAS_TO_ENGINE: Readonly<Record<string, string>> = Object.freeze({
  "hue-saturation-brightness": "hue-saturation",
  "color-curves": "curves",
  mosaic: "pixelate",
  "radial-blur": "spin-blur",
  threshold: "ink-threshold",
  "noise-add": "noise",
});

/**
 * CSP REA 필터 사양(`CSP_REA_ALL_FILTER_SPECS`, 46종) 중 기존 스마트 필터 정본 엔진과
 * 1:1 또는 동일 기능으로 중복되는 42종의 정본 매핑표.
 */
export const STUDIO_CSP_REA_FILTER_TO_CANONICAL_ENGINE: Readonly<Record<string, string>> =
  Object.freeze({
    "gauss-blur": "gaussian-blur",
    "motion-blur": "motion-blur",
    "radial-blur": "zoom-blur",
    "rotation-blur": "spin-blur",
    "blur-soft": "blur",
    "blur-more": "gaussian-blur",
    smoothing: "smoothing",
    fisheye: "fisheye",
    panorama: "panorama-warp",
    "lens-distortion": "lens-distortion",
    pinch: "pinch-bloat",
    sphere: "sphere-warp",
    spiral: "twirl",
    "simple-wave": "wave-warp",
    waveform: "ripple-warp",
    zigzag: "zigzag-warp",
    "polar-coordinates": "polar-coordinates",
    sharp: "sharpen",
    "sharp-strong": "sharp-strong",
    "unsharp-mask": "unsharp-mask",
    "flow-based-abstraction": "flow-based-abstraction",
    "pencil-art": "pencil-art",
    mosaic: "pixelate",
    "film-camera-style": "film-camera-style",
    "chromatic-aberration": "chromatic-aberration",
    "normal-map": "normal-map",
    "line-width": "line-width-correct",
    "perlin-noise": "perlin-texture",
    "add-noise": "noise",
    "reduce-noise": "edge-aware-denoise",
    "remove-dust": "dust-scratches",
    "brightness-contrast": "brightness-contrast",
    "hsv-tonal": "hue-saturation",
    posterize: "posterize",
    "reverse-gradient": "invert",
    "level-correction": "levels",
    "tone-curve": "curves",
    "color-balance": "color-balance",
    binarization: "ink-threshold",
    "gradient-map": "gradient-map",
    "brightness-to-opacity": "color-to-alpha",
    "lt-line-extract": "line-extraction",
  });

/**
 * CSP REA 46종 중 스마트 필터와 기능이 다른 4종의 의도적 고유 계층 매핑.
 */
export const STUDIO_CSP_REA_DISTINCT_LAYER_OPS: Readonly<Record<string, string>> = Object.freeze({
  "border-effect": "layer-style:outline",
  "color-transfer": "inspector:color-match",
  "change-line-color": "layer-convert:change-line-color",
  "raster-to-vector": "layer-convert:raster-to-vector",
});

/**
 * WebGPU/CPU 7밴드 Kubelka-Munk 분광 안료 필터 4종(RGB 단순 색조 보정과 물리적으로 구분되는 고유 계층).
 */
export const STUDIO_KM7_SPECTRAL_FILTER_IDS: readonly string[] = Object.freeze([
  "color.km7-spectral-gradient-map",
  "color.km7-pigment-temperature-shift",
  "color.km7-traditional-glazing",
  "color.km7-pigment-harmonizer",
]);

/**
 * 기능군별 정본 필터 통합표(10대 정본 기능군).
 */
export const STUDIO_CANONICAL_FILTER_CAPABILITIES: readonly StudioCanonicalFilterCapability[] =
  Object.freeze([
    Object.freeze({
      canonicalId: "filter.blur",
      labelKo: "블러 · 흐림",
      family: "blur",
      authoritySurface: "smart-filter",
      smartFilterEngines: Object.freeze([
        "gaussian-blur", "motion-blur", "spin-blur", "zoom-blur", "lens-blur",
        "field-iris-blur", "tilt-shift-blur", "selective-gaussian-blur",
        "tileable-blur", "surface-blur", "blur",
      ]),
      dialogAliases: Object.freeze(["radial-blur"]),
      galleryEffectIds: Object.freeze([
        "blur.symmetric-nearest-neighbor",
        "blur.mean-curvature",
      ]),
      cspReaIds: Object.freeze([
        "gauss-blur", "motion-blur", "radial-blur", "rotation-blur", "blur-soft", "blur-more",
      ]),
      legacyInspectorPanelIds: Object.freeze(["StudioImageFilterPanel", "StudioBlurPanel"]),
      distinctionNoteKo: "가우시안·모션·회전·줌·렌즈 블러는 비파괴 스마트 필터 스택이 단일 정본입니다.",
    }),
    Object.freeze({
      canonicalId: "filter.sharpen-detail",
      labelKo: "샤픈 · 선명도 · 디테일",
      family: "sharpen-detail",
      authoritySurface: "smart-filter",
      smartFilterEngines: Object.freeze([
        "sharpen", "smart-sharpen", "unsharp-mask", "high-pass",
        "sharp-strong", "median-despeckle", "custom-convolution",
      ]),
      dialogAliases: Object.freeze([]),
      galleryEffectIds: Object.freeze([]),
      cspReaIds: Object.freeze(["sharp", "sharp-strong", "unsharp-mask"]),
      legacyInspectorPanelIds: Object.freeze([
        "StudioImageFilterPanel", "StudioClarityPanel", "StudioDetailPanel",
      ]),
      distinctionNoteKo:
        "단순 샤픈·하이패스·미디언·명료도 보정을 스마트 필터 디테일/복구 엔진으로 통합합니다.",
    }),
    Object.freeze({
      canonicalId: "filter.noise-grain",
      labelKo: "노이즈 · 필름 그레인 · 잡티 제거",
      family: "noise-grain",
      authoritySurface: "smart-filter",
      smartFilterEngines: Object.freeze([
        "noise", "film-grain-pro", "salt-pepper", "rgb-noise",
        "perlin-texture", "clouds", "edge-aware-denoise", "dust-scratches",
      ]),
      dialogAliases: Object.freeze(["noise-add"]),
      galleryEffectIds: Object.freeze([
        "texture.grain", "noise.hurl", "noise.pick", "noise.slur", "noise.hsv-noise",
      ]),
      cspReaIds: Object.freeze(["add-noise", "perlin-noise", "reduce-noise", "remove-dust"]),
      legacyInspectorPanelIds: Object.freeze(["StudioImageFilterPanel", "StudioGrainPanel"]),
      distinctionNoteKo: "노이즈·그레인·먼지 제거는 스마트 필터 텍스처/복구 엔진이 정본입니다.",
    }),
    Object.freeze({
      canonicalId: "filter.color-tone",
      labelKo: "색보정 · 톤 · 그라디언트 맵",
      family: "color-tone",
      authoritySurface: "smart-filter",
      smartFilterEngines: Object.freeze([
        "brightness-contrast", "hue-saturation", "color-balance", "channel-mixer",
        "gradient-map", "grayscale", "sepia", "color-to-alpha", "invert",
        "curves", "levels", "shadow-highlight", "exposure", "retro-film", "film-camera-style",
      ]),
      dialogAliases: Object.freeze(["hue-saturation-brightness", "color-curves"]),
      galleryEffectIds: Object.freeze([]),
      cspReaIds: Object.freeze([
        "brightness-contrast", "hsv-tonal", "level-correction", "tone-curve",
        "color-balance", "gradient-map", "reverse-gradient", "brightness-to-opacity",
        "film-camera-style",
      ]),
      legacyInspectorPanelIds: Object.freeze([
        "StudioImageFilterPanel",
        "StudioPhotoFilterPanel",
        "StudioColorBalancePanel",
        "StudioChannelMixerPanel",
        "StudioSelectiveHslPanel",
        "StudioVibrancePanel",
        "StudioColorToAlphaPanel",
        "StudioGradientMapPanel",
        "StudioShadowHighlightPanel",
      ]),
      distinctionNoteKo:
        "히스토그램 레벨·톤 커브 전용 UI 외 개별 색보정 필터는 비파괴 스마트 필터로 통합합니다.",
    }),
    Object.freeze({
      canonicalId: "filter.spectral-km7",
      labelKo: "7밴드 분광 안료 필터 (WebGPU KM7)",
      family: "spectral-km7",
      authoritySurface: "filter-gallery",
      smartFilterEngines: Object.freeze([]),
      dialogAliases: Object.freeze([]),
      galleryEffectIds: STUDIO_KM7_SPECTRAL_FILTER_IDS,
      cspReaIds: Object.freeze([]),
      legacyInspectorPanelIds: Object.freeze([]),
      distinctionNoteKo:
        "RGB 선형 틴트(포토 필터)와 물리적으로 다른 7밴드 Kubelka-Munk 감산 혼색 전용 계층입니다.",
    }),
    Object.freeze({
      canonicalId: "filter.distort-warp",
      labelKo: "왜곡 · 변형",
      family: "distort-warp",
      authoritySurface: "smart-filter",
      smartFilterEngines: Object.freeze([
        "twirl", "ripple-warp", "pinch-bloat", "wave-warp",
        "fisheye", "lens-distortion", "sphere-warp", "zigzag-warp",
        "panorama-warp", "polar-coordinates", "offset",
      ]),
      dialogAliases: Object.freeze([]),
      galleryEffectIds: Object.freeze(["distort.ocean-ripple"]),
      cspReaIds: Object.freeze([
        "fisheye", "panorama", "lens-distortion", "pinch", "sphere",
        "spiral", "simple-wave", "waveform", "zigzag", "polar-coordinates",
      ]),
      legacyInspectorPanelIds: Object.freeze(["StudioDistortPanel"]),
      distinctionNoteKo: "비틀기·물결·핀치·웨이브 왜곡은 스마트 필터 변형 엔진이 단일 정본입니다.",
    }),
    Object.freeze({
      canonicalId: "filter.light-optics",
      labelKo: "광학 · 색수차 · 글로우",
      family: "light-optics",
      authoritySurface: "smart-filter",
      smartFilterEngines: Object.freeze([
        "chromatic-aberration", "diffuse-glow", "god-rays", "glowing-edges",
      ]),
      dialogAliases: Object.freeze([]),
      galleryEffectIds: Object.freeze([]),
      cspReaIds: Object.freeze(["chromatic-aberration"]),
      legacyInspectorPanelIds: Object.freeze([
        "StudioImageFilterPanel", "StudioGlowPanel", "StudioLightPanel",
      ]),
      distinctionNoteKo: "색수차·글로우·빛줄기 효과는 스마트 필터 광학 엔진으로 통합합니다.",
    }),
    Object.freeze({
      canonicalId: "filter.stylize-toon",
      labelKo: "만화 톤 · 회화 · 스타일화",
      family: "stylize-toon",
      authoritySurface: "smart-filter",
      smartFilterEngines: Object.freeze([
        "screentone", "color-halftone", "ordered-dither", "posterize", "solarize",
        "pixelate", "crystal-mosaic", "oil-paint", "watercolor", "pencil-sketch",
        "pencil-art", "crosshatch", "cutout", "pointillize", "stained-glass",
        "poster-edges", "photocopy", "emboss", "flow-based-abstraction", "normal-map",
      ]),
      dialogAliases: Object.freeze(["mosaic"]),
      galleryEffectIds: Object.freeze(["sketch.halftone-pattern"]),
      cspReaIds: Object.freeze([
        "mosaic", "posterize", "flow-based-abstraction", "pencil-art", "normal-map",
      ]),
      legacyInspectorPanelIds: Object.freeze([
        "StudioImageFilterPanel",
        "StudioHalftonePanel",
        "StudioSketchPanel",
        "StudioStylizePanel",
        "StudioInkWashPanel",
      ]),
      distinctionNoteKo: "스크린톤·하프톤·스케치·모자이크·수묵 스타일화는 스마트 필터로 통합합니다.",
    }),
    Object.freeze({
      canonicalId: "filter.line-repair",
      labelKo: "선화 추출 · 이진화 · 정리",
      family: "line-repair",
      authoritySurface: "smart-filter",
      smartFilterEngines: Object.freeze([
        "ink-threshold", "line-extraction", "line-cleanup", "screentone-removal",
        "jpeg-artifact-reduction", "difference-of-gaussians", "edge-detect",
        "morphology", "smoothing", "line-width-correct",
      ]),
      dialogAliases: Object.freeze(["threshold"]),
      galleryEffectIds: Object.freeze([]),
      cspReaIds: Object.freeze(["binarization", "smoothing", "line-width", "lt-line-extract"]),
      legacyInspectorPanelIds: Object.freeze(["StudioImageFilterPanel"]),
      distinctionNoteKo: "이진화·선화 추출·선폭 보정은 스마트 필터 복구 엔진 및 선화 정리 도구로 통합합니다.",
    }),
    Object.freeze({
      canonicalId: "filter.layer-outline",
      labelKo: "레이어 외곽선",
      family: "layer-outline",
      authoritySurface: "layer-style",
      smartFilterEngines: Object.freeze([]),
      dialogAliases: Object.freeze([]),
      galleryEffectIds: Object.freeze([]),
      cspReaIds: Object.freeze(["border-effect"]),
      legacyInspectorPanelIds: Object.freeze(["StudioOutlinePanel"]),
      distinctionNoteKo:
        "동일한 `selected.outline` 필드를 이중 편집하던 개별 외곽선 패널을 레이어 스타일 패널로 일원화합니다.",
    }),
  ]);

/**
 * 인스펙터 최상위 기본 노출 섹션(중복 제거 후 11개 정본 작업 섹션).
 * 기존 31개 평면 아코디언 중 중복되는 21개 개별 레거시 필터 패널을
 * `StudioLegacyFilterCompatibilityDrawer` 1개로 접어 작업 동선을 단순화한다.
 */
export const STUDIO_INSPECTOR_PRIMARY_SECTIONS = Object.freeze([
  "lookPreset",
  "smartFilter",
  "photoToonFilter",
  "level",
  "layerStyle",
  "toneCurve",
  "autoAdjust",
  "colorMatch",
  "shadingAssist",
  "lineCleanupDust",
  "photoshopProLab",
] as const);

/**
 * 기존 저장 문서 호환을 위해 접이식 호환 서랍에 수납된 21개 개별 레거시 필터 패널 정의.
 */
export const STUDIO_LEGACY_INSPECTOR_PANEL_SPECS: readonly StudioLegacyInspectorPanelSpec[] =
  Object.freeze([
    Object.freeze({
      panelId: "StudioImageFilterPanel",
      sectionKey: "basicFilter",
      titleKo: "기본 필터 (레거시 필드)",
      canonicalCapabilityId: "filter.color-tone",
      canonicalSurface: "smart-filter",
      canonicalTargetLabelKo: "스마트 필터 (비파괴)",
      canonicalEngineIds: Object.freeze([
        "gaussian-blur", "brightness-contrast", "hue-saturation", "sharpen",
        "noise", "chromatic-aberration", "posterize", "pixelate", "screentone",
        "ink-threshold", "invert", "grayscale", "sepia",
      ]),
      guidanceKo: "새 보정은 비파괴 스마트 필터에서 순서·마스크와 함께 쌓는 방식을 권장합니다.",
      legacyFields: Object.freeze([
        "blur", "brightness", "contrast", "grayscale", "sepia", "screentone", "lineart",
        "chromatic", "posterize", "noise", "saturation", "hue", "temperature", "sharpen",
        "pixelate", "inkThreshold", "invert", "duotoneShadow", "duotoneHighlight",
      ]),
    }),
    Object.freeze({
      panelId: "StudioPhotoFilterPanel",
      sectionKey: "photoFilter",
      titleKo: "포토 필터",
      canonicalCapabilityId: "filter.color-tone",
      canonicalSurface: "filter-gallery",
      canonicalTargetLabelKo: "스마트 필터 · 7밴드 분광 안료 글레이징",
      canonicalEngineIds: Object.freeze(["color-balance", "retro-film"]),
      guidanceKo: "단순 RGB 색조 대신 스마트 필터 또는 필터 갤러리 KM7 안료 글레이징 사용을 권장합니다.",
      legacyFields: Object.freeze(["photoFilter"]),
    }),
    Object.freeze({
      panelId: "StudioBlurPanel",
      sectionKey: "blurFx",
      titleKo: "블러 갤러리",
      canonicalCapabilityId: "filter.blur",
      canonicalSurface: "smart-filter",
      canonicalTargetLabelKo: "스마트 필터 · 블러",
      canonicalEngineIds: Object.freeze(["gaussian-blur", "motion-blur", "spin-blur", "zoom-blur"]),
      guidanceKo: "가우시안·모션·회전·줌 블러는 스마트 필터 스택에서 비파괴로 관리하세요.",
      legacyFields: Object.freeze(["blurFx"]),
    }),
    Object.freeze({
      panelId: "StudioClarityPanel",
      sectionKey: "clarity",
      titleKo: "선명도/안개 제거",
      canonicalCapabilityId: "filter.sharpen-detail",
      canonicalSurface: "smart-filter",
      canonicalTargetLabelKo: "스마트 필터 · 디테일",
      canonicalEngineIds: Object.freeze(["unsharp-mask", "smart-sharpen", "high-pass"]),
      guidanceKo: "미세 대비·선명도 보정은 스마트 필터의 언샤프 마스크·스마트 샤픈을 권장합니다.",
      legacyFields: Object.freeze(["clarity"]),
    }),
    Object.freeze({
      panelId: "StudioDetailPanel",
      sectionKey: "detail",
      titleKo: "디테일/샤픈",
      canonicalCapabilityId: "filter.sharpen-detail",
      canonicalSurface: "smart-filter",
      canonicalTargetLabelKo: "스마트 필터 · 디테일",
      canonicalEngineIds: Object.freeze(["high-pass", "median-despeckle", "smart-sharpen"]),
      guidanceKo: "하이패스·미디언·스마트 샤픈은 스마트 필터 스택에서 비파괴로 적용할 수 있습니다.",
      legacyFields: Object.freeze(["detail"]),
    }),
    Object.freeze({
      panelId: "StudioDistortPanel",
      sectionKey: "distort",
      titleKo: "왜곡",
      canonicalCapabilityId: "filter.distort-warp",
      canonicalSurface: "smart-filter",
      canonicalTargetLabelKo: "스마트 필터 · 변형",
      canonicalEngineIds: Object.freeze(["twirl", "ripple-warp", "pinch-bloat", "wave-warp"]),
      guidanceKo: "소용돌이·물결·핀치·웨이브 왜곡은 스마트 필터 변형 엔진에서 비파괴로 편집하세요.",
      legacyFields: Object.freeze(["distort"]),
    }),
    Object.freeze({
      panelId: "StudioColorBalancePanel",
      sectionKey: "colorBalance",
      titleKo: "색 균형",
      canonicalCapabilityId: "filter.color-tone",
      canonicalSurface: "smart-filter",
      canonicalTargetLabelKo: "스마트 필터 · 색 균형",
      canonicalEngineIds: Object.freeze(["color-balance"]),
      guidanceKo: "스마트 필터의 색 균형 엔진과 동일 기능을 제공합니다.",
      legacyFields: Object.freeze(["colorBalance"]),
    }),
    Object.freeze({
      panelId: "StudioChannelMixerPanel",
      sectionKey: "channelMixer",
      titleKo: "채널 믹서",
      canonicalCapabilityId: "filter.color-tone",
      canonicalSurface: "smart-filter",
      canonicalTargetLabelKo: "스마트 필터 · 채널 믹서",
      canonicalEngineIds: Object.freeze(["channel-mixer"]),
      guidanceKo: "스마트 필터의 채널 믹서 엔진과 동일 기능을 제공합니다.",
      legacyFields: Object.freeze(["channelMixer"]),
    }),
    Object.freeze({
      panelId: "StudioSelectiveHslPanel",
      sectionKey: "selectiveColor",
      titleKo: "선택 색상 HSL",
      canonicalCapabilityId: "filter.color-tone",
      canonicalSurface: "smart-filter",
      canonicalTargetLabelKo: "스마트 필터 · 색조/채도",
      canonicalEngineIds: Object.freeze(["hue-saturation"]),
      guidanceKo: "기존 문서의 선택 색상 필드를 유지하기 위한 호환 편집기입니다.",
      legacyFields: Object.freeze(["selectiveHsl"]),
    }),
    Object.freeze({
      panelId: "StudioVibrancePanel",
      sectionKey: "vibrance",
      titleKo: "생동감",
      canonicalCapabilityId: "filter.color-tone",
      canonicalSurface: "smart-filter",
      canonicalTargetLabelKo: "스마트 필터 · 색조/채도",
      canonicalEngineIds: Object.freeze(["hue-saturation"]),
      guidanceKo: "기존 문서의 생동감 필드를 유지하기 위한 호환 편집기입니다.",
      legacyFields: Object.freeze(["vibrance"]),
    }),
    Object.freeze({
      panelId: "StudioColorToAlphaPanel",
      sectionKey: "colorToAlpha",
      titleKo: "색상 투명화",
      canonicalCapabilityId: "filter.color-tone",
      canonicalSurface: "smart-filter",
      canonicalTargetLabelKo: "스마트 필터 · 색상 투명화",
      canonicalEngineIds: Object.freeze(["color-to-alpha"]),
      guidanceKo: "스마트 필터의 색상 투명화 엔진과 동일 기능을 제공합니다.",
      legacyFields: Object.freeze(["colorToAlpha"]),
    }),
    Object.freeze({
      panelId: "StudioGradientMapPanel",
      sectionKey: "gradientMap",
      titleKo: "그라디언트 맵",
      canonicalCapabilityId: "filter.color-tone",
      canonicalSurface: "smart-filter",
      canonicalTargetLabelKo: "스마트 필터 · 그라디언트 맵",
      canonicalEngineIds: Object.freeze(["gradient-map"]),
      guidanceKo: "스마트 필터 그라디언트 맵 또는 KM7 분광 그라데이션 맵을 권장합니다.",
      legacyFields: Object.freeze(["gradientMap"]),
    }),
    Object.freeze({
      panelId: "StudioShadowHighlightPanel",
      sectionKey: "shadowHighlight",
      titleKo: "섀도우/하이라이트",
      canonicalCapabilityId: "filter.color-tone",
      canonicalSurface: "smart-filter",
      canonicalTargetLabelKo: "스마트 필터 · 섀도우/하이라이트",
      canonicalEngineIds: Object.freeze(["shadow-highlight"]),
      guidanceKo: "스마트 필터의 섀도우/하이라이트 엔진과 동일 기능을 제공합니다.",
      legacyFields: Object.freeze(["shadowHighlight"]),
    }),
    Object.freeze({
      panelId: "StudioGlowPanel",
      sectionKey: "glow",
      titleKo: "글로우",
      canonicalCapabilityId: "filter.light-optics",
      canonicalSurface: "smart-filter",
      canonicalTargetLabelKo: "스마트 필터 · 확산 글로우",
      canonicalEngineIds: Object.freeze(["diffuse-glow"]),
      guidanceKo: "스마트 필터의 확산 글로우 엔진과 동일 기능을 제공합니다.",
      legacyFields: Object.freeze(["glow"]),
    }),
    Object.freeze({
      panelId: "StudioOutlinePanel",
      sectionKey: "outline",
      titleKo: "외곽선 (레이어 스타일과 동일 필드)",
      canonicalCapabilityId: "filter.layer-outline",
      canonicalSurface: "layer-style",
      canonicalTargetLabelKo: "레이어 스타일",
      canonicalEngineIds: Object.freeze([]),
      guidanceKo: "레이어 스타일 패널에서 같은 외곽선 설정을 직접 편집할 수 있습니다.",
      legacyFields: Object.freeze(["outline"]),
    }),
    Object.freeze({
      panelId: "StudioHalftonePanel",
      sectionKey: "halftone",
      titleKo: "하프톤/스크린톤",
      canonicalCapabilityId: "filter.stylize-toon",
      canonicalSurface: "smart-filter",
      canonicalTargetLabelKo: "스마트 필터 · 스크린톤/하프톤",
      canonicalEngineIds: Object.freeze(["screentone", "color-halftone"]),
      guidanceKo: "스마트 필터의 흑백 스크린톤·컬러 하프톤 엔진을 권장합니다.",
      legacyFields: Object.freeze(["halftone"]),
    }),
    Object.freeze({
      panelId: "StudioGrainPanel",
      sectionKey: "grain",
      titleKo: "그레인",
      canonicalCapabilityId: "filter.noise-grain",
      canonicalSurface: "smart-filter",
      canonicalTargetLabelKo: "스마트 필터 · 필름 그레인",
      canonicalEngineIds: Object.freeze(["film-grain-pro", "noise"]),
      guidanceKo: "스마트 필터의 시네마 필름 그레인·노이즈 엔진을 권장합니다.",
      legacyFields: Object.freeze(["grain"]),
    }),
    Object.freeze({
      panelId: "StudioInkWashPanel",
      sectionKey: "inkWash",
      titleKo: "수묵 번짐",
      canonicalCapabilityId: "filter.stylize-toon",
      canonicalSurface: "smart-filter",
      canonicalTargetLabelKo: "스마트 필터 · 수채화/스타일화",
      canonicalEngineIds: Object.freeze(["watercolor"]),
      guidanceKo: "기존 문서의 수묵 번짐 필드를 유지하기 위한 호환 편집기입니다.",
      legacyFields: Object.freeze(["inkWash"]),
    }),
    Object.freeze({
      panelId: "StudioStylizePanel",
      sectionKey: "stylize",
      titleKo: "스타일화",
      canonicalCapabilityId: "filter.stylize-toon",
      canonicalSurface: "smart-filter",
      canonicalTargetLabelKo: "스마트 필터 · 스타일화",
      canonicalEngineIds: Object.freeze(["oil-paint", "emboss", "poster-edges", "cutout"]),
      guidanceKo: "스마트 필터의 유화·엠보스·포스터 엣지·컷아웃 엔진을 권장합니다.",
      legacyFields: Object.freeze(["stylize"]),
    }),
    Object.freeze({
      panelId: "StudioLightPanel",
      sectionKey: "light",
      titleKo: "조명/광선",
      canonicalCapabilityId: "filter.light-optics",
      canonicalSurface: "smart-filter",
      canonicalTargetLabelKo: "스마트 필터 · 빛줄기/광학",
      canonicalEngineIds: Object.freeze(["god-rays", "diffuse-glow"]),
      guidanceKo: "스마트 필터의 빛줄기·확산 글로우 엔진을 권장합니다.",
      legacyFields: Object.freeze(["light"]),
    }),
    Object.freeze({
      panelId: "StudioSketchPanel",
      sectionKey: "sketch",
      titleKo: "스케치",
      canonicalCapabilityId: "filter.stylize-toon",
      canonicalSurface: "smart-filter",
      canonicalTargetLabelKo: "스마트 필터 · 연필 스케치",
      canonicalEngineIds: Object.freeze(["pencil-sketch", "pencil-art", "crosshatch"]),
      guidanceKo: "스마트 필터의 연필 스케치·연필화·교차 해칭 엔진을 권장합니다.",
      legacyFields: Object.freeze(["sketch"]),
    }),
  ]);

const LEGACY_SPEC_BY_PANEL_ID = new Map<string, StudioLegacyInspectorPanelSpec>(
  STUDIO_LEGACY_INSPECTOR_PANEL_SPECS.map((spec) => [spec.panelId, spec]),
);

const CAPABILITY_BY_ENGINE_ID = new Map<string, StudioCanonicalFilterCapability>();
for (const capability of STUDIO_CANONICAL_FILTER_CAPABILITIES) {
  for (const engineId of capability.smartFilterEngines) {
    CAPABILITY_BY_ENGINE_ID.set(engineId, capability);
  }
}

/**
 * 레거시 인스펙터 패널 ID로 정본 통합 안내 정보를 조회한다.
 */
export function studioLegacyFilterPanelGuidance(
  panelId: string,
): StudioLegacyInspectorPanelSpec | null {
  return LEGACY_SPEC_BY_PANEL_ID.get(panelId) ?? null;
}

/**
 * 임의의 필터 표면(dialog · csp-rea · smart-filter · filter-gallery · legacy-inspector)의
 * 필터 ID를 단일 정본 스마트 필터 엔진 ID(또는 고유 기능군 ID)로 해석한다.
 */
export function resolveCanonicalFilterId(surface: StudioFilterSurface, id: string): string {
  if (surface === "dialog") {
    return STUDIO_DIALOG_FILTER_ALIAS_TO_ENGINE[id] ?? id;
  }
  if (surface === "csp-rea") {
    return (
      STUDIO_CSP_REA_FILTER_TO_CANONICAL_ENGINE[id]
      ?? STUDIO_CSP_REA_DISTINCT_LAYER_OPS[id]
      ?? id
    );
  }
  if (surface === "legacy-inspector") {
    const spec = LEGACY_SPEC_BY_PANEL_ID.get(id);
    if (!spec) return id;
    return spec.canonicalEngineIds[0] ?? spec.canonicalCapabilityId;
  }
  if (surface === "filter-gallery") {
    if (STUDIO_KM7_SPECTRAL_FILTER_IDS.includes(id)) return id;
    if (id === "sketch.halftone-pattern") return "screentone";
    if (id === "texture.grain") return "film-grain-pro";
    if (id === "distort.ocean-ripple") return "ripple-warp";
    return id;
  }
  return id;
}

/**
 * 스마트 필터 엔진 ID가 속한 정본 기능군 메타데이터를 조회한다.
 */
export function studioCanonicalFilterCapabilityForEngine(
  engineId: string,
): StudioCanonicalFilterCapability | null {
  return CAPABILITY_BY_ENGINE_ID.get(engineId) ?? null;
}
