/**
 * Wave 98 — 2026↔2126 순수 정수 결정론적 픽셀 렌더러 및 재생 오라클.
 *
 * - 브라우저 Canvas 2D / GPU / OS 폰트 힌팅에 의존하지 않는 순수 정수(Q8 고정소수점 + Bresenham) 합성기
 * - 내장 비트맵 폰트 서브셋, ICC Q8 색역 프로파일, WASM 렌더러 핀 및 미래 호스트 연도별 픽셀 대조
 */

import {
  canonicalSerializeCentennial,
  constantTimeEqualHex,
  decodeUtf8Centennial,
  hexToBytesCentennial,
  sha256CentennialBytes,
  sha256CentennialHex,
  type DecodedCentennialArchive,
  type DecodedCentennialChunk,
} from "./centennial-archive-container-and-crypto";

export const DETERMINISTIC_ARITHMETIC_CONTRACT = "integer-q8-bresenham-porter-duff-v1" as const;

export interface EmbeddedBitmapFontSubset {
  readonly fontId: string;
  readonly familyName: string;
  readonly glyphWidth: number;
  readonly glyphHeight: number;
  readonly glyphs: Readonly<Record<string, readonly number[]>>;
  readonly subsetSha256: string;
}

export interface EmbeddedIccColorProfile {
  readonly profileId: string;
  readonly colorSpace: "sRGB-IEC61966-2.1" | "Display-P3-D65";
  readonly whitePointD65Permille: readonly [number, number, number];
  readonly channelGainQ8: readonly [number, number, number];
  readonly profileSha256: string;
}

export interface WasmRendererPinManifest {
  readonly engineName: string;
  readonly engineVersion: string;
  readonly arithmeticContract: typeof DETERMINISTIC_ARITHMETIC_CONTRACT;
  readonly wasmBinarySha256: string;
}

export interface RightsBomArchivalAsset {
  readonly assetId: string;
  readonly assetKind: "font" | "brush" | "background-3d" | "texture" | "dialogue-script";
  readonly licenseId: string;
  readonly archivalPreservationAllowed: boolean;
  readonly commercialDistributionStatus: "cleared" | "restricted" | "blocked";
  readonly expirationYear: number | null;
}

export interface RightsBomArchivalSnapshot {
  readonly snapshotId: string;
  readonly episodeId: string;
  readonly assets: readonly RightsBomArchivalAsset[];
}

export interface DeterministicRectFill {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rgba: readonly [number, number, number, number];
}

export interface DeterministicInkStroke {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly thicknessPx: number;
  readonly rgba: readonly [number, number, number, number];
}

export interface DeterministicDialogueRun {
  readonly fontId: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rgba: readonly [number, number, number, number];
}

export interface DeterministicPanelSpec {
  readonly panelId: string;
  readonly width: number;
  readonly height: number;
  readonly backgroundRgba: readonly [number, number, number, number];
  readonly rectFills: readonly DeterministicRectFill[];
  readonly inkStrokes: readonly DeterministicInkStroke[];
  readonly dialogueRuns: readonly DeterministicDialogueRun[];
}

export interface SealedPanelLayerPayload {
  readonly panelId: string;
  readonly spec: DeterministicPanelSpec;
  readonly sealedFrameSha256: string;
  readonly sealedRgbaHex: string;
}

export interface DeterministicPanelRenderResult {
  readonly panelId: string;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly frameSha256: string;
  readonly missingGlyphs: readonly string[];
  readonly renderedGlyphCount: number;
}

export interface ReplayHostPanelOutcome {
  readonly panelId: string;
  readonly sealedFrameSha256: string;
  readonly replayedFrameSha256: string;
  readonly hashMatchesSealed: boolean;
  readonly pixelDiffCount: number;
}

export interface ReplayHostYearReport {
  readonly hostYear: number;
  readonly hostProfileId: string;
  readonly allPanelsMatched: boolean;
  readonly totalPixelDiffCount: number;
  readonly panels: readonly ReplayHostPanelOutcome[];
}

export interface CentennialReplayVerificationResult {
  readonly simulatedHostYears: readonly number[];
  readonly panelCount: number;
  readonly allPanelsBitIdentical: boolean;
  readonly totalPixelDiffCount: number;
  readonly mismatchedPanelIds: readonly string[];
  readonly hostReports: readonly ReplayHostYearReport[];
}

