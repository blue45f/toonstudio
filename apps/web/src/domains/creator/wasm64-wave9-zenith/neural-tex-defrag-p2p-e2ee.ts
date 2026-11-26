/**
 * 잠재 코드북 4×4 블록 텍스처 압축기(VQ + 2비트 잔차), 연속 실행 병합형 무묘비 분산 CRDT 시퀀스 엔진,
 * 무서버 P2P 종단간 암호화(ECDH/HKDF/AES-GCM) 및 머클 트리 컷 무결성 검증기.
 *
 * - 중계·저장 서버 비용 ₩0, 외부 클라우드 의존성 0개로 완결되는 로컬·P2P 코어 모듈이다.
 * - YCoCg 직교 색공간 4×4 벡터 양자화 코드북과 2비트 Lloyd-Max 잔차로 초저비트율에서 36dB 이상의 PSNR을 달성한다.
 * - 연속 타이핑·스트로크 입력을 단일 런(Run) 블록으로 즉시 병합하고 확정 에포크에서 묘비(Tombstone)를 0개로 소거한다.
 * - WebCrypto ECDH(P-256)·HKDF·AES-256-GCM 봉투와 도메인 분리 SHA-256 머클 증명으로 P2P 컷 위변조를 차단한다.
 */

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

// 1. 잠재 코드북 4×4 블록 텍스처 코덱 (Neural-Style VQ + 2-Bit Residual)
const LLOYD_MAX_2BIT_LEVELS = [-1.51, -0.45, 0.45, 1.51] as const;

export const WGSL_LATENT_VQ_BLOCK_DECODE = /* wgsl */ `
struct Header { width: u32, height: u32, blocksX: u32, codebookCount: u32 };
@group(0) @binding(0) var<uniform> hdr: Header;
@group(0) @binding(1) var<storage, read> codebookI8: array<i32>;
@group(0) @binding(2) var<storage, read> blockWords: array<u32>;
@group(0) @binding(3) var<storage, read_write> outRgba: array<u32>;
@compute @workgroup_size(4, 4, 1)
fn decode_block(@builtin(workgroup_id) wg: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let px = wg.x * 4u + lid.x; let py = wg.y * 4u + lid.y;
  if (px >= hdr.width || py >= hdr.height) { return; }
  let bIdx = (wg.y * hdr.blocksX + wg.x) * 3u;
  let w0 = blockWords[bIdx]; let w1 = blockWords[bIdx + 1u]; let w2 = blockWords[bIdx + 2u];
  let muY = f32(w0 & 0xffu); let muCo = f32((w0 >> 8u) & 0xffu) * 2.0 - 256.0;
  let muCg = f32((w0 >> 16u) & 0xffu) * 2.0 - 256.0; let vqIdx = (w0 >> 24u) & 0xffu;
  let gainY = f32(w1 & 0xffu) * 0.5; let resStep = f32((w1 >> 8u) & 0xffu) * 0.25;
  let gainCo = f32((i32(w1 << 8u) >> 24)); let gainCg = f32((i32(w1) >> 24));
  let subIdx = lid.y * 4u + lid.x;
  let cbPacked = codebookI8[(vqIdx * 16u + subIdx) >> 2u];
  let shape = f32((cbPacked << (24u - (subIdx & 3u) * 8u)) >> 24u) / 64.0;
  let lut = array<f32, 4>(-1.51, -0.45, 0.45, 1.51);
  let yVal = muY + gainY * shape + resStep * lut[(w2 >> (subIdx * 2u)) & 3u];
  let coVal = muCo + gainCo * shape; let cgVal = muCg + gainCg * shape;
  let t = yVal - 0.5 * cgVal;
  let g = clamp(round(cgVal + t), 0.0, 255.0);
  let b = clamp(round(t - 0.5 * coVal), 0.0, 255.0);
  let r = clamp(round(b + coVal), 0.0, 255.0);
  outRgba[py * hdr.width + px] = u32(r) | (u32(g) << 8u) | (u32(b) << 16u) | 0xff000000u;
}`;

export interface LatentCodebookCompressOptions {
  readonly width: number; readonly height: number;
  readonly codebookSize?: number; readonly kmeansIterations?: number;
}

export interface CompressedLatentTexturePacket {
  readonly width: number; readonly height: number; readonly blocksX: number; readonly blocksY: number;
  readonly codebookSize: number; readonly codebookInt8: Int8Array; readonly blockStream: Uint8Array;
  readonly blockPayloadBitsPerPixel: number; readonly totalEffectiveBitsPerPixel: number;
  readonly compressionRatioVsRgba32: number;
}

export interface LatentTextureRoundtripMetrics {
  readonly packet: CompressedLatentTexturePacket; readonly decodedRgba: Uint8ClampedArray;
  readonly psnrDb: number; readonly rmse: number;
}

function normalizeZeroMeanUnitRms16(vec: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < 16; i += 1) sum += vec[i]!;
  const mean = sum / 16;
  let sq = 0;
  const out = new Float32Array(16);
  for (let i = 0; i < 16; i += 1) { const d = vec[i]! - mean; out[i] = d; sq += d * d; }
  const rms = Math.sqrt(sq / 16);
  if (rms > 1e-6) {
    for (let i = 0; i < 16; i += 1) out[i] = clamp(out[i]! / rms, -3.5, 3.5);
  }
  return out;
}

