/**
 * Wasm64 Wave 123 공개 배럴 진입점 (`wasm64-wave123-wardrobe-prop-continuity-bible-compiler`).
 *
 * - `wardrobe-continuity-types`: 캐릭터 옷장 바이블, 인과 손상 이벤트, 컷 관측 및 감사 타입·기본 프리셋
 * - `wardrobe-oklab-and-sha256`: Björn Ottosson sRGB↔OKLab/OKLCH ΔE 색차 계산기 및 FIPS 180-4 SHA-256
 * - `wardrobe-continuity-bible-compiler`: 화차 옷장 바이블 컴파일러 및 4대 인과 연속성 감사 상태 머신
 * - `wardrobe-audit-svg-and-report`: 인쇄 안전 순수 OKLCH 타임라인 매트릭스 SVG 및 한국어 어시스턴트 QA 브리프
 */

export {
  ALL_WARDROBE_DAMAGE_KINDS,
  CATEGORY_LABEL_KO,
  createDefaultEpisodeWardrobeBible,
  DAMAGE_LABEL_KO,
  EVENT_LABEL_KO,
  HANDEDNESS_LABEL_KO,
  type CharacterWardrobePreset,
  type CompiledCharacterWardrobe,
  type CompiledOutfitPreset,
  type CompiledWardrobeBible,
  type CompiledWardrobeSlot,
  type CutContinuityAuditRow,
  type CutContinuityEvent,
  type CutContinuityEventKind,
  type CutWardrobeObservation,
  type EpisodeWardrobeBible,
  type EpisodeWardrobeContinuityAudit,
  type ObservedSlotState,
  type OklabCoords,
  type OklchCoords,
  type SrgbTriplet,
  type TimelineBadgeText,
  type TimelineCellAudit,
  type TimelineCellStatus,
  type WardrobeAuditPassStatus,
  type WardrobeContinuityFinding,
  type WardrobeContinuityViolationCode,
  type WardrobeDamageKind,
  type WardrobeHandedness,
  type WardrobeSlotCategory,
  type WardrobeSlotCondition,
  type WardrobeSlotImportance,
  type WardrobeSlotSpec,
  type WardrobeViolationSeverity,
} from "./wardrobe-continuity-types";

export {
  canonicalizeJsonForHash,
  clampFiniteNumber,
  computeFips1804Sha256Hex,
  computeOklabDeltaE,
  computeWardrobeBibleSha256Hex,
  formatOklchCss,
  oklabToOklch,
  srgbChannelToLinear,
  srgbTripletToOklab,
  srgbTripletToOklch,
  srgbTripletToOklchCss,
} from "./wardrobe-oklab-and-sha256";

export {
  auditEpisodeWardrobeContinuity,
  compileWardrobeBible,
} from "./wardrobe-continuity-bible-compiler";

export {
  escapeWardrobeSvgXml,
  renderWardrobeContinuityTimelineSvg,
  summarizeWardrobeContinuityAuditKo,
  type WardrobeContinuityAuditSummaryKo,
  type WardrobeTimelineSvgOptions,
} from "./wardrobe-audit-svg-and-report";