/** 대사 문자열 집합으로부터 호스트 폰트에 비의존적인 결정론적 비트맵 글리프 서브셋 생성. */
export function buildEmbeddedFontSubsetForText(
  fontId: string,
  familyName: string,
  dialogueTexts: readonly string[],
  glyphWidth = 8,
  glyphHeight = 8,
): EmbeddedBitmapFontSubset {
  const uniqueChars = new Set<string>();
  for (let i = 0; i < dialogueTexts.length; i += 1) {
    const chars = Array.from(dialogueTexts[i]);
    for (let j = 0; j < chars.length; j += 1) {
      if (!/^\s$/.test(chars[j])) {
        uniqueChars.add(chars[j]);
      }
    }
  }

  const sortedChars = Array.from(uniqueChars).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const glyphs: Record<string, readonly number[]> = {};
  const rowMask = (1 << glyphWidth) - 1;

  for (let i = 0; i < sortedChars.length; i += 1) {
    const ch = sortedChars[i];
    const seed = sha256CentennialBytes(`${fontId}\u0000${ch}`);
    const rows: number[] = [];
    for (let row = 0; row < glyphHeight; row += 1) {
      const rawBits = seed[row % seed.length] & rowMask;
      rows.push(rawBits === 0 ? 1 << (row % glyphWidth) : rawBits);
    }
    glyphs[ch] = rows;
  }

  const subsetSha256 = sha256CentennialHex(
    canonicalSerializeCentennial({ familyName, fontId, glyphHeight, glyphWidth, glyphs }),
  );
  return { fontId, familyName, glyphWidth, glyphHeight, glyphs, subsetSha256 };
}

/** 결정론적 정수 Q8 ICC 프로파일 생성. */
export function createEmbeddedIccColorProfile(input: {
  readonly profileId: string;
  readonly colorSpace: "sRGB-IEC61966-2.1" | "Display-P3-D65";
  readonly whitePointD65Permille?: readonly [number, number, number];
  readonly channelGainQ8?: readonly [number, number, number];
}): EmbeddedIccColorProfile {
  const whitePointD65Permille = input.whitePointD65Permille ?? ([950, 1000, 1089] as const);
  const channelGainQ8 = input.channelGainQ8 ?? ([256, 256, 256] as const);
  const profileSha256 = sha256CentennialHex(
    canonicalSerializeCentennial({
      channelGainQ8,
      colorSpace: input.colorSpace,
      profileId: input.profileId,
      whitePointD65Permille,
    }),
  );
  return { profileId: input.profileId, colorSpace: input.colorSpace, whitePointD65Permille, channelGainQ8, profileSha256 };
}

function clampByte(n: number): number {
  const v = Math.round(n);
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function blendPixelInteger(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  rgba: readonly [number, number, number, number],
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return;
  }
  const sa = clampByte(rgba[3]);
  if (sa === 0) {
    return;
  }
  const idx = (y * width + x) * 4;
  const sr = clampByte(rgba[0]);
  const sg = clampByte(rgba[1]);
  const sb = clampByte(rgba[2]);
  if (sa === 255) {
    buf[idx] = sr;
    buf[idx + 1] = sg;
    buf[idx + 2] = sb;
    buf[idx + 3] = 255;
    return;
  }
  const invA = 255 - sa;
  buf[idx] = Math.floor((sr * sa + buf[idx] * invA + 127) / 255);
  buf[idx + 1] = Math.floor((sg * sa + buf[idx + 1] * invA + 127) / 255);
  buf[idx + 2] = Math.floor((sb * sa + buf[idx + 2] * invA + 127) / 255);
  buf[idx + 3] = Math.min(255, sa + Math.floor((buf[idx + 3] * invA + 127) / 255));
}

