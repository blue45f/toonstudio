/**
 * Wave 146 — FastCDC 증분 스냅샷 중복제거 & GF(256) 이중 패리티 복구 금고 결정론적 테스트 스위트.
 */

import { describe, expect, it } from "vitest";
import {
  ManuscriptSnapshotDedupVault,
  canonicalizeVaultJson,
  chunkBufferFastCdc,
  chunkBufferFixedSize,
  compareFixedVsFastCdcDedup,
  computeVaultManifestSha256Hex,
  decodeAndHealDualParityStripe,
  encodeDualParityStripe,
  encodeVaultUtf8Bytes,
  escapeVaultXml,
  getFastCdcGearTable,
  gf256Add,
  gf256Div,
  gf256GeneratorPow,
  gf256Inv,
  gf256Mul,
  reassembleChunks,
  renderSnapshotVaultHealthSvg,
  resolveFastCdcOptions,
  sha256VaultBytesHex,
  sha256VaultUtf8Hex,
  summarizeSnapshotVaultHealthKo,
} from "./index";

const SMALL_CHUNKING = { minChunkBytes: 512, avgChunkBytes: 2048, maxChunkBytes: 8192 } as const;
const STD_CHUNKING = { minChunkBytes: 1024, avgChunkBytes: 4096, maxChunkBytes: 16384 } as const;

