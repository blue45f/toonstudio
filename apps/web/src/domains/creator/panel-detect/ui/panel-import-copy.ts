/**
 * 컷 가져오기 화면의 공통 문구 — 오류 코드·경고 코드·손실 보고 항목을 한글(기본)·영문 쌍으로 풀어 쓴다.
 *
 * 알고리즘·계획 모듈은 코드와 수치만 돌려주고, 사용자에게 보이는 문장은 모두 여기서 만든다.
 * 모든 코드 표는 `Record<Code, …>` 라서 코드가 늘어나면 컴파일러가 빠진 문구를 알려 준다.
 */

import { CardBundleError } from "../panel-card-export";
import { CardSliceError, type CardCutKind, type CardSliceErrorCode, type CardSliceWarning } from "../panel-card-slice-types";
import {
  PanelDetectError,
  type PanelConfidenceLevel,
  type PanelDetectErrorCode,
  type PanelDetectSensitivity,
  type PanelDetectWarningCode,
  type PanelReadingOrder,
  type PanelWarningCode,
} from "../panel-detect-types";
import { PanelImportRightsError } from "../panel-import-rights";
import { PanelRenderError, type PanelRenderErrorCode } from "../panel-render-core";
import { PanelReflowError, type PanelReflowErrorCode, type ReflowLossItem } from "../panel-reflow-plan";
import { PanelSourceError, type PanelSourceErrorCode } from "../panel-source-image";
import { PanelStudioDocumentError } from "../panel-studio-document";
import { PanelStudioHandoffError } from "../panel-studio-handoff";

import { bi } from "./panel-import-bi";

export { bi };

type Pair = readonly [ko: string, en: string];

function pick(pair: Pair): string {
  return bi(pair[0], pair[1]);
}

const GENERIC_ERROR: Pair = ["알 수 없는 오류가 났어요. 잠시 뒤 다시 시도해 주세요.", "Something went wrong. Please try again in a moment."];

// ── 원고 읽기 ────────────────────────────────────────────────────────────

const SOURCE_ERRORS: Readonly<Record<Exclude<PanelSourceErrorCode, "too-many-pixels">, Pair>> = {
  empty: ["비어 있는 파일이에요. 다른 이미지를 골라 주세요.", "That file is empty. Choose another image."],
  "file-too-large": ["파일이 48MB 를 넘어요. 여러 장으로 나누거나 크기를 줄여 주세요.", "The file is larger than 48 MB. Split it or make it smaller."],
  "unsupported-format": ["PNG, JPG, WebP 이미지만 읽을 수 있어요. 파일 형식과 확장자가 맞는지 확인해 주세요.", "Only PNG, JPG and WebP images can be read. Check that the file type matches its extension."],
  "decode-failed": ["이미지를 읽지 못했어요. 파일이 손상되지 않았는지 확인한 뒤 다시 골라 주세요.", "The image could not be read. Check that the file is not damaged and choose it again."],
  cancelled: ["이미지 읽기를 취소했어요.", "Reading the image was cancelled."],
};

export function sourceErrorText(error: unknown): string {
  if (!(error instanceof PanelSourceError)) return pick(GENERIC_ERROR);
  if (error.code === "too-many-pixels") {
    const limit = error.detail.megapixels ?? 0;
    const actual = Math.round((error.detail.pixels ?? 0) / 100_000) / 10;
    return bi(
      `이미지가 ${actual}MP 로, 이 기기에서 안전하게 처리할 수 있는 ${limit}MP 한도를 넘어요. 여러 장으로 나눠 주세요.`,
      `The image is ${actual} MP, above the ${limit} MP this device can safely process. Split it into several images.`,
    );
  }
  return pick(SOURCE_ERRORS[error.code]);
}

// ── 컷 감지 ──────────────────────────────────────────────────────────────

