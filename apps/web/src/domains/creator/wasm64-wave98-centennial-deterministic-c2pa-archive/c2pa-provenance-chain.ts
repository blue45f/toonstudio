/**
 * Wave 98 — C2PA 스타일 서명 출처 체인(`c2pa.created`, `c2pa.edited`, `toonstudio.rights-bom.v1`, `toonstudio.ai-disclosure.v1`).
 */

import {
  CentennialArchiveError,
  canonicalSerializeCentennial,
  constantTimeEqualHex,
  detectExternalNetworkUrls,
  encodeUtf8Centennial,
  hmacSha256CentennialHex,
  sha256CentennialHex,
} from "./centennial-archive-container-and-crypto";

export const C2PA_GENESIS_PREVIOUS_HASH = "0".repeat(64);

export type C2paAssertionLabel =
  | "c2pa.created"
  | "c2pa.edited"
  | "toonstudio.rights-bom.v1"
  | "toonstudio.ai-disclosure.v1";

export interface C2paCreatorIdentity {
  readonly creatorId: string;
  readonly displayNameKo: string;
  readonly studioNameKo: string;
  readonly keyId: string;
}

export interface C2paAiDisclosureData {
  readonly humanDrawnRatioPercent: number;
  readonly assistiveToolsUsed: readonly string[];
  readonly generativeFillUsed: boolean;
  readonly disclosureStatementKo: string;
}

