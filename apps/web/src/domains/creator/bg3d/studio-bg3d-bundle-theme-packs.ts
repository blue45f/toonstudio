import { getBuildFixedStudioBg3dBundleRelease, getStudioBg3dBundleReleaseCompletionBinding,
  getStudioBg3dBundleReleaseCompletionRequestUrl,
  readVerifiedStudioBg3dBundleReleaseJson, requireStudioBg3dBundleRelease,
  type StudioBg3dBundleReleaseDescriptor, type StudioBg3dBundleResponse } from "./studio-bg3d-bundle-release";

/**
 * Creator Bundle 테마 팩 데이터 소비자.
 *
 * 생성기(scripts/generate-creator-bundle-theme-packs.mjs)가 인제스션 매니페스트 v2에서
 * 뽑아 정적 서빙하는 theme-packs.json을 읽어 검증·동결하고, bg3d 패널과 모델
 * 라이브러리(레코드 해석)가 쓰는 조회 인터페이스를 제공한다.
 *
 * 권리 규약은 매니페스트 v2 소비자(studio-bundle-manifest-v2.ts)와 같은 강도다:
 * - `inServiceOnly !== true`거나 `downloadable !== false`면 데이터 자체를 거부한다.
 * - 다운로드 동선 필드(original/download/downloadUrl/downloadPath)를 가진 항목은
 *   어느 층위에서도 거부한다.
 * - 에셋은 참조로만 다루고, 파일 다운로드/내보내기 경로는 만들지 않는다.
 * - 팩별 권리(`packs[].rights`)는 생성기가 권리 원장에서 allow된 팩에만 싣는다. 로더는 이 값으로만
 *   레코드 권리를 만들고, 값이 없는 팩(원장 이전 스냅샷)은 권리 미상으로 닫는다.
 */

export const STUDIO_BG3D_BUNDLE_THEME_PACKS_SCHEMA = "toonstudio.bg3d-bundle-theme-packs.v1" as const;
/** 옛 명시 URL 호출의 호환 상수다. 새 기본 호출은 빌드 고정 release.catalog.url을 사용한다. */
export const STUDIO_BG3D_BUNDLE_THEME_PACKS_URL =
  "/assets/3d/environments/bundle-v1/theme-packs.json" as const;
/** 매니페스트 v2 파일 트리가 서빙되는 루트. 에셋은 이 아래 `<sha256>.glb` 키로 서빙된다. */
export const STUDIO_BG3D_BUNDLE_ASSET_ROOT = "/assets/studio/bundle-v2/" as const;
/** 인제스션 에셋 id 접두사. 환경 카탈로그(ts-bg3d-*)·로컬 저장 id와 겹치지 않는다. */
export const STUDIO_BG3D_BUNDLE_ASSET_ID_PREFIX = "cbv1-ingest-" as const;

export type StudioBg3dBundlePackCategory = "environment" | "prop";
export type StudioBg3dBundleAssetClassification = "environment" | "prop";
/** 팩별 권리 상태. 구매 번들은 `licensed`, CC0 문서로 증빙된 팩은 `public-domain`이다. */
export type StudioBg3dBundlePackRightsStatus = "licensed" | "public-domain";

export interface StudioBg3dBundleTheme {
  readonly id: string;
  readonly label: string;
}

export interface StudioBg3dBundlePackDeferred {
  readonly fbx: number;
  readonly gltf: number;
  readonly blend: number;
  readonly overBudget: Readonly<Record<string, number>>;
}

/**
 * 팩별 권리 요약. 생성기가 권리 원장(config/creator-bundle-pack-rights.json)에서 allow된 팩에만 싣는다.
 * 증빙 경로·hold 사유 같은 내부 기록은 공개 데이터에 넣지 않는다.
 */
export interface StudioBg3dBundlePackRights {
  readonly serve: "allow";
  readonly status: StudioBg3dBundlePackRightsStatus;
  readonly licenseName: string;
  readonly commercialUse: boolean;
  readonly attributionRequired: boolean;
  readonly attribution?: string;
}

export interface StudioBg3dBundleThemePack {
  readonly catalogIds: readonly string[];
  readonly title: string;
  readonly creator: string;
  /** 소품 팩은 테마가 없어 null이다. */
  readonly theme: string | null;
  readonly category: StudioBg3dBundlePackCategory;
  readonly ingestPackIds: readonly string[];
  readonly placeable: number;
  readonly twinCovered: number;
  readonly deferred: StudioBg3dBundlePackDeferred;
  /** 원장 이전 스냅샷 데이터에는 없다(null). 로더는 이런 팩의 에셋 권리를 unknown으로 닫는다. */
  readonly rights: StudioBg3dBundlePackRights | null;
  readonly note: string | null;
}

