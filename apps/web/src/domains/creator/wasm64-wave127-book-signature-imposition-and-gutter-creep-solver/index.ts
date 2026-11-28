/**
 * Wave 127 — 웹툰 단행본 인쇄 대수 조판(Signature Imposition)·제책 크리프(Creep) 보정
 * 및 양면 스프레드 책등(Gutter) 안전 솔버 배럴 익스포트.
 */

export {
  BOOK_BINDING_PROFILES,
  BOOK_PAPER_STOCK_PRESETS,
  BookImpositionValidationError,
  DEFAULT_SAFE_MARGIN_MM,
  HARD_TRIM_CLIPPING_ZONE_MM,
  MAX_BOOK_RAW_PAGE_COUNT,
  MIN_PRINT_BLEED_MM,
  canonicalizeImpositionJson,
  isValidBindingMethod,
  isValidReadingDirection,
  isValidSignatureSizePages,
  roundMm,
  sha256ImpositionHex,
} from "./book-imposition-types";

export type {
  BookAuditedBoxOverlay,
  BookBindingMethod,
  BookBindingProfile,
  BookImportantBoxKind,
  BookImportantBoxSpec,
  BookImpositionSheet,
  BookImpositionSpec,
  BookPageBleedEdgesMm,
  BookPageContentSpec,
  BookPageSlotPlacement,
  BookPageSpineEdge,
  BookPaperStockPreset,
  BookPrintAuditFindingCode,
  BookPrintAuditSeverity,
  BookPrintSafetyAuditInput,
  BookPrintSafetyAuditReport,
  BookPrintSafetyFinding,
  BookReadingDirection,
  BookSheetSide,
  BookSheetSidePair,
  BookSignatureImpositionPlan,
  BookSignatureSizePages,
  BookSignatureUnit,
  DoublePageSpreadSpec,
} from "./book-imposition-types";

export {
  compileBookSignatureImposition,
  computeBookSpineWidthMm,
  computePaperCreepCompensationMm,
  resolvePageSpineEdge,
} from "./signature-imposition-and-creep-solver";

export type {
  PaperCreepCompensationResult,
  PaperCreepComputationInput,
} from "./signature-imposition-and-creep-solver";

export { auditBookPrintSafety } from "./spread-gutter-and-bleed-auditor";

export {
  escapeImpositionSvgXml,
  renderBookImpositionSheetSvg,
  summarizeBookImpositionAuditKo,
} from "./imposition-svg-and-report";

export type {
  BookImpositionBriefOptions,
  BookImpositionSvgOptions,
} from "./imposition-svg-and-report";
