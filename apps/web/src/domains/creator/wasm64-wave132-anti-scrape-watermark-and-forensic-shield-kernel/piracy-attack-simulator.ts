/**
 * Wave 132 — 4종 웹툰 불법 복제·재가공 공격(JPEG Q=75, 밝기/대비, ±4 잡음, 외곽 8px 크롭)
 * 결정론적 시뮬레이터 및 합성 웹툰 원고 타일 생성기.
 */

import {
  ForensicWatermarkError,
  buildJpegLumaQuantTable,
  type PiracyAttackKind,
  type PiracyAttackResult,
  type PiracyAttackSuiteResult,
  type WatermarkEmbedResult,
  type WatermarkTileImage,
} from "./forensic-watermark-types";
import {
  clampByte,
  detectInvisibleDctWatermark,
  extractLumaPlane,
  forwardDct8x8,
  inverseDct8x8,
  validateTileImage,
} from "./frequency-watermark-dct-kernel";

const JPEG_Q75_LUMA_TABLE = buildJpegLumaQuantTable(75);

const ATTACK_LABELS_KO: Readonly<Record<PiracyAttackKind, string>> = {
  "jpeg-quantization-q75": "JPEG Q=75 재압축 양자화",
  "brightness-contrast-shift": "밝기 +8% · 대비 1.06× 변조",
  "additive-noise": "결정론적 ±4 잡음 주입",
  "border-crop-12pct": "외곽 8px(1블록) 크롭",
};

const DEFAULT_PIRACY_ATTACKS: readonly PiracyAttackKind[] = [
  "jpeg-quantization-q75",
  "brightness-contrast-shift",
  "additive-noise",
  "border-crop-12pct",
];

/** 4종 불법 복제·유출 변조 공격 중 하나를 결정론적으로 시뮬레이션한다. */
export function simulatePiracyAttack(
  tile: WatermarkTileImage,
  kind: PiracyAttackKind,
): WatermarkTileImage {
  const { blocksX, blocksY } = validateTileImage(tile, 32);

  if (kind === "jpeg-quantization-q75") {
    const srcLuma = extractLumaPlane(tile);
    const quantizedLuma = new Float64Array(srcLuma.length);
    const blockBuf = new Float64Array(64);

    for (let by = 0; by < blocksY; by += 1) {
      for (let bx = 0; bx < blocksX; bx += 1) {
        for (let y = 0; y < 8; y += 1) {
          const rowOff = (by * 8 + y) * tile.width + bx * 8;
          for (let x = 0; x < 8; x += 1) blockBuf[y * 8 + x] = srcLuma[rowOff + x] - 128;
        }
        const dct = forwardDct8x8(blockBuf);
        for (let i = 0; i < 64; i += 1) {
          const q = JPEG_Q75_LUMA_TABLE[i];
          dct[i] = Math.round(dct[i] / q) * q;
        }
        const restored = inverseDct8x8(dct);
        for (let y = 0; y < 8; y += 1) {
          const rowOff = (by * 8 + y) * tile.width + bx * 8;
          for (let x = 0; x < 8; x += 1) quantizedLuma[rowOff + x] = restored[y * 8 + x] + 128;
        }
      }
    }

    const out = new Uint8Array(tile.data.length);
    const pixelCount = tile.width * tile.height;
    if (tile.format === "luma-u8") {
      for (let i = 0; i < pixelCount; i += 1) out[i] = clampByte(quantizedLuma[i]);
    } else {
      for (let i = 0; i < pixelCount; i += 1) {
        const off = i * 4;
        const deltaY = quantizedLuma[i] - srcLuma[i];
        out[off] = clampByte(tile.data[off] + deltaY);
        out[off + 1] = clampByte(tile.data[off + 1] + deltaY);
        out[off + 2] = clampByte(tile.data[off + 2] + deltaY);
        out[off + 3] = tile.data[off + 3];
      }
    }
    return { width: tile.width, height: tile.height, format: tile.format, data: out };
  }

  if (kind === "brightness-contrast-shift") {
    const out = new Uint8Array(tile.data.length);
    const brightnessOffset = 255 * 0.08;
    const contrastScale = 1.06;
    if (tile.format === "luma-u8") {
      for (let i = 0; i < tile.data.length; i += 1) {
        out[i] = clampByte((tile.data[i] - 128) * contrastScale + 128 + brightnessOffset);
      }
    } else {
      for (let i = 0; i < tile.data.length; i += 4) {
        out[i] = clampByte((tile.data[i] - 128) * contrastScale + 128 + brightnessOffset);
        out[i + 1] = clampByte((tile.data[i + 1] - 128) * contrastScale + 128 + brightnessOffset);
        out[i + 2] = clampByte((tile.data[i + 2] - 128) * contrastScale + 128 + brightnessOffset);
        out[i + 3] = tile.data[i + 3];
      }
    }
    return { width: tile.width, height: tile.height, format: tile.format, data: out };
  }

  if (kind === "additive-noise") {
    const out = new Uint8Array(tile.data.length);
    let state = 0x517cc1b7;
    const nextNoise = (): number => {
      let acc = 0;
      for (let k = 0; k < 3; k += 1) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        acc += (state / 0xffffffff) * 2 - 1;
      }
      return Math.max(-4, Math.min(4, Math.round((acc / 3) * 4.5)));
    };

    if (tile.format === "luma-u8") {
      for (let i = 0; i < tile.data.length; i += 1) out[i] = clampByte(tile.data[i] + nextNoise());
    } else {
      for (let i = 0; i < tile.data.length; i += 4) {
        const n = nextNoise();
        out[i] = clampByte(tile.data[i] + n);
        out[i + 1] = clampByte(tile.data[i + 1] + n);
        out[i + 2] = clampByte(tile.data[i + 2] + n);
        out[i + 3] = tile.data[i + 3];
      }
    }
    return { width: tile.width, height: tile.height, format: tile.format, data: out };
  }

  // border-crop-12pct: 64×64 이상이면 외곽 8px(1블록) 물리 크롭((W-16)×(H-16))
  if (tile.width >= 64 && tile.height >= 64) {
    const newW = tile.width - 16;
    const newH = tile.height - 16;
    const channels = tile.format === "rgba-u8" ? 4 : 1;
    const out = new Uint8Array(newW * newH * channels);
    for (let y = 0; y < newH; y += 1) {
      const srcRowOff = ((y + 8) * tile.width + 8) * channels;
      out.set(tile.data.subarray(srcRowOff, srcRowOff + newW * channels), y * newW * channels);
    }
    return { width: newW, height: newH, format: tile.format, data: out };
  }

  const out = new Uint8Array(tile.data);
  const channels = tile.format === "rgba-u8" ? 4 : 1;
  for (let y = 0; y < tile.height; y += 1) {
    for (let x = 0; x < tile.width; x += 1) {
      if (x < 8 || y < 8 || x >= tile.width - 8 || y >= tile.height - 8) {
        const off = (y * tile.width + x) * channels;
        for (let c = 0; c < (channels === 4 ? 3 : 1); c += 1) out[off + c] = 0;
      }
    }
  }
  return { width: tile.width, height: tile.height, format: tile.format, data: out };
}

