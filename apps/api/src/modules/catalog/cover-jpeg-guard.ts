import { COVER_JPEG_DECODE_MEMORY_MB, COVER_MAX_DECODE_PIXELS } from "./cover-decode-limits";

// 서버측 표지 변환의 JPEG 사전 검사와 디코드 한도.
//
// 이전에는 사전 검사만 믿고 image-js 의 decode 를 불렀다. image-js 는 jpeg-js 의 화소·메모리 한도를 모두 끄고
// (Infinity) 호출하므로 검사가 놓친 입력은 무엇이든 디코드됐다. 실측(힙 1GB): SOF 가 둘인 60바이트 파일(1x1 뒤
// 8000x8000)이 +1.8GB, FF00 으로 첫 검사기를 비껴간 파일이 +1.8GB, 4000x4000 선언에 8성분이 +1.2GB, 30000x30000
// 선언과 255성분은 힙 OOM 으로 프로세스가 죽었다. 그래서 두 겹으로 막는다.
// 1) 이 파일의 사전 검사: 프레임 헤더(SOF)가 정확히 하나인지, 크기가 상한 안인지, 성분이 1·3·4개인지 본다.
// 2) cover-transcode.ts 가 jpeg-js 를 직접 불러 한도를 건다(COVER_JPEG_DECODE_OPTIONS): jpeg-js 는 SOF 를 읽는
//    즉시 화소 수를 확인하고 블록을 할당하기 전에 누적 메모리 예산을 확인하므로, 사전 검사를 비껴간 입력도
//    예산 이상은 할당하지 못한다. 사전 검사는 디코더와 같은 파서가 아니라서 어긋날 수 있지만, 그 경우에도 한도가
//    디코더 안에서 걸린다.

export interface GuardedJpeg {
  readonly width: number;
  readonly height: number;
  readonly components: number;
}

/** jpeg-js 에 주는 디코드 옵션. 화소 수 상한은 사전 검사와 같은 값이고 나머지는 image-js 가 쓰는 설정과 같다. */
export const COVER_JPEG_DECODE_OPTIONS = {
  useTArray: true,
  maxResolutionInMP: COVER_MAX_DECODE_PIXELS / 1_000_000,
  maxMemoryUsageInMB: COVER_JPEG_DECODE_MEMORY_MB,
} as const;

/** jpeg-js 가 해석하는 프레임 헤더: SOF0(베이스라인)·SOF1(확장)·SOF2(프로그레시브). 나머지 SOFn 은 디코드할 수 없다. */
function isSupportedFrameMarker(marker: number): boolean {
  return marker === 0xc0 || marker === 0xc1 || marker === 0xc2;
}

/** 프레임 헤더(마커 FF Cn 의 offset 위치)에서 크기·성분 수를 읽는다. 읽을 수 없거나 상한 밖이면 null. */
function readFrameHeader(body: Buffer, offset: number): GuardedJpeg | null {
  if (offset + 10 > body.length) return null;
  const height = body.readUInt16BE(offset + 5);
  const width = body.readUInt16BE(offset + 7);
  const components = body[offset + 9];
  if (width < 1 || height < 1 || width * height > COVER_MAX_DECODE_PIXELS) return null;
  // jpeg-js 가 색 변환을 아는 성분 수는 1(회색)·3(YCbCr)·4(CMYK)다. 그 밖의 수는 디코드 없이 거절한다.
  if (components !== 1 && components !== 3 && components !== 4) return null;
  return { width, height, components };
}

/**
 * 디코드하지 않고 JPEG 마커를 따라가며 프레임 헤더(SOF)를 읽는다. 스캔(엔트로피 부호화) 데이터는 마커가 아닌 바이트로
 * 건너뛰므로 첫 스캔 뒤의 마커까지 본다. 프레임이 하나가 아니거나(jpeg-js 는 프레임이 여럿이어도 SOF 마다 메모리를
 * 먼저 할당한다), 크기가 상한을 넘거나, 성분 수를 디코더가 모르면 null.
 */
export function guardJpeg(body: Buffer): GuardedJpeg | null {
  if (body.length < 4 || body[0] !== 0xff || body[1] !== 0xd8) return null;
  let frame: GuardedJpeg | null = null;
  let offset = 2;
  while (offset + 2 <= body.length) {
    if (body[offset] !== 0xff) {
      offset += 1; // 마커가 아닌 바이트(스캔 데이터 등)
      continue;
    }
    const marker = body[offset + 1];
    if (marker === undefined) break;
    if (marker === 0xff) {
      offset += 1; // 마커 앞의 채움 바이트
      continue;
    }
    // 길이 필드가 없는 것: FF00(스터핑, jpeg-js 는 두 바이트를 무시한다), TEM, RSTn, SOI. EOI 는 끝이다.
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9) break;
    if (offset + 4 > body.length) break;
    const length = body.readUInt16BE(offset + 2);
    if (length < 2) return null;
    if (isSupportedFrameMarker(marker)) {
      if (frame !== null) return null; // 프레임이 둘 이상
      frame = readFrameHeader(body, offset);
      if (frame === null) return null;
    }
    offset += 2 + length;
  }
  return frame;
}