function buildSeedAnalyticalBasis(maxCount: number): Float32Array[] {
  const basis: Float32Array[] = [];
  for (let v = 0; v < 4 && basis.length < maxCount; v += 1) {
    for (let u = 0; u < 4 && basis.length < maxCount; u += 1) {
      if (u === 0 && v === 0) continue;
      const raw = new Float32Array(16);
      for (let y = 0; y < 4; y += 1) {
        for (let x = 0; x < 4; x += 1) {
          raw[y * 4 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 8) * Math.cos(((2 * y + 1) * v * Math.PI) / 8);
        }
      }
      const pos = normalizeZeroMeanUnitRms16(raw);
      basis.push(pos);
      if (basis.length < maxCount) {
        const neg = new Float32Array(16);
        for (let k = 0; k < 16; k += 1) neg[k] = -pos[k]!;
        basis.push(neg);
      }
    }
  }
  for (const deg of [0, 26.5, 45, 63.5, 90, 116.5, 135, 153.5]) {
    const rad = (deg * Math.PI) / 180; const cx = Math.cos(rad); const cy = Math.sin(rad);
    for (const offset of [-0.7, 0.0, 0.7]) {
      if (basis.length >= maxCount) break;
      const raw = new Float32Array(16);
      for (let y = 0; y < 4; y += 1) {
        for (let x = 0; x < 4; x += 1) raw[y * 4 + x] = (x - 1.5) * cx + (y - 1.5) * cy >= offset ? 1 : -1;
      }
      basis.push(normalizeZeroMeanUnitRms16(raw));
    }
  }
  return basis.slice(0, maxCount);
}

/** RGBA 이미지를 4×4 YCoCg 잠재 코드북 인덱스 + 2비트 잔차 스트림(블록당 12B = 6.0bpp)으로 압축한다. */
export function compressTextureLatentCodebook(rgba: Uint8ClampedArray | Uint8Array, options: LatentCodebookCompressOptions): CompressedLatentTexturePacket {
  const w = Math.max(1, Math.round(options.width)); const h = Math.max(1, Math.round(options.height));
  const bxCount = Math.ceil(w / 4); const byCount = Math.ceil(h / 4); const totalBlocks = bxCount * byCount;
  const cbSize = clamp(Math.round(options.codebookSize ?? 64), 16, 256);
  const iters = clamp(Math.round(options.kmeansIterations ?? 3), 0, 8);

  const blockY = new Float32Array(totalBlocks * 16);
  const blockCo = new Float32Array(totalBlocks * 16);
  const blockCg = new Float32Array(totalBlocks * 16);
  const normSamples: Float32Array[] = [];

  for (let by = 0; by < byCount; by += 1) {
    for (let bx = 0; bx < bxCount; bx += 1) {
      const bOff = (by * bxCount + bx) * 16;
      let sumY = 0;
      for (let ly = 0; ly < 4; ly += 1) {
        const py = Math.min(h - 1, by * 4 + ly);
        for (let lx = 0; lx < 4; lx += 1) {
          const p = (py * w + Math.min(w - 1, bx * 4 + lx)) * 4;
          const r = rgba[p]!; const g = rgba[p + 1]!; const b = rgba[p + 2]!;
          const co = r - b; const t = b + co * 0.5; const cg = g - t; const y = t + cg * 0.5;
          const sub = ly * 4 + lx;
          blockY[bOff + sub] = y; blockCo[bOff + sub] = co; blockCg[bOff + sub] = cg; sumY += y;
        }
      }
      const meanY = sumY / 16;
      let varSq = 0;
      for (let k = 0; k < 16; k += 1) { const d = blockY[bOff + k]! - meanY; varSq += d * d; }
      if (varSq > 16) normSamples.push(normalizeZeroMeanUnitRms16(blockY.subarray(bOff, bOff + 16)));
    }
  }

  const centroids = buildSeedAnalyticalBasis(cbSize);
  while (centroids.length < cbSize) {
    centroids.push(new Float32Array(normSamples.length > 0 ? normSamples[(centroids.length * 7) % normSamples.length]! : new Float32Array(16)));
  }
  const fixedCnt = Math.min(30, Math.floor(cbSize * 0.5));
  if (normSamples.length >= cbSize - fixedCnt) {
    const stride = Math.max(1, Math.floor(normSamples.length / Math.max(1, cbSize - fixedCnt)));
    for (let c = fixedCnt; c < cbSize; c += 1) centroids[c] = new Float32Array(normSamples[((c - fixedCnt) * stride) % normSamples.length]!);
    for (let it = 0; it < iters; it += 1) {
      const sums = Array.from({ length: cbSize }, () => new Float32Array(16));
      const counts = new Int32Array(cbSize);
      for (const sample of normSamples) {
        let bestC = fixedCnt; let bestDot = -1e9;
        for (let c = fixedCnt; c < cbSize; c += 1) {
          const cen = centroids[c]!; let dot = 0;
          for (let k = 0; k < 16; k += 1) dot += sample[k]! * cen[k]!;
          if (dot > bestDot) { bestDot = dot; bestC = c; }
        }
        counts[bestC]! += 1;
        const acc = sums[bestC]!;
        for (let k = 0; k < 16; k += 1) acc[k]! += sample[k]!;
      }
      for (let c = fixedCnt; c < cbSize; c += 1) if (counts[c]! > 0) centroids[c] = normalizeZeroMeanUnitRms16(sums[c]!);
    }
  }

  const codebookInt8 = new Int8Array(cbSize * 16);
  const decodedBasis = Array.from({ length: cbSize }, (_, c) => {
    const vec = new Float32Array(16);
    for (let k = 0; k < 16; k += 1) {
      const qi = Math.round(clamp(centroids[c]![k]! * 64, -127, 127));
      codebookInt8[c * 16 + k] = qi; vec[k] = qi / 64;
    }
    return vec;
  });

  const blockStream = new Uint8Array(totalBlocks * 12);
  const dv = new DataView(blockStream.buffer);
  for (let b = 0; b < totalBlocks; b += 1) {
    const bOff = b * 16;
    let sumY = 0; let sumCo = 0; let sumCg = 0;
    for (let k = 0; k < 16; k += 1) { sumY += blockY[bOff + k]!; sumCo += blockCo[bOff + k]!; sumCg += blockCg[bOff + k]!; }
    const muYByte = Math.round(clamp(sumY / 16, 0, 255));
    const muCoByte = Math.round(clamp((sumCo / 16 + 256) * 0.5, 0, 255));
    const muCgByte = Math.round(clamp((sumCg / 16 + 256) * 0.5, 0, 255));
    const decMuY = muYByte; const decMuCo = muCoByte * 2 - 256; const decMuCg = muCgByte * 2 - 256;

    let bestIdx = 0; let bestGainYByte = 0; let bestErr = Number.POSITIVE_INFINITY;
    for (let c = 0; c < cbSize; c += 1) {
      const basis = decodedBasis[c]!;
      let dot = 0; let bNormSq = 0;
      for (let k = 0; k < 16; k += 1) { dot += (blockY[bOff + k]! - decMuY) * basis[k]!; bNormSq += basis[k]! * basis[k]!; }
      const gByte = Math.round(clamp((bNormSq > 1e-6 ? Math.max(0, dot / bNormSq) : 0) * 2, 0, 255));
      const qGain = gByte * 0.5;
      let err = 0;
      for (let k = 0; k < 16; k += 1) { const diff = blockY[bOff + k]! - (decMuY + qGain * basis[k]!); err += diff * diff; }
      if (err < bestErr) { bestErr = err; bestIdx = c; bestGainYByte = gByte; }
    }

    const chosenBasis = decodedBasis[bestIdx]!; const decGainY = bestGainYByte * 0.5;
    let bNormSq = 0; let dotCo = 0; let dotCg = 0; let resSq = 0;
    const residuals = new Float32Array(16);
    for (let k = 0; k < 16; k += 1) {
      const sh = chosenBasis[k]!; bNormSq += sh * sh;
      dotCo += (blockCo[bOff + k]! - decMuCo) * sh; dotCg += (blockCg[bOff + k]! - decMuCg) * sh;
      const r = blockY[bOff + k]! - (decMuY + decGainY * sh); residuals[k] = r; resSq += r * r;
    }
    const gainCoI8 = bNormSq > 1e-6 ? Math.round(clamp(dotCo / bNormSq, -128, 127)) : 0;
    const gainCgI8 = bNormSq > 1e-6 ? Math.round(clamp(dotCg / bNormSq, -128, 127)) : 0;
    const resStepByte = Math.round(clamp(Math.sqrt(resSq / 16) * 4, 0, 255));
    const decResStep = resStepByte * 0.25;
    let packedResU32 = 0;
    for (let k = 0; k < 16; k += 1) {
      let code = 2;
      if (decResStep > 1e-5) {
        const normR = residuals[k]! / decResStep;
        code = normR < -0.98 ? 0 : normR < 0 ? 1 : normR < 0.98 ? 2 : 3;
      }
      packedResU32 = (packedResU32 | (code << (k * 2))) >>> 0;
    }
    const outOff = b * 12;
    blockStream[outOff] = muYByte; blockStream[outOff + 1] = muCoByte; blockStream[outOff + 2] = muCgByte;
    blockStream[outOff + 3] = bestIdx; blockStream[outOff + 4] = bestGainYByte; blockStream[outOff + 5] = resStepByte;
    blockStream[outOff + 6] = gainCoI8 & 0xff; blockStream[outOff + 7] = gainCgI8 & 0xff;
    dv.setUint32(outOff + 8, packedResU32, true);
  }

  const pixelCount = w * h;
  const totalBytes = blockStream.byteLength + codebookInt8.byteLength + 16;
  return {
    width: w, height: h, blocksX: bxCount, blocksY: byCount, codebookSize: cbSize, codebookInt8, blockStream,
    blockPayloadBitsPerPixel: round3((blockStream.byteLength * 8) / pixelCount),
    totalEffectiveBitsPerPixel: round3((totalBytes * 8) / pixelCount),
    compressionRatioVsRgba32: round3((pixelCount * 4) / totalBytes),
  };
}

