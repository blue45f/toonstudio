/**
 * Studio Lift3D — 파일 업로드 없이 2D → 3D 파이프라인을 즉시 체험할 수 있는 내장 절차적 샘플 원화 3종.
 *
 * 브라우저 Canvas/DOM 의존 없이 순수 RGBA 버퍼와 표준 비압축 PNG(IHDR + stored zlib IDAT + IEND)를
 * 결정론적으로 생성하므로 실제 브라우저와 Node/jsdom 단위 테스트에서 동일하게 동작한다.
 */

import type { StudioLift3dSubject } from "./studio-lift3d-contract";
import type { StudioLift3dDecodedFile } from "./studio-lift3d-image-decode";

export interface StudioLift3dSamplePreset {
  readonly id: string;
  readonly subject: StudioLift3dSubject;
  readonly labelKo: string;
  readonly hintKo: string;
  readonly fileName: string;
}

export const STUDIO_LIFT3D_SAMPLE_PRESETS: readonly StudioLift3dSamplePreset[] = Object.freeze([
  {
    id: "sample-character-bust",
    subject: "character",
    labelKo: "캐릭터 샘플",
    hintKo: "투명 배경 상반신 실루엣",
    fileName: "sample-webtoon-hero-bust.png",
  },
  {
    id: "sample-prop-potion",
    subject: "prop",
    labelKo: "소품 샘플",
    hintKo: "마법 크리스탈 포션 병",
    fileName: "sample-crystal-potion-prop.png",
  },
  {
    id: "sample-bg-archway",
    subject: "background",
    labelKo: "배경 부조 샘플",
    hintKo: "석조 아치 골목 깊이 부조",
    fileName: "sample-archway-alley-relief.png",
  },
]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = (CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8)) >>> 0;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    a = (a + bytes[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return (((b << 16) | a) >>> 0);
}

function pngChunk(typeAscii: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i += 1) {
    out[4 + i] = typeAscii.charCodeAt(i);
  }
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)), false);
  return out;
}

/** 64×64 이하 소형 RGBA 이미지를 무손실 stored-deflate PNG 바이트로 직렬화한다. */
export function encodeStudioLift3dUncompressedPng(
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
): Uint8Array {
  const rowStride = width * 4 + 1;
  const raw = new Uint8Array(rowStride * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * rowStride;
    raw[rowOffset] = 0; // filter: None
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), rowOffset + 1);
  }

  // 단일 stored deflate 블록 (최대 65,535 바이트 이내; 64×64×4 + 64 = 16,448 바이트)
  const zlib = new Uint8Array(2 + 5 + raw.length + 4);
  zlib[0] = 0x78;
  zlib[1] = 0x01;
  zlib[2] = 0x01; // BFINAL=1, BTYPE=00 (stored)
  zlib[3] = raw.length & 0xff;
  zlib[4] = (raw.length >>> 8) & 0xff;
  const nlen = (~raw.length) & 0xffff;
  zlib[5] = nlen & 0xff;
  zlib[6] = (nlen >>> 8) & 0xff;
  zlib.set(raw, 7);
  new DataView(zlib.buffer).setUint32(7 + raw.length, adler32(raw), false);

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdr[8] = 8; // 8-bit
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = pngChunk("IHDR", ihdr);
  const idatChunk = pngChunk("IDAT", zlib);
  const iendChunk = pngChunk("IEND", new Uint8Array(0));

  const total = signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length;
  const png = new Uint8Array(total);
  let cursor = 0;
  for (const part of [signature, ihdrChunk, idatChunk, iendChunk]) {
    png.set(part, cursor);
    cursor += part.length;
  }
  return png;
}

function setPixel(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  const index = (y * width + x) * 4;
  data[index] = Math.max(0, Math.min(255, Math.round(r)));
  data[index + 1] = Math.max(0, Math.min(255, Math.round(g)));
  data[index + 2] = Math.max(0, Math.min(255, Math.round(b)));
  data[index + 3] = Math.max(0, Math.min(255, Math.round(a)));
}

export function buildStudioLift3dSampleDecodedFile(
  presetId: string,
): StudioLift3dDecodedFile {
  const spec = STUDIO_LIFT3D_SAMPLE_PRESETS.find((item) => item.id === presetId)
    ?? STUDIO_LIFT3D_SAMPLE_PRESETS[0]!;
  const width = 64;
  const height = 64;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const ny = (y / (height - 1)) * 2 - 1; // -1(top) .. +1(bottom)
    for (let x = 0; x < width; x += 1) {
      const nx = (x / (width - 1)) * 2 - 1; // -1(left) .. +1(right)

      if (spec.subject === "character") {
        const headDist = Math.hypot(nx / 0.36, (ny + 0.34) / 0.36);
        const neck = Math.abs(nx) < 0.14 && ny >= -0.04 && ny <= 0.24;
        const torso = Math.hypot(nx / 0.62, (ny - 0.68) / 0.56) <= 1 && ny >= 0.16;
        if (headDist <= 1 || neck || torso) {
          const shade = headDist <= 1
            ? Math.max(0.25, 1 - headDist * 0.55)
            : Math.max(0.25, 0.92 - Math.abs(nx) * 0.65);
          const warm = headDist <= 1 ? [244, 206, 184] : [86, 126, 214];
          setPixel(data, width, x, y, warm[0]! * shade, warm[1]! * shade, warm[2]! * shade, 255);
        }
      } else if (spec.subject === "prop") {
        const bulbDist = Math.hypot(nx / 0.46, (ny - 0.22) / 0.46);
        const bottleneck = Math.abs(nx) < 0.15 && ny >= -0.52 && ny <= -0.18;
        const stopper = Math.abs(nx) < 0.19 && ny >= -0.68 && ny < -0.5;
        if (bulbDist <= 1 || bottleneck || stopper) {
          const glow = bulbDist <= 1 ? Math.max(0.3, 1 - bulbDist * 0.6) : 0.78;
          const base = stopper ? [186, 132, 78] : [72, 210, 232];
          setPixel(data, width, x, y, base[0]! * glow, base[1]! * glow, base[2]! * glow, 255);
        }
      } else {
        // background: 석조 아치 프레임 + 안쪽 골목 원근 명암
        const archOpening = Math.abs(nx) < 0.48 && (ny > -0.1 || Math.hypot(nx / 0.48, (ny + 0.1) / 0.48) < 1);
        const depthShade = archOpening
          ? 90 + (1 - Math.abs(nx)) * 75 + (1 - Math.abs(ny)) * 45
          : 195 - Math.abs(nx) * 35 - Math.abs(ny) * 20;
        setPixel(
          data,
          width,
          x,
          y,
          depthShade,
          archOpening ? depthShade * 0.96 : depthShade * 0.9,
          archOpening ? depthShade * 1.08 : depthShade * 0.82,
          255,
        );
      }
    }
  }

  const bytes = encodeStudioLift3dUncompressedPng(width, height, data);
  return {
    source: { width, height, pixels: data },
    bytes,
    mimeType: "image/png",
    texture: { mimeType: "image/png", bytes },
    fileName: spec.fileName,
    naturalWidth: width,
    naturalHeight: height,
  };
}
