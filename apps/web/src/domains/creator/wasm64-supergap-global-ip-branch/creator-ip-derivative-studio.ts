/**
 * #35 원클릭 창작자 IP 파생 상품 패키징 스튜디오 (₩0 로컬 패키징 · SHA-256 Rights BOM 봉인).
 *
 * 단일 에피소드에서 창작자 수익화 파생 번들 4종을 한 번에 로컬 생성한다:
 *   (a) 인쇄용 CMYK(TAC <= 300%) 굿즈·아크릴 스탠디 도련(bleed)/칼선(cutline) 규격
 *   (b) 투명 알파 크롭 캐릭터 스탠딩 스프라이트 매니페스트(실제 RGBA 버퍼 포함)
 *   (c) 360° 3D 턴테이블 카메라 키프레임(glTF Y-up 미터 단위 + 단위 쿼터니언)
 *   (d) 15초 오디오툰 트레일러 큐시트 + WebVTT 자막
 * 모든 산출물은 권리 BOM(Rights BOM) 및 100% 로열티 분배표와 함께 FIPS 180-4 SHA-256으로 봉인되며,
 * `verifyCreatorIpBundleSeal`로 사후 위변조 여부를 즉시 검증할 수 있다.
 */

import {
  buildAlphaCroppedSpriteManifest,
  buildPrintMerchSpec,
  convertSrgbToCmykWithTacLimit,
  type AlphaCroppedSpriteManifest,
  type CharacterSpriteInput,
  type CmykColorPercent,
  type MerchPrintOptions,
  type MerchProductKind,
  type Point2DMm,
  type PrintMerchSpecArtifact,
  type RgbaBufferInput,
} from "./ip-derivative-print-and-sprite";
import {
  buildAudioToonTrailerCueSheet,
  buildTurntableCameraKeyframes,
  type AudioToonTrailerCueSheet,
  type AudioToonTrailerOptions,
  type BgmDuckingEnvelope,
  type TrailerHighlightCutInput,
  type TrailerSfxCue,
  type TrailerVisualCue,
  type TrailerVoiceoverCue,
  type TurntableCameraKeyframe,
  type TurntableCameraManifest,
  type TurntableCameraOptions,
} from "./ip-derivative-turntable-and-trailer";
import { canonicalJsonStringify, sha256HexFromBytes, sha256HexFromText } from "./sha256-digest";

export {
  buildAlphaCroppedSpriteManifest,
  buildAudioToonTrailerCueSheet,
  buildPrintMerchSpec,
  buildTurntableCameraKeyframes,
  convertSrgbToCmykWithTacLimit,
  type AlphaCroppedSpriteManifest,
  type AudioToonTrailerCueSheet,
  type AudioToonTrailerOptions,
  type BgmDuckingEnvelope,
  type CharacterSpriteInput,
  type CmykColorPercent,
  type MerchPrintOptions,
  type MerchProductKind,
  type Point2DMm,
  type PrintMerchSpecArtifact,
  type RgbaBufferInput,
  type TrailerHighlightCutInput,
  type TrailerSfxCue,
  type TrailerVisualCue,
  type TrailerVoiceoverCue,
  type TurntableCameraKeyframe,
  type TurntableCameraManifest,
  type TurntableCameraOptions,
};

export interface DerivativeRightsAssetRecord {
  readonly assetId: string;
  readonly assetName: string;
  readonly category: "character-art" | "background-3d" | "font" | "bgm" | "sfx" | "brush-texture";
  readonly licenseSpdx: string;
  readonly rightsHolder: string;
  readonly commercialMerchAllowed: boolean;
  readonly audioBroadcastAllowed: boolean;
  readonly model3dDerivativeAllowed: boolean;
  readonly attributionRequired: boolean;
  readonly attributionText?: string;
}

export interface CreatorRoyaltySplitRecord {
  readonly partyId: string;
  readonly displayName: string;
  readonly role: "creator" | "co-author" | "colorist" | "voice-actor" | "composer" | "platform";
  readonly sharePercent: number;
}

