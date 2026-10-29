/**
 * @file xcf.ts
 * @description GIMP XCF(`.xcf`) 읽기 코덱: 헤더, 속성, 레이어 목록과 그룹 경로, 직선 RGBA8 픽셀, 진단.
 *
 * 공개 포맷 명세(https://developer.gimp.org/core/standards/xcf/)에서 확인한 레이아웃·열거값 같은 사실만 자체
 * 표현으로 구현했다. 명세 문서는 GPL-2.0-or-later이므로 문구를 복사하지 않았고, GIMP 소스(app/xcf)는 읽지
 * 않았다(ADR-0008 §4: 허용 범위는 공개 포맷 명세 기반 재구현). 교차 확인에는 MIT/ISC 독립 구현과 설치된
 * ImageMagick 6.9.12의 읽기 전용 디코드를 블랙박스 오라클로만 썼다.
 *
 * 근거 수준
 * - 이 구현을 실제 GIMP 산출물 10개(태그 file·v003·v011·v012, RLE, RGB·Gray·Indexed, 8비트·32비트 감마 정수·
 *   32비트 선형 실수, 64비트 포인터, 최대 1920x1080, 182레이어와 그룹 31개)에 돌려 모두 오류 없이 읽었다.
 *   ImageMagick 6.9.12가 읽는 8비트 RGB·Gray 레이어 176개는 RGBA가 바이트 단위로 같았다(완전 투명 픽셀의
 *   RGB 제외). ImageMagick이 거부하는 32비트 정밀도는 같은 그림을 32비트 감마 정수와 32비트 선형 실수로 저장한
 *   쌍을 비교해 채널 샘플 70,000개에서 최대 차이 1(1 초과 0개)이었다. 인덱스드는 서로 다른 색 수가 색지도 크기
 *   이하라는 불변식만 확인했다(대조 오라클 없음). 이 표본들은 MIT 저장소·npm 패키지에서 받았지만 개별 파일의
 *   권리를 확인하지 못해 저장소에 커밋하지 않고 로컬 코퍼스(`tests/corpus/formats/local-samples/`)로만 쓴다.
 * - 합성 테스트로만 확인: 압축 없음, 16비트 정수·16/64비트 실수·선형 8비트 정수 환원, 그룹 경로 변형, 음수
 *   오프셋, 손상 파일. 이 환원 정책은 설계 선택이며 GIMP 내부 변환과 일치한다는 보증이 아니다.
 * - 미검증(실표본 없음, 진단으로 표기): 압축 2(zlib)의 정확한 형식, XCF 7~10의 정밀도 필드, GIMP 3.x(XCF 13~26),
 *   레이어 마스크, v4 이상 그룹의 픽셀 의미, 고정밀도 이미지의 부분 알파(표본의 알파가 모두 255였다).
 *   레이어 마스크 픽셀과 채널·벡터·효과 구조는 읽지 않는다. 그룹 부모 복원은 v003 표본에서 경로가 모두 해석되는
 *   일관성만 확인했고 정답과 대조하지는 못했다.
 * - 명세와 실표본의 관계: 해상도 속성은 명세대로 big-endian이 맞다(일부 서드파티 리더는 little-endian으로 읽는다).
 *   불투명도는 명세대로 부동소수 속성(33)이 8비트 속성(6)을 덮어쓰며, 실표본에도 두 값이 어긋난 채 함께 있다
 *   (195 대 0.762).
 */

import { openRasterSha256Hex } from "./openraster";
import { XcfCursor, XcfError } from "./xcf-cursor";
import {
  absoluteXcfCompositeValue,
  describeXcfLayerMode,
} from "./xcf-layer-modes";
import {
  decodeXcfLayerPixels,
  XcfPixelDecodeError,
  type XcfInflateAdapter,
  type XcfPixelDecodeFailureCode,
} from "./xcf-pixels";
import {
  describeXcfPrecision,
  XCF_LEGACY_PRECISION_ID,
  type XcfBaseType,
  type XcfPixelLayout,
  type XcfPrecision,
} from "./xcf-tiles";

import type { FormatIssue } from "./format-common";

export { XcfError, type XcfErrorCode } from "./xcf-cursor";
export type { XcfInflateAdapter } from "./xcf-pixels";
export type { XcfBaseType } from "./xcf-tiles";

