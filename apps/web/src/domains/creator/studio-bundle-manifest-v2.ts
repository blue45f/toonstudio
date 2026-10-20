/**
 * Creator Bundle 매니페스트 v2 소비자 (설계: asset-multiformat-native-support-design-20261020 §4·§5-3).
 *
 * v1(manifest.json, GLB 전용 변환 자산)과 공존하는 원본 포맷 매니페스트
 * (`toonstudio.asset-bundle.v2`, 파일명 manifest-v2.json)의 파서 + 표면별 에셋 선택 +
 * 로드 디스크립터 생성을 맡는다. 인제스션 v2가 만든 파일을 그대로 읽는 읽기 전용 모듈이다.
 *
 * 권리 규약은 asset-delivery v1(studio-bundle-asset-delivery.ts)을 승계한다 (설계 §3-4):
 * - `inServiceOnly !== true`거나 `downloadable !== false`면 매니페스트 자체를 거부한다.
 * - 다운로드 동선 필드(original/download/downloadUrl/downloadPath)를 가진 항목은
 *   매니페스트·에셋·파일 어느 층위에서도 거부하고, 에셋의 `downloadable === true`도 거부한다.
 */

export const STUDIO_BUNDLE_MANIFEST_V2_KIND = "toonstudio.asset-bundle.v2" as const;

export const STUDIO_BUNDLE_MANIFEST_V2_FORMATS = [
  "glb",
  "gltf",
  "fbx",
  "obj",
  "dae",
  "blend",
] as const;

export type StudioBundleManifestV2Format = (typeof STUDIO_BUNDLE_MANIFEST_V2_FORMATS)[number];
export type StudioBundleManifestV2Role = "runtime" | "source-only";
export type StudioBundleManifestV2Surface = "web" | "unity-stage" | "offline";

/**
 * 표면별 포맷 선호 순위 (설계 §2 행렬). 목록에 없는 포맷은 그 표면에서 고를 수 없다.
 * offline은 전 포맷을 받되 원본 우선순위를 그대로 적용하고, blend는 source-only라 마지막이다.
 */
export const STUDIO_BUNDLE_MANIFEST_V2_SURFACE_FORMAT_PRIORITY: Readonly<
  Record<StudioBundleManifestV2Surface, readonly StudioBundleManifestV2Format[]>
> = Object.freeze({
  web: Object.freeze(["glb", "gltf", "fbx", "obj", "dae"]),
  "unity-stage": Object.freeze(["glb", "gltf"]),
  offline: Object.freeze(["glb", "gltf", "fbx", "obj", "dae", "blend"]),
});

/** v1 asset-delivery와 동일한 다운로드 필드 거부 목록. */
const DOWNLOAD_FIELD_KEYS: readonly string[] = ["original", "download", "downloadUrl", "downloadPath"];
const FORMAT_SET: ReadonlySet<string> = new Set(STUDIO_BUNDLE_MANIFEST_V2_FORMATS);
const SHA256 = /^[a-f0-9]{64}$/u;
const ASSET_ID = /^[a-z0-9-]{1,200}$/u;

export interface StudioBundleManifestV2File {
  readonly path: string;
  readonly kind: string;
  readonly bytes: number;
  readonly sha256: string | null;
}

export interface StudioBundleManifestV2Asset {
  readonly id: string;
  readonly packId: string;
  readonly format: StudioBundleManifestV2Format;
  readonly role: StudioBundleManifestV2Role;
  /** 매니페스트 기준 상대 경로 (주 파일). */
  readonly primary: string;
  /** 인제스션 입력 기준 원본 상대 경로. 선언이 없으면 null. */
  readonly sourcePath: string | null;
  readonly files: readonly StudioBundleManifestV2File[];
  readonly missingDependencies: readonly string[];
  /** missingDependencies가 비었을 때만 true. 선택에서 최후순위로 밀린다. */
  readonly complete: boolean;
  /** 구조 대응 변환 GLB가 있을 때만 그 상대 경로, 없으면 null (추측 금지 — 설계 §4). */
  readonly convertedGlb: string | null;
}

