/**
 * 생산자 구조화 에러 해석 모듈 — ora 구간: studio-openraster-interchange 오류 83 variant + 경고 8키 (A4 D4, R12).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와 동일하다:
 * 생산자는 {code, variant, params}만 방출하고, 표시는 이 모듈의 리졸버로만 해석한다.
 * ko 값은 이관 전 생산자 원문과 글자 단위 동일하고, en은 신규 번역이다.
 * label params 중 내부 고정 라벨(레이어 이름·문서 이름·바이트 예산 종류)은 생산자가
 * labelCode로 방출하고 이 모듈의 라벨 표로 로케일별 표시 라벨로 되돌린다.
 * stack.xml attribute 라벨(x·y·w·h·xres·yres)은 식별자라 params 패스스루다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type {
  StudioOpenRasterError,
  StudioOpenRasterErrorVariant,
  StudioOpenRasterWarning,
} from "../studio-openraster-interchange";

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
  "studio.producerError.ora.aborted": "OpenRaster 작업이 취소되었습니다.",
  "studio.producerError.ora.limitInvalid": "{key} 한도는 0 이상 {max} 이하의 정수여야 합니다.",
  "studio.producerError.ora.imageUnsupportedData": "지원하지 않는 OpenRaster 이미지 데이터입니다.",
  "studio.producerError.ora.imageReadFailed": "OpenRaster 이미지를 읽지 못했습니다{detail}",
  "studio.producerError.ora.pngSignatureInvalid": "OpenRaster 항목이 유효한 PNG signature를 갖지 않습니다.",
  "studio.producerError.ora.pngIhdrIncomplete": "OpenRaster PNG의 IHDR가 완전하지 않습니다.",
  "studio.producerError.ora.pngFirstChunkNotIhdr": "OpenRaster PNG의 첫 chunk가 13바이트 IHDR가 아닙니다.",
  "studio.producerError.ora.pngDimensionsZero": "OpenRaster PNG IHDR의 너비와 높이는 1 이상이어야 합니다.",
  "studio.producerError.ora.pngDimensionLimit": "OpenRaster PNG '{path}'의 IHDR 크기 {width}×{height}가 축 한도 {max}px를 넘었습니다.",
  "studio.producerError.ora.pngPixelLimit": "OpenRaster PNG '{path}'의 IHDR 픽셀 수가 이미지당 디코딩 한도 {max}px를 넘었습니다.",
  "studio.producerError.ora.pngIhdrFormatInvalid": "OpenRaster PNG IHDR의 색상 또는 압축 형식이 올바르지 않습니다.",
  "studio.producerError.ora.imageBudgetExceeded": "OpenRaster '{path}'에서 {label} 누적 한도 {max}바이트를 넘었습니다.",
  "studio.producerError.ora.canvasDimensionOutOfRange": "OpenRaster 캔버스 크기가 안전 범위를 벗어났습니다.",
  "studio.producerError.ora.layerOffsetOutOfRange": "OpenRaster 레이어 오프셋이 안전 범위를 벗어났습니다.",
  "studio.producerError.ora.layerOpacityOutOfRange": "OpenRaster 레이어 불투명도는 0부터 1 사이여야 합니다.",
  "studio.producerError.ora.xmlTextOutOfRange": "{label}이 비어 있거나 안전 범위를 벗어났습니다.",
  "studio.producerError.ora.pngSizeLimit": "OpenRaster PNG 크기가 안전 한도를 벗어났습니다.",
  "studio.producerError.ora.pngSizeChanged": "OpenRaster PNG를 읽는 동안 바이트 크기가 변경되었습니다.",
  "studio.producerError.ora.layerCountOutOfRange": "OpenRaster 레이어 수가 안전 범위를 벗어났습니다.",
  "studio.producerError.ora.sizeStackXmlLimit": "OpenRaster stack.xml이 안전 한도를 넘었습니다.",
  "studio.producerError.ora.stackUnknownEntity": "stack.xml에 알 수 없는 문자 entity가 있습니다.",
  "studio.producerError.ora.stackInvalidEntity": "stack.xml에 유효하지 않은 문자 entity가 있습니다.",
  "studio.producerError.ora.stackTagNameInvalid": "stack.xml tag 이름이 올바르지 않습니다.",
  "studio.producerError.ora.stackClosingTagInvalid": "stack.xml 닫는 tag가 올바르지 않습니다.",
  "studio.producerError.ora.stackSelfClosingTagInvalid": "stack.xml self-closing tag가 올바르지 않습니다.",
  "studio.producerError.ora.stackAttributeNameInvalid": "stack.xml attribute 이름이 올바르지 않습니다.",
  "studio.producerError.ora.stackAttributeMissingEquals": "stack.xml attribute에 =가 없습니다.",
  "studio.producerError.ora.stackAttributeNotQuoted": "stack.xml attribute 값은 인용되어야 합니다.",
  "studio.producerError.ora.stackAttributeUnclosed": "stack.xml attribute 값이 닫히지 않았습니다.",
  "studio.producerError.ora.stackAttributeDuplicate": "stack.xml tag에 중복 attribute가 있습니다.",
  "studio.producerError.ora.stackAttributeTooMany": "stack.xml tag의 attribute 수가 안전 한도를 넘었습니다.",
  "studio.producerError.ora.stackIntegerInvalid": "stack.xml {label} 값이 정수가 아닙니다.",
  "studio.producerError.ora.stackIntegerOutOfRange": "stack.xml {label} 값이 안전 범위를 벗어났습니다.",
  "studio.producerError.ora.layerSourcePathInvalid": "OpenRaster 레이어 src가 안전한 상대 PNG 경로가 아닙니다.",
  "studio.producerError.ora.layerSourcePathSegmentUnsafe": "OpenRaster 레이어 src에 안전하지 않은 경로 구간이 있습니다.",
  "studio.producerError.ora.layerSourceReservedEntry": "OpenRaster 레이어가 예약된 archive 항목을 참조합니다.",
  "studio.producerError.ora.opacityNotNumber": "OpenRaster opacity가 올바른 실수가 아닙니다.",
  "studio.producerError.ora.opacityOutOfRange": "OpenRaster opacity는 0부터 1 사이여야 합니다.",
  "studio.producerError.ora.visibilityInvalid": "OpenRaster visibility가 올바르지 않습니다.",
  "studio.producerError.ora.layerSourceDuplicate": "여러 OpenRaster 레이어가 같은 PNG 경로를 중복 참조합니다.",
  "studio.producerError.ora.layerNameOutOfRange": "OpenRaster 레이어 이름이 안전 범위를 벗어났습니다.",
  "studio.producerError.ora.sizeStackXmlBytesOutOfRange": "OpenRaster stack.xml 크기가 안전 범위를 벗어났습니다.",
  "studio.producerError.ora.stackNotUtf8": "OpenRaster stack.xml이 올바른 UTF-8이 아닙니다.",
  "studio.producerError.ora.stackDtdForbidden": "OpenRaster stack.xml의 DTD/entity 선언은 허용되지 않습니다.",
  "studio.producerError.ora.stackTextOutsideRoot": "stack.xml root 밖에 텍스트가 있습니다.",
  "studio.producerError.ora.stackUnexpectedText": "stack.xml element 사이에 예상하지 못한 텍스트가 있습니다.",
  "studio.producerError.ora.stackCommentUnclosed": "stack.xml 주석이 올바르게 닫히지 않았습니다.",
  "studio.producerError.ora.stackProcessingInstructionUnclosed": "stack.xml 처리 지시문이 닫히지 않았습니다.",
  "studio.producerError.ora.stackDeclarationInvalid": "stack.xml에는 선두의 안전한 XML 선언만 허용됩니다.",
  "studio.producerError.ora.stackDeclarationElementForbidden": "stack.xml 선언 element는 허용되지 않습니다.",
  "studio.producerError.ora.stackTagUnclosed": "stack.xml tag가 닫히지 않았습니다.",
  "studio.producerError.ora.stackNestingInvalid": "stack.xml element 중첩이 올바르지 않습니다.",
  "studio.producerError.ora.stackElementCountLimit": "stack.xml element 수가 안전 한도를 넘었습니다.",
  "studio.producerError.ora.stackDepthLimit": "stack.xml element 깊이가 안전 한도를 넘었습니다.",
  "studio.producerError.ora.stackImageRootNotUnique": "stack.xml에는 image root가 하나만 있어야 합니다.",
  "studio.producerError.ora.documentNameOutOfRange": "OpenRaster 문서 이름이 안전 범위를 벗어났습니다.",
  "studio.producerError.ora.versionNotSemver": "OpenRaster version이 올바른 SemVer가 아닙니다.",
  "studio.producerError.ora.resolutionPairRequired": "OpenRaster xres와 yres는 함께 지정되어야 합니다.",
  "studio.producerError.ora.stackTopLevelElementForbidden": "stack.xml에는 image root 외의 최상위 element가 있을 수 없습니다.",
  "studio.producerError.ora.rootStackNotUnique": "OpenRaster image에는 root stack이 하나만 있어야 합니다.",
  "studio.producerError.ora.groupCountLimit": "OpenRaster 그룹 수가 안전 한도를 넘었습니다.",
  "studio.producerError.ora.groupNameOutOfRange": "OpenRaster 그룹 이름이 안전 범위를 벗어났습니다.",
  "studio.producerError.ora.groupIsolationInvalid": "OpenRaster 그룹 isolation이 올바르지 않습니다.",
  "studio.producerError.ora.groupStackOutsideLayerStack": "OpenRaster 그룹 stack이 레이어 stack 밖에 있습니다.",
  "studio.producerError.ora.layerOutsideStack": "OpenRaster layer가 stack 밖에 있습니다.",
  "studio.producerError.ora.layerCountLimit": "OpenRaster 레이어 수가 안전 한도를 넘었습니다.",
  "studio.producerError.ora.stackStructureIncomplete": "OpenRaster stack.xml 구조가 완전하지 않습니다.",
  "studio.producerError.ora.noLayersToImport": "OpenRaster에 가져올 레이어가 없습니다.",
  "studio.producerError.ora.archiveEntryVerifyFailed": "OpenRaster ZIP 항목 '{path}'을 검증하지 못했습니다: {detail}",
  "studio.producerError.ora.archiveEntryReadFailed": "OpenRaster ZIP 항목 '{path}'을 읽지 못했습니다{detail}",
  "studio.producerError.ora.archiveInvalid": "OpenRaster ZIP이 올바르지 않습니다{detail}",
  "studio.producerError.ora.mimetypeNotFirstStored": "OpenRaster mimetype은 첫 번째 stored 항목이어야 합니다.",
  "studio.producerError.ora.mimetypeLengthInvalid": "OpenRaster mimetype 바이트 길이가 올바르지 않습니다.",
  "studio.producerError.ora.mimetypeNotUtf8": "OpenRaster mimetype이 올바른 UTF-8이 아닙니다.",
  "studio.producerError.ora.mimetypeValueInvalid": "OpenRaster mimetype 값이 올바르지 않습니다.",
  "studio.producerError.ora.requiredStackXmlMissing": "OpenRaster stack.xml이 없습니다.",
  "studio.producerError.ora.requiredMergedImageMissing": "OpenRaster mergedimage.png가 없습니다.",
  "studio.producerError.ora.requiredThumbnailMissing": "OpenRaster thumbnail.png가 없습니다.",
  "studio.producerError.ora.sizeStackXmlByteLimit": "OpenRaster stack.xml이 안전 바이트 한도를 넘었습니다.",
  "studio.producerError.ora.sizeMergedImageByteLimit": "OpenRaster mergedimage.png가 안전 바이트 한도를 넘었습니다.",
  "studio.producerError.ora.sizeThumbnailByteLimit": "OpenRaster thumbnail.png가 안전 바이트 한도를 넘었습니다.",
  "studio.producerError.ora.requiredLayerPngMissing": "OpenRaster 레이어 PNG가 없습니다.",
  "studio.producerError.ora.sizeLayerPngLimit": "OpenRaster 레이어 PNG가 안전 한도를 넘었습니다.",
  "studio.producerError.ora.warningPreviewDimensionMismatch": "mergedimage.png {width}×{height}px가 문서 {docWidth}×{docHeight}px와 달라 미리보기와 편집 레이어가 다를 수 있습니다.",
  "studio.producerError.ora.warningPreviewProfileMergedBitDepth": "mergedimage.png의 {bitDepth}-bit PNG 프로필은 ORA 호환 프로필(8-bit 또는 16-bit)과 다릅니다.",
  "studio.producerError.ora.warningPreviewProfileThumbnail": "thumbnail.png {width}×{height}px가 ORA 권장 프로필(최대 256×256, 8-bit, non-interlaced)과 달라 외부 탐색기 호환성이 낮을 수 있습니다.",
  "studio.producerError.ora.warningBlendModeExport": "지원하지 않는 혼합 모드 '{mode}'를 normal로 내보냈습니다.",
  "studio.producerError.ora.warningBlendModeImport": "지원하지 않는 ORA 혼합 모드 '{mode}'를 normal로 가져왔습니다. 원본 값은 metadata에 남겼습니다.",
  "studio.producerError.ora.warningUnsupportedXmlAttribute": "OpenRaster '{element}'의 지원하지 않는 attribute({attributes})는 보존하지 않습니다.",
  "studio.producerError.ora.warningUnsupportedXmlElement": "OpenRaster의 '{element}' extension element는 가져오거나 다시 저장할 수 없습니다.",
  "studio.producerError.ora.warningMasksIgnored": "OpenRaster 레이어 마스크는 가져오지 않으며 원본 편집 효과가 달라질 수 있습니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.ora.aborted": "The OpenRaster operation was cancelled.",
  "studio.producerError.ora.limitInvalid": "The {key} limit must be an integer between 0 and {max}.",
  "studio.producerError.ora.imageUnsupportedData": "Unsupported OpenRaster image data.",
  "studio.producerError.ora.imageReadFailed": "Could not read the OpenRaster image{detail}",
  "studio.producerError.ora.pngSignatureInvalid": "The OpenRaster entry does not have a valid PNG signature.",
  "studio.producerError.ora.pngIhdrIncomplete": "The OpenRaster PNG IHDR is incomplete.",
  "studio.producerError.ora.pngFirstChunkNotIhdr": "The first chunk of the OpenRaster PNG is not a 13-byte IHDR.",
  "studio.producerError.ora.pngDimensionsZero": "The OpenRaster PNG IHDR width and height must be at least 1.",
  "studio.producerError.ora.pngDimensionLimit": "The IHDR size {width}×{height} of the OpenRaster PNG '{path}' exceeds the axis limit of {max}px.",
  "studio.producerError.ora.pngPixelLimit": "The IHDR pixel count of the OpenRaster PNG '{path}' exceeds the per-image decoding limit of {max}px.",
  "studio.producerError.ora.pngIhdrFormatInvalid": "The color or compression format of the OpenRaster PNG IHDR is invalid.",
  "studio.producerError.ora.imageBudgetExceeded": "The cumulative {label} limit of {max} bytes was exceeded at OpenRaster '{path}'.",
  "studio.producerError.ora.canvasDimensionOutOfRange": "The OpenRaster canvas size is out of the safe range.",
  "studio.producerError.ora.layerOffsetOutOfRange": "The OpenRaster layer offset is out of the safe range.",
  "studio.producerError.ora.layerOpacityOutOfRange": "The OpenRaster layer opacity must be between 0 and 1.",
  "studio.producerError.ora.xmlTextOutOfRange": "{label} is empty or out of the safe range.",
  "studio.producerError.ora.pngSizeLimit": "The OpenRaster PNG size exceeds the safe limit.",
  "studio.producerError.ora.pngSizeChanged": "The byte size changed while reading the OpenRaster PNG.",
  "studio.producerError.ora.layerCountOutOfRange": "The OpenRaster layer count is out of the safe range.",
  "studio.producerError.ora.sizeStackXmlLimit": "The OpenRaster stack.xml exceeds the safe limit.",
  "studio.producerError.ora.stackUnknownEntity": "stack.xml contains an unknown character entity.",
  "studio.producerError.ora.stackInvalidEntity": "stack.xml contains an invalid character entity.",
  "studio.producerError.ora.stackTagNameInvalid": "A stack.xml tag name is invalid.",
  "studio.producerError.ora.stackClosingTagInvalid": "A stack.xml closing tag is invalid.",
  "studio.producerError.ora.stackSelfClosingTagInvalid": "A stack.xml self-closing tag is invalid.",
  "studio.producerError.ora.stackAttributeNameInvalid": "A stack.xml attribute name is invalid.",
  "studio.producerError.ora.stackAttributeMissingEquals": "A stack.xml attribute is missing =.",
  "studio.producerError.ora.stackAttributeNotQuoted": "stack.xml attribute values must be quoted.",
  "studio.producerError.ora.stackAttributeUnclosed": "A stack.xml attribute value is not closed.",
  "studio.producerError.ora.stackAttributeDuplicate": "A stack.xml tag has a duplicate attribute.",
  "studio.producerError.ora.stackAttributeTooMany": "The number of attributes on a stack.xml tag exceeds the safe limit.",
  "studio.producerError.ora.stackIntegerInvalid": "The stack.xml {label} value is not an integer.",
  "studio.producerError.ora.stackIntegerOutOfRange": "The stack.xml {label} value is out of the safe range.",
  "studio.producerError.ora.layerSourcePathInvalid": "The OpenRaster layer src is not a safe relative PNG path.",
  "studio.producerError.ora.layerSourcePathSegmentUnsafe": "The OpenRaster layer src contains an unsafe path segment.",
  "studio.producerError.ora.layerSourceReservedEntry": "The OpenRaster layer references a reserved archive entry.",
  "studio.producerError.ora.opacityNotNumber": "The OpenRaster opacity is not a valid real number.",
  "studio.producerError.ora.opacityOutOfRange": "The OpenRaster opacity must be between 0 and 1.",
  "studio.producerError.ora.visibilityInvalid": "The OpenRaster visibility is invalid.",
  "studio.producerError.ora.layerSourceDuplicate": "Multiple OpenRaster layers reference the same PNG path.",
  "studio.producerError.ora.layerNameOutOfRange": "The OpenRaster layer name is out of the safe range.",
  "studio.producerError.ora.sizeStackXmlBytesOutOfRange": "The OpenRaster stack.xml size is out of the safe range.",
  "studio.producerError.ora.stackNotUtf8": "The OpenRaster stack.xml is not valid UTF-8.",
  "studio.producerError.ora.stackDtdForbidden": "DTD/entity declarations are not allowed in OpenRaster stack.xml.",
  "studio.producerError.ora.stackTextOutsideRoot": "There is text outside the stack.xml root.",
  "studio.producerError.ora.stackUnexpectedText": "There is unexpected text between stack.xml elements.",
  "studio.producerError.ora.stackCommentUnclosed": "A stack.xml comment is not closed correctly.",
  "studio.producerError.ora.stackProcessingInstructionUnclosed": "A stack.xml processing instruction is not closed.",
  "studio.producerError.ora.stackDeclarationInvalid": "Only a safe XML declaration at the start is allowed in stack.xml.",
  "studio.producerError.ora.stackDeclarationElementForbidden": "Declaration elements are not allowed in stack.xml.",
  "studio.producerError.ora.stackTagUnclosed": "A stack.xml tag is not closed.",
  "studio.producerError.ora.stackNestingInvalid": "stack.xml elements are not nested correctly.",
  "studio.producerError.ora.stackElementCountLimit": "The number of stack.xml elements exceeds the safe limit.",
  "studio.producerError.ora.stackDepthLimit": "The stack.xml element depth exceeds the safe limit.",
  "studio.producerError.ora.stackImageRootNotUnique": "stack.xml must contain exactly one image root.",
  "studio.producerError.ora.documentNameOutOfRange": "The OpenRaster document name is out of the safe range.",
  "studio.producerError.ora.versionNotSemver": "The OpenRaster version is not a valid SemVer.",
  "studio.producerError.ora.resolutionPairRequired": "The OpenRaster xres and yres must be specified together.",
  "studio.producerError.ora.stackTopLevelElementForbidden": "stack.xml cannot contain a top-level element other than the image root.",
  "studio.producerError.ora.rootStackNotUnique": "The OpenRaster image must contain exactly one root stack.",
  "studio.producerError.ora.groupCountLimit": "The number of OpenRaster groups exceeds the safe limit.",
  "studio.producerError.ora.groupNameOutOfRange": "The OpenRaster group name is out of the safe range.",
  "studio.producerError.ora.groupIsolationInvalid": "The OpenRaster group isolation is invalid.",
  "studio.producerError.ora.groupStackOutsideLayerStack": "The OpenRaster group stack is outside the layer stack.",
  "studio.producerError.ora.layerOutsideStack": "The OpenRaster layer is outside the stack.",
  "studio.producerError.ora.layerCountLimit": "The OpenRaster layer count exceeds the safe limit.",
  "studio.producerError.ora.stackStructureIncomplete": "The OpenRaster stack.xml structure is incomplete.",
  "studio.producerError.ora.noLayersToImport": "There are no OpenRaster layers to import.",
  "studio.producerError.ora.archiveEntryVerifyFailed": "Could not verify the OpenRaster ZIP entry '{path}': {detail}",
  "studio.producerError.ora.archiveEntryReadFailed": "Could not read the OpenRaster ZIP entry '{path}'{detail}",
  "studio.producerError.ora.archiveInvalid": "The OpenRaster ZIP is invalid{detail}",
  "studio.producerError.ora.mimetypeNotFirstStored": "The OpenRaster mimetype must be the first stored entry.",
  "studio.producerError.ora.mimetypeLengthInvalid": "The OpenRaster mimetype byte length is invalid.",
  "studio.producerError.ora.mimetypeNotUtf8": "The OpenRaster mimetype is not valid UTF-8.",
  "studio.producerError.ora.mimetypeValueInvalid": "The OpenRaster mimetype value is invalid.",
  "studio.producerError.ora.requiredStackXmlMissing": "The OpenRaster stack.xml is missing.",
  "studio.producerError.ora.requiredMergedImageMissing": "The OpenRaster mergedimage.png is missing.",
  "studio.producerError.ora.requiredThumbnailMissing": "The OpenRaster thumbnail.png is missing.",
  "studio.producerError.ora.sizeStackXmlByteLimit": "The OpenRaster stack.xml exceeds the safe byte limit.",
  "studio.producerError.ora.sizeMergedImageByteLimit": "The OpenRaster mergedimage.png exceeds the safe byte limit.",
  "studio.producerError.ora.sizeThumbnailByteLimit": "The OpenRaster thumbnail.png exceeds the safe byte limit.",
  "studio.producerError.ora.requiredLayerPngMissing": "An OpenRaster layer PNG is missing.",
  "studio.producerError.ora.sizeLayerPngLimit": "An OpenRaster layer PNG exceeds the safe limit.",
  "studio.producerError.ora.warningPreviewDimensionMismatch": "mergedimage.png is {width}×{height}px, which differs from the document's {docWidth}×{docHeight}px, so the preview and the editable layers may differ.",
  "studio.producerError.ora.warningPreviewProfileMergedBitDepth": "The {bitDepth}-bit PNG profile of mergedimage.png differs from the ORA-compatible profile (8-bit or 16-bit).",
  "studio.producerError.ora.warningPreviewProfileThumbnail": "thumbnail.png is {width}×{height}px, which differs from the recommended ORA profile (up to 256×256, 8-bit, non-interlaced), so compatibility with external file browsers may be lower.",
  "studio.producerError.ora.warningBlendModeExport": "The unsupported blend mode '{mode}' was exported as normal.",
  "studio.producerError.ora.warningBlendModeImport": "The unsupported ORA blend mode '{mode}' was imported as normal. The original value was kept in the metadata.",
  "studio.producerError.ora.warningUnsupportedXmlAttribute": "The unsupported attributes ({attributes}) of the OpenRaster '{element}' are not preserved.",
  "studio.producerError.ora.warningUnsupportedXmlElement": "The OpenRaster '{element}' extension element cannot be imported or saved again.",
  "studio.producerError.ora.warningMasksIgnored": "OpenRaster layer masks are not imported, so the original editing effects may differ.",
});

const ORA_ERROR_KEYS: Readonly<Record<StudioOpenRasterErrorVariant, string>> = {
  "aborted": "studio.producerError.ora.aborted",
  "limitInvalid": "studio.producerError.ora.limitInvalid",
  "imageUnsupportedData": "studio.producerError.ora.imageUnsupportedData",
  "imageReadFailed": "studio.producerError.ora.imageReadFailed",
  "pngSignatureInvalid": "studio.producerError.ora.pngSignatureInvalid",
  "pngIhdrIncomplete": "studio.producerError.ora.pngIhdrIncomplete",
  "pngFirstChunkNotIhdr": "studio.producerError.ora.pngFirstChunkNotIhdr",
  "pngDimensionsZero": "studio.producerError.ora.pngDimensionsZero",
  "pngDimensionLimit": "studio.producerError.ora.pngDimensionLimit",
  "pngPixelLimit": "studio.producerError.ora.pngPixelLimit",
  "pngIhdrFormatInvalid": "studio.producerError.ora.pngIhdrFormatInvalid",
  "imageBudgetExceeded": "studio.producerError.ora.imageBudgetExceeded",
  "canvasDimensionOutOfRange": "studio.producerError.ora.canvasDimensionOutOfRange",
  "layerOffsetOutOfRange": "studio.producerError.ora.layerOffsetOutOfRange",
  "layerOpacityOutOfRange": "studio.producerError.ora.layerOpacityOutOfRange",
  "xmlTextOutOfRange": "studio.producerError.ora.xmlTextOutOfRange",
  "pngSizeLimit": "studio.producerError.ora.pngSizeLimit",
  "pngSizeChanged": "studio.producerError.ora.pngSizeChanged",
  "layerCountOutOfRange": "studio.producerError.ora.layerCountOutOfRange",
  "sizeStackXmlLimit": "studio.producerError.ora.sizeStackXmlLimit",
  "stackUnknownEntity": "studio.producerError.ora.stackUnknownEntity",
  "stackInvalidEntity": "studio.producerError.ora.stackInvalidEntity",
  "stackTagNameInvalid": "studio.producerError.ora.stackTagNameInvalid",
  "stackClosingTagInvalid": "studio.producerError.ora.stackClosingTagInvalid",
  "stackSelfClosingTagInvalid": "studio.producerError.ora.stackSelfClosingTagInvalid",
  "stackAttributeNameInvalid": "studio.producerError.ora.stackAttributeNameInvalid",
  "stackAttributeMissingEquals": "studio.producerError.ora.stackAttributeMissingEquals",
  "stackAttributeNotQuoted": "studio.producerError.ora.stackAttributeNotQuoted",
  "stackAttributeUnclosed": "studio.producerError.ora.stackAttributeUnclosed",
  "stackAttributeDuplicate": "studio.producerError.ora.stackAttributeDuplicate",
  "stackAttributeTooMany": "studio.producerError.ora.stackAttributeTooMany",
  "stackIntegerInvalid": "studio.producerError.ora.stackIntegerInvalid",
  "stackIntegerOutOfRange": "studio.producerError.ora.stackIntegerOutOfRange",
  "layerSourcePathInvalid": "studio.producerError.ora.layerSourcePathInvalid",
  "layerSourcePathSegmentUnsafe": "studio.producerError.ora.layerSourcePathSegmentUnsafe",
  "layerSourceReservedEntry": "studio.producerError.ora.layerSourceReservedEntry",
  "opacityNotNumber": "studio.producerError.ora.opacityNotNumber",
  "opacityOutOfRange": "studio.producerError.ora.opacityOutOfRange",
  "visibilityInvalid": "studio.producerError.ora.visibilityInvalid",
  "layerSourceDuplicate": "studio.producerError.ora.layerSourceDuplicate",
  "layerNameOutOfRange": "studio.producerError.ora.layerNameOutOfRange",
  "sizeStackXmlBytesOutOfRange": "studio.producerError.ora.sizeStackXmlBytesOutOfRange",
  "stackNotUtf8": "studio.producerError.ora.stackNotUtf8",
  "stackDtdForbidden": "studio.producerError.ora.stackDtdForbidden",
  "stackTextOutsideRoot": "studio.producerError.ora.stackTextOutsideRoot",
  "stackUnexpectedText": "studio.producerError.ora.stackUnexpectedText",
  "stackCommentUnclosed": "studio.producerError.ora.stackCommentUnclosed",
  "stackProcessingInstructionUnclosed": "studio.producerError.ora.stackProcessingInstructionUnclosed",
  "stackDeclarationInvalid": "studio.producerError.ora.stackDeclarationInvalid",
  "stackDeclarationElementForbidden": "studio.producerError.ora.stackDeclarationElementForbidden",
  "stackTagUnclosed": "studio.producerError.ora.stackTagUnclosed",
  "stackNestingInvalid": "studio.producerError.ora.stackNestingInvalid",
  "stackElementCountLimit": "studio.producerError.ora.stackElementCountLimit",
  "stackDepthLimit": "studio.producerError.ora.stackDepthLimit",
  "stackImageRootNotUnique": "studio.producerError.ora.stackImageRootNotUnique",
  "documentNameOutOfRange": "studio.producerError.ora.documentNameOutOfRange",
  "versionNotSemver": "studio.producerError.ora.versionNotSemver",
  "resolutionPairRequired": "studio.producerError.ora.resolutionPairRequired",
  "stackTopLevelElementForbidden": "studio.producerError.ora.stackTopLevelElementForbidden",
  "rootStackNotUnique": "studio.producerError.ora.rootStackNotUnique",
  "groupCountLimit": "studio.producerError.ora.groupCountLimit",
  "groupNameOutOfRange": "studio.producerError.ora.groupNameOutOfRange",
  "groupIsolationInvalid": "studio.producerError.ora.groupIsolationInvalid",
  "groupStackOutsideLayerStack": "studio.producerError.ora.groupStackOutsideLayerStack",
  "layerOutsideStack": "studio.producerError.ora.layerOutsideStack",
  "layerCountLimit": "studio.producerError.ora.layerCountLimit",
  "stackStructureIncomplete": "studio.producerError.ora.stackStructureIncomplete",
  "noLayersToImport": "studio.producerError.ora.noLayersToImport",
  "archiveEntryVerifyFailed": "studio.producerError.ora.archiveEntryVerifyFailed",
  "archiveEntryReadFailed": "studio.producerError.ora.archiveEntryReadFailed",
  "archiveInvalid": "studio.producerError.ora.archiveInvalid",
  "mimetypeNotFirstStored": "studio.producerError.ora.mimetypeNotFirstStored",
  "mimetypeLengthInvalid": "studio.producerError.ora.mimetypeLengthInvalid",
  "mimetypeNotUtf8": "studio.producerError.ora.mimetypeNotUtf8",
  "mimetypeValueInvalid": "studio.producerError.ora.mimetypeValueInvalid",
  "requiredStackXmlMissing": "studio.producerError.ora.requiredStackXmlMissing",
  "requiredMergedImageMissing": "studio.producerError.ora.requiredMergedImageMissing",
  "requiredThumbnailMissing": "studio.producerError.ora.requiredThumbnailMissing",
  "sizeStackXmlByteLimit": "studio.producerError.ora.sizeStackXmlByteLimit",
  "sizeMergedImageByteLimit": "studio.producerError.ora.sizeMergedImageByteLimit",
  "sizeThumbnailByteLimit": "studio.producerError.ora.sizeThumbnailByteLimit",
  "requiredLayerPngMissing": "studio.producerError.ora.requiredLayerPngMissing",
  "sizeLayerPngLimit": "studio.producerError.ora.sizeLayerPngLimit",
};

/** variant별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const ORA_ERROR_KO: Readonly<Record<StudioOpenRasterErrorVariant, string>> = {
  "aborted": "OpenRaster 작업이 취소되었습니다.",
  "limitInvalid": "{key} 한도는 0 이상 {max} 이하의 정수여야 합니다.",
  "imageUnsupportedData": "지원하지 않는 OpenRaster 이미지 데이터입니다.",
  "imageReadFailed": "OpenRaster 이미지를 읽지 못했습니다{detail}",
  "pngSignatureInvalid": "OpenRaster 항목이 유효한 PNG signature를 갖지 않습니다.",
  "pngIhdrIncomplete": "OpenRaster PNG의 IHDR가 완전하지 않습니다.",
  "pngFirstChunkNotIhdr": "OpenRaster PNG의 첫 chunk가 13바이트 IHDR가 아닙니다.",
  "pngDimensionsZero": "OpenRaster PNG IHDR의 너비와 높이는 1 이상이어야 합니다.",
  "pngDimensionLimit": "OpenRaster PNG '{path}'의 IHDR 크기 {width}×{height}가 축 한도 {max}px를 넘었습니다.",
  "pngPixelLimit": "OpenRaster PNG '{path}'의 IHDR 픽셀 수가 이미지당 디코딩 한도 {max}px를 넘었습니다.",
  "pngIhdrFormatInvalid": "OpenRaster PNG IHDR의 색상 또는 압축 형식이 올바르지 않습니다.",
  "imageBudgetExceeded": "OpenRaster '{path}'에서 {label} 누적 한도 {max}바이트를 넘었습니다.",
  "canvasDimensionOutOfRange": "OpenRaster 캔버스 크기가 안전 범위를 벗어났습니다.",
  "layerOffsetOutOfRange": "OpenRaster 레이어 오프셋이 안전 범위를 벗어났습니다.",
  "layerOpacityOutOfRange": "OpenRaster 레이어 불투명도는 0부터 1 사이여야 합니다.",
  "xmlTextOutOfRange": "{label}이 비어 있거나 안전 범위를 벗어났습니다.",
  "pngSizeLimit": "OpenRaster PNG 크기가 안전 한도를 벗어났습니다.",
  "pngSizeChanged": "OpenRaster PNG를 읽는 동안 바이트 크기가 변경되었습니다.",
  "layerCountOutOfRange": "OpenRaster 레이어 수가 안전 범위를 벗어났습니다.",
  "sizeStackXmlLimit": "OpenRaster stack.xml이 안전 한도를 넘었습니다.",
  "stackUnknownEntity": "stack.xml에 알 수 없는 문자 entity가 있습니다.",
  "stackInvalidEntity": "stack.xml에 유효하지 않은 문자 entity가 있습니다.",
  "stackTagNameInvalid": "stack.xml tag 이름이 올바르지 않습니다.",
  "stackClosingTagInvalid": "stack.xml 닫는 tag가 올바르지 않습니다.",
  "stackSelfClosingTagInvalid": "stack.xml self-closing tag가 올바르지 않습니다.",
  "stackAttributeNameInvalid": "stack.xml attribute 이름이 올바르지 않습니다.",
  "stackAttributeMissingEquals": "stack.xml attribute에 =가 없습니다.",
  "stackAttributeNotQuoted": "stack.xml attribute 값은 인용되어야 합니다.",
  "stackAttributeUnclosed": "stack.xml attribute 값이 닫히지 않았습니다.",
  "stackAttributeDuplicate": "stack.xml tag에 중복 attribute가 있습니다.",
  "stackAttributeTooMany": "stack.xml tag의 attribute 수가 안전 한도를 넘었습니다.",
  "stackIntegerInvalid": "stack.xml {label} 값이 정수가 아닙니다.",
  "stackIntegerOutOfRange": "stack.xml {label} 값이 안전 범위를 벗어났습니다.",
  "layerSourcePathInvalid": "OpenRaster 레이어 src가 안전한 상대 PNG 경로가 아닙니다.",
  "layerSourcePathSegmentUnsafe": "OpenRaster 레이어 src에 안전하지 않은 경로 구간이 있습니다.",
  "layerSourceReservedEntry": "OpenRaster 레이어가 예약된 archive 항목을 참조합니다.",
  "opacityNotNumber": "OpenRaster opacity가 올바른 실수가 아닙니다.",
  "opacityOutOfRange": "OpenRaster opacity는 0부터 1 사이여야 합니다.",
  "visibilityInvalid": "OpenRaster visibility가 올바르지 않습니다.",
  "layerSourceDuplicate": "여러 OpenRaster 레이어가 같은 PNG 경로를 중복 참조합니다.",
  "layerNameOutOfRange": "OpenRaster 레이어 이름이 안전 범위를 벗어났습니다.",
  "sizeStackXmlBytesOutOfRange": "OpenRaster stack.xml 크기가 안전 범위를 벗어났습니다.",
  "stackNotUtf8": "OpenRaster stack.xml이 올바른 UTF-8이 아닙니다.",
  "stackDtdForbidden": "OpenRaster stack.xml의 DTD/entity 선언은 허용되지 않습니다.",
  "stackTextOutsideRoot": "stack.xml root 밖에 텍스트가 있습니다.",
  "stackUnexpectedText": "stack.xml element 사이에 예상하지 못한 텍스트가 있습니다.",
  "stackCommentUnclosed": "stack.xml 주석이 올바르게 닫히지 않았습니다.",
  "stackProcessingInstructionUnclosed": "stack.xml 처리 지시문이 닫히지 않았습니다.",
  "stackDeclarationInvalid": "stack.xml에는 선두의 안전한 XML 선언만 허용됩니다.",
  "stackDeclarationElementForbidden": "stack.xml 선언 element는 허용되지 않습니다.",
  "stackTagUnclosed": "stack.xml tag가 닫히지 않았습니다.",
  "stackNestingInvalid": "stack.xml element 중첩이 올바르지 않습니다.",
  "stackElementCountLimit": "stack.xml element 수가 안전 한도를 넘었습니다.",
  "stackDepthLimit": "stack.xml element 깊이가 안전 한도를 넘었습니다.",
  "stackImageRootNotUnique": "stack.xml에는 image root가 하나만 있어야 합니다.",
  "documentNameOutOfRange": "OpenRaster 문서 이름이 안전 범위를 벗어났습니다.",
  "versionNotSemver": "OpenRaster version이 올바른 SemVer가 아닙니다.",
  "resolutionPairRequired": "OpenRaster xres와 yres는 함께 지정되어야 합니다.",
  "stackTopLevelElementForbidden": "stack.xml에는 image root 외의 최상위 element가 있을 수 없습니다.",
  "rootStackNotUnique": "OpenRaster image에는 root stack이 하나만 있어야 합니다.",
  "groupCountLimit": "OpenRaster 그룹 수가 안전 한도를 넘었습니다.",
  "groupNameOutOfRange": "OpenRaster 그룹 이름이 안전 범위를 벗어났습니다.",
  "groupIsolationInvalid": "OpenRaster 그룹 isolation이 올바르지 않습니다.",
  "groupStackOutsideLayerStack": "OpenRaster 그룹 stack이 레이어 stack 밖에 있습니다.",
  "layerOutsideStack": "OpenRaster layer가 stack 밖에 있습니다.",
  "layerCountLimit": "OpenRaster 레이어 수가 안전 한도를 넘었습니다.",
  "stackStructureIncomplete": "OpenRaster stack.xml 구조가 완전하지 않습니다.",
  "noLayersToImport": "OpenRaster에 가져올 레이어가 없습니다.",
  "archiveEntryVerifyFailed": "OpenRaster ZIP 항목 '{path}'을 검증하지 못했습니다: {detail}",
  "archiveEntryReadFailed": "OpenRaster ZIP 항목 '{path}'을 읽지 못했습니다{detail}",
  "archiveInvalid": "OpenRaster ZIP이 올바르지 않습니다{detail}",
  "mimetypeNotFirstStored": "OpenRaster mimetype은 첫 번째 stored 항목이어야 합니다.",
  "mimetypeLengthInvalid": "OpenRaster mimetype 바이트 길이가 올바르지 않습니다.",
  "mimetypeNotUtf8": "OpenRaster mimetype이 올바른 UTF-8이 아닙니다.",
  "mimetypeValueInvalid": "OpenRaster mimetype 값이 올바르지 않습니다.",
  "requiredStackXmlMissing": "OpenRaster stack.xml이 없습니다.",
  "requiredMergedImageMissing": "OpenRaster mergedimage.png가 없습니다.",
  "requiredThumbnailMissing": "OpenRaster thumbnail.png가 없습니다.",
  "sizeStackXmlByteLimit": "OpenRaster stack.xml이 안전 바이트 한도를 넘었습니다.",
  "sizeMergedImageByteLimit": "OpenRaster mergedimage.png가 안전 바이트 한도를 넘었습니다.",
  "sizeThumbnailByteLimit": "OpenRaster thumbnail.png가 안전 바이트 한도를 넘었습니다.",
  "requiredLayerPngMissing": "OpenRaster 레이어 PNG가 없습니다.",
  "sizeLayerPngLimit": "OpenRaster 레이어 PNG가 안전 한도를 넘었습니다.",
};

const ORA_ERROR_CODES: ReadonlySet<string> = new Set([
  "ABORTED",
  "ARCHIVE_INVALID",
  "DIMENSION_INVALID",
  "IMAGE_INVALID",
  "LAYER_COUNT_LIMIT",
  "LAYER_INVALID",
  "LIMIT_INVALID",
  "MIMETYPE_INVALID",
  "REQUIRED_ENTRY_MISSING",
  "SIZE_LIMIT",
  "STACK_XML_INVALID",
]);

/** 내부 고정 라벨 코드 → 로케일별 표시 라벨. */
const ORA_TEXT_LABELS: Readonly<Record<"ko" | "en", Readonly<Record<string, string>>>> = {
  ko: {
    decodedRgba: "디코딩 RGBA 메모리",
    documentName: "문서 이름",
    layerName: "레이어 이름",
    uncompressedBytes: "압축 해제 이미지 바이트",
  },
  en: {
    decodedRgba: "decoded RGBA memory",
    documentName: "Document name",
    layerName: "Layer name",
    uncompressedBytes: "uncompressed image bytes",
  },
};