const MAGIC = "gimp xcf ";
/** 매직 9바이트 + 버전 태그 4바이트 + 널 1바이트. */
const HEADER_PREFIX_BYTES = 14;
/** 명세가 다루는 가장 높은 XCF 버전(GIMP 3.2.6 기준). 그보다 높은 버전은 구조가 바뀌었을 수 있어 거부한다. */
const MAX_KNOWN_VERSION = 26;

const PROP_COLORMAP = 1;
const PROP_OPACITY = 6;
const PROP_MODE = 7;
const PROP_VISIBLE = 8;
const PROP_OFFSETS = 15;
const PROP_COMPRESSION = 17;
const PROP_RESOLUTION = 19;
const PROP_PARASITES = 21;
const PROP_USER_UNIT = 24;
const PROP_GROUP_ITEM = 29;
const PROP_ITEM_PATH = 30;
const PROP_FLOAT_OPACITY = 33;
const PROP_COMPOSITE_MODE = 35;
const PROP_COMPOSITE_SPACE = 36;
const PROP_BLEND_SPACE = 37;

export interface XcfLimits {
  /** 입력 파일 최대 바이트. */
  readonly maxBytes: number;
  /** 캔버스·레이어 한 변의 최대 픽셀 수. */
  readonly maxCanvasDimension: number;
  readonly maxLayers: number;
  readonly maxChannels: number;
  /** 속성 목록 하나의 최대 레코드 수. */
  readonly maxPropertyRecords: number;
  /** 속성 페이로드 하나의 최대 바이트. */
  readonly maxPropertyBytes: number;
  readonly maxStringBytes: number;
  readonly maxParasites: number;
  /** 그룹 경로의 최대 깊이. */
  readonly maxItemPathDepth: number;
  /** 모든 레이어를 합친 RGBA8 출력의 최대 바이트. 넘으면 이후 레이어의 픽셀은 디코드하지 않는다. */
  readonly maxDecodedBytes: number;
  /** 레이어 하나의 원시(인터리브) 버퍼 최대 바이트. */
  readonly maxLayerRawBytes: number;
}

export const XCF_LIMITS: XcfLimits = Object.freeze({
  maxBytes: 1_073_741_824,
  maxCanvasDimension: 524_288,
  maxLayers: 4_096,
  maxChannels: 1_024,
  maxPropertyRecords: 4_096,
  maxPropertyBytes: 33_554_432,
  maxStringBytes: 65_536,
  maxParasites: 1_024,
  maxItemPathDepth: 256,
  maxDecodedBytes: 1_073_741_824,
  maxLayerRawBytes: 805_306_368,
});

export interface XcfImportOptions {
  /** 호출자는 한도를 낮추기만 할 수 있다. */
  readonly limits?: Partial<XcfLimits>;
  readonly signal?: AbortSignal;
  /** false면 구조만 읽고 픽셀은 디코드하지 않는다. 기본은 true. */
  readonly decodePixels?: boolean;
  /** 압축 2(zlib) 타일용. 주입하지 않으면 해당 레이어의 픽셀은 null이다(미검증 형식). */
  readonly inflate?: XcfInflateAdapter;
}

export interface XcfImageInfo {
  /** 버전 태그: `file`, `v001`, `v011` 등. */
  readonly versionTag: string;
  readonly version: number;
  readonly width: number;
  readonly height: number;
  readonly baseType: XcfBaseType;
  /** 정밀도 번호. 필드가 없는 XCF 3 이하는 150(8비트 감마 정수)이다. */
  readonly precision: number;
  readonly precisionDeclared: boolean;
  /** `PROP_COMPRESSION` 값. 속성이 없으면 null. */
  readonly compression: number | null;
  readonly resolutionPpi: { readonly x: number; readonly y: number } | null;
  readonly paletteSize: number;
  readonly parasiteNames: readonly string[];
  readonly hasIccProfile: boolean;
  readonly layerCount: number;
  readonly channelCount: number;
}

export interface XcfLayerModeSummary {
  readonly id: number;
  /** 알려진 모드면 영문 이름, 아니면 null(원래 숫자를 보존한다). */
  readonly name: string | null;
  readonly legacy: boolean;
}