export interface StudioBundleManifestV2TotalsByFormat {
  readonly assets: number;
  readonly files: number;
  readonly complete: number;
}

export interface StudioBundleManifestV2Totals {
  readonly packs: number;
  readonly assets: number;
  readonly files: number;
  readonly bytes: number;
  readonly byFormat: Readonly<Partial<Record<StudioBundleManifestV2Format, StudioBundleManifestV2TotalsByFormat>>>;
  readonly runtimeUsable: number;
}

export interface StudioBundleManifestV2 {
  readonly version: 2;
  readonly kind: typeof STUDIO_BUNDLE_MANIFEST_V2_KIND;
  readonly generatedAt: string | null;
  readonly source: {
    readonly store: string | null;
    readonly bundle: string | null;
    readonly creators: readonly string[];
  } | null;
  readonly rights: {
    readonly holder: string | null;
    readonly inServiceOnly: true;
    readonly downloadable: false;
    readonly statement: string | null;
  } | null;
  readonly inServiceOnly: true;
  readonly downloadable: false;
  /** files[].path와 primary의 기준 (매니페스트 위치 상대). 빈 문자열이면 매니페스트 위치 자체. */
  readonly basePath: string;
  readonly totals: StudioBundleManifestV2Totals | null;
  readonly assets: readonly StudioBundleManifestV2Asset[];
}

/* ── 파서 헬퍼 (v1 asset-delivery와 같은 강도) ─────────────────────────────── */

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

function assertNoDownloadFields(target: Record<string, unknown>, message: string): void {
  if (DOWNLOAD_FIELD_KEYS.some((key) => Object.hasOwn(target, key))) {
    throw new TypeError(message);
  }
}

/** 서빙 경로 검증: 매니페스트 상대 경로만 허용하고 상위 탈출·절대 경로·스킴을 거부한다. */
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

function parseFile(value: unknown): StudioBundleManifestV2File {
  const file = record(value);
  if (!file) throw new TypeError("매니페스트 v2 파일 항목 형식이 올바르지 않습니다.");
  assertNoDownloadFields(file, "다운로드 동선을 포함할 수 없는 팩입니다.");
  if (file.downloadable === true) throw new TypeError("다운로드 동선을 포함할 수 없는 팩입니다.");
  const path = relativeServingPath(file.path, "매니페스트 v2 파일 경로가 올바르지 않습니다.");
  const kind = requiredText(file.kind, 40, "매니페스트 v2 파일 종류가 올바르지 않습니다.");
  let bytes = 0;
  if (file.bytes !== undefined) {
    if (!Number.isSafeInteger(file.bytes) || Number(file.bytes) < 0) {
      throw new TypeError("매니페스트 v2 파일 크기가 올바르지 않습니다.");
    }
    bytes = Number(file.bytes);
  }
  let sha256: string | null = null;
  if (file.sha256 !== undefined && file.sha256 !== null) {
    if (typeof file.sha256 !== "string" || !SHA256.test(file.sha256)) {
      throw new TypeError("매니페스트 v2 파일 해시가 올바르지 않습니다.");
    }
    sha256 = file.sha256;
  }
  return Object.freeze({ path, kind, bytes, sha256 });
}

