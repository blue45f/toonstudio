/**
 * @file kra-document.ts
 * @description Krita 문서(`.kra`/`.krz`) 읽기 코덱: ZIP 컨테이너, `maindoc.xml`, 레이어·마스크 트리, 래스터 레이어 픽셀
 *              (RGBA8로 환원), 합성 이미지·미리보기·ICC 프로파일 원본, 진단.
 *
 * 범위는 읽기다. 레이어 합성, 블렌드 모드 계산, 마스크 적용, 필터·복제·벡터 레이어 실행, 색 변환(ICC), 애니메이션,
 * 쓰기는 하지 않는다. 읽지 않은 레이어·마스크·색 공간은 조용히 버리지 않고 `unsupported`에 이유와 위치를 남긴다. 문서 수준의
 * 부속 항목(`documentinfo.xml`, `animation/index.xml`, 레이어별 `.icc`, ICC 외의 `annotations/*`)은 읽지 않으며 진단도 하지
 * 않는다. 원본 파일의 바이트는 호출자가 가지고 있고, 결과는 길이와 SHA-256만 담는다.
 *
 * 출처와 증거 수준
 * - 컨테이너와 `maindoc.xml` 구조, 타일 파일 배치, 색 공간별 픽셀 배치는 Krita 5.2.2를 블랙박스로 실행해 만든 문서
 *   51개를 관찰하고, 알려진 픽셀을 넣어 저장한 뒤 Krita 자신의 `pixelData` 읽기와 대조해 확정했다(자세한 근거·검증
 *   결과는 `docs/design/krita-kra-reader-observed-2026-10-29.md`). Krita 소스(GPL)는 읽지 않았고 실행 파일에서 코드를
 *   꺼내지 않았다. 타일 헤더 필드 이름은 KDE 커뮤니티 위키의 공개 설명(CC BY-SA 4.0)을 참고했으며 문구는 복사하지 않았다.
 * - 관찰한 것(Observed)과 합성 파일만으로 확인한 것(Assumed), 확인하지 못한 것(Unknown)은 설계 문서의 표로 구분한다.
 *   이 코드의 오류·경고 문구도 그 구분을 따른다.
 * - 이 구현은 Krita와의 호환을 보증하지 않으며 법적 결론이 아니다.
 *
 * 이미지 이름이 ZIP 경로의 일부다(Krita는 이름을 그대로 폴더 이름으로 쓴다). 항목을 파일로 풀지 않고 메모리에서 경로로만 찾으므로
 * ZIP 읽기를 `memory` 경로 정책으로 연다: `1화: 시작`, `뭐?`, 따옴표, 앞뒤 공백, 분해형 한글 같은 이름도 읽고, `..`·`.`·빈 구간,
 * 절대 경로, 제어 문자(탭, 줄바꿈 …), 올바르지 않은 유니코드가 든 이름은 컨테이너째 거부한다(`unsafe-archive-path`).
 */

import {
  FormatZipReaderError,
  FORMAT_ZIP_READER_LIMITS,
  readFormatZipArchive,
  type FormatZipArchive,
  type FormatZipReaderLimits,
} from "./bounded-zip";
import {
  classifyKraProfileTransfer,
  describeKraPixelFormat,
  kraColorLut,
  kraProfileLooksSrgb,
  type KraProfileTransfer,
} from "./kra-colorspace";
import { clipForMessage, KraIssueList } from "./kra-issues";
import { parseKraMaindoc } from "./kra-maindoc";
import { flattenKraNodes, type KraLayerDraft } from "./kra-nodes";
import { assembleKraLayer, KraTileError, parseKraTileFile } from "./kra-tiles";
import { KRA_LIMITS, KraError } from "./kra-types";
import { openRasterSha256Hex } from "./openraster";

import type {
  KraDocumentInfo,
  KraExtent,
  KraImageInfo,
  KraImportOptions,
  KraImportResult,
  KraLayer,
  KraLimits,
  KraSignature,
} from "./kra-types";

export type * from "./kra-types";
export { KRA_LIMITS, KraError } from "./kra-types";
export { KRA_OBSERVED_COMPOSITE_OPS, isObservedKraCompositeOp } from "./kra-composite-ops";