export interface XcfLayer {
  /** 레이어 포인터 배열에서의 순서(0이 최상단). */
  readonly index: number;
  readonly name: string;
  readonly kind: "raster" | "group";
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly hasAlpha: boolean;
  readonly visible: boolean;
  /** 자신과 모든 조상 그룹이 보이는지. */
  readonly effectiveVisible: boolean;
  /** 0~1. 부동소수 불투명도 속성이 있으면 그것이 우선한다. */
  readonly opacity: number;
  readonly mode: XcfLayerModeSummary;
  /** 합성 속성은 음수("자동")를 절댓값으로 바꾼 값이다. 속성이 없으면 null. */
  readonly compositeMode: number | null;
  readonly compositeSpace: number | null;
  readonly blendSpace: number | null;
  /** 그룹 경로(최상위부터). 최상위 항목이면 null. */
  readonly groupPath: readonly number[] | null;
  /** 부모 그룹 레이어의 `index`. 최상위면 null. */
  readonly parentIndex: number | null;
  readonly hasLayerMask: boolean;
  /** 직선(비 premultiplied) RGBA8, width * height * 4바이트. 그룹이거나 디코드하지 않았거나 실패하면 null. */
  readonly pixels: Uint8Array | null;
}

export interface XcfImportResult {
  readonly format: "xcf";
  readonly specProfile: "gimp-xcf-public-spec";
  readonly image: XcfImageInfo;
  readonly layers: readonly XcfLayer[];
  /** 보존되지만 확인이 필요한 사항. */
  readonly warnings: readonly FormatIssue[];
  /** 의미가 손실되는 사항(읽지 않은 구조, 디코드하지 못한 픽셀 등). */
  readonly unsupported: readonly FormatIssue[];
  readonly source: { readonly byteLength: number; readonly sha256: string };
}

export interface XcfHeaderInspection {
  readonly versionTag: string;
  readonly version: number;
  readonly width: number;
  readonly height: number;
  readonly baseType: XcfBaseType;
  readonly precision: number;
  readonly pointerBytes: 4 | 8;
}

// ---------------------------------------------------------------------------
// 한도와 입력
// ---------------------------------------------------------------------------

function resolveLimits(requested: Partial<XcfLimits> | undefined): XcfLimits {
  if (requested === undefined) return XCF_LIMITS;
  const resolved: { -readonly [K in keyof XcfLimits]: number } = { ...XCF_LIMITS };
  for (const key of Object.keys(XCF_LIMITS) as Array<keyof XcfLimits>) {
    const value = requested[key];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value < 0 || value > XCF_LIMITS[key]) {
      throw new XcfError(`${key}는 0 이상 ${XCF_LIMITS[key]} 이하의 정수여야 한다`, "source-too-large");
    }
    resolved[key] = value;
  }
  return resolved;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new XcfError("XCF 가져오기가 중단되었다", "aborted");
}

async function readSourceBytes(
  source: Blob | Uint8Array | ArrayBuffer,
  limits: XcfLimits,
  signal: AbortSignal | undefined,
): Promise<Uint8Array> {
  throwIfAborted(signal);
  const size = source instanceof Blob ? source.size : source.byteLength;
  if (size > limits.maxBytes) {
    throw new XcfError(`입력 ${size}바이트가 한도 ${limits.maxBytes}를 넘는다`, "source-too-large");
  }
  let bytes: Uint8Array;
  if (source instanceof Blob) bytes = new Uint8Array(await source.arrayBuffer());
  else if (source instanceof Uint8Array) bytes = new Uint8Array(source);
  else if (source instanceof ArrayBuffer) bytes = new Uint8Array(source.slice(0));
  else throw new XcfError("지원하지 않는 입력 형식이다", "source-invalid");
  throwIfAborted(signal);
  return bytes;
}

// ---------------------------------------------------------------------------
// 헤더
// ---------------------------------------------------------------------------

