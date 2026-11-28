/**
 * Wave 92 — 비파괴 지역 변형 레이어 합성기 & Rights BOM 출고 게이트.
 *
 * - 단일 마스터 레이어 원본 무변경(`mutatedMasterLayerCount === 0`) 보장
 * - 심의 평가 + 권리 BOM(영역·상업 연재·만료일·미등록 에셋) 이중 fail-closed 출고 게이트
 * - 순수 동기 ES2017 FIPS 180-4 SHA-256 서명·위변조 검증 및 권역 간 패널 차분
 */

import { canonicalizeGeoManifestJson, sha256GeoManifestHex } from "./geo-manifest-sha256";
import {
  evaluateRegionalComplianceMatrix,
  regionCodeToTerritory,
  type GeoRegionCode,
  type GeoTerritoryCode,
  type GeoVariantOverrideLayer,
  type GeoVariantRemediationType,
  type MasterBaseLayerRole,
  type MasterEpisodeDocument,
  type RegionalComplianceRegionReport,
} from "./regional-compliance-policy-engine";

export { canonicalizeGeoManifestJson, sha256GeoManifestHex } from "./geo-manifest-sha256";

export type RightsBomAssetKind = "font" | "3d-prop" | "brush-texture" | "audio-cue";

export interface RightsBomAssetEntry {
  readonly assetId: string;
  readonly kind: RightsBomAssetKind;
  readonly displayName: string;
  readonly allowedTerritories: readonly string[];
  readonly commercialSerializationAllowed: boolean;
  readonly expiresOnIso?: string;
  readonly licenseReference?: string;
}

export type RightsBomBlockerCode =
  | "TERRITORY_NOT_LICENSED"
  | "COMMERCIAL_SERIALIZATION_PROHIBITED"
  | "LICENSE_EXPIRED"
  | "INVALID_LICENSE_EXPIRY_DATE"
  | "UNREGISTERED_ASSET_IN_BOM";

export interface RightsBomBlocker {
  readonly assetId: string;
  readonly assetKind: RightsBomAssetKind | "unknown";
  readonly displayName: string;
  readonly regionCode: GeoRegionCode;
  readonly territory: GeoTerritoryCode;
  readonly code: RightsBomBlockerCode;
  readonly messageKo: string;
}

export interface RightsBomRegionEvaluation {
  readonly regionCode: GeoRegionCode;
  readonly territory: GeoTerritoryCode;
  readonly releaseDateIso: string | null;
  readonly evaluatedAssetCount: number;
  readonly clearedAssetIds: readonly string[];
  readonly blockers: readonly RightsBomBlocker[];
  readonly allAssetsCleared: boolean;
}

export interface ResolvedDeliveryLayerEntry {
  readonly layerId: string;
  readonly panelId: string;
  readonly source: "master-shared" | "geo-variant-override";
  readonly roleOrRemediation: MasterBaseLayerRole | GeoVariantRemediationType;
  readonly label: string;
  readonly zIndex: number;
  readonly digest: string;
  readonly mutatedMaster: false;
}

export interface ResolvedDeliveryPanelStack {
  readonly panelId: string;
  readonly sequenceIndex: number;
  readonly title: string;
  readonly layers: readonly ResolvedDeliveryLayerEntry[];
  readonly sharedMasterLayerCount: number;
  readonly variantOverrideLayerIds: readonly string[];
  readonly panelLayerDigest: string;
}

export interface RegionalDeliveryBlockingReason {
  readonly gate: "compliance" | "rights-bom";
  readonly code: string;
  readonly panelId?: string;
  readonly assetId?: string;
  readonly messageKo: string;
}

export type RegionalDeliveryExportDecision = "APPROVED" | "BLOCKED";

export interface CompileRegionalDeliveryOptions {
  readonly releaseDateIso?: string;
  readonly trademarkBlocklist?: readonly string[];
}

