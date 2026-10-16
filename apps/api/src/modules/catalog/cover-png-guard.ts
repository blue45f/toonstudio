import { crc32, inflateSync } from "node:zlib";

import { COVER_MAX_DECODE_PIXELS, COVER_MAX_DECODE_RAW_BYTES } from "./cover-decode-limits";

// 서버측 표지 변환의 PNG 사전 검사.
//
// 검사한 바이트와 디코더가 푸는 바이트는 달라질 수 있다. fast-png(image-js 의 PNG 디코더)는
// - iCCP(색 프로파일)를 상한 없이 inflate 하고(선언 1x1 에 265KB 짜리 iCCP 가 256MB 로 풀려 +518MB),
// - IHDR 이 여러 개면 마지막 것을 쓰고(검사가 본 첫 IHDR 은 4000x4000 인데 마지막 IHDR 이 선언한 5.1억 화소로 디코드),
// - PLTE 항목마다 배열을 만든다(9MB 짜리 PLTE 한 개가 +272MB).
// 그래서 "검사 → 같은 바이트를 디코드"가 아니라, 검사가 확인한 청크만 골라 PNG 를 다시 조립해 그것만 디코드한다.
// 디코더가 읽는 입력 자체가 검사 결과이므로 검사와 디코드 사이에 어긋날 틈이 없다. IDAT 는 하나로 합쳐 새 CRC 를
// 계산한다(빈 IDAT 80만 개로 채운 9.6MB 파일은 디코더가 IDAT 마다 inflate 를 따로 밀어 넣어 이벤트 루프를 4.5초 막았다).
//
// 버리는 청크가 변환 결과에 주는 영향은 없다. fast-png 는 gAMA·cHRM·sRGB·iCCP 로 화소 값을 보정하지 않고
// (원시 샘플 그대로), image-js 는 폭·높이·채널·화소 데이터만 Image 로 옮기며(iCCP·텍스트·해상도는 쓰지 않는다)
// 인코더도 색 프로파일을 출력에 싣지 않는다. 그래서 이미지 크기, 알파 보존 판정(투명 화소 여부), 출력 바이트가
// 청크를 버리기 전과 같다(cover-transcode.png-equivalence.test.ts 가 색 유형·깊이·인터레이스·보조 청크 조합으로 고정한다).

/** PNG 서명 8바이트. */
export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const PNG_IHDR_END = 33; // 서명 8 + IHDR 청크(길이 4 + 형식 4 + 본문 13 + CRC 4)
const PNG_COLOR_CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const PNG_VALID_BIT_DEPTHS: Readonly<Record<number, readonly number[]>> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
};

/** 정상 팔레트는 최대 256색(768바이트)이다. 이보다 큰 PLTE 는 항목마다 배열을 만드는 디코더의 메모리를 부풀린다. */
const PNG_MAX_PALETTE_BYTES = 256 * 3;
/** 팔레트 PNG 의 tRNS 는 팔레트 항목당 1바이트, 회색·트루컬러는 2바이트·6바이트라 모두 이 안이다. */
const PNG_MAX_TRANSPARENCY_BYTES = 256;
/** 애니메이션 PNG 는 프레임 데이터까지 풀 수 있어 변환하지 않는다. */
const PNG_ANIMATION_CHUNKS: ReadonlySet<string> = new Set(["acTL", "fcTL", "fdAT"]);

interface PngHeader {
  readonly width: number;
  readonly height: number;
  /** 선언된 크기·깊이·인터레이스로 계산한 압축 해제 후 크기의 상한(필터 바이트 포함). */
  readonly rawBytes: number;
}

export interface GuardedPng {
  readonly width: number;
  readonly height: number;
  /** 디코더에 넘겨도 되는 PNG. 서명 + IHDR(하나) + 검사한 PLTE·tRNS + IDAT(하나로 합침) + IEND 만 담는다. */
  readonly sanitized: Buffer;
}

/** 디코드하지 않고 첫 청크(IHDR)에서 선언된 크기와, 그에 맞는 압축 해제 후 크기 상한을 읽는다. 읽을 수 없으면 null. */
function readPngHeader(body: Buffer): PngHeader | null {
  if (body.length < PNG_IHDR_END || body.readUInt32BE(8) !== 13 || body.toString("ascii", 12, 16) !== "IHDR") return null;
  const width = body.readUInt32BE(16);
  const height = body.readUInt32BE(20);
  const bitDepth = body[24];
  const colorType = body[25];
  const interlace = body[28];
  if (bitDepth === undefined || colorType === undefined || interlace === undefined) return null;
  const channels = PNG_COLOR_CHANNELS[colorType];
  if (channels === undefined || !PNG_VALID_BIT_DEPTHS[colorType]?.includes(bitDepth)) return null;
  if (interlace !== 0 && interlace !== 1) return null;
  const rowBytes = Math.ceil((width * channels * bitDepth) / 8);
  // Adam7 은 일곱 번에 나눠 그리며 행마다 필터 바이트가 붙어 행 수가 약 2배다. 정확한 값 대신 안전한 상한을 쓴다.
  const rows = interlace === 1 ? 2 * height + 7 : height;
  return { width, height, rawBytes: rows * (1 + rowBytes) };
}

interface AllowedChunks {
  /** IDAT·IEND 를 뺀 허용 청크(PLTE·tRNS). 길이·형식·본문·CRC 를 그대로 복사한 조각이며 원래 순서를 지킨다. */
  readonly kept: Buffer[];
  /** 합친 IDAT 를 kept 의 몇 번째 앞에 놓을지(첫 IDAT 가 나온 시점의 kept 길이). 원래 청크 순서를 지키려는 것이다. */
  readonly idatAt: number;
  /** 모든 IDAT 본문을 순서대로 이어 붙인 압축 데이터. */
  readonly idat: Buffer;
}

