/**
 * Wave 42B — 한국 웹툰 액션·판타지·로맨스 프로시저럴 벡터 이펙트 랩 공개 배럴.
 */

export {
  ACTION_FX_PRESETS,
  ACTION_FX_PRESET_IDS,
  DEFAULT_ACTION_FX_CANVAS,
  DEFAULT_CHARACTER_MASK_RADIUS,
  createSeededPrng,
  exportActionFxSvg,
  generateActionFxLayer,
  getActionFxPresetSpec,
  measurePrimitiveIntrusion,
  verifyCharacterMaskClearance,
  type ActionFxCategory,
  type ActionFxCirclePrimitive,
  type ActionFxEllipsePrimitive,
  type ActionFxGenerationOptions,
  type ActionFxLayerMetrics,
  type ActionFxLayerResult,
  type ActionFxPalette,
  type ActionFxPolygonPrimitive,
  type ActionFxPolylinePrimitive,
  type ActionFxPresetId,
  type ActionFxPresetSpec,
  type ActionFxPrimitiveRole,
  type ActionFxVectorPrimitive,
  type CharacterMaskAuditReport,
  type CharacterMaskSpec,
  type ExportActionFxSvgOptions,
  type Point2D,
  type ResolvedActionFxOptions,
  type ResolvedCharacterMask,
} from "./action-fx-vector-engine";

export {
  StudioActionFxLabPanel,
  type StudioActionFxLabPanelProps,
} from "./StudioActionFxLabPanel";