export interface StudioBg3dBundleThemePackAsset {
  readonly id: string;
  readonly packIndex: number;
  /** 인제스션 트리 기준 원본 상대 경로 (GLB 단일 파일). 표시 이름과 소속 팩 검증용이며 서빙 URL에는 쓰지 않는다. */
  readonly path: string;
  readonly bytes: number;
  readonly sha256: `sha256:${string}`;
  readonly triangles: number;
}

export interface StudioBg3dBundleThemePackPreset {
  readonly id: string;
  readonly label: string;
  readonly theme: string | null;
  readonly packIndex: number;
  readonly assetIndex: number;
}

export interface StudioBg3dBundleCrowdPack {
  readonly catalogIds: readonly string[];
  readonly title: string;
  readonly creator: string;
  readonly category: "crowd-render-only";
  readonly glbAssets: number;
  readonly note: string | null;
}

export interface StudioBg3dBundlePendingPack {
  readonly catalogIds: readonly string[];
  readonly title: string;
  readonly reason: string;
  readonly reasonLabel: string;
}

export interface StudioBg3dBundleThemePacks {
  readonly schema: typeof STUDIO_BG3D_BUNDLE_THEME_PACKS_SCHEMA;
  readonly version: 1;
  readonly sourceManifestGeneratedAt: string | null;
  readonly provider: string | null;
  readonly rightsHolder: string | null;
  readonly inServiceOnly: true;
  readonly downloadable: false;
  readonly assetRoot: string;
  readonly themes: readonly StudioBg3dBundleTheme[];
  readonly packs: readonly StudioBg3dBundleThemePack[];
  readonly assets: readonly StudioBg3dBundleThemePackAsset[];
  readonly presets: readonly StudioBg3dBundleThemePackPreset[];
  readonly crowdPacks: readonly StudioBg3dBundleCrowdPack[];
  readonly pendingPacks: readonly StudioBg3dBundlePendingPack[];
  readonly totals: {
    readonly packs: number;
    readonly placeableAssets: number;
    readonly presets: number;
    readonly crowdGlbAssets: number;
    readonly deferredAssets: number;
  };
}

/* ── 파서 (매니페스트 v2 소비자와 같은 강도) ──────────────────────────────── */

const DOWNLOAD_FIELD_KEYS: readonly string[] = ["original", "download", "downloadUrl", "downloadPath"];
const SHA256 = /^[a-f0-9]{64}$/u;
const ASSET_ID = /^[a-z0-9-]{1,200}$/u;
const RIGHTS_EXTERNAL_REFERENCE = /(?:\b(?:blob|data|file|https?):|:\/\/|\bwww\.)/iu;
const RIGHTS_SENSITIVE_REFERENCE = /(?:\b(?:api[-_ ]?key|access[-_ ]?token|secret|password)\b|(?:^|\s)sk-[A-Za-z0-9_-]{8,})/iu;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

function requiredText(value: unknown, maximum: number, message: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || hasControlCharacter(value)) {
    throw new TypeError(message);
  }
  return value;
}

function optionalText(value: unknown, maximum: number, message: string): string | null {
  if (value === undefined || value === null) return null;
  return requiredText(value, maximum, message);
}

/** 검증 레코드와 같은 160자 계약으로 출처를 잘라내거나 정규화해 잃지 않는다. */
function rightsText(value: unknown, message: string): string {
  const text = requiredText(value, 640, message);
  if (/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(text) || Array.from(text).length > 160 || text.normalize("NFKC").trim().replace(/\s+/gu, " ") !== text
    || !/[\p{L}\p{N}]/u.test(text) || RIGHTS_EXTERNAL_REFERENCE.test(text) || RIGHTS_SENSITIVE_REFERENCE.test(text)) {
    throw new TypeError(message);
  }
  return text;
}

function count(value: unknown, message: string): number {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new TypeError(message);
  return Number(value);
}

function assertNoDownloadFields(target: Record<string, unknown>): void {
  if (DOWNLOAD_FIELD_KEYS.some((key) => Object.hasOwn(target, key))) {
    throw new TypeError("다운로드 동선을 포함할 수 없는 팩입니다.");
  }
}

