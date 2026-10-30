/**
 * @file chunked-sqlite-blocks.ts
 * @description `CSFCHUNK` 문서(`.clip`)의 레이어 픽셀 저장소를 읽는다: `Offscreen.Attribute` BLOB(저장 배치), 외부 청크(`CHNKExta`)의
 * 블록 레코드 열, 블록 하나의 zlib 해제와 픽셀 환원, 오프스크린 전체 조립.
 *
 * 근거 수준(중요): 아래 배치는 **제3자가 공개한 명세 두 종**을 맞춰 본 것이다. 우리가 실제 `.clip` 파일로 확인한 것은 없다. 두 명세는
 * 모두 자신들이 가진 실제 파일에서 관찰한 것이라고 밝히지만 CELSYS의 공식 문서는 아니다.
 * - S1 nanikasheila/CLIP_STUDIO_PAINT_Format `docs/spec/04-raster.md` (MIT, 실제 파일 719개로 대조했다고 밝힘)
 * - S2 wamsoft/clipparse `docs/CLIP_FORMAT.md` (MIT, 실제 파일 4개 164,562블록으로 측정했다고 밝힘)
 * 이 파일이 따르는 `Attribute` 값 배치(특히 `InitColor`의 추가 값 개수와 `BlockSize`의 앞 두 값)는 S2가 세부 튜플과 길이 산식까지 적었고
 * S1은 값 개수를 적지 않아 직접 대조할 수 없다. 구현은 S2의 측정 산식을 따른다. S3(Inochi2D/clip-d)는 컨테이너 틀만 다룬다.
 * 문서 `docs/design/chunked-sqlite-document-reader-secondary-spec-2026-10-29.md`에 항목별 교차 확인 표가 있다. 이 구현은 그 문서의
 * 사실만 자체 표현으로 옮겼고 어느 쪽의 코드도 옮기지 않았다.
 *
 * 관찰된 배치(Observed, 위 출처 기준):
 * - `Offscreen.Attribute`: `u32 16, u32 len(Parameter 절), u32 len(InitColor 절), u32 len(BlockSize 절)` 다음에 세 절이 이어진다. 각 절은
 *   `u32 9`(이름 글자 수), UTF-16BE 이름 9글자(18바이트), 값 열(u32 BE)이다. 이름은 `Parameter`, `InitColor`, `BlockSize`.
 *   - Parameter 값: 폭, 높이, 가로 블록 수, 세로 블록 수, 이어서 네 개씩 묶음 네 개. 첫 묶음 = (채널 순서, 1, 채널 수, 바이트 코드).
 *   - InitColor 값: 20, has_color, packed_rgba(BE RGBA, 0xFFFFFFFF = 불투명 흰색), 추가 값 개수, 채널 수, 추가 값들.
 *   - BlockSize 값: 12, 블록 수, 채널 수, 블록마다 레코드 전체 바이트 수.
 * - 외부 청크의 데이터 영역(컨테이너의 `u64 data_size` 뒤): 블록 레코드가 가로 우선(왼쪽 위부터)으로 이어지고 그 뒤에 `BlockStatus`,
 *   `BlockCheckSum` 절이 붙는다. 레코드 = `u32 레코드 길이(자신 포함), u32 19, UTF-16BE "BlockDataBeginChunk", u32 번호, u32 해제 후 크기,
 *   u32 256, u32 256, u32 데이터 있음` + (있으면 `u32 압축 길이+4, u32 **LE** 압축 길이, zlib 스트림`) + `u32 17, UTF-16BE "BlockDataEndChunk"`.
 *   데이터가 없으면 104바이트, 있으면 압축 길이 + 112바이트.
 * - 해제 후 블록(256x256): 색 `0x21`은 알파 평면 65,536바이트(행 우선) 뒤에 BGRA 262,144바이트(4번째 바이트는 쓰지 않음, 직선 알파),
 *   회색 `0x11` 8비트는 알파 평면 뒤에 회색 평면, 마스크 `0x01`은 한 평면이다. 명세 하나가 알파를 4x4 슈퍼픽셀로 "접는다"고 적은 것은
 *   같은 바이트를 다른 모양의 배열로 본 서술이며 메모리 순서는 행 우선 평면과 같다(두 명세를 맞춰 확인했다).
 * - 데이터 없는 블록은 InitColor 값을 따른다.
 *
 * 가정(Assumed): `has_color`가 0이면 초기 색이 없다고 보고 투명(0)으로 둔다. 마스크의 초기 값은 packed_rgba의 마지막 바이트(알파)다.
 * 미확인(Unknown): `BlockCheckSum` 알고리즘(명세 두 종이 서로 다르게 적어 검증하지 않는다), 1비트 단색 블록의 비트 순서(해독하지 않고
 * 지원하지 않는다고 보고한다), 16비트·CMYK 등 관찰되지 않은 형식.
 */

