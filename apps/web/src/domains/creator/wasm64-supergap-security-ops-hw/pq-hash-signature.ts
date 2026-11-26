/**
 * #14 양자내성 하이브리드 해시 서명 (SHA-256 WOTS+ / Winternitz OTS w=16 + WebCrypto ECDSA P-256).
 *
 * - RFC 8391 규격 기반 SHA-256 WOTS+ (n=32, w=16, len1=64, len2=3, len=67) 일회성 해시 체인 서명
 * - 고전 타원곡선 WebCrypto ECDSA P-256과 결합한 이중(Classical + Post-Quantum) 원고 진본 봉인
 * - 서버 HSM·유료 TSA 없이 ₩0 브라우저 로컬 완결
 */

import {
  bytesToBase64Url,
  bytesToHex,
  canonicalJsonBytes,
  concatBytes,
  constantTimeEqual,
  getCryptoApi,
  hexToBytes,
  randomBytes,
  sha256Bytes,
  sha256Hex,
  toStrictArrayBuffer,
  base64UrlToBytes,
} from "./crypto-binary-utils";

export const WOTS_PLUS_N = 32;
export const WOTS_PLUS_W = 16;
export const WOTS_PLUS_LOG2_W = 4;
export const WOTS_PLUS_LEN1 = 64;
export const WOTS_PLUS_LEN2 = 3;
export const WOTS_PLUS_LEN = WOTS_PLUS_LEN1 + WOTS_PLUS_LEN2;

const DOMAIN_F_PREFIX = createDomainPrefix32(0);
const DOMAIN_PRF_PREFIX = createDomainPrefix32(3);
const DOMAIN_SK_PREFIX = createDomainPrefix32(4);

function createDomainPrefix32(domainId: number): Uint8Array {
  const buf = new Uint8Array(32);
  buf[31] = domainId & 0xff;
  return buf;
}

/** RFC 8391 OTS ADRS(32바이트 빅엔디안 주소 구조체) 생성. */
function buildOtsAddressBytes(
  otsAddress: number,
  chainAddress: number,
  hashAddress: number,
  keyAndMask: number,
): Uint8Array {
  const adrs = new Uint8Array(32);
  const view = new DataView(adrs.buffer);
  view.setUint32(0, 0, false); // layerAddress = 0
  view.setUint32(4, 0, false); // treeAddress high = 0
  view.setUint32(8, 0, false); // treeAddress low = 0
  view.setUint32(12, 0, false); // type = 0 (OTS hash address)
  view.setUint32(16, otsAddress >>> 0, false);
  view.setUint32(20, chainAddress >>> 0, false);
  view.setUint32(24, hashAddress >>> 0, false);
  view.setUint32(28, keyAndMask >>> 0, false);
  return adrs;
}

/** 도메인 분리 의사난수 함수 PRF(seed, adrs) = SHA-256(toByte(3,32) || seed || adrs). */
function wotsPrf(seed32: Uint8Array, adrs32: Uint8Array, isSecretDerivation = false): Uint8Array {
  const input = new Uint8Array(96);
  input.set(isSecretDerivation ? DOMAIN_SK_PREFIX : DOMAIN_PRF_PREFIX, 0);
  input.set(seed32, 32);
  input.set(adrs32, 64);
  return sha256Bytes(input);
}

/** 도메인 분리 해시 체인 단계 F(key, x) = SHA-256(toByte(0,32) || key || x). */
function wotsF(key32: Uint8Array, masked32: Uint8Array): Uint8Array {
  const input = new Uint8Array(96);
  input.set(DOMAIN_F_PREFIX, 0);
  input.set(key32, 32);
  input.set(masked32, 64);
  return sha256Bytes(input);
}

