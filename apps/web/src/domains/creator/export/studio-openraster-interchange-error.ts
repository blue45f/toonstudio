/**
 * A4 D4 (R12) 래칫 정합 추출: openraster 생산자의 구조화 오류 정의(클래스·variant·팩토리)를
 * 분리한 파일. 생산자 본체는 이 파일에서 import하고, 외부 소비자 호환을 위해
 * 생산자 파일이 그대로 재수출한다.
 */
import type { StudioOpenRasterErrorCode, StudioOpenRasterWarningCode } from "../studio-openraster-interchange";

export type StudioOpenRasterWarningVariant =
  | "dimensionMismatch"
  | "export"
  | "import"
  | "masksIgnored"
  | "mergedBitDepth"
  | "thumbnailProfile"
  | "unsupportedAttribute"
  | "unsupportedElement";

export type StudioOpenRasterErrorVariant =
  | "aborted"
  | "archiveEntryReadFailed"
  | "archiveEntryVerifyFailed"
  | "archiveInvalid"
  | "canvasDimensionOutOfRange"
  | "documentNameOutOfRange"
  | "groupCountLimit"
  | "groupIsolationInvalid"
  | "groupNameOutOfRange"
  | "groupStackOutsideLayerStack"
  | "imageBudgetExceeded"
  | "imageReadFailed"
  | "imageUnsupportedData"
  | "layerCountLimit"
  | "layerCountOutOfRange"
  | "layerNameOutOfRange"
  | "layerOffsetOutOfRange"
  | "layerOpacityOutOfRange"
  | "layerOutsideStack"
  | "layerSourceDuplicate"
  | "layerSourcePathInvalid"
  | "layerSourcePathSegmentUnsafe"
  | "layerSourceReservedEntry"
  | "limitInvalid"
  | "mimetypeLengthInvalid"
  | "mimetypeNotFirstStored"
  | "mimetypeNotUtf8"
  | "mimetypeValueInvalid"
  | "noLayersToImport"
  | "opacityNotNumber"
  | "opacityOutOfRange"
  | "pngDimensionsZero"
  | "pngFirstChunkNotIhdr"
  | "pngIhdrFormatInvalid"
  | "pngIhdrIncomplete"
  | "pngDimensionLimit"
  | "pngPixelLimit"
  | "pngSignatureInvalid"
  | "pngSizeChanged"
  | "pngSizeLimit"
  | "requiredLayerPngMissing"
  | "requiredMergedImageMissing"
  | "requiredStackXmlMissing"
  | "requiredThumbnailMissing"
  | "resolutionPairRequired"
  | "rootStackNotUnique"
  | "sizeLayerPngLimit"
  | "sizeMergedImageByteLimit"
  | "sizeStackXmlByteLimit"
  | "sizeStackXmlBytesOutOfRange"
  | "sizeStackXmlLimit"
  | "sizeThumbnailByteLimit"
  | "stackAttributeDuplicate"
  | "stackAttributeMissingEquals"
  | "stackAttributeNameInvalid"
  | "stackAttributeNotQuoted"
  | "stackAttributeTooMany"
  | "stackAttributeUnclosed"
  | "stackClosingTagInvalid"
  | "stackCommentUnclosed"
  | "stackDeclarationElementForbidden"
  | "stackDeclarationInvalid"
  | "stackDepthLimit"
  | "stackDtdForbidden"
  | "stackElementCountLimit"
  | "stackImageRootNotUnique"
  | "stackIntegerInvalid"
  | "stackIntegerOutOfRange"
  | "stackInvalidEntity"
  | "stackNestingInvalid"
  | "stackNotUtf8"
  | "stackProcessingInstructionUnclosed"
  | "stackSelfClosingTagInvalid"
  | "stackStructureIncomplete"
  | "stackTagNameInvalid"
  | "stackTagUnclosed"
  | "stackTextOutsideRoot"
  | "stackTopLevelElementForbidden"
  | "stackUnexpectedText"
  | "stackUnknownEntity"
  | "versionNotSemver"
  | "visibilityInvalid"
  | "xmlTextOutOfRange";

export class StudioOpenRasterError extends Error {
  readonly code: StudioOpenRasterErrorCode;
  readonly variant: StudioOpenRasterErrorVariant;
  readonly params?: Readonly<Record<string, string>>;
  readonly path?: string;

  constructor(
    code: StudioOpenRasterErrorCode,
    variant: StudioOpenRasterErrorVariant,
    params?: Readonly<Record<string, string>>,
    path?: string,
  ) {
    super(code);
    this.name = "StudioOpenRasterError";
    this.code = code;
    this.variant = variant;
    if (params !== undefined) this.params = params;
    if (path !== undefined) this.path = path;
  }
}

export function oraError(
  code: StudioOpenRasterErrorCode,
  variant: StudioOpenRasterErrorVariant,
  params?: Readonly<Record<string, string>>,
  path?: string,
): StudioOpenRasterError {
  return new StudioOpenRasterError(code, variant, params, path);
}

/**
 * A4 D4 (R12): 생산자는 표시 문구 대신 구조화 코드+variant+params만 방출한다.
 * 문구 해석은 표시·집계 지점에서만 한다
 * (status-i18n/studio-producer-error-i18n-interchange-ora.ts).
 */
export interface StudioOpenRasterWarning {
  code: StudioOpenRasterWarningCode;
  variant: StudioOpenRasterWarningVariant;
  params?: Readonly<Record<string, string>>;
  layerIndex?: number;
  path?: string;
}
