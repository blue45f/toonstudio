/**
 * 외형 프리셋 배럴. core의 catalog-registry가 `APPEARANCE_PRESETS`를 animation의 PERFORMANCE_PRESETS와 병합한다.
 */
export {
  ACCESSORY_PRESETS,
  APPEARANCE_PRESETS,
  APPEARANCE_PRESET_COUNT,
  BODY_PRESETS,
  BOTTOM_PRESETS,
  EARS_PRESETS,
  EYES_PRESETS,
  FACE_SHAPE_PRESETS,
  HAIR_PRESETS,
  IRISES_PRESETS,
  MOUTH_PRESETS,
  NOSE_PRESETS,
  SHOES_PRESETS,
  TOP_PRESETS,
  appearancePresetsForSlot,
  requiresForPatch,
} from "./appearance-presets";
export * from "./art-style-packs";
export {
  KWEBTOON_ARCHETYPE_IDS,
  KWEBTOON_ARCHETYPE_LIST,
  KWEBTOON_ARCHETYPE_LOOKS,
  KWEBTOON_ARCHETYPE_PRESETS,
  buildKWebtoonArchetypeShading,
  composeKWebtoonArchetypeRecipe,
  detectKWebtoonArchetypeId,
  isKWebtoonArchetypeId,
  type KWebtoonArchetypeId,
  type KWebtoonArchetypePreset,
  type KWebtoonShadingStyleId,
} from "./kwebtoon-archetype-presets";
export * from "./look-sets";
export * from "./shaper-quick-sculpt-presets";
export {
  WEBTOON_UNIVERSE_SHAPER_IDS,
  WEBTOON_UNIVERSE_SHAPER_PRESETS,
  applyShaperFineSlidersToRecipe,
  blendWebtoonUniverseRecipes,
  composeWebtoonUniverseRecipe,
  resolveCharacterLabVarco3dPreviewSettings,
  webtoonUniverseShaperPreset,
  type CharacterLabVarco3dEnvironmentId,
  type CharacterLabVarco3dMapChannel,
  type CharacterLabVarco3dPreviewSettings,
  type ComposeWebtoonUniverseOptions,
  type ComposeWebtoonUniverseRecipeResult,
  type ShaperFineSliderPatch,
  type Varco3dLabAccessoryBinding,
  type WebtoonUniverseShaperId,
  type WebtoonUniverseShaperPreset,
} from "./webtoon-universe-shaper";
