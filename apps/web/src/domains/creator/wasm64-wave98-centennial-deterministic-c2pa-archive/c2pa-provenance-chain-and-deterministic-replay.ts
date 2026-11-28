/**
 * Wave 98 — 100년 보존 준비도 전수 감사기, 원스톱 에피소드 봉인 빌더 및 C2PA·결정론적 재생 파사드.
 */

import {
  buildCentennialChunkMerkleLeaf,
  bytesToHexCentennial,
  canonicalSerializeCentennial,
  computeXorParityEccBlock,
  constantTimeEqualHex,
  detectExternalNetworkUrls,
  encodeCentennialArchive,
  encodeUtf8Centennial,
  generateCentennialMerkleProof,
  sha256CentennialHex,
  verifyCentennialMerkleProof,
  type CentennialArchiveChunkInput,
  type DecodedCentennialArchive,
} from "./centennial-archive-container-and-crypto";
import {
  C2PA_GENESIS_PREVIOUS_HASH,
  verifyC2paProvenanceChain,
  type C2paAssertionLabel,
  type C2paChainVerificationResult,
  type C2paCreatorIdentity,
  type C2paProvenanceChain,
} from "./c2pa-provenance-chain";
import {
  DETERMINISTIC_ARITHMETIC_CONTRACT,
  createEmbeddedIccColorProfile,
  parseDecodedChunkJson,
  renderDeterministicReferencePanelRgba,
  verifyCentennialDeterministicReplay,
  type CentennialReplayVerificationResult,
  type DeterministicPanelRenderResult,
  type DeterministicPanelSpec,
  type EmbeddedBitmapFontSubset,
  type EmbeddedIccColorProfile,
  type RightsBomArchivalSnapshot,
  type SealedPanelLayerPayload,
  type WasmRendererPinManifest,
} from "./deterministic-pixel-renderer";

export {
  C2PA_GENESIS_PREVIOUS_HASH,
  appendC2paAssertion,
  createC2paProvenanceChain,
  verifyC2paProvenanceChain,
  type C2paAiDisclosureData,
  type C2paAssertionInput,
  type C2paAssertionLabel,
  type C2paChainVerificationResult,
  type C2paCreatorIdentity,
  type C2paProvenanceChain,
  type C2paProvenanceEntry,
  type C2paVerificationFailureCode,
} from "./c2pa-provenance-chain";

export {
  DETERMINISTIC_ARITHMETIC_CONTRACT,
  buildEmbeddedFontSubsetForText,
  createEmbeddedIccColorProfile,
  renderDeterministicReferencePanelRgba,
  verifyCentennialDeterministicReplay,
  type CentennialReplayVerificationResult,
  type DeterministicDialogueRun,
  type DeterministicInkStroke,
  type DeterministicPanelRenderResult,
  type DeterministicPanelSpec,
  type DeterministicRectFill,
  type EmbeddedBitmapFontSubset,
  type EmbeddedIccColorProfile,
  type ReplayHostPanelOutcome,
  type ReplayHostYearReport,
  type RightsBomArchivalAsset,
  type RightsBomArchivalSnapshot,
  type SealedPanelLayerPayload,
  type WasmRendererPinManifest,
} from "./deterministic-pixel-renderer";

export interface CentennialPreservationBlocker {
  readonly code: string;
  readonly severity: "blocker";
  readonly messageKo: string;
}