/** RFC 8391 WOTS+ 체인 함수 chain(X, startStep, steps, pubSeed, adrs). */
function evaluateWotsChain(
  startElement32: Uint8Array,
  startStep: number,
  steps: number,
  pubSeed32: Uint8Array,
  otsAddress: number,
  chainIndex: number,
): Uint8Array {
  if (startStep < 0 || steps < 0 || startStep + steps > WOTS_PLUS_W - 1) {
    throw new Error(
      `WOTS+ 체인 범위 오류: start=${startStep}, steps=${steps}, max=${WOTS_PLUS_W - 1}`,
    );
  }
  let current: Uint8Array = new Uint8Array(startElement32);
  const masked = new Uint8Array(WOTS_PLUS_N);

  for (let step = startStep; step < startStep + steps; step += 1) {
    const keyAdrs = buildOtsAddressBytes(otsAddress, chainIndex, step, 0);
    const maskAdrs = buildOtsAddressBytes(otsAddress, chainIndex, step, 1);
    const key = wotsPrf(pubSeed32, keyAdrs, false);
    const bitmask = wotsPrf(pubSeed32, maskAdrs, false);

    for (let j = 0; j < WOTS_PLUS_N; j += 1) {
      masked[j] = current[j] ^ bitmask[j];
    }
    current = wotsF(key, masked);
  }
  return current;
}

/** SHA-256 다이제스트를 64개 메시지 니블 + 3개 Winternitz 체크섬 니블(총 67개)로 분해. */
function computeWotsBase16Digits(messageDigest32: Uint8Array): Uint8Array {
  const digits = new Uint8Array(WOTS_PLUS_LEN);
  let checksum = 0;

  for (let byteIdx = 0; byteIdx < WOTS_PLUS_N; byteIdx += 1) {
    const b = messageDigest32[byteIdx];
    const hi = (b >>> 4) & 0x0f;
    const lo = b & 0x0f;
    digits[byteIdx * 2] = hi;
    digits[byteIdx * 2 + 1] = lo;
    checksum += WOTS_PLUS_W - 1 - hi + (WOTS_PLUS_W - 1 - lo);
  }

  digits[64] = (checksum >>> 8) & 0x0f;
  digits[65] = (checksum >>> 4) & 0x0f;
  digits[66] = checksum & 0x0f;
  return digits;
}

/** 공개키 67개 체인 종단과 pubSeed의 압축 SHA-256 해시 계산. */
function computeWotsPublicKeyHashHex(pubSeed32: Uint8Array, packedChains: Uint8Array): string {
  return sha256Hex(concatBytes([pubSeed32, packedChains]));
}

export interface WotsPlusPublicKey {
  readonly scheme: "WOTS-PLUS-SHA256-W16";
  readonly n: 32;
  readonly w: 16;
  readonly len: 67;
  readonly otsAddress: number;
  readonly pubSeedHex: string;
  /** 67 × 32바이트(=2,144바이트) 연속 배열의 Base64URL 직렬화. */
  readonly packedChainsBase64Url: string;
  readonly publicKeyHashHex: string;
}

export interface WotsPlusPrivateKey {
  readonly otsAddress: number;
  readonly skSeedHex: string;
  readonly pubSeedHex: string;
  /** 일회성 키 재사용 방지 상태 플래그. */
  consumed: boolean;
}

export interface WotsPlusKeyPair {
  readonly publicKey: WotsPlusPublicKey;
  readonly privateKey: WotsPlusPrivateKey;
}

export interface GenerateWotsPlusOptions {
  /** 결정론적 테스트용 32바이트 시드(미지정 시 WebCrypto CSPRNG 사용). */
  readonly secretSeed?: Uint8Array;
  /** 공개 도메인 시드 32바이트(미지정 시 WebCrypto CSPRNG 사용). */
  readonly publicSeed?: Uint8Array;
  /** XMSS/OTS 주소 인덱스(기본 0). */
  readonly otsAddress?: number;
}

export interface WotsPlusSignOptions {
  /** 일회성 키 재사용 차단을 명시적으로 테스트할 때만 true 허용. */
  readonly allowUnsafeReuse?: boolean;
}