export interface RegionalDeliveryManifest {
  readonly schemaVersion: "wave92-geo-delivery-manifest/v1";
  readonly episodeId: string;
  readonly seriesId: string;
  readonly episodeTitle: string;
  readonly masterRevision: number;
  readonly regionCode: GeoRegionCode;
  readonly territory: GeoTerritoryCode;
  readonly releaseDateIso: string | null;
  readonly masterLayersSnapshotSha256: string;
  readonly mutatedMasterLayerCount: 0;
  readonly totalMasterBaseLayerCount: number;
  readonly totalResolvedLayerCount: number;
  readonly sharedLayerReuseRatio: number;
  readonly variantOverrideLayerIds: readonly string[];
  readonly panels: readonly ResolvedDeliveryPanelStack[];
  readonly complianceSummary: {
    readonly exportAllowed: boolean;
    readonly blockingCount: number;
    readonly resolvedByVariantCount: number;
    readonly warningCount: number;
  };
  readonly rightsBomSummary: {
    readonly evaluatedAssetCount: number;
    readonly clearedAssetCount: number;
    readonly blockerCount: number;
    readonly allAssetsCleared: boolean;
  };
  readonly complianceReport: RegionalComplianceRegionReport;
  readonly rightsBomEvaluation: RightsBomRegionEvaluation;
  readonly exportDecision: RegionalDeliveryExportDecision;
  readonly blockingReasons: readonly RegionalDeliveryBlockingReason[];
  readonly manifestSha256: string;
}

export interface RegionalDeliveryManifestIntegrityResult {
  readonly valid: boolean;
  readonly expectedSha256: string;
  readonly actualSha256: string;
  readonly issues: readonly string[];
}

export interface RegionalPanelDiffEntry {
  readonly panelId: string;
  readonly panelTitle: string;
  readonly sharedBaseLayerIds: readonly string[];
  readonly onlyInRegionAOverrideIds: readonly string[];
  readonly onlyInRegionBOverrideIds: readonly string[];
  readonly sharedOverrideIds: readonly string[];
  readonly layerDigestA: string | null;
  readonly layerDigestB: string | null;
}

export interface RegionalDeliveryManifestDiff {
  readonly episodeIdA: string;
  readonly episodeIdB: string;
  readonly sameEpisode: boolean;
  readonly regionA: GeoRegionCode;
  readonly regionB: GeoRegionCode;
  readonly exportDecisionChanged: boolean;
  readonly decisionA: RegionalDeliveryExportDecision;
  readonly decisionB: RegionalDeliveryExportDecision;
  readonly sharedBaseLayerCount: number;
  readonly unchangedPanelIds: readonly string[];
  readonly changedPanels: readonly RegionalPanelDiffEntry[];
  readonly totalDeltaOverrideCount: number;
  readonly rightsBomBlockerDelta: {
    readonly onlyInA: readonly string[];
    readonly onlyInB: readonly string[];
  };
}

const DATE_ONLY_ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseStrictIsoEpochMs(raw: string, endOfDayIfDateOnly: boolean): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const dateOnly = DATE_ONLY_ISO_PATTERN.exec(trimmed);
  if (dateOnly !== null) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const probe = new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        endOfDayIfDateOnly ? 23 : 0,
        endOfDayIfDateOnly ? 59 : 0,
        endOfDayIfDateOnly ? 59 : 0,
        endOfDayIfDateOnly ? 999 : 0,
      ),
    );
    if (
      probe.getUTCFullYear() !== year ||
      probe.getUTCMonth() !== month - 1 ||
      probe.getUTCDate() !== day
    ) {
      return null;
    }
    return probe.getTime();
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 대상 권역과 출고 예정일 기준으로 Rights BOM 에셋의 상업 연재 권한,
 * 권역 라이선스 범위(`GLOBAL` 또는 국가/권역 코드), 만료일을 fail-closed 검증한다.
 */
