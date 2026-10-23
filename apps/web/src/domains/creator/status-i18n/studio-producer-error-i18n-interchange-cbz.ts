/**
 * 생산자 구조화 에러 해석 모듈 — cbz 구간: studio-cbz-interchange 오류 58 variant + 경고 4키 (A4 D4, R12).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와 동일하다:
 * 생산자는 {code, variant, params}만 방출하고, 표시는 이 모듈의 리졸버로만 해석한다.
 * ko 값은 이관 전 생산자 원문과 글자 단위 동일하고, en은 신규 번역이다.
 * ComicInfo label params는 생산자가 labelCode(title·writer 등)로 방출하고,
 * 이 모듈의 고정 라벨 표로 표시 라벨(Title·Writer 등 — 양 로케일 동일)로 되돌린다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type {
  StudioCbzError,
  StudioCbzErrorVariant,
  StudioCbzWarning,
} from "../studio-cbz-interchange";

function resolveProducerError(
  key: string,
  fallback: string,
  params?: Readonly<Record<string, string>>,
): string {
  const text = resolveTranslationForDisplay(getLang(), key, FALLBACK_CHAIN, fallback);
  const values = params ?? {};
  return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (placeholder, token: string) =>
    Object.hasOwn(values, token) ? String(values[token]) : placeholder,
  );
}

registerI18nLocaleEntries("ko", {
  "studio.producerError.cbz.aborted": "CBZ 작업이 취소되었습니다.",
  "studio.producerError.cbz.limitInvalid": "{key} 한도는 {min} 이상 {max} 이하의 정수여야 합니다.",
  "studio.producerError.cbz.imageUnsupportedData": "지원하지 않는 CBZ 페이지 데이터입니다.",
  "studio.producerError.cbz.imageReadFailed": "CBZ 페이지를 읽지 못했습니다{detail}",
  "studio.producerError.cbz.sizePageSideLimit": "CBZ 페이지 한 변의 길이가 안전 한도를 넘었습니다.",
  "studio.producerError.cbz.sizePagePixelsLimit": "CBZ 페이지의 디코드 픽셀 수가 안전 한도를 넘었습니다.",
  "studio.producerError.cbz.comicInfoNotString": "{label} metadata가 올바른 문자열이 아닙니다.",
  "studio.producerError.cbz.comicInfoOutOfRange": "{label} metadata가 안전 범위를 벗어났습니다.",
  "studio.producerError.cbz.comicInfoNotList": "{label} metadata는 문자열 목록이어야 합니다.",
  "studio.producerError.cbz.comicInfoMissingValue": "{label} 값이 없습니다.",
  "studio.producerError.cbz.comicInfoCommaInItem": "{label} 항목에는 목록 구분자인 쉼표를 사용할 수 없습니다.",
  "studio.producerError.cbz.comicInfoBlackAndWhiteNotBoolean": "BlackAndWhite metadata는 boolean이어야 합니다.",
  "studio.producerError.cbz.pageCountOutOfRange": "CBZ 페이지 수가 안전 범위를 벗어났습니다.",
  "studio.producerError.cbz.pageCountArchiveLimit": "CBZ 페이지와 metadata 항목 수가 archive 한도를 넘었습니다.",
  "studio.producerError.cbz.comicInfoMetadataLimit": "ComicInfo metadata가 안전 한도를 넘었습니다.",
  "studio.producerError.cbz.sizePageBytesOutOfRange": "CBZ 페이지 크기가 안전 한도를 벗어났습니다.",
  "studio.producerError.cbz.imageFormatInvalid": "CBZ 페이지는 구조와 크기 정보가 올바른 PNG, JPEG, WebP, GIF 중 하나여야 합니다.",
  "studio.producerError.cbz.sizeTotalPageBytesLimit": "CBZ 전체 페이지 크기가 안전 한도를 넘었습니다.",
  "studio.producerError.cbz.sizeTotalDecodedBudget": "CBZ 전체 페이지의 디코드 메모리 예산을 넘었습니다.",
  "studio.producerError.cbz.sizeComicInfoLimit": "ComicInfo.xml이 안전 한도를 넘었습니다.",
  "studio.producerError.cbz.comicInfoTextNotEscaped": "ComicInfo.xml text가 올바르게 escape되지 않았습니다.",
  "studio.producerError.cbz.comicInfoEntityInvalid": "ComicInfo.xml 문자 entity가 올바르지 않습니다.",
  "studio.producerError.cbz.comicInfoElementUnclosed": "ComicInfo.xml element가 닫히지 않았습니다.",
  "studio.producerError.cbz.comicInfoAttributeNameInvalid": "ComicInfo.xml attribute 이름이 올바르지 않습니다.",
  "studio.producerError.cbz.comicInfoAttributeMissingEquals": "ComicInfo.xml attribute에 등호가 없습니다.",
  "studio.producerError.cbz.comicInfoAttributeNotQuoted": "ComicInfo.xml attribute 값은 따옴표로 감싸야 합니다.",
  "studio.producerError.cbz.comicInfoAttributeUnclosed": "ComicInfo.xml attribute 값이 닫히지 않았습니다.",
  "studio.producerError.cbz.comicInfoAttributeUnsafeChar": "ComicInfo.xml attribute 값에 안전하지 않은 문자가 있습니다.",
  "studio.producerError.cbz.comicInfoAttributeDuplicate": "ComicInfo.xml에 {name} attribute가 중복되었습니다.",
  "studio.producerError.cbz.comicInfoAttributeTooMany": "ComicInfo.xml element의 attribute가 너무 많습니다.",
  "studio.producerError.cbz.comicInfoAttributeMissingSpace": "ComicInfo.xml attribute 사이에 공백이 없습니다.",
  "studio.producerError.cbz.comicInfoMixedContent": "ComicInfo.xml {name} element에 혼합 content가 있습니다.",
  "studio.producerError.cbz.comicInfoValueStructureInvalid": "ComicInfo.xml {name} 값의 구조가 올바르지 않습니다.",
  "studio.producerError.cbz.comicInfoTagDuplicate": "ComicInfo.xml에 {name} tag가 중복되었습니다.",
  "studio.producerError.cbz.comicInfoDeclarationUnclosed": "ComicInfo.xml 선언이 닫히지 않았습니다.",
  "studio.producerError.cbz.comicInfoDeclarationUnsupported": "ComicInfo.xml 선언이 지원하는 안전한 형식이 아닙니다.",
  "studio.producerError.cbz.comicInfoTextOutsideRoot": "ComicInfo.xml root 밖에 text가 있습니다.",
  "studio.producerError.cbz.comicInfoTextComplexityLimit": "ComicInfo.xml text가 안전한 복잡도 한도를 넘습니다.",
  "studio.producerError.cbz.comicInfoCommentUnclosed": "ComicInfo.xml 주석이 닫히지 않았습니다.",
  "studio.producerError.cbz.comicInfoCommentInvalid": "ComicInfo.xml 주석 내용이 올바르지 않습니다.",
  "studio.producerError.cbz.comicInfoForbiddenConstruct": "ComicInfo.xml DTD, CDATA, 처리 지시문은 허용되지 않습니다.",
  "studio.producerError.cbz.comicInfoClosingTagInvalid": "ComicInfo.xml 닫는 tag가 올바르지 않습니다.",
  "studio.producerError.cbz.comicInfoTagNestingInvalid": "ComicInfo.xml tag 중첩이 올바르지 않습니다.",
  "studio.producerError.cbz.comicInfoOpeningTagInvalid": "ComicInfo.xml 여는 tag가 올바르지 않습니다.",
  "studio.producerError.cbz.comicInfoTagAttributeMissingSpace": "ComicInfo.xml tag와 attribute 사이에 공백이 없습니다.",
  "studio.producerError.cbz.comicInfoRootInvalid": "ComicInfo.xml root가 올바르지 않습니다.",
  "studio.producerError.cbz.comicInfoElementCountLimit": "ComicInfo.xml element 수가 안전한 한도를 넘습니다.",
  "studio.producerError.cbz.comicInfoDepthLimit": "ComicInfo.xml 중첩 깊이가 안전한 한도를 넘습니다.",
  "studio.producerError.cbz.comicInfoRootUnclosed": "ComicInfo.xml root 또는 tag가 완전히 닫히지 않았습니다.",
  "studio.producerError.cbz.comicInfoIntegerInvalid": "ComicInfo.xml {tag} 값이 정수가 아닙니다.",
  "studio.producerError.cbz.comicInfoIntegerOutOfRange": "ComicInfo.xml {tag} 값이 안전 범위를 벗어났습니다.",
  "studio.producerError.cbz.sizeComicInfoBytesOutOfRange": "ComicInfo.xml 크기가 안전 범위를 벗어났습니다.",
  "studio.producerError.cbz.comicInfoNotUtf8": "ComicInfo.xml이 올바른 UTF-8이 아닙니다.",
  "studio.producerError.cbz.comicInfoUnsafeControlChar": "ComicInfo.xml에 안전하지 않은 제어 문자가 있습니다.",
  "studio.producerError.cbz.comicInfoBlackAndWhiteValueInvalid": "BlackAndWhite 값은 Yes 또는 No여야 합니다.",
  "studio.producerError.cbz.archiveInvalid": "CBZ ZIP 항목이 올바르지 않습니다{detail}",
  "studio.producerError.cbz.sizePageLimit": "CBZ 페이지가 안전 한도를 넘었습니다.",
  "studio.producerError.cbz.imageExtensionMismatch": "CBZ 페이지의 확장자와 PNG/JPEG/WebP/GIF 구조 및 크기 정보가 일치하지 않습니다.",
  "studio.producerError.cbz.warningComicInfoMissing": "ComicInfo.xml이 없어 페이지 이미지만 가져왔습니다.",
  "studio.producerError.cbz.warningIgnoredEntryOsMetadata": "CBZ의 운영체제 metadata 항목 '{path}'을 건너뛰었습니다.",
  "studio.producerError.cbz.warningIgnoredEntryNonImage": "CBZ의 비이미지 항목 '{path}'을 건너뛰었습니다.",
  "studio.producerError.cbz.warningPageCountMismatch": "ComicInfo.xml은 {declared}페이지, archive는 {actual}페이지입니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.cbz.aborted": "The CBZ operation was cancelled.",
  "studio.producerError.cbz.limitInvalid": "The {key} limit must be an integer between {min} and {max}.",
  "studio.producerError.cbz.imageUnsupportedData": "Unsupported CBZ page data.",
  "studio.producerError.cbz.imageReadFailed": "Could not read the CBZ page{detail}",
  "studio.producerError.cbz.sizePageSideLimit": "A CBZ page side exceeds the safe limit.",
  "studio.producerError.cbz.sizePagePixelsLimit": "The decoded pixel count of a CBZ page exceeds the safe limit.",
  "studio.producerError.cbz.comicInfoNotString": "The {label} metadata is not a valid string.",
  "studio.producerError.cbz.comicInfoOutOfRange": "The {label} metadata is out of the safe range.",
  "studio.producerError.cbz.comicInfoNotList": "The {label} metadata must be a list of strings.",
  "studio.producerError.cbz.comicInfoMissingValue": "The {label} value is missing.",
  "studio.producerError.cbz.comicInfoCommaInItem": "Items in {label} cannot contain commas, the list separator.",
  "studio.producerError.cbz.comicInfoBlackAndWhiteNotBoolean": "The BlackAndWhite metadata must be a boolean.",
  "studio.producerError.cbz.pageCountOutOfRange": "The CBZ page count is out of the safe range.",
  "studio.producerError.cbz.pageCountArchiveLimit": "The number of CBZ pages and metadata entries exceeds the archive limit.",
  "studio.producerError.cbz.comicInfoMetadataLimit": "The ComicInfo metadata exceeds the safe limit.",
  "studio.producerError.cbz.sizePageBytesOutOfRange": "The CBZ page size is out of the safe limit.",
  "studio.producerError.cbz.imageFormatInvalid": "CBZ pages must be one of PNG, JPEG, WebP, or GIF with a valid structure and dimensions.",
  "studio.producerError.cbz.sizeTotalPageBytesLimit": "The total CBZ page size exceeds the safe limit.",
  "studio.producerError.cbz.sizeTotalDecodedBudget": "The total CBZ page decoded memory budget was exceeded.",
  "studio.producerError.cbz.sizeComicInfoLimit": "ComicInfo.xml exceeds the safe limit.",
  "studio.producerError.cbz.comicInfoTextNotEscaped": "The ComicInfo.xml text is not escaped correctly.",
  "studio.producerError.cbz.comicInfoEntityInvalid": "A character entity in ComicInfo.xml is invalid.",
  "studio.producerError.cbz.comicInfoElementUnclosed": "A ComicInfo.xml element is not closed.",
  "studio.producerError.cbz.comicInfoAttributeNameInvalid": "A ComicInfo.xml attribute name is invalid.",
  "studio.producerError.cbz.comicInfoAttributeMissingEquals": "A ComicInfo.xml attribute is missing an equals sign.",
  "studio.producerError.cbz.comicInfoAttributeNotQuoted": "ComicInfo.xml attribute values must be quoted.",
  "studio.producerError.cbz.comicInfoAttributeUnclosed": "A ComicInfo.xml attribute value is not closed.",
  "studio.producerError.cbz.comicInfoAttributeUnsafeChar": "A ComicInfo.xml attribute value contains an unsafe character.",
  "studio.producerError.cbz.comicInfoAttributeDuplicate": "The {name} attribute is duplicated in ComicInfo.xml.",
  "studio.producerError.cbz.comicInfoAttributeTooMany": "A ComicInfo.xml element has too many attributes.",
  "studio.producerError.cbz.comicInfoAttributeMissingSpace": "There is no space between ComicInfo.xml attributes.",
  "studio.producerError.cbz.comicInfoMixedContent": "The ComicInfo.xml {name} element contains mixed content.",
  "studio.producerError.cbz.comicInfoValueStructureInvalid": "The structure of the ComicInfo.xml {name} value is invalid.",
  "studio.producerError.cbz.comicInfoTagDuplicate": "The {name} tag is duplicated in ComicInfo.xml.",
  "studio.producerError.cbz.comicInfoDeclarationUnclosed": "The ComicInfo.xml declaration is not closed.",
  "studio.producerError.cbz.comicInfoDeclarationUnsupported": "The ComicInfo.xml declaration is not a supported safe format.",
  "studio.producerError.cbz.comicInfoTextOutsideRoot": "There is text outside the ComicInfo.xml root.",
  "studio.producerError.cbz.comicInfoTextComplexityLimit": "The ComicInfo.xml text exceeds the safe complexity limit.",
  "studio.producerError.cbz.comicInfoCommentUnclosed": "A ComicInfo.xml comment is not closed.",
  "studio.producerError.cbz.comicInfoCommentInvalid": "A ComicInfo.xml comment is invalid.",
  "studio.producerError.cbz.comicInfoForbiddenConstruct": "DTD, CDATA, and processing instructions are not allowed in ComicInfo.xml.",
  "studio.producerError.cbz.comicInfoClosingTagInvalid": "A ComicInfo.xml closing tag is invalid.",
  "studio.producerError.cbz.comicInfoTagNestingInvalid": "ComicInfo.xml tags are not nested correctly.",
  "studio.producerError.cbz.comicInfoOpeningTagInvalid": "A ComicInfo.xml opening tag is invalid.",
  "studio.producerError.cbz.comicInfoTagAttributeMissingSpace": "There is no space between a ComicInfo.xml tag and its attribute.",
  "studio.producerError.cbz.comicInfoRootInvalid": "The ComicInfo.xml root is invalid.",
  "studio.producerError.cbz.comicInfoElementCountLimit": "The number of ComicInfo.xml elements exceeds the safe limit.",
  "studio.producerError.cbz.comicInfoDepthLimit": "The ComicInfo.xml nesting depth exceeds the safe limit.",
  "studio.producerError.cbz.comicInfoRootUnclosed": "The ComicInfo.xml root or tags are not fully closed.",
  "studio.producerError.cbz.comicInfoIntegerInvalid": "The ComicInfo.xml {tag} value is not an integer.",
  "studio.producerError.cbz.comicInfoIntegerOutOfRange": "The ComicInfo.xml {tag} value is out of the safe range.",
  "studio.producerError.cbz.sizeComicInfoBytesOutOfRange": "The ComicInfo.xml size is out of the safe range.",
  "studio.producerError.cbz.comicInfoNotUtf8": "ComicInfo.xml is not valid UTF-8.",
  "studio.producerError.cbz.comicInfoUnsafeControlChar": "ComicInfo.xml contains an unsafe control character.",
  "studio.producerError.cbz.comicInfoBlackAndWhiteValueInvalid": "The BlackAndWhite value must be Yes or No.",
  "studio.producerError.cbz.archiveInvalid": "The CBZ ZIP entries are invalid{detail}",
  "studio.producerError.cbz.sizePageLimit": "A CBZ page exceeds the safe limit.",
  "studio.producerError.cbz.imageExtensionMismatch": "The CBZ page extension does not match its PNG/JPEG/WebP/GIF structure and dimensions.",
  "studio.producerError.cbz.warningComicInfoMissing": "There is no ComicInfo.xml, so only the page images were imported.",
  "studio.producerError.cbz.warningIgnoredEntryOsMetadata": "Skipped the CBZ operating system metadata entry '{path}'.",
  "studio.producerError.cbz.warningIgnoredEntryNonImage": "Skipped the non-image CBZ entry '{path}'.",
  "studio.producerError.cbz.warningPageCountMismatch": "ComicInfo.xml declares {declared} pages, but the archive contains {actual} pages.",
});

const CBZ_ERROR_KEYS: Readonly<Record<StudioCbzErrorVariant, string>> = {
  "aborted": "studio.producerError.cbz.aborted",
  "limitInvalid": "studio.producerError.cbz.limitInvalid",
  "imageUnsupportedData": "studio.producerError.cbz.imageUnsupportedData",
  "imageReadFailed": "studio.producerError.cbz.imageReadFailed",
  "sizePageSideLimit": "studio.producerError.cbz.sizePageSideLimit",
  "sizePagePixelsLimit": "studio.producerError.cbz.sizePagePixelsLimit",
  "comicInfoNotString": "studio.producerError.cbz.comicInfoNotString",
  "comicInfoOutOfRange": "studio.producerError.cbz.comicInfoOutOfRange",
  "comicInfoNotList": "studio.producerError.cbz.comicInfoNotList",
  "comicInfoMissingValue": "studio.producerError.cbz.comicInfoMissingValue",
  "comicInfoCommaInItem": "studio.producerError.cbz.comicInfoCommaInItem",
  "comicInfoBlackAndWhiteNotBoolean": "studio.producerError.cbz.comicInfoBlackAndWhiteNotBoolean",
  "pageCountOutOfRange": "studio.producerError.cbz.pageCountOutOfRange",
  "pageCountArchiveLimit": "studio.producerError.cbz.pageCountArchiveLimit",
  "comicInfoMetadataLimit": "studio.producerError.cbz.comicInfoMetadataLimit",
  "sizePageBytesOutOfRange": "studio.producerError.cbz.sizePageBytesOutOfRange",
  "imageFormatInvalid": "studio.producerError.cbz.imageFormatInvalid",
  "sizeTotalPageBytesLimit": "studio.producerError.cbz.sizeTotalPageBytesLimit",
  "sizeTotalDecodedBudget": "studio.producerError.cbz.sizeTotalDecodedBudget",
  "sizeComicInfoLimit": "studio.producerError.cbz.sizeComicInfoLimit",
  "comicInfoTextNotEscaped": "studio.producerError.cbz.comicInfoTextNotEscaped",
  "comicInfoEntityInvalid": "studio.producerError.cbz.comicInfoEntityInvalid",
  "comicInfoElementUnclosed": "studio.producerError.cbz.comicInfoElementUnclosed",
  "comicInfoAttributeNameInvalid": "studio.producerError.cbz.comicInfoAttributeNameInvalid",
  "comicInfoAttributeMissingEquals": "studio.producerError.cbz.comicInfoAttributeMissingEquals",
  "comicInfoAttributeNotQuoted": "studio.producerError.cbz.comicInfoAttributeNotQuoted",
  "comicInfoAttributeUnclosed": "studio.producerError.cbz.comicInfoAttributeUnclosed",
  "comicInfoAttributeUnsafeChar": "studio.producerError.cbz.comicInfoAttributeUnsafeChar",
  "comicInfoAttributeDuplicate": "studio.producerError.cbz.comicInfoAttributeDuplicate",
  "comicInfoAttributeTooMany": "studio.producerError.cbz.comicInfoAttributeTooMany",
  "comicInfoAttributeMissingSpace": "studio.producerError.cbz.comicInfoAttributeMissingSpace",
  "comicInfoMixedContent": "studio.producerError.cbz.comicInfoMixedContent",
  "comicInfoValueStructureInvalid": "studio.producerError.cbz.comicInfoValueStructureInvalid",
  "comicInfoTagDuplicate": "studio.producerError.cbz.comicInfoTagDuplicate",
  "comicInfoDeclarationUnclosed": "studio.producerError.cbz.comicInfoDeclarationUnclosed",
  "comicInfoDeclarationUnsupported": "studio.producerError.cbz.comicInfoDeclarationUnsupported",
  "comicInfoTextOutsideRoot": "studio.producerError.cbz.comicInfoTextOutsideRoot",
  "comicInfoTextComplexityLimit": "studio.producerError.cbz.comicInfoTextComplexityLimit",
  "comicInfoCommentUnclosed": "studio.producerError.cbz.comicInfoCommentUnclosed",
  "comicInfoCommentInvalid": "studio.producerError.cbz.comicInfoCommentInvalid",
  "comicInfoForbiddenConstruct": "studio.producerError.cbz.comicInfoForbiddenConstruct",
  "comicInfoClosingTagInvalid": "studio.producerError.cbz.comicInfoClosingTagInvalid",
  "comicInfoTagNestingInvalid": "studio.producerError.cbz.comicInfoTagNestingInvalid",
  "comicInfoOpeningTagInvalid": "studio.producerError.cbz.comicInfoOpeningTagInvalid",
  "comicInfoTagAttributeMissingSpace": "studio.producerError.cbz.comicInfoTagAttributeMissingSpace",
  "comicInfoRootInvalid": "studio.producerError.cbz.comicInfoRootInvalid",
  "comicInfoElementCountLimit": "studio.producerError.cbz.comicInfoElementCountLimit",
  "comicInfoDepthLimit": "studio.producerError.cbz.comicInfoDepthLimit",
  "comicInfoRootUnclosed": "studio.producerError.cbz.comicInfoRootUnclosed",
  "comicInfoIntegerInvalid": "studio.producerError.cbz.comicInfoIntegerInvalid",
  "comicInfoIntegerOutOfRange": "studio.producerError.cbz.comicInfoIntegerOutOfRange",
  "sizeComicInfoBytesOutOfRange": "studio.producerError.cbz.sizeComicInfoBytesOutOfRange",
  "comicInfoNotUtf8": "studio.producerError.cbz.comicInfoNotUtf8",
  "comicInfoUnsafeControlChar": "studio.producerError.cbz.comicInfoUnsafeControlChar",
  "comicInfoBlackAndWhiteValueInvalid": "studio.producerError.cbz.comicInfoBlackAndWhiteValueInvalid",
  "archiveInvalid": "studio.producerError.cbz.archiveInvalid",
  "sizePageLimit": "studio.producerError.cbz.sizePageLimit",
  "imageExtensionMismatch": "studio.producerError.cbz.imageExtensionMismatch",
};

/** variant별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const CBZ_ERROR_KO: Readonly<Record<StudioCbzErrorVariant, string>> = {
  "aborted": "CBZ 작업이 취소되었습니다.",
  "limitInvalid": "{key} 한도는 {min} 이상 {max} 이하의 정수여야 합니다.",
  "imageUnsupportedData": "지원하지 않는 CBZ 페이지 데이터입니다.",
  "imageReadFailed": "CBZ 페이지를 읽지 못했습니다{detail}",
  "sizePageSideLimit": "CBZ 페이지 한 변의 길이가 안전 한도를 넘었습니다.",
  "sizePagePixelsLimit": "CBZ 페이지의 디코드 픽셀 수가 안전 한도를 넘었습니다.",
  "comicInfoNotString": "{label} metadata가 올바른 문자열이 아닙니다.",
  "comicInfoOutOfRange": "{label} metadata가 안전 범위를 벗어났습니다.",
  "comicInfoNotList": "{label} metadata는 문자열 목록이어야 합니다.",
  "comicInfoMissingValue": "{label} 값이 없습니다.",
  "comicInfoCommaInItem": "{label} 항목에는 목록 구분자인 쉼표를 사용할 수 없습니다.",
  "comicInfoBlackAndWhiteNotBoolean": "BlackAndWhite metadata는 boolean이어야 합니다.",
  "pageCountOutOfRange": "CBZ 페이지 수가 안전 범위를 벗어났습니다.",
  "pageCountArchiveLimit": "CBZ 페이지와 metadata 항목 수가 archive 한도를 넘었습니다.",
  "comicInfoMetadataLimit": "ComicInfo metadata가 안전 한도를 넘었습니다.",
  "sizePageBytesOutOfRange": "CBZ 페이지 크기가 안전 한도를 벗어났습니다.",
  "imageFormatInvalid": "CBZ 페이지는 구조와 크기 정보가 올바른 PNG, JPEG, WebP, GIF 중 하나여야 합니다.",
  "sizeTotalPageBytesLimit": "CBZ 전체 페이지 크기가 안전 한도를 넘었습니다.",
  "sizeTotalDecodedBudget": "CBZ 전체 페이지의 디코드 메모리 예산을 넘었습니다.",
  "sizeComicInfoLimit": "ComicInfo.xml이 안전 한도를 넘었습니다.",
  "comicInfoTextNotEscaped": "ComicInfo.xml text가 올바르게 escape되지 않았습니다.",
  "comicInfoEntityInvalid": "ComicInfo.xml 문자 entity가 올바르지 않습니다.",
  "comicInfoElementUnclosed": "ComicInfo.xml element가 닫히지 않았습니다.",
  "comicInfoAttributeNameInvalid": "ComicInfo.xml attribute 이름이 올바르지 않습니다.",
  "comicInfoAttributeMissingEquals": "ComicInfo.xml attribute에 등호가 없습니다.",
  "comicInfoAttributeNotQuoted": "ComicInfo.xml attribute 값은 따옴표로 감싸야 합니다.",
  "comicInfoAttributeUnclosed": "ComicInfo.xml attribute 값이 닫히지 않았습니다.",
  "comicInfoAttributeUnsafeChar": "ComicInfo.xml attribute 값에 안전하지 않은 문자가 있습니다.",
  "comicInfoAttributeDuplicate": "ComicInfo.xml에 {name} attribute가 중복되었습니다.",
  "comicInfoAttributeTooMany": "ComicInfo.xml element의 attribute가 너무 많습니다.",
  "comicInfoAttributeMissingSpace": "ComicInfo.xml attribute 사이에 공백이 없습니다.",
  "comicInfoMixedContent": "ComicInfo.xml {name} element에 혼합 content가 있습니다.",
  "comicInfoValueStructureInvalid": "ComicInfo.xml {name} 값의 구조가 올바르지 않습니다.",
  "comicInfoTagDuplicate": "ComicInfo.xml에 {name} tag가 중복되었습니다.",
  "comicInfoDeclarationUnclosed": "ComicInfo.xml 선언이 닫히지 않았습니다.",
  "comicInfoDeclarationUnsupported": "ComicInfo.xml 선언이 지원하는 안전한 형식이 아닙니다.",
  "comicInfoTextOutsideRoot": "ComicInfo.xml root 밖에 text가 있습니다.",
  "comicInfoTextComplexityLimit": "ComicInfo.xml text가 안전한 복잡도 한도를 넘습니다.",
  "comicInfoCommentUnclosed": "ComicInfo.xml 주석이 닫히지 않았습니다.",
  "comicInfoCommentInvalid": "ComicInfo.xml 주석 내용이 올바르지 않습니다.",
  "comicInfoForbiddenConstruct": "ComicInfo.xml DTD, CDATA, 처리 지시문은 허용되지 않습니다.",
  "comicInfoClosingTagInvalid": "ComicInfo.xml 닫는 tag가 올바르지 않습니다.",
  "comicInfoTagNestingInvalid": "ComicInfo.xml tag 중첩이 올바르지 않습니다.",
  "comicInfoOpeningTagInvalid": "ComicInfo.xml 여는 tag가 올바르지 않습니다.",
  "comicInfoTagAttributeMissingSpace": "ComicInfo.xml tag와 attribute 사이에 공백이 없습니다.",
  "comicInfoRootInvalid": "ComicInfo.xml root가 올바르지 않습니다.",
  "comicInfoElementCountLimit": "ComicInfo.xml element 수가 안전한 한도를 넘습니다.",
  "comicInfoDepthLimit": "ComicInfo.xml 중첩 깊이가 안전한 한도를 넘습니다.",
  "comicInfoRootUnclosed": "ComicInfo.xml root 또는 tag가 완전히 닫히지 않았습니다.",
  "comicInfoIntegerInvalid": "ComicInfo.xml {tag} 값이 정수가 아닙니다.",
  "comicInfoIntegerOutOfRange": "ComicInfo.xml {tag} 값이 안전 범위를 벗어났습니다.",
  "sizeComicInfoBytesOutOfRange": "ComicInfo.xml 크기가 안전 범위를 벗어났습니다.",
  "comicInfoNotUtf8": "ComicInfo.xml이 올바른 UTF-8이 아닙니다.",
  "comicInfoUnsafeControlChar": "ComicInfo.xml에 안전하지 않은 제어 문자가 있습니다.",
  "comicInfoBlackAndWhiteValueInvalid": "BlackAndWhite 값은 Yes 또는 No여야 합니다.",
  "archiveInvalid": "CBZ ZIP 항목이 올바르지 않습니다{detail}",
  "sizePageLimit": "CBZ 페이지가 안전 한도를 넘었습니다.",
  "imageExtensionMismatch": "CBZ 페이지의 확장자와 PNG/JPEG/WebP/GIF 구조 및 크기 정보가 일치하지 않습니다.",
};

const CBZ_ERROR_CODES: ReadonlySet<string> = new Set([
  "ABORTED",
  "ARCHIVE_INVALID",
  "COMICINFO_INVALID",
  "IMAGE_INVALID",
  "LIMIT_INVALID",
  "PAGE_COUNT_LIMIT",
  "SIZE_LIMIT",
]);

/** ComicInfo 고정 라벨 코드 → 표시 라벨. 라벨 자체는 양 로케일 공통 영문 표기다. */
const CBZ_METADATA_LABELS: Readonly<Record<string, string>> = {
  ageRating: "AgeRating",
  blackAndWhite: "BlackAndWhite",
  colorist: "Colorist",
  count: "Count",
  coverArtist: "CoverArtist",
  day: "Day",
  editor: "Editor",
  format: "Format",
  genre: "Genre",
  imprint: "Imprint",
  inker: "Inker",
  languageISO: "LanguageISO",
  letterer: "Letterer",
  manga: "Manga",
  month: "Month",
  notes: "Notes",
  number: "Number",
  penciller: "Penciller",
  publisher: "Publisher",
  series: "Series",
  summary: "Summary",
  tags: "Tags",
  title: "Title",
  volume: "Volume",
  web: "Web",
  writer: "Writer",
  year: "Year",
};

