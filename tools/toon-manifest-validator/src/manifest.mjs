import { ERROR_CODES } from './schema.mjs';
import {
  computeFileSha256,
  computeStringSha256,
  formatStudioChecksum,
  parseExpectedSha256,
  validateProject,
} from './validator.mjs';
import {
  inspectAndNormalizeAssetPath,
  resolveSafeFixtureFilePath,
} from './pathSafety.mjs';

/**
 * Deterministic lexicographical string comparison in true Unicode code point order
 * (locale-independent across all operating systems and JS runtimes).
 */
export function compareStringsCodePoint(a, b) {
  const sa = String(a ?? '');
  const sb = String(b ?? '');
  if (sa === sb) return 0;
  const iterA = sa[Symbol.iterator]();
  const iterB = sb[Symbol.iterator]();
  while (true) {
    const nextA = iterA.next();
    const nextB = iterB.next();
    if (nextA.done && nextB.done) return 0;
    if (nextA.done) return -1;
    if (nextB.done) return 1;
    const cpA = nextA.value.codePointAt(0);
    const cpB = nextB.value.codePointAt(0);
    if (cpA !== cpB) return cpA < cpB ? -1 : 1;
  }
}

/**
 * Deterministic canonical JSON serializer: recursively sorts all object keys
 * in Unicode code point order and normalizes `-0` / `toJSON` values so identical
 * logical structures always produce the exact same bytes.
 */
export function canonicalizeValue(value) {
  if (value === null || typeof value !== 'object') {
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value.toJSON === 'function') {
    return canonicalizeValue(value.toJSON());
  }
  if (Array.isArray(value)) {
    return value.map(canonicalizeValue);
  }
  const sortedKeys = Object.keys(value).sort(compareStringsCodePoint);
  const result = {};
  for (const key of sortedKeys) {
    if (value[key] !== undefined) {
      result[key] = canonicalizeValue(value[key]);
    }
  }
  return result;
}

export function canonicalJsonStringify(value, indent = 2) {
  return JSON.stringify(canonicalizeValue(value), null, indent);
}

/**
 * Builds a deterministic, reproducible Export Manifest AND a ToonStudio-compatible
 * `StudioArchiveManifest` (`apps/web/src/domains/creator/studio-archive-manifest.ts`)
 * from a validated project.
 */