import { inflateZlib, ZlibInflateError } from "./zlib-inflate";

/** 블록 한 변의 픽셀 수. 명세 세 종이 모두 256으로 적었다. */
export const CLIP_BLOCK_EDGE = 256;
const BLOCK_PIXELS = CLIP_BLOCK_EDGE * CLIP_BLOCK_EDGE;

export type ClipBlockErrorCode = "attribute" | "stream" | "format" | "decode" | "limit";

export class ClipBlockError extends Error {
  constructor(
    message: string,
    readonly code: ClipBlockErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ClipBlockError";
  }
}

export interface ClipBlockLimits {
  /** 오프스크린 하나가 가질 수 있는 블록 수. */
  readonly maxBlocks: number;
  /** 오프스크린 하나의 출력 픽셀 수(폭 x 높이). */
  readonly maxPixels: number;
}

export const CLIP_BLOCK_LIMITS: ClipBlockLimits = Object.freeze({
  maxBlocks: 16_384,
  maxPixels: 134_217_728,
});

export interface ClipOffscreenInitColor {
  readonly hasColor: boolean;
  /** 빅엔디언 RGBA를 한 u32로 묶은 값(0xFFFFFFFF = 불투명 흰색). */
  readonly packedRgba: number;
  readonly extraCount: number;
  readonly channelCount: number;
}

export interface ClipOffscreenAttribute {
  readonly width: number;
  readonly height: number;
  /** 가로 블록 수. */
  readonly columns: number;
  /** 세로 블록 수. */
  readonly rows: number;
  /** `BlockDataChannelOrder`: 0x21 색, 0x11 회색·단색, 0x01 알파 한 평면. */
  readonly channelOrder: number;
  readonly channelCount: number;
  /** `BlockDataPixelBytes` 코드: 색 5, 회색 2(8비트)·1(1비트), 알파 1. */
  readonly pixelBytesCode: number;
  readonly initColor: ClipOffscreenInitColor;
  /** 블록마다 레코드 전체 바이트 수(길이 필드 포함). */
  readonly blockSizes: readonly number[];
}

export type ClipBlockLayoutKind = "rgba" | "gray8" | "mask8" | "gray1";

export interface ClipBlockLayout {
  readonly kind: ClipBlockLayoutKind;
  /** 해제 후 블록의 바이트 수. */
  readonly decompressedBytes: number;
}

const BEGIN_MARKER = "BlockDataBeginChunk";
const END_MARKER = "BlockDataEndChunk";
const SECTION_NAME_CHARS = 9;
const SECTION_NAME_BYTES = SECTION_NAME_CHARS * 2;
/** 절 머리: u32 이름 글자 수 + 이름. */
const SECTION_HEAD_BYTES = 4 + SECTION_NAME_BYTES;
/** 데이터 없는 블록 레코드의 바이트 수(S1·S2가 같게 적었다). `BlockSize`가 모두 이 값이면 외부 청크에 읽을 데이터가 없다. */
export const CLIP_EMPTY_BLOCK_RECORD_BYTES = 104;
const EMPTY_RECORD_BYTES = CLIP_EMPTY_BLOCK_RECORD_BYTES;

function attributeError(message: string): ClipBlockError {
  return new ClipBlockError(message, "attribute");
}

function utf16beAt(bytes: Uint8Array, offset: number, chars: number): string {
  let text = "";
  for (let index = 0; index < chars; index += 1) {
    text += String.fromCharCode((bytes[offset + index * 2]! << 8) | bytes[offset + index * 2 + 1]!);
  }
  return text;
}