export interface CreatorIpDerivativeInput {
  readonly episodeId: string;
  readonly seriesId: string;
  readonly episodeTitle: string;
  readonly creatorId: string;
  readonly merchArtwork: RgbaBufferInput;
  readonly merchOptions?: MerchPrintOptions;
  readonly characterSprites: readonly CharacterSpriteInput[];
  readonly turntableOptions?: TurntableCameraOptions;
  readonly trailerHighlights: readonly TrailerHighlightCutInput[];
  readonly trailerOptions?: AudioToonTrailerOptions;
  readonly rightsAssets: readonly DerivativeRightsAssetRecord[];
  readonly royaltySplits: readonly CreatorRoyaltySplitRecord[];
  readonly sealedAtIso?: string;
}

export type DerivativeComplianceIssueCode =
  | "ROYALTY_SPLIT_SUM_MISMATCH"
  | "INVALID_ROYALTY_SHARE"
  | "COMMERCIAL_MERCH_LICENSE_BLOCKER"
  | "AUDIO_TRAILER_LICENSE_BLOCKER"
  | "TURNTABLE_3D_LICENSE_BLOCKER"
  | "EMPTY_SPRITE_ALPHA_MASK"
  | "PRINT_TAC_EXCEEDED";

export interface DerivativeComplianceIssue {
  readonly code: DerivativeComplianceIssueCode;
  readonly severity: "error" | "warning";
  readonly assetId?: string;
  readonly messageKo: string;
}

export interface RightsBomLicensingSeal {
  readonly schemaVersion: "toonstudio.ip-rights-bom.v1";
  readonly sealedAtIso: string;
  readonly episodeId: string;
  readonly seriesId: string;
  readonly creatorId: string;
  readonly rightsAssets: readonly DerivativeRightsAssetRecord[];
  readonly royaltySplits: readonly CreatorRoyaltySplitRecord[];
  readonly royaltyTotalPercent: number;
  readonly requiredAttributionLines: readonly string[];
  readonly artifactDigests: {
    readonly merchSpecSha256: string;
    readonly characterSpriteSha256List: readonly string[];
    readonly turntableCameraSha256: string;
    readonly audioToonTrailerSha256: string;
  };
  readonly rightsBomSha256: string;
  readonly bundleSha256: string;
}

export interface CreatorIpDerivativeBundle {
  readonly ok: boolean;
  readonly episodeId: string;
  readonly seriesId: string;
  readonly episodeTitle: string;
  readonly creatorId: string;
  readonly deliverables: {
    readonly merchPrintSpec: PrintMerchSpecArtifact;
    readonly characterSprites: readonly AlphaCroppedSpriteManifest[];
    readonly turntableCamera: TurntableCameraManifest;
    readonly audioToonTrailer: AudioToonTrailerCueSheet;
  };
  readonly compliance: {
    readonly commercialReleaseCleared: boolean;
    readonly merchCleared: boolean;
    readonly trailerCleared: boolean;
    readonly turntableCleared: boolean;
    readonly royaltySplitValid: boolean;
    readonly issues: readonly DerivativeComplianceIssue[];
  };
  readonly rightsBomSeal: RightsBomLicensingSeal;
  readonly packagingTelemetry: {
    readonly packagingMode: "local-zero-cost";
    readonly estimatedCloudCostKrw: 0;
    readonly aiTokensUsed: 0;
    readonly deliverableCount: number;
  };
}

