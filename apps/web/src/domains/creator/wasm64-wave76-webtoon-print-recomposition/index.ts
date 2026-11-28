/**
 * Wasm64 Wave 76 공개 배럴 진입점 (`wasm64-wave76-webtoon-print-recomposition`).
 *
 * - `vertical-to-print-page-solver`: 세로 스크롤 웹툰을 B5 단행본(LTR)·일본 B6 만화(RTL)·
 *   미국 그래픽노블·ePub3 고정 레이아웃·9:16 숏폼 스토리보드로 리컴포지션하는 DP 분할·시선 동선 솔버
 * - `cmyk-prepress-and-bleed-preflight`: GCR/UCR·TAC 총잉크 상한·순수 먹(K100) 선화 보존 CMYK 분판기,
 *   DPI·도련·제본 여백 침범 프리플라이트 검수기 및 재단선·레지스트레이션·컬러바 조판 매니페스트 생성기
 * - `epub-and-imposition-exporter`: ePub3 Fixed-Layout OPF/Spine 출고 매니페스트 및
 *   밀리미터 단위 인쇄 프리플라이트 SVG 오버레이 렌더러
 */

export {
  PUBLICATION_FORMAT_SPECS,
  SUPPORTED_PUBLICATION_FORMATS,
  computePageBoxGeometry,
  recomposeVerticalWebtoonToPages,
  verifyPageGazeFlow,
  type ColorSpaceMode,
  type GazeFlowPointMm,
  type GazeFlowVerification,
  type PageBoxGeometryMm,
  type PageSide,
  type PanelFitMode,
  type PanelLocalRectPx,
  type PlacedPrintPanel,
  type PublicationFormatId,
  type PublicationFormatSpec,
  type ReadingDirection,
  type RecomposedPrintPage,
  type RecompositionMetricsSummary,
  type RecompositionOptions,
  type RecompositionResult,
  type RectMm,
  type SourceCropRectPx,
  type SpineEdge,
  type TitleSafeInsetMm,
  type VerticalWebtoonPanelSpec,
} from "./vertical-to-print-page-solver";

export {
  PREPRESS_CMYK_PROFILES,
  auditPrepressColorSeparation,
  buildPrintImpositionManifest,
  convertRgbToPrepressCmyk,
  runPrintPreflightAudit,
  type CmykSeparationOptions,
  type ColorBarPatchMm,
  type ImpositionPressSheet,
  type NamedRgbColorSample,
  type PagePreflightSummary,
  type PanelArtMode,
  type PrepressCmykColor,
  type PrepressCmykProfile,
  type PrepressCmykProfileId,
  type PrepressColorAuditReport,
  type PrepressColorAuditSample,
  type PrintImpositionManifest,
  type PrintImpositionManifestOptions,
  type PrintImpositionPageSpec,
  type PrintMarkLineMm,
  type PrintPreflightAuditReport,
  type PrintPreflightIssue,
  type PrintPreflightIssueCode,
  type PrintPreflightOptions,
  type PrintPreflightSeverity,
  type RawCmykInkSample,
  type RegistrationMarkMm,
  type RgbColorInput,
} from "./cmyk-prepress-and-bleed-preflight";

export {
  buildEpubFixedLayoutManifest,
  renderPrintPagePrepressSvg,
  type EpubFixedLayoutManifest,
  type EpubManifestItem,
  type EpubMetadataInput,
  type EpubPageXhtmlDocument,
  type EpubSpineItem,
  type PrepressSvgRenderOptions,
  type PrepressSvgRenderResult,
} from "./epub-and-imposition-exporter";