/** 서빙 경로 검증: 에셋 루트 상대 경로만 허용하고 상위 탈출·절대 경로·스킴을 거부한다. */
function relativeServingPath(value: unknown, message: string): string {
  const path = requiredText(value, 1024, message);
  if (path.startsWith("/") || path.includes("\\") || /^[a-zA-Z][a-zA-Z0-9+.-]*:/u.test(path)) {
    throw new TypeError(message);
  }
  if (path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new TypeError(message);
  }
  return path;
}

function parseDeferred(value: unknown): StudioBg3dBundlePackDeferred {
  const raw = record(value);
  if (!raw) throw new TypeError("테마 팩 보류 집계 형식이 올바르지 않습니다.");
  const overBudgetRaw = record(raw.overBudget) ?? {};
  const overBudget: Record<string, number> = {};
  for (const [reason, amount] of Object.entries(overBudgetRaw)) {
    overBudget[reason] = count(amount, "테마 팩 보류 집계 형식이 올바르지 않습니다.");
  }
  return Object.freeze({
    fbx: count(raw.fbx, "테마 팩 보류 집계 형식이 올바르지 않습니다."),
    gltf: count(raw.gltf, "테마 팩 보류 집계 형식이 올바르지 않습니다."),
    blend: count(raw.blend, "테마 팩 보류 집계 형식이 올바르지 않습니다."),
    overBudget: Object.freeze(overBudget),
  });
}

const PACK_RIGHTS_STATUSES: readonly string[] = ["licensed", "public-domain"];

/**
 * 팩별 권리 블록 파서. 블록이 없으면 null(원장 이전 스냅샷), 있으면 allow만 받아들인다 —
 * 서빙이 허용되지 않은 팩은 생성기가 theme-packs에 넣지 않으므로 hold가 들어 있으면 데이터가 잘못된 것이다.
 */
function parsePackRights(value: unknown): StudioBg3dBundlePackRights | null {
  if (value === undefined || value === null) return null;
  const rights = record(value);
  if (!rights) throw new TypeError("테마 팩 권리 표기 형식이 올바르지 않습니다.");
  assertNoDownloadFields(rights);
  if (rights.serve !== "allow") {
    throw new TypeError("서빙이 허용되지 않은 팩은 테마 팩 데이터에 있을 수 없습니다.");
  }
  if (typeof rights.status !== "string" || !PACK_RIGHTS_STATUSES.includes(rights.status)
    || typeof rights.commercialUse !== "boolean" || typeof rights.attributionRequired !== "boolean") {
    throw new TypeError("테마 팩 권리 표기가 올바르지 않습니다.");
  }
  const attribution = rights.attributionRequired || rights.attribution !== undefined
    ? rightsText(rights.attribution, "테마 팩 출처 표기가 올바르지 않습니다.") : undefined;
  return Object.freeze({
    serve: "allow" as const,
    status: rights.status as StudioBg3dBundlePackRightsStatus,
    licenseName: rightsText(rights.licenseName, "테마 팩 라이선스 이름이 올바르지 않습니다."),
    commercialUse: rights.commercialUse,
    attributionRequired: rights.attributionRequired,
    ...(attribution === undefined ? {} : { attribution }),
  });
}

function parsePack(value: unknown): StudioBg3dBundleThemePack {
  const pack = record(value);
  if (!pack) throw new TypeError("테마 팩 형식이 올바르지 않습니다.");
  assertNoDownloadFields(pack);
  if (!Array.isArray(pack.catalogIds)
    || pack.catalogIds.some((entry) => typeof entry !== "string" || entry.length > 200)) {
    throw new TypeError("테마 팩 카탈로그 식별자가 올바르지 않습니다.");
  }
  if (!Array.isArray(pack.ingestPackIds) || pack.ingestPackIds.length === 0
    || pack.ingestPackIds.some((entry) => typeof entry !== "string" || !ASSET_ID.test(entry))) {
    throw new TypeError("테마 팩 인제스션 식별자가 올바르지 않습니다.");
  }
  if (pack.category !== "environment" && pack.category !== "prop") {
    throw new TypeError("테마 팩 분류가 올바르지 않습니다.");
  }
  return Object.freeze({
    catalogIds: Object.freeze([...pack.catalogIds] as string[]),
    title: requiredText(pack.title, 200, "테마 팩 이름이 올바르지 않습니다."),
    creator: requiredText(pack.creator, 200, "테마 팩 제작자 표기가 올바르지 않습니다."),
    theme: pack.theme === null ? null : requiredText(pack.theme, 80, "테마 팩 테마가 올바르지 않습니다."),
    category: pack.category,
    ingestPackIds: Object.freeze([...pack.ingestPackIds] as string[]),
    placeable: count(pack.placeable, "테마 팩 에셋 수가 올바르지 않습니다."),
    twinCovered: count(pack.twinCovered, "테마 팩 에셋 수가 올바르지 않습니다."),
    deferred: parseDeferred(pack.deferred),
    rights: parsePackRights(pack.rights),
    note: optionalText(pack.note, 500, "테마 팩 비고가 올바르지 않습니다."),
  });
}

