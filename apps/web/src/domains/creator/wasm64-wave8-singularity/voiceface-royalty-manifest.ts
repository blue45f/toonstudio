/**
 * Wave 8 Singularity — 온디바이스 음성→52-VRM 표정 애니메이터 및 무가스(₩0) 암호화 로열티 분배 주입기.
 */

export const ARKIT_52_BLENDSHAPE_NAMES = [
  "browDownLeft",
  "browDownRight",
  "browInnerUp",
  "browOuterUpLeft",
  "browOuterUpRight",
  "cheekPuff",
  "cheekSquintLeft",
  "cheekSquintRight",
  "eyeBlinkLeft",
  "eyeBlinkRight",
  "eyeLookDownLeft",
  "eyeLookDownRight",
  "eyeLookInLeft",
  "eyeLookInRight",
  "eyeLookOutLeft",
  "eyeLookOutRight",
  "eyeLookUpLeft",
  "eyeLookUpRight",
  "eyeSquintLeft",
  "eyeSquintRight",
  "eyeWideLeft",
  "eyeWideRight",
  "jawForward",
  "jawLeft",
  "jawOpen",
  "jawRight",
  "mouthClose",
  "mouthDimpleLeft",
  "mouthDimpleRight",
  "mouthFrownLeft",
  "mouthFrownRight",
  "mouthFunnel",
  "mouthLeft",
  "mouthLowerDownLeft",
  "mouthLowerDownRight",
  "mouthPressLeft",
  "mouthPressRight",
  "mouthPucker",
  "mouthRight",
  "mouthRollLower",
  "mouthRollUpper",
  "mouthShrugLower",
  "mouthShrugUpper",
  "mouthSmileLeft",
  "mouthSmileRight",
  "mouthStretchLeft",
  "mouthStretchRight",
  "mouthUpperUpLeft",
  "mouthUpperUpRight",
  "noseSneerLeft",
  "noseSneerRight",
  "tongueOut",
] as const;

export type Arkit52BlendshapeName = (typeof ARKIT_52_BLENDSHAPE_NAMES)[number];

export interface VrmVisemeExpressionWeights {
  readonly aa: number;
  readonly ih: number;
  readonly ou: number;
  readonly ee: number;
  readonly oh: number;
  readonly blink: number;
}

export interface VoiceExpressionFrameResult {
  readonly rmsEnergy: number;
  readonly zeroCrossingRate: number;
  readonly spectralCentroidHz: number;
  readonly dominantViseme: "sil" | "aa" | "ih" | "ou" | "ee" | "oh";
  readonly vrmVisemes: VrmVisemeExpressionWeights;
  readonly arkit52: Readonly<Record<Arkit52BlendshapeName, number>>;
  readonly serverCostKrw: 0;
}

function computeRadix2PowerSpectrum(samples: Float32Array, fftSize: number): Float64Array {
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  const copyLen = Math.min(samples.length, fftSize);
  for (let i = 0; i < copyLen; i += 1) {
    const hann = 0.5 * (1 - Math.cos((2 * Math.PI * i) / Math.max(1, copyLen - 1)));
    re[i] = samples[i]! * hann;
  }

  let j = 0;
  for (let i = 1; i < fftSize; i += 1) {
    let bit = fftSize >>> 1;
    while ((j & bit) !== 0) {
      j ^= bit;
      bit >>>= 1;
    }
    j ^= bit;
    if (i < j) {
      const tmpR = re[i]!;
      re[i] = re[j]!;
      re[j] = tmpR;
    }
  }

  for (let len = 2; len <= fftSize; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    const half = len >>> 1;
    for (let i = 0; i < fftSize; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < half; k += 1) {
        const uRe = re[i + k]!;
        const uIm = im[i + k]!;
        const vRe = re[i + k + half]! * wRe - im[i + k + half]! * wIm;
        const vIm = re[i + k + half]! * wIm + im[i + k + half]! * wRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + half] = uRe - vRe;
        im[i + k + half] = uIm - vIm;
        const nextWRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextWRe;
      }
    }
  }

  const bins = (fftSize >>> 1) + 1;
  const power = new Float64Array(bins);
  for (let b = 0; b < bins; b += 1) {
    power[b] = re[b]! * re[b]! + im[b]! * im[b]!;
  }
  return power;
}