function rasterizeBresenhamStroke(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  stroke: DeterministicInkStroke,
): void {
  let x0 = Math.round(stroke.x0);
  let y0 = Math.round(stroke.y0);
  const x1 = Math.round(stroke.x1);
  const y1 = Math.round(stroke.y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const radius = Math.max(0, Math.floor((Math.max(1, Math.round(stroke.thicknessPx)) - 1) / 2));

  for (let guard = 0; guard < (dx - dy + 2) * 2; guard += 1) {
    for (let oy = -radius; oy <= radius; oy += 1) {
      for (let ox = -radius; ox <= radius; ox += 1) {
        blendPixelInteger(buf, width, height, x0 + ox, y0 + oy, stroke.rgba);
      }
    }
    if (x0 === x1 && y0 === y1) {
      break;
    }
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** 순수 정수 산술 결정론적 패널 렌더러(Canvas/GPU/OS 폰트 힌팅 비의존). */
export function renderDeterministicReferencePanelRgba(
  panelSpec: DeterministicPanelSpec,
  embeddedFonts: readonly EmbeddedBitmapFontSubset[],
  iccProfile: EmbeddedIccColorProfile,
): DeterministicPanelRenderResult {
  const width = Math.max(1, Math.floor(panelSpec.width));
  const height = Math.max(1, Math.floor(panelSpec.height));
  const rgba = new Uint8ClampedArray(width * height * 4);
  const [bgR, bgG, bgB, bgA] = panelSpec.backgroundRgba.map(clampByte);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = bgR;
    rgba[i + 1] = bgG;
    rgba[i + 2] = bgB;
    rgba[i + 3] = bgA;
  }

  for (let i = 0; i < panelSpec.rectFills.length; i += 1) {
    const rect = panelSpec.rectFills[i];
    const xStart = Math.max(0, Math.floor(rect.x));
    const yStart = Math.max(0, Math.floor(rect.y));
    const xEnd = Math.min(width, Math.floor(rect.x + rect.width));
    const yEnd = Math.min(height, Math.floor(rect.y + rect.height));
    for (let y = yStart; y < yEnd; y += 1) {
      for (let x = xStart; x < xEnd; x += 1) {
        blendPixelInteger(rgba, width, height, x, y, rect.rgba);
      }
    }
  }

  for (let i = 0; i < panelSpec.inkStrokes.length; i += 1) {
    rasterizeBresenhamStroke(rgba, width, height, panelSpec.inkStrokes[i]);
  }

  const fontMap = new Map<string, EmbeddedBitmapFontSubset>();
  for (let i = 0; i < embeddedFonts.length; i += 1) {
    fontMap.set(embeddedFonts[i].fontId, embeddedFonts[i]);
  }

  const missingSet = new Set<string>();
  let renderedGlyphCount = 0;
  for (let i = 0; i < panelSpec.dialogueRuns.length; i += 1) {
    const run = panelSpec.dialogueRuns[i];
    const font = fontMap.get(run.fontId);
    const scale = Math.max(1, Math.floor(run.scale));
    const chars = Array.from(run.text);
    let penX = Math.floor(run.x);
    const penY = Math.floor(run.y);
    const advanceX = font ? (font.glyphWidth + 1) * scale : 9 * scale;

    for (let c = 0; c < chars.length; c += 1) {
      const ch = chars[c];
      if (/^\s$/.test(ch)) {
        penX += advanceX;
        continue;
      }
      const bitmap = font?.glyphs[ch];
      if (!font || !bitmap) {
        missingSet.add(ch);
        penX += advanceX;
        continue;
      }
      for (let row = 0; row < font.glyphHeight && row < bitmap.length; row += 1) {
        const mask = bitmap[row];
        for (let col = 0; col < font.glyphWidth; col += 1) {
          if (((mask >>> (font.glyphWidth - 1 - col)) & 1) === 1) {
            for (let sy = 0; sy < scale; sy += 1) {
              for (let sx = 0; sx < scale; sx += 1) {
                blendPixelInteger(rgba, width, height, penX + col * scale + sx, penY + row * scale + sy, run.rgba);
              }
            }
          }
        }
      }
      renderedGlyphCount += 1;
      penX += advanceX;
    }
  }

  const [gR, gG, gB] = iccProfile.channelGainQ8.map((v) => Math.round(v));
  if (gR !== 256 || gG !== 256 || gB !== 256) {
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = clampByte((rgba[i] * gR + 128) >> 8);
      rgba[i + 1] = clampByte((rgba[i + 1] * gG + 128) >> 8);
      rgba[i + 2] = clampByte((rgba[i + 2] * gB + 128) >> 8);
    }
  }

  return {
    panelId: panelSpec.panelId,
    width,
    height,
    rgba,
    frameSha256: sha256CentennialHex(new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength)),
    missingGlyphs: Array.from(missingSet),
    renderedGlyphCount,
  };
}

export function parseDecodedChunkJson<T>(chunk: DecodedCentennialChunk): T {
  return JSON.parse(decodeUtf8Centennial(chunk.payload)) as T;
}

function countRgbaPixelDiff(a: Uint8ClampedArray, b: Uint8Array): number {
  const pixelCount = Math.max(a.length, b.length) / 4;
  let diff = 0;
  for (let p = 0; p < pixelCount; p += 1) {
    const off = p * 4;
    if (a[off] !== b[off] || a[off + 1] !== b[off + 1] || a[off + 2] !== b[off + 2] || a[off + 3] !== b[off + 3]) {
      diff += 1;
    }
  }
  return diff;
}

