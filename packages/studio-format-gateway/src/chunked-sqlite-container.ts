/**
 * @file chunked-sqlite-container.ts
 * @description Clip Studio Paint `.clip` / `.lip` 네이티브 문서 컨테이너(`CSFCHUNK`)의 통합 리더/라이터.
 *
 * 길이 접두(length-prefixed) 청크 디렉터리를 엄격한 경계 검사로 파싱한다. 기존
 * `csp-lippreview-tos-scan-skshaper.ts`는 `CHNKSQLi` 시그니처를 선형 스캔해 프리뷰 PNG만
 * 추출했으나, 본 모듈은 청크 디렉터리 전체(`CHNKHead`/`CHNKExta`/`CHNKSQLi`/`CHNKFoot`)를 구조적으로
 * 순회하여 (1) 임베디드 SQLite 문서 DB를 선언 길이 기준으로 정밀 추출하고, (2) 레이어 픽셀 블록이
 * 참조하는 `CHNKExta` 외부 블록을 외부 ID로 열거하며, (3) 합성 픽스처용 직렬화기를 제공한다.
 *
 * 근거 수준(중요): 아래 레이아웃은 **제3자가 공개한 명세 세 종이 서로 일치하는 부분**이다. 우리가 실제 `.clip` 파일로 확인한 것은 없다.
 * 세 종은 모두 자신들이 가진 실제 파일에서 관찰했다고 밝히지만 CELSYS의 공식 문서는 아니다.
 * - nanikasheila/CLIP_STUDIO_PAINT_Format `docs/spec/01-container.md` (MIT, 실제 파일 719개로 대조했다고 밝힘)
 * - wamsoft/clipparse `docs/CLIP_FORMAT.md` (MIT, 실제 파일 4개로 측정했다고 밝힘)
 * - Inochi2D/clip-d `SPEC.md` (BSD-2, 헤더 필드 순서·빅엔디언·청크 순서만 적음)
 * 항목별 교차 확인 표는 `docs/design/chunked-sqlite-document-reader-secondary-spec-2026-10-29.md`에 있다. 이 모듈은 그 사실만 자체
 * 표현으로 구현했고 어느 쪽의 코드도 옮기지 않았다.
 *
 * 관찰된 컨테이너 레이아웃(Observed, 위 출처 기준, 모든 정수는 빅엔디언):
 * - 오프셋 0: ASCII 매직 `"CSFCHUNK"` (8바이트)
 * - 오프셋 8: uint64 파일 전체 길이(실제 길이와 같다), 오프셋 16: uint64 첫 청크의 위치(항상 24). 세 출처가 이 순서로 일치한다.
 *   파서는 반대 순서도 받아들이되 `clip-header-order-unexpected`로 알리고 판정 결과를 `headerLayout`으로 노출한다.
 * - 오프셋 24~: 청크 반복. 각 청크 = 라벨 `"CHNK"+4자 타입`(8바이트) + uint64 페이로드 길이(8바이트) + 페이로드.
 *   순서는 `CHNKHead`, `CHNKExta`(여럿), `CHNKSQLi`, `CHNKFoot`(본문이 비어 있고 마지막).
 * - `CHNKHead` 본문 40바이트: uint64 256, uint64 `CHNKSQLi` 청크 머리의 파일 내 위치, uint64 16, 16바이트 파일 ID.
 * - `CHNKExta` 본문: uint64 40(외부 ID 길이), 40바이트 ASCII 외부 ID(`extrnlid` + 16진 32자리), uint64 데이터 길이, 데이터. 16진 글자의
 *   대소문자: S2는 측정한 파일에서 대문자였다고 적었고 S1은 글자 모양을 적지 않았다. 파서는 둘 다 형식에 맞는 것으로 받는다.
 *   청크 본문 길이 = 56 + 데이터 길이. 데이터 영역의 맨 앞 uint64는 픽셀 블록 영역에서는 "남은 길이"로도 쓰인다(둘은 같은 필드다).
 * - `CHNKSQLi` 본문은 `SQLite format 3\0`으로 시작하는 문서 DB 전체다.
 *
 * 미확인(Unknowns): `CHNKHead` 첫 값 256과 파일 ID의 의미, `encodeClipContainer` 출력을 Clip Studio Paint가 열 수 있는지(직렬화기는
 * 합성 테스트 픽스처용이며 CSP 호환 쓰기를 보장하지 않는다), 그리고 우리 쪽 실제 파일 검증이다.
 */

import { inspectCspToolFile, type CspSqliteHeaderInspection } from "./csp-sut";