function parseAsset(value: unknown, packCount: number): StudioBg3dBundleThemePackAsset {
  const asset = record(value);
  if (!asset) throw new TypeError("테마 팩 에셋 형식이 올바르지 않습니다.");
  assertNoDownloadFields(asset);
  if (asset.downloadable === true) throw new TypeError("다운로드 동선을 포함할 수 없는 팩입니다.");
  if (typeof asset.id !== "string" || !ASSET_ID.test(asset.id)) {
    throw new TypeError("테마 팩 에셋 식별자가 올바르지 않습니다.");
  }
  if (!Number.isSafeInteger(asset.pack) || Number(asset.pack) < 0 || Number(asset.pack) >= packCount) {
    throw new TypeError("테마 팩 에셋의 팩 참조가 올바르지 않습니다.");
  }
  if (typeof asset.sha256 !== "string" || !SHA256.test(asset.sha256)) {
    throw new TypeError("테마 팩 에셋 해시가 올바르지 않습니다.");
  }
  return Object.freeze({
    id: asset.id,
    packIndex: Number(asset.pack),
    path: relativeServingPath(asset.path, "테마 팩 에셋 경로가 올바르지 않습니다."),
    bytes: count(asset.bytes, "테마 팩 에셋 크기가 올바르지 않습니다."),
    sha256: `sha256:${asset.sha256}` as `sha256:${string}`,
    triangles: count(asset.tris, "테마 팩 에셋 삼각형 수가 올바르지 않습니다."),
  });
}