export interface WotsPlusSignature {
  readonly scheme: "WOTS-PLUS-SHA256-W16";
  readonly n: 32;
  readonly w: 16;
  readonly len: 67;
  readonly otsAddress: number;
  readonly pubSeedHex: string;
  readonly messageDigestHex: string;
  /** 67 × 32바이트(=2,144바이트) 서명 체인 원소의 Base64URL 직렬화. */
  readonly signatureBytesBase64Url: string;
  readonly signatureByteLength: number;
}

export interface WotsPlusVerificationResult {
  readonly valid: boolean;
  readonly matchedChains: number;
  readonly totalChains: number;
  readonly recoveredPublicKeyHashHex: string;
  readonly expectedPublicKeyHashHex: string;
  readonly reason?: string;
}

/** SHA-256 WOTS+ (w=16, len=67) 키쌍 생성. */
export function generateWotsPlusKeyPair(options: GenerateWotsPlusOptions = {}): WotsPlusKeyPair {
  const skSeed = options.secretSeed ? new Uint8Array(options.secretSeed) : randomBytes(WOTS_PLUS_N);
  const pubSeed = options.publicSeed ? new Uint8Array(options.publicSeed) : randomBytes(WOTS_PLUS_N);
  if (skSeed.byteLength !== WOTS_PLUS_N || pubSeed.byteLength !== WOTS_PLUS_N) {
    throw new Error("WOTS+ 시드는 정확히 32바이트여야 합니다.");
  }
  const otsAddress = (options.otsAddress ?? 0) >>> 0;
  const packedPublicChains = new Uint8Array(WOTS_PLUS_LEN * WOTS_PLUS_N);

  for (let chainIdx = 0; chainIdx < WOTS_PLUS_LEN; chainIdx += 1) {
    const skAdrs = buildOtsAddressBytes(otsAddress, chainIdx, 0, 2);
    const skElement = wotsPrf(skSeed, skAdrs, true);
    const pkElement = evaluateWotsChain(
      skElement,
      0,
      WOTS_PLUS_W - 1,
      pubSeed,
      otsAddress,
      chainIdx,
    );
    packedPublicChains.set(pkElement, chainIdx * WOTS_PLUS_N);
  }

  const publicKeyHashHex = computeWotsPublicKeyHashHex(pubSeed, packedPublicChains);

  return {
    publicKey: {
      scheme: "WOTS-PLUS-SHA256-W16",
      n: 32,
      w: 16,
      len: 67,
      otsAddress,
      pubSeedHex: bytesToHex(pubSeed),
      packedChainsBase64Url: bytesToBase64Url(packedPublicChains),
      publicKeyHashHex,
    },
    privateKey: {
      otsAddress,
      skSeedHex: bytesToHex(skSeed),
      pubSeedHex: bytesToHex(pubSeed),
      consumed: false,
    },
  };
}

/** SHA-256 WOTS+ 일회성 양자내성 해시 체인 서명 생성. */
export function signWotsPlus(
  message: Uint8Array,
  keyPair: WotsPlusKeyPair,
  options: WotsPlusSignOptions = {},
): WotsPlusSignature {
  if (keyPair.privateKey.consumed && !options.allowUnsafeReuse) {
    throw new Error(
      "WOTS+ 일회성 서명 키는 보안을 위해 재사용할 수 없습니다. 새 키쌍을 생성하세요.",
    );
  }

  const skSeed = hexToBytes(keyPair.privateKey.skSeedHex);
  const pubSeed = hexToBytes(keyPair.privateKey.pubSeedHex);
  const otsAddress = keyPair.privateKey.otsAddress >>> 0;
  const messageDigest = sha256Bytes(message);
  const digits = computeWotsBase16Digits(messageDigest);
  const packedSig = new Uint8Array(WOTS_PLUS_LEN * WOTS_PLUS_N);

  for (let chainIdx = 0; chainIdx < WOTS_PLUS_LEN; chainIdx += 1) {
    const skAdrs = buildOtsAddressBytes(otsAddress, chainIdx, 0, 2);
    const skElement = wotsPrf(skSeed, skAdrs, true);
    const sigElement = evaluateWotsChain(
      skElement,
      0,
      digits[chainIdx],
      pubSeed,
      otsAddress,
      chainIdx,
    );
    packedSig.set(sigElement, chainIdx * WOTS_PLUS_N);
  }

  keyPair.privateKey.consumed = true;

  return {
    scheme: "WOTS-PLUS-SHA256-W16",
    n: 32,
    w: 16,
    len: 67,
    otsAddress,
    pubSeedHex: keyPair.privateKey.pubSeedHex,
    messageDigestHex: bytesToHex(messageDigest),
    signatureBytesBase64Url: bytesToBase64Url(packedSig),
    signatureByteLength: packedSig.byteLength,
  };
}