const KRA_MIMETYPE = "application/x-krita";
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** `mimetype` 항목은 짧은 ASCII 한 줄이다. 이보다 크면 읽지 않는다. */
const MAX_MIMETYPE_BYTES = 256;

// ---------------------------------------------------------------------------
// 한도·입력·서명
// ---------------------------------------------------------------------------

function resolveLimits(requested: Partial<KraLimits> | null | undefined): KraLimits {
  if (requested === undefined || requested === null) return KRA_LIMITS;
  if (typeof requested !== "object") throw new KraError("limits는 객체여야 한다", "limit-invalid");
  const resolved = { ...KRA_LIMITS } as { -readonly [K in keyof KraLimits]: number };
  for (const key of Object.keys(requested)) {
    if (!Object.hasOwn(KRA_LIMITS, key)) throw new KraError(`알 수 없는 한도 이름 ${clipForMessage(key)}`, "limit-invalid");
  }
  for (const key of Object.keys(KRA_LIMITS) as Array<keyof KraLimits>) {
    const value = requested[key];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value < 0 || value > KRA_LIMITS[key]) {
      throw new KraError(`${key}는 0 이상 ${KRA_LIMITS[key]} 이하의 정수여야 한다`, "limit-invalid");
    }
    resolved[key] = value;
  }
  return Object.freeze(resolved);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new KraError("Krita 가져오기가 중단되었다", "aborted");
}

async function readSourceBytes(
  source: Blob | Uint8Array | ArrayBuffer,
  maxBytes: number,
  signal: AbortSignal | undefined,
): Promise<Uint8Array> {
  throwIfAborted(signal);
  let size: number;
  if (source instanceof Blob) size = source.size;
  else if (source instanceof Uint8Array || source instanceof ArrayBuffer) size = source.byteLength;
  else throw new KraError("지원하지 않는 입력 형식이다", "source-invalid");
  if (size > maxBytes) throw new KraError(`입력 ${size}바이트가 한도 ${maxBytes}를 넘는다`, "source-too-large");
  let bytes: Uint8Array;
  if (source instanceof Blob) bytes = new Uint8Array(await source.arrayBuffer());
  else if (source instanceof Uint8Array) bytes = new Uint8Array(source);
  else bytes = new Uint8Array(source.slice(0));
  throwIfAborted(signal);
  return bytes;
}

/** ZIP 읽기 한도를 호출자가 낮췄다면 그 값까지 반영한 입력 크기 상한. 값이 올바르지 않으면 입력을 읽기 전에 거부한다. */
function effectiveArchiveBytes(zipLimits: Partial<FormatZipReaderLimits> | null | undefined): number {
  const requested = zipLimits?.maxArchiveBytes;
  if (requested === undefined) return FORMAT_ZIP_READER_LIMITS.maxArchiveBytes;
  if (!Number.isSafeInteger(requested) || requested < 0) {
    throw new KraError("zipLimits.maxArchiveBytes는 0 이상의 정수여야 한다", "limit-invalid");
  }
  return Math.min(FORMAT_ZIP_READER_LIMITS.maxArchiveBytes, requested);
}

/** 가능하면 플랫폼의 SHA-256(비동기, 빠르다)을 쓰고 없으면 순수 구현으로 돌아간다. */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (subtle !== undefined) {
    try {
      const digest = new Uint8Array(await subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));
      return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
    } catch {
      // 지원하지 않는 환경이면 아래의 순수 구현을 쓴다.
    }
  }
  return openRasterSha256Hex(bytes);
}

/** 단일 스레드에서 오래 도는 일이 중단 신호와 다른 작업에 숨 쉴 틈을 주도록, 이 시간(ms)마다 이벤트 루프에 양보한다. */
const YIELD_INTERVAL_MS = 25;

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function yieldToEventLoop(): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Krita 문서의 서명: 첫 ZIP 로컬 항목이 압축하지 않은 `mimetype`이고 내용이 `application/x-krita`다. 다른 ZIP 기반
 * 포맷(OpenRaster 등)과 가르는 가벼운 판별이며, 구조 검증은 `importKra`가 한다.
 */