function withOraTextLabel(
  params?: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> | undefined {
  if (!params?.label) return params;
  const labels = getLang() === "ko" ? ORA_TEXT_LABELS.ko : ORA_TEXT_LABELS.en;
  return { ...params, label: labels[params.label] ?? params.label };
}

/** 표시 지점 전용 해석 (ora 오류): 구조화 오류를 직접 받는 표시 지점이 부른다. */
export function resolveStudioOpenRasterError(
  error: Pick<StudioOpenRasterError, "code" | "variant" | "params">,
): string {
  return resolveProducerError(
    ORA_ERROR_KEYS[error.variant],
    ORA_ERROR_KO[error.variant],
    withOraTextLabel(error.params),
  );
}

/**
 * 표시 지점 전용 해석 (ora 오류, 원인 객체 덕 타이핑): 가져오기·내보내기 catch가
 * 원인 객체만으로 부른다. 생산자 모듈을 런타임 import하면 ZIP 코덱이 표시 그래프에
 * 끌려오므로 이름+코드+variant 덕 타이핑으로 판정한다.
 * 해당하지 않으면 null — 호출자는 기존 메시지 경로를 유지한다.
 */
export function resolveStudioOpenRasterErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code, variant, params } = cause as {
    name?: unknown;
    code?: unknown;
    variant?: unknown;
    params?: unknown;
  };
  if (
    name !== "StudioOpenRasterError" ||
    typeof code !== "string" ||
    typeof variant !== "string"
  ) {
    return null;
  }
  if (!ORA_ERROR_CODES.has(code) || !Object.hasOwn(ORA_ERROR_KEYS, variant)) return null;
  return resolveStudioOpenRasterError({
    code: code as StudioOpenRasterError["code"],
    variant: variant as StudioOpenRasterErrorVariant,
    params: (params ?? undefined) as Readonly<Record<string, string>> | undefined,
  });
}