/**
 * 웹캠이나 서버 AI 없이 로컬 PCM 오디오 프레임만으로 52개 ARKit 블렌드셰이프와
 * VRM 5모음(aa, ih, ou, ee, oh)·눈썹·눈깜빡임을 구동하는 멀티모달 애니메이터.
 */
export class VoiceToVrmExpressionAnimator {
  private readonly sampleRateHz: number;
  private readonly noiseFloorRms: number;
  private readonly smoothing: number;
  private elapsedSec = 0;
  private readonly prevArkit = new Float64Array(ARKIT_52_BLENDSHAPE_NAMES.length);
  private prevVisemes = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };

  public constructor(options: {
    readonly sampleRateHz?: number;
    readonly noiseFloorRms?: number;
    readonly smoothing?: number;
  } = {}) {
    this.sampleRateHz = Math.max(8000, options.sampleRateHz ?? 16000);
    this.noiseFloorRms = Math.max(1e-4, options.noiseFloorRms ?? 0.012);
    this.smoothing = Math.max(0, Math.min(0.92, options.smoothing ?? 0.35));
  }

  public stepPcmFrame(pcmSamples: Float32Array, deltaTimeSec?: number): VoiceExpressionFrameResult {
    const n = pcmSamples.length;
    const dt = Math.max(0.001, deltaTimeSec ?? (n > 0 ? n / this.sampleRateHz : 1 / 60));
    this.elapsedSec += dt;

    let sumSq = 0;
    let zeroCrossings = 0;
    for (let i = 0; i < n; i += 1) {
      const s = pcmSamples[i]!;
      sumSq += s * s;
      if (i > 0 && (s >= 0) !== (pcmSamples[i - 1]! >= 0)) zeroCrossings += 1;
    }
    const rmsEnergy = n > 0 ? Math.sqrt(sumSq / n) : 0;
    const zeroCrossingRate = n > 1 ? zeroCrossings / (n - 1) : 0;

    const fftSize = 512;
    const power = computeRadix2PowerSpectrum(pcmSamples, fftSize);
    const binHz = this.sampleRateHz / fftSize;

    let totalPower = 0;
    let weightedFreq = 0;
    let lowBand = 0;
    let openF1Band = 0;
    let midF2Band = 0;
    let highBand = 0;

    for (let b = 1; b < power.length; b += 1) {
      const f = b * binHz;
      const p = power[b]!;
      totalPower += p;
      weightedFreq += f * p;
      if (f >= 200 && f < 680) lowBand += p;
      else if (f >= 680 && f < 1300) openF1Band += p;
      else if (f >= 1300 && f < 2150) midF2Band += p;
      else if (f >= 2150 && f <= 4200) highBand += p;
    }

    const spectralCentroidHz = totalPower > 1e-12 ? weightedFreq / totalPower : 0;
    const voicedGate =
      rmsEnergy <= this.noiseFloorRms
        ? 0
        : Math.min(1, (rmsEnergy - this.noiseFloorRms) / Math.max(0.05, 0.28 - this.noiseFloorRms));

    const bandSum = lowBand + openF1Band + midF2Band + highBand + 1e-12;
    const rLow = lowBand / bandSum;
    const rOpen = openF1Band / bandSum;
    const rMid = midF2Band / bandSum;
    const rHigh = highBand / bandSum;

    let rawAa = 0;
    let rawIh = 0;
    let rawOu = 0;
    let rawEe = 0;
    let rawOh = 0;

    if (voicedGate > 0) {
      rawAa = voicedGate * Math.min(1, rOpen * 2.1 + 0.15);
      rawIh = voicedGate * Math.min(1, rHigh * 2.3);
      rawEe = voicedGate * Math.min(1, (rMid * 1.2 + rHigh * 0.9) * 1.15);
      rawOu = voicedGate * Math.min(1, rLow * 1.85 * (spectralCentroidHz < 720 ? 1.15 : 0.55));
      rawOh = voicedGate * Math.min(1, (rLow * 0.9 + rOpen * 0.65) * (rHigh < 0.15 ? 1.1 : 0.5));
    }

    const alpha = 1 - this.smoothing;
    const aa = Math.min(1, this.prevVisemes.aa * this.smoothing + rawAa * alpha);
    const ih = Math.min(1, this.prevVisemes.ih * this.smoothing + rawIh * alpha);
    const ou = Math.min(1, this.prevVisemes.ou * this.smoothing + rawOu * alpha);
    const ee = Math.min(1, this.prevVisemes.ee * this.smoothing + rawEe * alpha);
    const oh = Math.min(1, this.prevVisemes.oh * this.smoothing + rawOh * alpha);
    this.prevVisemes = { aa, ih, ou, ee, oh };

    const cyclePhase = this.elapsedSec % 3.5;
    const blink = cyclePhase < 0.16 ? Math.sin((Math.PI * cyclePhase) / 0.16) ** 2 : 0;

    let dominantViseme: VoiceExpressionFrameResult["dominantViseme"] = "sil";
    if (voicedGate > 0.05) {
      const candidates: readonly [VoiceExpressionFrameResult["dominantViseme"], number][] = [
        ["aa", aa],
        ["ih", ih],
        ["ou", ou],
        ["ee", ee],
        ["oh", oh],
      ];
      let bestScore = -1;
      for (const [label, sc] of candidates) {
        if (sc > bestScore) {
          bestScore = sc;
          dominantViseme = label;
        }
      }
    }

    const jawOpenTarget = Math.min(
      1,
      voicedGate * (0.85 * aa + 0.55 * oh + 0.42 * ee + 0.25 * ih + 0.22 * ou),
    );
    const browAccent = Math.min(
      1,
      voicedGate * Math.max(0, (spectralCentroidHz - 450) / 2400) * 0.75 + voicedGate * 0.2,
    );
    const smileAccent = Math.min(1, 0.55 * ih + 0.45 * ee);
    const puckerAccent = Math.min(1, 0.85 * ou + 0.45 * oh);
    const funnelAccent = Math.min(1, 0.75 * oh + 0.5 * ou);

    const targetMap: Partial<Record<Arkit52BlendshapeName, number>> = {
      jawOpen: jawOpenTarget,
      mouthFunnel: funnelAccent,
      mouthPucker: puckerAccent,
      mouthSmileLeft: smileAccent,
      mouthSmileRight: smileAccent,
      mouthStretchLeft: ih * 0.45,
      mouthStretchRight: ih * 0.45,
      mouthLowerDownLeft: aa * 0.5,
      mouthLowerDownRight: aa * 0.5,
      mouthUpperUpLeft: (aa + ee) * 0.25,
      mouthUpperUpRight: (aa + ee) * 0.25,
      browInnerUp: browAccent,
      browOuterUpLeft: browAccent * 0.65,
      browOuterUpRight: browAccent * 0.65,
      eyeBlinkLeft: blink,
      eyeBlinkRight: blink,
      eyeWideLeft: browAccent * (1 - blink) * 0.35,
      eyeWideRight: browAccent * (1 - blink) * 0.35,
      cheekSquintLeft: smileAccent * 0.3,
      cheekSquintRight: smileAccent * 0.3,
    };

    const arkitRecord = {} as Record<Arkit52BlendshapeName, number>;
    for (let i = 0; i < ARKIT_52_BLENDSHAPE_NAMES.length; i += 1) {
      const name = ARKIT_52_BLENDSHAPE_NAMES[i]!;
      const raw = Math.max(0, Math.min(1, targetMap[name] ?? 0));
      const nextVal = name.startsWith("eyeBlink")
        ? raw
        : this.prevArkit[i]! * this.smoothing + raw * alpha;
      const clamped = Math.max(0, Math.min(1, nextVal));
      this.prevArkit[i] = clamped;
      arkitRecord[name] = clamped;
    }

    return {
      rmsEnergy,
      zeroCrossingRate,
      spectralCentroidHz,
      dominantViseme,
      vrmVisemes: { aa, ih, ou, ee, oh, blink },
      arkit52: arkitRecord,
      serverCostKrw: 0,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* 무가스(₩0) 암호화 공동 창작자 로열티 분배 매니페스트 주입·검증기           */
/* -------------------------------------------------------------------------- */

export const TOTAL_ROYALTY_BASIS_POINTS = 10_000;

export interface RoyaltyRecipientShare {
  readonly creatorId: string;
  readonly role: string;
  readonly shareBps: number;
}

export interface RoyaltyLicenseTerms {
  readonly commercialUse: boolean;
  readonly aiTrainingAllowed: boolean;
  readonly derivativePolicy: "prohibited" | "share-alike" | "attribution-only";
  readonly territory: string;
  readonly effectiveFromIso: string;
}

export interface RoyaltySplitManifestInput {
  readonly workId: string;
  readonly episodeNumber: number;
  readonly recipients: readonly RoyaltyRecipientShare[];
  readonly licenseTerms: RoyaltyLicenseTerms;
}

export interface SignedRoyaltyManifestPayload {
  readonly schemaVersion: "toonstudio-royalty-v1";
  readonly workId: string;
  readonly episodeNumber: number;
  readonly artworkSha256Hex: string;
  readonly totalBps: 10_000;
  readonly recipients: readonly RoyaltyRecipientShare[];
  readonly licenseTerms: RoyaltyLicenseTerms;
  readonly publicKeyJwk: JsonWebKey;
  readonly signatureBase64: string;
}

export interface RoyaltyManifestVerificationResult {
  readonly valid: boolean;
  readonly tampered: boolean;
  readonly reason: string | null;
  readonly manifest: SignedRoyaltyManifestPayload | null;
  readonly serverCostKrw: 0;
  readonly gasFeeKrw: 0;
}

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_ROYALTY_CHUNK_TYPE = new Uint8Array([0x72, 0x75, 0x59, 0x4c]);
const TRAILER_MAGIC = new Uint8Array([0x54, 0x53, 0x52, 0x59]);
const UTF8_ENC = new TextEncoder();
const UTF8_DEC = new TextDecoder();

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.byteLength; i += 1) {
    crc = (CRC32_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.byteLength; i += 1) out += bytes[i]!.toString(16).padStart(2, "0");
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i += 1) bin += String.fromCharCode(bytes[i]!);
  return globalThis.btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = globalThis.atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i) & 0xff;
  return out;
}