/**
 * 삽입된 워터마크 타일에 대해 무공격 기준선과 4종 불법 복제 공격
 * (JPEG Q=75·밝기대비·±4 잡음·외곽 8px 크롭) 내성을 일괄 시뮬레이션·검증한다.
 */
export function simulatePiracyAttackAndDetectWatermark(
  embedResult: WatermarkEmbedResult,
  secretKey: string,
  attackKinds: readonly PiracyAttackKind[] = DEFAULT_PIRACY_ATTACKS,
): PiracyAttackSuiteResult {
  const expectedBits = embedResult.encodedPayload.payloadBits;
  const baselineDetection = detectInvisibleDctWatermark(embedResult.watermarkedTile, {
    secretKey,
    expectedPayloadBits: expectedBits,
  });

  const attacks: PiracyAttackResult[] = [];
  let minCorr = Number.POSITIVE_INFINITY;
  let maxBer = 0;
  let allPassed = true;

  for (let i = 0; i < attackKinds.length; i += 1) {
    const kind = attackKinds[i];
    const attackedTile = simulatePiracyAttack(embedResult.watermarkedTile, kind);
    const detection = detectInvisibleDctWatermark(attackedTile, {
      secretKey,
      expectedPayloadBits: expectedBits,
    });
    const ber = detection.bitErrorRate ?? 1;
    const exactMatch =
      detection.detected && detection.recoveredPayloadCode === embedResult.encodedPayload.payloadCode;
    const passed = detection.detected && ber < 0.05 && detection.normalizedCorrelation >= 0.65;

    if (detection.normalizedCorrelation < minCorr) minCorr = detection.normalizedCorrelation;
    if (ber > maxBer) maxBer = ber;
    if (!passed) allPassed = false;

    attacks.push({
      kind,
      labelKo: ATTACK_LABELS_KO[kind],
      attackedTile,
      detection,
      bitErrorRate: ber,
      payloadExactMatch: exactMatch,
      passed,
    });
  }

  return {
    baselineDetection,
    attacks,
    allAttacksPassed: allPassed && baselineDetection.detected,
    minCorrelationAcrossAttacks: Number.isFinite(minCorr) ? minCorr : 0,
    maxBitErrorRateAcrossAttacks: maxBer,
  };
}

/** 결정론적 웹툰 원고 스타일(배경 그라데이션 + 말풍선 음영 + 선화 리듬) 합성 타일을 생성한다. */
export function createSyntheticWebtoonTile(
  width: number,
  height: number,
  format: "luma-u8" | "rgba-u8" = "rgba-u8",
  seed = 132,
): WatermarkTileImage {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 32 ||
    height < 32 ||
    width % 8 !== 0 ||
    height % 8 !== 0
  ) {
    throw new ForensicWatermarkError(
      "INVALID_DIMENSIONS",
      `합성 타일 크기는 32 이상 8의 배수여야 합니다 (입력: ${width}×${height}).`,
    );
  }
  const channels = format === "rgba-u8" ? 4 : 1;
  const data = new Uint8Array(width * height * channels);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = x / width;
      const ny = y / height;
      const grad = 118 + 56 * Math.sin(nx * Math.PI * 1.4 + seed * 0.1) * Math.cos(ny * Math.PI * 1.1);
      const dx = nx - 0.52;
      const dy = ny - 0.46;
      const radial = Math.sqrt(dx * dx + dy * dy);
      const balloon = radial < 0.24 ? 36 : radial < 0.27 ? -38 : 0;
      const hatch = (x + y + seed) % 11 === 0 && ny > 0.62 ? -16 : 0;
      const baseLuma = clampByte(grad + balloon + hatch);

      if (format === "luma-u8") {
        data[y * width + x] = baseLuma;
      } else {
        const off = (y * width + x) * 4;
        data[off] = clampByte(baseLuma + 10);
        data[off + 1] = clampByte(baseLuma + 2);
        data[off + 2] = clampByte(baseLuma - 12);
        data[off + 3] = 255;
      }
    }
  }
  return { width, height, format, data };
}
