/**
 * GF(2^8) (`0x11d` 원시 다항식) 리드-솔로몬(Reed-Solomon) 소거·신드롬 복구 기반
 * 오프라인 비주얼 시드 백업 키트.
 *
 * - 클라우드 서버 비용 0원(₩0), 인터넷 연결 없이 종이 시드 카드·QR 분할 조각만으로
 *   브러시 프리셋, OKLCH 캐릭터 팔레트, Ed25519 공개키 지문을 100% 비트 단위로 복원한다.
 * - 갈루아 체 `GF(256)`(`x^8 + x^4 + x^3 + x^2 + 1`, `0x11d`) 위에서
 *   1) 코시(Cauchy) 조직적(Systematic) 생성 행렬 및 가우스-조르당 역행렬 소거 복호기,
 *   2) 다항식 신드롬·벌레캠프-매시(Berlekamp-Massey)·치엔(Chien)·포니(Forney) 오류+소거 동시 복호기를
 *   모두 구현해 최대 `2t`개의 유실/손상 샤드 및 `2v + e <= 2t` 복합 오류를 무손실 복구한다.
 */

export const GF256_PRIMITIVE_POLY = 0x11d;
export const GF256_FIELD_ORDER = 255;
export const SEED_BACKUP_SCHEMA_VERSION = 1;

export interface OfflineBrushPresetSeed {
  readonly id: string;
  readonly nameKo: string;
  readonly sizePx: number;
  readonly minSizeRatio: number;
  readonly streamline: number;
  readonly pressureGamma: number;
  readonly spacingRatio: number;
  readonly tipShape: "g-pen" | "maru-pen" | "pencil" | "flat-bristle" | "watercolor";
}

export interface OklchSwatchSeed {
  readonly slotNameKo: string;
  readonly l: number;
  readonly c: number;
  readonly h: number;
  readonly alpha: number;
}

export interface OfflineOklchPaletteSeed {
  readonly characterId: string;
  readonly characterNameKo: string;
  readonly swatches: readonly OklchSwatchSeed[];
}

export interface OfflineEd25519FingerprintSeed {
  readonly keyId: string;
  readonly ownerLabelKo: string;
  readonly algorithm: "Ed25519";
  readonly publicKeyBytes: readonly number[];
  readonly fingerprintHex: string;
}

export interface CreatorVisualSeedBundle {
  readonly schemaVersion: typeof SEED_BACKUP_SCHEMA_VERSION;
  readonly bundleId: string;
  readonly createdAtIso: string;
  readonly brushPresets: readonly OfflineBrushPresetSeed[];
  readonly characterPalettes: readonly OfflineOklchPaletteSeed[];
  readonly ed25519KeyFingerprints: readonly OfflineEd25519FingerprintSeed[];
}

export interface ReedSolomonCodewordDecodeResult {
  readonly codeword: Uint8Array;
  readonly message: Uint8Array;
  readonly correctedPositions: readonly number[];
  readonly unknownErrorCount: number;
  readonly erasureCount: number;
}

export interface VisualSeedShardPacket {
  readonly shardIndex: number;
  readonly totalShards: number;
  readonly dataShards: number;
  readonly parityShards: number;
  readonly errorToleranceT: number;
  readonly originalByteLength: number;
  readonly payloadCrc32: number;
  readonly shardCrc32: number;
  readonly symbols: Uint8Array;
  readonly visualArmorCode: string;
}

export interface VisualSeedBackupKit {
  readonly dataShards: number;
  readonly parityShards: number;
  readonly totalShards: number;
  readonly errorToleranceT: number;
  readonly originalBytes: Uint8Array;
  readonly payloadCrc32: number;
  readonly shards: readonly VisualSeedShardPacket[];
  readonly serverCostKrw: 0;
}

export interface VisualSeedRecoveryOptions {
  readonly treatCorruptedShardCrcAsErasure?: boolean;
}

