/**
 * PSD 라운드트립 회귀 코퍼스 — 픽스처 생성기와 결정적 픽셀 표면.
 *
 * 목적: PSD 가져오기(studio-psd-import) → 편집 없이 재내보내기(studio-psd-export) →
 * 다시 가져오기의 충실도를 축별로 고정한다. 픽스처 바이너리는 커밋하지 않는다 —
 * 이 모듈의 명세(buildFixturePsd)가 정본이고, 테스트가 실행 때마다 ag-psd writePsd로
 * 바이트를 재생성한다(수동 바이너리 관리 금지, 생성 절차가 곧 코드).
 *
 * 표면 대체 범위(정직성): Node 테스트 환경에는 실제 Canvas 2D가 없으므로
 *  - ag-psd의 initializeCanvas에는 아래 PsdPixelCanvas(순수 픽셀 버퍼 + 무손실 PNG 코덱)를 주입한다.
 *  - 마스크 래스터화는 제품 순수 함수(planPsdLayerMaskRaster·convertPsdMaskPixelsToStudioAlpha)를
 *    그대로 쓰고 DOM 그리기 표면만 PsdPixelCanvas로 대체한다(rasterizePsdMasksForCorpus).
 *  - Konva Stage는 export 테스트들과 같은 방식으로 노드별 픽셀 캔버스를 돌려주는 가짜를 쓴다.
 * 픽셀 수학·파서·직렬화·손실 명세는 전부 제품 코드를 그대로 통과한다.
 *
 * 코퍼스 자체의 제외 축: 스마트 오브젝트는 ag-psd 직렬화에 완전한 배치 레이어 기술자
 * (변환·링크 파일 등)가 필요해 합성 픽스처로 재현할 수 없다. 실제 에디터 샘플이 생기면
 * 그때 바이너리 픽스처로 추가한다(그 전까지는 studio-psd-import.test.ts의 수제 Layer
 * 픽스처가 스마트 오브젝트 고지 문구를 담당한다). 벡터 마스크도 같은 이유로 제외한다
 * (studio-psd-mask-import.test.ts가 경로 변환을 담당).
 */

import {
  initializeCanvas,
  writePsd,
  type Layer,
  type PixelData,
  type Psd,
} from "ag-psd";

import {
  convertPsdMaskPixelsToStudioAlpha,
  planPsdLayerMaskRaster,
  type PsdLayerMaskRasterInput,
  type PsdLayerMaskRasterResult,
  type PsdLayerMaskSource,
} from "../studio-psd-mask-import";

