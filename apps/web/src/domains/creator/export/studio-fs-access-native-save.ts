/**
 * File System Access API 로컬 디스크 직접 저장 어댑터 & Display-P3 → CMYK 소프트 프루프 엔진 (`T-021`, `T-022`).
 *
 * - `showOpenFilePicker` · `showSaveFilePicker` · `createWritable()`을 안전하게 감싸며
 *   권한 상실(`NotAllowedError`), 사용자 취소(`AbortError`), 미지원 브라우저 `<a download>` 폴백을 완비한다.
 * - Display-P3 광색역 픽셀을 CIE XYZ(D65) → OKLab 및 역 Demichel–Neugebauer 8원색 CMYK 분판 모델로
 *   투영해 단행본 인쇄 색역 이탈(out-of-gamut) 픽셀과 TAC 초과 영역을 검출·하이라이트한다.
 */

/* -------------------------------------------------------------------------- */
/* 1) File System Access API 로컬 디스크 직접 열기·저장 어댑터 (`T-021`)          */
/* -------------------------------------------------------------------------- */

export type FileSystemPermissionMode = "read" | "readwrite";
export type FileSystemPermissionState = "granted" | "denied" | "prompt";

export interface FileSystemWritableStreamLike {
  write(data: Blob | Uint8Array | ArrayBuffer | string): Promise<void>;
  close(): Promise<void>;
  abort?(reason?: unknown): Promise<void>;
}

export interface FileSystemFileHandleLike {
  readonly kind?: "file";
  readonly name: string;
  getFile(): Promise<File | (Blob & { readonly name?: string; readonly lastModified?: number })>;
  createWritable(): Promise<FileSystemWritableStreamLike>;
  queryPermission?(descriptor?: { readonly mode?: FileSystemPermissionMode }): Promise<FileSystemPermissionState>;
  requestPermission?(descriptor?: { readonly mode?: FileSystemPermissionMode }): Promise<FileSystemPermissionState>;
}

export interface FilePickerAcceptTypeLike {
  readonly description?: string;
  readonly accept: Readonly<Record<string, readonly string[]>>;
}

export interface OpenFilePickerOptionsLike {
  readonly multiple?: boolean;
  readonly excludeAcceptAllOption?: boolean;
  readonly types?: readonly FilePickerAcceptTypeLike[];
}

export interface SaveFilePickerOptionsLike {
  readonly suggestedName?: string;
  readonly excludeAcceptAllOption?: boolean;
  readonly types?: readonly FilePickerAcceptTypeLike[];
}

export interface DownloadAnchorLike {
  href: string;
  download: string;
  click(): void;
  remove?(): void;
}

export interface FileSystemAccessDocumentLike {
  createElement(tagName: "a"): DownloadAnchorLike;
  readonly body?: { appendChild?(node: DownloadAnchorLike): void } | null;
}

