import {
  SUPPORTED_SCHEMA_VERSIONS,
  ERROR_CODES,
} from './schema.mjs';
import {
  inspectAndNormalizeAssetPath,
  resolveSafeFixtureFilePath,
} from './pathSafety.mjs';
import {
  computeFileSha256,
  computeStringSha256,
  formatStudioChecksum,
  parseExpectedSha256,
  isNonEmptyString,
  validateId,
  normalizeProjectCollections,
} from './projectNormalizer.mjs';

export {
  computeFileSha256,
  computeStringSha256,
  formatStudioChecksum,
  parseExpectedSha256,
  normalizeProjectCollections,
};

export function validateProject(rawInput, options = {}) {
  const {
    fixtureDir = null,
    requireAllAssetsReferenced = true,
    verifyFiles = true,
  } = options;

  const errors = [];
  const warnings = [];

  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    errors.push({
      code: ERROR_CODES.INVALID_ROOT_OBJECT,
      entityType: 'root',
      entityId: null,
      path: '$',
      message: 'Project root must be a non-null JSON object.',
    });
    return { valid: false, errors, warnings, normalizedData: null };
  }

  const data = normalizeProjectCollections(rawInput);
  errors.push(...data.graphIntegrityIssues);

  // 1. Schema version check
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(data.schemaVersion)) {
    errors.push({
      code: ERROR_CODES.UNSUPPORTED_SCHEMA_VERSION,
      entityType: 'root',
      entityId: null,
      path: 'schemaVersion',
      message: `Unsupported or missing schemaVersion "${data.schemaVersion}". Expected one of: ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}.`,
    });
  }

  // 2. Project metadata check
  const project = data.project;
  let projectId = null;
  if (!project || typeof project !== 'object' || Array.isArray(project)) {
    errors.push({
      code: ERROR_CODES.MISSING_PROJECT_META,
      entityType: 'project',
      entityId: null,
      path: 'project',
      message: 'Missing or invalid "project" metadata object.',
    });
  } else {
    if (validateId(project.id, 'project', 0, errors)) {
      projectId = project.id;
    }
    if (!isNonEmptyString(project.title)) {
      errors.push({
        code: ERROR_CODES.EMPTY_PROJECT_TITLE,
        entityType: 'project',
        entityId: project.id ?? null,
        path: 'project.title',
        message: 'Project title must be a non-empty string.',
      });
    }
  }

  // 3. Collection type checks
  for (const colName of ['episodes', 'scenes', 'panels', 'assets']) {
    if (!Array.isArray(data[colName])) {
      errors.push({
        code: ERROR_CODES.INVALID_COLLECTION_TYPE,
        entityType: colName,
        entityId: null,
        path: colName,
        message: `"${colName}" must be an array.`,
      });
    }
  }

  const episodes = Array.isArray(data.episodes) ? data.episodes : [];
  const scenes = Array.isArray(data.scenes) ? data.scenes : [];
  const panels = Array.isArray(data.panels) ? data.panels : [];
  const assets = Array.isArray(data.assets) ? data.assets : [];

  const globalIdMap = new Map(); // id -> entityType
  if (projectId) {
    globalIdMap.set(projectId, 'project');
  }

  const registerGlobalId = (id, entityType, pathStr) => {
    if (globalIdMap.has(id) && globalIdMap.get(id) !== entityType) {
      errors.push({
        code: ERROR_CODES.DUPLICATE_GLOBAL_ID,
        entityType,
        entityId: id,
        path: pathStr,
        message: `ID "${id}" in ${entityType} collides with an existing ${globalIdMap.get(id)} ID.`,
      });
    } else if (!globalIdMap.has(id)) {
      globalIdMap.set(id, entityType);
    }
  };

  // 4. Validate Episodes
  const episodeById = new Map();
  const episodeOrders = new Map(); // order -> episodeId

  episodes.forEach((ep, idx) => {
    if (!ep || typeof ep !== 'object') {
      errors.push({
        code: ERROR_CODES.INVALID_COLLECTION_TYPE,
        entityType: 'episode',
        entityId: `(index:${idx})`,
        path: `episodes[${idx}]`,
        message: 'Episode entry must be an object.',
      });
      return;
    }

    const validId = validateId(ep.id, 'episode', idx, errors);
    if (validId) {
      if (episodeById.has(ep.id)) {
        errors.push({
          code: ERROR_CODES.DUPLICATE_EPISODE_ID,
          entityType: 'episode',
          entityId: ep.id,
          path: `episodes[${idx}].id`,
          message: `Duplicate episode ID "${ep.id}".`,
        });
      } else {
        episodeById.set(ep.id, ep);
      }
      registerGlobalId(ep.id, 'episode', `episodes[${idx}].id`);
    }

    if (!isNonEmptyString(ep.title)) {
      errors.push({
        code: ERROR_CODES.EMPTY_EPISODE_TITLE,
        entityType: 'episode',
        entityId: ep.id ?? `(index:${idx})`,
        path: `episodes[${idx}].title`,
        message: `Episode "${ep.id ?? idx}" has an empty or invalid title.`,
      });
    }

    if (projectId && ep.projectId !== projectId) {
      errors.push({
        code: ERROR_CODES.REF_EPISODE_PROJECT_MISMATCH,
        entityType: 'episode',
        entityId: ep.id ?? `(index:${idx})`,
        path: `episodes[${idx}].projectId`,
        message: `Episode "${ep.id}" references projectId "${ep.projectId}", expected "${projectId}".`,
      });
    }

    if (!Number.isInteger(ep.order) || ep.order < 1) {
      errors.push({
        code: ERROR_CODES.INVALID_EPISODE_ORDER,
        entityType: 'episode',
        entityId: ep.id ?? `(index:${idx})`,
        path: `episodes[${idx}].order`,
        message: `Episode "${ep.id ?? idx}" has invalid order "${ep.order}". Order must be a positive integer >= 1.`,
      });
    } else if (episodeOrders.has(ep.order)) {
      errors.push({
        code: ERROR_CODES.DUPLICATE_EPISODE_ORDER,
        entityType: 'episode',
        entityId: ep.id ?? `(index:${idx})`,
        path: `episodes[${idx}].order`,
        message: `Duplicate episode order ${ep.order} between "${episodeOrders.get(ep.order)}" and "${ep.id}".`,
      });
    } else {
      episodeOrders.set(ep.order, ep.id);
    }
  });

  // Check episode sequential order 1..N
  if (episodes.length > 0 && episodeOrders.size === episodes.length) {
    const sortedOrders = Array.from(episodeOrders.keys()).sort((a, b) => a - b);
    for (let i = 0; i < sortedOrders.length; i++) {
      if (sortedOrders[i] !== i + 1) {
        errors.push({
          code: ERROR_CODES.NON_SEQUENTIAL_EPISODE_ORDER,
          entityType: 'episode',
          entityId: episodeOrders.get(sortedOrders[i]),
          path: 'episodes.order',
          message: `Episode orders must be sequential 1..${sortedOrders.length}, but found [${sortedOrders.join(', ')}].`,
        });
        break;
      }
    }
  }

  // 5. Validate Scenes
  const sceneById = new Map();
  const scenesByEpisode = new Map(); // episodeId -> [{ scene, idx }]

  scenes.forEach((sc, idx) => {
    if (!sc || typeof sc !== 'object') {
      errors.push({
        code: ERROR_CODES.INVALID_COLLECTION_TYPE,
        entityType: 'scene',
        entityId: `(index:${idx})`,
        path: `scenes[${idx}]`,
        message: 'Scene entry must be an object.',
      });
      return;
    }

    const validId = validateId(sc.id, 'scene', idx, errors);
    if (validId) {
      if (sceneById.has(sc.id)) {
        errors.push({
          code: ERROR_CODES.DUPLICATE_SCENE_ID,
          entityType: 'scene',
          entityId: sc.id,
          path: `scenes[${idx}].id`,
          message: `Duplicate scene ID "${sc.id}".`,
        });
      } else {
        sceneById.set(sc.id, sc);
      }
      registerGlobalId(sc.id, 'scene', `scenes[${idx}].id`);
    }

    if (!isNonEmptyString(sc.title)) {
      errors.push({
        code: ERROR_CODES.EMPTY_SCENE_TITLE,
        entityType: 'scene',
        entityId: sc.id ?? `(index:${idx})`,
        path: `scenes[${idx}].title`,
        message: `Scene "${sc.id ?? idx}" has an empty or invalid title.`,
      });
    }

    if (typeof sc.episodeId !== 'string' || !episodeById.has(sc.episodeId)) {
      errors.push({
        code: ERROR_CODES.REF_SCENE_EPISODE_MISSING,
        entityType: 'scene',
        entityId: sc.id ?? `(index:${idx})`,
        path: `scenes[${idx}].episodeId`,
        message: `Scene "${sc.id ?? idx}" references non-existent episodeId "${sc.episodeId}".`,
      });
    } else {
      if (!scenesByEpisode.has(sc.episodeId)) {
        scenesByEpisode.set(sc.episodeId, []);
      }
      scenesByEpisode.get(sc.episodeId).push({ scene: sc, idx });
    }

    if (!Number.isInteger(sc.order) || sc.order < 1) {
      errors.push({
        code: ERROR_CODES.INVALID_SCENE_ORDER,
        entityType: 'scene',
        entityId: sc.id ?? `(index:${idx})`,
        path: `scenes[${idx}].order`,
        message: `Scene "${sc.id ?? idx}" has invalid order "${sc.order}". Must be positive integer >= 1.`,
      });
    }
  });

  // Check per-episode scene ordering
  for (const [epId, scEntries] of scenesByEpisode.entries()) {
    const orderMap = new Map();
    let allValidOrders = true;
    for (const { scene: sc, idx } of scEntries) {
      if (!Number.isInteger(sc.order) || sc.order < 1) {
        allValidOrders = false;
        continue;
      }
      if (orderMap.has(sc.order)) {
        errors.push({
          code: ERROR_CODES.DUPLICATE_SCENE_ORDER,
          entityType: 'scene',
          entityId: sc.id,
          path: `scenes[${idx}].order`,
          message: `Duplicate scene order ${sc.order} in episode "${epId}" between "${orderMap.get(sc.order)}" and "${sc.id}".`,
        });
        allValidOrders = false;
      } else {
        orderMap.set(sc.order, sc.id);
      }
    }
    if (allValidOrders && orderMap.size === scEntries.length) {
      const sorted = Array.from(orderMap.keys()).sort((a, b) => a - b);
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i] !== i + 1) {
          errors.push({
            code: ERROR_CODES.NON_SEQUENTIAL_SCENE_ORDER,
            entityType: 'scene',
            entityId: orderMap.get(sorted[i]),
            path: `episodes(${epId}).scenes.order`,
            message: `Scene orders in episode "${epId}" must be sequential 1..${sorted.length}, but found [${sorted.join(', ')}].`,
          });
          break;
        }
      }
    }
  }

  // 6. Validate Assets & Normalization Collisions
  const assetById = new Map();
  const canonicalPathOwners = new Map(); // canonicalKey -> { assetId, rawPath, normalizedPath, idx }
  const normalizedAssetRecords = new Map(); // assetId -> normalized record

  assets.forEach((asset, idx) => {
    if (!asset || typeof asset !== 'object') {
      errors.push({
        code: ERROR_CODES.INVALID_COLLECTION_TYPE,
        entityType: 'asset',
        entityId: `(index:${idx})`,
        path: `assets[${idx}]`,
        message: 'Asset entry must be an object.',
      });
      return;
    }

    const validId = validateId(asset.id, 'asset', idx, errors);
    if (validId) {
      if (assetById.has(asset.id)) {
        errors.push({
          code: ERROR_CODES.DUPLICATE_ASSET_ID,
          entityType: 'asset',
          entityId: asset.id,
          path: `assets[${idx}].id`,
          message: `Duplicate asset ID "${asset.id}".`,
        });
      } else {
        assetById.set(asset.id, asset);
      }
      registerGlobalId(asset.id, 'asset', `assets[${idx}].id`);
    }

    const assetTitle = asset.title !== undefined ? asset.title : asset.label;
    if (!isNonEmptyString(assetTitle)) {
      errors.push({
        code: ERROR_CODES.EMPTY_ASSET_TITLE,
        entityType: 'asset',
        entityId: asset.id ?? `(index:${idx})`,
        path: `assets[${idx}].title`,
        message: `Asset "${asset.id ?? idx}" has an empty or invalid title.`,
      });
    }

    const rawDigestInput = asset.expectedSha256 ?? asset.contentDigest ?? asset.checksum;
    const parsedExpectedSha256 =
      rawDigestInput !== undefined ? parseExpectedSha256(rawDigestInput) : null;
    if (rawDigestInput !== undefined && parsedExpectedSha256 === null) {
      errors.push({
        code: ERROR_CODES.INVALID_EXPECTED_SHA256,
        entityType: 'asset',
        entityId: asset.id ?? `(index:${idx})`,
        path: `assets[${idx}].expectedSha256`,
        message: `Asset "${asset.id ?? idx}" has invalid SHA-256 digest "${rawDigestInput}". Expected 64 hex chars or "sha256:<64hex>".`,
      });
    }

    const rawAssetPath = asset.relativePath ?? asset.path ?? asset.displayPath;
    const pathInspection = inspectAndNormalizeAssetPath(rawAssetPath, asset.type);
    for (const issue of pathInspection.issues) {
      errors.push({
        code: issue.code,
        entityType: 'asset',
        entityId: asset.id ?? `(index:${idx})`,
        path: `assets[${idx}].relativePath`,
        message: issue.message,
      });
    }

    if (pathInspection.canonicalKey) {
      if (canonicalPathOwners.has(pathInspection.canonicalKey)) {
        const prev = canonicalPathOwners.get(pathInspection.canonicalKey);
        let collisionCode = ERROR_CODES.NORMALIZATION_COLLISION_PATH;
        if (
          prev.rawPath.normalize('NFC') !== rawAssetPath.normalize('NFC') &&
          prev.rawPath.normalize('NFC').toLowerCase() ===
            rawAssetPath.normalize('NFC').toLowerCase()
        ) {
          collisionCode = ERROR_CODES.NORMALIZATION_COLLISION_CASE;
        } else if (
          prev.rawPath !== rawAssetPath &&
          prev.rawPath.normalize('NFC') === rawAssetPath.normalize('NFC')
        ) {
          collisionCode = ERROR_CODES.NORMALIZATION_COLLISION_UNICODE;
        }

        errors.push({
          code: collisionCode,
          entityType: 'asset',
          entityId: asset.id ?? `(index:${idx})`,
          path: `assets[${idx}].relativePath`,
          message: `Asset "${asset.id}" path "${rawAssetPath}" collides after normalization ("${pathInspection.canonicalKey}") with asset "${prev.assetId}" ("${prev.rawPath}").`,
        });
      } else {
        canonicalPathOwners.set(pathInspection.canonicalKey, {
          assetId: asset.id ?? `(index:${idx})`,
          rawPath: rawAssetPath,
          normalizedPath: pathInspection.normalizedPath,
          idx,
        });
      }
    }

    // Verify physical file inside fixtureDir if requested and path passed static safety checks
    let fileVerification = null;
    if (verifyFiles && fixtureDir && pathInspection.valid) {
      const resolved = resolveSafeFixtureFilePath(fixtureDir, pathInspection.normalizedPath);
      if (!resolved.safe) {
        errors.push({
          code: resolved.code,
          entityType: 'asset',
          entityId: asset.id ?? `(index:${idx})`,
          path: `assets[${idx}].relativePath`,
          message: resolved.message,
        });
      } else {
        const actualSha256 = computeFileSha256(resolved.resolvedPath);
        if (parsedExpectedSha256 !== null && parsedExpectedSha256 !== actualSha256.toLowerCase()) {
          errors.push({
            code: ERROR_CODES.ASSET_SHA256_MISMATCH,
            entityType: 'asset',
            entityId: asset.id ?? `(index:${idx})`,
            path: `assets[${idx}].expectedSha256`,
            message: `SHA-256 mismatch for asset "${asset.id}" ("${pathInspection.normalizedPath}"): expected ${parsedExpectedSha256}, got ${actualSha256}.`,
          });
        }
        fileVerification = {
          sizeBytes: resolved.sizeBytes,
          sha256: actualSha256,
        };
      }
    }

    if (validId) {
      const finalSha256 = fileVerification?.sha256 ?? parsedExpectedSha256 ?? null;
      normalizedAssetRecords.set(asset.id, {
        id: asset.id,
        type: asset.type,
        title: typeof assetTitle === 'string' ? assetTitle.trim() : '',
        originalPath: rawAssetPath,
        normalizedPath: pathInspection.normalizedPath,
        canonicalKey: pathInspection.canonicalKey,
        extension: pathInspection.extension,
        sizeBytes: fileVerification?.sizeBytes ?? null,
        sha256: finalSha256,
        checksum: finalSha256 ? formatStudioChecksum(finalSha256) : null,
        referencedByPanels: [],
      });
    }
  });

  // 7. Validate Panels
  const panelById = new Map();
  const panelsByScene = new Map(); // sceneId -> [{ panel, idx }]

  panels.forEach((pn, idx) => {
    if (!pn || typeof pn !== 'object') {
      errors.push({
        code: ERROR_CODES.INVALID_COLLECTION_TYPE,
        entityType: 'panel',
        entityId: `(index:${idx})`,
        path: `panels[${idx}]`,
        message: 'Panel entry must be an object.',
      });
      return;
    }

    const validId = validateId(pn.id, 'panel', idx, errors);
    if (validId) {
      if (panelById.has(pn.id)) {
        errors.push({
          code: ERROR_CODES.DUPLICATE_PANEL_ID,
          entityType: 'panel',
          entityId: pn.id,
          path: `panels[${idx}].id`,
          message: `Duplicate panel ID "${pn.id}".`,
        });
      } else {
        panelById.set(pn.id, pn);
      }
      registerGlobalId(pn.id, 'panel', `panels[${idx}].id`);
    }

    if (!isNonEmptyString(pn.title)) {
      errors.push({
        code: ERROR_CODES.EMPTY_PANEL_TITLE,
        entityType: 'panel',
        entityId: pn.id ?? `(index:${idx})`,
        path: `panels[${idx}].title`,
        message: `Panel "${pn.id ?? idx}" has an empty or invalid title.`,
      });
    }

    if (typeof pn.sceneId !== 'string' || !sceneById.has(pn.sceneId)) {
      errors.push({
        code: ERROR_CODES.REF_PANEL_SCENE_MISSING,
        entityType: 'panel',
        entityId: pn.id ?? `(index:${idx})`,
        path: `panels[${idx}].sceneId`,
        message: `Panel "${pn.id ?? idx}" references non-existent sceneId "${pn.sceneId}".`,
      });
    } else {
      if (!panelsByScene.has(pn.sceneId)) {
        panelsByScene.set(pn.sceneId, []);
      }
      panelsByScene.get(pn.sceneId).push({ panel: pn, idx });
    }

    if (!Number.isInteger(pn.order) || pn.order < 1) {
      errors.push({
        code: ERROR_CODES.INVALID_PANEL_ORDER,
        entityType: 'panel',
        entityId: pn.id ?? `(index:${idx})`,
        path: `panels[${idx}].order`,
        message: `Panel "${pn.id ?? idx}" has invalid order "${pn.order}". Must be positive integer >= 1.`,
      });
    }

    if (!Array.isArray(pn.assetIds)) {
      errors.push({
        code: ERROR_CODES.INVALID_COLLECTION_TYPE,
        entityType: 'panel',
        entityId: pn.id ?? `(index:${idx})`,
        path: `panels[${idx}].assetIds`,
        message: `Panel "${pn.id ?? idx}" assetIds must be an array.`,
      });
    } else {
      const seenPanelAssets = new Set();
      pn.assetIds.forEach((assetId, aIdx) => {
        if (seenPanelAssets.has(assetId)) {
          errors.push({
            code: ERROR_CODES.DUPLICATE_PANEL_ASSET_REF,
            entityType: 'panel',
            entityId: pn.id ?? `(index:${idx})`,
            path: `panels[${idx}].assetIds[${aIdx}]`,
            message: `Panel "${pn.id}" references duplicate assetId "${assetId}".`,
          });
        }
        seenPanelAssets.add(assetId);

        if (typeof assetId !== 'string' || !assetById.has(assetId)) {
          errors.push({
            code: ERROR_CODES.REF_PANEL_ASSET_MISSING,
            entityType: 'panel',
            entityId: pn.id ?? `(index:${idx})`,
            path: `panels[${idx}].assetIds[${aIdx}]`,
            message: `Panel "${pn.id ?? idx}" references non-existent assetId "${assetId}".`,
          });
        } else if (validId && normalizedAssetRecords.has(assetId)) {
          normalizedAssetRecords.get(assetId).referencedByPanels.push(pn.id);
        }
      });
    }
  });

  // Check per-scene panel ordering
  for (const [scId, pnEntries] of panelsByScene.entries()) {
    const orderMap = new Map();
    let allValidOrders = true;
    for (const { panel: pn, idx } of pnEntries) {
      if (!Number.isInteger(pn.order) || pn.order < 1) {
        allValidOrders = false;
        continue;
      }
      if (orderMap.has(pn.order)) {
        errors.push({
          code: ERROR_CODES.DUPLICATE_PANEL_ORDER,
          entityType: 'panel',
          entityId: pn.id,
          path: `panels[${idx}].order`,
          message: `Duplicate panel order ${pn.order} in scene "${scId}" between "${orderMap.get(pn.order)}" and "${pn.id}".`,
        });
        allValidOrders = false;
      } else {
        orderMap.set(pn.order, pn.id);
      }
    }
    if (allValidOrders && orderMap.size === pnEntries.length) {
      const sorted = Array.from(orderMap.keys()).sort((a, b) => a - b);
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i] !== i + 1) {
          errors.push({
            code: ERROR_CODES.NON_SEQUENTIAL_PANEL_ORDER,
            entityType: 'panel',
            entityId: orderMap.get(sorted[i]),
            path: `scenes(${scId}).panels.order`,
            message: `Panel orders in scene "${scId}" must be sequential 1..${sorted.length}, but found [${sorted.join(', ')}].`,
          });
          break;
        }
      }
    }
  }

  // 8. Check unreferenced assets
  for (const [assetId, rec] of normalizedAssetRecords.entries()) {
    if (rec.referencedByPanels.length === 0) {
      const issue = {
        code: ERROR_CODES.UNREFERENCED_ASSET,
        entityType: 'asset',
        entityId: assetId,
        path: `assets(${assetId})`,
        message: `Asset "${assetId}" ("${rec.originalPath}") is not referenced by any panel.`,
      };
      if (requireAllAssetsReferenced) {
        errors.push(issue);
      } else {
        warnings.push(issue);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalizedData: {
      schemaVersion: data.schemaVersion,
      project: project
        ? {
            id: project.id,
            title: typeof project.title === 'string' ? project.title.trim() : '',
            author: typeof project.author === 'string' ? project.author.trim() : null,
            createdAt: typeof project.createdAt === 'string' ? project.createdAt : '2026-11-10T00:00:00.000Z',
          }
        : null,
      episodes,
      scenes,
      panels,
      assets: Array.from(normalizedAssetRecords.values()),
    },
  };
}