// ── 무손실 PNG 코덱 (순수 TS) ────────────────────────────────────────────────
// zlib 저장은 압축 없는 저장 블록(RFC 1951 BTYPE=00)으로 결정적으로 인코딩한다.
// 디코더는 이 인코더가 만든 PNG만 읽으므로 저장 블록 inflate + 필터 해제만 구현한다.

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i += 1) {
    a = (a + data[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** zlib(RFC 1950) + DEFLATE 저장 블록으로 감싼다 — 결정적·무압축. */
export function deflateStoredZlibForCorpus(data: Uint8Array): Uint8Array {
  const blockCount = Math.max(1, Math.ceil(data.length / 65535));
  const out = new Uint8Array(2 + data.length + blockCount * 5 + 4);
  let cursor = 0;
  out[cursor++] = 0x78;
  out[cursor++] = 0x01;
  let read = 0;
  for (let block = 0; block < blockCount; block += 1) {
    const len = Math.min(65535, data.length - read);
    out[cursor++] = block === blockCount - 1 ? 0x01 : 0x00;
    out[cursor++] = len & 0xff;
    out[cursor++] = (len >> 8) & 0xff;
    const nlen = ~len & 0xffff;
    out[cursor++] = nlen & 0xff;
    out[cursor++] = (nlen >> 8) & 0xff;
    out.set(data.subarray(read, read + len), cursor);
    cursor += len;
    read += len;
  }
  const checksum = adler32(data);
  out[cursor++] = (checksum >>> 24) & 0xff;
  out[cursor++] = (checksum >>> 16) & 0xff;
  out[cursor++] = (checksum >>> 8) & 0xff;
  out[cursor] = checksum & 0xff;
  return out;
}

function inflateStoredZlib(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 2 || bytes[0] !== 0x78) throw new Error("코퍼스 PNG: zlib 헤더가 올바르지 않아요.");
  let cursor = 2;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const header = bytes[cursor++];
    if (header === undefined) throw new Error("코퍼스 PNG: DEFLATE 블록이 중간에 끊겼어요.");
    const isFinal = (header & 1) === 1;
    const type = (header >> 1) & 3;
    if (type !== 0) throw new Error("코퍼스 PNG: 저장 블록이 아닌 DEFLATE 블록은 읽지 않아요.");
    const len = bytes[cursor]! | (bytes[cursor + 1]! << 8);
    cursor += 4; // LEN(2) + NLEN(2)
    chunks.push(bytes.subarray(cursor, cursor + len));
    cursor += len;
    if (isFinal) break;
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)), false);
  return out;
}

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** RGBA 픽셀 → PNG 바이트 (행 필터 0 고정, 결정적). */
export function encodePngRgba(width: number, height: number, data: Uint8ClampedArray): Uint8Array {
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const scanlines = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    scanlines[y * (width * 4 + 1)] = 0;
    scanlines.set(data.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const idat = deflateStoredZlibForCorpus(scanlines);
  const parts = [PNG_SIGNATURE, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function encodePngDataUrl(width: number, height: number, data: Uint8ClampedArray): string {
  return `data:image/png;base64,${bytesToBase64(encodePngRgba(width, height, data))}`;
}

/** encodePngDataUrl이 만든 data URL만 해독하는 검증용 디코더 (필터 0~4 해제 포함). */
export function decodePngDataUrl(dataUrl: string): PixelData {
  const prefix = "data:image/png;base64,";
  if (!dataUrl.startsWith(prefix)) throw new Error("코퍼스 PNG: data URL 형식이 아니에요.");
  const bytes = base64ToBytes(dataUrl.slice(prefix.length));
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    throw new Error("코퍼스 PNG: 서명이 올바르지 않아요.");
  }
  let width = 0;
  let height = 0;
  const idatParts: Uint8Array[] = [];
  let cursor = PNG_SIGNATURE.length;
  while (cursor < bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + cursor, 8);
    const length = view.getUint32(0, false);
    const type = String.fromCharCode(...bytes.subarray(cursor + 4, cursor + 8));
    const data = bytes.subarray(cursor + 8, cursor + 8 + length);
    if (type === "IHDR") {
      const ihdr = new DataView(bytes.buffer, bytes.byteOffset + cursor + 8, 13);
      width = ihdr.getUint32(0, false);
      height = ihdr.getUint32(4, false);
      if (data[8] !== 8 || data[9] !== 6) throw new Error("코퍼스 PNG: 8-bit RGBA만 읽어요.");
    } else if (type === "IDAT") {
      idatParts.push(data);
    }
    cursor += 12 + length;
  }
  const compressed = new Uint8Array(idatParts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of idatParts) {
    compressed.set(part, offset);
    offset += part.length;
  }
  const scanlines = inflateStoredZlib(compressed);
  const stride = width * 4;
  const out = new Uint8ClampedArray(stride * height);
  let previousRow: Uint8Array | null = null;
  for (let y = 0; y < height; y += 1) {
    const filter = scanlines[y * (stride + 1)]!;
    const row = scanlines.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const decoded = new Uint8Array(stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? decoded[x - 4]! : 0;
      const up = previousRow ? previousRow[x]! : 0;
      const upLeft = previousRow && x >= 4 ? previousRow[x - 4]! : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      } else if (filter !== 0) {
        throw new Error(`코퍼스 PNG: 알 수 없는 행 필터 ${filter}예요.`);
      }
      decoded[x] = (row[x]! + predictor) & 0xff;
    }
    out.set(decoded, y * stride);
    previousRow = decoded;
  }
  return { width, height, data: out };
}

// ── 결정적 픽셀 캔버스 ───────────────────────────────────────────────────────

interface PixelContextLike {
  globalCompositeOperation: string;
  fillStyle: string;
  createImageData: (width: number, height: number) => PixelData;
  getImageData: (x: number, y: number, width: number, height: number) => PixelData;
  putImageData: (imageData: PixelData, dx: number, dy: number) => void;
  drawImage: (source: PsdPixelCanvas, dx: number, dy: number) => void;
  clearRect: () => void;
  fillRect: () => void;
}