function readSection(
  bytes: Uint8Array,
  view: DataView,
  offset: number,
  length: number,
  expectedName: string,
): { readonly valuesOffset: number; readonly valueCount: number } {
  const valueBytes = length - SECTION_HEAD_BYTES;
  if (valueBytes < 0 || valueBytes % 4 !== 0) throw attributeError(`${expectedName} 절 길이 ${length}가 올바르지 않다`);
  // 세 절의 길이를 합하면 BLOB 길이와 같다는 것을 호출부가 이미 확인했으므로 각 절은 BLOB 안에 있다.
  if (view.getUint32(offset, false) !== SECTION_NAME_CHARS) throw attributeError(`${expectedName} 절의 이름 글자 수가 9가 아니다`);
  const name = utf16beAt(bytes, offset + 4, SECTION_NAME_CHARS);
  if (name !== expectedName) throw attributeError(`절 이름이 ${expectedName}이어야 하는데 "${name}"이다`);
  return { valuesOffset: offset + SECTION_HEAD_BYTES, valueCount: valueBytes / 4 };
}

/**
 * `Offscreen.Attribute` BLOB를 해석한다. 구조가 어긋나면 `ClipBlockError("attribute")`로 던진다.
 * 블록 수와 크기는 `limits`로 막는다.
 */
export function parseClipOffscreenAttribute(bytes: Uint8Array, limits: ClipBlockLimits = CLIP_BLOCK_LIMITS): ClipOffscreenAttribute {
  if (bytes.byteLength < 16) throw attributeError("Attribute BLOB이 머리(16바이트)보다 짧다");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, false) !== 16) throw attributeError("Attribute 머리 크기 필드가 16이 아니다");
  const parameterLength = view.getUint32(4, false);
  const initColorLength = view.getUint32(8, false);
  const blockSizeLength = view.getUint32(12, false);
  // 절 길이의 합이 BLOB 길이와 같아야 한다(합 연산이 넘치지 않도록 먼저 각각을 범위 안으로 본다).
  if (parameterLength > bytes.byteLength || initColorLength > bytes.byteLength || blockSizeLength > bytes.byteLength) {
    throw attributeError("절 길이가 BLOB보다 길다");
  }
  if (16 + parameterLength + initColorLength + blockSizeLength !== bytes.byteLength) {
    throw attributeError(`절 길이의 합(${16 + parameterLength + initColorLength + blockSizeLength})이 BLOB 길이 ${bytes.byteLength}와 다르다`);
  }

  const parameter = readSection(bytes, view, 16, parameterLength, "Parameter");
  if (parameter.valueCount < 8) throw attributeError(`Parameter 값이 ${parameter.valueCount}개뿐이다`);
  const parameterAt = (index: number): number => view.getUint32(parameter.valuesOffset + index * 4, false);
  const width = parameterAt(0);
  const height = parameterAt(1);
  const columns = parameterAt(2);
  const rows = parameterAt(3);
  const channelOrder = parameterAt(4);
  const channelCount = parameterAt(6);
  const pixelBytesCode = parameterAt(7);

  const initColorSection = readSection(bytes, view, 16 + parameterLength, initColorLength, "InitColor");
  if (initColorSection.valueCount < 5) throw attributeError(`InitColor 값이 ${initColorSection.valueCount}개뿐이다`);
  const initAt = (index: number): number => view.getUint32(initColorSection.valuesOffset + index * 4, false);
  const extraCount = initAt(3);
  if (extraCount !== initColorSection.valueCount - 5) {
    throw attributeError(`InitColor의 추가 값 개수 ${extraCount}가 실제 ${initColorSection.valueCount - 5}개와 다르다`);
  }
  const initColor: ClipOffscreenInitColor = {
    hasColor: initAt(1) !== 0,
    packedRgba: initAt(2),
    extraCount,
    channelCount: initAt(4),
  };

  const blockSection = readSection(bytes, view, 16 + parameterLength + initColorLength, blockSizeLength, "BlockSize");
  if (blockSection.valueCount < 3) throw attributeError(`BlockSize 값이 ${blockSection.valueCount}개뿐이다`);
  const blockCount = view.getUint32(blockSection.valuesOffset + 4, false);
  if (blockCount !== blockSection.valueCount - 3) {
    throw attributeError(`BlockSize의 블록 수 ${blockCount}가 실제 ${blockSection.valueCount - 3}개와 다르다`);
  }

  if (width > limits.maxPixels || height > limits.maxPixels || width * height > limits.maxPixels) {
    throw new ClipBlockError(`오프스크린 ${width}x${height}픽셀이 한도 ${limits.maxPixels}를 넘는다`, "limit");
  }
  if (blockCount > limits.maxBlocks) throw new ClipBlockError(`블록 ${blockCount}개가 한도 ${limits.maxBlocks}를 넘는다`, "limit");
  const expectedColumns = Math.ceil(width / CLIP_BLOCK_EDGE);
  const expectedRows = Math.ceil(height / CLIP_BLOCK_EDGE);
  if (columns !== expectedColumns || rows !== expectedRows) {
    throw attributeError(`블록 격자 ${columns}x${rows}가 크기 ${width}x${height}에서 계산한 ${expectedColumns}x${expectedRows}와 다르다`);
  }
  if (blockCount !== columns * rows) throw attributeError(`블록 수 ${blockCount}가 격자 ${columns}x${rows}와 다르다`);

  const blockSizes: number[] = [];
  for (let index = 0; index < blockCount; index += 1) blockSizes.push(view.getUint32(blockSection.valuesOffset + (3 + index) * 4, false));
  return { width, height, columns, rows, channelOrder, channelCount, pixelBytesCode, initColor, blockSizes };
}