/** 테마 팩 데이터 원문을 검증해 동결된 구조로 돌려준다. 권리 강제를 어기면 던진다. */
export function parseStudioBg3dBundleThemePacks(value: unknown): StudioBg3dBundleThemePacks {
  const root = record(value);
  if (!root || root.schema !== STUDIO_BG3D_BUNDLE_THEME_PACKS_SCHEMA || root.version !== 1
    || !Array.isArray(root.packs) || !Array.isArray(root.assets) || !Array.isArray(root.themes)) {
    throw new TypeError("테마 팩 데이터 형식이 올바르지 않습니다.");
  }
  assertNoDownloadFields(root);
  if (root.inServiceOnly !== true || root.downloadable !== false) {
    throw new TypeError("서비스 내 사용 전용으로 선언되지 않은 테마 팩은 불러올 수 없습니다.");
  }
  const rights = record(root.rights);
  if (!rights || rights.inServiceOnly !== true || rights.downloadable !== false) {
    throw new TypeError("서비스 내 사용 전용으로 선언되지 않은 테마 팩은 불러올 수 없습니다.");
  }
  const themes = root.themes.map((entry) => {
    const theme = record(entry);
    if (!theme) throw new TypeError("테마 형식이 올바르지 않습니다.");
    return Object.freeze({
      id: requiredText(theme.id, 80, "테마 식별자가 올바르지 않습니다."),
      label: requiredText(theme.label, 80, "테마 이름이 올바르지 않습니다."),
    });
  });
  const packs = root.packs.map((entry) => parsePack(entry));
  const ids = new Set<string>();
  const assets = root.assets.map((entry) => {
    const asset = parseAsset(entry, packs.length);
    if (ids.has(asset.id)) throw new TypeError("테마 팩 에셋 식별자가 중복됩니다.");
    ids.add(asset.id);
    // 에셋 경로는 자기 팩의 인제스션 접두사로 시작해야 한다 (매핑 표와의 정합).
    const pack = packs[asset.packIndex];
    if (!pack || !pack.ingestPackIds.some((packId) => asset.path.startsWith(`${packId}/`))) {
      throw new TypeError("테마 팩 에셋 경로가 소속 팩과 맞지 않습니다.");
    }
    return asset;
  });
  const presets = (Array.isArray(root.presets) ? root.presets : []).map((entry) => {
    const preset = record(entry);
    if (!preset) throw new TypeError("테마 팩 프리셋 형식이 올바르지 않습니다.");
    assertNoDownloadFields(preset);
    if (!Number.isSafeInteger(preset.pack) || Number(preset.pack) < 0 || Number(preset.pack) >= packs.length
      || !Number.isSafeInteger(preset.asset) || Number(preset.asset) < 0 || Number(preset.asset) >= assets.length) {
      throw new TypeError("테마 팩 프리셋 참조가 올바르지 않습니다.");
    }
    if (assets[Number(preset.asset)]?.packIndex !== Number(preset.pack)) {
      throw new TypeError("테마 팩 프리셋 참조가 올바르지 않습니다.");
    }
    return Object.freeze({
      id: requiredText(preset.id, 240, "테마 팩 프리셋 식별자가 올바르지 않습니다."),
      label: requiredText(preset.label, 240, "테마 팩 프리셋 이름이 올바르지 않습니다."),
      theme: preset.theme === null ? null : requiredText(preset.theme, 80, "테마 팩 프리셋 테마가 올바르지 않습니다."),
      packIndex: Number(preset.pack),
      assetIndex: Number(preset.asset),
    });
  });
  const crowdPacks = (Array.isArray(root.crowdPacks) ? root.crowdPacks : []).map((entry) => {
    const pack = record(entry);
    if (!pack || pack.category !== "crowd-render-only" || !Array.isArray(pack.catalogIds)) {
      throw new TypeError("배경 군중 팩 형식이 올바르지 않습니다.");
    }
    assertNoDownloadFields(pack);
    return Object.freeze({
      catalogIds: Object.freeze([...pack.catalogIds] as string[]),
      title: requiredText(pack.title, 200, "배경 군중 팩 이름이 올바르지 않습니다."),
      creator: requiredText(pack.creator, 200, "배경 군중 팩 제작자 표기가 올바르지 않습니다."),
      category: "crowd-render-only" as const,
      glbAssets: count(pack.glbAssets, "배경 군중 팩 에셋 수가 올바르지 않습니다."),
      note: optionalText(pack.note, 500, "배경 군중 팩 비고가 올바르지 않습니다."),
    });
  });
  const pendingPacks = (Array.isArray(root.pendingPacks) ? root.pendingPacks : []).map((entry) => {
    const pack = record(entry);
    if (!pack || !Array.isArray(pack.catalogIds)) {
      throw new TypeError("준비 중 팩 형식이 올바르지 않습니다.");
    }
    assertNoDownloadFields(pack);
    return Object.freeze({
      catalogIds: Object.freeze([...pack.catalogIds] as string[]),
      title: requiredText(pack.title, 200, "준비 중 팩 이름이 올바르지 않습니다."),
      reason: requiredText(pack.reason, 80, "준비 중 팩 사유가 올바르지 않습니다."),
      reasonLabel: requiredText(pack.reasonLabel, 500, "준비 중 팩 사유가 올바르지 않습니다."),
    });
  });
  const totals = record(root.totals);
  const parsedTotals = Object.freeze({
    packs: count(totals?.packs, "테마 팩 합계가 올바르지 않습니다."),
    placeableAssets: count(totals?.placeableAssets, "테마 팩 합계가 올바르지 않습니다."),
    presets: count(totals?.presets, "테마 팩 합계가 올바르지 않습니다."),
    crowdGlbAssets: count(totals?.crowdGlbAssets, "테마 팩 합계가 올바르지 않습니다."),
    deferredAssets: count(totals?.deferredAssets, "테마 팩 합계가 올바르지 않습니다."),
  });
  if (parsedTotals.packs !== packs.length || parsedTotals.placeableAssets !== assets.length
    || parsedTotals.presets !== presets.length
    || parsedTotals.crowdGlbAssets !== crowdPacks.reduce((sum, pack) => sum + pack.glbAssets, 0)
    || parsedTotals.deferredAssets !== packs.reduce((sum, pack) => sum + countStudioBg3dBundlePackDeferred(pack), 0)) {
    throw new TypeError("테마 팩 합계가 실제 항목과 일치하지 않습니다. 같은 인입 자료로 목록을 다시 생성하세요.");
  }
  const sourceManifest = record(root.sourceManifest);
  return Object.freeze({
    schema: STUDIO_BG3D_BUNDLE_THEME_PACKS_SCHEMA,
    version: 1,
    sourceManifestGeneratedAt: optionalText(sourceManifest?.generatedAt, 80, "테마 팩 출처 시각이 올바르지 않습니다."),
    provider: optionalText(root.provider, 200, "테마 팩 제공자 표기가 올바르지 않습니다."),
    rightsHolder: optionalText(rights.holder, 200, "테마 팩 권리자 표기가 올바르지 않습니다."),
    inServiceOnly: true,
    downloadable: false,
    assetRoot: typeof root.assetRoot === "string" && root.assetRoot.length > 0
      ? root.assetRoot
      : STUDIO_BG3D_BUNDLE_ASSET_ROOT,
    themes: Object.freeze(themes),
    packs: Object.freeze(packs),
    assets: Object.freeze(assets),
    presets: Object.freeze(presets),
    crowdPacks: Object.freeze(crowdPacks),
    pendingPacks: Object.freeze(pendingPacks),
    totals: parsedTotals,
  });
}