/**
 * IHDR 뒤의 청크를 훑어 허용 청크(PLTE·tRNS·IDAT·IEND)만 모은다. 두 번째 IHDR, 애니메이션 청크, 중복되거나 비정상
 * 크기의 PLTE·tRNS, 잘린 청크, IEND 없음, IDAT 없음이면 null — 호출부가 변환하지 않고 원본을 그대로 중계한다.
 * IDAT 는 개수와 상관없이 하나의 압축 데이터로 합친다(디코더가 IDAT 마다 inflate 를 따로 시작하는 비용을 없앤다).
 */
function collectAllowedChunks(body: Buffer): AllowedChunks | null {
  const kept: Buffer[] = [];
  // IDAT 본문의 [시작, 끝) 위치. 청크가 수십만 개여도 Buffer 조각을 만들지 않고 숫자만 쌓는다.
  const idatRanges: number[] = [];
  let idatAt = -1;
  let idatLength = 0;
  let sawPalette = false;
  let sawTransparency = false;
  let ended = false;
  let offset = PNG_IHDR_END;
  while (!ended && offset + 12 <= body.length) {
    const length = body.readUInt32BE(offset);
    const dataStart = offset + 8;
    if (length > body.length - dataStart - 4) return null; // 잘린 청크
    const type = body.toString("latin1", offset + 4, dataStart);
    const chunkEnd = dataStart + length + 4;
    if (type === "IHDR" || PNG_ANIMATION_CHUNKS.has(type)) return null;
    if (type === "IDAT") {
      if (idatAt < 0) idatAt = kept.length;
      if (length > 0) {
        idatRanges.push(dataStart, dataStart + length);
        idatLength += length;
      }
    } else if (type === "PLTE") {
      if (sawPalette || length === 0 || length % 3 !== 0 || length > PNG_MAX_PALETTE_BYTES) return null;
      sawPalette = true;
      kept.push(body.subarray(offset, chunkEnd));
    } else if (type === "tRNS") {
      if (sawTransparency || length > PNG_MAX_TRANSPARENCY_BYTES) return null;
      sawTransparency = true;
      kept.push(body.subarray(offset, chunkEnd));
    } else if (type === "IEND") {
      if (length !== 0) return null;
      ended = true;
    } // 그 밖의 청크(iCCP·tEXt·zTXt·iTXt·gAMA·pHYs·알 수 없는 청크 등)는 버린다.
    offset = chunkEnd;
  }
  if (!ended || idatAt < 0 || idatLength === 0) return null;
  const idat = Buffer.allocUnsafe(idatLength);
  let written = 0;
  for (let index = 0; index < idatRanges.length; index += 2) {
    const start = idatRanges[index] as number;
    const end = idatRanges[index + 1] as number;
    body.copy(idat, written, start, end);
    written += end - start;
  }
  return { kept, idatAt, idat };
}

/** 본문이 payload 인 IDAT 청크 하나를 새로 만든다(CRC 는 형식 + 본문으로 계산하므로 항상 유효하다). */
function buildIdatChunk(payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length, 0);
  header.write("IDAT", 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(payload, crc32(header.subarray(4, 8))), 0);
  return Buffer.concat([header, payload, crc]);
}

/** 길이 0 인 IEND 청크(CRC 는 고정값 AE426082). */
const PNG_IEND_CHUNK = Buffer.from("0000000049454e44ae426082", "hex");

/**
 * PNG 의 압축 데이터(IDAT)가 선언한 크기 이상으로 풀리지 않는지 확인한다. 헤더의 선언 크기(1x1)와 달리 IDAT 가
 * 수백 MB 로 팽창하는 파일(261KB → 256MB)은 화소 수 상한을 통과한 채 디코더의 무제한 inflate 로 메모리를
 * 쓸어 갔다. 상한을 선언 크기로 묶은 inflate 로 먼저 시험해, 넘으면 디코드하지 않는다.
 */
function inflatesWithin(compressed: Buffer, maxRawBytes: number): boolean {
  try {
    inflateSync(compressed, { maxOutputLength: maxRawBytes });
    return true;
  } catch {
    // 상한 초과(ERR_BUFFER_TOO_LARGE)와 손상된 스트림 모두 변환하지 않는다.
    return false;
  }
}

/**
 * 표지 PNG 를 디코드해도 되는지 확인하고, 디코더에 넘길 재조립 PNG 를 돌려준다. 화소 수·압축 해제 크기 상한을
 * 넘거나 구조가 안전하지 않으면 null.
 */
export function guardPng(body: Buffer): GuardedPng | null {
  const header = readPngHeader(body);
  if (header === null || header.width < 1 || header.height < 1) return null;
  if (header.width * header.height > COVER_MAX_DECODE_PIXELS || header.rawBytes > COVER_MAX_DECODE_RAW_BYTES) return null;
  const chunks = collectAllowedChunks(body);
  if (chunks === null || !inflatesWithin(chunks.idat, header.rawBytes)) return null;
  return {
    width: header.width,
    height: header.height,
    sanitized: Buffer.concat([
      PNG_SIGNATURE,
      body.subarray(8, PNG_IHDR_END),
      ...chunks.kept.slice(0, chunks.idatAt),
      buildIdatChunk(chunks.idat),
      ...chunks.kept.slice(chunks.idatAt),
      PNG_IEND_CHUNK,
    ]),
  };
}
