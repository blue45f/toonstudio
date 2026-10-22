/**
 * A4 D4 (R15): studio-page-shortcut-dispatcher 공지 구조화 정의 — 기준선 포화로
 * 전용 파일에 추출했다(studio-comments-error.ts 선례). 디스패처는 표시 문구 대신
 * {code, params}만 announce 콜백으로 방출하고, 표시는 Host announce 구현(게시
 * 지점)에서 리졸버(status-i18n/studio-producer-error-i18n-shortcut.ts)로만
 * 해석한다. 협업 잠금 문구처럼 다른 생산자가 소유한 동적 문자열은 {text}
 * 패스스루 변형으로 그대로 전달한다.
 */

export type StudioShortcutNoticeCode =
  | "alreadySaving"
  | "commentPinsHidden"
  | "commentPinsShown"
  | "letteringLocked"
  | "letteringReviewLocked"
  | "zoomTool"
  | "rotateTool"
  | "viewReset"
  | "fitToScreen"
  | "actualPixels"
  | "reviewLockedDrawing"
  | "pen"
  | "eraser"
  | "transparentColor"
  | "penColor"
  | "swapColors"
  | "defaultColors"
  | "stabilizer"
  | "sizeLocked"
  | "sizeUnlocked"
  | "opacityLocked"
  | "opacityUnlocked"
  | "brushSize"
  | "brushOpacity"
  | "slotEmpty"
  | "slotSelected"
  | "quickHud"
  | "toolsShown"
  | "canvasOnly"
  | "bubblePointDeleted"
  | "bubbleMinPoints"
  | "rasterPrepCancelled"
  | "groupResizeCancelled"
  | "groupMoveCancelled"
  | "strokeCancelled"
  | "commentPinCancelled"
  | "groupEditEnded"
  | "clipMaskOn"
  | "clipMaskOff"
  | "groupCreated";

export type StudioShortcutAnnouncement =
  | {
      readonly code: StudioShortcutNoticeCode;
      readonly params?: Readonly<Record<string, string>>;
    }
  | { readonly text: string };