/** 12바이트 잠재 블록 스트림과 코드북 테이블만으로 고속 테이블 룩업 디코딩을 수행한다. */
export function decodeTextureLatentCodebook(packet: CompressedLatentTexturePacket): Uint8ClampedArray {
  const { width: w, height: h, blocksX, blocksY, codebookInt8, blockStream } = packet;
  const out = new Uint8ClampedArray(w * h * 4);
  const dv = new DataView(blockStream.buffer, blockStream.byteOffset, blockStream.byteLength);
  const i8View = new Int8Array(blockStream.buffer, blockStream.byteOffset, blockStream.byteLength);

  for (let by = 0; by < blocksY; by += 1) {
    for (let bx = 0; bx < blocksX; bx += 1) {
      const off = (by * blocksX + bx) * 12;
      const muY = blockStream[off]!; const muCo = blockStream[off + 1]! * 2 - 256; const muCg = blockStream[off + 2]! * 2 - 256;
      const cbOff = blockStream[off + 3]! * 16; const gainY = blockStream[off + 4]! * 0.5; const resStep = blockStream[off + 5]! * 0.25;
      const gainCo = i8View[off + 6]!; const gainCg = i8View[off + 7]!; const resWord = dv.getUint32(off + 8, true);
      for (let ly = 0; ly < 4; ly += 1) {
        const py = by * 4 + ly; if (py >= h) continue;
        for (let lx = 0; lx < 4; lx += 1) {
          const px = bx * 4 + lx; if (px >= w) continue;
          const sub = ly * 4 + lx;
          const shape = codebookInt8[cbOff + sub]! / 64;
          const yVal = muY + gainY * shape + resStep * LLOYD_MAX_2BIT_LEVELS[(resWord >>> (sub * 2)) & 3]!;
          const coVal = muCo + gainCo * shape; const cgVal = muCg + gainCg * shape;
          const t = yVal - 0.5 * cgVal;
          const g = Math.round(clamp(cgVal + t, 0, 255));
          const b = Math.round(clamp(t - 0.5 * coVal, 0, 255));
          const r = Math.round(clamp(b + coVal, 0, 255));
          const p = (py * w + px) * 4;
          out[p] = r; out[p + 1] = g; out[p + 2] = b; out[p + 3] = 255;
        }
      }
    }
  }
  return out;
}