/**
 * Canvas 2D의 픽셀 저장·읽기·PNG 인코딩만 결정적으로 재현하는 표면.
 * 그리기 연산(도형·블러 등)은 재현하지 않는다 — 코퍼스 픽스처는 완성 픽셀만 다룬다.
 */
interface PixelCanvasState {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export class PsdPixelCanvas {
  private readonly state: PixelCanvasState;
  private readonly context: PixelContextLike;

  constructor(width = 300, height = 150) {
    const state: PixelCanvasState = {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
      pixels: new Uint8ClampedArray(0),
    };
    state.pixels = new Uint8ClampedArray(state.width * state.height * 4);
    this.state = state;
    this.context = {
      globalCompositeOperation: "source-over",
      fillStyle: "#000000",
      createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      getImageData: (x, y, w, h) => {
        const out = new Uint8ClampedArray(w * h * 4);
        for (let row = 0; row < h; row += 1) {
          const src = ((y + row) * state.width + x) * 4;
          out.set(state.pixels.subarray(src, src + w * 4), row * w * 4);
        }
        return { width: w, height: h, data: out };
      },
      putImageData: (imageData, dx, dy) => {
        for (let row = 0; row < imageData.height; row += 1) {
          const dst = ((dy + row) * state.width + dx) * 4;
          state.pixels.set(
            imageData.data.subarray(row * imageData.width * 4, (row + 1) * imageData.width * 4),
            dst,
          );
        }
      },
      drawImage: (source, dx, dy) => {
        for (let row = 0; row < source.height; row += 1) {
          const dst = ((dy + row) * state.width + dx) * 4;
          state.pixels.set(
            source.pixels.subarray(row * source.width * 4, (row + 1) * source.width * 4),
            dst,
          );
        }
      },
      clearRect: () => undefined,
      fillRect: () => undefined,
    };
  }

  get pixels(): Uint8ClampedArray {
    return this.state.pixels;
  }

  set pixels(value: Uint8ClampedArray) {
    this.state.pixels = value;
  }

  get width(): number {
    return this.state.width;
  }

  set width(value: number) {
    this.state.width = Math.max(1, Math.round(value));
    this.state.pixels = new Uint8ClampedArray(this.state.width * this.state.height * 4);
  }

  get height(): number {
    return this.state.height;
  }

  set height(value: number) {
    this.state.height = Math.max(1, Math.round(value));
    this.state.pixels = new Uint8ClampedArray(this.state.width * this.state.height * 4);
  }

  getContext(kind: string): PixelContextLike | null {
    return kind === "2d" ? this.context : null;
  }

  toDataURL(type = "image/png"): string {
    if (type !== "image/png") throw new Error("코퍼스 캔버스는 PNG만 인코딩해요.");
    return encodePngDataUrl(this.state.width, this.state.height, this.state.pixels);
  }

