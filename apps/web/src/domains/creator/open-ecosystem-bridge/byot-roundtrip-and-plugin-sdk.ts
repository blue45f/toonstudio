/**
 * BYOT(Bring Your Own Tool) 타사 창작 툴 무손실 라운드트립 매니페스트 브리지 &
 * 오픈 플러그인·Wasm 샌드박스 보안 검증기 (Wave 18 Track 1).
 *
 * - Clip Studio Paint / Photoshop / Procreate(.psd/.clip/.procreate) layerUid 보존 +
 *   비출력 레드라인(99_NONPRINT_REDLINE_OVERLAY) 자동 격리 보존
 * - Blender / SketchUp / Figma / Google Drive / Dropbox / AWS S3-R2 SHA-256 변경 감지 +
 *   Rights BOM 라이선스 태그 자동 상속
 * - 최소 권한 원칙(canvas:read · qa:annotate · export:hook · tracker:sync) Wasm 샌드박스 검증
 */

import { sha256Hex } from "./external-tracker-connectors";

export type ByotExternalToolId = "clip-studio-paint" | "photoshop" | "procreate" | "blender" | "sketchup" | "figma";
export type ByotExchangeFormat = ".psd" | ".clip" | ".procreate" | ".glb" | ".blend" | ".skp" | ".svg";
export type ByotStorageBackendId = "local-opfs" | "google-drive" | "dropbox" | "s3-r2";
export type ToonStudioOptionalModuleId = "nonprint-redline-review" | "auto-qa-pinhole-bleed" | "smart-publish-slice" | "rights-bom-governance" | "external-tracker-sync";
export type ByotLayerKind = "raster" | "vector" | "text" | "adjustment" | "folder" | "3d-linked" | "nonprint-redline";
export type RightsLicenseCode = "CC0" | "CC-BY" | "CC-BY-SA" | "CC-BY-NC" | "COMMERCIAL-PERPETUAL" | "COMMERCIAL-RENTAL" | "EDITORIAL-ONLY" | "UNKNOWN";
export type RightsBomTag = "COMMERCIAL_OK" | "NON_COMMERCIAL_BLOCK" | "ATTRIBUTION_REQUIRED" | "RENTAL_ACTIVE" | "RENTAL_EXPIRING_SOON" | "RENTAL_EXPIRED_BLOCK" | "UNVERIFIED_LICENSE_BLOCK";
export type LayerDiffStatus = "unchanged" | "modified-pixels" | "renamed-uid-preserved" | "added-external" | "removed-external" | "preserved-nonprint-redline";
export type AllowedPluginScope = "canvas:read" | "qa:annotate" | "export:hook" | "tracker:sync";

export const NONPRINT_REDLINE_LAYER_NAME = "99_NONPRINT_REDLINE_OVERLAY";
export const NONPRINT_REDLINE_LAYER_UID = "ts-layer-nonprint-redline-99";
export const MAX_PLUGIN_MEMORY_MB = 256;
export const MAX_PLUGIN_CPU_TIMEOUT_MS = 5000;
export const ALLOWED_PLUGIN_SCOPES: readonly AllowedPluginScope[] = ["canvas:read", "qa:annotate", "export:hook", "tracker:sync"];

export interface ByotLayerRecord {
  readonly layerUid: string; readonly name: string; readonly kind: ByotLayerKind;
  readonly visible: boolean; readonly opacity: number;
  readonly blendMode: "normal" | "multiply" | "screen" | "overlay" | "add-glow";
  readonly pixelHashSha256: string; readonly exportable: boolean; readonly locked: boolean; readonly parentUid?: string;
}

export interface RightsBomMetadata {
  readonly licenseCode: RightsLicenseCode; readonly commercialAllowed: boolean;
  readonly attributionRequired: boolean; readonly attributionText?: string;
  readonly originAssetId: string; readonly inheritedFromParent: boolean;
  readonly rentalExpiresAtIso?: string; readonly evaluatedTags: readonly RightsBomTag[];
}

export interface ExternalLinkedAsset {
  readonly assetId: string; readonly name: string; readonly sourceTool: ByotExternalToolId;
  readonly storageBackend: ByotStorageBackendId; readonly storageUri: string;
  readonly contentSha256: string; readonly rightsBom: RightsBomMetadata;
  readonly derivedCutIds: readonly string[]; readonly updatedAtIso: string;
}

export interface ByotRoundtripSession {
  readonly sessionId: string; readonly workId: string; readonly episodeId: string; readonly cutId: string;
  readonly sourceTool: ByotExternalToolId; readonly exchangeFormat: ByotExchangeFormat;
  readonly storageBackend: ByotStorageBackendId; readonly enabledModules: readonly ToonStudioOptionalModuleId[];
  readonly layers: readonly ByotLayerRecord[]; readonly externalAssets: readonly ExternalLinkedAsset[];
  readonly roundtripGeneration: number; readonly manifestSha256: string; readonly updatedAtIso: string;
}

export interface CreateByotSessionInput {
  readonly sessionId?: string; readonly workId: string; readonly episodeId: string; readonly cutId: string;
  readonly sourceTool: ByotExternalToolId; readonly exchangeFormat?: ByotExchangeFormat;
  readonly storageBackend: ByotStorageBackendId; readonly enabledModules: readonly ToonStudioOptionalModuleId[];
  readonly layers: readonly ByotLayerRecord[]; readonly externalAssets?: readonly ExternalLinkedAsset[];
  readonly updatedAtIso?: string;
}

