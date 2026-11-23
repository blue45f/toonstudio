/**
 * OS 네이티브 PWA File Handling(`window.launchQueue`) 소비기 &
 * Window Controls Overlay(`navigator.windowControlsOverlay`) 상단 안전 여백 계산기.
 *
 * 미지원 브라우저에서는 예외 없이 안전한 no-op / 0px 기본값으로 동작한다.
 */

export const PWA_LAUNCH_SUPPORTED_EXTENSIONS = Object.freeze([
  ".toon", ".toonstudio", ".ora", ".psd", ".png", ".webp", ".pptx",
] as const);

export type PwaLaunchFileFormat = "toon" | "ora" | "psd" | "png" | "webp" | "pptx" | "unknown";

export interface LaunchQueueFileHandleLike {
  readonly name: string;
  readonly kind?: "file" | "directory";
  getFile(): Promise<File>;
}

export interface LaunchParamsLike {
  readonly targetURL?: string | null;
  readonly files?: readonly LaunchQueueFileHandleLike[];
}

export interface LaunchQueueLike {
  setConsumer(consumer: (launchParams: LaunchParamsLike) => void | Promise<void>): void;
}

export interface PwaLaunchQueueWindowLike {
  readonly launchQueue?: LaunchQueueLike;
  readonly innerWidth?: number;
}

export interface PwaLaunchFileEntry {
  readonly fileName: string;
  readonly extension: string;
  readonly format: PwaLaunchFileFormat;
  readonly supportedInStudio: boolean;
  readonly handle: LaunchQueueFileHandleLike;
  readonly targetUrl: string | null;
  readonly getFile: () => Promise<File>;
}

export interface PwaLaunchQueueConsumerOptions {
  readonly targetWindow?: PwaLaunchQueueWindowLike | null;
  readonly onError?: (error: unknown) => void;
}

export interface WindowControlsOverlayRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface WindowControlsOverlaySafeInsets {
  readonly top: number;
  readonly left: number;
  readonly right: number;
}

export interface WindowControlsOverlayCssVariables {
  readonly "--wco-titlebar-x": string;
  readonly "--wco-titlebar-y": string;
  readonly "--wco-titlebar-width": string;
  readonly "--wco-titlebar-height": string;
  readonly "--wco-safe-top": string;
  readonly "--wco-safe-left": string;
}

export interface WindowControlsOverlayState {
  readonly supported: boolean;
  readonly visible: boolean;
  readonly titlebarRect: WindowControlsOverlayRect;
  readonly safeInsets: WindowControlsOverlaySafeInsets;
  readonly cssVariables: WindowControlsOverlayCssVariables;
}

export interface WindowControlsOverlayLike {
  readonly visible?: boolean;
  getTitlebarAreaRect?: () => Partial<WindowControlsOverlayRect>;
  addEventListener?: (type: "geometrychange", listener: () => void) => void;
  removeEventListener?: (type: "geometrychange", listener: () => void) => void;
}

export interface WindowControlsOverlayNavigatorLike {
  readonly windowControlsOverlay?: WindowControlsOverlayLike;
}

export interface ReadWindowControlsOverlayOptions {
  readonly targetNavigator?: WindowControlsOverlayNavigatorLike | null;
  readonly viewportWidth?: number;
}

const EXTENSION_FORMAT_MAP: Readonly<Record<string, PwaLaunchFileFormat>> = Object.freeze({
  ".toon": "toon", ".toonstudio": "toon", ".ora": "ora", ".psd": "psd",
  ".png": "png", ".webp": "webp", ".pptx": "pptx",
});
const ZERO_RECT: WindowControlsOverlayRect = Object.freeze({ x: 0, y: 0, width: 0, height: 0 });
const ZERO_INSETS: WindowControlsOverlaySafeInsets = Object.freeze({ top: 0, left: 0, right: 0 });
const INACTIVE_WCO_CSS_VARS: WindowControlsOverlayCssVariables = Object.freeze({
  "--wco-titlebar-x": "0px", "--wco-titlebar-y": "0px", "--wco-titlebar-width": "100%",
  "--wco-titlebar-height": "0px", "--wco-safe-top": "0px", "--wco-safe-left": "0px",
});

const resolveTargetWindow = (target?: PwaLaunchQueueWindowLike | null): PwaLaunchQueueWindowLike | null =>
  target !== undefined ? target : typeof window !== "undefined" ? (window as unknown as PwaLaunchQueueWindowLike) : null;

const resolveTargetNavigator = (target?: WindowControlsOverlayNavigatorLike | null): WindowControlsOverlayNavigatorLike | null =>
  target !== undefined ? target : typeof navigator !== "undefined" ? (navigator as unknown as WindowControlsOverlayNavigatorLike) : null;

const sanitizePx = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;

/** 파일명에서 소문자 확장자(`.toon` 등)를 추출한다. */
export function extractPwaLaunchFileExtension(fileName: string): string {
  const trimmed = fileName.trim();
  const lastDot = trimmed.lastIndexOf(".");
  return lastDot > 0 && lastDot < trimmed.length - 1 ? trimmed.slice(lastDot).toLowerCase() : "";
}