function withCbzMetadataLabel(
  params?: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> | undefined {
  if (!params?.label) return params;
  return { ...params, label: CBZ_METADATA_LABELS[params.label] ?? params.label };
}

/** 표시 지점 전용 해석 (cbz 오류): 구조화 오류를 직접 받는 표시 지점이 부른다. */
export function resolveStudioCbzError(
  error: Pick<StudioCbzError, "code" | "variant" | "params">,
): string {
  return resolveProducerError(
    CBZ_ERROR_KEYS[error.variant],
    CBZ_ERROR_KO[error.variant],
    withCbzMetadataLabel(error.params),
  );
}

/**
 * 표시 지점 전용 해석 (cbz 오류, 원인 객체 덕 타이핑): 가져오기·내보내기 catch가
 * 원인 객체만으로 부른다. 생산자 모듈을 런타임 import하면 ZIP 코덱이 표시 그래프에
 * 끌려오므로 이름+코드+variant 덕 타이핑으로 판정한다.
 * 해당하지 않으면 null — 호출자는 기존 메시지 경로를 유지한다.
 */
export function resolveStudioCbzErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code, variant, params } = cause as {
    name?: unknown;
    code?: unknown;
    variant?: unknown;
    params?: unknown;
  };
  if (name !== "StudioCbzError" || typeof code !== "string" || typeof variant !== "string") {
    return null;
  }
  if (!CBZ_ERROR_CODES.has(code) || !Object.hasOwn(CBZ_ERROR_KEYS, variant)) return null;
  return resolveStudioCbzError({
    code: code as StudioCbzError["code"],
    variant: variant as StudioCbzErrorVariant,
    params: (params ?? undefined) as Readonly<Record<string, string>> | undefined,
  });
}