export function evaluateRightsBomForRegion(
  regionCode: GeoRegionCode,
  rightsBomAssets: readonly RightsBomAssetEntry[],
  releaseDateIso?: string,
  referencedAssetIds?: readonly string[],
): RightsBomRegionEvaluation {
  const territory = regionCodeToTerritory(regionCode);
  const blockers: RightsBomBlocker[] = [];
  const clearedAssetIds: string[] = [];
  const registeredById = new Map<string, RightsBomAssetEntry>();

  const normalizedReleaseIso =
    releaseDateIso !== undefined && releaseDateIso.trim().length > 0 ? releaseDateIso.trim() : null;
  const releaseMs =
    normalizedReleaseIso !== null ? parseStrictIsoEpochMs(normalizedReleaseIso, false) : null;

  const sortedAssets = rightsBomAssets.slice().sort((a, b) => a.assetId.localeCompare(b.assetId));

  for (let i = 0; i < sortedAssets.length; i += 1) {
    const asset = sortedAssets[i];
    registeredById.set(asset.assetId, asset);
    let assetBlocked = false;

    if (asset.commercialSerializationAllowed !== true) {
      assetBlocked = true;
      blockers.push({
        assetId: asset.assetId,
        assetKind: asset.kind,
        displayName: asset.displayName,
        regionCode,
        territory,
        code: "COMMERCIAL_SERIALIZATION_PROHIBITED",
        messageKo: `에셋 '${asset.displayName}'(${asset.assetId})은 상업 연재 배포가 허용되지 않은 라이선스입니다.`,
      });
    }

    const normalizedTerritories = asset.allowedTerritories.map((t) => t.trim().toUpperCase());
    const territoryCovered =
      normalizedTerritories.includes("GLOBAL") ||
      normalizedTerritories.includes(territory) ||
      normalizedTerritories.includes(regionCode.toUpperCase());

    if (!territoryCovered) {
      assetBlocked = true;
      blockers.push({
        assetId: asset.assetId,
        assetKind: asset.kind,
        displayName: asset.displayName,
        regionCode,
        territory,
        code: "TERRITORY_NOT_LICENSED",
        messageKo: `에셋 '${asset.displayName}'(${asset.assetId})의 허가 권역([${normalizedTerritories.join(", ")}])에 ${regionCode}(${territory})가 포함되지 않았습니다.`,
      });
    }

    if (asset.expiresOnIso !== undefined) {
      const expiryMs = parseStrictIsoEpochMs(asset.expiresOnIso, true);
      if (expiryMs === null || releaseMs === null) {
        assetBlocked = true;
        blockers.push({
          assetId: asset.assetId,
          assetKind: asset.kind,
          displayName: asset.displayName,
          regionCode,
          territory,
          code: "INVALID_LICENSE_EXPIRY_DATE",
          messageKo: `에셋 '${asset.displayName}'(${asset.assetId})의 만료일(${asset.expiresOnIso}) 또는 출고 기준일을 확인할 수 없어 출고를 차단합니다.`,
        });
      } else if (releaseMs > expiryMs) {
        assetBlocked = true;
        blockers.push({
          assetId: asset.assetId,
          assetKind: asset.kind,
          displayName: asset.displayName,
          regionCode,
          territory,
          code: "LICENSE_EXPIRED",
          messageKo: `에셋 '${asset.displayName}'(${asset.assetId}) 라이선스가 ${asset.expiresOnIso}에 만료되어 ${normalizedReleaseIso} 출고에 사용할 수 없습니다.`,
        });
      }
    }

    if (!assetBlocked) clearedAssetIds.push(asset.assetId);
  }

  if (referencedAssetIds !== undefined) {
    const uniqueReferenced = Array.from(new Set(referencedAssetIds)).sort();
    for (let i = 0; i < uniqueReferenced.length; i += 1) {
      const refId = uniqueReferenced[i];
      if (!registeredById.has(refId)) {
        blockers.push({
          assetId: refId,
          assetKind: "unknown",
          displayName: refId,
          regionCode,
          territory,
          code: "UNREGISTERED_ASSET_IN_BOM",
          messageKo: `패널 레이어가 참조하는 에셋 '${refId}'이 Rights BOM 명세에 등록되지 않았습니다.`,
        });
      }
    }
  }

  return {
    regionCode,
    territory,
    releaseDateIso: normalizedReleaseIso,
    evaluatedAssetCount: sortedAssets.length,
    clearedAssetIds,
    blockers,
    allAssetsCleared: blockers.length === 0,
  };
}

function computeMasterLayersSnapshotSha256(masterEpisode: MasterEpisodeDocument): string {
  const orderedPanels = masterEpisode.panels
    .slice()
    .sort((a, b) => (a.sequenceIndex !== b.sequenceIndex ? a.sequenceIndex - b.sequenceIndex : a.panelId.localeCompare(b.panelId)));

  const snapshot = orderedPanels.map((panel) => ({
    panelId: panel.panelId,
    sequenceIndex: panel.sequenceIndex,
    baseLayers: panel.baseLayers
      .slice()
      .sort((a, b) => (a.zIndex !== b.zIndex ? a.zIndex - b.zIndex : a.layerId.localeCompare(b.layerId)))
      .map((l) => ({
        layerId: l.layerId,
        panelId: l.panelId,
        role: l.role,
        label: l.label,
        contentDigest: l.contentDigest,
        zIndex: l.zIndex,
        assetIds: l.assetIds !== undefined ? l.assetIds.slice().sort() : [],
      })),
  }));
  return sha256GeoManifestHex(canonicalizeGeoManifestJson(snapshot));
}