import type { FormatIssue } from "./format-common";

const ASCII_DECODER = new TextDecoder("latin1");
const UTF8_ENCODER = new TextEncoder();

/** `CSFCHUNK` 컨테이너 ASCII 매직. */
export const CLIP_CONTAINER_MAGIC = "CSFCHUNK";
/** 매직(8) + uint64 BE 두 필드(8+8): 오프셋 8 = 파일 길이, 오프셋 16 = 첫 청크 위치(24). 파서는 반대 순서도 받아들이고 알린다. */
export const CLIP_CONTAINER_HEADER_BYTES = 24;
/** 각 청크 라벨 `"CHNK"+4자` 바이트 수. */
export const CLIP_CHUNK_LABEL_BYTES = 8;
/** 라벨 뒤 uint64 BE 페이로드 길이 필드 바이트 수. */
export const CLIP_CHUNK_SIZE_FIELD_BYTES = 8;
/** 청크 라벨 접두사. */
export const CLIP_CHUNK_LABEL_PREFIX = "CHNK";
/** `CHNKExta` 외부 블록 ID 접두사. 뒤에 16진 32자리(대소문자 모두 받는다)가 붙어 전체 40자다. */
export const CLIP_EXTERNAL_ID_PREFIX = "extrnlid";
/** 외부 ID의 길이(접두사 8 + 16진 32). */
export const CLIP_EXTERNAL_ID_BYTES = 40;
/** `CHNKHead` 본문 길이와 첫 값, 파일 ID 길이. */
export const CLIP_HEAD_BODY_BYTES = 40;
export const CLIP_HEAD_VERSION = 256;
export const CLIP_HEAD_FILE_ID_BYTES = 16;

const SQLITE_MAGIC_ASCII = "SQLite format 3\0";

/** 컨테이너 파서 안전 한도. 모든 값은 경계 검사로 강제되며 초과 시 파싱을 중단하고 issue를 남긴다. */
export interface ClipContainerLimits {
  /** 허용 입력 전체 크기 상한(바이트). */
  readonly maxBytes: number;
  /** 디렉터리에서 순회할 청크 최대 개수. */
  readonly maxChunks: number;
  /** 단일 청크 페이로드 최대 길이(바이트). */
  readonly maxChunkBytes: number;
  /** 열거할 외부 블록 최대 개수. */
  readonly maxExternalBlocks: number;
  /** 외부 블록 ID 문자열 최대 길이(바이트). */
  readonly maxExternalIdBytes: number;
}

export const CLIP_CONTAINER_LIMITS: ClipContainerLimits = Object.freeze({
  maxBytes: 2_147_483_647,
  maxChunks: 65_536,
  maxChunkBytes: 2_147_483_647,
  maxExternalBlocks: 65_536,
  maxExternalIdBytes: 4_096,
});

export type ClipContainerKind = "csfchunk" | "lip-sqlite3" | "unknown";

/**
 * 고정 헤더 uint64 두 필드(오프셋 8·16)의 순서 판정 결과.
 * - `length-then-offset`: 오프셋 8 = 선언 파일 길이, 오프셋 16 = 청크 시작(24). 공개 명세 세 종이 적은 순서다.
 * - `offset-then-length`: 오프셋 8 = 청크 시작(24), 오프셋 16 = 선언 파일 길이. 명세에 없는 순서라 `clip-header-order-unexpected`를 남긴다.
 * - `unrecognized`: 정확히 한 필드만 24인 경우가 아님 — 청크 시작은 24로 가정하고 계속한다
 * - `not-applicable`: `CSFCHUNK` 컨테이너가 아님(`.lip`·미지원)
 */
export type ClipHeaderLayout =
  | "length-then-offset"
  | "offset-then-length"
  | "unrecognized"
  | "not-applicable";

export interface ClipChunk {
  /** 라벨 전체(예: `"CHNKHead"`, `"CHNKExta"`, `"CHNKSQLi"`, `"CHNKFoot"`). */
  readonly label: string;
  /** `"CHNK"` 접두 뒤 4자 타입(예: `"Head"`, `"Exta"`, `"SQLi"`, `"Foot"`). */
  readonly type: string;
  /** 라벨이 시작하는 파일 내 절대 오프셋. */
  readonly headerOffset: number;
  /** 페이로드가 시작하는 파일 내 절대 오프셋(`headerOffset + 16`). */
  readonly payloadOffset: number;
  /** 페이로드 길이(바이트). */
  readonly payloadLength: number;
}