function parseAsset(value: unknown): StudioBundleManifestV2Asset {
  const asset = record(value);
  if (!asset) throw new TypeError("매니페스트 v2 에셋 형식이 올바르지 않습니다.");
  assertNoDownloadFields(asset, "다운로드 동선을 포함할 수 없는 팩입니다.");
  if (asset.downloadable === true) throw new TypeError("다운로드 동선을 포함할 수 없는 팩입니다.");
  if (typeof asset.id !== "string" || !ASSET_ID.test(asset.id)) {
    throw new TypeError("매니페스트 v2 에셋 식별자가 올바르지 않습니다.");
  }
  const packId = requiredText(asset.packId, 200, "매니페스트 v2 팩 식별자가 올바르지 않습니다.");
  if (typeof asset.format !== "string" || !FORMAT_SET.has(asset.format)) {
    throw new TypeError("매니페스트 v2 에셋 포맷이 올바르지 않습니다.");
  }
  const format = asset.format as StudioBundleManifestV2Format;
  let role: StudioBundleManifestV2Role;
  if (asset.role === undefined) {
    // 설계 §4: blend는 source-only, 나머지는 runtime이 기본이다.
    role = format === "blend" ? "source-only" : "runtime";
  } else if (asset.role === "runtime" || asset.role === "source-only") {
    role = asset.role;
  } else {
    throw new TypeError("매니페스트 v2 에셋 역할이 올바르지 않습니다.");
  }
  if (format === "blend" && role !== "source-only") {
    throw new TypeError("blend 에셋은 source-only로만 선언할 수 있습니다.");
  }
  const primary = relativeServingPath(asset.primary, "매니페스트 v2 주 파일 경로가 올바르지 않습니다.");
  const sourcePath = optionalText(asset.sourcePath, 1024, "매니페스트 v2 원본 경로가 올바르지 않습니다.");
  if (!Array.isArray(asset.files)) {
    throw new TypeError("매니페스트 v2 에셋 파일 목록이 올바르지 않습니다.");
  }
  const files = Object.freeze(asset.files.map((file) => parseFile(file)));
  let missingDependencies: readonly string[] = Object.freeze([]);
  if (asset.missingDependencies !== undefined) {
    if (!Array.isArray(asset.missingDependencies)
      || asset.missingDependencies.some((entry) => typeof entry !== "string" || entry.length === 0
        || entry.length > 1024 || hasControlCharacter(entry))) {
      throw new TypeError("매니페스트 v2 누락 의존성 기록이 올바르지 않습니다.");
    }
    missingDependencies = Object.freeze([...asset.missingDependencies] as string[]);
  }
  let convertedGlb: string | null = null;
  if (asset.convertedGlb !== undefined && asset.convertedGlb !== null) {
    convertedGlb = relativeServingPath(asset.convertedGlb, "매니페스트 v2 변환 GLB 경로가 올바르지 않습니다.");
  }
  return Object.freeze({
    id: asset.id,
    packId,
    format,
    role,
    primary,
    sourcePath,
    files,
    missingDependencies,
    complete: missingDependencies.length === 0,
    convertedGlb,
  });
}

function parseTotals(value: unknown): StudioBundleManifestV2Totals | null {
  if (value === undefined || value === null) return null;
  const totals = record(value);
  if (!totals) throw new TypeError("매니페스트 v2 합계 형식이 올바르지 않습니다.");
  const count = (input: unknown): number => {
    if (input === undefined) return 0;
    if (!Number.isSafeInteger(input) || Number(input) < 0) {
      throw new TypeError("매니페스트 v2 합계 형식이 올바르지 않습니다.");
    }
    return Number(input);
  };
  const byFormat: Partial<Record<StudioBundleManifestV2Format, StudioBundleManifestV2TotalsByFormat>> = {};
  if (totals.byFormat !== undefined) {
    const rawByFormat = record(totals.byFormat);
    if (!rawByFormat) throw new TypeError("매니페스트 v2 합계 형식이 올바르지 않습니다.");
    for (const [format, entry] of Object.entries(rawByFormat)) {
      if (!FORMAT_SET.has(format)) continue;
      const entryRecord = record(entry);
      if (!entryRecord) throw new TypeError("매니페스트 v2 합계 형식이 올바르지 않습니다.");
      byFormat[format as StudioBundleManifestV2Format] = Object.freeze({
        assets: count(entryRecord.assets),
        files: count(entryRecord.files),
        complete: count(entryRecord.complete),
      });
    }
  }
  return Object.freeze({
    packs: count(totals.packs),
    assets: count(totals.assets),
    files: count(totals.files),
    bytes: count(totals.bytes),
    byFormat: Object.freeze(byFormat),
    runtimeUsable: count(totals.runtimeUsable),
  });
}