export interface CreatorIpSealVerificationResult {
  readonly valid: boolean;
  readonly expectedBundleSha256: string;
  readonly actualBundleSha256: string;
  readonly mismatches: readonly string[];
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

function isNonCommercialSpdx(spdx: string): boolean {
  const upper = spdx.toUpperCase();
  return upper.indexOf("-NC") !== -1 || upper.indexOf("NONCOMMERCIAL") !== -1;
}

function computeRightsBomDigestPayload(
  episodeId: string,
  seriesId: string,
  creatorId: string,
  rightsAssets: readonly DerivativeRightsAssetRecord[],
  royaltySplits: readonly CreatorRoyaltySplitRecord[],
  requiredAttributionLines: readonly string[],
): string {
  const sortedAssets = rightsAssets.slice().sort((a, b) => (a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0));
  const sortedSplits = royaltySplits.slice().sort((a, b) => (a.partyId < b.partyId ? -1 : a.partyId > b.partyId ? 1 : 0));
  return canonicalJsonStringify({
    schemaVersion: "toonstudio.ip-rights-bom.v1",
    episodeId,
    seriesId,
    creatorId,
    rightsAssets: sortedAssets,
    royaltySplits: sortedSplits,
    requiredAttributionLines,
  });
}

function computeMasterBundleDigest(
  rightsBomSha256: string,
  merchSpecSha256: string,
  characterSpriteSha256List: readonly string[],
  turntableCameraSha256: string,
  audioToonTrailerSha256: string,
): string {
  return sha256HexFromText(
    canonicalJsonStringify({
      rightsBomSha256,
      merchSpecSha256,
      characterSpriteSha256List,
      turntableCameraSha256,
      audioToonTrailerSha256,
    }),
  );
}

/**
 * 에피소드에서 4종 IP 파생 산출물을 원클릭 로컬 패키징하고 SHA-256 Rights BOM으로 봉인한다(₩0).
 */
export function packageCreatorIpDerivatives(
  input: CreatorIpDerivativeInput,
): CreatorIpDerivativeBundle {
  const merchPrintSpec = buildPrintMerchSpec(input.merchArtwork, input.merchOptions);
  const characterSprites = input.characterSprites.map((sprite) =>
    buildAlphaCroppedSpriteManifest(sprite),
  );
  const turntableCamera = buildTurntableCameraKeyframes(input.turntableOptions);
  const audioToonTrailer = buildAudioToonTrailerCueSheet(
    input.episodeTitle,
    input.trailerHighlights,
    input.trailerOptions,
  );

  const issues: DerivativeComplianceIssue[] = [];
  let merchCleared = merchPrintSpec.tacCompliant;
  let trailerCleared = true;
  let turntableCleared = true;

  if (!merchPrintSpec.tacCompliant) {
    issues.push({
      code: "PRINT_TAC_EXCEEDED",
      severity: "error",
      messageKo: `인쇄 총 잉크량(${merchPrintSpec.enforcedMaxTacPercent}%)이 허용 상한(${merchPrintSpec.maxTacPercentLimit}%)을 초과합니다.`,
    });
  }

  for (let i = 0; i < characterSprites.length; i += 1) {
    const sp = characterSprites[i];
    if (sp.isEmpty) {
      issues.push({
        code: "EMPTY_SPRITE_ALPHA_MASK",
        severity: "warning",
        assetId: sp.characterId,
        messageKo: `캐릭터 스프라이트 '${sp.characterName}'에 불투명 픽셀이 없어 빈 캔버스로 처리되었습니다.`,
      });
    }
  }

  const requiredAttributionLines: string[] = [];
  for (let i = 0; i < input.rightsAssets.length; i += 1) {
    const asset = input.rightsAssets[i];
    const ncBlocked = isNonCommercialSpdx(asset.licenseSpdx);
    if (ncBlocked || !asset.commercialMerchAllowed) {
      merchCleared = false;
      issues.push({
        code: "COMMERCIAL_MERCH_LICENSE_BLOCKER",
        severity: "error",
        assetId: asset.assetId,
        messageKo: `에셋 '${asset.assetName}'(${asset.licenseSpdx})는 상업 굿즈 제작이 금지되어 있습니다.`,
      });
    }
    if ((asset.category === "bgm" || asset.category === "sfx") && (ncBlocked || !asset.audioBroadcastAllowed)) {
      trailerCleared = false;
      issues.push({
        code: "AUDIO_TRAILER_LICENSE_BLOCKER",
        severity: "error",
        assetId: asset.assetId,
        messageKo: `오디오 에셋 '${asset.assetName}'(${asset.licenseSpdx})는 오디오툰 트레일러 배포 권한이 없습니다.`,
      });
    }
    if (asset.category === "background-3d" && (ncBlocked || !asset.model3dDerivativeAllowed)) {
      turntableCleared = false;
      issues.push({
        code: "TURNTABLE_3D_LICENSE_BLOCKER",
        severity: "error",
        assetId: asset.assetId,
        messageKo: `3D 에셋 '${asset.assetName}'(${asset.licenseSpdx})는 3D 턴테이블 파생 배포가 허용되지 않습니다.`,
      });
    }
    if (asset.attributionRequired) {
      requiredAttributionLines.push(
        asset.attributionText ?? `${asset.assetName} by ${asset.rightsHolder} (${asset.licenseSpdx})`,
      );
    }
  }
  requiredAttributionLines.sort();

  let royaltyTotal = 0;
  let royaltySplitValid = input.royaltySplits.length > 0;
  for (let i = 0; i < input.royaltySplits.length; i += 1) {
    const split = input.royaltySplits[i];
    if (!Number.isFinite(split.sharePercent) || split.sharePercent <= 0 || split.sharePercent > 100) {
      royaltySplitValid = false;
      issues.push({
        code: "INVALID_ROYALTY_SHARE",
        severity: "error",
        assetId: split.partyId,
        messageKo: `정산 주체 '${split.displayName}'의 분배율(${split.sharePercent}%)이 유효 범위(0 초과 100 이하)를 벗어났습니다.`,
      });
    } else {
      royaltyTotal += split.sharePercent;
    }
  }
  const royaltyTotalPercent = roundPercent(royaltyTotal);
  if (Math.abs(royaltyTotalPercent - 100) > 0.01) {
    royaltySplitValid = false;
    issues.push({
      code: "ROYALTY_SPLIT_SUM_MISMATCH",
      severity: "error",
      messageKo: `로열티 분배율 합계(${royaltyTotalPercent}%)가 100.00%와 일치하지 않습니다.`,
    });
  }

  const rightsBomSha256 = sha256HexFromText(
    computeRightsBomDigestPayload(
      input.episodeId,
      input.seriesId,
      input.creatorId,
      input.rightsAssets,
      input.royaltySplits,
      requiredAttributionLines,
    ),
  );
  const spriteShaList = characterSprites.map((sp) => sp.artifactSha256);
  const bundleSha256 = computeMasterBundleDigest(
    rightsBomSha256,
    merchPrintSpec.artifactSha256,
    spriteShaList,
    turntableCamera.artifactSha256,
    audioToonTrailer.artifactSha256,
  );

  const commercialReleaseCleared =
    merchCleared && trailerCleared && turntableCleared && royaltySplitValid && !issues.some((it) => it.severity === "error");

  return {
    ok: commercialReleaseCleared,
    episodeId: input.episodeId,
    seriesId: input.seriesId,
    episodeTitle: input.episodeTitle,
    creatorId: input.creatorId,
    deliverables: {
      merchPrintSpec,
      characterSprites,
      turntableCamera,
      audioToonTrailer,
    },
    compliance: {
      commercialReleaseCleared,
      merchCleared,
      trailerCleared,
      turntableCleared,
      royaltySplitValid,
      issues,
    },
    rightsBomSeal: {
      schemaVersion: "toonstudio.ip-rights-bom.v1",
      sealedAtIso: input.sealedAtIso ?? "2026-11-26T00:00:00.000Z",
      episodeId: input.episodeId,
      seriesId: input.seriesId,
      creatorId: input.creatorId,
      rightsAssets: input.rightsAssets.slice(),
      royaltySplits: input.royaltySplits.slice(),
      royaltyTotalPercent,
      requiredAttributionLines,
      artifactDigests: {
        merchSpecSha256: merchPrintSpec.artifactSha256,
        characterSpriteSha256List: spriteShaList,
        turntableCameraSha256: turntableCamera.artifactSha256,
        audioToonTrailerSha256: audioToonTrailer.artifactSha256,
      },
      rightsBomSha256,
      bundleSha256,
    },
    packagingTelemetry: {
      packagingMode: "local-zero-cost",
      estimatedCloudCostKrw: 0,
      aiTokensUsed: 0,
      deliverableCount: 3 + characterSprites.length,
    },
  };
}

/**
 * 봉인된 창작자 IP 파생 번들의 산출물 픽셀·메타데이터·Rights BOM·로열티 분배표 위변조 여부를 재검증한다.
 */
export function verifyCreatorIpBundleSeal(
  bundle: CreatorIpDerivativeBundle,
): CreatorIpSealVerificationResult {
  const mismatches: string[] = [];

  const merchWithoutHash = { ...bundle.deliverables.merchPrintSpec };
  delete (merchWithoutHash as { artifactSha256?: string }).artifactSha256;
  const recomputedMerchSha = sha256HexFromText(canonicalJsonStringify(merchWithoutHash));
  if (recomputedMerchSha !== bundle.rightsBomSeal.artifactDigests.merchSpecSha256) {
    mismatches.push("merchPrintSpec 해시 불일치");
  }

  const recomputedSpriteShas: string[] = [];
  for (let i = 0; i < bundle.deliverables.characterSprites.length; i += 1) {
    const sp = bundle.deliverables.characterSprites[i];
    const actualRgbaSha = sha256HexFromBytes(sp.croppedRgba);
    if (actualRgbaSha !== sp.croppedRgbaSha256) {
      mismatches.push(`characterSprites[${i}].croppedRgba 픽셀 버퍼 변조 감지`);
    }
    const metaCopy = { ...sp, croppedRgbaSha256: actualRgbaSha };
    delete (metaCopy as { croppedRgba?: Uint8Array }).croppedRgba;
    delete (metaCopy as { artifactSha256?: string }).artifactSha256;
    const recomputedMetaSha = sha256HexFromText(canonicalJsonStringify(metaCopy));
    recomputedSpriteShas.push(recomputedMetaSha);
    if (recomputedMetaSha !== bundle.rightsBomSeal.artifactDigests.characterSpriteSha256List[i]) {
      mismatches.push(`characterSprites[${i}] 메타데이터 해시 불일치`);
    }
  }

  const turntableCopy = { ...bundle.deliverables.turntableCamera };
  delete (turntableCopy as { artifactSha256?: string }).artifactSha256;
  const recomputedTurntableSha = sha256HexFromText(canonicalJsonStringify(turntableCopy));
  if (recomputedTurntableSha !== bundle.rightsBomSeal.artifactDigests.turntableCameraSha256) {
    mismatches.push("turntableCamera 해시 불일치");
  }

  const trailerCopy = { ...bundle.deliverables.audioToonTrailer };
  delete (trailerCopy as { artifactSha256?: string }).artifactSha256;
  const recomputedTrailerSha = sha256HexFromText(canonicalJsonStringify(trailerCopy));
  if (recomputedTrailerSha !== bundle.rightsBomSeal.artifactDigests.audioToonTrailerSha256) {
    mismatches.push("audioToonTrailer 해시 불일치");
  }

  const recomputedBomSha = sha256HexFromText(
    computeRightsBomDigestPayload(
      bundle.rightsBomSeal.episodeId,
      bundle.rightsBomSeal.seriesId,
      bundle.rightsBomSeal.creatorId,
      bundle.rightsBomSeal.rightsAssets,
      bundle.rightsBomSeal.royaltySplits,
      bundle.rightsBomSeal.requiredAttributionLines,
    ),
  );
  if (recomputedBomSha !== bundle.rightsBomSeal.rightsBomSha256) {
    mismatches.push("rightsBomSeal Rights BOM / 로열티 분배표 해시 불일치");
  }

  const actualBundleSha256 = computeMasterBundleDigest(
    recomputedBomSha,
    recomputedMerchSha,
    recomputedSpriteShas,
    recomputedTurntableSha,
    recomputedTrailerSha,
  );
  const expectedBundleSha256 = bundle.rightsBomSeal.bundleSha256;
  if (actualBundleSha256 !== expectedBundleSha256) {
    mismatches.push("마스터 bundleSha256 봉인 불일치");
  }

  return {
    valid: mismatches.length === 0,
    expectedBundleSha256,
    actualBundleSha256,
    mismatches,
  };
}