export interface ClipSqliteSection {
  /** SQLite 문서 DB 페이로드 시작 오프셋. */
  readonly payloadOffset: number;
  /** SQLite 문서 DB 페이로드 길이(바이트). */
  readonly payloadLength: number;
  /** `csp-sut`의 SQLite 헤더 검사 결과(컨테이너 종류 판정 재사용). */
  readonly inspection: CspSqliteHeaderInspection;
}

export interface ClipExternalBlock {
  /** 외부 블록을 소유한 `CHNKExta` 청크 인덱스. */
  readonly chunkIndex: number;
  /** 외부 ID 문자열(해석 성공 시 `extrnlid...`, 실패 시 청크 인덱스 기반 `clip-exta-unparsed-N`). */
  readonly externalId: string;
  /** 하위 레이아웃 해석 성공 여부. `false`면 페이로드 전체를 원본으로 노출한다. */
  readonly parsed: boolean;
  /** 외부 ID가 명세의 형식(`extrnlid` + 16진 32자리, 대소문자 무관, 전체 40자)인지. 해석에 실패했으면 false. */
  readonly idWellFormed: boolean;
  /** 데이터 블록 시작 오프셋(절대). */
  readonly dataOffset: number;
  /** 데이터 블록 길이(바이트). */
  readonly dataLength: number;
}

/** `CHNKHead` 본문 40바이트를 해석한 값. 의미는 명세 세 종 가운데 둘이 같게 적었다(우리가 실제 파일로 확인하지 않았다). */
export interface ClipHeadChunk {
  /** 첫 값. 관찰된 파일은 모두 256. */
  readonly version: number;
  /** `CHNKSQLi` 청크 머리의 파일 내 위치(=그 앞 이진 영역의 길이). */
  readonly sqliteChunkOffset: number;
  /** 파일 ID 길이. 관찰된 값은 16. */
  readonly fileIdLength: number;
  /** 16바이트 파일 ID의 소문자 16진 표기. */
  readonly fileIdHex: string;
}

export interface ClipContainerParseResult {
  readonly kind: ClipContainerKind;
  /** 고정 헤더 두 필드의 순서 판정 결과. */
  readonly headerLayout: ClipHeaderLayout;
  /** 헤더에서 판정한 청크 스트림 시작 오프셋(24). 판정 불가·`.lip`·미지원은 null. */
  readonly declaredChunkStart: number | null;
  /** 헤더에서 판정한 선언 파일 전체 길이. 판정 불가·`.lip`·미지원은 null. */
  readonly declaredFileLength: number | null;
  /** 순회한 청크 디렉터리. `.lip`은 빈 배열. */
  readonly chunks: readonly ClipChunk[];
  /** 첫 `CHNKSQLi`(또는 `.lip`의 전체 파일) SQLite 섹션. 없으면 null. */
  readonly sqlite: ClipSqliteSection | null;
  /** `CHNKHead`를 해석한 값. 청크가 없거나 본문이 40바이트가 아니면 null. */
  readonly head: ClipHeadChunk | null;
  /** 열거한 외부 블록. */
  readonly externalBlocks: readonly ClipExternalBlock[];
  /** 경계 초과·손상으로 파싱이 조기 종료되었는지 여부. */
  readonly truncated: boolean;
  /** 파싱 중 관측한 경고·미지원 사항. */
  readonly issues: readonly FormatIssue[];
}

export interface ClipContainerParseOptions {
  readonly limits?: Partial<ClipContainerLimits>;
}

function issue(code: string, message: string): FormatIssue {
  return { scope: "container", code, message };
}

function resolveLimits(requested: ClipContainerParseOptions["limits"]): ClipContainerLimits {
  if (requested === undefined) return CLIP_CONTAINER_LIMITS;
  const resolved: { -readonly [K in keyof ClipContainerLimits]: number } = {
    ...CLIP_CONTAINER_LIMITS,
  };
  for (const key of Object.keys(CLIP_CONTAINER_LIMITS) as Array<keyof ClipContainerLimits>) {
    const value = requested[key];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value < 0 || value > CLIP_CONTAINER_LIMITS[key]) {
      throw new RangeError(
        `${key} must be an integer between 0 and ${CLIP_CONTAINER_LIMITS[key]}`,
      );
    }
    resolved[key] = value;
  }
  return resolved;
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  return ASCII_DECODER.decode(bytes.subarray(offset, offset + length));
}

/**
 * uint64 BE를 읽어 안전 정수로 반환한다. `Number.MAX_SAFE_INTEGER`를 넘으면 null을 돌려
 * 호출부가 손상으로 처리하도록 한다(실제 `.clip`은 2GiB 미만이라 안전 정수 범위다).
 */
