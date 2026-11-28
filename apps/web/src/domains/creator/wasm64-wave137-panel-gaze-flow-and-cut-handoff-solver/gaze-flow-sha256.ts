/**
 * Wave 137 — 순수 ES2017 동기 FIPS 180-4 SHA-256 해시 및 시선 동선 매니페스트 정규 직렬화.
 *
 * 브라우저·Node·WebWorker 환경 의존성 없이 결정론적 상태 지문을 계산한다.
 * BigInt 리터럴 없이 32비트 부호 없는 정수 산술(`>>> 0`)만 사용한다.
 */

import type {
  CutHandoffAuditResult,
  GazeReadingDirection,
  PanelGazeAuditResult,
} from "./gaze-flow-types";

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const SHA256_INIT = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

function rotr32(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

function toHex32(value: number): string {
  const raw = (value >>> 0).toString(16);
  return raw.length >= 8 ? raw : "00000000".slice(raw.length) + raw;
}

/**
 * UTF-16 문자열을 표준 UTF-8 바이트 배열로 결정론적 인코딩한다.
 */
export function encodeGazeUtf8Bytes(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let codePoint = text.charCodeAt(i);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

/**
 * FIPS 180-4 표준 SHA-256 다이제스트를 64자리 소문자 16진수 문자열로 반환한다.
 */
export function sha256GazeBytesHex(data: Uint8Array): string {
  const byteLen = data.length;
  const totalLen = Math.ceil((byteLen + 9) / 64) * 64;
  const padded = new Uint8Array(totalLen);
  padded.set(data, 0);
  padded[byteLen] = 0x80;

  const bitLen = byteLen * 8;
  const bitLenHi = Math.floor(bitLen / 4294967296) >>> 0;
  const bitLenLo = bitLen >>> 0;
  padded[totalLen - 8] = (bitLenHi >>> 24) & 0xff;
  padded[totalLen - 7] = (bitLenHi >>> 16) & 0xff;
  padded[totalLen - 6] = (bitLenHi >>> 8) & 0xff;
  padded[totalLen - 5] = bitLenHi & 0xff;
  padded[totalLen - 4] = (bitLenLo >>> 24) & 0xff;
  padded[totalLen - 3] = (bitLenLo >>> 16) & 0xff;
  padded[totalLen - 2] = (bitLenLo >>> 8) & 0xff;
  padded[totalLen - 1] = bitLenLo & 0xff;

  let h0 = SHA256_INIT[0] ?? 0;
  let h1 = SHA256_INIT[1] ?? 0;
  let h2 = SHA256_INIT[2] ?? 0;
  let h3 = SHA256_INIT[3] ?? 0;
  let h4 = SHA256_INIT[4] ?? 0;
  let h5 = SHA256_INIT[5] ?? 0;
  let h6 = SHA256_INIT[6] ?? 0;
  let h7 = SHA256_INIT[7] ?? 0;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const idx = offset + i * 4;
      w[i] =
        (((padded[idx] ?? 0) << 24) |
          ((padded[idx + 1] ?? 0) << 16) |
          ((padded[idx + 2] ?? 0) << 8) |
          (padded[idx + 3] ?? 0)) >>>
        0;
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const s0 = (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const s1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + s1 + ch + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const s0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return (
    toHex32(h0) +
    toHex32(h1) +
    toHex32(h2) +
    toHex32(h3) +
    toHex32(h4) +
    toHex32(h5) +
    toHex32(h6) +
    toHex32(h7)
  );
}

/**
 * UTF-8 문자열의 FIPS 180-4 SHA-256 해시를 반환한다.
 */
export function sha256GazeUtf8Hex(input: string): string {
  return sha256GazeBytesHex(encodeGazeUtf8Bytes(input));
}

function round4(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * 에피소드 시선 감사 결과를 키 순서가 고정된 정규 JSON 문자열로 직렬화한다.
 */
export function canonicalizeGazeAuditManifestJson(params: {
  readonly episodeId: string;
  readonly readingDirection: GazeReadingDirection;
  readonly panels: readonly PanelGazeAuditResult[];
  readonly handoffs: readonly CutHandoffAuditResult[];
  readonly overallGazeFlowScore: number;
}): string {
  const payload = {
    episodeId: params.episodeId.trim(),
    handoffs: params.handoffs.map((h) => ({
      abruptJumpDetected: h.abruptJumpDetected,
      effectiveJumpRatio: round4(h.effectiveJumpRatio),
      exitVectorAlignment: round4(h.exitVectorAlignment),
      fromPanelId: h.fromPanelId,
      handoffScore: round4(h.handoffScore),
      horizontalJumpRatio: round4(h.horizontalJumpRatio),
      toPanelId: h.toPanelId,
    })),
    overallGazeFlowScore: round4(params.overallGazeFlowScore),
    panels: params.panels.map((p) => ({
      backtrackingRatio: round4(p.backtrackingRatio),
      centerOfVisualMass: {
        x: round4(p.visualMass.centerOfVisualMass.x),
        y: round4(p.visualMass.centerOfVisualMass.y),
      },
      elements: p.panel.elements.map((el) => ({
        contrast: round4(el.contrast),
        elementId: el.elementId,
        gazeDir: el.gazeDir ? { dx: round4(el.gazeDir.dx), dy: round4(el.gazeDir.dy) } : null,
        height: round4(el.height),
        kind: el.kind,
        prominence: round4(el.prominence),
        scriptOrder: el.scriptOrder,
        width: round4(el.width),
        x: round4(el.x),
        y: round4(el.y),
      })),
      gazePathIds: p.gazePath.map((node) => node.elementId),
      intersectionCount: p.intersections.length,
      outwardLeakCount: p.outwardLeaks.length,
      panelFlowScore: round4(p.panelFlowScore),
      panelId: p.panel.panelId,
      pattern: p.pattern,
      reversalCount: p.reversals.length,
      visualBalanceScore: round4(p.visualMass.visualBalanceScore),
      visualReadingOrderIds: p.visualReadingOrder.map((entry) => entry.elementId),
    })),
    readingDirection: params.readingDirection,
    schemaVersion: "wave137-gaze-flow-v1",
  };
  return JSON.stringify(payload);
}

/**
 * 에피소드 시선 감사 매니페스트의 결정론적 FIPS 180-4 SHA-256 지문을 계산한다.
 */
export function computeGazeAuditManifestSha256Hex(params: {
  readonly episodeId: string;
  readonly readingDirection: GazeReadingDirection;
  readonly panels: readonly PanelGazeAuditResult[];
  readonly handoffs: readonly CutHandoffAuditResult[];
  readonly overallGazeFlowScore: number;
}): string {
  return sha256GazeUtf8Hex(canonicalizeGazeAuditManifestJson(params));
}