function parseVersion(bytes: Uint8Array): { tag: string; version: number } {
  if (bytes.byteLength < HEADER_PREFIX_BYTES) {
    throw new XcfError("XCF 헤더 접두보다 짧은 입력이다", "magic-invalid");
  }
  const text = (from: number, to: number): string => String.fromCharCode(...bytes.subarray(from, to));
  if (text(0, 9) !== MAGIC || bytes[13] !== 0) {
    throw new XcfError("XCF 매직(gimp xcf)이 아니다", "magic-invalid");
  }
  const tag = text(9, 13);
  let version: number;
  if (tag === "file") version = 0;
  else if (/^v\d{3}$/.test(tag)) version = Number.parseInt(tag.slice(1), 10);
  else throw new XcfError(`알 수 없는 XCF 버전 태그 "${tag}"`, "magic-invalid");

  if (version >= 100) {
    throw new XcfError("CinePaint의 XCF(v100 이상)는 GIMP XCF와 호환되지 않는다", "version-unsupported");
  }
  if (version >= 4 && version <= 6) {
    throw new XcfError(`XCF ${version}은 개발판 형식이라 지원하지 않는다`, "version-unsupported");
  }
  if (version > MAX_KNOWN_VERSION) {
    throw new XcfError(`XCF ${version}은 지원하는 최고 버전 ${MAX_KNOWN_VERSION}보다 높다`, "version-unsupported");
  }
  return { tag, version };
}

const BASE_TYPES: readonly XcfBaseType[] = ["rgb", "grayscale", "indexed"];

interface ParsedHeader extends XcfHeaderInspection {
  readonly precisionInfo: XcfPrecision;
  readonly precisionDeclared: boolean;
  readonly cursor: XcfCursor;
}

function parseHeader(bytes: Uint8Array, limits: XcfLimits): ParsedHeader {
  const { tag, version } = parseVersion(bytes);
  const pointerBytes: 4 | 8 = version >= 11 ? 8 : 4;
  const cursor = new XcfCursor(bytes, pointerBytes, HEADER_PREFIX_BYTES);
  const width = cursor.u32();
  const height = cursor.u32();
  if (width === 0 || height === 0) throw new XcfError("캔버스 크기가 0이다", "structure-invalid");
  if (width > limits.maxCanvasDimension || height > limits.maxCanvasDimension) {
    throw new XcfError(`캔버스 ${width}x${height}가 한도 ${limits.maxCanvasDimension}를 넘는다`, "limit-exceeded");
  }
  const baseType = BASE_TYPES[cursor.u32()];
  if (baseType === undefined) throw new XcfError("알 수 없는 base_type이다", "structure-invalid");

  let precisionId = XCF_LEGACY_PRECISION_ID;
  let precisionDeclared = false;
  if (version >= 4) {
    precisionId = cursor.u32();
    precisionDeclared = true;
  }
  const precisionInfo = describeXcfPrecision(precisionId);
  if (precisionInfo === null) {
    throw new XcfError(`알 수 없는 정밀도 번호 ${precisionId}`, "precision-unsupported");
  }
  return { versionTag: tag, version, width, height, baseType, precision: precisionId, pointerBytes, precisionInfo, precisionDeclared, cursor };
}

/** 헤더만 읽어 버전, 크기, 색 모드, 정밀도를 돌려준다. 손상되었거나 지원하지 않으면 XcfError를 던진다. */
export function inspectXcfHeader(bytes: Uint8Array): XcfHeaderInspection {
  const header = parseHeader(bytes, XCF_LIMITS);
  return {
    versionTag: header.versionTag,
    version: header.version,
    width: header.width,
    height: header.height,
    baseType: header.baseType,
    precision: header.precision,
    pointerBytes: header.pointerBytes,
  };
}

// ---------------------------------------------------------------------------
// 속성
// ---------------------------------------------------------------------------

interface RawProperty {
  readonly type: number;
  readonly start: number;
  readonly length: number;
}

function issue(scope: FormatIssue["scope"], code: string, message: string, path?: string): FormatIssue {
  return path === undefined ? { scope, code, message } : { scope, code, message, path };
}

/** `PROP_USER_UNIT`의 기록 길이는 신뢰할 수 없으므로 필드를 읽어 실제 길이를 계산한다. */
function measureUserUnit(bytes: Uint8Array, start: number, version: number, limits: XcfLimits): number {
  const cursor = new XcfCursor(bytes, 4, start);
  cursor.f32();
  cursor.u32();
  const strings = version >= 21 ? 3 : 5;
  for (let index = 0; index < strings; index += 1) cursor.string(limits.maxStringBytes);
  return cursor.position - start;
}