/** SHA-256 WOTS+ 서명 검증(잔여 해시 체인 완료 후 공개키 67개 체인·해시 상수시간 대조). */
export function verifyWotsPlus(
  message: Uint8Array,
  signature: WotsPlusSignature,
  publicKey: WotsPlusPublicKey,
): WotsPlusVerificationResult {
  if (signature.pubSeedHex !== publicKey.pubSeedHex || signature.otsAddress !== publicKey.otsAddress) {
    return {
      valid: false,
      matchedChains: 0,
      totalChains: WOTS_PLUS_LEN,
      recoveredPublicKeyHashHex: "",
      expectedPublicKeyHashHex: publicKey.publicKeyHashHex,
      reason: "서명의 공개 시드 또는 OTS 주소가 공개키와 일치하지 않습니다.",
    };
  }

  let sigBytes: Uint8Array;
  let expectedPkChains: Uint8Array;
  try {
    sigBytes = base64UrlToBytes(signature.signatureBytesBase64Url);
    expectedPkChains = base64UrlToBytes(publicKey.packedChainsBase64Url);
  } catch {
    return {
      valid: false,
      matchedChains: 0,
      totalChains: WOTS_PLUS_LEN,
      recoveredPublicKeyHashHex: "",
      expectedPublicKeyHashHex: publicKey.publicKeyHashHex,
      reason: "서명 또는 공개키 인코딩이 손상되었습니다.",
    };
  }

  const expectedByteLen = WOTS_PLUS_LEN * WOTS_PLUS_N;
  if (sigBytes.byteLength !== expectedByteLen || expectedPkChains.byteLength !== expectedByteLen) {
    return {
      valid: false,
      matchedChains: 0,
      totalChains: WOTS_PLUS_LEN,
      recoveredPublicKeyHashHex: "",
      expectedPublicKeyHashHex: publicKey.publicKeyHashHex,
      reason: "WOTS+ 서명 또는 공개키 바이트 길이가 규격(2,144바이트)과 다릅니다.",
    };
  }

  const pubSeed = hexToBytes(publicKey.pubSeedHex);
  const messageDigest = sha256Bytes(message);
  const digits = computeWotsBase16Digits(messageDigest);
  const recoveredPkChains = new Uint8Array(expectedByteLen);
  let matchedChains = 0;

  for (let chainIdx = 0; chainIdx < WOTS_PLUS_LEN; chainIdx += 1) {
    const offset = chainIdx * WOTS_PLUS_N;
    const sigSlice = sigBytes.subarray(offset, offset + WOTS_PLUS_N);
    const remainingSteps = WOTS_PLUS_W - 1 - digits[chainIdx];
    const recoveredElement = evaluateWotsChain(
      sigSlice,
      digits[chainIdx],
      remainingSteps,
      pubSeed,
      publicKey.otsAddress,
      chainIdx,
    );
    recoveredPkChains.set(recoveredElement, offset);

    const expectedElement = expectedPkChains.subarray(offset, offset + WOTS_PLUS_N);
    if (constantTimeEqual(recoveredElement, expectedElement)) {
      matchedChains += 1;
    }
  }

  const recoveredPublicKeyHashHex = computeWotsPublicKeyHashHex(pubSeed, recoveredPkChains);
  const hashMatches = recoveredPublicKeyHashHex === publicKey.publicKeyHashHex;
  const allChainsMatch = matchedChains === WOTS_PLUS_LEN;

  return {
    valid: allChainsMatch && hashMatches,
    matchedChains,
    totalChains: WOTS_PLUS_LEN,
    recoveredPublicKeyHashHex,
    expectedPublicKeyHashHex: publicKey.publicKeyHashHex,
    reason:
      allChainsMatch && hashMatches
        ? undefined
        : `WOTS+ 체인 검증 실패(${matchedChains}/${WOTS_PLUS_LEN} 체인 일치).`,
  };
}