function buildOverrideDigest(override: GeoVariantOverrideLayer): string {
  if (override.payloadDigest !== undefined && override.payloadDigest.trim().length > 0) {
    return override.payloadDigest;
  }
  return sha256GeoManifestHex(
    canonicalizeGeoManifestJson({
      overrideId: override.overrideId,
      panelId: override.panelId,
      remediationType: override.remediationType,
      bbox: override.bbox,
      reviewerId: override.reviewerId ?? null,
      approvedAtIso: override.approvedAtIso ?? null,
    }),
  );
}

function stripManifestHash(
  manifest: RegionalDeliveryManifest,
): Omit<RegionalDeliveryManifest, "manifestSha256"> {
  const { manifestSha256: _ignored, ...payload } = manifest;
  void _ignored;
  return payload;
}

/**
 * 단일 마스터 회차에서 대상 권역의 비파괴 레이어 스택을 합성하고,
 * 심의 평가 + Rights BOM 검증을 결합한 fail-closed 출고 매니페스트를 생성한다.
 */
export function compileRegionalDeliveryManifest(
  masterEpisode: MasterEpisodeDocument,
  regionCode: GeoRegionCode,
  rightsBomAssets: readonly RightsBomAssetEntry[],
  options?: CompileRegionalDeliveryOptions,
): RegionalDeliveryManifest {
  const masterSnapshotBefore = computeMasterLayersSnapshotSha256(masterEpisode);
  const territory = regionCodeToTerritory(regionCode);
  const complianceReport = evaluateRegionalComplianceMatrix(masterEpisode, [regionCode], {
    trademarkBlocklist: options?.trademarkBlocklist,
  }).regions[0];

  const orderedPanels = masterEpisode.panels
    .slice()
    .sort((a, b) => (a.sequenceIndex !== b.sequenceIndex ? a.sequenceIndex - b.sequenceIndex : a.panelId.localeCompare(b.panelId)));

  const referencedAssetIds: string[] = [];
  const activeOverrideIds: string[] = [];
  const resolvedPanels: ResolvedDeliveryPanelStack[] = [];
  let totalMasterBaseLayerCount = 0;

  for (let pi = 0; pi < orderedPanels.length; pi += 1) {
    const panel = orderedPanels[pi];
    const sortedBase = panel.baseLayers
      .slice()
      .sort((a, b) => (a.zIndex !== b.zIndex ? a.zIndex - b.zIndex : a.layerId.localeCompare(b.layerId)));

    const layers: ResolvedDeliveryLayerEntry[] = [];
    let maxBaseZ = 0;

    for (let li = 0; li < sortedBase.length; li += 1) {
      const base = sortedBase[li];
      totalMasterBaseLayerCount += 1;
      if (base.zIndex > maxBaseZ) maxBaseZ = base.zIndex;
      if (base.assetIds !== undefined) referencedAssetIds.push(...base.assetIds);
      layers.push({
        layerId: base.layerId,
        panelId: panel.panelId,
        source: "master-shared",
        roleOrRemediation: base.role,
        label: base.label,
        zIndex: base.zIndex,
        digest: base.contentDigest,
        mutatedMaster: false,
      });
    }

    const panelOverrides = masterEpisode.variantOverrides
      .filter(
        (o) =>
          o.panelId === panel.panelId &&
          o.targetRegions.includes(regionCode) &&
          (o.nonDestructiveToMaster as boolean) === true &&
          o.approvedByReviewer === true,
      )
      .slice()
      .sort((a, b) => {
        const dz = (a.zIndexOffset ?? 0) - (b.zIndexOffset ?? 0);
        return dz !== 0 ? dz : a.overrideId.localeCompare(b.overrideId);
      });

    const panelOverrideIds: string[] = [];
    for (let oi = 0; oi < panelOverrides.length; oi += 1) {
      const ovr = panelOverrides[oi];
      panelOverrideIds.push(ovr.overrideId);
      activeOverrideIds.push(ovr.overrideId);
      layers.push({
        layerId: ovr.overrideId,
        panelId: panel.panelId,
        source: "geo-variant-override",
        roleOrRemediation: ovr.remediationType,
        label: ovr.label ?? `지역 보정(${ovr.remediationType})`,
        zIndex: maxBaseZ + 100 + (ovr.zIndexOffset ?? oi),
        digest: buildOverrideDigest(ovr),
        mutatedMaster: false,
      });
    }

    resolvedPanels.push({
      panelId: panel.panelId,
      sequenceIndex: panel.sequenceIndex,
      title: panel.title,
      layers,
      sharedMasterLayerCount: sortedBase.length,
      variantOverrideLayerIds: panelOverrideIds,
      panelLayerDigest: sha256GeoManifestHex(canonicalizeGeoManifestJson(layers)),
    });
  }

  const rightsBomEvaluation = evaluateRightsBomForRegion(
    regionCode,
    rightsBomAssets,
    options?.releaseDateIso,
    referencedAssetIds,
  );

  const blockingReasons: RegionalDeliveryBlockingReason[] = [
    ...complianceReport.blockingFindings.map((f) => ({
      gate: "compliance" as const,
      code: f.failureReason ?? "compliance-blocker",
      panelId: f.panelId,
      messageKo: `[심의 차단 · ${f.category}] ${f.remediationSuggestionKo}`,
    })),
    ...rightsBomEvaluation.blockers.map((b) => ({
      gate: "rights-bom" as const,
      code: b.code,
      assetId: b.assetId,
      messageKo: `[권리 BOM 차단 · ${b.code}] ${b.messageKo}`,
    })),
  ];

  if (computeMasterLayersSnapshotSha256(masterEpisode) !== masterSnapshotBefore) {
    throw new Error("Non-destructive master layer invariant violated during compilation");
  }

  const uniqueOverrideIds = Array.from(new Set(activeOverrideIds)).sort();
  const totalResolvedLayerCount = totalMasterBaseLayerCount + uniqueOverrideIds.length;
  const rawReuseRatio =
    totalResolvedLayerCount === 0 ? 1 : totalMasterBaseLayerCount / totalResolvedLayerCount;
  const sharedLayerReuseRatio = Math.round(rawReuseRatio * 1_000_000) / 1_000_000;

  const exportDecision: RegionalDeliveryExportDecision =
    complianceReport.exportAllowed &&
    rightsBomEvaluation.allAssetsCleared &&
    blockingReasons.length === 0
      ? "APPROVED"
      : "BLOCKED";

  const unsignedPayload: Omit<RegionalDeliveryManifest, "manifestSha256"> = {
    schemaVersion: "wave92-geo-delivery-manifest/v1",
    episodeId: masterEpisode.episodeId,
    seriesId: masterEpisode.seriesId,
    episodeTitle: masterEpisode.title,
    masterRevision: masterEpisode.masterRevision,
    regionCode,
    territory,
    releaseDateIso: rightsBomEvaluation.releaseDateIso,
    masterLayersSnapshotSha256: masterSnapshotBefore,
    mutatedMasterLayerCount: 0,
    totalMasterBaseLayerCount,
    totalResolvedLayerCount,
    sharedLayerReuseRatio,
    variantOverrideLayerIds: uniqueOverrideIds,
    panels: resolvedPanels,
    complianceSummary: {
      exportAllowed: complianceReport.exportAllowed,
      blockingCount: complianceReport.blockingFindings.length,
      resolvedByVariantCount: complianceReport.resolvedByVariantCount,
      warningCount: complianceReport.warningFindings.length,
    },
    rightsBomSummary: {
      evaluatedAssetCount: rightsBomEvaluation.evaluatedAssetCount,
      clearedAssetCount: rightsBomEvaluation.clearedAssetIds.length,
      blockerCount: rightsBomEvaluation.blockers.length,
      allAssetsCleared: rightsBomEvaluation.allAssetsCleared,
    },
    complianceReport,
    rightsBomEvaluation,
    exportDecision,
    blockingReasons,
  };

  return {
    ...unsignedPayload,
    manifestSha256: sha256GeoManifestHex(canonicalizeGeoManifestJson(unsignedPayload)),
  };
}