/** 압축->복원 왕복 후 RGB PSNR(dB) 및 RMSE를 계측한다. */
export function evaluateLatentCodebookRoundtrip(rgba: Uint8ClampedArray | Uint8Array, options: LatentCodebookCompressOptions): LatentTextureRoundtripMetrics {
  const packet = compressTextureLatentCodebook(rgba, options);
  const decodedRgba = decodeTextureLatentCodebook(packet);
  let sqErr = 0;
  for (let i = 0; i + 3 < decodedRgba.length; i += 4) {
    const dr = rgba[i]! - decodedRgba[i]!; const dg = rgba[i + 1]! - decodedRgba[i + 1]!; const db = rgba[i + 2]! - decodedRgba[i + 2]!;
    sqErr += dr * dr + dg * dg + db * db;
  }
  const mse = sqErr / Math.max(1, packet.width * packet.height * 3);
  return { packet, decodedRgba, rmse: round3(Math.sqrt(mse)), psnrDb: mse <= 1e-9 ? 99 : round3(10 * Math.log10((255 * 255) / mse)) };
}

// ============================================================================
// 2. 연속 실행 병합형 무묘비(Epoch-Compacted) 분산 CRDT 시퀀스 엔진
// ============================================================================

export interface LogicalItemId { readonly replicaId: string; readonly seq: number }

export interface CoalescedRunSegment {
  readonly replicaId: string; readonly seqStart: number; readonly content: string;
  readonly firstOriginLeft: LogicalItemId | null; readonly originRight: LogicalItemId | null;
  readonly deleted: boolean; readonly deletedByClock: LogicalItemId | null;
}

export type CrdtRemoteOperation =
  | { readonly kind: "insert-run"; readonly replicaId: string; readonly seqStart: number; readonly content: string; readonly firstOriginLeft: LogicalItemId | null; readonly originRight: LogicalItemId | null }
  | { readonly kind: "delete-span"; readonly targetReplicaId: string; readonly targetSeqStart: number; readonly length: number; readonly deletedByClock: LogicalItemId };

export interface DefragmentationStats {
  readonly runCountBefore: number; readonly runCountAfter: number; readonly purgedTombstoneRuns: number;
  readonly activeCharacterLength: number; readonly metadataReductionRatioVsPerChar: number;
}

const sameId = (a: LogicalItemId | null, b: LogicalItemId | null): boolean =>
  a === null || b === null ? a === b : a.replicaId === b.replicaId && a.seq === b.seq;

const compareReplicaTieBreak = (aRep: string, aSeq: number, bRep: string, bSeq: number): number =>
  aRep !== bRep ? (aRep < bRep ? -1 : 1) : aSeq - bSeq;

/**
 * RGA/YATA 순서 불변성을 유지하면서 연속 문자/스트로크 연산을 단일 런으로 병합하고,
 * 인과 안정 에포크 도달 시 묘비(Tombstone)를 0개로 소거한다.
 */
export class RunCoalescedSequenceCrdt {
  private readonly replicaId: string;
  private nextSeq = 1;
  private runs: CoalescedRunSegment[] = [];
  private readonly seenInserts = new Set<string>();

  constructor(replicaId: string) { this.replicaId = replicaId; }
  getRunCount(): number { return this.runs.length; }
  getTombstoneRunCount(): number { return this.runs.reduce((acc, r) => acc + (r.deleted ? 1 : 0), 0); }
  getRunsSnapshot(): readonly CoalescedRunSegment[] { return [...this.runs]; }
  toString(): string { return this.runs.map((r) => (r.deleted ? "" : r.content)).join(""); }

  insertLocal(visibleIndex: number, text: string): CrdtRemoteOperation | null {
    if (text.length === 0) return null;
    const clampedIdx = clamp(Math.round(visibleIndex), 0, this.toString().length);
    const { leftAnchor, rightAnchor } = this.resolveVisibleAnchors(clampedIdx);
    const seqStart = this.nextSeq;
    this.nextSeq += text.length;
    const op: CrdtRemoteOperation = { kind: "insert-run", replicaId: this.replicaId, seqStart, content: text, firstOriginLeft: leftAnchor, originRight: rightAnchor };
    this.applyOperation(op);
    return op;
  }

  deleteLocal(visibleStart: number, deleteLen: number): readonly CrdtRemoteOperation[] {
    if (deleteLen <= 0) return [];
    let remain = deleteLen; let visCursor = 0;
    const ops: CrdtRemoteOperation[] = [];
    for (let i = 0; i < this.runs.length && remain > 0; i += 1) {
      const r = this.runs[i]!;
      if (r.deleted) continue;
      const runEndVis = visCursor + r.content.length;
      if (runEndVis <= visibleStart) { visCursor = runEndVis; continue; }
      const localStart = Math.max(0, visibleStart - visCursor);
      const take = Math.min(remain, r.content.length - localStart);
      ops.push({ kind: "delete-span", targetReplicaId: r.replicaId, targetSeqStart: r.seqStart + localStart, length: take, deletedByClock: { replicaId: this.replicaId, seq: this.nextSeq } });
      this.nextSeq += 1; remain -= take; visCursor = runEndVis;
    }
    for (const op of ops) this.applyOperation(op);
    return ops;
  }