export interface HybridProvenanceMetadata {
  readonly workId: string;
  readonly episodeId: string;
  readonly creatorId: string;
  readonly rightsStatement: string;
  readonly sealedAtIso?: string;
}

export interface HybridProvenancePayload {
  readonly schemaVersion: "toonstudio-pq-provenance-v1";
  readonly workId: string;
  readonly episodeId: string;
  readonly creatorId: string;
  readonly rightsStatement: string;
  readonly contentSha256Hex: string;
  readonly contentByteLength: number;
  readonly sealedAtIso: string;
  readonly wotsPublicKeyHashHex: string;
  readonly ecdsaPublicKeyThumbprintHex: string;
  readonly localZeroCostProof: true;
}

export interface HybridPostQuantumProvenanceSeal {
  readonly payload: HybridProvenancePayload;
  readonly wotsPublicKey: WotsPlusPublicKey;
  readonly wotsSignature: WotsPlusSignature;
  readonly ecdsaPublicKeyJwk: JsonWebKey;
  readonly ecdsaSignatureBase64Url: string;
  readonly sealDigestSha256Hex: string;
}

export interface HybridProvenanceVerificationReport {
  readonly valid: boolean;
  readonly contentDigestValid: boolean;
  readonly classicalEcdsaValid: boolean;
  readonly postQuantumWotsValid: boolean;
  readonly wotsResult: WotsPlusVerificationResult;
  readonly failureReasons: readonly string[];
}

export interface SealHybridProvenanceOptions {
  readonly wotsKeyPair?: WotsPlusKeyPair;
  readonly ecdsaKeyPair?: CryptoKeyPair;
}

/**
 * 고전 WebCrypto ECDSA P-256 + 양자내성 SHA-256 WOTS+ 이중 원고 진본 봉인 생성(₩0 로컬).
 */
export async function sealHybridPostQuantumProvenance(
  contentBytes: Uint8Array,
  metadata: HybridProvenanceMetadata,
  options: SealHybridProvenanceOptions = {},
): Promise<HybridPostQuantumProvenanceSeal> {
  const cryptoApi = getCryptoApi();
  const wotsKeyPair = options.wotsKeyPair ?? generateWotsPlusKeyPair();
  const ecdsaKeyPair =
    options.ecdsaKeyPair ??
    (await cryptoApi.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    ));

  const exportedJwk = await cryptoApi.subtle.exportKey("jwk", ecdsaKeyPair.publicKey);
  const ecdsaPublicKeyJwk: JsonWebKey = {
    kty: exportedJwk.kty,
    crv: exportedJwk.crv,
    x: exportedJwk.x,
    y: exportedJwk.y,
    ext: true,
  };

  const payload: HybridProvenancePayload = {
    schemaVersion: "toonstudio-pq-provenance-v1",
    workId: metadata.workId,
    episodeId: metadata.episodeId,
    creatorId: metadata.creatorId,
    rightsStatement: metadata.rightsStatement,
    contentSha256Hex: sha256Hex(contentBytes),
    contentByteLength: contentBytes.byteLength,
    sealedAtIso: metadata.sealedAtIso ?? new Date().toISOString(),
    wotsPublicKeyHashHex: wotsKeyPair.publicKey.publicKeyHashHex,
    ecdsaPublicKeyThumbprintHex: sha256Hex(canonicalJsonBytes(ecdsaPublicKeyJwk)),
    localZeroCostProof: true,
  };

  const canonicalPayload = canonicalJsonBytes(payload);
  const wotsSignature = signWotsPlus(canonicalPayload, wotsKeyPair);
  const ecdsaRawSig = await cryptoApi.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    ecdsaKeyPair.privateKey,
    toStrictArrayBuffer(canonicalPayload),
  );
  const ecdsaSignatureBase64Url = bytesToBase64Url(new Uint8Array(ecdsaRawSig));

  const sealDigestSha256Hex = sha256Hex(
    canonicalJsonBytes({
      payload,
      wotsSigDigest: wotsSignature.messageDigestHex,
      ecdsaSignatureBase64Url,
    }),
  );

  return {
    payload,
    wotsPublicKey: wotsKeyPair.publicKey,
    wotsSignature,
    ecdsaPublicKeyJwk,
    ecdsaSignatureBase64Url,
    sealDigestSha256Hex,
  };
}