export interface IncomingExternalLayer {
  readonly layerUid?: string; readonly name: string; readonly kind: ByotLayerKind;
  readonly visible: boolean; readonly opacity: number; readonly blendMode: ByotLayerRecord["blendMode"];
  readonly pixelHashSha256: string; readonly exportable?: boolean; readonly locked?: boolean; readonly parentUid?: string;
}

export interface ByotLayerDiffEntry {
  readonly layerUid: string; readonly previousName: string | null; readonly currentName: string;
  readonly status: LayerDiffStatus; readonly uidPreserved: boolean; readonly uidFallbackMatched: boolean;
  readonly pixelChanged: boolean; readonly exportable: boolean;
}

export interface ByotRoundtripReconcileSummary {
  readonly roundtripGeneration: number; readonly totalLayers: number; readonly preservedUidCount: number;
  readonly renamedButPreservedCount: number; readonly modifiedCount: number; readonly addedCount: number;
  readonly removedCount: number; readonly fallbackMatchCount: number; readonly redlinePreserved: boolean;
  readonly redlineNonExportableEnforced: boolean; readonly losslessRoundtripOk: boolean;
}

export interface ByotRoundtripReconcileResult {
  readonly nextSession: ByotRoundtripSession; readonly diffEntries: readonly ByotLayerDiffEntry[];
  readonly summary: ByotRoundtripReconcileSummary; readonly warnings: readonly string[];
}

export interface ExternalAssetSnapshot {
  readonly assetId: string; readonly name: string; readonly sourceTool: ByotExternalToolId;
  readonly storageBackend: ByotStorageBackendId; readonly storageUri: string;
  readonly contentSha256?: string; readonly contentDigestSeed?: string; readonly parentAssetId?: string;
  readonly claimedLicenseCode?: RightsLicenseCode; readonly derivedCutIds?: readonly string[]; readonly scannedAtIso?: string;
}

export interface ExternalAssetChangeEntry {
  readonly assetId: string; readonly name: string; readonly changeKind: "unchanged" | "modified" | "added" | "missing";
  readonly previousSha256: string | null; readonly currentSha256: string | null;
  readonly rightsBom: RightsBomMetadata; readonly licenseDowngradeBlocked: boolean; readonly commercialPublishAllowed: boolean;
}

export interface ExternalAssetReconcileReport {
  readonly evaluatedAtIso: string; readonly totalAssets: number;
  readonly modifiedAssetIds: readonly string[]; readonly addedAssetIds: readonly string[]; readonly missingAssetIds: readonly string[];
  readonly commercialPublishReady: boolean; readonly blockingAssetIds: readonly string[];
  readonly requiredAttributions: readonly string[]; readonly entries: readonly ExternalAssetChangeEntry[];
  readonly updatedAssets: readonly ExternalLinkedAsset[];
}

export interface OpenPluginManifest {
  readonly id: string; readonly name: string; readonly version: string; readonly author: string;
  readonly runtime: string; readonly entryModule: string; readonly permissions: readonly string[];
  readonly memoryLimitMb: number; readonly cpuTimeoutMs: number;
  readonly networkPolicy: string; readonly secretAccess: string; readonly wasmSha256?: string;
  readonly descriptionKo?: string; readonly descriptionEn?: string;
}

export interface PluginManifestValidationResult {
  readonly valid: boolean; readonly securityGrade: "verified-sandbox" | "restricted-review" | "rejected";
  readonly grantedScopes: readonly AllowedPluginScope[]; readonly deniedScopes: readonly string[];
  readonly errors: readonly string[]; readonly warnings: readonly string[];
  readonly effectiveMemoryLimitMb: number; readonly effectiveCpuTimeoutMs: number;
}

export interface EcosystemConnectorMatrixRow {
  readonly id: string; readonly category: "drawing-3d" | "storage-assets" | "publishing-platform";
  readonly nameKo: string; readonly nameEn: string; readonly formatsOrProtocol: string;
  readonly mode: "local-roundtrip" | "dry-run-adapter" | "bom-tag-import" | "slice-preset";
  readonly rightsBomAware: boolean; readonly noteKo: string; readonly noteEn: string;
}

export const BYOT_TOOL_META: Readonly<Record<ByotExternalToolId, { readonly labelKo: string; readonly labelEn: string; readonly defaultFormat: ByotExchangeFormat; readonly category: "2d-drawing" | "3d-layout" }>> = {
  "clip-studio-paint": { labelKo: "Clip Studio Paint", labelEn: "Clip Studio Paint", defaultFormat: ".psd", category: "2d-drawing" },
  photoshop: { labelKo: "Adobe Photoshop", labelEn: "Adobe Photoshop", defaultFormat: ".psd", category: "2d-drawing" },
  procreate: { labelKo: "Procreate", labelEn: "Procreate", defaultFormat: ".procreate", category: "2d-drawing" },
  blender: { labelKo: "Blender 3D", labelEn: "Blender 3D", defaultFormat: ".glb", category: "3d-layout" },
  sketchup: { labelKo: "SketchUp", labelEn: "SketchUp", defaultFormat: ".skp", category: "3d-layout" },
  figma: { labelKo: "Figma", labelEn: "Figma", defaultFormat: ".svg", category: "3d-layout" },
};