export interface VisualSeedRecoveryResult {
  readonly bundle: CreatorVisualSeedBundle;
  readonly recoveredBytes: Uint8Array;
  readonly payloadCrc32: number;
  readonly erasedShardIndices: readonly number[];
  readonly healedSymbolCount: number;
  readonly serverCostKrw: 0;
}

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
const CRC32_TABLE = new Uint32Array(256);

(function initTables(): void {
  let x = 1;
  for (let i = 0; i < GF256_FIELD_ORDER; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if ((x & 0x100) !== 0) x ^= GF256_PRIMITIVE_POLY;
  }
  for (let i = GF256_FIELD_ORDER; i < 512; i += 1) {
    GF_EXP[i] = GF_EXP[i - GF256_FIELD_ORDER]!;
  }
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1;
    }
    CRC32_TABLE[i] = c >>> 0;
  }
})();

export function gf256Add(a: number, b: number): number {
  return (a ^ b) & 0xff;
}

export function gf256Mul(a: number, b: number): number {
  const aa = a & 0xff;
  const bb = b & 0xff;
  return aa === 0 || bb === 0 ? 0 : GF_EXP[GF_LOG[aa]! + GF_LOG[bb]!]!;
}

export function gf256Div(a: number, b: number): number {
  const aa = a & 0xff;
  const bb = b & 0xff;
  if (bb === 0) throw new RangeError("GF(256)에서 0으로 나눌 수 없습니다.");
  return aa === 0 ? 0 : GF_EXP[GF_LOG[aa]! + GF256_FIELD_ORDER - GF_LOG[bb]!]!;
}

export function gf256Inv(a: number): number {
  const aa = a & 0xff;
  if (aa === 0) throw new RangeError("GF(256)에서 0의 곱셈 역원은 존재하지 않습니다.");
  return GF_EXP[GF256_FIELD_ORDER - GF_LOG[aa]!]!;
}

export function gf256Pow(a: number, exponent: number): number {
  if (exponent === 0) return 1;
  const aa = a & 0xff;
  if (aa === 0) return 0;
  const modExp = ((exponent % GF256_FIELD_ORDER) + GF256_FIELD_ORDER) % GF256_FIELD_ORDER;
  return GF_EXP[(GF_LOG[aa]! * modExp) % GF256_FIELD_ORDER]!;
}

/** IEEE 802.3 CRC-32 무결성 체크섬 계산. */
export function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = (CRC32_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** GF(256) 위에서 크기 `(K + P) x K`인 코시 조직적 생성 행렬을 구성한다. */
export function buildCauchySystematicMatrix(dataShards: number, parityShards: number): Uint8Array {
  if (dataShards < 1 || parityShards < 1 || dataShards + parityShards > 256) {
    throw new RangeError("코시 생성 행렬 차원은 K >= 1, P >= 1, K + P <= 256이어야 합니다.");
  }
  const matrix = new Uint8Array((dataShards + parityShards) * dataShards);
  for (let r = 0; r < dataShards; r += 1) matrix[r * dataShards + r] = 1;
  for (let p = 0; p < parityShards; p += 1) {
    const rowOff = (dataShards + p) * dataShards;
    for (let c = 0; c < dataShards; c += 1) {
      matrix[rowOff + c] = gf256Inv(p ^ (parityShards + c));
    }
  }
  return matrix;
}

/** GF(256) 가우스-조르당 피벗 소거법으로 `size x size` 정방행렬의 역행렬을 구한다. */
export function invertGf256Matrix(squareMatrix: Uint8Array, size: number): Uint8Array {
  if (size < 1 || squareMatrix.length < size * size) {
    throw new RangeError("GF(256) 역행렬 입력 크기가 올바르지 않습니다.");
  }
  const width = 2 * size;
  const work = new Uint8Array(size * width);
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) work[r * width + c] = squareMatrix[r * size + c]!;
    work[r * width + size + r] = 1;
  }

  for (let col = 0; col < size; col += 1) {
    let pivotRow = -1;
    for (let r = col; r < size; r += 1) {
      if (work[r * width + col]! !== 0) {
        pivotRow = r;
        break;
      }
    }
    if (pivotRow < 0) throw new Error("특이 행렬은 GF(256)에서 역행렬이 존재하지 않습니다.");
    if (pivotRow !== col) {
      for (let c = 0; c < width; c += 1) {
        const tmp = work[col * width + c]!;
        work[col * width + c] = work[pivotRow * width + c]!;
        work[pivotRow * width + c] = tmp;
      }
    }

    const invPivot = gf256Inv(work[col * width + col]!);
    for (let c = 0; c < width; c += 1) {
      work[col * width + c] = gf256Mul(work[col * width + c]!, invPivot);
    }
    for (let r = 0; r < size; r += 1) {
      if (r === col) continue;
      const factor = work[r * width + col]!;
      if (factor === 0) continue;
      for (let c = 0; c < width; c += 1) {
        work[r * width + c] ^= gf256Mul(factor, work[col * width + c]!);
      }
    }
  }

  const inv = new Uint8Array(size * size);
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) inv[r * size + c] = work[r * width + size + c]!;
  }
  return inv;
}