function readPropertyList(
  cursor: XcfCursor,
  version: number,
  limits: XcfLimits,
  warnings: FormatIssue[],
  path: string,
): RawProperty[] {
  const properties: RawProperty[] = [];
  for (;;) {
    const type = cursor.u32();
    const declared = cursor.u32();
    if (type === 0) return properties;
    if (properties.length >= limits.maxPropertyRecords) {
      throw new XcfError(`속성 레코드가 한도 ${limits.maxPropertyRecords}를 넘는다 (${path})`, "limit-exceeded");
    }
    const start = cursor.position;
    let length = declared;
    if (type === PROP_COLORMAP) {
      // 일부 구버전은 3n+4 대신 n+4를 기록했지만 실제 본문은 3n+4바이트다.
      const entries = new XcfCursor(cursor.bytes, 4, start).u32();
      length = 4 + 3 * entries;
      if (length !== declared) {
        warnings.push(issue("metadata", "xcf-colormap-length-mismatch", `색지도 기록 길이 ${declared}가 실제 ${length}와 다르다`, path));
      }
    } else if (type === PROP_USER_UNIT) {
      length = measureUserUnit(cursor.bytes, start, version, limits);
    }
    if (length > limits.maxPropertyBytes) {
      throw new XcfError(`속성 ${type}의 페이로드 ${length}바이트가 한도를 넘는다 (${path})`, "limit-exceeded");
    }
    cursor.skip(length);
    properties.push({ type, start, length });
  }
}

function propertyReader(bytes: Uint8Array, property: RawProperty): XcfCursor {
  return new XcfCursor(bytes.subarray(property.start, property.start + property.length), 4, 0);
}

interface ImageProperties {
  compression: number | null;
  palette: Uint8Array | null;
  paletteSize: number;
  resolutionPpi: { x: number; y: number } | null;
  parasiteNames: string[];
  hasIccProfile: boolean;
}

