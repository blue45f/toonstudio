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
 * 근거 수준(중요): 아래 레이아웃은 이 저장소의 실제 `.clip` 샘플이나 이번 변경에서 새로 실행한 REA 분석으로
 * 확인한 값이 **아니다**. 저장소 안에서 확인되는 것은 선행 모듈(`csp-lippreview-tos-scan-skshaper.ts`)의
 * `CSFCHUNK` 매직·`CHNKSQLi` 라벨·"라벨+길이 필드 16바이트 뒤에 SQLite 페이로드" 가정뿐이며, 그마저
 * 합성 스텁 테스트에 기댄다. 나머지는 공개 커뮤니티 해설에 대한 기억에 기반한 **가설**이므로, 실제
 * `.clip` 샘플로 검증하기 전에는 읽기 결과를 확정 사실로 취급하지 않는다.
 *
 * 가정한 컨테이너 레이아웃(Assumptions, 미검증):
 * - 오프셋 0: ASCII 매직 `"CSFCHUNK"` (8바이트)
 * - 오프셋 8·16: uint64 BE 두 필드. 하나는 청크 스트림 시작 오프셋(24), 다른 하나는 선언 파일 전체
 *   길이로 가정한다. **두 필드의 순서는 확정하지 못했으므로** 파서는 어느 순서도 받아들이고 판정 결과를
 *   `headerLayout`으로 노출한다.
 * - 오프셋 24~: 청크 반복. 각 청크 = 라벨 `"CHNK"+4자 타입`(8바이트) + uint64 BE 페이로드 길이(8바이트) + 페이로드
 * - `CHNKSQLi` 페이로드는 `SQLite format 3\0` 문서 DB 원본 바이트로 가정한다.
 * - `CHNKExta` 페이로드는 uint64 BE 외부 ID 길이 + ASCII 외부 ID(`extrnlid...`) + uint64 BE 데이터 길이 +
 *   데이터 바이트로 가정한다. 형태가 맞지 않으면 원본 페이로드를 그대로 노출한다.
 * - `CHNKFoot`은 컨테이너 종료 마커로 가정한다.
 *
 * 미확인(Unknowns): 헤더 두 필드의 순서, `CHNKHead` 페이로드의 필드 의미, `CHNKExta` 데이터 블록 내부의
 * 압축/타일 인코딩, 그리고 `encodeClipContainer` 출력을 Clip Studio Paint가 실제로 열 수 있는지 여부.
 * 직렬화기는 합성 테스트 픽스처용이며 CSP 호환 쓰기를 보장하지 않는다.
 */

import { inspectCspToolFile, type CspSqliteHeaderInspection } from "./csp-sut";

import type { FormatIssue } from "./format-common";

const ASCII_DECODER = new TextDecoder("latin1");
const UTF8_ENCODER = new TextEncoder();

/** `CSFCHUNK` 컨테이너 ASCII 매직. */
export const CLIP_CONTAINER_MAGIC = "CSFCHUNK";
/** 매직(8) + uint64 BE 두 필드(8+8). 두 필드의 순서는 미검증이라 파서가 양쪽 순서를 모두 받아들인다. */
export const CLIP_CONTAINER_HEADER_BYTES = 24;
/** 각 청크 라벨 `"CHNK"+4자` 바이트 수. */
export const CLIP_CHUNK_LABEL_BYTES = 8;
/** 라벨 뒤 uint64 BE 페이로드 길이 필드 바이트 수. */
export const CLIP_CHUNK_SIZE_FIELD_BYTES = 8;
/** 청크 라벨 접두사. */
export const CLIP_CHUNK_LABEL_PREFIX = "CHNK";
/** `CHNKExta` 외부 블록 ID 접두사(가정값, 미검증). */
export const CLIP_EXTERNAL_ID_PREFIX = "extrnlid";

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
 * - `length-then-offset`: 오프셋 8 = 선언 파일 길이, 오프셋 16 = 청크 시작(24)
 * - `offset-then-length`: 오프셋 8 = 청크 시작(24), 오프셋 16 = 선언 파일 길이
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
  /** 데이터 블록 시작 오프셋(절대). */
  readonly dataOffset: number;
  /** 데이터 블록 길이(바이트). */
  readonly dataLength: number;
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

function issue(code: string, message: string, path?: string): FormatIssue {
  return path === undefined
    ? { scope: "container", code, message }
    : { scope: "container", code, message, path };
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
    dataOffset: chunk.payloadOffset,
    dataLength: chunk.payloadLength,
  });

  // 하위 레이아웃: u64 idLen + id + u64 dataLen + data. 최소 16바이트(두 길이 필드)가 필요하다.
  if (chunk.payloadLength < 16) return fallback();

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

  return { chunkIndex, externalId, parsed: true, dataOffset, dataLength: dataLen };
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
  }

  const chunks: ClipChunk[] = [];
  const externalBlocks: ClipExternalBlock[] = [];
  let sqlite: ClipSqliteSection | null = null;
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

  if (declaredFileLength !== null && declaredFileLength !== bytes.byteLength) {
    issues.push(
      issue(
        "clip-declared-length-mismatch",
        `declared file length ${declaredFileLength} differs from actual ${bytes.byteLength}`,
      ),
    );
    // 헤더 해석(H1)은 미검증이므로 길이 불일치만으로 truncated를 단정하지 않는다. 선언 길이보다 실제가
    // 짧은데 CHNKFoot까지 읽지 못한 경우에만 뒷부분이 잘린 파일로 본다. 더 길면 후행 바이트일 뿐이다.
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
 * `CHNKExta` 외부 블록 페이로드(u64 idLen + id + u64 dataLen + data)를 조립한다.
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

export interface ClipContainerEncodeSpec {
  readonly chunks: readonly ClipChunkInput[];
  /**
   * 고정 헤더 uint64 두 필드의 순서. 기본값 `length-then-offset`은 실제 파일로 검증하지 않은 가정이다.
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