/* ── 로드·조회 ───────────────────────────────────────────────────────────── */

type ThemePacksFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<StudioBg3dBundleResponse>;

let themePacksPromise: Promise<StudioBg3dBundleThemePacks> | null = null;
let themePacksPendingKey: string | null = null;
let verifiedReleaseCatalog: { readonly key: string; readonly data: StudioBg3dBundleThemePacks } | null = null;
// 같은 내용의 catalog라도 각 반환 객체는 자기 빌드의 index만 사용한다. 초기화가 외부 객체의 결합을 지우지 않는다.
const themePacksReleaseBindings = new WeakMap<StudioBg3dBundleThemePacks, StudioBg3dBundleReleaseDescriptor>();
let themePacksLoaded: StudioBg3dBundleThemePacks | null = null;
let assetById: Map<string, StudioBg3dBundleThemePackAsset> | null = null;
let assetByHash: Map<string, StudioBg3dBundleThemePackAsset> | null = null;
let themePacksRevision = 0;
let themePacksPublicationRevision = 0;
let themePacksPublicationIdentity: string | null = null;

function indexThemePacks(data: StudioBg3dBundleThemePacks): void {
  if (themePacksLoaded === data) return;
  // 같은 내용의 정상 재조회는 유지하고 실제 발행 변경·A→B→A는 구분한다.
  const identity = JSON.stringify(data);
  if (identity !== themePacksPublicationIdentity) {
    themePacksPublicationIdentity = identity;
    themePacksPublicationRevision += 1;
  }
  themePacksLoaded = data;
  assetById = new Map(data.assets.map((asset) => [asset.id, asset]));
  assetByHash = new Map(data.assets.map((asset) => [asset.sha256, asset]));
}

/** 테스트·재배포 교체용: 캐시를 비운다. */
export function resetStudioBg3dBundleThemePacksCache(): void {
  themePacksRevision += 1;
  themePacksPublicationRevision += 1;
  themePacksPublicationIdentity = null;
  themePacksPromise = null;
  themePacksPendingKey = null;
  verifiedReleaseCatalog = null;
  themePacksLoaded = null;
  assetById = null;
  assetByHash = null;
}

/**
 * legacy·주입 포트는 매번 검사한다. 기본 release는 검증한 동결 객체 하나만 내용 주소별로 재사용한다.
 * 같은 release의 동시 기본 요청만 공유하며 실패·명시 초기화는 검증 캐시도 비운다.
 */
export async function loadStudioBg3dBundleThemePacks(options: {
  readonly signal?: AbortSignal;
  readonly fetcher?: ThemePacksFetch;
  readonly url?: string;
  /** null은 명시적인 legacy 호출용이다. fetcher만 주입하면 기본 release 검증을 계속 수행한다. */
  readonly release?: StudioBg3dBundleReleaseDescriptor | null;
} = {}): Promise<StudioBg3dBundleThemePacks> {
  let release: StudioBg3dBundleReleaseDescriptor | null;
  try {
    release = options.release === null || (options.url !== undefined && options.release === undefined)
      ? null : requireStudioBg3dBundleRelease(options.release ?? getBuildFixedStudioBg3dBundleRelease());
    if (release && options.url !== undefined && options.url !== release.catalog.url) {
      throw new TypeError("catalog URL이 같은 빌드의 release와 다릅니다.");
    }
  } catch (error) { resetStudioBg3dBundleThemePacksCache(); throw error; }
  const url = options.url ?? release?.catalog.url ?? STUDIO_BG3D_BUNDLE_THEME_PACKS_URL;
  const shared = !options.fetcher && options.url === undefined;
  const pendingKey = release ? JSON.stringify(release) : `legacy:${url}`;
  if (shared && themePacksPromise && themePacksPendingKey === pendingKey) return themePacksPromise;
  if (shared && release && verifiedReleaseCatalog?.key === pendingKey) {
    options.signal?.throwIfAborted();
    themePacksRevision += 1;
    // 다른 발행의 진행 중 응답은 최신 선택을 덮거나 이후 요청에 재사용할 수 없다.
    themePacksPromise = null;
    themePacksPendingKey = null;
    indexThemePacks(verifiedReleaseCatalog.data);
    return verifiedReleaseCatalog.data;
  }
  const revision = ++themePacksRevision;
  themePacksPromise = null;
  themePacksPendingKey = null;
  const fetcher: ThemePacksFetch = options.fetcher
    ?? ((input, init) => globalThis.fetch(input, init));
  const pending = (async () => {
    const response = await fetcher(url, {
      cache: release ? "force-cache" : "no-cache",
      credentials: "same-origin",
      signal: options.signal,
      ...(release ? { redirect: "error" as const } : {}),
    });
    if (!response.ok) throw new TypeError("테마 팩 데이터를 불러오지 못했습니다.");
    const raw = release ? await readVerifiedStudioBg3dBundleReleaseJson(response, release.catalog, options.signal) : await response.json();
    const data = parseStudioBg3dBundleThemePacks(raw);
    if (release) themePacksReleaseBindings.set(data, release);
    if (revision === themePacksRevision) {
      indexThemePacks(data);
      if (shared && release) verifiedReleaseCatalog = { key: pendingKey, data };
    }
    return data;
  })();
  if (shared) {
    themePacksPromise = pending;
    themePacksPendingKey = pendingKey;
  }
  void pending.then(() => {
    if (themePacksPromise === pending) { themePacksPromise = null; themePacksPendingKey = null; }
  }, () => {
    if (themePacksPromise === pending) { themePacksPromise = null; themePacksPendingKey = null; }
    if (revision === themePacksRevision) resetStudioBg3dBundleThemePacksCache();
  });
  return pending;
}

