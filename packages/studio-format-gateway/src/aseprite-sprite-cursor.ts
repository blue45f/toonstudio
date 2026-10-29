/**
 * @file aseprite-sprite-cursor.ts
 * @description Aseprite 스프라이트 파일(`.aseprite`/`.ase`) 바이너리 커서, 오류 클래스, 한도.
 *
 * 필드 크기와 상수는 Aseprite가 공개한 파일 포맷 문서(`docs/ase-file-specs.md`, 고정 커밋 24086ec0)에서 확인한
 * 사실만 자체 표현으로 옮겼다. 그 문서에는 라이선스 표기가 없고 저장소의 소스·바이너리는 별도 EULA 아래에 있다.
 * 그래서 문서의 문구·표를 복사하지 않았고 Aseprite 소스는 읽지 않았다. 문서 자체의 이용 조건은 확인하지
 * 못했으며(소유자·법무 확인 필요) 이 구현은 법적 결론이 아니다. 값은 전부 little-endian이다.
 */

export type AsepriteSpriteErrorCode =
  | "aborted"
  | "source-invalid"
  | "source-too-large"
  | "signature-invalid"
  | "header-invalid"
  | "limit-exceeded";

/** 파일 전체를 해석할 수 없을 때 던지는 오류. 청크 하나의 문제는 던지지 않고 진단으로 보고한다. */
export class AsepriteSpriteError extends Error {
  constructor(
    message: string,
    readonly code: AsepriteSpriteErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AsepriteSpriteError";
  }
}

/** 청크 안에서 경계를 넘어 읽으려 했거나 값이 맞지 않을 때. 가져오기 루프가 잡아 진단으로 바꾼다. */
export class AsepriteChunkReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AsepriteChunkReadError";
  }
}

export interface AsepriteSpriteLimits {
  /** 입력 파일 최대 바이트. */
  readonly maxFileBytes: number;
  /** 캔버스 한 변의 최대 픽셀 수(파일 형식 상한은 65,535). */
  readonly maxCanvasDimension: number;
  readonly maxFrames: number;
  readonly maxLayers: number;
  readonly maxCels: number;
  /** 한 프레임이 선언할 수 있는 청크 수. */
  readonly maxChunksPerFrame: number;
  /** 셀·타일셋 하나의 디코드 결과 최대 바이트. */
  readonly maxCelDecodedBytes: number;
  /** 모든 셀·타일셋의 디코드 결과 합계 최대 바이트. 넘으면 이후 항목의 픽셀은 디코드하지 않는다. */
  readonly maxTotalDecodedBytes: number;
  /** 사용자 속성의 중첩 깊이(문서가 정한 값은 128). */
  readonly maxUserDataDepth: number;
  /** 사용자 속성(맵·속성·벡터 원소) 총 개수. */
  readonly maxUserDataValues: number;
  readonly maxTags: number;
  readonly maxSlices: number;
  readonly maxPaletteEntries: number;
  readonly maxTilesetTiles: number;
}

export const ASEPRITE_SPRITE_LIMITS: AsepriteSpriteLimits = Object.freeze({
  maxFileBytes: 128_000_000,
  maxCanvasDimension: 32_768,
  maxFrames: 10_000,
  maxLayers: 4_096,
  maxCels: 200_000,
  maxChunksPerFrame: 65_536,
  maxCelDecodedBytes: 256_000_000,
  maxTotalDecodedBytes: 512_000_000,
  maxUserDataDepth: 128,
  maxUserDataValues: 100_000,
  maxTags: 65_535,
  maxSlices: 65_535,
  maxPaletteEntries: 1_048_576,
  maxTilesetTiles: 1_048_576,
});

const STRICT_UTF8 = new TextDecoder("utf-8", { fatal: true });
const LENIENT_UTF8 = new TextDecoder("utf-8");

export interface AsepriteDecodedString {
  readonly value: string;
  /** UTF-8로 해석되지 않는 바이트가 있어 대체 문자로 바꿨다. */
  readonly invalidUtf8: boolean;
}

/** 지정한 범위 안에서만 읽는 커서. 범위를 넘으면 `AsepriteChunkReadError`를 던진다. */
export class AsepriteCursor {
  private readonly view: DataView;

  position: number;

  constructor(
    readonly bytes: Uint8Array,
    start = 0,
    readonly end = bytes.byteLength,
  ) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.position = start;
  }

  get remaining(): number {
    return this.end - this.position;
  }

  private need(count: number, what: string): void {
    if (count < 0 || this.position + count > this.end) {
      throw new AsepriteChunkReadError(`${what}을(를) 읽을 바이트가 부족하다 (오프셋 ${this.position})`);
    }
  }

  u8(): number {
    this.need(1, "BYTE");
    return this.view.getUint8(this.position++);
  }

  u16(): number {
    this.need(2, "WORD");
    const v = this.view.getUint16(this.position, true);
    this.position += 2;
    return v;
  }

  i16(): number {
    this.need(2, "SHORT");
    const v = this.view.getInt16(this.position, true);
    this.position += 2;
    return v;
  }

  u32(): number {
    this.need(4, "DWORD");
    const v = this.view.getUint32(this.position, true);
    this.position += 4;
    return v;
  }

  i32(): number {
    this.need(4, "LONG");
    const v = this.view.getInt32(this.position, true);
    this.position += 4;
    return v;
  }

  /** 16.16 고정소수점. */
  fixed(): number {
    return this.i32() / 65536;
  }

  f32(): number {
    this.need(4, "FLOAT");
    const v = this.view.getFloat32(this.position, true);
    this.position += 4;
    return v;
  }

  f64(): number {
    this.need(8, "DOUBLE");
    const v = this.view.getFloat64(this.position, true);
    this.position += 8;
    return v;
  }

  /** 부호 없는 64비트 정수를 10진 문자열로 읽는다(JSON으로 직렬화할 수 있게 BigInt를 노출하지 않는다). */
  u64Decimal(): string {
    this.need(8, "QWORD");
    const v = this.view.getBigUint64(this.position, true);
    this.position += 8;
    return v.toString();
  }

  i64Decimal(): string {
    this.need(8, "LONG64");
    const v = this.view.getBigInt64(this.position, true);
    this.position += 8;
    return v.toString();
  }

  skip(count: number): void {
    this.need(count, "예약 영역");
    this.position += count;
  }

  /** 복사 없이 같은 버퍼를 가리키는 부분 배열. */
  take(count: number, what = "바이트열"): Uint8Array {
    this.need(count, what);
    const slice = this.bytes.subarray(this.position, this.position + count);
    this.position += count;
    return slice;
  }

  /** WORD 길이 + UTF-8 바이트. 널 종결자는 없다. */
  string(): AsepriteDecodedString {
    const length = this.u16();
    const raw = this.take(length, "STRING");
    try {
      return { value: STRICT_UTF8.decode(raw), invalidUtf8: false };
    } catch {
      return { value: LENIENT_UTF8.decode(raw), invalidUtf8: true };
    }
  }
}