export interface FileSystemAccessUrlApiLike {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

export interface FileSystemAccessEnv {
  readonly showOpenFilePicker?:
    | ((options?: OpenFilePickerOptionsLike) => Promise<readonly FileSystemFileHandleLike[]>)
    | null;
  readonly showSaveFilePicker?:
    | ((options?: SaveFilePickerOptionsLike) => Promise<FileSystemFileHandleLike>)
    | null;
  readonly isSecureContext?: boolean;
  readonly document?: FileSystemAccessDocumentLike | null;
  readonly urlApi?: FileSystemAccessUrlApiLike | null;
}

export type FileSystemAccessMode = "native-fs-access" | "download-fallback" | "unavailable";

export interface FileSystemAccessSupportReport {
  readonly canOpenDirect: boolean;
  readonly canSaveDirect: boolean;
  readonly fallbackDownloadAvailable: boolean;
  readonly secureContext: boolean;
  readonly mode: FileSystemAccessMode;
  readonly detail: string;
}

export const STUDIO_NATIVE_FILE_TYPES: readonly FilePickerAcceptTypeLike[] = Object.freeze([
  Object.freeze({
    description: "ToonStudio 원고 프로젝트 (.toonstudio)",
    accept: Object.freeze({ "application/x-toonstudio-project": Object.freeze([".toonstudio"] as const) }),
  }),
  Object.freeze({
    description: "래스터·단행본 원고 이미지 (.psd, .png, .webp)",
    accept: Object.freeze({
      "image/vnd.adobe.photoshop": Object.freeze([".psd"] as const),
      "image/png": Object.freeze([".png"] as const),
      "image/webp": Object.freeze([".webp"] as const),
    }),
  }),
]);

export interface OpenLocalArtworkOptions {
  readonly types?: readonly FilePickerAcceptTypeLike[];
  readonly env?: FileSystemAccessEnv;
}

export type OpenLocalArtworkResult =
  | {
      readonly status: "opened";
      readonly fileName: string;
      readonly mimeType: string;
      readonly sizeBytes: number;
      readonly lastModified: number;
      readonly bytes: Uint8Array;
      readonly handle: FileSystemFileHandleLike;
      readonly message: string;
    }
  | {
      readonly status: "cancelled" | "permission-denied" | "unsupported" | "error";
      readonly fileName: null;
      readonly mimeType: null;
      readonly sizeBytes: 0;
      readonly lastModified: 0;
      readonly bytes: null;
      readonly handle: null;
      readonly message: string;
    };

export interface SaveLocalArtworkOptions {
  readonly suggestedName: string;
  readonly data: Uint8Array | Blob | string;
  readonly mimeType?: string;
  readonly types?: readonly FilePickerAcceptTypeLike[];
  readonly existingHandle?: FileSystemFileHandleLike | null;
  readonly allowDownloadFallback?: boolean;
  readonly env?: FileSystemAccessEnv;
}

export type SaveLocalArtworkStatus =
  | "saved-direct"
  | "saved-fallback-download"
  | "cancelled"
  | "permission-denied"
  | "unsupported"
  | "error";

export interface SaveLocalArtworkResult {
  readonly status: SaveLocalArtworkStatus;
  readonly method: "fs-access" | "download-fallback" | "none";
  readonly fileName: string;
  readonly bytesWritten: number;
  readonly handle: FileSystemFileHandleLike | null;
  readonly message: string;
}

type GlobalRecord = Record<string, unknown>;
const readGlobal = (): GlobalRecord => globalThis as unknown as GlobalRecord;

function resolveSecureContext(env?: FileSystemAccessEnv): boolean {
  if (env && typeof env.isSecureContext === "boolean") return env.isSecureContext;
  const g = readGlobal();
  return typeof g["isSecureContext"] === "boolean" ? (g["isSecureContext"] as boolean) : false;
}

function resolveOpenPicker(env?: FileSystemAccessEnv) {
  if (env && "showOpenFilePicker" in env) return env.showOpenFilePicker ?? null;
  const fn = readGlobal()["showOpenFilePicker"];
  return typeof fn === "function"
    ? (fn as (options?: OpenFilePickerOptionsLike) => Promise<readonly FileSystemFileHandleLike[]>)
    : null;
}

function resolveSavePicker(env?: FileSystemAccessEnv) {
  if (env && "showSaveFilePicker" in env) return env.showSaveFilePicker ?? null;
  const fn = readGlobal()["showSaveFilePicker"];
  return typeof fn === "function"
    ? (fn as (options?: SaveFilePickerOptionsLike) => Promise<FileSystemFileHandleLike>)
    : null;
}

function resolveDocument(env?: FileSystemAccessEnv): FileSystemAccessDocumentLike | null {
  if (env && "document" in env) return env.document ?? null;
  return typeof document !== "undefined" && typeof document.createElement === "function"
    ? (document as unknown as FileSystemAccessDocumentLike)
    : null;
}

function resolveUrlApi(env?: FileSystemAccessEnv): FileSystemAccessUrlApiLike | null {
  if (env && "urlApi" in env) return env.urlApi ?? null;
  return typeof URL !== "undefined" && typeof URL.createObjectURL === "function" && typeof URL.revokeObjectURL === "function"
    ? URL
    : null;
}

function classifyFsError(caught: unknown): "cancelled" | "permission-denied" | "error" {
  const name =
    caught instanceof Error
      ? caught.name
      : typeof caught === "object" && caught !== null && "name" in caught
        ? String((caught as { readonly name: unknown }).name)
        : "";
  if (name === "AbortError") return "cancelled";
  if (name === "NotAllowedError" || name === "SecurityError") return "permission-denied";
  return "error";
}

async function ensureHandlePermission(
  handle: FileSystemFileHandleLike,
  mode: FileSystemPermissionMode,
): Promise<boolean> {
  if (typeof handle.queryPermission !== "function") return true;
  const state = await handle.queryPermission({ mode });
  if (state === "granted") return true;
  if (state === "denied") return false;
  if (typeof handle.requestPermission === "function") {
    return (await handle.requestPermission({ mode })) === "granted";
  }
  return false;
}

async function normalizePayloadToBytes(data: Uint8Array | Blob | string): Promise<Uint8Array> {
  if (data instanceof Uint8Array) return data;
  if (typeof data === "string") return new TextEncoder().encode(data);
  return typeof data.arrayBuffer === "function" ? new Uint8Array(await data.arrayBuffer()) : new Uint8Array(0);
}

/** File System Access API 로컬 직결 입출력 가용성과 폴백 다운로드 지원 여부를 점검한다. */
export function detectFileSystemAccessSupport(env?: FileSystemAccessEnv): FileSystemAccessSupportReport {
  const secureContext = resolveSecureContext(env);
  const canOpenDirect = secureContext && resolveOpenPicker(env) !== null;
  const canSaveDirect = secureContext && resolveSavePicker(env) !== null;
  const fallbackDownloadAvailable = resolveDocument(env) !== null && resolveUrlApi(env) !== null;
  const mode: FileSystemAccessMode = canSaveDirect
    ? "native-fs-access"
    : fallbackDownloadAvailable
      ? "download-fallback"
      : "unavailable";
  const detail =
    canOpenDirect && canSaveDirect
      ? "showOpenFilePicker + showSaveFilePicker 로컬 디스크 직결 입출력 활성"
      : canSaveDirect
        ? "showSaveFilePicker 로컬 직접 저장 활성"
        : fallbackDownloadAvailable
          ? "미지원 브라우저 또는 비보안 컨텍스트 · 안전한 파일 다운로드 폴백 준비됨"
          : "파일 입출력 API 미지원 환경";
  return Object.freeze({ canOpenDirect, canSaveDirect, fallbackDownloadAvailable, secureContext, mode, detail });
}

function makeOpenError(
  status: "cancelled" | "permission-denied" | "unsupported" | "error",
  message: string,
): OpenLocalArtworkResult {
  return Object.freeze({ status, fileName: null, mimeType: null, sizeBytes: 0, lastModified: 0, bytes: null, handle: null, message });
}

function makeSaveResult(
  status: SaveLocalArtworkStatus,
  method: "fs-access" | "download-fallback" | "none",
  fileName: string,
  bytesWritten: number,
  handle: FileSystemFileHandleLike | null,
  message: string,
): SaveLocalArtworkResult {
  return Object.freeze({ status, method, fileName, bytesWritten, handle, message });
}

/** `showOpenFilePicker`로 로컬 디스크 원고 파일을 안전하게 연다. */
export async function openLocalArtworkFile(
  options: OpenLocalArtworkOptions = {},
): Promise<OpenLocalArtworkResult> {
  const support = detectFileSystemAccessSupport(options.env);
  const picker = resolveOpenPicker(options.env);
  if (!support.canOpenDirect || !picker) {
    return makeOpenError("unsupported", "현재 환경에서는 로컬 디스크 직접 열기(showOpenFilePicker)를 지원하지 않습니다.");
  }
  try {
    const handle = (await picker({ multiple: false, types: options.types ?? STUDIO_NATIVE_FILE_TYPES }))[0];
    if (!handle) return makeOpenError("cancelled", "파일 선택을 취소했습니다.");
    if (!(await ensureHandlePermission(handle, "read"))) {
      return makeOpenError("permission-denied", "로컬 파일 읽기 권한이 거부되었습니다.");
    }
    const file = await handle.getFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const fileName = ("name" in file && typeof file.name === "string" && file.name) || handle.name;
    const lastModified = "lastModified" in file && typeof file.lastModified === "number" ? file.lastModified : 0;
    return Object.freeze({
      status: "opened",
      fileName,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: bytes.byteLength,
      lastModified,
      bytes,
      handle,
      message: `${fileName} (${bytes.byteLength.toLocaleString("en-US")} B) 불러오기 완료`,
    });
  } catch (caught) {
    const status = classifyFsError(caught);
    const message =
      status === "cancelled"
        ? "사용자가 파일 열기를 취소했습니다."
        : status === "permission-denied"
          ? "로컬 파일 읽기 권한이 상실되었거나 거부되었습니다."
          : caught instanceof Error ? caught.message : "로컬 파일을 열지 못했습니다.";
    return makeOpenError(status, message);
  }
}

/**
 * File System Access API(`showSaveFilePicker` / 기존 핸들 덮어쓰기)로 로컬 디스크에 직접 저장한다.
 * 미지원 브라우저에서는 자동으로 `<a download>` 다운로드 폴백을 수행한다.
 */
export async function saveLocalArtworkFile(
  options: SaveLocalArtworkOptions,
): Promise<SaveLocalArtworkResult> {
  const suggestedName = options.suggestedName.trim() || "artwork.toonstudio";
  const mimeType = options.mimeType ?? "application/octet-stream";
  const allowFallback = options.allowDownloadFallback ?? true;
  const payloadBytes = await normalizePayloadToBytes(options.data);
  const support = detectFileSystemAccessSupport(options.env);
  const savePicker = resolveSavePicker(options.env);

  if (options.existingHandle || (support.canSaveDirect && savePicker)) {
    let handle: FileSystemFileHandleLike | null = options.existingHandle ?? null;
    try {
      if (!handle && savePicker) {
        handle = await savePicker({ suggestedName, types: options.types ?? STUDIO_NATIVE_FILE_TYPES });
      }
      if (!handle) return makeSaveResult("cancelled", "fs-access", suggestedName, 0, null, "파일 저장을 취소했습니다.");
      if (!(await ensureHandlePermission(handle, "readwrite"))) {
        return makeSaveResult(
          "permission-denied",
          "fs-access",
          handle.name || suggestedName,
          0,
          null,
          "로컬 파일 쓰기 권한이 만료되었거나 거부되었습니다. 다시 저장 위치를 선택해 주세요.",
        );
      }
      const writable = await handle.createWritable();
      try {
        await writable.write(payloadBytes);
        await writable.close();
      } catch (writeErr) {
        try {
          await writable.abort?.(writeErr);
        } catch {
          // abort 자체 실패는 원래 쓰기 오류를 가리지 않는다.
        }
        throw writeErr;
      }
      const finalName = handle.name || suggestedName;
      return makeSaveResult(
        "saved-direct",
        "fs-access",
        finalName,
        payloadBytes.byteLength,
        handle,
        `${finalName} 로컬 디스크 직접 저장 완료 (${payloadBytes.byteLength.toLocaleString("en-US")} B)`,
      );
    } catch (caught) {
      const status = classifyFsError(caught);
      const message =
        status === "cancelled"
          ? "사용자가 저장 대화상자를 취소했습니다."
          : status === "permission-denied"
            ? "로컬 디스크 쓰기 권한이 거부되었습니다."
            : caught instanceof Error ? caught.message : "로컬 디스크 직접 저장 중 오류가 발생했습니다.";
      return makeSaveResult(status, "fs-access", handle?.name || suggestedName, 0, null, message);
    }
  }

  if (allowFallback) {
    const doc = resolveDocument(options.env);
    const urlApi = resolveUrlApi(options.env);
    if (doc && urlApi) {
      const copy = new Uint8Array(payloadBytes.byteLength);
      copy.set(payloadBytes);
      const objectUrl = urlApi.createObjectURL(new Blob([copy], { type: mimeType }));
      try {
        const anchor = doc.createElement("a");
        anchor.href = objectUrl;
        anchor.download = suggestedName;
        doc.body?.appendChild?.(anchor);
        anchor.click();
        anchor.remove?.();
      } finally {
        urlApi.revokeObjectURL(objectUrl);
      }
      return makeSaveResult(
        "saved-fallback-download",
        "download-fallback",
        suggestedName,
        payloadBytes.byteLength,
        null,
        `${suggestedName} 브라우저 다운로드 폴백 저장 완료 (${payloadBytes.byteLength.toLocaleString("en-US")} B)`,
      );
    }
  }

  return makeSaveResult("unsupported", "none", suggestedName, 0, null, "로컬 디스크 저장과 다운로드 폴백을 모두 사용할 수 없는 환경입니다.");
}

/* -------------------------------------------------------------------------- */
/* 2) Display-P3 → 단행본 인쇄 CMYK 색역 이탈 소프트 프루프 엔진 (`T-022`)        */
/* -------------------------------------------------------------------------- */

export type CmykPrintProfileId = "japan-color-2011-coated" | "fogra39-coated" | "swop-v2-uncoated";
export type SoftProofHighlightMode = "warning-overlay" | "soft-proof-preview" | "split-compare";

export interface CmykPrintProfileDescriptor {
  readonly id: CmykPrintProfileId;
  readonly label: string;
  readonly description: string;
  readonly tacLimit: number;
  readonly gcrStrength: number;
  readonly dotGain: number;
  readonly gamutDeltaEThreshold: number;
  /** 8원색 Demichel–Neugebauer 선형 sRGB 반사율 [W, C, M, Y, R, G, B, CMY]. */
  readonly primaries: readonly (readonly [number, number, number])[];
  readonly blackDensityFloor: number;
}

export const CMYK_PRINT_PROFILES: Readonly<Record<CmykPrintProfileId, CmykPrintProfileDescriptor>> = Object.freeze({
  "japan-color-2011-coated": Object.freeze({
    id: "japan-color-2011-coated",
    label: "Japan Color 2011 코팅지 (단행본 표지·화보)",
    description: "국내·일본 웹툰 단행본 컬러 표지 표준(TAC 300%)",
    tacLimit: 3.0,
    gcrStrength: 0.72,
    dotGain: 0.14,
    gamutDeltaEThreshold: 0.044,
    primaries: Object.freeze([
      [0.965, 0.96, 0.94], [0.028, 0.34, 0.64], [0.62, 0.045, 0.25], [0.93, 0.81, 0.03],
      [0.58, 0.045, 0.025], [0.025, 0.27, 0.095], [0.055, 0.038, 0.24], [0.035, 0.032, 0.034],
    ] as const),
    blackDensityFloor: 0.018,
  }),
  "fogra39-coated": Object.freeze({
    id: "fogra39-coated",
    label: "ISO Coated v2 · FOGRA39 (유럽 고급 코팅지)",
    description: "유럽·글로벌 단행본 아트북 표준(TAC 320%)",
    tacLimit: 3.2,
    gcrStrength: 0.75,
    dotGain: 0.13,
    gamutDeltaEThreshold: 0.046,
    primaries: Object.freeze([
      [0.972, 0.968, 0.954], [0.025, 0.36, 0.66], [0.64, 0.042, 0.26], [0.94, 0.82, 0.028],
      [0.6, 0.042, 0.024], [0.024, 0.29, 0.1], [0.052, 0.04, 0.255], [0.032, 0.03, 0.032],
    ] as const),
    blackDensityFloor: 0.016,
  }),
  "swop-v2-uncoated": Object.freeze({
    id: "swop-v2-uncoated",
    label: "SWOP v2 비코팅지 (단행본 내지만화)",
    description: "잉크 흡수가 큰 비코팅 단행본 내지(TAC 260% · 채도 압축 강함)",
    tacLimit: 2.6,
    gcrStrength: 0.68,
    dotGain: 0.21,
    gamutDeltaEThreshold: 0.036,
    primaries: Object.freeze([
      [0.905, 0.888, 0.848], [0.065, 0.29, 0.51], [0.52, 0.08, 0.22], [0.84, 0.72, 0.075],
      [0.48, 0.075, 0.05], [0.055, 0.22, 0.1], [0.075, 0.06, 0.195], [0.065, 0.06, 0.058],
    ] as const),
    blackDensityFloor: 0.042,
  }),
});

export interface CmykSoftProofInput {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly sourceColorSpace?: "display-p3" | "srgb";
  readonly profileId?: CmykPrintProfileId;
  readonly gamutTolerance?: number;
  readonly highlightMode?: SoftProofHighlightMode;
  readonly overlayOpacity?: number;
  readonly warningColorRgba?: readonly [number, number, number, number];
}

export interface CmykSoftProofResult {
  readonly width: number;
  readonly height: number;
  readonly profileId: CmykPrintProfileId;
  readonly profileLabel: string;
  readonly sourceColorSpace: "display-p3" | "srgb";
  readonly totalOpaquePixels: number;
  readonly outOfGamutPixelCount: number;
  readonly outOfGamutRatio: number;
  readonly tacExceededPixelCount: number;
  readonly maxDeltaE: number;
  readonly meanDeltaE: number;
  readonly gamutMask: Uint8Array;
  readonly deltaEMap: Float32Array;
  readonly softProofRgba: Uint8ClampedArray;
  readonly overlayRgba: Uint8ClampedArray;
  readonly checksum32: number;
  readonly elapsedMs: number;
}

const clampUnit = (v: number): number => (v <= 0 ? 0 : v >= 1 ? 1 : v);
const transferToLinear = (e: number): number => {
  const c = clampUnit(e);
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const linearToTransfer = (l: number): number => {
  const c = clampUnit(l);
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
};

const linearDisplayP3ToXyz = (r: number, g: number, b: number): readonly [number, number, number] => [
  0.4865709486 * r + 0.2656676932 * g + 0.1982172852 * b,
  0.2289745641 * r + 0.6917385218 * g + 0.0792869141 * b,
  0.0451133819 * g + 1.0439443689 * b,
];
const linearSrgbToXyz = (r: number, g: number, b: number): readonly [number, number, number] => [
  0.4123907993 * r + 0.3575843394 * g + 0.1804807884 * b,
  0.2126390059 * r + 0.7151686788 * g + 0.0721923154 * b,
  0.0193308187 * r + 0.1191947798 * g + 0.9505321522 * b,
];
const xyzToLinearSrgb = (x: number, y: number, z: number): readonly [number, number, number] => [
  3.2409699419 * x - 1.5373831776 * y - 0.4986107603 * z,
  -0.9692436363 * x + 1.8759675015 * y + 0.0415550574 * z,
  0.0556300797 * x - 0.2039769589 * y + 1.0569715142 * z,
];
const xyzToLinearDisplayP3 = (x: number, y: number, z: number): readonly [number, number, number] => [
  2.4934969119 * x - 0.9313836179 * y - 0.4027107845 * z,
  -0.8294889696 * x + 1.7626640603 * y + 0.0236246858 * z,
  0.0358458302 * x - 0.0761723893 * y + 0.956884524 * z,
];

function xyzToOklab(x: number, y: number, z: number): readonly [number, number, number] {
  const lC = Math.cbrt(Math.max(0, 0.8189330101 * x + 0.3618667424 * y - 0.1288597137 * z));
  const mC = Math.cbrt(Math.max(0, 0.0329845436 * x + 0.9293118715 * y + 0.0361456387 * z));
  const sC = Math.cbrt(Math.max(0, 0.0482003018 * x + 0.2643662691 * y + 0.633851707 * z));
  return [
    0.2104542553 * lC + 0.793617785 * mC - 0.0040720468 * sC,
    1.9779984951 * lC - 2.428592205 * mC + 0.4505937099 * sC,
    0.0259040371 * lC + 0.7827717662 * mC - 0.808675766 * sC,
  ];
}

const applyDotGain = (ink: number, gain: number): number => {
  const t = clampUnit(ink);
  return clampUnit(t + gain * t * (1 - t));
};

function evalNeugebauerLinearSrgb(
  c: number,
  m: number,
  y: number,
  k: number,
  p: CmykPrintProfileDescriptor,
): readonly [number, number, number] {
  const cd = applyDotGain(c, p.dotGain);
  const md = applyDotGain(m, p.dotGain);
  const yd = applyDotGain(y, p.dotGain);
  const kd = applyDotGain(k, p.dotGain * 0.7);
  const weights: readonly number[] = [
    (1 - cd) * (1 - md) * (1 - yd),
    cd * (1 - md) * (1 - yd),
    (1 - cd) * md * (1 - yd),
    (1 - cd) * (1 - md) * yd,
    (1 - cd) * md * yd,
    cd * (1 - md) * yd,
    cd * md * (1 - yd),
    cd * md * yd,
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < 8; i += 1) {
    const w = weights[i] ?? 0;
    const prim = p.primaries[i] as readonly [number, number, number];
    r += w * prim[0];
    g += w * prim[1];
    b += w * prim[2];
  }
  const kAtten = 1 - kd * (1 - p.blackDensityFloor);
  return [clampUnit(r * kAtten), clampUnit(g * kAtten), clampUnit(b * kAtten)];
}

/**
 * 역 Demichel–Neugebauer 반복 분판 솔버:
 * 물리 인쇄 색역 내부 색상은 잉크 교차 흡광·도트게인을 보정해 오차 없이 재현하고,
 * 물리 잉크 경계와 TAC 한계 밖의 광색역 픽셀만 정직하게 클리핑한다.
 */
function solvePrintableCmykLinearSrgb(
  srgbR: number,
  srgbG: number,
  srgbB: number,
  profile: CmykPrintProfileDescriptor,
): { readonly r: number; readonly g: number; readonly b: number; readonly tacExceeded: boolean } {
  const tR = clampUnit(srgbR);
  const tG = clampUnit(srgbG);
  const tB = clampUnit(srgbB);
  const sqR = Math.sqrt(tR);
  const sqG = Math.sqrt(tG);
  const sqB = Math.sqrt(tB);

  let c0 = clampUnit(1 - sqR);
  let m0 = clampUnit(1 - sqG);
  let y0 = clampUnit(1 - sqB);
  let pred: readonly [number, number, number] = [tR, tG, tB];
  let tacExceeded = false;

  for (let iter = 0; iter < 8; iter += 1) {
    const minCmy = Math.min(c0, m0, y0);
    let kInk = clampUnit(minCmy * profile.gcrStrength);
    const invK = Math.max(0.05, 1 - kInk);
    let cInk = clampUnit((c0 - kInk) / invK);
    let mInk = clampUnit((m0 - kInk) / invK);
    let yInk = clampUnit((y0 - kInk) / invK);
    const rawTac = cInk + mInk + yInk + kInk;
    tacExceeded = rawTac > profile.tacLimit;
    if (tacExceeded && rawTac > 0) {
      const scale = profile.tacLimit / rawTac;
      cInk *= scale;
      mInk *= scale;
      yInk *= scale;
      kInk *= scale;
    }
    pred = evalNeugebauerLinearSrgb(cInk, mInk, yInk, kInk, profile);
    c0 = clampUnit(c0 + (Math.sqrt(pred[0]) - sqR) * 0.88);
    m0 = clampUnit(m0 + (Math.sqrt(pred[1]) - sqG) * 0.88);
    y0 = clampUnit(y0 + (Math.sqrt(pred[2]) - sqB) * 0.88);
  }
  return { r: pred[0], g: pred[1], b: pred[2], tacExceeded };
}

function computeFnv1a32(bytes: Uint8ClampedArray): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i] ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Display-P3(또는 sRGB) 픽셀 버퍼에서 단행본 인쇄 CMYK 색역을 벗어나는 픽셀을
 * OKLab ΔE와 광색역 이탈량으로 검출해 소프트 프루프·경고 오버레이 버퍼를 생성한다.
 */
export function computeCmykSoftProofGamutOverlay(input: CmykSoftProofInput): CmykSoftProofResult {
  const startedMs = performance.now();
  const width = Math.max(1, Math.trunc(input.width));
  const height = Math.max(1, Math.trunc(input.height));
  const total = width * height;
  if (input.rgba.length < total * 4) {
    throw new RangeError(
      `RGBA 버퍼 길이(${input.rgba.length})가 지정 해상도(${width}×${height}×4=${total * 4})보다 작습니다.`,
    );
  }

  const sourceColorSpace = input.sourceColorSpace ?? "display-p3";
  const profileId: CmykPrintProfileId = input.profileId ?? "japan-color-2011-coated";
  const profile = CMYK_PRINT_PROFILES[profileId];
  const threshold = Math.max(0.008, input.gamutTolerance ?? profile.gamutDeltaEThreshold);
  const highlightMode: SoftProofHighlightMode = input.highlightMode ?? "warning-overlay";
  const overlayOpacity = clampUnit(input.overlayOpacity ?? 0.78);
  const warnColor = input.warningColorRgba ?? ([255, 42, 168, 255] as const);

  const gamutMask = new Uint8Array(total);
  const deltaEMap = new Float32Array(total);
  const softProofRgba = new Uint8ClampedArray(total * 4);
  const overlayRgba = new Uint8ClampedArray(total * 4);
  let totalOpaquePixels = 0;
  let outOfGamutPixelCount = 0;
  let tacExceededPixelCount = 0;
  let maxDeltaE = 0;
  let deltaESum = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const p = idx * 4;
      const srcR8 = input.rgba[p] ?? 0;
      const srcG8 = input.rgba[p + 1] ?? 0;
      const srcB8 = input.rgba[p + 2] ?? 0;
      const srcA8 = input.rgba[p + 3] ?? 0;

      if (srcA8 < 8) {
        softProofRgba.set([srcR8, srcG8, srcB8, srcA8], p);
        overlayRgba.set([srcR8, srcG8, srcB8, srcA8], p);
        continue;
      }

      totalOpaquePixels += 1;
      const linR = transferToLinear(srcR8 / 255);
      const linG = transferToLinear(srcG8 / 255);
      const linB = transferToLinear(srcB8 / 255);
      const srcXyz =
        sourceColorSpace === "display-p3"
          ? linearDisplayP3ToXyz(linR, linG, linB)
          : linearSrgbToXyz(linR, linG, linB);
      const srcOklab = xyzToOklab(srcXyz[0], srcXyz[1], srcXyz[2]);
      const srcSrgb = xyzToLinearSrgb(srcXyz[0], srcXyz[1], srcXyz[2]);
      const excursion = Math.max(0, -srcSrgb[0], -srcSrgb[1], -srcSrgb[2], srcSrgb[0] - 1, srcSrgb[1] - 1, srcSrgb[2] - 1);

      const printedSrgb = solvePrintableCmykLinearSrgb(srcSrgb[0], srcSrgb[1], srcSrgb[2], profile);
      if (printedSrgb.tacExceeded) tacExceededPixelCount += 1;

      const printedXyz = linearSrgbToXyz(printedSrgb.r, printedSrgb.g, printedSrgb.b);
      const printedOklab = xyzToOklab(printedXyz[0], printedXyz[1], printedXyz[2]);
      const dL = (srcOklab[0] - printedOklab[0]) * 0.45;
      const dA = srcOklab[1] - printedOklab[1];
      const dB = srcOklab[2] - printedOklab[2];
      const oklabDist = Math.sqrt(dL * dL + dA * dA + dB * dB);
      const deltaE100 = oklabDist * 100;
      deltaEMap[idx] = deltaE100;
      deltaESum += deltaE100;
      if (deltaE100 > maxDeltaE) maxDeltaE = deltaE100;

      const isOutOfGamut = oklabDist > threshold || excursion > 0.045;
      if (isOutOfGamut) {
        gamutMask[idx] = 1;
        outOfGamutPixelCount += 1;
      }

      const proofLin =
        sourceColorSpace === "display-p3"
          ? xyzToLinearDisplayP3(printedXyz[0], printedXyz[1], printedXyz[2])
          : ([printedSrgb.r, printedSrgb.g, printedSrgb.b] as const);
      const proofR8 = Math.round(linearToTransfer(proofLin[0]) * 255);
      const proofG8 = Math.round(linearToTransfer(proofLin[1]) * 255);
      const proofB8 = Math.round(linearToTransfer(proofLin[2]) * 255);
      softProofRgba.set([proofR8, proofG8, proofB8, srcA8], p);

      if (highlightMode === "soft-proof-preview") {
        overlayRgba.set([proofR8, proofG8, proofB8, srcA8], p);
      } else if (highlightMode === "split-compare" && x < Math.floor(width / 2)) {
        overlayRgba.set([srcR8, srcG8, srcB8, srcA8], p);
      } else if (isOutOfGamut) {
        const inv = 1 - overlayOpacity;
        overlayRgba[p] = Math.round(proofR8 * inv + warnColor[0] * overlayOpacity);
        overlayRgba[p + 1] = Math.round(proofG8 * inv + warnColor[1] * overlayOpacity);
        overlayRgba[p + 2] = Math.round(proofB8 * inv + warnColor[2] * overlayOpacity);
        overlayRgba[p + 3] = srcA8;
      } else {
        overlayRgba.set([proofR8, proofG8, proofB8, srcA8], p);
      }
    }
  }

  return Object.freeze({
    width,
    height,
    profileId,
    profileLabel: profile.label,
    sourceColorSpace,
    totalOpaquePixels,
    outOfGamutPixelCount,
    outOfGamutRatio: totalOpaquePixels > 0 ? outOfGamutPixelCount / totalOpaquePixels : 0,
    tacExceededPixelCount,
    maxDeltaE,
    meanDeltaE: totalOpaquePixels > 0 ? deltaESum / totalOpaquePixels : 0,
    gamutMask,
    deltaEMap,
    softProofRgba,
    overlayRgba,
    checksum32: computeFnv1a32(overlayRgba),
    elapsedMs: Math.max(0.01, performance.now() - startedMs),
  });
}

/** 왼쪽 절반은 CMYK 인쇄 안전 톤, 오른쪽 절반은 Display-P3 광색역 원색으로 구성된 테스트 차트를 생성한다. */
export function createDisplayP3TestChartBuffer(width = 64, height = 32): Uint8ClampedArray {
  const w = Math.max(4, Math.trunc(width));
  const h = Math.max(4, Math.trunc(height));
  const rgba = new Uint8ClampedArray(w * h * 4);
  const halfX = Math.floor(w / 2);
  const halfY = Math.floor(h / 2);
  const q3X = halfX + Math.floor((w - halfX) / 2);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const p = (y * w + x) * 4;
      const rgb: readonly [number, number, number] =
        x < halfX
          ? y < halfY ? [216, 176, 148] : [128, 132, 138]
          : y < halfY
            ? x < q3X ? [0, 252, 96] : [0, 236, 255]
            : x < q3X ? [255, 12, 36] : [56, 24, 255];
      rgba[p] = rgb[0];
      rgba[p + 1] = rgb[1];
      rgba[p + 2] = rgb[2];
      rgba[p + 3] = 255;
    }
  }
  return rgba;
}