function readSafeUint64Big(view: DataView, offset: number): number | null {
  const value = view.getBigUint64(offset, false);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(value);
}

/** 입력 선두 바이트만으로 컨테이너 종류를 판정한다(전체 파싱 없이). */
export function inspectClipContainerKind(bytes: Uint8Array): ClipContainerKind {
  if (bytes.byteLength >= CLIP_CONTAINER_HEADER_BYTES && asciiAt(bytes, 0, 8) === CLIP_CONTAINER_MAGIC) {
    return "csfchunk";
  }
  if (
    bytes.byteLength >= SQLITE_MAGIC_ASCII.length &&
    asciiAt(bytes, 0, SQLITE_MAGIC_ASCII.length) === SQLITE_MAGIC_ASCII
  ) {
    return "lip-sqlite3";
  }
  return "unknown";
}

function parseExternalBlock(
  bytes: Uint8Array,
  view: DataView,
  chunk: ClipChunk,
  chunkIndex: number,
  limits: ClipContainerLimits,
  issues: FormatIssue[],
): ClipExternalBlock {
  const fallback = (): ClipExternalBlock => ({
    chunkIndex,
    // 손상 청크가 많은 입력에서 페이로드 전체를 해시하면 입력 크기에 비례해 느려지므로 인덱스로 식별한다.
    externalId: `clip-exta-unparsed-${chunkIndex}`,
    parsed: false,
    idWellFormed: false,
    dataOffset: chunk.payloadOffset,
    dataLength: chunk.payloadLength,
  });

  // 하위 레이아웃: u64 idLen + id + u64 dataLen + data. 최소 16바이트(두 길이 필드)가 필요하다.
  if (chunk.payloadLength < 16) {
    issues.push(
      issue(
        "clip-exta-payload-too-short",
        `CHNKExta #${chunkIndex} payload is ${chunk.payloadLength} bytes; needs at least 16; preserving raw payload`,
      ),
    );
    return fallback();
  }

  const idLen = readSafeUint64Big(view, chunk.payloadOffset);
  if (idLen === null || idLen > limits.maxExternalIdBytes || 8 + idLen + 8 > chunk.payloadLength) {
    issues.push(
      issue(
        "clip-exta-id-length-invalid",
        `CHNKExta #${chunkIndex} external-id length is out of range; preserving raw payload`,
      ),
    );
    return fallback();
  }

  const idOffset = chunk.payloadOffset + 8;
  const externalId = asciiAt(bytes, idOffset, idLen);
  const dataLenOffset = idOffset + idLen;
  const dataLen = readSafeUint64Big(view, dataLenOffset);
  const dataOffset = dataLenOffset + 8;
  if (dataLen === null || dataOffset + dataLen > chunk.payloadOffset + chunk.payloadLength) {
    issues.push(
      issue(
        "clip-exta-data-length-invalid",
        `CHNKExta #${chunkIndex} data length overruns its payload; preserving raw payload`,
      ),
    );
    return fallback();
  }

  const idWellFormed = isWellFormedExternalId(externalId);
  if (!idWellFormed) {
    issues.push(
      issue(
        "clip-exta-id-format-unexpected",
        `CHNKExta #${chunkIndex} external id is not "${CLIP_EXTERNAL_ID_PREFIX}" followed by 32 hex digits`,
      ),
    );
  }
  return { chunkIndex, externalId, parsed: true, idWellFormed, dataOffset, dataLength: dataLen };
}

function isWellFormedExternalId(id: string): boolean {
  return (
    id.length === CLIP_EXTERNAL_ID_BYTES &&
    id.startsWith(CLIP_EXTERNAL_ID_PREFIX) &&
    /^[0-9a-fA-F]{32}$/u.test(id.slice(CLIP_EXTERNAL_ID_PREFIX.length))
  );
}