export interface CentennialPreservationAuditReport {
  readonly episodeId: string;
  readonly archiveByteLength: number;
  readonly chunkCount: number;
  readonly merkleRootHex: string;
  readonly allMerkleProofsValid: boolean;
  readonly parityEccVerified: boolean;
  readonly externalUrlCount: number;
  readonly readyForCentennialSeal: boolean;
  readonly badges: {
    readonly selfContained: boolean;
    readonly glyphComplete: boolean;
    readonly zeroCloudDeps: boolean;
    readonly bitExact2126: boolean;
  };
  readonly glyphAudit: {
    readonly totalUniqueChars: number;
    readonly coveredChars: number;
    readonly coveragePercent: number;
    readonly missingGlyphs: readonly string[];
  };
  readonly c2paAudit: C2paChainVerificationResult & {
    readonly creatorIdentity: C2paCreatorIdentity | null;
    readonly claimsSummary: readonly {
      readonly index: number;
      readonly label: C2paAssertionLabel;
      readonly timestampIso: string;
      readonly shortClaimSha256: string;
      readonly summaryKo: string;
    }[];
  };
  readonly replayAudit: CentennialReplayVerificationResult;
  readonly rightsBomAudit: {
    readonly assetCount: number;
    readonly archivalPermittedCount: number;
    readonly blockedAssetIds: readonly string[];
    readonly perpetualArchivalCleared: boolean;
  };
  readonly iccProfileSummary: {
    readonly profileId: string;
    readonly colorSpace: string;
    readonly hashValid: boolean;
  } | null;
  readonly wasmRendererPinSummary: {
    readonly engineName: string;
    readonly engineVersion: string;
    readonly arithmeticContract: string;
    readonly wasmBinarySha256: string;
    readonly pinValid: boolean;
  } | null;
  readonly blockers: readonly CentennialPreservationBlocker[];
}

export interface CreateSealedCentennialEpisodeInput {
  readonly panels: readonly DeterministicPanelSpec[];
  readonly embeddedFonts: readonly EmbeddedBitmapFontSubset[];
  readonly iccProfile: EmbeddedIccColorProfile;
  readonly wasmRendererPin: WasmRendererPinManifest;
  readonly rightsBom: RightsBomArchivalSnapshot;
  readonly c2paChain: C2paProvenanceChain;
  readonly includeParityEcc?: boolean;
}