/** 코시 조직적 생성 행렬을 이용해 K개 데이터 샤드로부터 K+P개 샤드를 생성한다. */
export function encodeCauchySystematicShards(
  dataShardList: readonly Uint8Array[],
  parityShards: number,
): readonly Uint8Array[] {
  const k = dataShardList.length;
  if (k < 1) throw new RangeError("데이터 샤드는 최소 1개 이상이어야 합니다.");
  const shardLen = dataShardList[0]!.length;
  for (let i = 1; i < k; i += 1) {
    if (dataShardList[i]!.length !== shardLen) throw new RangeError("데이터 샤드 길이가 일치하지 않습니다.");
  }

  const genMatrix = buildCauchySystematicMatrix(k, parityShards);
  const out: Uint8Array[] = dataShardList.map((s) => s.slice());
  for (let p = 0; p < parityShards; p += 1) {
    const parityBuf = new Uint8Array(shardLen);
    const rowOff = (k + p) * k;
    for (let c = 0; c < k; c += 1) {
      const coeff = genMatrix[rowOff + c]!;
      const src = dataShardList[c]!;
      for (let b = 0; b < shardLen; b += 1) parityBuf[b] ^= gf256Mul(coeff, src[b]!);
    }
    out.push(parityBuf);
  }
  return Object.freeze(out);
}

/** 생존한 임의의 K개 코시 샤드와 역행렬로 원본 K개 데이터 샤드를 복원한다. */
export function decodeCauchySystematicShards(
  shardsOrNull: readonly (Uint8Array | null | undefined)[],
  dataShards: number,
  parityShards: number,
): readonly Uint8Array[] {
  const total = dataShards + parityShards;
  if (shardsOrNull.length !== total) throw new RangeError("샤드 슬롯 개수가 K + P와 일치하지 않습니다.");

  const survivingIndices: number[] = [];
  let shardLen = -1;
  for (let i = 0; i < total && survivingIndices.length < dataShards; i += 1) {
    const shard = shardsOrNull[i];
    if (!shard) continue;
    if (shardLen < 0) shardLen = shard.length;
    else if (shard.length !== shardLen) throw new RangeError("생존 샤드 길이가 서로 다릅니다.");
    survivingIndices.push(i);
  }
  if (survivingIndices.length < dataShards || shardLen < 0) {
    throw new RangeError("복구에 필요한 최소 K개의 생존 샤드가 부족합니다.");
  }

  const fullMatrix = buildCauchySystematicMatrix(dataShards, parityShards);
  const subMatrix = new Uint8Array(dataShards * dataShards);
  for (let r = 0; r < dataShards; r += 1) {
    const rowIdx = survivingIndices[r]!;
    for (let c = 0; c < dataShards; c += 1) {
      subMatrix[r * dataShards + c] = fullMatrix[rowIdx * dataShards + c]!;
    }
  }

  const invMatrix = invertGf256Matrix(subMatrix, dataShards);
  const recoveredData: Uint8Array[] = [];
  for (let r = 0; r < dataShards; r += 1) {
    const target = new Uint8Array(shardLen);
    for (let c = 0; c < dataShards; c += 1) {
      const coeff = invMatrix[r * dataShards + c]!;
      if (coeff === 0) continue;
      const src = shardsOrNull[survivingIndices[c]!]!;
      for (let b = 0; b < shardLen; b += 1) target[b] ^= gf256Mul(coeff, src[b]!);
    }
    recoveredData.push(target);
  }
  return Object.freeze(recoveredData);
}