/**
 * 속성이 가리키는 블록 형식을 정한다. 관찰된 조합(색, 회색 8비트, 마스크)과 1비트 회색 조합만 알고 나머지는 null이다.
 * 1비트는 `kind: "gray1"`로 구분해 돌려주고 해독은 지원하지 않는다(비트 순서를 확인하지 못했다).
 */
export function resolveClipBlockLayout(attribute: Pick<ClipOffscreenAttribute, "channelOrder" | "channelCount" | "pixelBytesCode">): ClipBlockLayout | null {
  const { channelOrder, channelCount, pixelBytesCode } = attribute;
  if (channelOrder === 0x21 && channelCount === 4 && pixelBytesCode === 5) return { kind: "rgba", decompressedBytes: BLOCK_PIXELS * 5 };
  if (channelOrder === 0x11 && channelCount === 1 && pixelBytesCode === 2) return { kind: "gray8", decompressedBytes: BLOCK_PIXELS * 2 };
  if (channelOrder === 0x11 && channelCount === 1 && pixelBytesCode === 1) return { kind: "gray1", decompressedBytes: (BLOCK_PIXELS / 8) * 2 };
  if (channelOrder === 0x01 && channelCount === 0 && pixelBytesCode === 1) return { kind: "mask8", decompressedBytes: BLOCK_PIXELS };
  return null;
}

export interface ClipBlockRecord {
  readonly index: number;
  /** 레코드가 선언한 해제 후 바이트 수. */
  readonly decompressedBytes: number;
  /** 압축 데이터의 위치(`payload` 안의 오프셋). 데이터가 없으면(초기 색을 따르는 블록) null. */
  readonly compressed: { readonly offset: number; readonly length: number } | null;
}

function streamError(message: string): ClipBlockError {
  return new ClipBlockError(message, "stream");
}

/**
 * 압축 길이가 해제 후 크기에 이만큼(1/8)과 `CLIP_COMPRESSED_SLACK_BYTES`를 더한 값을 넘는 레코드는 거부한다. zlib이 만든 스트림은
 * 압축 불가능한 입력이어도 `compressBound`(327,680바이트 블록이면 327,793바이트) 안에 들어오므로 정상 파일은 이 상한에 닿지 않는다.
 */
export const CLIP_COMPRESSED_SLACK_BYTES = 1024;

/**
 * 외부 청크의 데이터 영역(컨테이너의 `u64 data_size` 뒤)에서 블록 레코드를 순서대로 읽는다. `attribute.blockSizes`가 정한 길이와
 * 어긋나거나 시작·끝 표식이 맞지 않거나 압축 길이가 상한을 넘으면 `ClipBlockError("stream")`로 던진다. 레코드 뒤의 `BlockStatus`·
 * `BlockCheckSum` 절은 읽지 않는다.
 */