export const OPTIONAL_MODULE_META: Readonly<Record<ToonStudioOptionalModuleId, { readonly labelKo: string; readonly labelEn: string }>> = {
  "nonprint-redline-review": { labelKo: "비출력 레드라인 검수", labelEn: "Non-Print Redline Review" },
  "auto-qa-pinhole-bleed": { labelKo: "자동 QA (핀홀·번짐·말풍선·색감)", labelEn: "Auto QA (Pinhole/Bleed/Balloon/Color)" },
  "smart-publish-slice": { labelKo: "출판 스마트 슬라이스", labelEn: "Smart Publish Slicing" },
  "rights-bom-governance": { labelKo: "Rights BOM 라이선스 상속", labelEn: "Rights BOM Inheritance" },
  "external-tracker-sync": { labelKo: "외부 트래커 양방향 동기화", labelEn: "External Tracker Sync" },
};

export const STORAGE_BACKEND_META: Readonly<Record<ByotStorageBackendId, { readonly labelKo: string; readonly labelEn: string }>> = {
  "local-opfs": { labelKo: "로컬 OPFS 금고", labelEn: "Local OPFS Vault" },
  "google-drive": { labelKo: "Google Drive 동기화", labelEn: "Google Drive Sync" },
  dropbox: { labelKo: "Dropbox 동기화", labelEn: "Dropbox Sync" },
  "s3-r2": { labelKo: "AWS S3 / Cloudflare R2", labelEn: "AWS S3 / Cloudflare R2" },
};

// 1. Rights BOM 태그 평가 & 부모->파생 에셋 자동 상속
export function evaluateRightsBomTags(input: {
  readonly licenseCode: RightsLicenseCode; readonly commercialAllowed: boolean;
  readonly attributionRequired: boolean; readonly rentalExpiresAtIso?: string; readonly evaluatedAtIso?: string;
}): readonly RightsBomTag[] {
  const tags: RightsBomTag[] = [];
  const evalTimeMs = Date.parse(input.evaluatedAtIso ?? "2026-11-23T10:30:00+09:00");
  if (input.licenseCode === "UNKNOWN") tags.push("UNVERIFIED_LICENSE_BLOCK");
  else if (!input.commercialAllowed || input.licenseCode === "CC-BY-NC" || input.licenseCode === "EDITORIAL-ONLY") tags.push("NON_COMMERCIAL_BLOCK");
  else tags.push("COMMERCIAL_OK");

  if (input.attributionRequired || input.licenseCode === "CC-BY" || input.licenseCode === "CC-BY-SA") tags.push("ATTRIBUTION_REQUIRED");
  if (input.licenseCode === "COMMERCIAL-RENTAL" && input.rentalExpiresAtIso) {
    const expiryMs = Date.parse(input.rentalExpiresAtIso);
    if (Number.isFinite(expiryMs) && Number.isFinite(evalTimeMs)) {
      const daysLeft = Math.floor((expiryMs - evalTimeMs) / 86_400_000);
      tags.push(daysLeft < 0 ? "RENTAL_EXPIRED_BLOCK" : daysLeft <= 14 ? "RENTAL_EXPIRING_SOON" : "RENTAL_ACTIVE");
    }
  }
  return tags;
}

export function isRightsBomCommercialPublishAllowed(tags: readonly RightsBomTag[]): boolean {
  return !tags.some((t) => t === "NON_COMMERCIAL_BLOCK" || t === "RENTAL_EXPIRED_BLOCK" || t === "UNVERIFIED_LICENSE_BLOCK");
}

export function inheritRightsBomTags(parentBom: RightsBomMetadata, evaluatedAtIso = "2026-11-23T10:30:00+09:00"): RightsBomMetadata {
  return {
    licenseCode: parentBom.licenseCode, commercialAllowed: parentBom.commercialAllowed,
    attributionRequired: parentBom.attributionRequired, attributionText: parentBom.attributionText,
    originAssetId: parentBom.originAssetId, inheritedFromParent: true, rentalExpiresAtIso: parentBom.rentalExpiresAtIso,
    evaluatedTags: evaluateRightsBomTags({
      licenseCode: parentBom.licenseCode, commercialAllowed: parentBom.commercialAllowed,
      attributionRequired: parentBom.attributionRequired, rentalExpiresAtIso: parentBom.rentalExpiresAtIso, evaluatedAtIso,
    }),
  };
}

// 2. BYOT 무손실 라운드트립 세션 생성 & 레이어 UID/비출력 레드라인 Diff 조정
function buildNonPrintRedlineLayer(existing?: ByotLayerRecord): ByotLayerRecord {
  return {
    layerUid: existing?.layerUid || NONPRINT_REDLINE_LAYER_UID,
    name: NONPRINT_REDLINE_LAYER_NAME, kind: "nonprint-redline",
    visible: existing?.visible ?? true, opacity: existing?.opacity ?? 0.85, blendMode: "normal",
    pixelHashSha256: existing?.pixelHashSha256 || sha256Hex("toonstudio:nonprint-redline:overlay:v1"),
    exportable: false, locked: true,
  };
}