/**
 * 하이브리드 진본 봉인 검증: 원고 해시 + ECDSA P-256 + 양자내성 WOTS+ 3중 검증 수행.
 */
export async function verifyHybridPostQuantumProvenance(
  seal: HybridPostQuantumProvenanceSeal,
  expectedContentBytes?: Uint8Array,
): Promise<HybridProvenanceVerificationReport> {
  const failureReasons: string[] = [];

  let contentDigestValid = true;
  if (expectedContentBytes !== undefined) {
    const actualHash = sha256Hex(expectedContentBytes);
    contentDigestValid =
      actualHash === seal.payload.contentSha256Hex &&
      expectedContentBytes.byteLength === seal.payload.contentByteLength;
    if (!contentDigestValid) {
      failureReasons.push("원고 바이너리 SHA-256 다이제스트가 봉인 시점과 일치하지 않습니다.");
    }
  }

  const canonicalPayload = canonicalJsonBytes(seal.payload);

  // 1) 양자내성 WOTS+ 검증 + 공개키 바인딩 일치 확인
  const wotsResult = verifyWotsPlus(canonicalPayload, seal.wotsSignature, seal.wotsPublicKey);
  const wotsKeyBound = seal.payload.wotsPublicKeyHashHex === seal.wotsPublicKey.publicKeyHashHex;
  const postQuantumWotsValid = wotsResult.valid && wotsKeyBound;
  if (!postQuantumWotsValid) {
    failureReasons.push(wotsResult.reason ?? "WOTS+ 공개키 해시 바인딩이 일치하지 않습니다.");
  }

  // 2) 고전 WebCrypto ECDSA P-256 검증 + 공개키 썸프린트 일치 확인
  let classicalEcdsaValid = false;
  try {
    const thumbprint = sha256Hex(canonicalJsonBytes(seal.ecdsaPublicKeyJwk));
    if (thumbprint !== seal.payload.ecdsaPublicKeyThumbprintHex) {
      failureReasons.push("ECDSA P-256 공개키 썸프린트가 페이로드와 일치하지 않습니다.");
    } else {
      const cryptoApi = getCryptoApi();
      const verifyKey = await cryptoApi.subtle.importKey(
        "jwk",
        seal.ecdsaPublicKeyJwk,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      );
      const sigBytes = base64UrlToBytes(seal.ecdsaSignatureBase64Url);
      classicalEcdsaValid = await cryptoApi.subtle.verify(
        { name: "ECDSA", hash: { name: "SHA-256" } },
        verifyKey,
        toStrictArrayBuffer(sigBytes),
        toStrictArrayBuffer(canonicalPayload),
      );
      if (!classicalEcdsaValid) {
        failureReasons.push("고전 ECDSA P-256 서명 검증에 실패했습니다.");
      }
    }
  } catch {
    failureReasons.push("ECDSA P-256 공개키 또는 서명 포맷이 손상되었습니다.");
  }

  return {
    valid: contentDigestValid && classicalEcdsaValid && postQuantumWotsValid,
    contentDigestValid,
    classicalEcdsaValid,
    postQuantumWotsValid,
    wotsResult,
    failureReasons,
  };
}