/** 출고 매니페스트의 SHA-256 다이제스트와 fail-closed 불변식을 검증하여 위변조를 탐지한다. */
export function verifyRegionalDeliveryManifestIntegrity(
  manifest: RegionalDeliveryManifest,
): RegionalDeliveryManifestIntegrityResult {
  const issues: string[] = [];
  const expectedSha256 = sha256GeoManifestHex(
    canonicalizeGeoManifestJson(stripManifestHash(manifest)),
  );
  const actualSha256 = manifest.manifestSha256;

  if (!/^[0-9a-f]{64}$/.test(actualSha256)) {
    issues.push("manifestSha256 형식이 64자리 소문자 16진수 SHA-256이 아닙니다.");
  } else if (actualSha256 !== expectedSha256) {
    issues.push("manifestSha256 해시가 본문 내용과 일치하지 않습니다(매니페스트 변조 의심).");
  }
  if ((manifest.mutatedMasterLayerCount as number) !== 0) {
    issues.push("마스터 원본 레이어 변경 횟수가 0이 아닙니다.");
  }

  const expectedDecision: RegionalDeliveryExportDecision =
    manifest.complianceReport.exportAllowed &&
    manifest.rightsBomEvaluation.allAssetsCleared &&
    manifest.blockingReasons.length === 0
      ? "APPROVED"
      : "BLOCKED";
  if (manifest.exportDecision !== expectedDecision) {
    issues.push(`exportDecision(${manifest.exportDecision})이 게이트 결과(${expectedDecision})와 모순됩니다.`);
  }

  return { valid: issues.length === 0, expectedSha256, actualSha256, issues };
}