function computeManifestSha256(
  workId: string, episodeId: string, cutId: string, sourceTool: ByotExternalToolId,
  generation: number, layers: readonly ByotLayerRecord[], assets: readonly ExternalLinkedAsset[],
): string {
  return sha256Hex(JSON.stringify({
    workId, episodeId, cutId, sourceTool, generation,
    layers: layers.map((l) => [l.layerUid, l.name, l.pixelHashSha256, l.exportable]),
    assets: assets.map((a) => [a.assetId, a.contentSha256, a.rightsBom.licenseCode]),
  }));
}

export function createByotRoundtripSession(input: CreateByotSessionInput): ByotRoundtripSession {
  const redlineEnabled = input.enabledModules.includes("nonprint-redline-review");
  const layers: ByotLayerRecord[] = input.layers.map((layer) =>
    layer.name === NONPRINT_REDLINE_LAYER_NAME || layer.kind === "nonprint-redline" ? buildNonPrintRedlineLayer(layer) : { ...layer },
  );
  if (redlineEnabled && !layers.some((l) => l.name === NONPRINT_REDLINE_LAYER_NAME)) layers.push(buildNonPrintRedlineLayer());

  const externalAssets = input.externalAssets ?? [];
  const manifestSha256 = computeManifestSha256(input.workId, input.episodeId, input.cutId, input.sourceTool, 1, layers, externalAssets);
  return {
    sessionId: input.sessionId ?? `byot-${input.episodeId}-${input.cutId}-${manifestSha256.slice(0, 8)}`,
    workId: input.workId, episodeId: input.episodeId, cutId: input.cutId, sourceTool: input.sourceTool,
    exchangeFormat: input.exchangeFormat ?? BYOT_TOOL_META[input.sourceTool].defaultFormat,
    storageBackend: input.storageBackend, enabledModules: [...input.enabledModules],
    layers, externalAssets, roundtripGeneration: 1, manifestSha256, updatedAtIso: input.updatedAtIso ?? "2026-11-23T10:20:00+09:00",
  };
}

export function reconcileByotLayerDiff(
  session: ByotRoundtripSession,
  incomingExternalLayers: readonly IncomingExternalLayer[],
  options?: { readonly updatedAtIso?: string },
): ByotRoundtripReconcileResult {
  const baselineByUid = new Map<string, ByotLayerRecord>();
  const baselineByName = new Map<string, ByotLayerRecord>();
  let baselineRedline: ByotLayerRecord | undefined;
  for (const layer of session.layers) {
    if (layer.name === NONPRINT_REDLINE_LAYER_NAME || layer.kind === "nonprint-redline") {
      baselineRedline = layer;
      continue;
    }
    baselineByUid.set(layer.layerUid, layer);
    if (!baselineByName.has(layer.name)) baselineByName.set(layer.name, layer);
  }

  const matchedUids = new Set<string>();
  const reconciledLayers: ByotLayerRecord[] = [];
  const diffEntries: ByotLayerDiffEntry[] = [];
  const warnings: string[] = [];
  let preservedUidCount = 0; let renamedButPreservedCount = 0; let modifiedCount = 0;
  let addedCount = 0; let fallbackMatchCount = 0; let redlineExportFlagTainted = false;

  for (let idx = 0; idx < incomingExternalLayers.length; idx += 1) {
    const inc = incomingExternalLayers[idx];
    if (inc.name === NONPRINT_REDLINE_LAYER_NAME || inc.kind === "nonprint-redline") {
      if (inc.exportable === true) redlineExportFlagTainted = true;
      continue;
    }
    const direct = inc.layerUid ? baselineByUid.get(inc.layerUid) : undefined;
    const fallback = !direct ? baselineByName.get(inc.name) : undefined;
    const matched = direct ?? fallback;

    if (matched && !matchedUids.has(matched.layerUid)) {
      matchedUids.add(matched.layerUid);
      const uidFallbackMatched = !direct && Boolean(fallback);
      if (uidFallbackMatched) {
        fallbackMatchCount += 1;
        warnings.push(`layer-uid-fallback:${matched.name}`);
      }
      const renamed = matched.name !== inc.name;
      const pixelChanged = matched.pixelHashSha256 !== inc.pixelHashSha256;
      const status: LayerDiffStatus = renamed ? "renamed-uid-preserved" : pixelChanged ? "modified-pixels" : "unchanged";
      preservedUidCount += 1;
      if (renamed) renamedButPreservedCount += 1;
      if (pixelChanged) modifiedCount += 1;

      const merged: ByotLayerRecord = {
        layerUid: matched.layerUid, name: inc.name, kind: inc.kind, visible: inc.visible,
        opacity: Math.max(0, Math.min(1, inc.opacity)), blendMode: inc.blendMode,
        pixelHashSha256: inc.pixelHashSha256, exportable: inc.exportable ?? true,
        locked: inc.locked ?? false, parentUid: inc.parentUid ?? matched.parentUid,
      };
      reconciledLayers.push(merged);
      diffEntries.push({ layerUid: merged.layerUid, previousName: matched.name, currentName: merged.name, status, uidPreserved: true, uidFallbackMatched, pixelChanged, exportable: merged.exportable });
    } else {
      addedCount += 1;
      const assignedUid = inc.layerUid?.trim() || `ext-${session.sourceTool}-${sha256Hex(`${inc.name}:${inc.pixelHashSha256}:${idx}`).slice(0, 12)}`;
      const added: ByotLayerRecord = {
        layerUid: assignedUid, name: inc.name, kind: inc.kind, visible: inc.visible,
        opacity: Math.max(0, Math.min(1, inc.opacity)), blendMode: inc.blendMode,
        pixelHashSha256: inc.pixelHashSha256, exportable: inc.exportable ?? true,
        locked: inc.locked ?? false, parentUid: inc.parentUid,
      };
      reconciledLayers.push(added);
      diffEntries.push({ layerUid: added.layerUid, previousName: null, currentName: added.name, status: "added-external", uidPreserved: Boolean(inc.layerUid), uidFallbackMatched: false, pixelChanged: true, exportable: added.exportable });
    }
  }

  let removedCount = 0;
  for (const [uid, prev] of baselineByUid.entries()) {
    if (matchedUids.has(uid)) continue;
    removedCount += 1;
    diffEntries.push({ layerUid: uid, previousName: prev.name, currentName: prev.name, status: "removed-external", uidPreserved: false, uidFallbackMatched: false, pixelChanged: true, exportable: prev.exportable });
  }

  const redlineRequired = session.enabledModules.includes("nonprint-redline-review") || Boolean(baselineRedline);
  let redlinePreserved = false;
  if (redlineRequired) {
    const pinned = buildNonPrintRedlineLayer(baselineRedline);
    reconciledLayers.push(pinned);
    redlinePreserved = true;
    if (redlineExportFlagTainted) warnings.push("nonprint-redline-export-flag-reset-to-false");
    diffEntries.push({ layerUid: pinned.layerUid, previousName: baselineRedline?.name ?? null, currentName: pinned.name, status: "preserved-nonprint-redline", uidPreserved: true, uidFallbackMatched: false, pixelChanged: false, exportable: false });
  }

  const nextGeneration = session.roundtripGeneration + 1;
  const nextSession: ByotRoundtripSession = {
    ...session, layers: reconciledLayers, roundtripGeneration: nextGeneration,
    manifestSha256: computeManifestSha256(session.workId, session.episodeId, session.cutId, session.sourceTool, nextGeneration, reconciledLayers, session.externalAssets),
    updatedAtIso: options?.updatedAtIso ?? "2026-11-23T10:35:00+09:00",
  };
  return {
    nextSession, diffEntries, warnings,
    summary: {
      roundtripGeneration: nextGeneration, totalLayers: reconciledLayers.length, preservedUidCount,
      renamedButPreservedCount, modifiedCount, addedCount, removedCount, fallbackMatchCount, redlinePreserved,
      redlineNonExportableEnforced: redlineRequired ? reconciledLayers.every((l) => l.name !== NONPRINT_REDLINE_LAYER_NAME || !l.exportable) : true,
      losslessRoundtripOk: fallbackMatchCount === 0 && (!redlineRequired || redlinePreserved),
    },
  };
}