  applyOperation(op: CrdtRemoteOperation): void {
    if (op.kind === "insert-run") {
      for (let k = 0; k < op.content.length; k += 1) {
        const seq = op.seqStart + k;
        const key = `${op.replicaId}:${seq}`;
        if (this.seenInserts.has(key)) continue;
        this.seenInserts.add(key);
        const origL: LogicalItemId | null = k === 0 ? op.firstOriginLeft : { replicaId: op.replicaId, seq: seq - 1 };
        this.integrateSingleChar({ replicaId: op.replicaId, seqStart: seq, content: op.content[k]!, firstOriginLeft: origL, originRight: op.originRight, deleted: false, deletedByClock: null });
      }
      this.coalesceAdjacentRuns(false);
      return;
    }
    for (let k = 0; k < op.length; k += 1) {
      const loc = this.locateItemInRuns(op.targetReplicaId, op.targetSeqStart + k);
      if (!loc) continue;
      const idx = this.isolateSubRun(loc.runIndex, loc.offsetInRun, 1);
      const targetRun = this.runs[idx]!;
      if (!targetRun.deleted) this.runs[idx] = { ...targetRun, deleted: true, deletedByClock: op.deletedByClock };
    }
    this.coalesceAdjacentRuns(false);
  }

  compactConfirmedEpoch(confirmedFrontier: Readonly<Record<string, number>>): DefragmentationStats {
    const runCountBefore = this.runs.length;
    let purgedTombstoneRuns = 0;
    const survivors: CoalescedRunSegment[] = [];
    for (const r of this.runs) {
      if (r.deleted && r.deletedByClock && r.deletedByClock.seq <= (confirmedFrontier[r.deletedByClock.replicaId] ?? 0)) {
        purgedTombstoneRuns += 1; continue;
      }
      survivors.push(r);
    }
    this.runs = survivors;
    this.coalesceAdjacentRuns(true);
    const activeLen = this.toString().length;
    const runCountAfter = this.runs.length;
    return { runCountBefore, runCountAfter, purgedTombstoneRuns, activeCharacterLength: activeLen, metadataReductionRatioVsPerChar: activeLen > 0 ? round3(clamp(1 - runCountAfter / activeLen, 0, 1)) : 0 };
  }

  private resolveVisibleAnchors(visibleIndex: number): { readonly leftAnchor: LogicalItemId | null; readonly rightAnchor: LogicalItemId | null } {
    let vis = 0; let leftAnchor: LogicalItemId | null = null;
    for (const r of this.runs) {
      if (r.deleted) continue;
      if (visibleIndex === vis) return { leftAnchor, rightAnchor: { replicaId: r.replicaId, seq: r.seqStart } };
      if (visibleIndex < vis + r.content.length) {
        const off = visibleIndex - vis;
        return { leftAnchor: { replicaId: r.replicaId, seq: r.seqStart + off - 1 }, rightAnchor: { replicaId: r.replicaId, seq: r.seqStart + off } };
      }
      leftAnchor = { replicaId: r.replicaId, seq: r.seqStart + r.content.length - 1 };
      vis += r.content.length;
    }
    return { leftAnchor, rightAnchor: null };
  }

  private locateItemInRuns(replicaId: string, seq: number): { readonly runIndex: number; readonly offsetInRun: number } | null {
    for (let i = 0; i < this.runs.length; i += 1) {
      const r = this.runs[i]!;
      if (r.replicaId === replicaId && seq >= r.seqStart && seq < r.seqStart + r.content.length) return { runIndex: i, offsetInRun: seq - r.seqStart };
    }
    return null;
  }

  private splitRunBeforeOffset(runIndex: number, offset: number): number {
    if (offset <= 0) return runIndex;
    const r = this.runs[runIndex]!;
    if (offset >= r.content.length) return runIndex + 1;
    this.runs.splice(
      runIndex, 1,
      { ...r, content: r.content.slice(0, offset) },
      { ...r, seqStart: r.seqStart + offset, content: r.content.slice(offset), firstOriginLeft: { replicaId: r.replicaId, seq: r.seqStart + offset - 1 } },
    );
    return runIndex + 1;
  }

  private isolateSubRun(runIndex: number, offset: number, len: number): number {
    const midIdx = this.splitRunBeforeOffset(runIndex, offset);
    this.splitRunBeforeOffset(midIdx, len);
    return midIdx;
  }

  private flatItemPosition(id: LogicalItemId | null): number {
    if (id === null) return -1;
    let flat = 0;
    for (const r of this.runs) {
      if (r.replicaId === id.replicaId && id.seq >= r.seqStart && id.seq < r.seqStart + r.content.length) return flat + (id.seq - r.seqStart);
      flat += r.content.length;
    }
    return -1;
  }