/** 이미 불러온 데이터가 있으면 돌려준다 (동기 조회용). 없으면 null. */
export function getLoadedStudioBg3dBundleThemePacks(): StudioBg3dBundleThemePacks | null {
  return themePacksLoaded;
}

/** 동일 내용의 재조회와 구분되는 발행 세대다. 값이 복귀한 ABA도 기존 lease를 무효화한다. */
export function getStudioBg3dBundleThemePacksPublicationRevision(): number {
  return themePacksPublicationRevision;
}

export function findStudioBg3dBundleAsset(assetId: string): StudioBg3dBundleThemePackAsset | null {
  return assetById?.get(assetId) ?? null;
}

export function findStudioBg3dBundleAssetByHash(
  hash: `sha256:${string}`,
): StudioBg3dBundleThemePackAsset | null {
  return assetByHash?.get(hash) ?? null;
}

/**
 * 번들 에셋 id인지 판정한다. 데이터가 로드돼 있으면 정확히 대조하고, 아직이면
 * 인제스션 id 접두사로 판정한다 (장면 복원처럼 동기 판정이 필요한 경로용).
 */
export function isStudioBg3dBundleAssetId(id: string): boolean {
  if (assetById) return assetById.has(id);
  return id.startsWith(STUDIO_BG3D_BUNDLE_ASSET_ID_PREFIX);
}

/** 에셋의 분류 (환경/소품). 배경 군중은 배치 가능 에셋에 포함되지 않는다. */
export function classifyStudioBg3dBundleAsset(
  asset: StudioBg3dBundleThemePackAsset,
  data: StudioBg3dBundleThemePacks,
): StudioBg3dBundleAssetClassification {
  return data.packs[asset.packIndex]?.category ?? "environment";
}

/** 원본 파일명에서 표시 이름을 만든다 (확장자 제거, 구분자 공백화). */
export function studioBg3dBundleAssetName(asset: StudioBg3dBundleThemePackAsset): string {
  const fileName = asset.path.split("/").at(-1) ?? asset.id;
  const stem = fileName.replace(/\.[^.]+$/u, "");
  const name = stem.replace(/[_-]+/gu, " ").replace(/\s+/gu, " ").trim();
  return name.length > 0 ? name : asset.id;
}

/**
 * 에셋 루트 + sha256 내용 주소 키를 서빙 URL로 바꾼다. 원본 폴더·파일명은 URL에 들어가지 않는다
 * (배포 플래너 scripts/plan-creator-bundle-deploy.mjs의 bundleV2PublicPath와 같은 규칙).
 */
export function studioBg3dBundleAssetUrl(
  asset: StudioBg3dBundleThemePackAsset,
  data: Pick<StudioBg3dBundleThemePacks, "assetRoot">,
): string {
  const root = data.assetRoot.endsWith("/") ? data.assetRoot : `${data.assetRoot}/`;
  return `${root}${asset.sha256.slice("sha256:".length)}.glb`;
}

