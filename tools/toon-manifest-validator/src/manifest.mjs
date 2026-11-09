import { ERROR_CODES } from './schema.mjs';
import {
  computeFileSha256,
  computeStringSha256,
  formatStudioChecksum,
  parseExpectedSha256,
  validateProject,
} from './validator.mjs';
import { resolveSafeFixtureFilePath } from './pathSafety.mjs';

/**
 * Deterministic lexicographical string comparison (code point order, locale-independent).
 */
export function compareStringsCodePoint(a, b) {
  const sa = String(a ?? '');
  const sb = String(b ?? '');
  if (sa < sb) return -1;
  if (sa > sb) return 1;
  return 0;
}

/**
 * Deterministic canonical JSON serializer: recursively sorts all object keys
 * in code point order so identical logical structures always produce the exact same bytes.
 */
export function canonicalizeValue(value) {
  if (value === null || typeof value !== 'object') {
    return value;
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
              title: pn.title.trim(),
              dialogue: typeof pn.dialogue === 'string' ? pn.dialogue : '',
              assetIds: [...pn.assetIds],
              assets: orderedAssetRefs,
            };
          });

        return {
          id: sc.id,
          order: sc.order,
          episodeId: ep.id,
          title: sc.title.trim(),
          panelCount: scPanels.length,
          panels: scPanels,
        };
      });

    return {
      id: ep.id,
      order: ep.order,
      projectId: ep.projectId,
      title: ep.title.trim(),
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
 * and checks internal cryptographic hash consistency.
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

  // 1. Verify each asset on disk in fixtureDir
  for (const asset of manifest.assets) {
    const resolved = resolveSafeFixtureFilePath(fixtureDir, asset.normalizedPath);
    if (!resolved.safe) {
      errors.push({
        code: resolved.code,
        entityId: asset.id,
        path: asset.normalizedPath,
        message: resolved.message,
      });
      continue;
    }

    if (asset.sizeBytes !== null && resolved.sizeBytes !== asset.sizeBytes) {
      errors.push({
        code: ERROR_CODES.MANIFEST_ASSET_SIZE_MISMATCH,
        entityId: asset.id,
        path: asset.normalizedPath,
        message: `Size mismatch for "${asset.normalizedPath}": manifest expected ${asset.sizeBytes} bytes, found ${resolved.sizeBytes} bytes.`,
      });
    }

    const actualSha256 = computeFileSha256(resolved.resolvedPath);
    const expectedHex = parseExpectedSha256(asset.sha256 ?? asset.checksum);
    if (expectedHex !== actualSha256) {
      errors.push({
        code: ERROR_CODES.MANIFEST_ASSET_TAMPERED,
        entityId: asset.id,
        path: asset.normalizedPath,
        message: `SHA-256 mismatch for "${asset.normalizedPath}": manifest expected ${expectedHex}, actual is ${actualSha256}.`,
      });
    }
  }

  // 2. Verify assetTreeHash and manifestContentHash
  const assetTreeLines = manifest.assets
    .map((a) => `${a.normalizedPath}:${a.sizeBytes ?? 0}:${a.sha256 ?? ''}`)
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