const DETECT_ERRORS: Readonly<Record<PanelDetectErrorCode, Pair>> = {
  "invalid-input": ["분석할 이미지가 올바르지 않아요.", "The image to analyse is not valid."],
  "invalid-options": ["컷 감지 설정이 올바르지 않아요.", "The panel detection settings are not valid."],
  "too-large": ["이미지가 너무 커서 분석할 수 없어요.", "The image is too large to analyse."],
  "too-many-panels": ["컷이 너무 많이 나뉘었어요. 민감도를 '넓은 여백'으로 바꿔 다시 시도해 주세요.", "Too many panels were found. Switch the sensitivity to “wide gutters” and try again."],
  cancelled: ["컷 찾기를 취소했어요.", "Panel detection was cancelled."],
  timeout: ["컷 찾기가 제한 시간을 넘겼어요. 다시 시도하거나 컷을 직접 그려 주세요.", "Panel detection took too long. Try again or draw the panels yourself."],
  "worker-unavailable": ["이 브라우저에서는 컷 찾기를 백그라운드로 실행할 수 없어요. 컷을 직접 그려 주세요.", "This browser cannot run panel detection in the background. Draw the panels yourself."],
  "worker-failed": ["컷 찾기가 중간에 멈췄어요. 다시 시도해 주세요.", "Panel detection stopped unexpectedly. Please try again."],
  "worker-protocol": ["컷 찾기 결과를 읽지 못했어요. 다시 시도해 주세요.", "The detection result could not be read. Please try again."],
};

export function detectErrorText(error: unknown): string {
  if (error instanceof PanelDetectError) return pick(DETECT_ERRORS[error.code]);
  if (error instanceof PanelSourceError) return sourceErrorText(error);
  return pick(GENERIC_ERROR);
}

const READING_ORDER_LABELS: Readonly<Record<PanelReadingOrder, Pair>> = {
  manga: ["만화 (우→좌, 위→아래)", "Manga (right to left, top to bottom)"],
  comic: ["코믹 (좌→우, 위→아래)", "Comic (left to right, top to bottom)"],
  webtoon: ["웹툰 (위→아래)", "Webtoon (top to bottom)"],
};
export const readingOrderLabel = (value: PanelReadingOrder): string => pick(READING_ORDER_LABELS[value]);

const SENSITIVITY_LABELS: Readonly<Record<PanelDetectSensitivity, Pair>> = {
  fine: ["섬세 — 얇은 여백도 경계로", "Fine — thin gutters count"],
  normal: ["보통", "Normal"],
  coarse: ["넓은 여백만", "Coarse — wide gutters only"],
};
export const sensitivityLabel = (value: PanelDetectSensitivity): string => pick(SENSITIVITY_LABELS[value]);

const CONFIDENCE_LABELS: Readonly<Record<PanelConfidenceLevel, Pair>> = {
  high: ["신뢰도 높음", "High confidence"],
  medium: ["신뢰도 보통", "Medium confidence"],
  low: ["신뢰도 낮음", "Low confidence"],
};
export const confidenceLabel = (level: PanelConfidenceLevel): string => pick(CONFIDENCE_LABELS[level]);

const PANEL_WARNING_TEXT: Readonly<Record<PanelWarningCode, Pair>> = {
  "overlap-suspected": ["컷이 서로 겹쳤을 수 있어요.", "Panels may overlap."],
  "bridged-gutter-suspected": ["말풍선이나 효과음이 컷 사이를 가로막았을 수 있어요. 분할 제안을 확인해 보세요.", "A balloon or sound effect may bridge two panels. Check the split suggestions."],
  "max-depth-reached": ["더 나눌 수 있었지만 단계 한도에서 멈췄어요.", "It could be split further but stopped at the depth limit."],
  "touches-image-edge": ["이미지 가장자리까지 닿는 컷이에요.", "This panel reaches the image edge."],
  "no-gutter-found": ["여백을 찾지 못해 이미지 전체를 한 컷으로 봤어요.", "No gutter was found, so the whole image is treated as one panel."],
};
export const panelWarningText = (code: PanelWarningCode): string => pick(PANEL_WARNING_TEXT[code]);

