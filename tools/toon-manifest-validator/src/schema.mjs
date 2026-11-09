/**
 * ToonStudio Project Schema & Constants
 *
 * Correspondence with Actual ToonStudio Repository (Read-Only Verified):
 * 1. `packages/studio-project-model/src/graph/project-graph.ts`:
 *    - `StudioProjectGraphV1` (`version: 1`, `projectId`, `title`, `nodes: StudioProjectNodeV1[]`, `assetUsages: StudioAssetUsageV1[]`)
 *    - `STUDIO_PROJECT_NODE_KINDS`: `["series", "season", "episode", "sequence", "scene", "panel", "element"]`
 *    - `SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u`
 * 2. `packages/studio-project-model/src/graph/scope-ref.ts`:
 *    - `StudioScopeRefV1` (`version: 1`, `projectId`, `episodeId`, `sceneId`, `panelId`, `elementId`)
 *    - Hierarchy rule: `scene` and `panel` scopes require `episodeId`; `element` requires `panelId`.
 * 3. `packages/studio-project-model/src/assets/asset-lockfile.ts`:
 *    - `DIGEST = /^sha256:[0-9a-f]{64}$/u`
 * 4. `apps/web/src/domains/creator/studio-archive-manifest.ts` & `studio-publishing-package.ts`:
 *    - `StudioArchiveManifest` (`schemaVersion: 1`, `applicationVersion`, `projectId`, `createdAt`, `rootDocumentPaths`, `files: StudioArchiveFile[]`, `dependencies: StudioArchiveDependency[]`)
 *    - `StudioArchiveFile` (`path`, `kind: "document"|"asset"|"version"|"rights"|"settings"|"preview"`, `sizeBytes`, `checksum: "sha256:<64hex>"`, `required`)
 *    - `safePath`: non-empty, no leading `/`, no `\`, no empty/`.`/`..` segments.
 * 5. `apps/web/src/domains/creator/studio-export-preflight.ts`:
 *    - `STUDIO_EXPORT_TARGET_PROFILES` allowed formats (`png`, `jpg`, `jpeg`, `webp`, `svg`, `pdf`, `psd`, `ora`, `pptx`, `json`, `epub`, `mp4`, `webm`, `gif`, `tif`, `tiff`, plus audio/font/subtitle assets).
 */

export const EXIT_CODES = Object.freeze({
  SUCCESS: 0,
  VALIDATION_FAILED: 1,
  USAGE_OR_IO_ERROR: 2,
});

export const SUPPORTED_SCHEMA_VERSIONS = Object.freeze([1, '1.0', '1.0.0']);

// Matches `SAFE_ID` in `packages/studio-project-model/src/graph/project-graph.ts` & `scope-ref.ts`
export const STUDIO_SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u;

// Matches `CHECKSUM_PATTERN` in `studio-archive-manifest.ts` & `asset-lockfile.ts` (also accepts raw 64-hex)
export const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/iu;
export const SHA256_PREFIXED_PATTERN = /^sha256:[0-9a-f]{64}$/iu;

