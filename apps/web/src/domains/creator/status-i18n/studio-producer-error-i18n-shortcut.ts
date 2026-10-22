/**
 * 생산자 구조화 공지 해석 모듈 — shortcut 구간: studio-page-shortcut-dispatcher의
 * announce 공지 40코드 (A4 D4, R15, 설계 r10-d4-trace-3.md §2.10).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 공지 채널은 오류가
 * 아니라 producerError의 shortcut 구간으로 분리 등록한다(설계 §2.10). 생산자는
 * {code, params}만 방출하고, 표시는 Host announce 구현(게시 지점)에서만 해석한다.
 * ko 값은 이관 전 생산자 원문과 글자 단위 동일하고, en은 신규 번역이다.
 * {text} 패스스루 변형(협업 잠금 문구 등 타 생산자 소유 문자열)은 해석하지 않는다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type {
  StudioShortcutAnnouncement,
  StudioShortcutNoticeCode,
} from "../studio-page-shortcut-notice";

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
  "studio.producerError.shortcut.alreadySaving": "이미 저장 중이에요",
  "studio.producerError.shortcut.commentPinsHidden": "열린 댓글 핀 숨김",
  "studio.producerError.shortcut.commentPinsShown": "열린 댓글 핀 표시",
  "studio.producerError.shortcut.letteringLocked": "잠긴 레터링은 편집할 수 없어요",
  "studio.producerError.shortcut.letteringReviewLocked": "검토 잠금을 해제한 뒤 레터링을 추가할 수 있어요",
  "studio.producerError.shortcut.zoomTool": "보기 확대·축소 도구",
  "studio.producerError.shortcut.rotateTool": "보기 회전 도구",
  "studio.producerError.shortcut.viewReset": "화면 리셋",
  "studio.producerError.shortcut.fitToScreen": "화면에 맞게 조정",
  "studio.producerError.shortcut.actualPixels": "실제 픽셀 100%",
  "studio.producerError.shortcut.reviewLockedDrawing": "이 페이지는 검토 잠금 상태예요. 잠금을 해제한 뒤 그릴 수 있어요.",
  "studio.producerError.shortcut.pen": "펜",
  "studio.producerError.shortcut.eraser": "지우개",
  "studio.producerError.shortcut.transparentColor": "투명색 (지우개 모드)",
  "studio.producerError.shortcut.penColor": "원래 색 (펜 모드)",
  "studio.producerError.shortcut.swapColors": "색 교체",
  "studio.producerError.shortcut.defaultColors": "기본 색 (먹·종이)",
  "studio.producerError.shortcut.stabilizer": "보정 {value}",
  "studio.producerError.shortcut.sizeLocked": "크기 잠금",
  "studio.producerError.shortcut.sizeUnlocked": "크기 잠금 해제",
  "studio.producerError.shortcut.opacityLocked": "불투명 잠금",
  "studio.producerError.shortcut.opacityUnlocked": "불투명 잠금 해제",
  "studio.producerError.shortcut.brushSize": "브러시 크기 {size}px",
  "studio.producerError.shortcut.brushOpacity": "브러시 불투명도 {percent}%",
  "studio.producerError.shortcut.slotEmpty": "슬롯 {slot} 비어 있음 · Shift+{slot}로 저장",
  "studio.producerError.shortcut.slotSelected": "슬롯 {slot}",
  "studio.producerError.shortcut.quickHud": "퀵 HUD",
  "studio.producerError.shortcut.toolsShown": "도구 표시",
  "studio.producerError.shortcut.canvasOnly": "캔버스만",
  "studio.producerError.shortcut.bubblePointDeleted": "말풍선 외곽선 점 삭제 · {count}개",
  "studio.producerError.shortcut.bubbleMinPoints": "말풍선 외곽선에는 최소 3개의 점이 필요합니다",
  "studio.producerError.shortcut.rasterPrepCancelled": "편집용 래스터 준비를 취소했습니다",
  "studio.producerError.shortcut.groupResizeCancelled": "그룹 크기 조절을 취소했습니다",
  "studio.producerError.shortcut.groupMoveCancelled": "그룹 이동을 취소했습니다",
  "studio.producerError.shortcut.strokeCancelled": "진행 중인 획을 취소했습니다",
  "studio.producerError.shortcut.commentPinCancelled": "댓글 핀 배치 취소",
  "studio.producerError.shortcut.groupEditEnded": "그룹 내부 편집 종료 · 그룹 전체 선택",
  "studio.producerError.shortcut.clipMaskOn": "아래 레이어에 클리핑 마스크 적용 (Alt+Cmd+G)",
  "studio.producerError.shortcut.clipMaskOff": "클리핑 마스크 해제",
  "studio.producerError.shortcut.groupCreated": "그룹 생성 완료",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.shortcut.alreadySaving": "Already saving",
  "studio.producerError.shortcut.commentPinsHidden": "Open comment pins hidden",
  "studio.producerError.shortcut.commentPinsShown": "Open comment pins shown",
  "studio.producerError.shortcut.letteringLocked": "Locked lettering cannot be edited",
  "studio.producerError.shortcut.letteringReviewLocked": "Release the review lock to add lettering",
  "studio.producerError.shortcut.zoomTool": "Zoom tool",
  "studio.producerError.shortcut.rotateTool": "Rotate view tool",
  "studio.producerError.shortcut.viewReset": "View reset",
  "studio.producerError.shortcut.fitToScreen": "Fit to screen",
  "studio.producerError.shortcut.actualPixels": "Actual pixels 100%",
  "studio.producerError.shortcut.reviewLockedDrawing": "This page is review-locked. Release the lock to draw.",
  "studio.producerError.shortcut.pen": "Pen",
  "studio.producerError.shortcut.eraser": "Eraser",
  "studio.producerError.shortcut.transparentColor": "Transparent color (eraser mode)",
  "studio.producerError.shortcut.penColor": "Original color (pen mode)",
  "studio.producerError.shortcut.swapColors": "Colors swapped",
  "studio.producerError.shortcut.defaultColors": "Default colors (ink · paper)",
  "studio.producerError.shortcut.stabilizer": "Stabilizer {value}",
  "studio.producerError.shortcut.sizeLocked": "Size locked",
  "studio.producerError.shortcut.sizeUnlocked": "Size lock released",
  "studio.producerError.shortcut.opacityLocked": "Opacity locked",
  "studio.producerError.shortcut.opacityUnlocked": "Opacity lock released",
  "studio.producerError.shortcut.brushSize": "Brush size {size}px",
  "studio.producerError.shortcut.brushOpacity": "Brush opacity {percent}%",
  "studio.producerError.shortcut.slotEmpty": "Slot {slot} is empty · Press Shift+{slot} to save",
  "studio.producerError.shortcut.slotSelected": "Slot {slot}",
  "studio.producerError.shortcut.quickHud": "Quick HUD",
  "studio.producerError.shortcut.toolsShown": "Tools shown",
  "studio.producerError.shortcut.canvasOnly": "Canvas only",
  "studio.producerError.shortcut.bubblePointDeleted": "Bubble outline point deleted · {count} points",
  "studio.producerError.shortcut.bubbleMinPoints": "A bubble outline needs at least 3 points",
  "studio.producerError.shortcut.rasterPrepCancelled": "Editing raster preparation cancelled",
  "studio.producerError.shortcut.groupResizeCancelled": "Group resizing cancelled",
  "studio.producerError.shortcut.groupMoveCancelled": "Group move cancelled",
  "studio.producerError.shortcut.strokeCancelled": "Stroke in progress cancelled",
  "studio.producerError.shortcut.commentPinCancelled": "Comment pin placement cancelled",
  "studio.producerError.shortcut.groupEditEnded": "Group editing ended · Whole group selected",
  "studio.producerError.shortcut.clipMaskOn": "Clipping mask applied to the layer below (Alt+Cmd+G)",
  "studio.producerError.shortcut.clipMaskOff": "Clipping mask released",
  "studio.producerError.shortcut.groupCreated": "Group created",
});

const SHORTCUT_NOTICE_KEYS: Readonly<Record<StudioShortcutNoticeCode, string>> = {
  alreadySaving: "studio.producerError.shortcut.alreadySaving",
  commentPinsHidden: "studio.producerError.shortcut.commentPinsHidden",
  commentPinsShown: "studio.producerError.shortcut.commentPinsShown",
  letteringLocked: "studio.producerError.shortcut.letteringLocked",
  letteringReviewLocked: "studio.producerError.shortcut.letteringReviewLocked",
  zoomTool: "studio.producerError.shortcut.zoomTool",
  rotateTool: "studio.producerError.shortcut.rotateTool",
  viewReset: "studio.producerError.shortcut.viewReset",
  fitToScreen: "studio.producerError.shortcut.fitToScreen",
  actualPixels: "studio.producerError.shortcut.actualPixels",
  reviewLockedDrawing: "studio.producerError.shortcut.reviewLockedDrawing",
  pen: "studio.producerError.shortcut.pen",
  eraser: "studio.producerError.shortcut.eraser",
  transparentColor: "studio.producerError.shortcut.transparentColor",
  penColor: "studio.producerError.shortcut.penColor",
  swapColors: "studio.producerError.shortcut.swapColors",
  defaultColors: "studio.producerError.shortcut.defaultColors",
  stabilizer: "studio.producerError.shortcut.stabilizer",
  sizeLocked: "studio.producerError.shortcut.sizeLocked",
  sizeUnlocked: "studio.producerError.shortcut.sizeUnlocked",
  opacityLocked: "studio.producerError.shortcut.opacityLocked",
  opacityUnlocked: "studio.producerError.shortcut.opacityUnlocked",
  brushSize: "studio.producerError.shortcut.brushSize",
  brushOpacity: "studio.producerError.shortcut.brushOpacity",
  slotEmpty: "studio.producerError.shortcut.slotEmpty",
  slotSelected: "studio.producerError.shortcut.slotSelected",
  quickHud: "studio.producerError.shortcut.quickHud",
  toolsShown: "studio.producerError.shortcut.toolsShown",
  canvasOnly: "studio.producerError.shortcut.canvasOnly",
  bubblePointDeleted: "studio.producerError.shortcut.bubblePointDeleted",
  bubbleMinPoints: "studio.producerError.shortcut.bubbleMinPoints",
  rasterPrepCancelled: "studio.producerError.shortcut.rasterPrepCancelled",
  groupResizeCancelled: "studio.producerError.shortcut.groupResizeCancelled",
  groupMoveCancelled: "studio.producerError.shortcut.groupMoveCancelled",
  strokeCancelled: "studio.producerError.shortcut.strokeCancelled",
  commentPinCancelled: "studio.producerError.shortcut.commentPinCancelled",
  groupEditEnded: "studio.producerError.shortcut.groupEditEnded",
  clipMaskOn: "studio.producerError.shortcut.clipMaskOn",
  clipMaskOff: "studio.producerError.shortcut.clipMaskOff",
  groupCreated: "studio.producerError.shortcut.groupCreated",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const SHORTCUT_NOTICE_KO: Readonly<Record<StudioShortcutNoticeCode, string>> = {
  alreadySaving: "이미 저장 중이에요",
  commentPinsHidden: "열린 댓글 핀 숨김",
  commentPinsShown: "열린 댓글 핀 표시",
  letteringLocked: "잠긴 레터링은 편집할 수 없어요",
  letteringReviewLocked: "검토 잠금을 해제한 뒤 레터링을 추가할 수 있어요",
  zoomTool: "보기 확대·축소 도구",
  rotateTool: "보기 회전 도구",
  viewReset: "화면 리셋",
  fitToScreen: "화면에 맞게 조정",
  actualPixels: "실제 픽셀 100%",
  reviewLockedDrawing: "이 페이지는 검토 잠금 상태예요. 잠금을 해제한 뒤 그릴 수 있어요.",
  pen: "펜",
  eraser: "지우개",
  transparentColor: "투명색 (지우개 모드)",
  penColor: "원래 색 (펜 모드)",
  swapColors: "색 교체",
  defaultColors: "기본 색 (먹·종이)",
  stabilizer: "보정 {value}",
  sizeLocked: "크기 잠금",
  sizeUnlocked: "크기 잠금 해제",
  opacityLocked: "불투명 잠금",
  opacityUnlocked: "불투명 잠금 해제",
  brushSize: "브러시 크기 {size}px",
  brushOpacity: "브러시 불투명도 {percent}%",
  slotEmpty: "슬롯 {slot} 비어 있음 · Shift+{slot}로 저장",
  slotSelected: "슬롯 {slot}",
  quickHud: "퀵 HUD",
  toolsShown: "도구 표시",
  canvasOnly: "캔버스만",
  bubblePointDeleted: "말풍선 외곽선 점 삭제 · {count}개",
  bubbleMinPoints: "말풍선 외곽선에는 최소 3개의 점이 필요합니다",
  rasterPrepCancelled: "편집용 래스터 준비를 취소했습니다",
  groupResizeCancelled: "그룹 크기 조절을 취소했습니다",
  groupMoveCancelled: "그룹 이동을 취소했습니다",
  strokeCancelled: "진행 중인 획을 취소했습니다",
  commentPinCancelled: "댓글 핀 배치 취소",
  groupEditEnded: "그룹 내부 편집 종료 · 그룹 전체 선택",
  clipMaskOn: "아래 레이어에 클리핑 마스크 적용 (Alt+Cmd+G)",
  clipMaskOff: "클리핑 마스크 해제",
  groupCreated: "그룹 생성 완료",
};

/**
 * 게시 지점 전용 해석 (shortcut): Host announce 구현이 부른다. {text} 패스스루
 * 변형(협업 잠금 문구 등 타 생산자 소유 문자열)은 그대로 돌려준다.
 */
export function resolveStudioShortcutAnnouncement(announcement: StudioShortcutAnnouncement): string {
  if ("text" in announcement) return announcement.text;
  return resolveProducerError(
    SHORTCUT_NOTICE_KEYS[announcement.code],
    SHORTCUT_NOTICE_KO[announcement.code],
    announcement.params,
  );
}