export function inspectKraSignature(bytes: Uint8Array): KraSignature {
  const nameBytes = 8;
  if (bytes.byteLength < 30 + nameBytes + KRA_MIMETYPE.length) return "unknown";
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) return "unknown";
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const method = view.getUint16(8, true);
  const dataBytes = view.getUint32(18, true);
  const nameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  if (method !== 0 || nameLength !== nameBytes || dataBytes !== KRA_MIMETYPE.length) return "unknown";
  const dataStart = 30 + nameLength + extraLength;
  if (dataStart + dataBytes > bytes.byteLength) return "unknown";
  const name = String.fromCharCode(...bytes.subarray(30, 30 + nameLength));
  const content = String.fromCharCode(...bytes.subarray(dataStart, dataStart + dataBytes));
  return name === "mimetype" && content === KRA_MIMETYPE ? "kra" : "unknown";
}

// ---------------------------------------------------------------------------
// ZIP
// ---------------------------------------------------------------------------

function zipFailure(cause: unknown): KraError {
  if (!(cause instanceof FormatZipReaderError)) {
    return new KraError("Krita ZIP 컨테이너를 열 수 없다", "container-invalid", { cause });
  }
  const detail = `${cause.code}: ${cause.message}`;
  switch (cause.code) {
    case "ABORTED":
      return new KraError("Krita 가져오기가 중단되었다", "aborted", { cause });
    case "PATH_INVALID":
      return new KraError(
        `ZIP 항목 경로가 안전 검사를 통과하지 못했다 (${detail}${cause.path === undefined ? "" : `, ${clipForMessage(cause.path, 120)}`}). 이미지 이름이 경로에 쓰이므로 \`..\`·\`.\`·빈 구간, 절대 경로, 제어 문자가 든 이름은 거부한다`,
        "unsafe-archive-path",
        { cause },
      );
    case "ARCHIVE_SIZE_LIMIT":
    case "ENTRY_COUNT_LIMIT":
    case "ENTRY_SIZE_LIMIT":
    case "TOTAL_SIZE_LIMIT":
    case "ZIP_BOMB":
      return new KraError(`Krita ZIP이 안전 한도를 넘었다 (${detail})`, "limit-exceeded", { cause });
    case "SOURCE_INVALID":
      return new KraError(`입력이 올바르지 않다 (${detail})`, "source-invalid", { cause });
    case "LIMIT_INVALID":
      return new KraError(`ZIP 한도 옵션이 올바르지 않다 (${detail})`, "limit-invalid", { cause });
    default:
      return new KraError(`Krita ZIP 컨테이너가 올바르지 않다 (${detail})`, "container-invalid", { cause });
  }
}

/** 중단은 오류로 올리고, 그 밖의 읽기 실패는 호출자가 진단으로 남기도록 설명 문자열만 돌려준다. */
function describeReadFailure(cause: unknown): string {
  if (cause instanceof FormatZipReaderError) {
    if (cause.code === "ABORTED") throw new KraError("Krita 가져오기가 중단되었다", "aborted", { cause });
    return `${cause.code}: ${cause.message}`;
  }
  if (cause instanceof KraError) throw cause;
  return cause instanceof Error ? cause.message : String(cause);
}