export function parseClipBlockRecords(payload: Uint8Array, attribute: ClipOffscreenAttribute): ClipBlockRecord[] {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const records: ClipBlockRecord[] = [];
  const layout = resolveClipBlockLayout(attribute);
  const maxCompressed = layout === null ? Number.POSITIVE_INFINITY : layout.decompressedBytes + (layout.decompressedBytes >> 3) + CLIP_COMPRESSED_SLACK_BYTES;
  let offset = 0;
  for (let index = 0; index < attribute.blockSizes.length; index += 1) {
    const declared = attribute.blockSizes[index]!;
    if (declared < EMPTY_RECORD_BYTES) throw streamError(`블록 ${index}의 선언 길이 ${declared}가 최소 ${EMPTY_RECORD_BYTES}바이트보다 짧다`);
    if (offset + declared > payload.byteLength) throw streamError(`블록 ${index} 레코드가 데이터 영역 밖으로 나간다`);
    const end = offset + declared;
    if (view.getUint32(offset, false) !== declared) throw streamError(`블록 ${index}의 레코드 길이 필드가 BlockSize와 다르다`);

    let cursor = offset + 4;
    if (view.getUint32(cursor, false) !== BEGIN_MARKER.length) throw streamError(`블록 ${index}의 시작 표식 길이가 ${BEGIN_MARKER.length}가 아니다`);
    cursor += 4;
    if (utf16beAt(payload, cursor, BEGIN_MARKER.length) !== BEGIN_MARKER) throw streamError(`블록 ${index}의 시작 표식이 맞지 않는다`);
    cursor += BEGIN_MARKER.length * 2;

    const blockIndex = view.getUint32(cursor, false);
    const decompressedBytes = view.getUint32(cursor + 4, false);
    const blockWidth = view.getUint32(cursor + 8, false);
    const blockHeight = view.getUint32(cursor + 12, false);
    const hasContent = view.getUint32(cursor + 16, false);
    cursor += 20;
    if (blockIndex !== index) throw streamError(`블록 번호 ${blockIndex}가 순서 ${index}와 다르다`);
    if (blockWidth !== CLIP_BLOCK_EDGE || blockHeight !== CLIP_BLOCK_EDGE) {
      throw streamError(`블록 ${index}의 크기 ${blockWidth}x${blockHeight}가 ${CLIP_BLOCK_EDGE}x${CLIP_BLOCK_EDGE}가 아니다`);
    }

    let compressed: ClipBlockRecord["compressed"] = null;
    if (hasContent !== 0) {
      // 선언 길이가 최소 104바이트라서 고정 머리(66바이트)와 구간 머리(8바이트)는 레코드 안에 있다.
      const sectionSize = view.getUint32(cursor, false);
      const compressedLength = view.getUint32(cursor + 4, true);
      if (sectionSize !== compressedLength + 4) throw streamError(`블록 ${index}의 구간 길이 ${sectionSize}가 압축 길이 ${compressedLength}+4와 다르다`);
      cursor += 8;
      if (compressedLength > maxCompressed) throw streamError(`블록 ${index}의 압축 길이 ${compressedLength}가 해제 후 크기에 비해 지나치게 크다 (상한 ${maxCompressed})`);
      if (cursor + compressedLength > end) throw streamError(`블록 ${index}의 압축 데이터가 레코드 밖이다`);
      compressed = { offset: cursor, length: compressedLength };
      cursor += compressedLength;
    }

    if (cursor + 4 > end) throw streamError(`블록 ${index}의 끝 표식이 레코드 밖이다`);
    if (view.getUint32(cursor, false) !== END_MARKER.length) throw streamError(`블록 ${index}의 끝 표식 길이가 ${END_MARKER.length}가 아니다`);
    cursor += 4;
    if (cursor + END_MARKER.length * 2 !== end) throw streamError(`블록 ${index}의 레코드 길이와 내용이 맞지 않는다`);
    if (utf16beAt(payload, cursor, END_MARKER.length) !== END_MARKER) throw streamError(`블록 ${index}의 끝 표식이 맞지 않는다`);
    // 끝 표식이 레코드 끝과 정확히 맞는지 확인했으므로 데이터 없는 레코드는 104바이트, 있는 레코드는 압축 길이 + 112바이트임이 이미 정해졌다.
    records.push({ index, decompressedBytes, compressed });
    offset = end;
  }
  return records;
}