const DETECT_WARNING_TEXT: Readonly<Record<PanelDetectWarningCode, Pair>> = {
  "blank-image": ["비어 있는 이미지예요. 컷을 찾을 수 없어요.", "The image is blank, so there are no panels to find."],
  "no-gutter-found": ["컷 사이 여백을 찾지 못했어요. 컷을 직접 그려 주세요.", "No gutters were found between panels. Draw the panels yourself."],
  "no-panel-found": ["컷을 하나도 찾지 못했어요. 컷을 직접 그려 주세요.", "No panels were found. Draw them yourself."],
  downsampled: ["큰 이미지라 줄여서 분석했어요. 경계가 몇 픽셀 어긋날 수 있어요.", "The image was analysed at a reduced size, so edges may be off by a few pixels."],
  "undetectable-regions": ["자동으로 나눌 수 없는 영역이 있어요. 기울어진 컷이나 겹침은 직접 고쳐 주세요.", "Some regions cannot be split automatically. Fix slanted or overlapping panels by hand."],
  "ignored-fragments": ["너무 작거나 빈 조각은 컷에서 뺐어요. 필요하면 컷으로 쓸 수 있어요.", "Tiny or empty fragments were left out. You can still use them as panels."],
  "max-depth-reached": ["일부 컷은 단계 한도 때문에 더 나누지 못했어요.", "Some panels could not be split further because of the depth limit."],
  "low-overall-confidence": ["전체 신뢰도가 낮아요. 결과를 꼼꼼히 확인해 주세요.", "Overall confidence is low. Please review the result carefully."],
};
export const detectWarningText = (code: PanelDetectWarningCode): string => pick(DETECT_WARNING_TEXT[code]);

// ── 재배열·삽입 ──────────────────────────────────────────────────────────

const REFLOW_ERRORS: Readonly<Record<PanelReflowErrorCode, Pair>> = {
  "no-panels": ["재배열할 컷이 없어요. 컷을 하나 이상 남겨 주세요.", "There are no panels to rearrange. Keep at least one panel."],
  "invalid-options": ["재배열 설정이 올바르지 않아요.", "The rearrange settings are not valid."],
  "panel-too-tall": ["배율을 적용하면 너무 길어지는 컷이 있어요. 컷을 나누거나 '원본 크기 유지'를 써 보세요.", "A panel would become too tall at this scale. Split it or use “Keep original size”."],
  "too-many-pages": ["페이지가 200쪽을 넘어요. 컷 수를 줄여 주세요.", "That would exceed 200 pages. Use fewer panels."],
  "output-too-large": ["결과 이미지가 너무 커요. 컷 수를 줄이거나 '원본 크기 유지'를 써 보세요.", "The result is too large. Use fewer panels or “Keep original size”."],
};

const RENDER_ERRORS: Readonly<Record<PanelRenderErrorCode, (subject: number) => string>> = {
  cancelled: () => bi("이미지 만들기를 취소했어요.", "Creating the images was cancelled."),
  "surface-unavailable": (subject) => bi(
    `${subject > 0 ? `${subject}번째 ` : ""}이미지가 이 브라우저에서 만들 수 있는 크기를 넘어요. 폭 규격이나 '원본 크기 유지'를 바꿔 보세요.`,
    `${subject > 0 ? `Image ${subject} ` : "An image "}is larger than this browser can create. Try another width or “Keep original size”.`,
  ),
  "encode-failed": (subject) => bi(
    `${subject > 0 ? `${subject}번째 ` : ""}이미지를 PNG 로 저장하지 못했어요. 다시 시도해 주세요.`,
    `${subject > 0 ? `Image ${subject} ` : "An image "}could not be saved as PNG. Please try again.`,
  ),
  "too-large-for-studio": (subject) => bi(
    `${subject}번째 컷에서 Studio 문서에 넣기엔 너무 커졌어요. 컷 수를 줄이거나 PNG 묶음으로 받아 주세요.`,
    `The result became too large for a Studio document at panel ${subject}. Use fewer panels or download the PNG bundle.`,
  ),
};