export interface C2paAssertionInput {
  readonly label: C2paAssertionLabel;
  readonly timestampIso: string;
  readonly softwareAgent: string;
  readonly summaryKo: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface C2paProvenanceEntry {
  readonly index: number;
  readonly claimId: string;
  readonly episodeId: string;
  readonly label: C2paAssertionLabel;
  readonly timestampIso: string;
  readonly softwareAgent: string;
  readonly summaryKo: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly previousClaimSha256: string;
  readonly payloadSha256: string;
  readonly claimSha256: string;
  readonly hmacSignatureHex: string;
}

export interface C2paProvenanceChain {
  readonly schemaVersion: "c2pa-toonstudio-chain/1.0";
  readonly episodeId: string;
  readonly creatorIdentity: C2paCreatorIdentity;
  readonly genesisAnchorHmacHex: string;
  readonly entries: readonly C2paProvenanceEntry[];
  readonly headClaimSha256: string;
}

export type C2paVerificationFailureCode =
  | "EMPTY_CHAIN"
  | "INVALID_GENESIS_ANCHOR"
  | "EPISODE_ID_MISMATCH"
  | "INDEX_SEQUENCE_BROKEN"
  | "CLAIM_ID_MISMATCH"
  | "PREVIOUS_HASH_MISMATCH"
  | "PAYLOAD_HASH_MISMATCH"
  | "CLAIM_HASH_MISMATCH"
  | "INVALID_SIGNATURE"
  | "HEAD_HASH_MISMATCH"
  | "EXTERNAL_URL_FORBIDDEN";

export interface C2paChainVerificationResult {
  readonly valid: boolean;
  readonly verifiedClaimCount: number;
  readonly headClaimSha256: string;
  readonly failureIndex: number | null;
  readonly failureReasonCode: C2paVerificationFailureCode | null;
  readonly failureMessageKo: string | null;
}

function computeGenesisAnchorHmac(
  episodeId: string,
  creatorIdentity: C2paCreatorIdentity,
  signingKey: string,
): string {
  return hmacSha256CentennialHex(
    signingKey,
    canonicalSerializeCentennial({ creatorIdentity, episodeId, schemaVersion: "c2pa-toonstudio-chain/1.0" }),
  );
}

function computePayloadSha256(entry: {
  readonly claimId: string;
  readonly episodeId: string;
  readonly index: number;
  readonly label: C2paAssertionLabel;
  readonly timestampIso: string;
  readonly softwareAgent: string;
  readonly summaryKo: string;
  readonly data: Readonly<Record<string, unknown>>;
}): string {
  return sha256CentennialHex(
    canonicalSerializeCentennial({
      claimId: entry.claimId,
      data: entry.data,
      episodeId: entry.episodeId,
      index: entry.index,
      label: entry.label,
      softwareAgent: entry.softwareAgent,
      summaryKo: entry.summaryKo,
      timestampIso: entry.timestampIso,
    }),
  );
}

function computeClaimSha256(
  creatorIdentity: C2paCreatorIdentity,
  index: number,
  previousClaimSha256: string,
  payloadSha256: string,
): string {
  return sha256CentennialHex(
    canonicalSerializeCentennial({ creatorIdentity, index, payloadSha256, previousClaimSha256 }),
  );
}

function computeEntrySignature(
  signingKey: string,
  entry: {
    readonly claimSha256: string;
    readonly previousClaimSha256: string;
    readonly payloadSha256: string;
    readonly episodeId: string;
    readonly index: number;
    readonly label: C2paAssertionLabel;
  },
): string {
  return hmacSha256CentennialHex(
    signingKey,
    canonicalSerializeCentennial({
      claimSha256: entry.claimSha256,
      episodeId: entry.episodeId,
      index: entry.index,
      label: entry.label,
      payloadSha256: entry.payloadSha256,
      previousClaimSha256: entry.previousClaimSha256,
    }),
  );
}

/** C2PA 스타일 서명 출처 체인 초기화. */
export function createC2paProvenanceChain(
  episodeId: string,
  creatorIdentity: C2paCreatorIdentity,
  signingKey: string,
): C2paProvenanceChain {
  if (!episodeId.trim() || !signingKey) {
    throw new CentennialArchiveError("EMPTY_ARCHIVE", "회차 식별자와 서명 키는 비어 있을 수 없습니다.");
  }
  const identityUrls = detectExternalNetworkUrls(
    encodeUtf8Centennial(canonicalSerializeCentennial(creatorIdentity)),
  );
  if (identityUrls.length > 0) {
    throw new CentennialArchiveError("EXTERNAL_URL_FORBIDDEN", `창작자 정보에 외부 URL이 포함되었습니다: ${identityUrls[0]}`);
  }
  return {
    schemaVersion: "c2pa-toonstudio-chain/1.0",
    episodeId,
    creatorIdentity,
    genesisAnchorHmacHex: computeGenesisAnchorHmac(episodeId, creatorIdentity, signingKey),
    entries: [],
    headClaimSha256: C2PA_GENESIS_PREVIOUS_HASH,
  };
}

/** C2PA 서명 클레임 항목을 이전 클레임 해시에 체이닝하여 추가. */
export function appendC2paAssertion(
  chain: C2paProvenanceChain,
  assertion: C2paAssertionInput,
  signingKey: string,
): C2paProvenanceChain {
  const externalUrls = detectExternalNetworkUrls(
    encodeUtf8Centennial(canonicalSerializeCentennial(assertion)),
  );
  if (externalUrls.length > 0) {
    throw new CentennialArchiveError("EXTERNAL_URL_FORBIDDEN", `C2PA 클레임에 외부 URL이 포함되었습니다: ${externalUrls[0]}`);
  }
  const index = chain.entries.length;
  const claimId = `urn:toonstudio:c2pa:claim:${chain.episodeId}:${index}`;
  const previousClaimSha256 = index === 0 ? C2PA_GENESIS_PREVIOUS_HASH : chain.headClaimSha256;
  const payloadSha256 = computePayloadSha256({
    claimId,
    episodeId: chain.episodeId,
    index,
    label: assertion.label,
    timestampIso: assertion.timestampIso,
    softwareAgent: assertion.softwareAgent,
    summaryKo: assertion.summaryKo,
    data: assertion.data,
  });
  const claimSha256 = computeClaimSha256(chain.creatorIdentity, index, previousClaimSha256, payloadSha256);
  const hmacSignatureHex = computeEntrySignature(signingKey, {
    claimSha256,
    previousClaimSha256,
    payloadSha256,
    episodeId: chain.episodeId,
    index,
    label: assertion.label,
  });

  return {
    ...chain,
    entries: [
      ...chain.entries,
      {
        index,
        claimId,
        episodeId: chain.episodeId,
        label: assertion.label,
        timestampIso: assertion.timestampIso,
        softwareAgent: assertion.softwareAgent,
        summaryKo: assertion.summaryKo,
        data: assertion.data,
        previousClaimSha256,
        payloadSha256,
        claimSha256,
        hmacSignatureHex,
      },
    ],
    headClaimSha256: claimSha256,
  };
}

/** C2PA 출처 체인 무결성·연결성·서명 전수 검증(1글자 변조·삭제·순서 바꿈·오키 즉시 거부). */
export function verifyC2paProvenanceChain(
  chain: C2paProvenanceChain,
  signingKey: string,
): C2paChainVerificationResult {
  const fail = (
    failureIndex: number | null,
    failureReasonCode: C2paVerificationFailureCode,
    failureMessageKo: string,
  ): C2paChainVerificationResult => ({
    valid: false,
    verifiedClaimCount: failureIndex === null ? 0 : failureIndex,
    headClaimSha256: chain.headClaimSha256,
    failureIndex,
    failureReasonCode,
    failureMessageKo,
  });

  if (chain.entries.length === 0) {
    return fail(null, "EMPTY_CHAIN", "C2PA 출처 체인에 서명된 클레임이 없습니다.");
  }
  const expectedAnchor = computeGenesisAnchorHmac(chain.episodeId, chain.creatorIdentity, signingKey);
  if (!constantTimeEqualHex(expectedAnchor, chain.genesisAnchorHmacHex)) {
    return fail(0, "INVALID_GENESIS_ANCHOR", "체인의 제네시스 서명 또는 서명 키가 일치하지 않습니다.");
  }

  let expectedPrev = C2PA_GENESIS_PREVIOUS_HASH;
  for (let i = 0; i < chain.entries.length; i += 1) {
    const entry = chain.entries[i];
    if (entry.index !== i) {
      return fail(i, "INDEX_SEQUENCE_BROKEN", `클레임 순서 불일치(기대 ${i}, 실제 ${entry.index}).`);
    }
    if (entry.episodeId !== chain.episodeId) {
      return fail(i, "EPISODE_ID_MISMATCH", `클레임 #${i}의 회차 식별자가 체인과 다릅니다.`);
    }
    if (entry.claimId !== `urn:toonstudio:c2pa:claim:${chain.episodeId}:${i}`) {
      return fail(i, "CLAIM_ID_MISMATCH", `클레임 #${i}의 URN 식별자가 변조되었습니다.`);
    }
    if (!constantTimeEqualHex(entry.previousClaimSha256, expectedPrev)) {
      return fail(i, "PREVIOUS_HASH_MISMATCH", `클레임 #${i}의 이전 해시 연결이 끊어졌습니다.`);
    }
    if (detectExternalNetworkUrls(encodeUtf8Centennial(canonicalSerializeCentennial(entry))).length > 0) {
      return fail(i, "EXTERNAL_URL_FORBIDDEN", `클레임 #${i}에 외부 URL이 포함되었습니다.`);
    }
    if (!constantTimeEqualHex(entry.payloadSha256, computePayloadSha256(entry))) {
      return fail(i, "PAYLOAD_HASH_MISMATCH", `클레임 #${i}의 본문 내용이 서명 이후 변경되었습니다.`);
    }
    const expectedClaim = computeClaimSha256(chain.creatorIdentity, i, entry.previousClaimSha256, entry.payloadSha256);
    if (!constantTimeEqualHex(entry.claimSha256, expectedClaim)) {
      return fail(i, "CLAIM_HASH_MISMATCH", `클레임 #${i}의 해시 다이제스트가 일치하지 않습니다.`);
    }
    if (!constantTimeEqualHex(entry.hmacSignatureHex, computeEntrySignature(signingKey, entry))) {
      return fail(i, "INVALID_SIGNATURE", `클레임 #${i}의 HMAC-SHA256 서명이 유효하지 않습니다.`);
    }
    expectedPrev = entry.claimSha256;
  }

  if (!constantTimeEqualHex(chain.headClaimSha256, expectedPrev)) {
    return fail(chain.entries.length - 1, "HEAD_HASH_MISMATCH", "체인 헤드 해시가 마지막 클레임과 다릅니다.");
  }
  return {
    valid: true,
    verifiedClaimCount: chain.entries.length,
    headClaimSha256: chain.headClaimSha256,
    failureIndex: null,
    failureReasonCode: null,
    failureMessageKo: null,
  };
}
