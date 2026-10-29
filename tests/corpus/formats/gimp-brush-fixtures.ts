/**
 * 합성 GIMP 브러시·패턴·파이프·생성 브러시 빌더. 리더(`gimp-brush*.ts`, `gimp-generated-brush.ts`)를 import하지 않고
 * 바이트 배치만으로 만든다.
 *
 * 필드 순서와 상수는 GIMP 개발자 사이트의 공개 포맷 문서와 Kaitai Struct 커뮤니티 명세(CC0-1.0)에서 확인한 사실만
 * 쓴다(문구는 옮기지 않았다). 값은 big-endian이고 패턴 매직은 실제 파일에서 확인한 `GPAT`다. 리더와 같은 사람이 같은
 * 해석으로 쓴 빌더라서 공통 오독은 이 테스트로 잡지 못한다. 그 한계는 실제 GIMP 데이터 파일 76개와 독립 디코더 대조
 * (설계 문서 3절)로 보완했다.
 */

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function ascii(text: string): number[] {
  return Array.from(text, (ch) => ch.charCodeAt(0));
}

export interface FixtureBrush {
  readonly version?: number;
  readonly width: number;
  readonly height: number;
  /** 헤더의 bytes 값. 기본은 픽셀 길이에서 유추한다(회색 1, RGBA 4). */
  readonly bytes?: number;
  readonly spacing?: number;
  readonly name?: string;
  readonly rawName?: readonly number[];
  /** 이름 뒤에 널 종결자를 붙인다. 기본 true(실제 GIMP 파일이 그렇다). */
  readonly terminator?: boolean;
  readonly magic?: string;
  readonly pixels: readonly number[] | Uint8Array;
  /** 헤더 크기 필드를 실제와 다르게 쓴다(손상 주입). */
  readonly headerSizeOverride?: number;
  /** 픽셀 뒤에 붙는 바이트. */
  readonly trailing?: readonly number[];
}

export function buildGbr(brush: FixtureBrush): Uint8Array {
  const version = brush.version ?? 2;
  const name = brush.rawName ?? Array.from(new TextEncoder().encode(brush.name ?? "Brush"));
  const terminator = brush.terminator ?? true;
  const nameBytes = [...name, ...(terminator ? [0] : [])];
  const fixed = version === 1 ? 20 : 28;
  const headerSize = brush.headerSizeOverride ?? fixed + nameBytes.length;
  const bytesValue = brush.bytes ?? (brush.pixels.length === brush.width * brush.height * 4 ? 4 : 1);
  const head = [...u32(headerSize), ...u32(version), ...u32(brush.width), ...u32(brush.height), ...u32(bytesValue)];
  if (version !== 1) head.push(...ascii(brush.magic ?? "GIMP"), ...u32(brush.spacing ?? 25));
  return Uint8Array.from([...head, ...nameBytes, ...brush.pixels, ...(brush.trailing ?? [])]);
}

export interface FixturePattern {
  readonly version?: number;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly name?: string;
  readonly magic?: string;
  readonly pixels: readonly number[] | Uint8Array;
  readonly trailing?: readonly number[];
  readonly headerSizeOverride?: number;
}

export function buildPat(pattern: FixturePattern): Uint8Array {
  const nameBytes = [...new TextEncoder().encode(pattern.name ?? "Pattern"), 0];
  const headerSize = pattern.headerSizeOverride ?? 24 + nameBytes.length;
  return Uint8Array.from([
    ...u32(headerSize),
    ...u32(pattern.version ?? 1),
    ...u32(pattern.width),
    ...u32(pattern.height),
    ...u32(pattern.bytes),
    ...ascii(pattern.magic ?? "GPAT"),
    ...nameBytes,
    ...pattern.pixels,
    ...(pattern.trailing ?? []),
  ]);
}

/** 이름 줄, `개수 + 매개변수` 줄, 이어 붙인 브러시들. */
export function buildGih(options: {
  readonly name: string;
  readonly parameters: string;
  readonly count?: number;
  readonly brushes: readonly Uint8Array[];
  readonly lineEnding?: string;
  readonly trailing?: readonly number[];
}): Uint8Array {
  const eol = options.lineEnding ?? "\n";
  const text = `${options.name}${eol}${options.count ?? options.brushes.length} ${options.parameters}${eol}`;
  return Uint8Array.from([...new TextEncoder().encode(text), ...options.brushes.flatMap((brush) => Array.from(brush)), ...(options.trailing ?? [])]);
}

export function buildVbr(lines: readonly string[], lineEnding = "\n"): Uint8Array {
  return new TextEncoder().encode(lines.join(lineEnding) + lineEnding);
}

/** 가로 우선 회색 그라디언트(값이 서로 달라 위치 오류가 드러난다). */
export function grayPixels(width: number, height: number, seed = 1): Uint8Array {
  return Uint8Array.from({ length: width * height }, (_, index) => (index * 37 + seed * 11) & 0xff);
}

export function rgbaPixels(width: number, height: number, seed = 1): Uint8Array {
  return Uint8Array.from({ length: width * height * 4 }, (_, index) => (index * 29 + seed * 7) & 0xff);
}