function makeBytes(byteLength: number, seed: number): Uint8Array {
  const out = new Uint8Array(byteLength);
  let state = (seed >>> 0) || 0x12345678;
  for (let i = 0; i < byteLength; i += 1) {
    state ^= (state << 13) >>> 0;
    state ^= state >>> 17;
    state ^= (state << 5) >>> 0;
    out[i] = state & 0xff;
  }
  return out;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (let i = 0; i < parts.length; i += 1) total += parts[i]?.length ?? 0;
  const out = new Uint8Array(total);
  let cursor = 0;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (!part) continue;
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

function bytesEqual(a: Uint8Array | null | undefined, b: Uint8Array | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function makeSampleShards(): Uint8Array[] {
  return [
    makeBytes(1317, 0x101),
    makeBytes(2048, 0x202),
    makeBytes(997, 0x303),
    makeBytes(2411, 0x404),
    makeBytes(1500, 0x505),
    makeBytes(1888, 0x606),
  ];
}

describe("Wave 146 — 순수 ES2017 FIPS 180-4 SHA-256 및 정규 JSON", () => {
  it("빈 문자열 및 표준 NIST 'abc' 벡터에 대해 정확한 SHA-256을 반환한다", () => {
    expect(sha256VaultUtf8Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256VaultUtf8Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("56바이트 이상 멀티블록 NIST 표준 벡터를 정확히 해시한다", () => {
    expect(sha256VaultUtf8Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("한글 및 UTF-16 서로게이트 쌍(이모지)을 표준 UTF-8 바이트로 인코딩한다", () => {
    expect(Array.from(encodeVaultUtf8Bytes("웹툰"))).toEqual([0xec, 0x9b, 0xb9, 0xed, 0x88, 0xb0]);
    expect(Array.from(encodeVaultUtf8Bytes("🎨"))).toEqual([0xf0, 0x9f, 0x8e, 0xa8]);
  });

  it("객체 키 순서와 -0/NaN 표현에 무관하게 동일한 정규 JSON과 매니페스트 지문을 반환한다", () => {
    const a = { zeta: 1, alpha: { b: -0, a: [true, Number.NaN] } };
    const b = { alpha: { a: [true, null], b: 0 }, zeta: 1 };
    expect(canonicalizeVaultJson(a)).toBe(canonicalizeVaultJson(b));
    expect(computeVaultManifestSha256Hex(a)).toBe(computeVaultManifestSha256Hex(b));
  });
});

describe("Wave 146 — Gear 롤링 해시 정규화 FastCDC 청커", () => {
  it("256-엔트리 32비트 Gear 테이블은 256개 고유값·균일 비트 분포·방어 복사를 보장한다", () => {
    const tableA = getFastCdcGearTable();
    const tableB = getFastCdcGearTable();
    expect(tableA.length).toBe(256);
    expect(new Set(Array.from(tableA)).size).toBe(256);
    tableA[0] = 0;
    expect(tableB[0]).not.toBe(0);
    let ones = 0;
    for (let i = 0; i < tableB.length; i += 1) {
      let v = tableB[i] ?? 0;
      while (v !== 0) {
        ones += v & 1;
        v >>>= 1;
      }
    }
    expect(ones / (256 * 32)).toBeGreaterThan(0.45);
    expect(ones / (256 * 32)).toBeLessThan(0.55);
  });

  it("빈 버퍼는 청크 0건과 빈 SHA-256을 반환한다", () => {
    const res = chunkBufferFastCdc(new Uint8Array(0));
    expect(res.totalBytes).toBe(0);
    expect(res.chunkCount).toBe(0);
    expect(res.payloadSha256Hex).toBe(sha256VaultBytesHex(new Uint8Array(0)));
  });

  it("minChunkBytes 이하 소형 버퍼는 단일 청크로 반환하고 원본과 100% 일치한다", () => {
    const small = makeBytes(512, 0xaa01);
    const res = chunkBufferFastCdc(small, STD_CHUNKING);
    expect(res.chunkCount).toBe(1);
    expect(res.chunks[0]?.byteLength).toBe(512);
    expect(bytesEqual(reassembleChunks(res.chunks), small)).toBe(true);
  });

  it("마지막 청크를 제외한 모든 FastCDC 청크는 min <= len <= max 제약을 엄수한다", () => {
    const payload = makeBytes(131072, 0xbeef146);
    const res = chunkBufferFastCdc(payload, { ...STD_CHUNKING, normalizationLevel: 2 });
    expect(res.chunkCount).toBeGreaterThan(10);
    for (let i = 0; i < res.chunks.length; i += 1) {
      const chunk = res.chunks[i];
      if (!chunk) continue;
      expect(chunk.byteLength).toBeLessThanOrEqual(STD_CHUNKING.maxChunkBytes);
      expect(chunk.sha256Hex).toBe(sha256VaultBytesHex(chunk.bytes));
      if (i < res.chunks.length - 1) {
        expect(chunk.byteLength).toBeGreaterThanOrEqual(STD_CHUNKING.minChunkBytes);
      } else {
        expect(chunk.byteLength).toBeGreaterThan(0);
      }
    }
    expect(bytesEqual(reassembleChunks(res.chunks), payload)).toBe(true);
  });

  it("정규화 레벨 0~3 전체에서 원고 재조립이 100% 비트 일치한다", () => {
    const payload = makeBytes(48000, 0x77146);
    for (let level = 0; level <= 3; level += 1) {
      const res = chunkBufferFastCdc(payload, { ...SMALL_CHUNKING, normalizationLevel: level });
      const rebuilt = reassembleChunks(res.chunks);
      expect(bytesEqual(rebuilt, payload)).toBe(true);
      expect(sha256VaultBytesHex(rebuilt)).toBe(res.payloadSha256Hex);
    }
  });

  it("동일 입력에 대해 결정론적으로 동일한 청크 경계와 SHA-256 목록을 생성한다", () => {
    const payload = makeBytes(36000, 0x1042);
    const runA = chunkBufferFastCdc(payload);
    const runB = chunkBufferFastCdc(payload);
    expect(runA.chunks.map((c) => `${c.offset}:${c.byteLength}:${c.sha256Hex}`)).toEqual(
      runB.chunks.map((c) => `${c.offset}:${c.byteLength}:${c.sha256Hex}`),
    );
  });

  it("청킹 후 입력 버퍼를 변조해도 추출된 청크 바이트가 오염되지 않는다", () => {
    const payload = makeBytes(12000, 0x9931);
    const originalSha = sha256VaultBytesHex(payload);
    const res = chunkBufferFastCdc(payload, SMALL_CHUNKING);
    payload[0] = (payload[0] ?? 0) ^ 0xff;
    payload[payload.length - 1] = (payload[payload.length - 1] ?? 0) ^ 0xff;
    expect(sha256VaultBytesHex(reassembleChunks(res.chunks))).toBe(originalSha);
  });

  it("유효하지 않은 FastCDC 또는 고정 크기 청킹 옵션은 RangeError로 차단한다", () => {
    expect(() => resolveFastCdcOptions({ minChunkBytes: 8 })).toThrow(RangeError);
    expect(() =>
      resolveFastCdcOptions({ minChunkBytes: 4096, avgChunkBytes: 2048, maxChunkBytes: 8192 }),
    ).toThrow(RangeError);
    expect(() =>
      resolveFastCdcOptions({ minChunkBytes: 512, avgChunkBytes: 4096, maxChunkBytes: 2048 }),
    ).toThrow(RangeError);
    expect(() => resolveFastCdcOptions({ normalizationLevel: 4 })).toThrow(RangeError);
    expect(() => chunkBufferFixedSize(new Uint8Array(64), 8)).toThrow(RangeError);
  });
});

describe("Wave 146 — 고정 크기 청킹 vs FastCDC 시프트 내성 비교", () => {
  it("원고 앞단 37바이트 삽입 시 고정 청킹은 0%로 붕괴되고 FastCDC는 높은 절감률을 유지한다", () => {
    const base = makeBytes(98304, 0x51a0146);
    const shifted = concatBytes([makeBytes(37, 0x9999), base]);
    const cmp = compareFixedVsFastCdcDedup(base, shifted, STD_CHUNKING);

    expect(cmp.fixed.incrementalReusePercent).toBe(0);
    expect(cmp.fixed.dedupSavingsPercent).toBe(0);
    expect(cmp.fastCdc.incrementalReusePercent).toBeGreaterThan(80);
    expect(cmp.fastCdc.dedupSavingsPercent).toBeGreaterThan(40);
    expect(cmp.fastCdcAdvantageReusePoints).toBeGreaterThan(80);
    expect(cmp.fastCdcAdvantageSavingsPoints).toBeGreaterThan(40);
    expect(cmp.fastCdcSavedMoreBytes).toBeGreaterThan(70000);
    expect(cmp.reportSha256Hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("원고 중간 137바이트 삽입에서도 FastCDC가 고정 청킹보다 압도적 재사용률을 보인다", () => {
    const base = makeBytes(96000, 0x4242146);
    const modified = concatBytes([
      base.subarray(0, 24000),
      makeBytes(137, 0x31337),
      base.subarray(24000),
    ]);
    const cmp = compareFixedVsFastCdcDedup(base, modified, STD_CHUNKING);
    expect(cmp.fixed.incrementalReusePercent).toBeLessThan(30);
    expect(cmp.fastCdc.incrementalReusePercent).toBeGreaterThan(80);
    expect(cmp.fastCdcAdvantageReusePoints).toBeGreaterThan(50);
  });

  it("원고 앞단 53바이트 삭제(좌측 시프트)에서도 FastCDC는 경계를 빠르게 재동기화한다", () => {
    const base = makeBytes(80000, 0x8080146);
    const cmp = compareFixedVsFastCdcDedup(base, base.slice(53), STD_CHUNKING);
    expect(cmp.fixed.incrementalReusePercent).toBe(0);
    expect(cmp.fastCdc.incrementalReusePercent).toBeGreaterThan(80);
  });

  it("동일한 원고 2건 비교 시 두 전략 모두 100% 재사용과 50% 누적 절감을 보고한다", () => {
    const base = makeBytes(32768, 0x1111);
    const cmp = compareFixedVsFastCdcDedup(base, base.slice());
    expect(cmp.fixed.incrementalReusePercent).toBe(100);
    expect(cmp.fastCdc.incrementalReusePercent).toBe(100);
    expect(cmp.fixed.dedupSavingsPercent).toBe(50);
    expect(cmp.fastCdc.dedupSavingsPercent).toBe(50);
  });
});

describe("Wave 146 — 유한체 GF(256) (0x11d) 수학 공리 검증", () => {
  it("생성원 2의 거듭제곱은 0 제외 255개 원소를 모두 생성하며 2^255 = 1이다", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 255; i += 1) {
      const val = gf256GeneratorPow(i);
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(255);
      seen.add(val);
    }
    expect(seen.size).toBe(255);
    expect(gf256GeneratorPow(0)).toBe(1);
    expect(gf256GeneratorPow(255)).toBe(1);
  });

  it("모든 256개 원소에 대해 덧셈 항등원·자기역원·교환법칙이 성립한다", () => {
    for (let a = 0; a < 256; a += 1) {
      expect(gf256Add(a, 0)).toBe(a);
      expect(gf256Add(a, a)).toBe(0);
      const b = (a * 37 + 13) & 0xff;
      expect(gf256Add(a, b)).toBe(gf256Add(b, a));
    }
  });

  it("0 제외 255개 모든 원소의 곱셈 역원(a * inv(a) = 1) 및 나눗셈 가역성이 성립한다", () => {
    for (let a = 1; a < 256; a += 1) {
      const invA = gf256Inv(a);
      expect(gf256Mul(a, invA)).toBe(1);
      expect(gf256Mul(invA, a)).toBe(1);
      expect(gf256Div(1, a)).toBe(invA);
      expect(gf256Div(0, a)).toBe(0);
      const b = ((a * 17 + 5) % 255) + 1;
      expect(gf256Div(gf256Mul(a, b), b)).toBe(a);
    }
  });

  it("곱셈 결합법칙·교환법칙·분배법칙 a*(b+c) = a*b + a*c가 모든 표본 조합에서 성립한다", () => {
    const samples = [0, 1, 2, 3, 7, 29, 83, 128, 173, 211, 254, 255];
    for (let i = 0; i < samples.length; i += 1) {
      const a = samples[i] ?? 0;
      for (let j = 0; j < samples.length; j += 1) {
        const b = samples[j] ?? 0;
        expect(gf256Mul(a, b)).toBe(gf256Mul(b, a));
        for (let k = 0; k < samples.length; k += 1) {
          const c = samples[k] ?? 0;
          expect(gf256Mul(a, gf256Mul(b, c))).toBe(gf256Mul(gf256Mul(a, b), c));
          expect(gf256Mul(a, gf256Add(b, c))).toBe(gf256Add(gf256Mul(a, b), gf256Mul(a, c)));
        }
      }
    }
  });

  it("0의 역원 및 0으로 나누기는 RangeError로 안전하게 차단한다", () => {
    expect(() => gf256Inv(0)).toThrow(RangeError);
    expect(() => gf256Div(42, 0)).toThrow(RangeError);
  });
});

describe("Wave 146 — GF(256) 이중 패리티(P+Q) 스트라이프 코덱", () => {
  it("무손상 스트라이프는 healthy 상태를 반환하고 원본 가변 길이 샤드를 유지한다", () => {
    const shards = makeSampleShards();
    const stripe = encodeDualParityStripe(shards, "st-healthy");
    const res = decodeAndHealDualParityStripe(stripe, shards, stripe.parityP, stripe.parityQ);
    expect(res.status).toBe("healthy");
    expect(res.recoverable).toBe(true);
    expect(res.faultCount).toBe(0);
    for (let i = 0; i < shards.length; i += 1) {
      expect(bytesEqual(res.dataShards[i], shards[i])).toBe(true);
    }
  });

  it("데이터 샤드 1개 유실 시 P 패리티로 원본 길이 포함 100% 비트 일치 복구한다", () => {
    const shards = makeSampleShards();
    const stripe = encodeDualParityStripe(shards, "st-drop-1");
    const damaged: (Uint8Array | null)[] = shards.map((s) => s.slice());
    damaged[2] = null;
    const res = decodeAndHealDualParityStripe(stripe, damaged, stripe.parityP, stripe.parityQ);
    expect(res.status).toBe("healed");
    expect(res.healedShardLabels).toEqual(["data[2]"]);
    expect(bytesEqual(res.dataShards[2], shards[2])).toBe(true);
  });

  it("데이터 샤드 1개 1비트 비트 로트를 SHA-256으로 탐지하고 100% 무손실 치유한다", () => {
    const shards = makeSampleShards();
    const stripe = encodeDualParityStripe(shards, "st-bitrot-1");
    const damaged = shards.map((s) => s.slice());
    if (damaged[4]) damaged[4][500] = (damaged[4][500] ?? 0) ^ 0x08;
    const res = decodeAndHealDualParityStripe(stripe, damaged, stripe.parityP, stripe.parityQ);
    expect(res.status).toBe("healed");
    expect(res.detectedFaultLabels).toEqual(["data[4]"]);
    expect(bytesEqual(res.dataShards[4], shards[4])).toBe(true);
  });

  it("임의의 데이터 샤드 2개 동시 손실((0,1), (0,5), (2,4))을 100% 복구한다", () => {
    const shards = makeSampleShards();
    const stripe = encodeDualParityStripe(shards, "st-dual-data");
    const pairs: readonly (readonly [number, number])[] = [
      [0, 1],
      [0, 5],
      [2, 4],
    ];
    for (let p = 0; p < pairs.length; p += 1) {
      const pair = pairs[p];
      if (!pair) continue;
      const [x, y] = pair;
      const damaged: (Uint8Array | null)[] = shards.map((s) => s.slice());
      damaged[x] = null;
      const yBuf = damaged[y];
      if (yBuf) yBuf[11] = (yBuf[11] ?? 0) ^ 0xff;
      const res = decodeAndHealDualParityStripe(stripe, damaged, stripe.parityP, stripe.parityQ);
      expect(res.status).toBe("healed");
      expect(res.faultCount).toBe(2);
      expect(bytesEqual(res.dataShards[x], shards[x])).toBe(true);
      expect(bytesEqual(res.dataShards[y], shards[y])).toBe(true);
    }
  });

  it("데이터 샤드 1개 + P 패리티 동시 손실 시 Q 패리티 역원으로 데이터와 P를 복구한다", () => {
    const shards = makeSampleShards();
    const stripe = encodeDualParityStripe(shards, "st-data-plus-p");
    const damaged: (Uint8Array | null)[] = shards.map((s) => s.slice());
    damaged[3] = null;
    const corruptedP = stripe.parityP.slice();
    corruptedP[77] = (corruptedP[77] ?? 0) ^ 0x40;
    const res = decodeAndHealDualParityStripe(stripe, damaged, corruptedP, stripe.parityQ);
    expect(res.status).toBe("healed");
    expect(res.healedShardLabels).toEqual(["data[3]", "parity-P"]);
    expect(bytesEqual(res.dataShards[3], shards[3])).toBe(true);
    expect(bytesEqual(res.parityP, stripe.parityP)).toBe(true);
  });

  it("데이터 샤드 1개 + Q 패리티 동시 손실 시 P 패리티로 데이터와 Q를 모두 복구한다", () => {
    const shards = makeSampleShards();
    const stripe = encodeDualParityStripe(shards, "st-data-plus-q");
    const damaged: (Uint8Array | null)[] = shards.map((s) => s.slice());
    damaged[1] = null;
    const res = decodeAndHealDualParityStripe(stripe, damaged, stripe.parityP, null);
    expect(res.status).toBe("healed");
    expect(res.healedShardLabels).toEqual(["data[1]", "parity-Q"]);
    expect(bytesEqual(res.dataShards[1], shards[1])).toBe(true);
    expect(bytesEqual(res.parityQ, stripe.parityQ)).toBe(true);
  });

  it("패리티 P와 Q가 모두 유실돼도 원본 데이터가 온전하면 두 패리티를 완벽히 재생성한다", () => {
    const shards = makeSampleShards();
    const stripe = encodeDualParityStripe(shards, "st-both-parity");
    const res = decodeAndHealDualParityStripe(stripe, shards, null, null);
    expect(res.status).toBe("healed");
    expect(res.healedShardLabels).toEqual(["parity-P", "parity-Q"]);
    expect(bytesEqual(res.parityP, stripe.parityP)).toBe(true);
    expect(bytesEqual(res.parityQ, stripe.parityQ)).toBe(true);
  });

  it("3개 이상 동시 손실(데이터3, 데이터2+P, 데이터1+P+Q)에서 fail-closed로 차단한다", () => {
    const shards = makeSampleShards();
    const stripe = encodeDualParityStripe(shards, "st-triple-loss");

    const d3: (Uint8Array | null)[] = shards.map((s) => s.slice());
    d3[0] = null;
    d3[2] = null;
    d3[5] = null;
    const resA = decodeAndHealDualParityStripe(stripe, d3, stripe.parityP, stripe.parityQ);
    expect(resA.status).toBe("unrecoverable-exceeds-parity-budget");
    expect(resA.recoverable).toBe(false);

    const d2p: (Uint8Array | null)[] = shards.map((s) => s.slice());
    d2p[1] = null;
    d2p[4] = null;
    expect(decodeAndHealDualParityStripe(stripe, d2p, null, stripe.parityQ).status).toBe(
      "unrecoverable-exceeds-parity-budget",
    );

    const d1pq: (Uint8Array | null)[] = shards.map((s) => s.slice());
    d1pq[3] = null;
    expect(decodeAndHealDualParityStripe(stripe, d1pq, null, null).status).toBe(
      "unrecoverable-exceeds-parity-budget",
    );
  });

  it("단일 샤드 스트라이프(K=1)도 이중 패리티로 데이터+P 동시 손실까지 무손실 복구한다", () => {
    const solo = [makeBytes(777, 0x777)];
    const stripe = encodeDualParityStripe(solo, "st-k1");
    const res = decodeAndHealDualParityStripe(stripe, [null], null, stripe.parityQ);
    expect(res.status).toBe("healed");
    expect(bytesEqual(res.dataShards[0], solo[0])).toBe(true);
    expect(bytesEqual(res.parityP, stripe.parityP)).toBe(true);
  });

  it("데이터 샤드 수가 0개이거나 254개를 초과하면 RangeError를 던진다", () => {
    expect(() => encodeDualParityStripe([])).toThrow(RangeError);
    expect(() =>
      encodeDualParityStripe(Array.from({ length: 255 }, () => new Uint8Array([1]))),
    ).toThrow(RangeError);
  });
});

describe("Wave 146 — ManuscriptSnapshotDedupVault 증분 금고·자동 치유·GC", () => {
  it("여러 회차 자동 저장(앞단 삽입·부분 수정 포함)을 높은 중복제거율로 저장하고 100% 복원한다", () => {
    const vault = new ManuscriptSnapshotDedupVault({ chunking: STD_CHUNKING, stripeDataShards: 4 });
    const rev1 = makeBytes(65536, 0xe101);
    const rev2 = concatBytes([makeBytes(37, 0x201), rev1]);
    const rev3 = concatBytes([rev2.subarray(0, 20000), makeBytes(64, 0x301), rev2.subarray(20000)]);
    const rev4 = concatBytes([rev3, makeBytes(2500, 0x401)]);

    const commits = [
      { rec: vault.commitSnapshot("ep-01", "초안 자동저장", rev1), raw: rev1 },
      { rec: vault.commitSnapshot("ep-01", "말풍선 37B 삽입", rev2), raw: rev2 },
      { rec: vault.commitSnapshot("ep-01", "중간 컷 대사 수정", rev3), raw: rev3 },
      { rec: vault.commitSnapshot("ep-01", "엔딩 컷 추가", rev4), raw: rev4 },
    ];

    expect(commits[1]?.rec.dedupReusePercent).toBeGreaterThan(75);
    expect(commits[2]?.rec.dedupReusePercent).toBeGreaterThan(70);
    expect(commits[3]?.rec.dedupReusePercent).toBeGreaterThan(80);
    expect(vault.getVaultHealthSnapshot().dedupSavingsPercent).toBeGreaterThan(55);

    for (let i = 0; i < commits.length; i += 1) {
      const item = commits[i];
      if (!item) continue;
      const restored = vault.restoreSnapshotBytes(item.rec.snapshotId);
      expect(restored.ok).toBe(true);
      expect(restored.actualPayloadSha256Hex).toBe(item.rec.payloadSha256Hex);
      expect(bytesEqual(restored.bytes, item.raw)).toBe(true);
    }
  });

  it("청크 2건 동시 비트 로트·유실 시 복원은 차단되고 scrubAndHealVault 후 100% 복원된다", () => {
    const vault = new ManuscriptSnapshotDedupVault({ chunking: SMALL_CHUNKING, stripeDataShards: 4 });
    const rev1 = makeBytes(32768, 0xabcd1);
    const rev2 = concatBytes([makeBytes(41, 0xabcd2), rev1]);
    const c1 = vault.commitSnapshot("ep-12", "선화 마감", rev1);
    const c2 = vault.commitSnapshot("ep-12", "채색 최종", rev2);

    const stripe = vault.getVaultHealthSnapshot().stripes.find((st) => st.dataShardCount >= 2);
    expect(stripe).toBeDefined();
    if (!stripe) return;

    const cid0 = stripe.dataChunkIds[0] ?? "";
    const cid1 = stripe.dataChunkIds[1] ?? "";
    expect(vault.injectChunkBitFlipForTest(cid0, 12, 0x04)).toBe(true);
    expect(vault.dropChunkDataForTest(cid1)).toBe(true);

    const before = vault.restoreSnapshotBytes(c1.snapshotId);
    expect(before.ok).toBe(false);
    expect(before.failureReason).toBe("chunk-corrupted-or-missing");

    const scrub = vault.scrubAndHealVault();
    expect(scrub.allDataIntact).toBe(true);
    expect(scrub.healedStripeCount).toBe(1);
    expect(scrub.healedDataChunkCount).toBe(2);
    expect(scrub.healedChunkIds).toContain(cid0);
    expect(scrub.healedChunkIds).toContain(cid1);

    expect(bytesEqual(vault.restoreSnapshotBytes(c1.snapshotId).bytes, rev1)).toBe(true);
    expect(bytesEqual(vault.restoreSnapshotBytes(c2.snapshotId).bytes, rev2)).toBe(true);
  });

  it("데이터 청크 1개 + P 패리티 동시 손상 시 Q 패리티로 청크와 P를 모두 복구한다", () => {
    const vault = new ManuscriptSnapshotDedupVault({ chunking: SMALL_CHUNKING, stripeDataShards: 4 });
    const rev = makeBytes(20000, 0x5511);
    const commit = vault.commitSnapshot("ep-07", "식자 완료", rev);
    const stripe = vault.getVaultHealthSnapshot().stripes[0];
    expect(stripe).toBeDefined();
    if (!stripe) return;

    expect(vault.injectChunkBitFlipForTest(stripe.dataChunkIds[0] ?? "", 3, 0x20)).toBe(true);
    expect(vault.injectParityBitFlipForTest(stripe.stripeId, "P", 9, 0x80)).toBe(true);

    const scrub = vault.scrubAndHealVault();
    expect(scrub.allDataIntact).toBe(true);
    expect(scrub.healedDataChunkCount).toBe(1);
    expect(scrub.healedParityShardCount).toBe(1);
    expect(bytesEqual(vault.restoreSnapshotBytes(commit.snapshotId).bytes, rev)).toBe(true);
  });

  it("동일 스트라이프 3개 샤드 동시 손실 시 fail-closed로 보고하고 무관한 스냅샷은 정상 복원한다", () => {
    const vault = new ManuscriptSnapshotDedupVault({ chunking: SMALL_CHUNKING, stripeDataShards: 4 });
    const ep1 = makeBytes(18000, 0x7001);
    const ep2 = makeBytes(18000, 0x7002);
    const c1 = vault.commitSnapshot("ep-01", "원고 A", ep1);
    const c2 = vault.commitSnapshot("ep-02", "원고 B", ep2);

    const stripe1 = vault
      .getVaultHealthSnapshot()
      .stripes.find((st) => st.stripeId === c1.createdStripeIds[0] && st.dataShardCount >= 3);
    expect(stripe1).toBeDefined();
    if (!stripe1) return;

    vault.dropChunkDataForTest(stripe1.dataChunkIds[0] ?? "");
    vault.dropChunkDataForTest(stripe1.dataChunkIds[1] ?? "");
    vault.dropParityShardForTest(stripe1.stripeId, "Q");

    const scrub = vault.scrubAndHealVault();
    expect(scrub.allDataIntact).toBe(false);
    expect(scrub.unrecoverableStripeCount).toBe(1);
    expect(vault.restoreSnapshotBytes(c1.snapshotId).ok).toBe(false);
    expect(bytesEqual(vault.restoreSnapshotBytes(c2.snapshotId).bytes, ep2)).toBe(true);
  });

  it("스냅샷 삭제 후 GC는 미참조 청크만 회수하고 활성 스냅샷과 재인코딩 패리티를 100% 보존한다", () => {
    const vault = new ManuscriptSnapshotDedupVault({ chunking: SMALL_CHUNKING, stripeDataShards: 4 });
    const sharedTail = makeBytes(24000, 0x9001);
    const p1 = concatBytes([makeBytes(4500, 0x9002), sharedTail]);
    const p2 = concatBytes([makeBytes(4500, 0x9003), sharedTail]);
    const s1 = vault.commitSnapshot("ep-03", "구버전", p1);
    const s2 = vault.commitSnapshot("ep-03", "현행본", p2);

    expect(vault.deleteSnapshot(s1.snapshotId)).toBe(true);
    expect(vault.deleteSnapshot("snap-missing")).toBe(false);
    expect(vault.getVaultHealthSnapshot().unreferencedChunkCount).toBeGreaterThan(0);

    const gc = vault.compactUnreferencedChunks();
    expect(gc.reclaimedChunkCount).toBeGreaterThan(0);
    expect(gc.reclaimedChunkBytes).toBeGreaterThan(0);
    expect(vault.getVaultHealthSnapshot().unreferencedChunkCount).toBe(0);
    expect(bytesEqual(vault.restoreSnapshotBytes(s2.snapshotId).bytes, p2)).toBe(true);

    const liveStripe = vault.getVaultHealthSnapshot().stripes.find((st) => st.dataShardCount >= 2);
    expect(liveStripe).toBeDefined();
    if (!liveStripe) return;
    vault.dropChunkDataForTest(liveStripe.dataChunkIds[0] ?? "");
    vault.injectChunkBitFlipForTest(liveStripe.dataChunkIds[1] ?? "", 5, 0x10);
    const postGcScrub = vault.scrubAndHealVault();
    expect(postGcScrub.allDataIntact).toBe(true);
    expect(postGcScrub.healedDataChunkCount).toBe(2);
    expect(bytesEqual(vault.restoreSnapshotBytes(s2.snapshotId).bytes, p2)).toBe(true);
  });

  it("단일 스냅샷 내 반복 블록의 참조 카운트와 GC 전체 회수가 정확히 동작한다", () => {
    const vault = new ManuscriptSnapshotDedupVault({
      chunking: { minChunkBytes: 512, avgChunkBytes: 1024, maxChunkBytes: 4096 },
      stripeDataShards: 4,
    });
    const block = makeBytes(6000, 0x3333);
    const payload = concatBytes([block, block, block]);
    const commit = vault.commitSnapshot("ep-repeat", "반복 배경 컷", payload);
    expect(commit.reusedChunkCount).toBeGreaterThan(0);
    expect(bytesEqual(vault.restoreSnapshotBytes(commit.snapshotId).bytes, payload)).toBe(true);

    expect(vault.deleteSnapshot(commit.snapshotId)).toBe(true);
    const gc = vault.compactUnreferencedChunks();
    expect(gc.remainingChunkCount).toBe(0);
    expect(gc.remainingStripeCount).toBe(0);
  });

  it("빈 페이로드 스냅샷과 미존재 스냅샷 복원 요청을 안전하게 처리한다", () => {
    const vault = new ManuscriptSnapshotDedupVault();
    const emptyCommit = vault.commitSnapshot("ep-00", "빈 캔버스", new Uint8Array(0));
    expect(emptyCommit.logicalBytes).toBe(0);
    const restoredEmpty = vault.restoreSnapshotBytes(emptyCommit.snapshotId);
    expect(restoredEmpty.ok).toBe(true);
    expect(restoredEmpty.bytes?.length).toBe(0);

    const missing = vault.restoreSnapshotBytes("snap-9999");
    expect(missing.ok).toBe(false);
    expect(missing.failureReason).toBe("snapshot-not-found");
  });

  it("잘못된 stripeDataShards 설정은 RangeError로 차단한다", () => {
    expect(() => new ManuscriptSnapshotDedupVault({ stripeDataShards: 0 })).toThrow(RangeError);
    expect(() => new ManuscriptSnapshotDedupVault({ stripeDataShards: 255 })).toThrow(RangeError);
  });
});

describe("Wave 146 — 순수 OKLCH SVG 대시보드 & 한국어 내구성 QA 브리프", () => {
  it("SVG 출력에 원시 #hex·rgb()·hsl() 색상이 0건이고 순수 oklch(...)만 사용한다", () => {
    const vault = new ManuscriptSnapshotDedupVault({ chunking: SMALL_CHUNKING });
    const base = makeBytes(28000, 0x146a);
    const shifted = concatBytes([makeBytes(37, 0x146b), base]);
    vault.commitSnapshot("ep-14", "1차 저장", base);
    vault.commitSnapshot("ep-14", "말풍선 보정", shifted);
    const cmp = compareFixedVsFastCdcDedup(base, shifted, SMALL_CHUNKING);
    const svg = renderSnapshotVaultHealthSvg(vault.getVaultHealthSnapshot(cmp));

    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("oklch(");
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svg).not.toMatch(/\brgba?\s*\(/i);
    expect(svg).not.toMatch(/\bhsla?\s*\(/i);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });

  it("에피소드명·수정 라벨·제목의 XSS/XML 특수문자를 완벽히 이스케이프한다", () => {
    expect(escapeVaultXml(`<script>"a"&'b'</script>`)).toBe(
      "&lt;script&gt;&quot;a&quot;&amp;&apos;b&apos;&lt;/script&gt;",
    );
    const vault = new ManuscriptSnapshotDedupVault({ chunking: SMALL_CHUNKING });
    vault.commitSnapshot(`<img src=x>`, `수정 & '검토'`, makeBytes(4096, 0x555));
    const svg = renderSnapshotVaultHealthSvg(vault.getVaultHealthSnapshot(), {
      titleKo: `금고 & 리포트 <script>alert("xss")</script>`,
    });
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<img ");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&quot;");
    expect(svg).toContain("&apos;");
  });

  it("자가 치유 완료 및 복구 예산 초과 경고를 SVG와 한국어 QA 브리프에 정확히 반영한다", () => {
    const vault = new ManuscriptSnapshotDedupVault({ chunking: SMALL_CHUNKING, stripeDataShards: 4 });
    const base = makeBytes(20000, 0x8811);
    const shifted = concatBytes([makeBytes(37, 0x8812), base]);
    vault.commitSnapshot("ep-21", "초고", base);
    vault.commitSnapshot("ep-21", "수정본", shifted);
    const cmp = compareFixedVsFastCdcDedup(base, shifted, SMALL_CHUNKING);
    const stripe = vault.getVaultHealthSnapshot().stripes[0];
    expect(stripe).toBeDefined();
    if (!stripe) return;

    vault.injectChunkBitFlipForTest(stripe.dataChunkIds[0] ?? "", 0, 0x01);
    vault.scrubAndHealVault();
    const healedHealth = vault.getVaultHealthSnapshot(cmp);
    expect(renderSnapshotVaultHealthSvg(healedHealth)).toContain("자동 치유 완료");
    const healedBrief = summarizeSnapshotVaultHealthKo(healedHealth, cmp);
    expect(healedBrief.overallGrade).toBe("healed");
    expect(healedBrief.fullBriefTextKo).toContain("100% 동일하게 되살렸습니다");
    expect(healedBrief.reportSha256Hex).toMatch(/^[0-9a-f]{64}$/);

    vault.dropChunkDataForTest(stripe.dataChunkIds[0] ?? "");
    vault.dropChunkDataForTest(stripe.dataChunkIds[1] ?? "");
    vault.dropParityShardForTest(stripe.stripeId, "P");
    vault.scrubAndHealVault();
    const degradedHealth = vault.getVaultHealthSnapshot(cmp);
    const degradedSvg = renderSnapshotVaultHealthSvg(degradedHealth);
    expect(degradedSvg).toContain("복구 예산 초과 경고");
    expect(degradedSvg).toContain("3+ 손실 차단");
    expect(summarizeSnapshotVaultHealthKo(degradedHealth, cmp).overallGrade).toBe("degraded");
  });

  it("빈 금고 상태에서도 SVG와 한국어 브리프가 오류 없이 결정론적으로 생성된다", () => {
    const health = new ManuscriptSnapshotDedupVault().getVaultHealthSnapshot();
    const svg = renderSnapshotVaultHealthSvg(health);
    const briefA = summarizeSnapshotVaultHealthKo(health);
    const briefB = summarizeSnapshotVaultHealthKo(health);
    expect(svg).toContain("커밋된 원고 스냅샷이 아직 없습니다.");
    expect(svg).not.toContain("NaN");
    expect(briefA.overallGrade).toBe("healthy");
    expect(briefA.reportSha256Hex).toBe(briefB.reportSha256Hex);
  });

  it("동일 시퀀스로 커밋된 두 금고 인스턴스의 매니페스트 SHA-256 지문이 완전히 일치한다", () => {
    const runVault = (): string => {
      const v = new ManuscriptSnapshotDedupVault({ chunking: SMALL_CHUNKING, stripeDataShards: 4 });
      const p1 = makeBytes(16000, 0xface1);
      const p2 = concatBytes([makeBytes(29, 0xface2), p1]);
      v.commitSnapshot("ep-99", "v1", p1);
      v.commitSnapshot("ep-99", "v2", p2);
      v.scrubAndHealVault();
      return v.getVaultHealthSnapshot().vaultManifestSha256Hex;
    };
    const hashA = runVault();
    expect(hashA).toBe(runVault());
    expect(hashA).toMatch(/^[0-9a-f]{64}$/);
  });
});