/**
 * 매니페스트 v2 원문을 검증해 동결된 구조로 돌려준다. kind/version이 다르거나 권리
 * 강제(inServiceOnly/downloadable)를 어기거나 다운로드 필드를 가진 항목이 있으면 던진다.
 */
export function parseStudioBundleManifestV2(value: unknown): StudioBundleManifestV2 {
  const manifest = record(value);
  if (!manifest || manifest.kind !== STUDIO_BUNDLE_MANIFEST_V2_KIND || manifest.version !== 2
    || !Array.isArray(manifest.assets)) {
    throw new TypeError("매니페스트 v2 형식이 올바르지 않습니다.");
  }
  assertNoDownloadFields(manifest, "다운로드 동선을 포함할 수 없는 팩입니다.");
  // 권리 강제 (설계 §3-4, v1 규약 승계): 서비스 내 전용 선언이 아니면 이 소비자의 대상이 아니다.
  if (manifest.inServiceOnly !== true || manifest.downloadable !== false) {
    throw new TypeError("서비스 내 사용 전용으로 선언되지 않은 매니페스트는 불러올 수 없습니다.");
  }
  let rights: StudioBundleManifestV2["rights"] = null;
  if (manifest.rights !== undefined && manifest.rights !== null) {
    const rawRights = record(manifest.rights);
    if (!rawRights) throw new TypeError("매니페스트 v2 권리 선언 형식이 올바르지 않습니다.");
    assertNoDownloadFields(rawRights, "다운로드 동선을 포함할 수 없는 팩입니다.");
    if (rawRights.inServiceOnly !== true || rawRights.downloadable !== false) {
      throw new TypeError("서비스 내 사용 전용으로 선언되지 않은 매니페스트는 불러올 수 없습니다.");
    }
    rights = Object.freeze({
      holder: optionalText(rawRights.holder, 200, "매니페스트 v2 권리 선언이 올바르지 않습니다."),
      inServiceOnly: true,
      downloadable: false,
      statement: optionalText(rawRights.statement, 1024, "매니페스트 v2 권리 선언이 올바르지 않습니다."),
    });
  }
  let source: StudioBundleManifestV2["source"] = null;
  if (manifest.source !== undefined && manifest.source !== null) {
    const rawSource = record(manifest.source);
    if (!rawSource) throw new TypeError("매니페스트 v2 출처 선언 형식이 올바르지 않습니다.");
    let creators: readonly string[] = Object.freeze([]);
    if (rawSource.creators !== undefined) {
      if (!Array.isArray(rawSource.creators)
        || rawSource.creators.some((entry) => typeof entry !== "string" || entry.length === 0
          || entry.length > 200 || hasControlCharacter(entry))) {
        throw new TypeError("매니페스트 v2 출처 선언 형식이 올바르지 않습니다.");
      }
      creators = Object.freeze([...rawSource.creators] as string[]);
    }
    source = Object.freeze({
      store: optionalText(rawSource.store, 200, "매니페스트 v2 출처 선언이 올바르지 않습니다."),
      bundle: optionalText(rawSource.bundle, 200, "매니페스트 v2 출처 선언이 올바르지 않습니다."),
      creators,
    });
  }
  let basePath = "";
  if (manifest.basePath !== undefined && manifest.basePath !== null) {
    if (typeof manifest.basePath !== "string" || manifest.basePath.length > 1024
      || hasControlCharacter(manifest.basePath)) {
      throw new TypeError("매니페스트 v2 기준 경로가 올바르지 않습니다.");
    }
    basePath = manifest.basePath;
  }
  const ids = new Set<string>();
  const assets = manifest.assets.map((entry) => {
    const asset = parseAsset(entry);
    if (ids.has(asset.id)) throw new TypeError("매니페스트 v2 에셋 식별자가 중복됩니다.");
    ids.add(asset.id);
    return asset;
  });
  return Object.freeze({
    version: 2,
    kind: STUDIO_BUNDLE_MANIFEST_V2_KIND,
    generatedAt: optionalText(manifest.generatedAt, 80, "매니페스트 v2 생성 시각이 올바르지 않습니다."),
    source,
    rights,
    inServiceOnly: true,
    downloadable: false,
    basePath,
    totals: parseTotals(manifest.totals),
    assets: Object.freeze(assets),
  });
}