  /** 검증용 — 현재 픽셀을 PixelData로 복사해 돌려준다. */
  snapshot(): PixelData {
    return { width: this.state.width, height: this.state.height, data: new Uint8ClampedArray(this.state.pixels) };
  }
}

let canvasInstalled = false;

/** ag-psd가 Node에서도 실제 디코딩을 하게 픽셀 표면을 1회만 설치한다. */
export function installPsdRoundtripCanvas(): void {
  if (canvasInstalled) return;
  canvasInstalled = true;
  initializeCanvas(
    ((width: number, height: number) => new PsdPixelCanvas(width, height)) as never,
    ((width: number, height: number) => ({
      width,
      height,
      colorSpace: "srgb",
      data: new Uint8ClampedArray(width * height * 4),
    })) as never,
  );
}

// ── 마스크 래스터화 (제품 순수 함수 + 픽셀 표면) ────────────────────────────

/**
 * rasterizePsdLayerMasks의 DOM 표면만 PsdPixelCanvas로 바꾼 코퍼스용 구현.
 * 채널 선택 규칙·기하 계획·밀도·알파 변환은 제품 함수와 동일 규칙을 따르고,
 * 최종 합성은 DOM 경로의 destination-in(알파 곱연산)과 등가로 계산한다.
 * 페더는 픽셀 표면에서 근사하지 않으므로 픽스처는 페더 0만 사용한다.
 */
export function rasterizePsdMasksForCorpus(
  input: PsdLayerMaskRasterInput,
): PsdLayerMaskRasterResult {
  const warnings: string[] = [];
  if (input.masks.length === 0) return { warnings };

  const realMask = input.masks.find(({ kind }) => kind === "real");
  let selected: readonly PsdLayerMaskSource[];
  let disabled: boolean;
  if (realMask) {
    selected = [realMask];
    disabled = !!realMask.mask.disabled;
  } else {
    const enabled = input.masks.filter(({ mask }) => !mask.disabled);
    selected = enabled.length > 0 ? enabled : input.masks;
    disabled = enabled.length === 0;
    if (enabled.length > 0 && enabled.length !== input.masks.length) {
      warnings.push("비활성 마스크 채널은 적용하지 않고 활성 채널만 가져왔어요.");
    }
  }

  let combined: { width: number; height: number; alpha: Float64Array } | null = null;
  let rasterizedCount = 0;
  for (const source of selected) {
    const plan = planPsdLayerMaskRaster({ ...input, mask: source.mask, parameterMask: source.parameterMask });
    // 제품 readMaskPixels와 같은 순서 — imageData 우선, 없으면 캔버스에서 읽는다.
    const maskPixels = source.mask.imageData
      ?? (source.mask.canvas
        ? source.mask.canvas.getContext("2d")?.getImageData(
            0,
            0,
            source.mask.canvas.width,
            source.mask.canvas.height,
          ) ?? undefined
        : undefined);
    if (!plan || !maskPixels) continue;
    const converted = convertPsdMaskPixelsToStudioAlpha(
      maskPixels.data,
      maskPixels.width,
      maskPixels.height,
      plan.density,
    );
    if (!converted) continue;
    if (plan.featherPx > 0) {
      warnings.push("코퍼스 픽셀 표면에서는 마스크 페더를 근사하지 않아요.");
    }
    if (!combined) {
      combined = {
        width: plan.outputWidth,
        height: plan.outputHeight,
        alpha: new Float64Array(plan.outputWidth * plan.outputHeight).fill(plan.defaultAlpha),
      };
    }
    // 대상 영역 안에서는 변환 알파로 교체(첫 채널), 이후 채널은 곱연산으로 합성한다.
    for (let y = 0; y < plan.destinationHeight; y += 1) {
      for (let x = 0; x < plan.destinationWidth; x += 1) {
        const srcX = Math.min(
          plan.maskPixelWidth - 1,
          Math.floor((x / plan.destinationWidth) * plan.maskPixelWidth),
        );
        const srcY = Math.min(
          plan.maskPixelHeight - 1,
          Math.floor((y / plan.destinationHeight) * plan.maskPixelHeight),
        );
        const sample = converted[(srcY * plan.maskPixelWidth + srcX) * 4 + 3]!;
        const dstIndex = (plan.destinationTop + y) * combined.width + (plan.destinationLeft + x);
        combined.alpha[dstIndex] = rasterizedCount === 0
          ? sample
          : (combined.alpha[dstIndex]! * sample) / 255;
      }
    }
    rasterizedCount += 1;
  }

  if (!combined || rasterizedCount === 0) {
    warnings.push("마스크 픽셀 데이터가 없거나 손상되어 원본 레이어를 가리지 않고 가져왔어요.");
    return { warnings };
  }
  if (rasterizedCount !== selected.length) {
    warnings.push("손상된 마스크 채널은 제외하고 읽을 수 있는 채널만 가져왔어요.");
  }

  const rgba = new Uint8ClampedArray(combined.width * combined.height * 4);
  for (let i = 0; i < combined.alpha.length; i += 1) {
    rgba[i * 4] = 255;
    rgba[i * 4 + 1] = 255;
    rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = Math.round(combined.alpha[i]!);
  }
  const canvas = new PsdPixelCanvas(combined.width, combined.height);
  canvas.pixels.set(rgba);
  return { maskSrc: canvas.toDataURL("image/png"), disabled, warnings };
}

// ── 픽셀 생성 헬퍼 ───────────────────────────────────────────────────────────

/** 단색 픽셀. */
export function solidPixels(width: number, height: number, rgba: readonly [number, number, number, number]): PixelData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgba[0];
    data[i + 1] = rgba[1];
    data[i + 2] = rgba[2];
    data[i + 3] = rgba[3];
  }
  return { width, height, data };
}