function readImageProperties(
  bytes: Uint8Array,
  properties: readonly RawProperty[],
  limits: XcfLimits,
  warnings: FormatIssue[],
): ImageProperties {
  const result: ImageProperties = {
    compression: null,
    palette: null,
    paletteSize: 0,
    resolutionPpi: null,
    parasiteNames: [],
    hasIccProfile: false,
  };
  for (const property of properties) {
    const reader = propertyReader(bytes, property);
    if (property.type === PROP_COLORMAP) {
      const entries = reader.u32();
      result.paletteSize = entries;
      result.palette = new Uint8Array(reader.slice(entries * 3));
    } else if (property.type === PROP_COMPRESSION && property.length >= 1) {
      result.compression = bytes[property.start] ?? null;
    } else if (property.type === PROP_RESOLUTION && property.length >= 8) {
      result.resolutionPpi = { x: reader.f32(), y: reader.f32() };
    } else if (property.type === PROP_PARASITES) {
      try {
        while (reader.remaining > 0) {
          if (result.parasiteNames.length >= limits.maxParasites) break;
          const name = reader.string(limits.maxStringBytes);
          reader.u32();
          reader.skip(reader.u32());
          result.parasiteNames.push(name);
          if (name === "icc-profile") result.hasIccProfile = true;
        }
      } catch (error) {
        if (!(error instanceof XcfError)) throw error;
        warnings.push(issue("metadata", "xcf-parasites-invalid", `파라사이트 목록을 끝까지 읽지 못했다: ${error.message}`));
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// 레이어
// ---------------------------------------------------------------------------

const LAYER_TYPES: readonly XcfPixelLayout[] = [
  { baseType: "rgb", hasAlpha: false },
  { baseType: "rgb", hasAlpha: true },
  { baseType: "grayscale", hasAlpha: false },
  { baseType: "grayscale", hasAlpha: true },
  { baseType: "indexed", hasAlpha: false },
  { baseType: "indexed", hasAlpha: true },
];

interface LayerProperties {
  opacity8: number | null;
  opacityFloat: number | null;
  mode: number;
  visible: boolean;
  offsetX: number;
  offsetY: number;
  isGroup: boolean;
  itemPath: number[] | null;
  compositeMode: number | null;
  compositeSpace: number | null;
  blendSpace: number | null;
}

function readLayerProperties(
  bytes: Uint8Array,
  properties: readonly RawProperty[],
  limits: XcfLimits,
): LayerProperties {
  const result: LayerProperties = {
    opacity8: null,
    opacityFloat: null,
    mode: 0,
    visible: true,
    offsetX: 0,
    offsetY: 0,
    isGroup: false,
    itemPath: null,
    compositeMode: null,
    compositeSpace: null,
    blendSpace: null,
  };
  for (const property of properties) {
    const reader = propertyReader(bytes, property);
    if (property.type === PROP_OPACITY && property.length >= 4) result.opacity8 = reader.u32();
    else if (property.type === PROP_FLOAT_OPACITY && property.length >= 4) result.opacityFloat = reader.f32();
    else if (property.type === PROP_MODE && property.length >= 4) result.mode = reader.u32();
    else if (property.type === PROP_VISIBLE && property.length >= 4) result.visible = reader.u32() !== 0;
    else if (property.type === PROP_OFFSETS && property.length >= 8) {
      result.offsetX = reader.i32();
      result.offsetY = reader.i32();
    } else if (property.type === PROP_GROUP_ITEM) result.isGroup = true;
    else if (property.type === PROP_ITEM_PATH) {
      const depth = Math.floor(property.length / 4);
      if (depth > limits.maxItemPathDepth) {
        throw new XcfError(`그룹 경로 깊이 ${depth}가 한도 ${limits.maxItemPathDepth}를 넘는다`, "limit-exceeded");
      }
      const path: number[] = [];
      for (let index = 0; index < depth; index += 1) path.push(reader.u32());
      result.itemPath = path;
    } else if (property.type === PROP_COMPOSITE_MODE && property.length >= 4) {
      result.compositeMode = absoluteXcfCompositeValue(reader.i32());
    } else if (property.type === PROP_COMPOSITE_SPACE && property.length >= 4) {
      result.compositeSpace = absoluteXcfCompositeValue(reader.i32());
    } else if (property.type === PROP_BLEND_SPACE && property.length >= 4) {
      result.blendSpace = absoluteXcfCompositeValue(reader.i32());
    }
  }
  return result;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 1;
  return Math.min(Math.max(value, 0), 1);
}

interface LayerDraft {
  readonly layer: XcfLayer;
  readonly path: readonly number[] | null;
}

const PIXEL_FAILURE_CODES: Readonly<Record<XcfPixelDecodeFailureCode, string>> = {
  "hierarchy-invalid": "xcf-hierarchy-invalid",
  "pointer-invalid": "xcf-hierarchy-invalid",
  "bpp-mismatch": "xcf-bpp-mismatch",
  "raw-too-large": "xcf-decode-budget-exceeded",
  "tile-decode-failed": "xcf-tile-decode-failed",
  "inflate-unavailable": "xcf-compression-unsupported",
  aborted: "xcf-aborted",
};

// ---------------------------------------------------------------------------
// 가져오기
// ---------------------------------------------------------------------------

/**
 * XCF를 읽어 레이어 목록과 직선 RGBA8 픽셀, 진단을 돌려준다. 회복 가능한 레이어 단위 문제는 던지지 않고
 * `warnings`/`unsupported`로 보고하며, 헤더 손상·한도 초과·중단처럼 계속할 수 없는 경우만 XcfError를 던진다.
 */
export async function importXcf(
  source: Blob | Uint8Array | ArrayBuffer,
  options: XcfImportOptions = {},
): Promise<XcfImportResult> {
  const limits = resolveLimits(options.limits);
  const bytes = await readSourceBytes(source, limits, options.signal);
  const header = parseHeader(bytes, limits);
  const { cursor, version } = header;
  const warnings: FormatIssue[] = [];
  const unsupported: FormatIssue[] = [];

  if (header.precisionDeclared && version <= 10) {
    warnings.push(
      issue("metadata", "xcf-precision-field-unverified", `XCF ${version}의 정밀도 필드는 명세 서술에만 근거하고 실표본으로 확인하지 못했다`),
    );
  }

  const imageProperties = readImageProperties(
    bytes,
    readPropertyList(cursor, version, limits, warnings, "image"),
    limits,
    warnings,
  );
  const layerPointers = cursor.pointerList(limits.maxLayers);
  const channelPointers = cursor.pointerList(limits.maxChannels);
  if (channelPointers.length > 0) {
    warnings.push(
      issue("semantic", "xcf-channels-not-decoded", `이미지 채널 ${channelPointers.length}개(선택 영역 포함)는 읽지 않았다`),
    );
  }

  const compression = imageProperties.compression;
  const pixelCompression = compression === 0 || compression === 1 || compression === 2 ? compression : null;
  if (options.decodePixels !== false && pixelCompression === null && layerPointers.length > 0) {
    unsupported.push(
      issue(
        "resource",
        "xcf-compression-unsupported",
        compression === null ? "압축 방식 속성이 없어 픽셀을 디코드하지 않았다" : `압축 ${compression}은 지원하지 않아 픽셀을 디코드하지 않았다`,
      ),
    );
  }

  const drafts: LayerDraft[] = [];
  let decodedBytes = 0;
  let topLevelCounter = 0;

  for (let index = 0; index < layerPointers.length; index += 1) {
    throwIfAborted(options.signal);
    const path = `layers[${index}]`;
    const pointer = layerPointers[index] ?? 0;
    try {
      if (pointer >= bytes.byteLength) throw new XcfError("레이어 포인터가 파일 밖이다", "structure-invalid");
      const layerCursor = new XcfCursor(bytes, header.pointerBytes, pointer);
      const width = layerCursor.u32();
      const height = layerCursor.u32();
      const typeId = layerCursor.u32();
      const layout = LAYER_TYPES[typeId];
      if (layout === undefined) throw new XcfError(`알 수 없는 레이어 타입 ${typeId}`, "structure-invalid");
      if (width > limits.maxCanvasDimension || height > limits.maxCanvasDimension) {
        throw new XcfError(`레이어 ${width}x${height}가 한도 ${limits.maxCanvasDimension}를 넘는다`, "limit-exceeded");
      }
      const name = layerCursor.string(limits.maxStringBytes);
      const properties = readLayerProperties(
        bytes,
        readPropertyList(layerCursor, version, limits, warnings, path),
        limits,
      );
      const hierarchyPointer = layerCursor.pointer();
      const maskPointer = layerCursor.pointer();

      if (layout.baseType !== header.baseType) {
        warnings.push(issue("semantic", "xcf-layer-type-mismatch", `레이어 색 모드 ${layout.baseType}가 이미지 색 모드 ${header.baseType}와 다르다`, path));
      }
      const modeInfo = describeXcfLayerMode(properties.mode);
      if (modeInfo === null) {
        warnings.push(issue("semantic", "xcf-unknown-layer-mode", `알 수 없는 레이어 모드 ${properties.mode}를 숫자 그대로 보존한다`, path));
      }
      if (maskPointer !== 0) {
        unsupported.push(issue("semantic", "xcf-layer-mask-not-decoded", "레이어 마스크는 읽지 않아 알파에 반영되지 않았다", path));
      }

      let pixels: Uint8Array | null = null;
      const wantsPixels = options.decodePixels !== false && !properties.isGroup && hierarchyPointer !== 0 && pixelCompression !== null;
      if (wantsPixels) {
        const outputBytes = width * height * 4;
        if (decodedBytes + outputBytes > limits.maxDecodedBytes) {
          unsupported.push(issue("resource", "xcf-decode-budget-exceeded", `디코드 예산 ${limits.maxDecodedBytes}바이트를 넘어 픽셀을 건너뛰었다`, path));
        } else {
          try {
            pixels = await decodeXcfLayerPixels({
              bytes,
              pointerBytes: header.pointerBytes,
              hierarchyPointer,
              width,
              height,
              layout,
              precision: header.precisionInfo,
              compression: pixelCompression,
              palette: imageProperties.palette,
              inflate: options.inflate,
              maxRawBytes: limits.maxLayerRawBytes,
              signal: options.signal,
            });
            decodedBytes += pixels.byteLength;
          } catch (error) {
            if (!(error instanceof XcfPixelDecodeError)) throw error;
            if (error.code === "aborted") throw new XcfError("XCF 가져오기가 중단되었다", "aborted");
            unsupported.push(issue("resource", PIXEL_FAILURE_CODES[error.code], error.message, path));
          }
        }
      }

      const opacity = clamp01(properties.opacityFloat ?? (properties.opacity8 ?? 255) / 255);
      let itemPath: number[] | null = properties.itemPath;
      if (itemPath === null) {
        itemPath = [topLevelCounter];
        topLevelCounter += 1;
      }
      drafts.push({
        path: itemPath,
        layer: {
          index,
          name,
          kind: properties.isGroup ? "group" : "raster",
          width,
          height,
          offsetX: properties.offsetX,
          offsetY: properties.offsetY,
          hasAlpha: layout.hasAlpha,
          visible: properties.visible,
          effectiveVisible: properties.visible,
          opacity,
          mode: { id: properties.mode, name: modeInfo?.name ?? null, legacy: modeInfo?.legacy ?? false },
          compositeMode: properties.compositeMode,
          compositeSpace: properties.compositeSpace,
          blendSpace: properties.blendSpace,
          groupPath: properties.itemPath,
          parentIndex: null,
          hasLayerMask: maskPointer !== 0,
          pixels,
        },
      });
    } catch (error) {
      if (!(error instanceof XcfError) || error.code === "aborted") throw error;
      unsupported.push(issue("container", "xcf-layer-structure-invalid", `레이어를 읽지 못해 건너뛰었다: ${error.message}`, path));
    }
  }

  const layers = resolveGroups(drafts, limits, warnings);

  return {
    format: "xcf",
    specProfile: "gimp-xcf-public-spec",
    image: {
      versionTag: header.versionTag,
      version,
      width: header.width,
      height: header.height,
      baseType: header.baseType,
      precision: header.precision,
      precisionDeclared: header.precisionDeclared,
      compression,
      resolutionPpi: imageProperties.resolutionPpi,
      paletteSize: imageProperties.paletteSize,
      parasiteNames: imageProperties.parasiteNames,
      hasIccProfile: imageProperties.hasIccProfile,
      layerCount: layerPointers.length,
      channelCount: channelPointers.length,
    },
    layers,
    warnings,
    unsupported,
    source: { byteLength: bytes.byteLength, sha256: openRasterSha256Hex(bytes) },
  };
}

/**
 * 평탄한 레이어 목록에서 그룹 부모를 복원하고 실효 가시성을 계산한다. 경로는 `PROP_ITEM_PATH`가 있으면 그것을,
 * 없으면 최상위 항목의 등장 순서를 쓴다. 부모를 찾지 못한 항목은 최상위로 두고 경고한다.
 */
function resolveGroups(drafts: readonly LayerDraft[], limits: XcfLimits, warnings: FormatIssue[]): XcfLayer[] {
  const byPath = new Map<string, number>();
  drafts.forEach((draft, position) => {
    if (draft.path !== null) byPath.set(draft.path.join(","), position);
  });

  const parentOf: Array<number | null> = drafts.map((draft) => {
    if (draft.path === null || draft.path.length < 2) return null;
    const parent = byPath.get(draft.path.slice(0, -1).join(","));
    if (parent === undefined || drafts[parent]?.layer.kind !== "group") {
      warnings.push(
        issue("semantic", "xcf-group-path-unresolved", "그룹 경로의 부모를 찾지 못해 최상위로 두었다", `layers[${draft.layer.index}]`),
      );
      return null;
    }
    return parent;
  });

  const effective: Array<boolean | undefined> = [];
  const effectiveVisibility = (position: number, depth: number): boolean => {
    const cached = effective[position];
    if (cached !== undefined) return cached;
    const draft = drafts[position];
    if (draft === undefined) return true;
    const parent = parentOf[position] ?? null;
    const visible =
      draft.layer.visible && (parent === null || depth > limits.maxItemPathDepth ? true : effectiveVisibility(parent, depth + 1));
    effective[position] = visible;
    return visible;
  };

  return drafts.map((draft, position) => {
    const parent = parentOf[position] ?? null;
    return {
      ...draft.layer,
      parentIndex: parent === null ? null : (drafts[parent]?.layer.index ?? null),
      effectiveVisible: effectiveVisibility(position, 0),
    };
  });
}
