/**
 * A4 D4 (R12) 래칫 정합 추출: cbz 생산자의 구조화 오류 정의(클래스·variant·팩토리)를
 * 분리한 파일. 생산자 본체는 이 파일에서 import하고, 외부 소비자 호환을 위해
 * 생산자 파일이 그대로 재수출한다.
 */
import type { StudioCbzErrorCode } from "./studio-cbz-interchange";

export type StudioCbzWarningVariant =
  | "countMismatch"
  | "missing"
  | "nonImage"
  | "osMetadata";

export type StudioCbzErrorVariant =
  | "aborted"
  | "archiveInvalid"
  | "comicInfoAttributeDuplicate"
  | "comicInfoAttributeMissingEquals"
  | "comicInfoAttributeMissingSpace"
  | "comicInfoAttributeNameInvalid"
  | "comicInfoAttributeNotQuoted"
  | "comicInfoAttributeTooMany"
  | "comicInfoAttributeUnclosed"
  | "comicInfoAttributeUnsafeChar"
  | "comicInfoBlackAndWhiteNotBoolean"
  | "comicInfoBlackAndWhiteValueInvalid"
  | "comicInfoClosingTagInvalid"
  | "comicInfoCommaInItem"
  | "comicInfoCommentInvalid"
  | "comicInfoCommentUnclosed"
  | "comicInfoDeclarationUnclosed"
  | "comicInfoDeclarationUnsupported"
  | "comicInfoDepthLimit"
  | "comicInfoElementCountLimit"
  | "comicInfoElementUnclosed"
  | "comicInfoEntityInvalid"
  | "comicInfoForbiddenConstruct"
  | "comicInfoIntegerInvalid"
  | "comicInfoIntegerOutOfRange"
  | "comicInfoMetadataLimit"
  | "comicInfoMissingValue"
  | "comicInfoMixedContent"
  | "comicInfoNotList"
  | "comicInfoNotString"
  | "comicInfoNotUtf8"
  | "comicInfoOpeningTagInvalid"
  | "comicInfoOutOfRange"
  | "comicInfoRootInvalid"
  | "comicInfoRootUnclosed"
  | "comicInfoTagAttributeMissingSpace"
  | "comicInfoTagDuplicate"
  | "comicInfoTagNestingInvalid"
  | "comicInfoTextComplexityLimit"
  | "comicInfoTextNotEscaped"
  | "comicInfoTextOutsideRoot"
  | "comicInfoUnsafeControlChar"
  | "comicInfoValueStructureInvalid"
  | "imageExtensionMismatch"
  | "imageFormatInvalid"
  | "imageReadFailed"
  | "imageUnsupportedData"
  | "limitInvalid"
  | "pageCountArchiveLimit"
  | "pageCountOutOfRange"
  | "sizeComicInfoBytesOutOfRange"
  | "sizeComicInfoLimit"
  | "sizePageBytesOutOfRange"
  | "sizePageLimit"
  | "sizePagePixelsLimit"
  | "sizePageSideLimit"
  | "sizeTotalDecodedBudget"
  | "sizeTotalPageBytesLimit";

export class StudioCbzError extends Error {
  readonly code: StudioCbzErrorCode;
  readonly variant: StudioCbzErrorVariant;
  readonly params?: Readonly<Record<string, string>>;
  readonly path?: string;

  constructor(
    code: StudioCbzErrorCode,
    variant: StudioCbzErrorVariant,
    params?: Readonly<Record<string, string>>,
    path?: string,
  ) {
    super(code);
    this.name = "StudioCbzError";
    this.code = code;
    this.variant = variant;
    if (params !== undefined) this.params = params;
    if (path !== undefined) this.path = path;
  }
}

export function cbzError(
  code: StudioCbzErrorCode,
  variant: StudioCbzErrorVariant,
  params?: Readonly<Record<string, string>>,
  path?: string,
): StudioCbzError {
  return new StudioCbzError(code, variant, params, path);
}