function polyMul(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length - 1);
  for (let i = 0; i < a.length; i += 1) {
    const ai = a[i]!;
    if (ai === 0) continue;
    for (let j = 0; j < b.length; j += 1) out[i + j] ^= gf256Mul(ai, b[j]!);
  }
  return out;
}

function buildRsGeneratorDesc(paritySymbols: number): Uint8Array {
  let gen: Uint8Array = new Uint8Array([1]);
  for (let i = 0; i < paritySymbols; i += 1) gen = polyMul(gen, new Uint8Array([1, GF_EXP[i]!]));
  return gen;
}

function ascPolyEval(poly: Uint8Array, z: number): number {
  let acc = 0;
  for (let i = poly.length - 1; i >= 0; i -= 1) acc = gf256Mul(acc, z) ^ poly[i]!;
  return acc;
}

function ascPolyFormalDerivative(poly: Uint8Array): Uint8Array {
  if (poly.length <= 1) return new Uint8Array([0]);
  const deriv = new Uint8Array(poly.length - 1);
  for (let d = 1; d < poly.length; d += 2) deriv[d - 1] = poly[d]!;
  return deriv;
}

function trimAscPoly(poly: Uint8Array): Uint8Array {
  let last = poly.length - 1;
  while (last > 0 && poly[last]! === 0) last -= 1;
  return poly.slice(0, last + 1);
}

/** 메시지 뒤에 `paritySymbols (= 2t)`개 패리티를 붙인 조직적 리드-솔로몬 부호어를 생성한다. */
export function rsEncodeSystematicCodeword(message: Uint8Array, paritySymbols: number): Uint8Array {
  const k = message.length;
  if (k < 1 || paritySymbols < 1 || k + paritySymbols > GF256_FIELD_ORDER) {
    throw new RangeError("리드-솔로몬 부호어 길이는 1 <= k, 1 <= 2t, k + 2t <= 255여야 합니다.");
  }
  const gen = buildRsGeneratorDesc(paritySymbols);
  const work = new Uint8Array(k + paritySymbols);
  work.set(message, 0);
  for (let i = 0; i < k; i += 1) {
    const coef = work[i]!;
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j += 1) work[i + j] ^= gf256Mul(gen[j]!, coef);
    }
  }
  const codeword = new Uint8Array(k + paritySymbols);
  codeword.set(message, 0);
  codeword.set(work.subarray(k), k);
  return codeword;
}

/** 수신 부호어에서 `2t`개의 신드롬 `S_i = C(α^i)` (`i = 0..2t-1`)를 계산한다. */
export function rsComputeSyndromes(codeword: Uint8Array, paritySymbols: number): Uint8Array {
  const syndromes = new Uint8Array(paritySymbols);
  for (let i = 0; i < paritySymbols; i += 1) {
    const alphaI = GF_EXP[i]!;
    let acc = 0;
    for (let j = 0; j < codeword.length; j += 1) acc = gf256Mul(acc, alphaI) ^ codeword[j]!;
    syndromes[i] = acc;
  }
  return syndromes;
}