/* ── 표면별 선택 ───────────────────────────────────────────────────────────── */

function isEligibleForSurface(
  asset: StudioBundleManifestV2Asset,
  surface: StudioBundleManifestV2Surface,
): boolean {
  const priority = STUDIO_BUNDLE_MANIFEST_V2_SURFACE_FORMAT_PRIORITY[surface];
  if (!priority.includes(asset.format)) return false;
  // 런타임 표면(web·unity-stage)은 runtime 역할만, offline은 source-only까지 받는다.
  if (surface !== "offline" && asset.role !== "runtime") return false;
  return true;
}

/**
 * 표면에 맞는 에셋을 선호 순으로 정렬해 돌려준다. 정렬 키는
 * ① 의존 완결(complete) 우선 — 불완전 에셋은 포맷 선호와 무관하게 최후순위,
 * ② 표면 포맷 선호, ③ id 사전순(결정성)이다.
 */
export function selectManifestV2AssetsForSurface(
  assets: readonly StudioBundleManifestV2Asset[],
  surface: StudioBundleManifestV2Surface,
): readonly StudioBundleManifestV2Asset[] {
  const priority = STUDIO_BUNDLE_MANIFEST_V2_SURFACE_FORMAT_PRIORITY[surface];
  const rank = (asset: StudioBundleManifestV2Asset): number => priority.indexOf(asset.format);
  return Object.freeze(assets
    .filter((asset) => isEligibleForSurface(asset, surface))
    .sort((a, b) => {
      if (a.complete !== b.complete) return a.complete ? -1 : 1;
      const byFormat = rank(a) - rank(b);
      if (byFormat !== 0) return byFormat;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    }));
}

/** 표면 최적 에셋 단건. 없으면 null. */
export function selectManifestV2AssetForSurface(
  assets: readonly StudioBundleManifestV2Asset[],
  surface: StudioBundleManifestV2Surface,
): StudioBundleManifestV2Asset | null {
  return selectManifestV2AssetsForSurface(assets, surface)[0] ?? null;
}

/** packId로 좁힌 표면별 목록. 같은 팩의 포맷 변형들 중에서 표면이 고르는 순서 그대로다. */
export function listManifestV2PackAssetsForSurface(
  assets: readonly StudioBundleManifestV2Asset[],
  packId: string,
  surface: StudioBundleManifestV2Surface,
): readonly StudioBundleManifestV2Asset[] {
  return selectManifestV2AssetsForSurface(
    assets.filter((asset) => asset.packId === packId),
    surface,
  );
}

/** packId + 표면 선호로 단건 조회. 없으면 null. */
export function findManifestV2AssetForSurface(
  assets: readonly StudioBundleManifestV2Asset[],
  packId: string,
  surface: StudioBundleManifestV2Surface,
): StudioBundleManifestV2Asset | null {
  return listManifestV2PackAssetsForSurface(assets, packId, surface)[0] ?? null;
}

/* ── 로드 디스크립터 ───────────────────────────────────────────────────────── */