/** 팩의 보류 에셋 총수 (변환 없음·예산 초과·외부 참조 합산). */
export function countStudioBg3dBundlePackDeferred(pack: StudioBg3dBundleThemePack): number {
  return pack.deferred.fbx + pack.deferred.gltf + pack.deferred.blend
    + Object.values(pack.deferred.overBudget).reduce((sum, amount) => sum + amount, 0);
}

/* ── 배포 가용성 판정 ──────────────────────────────────────────────────────
 * theme-packs.json은 메타데이터라 GLB 실물 배포 여부와 무관하게 읽힌다.
 * 실물 배포의 완료 신호는 배포 절차(scripts/plan-creator-bundle-deploy.mjs)가
 * 마지막 객체로 올리는 배포 인덱스다. 새 발행은 정적 index와 동일한 원문을 R2 완료 경로에서도 확인한다.
 * 인덱스가 없거나 키 방식(keyScheme)이 다르거나
 * 합계가 테마 팩 데이터와 어긋나면 "배포 미완료"로 판정해, 패널이 배치 가능으로
 * 오인시키지 않게 한다. */

export const STUDIO_BG3D_BUNDLE_DEPLOY_INDEX_URL =
  "/assets/studio/bundle-v2/manifest.json" as const;
export const STUDIO_BG3D_BUNDLE_DEPLOY_INDEX_SCHEMA =
  "toonstudio.bundle-v2-deploy-index.v1" as const;
/** 로더 URL(studioBg3dBundleAssetUrl)과 짝인 R2 키 방식. 인덱스가 다른 방식이면 객체를 찾을 수 없다. */
export const STUDIO_BG3D_BUNDLE_DEPLOY_INDEX_KEY_SCHEME = "sha256" as const;

export type StudioBg3dBundleDeployAvailability = "available" | "unavailable";

/**
 * 배포 인덱스를 읽어 테마 팩 데이터와 대조한다. 네트워크 오류·404·형식
 * 불일치·합계 불일치는 전부 "unavailable"다 (실패를 가능으로 읽지 않는다).
 */
export async function loadStudioBg3dBundleDeployAvailability(
  data: StudioBg3dBundleThemePacks,
  options: {
    readonly signal?: AbortSignal;
    readonly fetcher?: ThemePacksFetch;
    readonly url?: string;
  } = {},
): Promise<StudioBg3dBundleDeployAvailability> {
  try {
    const fetcher: ThemePacksFetch = options.fetcher
      ?? ((input, init) => globalThis.fetch(input, init));
    const release = themePacksReleaseBindings.get(data);
    if (release && options.url !== undefined && options.url !== release.index.url) return "unavailable";
    const response = await fetcher(release?.index.url ?? options.url ?? STUDIO_BG3D_BUNDLE_DEPLOY_INDEX_URL, {
      cache: release ? "force-cache" : "no-cache",
      credentials: "same-origin",
      signal: options.signal,
      ...(release ? { redirect: "error" as const } : {}),
    });
    if (!response.ok) return "unavailable";
    const raw = release ? await readVerifiedStudioBg3dBundleReleaseJson(response, release.index, options.signal) : await response.json();
    const index = record(raw);
    if (!index || index.schema !== STUDIO_BG3D_BUNDLE_DEPLOY_INDEX_SCHEMA || index.version !== 1) {
      return "unavailable";
    }
    // 옛 경로형 키로 올라간 인덱스(keyScheme 없음)는 합계가 같아도 sha256 URL의 객체를 가리키지 못한다.
    if (index.keyScheme !== STUDIO_BG3D_BUNDLE_DEPLOY_INDEX_KEY_SCHEME) return "unavailable";
    if (release && index.catalogSha256 !== release.catalog.sha256) return "unavailable";
    const expectedBytes = data.assets.reduce((sum, asset) => sum + asset.bytes, 0);
    if (index.files !== data.totals.placeableAssets || index.bytes !== expectedBytes) return "unavailable";
    if (release) {
      const completion = getStudioBg3dBundleReleaseCompletionBinding(release);
      const live = await fetcher(getStudioBg3dBundleReleaseCompletionRequestUrl(release), {
        cache: "no-store", credentials: "same-origin", redirect: "error", signal: options.signal,
      });
      // 같은 SHA와 길이이므로 정적 index에서 검증한 catalog·합계 결합도 그대로 유지된다.
      await readVerifiedStudioBg3dBundleReleaseJson(live, completion, options.signal);
    }
    return "available";
  } catch {
    return "unavailable";
  }
}