export interface ClipOffscreenPixels {
  readonly kind: "rgba" | "gray" | "mask";
  readonly width: number;
  readonly height: number;
  /** `kind`가 `rgba`·`gray`일 때: 직선 알파 RGBA8(회색은 R=G=B), 가로 우선. 마스크는 null. */
  readonly pixels: Uint8Array | null;
  /** `kind`가 `mask`일 때: 한 픽셀당 1바이트(255 = 보임), 가로 우선. 그 밖에는 null. */
  readonly values: Uint8Array | null;
  /** 데이터 없는 블록에 쓴 초기 값. `rgba`·`gray`는 RGBA, `mask`는 한 바이트. */
  readonly initial: readonly number[];
  /** 압축 데이터가 있어 해제한 블록 수. */
  readonly decodedBlocks: number;
}

export interface ClipOffscreenDecodeRequest {
  readonly attribute: ClipOffscreenAttribute;
  /** 외부 청크의 데이터 영역. 외부 ID가 없어 저장된 데이터가 없으면 null(모든 블록이 초기 색을 따른다). */
  readonly payload: Uint8Array | null;
  /**
   * 출력 버퍼를 만들기 직전에 바이트 수를 알린다(메모리 예산). 예산을 넘으면 던져도 된다. 호출자는 해독이 실패했을 때 이 몫을 돌려줄 수 있다.
   */
  readonly reserve?: (bytes: number) => void;
  /**
   * 작업량을 알린다(바이트로 환산, **돌려주지 않는 누계**): 레코드를 훑기 전에 레코드 수 × `CLIP_RECORD_COST_BYTES`, 출력 버퍼를 만들고
   * 채우기 전에 그 크기, 압축 데이터가 있는 블록을 풀기 전에 그 해제 후 크기, 푼 뒤에 DEFLATE 블록 수 × `CLIP_DEFLATE_BLOCK_COST_BYTES`를.
   * `reserve`는 살아 있는 버퍼의 합이고 실패하면 돌려주므로, 같은 큰 버퍼를 잡았다 버리기를 되풀이하는 입력은 `reserve`로 막을 수 없다.
   * 이 누계가 그 되풀이와 얇은 띠가 블록 수천 개를 푸는 경우를 막는다. 예산을 넘으면 던져도 된다.
   */
  readonly chargeWork?: (bytes: number) => void;
}

/** 블록 하나를 푸는 zlib 스트림에 허용하는 DEFLATE 블록 수. 정상 스트림은 수십 개 안쪽이다(zlib은 수천 심볼마다 블록을 끊는다). */
export const CLIP_MAX_DEFLATE_BLOCKS = 256;
/**
 * DEFLATE 블록 하나의 머리(허프만 표 만들기)를 작업량으로 환산한 바이트 수. 2026-10-30 실측(Node 22.22.0): 15비트 부호 표 둘을 만드는 데
 * 블록당 약 100~150 us, 허프만 부호화된 리터럴을 풀어 내는 데 출력 1바이트당 약 17 ns, 곧 표 하나가 출력 6~9 KiB를 푸는 시간과 같다
 * (보통 크기의 표는 약 12 us). 15비트 표만으로 블록 256개를 채운 최악의 스트림이 무작위 잡음 블록과 비슷한 시간을 쓰도록 8 KiB로 둔다.
 */
export const CLIP_DEFLATE_BLOCK_COST_BYTES = 8192;
/** 블록 레코드 하나를 훑는 비용(머리 필드 열댓 개와 표식 두 개 읽기)을 작업량으로 환산한 바이트 수. */
export const CLIP_RECORD_COST_BYTES = 1024;

function initialRgba(initColor: ClipOffscreenInitColor): [number, number, number, number] {
  if (!initColor.hasColor) return [0, 0, 0, 0];
  const packed = initColor.packedRgba;
  return [(packed >>> 24) & 0xff, (packed >>> 16) & 0xff, (packed >>> 8) & 0xff, packed & 0xff];
}

