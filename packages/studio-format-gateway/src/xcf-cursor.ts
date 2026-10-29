/**
 * @file xcf-cursor.ts
 * @description GIMP XCF 바이너리 커서와 오류 클래스. 모든 읽기를 경계 검사하고, 값은 전부 big-endian으로 읽는다.
 *
 * 근거는 공개 포맷 명세(https://developer.gimp.org/core/standards/xcf/)의 기본 자료형 절이다(GPL-2.0-or-later라
 * 문구는 복사하지 않았고 GIMP 소스는 읽지 않았다, ADR-0008 §4): WORD는 4바이트 big-endian, FLOAT는 IEEE 754
 * 단정밀 big-endian, STRING은 길이(널 포함)와 UTF-8 바이트이며 빈 문자열은 길이 0 하나로만 저장된다. 포인터는
 * XCF 10 이하에서 4바이트, 11 이상에서 8바이트이고 파일 처음부터의 절대 오프셋이다.
 */

export type XcfErrorCode =
  | "aborted"
  | "source-invalid"
  | "source-too-large"
  | "magic-invalid"
  | "version-unsupported"
  | "precision-unsupported"
  | "structure-invalid"
  | "limit-exceeded";

export class XcfError extends Error {
  constructor(
    message: string,
    readonly code: XcfErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "XcfError";
  }
}

const UTF8_DECODER = new TextDecoder("utf-8");

export class XcfCursor {
  private readonly view: DataView;

  position: number;

  constructor(
    readonly bytes: Uint8Array,
    /** 4(XCF 10 이하) 또는 8(XCF 11 이상). 헤더에서 버전을 읽기 전에는 4다. */
    public pointerBytes: 4 | 8,
    position = 0,
  ) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.position = position;
  }

  get remaining(): number {
    return this.bytes.byteLength - this.position;
  }

  private need(count: number, what: string): void {
    if (count < 0 || this.position + count > this.bytes.byteLength) {
      throw new XcfError(`${what}을(를) 읽을 바이트가 부족하다 (오프셋 ${this.position})`, "structure-invalid");
    }
  }

  u32(): number {
    this.need(4, "WORD");
    const value = this.view.getUint32(this.position, false);
    this.position += 4;
    return value;
  }

  i32(): number {
    this.need(4, "INT32");
    const value = this.view.getInt32(this.position, false);
    this.position += 4;
    return value;
  }

  f32(): number {
    this.need(4, "FLOAT");
    const value = this.view.getFloat32(this.position, false);
    this.position += 4;
    return value;
  }

  /** 포인터를 읽는다. 8바이트 값이 안전 정수를 넘으면 손상으로 본다. */
  pointer(): number {
    this.need(this.pointerBytes, "POINTER");
    if (this.pointerBytes === 4) {
      const value = this.view.getUint32(this.position, false);
      this.position += 4;
      return value;
    }
    const value = this.view.getBigUint64(this.position, false);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new XcfError("포인터가 안전 정수 범위를 넘는다", "structure-invalid");
    }
    this.position += 8;
    return Number(value);
  }

  skip(count: number): void {
    this.need(count, "건너뛸 영역");
    this.position += count;
  }

  /** 지정한 구간을 복사 없이 돌려준다. */
  slice(count: number): Uint8Array {
    this.need(count, "구간");
    const part = this.bytes.subarray(this.position, this.position + count);
    this.position += count;
    return part;
  }

  /**
   * STRING을 읽는다. 길이(널 포함)가 0이면 빈 문자열이고, 아니면 UTF-8 바이트 뒤에 널 1바이트가 온다.
   * 길이가 `maxBytes`를 넘으면 한도 초과다.
   */
  string(maxBytes: number): string {
    const withTerminator = this.u32();
    if (withTerminator === 0) return "";
    if (withTerminator > maxBytes) {
      throw new XcfError(`문자열 길이 ${withTerminator}가 한도 ${maxBytes}를 넘는다`, "limit-exceeded");
    }
    this.need(withTerminator, "STRING");
    const text = UTF8_DECODER.decode(this.bytes.subarray(this.position, this.position + withTerminator - 1));
    this.position += withTerminator;
    return text;
  }

  /** 0으로 끝나는 포인터 배열을 읽는다. 항목 수가 `maxCount`를 넘으면 한도 초과다. */
  pointerList(maxCount: number): number[] {
    const pointers: number[] = [];
    for (;;) {
      const value = this.pointer();
      if (value === 0) return pointers;
      if (pointers.length >= maxCount) {
        throw new XcfError(`포인터 배열이 한도 ${maxCount}를 넘는다`, "limit-exceeded");
      }
      pointers.push(value);
    }
  }
}