export function renderErrorText(error: unknown): string {
  if (error instanceof PanelRenderError) return RENDER_ERRORS[error.code](error.subject);
  if (error instanceof PanelReflowError) return pick(REFLOW_ERRORS[error.code]);
  if (error instanceof PanelStudioHandoffError) {
    return error.code === "too-large"
      ? bi("만든 문서가 너무 커서 편집기로 넘길 수 없어요. 컷 수를 줄이거나 PNG 묶음으로 받아 주세요.", "The document is too large to hand to the editor. Use fewer panels or download the PNG bundle.")
      : bi("편집기로 넘길 준비를 하지 못했어요. 다시 시도해 주세요.", "Preparing the hand-off to the editor failed. Please try again.");
  }
  if (error instanceof PanelStudioDocumentError) return bi("Studio 문서를 만들지 못했어요. 제목과 설정을 확인해 주세요.", "The Studio document could not be created. Check the title and settings.");
  if (error instanceof PanelImportRightsError) return bi("원고 권리 확인이 필요해요.", "Confirming rights to the manuscript is required.");
  return pick(GENERIC_ERROR);
}

type LossText = (values: Readonly<Record<string, number>>) => string;

const LOSS_TEXT: Readonly<Record<ReflowLossItem["code"], LossText>> = {
  "source-untouched": () => bi("원본 파일은 바꾸거나 덮어쓰지 않아요. 결과는 새 이미지로 만들어요.", "The original file is never changed or overwritten. The result is built as new images."),
  "outside-cuts-dropped": (values) => bi(`컷 밖 영역(약 ${values.percent}%)은 결과에 들어가지 않아요.`, `The area outside the panels (about ${values.percent}%) is not included.`),
  upscaled: (values) => bi(`컷 ${values.count}개를 키워서 흐려질 수 있어요(최대 ${values.maxScale}배).`, `${values.count} panel(s) are enlarged and may look soft (up to ${values.maxScale}×).`),
  downscaled: (values) => bi(`컷 ${values.count}개를 줄여서 가는 선이 사라질 수 있어요(최소 ${values.minScale}배).`, `${values.count} panel(s) are reduced, so fine lines may fade (down to ${values.minScale}×).`),
  "recompressed-lossless": () => bi("컷을 PNG(무손실)로 다시 저장해요. 화질 손실은 없지만 파일 크기가 달라져요.", "Panels are re-saved as lossless PNG. Quality is kept but file sizes change."),
  "recompressed-lossy": () => bi("컷을 손실 압축으로 다시 저장해요. 화질이 조금 떨어질 수 있어요.", "Panels are re-saved with lossy compression and may lose some quality."),
  "cuts-overlap": (values) => bi(`서로 겹치는 컷이 ${values.pairs}쌍 있어요. 겹친 부분은 두 번 나와요.`, `${values.pairs} pair(s) of panels overlap; the overlapping area appears twice.`),
  "centered-in-document": (values) => bi(`Studio 문서 폭(720)보다 좁아 양옆에 ${values.offset}px 씩 여백을 두고 가운데에 놓아요.`, `The strip is narrower than the Studio page (720), so it is centred with ${values.offset}px on each side.`),
  "split-into-pages": (values) => bi(`길이가 길어서 컷 경계에서 ${values.pages}개 페이지로 나눠요.`, `The strip is long, so it is split into ${values.pages} pages at panel boundaries.`),
  "undetectable-excluded": (values) => bi(`자동으로 나눌 수 없는 영역 ${values.count}곳은 컷이 아니라서 들어가지 않아요. 직접 컷을 그려야 해요.`, `${values.count} region(s) that could not be split automatically are not panels and are left out. Draw panels there yourself.`),
  "ignored-excluded": (values) => bi(`너무 작거나 빈 조각 ${values.count}개는 들어가지 않아요.`, `${values.count} tiny or empty fragment(s) are left out.`),
  "low-confidence-cuts": (values) => bi(`신뢰도가 낮은 컷 ${values.count}개가 있어요. 위치를 한 번 더 확인해 주세요.`, `${values.count} panel(s) have low confidence. Please double-check their positions.`),
};