// 3. Blender / SketchUp / Figma / 클라우드 에셋 SHA-256 변경 감지 + Rights BOM 상속
export function reconcileExternalAssetChanges(
  baselineAssets: readonly ExternalLinkedAsset[],
  scannedSnapshots: readonly ExternalAssetSnapshot[],
  evaluatedAtIso = "2026-11-23T10:40:00+09:00",
): ExternalAssetReconcileReport {
  const baselineById = new Map<string, ExternalLinkedAsset>(baselineAssets.map((a) => [a.assetId, a]));
  const seenIds = new Set<string>();
  const entries: ExternalAssetChangeEntry[] = [];
  const updatedAssets: ExternalLinkedAsset[] = [];
  const modifiedAssetIds: string[] = []; const addedAssetIds: string[] = [];
  const missingAssetIds: string[] = []; const blockingAssetIds: string[] = [];
  const attributions = new Set<string>();

  for (const snap of scannedSnapshots) {
    seenIds.add(snap.assetId);
    const currentSha256 = snap.contentSha256 ?? sha256Hex(snap.contentDigestSeed ?? snap.storageUri);
    const prev = baselineById.get(snap.assetId);
    const parent = snap.parentAssetId ? baselineById.get(snap.parentAssetId) : prev;
    let rightsBom: RightsBomMetadata;
    let licenseDowngradeBlocked = false;

    if (parent) {
      rightsBom = inheritRightsBomTags(parent.rightsBom, evaluatedAtIso);
      if (snap.claimedLicenseCode && snap.claimedLicenseCode !== parent.rightsBom.licenseCode) licenseDowngradeBlocked = true;
    } else {
      const code = snap.claimedLicenseCode ?? "UNKNOWN";
      const commercialAllowed = code === "CC0" || code === "CC-BY" || code === "CC-BY-SA" || code === "COMMERCIAL-PERPETUAL" || code === "COMMERCIAL-RENTAL";
      const attributionRequired = code === "CC-BY" || code === "CC-BY-SA";
      rightsBom = {
        licenseCode: code, commercialAllowed, attributionRequired, originAssetId: snap.assetId, inheritedFromParent: false,
        evaluatedTags: evaluateRightsBomTags({ licenseCode: code, commercialAllowed, attributionRequired, evaluatedAtIso }),
      };
    }

    const changeKind: ExternalAssetChangeEntry["changeKind"] = !prev ? "added" : prev.contentSha256 === currentSha256 ? "unchanged" : "modified";
    if (changeKind === "modified") modifiedAssetIds.push(snap.assetId);
    if (changeKind === "added") addedAssetIds.push(snap.assetId);
    const commercialPublishAllowed = isRightsBomCommercialPublishAllowed(rightsBom.evaluatedTags);
    if (!commercialPublishAllowed) blockingAssetIds.push(snap.assetId);
    if (rightsBom.attributionRequired && rightsBom.attributionText) attributions.add(rightsBom.attributionText);

    entries.push({ assetId: snap.assetId, name: snap.name, changeKind, previousSha256: prev?.contentSha256 ?? null, currentSha256, rightsBom, licenseDowngradeBlocked, commercialPublishAllowed });
    updatedAssets.push({
      assetId: snap.assetId, name: snap.name, sourceTool: snap.sourceTool, storageBackend: snap.storageBackend,
      storageUri: snap.storageUri, contentSha256: currentSha256, rightsBom,
      derivedCutIds: snap.derivedCutIds ?? prev?.derivedCutIds ?? [], updatedAtIso: snap.scannedAtIso ?? evaluatedAtIso,
    });
  }

  for (const prev of baselineAssets) {
    if (seenIds.has(prev.assetId)) continue;
    missingAssetIds.push(prev.assetId);
    const bom = inheritRightsBomTags(prev.rightsBom, evaluatedAtIso);
    const commercialPublishAllowed = isRightsBomCommercialPublishAllowed(bom.evaluatedTags);
    if (!commercialPublishAllowed) blockingAssetIds.push(prev.assetId);
    entries.push({ assetId: prev.assetId, name: prev.name, changeKind: "missing", previousSha256: prev.contentSha256, currentSha256: null, rightsBom: bom, licenseDowngradeBlocked: false, commercialPublishAllowed });
  }

  return {
    evaluatedAtIso, totalAssets: entries.length, modifiedAssetIds, addedAssetIds, missingAssetIds,
    commercialPublishReady: blockingAssetIds.length === 0 && missingAssetIds.length === 0,
    blockingAssetIds, requiredAttributions: [...attributions], entries, updatedAssets,
  };
}