/** 알려진 소거(`e`)와 미지 위치 오류(`v`)를 `2v + e <= paritySymbols` 한도 안에서 동시 정정한다. */
export function rsDecodeCodeword(
  received: Uint8Array,
  paritySymbols: number,
  erasurePositions: readonly number[] = [],
): ReedSolomonCodewordDecodeResult {
  const n = received.length;
  const k = n - paritySymbols;
  if (k < 1 || paritySymbols < 1 || n > GF256_FIELD_ORDER) {
    throw new RangeError("유효하지 않은 리드-솔로몬 부호어 차원입니다.");
  }

  const uniqueErasures = Array.from(new Set(erasurePositions)).sort((a, b) => a - b);
  for (let i = 0; i < uniqueErasures.length; i += 1) {
    if (uniqueErasures[i]! < 0 || uniqueErasures[i]! >= n) {
      throw new RangeError("소거 위치 인덱스가 부호어 범위를 벗어났습니다.");
    }
  }
  const erasureCount = uniqueErasures.length;
  if (erasureCount > paritySymbols) {
    throw new Error(`소거 개수(${erasureCount})가 허용 한도(${paritySymbols})를 초과했습니다.`);
  }

  const work = received.slice();
  for (let i = 0; i < erasureCount; i += 1) work[uniqueErasures[i]!] = 0;

  const syndromes = rsComputeSyndromes(work, paritySymbols);
  if (syndromes.every((s) => s === 0)) {
    return {
      codeword: work,
      message: work.slice(0, k),
      correctedPositions: Object.freeze(uniqueErasures),
      unknownErrorCount: 0,
      erasureCount,
    };
  }

  let gamma: Uint8Array = new Uint8Array([1]);
  for (let i = 0; i < erasureCount; i += 1) {
    gamma = polyMul(gamma, new Uint8Array([1, GF_EXP[n - 1 - uniqueErasures[i]!]!]));
  }

  const sGamma = polyMul(syndromes, gamma);
  const remSym = paritySymbols - erasureCount;
  const forneySyndromes = new Uint8Array(remSym);
  let hasUnknownSyndrome = false;
  for (let r = 0; r < remSym; r += 1) {
    const val = r + erasureCount < sGamma.length ? sGamma[r + erasureCount]! : 0;
    forneySyndromes[r] = val;
    if (val !== 0) hasUnknownSyndrome = true;
  }

  let lambda: Uint8Array = new Uint8Array([1]);
  let linearComplexity = 0;
  if (hasUnknownSyndrome) {
    let cPoly: Uint8Array = new Uint8Array([1]);
    let bPoly: Uint8Array = new Uint8Array([1]);
    let lVal = 0;
    let shiftM = 1;
    let prevDiscrepancy = 1;

    for (let r = 0; r < remSym; r += 1) {
      let discrepancy = forneySyndromes[r]!;
      for (let i = 1; i <= lVal; i += 1) {
        if (i < cPoly.length) discrepancy ^= gf256Mul(cPoly[i]!, forneySyndromes[r - i]!);
      }
      if (discrepancy === 0) {
        shiftM += 1;
      } else {
        const savedC = cPoly.slice();
        const nextC = new Uint8Array(Math.max(cPoly.length, bPoly.length + shiftM));
        nextC.set(cPoly, 0);
        const scale = gf256Div(discrepancy, prevDiscrepancy);
        for (let j = 0; j < bPoly.length; j += 1) nextC[j + shiftM] ^= gf256Mul(scale, bPoly[j]!);
        cPoly = nextC;
        if (2 * lVal <= r) {
          lVal = r + 1 - lVal;
          bPoly = savedC;
          prevDiscrepancy = discrepancy;
          shiftM = 1;
        } else {
          shiftM += 1;
        }
      }
    }

    lambda = trimAscPoly(cPoly);
    linearComplexity = lVal;
    if (2 * linearComplexity > remSym || lambda.length - 1 !== linearComplexity) {
      throw new Error("오류 개수가 리드-솔로몬 정정 용량(2v + e <= 2t)을 초과했습니다.");
    }
  }

  const psi = trimAscPoly(polyMul(gamma, lambda));
  const errataPositions: number[] = [];
  for (let pos = 0; pos < n; pos += 1) {
    if (ascPolyEval(psi, gf256Inv(GF_EXP[n - 1 - pos]!)) === 0) errataPositions.push(pos);
  }
  if (errataPositions.length !== psi.length - 1) {
    throw new Error("치엔 탐색 근 개수가 위치 다항식 차수와 일치하지 않습니다.");
  }

  const omega = polyMul(syndromes, psi).slice(0, paritySymbols);
  const psiDeriv = ascPolyFormalDerivative(psi);
  for (let i = 0; i < errataPositions.length; i += 1) {
    const pos = errataPositions[i]!;
    const xLoc = GF_EXP[n - 1 - pos]!;
    const xInv = gf256Inv(xLoc);
    const den = ascPolyEval(psiDeriv, xInv);
    if (den === 0) throw new Error("포니 도함수 분모가 0입니다.");
    work[pos] ^= gf256Mul(xLoc, gf256Div(ascPolyEval(omega, xInv), den));
  }

  if (!rsComputeSyndromes(work, paritySymbols).every((s) => s === 0)) {
    throw new Error("복호 후 신드롬 검증에 실패했습니다.");
  }

  return {
    codeword: work,
    message: work.slice(0, k),
    correctedPositions: Object.freeze(errataPositions),
    unknownErrorCount: linearComplexity,
    erasureCount,
  };
}

