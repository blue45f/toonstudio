/**
 * Local Font Access — 사용자 기기에 설치된 폰트를 업로드 없이 식자에 쓴다.
 *
 * 근거·제약 (MDN Local Font Access API 기준):
 * - `window.queryLocalFonts()`는 Chromium 계열 전용이다. Firefox·Safari에는 없다.
 * - 로컬 폰트 열거는 권한이 필요하다 — 사용자 제스처 안에서 불러야 하고,
 *   거부하면 NotAllowedError가 난다. 거부·실패를 빈 목록으로 위장하지 않는다.
 * - 그래서 이 모듈은 "지원 환경에서만 열리는 추가 선택지"이며, 미지원·거부 시
 *   기존 큐레이션 웹폰트(ai-balloon-fonts) 흐름이 그대로 동작하는 것이 계약이다.
 */

export interface LocalFontDataLike {
  readonly family: string;
  readonly fullName?: string;
  readonly postscriptName?: string;
  readonly style?: string;
  blob(): Promise<Blob>;
}

export interface LocalFontAccessWindowLike {
  queryLocalFonts?: (options?: {
    postscriptNames?: readonly string[];
  }) => Promise<readonly LocalFontDataLike[]>;
}

export type LocalFontListResult =
  | Readonly<{ kind: "ok"; families: readonly string[] }>
  | Readonly<{ kind: "unsupported" }>
  | Readonly<{ kind: "denied" }>
  | Readonly<{ kind: "failed"; message: string }>;

function resolveWindow(
  targetWindow?: LocalFontAccessWindowLike | null,
): LocalFontAccessWindowLike | null {
  if (targetWindow !== undefined) return targetWindow;
  return typeof window !== "undefined" ? (window as LocalFontAccessWindowLike) : null;
}

/** 이 환경에서 Local Font Access를 쓸 수 있는가 (Chromium + 권한 API 존재). */
export function isLocalFontAccessSupported(
  targetWindow?: LocalFontAccessWindowLike | null,
): boolean {
  const resolved = resolveWindow(targetWindow);
  return typeof resolved?.queryLocalFonts === "function";
}

function isNotAllowedError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "NotAllowedError"
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "로컬 폰트 목록을 읽지 못했습니다.";
}

/**
 * 설치된 폰트의 패밀리 목록을 열거한다. 사용자 제스처 안에서 부를 것.
 * 같은 패밀리의 굵기·스타일 변형은 패밀리 하나로 묶고 가나다순으로 정렬한다.
 */
export async function listLocalFontFamilies(
  targetWindow?: LocalFontAccessWindowLike | null,
): Promise<LocalFontListResult> {
  const resolved = resolveWindow(targetWindow);
  if (typeof resolved?.queryLocalFonts !== "function") {
    return Object.freeze({ kind: "unsupported" });
  }
  let fonts: readonly LocalFontDataLike[];
  try {
    fonts = await resolved.queryLocalFonts();
  } catch (error) {
    if (isNotAllowedError(error)) return Object.freeze({ kind: "denied" });
    return Object.freeze({ kind: "failed", message: errorMessage(error) });
  }
  const families = new Set<string>();
  for (const font of fonts) {
    const family = font.family?.trim();
    if (family) families.add(family);
  }
  return Object.freeze({
    kind: "ok",
    families: Object.freeze([...families].sort((a, b) => a.localeCompare(b, "ko"))),
  });
}

/** CSS font-family 스택 문자열 — 패밀리명을 안전하게 인용한다. */
export function localFontFamilyStack(family: string): string {
  const quoted = `"${family.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return `${quoted}, sans-serif`;
}

export interface FontFaceLike {
  load(): Promise<unknown>;
}

export interface LocalFontFaceDocumentLike {
  fonts: { add(face: FontFaceLike): void };
}

export type LocalFontFaceCtor = new (
  family: string,
  source: ArrayBuffer,
) => FontFaceLike;

/**
 * 패밀리 하나의 폰트 데이터를 FontFace로 등록해 CSS에서 쓸 수 있게 한다.
 * 대표 스타일(Regular 우선)의 blob만 읽으므로 열거 전체를 메모리에 올리지 않는다.
 * 실패하면 false — 호출자는 큐레이션 폰트 미리보기를 유지하면 된다.
 */
export async function loadLocalFontFace(
  family: string,
  options: {
    readonly targetWindow?: LocalFontAccessWindowLike | null;
    readonly targetDocument?: LocalFontFaceDocumentLike | null;
    readonly fontFaceCtor?: LocalFontFaceCtor | null;
  } = {},
): Promise<boolean> {
  const resolvedWindow = resolveWindow(options.targetWindow);
  if (typeof resolvedWindow?.queryLocalFonts !== "function") return false;
  const ctor =
    options.fontFaceCtor ??
    (typeof FontFace !== "undefined" ? (FontFace as unknown as LocalFontFaceCtor) : null);
  if (!ctor) return false;
  const doc =
    options.targetDocument ??
    (typeof document !== "undefined"
      ? (document as unknown as LocalFontFaceDocumentLike)
      : null);
  if (!doc) return false;

  try {
    const fonts = await resolvedWindow.queryLocalFonts();
    const candidates = fonts.filter((font) => font.family === family);
    if (candidates.length === 0) return false;
    const preferred =
      candidates.find((font) => (font.style ?? "").toLowerCase().includes("regular")) ??
      candidates[0];
    const buffer = await (await preferred.blob()).arrayBuffer();
    const face = new ctor(family, buffer);
    await face.load();
    doc.fonts.add(face);
    return true;
  } catch {
    return false;
  }
}