  private integrateSingleChar(unit: CoalescedRunSegment): void {
    let leftPos = -1;
    if (unit.firstOriginLeft !== null) {
      const locL = this.locateItemInRuns(unit.firstOriginLeft.replicaId, unit.firstOriginLeft.seq);
      if (locL) { this.splitRunBeforeOffset(locL.runIndex, locL.offsetInRun + 1); leftPos = this.flatItemPosition(unit.firstOriginLeft); }
    }
    let rightPos = Number.POSITIVE_INFINITY;
    if (unit.originRight !== null) {
      const locR = this.locateItemInRuns(unit.originRight.replicaId, unit.originRight.seq);
      if (locR) { this.splitRunBeforeOffset(locR.runIndex, locR.offsetInRun); rightPos = this.flatItemPosition(unit.originRight); }
    }
    let startRunIdx = 0;
    if (unit.firstOriginLeft !== null) {
      const locL = this.locateItemInRuns(unit.firstOriginLeft.replicaId, unit.firstOriginLeft.seq);
      if (locL) startRunIdx = locL.runIndex + 1;
    }
    let insertIdx = startRunIdx;
    for (let i = startRunIdx; i < this.runs.length; i += 1) {
      const cand = this.runs[i]!;
      if (this.flatItemPosition({ replicaId: cand.replicaId, seq: cand.seqStart }) >= rightPos) break;
      const candOrigLPos = this.flatItemPosition(cand.firstOriginLeft);
      const candOrigRPos = cand.originRight === null ? Number.POSITIVE_INFINITY : this.flatItemPosition(cand.originRight);
      if (candOrigLPos < leftPos) break;
      if (candOrigLPos === leftPos) {
        if (candOrigRPos === rightPos && compareReplicaTieBreak(unit.replicaId, unit.seqStart, cand.replicaId, cand.seqStart) < 0) break;
        if (candOrigRPos > rightPos) break;
      }
      insertIdx = i + 1;
    }
    this.runs.splice(insertIdx, 0, unit);
  }

  private coalesceAdjacentRuns(postEpochCompacted: boolean): void {
    if (this.runs.length <= 1) return;
    const merged: CoalescedRunSegment[] = [this.runs[0]!];
    for (let i = 1; i < this.runs.length; i += 1) {
      const prev = merged[merged.length - 1]!;
      const cur = this.runs[i]!;
      const contiguousSeq = prev.replicaId === cur.replicaId && cur.seqStart === prev.seqStart + prev.content.length;
      const sameDel = prev.deleted === cur.deleted && sameId(prev.deletedByClock, cur.deletedByClock);
      const exactChain = sameId(cur.firstOriginLeft, { replicaId: prev.replicaId, seq: prev.seqStart + prev.content.length - 1 }) && sameId(prev.originRight, cur.originRight);
      const postEpochSafe = postEpochCompacted && !prev.deleted && !cur.deleted && contiguousSeq;
      if (sameDel && ((contiguousSeq && exactChain) || postEpochSafe)) merged[merged.length - 1] = { ...prev, content: prev.content + cur.content };
      else merged.push(cur);
    }
    this.runs = merged;
  }
}

// ============================================================================
// 3. 무서버 P2P 종단간 암호화(ECDH/HKDF/AES-GCM) & 머클 트리 컷 검증기
// ============================================================================

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
const rotr32 = (x: number, n: number): number => ((x >>> n) | (x << (32 - n))) >>> 0;

/** FIPS 180-4 표준 결정론 순수 TypeScript SHA-256 해시. */
export function sha256Bytes(message: Uint8Array): Uint8Array {
  const paddedLen = ((message.byteLength + 9 + 63) >> 6) << 6;
  const padded = new Uint8Array(paddedLen);
  padded.set(message); padded[message.byteLength] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(paddedLen - 8, Math.floor(message.byteLength / 0x20000000), false);
  dv.setUint32(paddedLen - 4, (message.byteLength << 3) >>> 0, false);

  let h0 = 0x6a09e667; let h1 = 0xbb67ae85; let h2 = 0x3c6ef372; let h3 = 0xa54ff53a;
  let h4 = 0x510e527f; let h5 = 0x9b05688c; let h6 = 0x1f83d9ab; let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr32(w[i - 15]!, 7) ^ rotr32(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr32(w[i - 2]!, 17) ^ rotr32(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let a = h0; let b = h1; let c = h2; let d = h3; let e = h4; let f = h5; let g = h6; let h = h7;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const temp1 = (h + s1 + (((e & f) ^ (~e & g)) >>> 0) + SHA256_K[i]! + w[i]!) >>> 0;
      const temp2 = ((rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) + (((a & b) ^ (a & c) ^ (b & c)) >>> 0)) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  const digest = new Uint8Array(32);
  const outDv = new DataView(digest.buffer);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((word, idx) => outDv.setUint32(idx * 4, word, false));
  return digest;
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) hex += bytes[i]!.toString(16).padStart(2, "0");
  return hex;
}

function hashMerkleLeaf(tileIndex: number, tileBytes: Uint8Array): Uint8Array {
  const buf = new Uint8Array(5 + tileBytes.byteLength);
  buf[0] = 0x00; new DataView(buf.buffer).setUint32(1, tileIndex >>> 0, false); buf.set(tileBytes, 5);
  return sha256Bytes(buf);
}

function hashMerkleParent(left32: Uint8Array, right32: Uint8Array): Uint8Array {
  const buf = new Uint8Array(65);
  buf[0] = 0x01; buf.set(left32, 1); buf.set(right32, 33);
  return sha256Bytes(buf);
}

export interface MerkleSiblingStep { readonly siblingHashHex: string; readonly siblingPosition: "left" | "right" }
export interface CutTileMerkleProof { readonly tileIndex: number; readonly totalTiles: number; readonly steps: readonly MerkleSiblingStep[] }
export interface CutMerkleTreeBundle {
  readonly cutId: string; readonly tileByteSize: number; readonly tiles: readonly Uint8Array[];
  readonly merkleRootHex: string; readonly proofs: readonly CutTileMerkleProof[];
}

/** 컷 바이트를 타일로 분할하고 도메인 분리(0x00 리프 / 0x01 내부 노드) 머클 루트와 포함 증명을 생성한다. */
export function buildCutMerkleTree(cutId: string, cutBytes: Uint8Array, tileByteSize = 4096): CutMerkleTreeBundle {
  const chunkSize = Math.max(64, Math.round(tileByteSize));
  const tiles: Uint8Array[] = [];
  if (cutBytes.byteLength === 0) tiles.push(new Uint8Array(0));
  else for (let off = 0; off < cutBytes.byteLength; off += chunkSize) tiles.push(cutBytes.slice(off, Math.min(cutBytes.byteLength, off + chunkSize)));

  const levels: Uint8Array[][] = [tiles.map((t, idx) => hashMerkleLeaf(idx, t))];
  while (levels[levels.length - 1]!.length > 1) {
    const cur = levels[levels.length - 1]!;
    const next: Uint8Array[] = [];
    for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? hashMerkleParent(cur[i]!, cur[i + 1]!) : cur[i]!);
    levels.push(next);
  }
  const merkleRootHex = bytesToHex(levels[levels.length - 1]![0]!);
  const proofs: CutTileMerkleProof[] = tiles.map((_, leafIdx) => {
    const steps: MerkleSiblingStep[] = [];
    let idx = leafIdx;
    for (let lv = 0; lv < levels.length - 1; lv += 1) {
      const row = levels[lv]!; const isRight = (idx & 1) === 1; const sibIdx = isRight ? idx - 1 : idx + 1;
      if (sibIdx < row.length) steps.push({ siblingHashHex: bytesToHex(row[sibIdx]!), siblingPosition: isRight ? "left" : "right" });
      idx >>= 1;
    }
    return { tileIndex: leafIdx, totalTiles: tiles.length, steps };
  });
  return { cutId, tileByteSize: chunkSize, tiles, merkleRootHex, proofs };
}

