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

function compareCodePoints(a, b) {
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

const STRICT_ISO_WITH_TZ_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-](\d{2}):(\d{2}))$/i;

function isProlepticGregorianLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInProlepticGregorianMonth(year, month) {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isProlepticGregorianLeapYear(year) ? 29 : 28;
    default:
      return 0;
  }
}

/**
 * 명시적 타임존이 있는 ISO-8601 타임스탬프를 UTC 표준 형식(`YYYY-MM-DDTHH:mm:ss.sssZ`)으로 변환한다.
 * 선행 그레고리력의 산술 규칙으로 `0000`~`9999`년을 검증하며, `Date.UTC(0..99)`의 1900년 보정과
 * `Date.parse`의 날짜 자동 넘김을 사용하지 않는다. 타임존 없는 입력은 거절하여 실행 환경의 `TZ`에 따른 해시 변화를 막는다.
 */
export function parseDeterministicCreatedAt(rawCreatedAt) {
  if (rawCreatedAt === undefined || rawCreatedAt === null) {
    return { valid: true, canonicalIso: '2026-11-10T00:00:00.000Z' };
  }
  if (typeof rawCreatedAt !== 'string') {
    return { valid: false, canonicalIso: null };
  }
  const trimmed = rawCreatedAt.trim();
  const match = STRICT_ISO_WITH_TZ_RE.exec(trimmed);
  if (!match) {
    return { valid: false, canonicalIso: null };
  }
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const hour = Number.parseInt(match[4], 10);
  const minute = Number.parseInt(match[5], 10);
  const second = Number.parseInt(match[6], 10);
  const fraction = match[7] ?? '';
  const millisecond =
    fraction.length === 0 ? 0 : Number.parseInt(fraction.padEnd(3, '0').slice(0, 3), 10);
  const tzToken = match[8];
  const isUtcZ = tzToken.toUpperCase() === 'Z';
  const offHour = match[9] !== undefined ? Number.parseInt(match[9], 10) : 0;
  const offMinute = match[10] !== undefined ? Number.parseInt(match[10], 10) : 0;

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInProlepticGregorianMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    (!isUtcZ && (offHour > 23 || offMinute > 59))
  ) {
    return { valid: false, canonicalIso: null };
  }

  const wallUtc = new Date(0);
  wallUtc.setUTCFullYear(year, month - 1, day);
  wallUtc.setUTCHours(hour, minute, second, millisecond);
  if (
    wallUtc.getUTCFullYear() !== year ||
    wallUtc.getUTCMonth() !== month - 1 ||
    wallUtc.getUTCDate() !== day ||
    wallUtc.getUTCHours() !== hour ||
    wallUtc.getUTCMinutes() !== minute ||
    wallUtc.getUTCSeconds() !== second ||
    wallUtc.getUTCMilliseconds() !== millisecond
  ) {
    return { valid: false, canonicalIso: null };
  }

  const offsetSign = tzToken.startsWith('-') ? -1 : 1;
  const offsetMinutes = isUtcZ ? 0 : offsetSign * (offHour * 60 + offMinute);
  const utcEpochMs = wallUtc.getTime() - offsetMinutes * 60_000;
  if (!Number.isFinite(utcEpochMs)) {
    return { valid: false, canonicalIso: null };
  }
  return { valid: true, canonicalIso: new Date(utcEpochMs).toISOString() };
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
    const panelAssetUsagesMap = new Map(); // panelId -> { assetId, usageId }[]

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
          if (!panelAssetUsagesMap.has(targetPanelId)) {
            panelAssetUsagesMap.set(targetPanelId, []);
          }
          panelAssetUsagesMap.get(targetPanelId).push({
            assetId: usage.assetId,
            usageId: usage.id ?? '',
          });
        }
      }
    }

    const panelAssetIdsMap = new Map();
    for (const [panelId, usageList] of panelAssetUsagesMap.entries()) {
      const sortedUsages = [...usageList].sort(
        (u, v) =>
          compareCodePoints(u.assetId, v.assetId) ||
          compareCodePoints(u.usageId, v.usageId)
      );
      panelAssetIdsMap.set(
        panelId,
        sortedUsages.map((u) => u.assetId)
      );
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
          (scope.sequenceId !== undefined ||
            scope.sceneId !== undefined ||
            scope.panelId !== undefined) &&
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
        ? {
            id: raw.projectId,
            title: raw.title,
            author: raw.author,
            createdAt: raw.createdAt,
          }
        : raw.project),
    episodes: rawEpisodes ? episodes : raw.episodes,
    scenes: hasExplicitScenes ? raw.scenes : scenes,
    panels: hasExplicitPanels ? raw.panels : panels,
    assets: raw.assets,
    graphIntegrityIssues,
  };
}