export function lossItemText(item: ReflowLossItem): string {
  return LOSS_TEXT[item.code](item.values);
}

// ── 카드뉴스 ─────────────────────────────────────────────────────────────

const CARD_ERRORS: Readonly<Record<CardSliceErrorCode, Pair>> = {
  "invalid-input": ["나눌 이미지가 올바르지 않아요. 폭이 64px 이상인 이미지를 골라 주세요.", "The image to slice is not valid. Choose an image at least 64 px wide."],
  "invalid-options": ["카드 설정이 올바르지 않아요. 카드 수를 확인해 주세요.", "The card settings are not valid. Check the card count."],
  "too-many-cards": ["카드가 60장을 넘어요. 원고를 나눠서 올려 주세요.", "That would exceed 60 cards. Upload the manuscript in parts."],
  cancelled: ["카드 나누기를 취소했어요.", "Slicing was cancelled."],
  timeout: ["카드 나누기가 제한 시간을 넘겼어요. 다시 시도해 주세요.", "Slicing took too long. Please try again."],
};

export function cardErrorText(error: unknown): string {
  if (error instanceof CardSliceError) return pick(CARD_ERRORS[error.code]);
  if (error instanceof CardBundleError) {
    if (error.code === "cancelled") return bi("ZIP 만들기를 취소했어요.", "Creating the ZIP was cancelled.");
    if (error.code === "archive-failed") return bi("ZIP 파일을 만들지 못했어요. 저장 공간을 확인하고 다시 시도해 주세요.", "The ZIP file could not be created. Check free space and try again.");
    return bi("카드 묶음 정보가 맞지 않아요. 카드를 다시 나눠 주세요.", "The card bundle does not match. Slice the cards again.");
  }
  if (error instanceof PanelRenderError) return renderErrorText(error);
  if (error instanceof PanelSourceError) return sourceErrorText(error);
  return pick(GENERIC_ERROR);
}

const CUT_KIND_TEXT: Readonly<Record<CardCutKind, Pair>> = {
  clean: ["여백에서 잘라요", "Cut in a gutter"],
  soft: ["거의 빈 줄에서 잘라요", "Cut in a nearly empty row"],
  content: ["그림·말풍선을 가로지를 수 있어요", "May cut through artwork or a balloon"],
};
export const cutKindText = (kind: CardCutKind): string => pick(CUT_KIND_TEXT[kind]);

const CARD_WARNING_TEXT: Readonly<Record<CardSliceWarning, (scale: number) => string>> = {
  "content-cuts": () => bi("여백이 없어 내용을 가로지르는 자리가 있어요. 카드 아래의 '가까운 여백으로'를 눌러 보세요.", "Some cuts run through content because no gutter was available. Try “Snap to nearest gutter” under the card."),
  upscaled: (scale) => bi(`원고 폭이 1080px 보다 좁아 ${scale}배로 키워요. 선이 흐려질 수 있어요.`, `The manuscript is narrower than 1080 px and is enlarged ${scale}×; lines may look soft.`),
  downscaled: (scale) => bi(`원고 폭이 1080px 보다 넓어 ${scale}배로 줄여요.`, `The manuscript is wider than 1080 px and is reduced to ${scale}×.`),
  "over-carousel-limit": () => bi("카드가 20장을 넘어요. 인스타그램 한 게시물에는 20장까지 올릴 수 있어요.", "More than 20 cards. An Instagram post holds up to 20."),
};
export const cardWarningText = (code: CardSliceWarning, scale: number): string => CARD_WARNING_TEXT[code](Math.round(scale * 100) / 100);