function looksLikePng(bytes: Uint8Array): boolean {
  return bytes.byteLength >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

async function readOptionalAsset(
  archive: FormatZipArchive,
  path: string,
  label: string,
  png: boolean,
  warnings: KraIssueList,
  signal: AbortSignal | undefined,
): Promise<Uint8Array | null> {
  const entry = archive.getEntry(path);
  if (entry === undefined || entry.directory) return null;
  let bytes: Uint8Array;
  try {
    bytes = await archive.readEntry(entry, { signal });
  } catch (cause) {
    warnings.add("resource", "kra-resource-read-failed", `${label}을(를) 읽지 못했다: ${describeReadFailure(cause)}`, clipForMessage(path, 120));
    return null;
  }
  if (png && !looksLikePng(bytes)) {
    warnings.add("resource", "kra-png-signature-invalid", `${label}이(가) PNG 서명으로 시작하지 않아 버렸다`, clipForMessage(path, 120));
    return null;
  }
  return bytes;
}

async function readMimetype(archive: FormatZipArchive, warnings: KraIssueList, signal: AbortSignal | undefined): Promise<string | null> {
  const entry = archive.getEntry("mimetype");
  if (entry === undefined || entry.directory) {
    warnings.add("container", "kra-mimetype-missing", "mimetype 항목이 없다 (관찰한 Krita 파일은 모두 첫 항목으로 가진다)");
    return null;
  }
  if (archive.entries[0]?.path !== "mimetype" || entry.compressionMethod !== 0) {
    warnings.add("container", "kra-mimetype-not-first", "mimetype이 첫 항목이 아니거나 압축되어 있다 (관찰한 Krita 파일과 다르다)");
  }
  if (entry.uncompressedBytes > MAX_MIMETYPE_BYTES) {
    warnings.add("container", "kra-mimetype-unexpected", `mimetype 항목이 ${entry.uncompressedBytes}바이트로 너무 커서 읽지 않았다`);
    return null;
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8").decode(await archive.readEntry(entry, { signal }));
  } catch (cause) {
    warnings.add("container", "kra-mimetype-unexpected", `mimetype을 읽지 못했다: ${describeReadFailure(cause)}`);
    return null;
  }
  if (text !== KRA_MIMETYPE) {
    warnings.add("container", "kra-mimetype-unexpected", `mimetype "${clipForMessage(text)}"가 ${KRA_MIMETYPE}가 아니다`);
  }
  return text;
}

// ---------------------------------------------------------------------------
// 이미지 속성
// ---------------------------------------------------------------------------

function readDimension(attributes: Readonly<Record<string, string>>, key: string, limits: KraLimits): number {
  const raw = attributes[key];
  const value = raw !== undefined && /^\d+$/u.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new KraError(`IMAGE의 ${key}가 양의 정수가 아니다 (${raw === undefined ? "없음" : clipForMessage(raw)})`, "maindoc-invalid");
  }
  if (value > limits.maxCanvasDimension) {
    throw new KraError(`캔버스 ${key} ${value}가 한 변 한도 ${limits.maxCanvasDimension}를 넘는다`, "limit-exceeded");
  }
  return value;
}