export interface StudioBundleManifestV2LoadDescriptor {
  readonly assetId: string;
  readonly packId: string;
  readonly format: StudioBundleManifestV2Format;
  readonly role: StudioBundleManifestV2Role;
  readonly complete: boolean;
  /** 주 파일의 서빙 URL (basePath/baseUrl과 primary를 결합한 결과). */
  readonly primaryUrl: string;
  /** 의존 파일 해석 기준 디렉터리 URL (primaryUrl의 폴더, 끝 슬래시 포함). */
  readonly baseUrl: string;
  /** 주 파일 폴더 기준 상대 참조를 서빙 URL로 바꾸는 해석기 (../ 상위 참조 포함). */
  readonly resolveDependency: (relativePath: string) => string;
  readonly files: readonly StudioBundleManifestV2File[];
  readonly missingDependencies: readonly string[];
}

const ABSOLUTE_OR_SCHEME_URL = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|\/\/|\/)/u;

function joinUrl(base: string, relativePath: string): string {
  if (!base) return relativePath;
  if (ABSOLUTE_OR_SCHEME_URL.test(relativePath)) return relativePath;
  const joined = base.endsWith("/") ? base + relativePath : `${base}/${relativePath}`;
  const schemePrefix = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//u.exec(joined)?.[0] ?? "";
  const rest = joined.slice(schemePrefix.length);
  const anchored = rest.startsWith("/");
  const segments: string[] = [];
  for (const segment of rest.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (segments.length > 0 && segments[segments.length - 1] !== "..") segments.pop();
      else if (!anchored && schemePrefix.length === 0) segments.push("..");
      continue;
    }
    segments.push(segment);
  }
  return schemePrefix + (anchored ? "/" : "") + segments.join("/");
}

/**
 * 에셋 1건의 로드 디스크립터를 만든다. 통합 로더(loadStudioBg3dModelByFormat)의
 * {url} 입력 + baseUrl/resolveDependency 옵션으로 그대로 넘길 수 있는 형태다.
 * options.baseUrl이 있으면 매니페스트 basePath보다 우선한다 (매니페스트 파일이 놓인
 * 실제 서빙 루트처럼, 매니페스트 내용과 다른 배포 루트를 호출자가 아는 경우).
 */
export function createStudioBundleManifestV2LoadDescriptor(
  manifest: Pick<StudioBundleManifestV2, "basePath">,
  asset: StudioBundleManifestV2Asset,
  options: { readonly baseUrl?: string } = {},
): StudioBundleManifestV2LoadDescriptor {
  const root = options.baseUrl ?? manifest.basePath;
  const primaryUrl = joinUrl(root, asset.primary);
  const lastSlash = primaryUrl.lastIndexOf("/");
  const baseUrl = lastSlash >= 0 ? primaryUrl.slice(0, lastSlash + 1) : "";
  const resolveDependency = (relativePath: string): string => {
    if (!relativePath || ABSOLUTE_OR_SCHEME_URL.test(relativePath)) return relativePath;
    return joinUrl(baseUrl, relativePath.replace(/^\.\//u, ""));
  };
  return Object.freeze({
    assetId: asset.id,
    packId: asset.packId,
    format: asset.format,
    role: asset.role,
    complete: asset.complete,
    primaryUrl,
    baseUrl,
    resolveDependency,
    files: asset.files,
    missingDependencies: asset.missingDependencies,
  });
}

/** packId + 표면 선호로 고른 에셋의 디스크립터까지 한 번에 만든다. 없으면 null. */
export function createStudioBundleManifestV2LoadDescriptorForSurface(
  manifest: StudioBundleManifestV2,
  packId: string,
  surface: StudioBundleManifestV2Surface,
  options: { readonly baseUrl?: string } = {},
): StudioBundleManifestV2LoadDescriptor | null {
  const asset = findManifestV2AssetForSurface(manifest.assets, packId, surface);
  if (!asset) return null;
  return createStudioBundleManifestV2LoadDescriptor(manifest, asset, options);
}