function bytesToHexUpper(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) hex += bytes[i]!.toString(16).padStart(2, "0").toUpperCase();
  return hex;
}

function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.split("-").join("").trim();
  if (cleaned.length % 2 !== 0) throw new Error("비주얼 시드 아머 16진수 길이가 올바르지 않습니다.");
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    const parsed = Number.parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(parsed)) throw new Error("비주얼 시드 아머에 잘못된 문자가 포함되어 있습니다.");
    out[i] = parsed;
  }
  return out;
}

function writeUint32BE(buf: Uint8Array, offset: number, value: number): void {
  const u = value >>> 0;
  buf[offset] = (u >>> 24) & 0xff;
  buf[offset + 1] = (u >>> 16) & 0xff;
  buf[offset + 2] = (u >>> 8) & 0xff;
  buf[offset + 3] = u & 0xff;
}

function readUint32BE(buf: Uint8Array, offset: number): number {
  return (((buf[offset]! << 24) | (buf[offset + 1]! << 16) | (buf[offset + 2]! << 8) | buf[offset + 3]!) >>> 0);
}

/** 브러시·OKLCH 팔레트·Ed25519 지문 번들을 결정론적 UTF-8 바이트열로 직렬화한다. */
export function serializeVisualSeedBundle(bundle: CreatorVisualSeedBundle): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      schemaVersion: SEED_BACKUP_SCHEMA_VERSION,
      bundleId: bundle.bundleId,
      createdAtIso: bundle.createdAtIso,
      brushPresets: bundle.brushPresets,
      characterPalettes: bundle.characterPalettes,
      ed25519KeyFingerprints: bundle.ed25519KeyFingerprints.map((fp) => ({
        keyId: fp.keyId,
        ownerLabelKo: fp.ownerLabelKo,
        algorithm: fp.algorithm,
        publicKeyBytes: Array.from(fp.publicKeyBytes, (b) => b & 0xff),
        fingerprintHex: fp.fingerprintHex.toLowerCase(),
      })),
    }),
  );
}

/** 복원된 UTF-8 바이트열에서 크리에이터 비주얼 시드 번들을 검증·역직렬화한다. */
export function deserializeVisualSeedBundle(bytes: Uint8Array): CreatorVisualSeedBundle {
  const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (typeof parsed !== "object" || parsed === null) throw new Error("시드 번들 최상위 구조가 객체가 아닙니다.");
  const rec = parsed as Record<string, unknown>;
  if (rec.schemaVersion !== SEED_BACKUP_SCHEMA_VERSION || typeof rec.bundleId !== "string") {
    throw new Error("지원하지 않는 비주얼 시드 번들 스키마 버전입니다.");
  }
  return parsed as CreatorVisualSeedBundle;
}

function buildShardHeaderAndCrc(
  shardIndex: number,
  dataShards: number,
  parityShards: number,
  originalByteLength: number,
  payloadCrc32: number,
  symbols: Uint8Array,
): { rawPacket: Uint8Array; shardCrc32: number } {
  const rawPacket = new Uint8Array(16 + symbols.length);
  rawPacket.set([0x54, 0x53, 0x52, 0x53, SEED_BACKUP_SCHEMA_VERSION, dataShards & 0xff, parityShards & 0xff, shardIndex & 0xff], 0);
  writeUint32BE(rawPacket, 8, originalByteLength);
  writeUint32BE(rawPacket, 12, payloadCrc32);
  rawPacket.set(symbols, 16);
  return { rawPacket, shardCrc32: computeCrc32(rawPacket) };
}