export const ALLOWED_EXTENSIONS_BY_TYPE = Object.freeze({
  image: Object.freeze(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.psd', '.ora', '.tif', '.tiff']),
  audio: Object.freeze(['.mp3', '.wav', '.ogg', '.m4a']),
  video: Object.freeze(['.mp4', '.webm']),
  font: Object.freeze(['.ttf', '.otf', '.woff', '.woff2']),
  script: Object.freeze(['.json', '.txt']),
  subtitle: Object.freeze(['.vtt', '.srt']),
  document: Object.freeze(['.json', '.pdf', '.epub', '.pptx', '.toonstudio']),
});

export const ALL_ALLOWED_EXTENSIONS = Object.freeze(
  Array.from(
    new Set(Object.values(ALLOWED_EXTENSIONS_BY_TYPE).flat())
  ).sort()
);

export const SENSITIVE_PATH_PATTERNS = Object.freeze([
  /(^|\/)\.env(\..+)?$/i,
  /(^|\/)\.git(\/|$)/i,
  /(^|\/)\.ssh(\/|$)/i,
  /(^|\/)\.toonstudio-secrets(\/|$)/i,
  /(^|\/)\.toonspectrum-secrets(\/|$)/i,
  /(^|\/)\.security-local(\/|$)/i,
  /(^|\/)hidden_files(\/|$)/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /\.(pem|key|p12|pfx|keystore|kdbx)$/i,
  /(^|\/)(credentials|secrets|private[-_]?key|service[-_]?account|token)s?(\.[a-z0-9]+)?$/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.netrc$/i,
  /(^|\/)passwd$/i,
  /(^|\/)shadow$/i,
]);

export const ERROR_CODES = Object.freeze({
  // Input & Schema
  INVALID_JSON: 'INVALID_JSON',
  INVALID_ROOT_OBJECT: 'INVALID_ROOT_OBJECT',
  UNSUPPORTED_SCHEMA_VERSION: 'UNSUPPORTED_SCHEMA_VERSION',
  MISSING_PROJECT_META: 'MISSING_PROJECT_META',
  INVALID_ID_FORMAT: 'INVALID_ID_FORMAT',
  INVALID_COLLECTION_TYPE: 'INVALID_COLLECTION_TYPE',

  // Empty Title / Label
  EMPTY_PROJECT_TITLE: 'EMPTY_PROJECT_TITLE',
  EMPTY_EPISODE_TITLE: 'EMPTY_EPISODE_TITLE',
  EMPTY_SCENE_TITLE: 'EMPTY_SCENE_TITLE',
  EMPTY_PANEL_TITLE: 'EMPTY_PANEL_TITLE',
  EMPTY_ASSET_TITLE: 'EMPTY_ASSET_TITLE',

  // Duplicate IDs
  DUPLICATE_EPISODE_ID: 'DUPLICATE_EPISODE_ID',
  DUPLICATE_SCENE_ID: 'DUPLICATE_SCENE_ID',
  DUPLICATE_PANEL_ID: 'DUPLICATE_PANEL_ID',
  DUPLICATE_ASSET_ID: 'DUPLICATE_ASSET_ID',
  DUPLICATE_GLOBAL_ID: 'DUPLICATE_GLOBAL_ID',
  DUPLICATE_PANEL_ASSET_REF: 'DUPLICATE_PANEL_ASSET_REF',

  // Reference Integrity & Scope Hierarchy (`StudioProjectGraphV1` / `StudioScopeRefV1`)
  REF_EPISODE_PROJECT_MISMATCH: 'REF_EPISODE_PROJECT_MISMATCH',
  REF_SCENE_EPISODE_MISSING: 'REF_SCENE_EPISODE_MISSING',
  REF_PANEL_SCENE_MISSING: 'REF_PANEL_SCENE_MISSING',
  REF_PANEL_ASSET_MISSING: 'REF_PANEL_ASSET_MISSING',
  REF_NODE_PARENT_MISSING: 'REF_NODE_PARENT_MISSING',
  REF_SCOPE_HIERARCHY_INVALID: 'REF_SCOPE_HIERARCHY_INVALID',
  UNREFERENCED_ASSET: 'UNREFERENCED_ASSET',

  // Ordering
  INVALID_EPISODE_ORDER: 'INVALID_EPISODE_ORDER',
  DUPLICATE_EPISODE_ORDER: 'DUPLICATE_EPISODE_ORDER',
  NON_SEQUENTIAL_EPISODE_ORDER: 'NON_SEQUENTIAL_EPISODE_ORDER',
  INVALID_SCENE_ORDER: 'INVALID_SCENE_ORDER',
  DUPLICATE_SCENE_ORDER: 'DUPLICATE_SCENE_ORDER',
  NON_SEQUENTIAL_SCENE_ORDER: 'NON_SEQUENTIAL_SCENE_ORDER',
  INVALID_PANEL_ORDER: 'INVALID_PANEL_ORDER',
  DUPLICATE_PANEL_ORDER: 'DUPLICATE_PANEL_ORDER',
  NON_SEQUENTIAL_PANEL_ORDER: 'NON_SEQUENTIAL_PANEL_ORDER',

  // Path Safety & Normalization
  EMPTY_ASSET_PATH: 'EMPTY_ASSET_PATH',
  UNSAFE_NULL_BYTE: 'UNSAFE_NULL_BYTE',
  UNSAFE_URI_SCHEME: 'UNSAFE_URI_SCHEME',
  UNSAFE_ABSOLUTE_PATH: 'UNSAFE_ABSOLUTE_PATH',
  PATH_TRAVERSAL_DETECTED: 'PATH_TRAVERSAL_DETECTED',
  INVALID_RELATIVE_PATH: 'INVALID_RELATIVE_PATH',
  SENSITIVE_FILE_REJECTED: 'SENSITIVE_FILE_REJECTED',
  PATH_OUTSIDE_FIXTURE_ROOT: 'PATH_OUTSIDE_FIXTURE_ROOT',
  SYMLINK_ESCAPE_DETECTED: 'SYMLINK_ESCAPE_DETECTED',
  NORMALIZATION_COLLISION_CASE: 'NORMALIZATION_COLLISION_CASE',
  NORMALIZATION_COLLISION_UNICODE: 'NORMALIZATION_COLLISION_UNICODE',
  NORMALIZATION_COLLISION_PATH: 'NORMALIZATION_COLLISION_PATH',

  // Extension & Asset Type
  UNKNOWN_ASSET_TYPE: 'UNKNOWN_ASSET_TYPE',
  UNSUPPORTED_EXTENSION: 'UNSUPPORTED_EXTENSION',
  ASSET_TYPE_EXTENSION_MISMATCH: 'ASSET_TYPE_EXTENSION_MISMATCH',

  // File & Integrity Verification
  MISSING_ASSET_FILE: 'MISSING_ASSET_FILE',
  NOT_A_REGULAR_FILE: 'NOT_A_REGULAR_FILE',
  EMPTY_ASSET_FILE: 'EMPTY_ASSET_FILE',
  INVALID_EXPECTED_SHA256: 'INVALID_EXPECTED_SHA256',
  ASSET_SHA256_MISMATCH: 'ASSET_SHA256_MISMATCH',
  MANIFEST_HASH_MISMATCH: 'MANIFEST_HASH_MISMATCH',
  MANIFEST_ASSET_TAMPERED: 'MANIFEST_ASSET_TAMPERED',
  MANIFEST_ASSET_SIZE_MISMATCH: 'MANIFEST_ASSET_SIZE_MISMATCH',
  ARCHIVE_MANIFEST_INVALID: 'ARCHIVE_MANIFEST_INVALID',
});