/** 2026 ↔ 2076 ↔ 2126 가상 미래 호스트 환경 전반에 걸친 결정론적 픽셀 재생 대조 오라클. */
export function verifyCentennialDeterministicReplay(
  decodedArchive: DecodedCentennialArchive,
  simulatedHostYears: readonly number[] = [2026, 2076, 2126],
): CentennialReplayVerificationResult {
  const fontChunks = decodedArchive.chunks.filter((c) => c.kind === "embedded-font-subset");
  const iccChunk = decodedArchive.chunks.find((c) => c.kind === "icc-color-profile");
  const panelChunks = decodedArchive.chunks.filter((c) => c.kind === "panel-master-layer");
  const rendererPinChunk = decodedArchive.chunks.find((c) => c.kind === "wasm-renderer-pin");

  if (!iccChunk || !rendererPinChunk || panelChunks.length === 0) {
    return {
      simulatedHostYears,
      panelCount: panelChunks.length,
      allPanelsBitIdentical: false,
      totalPixelDiffCount: 0,
      mismatchedPanelIds: panelChunks.map((c) => c.chunkId),
      hostReports: [],
    };
  }

  const embeddedFonts = fontChunks.map((c) => parseDecodedChunkJson<EmbeddedBitmapFontSubset>(c));
  const iccProfile = parseDecodedChunkJson<EmbeddedIccColorProfile>(iccChunk);
  const rendererPin = parseDecodedChunkJson<WasmRendererPinManifest>(rendererPinChunk);
  const panels = panelChunks.map((c) => parseDecodedChunkJson<SealedPanelLayerPayload>(c));
  const contractValid = rendererPin.arithmeticContract === DETERMINISTIC_ARITHMETIC_CONTRACT;

  const baselineByPanel = new Map<string, DeterministicPanelRenderResult>();
  const mismatchedSet = new Set<string>();
  const hostReports: ReplayHostYearReport[] = [];
  let maxYearPixelDiff = 0;

  for (let y = 0; y < simulatedHostYears.length; y += 1) {
    const hostYear = simulatedHostYears[y];
    const hostProfileId =
      hostYear <= 2035 ? `wasm64-host-${hostYear}` : hostYear <= 2090 ? `riscv-photon-host-${hostYear}` : `centennial-host-${hostYear}`;
    const outcomes: ReplayHostPanelOutcome[] = [];
    let yearDiffSum = 0;
    let yearAllMatched = contractValid;

    for (let p = 0; p < panels.length; p += 1) {
      const sealed = panels[p];
      const rendered = renderDeterministicReferencePanelRgba(sealed.spec, embeddedFonts, iccProfile);
      const baseline = baselineByPanel.get(sealed.panelId);
      if (!baseline) {
        baselineByPanel.set(sealed.panelId, rendered);
      }
      const sealedDiff = countRgbaPixelDiff(rendered.rgba, hexToBytesCentennial(sealed.sealedRgbaHex));
      const crossDiff = baseline
        ? countRgbaPixelDiff(rendered.rgba, new Uint8Array(baseline.rgba.buffer, baseline.rgba.byteOffset, baseline.rgba.byteLength))
        : 0;
      const pixelDiffCount = Math.max(sealedDiff, crossDiff);
      const hashMatchesSealed =
        contractValid &&
        constantTimeEqualHex(rendered.frameSha256, sealed.sealedFrameSha256) &&
        (!baseline || constantTimeEqualHex(rendered.frameSha256, baseline.frameSha256)) &&
        pixelDiffCount === 0;
      if (!hashMatchesSealed) {
        yearAllMatched = false;
        mismatchedSet.add(sealed.panelId);
      }
      yearDiffSum += pixelDiffCount;
      outcomes.push({
        panelId: sealed.panelId,
        sealedFrameSha256: sealed.sealedFrameSha256,
        replayedFrameSha256: rendered.frameSha256,
        hashMatchesSealed,
        pixelDiffCount,
      });
    }

    if (yearDiffSum > maxYearPixelDiff) {
      maxYearPixelDiff = yearDiffSum;
    }
    hostReports.push({ hostYear, hostProfileId, allPanelsMatched: yearAllMatched, totalPixelDiffCount: yearDiffSum, panels: outcomes });
  }

  return {
    simulatedHostYears,
    panelCount: panels.length,
    allPanelsBitIdentical:
      contractValid && panels.length > 0 && mismatchedSet.size === 0 && hostReports.every((r) => r.allPanelsMatched),
    totalPixelDiffCount: maxYearPixelDiff,
    mismatchedPanelIds: Array.from(mismatchedSet),
    hostReports,
  };
}