function readResolution(raw: string | undefined): number | null {
  if (raw === undefined || !/^\d+(?:\.\d+)?$/u.test(raw)) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** 레이어마다 되풀이해 쓰는 이미지 수준 문자열의 길이 상한. 이름은 ZIP 경로 한도(1,024바이트) 안에서만 의미가 있다. */
const MAX_IMAGE_STRING_CHARACTERS = 1_024;

function imageString(attributes: Readonly<Record<string, string>>, key: string): string | undefined {
  const value = attributes[key];
  if (value !== undefined && value.length > MAX_IMAGE_STRING_CHARACTERS) {
    throw new KraError(`IMAGE의 ${key} 속성이 ${MAX_IMAGE_STRING_CHARACTERS}자를 넘는다`, "maindoc-invalid");
  }
  return value;
}

function readImageInfo(attributes: Readonly<Record<string, string>>, limits: KraLimits): KraImageInfo {
  const name = imageString(attributes, "name");
  const colorSpace = imageString(attributes, "colorspacename");
  if (name === undefined) throw new KraError("IMAGE에 name 속성이 없다", "maindoc-invalid");
  if (colorSpace === undefined || colorSpace === "") throw new KraError("IMAGE에 colorspacename 속성이 없다", "maindoc-invalid");
  const profile = imageString(attributes, "profile");
  return {
    name,
    width: readDimension(attributes, "width", limits),
    height: readDimension(attributes, "height", limits),
    colorSpace,
    profileName: profile === undefined || profile === "" ? null : profile,
    xRes: readResolution(attributes["x-res"]),
    yRes: readResolution(attributes["y-res"]),
    description: attributes["description"] ?? "",
  };
}

// ---------------------------------------------------------------------------
// 래스터 레이어 픽셀
// ---------------------------------------------------------------------------

interface LayerPixels {
  readonly extent: KraExtent | null;
  readonly defaultPixel: readonly [number, number, number, number] | null;
  readonly tileCount: number;
  readonly pixels: Uint8Array | null;
}

const NO_PIXELS: LayerPixels = Object.freeze({ extent: null, defaultPixel: null, tileCount: 0, pixels: null });

interface DecodeContext {
  readonly archive: FormatZipArchive;
  readonly image: KraImageInfo;
  readonly limits: KraLimits;
  readonly signal: AbortSignal | undefined;
  readonly warnings: KraIssueList;
  readonly unsupported: KraIssueList;
  /** 이미지 프로파일로 정한 전달 함수(import당 한 번만 계산한다). */
  readonly transfer: KraProfileTransfer;
  readonly profileLooksSrgb: boolean;
  /** 지금까지 출력 버퍼로 청구한 RGBA8 바이트. 도중에 포기한 레이어의 청구도 환불하지 않는다. */
  decodedBytes: number;
  /** 이미 읽은 레이어 데이터 항목. 같은 항목을 여러 레이어가 가리켜 해제를 되풀이시키지 못하게 한다. */
  readonly readPaths: Set<string>;
  transferNoted: boolean;
  primariesNoted: boolean;
  layerSpaceNoted: boolean;
}

function isSafeLayerFilename(name: string): boolean {
  if (name.length === 0 || name === "." || name === "..") return false;
  for (let index = 0; index < name.length; index += 1) {
    const code = name.charCodeAt(index);
    if (code < 0x20 || code === 0x2f || code === 0x5c) return false;
  }
  return true;
}

async function decodeRasterLayer(ctx: DecodeContext, draft: KraLayerDraft): Promise<LayerPixels> {
  const { archive, image, limits, unsupported } = ctx;
  const where = `layer[${draft.index}]`;
  const label = `"${clipForMessage(draft.name)}"`;
  if (draft.filename === null) {
    unsupported.add("resource", "kra-layer-data-missing", `래스터 레이어 ${label}에 filename 속성이 없어 픽셀을 읽지 않는다`, where);
    return NO_PIXELS;
  }
  if (!isSafeLayerFilename(draft.filename)) {
    unsupported.add("resource", "kra-layer-filename-invalid", `레이어 ${label}의 filename "${clipForMessage(draft.filename)}"가 안전하지 않아 픽셀을 읽지 않는다`, where);
    return NO_PIXELS;
  }
  const colorSpaceName = draft.colorSpace ?? image.colorSpace;
  const format = describeKraPixelFormat(colorSpaceName);
  if (format === null) {
    unsupported.add(
      "semantic",
      "kra-colorspace-unsupported",
      `레이어 ${label}의 색 공간 ${clipForMessage(colorSpaceName)}은(는) RGBA8로 환원하지 않는다 (RGBA·RGBA16·GRAYA·GRAYAU16만 읽는다)`,
      where,
    );
    return NO_PIXELS;
  }

  const layerPath = `${image.name}/layers/${draft.filename}`;
  const entry = archive.getEntry(layerPath);
  if (entry === undefined || entry.directory) {
    unsupported.add("resource", "kra-layer-data-missing", `레이어 ${label}의 데이터 항목 ${clipForMessage(layerPath, 120)}가 ZIP에 없다`, where);
    return NO_PIXELS;
  }
  // 관찰한 Krita 파일은 레이어마다 고유한 데이터 파일을 쓴다. 같은 항목을 되풀이해 해제시키는 파일은 읽지 않는다.
  if (ctx.readPaths.has(layerPath)) {
    unsupported.add("resource", "kra-layer-data-shared", `레이어 ${label}의 데이터 항목 ${clipForMessage(layerPath, 120)}를 앞선 레이어가 이미 썼다`, where);
    return NO_PIXELS;
  }
  ctx.readPaths.add(layerPath);
  let tileBytes: Uint8Array;
  try {
    tileBytes = await archive.readEntry(entry, { signal: ctx.signal });
  } catch (cause) {
    unsupported.add("resource", "kra-layer-read-failed", `레이어 ${label}의 데이터를 읽지 못했다: ${describeReadFailure(cause)}`, where);
    return NO_PIXELS;
  }

  let defaultNative: Uint8Array | null = null;
  const defaultEntry = archive.getEntry(`${layerPath}.defaultpixel`);
  if (defaultEntry === undefined || defaultEntry.directory) {
    ctx.warnings.add("resource", "kra-default-pixel-missing", `레이어 ${label}의 .defaultpixel이 없어 기본 픽셀을 투명으로 보았다`, where);
  } else if (defaultEntry.uncompressedBytes > limits.maxPixelBytes) {
    unsupported.add("resource", "kra-layer-decode-failed", `레이어 ${label}의 .defaultpixel ${defaultEntry.uncompressedBytes}바이트가 한도 ${limits.maxPixelBytes}를 넘는다`, where);
    return NO_PIXELS;
  } else {
    try {
      defaultNative = await archive.readEntry(defaultEntry, { signal: ctx.signal });
    } catch (cause) {
      unsupported.add("resource", "kra-layer-read-failed", `레이어 ${label}의 .defaultpixel을 읽지 못했다: ${describeReadFailure(cause)}`, where);
      return NO_PIXELS;
    }
  }

  const { transfer } = ctx;
  if (draft.colorSpace !== null && draft.colorSpace !== image.colorSpace && !ctx.layerSpaceNoted) {
    ctx.layerSpaceNoted = true;
    ctx.warnings.add(
      "semantic",
      "kra-layer-colorspace-differs",
      `레이어 ${label}의 색 공간 ${clipForMessage(draft.colorSpace)}이(가) 이미지의 ${clipForMessage(image.colorSpace)}과 달라 전달 함수를 이미지 프로파일로 가정했다 (레이어별 프로파일은 읽지 않는다)`,
      where,
    );
  }
  if (format.depth === 16 && !transfer.recognized && !ctx.transferNoted) {
    ctx.transferNoted = true;
    ctx.warnings.add(
      "semantic",
      "kra-profile-transfer-assumed",
      `프로파일 ${image.profileName === null ? "(없음)" : `"${clipForMessage(image.profileName)}"`}에서 전달 함수를 알 수 없어 16비트 값을 sRGB 감마로 가정해 8비트로 줄였다`,
    );
  }
  if (!ctx.primariesNoted && !ctx.profileLooksSrgb) {
    ctx.primariesNoted = true;
    ctx.warnings.add(
      "semantic",
      "kra-profile-primaries-unconverted",
      `프로파일 ${image.profileName === null ? "(없음)" : `"${clipForMessage(image.profileName)}"`}이(가) sRGB로 보이지 않지만 원색을 변환하지 않고 값을 그대로 RGBA8로 옮겼다`,
    );
  }

  try {
    const file = parseKraTileFile(tileBytes, limits);
    if (file.trailingBytes > 0) {
      ctx.warnings.add("container", "kra-tile-trailing-bytes", `레이어 ${label}의 타일 파일 끝에 해석하지 않은 ${file.trailingBytes}바이트가 남았다`, where);
    }
    const result = assembleKraLayer({
      file,
      format,
      lut: kraColorLut(format, transfer.transfer),
      defaultPixelNative: defaultNative,
      offsetX: draft.offsetX,
      offsetY: draft.offsetY,
      canvasWidth: image.width,
      canvasHeight: image.height,
      limits,
      checkpoint: () => throwIfAborted(ctx.signal),
      // 출력 버퍼는 만들기 전에 전체 예산에 청구한다. 깨진 레이어도 예산을 쓰므로 버퍼만 만들고 버리는 파일로 시간을 끌 수 없다.
      reserve: (bytes) => {
        if (ctx.decodedBytes + bytes > limits.maxDecodedBytes) {
          throw new KraTileError(`전체 출력 ${ctx.decodedBytes + bytes}바이트가 예산 ${limits.maxDecodedBytes}를 넘는다`, "limit");
        }
        ctx.decodedBytes += bytes;
      },
    });
    return { extent: result.extent, defaultPixel: result.defaultPixel, tileCount: file.tiles.length, pixels: result.pixels };
  } catch (cause) {
    // 타일 하나라도 풀리지 않으면 그 레이어의 픽셀은 포기한다. 일부 타일만 채운 레이어는 틀린 그림이다.
    if (!(cause instanceof KraTileError)) throw cause;
    unsupported.add(
      "resource",
      cause.code === "limit" ? "kra-layer-limit-exceeded" : "kra-layer-decode-failed",
      `레이어 ${label}: ${cause.message}`,
      where,
    );
    return NO_PIXELS;
  }
}

// ---------------------------------------------------------------------------
// 가져오기
// ---------------------------------------------------------------------------

export async function importKra(source: Blob | Uint8Array | ArrayBuffer, options: KraImportOptions = {}): Promise<KraImportResult> {
  // JS 호출자가 null을 넘겨도 TypeError로 새지 않게 한다.
  const opts: KraImportOptions = options ?? {};
  const limits = resolveLimits(opts.limits);
  const bytes = await readSourceBytes(source, effectiveArchiveBytes(opts.zipLimits), opts.signal);

  const warnings = new KraIssueList(limits.maxIssues);
  const unsupported = new KraIssueList(limits.maxIssues);

  // 항목을 파일로 풀지 않고 메모리에서 이름으로만 찾으므로 `memory` 경로 정책으로 연다(머리말 참고).
  let archive: FormatZipArchive;
  try {
    archive = await readFormatZipArchive(bytes, {
      limits: opts.zipLimits ?? undefined,
      inflateRaw: opts.inflateRaw,
      signal: opts.signal,
      pathPolicy: "memory",
    });
  } catch (cause) {
    throw zipFailure(cause);
  }
  // 구조가 맞는 ZIP만 해시한다(쓰레기 입력에 해시 비용을 쓰지 않는다).
  const sha256 = await sha256Hex(bytes);
  throwIfAborted(opts.signal);

  const mimetype = await readMimetype(archive, warnings, opts.signal);

  const maindocEntry = archive.getEntry("maindoc.xml");
  if (maindocEntry === undefined || maindocEntry.directory) {
    throw new KraError("maindoc.xml 항목이 없다. Krita 문서가 아니다", "container-invalid");
  }
  // 문자 수 한도는 파서가 정확히 보고, 여기서는 한 글자 최대 4바이트로 보고 해제 전에 거른다.
  if (maindocEntry.uncompressedBytes > limits.maxMaindocCharacters * 4) {
    throw new KraError(`maindoc.xml ${maindocEntry.uncompressedBytes}바이트가 한도를 넘는다`, "limit-exceeded");
  }
  let maindocText: string;
  try {
    maindocText = new TextDecoder("utf-8", { fatal: true }).decode(await archive.readEntry(maindocEntry, { signal: opts.signal }));
  } catch (cause) {
    if (cause instanceof FormatZipReaderError) throw zipFailure(cause);
    throw new KraError("maindoc.xml이 올바른 UTF-8이 아니다", "maindoc-invalid", { cause });
  }
  const maindoc = parseKraMaindoc(maindocText, limits);
  const image = readImageInfo(maindoc.image, limits);
  const document: KraDocumentInfo = {
    editor: maindoc.editor,
    kritaVersion: maindoc.kritaVersion,
    syntaxVersion: maindoc.syntaxVersion,
  };

  const { drafts, placementInvalid } = flattenKraNodes(maindoc.nodes, { warnings, unsupported });
  const decodePixels = opts.decodePixels !== false;
  const ctx: DecodeContext = {
    archive,
    image,
    limits,
    signal: opts.signal,
    warnings,
    unsupported,
    transfer: classifyKraProfileTransfer(image.profileName),
    profileLooksSrgb: kraProfileLooksSrgb(image.profileName),
    decodedBytes: 0,
    readPaths: new Set<string>(),
    transferNoted: false,
    primariesNoted: false,
    layerSpaceNoted: false,
  };
  const layers: KraLayer[] = [];
  let lastYield = now();
  for (const draft of drafts) {
    throwIfAborted(opts.signal);
    // 압축하지 않은 항목과 메모리 입력만으로는 마이크로태스크가 이어져 중단 신호가 영원히 실행되지 못한다. 일정 시간마다 양보한다.
    if (now() - lastYield >= YIELD_INTERVAL_MS) {
      await yieldToEventLoop();
      lastYield = now();
      throwIfAborted(opts.signal);
    }
    const pixels = decodePixels && draft.kind === "raster" && !placementInvalid.has(draft.index) ? await decodeRasterLayer(ctx, draft) : NO_PIXELS;
    layers.push({ ...draft, ...pixels });
  }

  const mergedImagePng = await readOptionalAsset(archive, "mergedimage.png", "합성 이미지(mergedimage.png)", true, warnings, opts.signal);
  const previewPng = await readOptionalAsset(archive, "preview.png", "미리보기(preview.png)", true, warnings, opts.signal);
  const iccProfile = await readOptionalAsset(archive, `${image.name}/annotations/icc`, "ICC 프로파일(annotations/icc)", false, warnings, opts.signal);

  return {
    format: "krita-kra",
    specProfile: "krita-kra-observed",
    mimetype,
    document,
    image,
    layers,
    mergedImagePng,
    previewPng,
    iccProfile,
    warnings: warnings.toArray(),
    unsupported: unsupported.toArray(),
    source: { byteLength: bytes.byteLength, sha256 },
  };
}