/**
 * `pattern`을 `output` 전체에 되풀이해 쓴다. 이미 쓴 앞부분을 두 배씩 복사해 가므로 픽셀마다 쓰는 반복(1.3억 픽셀이면 1.3억 번)보다 훨씬
 * 빠르다. `copyWithin`은 끝을 넘는 길이를 알아서 자른다. `output`의 길이는 `pattern` 길이의 배수여야 한다.
 */
function fillWithPattern(output: Uint8Array, pattern: readonly number[]): void {
  if (output.byteLength === 0) return;
  output.set(pattern, 0);
  for (let filled = pattern.length; filled < output.byteLength; filled *= 2) output.copyWithin(filled, 0, filled);
}

function decodeFailure(index: number, cause: unknown): ClipBlockError {
  const detail = cause instanceof ZlibInflateError ? `${cause.code}: ${cause.message}` : cause instanceof Error ? cause.message : "알 수 없는 오류";
  return new ClipBlockError(`블록 ${index}를 풀지 못했다 (${detail})`, "decode", { cause });
}

/** 블록을 이만큼 풀 때마다 제어를 돌려준다(비동기 호출자가 이벤트 루프에 양보하고 중단 신호를 확인할 틈이다). */
const CHECKPOINT_BLOCKS = 64;

/**
 * `decodeClipOffscreen`과 같은 일을 하되 블록 `CHECKPOINT_BLOCKS`개마다 `yield`한다. 비동기 호출자는 `next()`를 부르는 사이에 이벤트 루프에
 * 양보하거나 중단 신호를 확인할 수 있다. 끝나면 `return` 값이 결과다. 던지는 오류는 `decodeClipOffscreen`과 같다. 출력 버퍼는 입력(속성과
 * 블록 레코드)을 모두 검증한 뒤에야 예약·할당한다.
 */