/** 경고 해석 키: `${code}:${variant}` (방출 지점 suffix). */
const CBZ_WARNING_KEYS: Readonly<Record<string, string>> = {
  "COMICINFO_MISSING:missing": "studio.producerError.cbz.warningComicInfoMissing",
  "IGNORED_ENTRY:osMetadata": "studio.producerError.cbz.warningIgnoredEntryOsMetadata",
  "IGNORED_ENTRY:nonImage": "studio.producerError.cbz.warningIgnoredEntryNonImage",
  "PAGE_COUNT_MISMATCH:countMismatch": "studio.producerError.cbz.warningPageCountMismatch",
};

/** 경고 키별 ko 원문 템플릿 — 키 단위 폴백이며 이관 전 원문과 동일하다. */
const CBZ_WARNING_KO: Readonly<Record<string, string>> = {
  "studio.producerError.cbz.warningComicInfoMissing": "ComicInfo.xml이 없어 페이지 이미지만 가져왔습니다.",
  "studio.producerError.cbz.warningIgnoredEntryOsMetadata": "CBZ의 운영체제 metadata 항목 '{path}'을 건너뛰었습니다.",
  "studio.producerError.cbz.warningIgnoredEntryNonImage": "CBZ의 비이미지 항목 '{path}'을 건너뛰었습니다.",
  "studio.producerError.cbz.warningPageCountMismatch": "ComicInfo.xml은 {declared}페이지, archive는 {actual}페이지입니다.",
};

/**
 * 표시 지점 전용 해석 (cbz 경고). 집계자 예외: 경고 채널은 결과 타입이 구조화
 * 객체로 고정돼 있어, 집계 경계(studio-document-interchange-preview.ts의
 * aggregateCodecWarnings)에서 이 함수로 해석해 기존 message 합성 형태를 유지한다.
 */
export function resolveStudioCbzWarning(warning: StudioCbzWarning): string {
  const key = CBZ_WARNING_KEYS[`${warning.code}:${warning.variant}`];
  if (!key) return warning.code;
  return resolveProducerError(key, CBZ_WARNING_KO[key], warning.params);
}
