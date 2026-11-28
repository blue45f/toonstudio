/**
 * Wasm64 Wave 154 공개 배럴 진입점 (`wasm64-wave154-accessible-webtoon-alt-scene-description-compiler`).
 *
 * - `accessible-alt-types`: 3개국어(한/영/일) 웹툰 접근성 컴파일·감사 계약 타입 및 KWCAG/WCAG/EAA 기준 상수
 * - `accessible-alt-sha256`: 순수 ES2017 동기 FIPS 180-4 SHA-256 및 수치 가드 유틸리티
 * - `accessible-scene-compiler-and-auditor`: 연속 컷 중복 생략 3개국어 장면 해설 컴파일러,
 *   6대 접근성 결함 fail-closed 감사기, 점자·TTS 오디오 드라마 대본 익스포터
 * - `accessible-alt-svg-and-report`: 순수 OKLCH 접근성 커버리지·ARIA 흐름 SVG 및 한국어 QA 브리프
 */

export {
  ACCESSIBILITY_COMPLIANCE_STANDARDS,
  DEFAULT_CONCISE_ALT_BLOAT_LIMIT_CHARS,
  DEFAULT_CONCISE_ALT_TARGET_CHARS,
  SUPPORTED_ACCESSIBLE_LOCALES,
  type AccessibilityAuditDefect,
  type AccessibilityComplianceVerdict,
  type AccessibilityDefectCode,
  type AccessibilityDefectSeverity,
  type AccessibilityOutputProfile,
  type AccessibleCharacterCue,
  type AccessibleDialogueCue,
  type AccessibleEpisodeInput,
  type AccessibleLocale,
  type AccessiblePanelInput,
  type AccessibleSfxCue,
  type AriaReadingNode,
  type AriaReadingNodeKind,
  type AuditAccessibilityOptions,
  type CharacterHorizontalPosition,
  type CompileAccessibilityOptions,
  type CompiledAccessibleEpisode,
  type CompiledAccessiblePanel,
  type DialogueDeliveryStyle,
  type EpisodeAccessibilityAuditReport,
  type LocalizedPanelAccessibilityOutput,
  type ManualAltOverrideInput,
  type PanelAccessibilityAuditRow,
  type PanelShotScale,
  type ScreenReaderTranscriptExportOptions,
} from "./accessible-alt-types";

export {
  clampFinite,
  clampInt,
  roundDeterministic,
  sha256AccessibleAltHex,
} from "./accessible-alt-sha256";

export {
  auditEpisodeAccessibilityCompliance,
  compileAccessibleEpisodeDescriptions,
  detectRedundantAltPrefix,
  exportScreenReaderTranscriptText,
  stripRedundantAltPrefixes,
} from "./accessible-scene-compiler-and-auditor";

export {
  escapeAccessibilityXml,
  renderAccessibilityComplianceSvg,
  summarizeAccessibilityAuditKo,
  type AccessibilityComplianceSvgOptions,
  type AccessibilitySummaryKoOptions,
} from "./accessible-alt-svg-and-report";