/** 두 권역 출고 매니페스트의 패널·변형 레이어 차분만 정밀 추출한다. */
export function diffRegionalDeliveryManifests(
  manifestA: RegionalDeliveryManifest,
  manifestB: RegionalDeliveryManifest,
): RegionalDeliveryManifestDiff {
  const panelsA = new Map(manifestA.panels.map((p) => [p.panelId, p]));
  const panelsB = new Map(manifestB.panels.map((p) => [p.panelId, p]));
  const allPanelIds = Array.from(
    new Set([...manifestA.panels.map((p) => p.panelId), ...manifestB.panels.map((p) => p.panelId)]),
  );

  let sharedBaseLayerCount = 0;
  let totalDeltaOverrideCount = 0;
  const unchangedPanelIds: string[] = [];
  const changedPanels: RegionalPanelDiffEntry[] = [];

  for (let i = 0; i < allPanelIds.length; i += 1) {
    const panelId = allPanelIds[i];
    const pA = panelsA.get(panelId);
    const pB = panelsB.get(panelId);

    const baseIdsA = new Set((pA?.layers ?? []).filter((l) => l.source === "master-shared").map((l) => l.layerId));
    const sharedBaseLayerIds = (pB?.layers ?? [])
      .filter((l) => l.source === "master-shared" && baseIdsA.has(l.layerId))
      .map((l) => l.layerId)
      .sort();
    sharedBaseLayerCount += sharedBaseLayerIds.length;

    const overridesA = new Set(pA?.variantOverrideLayerIds ?? []);
    const overridesB = new Set(pB?.variantOverrideLayerIds ?? []);
    const onlyInA = Array.from(overridesA).filter((id) => !overridesB.has(id)).sort();
    const onlyInB = Array.from(overridesB).filter((id) => !overridesA.has(id)).sort();
    const sharedOverrides = Array.from(overridesA).filter((id) => overridesB.has(id)).sort();

    const digestA = pA?.panelLayerDigest ?? null;
    const digestB = pB?.panelLayerDigest ?? null;
    if (digestA === digestB && onlyInA.length === 0 && onlyInB.length === 0) {
      unchangedPanelIds.push(panelId);
    } else {
      totalDeltaOverrideCount += onlyInA.length + onlyInB.length;
      changedPanels.push({
        panelId,
        panelTitle: pA?.title ?? pB?.title ?? panelId,
        sharedBaseLayerIds,
        onlyInRegionAOverrideIds: onlyInA,
        onlyInRegionBOverrideIds: onlyInB,
        sharedOverrideIds: sharedOverrides,
        layerDigestA: digestA,
        layerDigestB: digestB,
      });
    }
  }

  const bomKeysA = new Set(manifestA.rightsBomEvaluation.blockers.map((b) => `${b.assetId}:${b.code}`));
  const bomKeysB = new Set(manifestB.rightsBomEvaluation.blockers.map((b) => `${b.assetId}:${b.code}`));

  return {
    episodeIdA: manifestA.episodeId,
    episodeIdB: manifestB.episodeId,
    sameEpisode: manifestA.episodeId === manifestB.episodeId,
    regionA: manifestA.regionCode,
    regionB: manifestB.regionCode,
    exportDecisionChanged: manifestA.exportDecision !== manifestB.exportDecision,
    decisionA: manifestA.exportDecision,
    decisionB: manifestB.exportDecision,
    sharedBaseLayerCount,
    unchangedPanelIds,
    changedPanels,
    totalDeltaOverrideCount,
    rightsBomBlockerDelta: {
      onlyInA: Array.from(bomKeysA).filter((k) => !bomKeysB.has(k)).sort(),
      onlyInB: Array.from(bomKeysB).filter((k) => !bomKeysA.has(k)).sort(),
    },
  };
}