export function generateExportManifest(rawProject, options = {}) {
  const validation = validateProject(rawProject, options);
  if (!validation.valid) {
    return {
      ok: false,
      validation,
      manifest: null,
    };
  }

  const { normalizedData } = validation;
  const assetMap = new Map(normalizedData.assets.map((a) => [a.id, a]));

  // Sort episodes deterministically by order ASC, then id ASC
  const sortedEpisodes = [...normalizedData.episodes].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return compareStringsCodePoint(a.id, b.id);
  });

  // Sort scenes by order ASC, then id ASC
  const sortedScenes = [...normalizedData.scenes].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return compareStringsCodePoint(a.id, b.id);
  });

  // Sort panels by order ASC, then id ASC
  const sortedPanels = [...normalizedData.panels].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return compareStringsCodePoint(a.id, b.id);
  });

  const manifestEpisodes = sortedEpisodes.map((ep) => {
    const epScenes = sortedScenes
      .filter((sc) => sc.episodeId === ep.id)
      .map((sc) => {
        const scPanels = sortedPanels
          .filter((pn) => pn.sceneId === sc.id)
          .map((pn) => {
            const orderedAssetRefs = [...pn.assetIds].map((assetId) => {
              const assetRec = assetMap.get(assetId);
              return {
                assetId,
                normalizedPath: assetRec.normalizedPath,
                sha256: assetRec.sha256,
                checksum: assetRec.checksum,
              };
            });
            return {
              id: pn.id,
              order: pn.order,
              sceneId: sc.id,
              title: pn.title.trim().normalize('NFC'),
              dialogue: typeof pn.dialogue === 'string' ? pn.dialogue.normalize('NFC') : '',
              assetIds: [...pn.assetIds],
              assets: orderedAssetRefs,
            };
          });

        return {
          id: sc.id,
          order: sc.order,
          episodeId: ep.id,
          title: sc.title.trim().normalize('NFC'),
          panelCount: scPanels.length,
          panels: scPanels,
        };
      });

    return {
      id: ep.id,
      order: ep.order,
      projectId: ep.projectId,
      title: ep.title.trim().normalize('NFC'),
      sceneCount: epScenes.length,
      scenes: epScenes,
    };
  });

  // Deterministic asset table sorted by normalizedPath ASC, then id ASC
  const manifestAssets = [...normalizedData.assets]
    .map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      originalPath: a.originalPath,
      normalizedPath: a.normalizedPath,
      extension: a.extension,
      sizeBytes: a.sizeBytes,
      sha256: a.sha256,
      checksum: a.checksum,
      referencedByPanels: [...a.referencedByPanels].sort(compareStringsCodePoint),
    }))
    .sort((a, b) => {
      const cmpPath = compareStringsCodePoint(a.normalizedPath, b.normalizedPath);
      if (cmpPath !== 0) return cmpPath;
      return compareStringsCodePoint(a.id, b.id);
    });

  const totalBytes = manifestAssets.reduce((acc, a) => acc + (a.sizeBytes ?? 0), 0);

  // Compute deterministic assetTreeHash from sorted asset records
  const assetTreeLines = manifestAssets
    .map((a) => `${a.normalizedPath}:${a.sizeBytes ?? 0}:${a.sha256 ?? ''}`)
    .join('\n');
  const assetTreeHash = computeStringSha256(assetTreeLines);

  // Build ToonStudio-compatible `StudioArchiveManifest` structure (`studio-archive-manifest.ts`)
  const studioArchiveFiles = manifestAssets.map((a) => ({
    path: a.normalizedPath,
    kind: a.type === 'document' ? 'document' : 'asset',
    sizeBytes: a.sizeBytes ?? 0,
    checksum: a.checksum ?? formatStudioChecksum('0'.repeat(64)),
    required: true,
  }));

  const studioArchiveManifest = {
    schemaVersion: 1,
    applicationVersion: '1.0.0',
    projectId: normalizedData.project.id,
    createdAt: normalizedData.project.createdAt,
    rootDocumentPaths: studioArchiveFiles.length > 0 ? [studioArchiveFiles[0].path] : [],
    files: studioArchiveFiles,
    dependencies: [],
  };

  const manifestCore = {
    manifestVersion: '1.0.0',
    schemaVersion: normalizedData.schemaVersion,
    project: {
      id: normalizedData.project.id,
      title: normalizedData.project.title,
      author: normalizedData.project.author,
    },
    summary: {
      episodeCount: manifestEpisodes.length,
      sceneCount: sortedScenes.length,
      panelCount: sortedPanels.length,
      assetCount: manifestAssets.length,
      totalBytes,
    },
    episodes: manifestEpisodes,
    assets: manifestAssets,
    studioArchiveManifest,
  };

  const manifestContentHash = computeStringSha256(canonicalJsonStringify(manifestCore, 0));

  const manifest = {
    ...manifestCore,
    integrity: {
      algorithm: 'SHA-256',
      assetTreeHash,
      manifestContentHash,
      checksum: formatStudioChecksum(manifestContentHash),
    },
  };

  return {
    ok: true,
    validation,
    manifest,
  };
}

/**
 * Verifies an existing Export Manifest against the physical files in `fixtureDir`
 * via a 3-stage barrier: ALL static path, canonical ordering, normalization collision,
 * and symlink containment checks complete across ALL manifest entries BEFORE any file is read.
 */