/** 100년 보존 아카이브 전수 준비도 감사(글리프 100%, 외부 URL 0건, ICC·WASM 핀, Rights BOM, C2PA, 2126 재생). */
export function auditCentennialPreservationReadiness(
  decodedArchive: DecodedCentennialArchive,
  signingKey: string,
  options?: { readonly simulatedHostYears?: readonly number[]; readonly expectedRendererSha256?: string },
): CentennialPreservationAuditReport {
  const blockers: CentennialPreservationBlocker[] = [];
  const simulatedHostYears = options?.simulatedHostYears ?? [2026, 2076, 2126];

  let allMerkleProofsValid = true;
  let externalUrlCount = 0;
  for (let i = 0; i < decodedArchive.chunks.length; i += 1) {
    const chunk = decodedArchive.chunks[i];
    const proof = generateCentennialMerkleProof(decodedArchive.merkleTree, i);
    if (!verifyCentennialMerkleProof(buildCentennialChunkMerkleLeaf(chunk), proof, decodedArchive.merkleRootHex)) {
      allMerkleProofsValid = false;
    }
    externalUrlCount += detectExternalNetworkUrls(chunk.payload).length;
  }
  if (!allMerkleProofsValid) {
    blockers.push({ code: "MERKLE_PROOF_FAILED", severity: "blocker", messageKo: "청크 Merkle 포함 증명 검증에 실패했습니다." });
  }
  if (externalUrlCount > 0) {
    blockers.push({ code: "EXTERNAL_URL_DETECTED", severity: "blocker", messageKo: `미내장 외부 URL ${externalUrlCount}건이 발견되었습니다.` });
  }

  const parityChunk = decodedArchive.chunks.find((c) => c.kind === "parity-ecc-block");
  let parityEccVerified = false;
  if (parityChunk) {
    const expectedParity = computeXorParityEccBlock(
      decodedArchive.chunks.filter((c) => c.kind !== "parity-ecc-block").map((c) => c.payload),
    );
    parityEccVerified = constantTimeEqualHex(sha256CentennialHex(expectedParity), parityChunk.contentSha256Hex);
    if (!parityEccVerified) {
      blockers.push({ code: "PARITY_ECC_MISMATCH", severity: "blocker", messageKo: "XOR 패리티 ECC 블록이 데이터 청크와 일치하지 않습니다." });
    }
  }

  const fontChunks = decodedArchive.chunks.filter((c) => c.kind === "embedded-font-subset");
  const fontMap = new Map<string, EmbeddedBitmapFontSubset>();
  for (let i = 0; i < fontChunks.length; i += 1) {
    const parsed = parseDecodedChunkJson<EmbeddedBitmapFontSubset>(fontChunks[i]);
    fontMap.set(parsed.fontId, parsed);
  }
  const panels = decodedArchive.chunks
    .filter((c) => c.kind === "panel-master-layer")
    .map((c) => parseDecodedChunkJson<SealedPanelLayerPayload>(c));

  const uniqueChars = new Set<string>();
  const missingGlyphSet = new Set<string>();
  for (let p = 0; p < panels.length; p += 1) {
    for (let r = 0; r < panels[p].spec.dialogueRuns.length; r += 1) {
      const run = panels[p].spec.dialogueRuns[r];
      const font = fontMap.get(run.fontId);
      const chars = Array.from(run.text);
      for (let c = 0; c < chars.length; c += 1) {
        if (/^\s$/.test(chars[c])) {
          continue;
        }
        uniqueChars.add(chars[c]);
        if (!font || !font.glyphs[chars[c]]) {
          missingGlyphSet.add(chars[c]);
        }
      }
    }
  }
  const totalUniqueChars = uniqueChars.size;
  const missingGlyphs = Array.from(missingGlyphSet);
  const coveredChars = totalUniqueChars - missingGlyphs.length;
  const coveragePercent = totalUniqueChars === 0 ? 100 : Math.round((coveredChars / totalUniqueChars) * 1000) / 10;
  if (missingGlyphs.length > 0) {
    blockers.push({
      code: "MISSING_DIALOGUE_GLYPHS",
      severity: "blocker",
      messageKo: `내장 폰트 서브셋에 대사 문자 ${missingGlyphs.length}자(${missingGlyphs.join(", ")})가 빠져 있습니다.`,
    });
  }

  const iccChunk = decodedArchive.chunks.find((c) => c.kind === "icc-color-profile");
  let iccProfileSummary: CentennialPreservationAuditReport["iccProfileSummary"] = null;
  if (iccChunk) {
    const icc = parseDecodedChunkJson<EmbeddedIccColorProfile>(iccChunk);
    const hashValid = constantTimeEqualHex(createEmbeddedIccColorProfile(icc).profileSha256, icc.profileSha256);
    iccProfileSummary = { profileId: icc.profileId, colorSpace: icc.colorSpace, hashValid };
    if (!hashValid) {
      blockers.push({ code: "ICC_PROFILE_HASH_INVALID", severity: "blocker", messageKo: "내장 ICC 색상 프로파일의 해시 봉인이 손상되었습니다." });
    }
  } else {
    blockers.push({ code: "ICC_PROFILE_MISSING", severity: "blocker", messageKo: "내장 ICC 색상 프로파일 청크가 없습니다." });
  }

  const pinChunk = decodedArchive.chunks.find((c) => c.kind === "wasm-renderer-pin");
  let wasmRendererPinSummary: CentennialPreservationAuditReport["wasmRendererPinSummary"] = null;
  if (pinChunk) {
    const pin = parseDecodedChunkJson<WasmRendererPinManifest>(pinChunk);
    const matchesExpected =
      options?.expectedRendererSha256 === undefined ||
      constantTimeEqualHex(pin.wasmBinarySha256, options.expectedRendererSha256);
    const pinValid =
      /^[0-9a-f]{64}$/.test(pin.wasmBinarySha256) &&
      pin.arithmeticContract === DETERMINISTIC_ARITHMETIC_CONTRACT &&
      matchesExpected;
    wasmRendererPinSummary = {
      engineName: pin.engineName,
      engineVersion: pin.engineVersion,
      arithmeticContract: pin.arithmeticContract,
      wasmBinarySha256: pin.wasmBinarySha256,
      pinValid,
    };
    if (!pinValid) {
      blockers.push({ code: "WASM_RENDERER_PIN_INVALID", severity: "blocker", messageKo: "고정 WASM 렌더러 해시 또는 정수 산술 계약이 일치하지 않습니다." });
    }
  } else {
    blockers.push({ code: "WASM_RENDERER_PIN_MISSING", severity: "blocker", messageKo: "고정 WASM 렌더러 핀 청크가 누락되었습니다." });
  }

  const rightsChunk = decodedArchive.chunks.find((c) => c.kind === "rights-bom-snapshot");
  const blockedAssetIds: string[] = [];
  let assetCount = 0;
  let archivalPermittedCount = 0;
  let episodeId = "unknown-episode";
  if (rightsChunk) {
    const bom = parseDecodedChunkJson<RightsBomArchivalSnapshot>(rightsChunk);
    episodeId = bom.episodeId;
    assetCount = bom.assets.length;
    for (let i = 0; i < bom.assets.length; i += 1) {
      const asset = bom.assets[i];
      const perpetualOk = asset.expirationYear === null || asset.expirationYear >= 2126;
      if (asset.archivalPreservationAllowed && asset.commercialDistributionStatus !== "blocked" && perpetualOk) {
        archivalPermittedCount += 1;
      } else {
        blockedAssetIds.push(asset.assetId);
      }
    }
    if (blockedAssetIds.length > 0) {
      blockers.push({
        code: "RIGHTS_BOM_ARCHIVAL_BLOCKED",
        severity: "blocker",
        messageKo: `Rights BOM에서 영구 보존이 차단된 에셋: ${blockedAssetIds.join(", ")}`,
      });
    }
  } else {
    blockers.push({ code: "RIGHTS_BOM_MISSING", severity: "blocker", messageKo: "Rights BOM 스냅샷 청크가 누락되었습니다." });
  }

  const c2paChunk = decodedArchive.chunks.find((c) => c.kind === "c2pa-provenance-ledger");
  let c2paAudit: CentennialPreservationAuditReport["c2paAudit"];
  if (c2paChunk) {
    const chain = parseDecodedChunkJson<C2paProvenanceChain>(c2paChunk);
    episodeId = chain.episodeId;
    const verification = verifyC2paProvenanceChain(chain, signingKey);
    if (!verification.valid) {
      blockers.push({
        code: `C2PA_${verification.failureReasonCode ?? "INVALID"}`,
        severity: "blocker",
        messageKo: verification.failureMessageKo ?? "C2PA 출처 체인 검증에 실패했습니다.",
      });
    }
    if (!chain.entries.some((e) => e.label === "c2pa.created") || !chain.entries.some((e) => e.label === "toonstudio.ai-disclosure.v1")) {
      blockers.push({
        code: "C2PA_REQUIRED_ASSERTION_MISSING",
        severity: "blocker",
        messageKo: "C2PA 체인에 창작 원본(c2pa.created) 또는 AI 사용 고지 클레임이 누락되었습니다.",
      });
    }
    c2paAudit = {
      ...verification,
      creatorIdentity: chain.creatorIdentity,
      claimsSummary: chain.entries.map((e) => ({
        index: e.index,
        label: e.label,
        timestampIso: e.timestampIso,
        shortClaimSha256: e.claimSha256.slice(0, 12),
        summaryKo: e.summaryKo,
      })),
    };
  } else {
    blockers.push({ code: "C2PA_LEDGER_MISSING", severity: "blocker", messageKo: "C2PA 출처 원장 청크가 누락되었습니다." });
    c2paAudit = {
      valid: false,
      verifiedClaimCount: 0,
      headClaimSha256: C2PA_GENESIS_PREVIOUS_HASH,
      failureIndex: null,
      failureReasonCode: "EMPTY_CHAIN",
      failureMessageKo: "C2PA 출처 원장 청크가 누락되었습니다.",
      creatorIdentity: null,
      claimsSummary: [],
    };
  }

  const replayAudit = verifyCentennialDeterministicReplay(decodedArchive, simulatedHostYears);
  if (!replayAudit.allPanelsBitIdentical) {
    blockers.push({
      code: "REPLAY_PIXEL_HASH_MISMATCH",
      severity: "blocker",
      messageKo: `결정론적 재생 불일치 패널(${replayAudit.mismatchedPanelIds.join(", ") || "없음"}), 픽셀 오차 ${replayAudit.totalPixelDiffCount}px.`,
    });
  }

  const perpetualArchivalCleared = Boolean(rightsChunk) && blockedAssetIds.length === 0;
  return {
    episodeId,
    archiveByteLength: decodedArchive.totalLength,
    chunkCount: decodedArchive.chunkCount,
    merkleRootHex: decodedArchive.merkleRootHex,
    allMerkleProofsValid,
    parityEccVerified,
    externalUrlCount,
    readyForCentennialSeal: blockers.length === 0,
    badges: {
      selfContained:
        allMerkleProofsValid &&
        Boolean(iccProfileSummary?.hashValid) &&
        Boolean(wasmRendererPinSummary?.pinValid) &&
        perpetualArchivalCleared &&
        c2paAudit.valid,
      glyphComplete: missingGlyphs.length === 0 && fontChunks.length > 0,
      zeroCloudDeps: externalUrlCount === 0,
      bitExact2126: replayAudit.allPanelsBitIdentical && replayAudit.totalPixelDiffCount === 0,
    },
    glyphAudit: { totalUniqueChars, coveredChars, coveragePercent, missingGlyphs },
    c2paAudit,
    replayAudit,
    rightsBomAudit: { assetCount, archivalPermittedCount, blockedAssetIds, perpetualArchivalCleared },
    iccProfileSummary,
    wasmRendererPinSummary,
    blockers,
  };
}