/** 인쇄된 아머 코드 문자열(`TSRS1.<idx>.<crcHex>.<packetHex>`)을 샤드 패킷으로 파싱한다. */
export function parseVisualArmorShard(armorCode: string): VisualSeedShardPacket {
  const segments = armorCode.trim().split(".");
  if (segments.length !== 4 || segments[0] !== "TSRS1") throw new Error("유효하지 않은 비주얼 시드 아머 프리픽스입니다.");
  const crcBytes = hexToBytes(segments[2]!);
  if (crcBytes.length !== 4) throw new Error("샤드 CRC 필드가 4바이트가 아닙니다.");
  const rawPacket = hexToBytes(segments[3]!);
  if (rawPacket.length < 17 || rawPacket[0] !== 0x54 || rawPacket[1] !== 0x53 || rawPacket[2] !== 0x52 || rawPacket[3] !== 0x53) {
    throw new Error("비주얼 시드 패킷 매직 헤더가 손상되었습니다.");
  }
  const dataShards = rawPacket[5]!;
  const parityShards = rawPacket[6]!;
  return {
    shardIndex: rawPacket[7]!,
    totalShards: dataShards + parityShards,
    dataShards,
    parityShards,
    errorToleranceT: Math.floor(parityShards / 2),
    originalByteLength: readUint32BE(rawPacket, 8),
    payloadCrc32: readUint32BE(rawPacket, 12),
    shardCrc32: readUint32BE(crcBytes, 0),
    symbols: rawPacket.slice(16),
    visualArmorCode: armorCode.trim(),
  };
}

/** 크리에이터 비주얼 시드 번들을 `K`개 데이터 샤드 + `2t`개 패리티 샤드로 부호화한다. */
export function createVisualSeedBackupKit(
  bundle: CreatorVisualSeedBundle,
  options: { readonly dataShards?: number; readonly errorToleranceT?: number } = {},
): VisualSeedBackupKit {
  const dataShards = Math.max(2, Math.floor(options.dataShards ?? 6));
  const errorToleranceT = Math.max(1, Math.floor(options.errorToleranceT ?? 2));
  const parityShards = 2 * errorToleranceT;
  const totalShards = dataShards + parityShards;
  if (totalShards > GF256_FIELD_ORDER) throw new RangeError("총 샤드 개수(K + 2t)는 255 이하여야 합니다.");

  const originalBytes = serializeVisualSeedBundle(bundle);
  const payloadCrc32 = computeCrc32(originalBytes);
  const shardSymbolLength = Math.max(1, Math.ceil(originalBytes.length / dataShards));
  const padded = new Uint8Array(dataShards * shardSymbolLength);
  padded.set(originalBytes, 0);

  const shardBuffers = Array.from({ length: totalShards }, () => new Uint8Array(shardSymbolLength));
  const colMessage = new Uint8Array(dataShards);
  for (let col = 0; col < shardSymbolLength; col += 1) {
    for (let d = 0; d < dataShards; d += 1) colMessage[d] = padded[d * shardSymbolLength + col]!;
    const cw = rsEncodeSystematicCodeword(colMessage, parityShards);
    for (let s = 0; s < totalShards; s += 1) shardBuffers[s]![col] = cw[s]!;
  }

  const shards: VisualSeedShardPacket[] = shardBuffers.map((symbols, s) => {
    const { rawPacket, shardCrc32 } = buildShardHeaderAndCrc(
      s,
      dataShards,
      parityShards,
      originalBytes.length,
      payloadCrc32,
      symbols,
    );
    const crcBuf = new Uint8Array(4);
    writeUint32BE(crcBuf, 0, shardCrc32);
    const visualArmorCode = `TSRS1.${String(s).padStart(2, "0")}.${bytesToHexUpper(crcBuf)}.${bytesToHexUpper(rawPacket)}`;
    return Object.freeze({
      shardIndex: s,
      totalShards,
      dataShards,
      parityShards,
      errorToleranceT,
      originalByteLength: originalBytes.length,
      payloadCrc32,
      shardCrc32,
      symbols,
      visualArmorCode,
    });
  });

  return {
    dataShards,
    parityShards,
    totalShards,
    errorToleranceT,
    originalBytes,
    payloadCrc32,
    shards: Object.freeze(shards),
    serverCostKrw: 0,
  };
}

