/** 로컬 SHA-256/HMAC 무결성 예제. 실제 C2PA·DID 인증과 분리한다. */
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

function rotr32(v: number, bits: number): number { return (v >>> bits) | (v << (32 - bits)); }

function toBytes(input: string | Uint8Array | Uint8ClampedArray): Uint8Array {
  if (typeof input === "string") return new TextEncoder().encode(input);
  return input instanceof Uint8Array ? input : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/** 표준 FIPS 180-4 SHA-256 32바이트 다이제스트를 순수 32-bit 연산으로 계산한다. */
export function computeDeterministicSha256Bytes(input: string | Uint8Array | Uint8ClampedArray): Uint8Array {
  const bytes = toBytes(input);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667; let h1 = 0xbb67ae85; let h2 = 0x3c6ef372; let h3 = 0xa54ff53a;
  let h4 = 0x510e527f; let h5 = 0x9b05688c; let h6 = 0x1f83d9ab; let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0; const w2 = w[i - 2] ?? 0;
      const s0 = rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10);
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }
    let a = h0; let b = h1; let c = h2; let d = h3; let e = h4; let f = h5; let g = h6; let h = h7;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const t1 = (h + s1 + ((e & f) ^ (~e & g)) + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const s0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const t2 = (s0 + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((word, i) => ov.setUint32(i * 4, word, false));
  return out;
}

/** 소문자 64자리 SHA-256 16진수 다이제스트를 반환한다. */
export function computeDeterministicSha256Hex(input: string | Uint8Array | Uint8ClampedArray): string {
  return bytesToHex(computeDeterministicSha256Bytes(input));
}

/** RFC 2104 HMAC-SHA256 16진수 서명을 순수 32-bit 연산으로 계산한다. */
export function computeDeterministicHmacSha256Hex(key: string, message: string): string {
  let keyBytes = toBytes(key);
  if (keyBytes.length > 64) keyBytes = computeDeterministicSha256Bytes(keyBytes);
  const ipad = new Uint8Array(64);
  const opad = new Uint8Array(64);
  for (let i = 0; i < 64; i += 1) {
    const kb = keyBytes[i] ?? 0;
    ipad[i] = kb ^ 0x36;
    opad[i] = kb ^ 0x5c;
  }
  const msgBytes = toBytes(message);
  const inner = new Uint8Array(64 + msgBytes.length);
  inner.set(ipad, 0);
  inner.set(msgBytes, 64);
  const outer = new Uint8Array(96);
  outer.set(opad, 0);
  outer.set(computeDeterministicSha256Bytes(inner), 64);
  return computeDeterministicSha256Hex(outer);
}

export interface DemoCreatorIdentity {
  readonly identityKind: "synthetic-handle-derived"; readonly identityVerified: false;
  readonly creatorHandle: string; readonly didWeb: string; readonly didKey: string;
  readonly verificationMethod: string; readonly publicFingerprintHex: string;
}

/** 핸들에서 예시 식별자를 만든다. 실제 DID 공개키·신원 확인은 수행하지 않는다. */
export function createDemoCreatorIdentity(creatorHandle: string, domain = "toonstudio.cloud"): DemoCreatorIdentity {
  const slug = creatorHandle.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "creator";
  const keySeed = computeDeterministicSha256Bytes(`toonstudio-did-key:v1:${domain}:${slug}`);
  const didWeb = `did:example:${domain}:creators:${slug}`;
  const fp = computeDeterministicSha256Hex(keySeed).slice(0, 16);
  return {
    identityKind: "synthetic-handle-derived", identityVerified: false,
    creatorHandle: slug, didWeb, didKey: `demo-hash:${bytesToHex(keySeed)}`,
    verificationMethod: `${didWeb}#key-${fp.slice(0, 8)}`, publicFingerprintHex: fp,
  };
}

export interface LocalIntegrityManifestInput {
  readonly title: string; readonly episodeCode: string; readonly creatorDid: DemoCreatorIdentity;
  readonly artworkBytes: Uint8Array | Uint8ClampedArray; readonly humanStrokeCount: number;
  readonly aiAssistedRatio: number; readonly createdAtIso: string;
  readonly doNotTrain?: boolean; readonly signingSeed: string;
  readonly dataOrigin?: "synthetic-example" | "caller-provided-unverified";
}

export interface LocalIntegrityClaimPayload {
  readonly schemaVersion: "toonstudio.local-integrity-demo.v1";
  readonly dataOrigin: "synthetic-example" | "caller-provided-unverified"; readonly inputClaimsVerified: false; readonly claimId: string; readonly title: string;
  readonly episodeCode: string; readonly createdAtIso: string; readonly softwareAgent: string;
  readonly creatorDid: string; readonly creatorDidKey: string; readonly verificationMethod: string;
  readonly assetSha256: string; readonly assetByteLength: number;
  readonly assertions: {
    readonly actions: readonly { readonly action: "toonstudio.demo-created" | "toonstudio.demo-drawn"; readonly humanStrokeCount: number; readonly aiAssistedRatio: number }[];
    readonly dataHash: { readonly alg: "sha256"; readonly digestHex: string };
    readonly creativeWork: { readonly authorDid: string; readonly copyrightHolder: string; readonly license: string };
    readonly trainingMining: { readonly doNotTrain: boolean; readonly aiInferenceOptOut: boolean };
  };
}

export interface LocalIntegrityManifest {
  readonly claim: LocalIntegrityClaimPayload; readonly claimDigestSha256: string;
  readonly verificationScope: "local-hmac-integrity-only";
  readonly c2paSupported: false; readonly identityVerified: false; readonly copyrightVerified: false;
  readonly authenticationAlg: "HMAC-SHA256"; readonly hmacHex: string;
}

export interface LocalIntegrityVerificationResult {
  readonly integrityMatches: boolean;
  readonly verificationScope: "local-hmac-integrity-only";
  readonly c2paVerified: false; readonly identityVerified: false; readonly copyrightVerified: false; readonly assetHashMatches: boolean; readonly claimDigestMatches: boolean;
  readonly hmacMatches: boolean; readonly identityMetadataMatches: boolean; readonly reasons: readonly string[];
}

/** JSON 해시와 공유 키 HMAC 예제. C2PA 서명·신원·저작권 증명이 아니다. */
export function createLocalIntegrityManifest(input: LocalIntegrityManifestInput): LocalIntegrityManifest {
  const assetSha256 = computeDeterministicSha256Hex(input.artworkBytes);
  const idH = computeDeterministicSha256Hex(`${input.creatorDid.didWeb}:${input.episodeCode}:${assetSha256}:${input.createdAtIso}`);
  const strokes = Math.max(0, Math.round(input.humanStrokeCount));
  const aiRatio = Math.max(0, Math.min(1, Math.round(input.aiAssistedRatio * 1000) / 1000));
  const optOut = input.doNotTrain ?? true;

  const claim: LocalIntegrityClaimPayload = {
    schemaVersion: "toonstudio.local-integrity-demo.v1",
    dataOrigin: input.dataOrigin ?? "caller-provided-unverified", inputClaimsVerified: false,
    claimId: `urn:uuid:${idH.slice(0, 8)}-${idH.slice(8, 12)}-5${idH.slice(13, 16)}-a${idH.slice(17, 20)}-${idH.slice(20, 32)}`,
    title: input.title, episodeCode: input.episodeCode, createdAtIso: input.createdAtIso,
    softwareAgent: "ToonStudio Local Integrity Demo 1.0",
    creatorDid: input.creatorDid.didWeb, creatorDidKey: input.creatorDid.didKey,
    verificationMethod: input.creatorDid.verificationMethod, assetSha256, assetByteLength: input.artworkBytes.byteLength,
    assertions: {
      actions: [
        { action: "toonstudio.demo-created", humanStrokeCount: strokes, aiAssistedRatio: aiRatio },
        { action: "toonstudio.demo-drawn", humanStrokeCount: strokes, aiAssistedRatio: aiRatio },
      ],
      dataHash: { alg: "sha256", digestHex: assetSha256 },
      creativeWork: { authorDid: input.creatorDid.didWeb, copyrightHolder: input.creatorDid.creatorHandle, license: "Unverified caller metadata; no rights attestation" },
      trainingMining: { doNotTrain: optOut, aiInferenceOptOut: optOut },
    },
  };
  const claimDigestSha256 = computeDeterministicSha256Hex(JSON.stringify(claim));
  const hmacHex = computeDeterministicHmacSha256Hex(`${input.signingSeed}:${input.creatorDid.publicFingerprintHex}`, claimDigestSha256);
  return { claim, claimDigestSha256, authenticationAlg: "HMAC-SHA256", hmacHex,
    verificationScope: "local-hmac-integrity-only", c2paSupported: false, identityVerified: false, copyrightVerified: false };
}

/** 바이트·JSON·공유 키 HMAC의 일치만 검사한다. 표준 서명 검증은 수행하지 않는다. */
export function verifyLocalIntegrityManifest(
  manifest: LocalIntegrityManifest,
  artworkBytes: Uint8Array | Uint8ClampedArray,
  signingSeed: string,
  creatorDid: DemoCreatorIdentity,
): LocalIntegrityVerificationResult {
  const actualHash = computeDeterministicSha256Hex(artworkBytes);
  const assetHashMatches = actualHash === manifest.claim.assetSha256 && actualHash === manifest.claim.assertions.dataHash.digestHex;
  const claimDigestMatches = computeDeterministicSha256Hex(JSON.stringify(manifest.claim)) === manifest.claimDigestSha256;
  const hmacMatches = computeDeterministicHmacSha256Hex(`${signingSeed}:${creatorDid.publicFingerprintHex}`, manifest.claimDigestSha256) === manifest.hmacHex;
  const identityMetadataMatches = creatorDid.identityKind === "synthetic-handle-derived" && manifest.claim.creatorDid === creatorDid.didWeb && manifest.claim.creatorDidKey === creatorDid.didKey && manifest.claim.verificationMethod === creatorDid.verificationMethod;

  const reasons: string[] = [];
  if (manifest.c2paSupported !== false || manifest.identityVerified !== false || manifest.copyrightVerified !== false || manifest.claim.inputClaimsVerified !== false) reasons.push("unsupported-attestation-claim");
  if (manifest.claim.schemaVersion !== "toonstudio.local-integrity-demo.v1" || manifest.authenticationAlg !== "HMAC-SHA256" || manifest.verificationScope !== "local-hmac-integrity-only") reasons.push("unsupported-integrity-format");
  if (!assetHashMatches) reasons.push("asset-sha256-mismatch");
  if (!claimDigestMatches) reasons.push("claim-digest-tampered");
  if (!hmacMatches) reasons.push("hmac-mismatch");
  if (!identityMetadataMatches) reasons.push("demo-identity-metadata-mismatch");
  return { integrityMatches: reasons.length === 0, assetHashMatches, claimDigestMatches, hmacMatches, identityMetadataMatches, reasons,
    verificationScope: "local-hmac-integrity-only", c2paVerified: false, identityVerified: false, copyrightVerified: false };
}


/** @deprecated 실제 DID 생성이 아닌 예시 식별자 생성의 호환 별칭이다. */
export const createCreatorDidIdentity = createDemoCreatorIdentity;
/** @deprecated C2PA가 아닌 로컬 HMAC 무결성 예제의 호환 별칭이다. */
export const createC2paProvenanceManifest = createLocalIntegrityManifest;
/** @deprecated 반환값은 integrityMatches이며 C2PA/신원/저작권 검증은 항상 false다. */
export const verifyC2paProvenanceManifest = verifyLocalIntegrityManifest;
export type CreatorDidIdentity = DemoCreatorIdentity;
export type C2paManifestInput = LocalIntegrityManifestInput;
export type C2paCreationClaimPayload = LocalIntegrityClaimPayload;
export type C2paCreationManifest = LocalIntegrityManifest;
export type C2paVerificationResult = LocalIntegrityVerificationResult;