export function verifyExportManifest(manifest, fixtureDir) {
  const errors = [];

  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.assets)) {
    errors.push({
      code: ERROR_CODES.INVALID_ROOT_OBJECT,
      message: 'Invalid manifest object structure.',
    });
    return { verified: false, errors };
  }

  const seenCanonicalKeys = new Map();
  const stagedEntries = [];
  let hasStaticOrCollisionError = false;

  // Stage 1: Canonical sort order check
  for (let i = 1; i < manifest.assets.length; i++) {
    const prev = manifest.assets[i - 1];
    const curr = manifest.assets[i];
    const cmpPath = compareStringsCodePoint(prev?.normalizedPath, curr?.normalizedPath);
    const cmpOrder = cmpPath !== 0 ? cmpPath : compareStringsCodePoint(prev?.id, curr?.id);
    if (cmpOrder > 0) {
      hasStaticOrCollisionError = true;
      errors.push({
        code: ERROR_CODES.ARCHIVE_MANIFEST_INVALID,
        path: `assets[${i}]`,
        message: `Manifest assets are not in deterministic canonical order at "${curr?.normalizedPath}".`,
      });
      break;
    }
  }

  // Stage 2: Pure in-memory static path & cross-entry collision check across ALL entries
  for (let i = 0; i < manifest.assets.length; i++) {
    const asset = manifest.assets[i];
    if (!asset || typeof asset !== 'object') {
      hasStaticOrCollisionError = true;
      errors.push({
        code: ERROR_CODES.INVALID_COLLECTION_TYPE,
        path: `assets[${i}]`,
        message: 'Manifest asset entry must be an object.',
      });
      continue;
    }

    const inspection = inspectAndNormalizeAssetPath(asset.normalizedPath, asset.type);
    if (!inspection.valid) {
      hasStaticOrCollisionError = true;
      for (const issue of inspection.issues) {
        errors.push({
          code: issue.code,
          entityId: asset.id ?? null,
          path: asset.normalizedPath ?? `assets[${i}].normalizedPath`,
          message: issue.message,
        });
      }
      continue;
    }

    if (asset.normalizedPath !== inspection.normalizedPath) {
      hasStaticOrCollisionError = true;
      errors.push({
        code: ERROR_CODES.INVALID_RELATIVE_PATH,
        entityId: asset.id ?? null,
        path: asset.normalizedPath,
        message: `Manifest normalizedPath "${asset.normalizedPath}" is not in canonical NFC relative form ("${inspection.normalizedPath}").`,
      });
      continue;
    }

    if (seenCanonicalKeys.has(inspection.canonicalKey)) {
      hasStaticOrCollisionError = true;
      const prevAssetId = seenCanonicalKeys.get(inspection.canonicalKey);
      errors.push({
        code: ERROR_CODES.NORMALIZATION_COLLISION_PATH,
        entityId: asset.id ?? null,
        path: asset.normalizedPath,
        message: `Manifest path "${asset.normalizedPath}" collides after normalization with "${prevAssetId}".`,
      });
      continue;
    }
    seenCanonicalKeys.set(inspection.canonicalKey, asset.id ?? `(index:${i})`);
    stagedEntries.push({ asset, inspection, resolved: null });
  }

  // Stage 3: Containment & lstat/readlink verification across ALL entries (still 0 file reads)
  let hasContainmentError = false;
  if (!hasStaticOrCollisionError) {
    for (const entry of stagedEntries) {
      const resolved = resolveSafeFixtureFilePath(fixtureDir, entry.inspection.normalizedPath);
      if (!resolved.safe) {
        hasContainmentError = true;
        errors.push({
          code: resolved.code,
          entityId: entry.asset.id,
          path: entry.asset.normalizedPath,
          message: resolved.message,
        });
        continue;
      }
      entry.resolved = resolved;

      if (entry.asset.sizeBytes !== null && resolved.sizeBytes !== entry.asset.sizeBytes) {
        errors.push({
          code: ERROR_CODES.MANIFEST_ASSET_SIZE_MISMATCH,
          entityId: entry.asset.id,
          path: entry.asset.normalizedPath,
          message: `Size mismatch for "${entry.asset.normalizedPath}": manifest expected ${entry.asset.sizeBytes} bytes, found ${resolved.sizeBytes} bytes.`,
        });
      }
    }
  }

  // Stage 4: Physical file reading & SHA-256 verification ONLY after all static, collision & containment checks pass
  if (!hasStaticOrCollisionError && !hasContainmentError) {
    for (const entry of stagedEntries) {
      const actualSha256 = computeFileSha256(entry.resolved.resolvedPath);
      const expectedHex = parseExpectedSha256(entry.asset.sha256 ?? entry.asset.checksum);
      if (expectedHex !== actualSha256) {
        errors.push({
          code: ERROR_CODES.MANIFEST_ASSET_TAMPERED,
          entityId: entry.asset.id,
          path: entry.asset.normalizedPath,
          message: `SHA-256 mismatch for "${entry.asset.normalizedPath}": manifest expected ${expectedHex}, actual is ${actualSha256}.`,
        });
      }
    }
  }

  // Stage 5: Verify assetTreeHash and manifestContentHash
  const sortedForHash = [...manifest.assets].sort((a, b) => {
    const cmpPath = compareStringsCodePoint(a?.normalizedPath, b?.normalizedPath);
    if (cmpPath !== 0) return cmpPath;
    return compareStringsCodePoint(a?.id, b?.id);
  });
  const assetTreeLines = sortedForHash
    .map((a) => `${a?.normalizedPath ?? ''}:${a?.sizeBytes ?? 0}:${a?.sha256 ?? ''}`)
    .join('\n');
  const expectedAssetTreeHash = computeStringSha256(assetTreeLines);

  if (manifest.integrity?.assetTreeHash !== expectedAssetTreeHash) {
    errors.push({
      code: ERROR_CODES.MANIFEST_HASH_MISMATCH,
      path: 'integrity.assetTreeHash',
      message: `Manifest assetTreeHash mismatch: expected ${expectedAssetTreeHash}, found ${manifest.integrity?.assetTreeHash}.`,
    });
  }

  const { integrity, ...manifestCore } = manifest;
  const expectedContentHash = computeStringSha256(canonicalJsonStringify(manifestCore, 0));
  if (integrity?.manifestContentHash !== expectedContentHash) {
    errors.push({
      code: ERROR_CODES.MANIFEST_HASH_MISMATCH,
      path: 'integrity.manifestContentHash',
      message: `Manifest content hash mismatch: expected ${expectedContentHash}, found ${integrity?.manifestContentHash}.`,
    });
  }

  return {
    verified: errors.length === 0,
    errors,
  };
}