export function* stepClipOffscreenDecode(request: ClipOffscreenDecodeRequest): Generator<void, ClipOffscreenPixels, void> {
  const { attribute, payload } = request;
  const layout = resolveClipBlockLayout(attribute);
  if (layout === null) {
    throw new ClipBlockError(
      `지원하지 않는 블록 형식이다 (채널 순서 0x${attribute.channelOrder.toString(16)}, 채널 ${attribute.channelCount}, 바이트 코드 ${attribute.pixelBytesCode})`,
      "format",
    );
  }
  if (layout.kind === "gray1") throw new ClipBlockError("1비트 단색 블록은 비트 순서를 확인하지 못해 지원하지 않는다", "format");

  // 레코드 구조와 크기를 모두 검증한 뒤에 출력 버퍼를 예약·할당한다. 구조가 깨진 입력은 버퍼를 잡지 않는다. 블록 안의 zlib 본문이 깨진 것은
  // 풀어 봐야 알 수 있으므로 그 경우 버퍼는 이미 잡혀 있다 — 그래서 버퍼를 만들고 채우는 비용은 돌려주지 않는 작업량으로 센다.
  let records: ClipBlockRecord[] = [];
  if (payload !== null) {
    request.chargeWork?.(attribute.blockSizes.length * CLIP_RECORD_COST_BYTES);
    records = parseClipBlockRecords(payload, attribute);
  }
  for (const record of records) {
    if (record.compressed !== null && record.decompressedBytes !== layout.decompressedBytes) {
      throw new ClipBlockError(`블록 ${record.index}의 해제 후 크기 ${record.decompressedBytes}가 형식의 ${layout.decompressedBytes}와 다르다`, "stream");
    }
  }

  const { width, height, columns } = attribute;
  const isMask = layout.kind === "mask8";
  const rgba = initialRgba(attribute.initColor);
  const maskInitial = attribute.initColor.hasColor ? attribute.initColor.packedRgba & 0xff : 0;
  const outputBytes = isMask ? width * height : width * height * 4;
  request.reserve?.(outputBytes);
  request.chargeWork?.(outputBytes);
  let output: Uint8Array;
  try {
    output = new Uint8Array(outputBytes);
  } catch (error) {
    if (error instanceof RangeError) throw new ClipBlockError(`출력 ${width}x${height}픽셀의 버퍼를 만들 수 없다 (메모리 부족)`, "limit");
    throw error;
  }
  if (isMask) output.fill(maskInitial);
  else fillWithPattern(output, rgba);

  let decodedBlocks = 0;
  let sinceYield = 0;
  for (const record of records) {
    if (record.compressed === null) continue;
    request.chargeWork?.(layout.decompressedBytes);
    const compressed = payload!.subarray(record.compressed.offset, record.compressed.offset + record.compressed.length);
    let block: Uint8Array;
    try {
      const inflated = inflateZlib(compressed, {
        maxOutputBytes: layout.decompressedBytes,
        expectedBytes: layout.decompressedBytes,
        maxBlocks: CLIP_MAX_DEFLATE_BLOCKS,
      });
      block = inflated.output;
      request.chargeWork?.(inflated.blocks * CLIP_DEFLATE_BLOCK_COST_BYTES);
    } catch (cause) {
      if (cause instanceof ClipBlockError) throw cause;
      throw decodeFailure(record.index, cause);
    }
    const originX = (record.index % columns) * CLIP_BLOCK_EDGE;
    const originY = Math.floor(record.index / columns) * CLIP_BLOCK_EDGE;
    const usableWidth = Math.min(CLIP_BLOCK_EDGE, width - originX);
    const usableHeight = Math.min(CLIP_BLOCK_EDGE, height - originY);
    if (layout.kind === "mask8") {
      for (let y = 0; y < usableHeight; y += 1) {
        output.set(block.subarray(y * CLIP_BLOCK_EDGE, y * CLIP_BLOCK_EDGE + usableWidth), (originY + y) * width + originX);
      }
    } else if (layout.kind === "rgba") {
      for (let y = 0; y < usableHeight; y += 1) {
        let to = ((originY + y) * width + originX) * 4;
        let alphaAt = y * CLIP_BLOCK_EDGE;
        let colorAt = BLOCK_PIXELS + y * CLIP_BLOCK_EDGE * 4;
        for (let x = 0; x < usableWidth; x += 1) {
          // 색 평면의 바이트 순서는 B, G, R, (쓰지 않음)이다.
          output[to] = block[colorAt + 2]!;
          output[to + 1] = block[colorAt + 1]!;
          output[to + 2] = block[colorAt]!;
          output[to + 3] = block[alphaAt]!;
          to += 4;
          colorAt += 4;
          alphaAt += 1;
        }
      }
    } else {
      for (let y = 0; y < usableHeight; y += 1) {
        let to = ((originY + y) * width + originX) * 4;
        let alphaAt = y * CLIP_BLOCK_EDGE;
        let grayAt = BLOCK_PIXELS + y * CLIP_BLOCK_EDGE;
        for (let x = 0; x < usableWidth; x += 1) {
          const gray = block[grayAt]!;
          output[to] = gray;
          output[to + 1] = gray;
          output[to + 2] = gray;
          output[to + 3] = block[alphaAt]!;
          to += 4;
          grayAt += 1;
          alphaAt += 1;
        }
      }
    }
    decodedBlocks += 1;
    sinceYield += 1;
    if (sinceYield >= CHECKPOINT_BLOCKS) {
      sinceYield = 0;
      yield;
    }
  }

  return {
    kind: isMask ? "mask" : layout.kind === "gray8" ? "gray" : "rgba",
    width,
    height,
    pixels: isMask ? null : output,
    values: isMask ? output : null,
    initial: isMask ? [maskInitial] : rgba,
    decodedBlocks,
  };
}

/**
 * 오프스크린 하나를 RGBA8(또는 마스크 값)로 조립한다. 블록 하나라도 풀리지 않으면 `ClipBlockError`로 던진다(일부만 채운 레이어는
 * 틀린 그림이다). 1비트 단색과 알 수 없는 형식은 `format`으로 던진다.
 */
export function decodeClipOffscreen(request: ClipOffscreenDecodeRequest): ClipOffscreenPixels {
  const steps = stepClipOffscreenDecode(request);
  for (;;) {
    const step = steps.next();
    if (step.done === true) return step.value;
  }
}
