/**
 * Wave 135 — 순수 ES2017 동기 FIPS 180-4 SHA-256 및 투시 리깅 매니페스트 지문 생성기.
 *
 * - 외부 암호 라이브러리나 BigInt 리터럴 없이 브라우저·Node·Worker에서 동일한
 *   비트 정확 SHA-256 16진수 다이제스트를 생성한다.
 */

import type {
  ThreePointPerspectiveRig,
  VanishingPointEstimationResult,
} from "./perspective-types-and-math";
import type {
  PerspectiveStaircaseResult,
  SubdividedPerspectiveQuadResult,
} from "./projective-subdivision-and-snap";

export interface PerspectiveRigFingerprint {
  readonly version: "wave135-v1";
  readonly sha256Hex: string;
  readonly manifestCanonicalJson: string;
}

const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function encodeUtf8Bytes(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    if (cp <= 0x7f) {
      bytes.push(cp);
    } else if (cp <= 0x7ff) {
      bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp <= 0xffff) {
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

function rotr32(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

function uint32ToHex(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}

/** 외부 의존성 없는 순수 ES2017 동기 FIPS 180-4 SHA-256 16진수 다이제스트. */
export function sha256PerspectiveHex(input: string | Uint8Array): string {
  const raw = typeof input === "string" ? encodeUtf8Bytes(input) : input;
  const byteLength = raw.length;
  const paddedLength = Math.ceil((byteLength + 9) / 64) * 64;
  const buffer = new Uint8Array(paddedLength);
  buffer.set(raw, 0);
  buffer[byteLength] = 0x80;

  const view = new DataView(buffer.buffer);
  view.setUint32(paddedLength - 8, Math.floor(byteLength / 0x20000000), false);
  view.setUint32(paddedLength - 4, (byteLength << 3) >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = (rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
      const s1 = (rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
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
      const S1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ ((~e >>> 0) & g)) >>> 0;
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;

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
    uint32ToHex(h0) +
    uint32ToHex(h1) +
    uint32ToHex(h2) +
    uint32ToHex(h3) +
    uint32ToHex(h4) +
    uint32ToHex(h5) +
    uint32ToHex(h6) +
    uint32ToHex(h7)
  );
}

/** 객체 키를 사전순으로 정규화해 결정론적 JSON 문자열을 만든다. */
export function canonicalizePerspectiveJson(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "boolean") return value ? "true" : "false";
  if (t === "number") {
    const num = value as number;
    if (!Number.isFinite(num)) return "null";
    const normalized = Math.abs(num) < 1e-12 ? 0 : Math.round(num * 1e6) / 1e6;
    return Object.is(normalized, -0) ? "0" : JSON.stringify(normalized);
  }
  if (t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((x) => (x === undefined ? "null" : canonicalizePerspectiveJson(x))).join(",")}]`;
  }
  if (t === "object") {
    const rec = value as Record<string, unknown>;
    const keys = Object.keys(rec).sort();
    const parts: string[] = [];
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i];
      if (rec[k] !== undefined) {
        parts.push(`${JSON.stringify(k)}:${canonicalizePerspectiveJson(rec[k])}`);
      }
    }
    return `{${parts.join(",")}}`;
  }
  return "null";
}

/** 투시 리깅·분할·계단·역추정 매니페스트의 결정론적 FIPS 180-4 SHA-256 지문을 생성한다. */
export function computePerspectiveRigFingerprint(
  rig: ThreePointPerspectiveRig,
  subdivision?: SubdividedPerspectiveQuadResult | null,
  staircase?: PerspectiveStaircaseResult | null,
  estimation?: VanishingPointEstimationResult | null,
): PerspectiveRigFingerprint {
  const manifest = {
    version: "wave135-v1",
    camera: {
      canvasWidth: rig.canvasWidth,
      canvasHeight: rig.canvasHeight,
      focalLengthMm: rig.focalLengthMm,
      sensorWidthMm: rig.sensorWidthMm,
      yawDeg: rig.yawDeg,
      pitchDeg: rig.pitchDeg,
      rollDeg: rig.rollDeg,
      principalPoint: rig.principalPoint,
      mode: rig.mode,
    },
    vanishingPoints: {
      vp1: rig.vp1.homogeneous,
      vp2: rig.vp2.homogeneous,
      vp3: rig.vp3.homogeneous,
    },
    horizon: {
      a: rig.horizonLine.a,
      b: rig.horizonLine.b,
      c: rig.horizonLine.c,
      tiltDeg: rig.horizonLine.tiltDeg,
    },
    distortionSeverity: rig.distortionSeverity,
    subdivision: subdivision
      ? {
          cols: subdivision.cols,
          rows: subdivision.rows,
          homography: subdivision.homography,
          maxCrossRatioError: subdivision.verification.maxCrossRatioError,
        }
      : null,
    staircase: staircase
      ? {
          stepCount: staircase.stepCount,
          directionAxis: staircase.directionAxis,
          isForeshorteningMonotonic: staircase.isForeshorteningMonotonic,
          maxNosingCrossRatioError: staircase.maxNosingCrossRatioError,
        }
      : null,
    estimation: estimation
      ? {
          detectedMode: estimation.detectedMode,
          inlierRatio: estimation.inlierRatio,
          overallMeanInlierAngleErrorDeg: estimation.overallMeanInlierAngleErrorDeg,
        }
      : null,
  };
  const manifestCanonicalJson = canonicalizePerspectiveJson(manifest);
  return {
    version: "wave135-v1",
    sha256Hex: sha256PerspectiveHex(manifestCanonicalJson),
    manifestCanonicalJson,
  };
}