/**
 * 좌표를 색으로 인코딩한 픽셀 — 뒤집힘·이동·잘림이 생기면 동등 비교가 즉시 깨진다.
 * (x, y) → [x*36, y*36, (x+y)*18, alpha] (8px 이하 축에서 채널이 겹치지 않는다).
 */
export function coordPixels(width: number, height: number, alpha = 255): PixelData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = (x * 36) % 256;
      data[i + 1] = (y * 36) % 256;
      data[i + 2] = ((x + y) * 18) % 256;
      data[i + 3] = alpha;
    }
  }
  return { width, height, data };
}

/** 가로 그라데이션 마스크 샘플 — ag-psd 마스크 규약(RGB 회색조, 알파 255). */
export function gradientMaskPixels(width: number, height: number): PixelData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = width <= 1 ? 255 : Math.round((x / (width - 1)) * 255);
      const i = (y * width + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

// ── 픽스처 명세 ──────────────────────────────────────────────────────────────

export interface PsdRoundtripFixture {
  readonly id: string;
  /** 이 픽스처가 고정하는 축 (보고·문서용). */
  readonly axis: string;
  readonly width: number;
  readonly height: number;
  readonly build: () => Psd;
}

function leafLayer(partial: Partial<Layer> & { name: string }): Layer {
  return { left: 0, top: 0, ...partial };
}

export const PSD_ROUNDTRIP_FIXTURES: readonly PsdRoundtripFixture[] = [
  {
    id: "flat-basic",
    axis: "평면 레이어 — 이름·순서·경계·픽셀",
    width: 16,
    height: 12,
    build: () => ({
      width: 16,
      height: 12,
      // ag-psd children[0] = 포토샵 패널 맨 위.
      children: [
        leafLayer({ name: "전경 점", left: 10, top: 1, right: 14, bottom: 5, imageData: coordPixels(4, 4) }),
        leafLayer({ name: "중간 도형", left: 4, top: 3, right: 12, bottom: 9, imageData: solidPixels(8, 6, [200, 30, 30, 255]) }),
        leafLayer({ name: "배경판", left: 0, top: 0, right: 16, bottom: 12, imageData: coordPixels(16, 12) }),
      ],
    }),
  },
  {
    id: "blend-opacity",
    axis: "블렌드 모드·불투명도·숨김·반투명 알파",
    width: 8,
    height: 8,
    build: () => ({
      width: 8,
      height: 8,
      children: [
        leafLayer({ name: "곱하기", right: 8, bottom: 8, imageData: coordPixels(8, 8), blendMode: "multiply", opacity: 0.5 }),
        leafLayer({ name: "스크린", right: 8, bottom: 8, imageData: solidPixels(8, 8, [20, 40, 60, 255]), blendMode: "screen", opacity: 0.75 }),
        leafLayer({ name: "디졸브", right: 8, bottom: 8, imageData: solidPixels(8, 8, [70, 80, 90, 255]), blendMode: "dissolve" }),
        leafLayer({ name: "반투명", right: 8, bottom: 8, imageData: coordPixels(8, 8, 128) }),
        leafLayer({ name: "숨김 베이스", right: 8, bottom: 8, imageData: solidPixels(8, 8, [9, 9, 9, 255]), hidden: true }),
      ],
    }),
  },
  {
    id: "clipping",
    axis: "아래 레이어로 클리핑",
    width: 8,
    height: 8,
    build: () => ({
      width: 8,
      height: 8,
      children: [
        leafLayer({ name: "잘릴 레이어", right: 8, bottom: 8, imageData: coordPixels(8, 8), clipping: true }),
        leafLayer({ name: "기준 레이어", right: 8, bottom: 8, imageData: solidPixels(8, 8, [100, 110, 120, 255]) }),
      ],
    }),
  },
  {
    id: "groups-nested",
    axis: "중첩 그룹 — 폴더 경로·그룹 불투명도 누적·그룹 블렌드 고지",
    width: 8,
    height: 8,
    build: () => ({
      width: 8,
      height: 8,
      children: [
        {
          name: "외부",
          blendMode: "pass through",
          opacity: 0.8,
          children: [
            {
              name: "내부",
              blendMode: "multiply",
              children: [
                leafLayer({ name: "안쪽 리프", right: 4, bottom: 4, imageData: coordPixels(4, 4), opacity: 0.5 }),
              ],
            },
            leafLayer({ name: "바깥 리프", left: 4, top: 4, right: 8, bottom: 8, imageData: solidPixels(4, 4, [0, 200, 0, 255]) }),
          ],
        },
      ],
    }),
  },
  {
    id: "mask-basic",
    axis: "래스터 마스크 — 알파 보존·비활성 마스크",
    width: 8,
    height: 8,
    build: () => ({
      width: 8,
      height: 8,
      children: [
        leafLayer({
          name: "마스크 레이어", right: 8, bottom: 8, imageData: coordPixels(8, 8),
          mask: { left: 0, top: 0, right: 8, bottom: 8, defaultColor: 0, imageData: gradientMaskPixels(8, 8) },
        }),
        leafLayer({
          name: "마스크 꺼짐", right: 8, bottom: 8, imageData: solidPixels(8, 8, [80, 90, 100, 255]),
          mask: { left: 0, top: 0, right: 8, bottom: 8, defaultColor: 255, disabled: true, imageData: solidPixels(8, 8, [128, 128, 128, 255]) },
        }),
      ],
    }),
  },
  {
    id: "adjustment-effects",
    axis: "조정 레이어·레이어 효과 — 제외와 고지",
    width: 8,
    height: 8,
    build: () => ({
      width: 8,
      height: 8,
      children: [
        { name: "밝기 조정", adjustment: { type: "brightness/contrast", brightness: 25, contrast: -10 } },
        leafLayer({
          name: "그림자 레이어", right: 8, bottom: 8, imageData: coordPixels(8, 8),
          effects: { dropShadow: [{ enabled: true, color: { r: 0, g: 0, b: 0 }, opacity: 0.75, angle: 120 }] },
        }),
        leafLayer({ name: "일반 베이스", right: 8, bottom: 8, imageData: solidPixels(8, 8, [44, 55, 66, 255]) }),
      ],
    }),
  },
  {
    id: "text-basic",
    axis: "텍스트 — 래스터 보존·숨은 편집본·세로 텍스트",
    width: 100,
    height: 40,
    build: () => ({
      width: 100,
      height: 40,
      children: [
        leafLayer({
          name: "자막", right: 100, bottom: 40, imageData: solidPixels(100, 40, [0, 0, 0, 255]),
          text: {
            text: "안녕\r세계",
            transform: [1, 0, 0, 1, 0, 0],
            orientation: "horizontal",
            style: { fontSize: 18, fillColor: { r: 12, g: 34, b: 56 }, font: { name: "ArialMT" } },
          },
        }),
        leafLayer({
          name: "세로 글자", right: 40, bottom: 40, imageData: solidPixels(40, 40, [7, 7, 7, 255]),
          text: {
            text: "세로",
            transform: [1, 0, 0, 1, 0, 0],
            orientation: "vertical",
            style: { fontSize: 18, fillColor: { r: 0, g: 0, b: 0 } },
          },
        }),
      ],
    }),
  },
  {
    id: "group-mask",
    axis: "그룹 마스크·빈 그룹 — 고지와 소실",
    width: 8,
    height: 8,
    build: () => ({
      width: 8,
      height: 8,
      children: [
        {
          name: "마스크 그룹",
          children: [
            leafLayer({ name: "그룹 안", right: 4, bottom: 4, imageData: solidPixels(4, 4, [5, 5, 5, 255]) }),
          ],
          mask: { left: 0, top: 0, right: 4, bottom: 4, imageData: gradientMaskPixels(4, 4) },
        },
        { name: "빈 그룹", children: [] },
      ],
    }),
  },
  {
    id: "empty-doc",
    axis: "빈 문서 — 레이어 없음 고지",
    width: 8,
    height: 8,
    build: () => ({ width: 8, height: 8, children: [] }),
  },
];

/** 픽스처 명세 → 실제 PSD 바이트. writePsd는 결정적이라 같은 명세는 같은 바이트를 만든다. */
export function buildPsdFixtureBytes(fixture: PsdRoundtripFixture): ArrayBuffer {
  return writePsd(fixture.build(), { noBackground: true });
}

export function fixtureById(id: string): PsdRoundtripFixture {
  const fixture = PSD_ROUNDTRIP_FIXTURES.find((entry) => entry.id === id);
  if (!fixture) throw new Error(`코퍼스 픽스처 ${id}가 없어요.`);
  return fixture;
}
