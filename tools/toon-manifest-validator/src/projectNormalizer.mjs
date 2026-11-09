import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  STUDIO_SAFE_ID_PATTERN,
  SHA256_HEX_PATTERN,
  SHA256_PREFIXED_PATTERN,
  ERROR_CODES,
} from './schema.mjs';

export function computeFileSha256(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function computeStringSha256(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export function formatStudioChecksum(hex64) {
  return `sha256:${String(hex64).toLowerCase()}`;
}

export function parseExpectedSha256(rawDigest) {
  if (typeof rawDigest !== 'string') return null;
  if (SHA256_PREFIXED_PATTERN.test(rawDigest)) {
    return rawDigest.slice('sha256:'.length).toLowerCase();
  }
  if (SHA256_HEX_PATTERN.test(rawDigest)) {
    return rawDigest.toLowerCase();
  }
  return null;
}

export function isNonEmptyString(val) {
  return typeof val === 'string' && val.trim().length > 0;
}

export function validateId(id, entityType, index, errors) {
  if (typeof id !== 'string' || !STUDIO_SAFE_ID_PATTERN.test(id)) {
    errors.push({
      code: ERROR_CODES.INVALID_ID_FORMAT,
      entityType,
      entityId: String(id ?? `(index:${index})`),
      path: `${entityType}[${index}].id`,
      message: `Invalid ${entityType} ID "${id}". Must match ${STUDIO_SAFE_ID_PATTERN}.`,
    });
    return false;
  }
  return true;
}

/**
 * Supports three ToonStudio project JSON representations and normalizes them into
 * a unified relational representation `{ schemaVersion, project, episodes, scenes, panels, assets, graphIntegrityIssues }`:
 *
 * 1. `StudioProjectGraphV1` (from `packages/studio-project-model/src/graph/project-graph.ts`):
 *    - `{ version: 1, projectId, title, nodes: StudioProjectNodeV1[], assetUsages: StudioAssetUsageV1[], assets: [...] }`
 * 2. Flat Relational Project JSON:
 *    - `{ schemaVersion: "1.0.0" | 1, project: { id, title }, episodes: [...], scenes: [...], panels: [...], assets: [...] }`
 * 3. Nested Episode->Scene->Panel Tree JSON:
 *    - `{ schemaVersion: "1.0.0" | 1, project: { id, title }, episodes: [{ ..., scenes: [{ ..., panels: [...] }] }], assets: [...] }`
 */
export function normalizeProjectCollections(raw) {
  const graphIntegrityIssues = [];

  // Case 1: Native StudioProjectGraphV1 (`nodes` array present with `version` or `projectId`)
  if (Array.isArray(raw.nodes) && (raw.version !== undefined || raw.projectId !== undefined)) {
    const schemaVersion = raw.schemaVersion ?? raw.version;
    const project = raw.project ?? {
      id: raw.projectId,
      title: raw.title,
      author: raw.author ?? null,
      createdAt: raw.createdAt ?? null,
    };

    const nodeById = new Map();
    for (const n of raw.nodes) {
      if (n && typeof n === 'object' && typeof n.id === 'string') {
        nodeById.set(n.id, n);
      }
    }

    const episodes = [];
    const scenes = [];
    const panels = [];
    const panelAssetIdsMap = new Map(); // panelId -> assetIds[]

    if (Array.isArray(raw.assetUsages)) {
      for (const usage of raw.assetUsages) {
        if (!usage || typeof usage !== 'object') continue;
        const scope = usage.scope;
        if (scope && scope.projectId && project.id && scope.projectId !== project.id) {
          graphIntegrityIssues.push({
            code: ERROR_CODES.REF_EPISODE_PROJECT_MISMATCH,
            entityType: 'assetUsage',
            entityId: usage.id ?? null,
            path: `assetUsages(${usage.id ?? ''}).scope.projectId`,
            message: `AssetUsage "${usage.id}" scope.projectId "${scope.projectId}" does not match project "${project.id}".`,
          });
        }
        const targetPanelId = scope?.panelId ?? usage.panelId;
        if (targetPanelId && usage.assetId) {
          if (!panelAssetIdsMap.has(targetPanelId)) {
            panelAssetIdsMap.set(targetPanelId, []);
          }
          panelAssetIdsMap.get(targetPanelId).push(usage.assetId);
        }
      }
    }

    raw.nodes.forEach((node, idx) => {
      if (!node || typeof node !== 'object') return;
      const title = node.title !== undefined ? node.title : node.label;
      const scope = node.scope;

      if (node.parentId !== null && node.parentId !== undefined && !nodeById.has(node.parentId)) {
        graphIntegrityIssues.push({
          code: ERROR_CODES.REF_NODE_PARENT_MISSING,
          entityType: node.kind ?? 'node',
          entityId: node.id ?? `(index:${idx})`,
          path: `nodes[${idx}].parentId`,
          message: `Node "${node.id}" references missing parentId "${node.parentId}".`,
        });
      }

      if (scope && typeof scope === 'object') {
        if (
          (scope.sequenceId !== undefined || scope.sceneId !== undefined || scope.panelId !== undefined) &&
          scope.episodeId === undefined
        ) {
          graphIntegrityIssues.push({
            code: ERROR_CODES.REF_SCOPE_HIERARCHY_INVALID,
            entityType: node.kind ?? 'node',
            entityId: node.id ?? `(index:${idx})`,
            path: `nodes[${idx}].scope.episodeId`,
            message: `Node "${node.id}" scope requires an episodeId parent for scene/panel scope.`,
          });
        }
      }

      if (node.kind === 'episode') {
        episodes.push({
          id: node.id,
          projectId: scope?.projectId ?? node.projectId ?? project.id,
          title,
          order: node.order,
        });
      } else if (node.kind === 'scene') {
        scenes.push({
          id: node.id,
          episodeId: node.parentId ?? scope?.episodeId ?? node.episodeId,
          title,
          order: node.order,
        });
      } else if (node.kind === 'panel') {
        const mergedAssets = Array.isArray(node.assetIds)
          ? node.assetIds
          : panelAssetIdsMap.get(node.id) ?? [];
        panels.push({
          id: node.id,
          sceneId: node.parentId ?? scope?.sceneId ?? node.sceneId,
          title,
          order: node.order,
          assetIds: mergedAssets,
          dialogue: node.dialogue ?? '',
        });
      }
    });

    return {
      schemaVersion,
      project,
      episodes,
      scenes,
      panels,
      assets: Array.isArray(raw.assets) ? raw.assets : [],
      graphIntegrityIssues,
    };
  }

  // Case 2 & 3: Flat Relational or Nested Episode->Scene->Panel JSON
  const episodes = [];
  const scenes = [];
  const panels = [];

  const rawEpisodes = Array.isArray(raw.episodes) ? raw.episodes : null;
  const hasExplicitScenes = Array.isArray(raw.scenes);
  const hasExplicitPanels = Array.isArray(raw.panels);

  if (rawEpisodes) {
    for (const ep of rawEpisodes) {
      if (ep && typeof ep === 'object') {
        const { scenes: nestedScenes, ...epRest } = ep;
        episodes.push({
          ...epRest,
          title: epRest.title !== undefined ? epRest.title : epRest.label,
        });
        if (!hasExplicitScenes && Array.isArray(nestedScenes)) {
          for (const sc of nestedScenes) {
            if (sc && typeof sc === 'object') {
              const { panels: nestedPanels, ...scRest } = sc;
              scenes.push({
                episodeId: ep.id,
                ...scRest,
                title: scRest.title !== undefined ? scRest.title : scRest.label,
              });
              if (!hasExplicitPanels && Array.isArray(nestedPanels)) {
                for (const pn of nestedPanels) {
                  if (pn && typeof pn === 'object') {
                    panels.push({
                      sceneId: sc.id,
                      ...pn,
                      title: pn.title !== undefined ? pn.title : pn.label,
                    });
                  }
                }
              }
            }
          }
        }
      } else {
        episodes.push(ep);
      }
    }
  }

  return {
    schemaVersion: raw.schemaVersion ?? raw.version,
    project:
      raw.project ??
      (raw.projectId !== undefined
        ? { id: raw.projectId, title: raw.title, author: raw.author }
        : raw.project),
    episodes: rawEpisodes ? episodes : raw.episodes,
    scenes: hasExplicitScenes ? raw.scenes : scenes,
    panels: hasExplicitPanels ? raw.panels : panels,
    assets: raw.assets,
    graphIntegrityIssues,
  };
}

/**
 * Validates a ToonStudio project object and (when fixtureDir is provided) verifies
 * all referenced asset files inside fixtureDir.
 */