/** `CHNKHead` 본문 40바이트를 읽는다. 길이가 다르면 null이고 issue를 남긴다. */
function parseHeadChunk(bytes: Uint8Array, view: DataView, chunk: ClipChunk, issues: FormatIssue[]): ClipHeadChunk | null {
  if (chunk.payloadLength !== CLIP_HEAD_BODY_BYTES) {
    issues.push(
      issue("clip-head-length-unexpected", `CHNKHead body is ${chunk.payloadLength} bytes; expected ${CLIP_HEAD_BODY_BYTES}`),
    );
    return null;
  }
  const version = readSafeUint64Big(view, chunk.payloadOffset);
  const sqliteChunkOffset = readSafeUint64Big(view, chunk.payloadOffset + 8);
  const fileIdLength = readSafeUint64Big(view, chunk.payloadOffset + 16);
  if (version === null || sqliteChunkOffset === null || fileIdLength === null) {
    issues.push(issue("clip-head-field-out-of-range", "CHNKHead numeric field exceeds the safe integer range"));
    return null;
  }
  if (version !== CLIP_HEAD_VERSION) {
    issues.push(issue("clip-head-version-unexpected", `CHNKHead first value is ${version}; observed files carry ${CLIP_HEAD_VERSION}`));
  }
  if (fileIdLength !== CLIP_HEAD_FILE_ID_BYTES) {
    issues.push(
      issue("clip-head-id-length-unexpected", `CHNKHead file id length is ${fileIdLength}; observed files carry ${CLIP_HEAD_FILE_ID_BYTES}`),
    );
  }
  const idStart = chunk.payloadOffset + 24;
  let fileIdHex = "";
  for (let index = 0; index < CLIP_HEAD_FILE_ID_BYTES; index += 1) fileIdHex += bytes[idStart + index]!.toString(16).padStart(2, "0");
  return { version, sqliteChunkOffset, fileIdLength, fileIdHex };
}

interface ClipResolvedHeader {
  readonly layout: ClipHeaderLayout;
  readonly declaredChunkStart: number | null;
  readonly declaredFileLength: number | null;
}

/**
 * 오프셋 8·16의 uint64 두 필드 중 정확히 하나가 고정 헤더 크기(24)와 같으면 그 필드를 청크 시작으로,
 * 나머지를 선언 파일 길이로 본다. 어느 쪽이든 실제 청크 순회는 고정 헤더 뒤(24)에서 시작하므로,
 * 필드 순서 가정이 틀려도 파싱 결과가 달라지지 않는다.
 */
function resolveHeaderFields(field8: number | null, field16: number | null): ClipResolvedHeader {
  const eightIsStart = field8 === CLIP_CONTAINER_HEADER_BYTES;
  const sixteenIsStart = field16 === CLIP_CONTAINER_HEADER_BYTES;
  if (sixteenIsStart && !eightIsStart) {
    return { layout: "length-then-offset", declaredChunkStart: field16, declaredFileLength: field8 };
  }
  if (eightIsStart && !sixteenIsStart) {
    return { layout: "offset-then-length", declaredChunkStart: field8, declaredFileLength: field16 };
  }
  return { layout: "unrecognized", declaredChunkStart: null, declaredFileLength: null };
}

/**
 * `.clip`(`CSFCHUNK`) 또는 `.lip`(raw SQLite) 컨테이너를 구조적으로 파싱한다.
 * 원본 바이트는 변형하지 않으며 모든 길이 필드를 경계 검사한다. 손상·경계 초과는 예외 대신
 * `truncated`와 `issues`로 보고해, 레거시 자산도 가능한 범위까지 복구하도록 한다.
 */