/** 에피소드 패널·내장 폰트·ICC·WASM 핀·Rights BOM·C2PA 원장·XOR ECC를 TSVA v1 바이너리로 일괄 봉인. */
export function createSealedCentennialEpisodeArchive(
  input: CreateSealedCentennialEpisodeInput,
): { readonly archiveBytes: Uint8Array; readonly renderedPanels: readonly DeterministicPanelRenderResult[] } {
  const chunks: CentennialArchiveChunkInput[] = [];
  const renderedPanels: DeterministicPanelRenderResult[] = [];
  const pushJson = (kind: CentennialArchiveChunkInput["kind"], chunkId: string, mediaType: string, value: unknown): void => {
    chunks.push({ kind, chunkId, mediaType, encoding: "canonical-json-utf8", payload: encodeUtf8Centennial(canonicalSerializeCentennial(value)) });
  };

  for (let i = 0; i < input.panels.length; i += 1) {
    const spec = input.panels[i];
    const rendered = renderDeterministicReferencePanelRgba(spec, input.embeddedFonts, input.iccProfile);
    renderedPanels.push(rendered);
    const sealedPayload: SealedPanelLayerPayload = {
      panelId: spec.panelId,
      spec,
      sealedFrameSha256: rendered.frameSha256,
      sealedRgbaHex: bytesToHexCentennial(new Uint8Array(rendered.rgba.buffer, rendered.rgba.byteOffset, rendered.rgba.byteLength)),
    };
    pushJson("panel-master-layer", `panel/${spec.panelId}`, "application/vnd.toonstudio.panel-master+json", sealedPayload);
  }
  for (let i = 0; i < input.embeddedFonts.length; i += 1) {
    pushJson("embedded-font-subset", `font/${input.embeddedFonts[i].fontId}`, "application/vnd.toonstudio.bitmap-font+json", input.embeddedFonts[i]);
  }
  pushJson("icc-color-profile", `icc/${input.iccProfile.profileId}`, "application/vnd.toonstudio.icc-q8+json", input.iccProfile);
  pushJson("wasm-renderer-pin", `renderer/${input.wasmRendererPin.engineName}`, "application/vnd.toonstudio.wasm-pin+json", input.wasmRendererPin);
  pushJson("rights-bom-snapshot", `rights/${input.rightsBom.snapshotId}`, "application/vnd.toonstudio.rights-bom+json", input.rightsBom);
  pushJson("c2pa-provenance-ledger", `c2pa/${input.c2paChain.episodeId}`, "application/vnd.toonstudio.c2pa-chain+json", input.c2paChain);

  if (input.includeParityEcc !== false) {
    chunks.push({
      kind: "parity-ecc-block",
      chunkId: "ecc/xor-parity-v1",
      mediaType: "application/octet-stream",
      encoding: "raw-binary",
      payload: computeXorParityEccBlock(chunks.map((c) => c.payload)),
    });
  }
  return { archiveBytes: encodeCentennialArchive(chunks), renderedPanels };
}