// 4. 오픈 플러그인 · Wasm 샌드박스 확장 매니페스트 검증기 (최소 권한 원칙)
const ALLOWED_SCOPE_SET = new Set<string>(ALLOWED_PLUGIN_SCOPES);
const SEMVER_REGEX = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const PLUGIN_ID_REGEX = /^[a-z0-9]+(?:[.-][a-z0-9]+){1,6}$/;
const ALLOWED_RUNTIMES = new Set(["wasm-sandbox-v1", "worker-isolated-v1"]);
const ALLOWED_NETWORK_POLICIES = new Set(["none", "declared-connector-only"]);

export function validateOpenPluginManifest(manifest: OpenPluginManifest): PluginManifestValidationResult {
  const errors: string[] = []; const warnings: string[] = [];
  const grantedScopes: AllowedPluginScope[] = []; const deniedScopes: string[] = [];

  if (!PLUGIN_ID_REGEX.test(manifest.id)) errors.push("invalid-plugin-id");
  if (!manifest.name.trim()) errors.push("missing-plugin-name");
  if (!SEMVER_REGEX.test(manifest.version)) errors.push("invalid-semver");
  if (!ALLOWED_RUNTIMES.has(manifest.runtime)) errors.push(`unsupported-runtime:${manifest.runtime}`);
  if (!manifest.entryModule.trim() || manifest.entryModule.includes("..") || /^https?:\/\//i.test(manifest.entryModule)) errors.push("unsafe-entry-module-path");
  if (!Number.isFinite(manifest.memoryLimitMb) || manifest.memoryLimitMb <= 0 || manifest.memoryLimitMb > MAX_PLUGIN_MEMORY_MB) errors.push(`memory-limit-out-of-range:1..${MAX_PLUGIN_MEMORY_MB}MB`);
  if (!Number.isFinite(manifest.cpuTimeoutMs) || manifest.cpuTimeoutMs < 50 || manifest.cpuTimeoutMs > MAX_PLUGIN_CPU_TIMEOUT_MS) errors.push(`cpu-timeout-out-of-range:50..${MAX_PLUGIN_CPU_TIMEOUT_MS}ms`);
  if (!ALLOWED_NETWORK_POLICIES.has(manifest.networkPolicy)) errors.push(`forbidden-network-policy:${manifest.networkPolicy}`);
  if (manifest.secretAccess !== "forbidden") errors.push(`forbidden-secret-access:${manifest.secretAccess}`);
  if (manifest.wasmSha256 !== undefined && !/^[0-9a-f]{64}$/i.test(manifest.wasmSha256)) errors.push("invalid-wasm-sha256");

  if (!Array.isArray(manifest.permissions) || manifest.permissions.length === 0) {
    errors.push("empty-permissions");
  } else {
    const seen = new Set<string>();
    for (const rawScope of manifest.permissions) {
      const scope = rawScope.trim();
      if (!scope || seen.has(scope)) continue;
      seen.add(scope);
      if (ALLOWED_SCOPE_SET.has(scope)) grantedScopes.push(scope as AllowedPluginScope);
      else { deniedScopes.push(scope); errors.push(`denied-permission-scope:${scope}`); }
    }
  }

  if (manifest.networkPolicy === "declared-connector-only" && !grantedScopes.includes("tracker:sync")) warnings.push("declared-connector-policy-without-tracker-sync-scope");
  if (manifest.runtime === "wasm-sandbox-v1" && !manifest.wasmSha256) warnings.push("missing-wasm-sha256-integrity-digest");

  const valid = errors.length === 0;
  const securityGrade: PluginManifestValidationResult["securityGrade"] = !valid ? "rejected" : warnings.length > 0 || grantedScopes.includes("tracker:sync") ? "restricted-review" : "verified-sandbox";
  return {
    valid, securityGrade, grantedScopes, deniedScopes, errors, warnings,
    effectiveMemoryLimitMb: Math.min(MAX_PLUGIN_MEMORY_MB, Math.max(0, Math.round(manifest.memoryLimitMb || 0))),
    effectiveCpuTimeoutMs: Math.min(MAX_PLUGIN_CPU_TIMEOUT_MS, Math.max(0, Math.round(manifest.cpuTimeoutMs || 0))),
  };
}

export function parseAndValidatePluginManifestJson(
  rawJson: string,
): { readonly parsed: OpenPluginManifest | null; readonly result: PluginManifestValidationResult } {
  try {
    const c = JSON.parse(rawJson) as Partial<OpenPluginManifest>;
    if (!c || typeof c !== "object" || Array.isArray(c)) throw new Error("not-object");
    const parsed: OpenPluginManifest = {
      id: typeof c.id === "string" ? c.id : "", name: typeof c.name === "string" ? c.name : "",
      version: typeof c.version === "string" ? c.version : "", author: typeof c.author === "string" ? c.author : "",
      runtime: typeof c.runtime === "string" ? c.runtime : "", entryModule: typeof c.entryModule === "string" ? c.entryModule : "",
      permissions: Array.isArray(c.permissions) ? c.permissions.filter((i): i is string => typeof i === "string") : [],
      memoryLimitMb: typeof c.memoryLimitMb === "number" ? c.memoryLimitMb : 0,
      cpuTimeoutMs: typeof c.cpuTimeoutMs === "number" ? c.cpuTimeoutMs : 0,
      networkPolicy: typeof c.networkPolicy === "string" ? c.networkPolicy : "",
      secretAccess: typeof c.secretAccess === "string" ? c.secretAccess : "",
      ...(typeof c.wasmSha256 === "string" ? { wasmSha256: c.wasmSha256 } : {}),
    };
    return { parsed, result: validateOpenPluginManifest(parsed) };
  } catch {
    return {
      parsed: null,
      result: { valid: false, securityGrade: "rejected", grantedScopes: [], deniedScopes: [], errors: ["invalid-manifest-json"], warnings: [], effectiveMemoryLimitMb: 0, effectiveCpuTimeoutMs: 0 },
    };
  }
}

// 5. 에셋 스토어·플랫폼 출판 커넥터 매트릭스 & 기본 샘플 데이터
export const ECOSYSTEM_CONNECTOR_MATRIX: readonly EcosystemConnectorMatrixRow[] = [
  { id: "csp-psd-roundtrip", category: "drawing-3d", nameKo: "Clip Studio Paint / Photoshop", nameEn: "Clip Studio Paint / Photoshop", formatsOrProtocol: ".psd · .clip · XMP LayerUID", mode: "local-roundtrip", rightsBomAware: true, noteKo: "드로잉은 외부 툴 유지 · 비출력 레드라인(99)과 자동 QA만 선택 연결", noteEn: "Keep drawing in external tool; attach non-print redline (99) & Auto QA optionally" },
  { id: "procreate-ipad-bridge", category: "drawing-3d", nameKo: "Procreate (iPad)", nameEn: "Procreate (iPad)", formatsOrProtocol: ".procreate · .psd · LayerUID", mode: "local-roundtrip", rightsBomAware: true, noteKo: "아이패드 콘티·선화를 컷별 레이어 UID 매핑으로 무손실 합류", noteEn: "Losslessly merge iPad roughs/lineart with per-cut layer UID tracking" },
  { id: "blender-sketchup-3d", category: "drawing-3d", nameKo: "Blender / SketchUp / Figma", nameEn: "Blender / SketchUp / Figma", formatsOrProtocol: ".glb · .skp · .svg · SHA-256", mode: "local-roundtrip", rightsBomAware: true, noteKo: "배경 3D 변경 해시 자동 감지 및 파생 컷 Rights BOM 자동 상속", noteEn: "Detects 3D background hash drift and propagates Rights BOM tags automatically" },
  { id: "cloud-storage-bom", category: "storage-assets", nameKo: "Google Drive · Dropbox · AWS S3/R2", nameEn: "Google Drive · Dropbox · AWS S3/R2", formatsOrProtocol: "Content SHA-256 · Sidecar BOM", mode: "dry-run-adapter", rightsBomAware: true, noteKo: "외부 클라우드 폴더 에셋의 해시 스냅샷 및 라이선스 출처 추적", noteEn: "Tracks SHA-256 snapshots and license provenance on external cloud folders" },
  { id: "asset-store-bom", category: "storage-assets", nameKo: "ACON3D · Sketchfab · Booth 에셋 BOM", nameEn: "ACON3D · Sketchfab · Booth Asset BOM", formatsOrProtocol: "SPDX / Commercial / Rental Tag", mode: "bom-tag-import", rightsBomAware: true, noteKo: "구매·대여 에셋의 상업/귀속/만료 조건을 컷 출고 게이트와 연결", noteEn: "Links commercial/attribution/rental expiry rules to the cut export gate" },
  { id: "webtoon-publish-pack", category: "publishing-platform", nameKo: "네이버·카카오·리디·Tapas·인쇄 단행본", nameEn: "Naver · Kakao · Ridi · Tapas · Print", formatsOrProtocol: "Smart Slice · CMYK/PDF/EPUB", mode: "slice-preset", rightsBomAware: true, noteKo: "외부 툴 원고도 0-Defect 슬라이스·Rights BOM 통과 후 규격 일괄 패키징", noteEn: "Packages external-tool manuscripts via 0-Defect slicing & Rights BOM checks" },
];

export const DEFAULT_BYOT_LAYERS: readonly ByotLayerRecord[] = [
  { layerUid: "uid-bg3d-hallway-01", name: "01_BG_3D_Hallway_NPR", kind: "3d-linked", visible: true, opacity: 1, blendMode: "normal", pixelHashSha256: sha256Hex("cut07:bg3d:v1"), exportable: true, locked: false },
  { layerUid: "uid-char-lineart-02", name: "02_Char_Lineart_CSP", kind: "vector", visible: true, opacity: 1, blendMode: "normal", pixelHashSha256: sha256Hex("cut07:lineart:v1"), exportable: true, locked: false },
  { layerUid: "uid-char-flat-03", name: "03_Char_FlatColor", kind: "raster", visible: true, opacity: 1, blendMode: "normal", pixelHashSha256: sha256Hex("cut07:flat:v1"), exportable: true, locked: false },
  { layerUid: "uid-lettering-balloon-04", name: "04_Speech_Balloons", kind: "text", visible: true, opacity: 1, blendMode: "normal", pixelHashSha256: sha256Hex("cut07:balloon:v1"), exportable: true, locked: false },
];

export const DEFAULT_EXTERNAL_LINKED_ASSETS: readonly ExternalLinkedAsset[] = [
  {
    assetId: "asset-blender-hallway", name: "academy_corridor_night.glb", sourceTool: "blender", storageBackend: "s3-r2",
    storageUri: "r2://studio-assets/bg3d/academy_corridor_night.glb", contentSha256: sha256Hex("blender:academy_corridor_night:v1"),
    rightsBom: { licenseCode: "COMMERCIAL-PERPETUAL", commercialAllowed: true, attributionRequired: false, originAssetId: "asset-blender-hallway", inheritedFromParent: false, evaluatedTags: ["COMMERCIAL_OK"] },
    derivedCutIds: ["cut-07", "cut-08"], updatedAtIso: "2026-11-22T14:00:00+09:00",
  },
  {
    assetId: "asset-sketchup-chandelier", name: "vintage_chandelier_ref.skp", sourceTool: "sketchup", storageBackend: "google-drive",
    storageUri: "gdrive://ep14-refs/vintage_chandelier_ref.skp", contentSha256: sha256Hex("sketchup:chandelier:v1"),
    rightsBom: { licenseCode: "CC-BY", commercialAllowed: true, attributionRequired: true, attributionText: "Atelier Props Studio (CC-BY 4.0)", originAssetId: "asset-sketchup-chandelier", inheritedFromParent: false, evaluatedTags: ["COMMERCIAL_OK", "ATTRIBUTION_REQUIRED"] },
    derivedCutIds: ["cut-07"], updatedAtIso: "2026-11-22T15:30:00+09:00",
  },
];

export const SAMPLE_SAFE_PLUGIN_MANIFEST: OpenPluginManifest = {
  id: "com.moonlight.csp-redline-qa-bridge", name: "CSP Redline & Pinhole QA Helper", version: "1.2.0",
  author: "Moonlight Open Tools", runtime: "wasm-sandbox-v1", entryModule: "dist/csp-redline-qa.wasm",
  permissions: ["canvas:read", "qa:annotate"], memoryLimitMb: 64, cpuTimeoutMs: 1200,
  networkPolicy: "none", secretAccess: "forbidden", wasmSha256: sha256Hex("csp-redline-qa-wasm-v1.2.0"),
  descriptionKo: "외부 CSP PSD의 핀홀과 비출력 레드라인 좌표만 읽기 전용으로 주석 처리합니다.",
  descriptionEn: "Annotates pinholes and non-print redline coordinates on external CSP PSD cuts.",
};

export const SAMPLE_UNSAFE_PLUGIN_MANIFEST: OpenPluginManifest = {
  id: "com.untrusted.wildcard-exfiltrator", name: "Unverified Unrestricted Exporter", version: "0.9",
  author: "Unknown", runtime: "host-eval", entryModule: "https://evil.example/payload.js",
  permissions: ["canvas:read", "secrets:read", "network:unrestricted", "*"],
  memoryLimitMb: 512, cpuTimeoutMs: 12000, networkPolicy: "unrestricted", secretAccess: "read-env",
};