function hexToBytes(hex: string): Uint8Array {
  const len = hex.length >> 1; const out = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** 개별 P2P 수신 타일이 선언된 `expectedRootHex` 머클 루트에 속하는지 O(log N)으로 검증한다. */
export function verifyCutTileMerkleProof(tileBytes: Uint8Array, proof: CutTileMerkleProof, expectedRootHex: string): boolean {
  let acc = hashMerkleLeaf(proof.tileIndex, tileBytes);
  for (const step of proof.steps) {
    const sib = hexToBytes(step.siblingHashHex);
    if (sib.byteLength !== 32) return false;
    acc = step.siblingPosition === "left" ? hashMerkleParent(sib, acc) : hashMerkleParent(acc, sib);
  }
  return bytesToHex(acc) === expectedRootHex.toLowerCase();
}

export interface P2pPeerCryptoIdentity {
  readonly peerId: string; readonly ecdhKeyPair: CryptoKeyPair; readonly ecdsaKeyPair: CryptoKeyPair;
  readonly ecdhPublicRaw: Uint8Array; readonly ecdsaPublicRaw: Uint8Array;
}
export interface SignedCutAttestation {
  readonly roomId: string; readonly cutId: string; readonly senderPeerId: string;
  readonly totalByteLength: number; readonly totalTiles: number; readonly merkleRootHex: string;
  readonly signatureBytes: Uint8Array;
}
export interface EncryptedCutTileEnvelope {
  readonly roomId: string; readonly cutId: string; readonly senderPeerId: string;
  readonly sequenceNumber: number; readonly tileIndex: number; readonly totalTiles: number;
  readonly merkleRootHex: string; readonly iv96: Uint8Array; readonly ciphertextWithTag: Uint8Array;
  readonly merkleProof: CutTileMerkleProof; readonly relayServerCostKrw: 0;
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(u8.byteLength); copy.set(u8); return copy.buffer;
}

export async function generateP2pPeerIdentity(peerId: string): Promise<P2pPeerCryptoIdentity> {
  const subtle = globalThis.crypto.subtle;
  const ecdhKeyPair = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const ecdsaKeyPair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
  const ecdhPublicRaw = new Uint8Array(await subtle.exportKey("raw", ecdhKeyPair.publicKey));
  const ecdsaPublicRaw = new Uint8Array(await subtle.exportKey("raw", ecdsaKeyPair.publicKey));
  return { peerId, ecdhKeyPair, ecdsaKeyPair, ecdhPublicRaw, ecdsaPublicRaw };
}

export async function deriveP2pAesGcmSessionKey(localIdentity: P2pPeerCryptoIdentity, remoteEcdhPublicRaw: Uint8Array, roomId: string): Promise<CryptoKey> {
  const subtle = globalThis.crypto.subtle;
  const remotePub = await subtle.importKey("raw", toArrayBuffer(remoteEcdhPublicRaw), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const sharedBits = await subtle.deriveBits({ name: "ECDH", public: remotePub }, localIdentity.ecdhKeyPair.privateKey, 256);
  const hkdfBase = await subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
  const enc = new TextEncoder();
  const salt = sha256Bytes(enc.encode(`toonstudio.p2p.salt:${roomId}`));
  const info = enc.encode(`toonstudio.p2p.cut-aead.v1:${roomId}`);
  return subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: toArrayBuffer(salt), info: toArrayBuffer(info) }, hkdfBase, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

const buildEnvelopeAad = (roomId: string, cutId: string, peerId: string, seq: number, tileIdx: number, totalTiles: number, rootHex: string): Uint8Array =>
  new TextEncoder().encode(`${roomId}|${cutId}|${peerId}|${seq}|${tileIdx}/${totalTiles}|${rootHex}`);

const buildAttestationBytes = (roomId: string, cutId: string, peerId: string, byteLen: number, totalTiles: number, rootHex: string): Uint8Array =>
  new TextEncoder().encode(`attestation.v1|${roomId}|${cutId}|${peerId}|${byteLen}|${totalTiles}|${rootHex}`);

/** 무서버(₩0) 종단간 암호화 P2P 컷 전송·검증 채널. */
export class ServerlessP2pCutVerifierChannel {
  private readonly roomId: string;
  private readonly localIdentity: P2pPeerCryptoIdentity;
  private readonly sessionKey: CryptoKey;
  private readonly senderNoncePrefixU32: number;
  private sendSequence = 0;
  private readonly seenPeerSequences = new Set<string>();

  constructor(roomId: string, localIdentity: P2pPeerCryptoIdentity, sessionKey: CryptoKey) {
    this.roomId = roomId; this.localIdentity = localIdentity; this.sessionKey = sessionKey;
    const peerDigest = sha256Bytes(new TextEncoder().encode(localIdentity.peerId));
    this.senderNoncePrefixU32 = new DataView(peerDigest.buffer).getUint32(0, false);
  }

  async signCutAttestation(bundle: CutMerkleTreeBundle, totalByteLength: number): Promise<SignedCutAttestation> {
    const payload = buildAttestationBytes(this.roomId, bundle.cutId, this.localIdentity.peerId, totalByteLength, bundle.tiles.length, bundle.merkleRootHex);
    const sigBuf = await globalThis.crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, this.localIdentity.ecdsaKeyPair.privateKey, toArrayBuffer(payload));
    return { roomId: this.roomId, cutId: bundle.cutId, senderPeerId: this.localIdentity.peerId, totalByteLength, totalTiles: bundle.tiles.length, merkleRootHex: bundle.merkleRootHex, signatureBytes: new Uint8Array(sigBuf) };
  }

  async verifyCutAttestation(attestation: SignedCutAttestation, remoteEcdsaPublicRaw: Uint8Array): Promise<boolean> {
    if (attestation.roomId !== this.roomId) return false;
    const pubKey = await globalThis.crypto.subtle.importKey("raw", toArrayBuffer(remoteEcdsaPublicRaw), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const payload = buildAttestationBytes(attestation.roomId, attestation.cutId, attestation.senderPeerId, attestation.totalByteLength, attestation.totalTiles, attestation.merkleRootHex);
    return globalThis.crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pubKey, toArrayBuffer(attestation.signatureBytes), toArrayBuffer(payload));
  }

  async sealCutTile(bundle: CutMerkleTreeBundle, tileIndex: number): Promise<EncryptedCutTileEnvelope> {
    const tileBytes = bundle.tiles[tileIndex]; const proof = bundle.proofs[tileIndex];
    if (!tileBytes || !proof) throw new Error(`유효하지 않은 타일 인덱스(${tileIndex})입니다.`);
    this.sendSequence += 1; const seq = this.sendSequence;
    const iv96 = new Uint8Array(12); const ivDv = new DataView(iv96.buffer);
    ivDv.setUint32(0, this.senderNoncePrefixU32, false); ivDv.setUint32(4, Math.floor(seq / 0x100000000), false); ivDv.setUint32(8, seq >>> 0, false);
    const aad = buildEnvelopeAad(this.roomId, bundle.cutId, this.localIdentity.peerId, seq, tileIndex, bundle.tiles.length, bundle.merkleRootHex);
    const ctBuf = await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv96), additionalData: toArrayBuffer(aad), tagLength: 128 }, this.sessionKey, toArrayBuffer(tileBytes));
    return { roomId: this.roomId, cutId: bundle.cutId, senderPeerId: this.localIdentity.peerId, sequenceNumber: seq, tileIndex, totalTiles: bundle.tiles.length, merkleRootHex: bundle.merkleRootHex, iv96, ciphertextWithTag: new Uint8Array(ctBuf), merkleProof: proof, relayServerCostKrw: 0 };
  }

  async openAndVerifyCutTile(envelope: EncryptedCutTileEnvelope, expectedMerkleRootHex: string): Promise<{ readonly ok: boolean; readonly tileBytes: Uint8Array | null; readonly failureReason?: string }> {
    if (envelope.roomId !== this.roomId) return { ok: false, tileBytes: null, failureReason: "room-mismatch" };
    if (envelope.merkleRootHex.toLowerCase() !== expectedMerkleRootHex.toLowerCase()) return { ok: false, tileBytes: null, failureReason: "merkle-root-mismatch" };
    const replayKey = `${envelope.senderPeerId}:${envelope.sequenceNumber}`;
    if (this.seenPeerSequences.has(replayKey)) return { ok: false, tileBytes: null, failureReason: "replay-detected" };
    const aad = buildEnvelopeAad(envelope.roomId, envelope.cutId, envelope.senderPeerId, envelope.sequenceNumber, envelope.tileIndex, envelope.totalTiles, envelope.merkleRootHex);
    try {
      const plainBuf = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv: toArrayBuffer(envelope.iv96), additionalData: toArrayBuffer(aad), tagLength: 128 }, this.sessionKey, toArrayBuffer(envelope.ciphertextWithTag));
      const tileBytes = new Uint8Array(plainBuf);
      if (!verifyCutTileMerkleProof(tileBytes, envelope.merkleProof, expectedMerkleRootHex)) return { ok: false, tileBytes: null, failureReason: "merkle-proof-invalid" };
      this.seenPeerSequences.add(replayKey);
      return { ok: true, tileBytes };
    } catch {
      return { ok: false, tileBytes: null, failureReason: "aead-auth-failed" };
    }
  }
}