export function parseClipContainer(
  bytes: Uint8Array,
  options: ClipContainerParseOptions = {},
): ClipContainerParseResult {
  const limits = resolveLimits(options.limits);
  const issues: FormatIssue[] = [];

  if (bytes.byteLength > limits.maxBytes) {
    return {
      kind: "unknown",
      headerLayout: "not-applicable",
      declaredChunkStart: null,
      declaredFileLength: null,
      chunks: [],
      sqlite: null,
      head: null,
      externalBlocks: [],
      truncated: true,
      issues: [issue("clip-input-too-large", `input exceeds maxBytes=${limits.maxBytes}`)],
    };
  }

  const kind = inspectClipContainerKind(bytes);

  if (kind === "lip-sqlite3") {
    return {
      kind,
      headerLayout: "not-applicable",
      declaredChunkStart: null,
      declaredFileLength: null,
      chunks: [],
      sqlite: {
        payloadOffset: 0,
        payloadLength: bytes.byteLength,
        inspection: inspectCspToolFile(bytes),
      },
      head: null,
      externalBlocks: [],
      truncated: false,
      issues,
    };
  }

  if (kind === "unknown") {
    return {
      kind,
      headerLayout: "not-applicable",
      declaredChunkStart: null,
      declaredFileLength: null,
      chunks: [],
      sqlite: null,
      head: null,
      externalBlocks: [],
      truncated: false,
      issues: [issue("clip-magic-unrecognized", "input is neither CSFCHUNK nor SQLite format 3")],
    };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = resolveHeaderFields(readSafeUint64Big(view, 8), readSafeUint64Big(view, 16));
  const { declaredChunkStart, declaredFileLength } = header;
  if (header.layout === "unrecognized") {
    issues.push(
      issue(
        "clip-header-fields-unrecognized",
        "header uint64 fields do not identify a single chunk-start offset of 24; assuming the chunk stream starts at 24",
      ),
    );
  } else if (header.layout === "offset-then-length") {
    issues.push(
      issue(
        "clip-header-order-unexpected",
        "header carries the chunk-start offset before the file length; published specs list the file length first",
      ),
    );
  }

  const chunks: ClipChunk[] = [];
  const externalBlocks: ClipExternalBlock[] = [];
  let sqlite: ClipSqliteSection | null = null;
  let head: ClipHeadChunk | null = null;
  let sawHead = false;
  let truncated = false;
  let sawFooter = false;

  // 헤더 두 필드의 순서와 무관하게 고정 헤더(24바이트) 바로 뒤에서 청크 순회를 시작한다.
  let offset = CLIP_CONTAINER_HEADER_BYTES;

  const chunkFrameBytes = CLIP_CHUNK_LABEL_BYTES + CLIP_CHUNK_SIZE_FIELD_BYTES;

  while (offset + chunkFrameBytes <= bytes.byteLength) {
    if (chunks.length >= limits.maxChunks) {
      issues.push(issue("clip-chunk-count-exceeded", `chunk count exceeds maxChunks=${limits.maxChunks}`));
      truncated = true;
      break;
    }

    const label = asciiAt(bytes, offset, CLIP_CHUNK_LABEL_BYTES);
    if (!label.startsWith(CLIP_CHUNK_LABEL_PREFIX)) {
      issues.push(
        issue("clip-chunk-label-invalid", `expected a CHNK* label at offset ${offset}`),
      );
      truncated = true;
      break;
    }

    const payloadLength = readSafeUint64Big(view, offset + CLIP_CHUNK_LABEL_BYTES);
    if (payloadLength === null || payloadLength > limits.maxChunkBytes) {
      issues.push(
        issue("clip-chunk-size-invalid", `chunk ${label} declares an out-of-range payload length`),
      );
      truncated = true;
      break;
    }

    const payloadOffset = offset + chunkFrameBytes;
    if (payloadOffset + payloadLength > bytes.byteLength) {
      issues.push(
        issue("clip-chunk-overruns-file", `chunk ${label} payload overruns the file`),
      );
      truncated = true;
      break;
    }

    const chunk: ClipChunk = {
      label,
      type: label.slice(CLIP_CHUNK_LABEL_PREFIX.length),
      headerOffset: offset,
      payloadOffset,
      payloadLength,
    };
    const chunkIndex = chunks.length;
    chunks.push(chunk);

    if (chunk.type === "Head") {
      // 첫 CHNKHead만 해석한다. 첫 것이 해석에 실패했을 때 뒤의 것으로 대신하지 않는다(어느 쪽이 맞는지 알 수 없다).
      if (!sawHead) head = parseHeadChunk(bytes, view, chunk, issues);
      else issues.push(issue("clip-chunk-order-unexpected", `CHNKHead #${chunkIndex} repeats; only the first one is read`));
      sawHead = true;
    } else if (chunk.type === "Foot" && chunk.payloadLength !== 0) {
      issues.push(issue("clip-foot-not-empty", `CHNKFoot body is ${chunk.payloadLength} bytes; published specs describe it as empty`));
    }

    if (chunk.type === "SQLi" && sqlite === null) {
      sqlite = {
        payloadOffset,
        payloadLength,
        inspection: inspectCspToolFile(bytes.subarray(payloadOffset, payloadOffset + payloadLength)),
      };
    } else if (chunk.type === "Exta") {
      if (externalBlocks.length < limits.maxExternalBlocks) {
        externalBlocks.push(parseExternalBlock(bytes, view, chunk, chunkIndex, limits, issues));
      } else if (!issues.some((candidate) => candidate.code === "clip-external-count-exceeded")) {
        issues.push(
          issue(
            "clip-external-count-exceeded",
            `external block count exceeds maxExternalBlocks=${limits.maxExternalBlocks}`,
          ),
        );
      }
    }

    offset = payloadOffset + payloadLength;
    if (chunk.type === "Foot") {
      sawFooter = true;
      break;
    }
  }

  if (chunks.length > 0 && chunks[0]!.type !== "Head") {
    issues.push(issue("clip-chunk-order-unexpected", "first chunk is not CHNKHead"));
  }
  const sqliteChunkIndex = chunks.findIndex((chunk) => chunk.type === "SQLi");
  if (sqliteChunkIndex >= 0) {
    // SQLi 자신은 Exta가 아니므로 SQLi부터 훑어도 SQLi 뒤의 Exta만 걸린다.
    if (chunks.slice(sqliteChunkIndex).some((chunk) => chunk.type === "Exta")) {
      issues.push(issue("clip-chunk-order-unexpected", "a CHNKExta chunk follows CHNKSQLi"));
    }
    if (head !== null && head.sqliteChunkOffset !== chunks[sqliteChunkIndex]!.headerOffset) {
      issues.push(
        issue(
          "clip-head-sqlite-offset-mismatch",
          `CHNKHead points at ${head.sqliteChunkOffset} but CHNKSQLi starts at ${chunks[sqliteChunkIndex]!.headerOffset}`,
        ),
      );
    }
  }

  if (declaredFileLength !== null) {
    if (declaredFileLength !== bytes.byteLength) {
      issues.push(
        issue(
          "clip-declared-length-mismatch",
          `declared file length ${declaredFileLength} differs from actual ${bytes.byteLength}`,
        ),
      );
    }
    // 선언 길이 필드의 해석은 명세 세 종이 일치하지만 우리가 실제 파일로 확인하지 못했으므로 길이 불일치만으로 truncated를 단정하지
    // 않는다. 선언 길이보다 실제가 짧은데 CHNKFoot까지 읽지 못한 경우에만 뒷부분이 잘린 파일로 본다. 같거나 더 길면 아니다.
    if (declaredFileLength > bytes.byteLength && !sawFooter) truncated = true;
  }
  if (!sawFooter && !truncated) {
    issues.push(issue("clip-footer-missing", "CHNKFoot terminator chunk was not found"));
  }

  return {
    kind,
    headerLayout: header.layout,
    declaredChunkStart,
    declaredFileLength,
    chunks,
    sqlite,
    head,
    externalBlocks,
    truncated,
    issues,
  };
}

/**
 * `.clip`/`.lip`에서 임베디드 SQLite 문서 DB를 선언 길이 기준으로 정밀 복사해 반환한다.
 * `CHNKSQLi`가 없거나 SQLite 헤더가 아니면 null을 돌려준다(선형 스캔으로 EOF까지 긁지 않는다).
 */
export function extractClipSqliteDatabase(
  bytes: Uint8Array,
  options: ClipContainerParseOptions = {},
): Uint8Array | null {
  const parsed = parseClipContainer(bytes, options);
  if (parsed.sqlite === null || parsed.sqlite.inspection.container !== "sqlite3") return null;
  const { payloadOffset, payloadLength } = parsed.sqlite;
  // Buffer#slice는 뷰를 돌려주므로 subarray 후 새 Uint8Array로 복사해 입력과 메모리를 공유하지 않는다.
  return new Uint8Array(bytes.subarray(payloadOffset, payloadOffset + payloadLength));
}

/** 외부 블록의 데이터 바이트를 복사해 반환한다. */
export function readClipExternalBlockData(bytes: Uint8Array, block: ClipExternalBlock): Uint8Array {
  return new Uint8Array(bytes.subarray(block.dataOffset, block.dataOffset + block.dataLength));
}

export interface ClipChunkInput {
  /** 라벨 전체(예: `"CHNKSQLi"`) 또는 4자 타입(예: `"SQLi"`). */
  readonly label: string;
  readonly payload: Uint8Array;
}

function normalizeChunkLabel(label: string): string {
  const full = label.startsWith(CLIP_CHUNK_LABEL_PREFIX) ? label : `${CLIP_CHUNK_LABEL_PREFIX}${label}`;
  if (full.length !== CLIP_CHUNK_LABEL_BYTES) {
    throw new RangeError(`chunk label must be 8 bytes ("CHNK"+4), received "${label}"`);
  }
  return full;
}

/**
 * `CHNKExta` 외부 블록 페이로드(u64 idLen + id + u64 dataLen + data, 공개 명세와 같은 배치)를 조립한다.
 * `parseExternalBlock`가 다시 복원할 수 있는 정규 형태를 만든다.
 */
export function encodeClipExternalChunkPayload(input: {
  readonly externalId: string;
  readonly data: Uint8Array;
}): Uint8Array {
  const idBytes = UTF8_ENCODER.encode(input.externalId);
  const payload = new Uint8Array(8 + idBytes.byteLength + 8 + input.data.byteLength);
  const view = new DataView(payload.buffer);
  view.setBigUint64(0, BigInt(idBytes.byteLength), false);
  payload.set(idBytes, 8);
  view.setBigUint64(8 + idBytes.byteLength, BigInt(input.data.byteLength), false);
  payload.set(input.data, 8 + idBytes.byteLength + 8);
  return payload;
}

/** 명세대로 `CHNKHead` 본문 40바이트를 만든다(합성 픽스처용). */
export function encodeClipHeadPayload(input: { readonly sqliteChunkOffset: number; readonly fileId?: Uint8Array }): Uint8Array {
  const fileId = input.fileId ?? new Uint8Array(CLIP_HEAD_FILE_ID_BYTES);
  if (fileId.byteLength !== CLIP_HEAD_FILE_ID_BYTES) {
    throw new RangeError(`fileId must be ${CLIP_HEAD_FILE_ID_BYTES} bytes, received ${fileId.byteLength}`);
  }
  const payload = new Uint8Array(CLIP_HEAD_BODY_BYTES);
  const view = new DataView(payload.buffer);
  view.setBigUint64(0, BigInt(CLIP_HEAD_VERSION), false);
  view.setBigUint64(8, BigInt(input.sqliteChunkOffset), false);
  view.setBigUint64(16, BigInt(CLIP_HEAD_FILE_ID_BYTES), false);
  payload.set(fileId, 24);
  return payload;
}

/** 청크 본문 길이들로 각 청크 머리의 파일 내 위치와 전체 길이를 계산한다(헤더 24바이트 뒤에서 시작). */
export function planClipContainerLayout(payloadLengths: readonly number[]): { readonly headerOffsets: number[]; readonly totalBytes: number } {
  const headerOffsets: number[] = [];
  let offset = CLIP_CONTAINER_HEADER_BYTES;
  for (const length of payloadLengths) {
    headerOffsets.push(offset);
    offset += CLIP_CHUNK_LABEL_BYTES + CLIP_CHUNK_SIZE_FIELD_BYTES + length;
  }
  return { headerOffsets, totalBytes: offset };
}

export interface ClipContainerEncodeSpec {
  readonly chunks: readonly ClipChunkInput[];
  /**
   * 고정 헤더 uint64 두 필드의 순서. 기본값 `length-then-offset`은 공개 명세 세 종이 적은 순서다.
   * 합성 픽스처에서 두 순서를 모두 시험할 때만 바꾼다.
   */
  readonly headerLayout?: "length-then-offset" | "offset-then-length";
}

/**
 * 청크 집합을 `CSFCHUNK` 형태로 직렬화하는 **합성 픽스처용** 직렬화기다. 헤더의 청크 시작 오프셋(24)과
 * 선언 파일 길이를 자동 계산하므로 `parseClipContainer`와 라운드트립이 성립하지만, 출력을 Clip Studio
 * Paint가 열 수 있다는 보장은 없다(실제 파일 대조 검증 전).
 */
export function encodeClipContainer(spec: ClipContainerEncodeSpec): Uint8Array {
  const framed = spec.chunks.map((chunk) => ({
    label: normalizeChunkLabel(chunk.label),
    payload: chunk.payload,
  }));

  let total = CLIP_CONTAINER_HEADER_BYTES;
  for (const chunk of framed) {
    total += CLIP_CHUNK_LABEL_BYTES + CLIP_CHUNK_SIZE_FIELD_BYTES + chunk.payload.byteLength;
  }

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  out.set(UTF8_ENCODER.encode(CLIP_CONTAINER_MAGIC), 0);
  const lengthFirst = (spec.headerLayout ?? "length-then-offset") === "length-then-offset";
  view.setBigUint64(8, BigInt(lengthFirst ? total : CLIP_CONTAINER_HEADER_BYTES), false);
  view.setBigUint64(16, BigInt(lengthFirst ? CLIP_CONTAINER_HEADER_BYTES : total), false);

  let offset = CLIP_CONTAINER_HEADER_BYTES;
  for (const chunk of framed) {
    out.set(UTF8_ENCODER.encode(chunk.label), offset);
    view.setBigUint64(offset + CLIP_CHUNK_LABEL_BYTES, BigInt(chunk.payload.byteLength), false);
    out.set(chunk.payload, offset + CLIP_CHUNK_LABEL_BYTES + CLIP_CHUNK_SIZE_FIELD_BYTES);
    offset += CLIP_CHUNK_LABEL_BYTES + CLIP_CHUNK_SIZE_FIELD_BYTES + chunk.payload.byteLength;
  }

  return out;
}