/** OS 파일 열기로 전달된 파일명을 스튜디오 지원 포맷으로 분류한다. */
export function classifyPwaLaunchFileFormat(fileName: string): PwaLaunchFileFormat {
  return EXTENSION_FORMAT_MAP[extractPwaLaunchFileExtension(fileName)] ?? "unknown";
}

function isReadableFileHandle(handle: LaunchQueueFileHandleLike): boolean {
  return Boolean(
    handle && typeof handle.name === "string" && typeof handle.getFile === "function"
      && (handle.kind === undefined || handle.kind === "file"),
  );
}

/** `window.launchQueue.setConsumer`를 안전 바인딩하고 정리 함수를 반환한다. */
export function installPwaLaunchQueueConsumer(
  onFiles: (files: readonly PwaLaunchFileEntry[], launchParams: LaunchParamsLike) => void | Promise<void>,
  options: PwaLaunchQueueConsumerOptions = {},
): () => void {
  const launchQueue = resolveTargetWindow(options.targetWindow)?.launchQueue;
  if (!launchQueue || typeof launchQueue.setConsumer !== "function") return () => undefined;

  let disposed = false;
  try {
    launchQueue.setConsumer((launchParams) => {
      if (disposed || !launchParams) return;
      const rawFiles = Array.isArray(launchParams.files) ? launchParams.files : [];
      const targetUrl = typeof launchParams.targetURL === "string" ? launchParams.targetURL : null;
      const entries: PwaLaunchFileEntry[] = [];

      for (const handle of rawFiles) {
        if (!isReadableFileHandle(handle)) continue;
        const extension = extractPwaLaunchFileExtension(handle.name);
        const format = classifyPwaLaunchFileFormat(handle.name);
        entries.push(Object.freeze({
          fileName: handle.name, extension, format,
          supportedInStudio: format !== "unknown",
          handle, targetUrl, getFile: () => handle.getFile(),
        }));
      }
      if (entries.length === 0) return;

      try {
        const result = onFiles(Object.freeze(entries), launchParams);
        if (result && typeof (result as Promise<void>).catch === "function") {
          void (result as Promise<void>).catch((error: unknown) => options.onError?.(error));
        }
      } catch (error: unknown) {
        options.onError?.(error);
      }
    });
  } catch (error: unknown) {
    options.onError?.(error);
    return () => undefined;
  }
  return () => { disposed = true; };
}

/** `navigator.windowControlsOverlay` 지원·표시 여부와 제목표시줄 안전 여백을 계산한다. */
export function readWindowControlsOverlayState(
  options: ReadWindowControlsOverlayOptions = {},
): WindowControlsOverlayState {
  const overlay = resolveTargetNavigator(options.targetNavigator)?.windowControlsOverlay;
  if (!overlay || typeof overlay.getTitlebarAreaRect !== "function") {
    return Object.freeze({
      supported: false, visible: false,
      titlebarRect: ZERO_RECT, safeInsets: ZERO_INSETS, cssVariables: INACTIVE_WCO_CSS_VARS,
    });
  }

  let titlebarRect: WindowControlsOverlayRect = ZERO_RECT;
  try {
    const raw = overlay.getTitlebarAreaRect();
    if (raw) {
      titlebarRect = Object.freeze({
        x: sanitizePx(raw.x), y: sanitizePx(raw.y),
        width: sanitizePx(raw.width), height: sanitizePx(raw.height),
      });
    }
  } catch {
    titlebarRect = ZERO_RECT;
  }

  if (!overlay.visible) {
    return Object.freeze({
      supported: true, visible: false,
      titlebarRect, safeInsets: ZERO_INSETS, cssVariables: INACTIVE_WCO_CSS_VARS,
    });
  }

  const viewportWidth = sanitizePx(options.viewportWidth ?? (typeof window !== "undefined" ? window.innerWidth : 0));
  const safeTop = sanitizePx(titlebarRect.y + titlebarRect.height);
  const safeLeft = titlebarRect.x;
  const safeRight = viewportWidth > 0 ? sanitizePx(viewportWidth - (titlebarRect.x + titlebarRect.width)) : 0;

  return Object.freeze({
    supported: true, visible: true, titlebarRect,
    safeInsets: Object.freeze({ top: safeTop, left: safeLeft, right: safeRight }),
    cssVariables: Object.freeze({
      "--wco-titlebar-x": `${titlebarRect.x}px`,
      "--wco-titlebar-y": `${titlebarRect.y}px`,
      "--wco-titlebar-width": titlebarRect.width > 0 ? `${titlebarRect.width}px` : "100%",
      "--wco-titlebar-height": `${titlebarRect.height}px`,
      "--wco-safe-top": `${safeTop}px`,
      "--wco-safe-left": `${safeLeft}px`,
    }),
  });
}

/** WCO 창 제어영역 변경(`geometrychange`)을 구독하고 정리 함수를 반환한다. */
export function subscribeWindowControlsOverlayGeometry(
  onChange: (state: WindowControlsOverlayState) => void,
  options: ReadWindowControlsOverlayOptions = {},
): () => void {
  const overlay = resolveTargetNavigator(options.targetNavigator)?.windowControlsOverlay;
  if (!overlay || typeof overlay.addEventListener !== "function") return () => undefined;
  const handleChange = () => onChange(readWindowControlsOverlayState(options));
  overlay.addEventListener("geometrychange", handleChange);
  return () => overlay.removeEventListener?.("geometrychange", handleChange);
}