/** 유실(`null`)되거나 바이트가 손상된 비주얼 시드 샤드 목록으로부터 원본 번들을 100% 복원한다. */
export function recoverVisualSeedBackupKit(
  shards: readonly (VisualSeedShardPacket | null | undefined)[],
  options: VisualSeedRecoveryOptions = {},
): VisualSeedRecoveryResult {
  const treatCrcDamageAsErasure = options.treatCorruptedShardCrcAsErasure ?? true;
  const referenceShard = shards.find((item): item is VisualSeedShardPacket => item != null);
  if (!referenceShard) throw new Error("제공된 비주얼 시드 샤드가 하나도 없습니다.");

  const { dataShards, parityShards, totalShards, originalByteLength, payloadCrc32 } = referenceShard;
  const symbolLen = referenceShard.symbols.length;
  const slotMap = new Array<VisualSeedShardPacket | null>(totalShards).fill(null);

  for (let i = 0; i < shards.length; i += 1) {
    const item = shards[i];
    if (item && item.shardIndex >= 0 && item.shardIndex < totalShards && item.symbols.length === symbolLen) {
      slotMap[item.shardIndex] = item;
    }
  }

  const erasedIndices: number[] = [];
  for (let s = 0; s < totalShards; s += 1) {
    const packet = slotMap[s];
    if (!packet) {
      erasedIndices.push(s);
      continue;
    }
    if (treatCrcDamageAsErasure) {
      const { shardCrc32: actualCrc } = buildShardHeaderAndCrc(
        packet.shardIndex,
        packet.dataShards,
        packet.parityShards,
        packet.originalByteLength,
        packet.payloadCrc32,
        packet.symbols,
      );
      if (actualCrc !== packet.shardCrc32) {
        erasedIndices.push(s);
        slotMap[s] = null;
      }
    }
  }

  if (erasedIndices.length > parityShards) {
    throw new Error(`유실/손상 샤드 수(${erasedIndices.length})가 최대 복구 한도 2t(${parityShards})를 초과했습니다.`);
  }

  const recoveredPadded = new Uint8Array(dataShards * symbolLen);
  const colReceived = new Uint8Array(totalShards);
  let healedSymbolCount = 0;

  for (let col = 0; col < symbolLen; col += 1) {
    for (let s = 0; s < totalShards; s += 1) colReceived[s] = slotMap[s] ? slotMap[s]!.symbols[col]! : 0;
    const decoded = rsDecodeCodeword(colReceived, parityShards, erasedIndices);
    healedSymbolCount += decoded.correctedPositions.length;
    for (let d = 0; d < dataShards; d += 1) recoveredPadded[d * symbolLen + col] = decoded.message[d]!;
  }

  if (originalByteLength < 0 || originalByteLength > recoveredPadded.length) {
    throw new Error("복원된 원본 바이트 길이 메타데이터가 유효 범위를 벗어났습니다.");
  }
  const recoveredBytes = recoveredPadded.slice(0, originalByteLength);
  const verifiedCrc = computeCrc32(recoveredBytes);
  if (verifiedCrc !== payloadCrc32) throw new Error("복원된 시드 번들의 전체 CRC32가 원본과 일치하지 않습니다.");

  return {
    bundle: deserializeVisualSeedBundle(recoveredBytes),
    recoveredBytes,
    payloadCrc32: verifiedCrc,
    erasedShardIndices: Object.freeze(erasedIndices),
    healedSymbolCount,
    serverCostKrw: 0,
  };
}