/** 경고 해석 키: `${code}:${variant}` (방출 지점 suffix). */
const ORA_WARNING_KEYS: Readonly<Record<string, string>> = {
  "PREVIEW_DIMENSION_MISMATCH:dimensionMismatch": "studio.producerError.ora.warningPreviewDimensionMismatch",
  "PREVIEW_PROFILE_MISMATCH:mergedBitDepth": "studio.producerError.ora.warningPreviewProfileMergedBitDepth",
  "PREVIEW_PROFILE_MISMATCH:thumbnailProfile": "studio.producerError.ora.warningPreviewProfileThumbnail",
  "UNSUPPORTED_BLEND_MODE:export": "studio.producerError.ora.warningBlendModeExport",
  "UNSUPPORTED_BLEND_MODE:import": "studio.producerError.ora.warningBlendModeImport",
  "UNSUPPORTED_XML_ATTRIBUTE:unsupportedAttribute": "studio.producerError.ora.warningUnsupportedXmlAttribute",
  "UNSUPPORTED_XML_ELEMENT:unsupportedElement": "studio.producerError.ora.warningUnsupportedXmlElement",
  "MASKS_IGNORED:masksIgnored": "studio.producerError.ora.warningMasksIgnored",
};

/** 경고 키별 ko 원문 템플릿 — 키 단위 폴백이며 이관 전 원문과 동일하다. */
const ORA_WARNING_KO: Readonly<Record<string, string>> = {
  "studio.producerError.ora.warningPreviewDimensionMismatch": "mergedimage.png {width}×{height}px가 문서 {docWidth}×{docHeight}px와 달라 미리보기와 편집 레이어가 다를 수 있습니다.",
  "studio.producerError.ora.warningPreviewProfileMergedBitDepth": "mergedimage.png의 {bitDepth}-bit PNG 프로필은 ORA 호환 프로필(8-bit 또는 16-bit)과 다릅니다.",
  "studio.producerError.ora.warningPreviewProfileThumbnail": "thumbnail.png {width}×{height}px가 ORA 권장 프로필(최대 256×256, 8-bit, non-interlaced)과 달라 외부 탐색기 호환성이 낮을 수 있습니다.",
  "studio.producerError.ora.warningBlendModeExport": "지원하지 않는 혼합 모드 '{mode}'를 normal로 내보냈습니다.",
  "studio.producerError.ora.warningBlendModeImport": "지원하지 않는 ORA 혼합 모드 '{mode}'를 normal로 가져왔습니다. 원본 값은 metadata에 남겼습니다.",
  "studio.producerError.ora.warningUnsupportedXmlAttribute": "OpenRaster '{element}'의 지원하지 않는 attribute({attributes})는 보존하지 않습니다.",
  "studio.producerError.ora.warningUnsupportedXmlElement": "OpenRaster의 '{element}' extension element는 가져오거나 다시 저장할 수 없습니다.",
  "studio.producerError.ora.warningMasksIgnored": "OpenRaster 레이어 마스크는 가져오지 않으며 원본 편집 효과가 달라질 수 있습니다.",
};

/**
 * 표시 지점 전용 해석 (ora 경고). 집계자 예외: 경고 채널은 결과 타입이 구조화
 * 객체로 고정돼 있어, 집계 경계(studio-document-interchange-preview.ts의
 * aggregateCodecWarnings)와 내보내기 상태 문구 합성 지점에서 이 함수로 해석해
 * 기존 message 합성 형태를 유지한다.
 */
export function resolveStudioOpenRasterWarning(warning: StudioOpenRasterWarning): string {
  const key = ORA_WARNING_KEYS[`${warning.code}:${warning.variant}`];
  if (!key) return warning.code;
  return resolveProducerError(key, ORA_WARNING_KO[key], warning.params);
}