function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJsonStringify(item)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${sortedKeys.map((k) => `${JSON.stringify(k)}:${canonicalJsonStringify(obj[k])}`).join(",")}}`;
}

async function sha256HexAsync(data: Uint8Array): Promise<string> {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copy.buffer);
  return bytesToHex(new Uint8Array(digest));
}

function hasPrefix(buf: Uint8Array, prefix: Uint8Array, offset = 0): boolean {
  if (buf.byteLength < offset + prefix.byteLength) return false;
  for (let i = 0; i < prefix.byteLength; i += 1) {
    if (buf[offset + i] !== prefix[i]) return false;
  }
  return true;
}

/** WebCrypto ECDSA P-256 로열티 서명 키쌍을 로컬에서 무비용 생성한다. */
export async function generateRoyaltySigningKeyPair(): Promise<CryptoKeyPair> {
  return globalThis.crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
}

function validateRoyaltyShares(recipients: readonly RoyaltyRecipientShare[]): void {
  if (recipients.length === 0) {
    throw new Error("공동 창작자 로열티 수취인이 최소 1명 이상이어야 합니다.");
  }
  const seen = new Set<string>();
  let totalBps = 0;
  for (const r of recipients) {
    if (!r.creatorId.trim()) throw new Error("창작자 ID는 비어 있을 수 없습니다.");
    if (seen.has(r.creatorId)) throw new Error(`중복된 창작자 ID입니다: ${r.creatorId}`);
    seen.add(r.creatorId);
    if (!Number.isInteger(r.shareBps) || r.shareBps <= 0 || r.shareBps > TOTAL_ROYALTY_BASIS_POINTS) {
      throw new Error("지분(shareBps)은 1..10,000 범위의 양의 정수여야 합니다.");
    }
    totalBps += r.shareBps;
  }
  if (totalBps !== TOTAL_ROYALTY_BASIS_POINTS) {
    throw new Error(`로열티 지분 합계는 정확히 10,000 bps여야 합니다(현재: ${totalBps}).`);
  }
}

/** 10,000 bps 합계를 검증하고 최대 잉여법(Hamilton)으로 1원 오차 없는 정수 정산 분배액을 산출한다. */
export function calculateBasisPointPayouts(
  totalAmountKrw: number,
  recipients: readonly RoyaltyRecipientShare[],
): ReadonlyMap<string, number> {
  validateRoyaltyShares(recipients);
  const safeTotal = Math.max(0, Math.trunc(totalAmountKrw));
  const floors = new Array<number>(recipients.length);
  const remainders: { idx: number; rem: number; creatorId: string }[] = [];
  let distributed = 0;

  for (let i = 0; i < recipients.length; i += 1) {
    const r = recipients[i]!;
    const exact = (safeTotal * r.shareBps) / TOTAL_ROYALTY_BASIS_POINTS;
    const fl = Math.floor(exact);
    floors[i] = fl;
    distributed += fl;
    remainders.push({ idx: i, rem: exact - fl, creatorId: r.creatorId });
  }

  let leftover = safeTotal - distributed;
  remainders.sort((a, b) => b.rem - a.rem || (a.creatorId < b.creatorId ? -1 : 1));
  for (let i = 0; i < remainders.length && leftover > 0; i += 1) {
    const targetIdx = remainders[i]!.idx;
    floors[targetIdx] = floors[targetIdx]! + 1;
    leftover -= 1;
  }

  const out = new Map<string, number>();
  for (let i = 0; i < recipients.length; i += 1) out.set(recipients[i]!.creatorId, floors[i]!);
  return out;
}

/** 원고/패키지 바이너리에 SHA-256 해시 + WebCrypto ECDSA 서명된 10,000 bps 로열티 청크를 주입한다. */
export async function injectRoyaltySplitManifest(
  artworkBytes: Uint8Array,
  manifestInput: RoyaltySplitManifestInput,
  signingPrivateKey: CryptoKey,
  signerPublicKey: CryptoKey,
): Promise<Uint8Array> {
  validateRoyaltyShares(manifestInput.recipients);
  const artworkSha256Hex = await sha256HexAsync(artworkBytes);
  const publicKeyJwk = await globalThis.crypto.subtle.exportKey("jwk", signerPublicKey);

  const unsignedRecord = {
    schemaVersion: "toonstudio-royalty-v1" as const,
    workId: manifestInput.workId,
    episodeNumber: manifestInput.episodeNumber,
    artworkSha256Hex,
    totalBps: TOTAL_ROYALTY_BASIS_POINTS as 10_000,
    recipients: manifestInput.recipients.map((r) => ({
      creatorId: r.creatorId,
      role: r.role,
      shareBps: r.shareBps,
    })),
    licenseTerms: { ...manifestInput.licenseTerms },
    publicKeyJwk,
  };

  const canonicalUnsignedBytes = UTF8_ENC.encode(canonicalJsonStringify(unsignedRecord));
  const sigBuf = await globalThis.crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    signingPrivateKey,
    canonicalUnsignedBytes,
  );

  const fullManifest: SignedRoyaltyManifestPayload = {
    ...unsignedRecord,
    signatureBase64: bytesToBase64(new Uint8Array(sigBuf)),
  };
  const chunkPayload = UTF8_ENC.encode(canonicalJsonStringify(fullManifest));

  if (hasPrefix(artworkBytes, PNG_SIGNATURE) && artworkBytes.byteLength >= 20) {
    const iendOffset = artworkBytes.byteLength - 12;
    const isIend =
      artworkBytes[iendOffset + 4] === 0x49 &&
      artworkBytes[iendOffset + 5] === 0x45 &&
      artworkBytes[iendOffset + 6] === 0x4e &&
      artworkBytes[iendOffset + 7] === 0x44;
    if (isIend) {
      const chunkTotal = 12 + chunkPayload.byteLength;
      const out = new Uint8Array(artworkBytes.byteLength + chunkTotal);
      out.set(artworkBytes.subarray(0, iendOffset), 0);
      const view = new DataView(out.buffer);
      view.setUint32(iendOffset, chunkPayload.byteLength, false);
      out.set(PNG_ROYALTY_CHUNK_TYPE, iendOffset + 4);
      out.set(chunkPayload, iendOffset + 8);
      const crc = computeCrc32(out.subarray(iendOffset + 4, iendOffset + 8 + chunkPayload.byteLength));
      view.setUint32(iendOffset + 8 + chunkPayload.byteLength, crc, false);
      out.set(artworkBytes.subarray(iendOffset), iendOffset + chunkTotal);
      return out;
    }
  }

  const out = new Uint8Array(artworkBytes.byteLength + chunkPayload.byteLength + 12);
  out.set(artworkBytes, 0);
  out.set(chunkPayload, artworkBytes.byteLength);
  const footerOffset = artworkBytes.byteLength + chunkPayload.byteLength;
  const view = new DataView(out.buffer);
  view.setUint32(footerOffset, chunkPayload.byteLength, false);
  view.setUint32(footerOffset + 4, computeCrc32(chunkPayload), false);
  out.set(TRAILER_MAGIC, footerOffset + 8);
  return out;
}

/** 내장된 로열티 청크의 CRC-32, 원본 아트워크 SHA-256, 지분 합계, ECDSA 서명을 검증해 1바이트 위변조도 탐지한다. */
export async function verifyEmbeddedRoyaltyManifest(
  embeddedBytes: Uint8Array,
): Promise<RoyaltyManifestVerificationResult> {
  const fail = (reason: string, tampered = true): RoyaltyManifestVerificationResult => ({
    valid: false,
    tampered,
    reason,
    manifest: null,
    serverCostKrw: 0,
    gasFeeKrw: 0,
  });

  let strippedArtwork: Uint8Array | null = null;
  let manifestBytes: Uint8Array | null = null;

  if (hasPrefix(embeddedBytes, PNG_SIGNATURE)) {
    let pos = 8;
    const view = new DataView(embeddedBytes.buffer, embeddedBytes.byteOffset, embeddedBytes.byteLength);
    while (pos + 12 <= embeddedBytes.byteLength) {
      const len = view.getUint32(pos, false);
      if (pos + 12 + len > embeddedBytes.byteLength) return fail("손상된 PNG 청크 길이입니다.");
      if (hasPrefix(embeddedBytes, PNG_ROYALTY_CHUNK_TYPE, pos + 4)) {
        const expectedCrc = view.getUint32(pos + 8 + len, false);
        const actualCrc = computeCrc32(embeddedBytes.subarray(pos + 4, pos + 8 + len));
        if (expectedCrc !== actualCrc) return fail("PNG 로열티 청크 CRC-32 불일치(변조 감지).");
        manifestBytes = embeddedBytes.subarray(pos + 8, pos + 8 + len);
        strippedArtwork = new Uint8Array(embeddedBytes.byteLength - (12 + len));
        strippedArtwork.set(embeddedBytes.subarray(0, pos), 0);
        strippedArtwork.set(embeddedBytes.subarray(pos + 12 + len), pos);
        break;
      }
      pos += 12 + len;
    }
  } else if (
    embeddedBytes.byteLength >= 12 &&
    hasPrefix(embeddedBytes, TRAILER_MAGIC, embeddedBytes.byteLength - 4)
  ) {
    const footerOffset = embeddedBytes.byteLength - 12;
    const view = new DataView(embeddedBytes.buffer, embeddedBytes.byteOffset, embeddedBytes.byteLength);
    const payloadLen = view.getUint32(footerOffset, false);
    const expectedCrc = view.getUint32(footerOffset + 4, false);
    if (payloadLen + 12 > embeddedBytes.byteLength) return fail("손상된 로열티 트레일러 길이입니다.");
    const payloadStart = footerOffset - payloadLen;
    manifestBytes = embeddedBytes.subarray(payloadStart, footerOffset);
    if (computeCrc32(manifestBytes) !== expectedCrc) {
      return fail("로열티 트레일러 CRC-32 불일치(변조 감지).");
    }
    strippedArtwork = embeddedBytes.subarray(0, payloadStart);
  }

  if (!strippedArtwork || !manifestBytes) {
    return fail("내장된 로열티 매니페스트 청크가 없습니다.", false);
  }

  let parsed: SignedRoyaltyManifestPayload;
  try {
    parsed = JSON.parse(UTF8_DEC.decode(manifestBytes)) as SignedRoyaltyManifestPayload;
    validateRoyaltyShares(parsed.recipients);
  } catch {
    return fail("로열티 매니페스트 JSON 파싱 또는 지분 규칙 검증에 실패했습니다.");
  }

  const actualArtworkSha256 = await sha256HexAsync(strippedArtwork);
  if (actualArtworkSha256 !== parsed.artworkSha256Hex) {
    return fail("원본 아트워크 SHA-256 다이제스트 불일치(픽셀/바이트 변조 감지).");
  }

  try {
    const pubKey = await globalThis.crypto.subtle.importKey(
      "jwk",
      parsed.publicKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const unsignedRecord = {
      schemaVersion: parsed.schemaVersion,
      workId: parsed.workId,
      episodeNumber: parsed.episodeNumber,
      artworkSha256Hex: parsed.artworkSha256Hex,
      totalBps: parsed.totalBps,
      recipients: parsed.recipients.map((r) => ({
        creatorId: r.creatorId,
        role: r.role,
        shareBps: r.shareBps,
      })),
      licenseTerms: { ...parsed.licenseTerms },
      publicKeyJwk: parsed.publicKeyJwk,
    };
    const canonicalUnsignedBytes = UTF8_ENC.encode(canonicalJsonStringify(unsignedRecord));
    const sigRaw = base64ToBytes(parsed.signatureBase64);
    const sigCopy = new Uint8Array(sigRaw.byteLength);
    sigCopy.set(sigRaw);
    const sigOk = await globalThis.crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pubKey,
      sigCopy.buffer,
      canonicalUnsignedBytes,
    );
    if (!sigOk) return fail("ECDSA 전자서명 검증에 실패했습니다(지분·계약 변조 감지).");
  } catch {
    return fail("ECDSA 공개키 또는 서명 형식이 유효하지 않습니다.");
  }

  return {
    valid: true,
    tampered: false,
    reason: null,
    manifest: parsed,
    serverCostKrw: 0,
    gasFeeKrw: 0,
  };
}
