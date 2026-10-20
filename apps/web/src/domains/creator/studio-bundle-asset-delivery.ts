import type { StudioAsset } from "./studio-asset-library";

/**
 * Creator Bundle 렌더 소품 전용 배포 모듈.
 *
 * CC0 로더(studio-cc0-asset-delivery.ts)는 라이선스 검증이 CC0 전용으로 고정돼 있어
 * (licenseId 타입·deed URL·제공자 허용목록) 번들 에셋을 통과시킬 수 없다. 이 모듈은
 * 같은 검증 강도(sha256·바이트·치수·무결성)를 유지하면서 라이선스 검증을 일반화한다:
 * 허용 라이선스는 코드에 고정하지 않고 팩 매니페스트가 선언한 값(id·제공자·출처 호스트·
 * deed URL)으로 검증한다.
 *
 * 서비스 내 사용 전용 팩이다. 렌더 이미지만 나가고 원본 모델·텍스처 파일은 나가지
 * 않으므로 다운로드 관련 필드·동선은 존재 자체를 허용하지 않고, kind도 렌더 이미지
 * 종류(prop-image·background)로만 제한한다.
 */
export const STUDIO_BUNDLE_DELIVERY_ROOT = "/assets/studio/bundle-renders-v1/";
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;
/** 이 팩의 에셋이 CC0라고 표기하는 것은 권리 오표기라 명시적으로 거부한다. */
const MISLABELED_LICENSE_IDS: ReadonlySet<string> = new Set(["CC0-1.0"]);
const DOWNLOAD_FIELD_KEYS: readonly string[] = ["original", "download", "downloadUrl", "downloadPath"];
const RENDER_VARIANTS: ReadonlySet<string> = new Set(["color", "line"]);

export type StudioBundleAssetKind = "background" | "prop-image";

export interface StudioBundleAsset {
  readonly id: string;
  readonly name: string;
  readonly kind: StudioBundleAssetKind;
  readonly category: string;
  readonly path: string;
  readonly previewPath?: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
  /** 팩 매니페스트가 선언한 라이선스 식별자. CC0처럼 코드에 고정하지 않는다. */
  readonly licenseId: string;
  /** 매니페스트가 선언한 deed URL. 선언이 없으면 null. */
  readonly licenseUrl: string | null;
  readonly provider: string;
  readonly sourceUrl: string;
  /** Expression style is independent of technical and visual approval. */
  readonly style: string;
  readonly visualReviewed: boolean;
  readonly curationStatus: string;
  readonly studioRuntimeVerified: boolean;
  readonly selectionTerm: string;
  readonly technicalChecks: readonly string[];
  readonly renderVariants: readonly string[];
  readonly derivedFrom?: string;
  readonly derivedFromPack?: string;
  readonly sourceModelSha256?: string;
}

export const STUDIO_BUNDLE_CATEGORY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "rendered-prop": "2D 투명 소품 · 3D 원본 렌더",
  "rendered-scene": "2D 배경 · 3D 장면 렌더",
});

interface LicenseDeclaration {
  readonly provider: string;
  readonly sourceHost: string;
  readonly deedUrl: string | null;
}

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

function curationText(asset: Record<string, unknown>, key: string, fallback: string, maximum = 160): string {
  const value = asset[key];
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.length > maximum || hasControlCharacter(value)) {
    throw new TypeError("에셋 검수 기록 형식이 올바르지 않습니다.");
  }
  return value.trim() || fallback;
}

function curationBoolean(asset: Record<string, unknown>, key: string): boolean {
  const value = asset[key];
  if (value !== undefined && typeof value !== "boolean") {
    throw new TypeError("에셋 검수 기록 형식이 올바르지 않습니다.");
  }
  return value === true;
}

/** 매니페스트가 선언한 deed URL·출처 URL의 공통 형식 검증 (https, 자격증명·포트 없음). */
function parseDeclaredHttpsUrl(value: unknown, message: string): URL {
  if (typeof value !== "string" || value.length > 512 || hasControlCharacter(value)) {
    throw new TypeError(message);
  }
  const url = new URL(value);
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.port) {
    throw new TypeError(message);
  }
  return url;
}

function parseLicenseDeclarations(pack: Record<string, unknown>): ReadonlyMap<string, LicenseDeclaration> | null {
  if (pack.licenses === undefined) return null;
  if (!Array.isArray(pack.licenses) || pack.licenses.length === 0) {
    throw new TypeError("팩 라이선스 선언 형식이 올바르지 않습니다.");
  }
  const declarations = new Map<string, LicenseDeclaration>();
  for (const input of pack.licenses) {
    const declaration = record(input);
    if (!declaration) throw new TypeError("팩 라이선스 선언 형식이 올바르지 않습니다.");
    const id = requiredText(declaration.id, 80, "팩 라이선스 선언 형식이 올바르지 않습니다.");
    if (MISLABELED_LICENSE_IDS.has(id) || declarations.has(id)) {
      throw new TypeError("팩 라이선스 선언이 중복되거나 올바르지 않습니다.");
    }
    const provider = requiredText(declaration.provider, 80, "팩 라이선스 선언 형식이 올바르지 않습니다.");
    const sourceHost = requiredText(declaration.sourceHost, 253, "팩 라이선스 선언 형식이 올바르지 않습니다.").toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/u.test(sourceHost)) {
      throw new TypeError("팩 라이선스 선언의 출처 호스트가 올바르지 않습니다.");
    }
    let deedUrl: string | null = null;
    if (declaration.deedUrl !== undefined && declaration.deedUrl !== null) {
      parseDeclaredHttpsUrl(declaration.deedUrl, "팩 라이선스 선언의 deed URL이 올바르지 않습니다.");
      deedUrl = declaration.deedUrl as string;
    }
    declarations.set(id, Object.freeze({provider, sourceHost, deedUrl}));
  }
  return declarations;
}

function parsePack(value: unknown): ReadonlyMap<string, LicenseDeclaration> | null {
  const pack = record(value);
  if (!pack || typeof pack.id !== "string" || pack.id.length === 0 || pack.id.length > 80
    || hasControlCharacter(pack.id)) {
    throw new TypeError("에셋 팩 선언이 올바르지 않습니다.");
  }
  // 서비스 내 사용 전용 팩이라는 선언이 없으면 이 로더의 대상이 아니다.
  if (pack.inServiceOnly !== true || pack.downloadable !== false) {
    throw new TypeError("서비스 내 사용 전용으로 선언되지 않은 팩은 번들 렌더 로더로 불러올 수 없습니다.");
  }
  return parseLicenseDeclarations(pack);
}

/**
 * 에셋 라이선스를 팩 선언과 대조한다. 팩이 licenses를 선언했으면 그 선언이 허용목록이고,
 * 선언이 없으면 에셋들의 선언 자체에서 도출하되 같은 라이선스 id가 서로 다른 제공자·
 * 호스트·deed와 함께 나타나면(선언 불일치) 거부한다. CC0처럼 특정 라이선스 값을
 * 코드에 고정하지 않되, 선언되지 않은 값의 혼입은 막는 구조다.
 */
function verifyLicense(
  asset: Record<string, unknown>,
  declarations: ReadonlyMap<string, LicenseDeclaration> | null,
  derived: Map<string, LicenseDeclaration>,
): {licenseId: string; licenseUrl: string | null; provider: string; sourceUrl: string} {
  const license = record(asset.license);
  if (!license) throw new TypeError("에셋 라이선스 기록이 없습니다.");
  const licenseId = requiredText(license.id, 80, "에셋 라이선스 식별자가 올바르지 않습니다.");
  if (MISLABELED_LICENSE_IDS.has(licenseId)) {
    throw new TypeError("번들 렌더 팩의 에셋은 CC0로 표기할 수 없습니다.");
  }
  const provider = requiredText(license.provider, 80, "에셋 제공자 기록이 올바르지 않습니다.");
  const source = parseDeclaredHttpsUrl(license.sourceUrl, "에셋 출처 URL이 올바르지 않습니다.");
  if (license.commercialUse !== true || license.redistributionAllowed !== false || license.inServiceOnly !== true) {
    throw new TypeError("상업 사용·서비스 내 전용 조건을 충족하지 않는 라이선스입니다.");
  }
  if (license.checkedOn !== undefined && license.checkedOn !== null
    && (typeof license.checkedOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(license.checkedOn))) {
    throw new TypeError("라이선스 확인일 형식이 올바르지 않습니다.");
  }
  let licenseUrl: string | null = null;
  if (license.url !== undefined && license.url !== null) {
    parseDeclaredHttpsUrl(license.url, "라이선스 deed URL이 올바르지 않습니다.");
    licenseUrl = license.url as string;
  }
  const facts: LicenseDeclaration = {provider, sourceHost: source.hostname, deedUrl: licenseUrl};
  const declared = declarations?.get(licenseId);
  if (declarations) {
    if (!declared || declared.provider !== provider || declared.sourceHost !== source.hostname
      || declared.deedUrl !== licenseUrl) {
      throw new TypeError("팩이 선언하지 않은 라이선스입니다.");
    }
  } else {
    const previous = derived.get(licenseId);
    if (previous && (previous.provider !== provider || previous.sourceHost !== source.hostname
      || previous.deedUrl !== licenseUrl)) {
      throw new TypeError("같은 라이선스 식별자에 서로 다른 선언이 섞여 있습니다.");
    }
    derived.set(licenseId, Object.freeze(facts));
  }
  return {licenseId, licenseUrl, provider, sourceUrl: license.sourceUrl as string};
}

function parseOptionalText(asset: Record<string, unknown>, key: string, maximum: number): string | undefined {
  const value = asset[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || hasControlCharacter(value)) {
    throw new TypeError("에셋 파생 기록 형식이 올바르지 않습니다.");
  }
  return value;
}

function parseStringList(asset: Record<string, unknown>, key: string, maximumEntries: number): readonly string[] {
  const value = asset[key];
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > maximumEntries
    || value.some((entry) => typeof entry !== "string" || entry.length === 0 || entry.length > 80 || hasControlCharacter(entry))) {
    throw new TypeError("에셋 검수 기록 형식이 올바르지 않습니다.");
  }
  return Object.freeze([...value] as string[]);
}

export function studioBundleAssetUrl(relativePath: string): string {
  if (!/^(?:assets|previews)\/[a-zA-Z0-9_./-]+\.(?:webp|png|jpg)$/u.test(relativePath)
    || relativePath.split("/").some(part => !part || part === "." || part === "..")) {
    throw new TypeError("허용되지 않은 내장 에셋 경로입니다.");
  }
  return STUDIO_BUNDLE_DELIVERY_ROOT + relativePath;
}

export function parseStudioBundleCatalog(value: unknown): readonly StudioBundleAsset[] {
  const manifest = record(value);
  if (manifest?.schema !== "toonstudio.asset-delivery.v1" || !Array.isArray(manifest.assets)
    || manifest.assets.length > 2400) throw new TypeError("에셋 목록 형식이 올바르지 않습니다.");
  const declarations = parsePack(manifest.pack);
  const derived = new Map<string, LicenseDeclaration>();
  const ids = new Set<string>();
  const assets: StudioBundleAsset[] = [];
  for (const input of manifest.assets) {
    const asset = record(input);
    if (!asset || typeof asset.id !== "string" || !/^[a-z0-9-]{1,200}$/u.test(asset.id) || ids.has(asset.id)) {
      throw new TypeError("에셋 식별자가 올바르지 않거나 중복됩니다.");
    }
    ids.add(asset.id);
    // 렌더 결과물만 나가는 팩이라 다운로드 동선을 실은 항목은 초안 슬롯이라도 허용하지 않는다.
    if (DOWNLOAD_FIELD_KEYS.some((key) => Object.hasOwn(asset, key)) || asset.downloadable === true) {
      throw new TypeError("다운로드 동선을 포함할 수 없는 팩입니다.");
    }
    // 렌더 전 초안 슬롯(curationStatus가 draft-로 시작)은 납품 가능한 에셋이 아니라 건너뜐다.
    // 무결성 필드가 채워진 완성 항목만 아래 전수 검증을 통과해야 노출된다.
    if (typeof asset.curationStatus === "string" && asset.curationStatus.startsWith("draft")) continue;
    if (typeof asset.name !== "string" || asset.name.length > 160
      || !["background", "prop-image"].includes(String(asset.kind))
      || typeof asset.category !== "string" || asset.category.length > 80
      || typeof asset.path !== "string" || typeof asset.sha256 !== "string" || !SHA256.test(asset.sha256)
      || !Number.isSafeInteger(asset.bytes) || Number(asset.bytes) <= 0 || Number(asset.bytes) > MAX_IMAGE_BYTES) {
      throw new TypeError("에셋 출처·해시·종류 검증에 실패했습니다.");
    }
    const license = verifyLicense(asset, declarations, derived);
    studioBundleAssetUrl(asset.path);
    if (asset.previewPath !== undefined) {
      if (typeof asset.previewPath !== "string") throw new TypeError("에셋 미리보기 경로가 올바르지 않습니다.");
      studioBundleAssetUrl(asset.previewPath);
    }
    const kind = asset.kind as StudioBundleAssetKind;
    if (!asset.path.endsWith(".webp") || !Number.isSafeInteger(asset.width) || !Number.isSafeInteger(asset.height)
      || Number(asset.width) < 1 || Number(asset.height) < 1 || Number(asset.width) * Number(asset.height) > 32 * 1024 * 1024) {
      throw new TypeError("이미지 크기 또는 형식이 맞지 않습니다.");
    }
    if (asset.renderResolution !== undefined) {
      const resolution = asset.renderResolution;
      if (!Array.isArray(resolution) || resolution.length !== 2
        || resolution[0] !== asset.width || resolution[1] !== asset.height) {
        throw new TypeError("렌더 해상도 기록이 이미지 크기와 일치하지 않습니다.");
      }
    }
    const derivedFrom = parseOptionalText(asset, "derivedFrom", 200);
    const derivedFromPack = parseOptionalText(asset, "derivedFromPack", 200);
    let sourceModelSha256: string | undefined;
    if (asset.sourceModelSha256 !== undefined && asset.sourceModelSha256 !== null) {
      if (typeof asset.sourceModelSha256 !== "string" || !SHA256.test(asset.sourceModelSha256) || !derivedFrom) {
        throw new TypeError("원본 모델 파생 기록이 올바르지 않습니다.");
      }
      sourceModelSha256 = asset.sourceModelSha256;
    }
    let renderVariants: readonly string[] = Object.freeze(["color"]);
    if (asset.renderVariants !== undefined) {
      const variants = parseStringList(asset, "renderVariants", 2);
      if (variants.length === 0 || variants.some((variant) => !RENDER_VARIANTS.has(variant))
        || new Set(variants).size !== variants.length) {
        throw new TypeError("렌더 변형 기록이 올바르지 않습니다.");
      }
      renderVariants = variants;
    }
    assets.push(Object.freeze({
      id: asset.id, name: asset.name, kind, category: asset.category,
      path: asset.path, ...(typeof asset.previewPath === "string" ? {previewPath: asset.previewPath} : {}),
      bytes: Number(asset.bytes), sha256: asset.sha256,
      width: Number(asset.width), height: Number(asset.height),
      licenseId: license.licenseId, licenseUrl: license.licenseUrl,
      provider: license.provider, sourceUrl: license.sourceUrl,
      style: curationText(asset, "style", "unspecified", 80),
      visualReviewed: curationBoolean(asset, "visualReviewed"),
      curationStatus: curationText(asset, "curationStatus", "unreviewed", 80),
      studioRuntimeVerified: curationBoolean(asset, "studioRuntimeVerified"),
      selectionTerm: curationText(asset, "selectionTerm", "", 80),
      technicalChecks: parseStringList(asset, "technicalChecks", 16),
      renderVariants,
      ...(derivedFrom ? {derivedFrom} : {}),
      ...(derivedFromPack ? {derivedFromPack} : {}),
      ...(sourceModelSha256 ? {sourceModelSha256} : {}),
    }));
  }
  return Object.freeze(assets);
}

/** 검수 게이트: 컨택트시트 검수(visualReviewed)를 통과한 항목만 새 선택에 노출한다. */
export function isStudioBundleAssetEligibleForSelection(asset: StudioBundleAsset): boolean {
  return asset.visualReviewed && asset.curationStatus !== "rejected";
}

export function filterStudioBundleAssets(assets: readonly StudioBundleAsset[], query: string, kind?: StudioBundleAssetKind): readonly StudioBundleAsset[] {
  const terms = query.normalize("NFKC").toLocaleLowerCase("ko-KR").split(/\s+/u).filter(Boolean);
  return assets.filter(asset => (!kind || asset.kind === kind) && terms.every(term =>
    [asset.name, asset.category, STUDIO_BUNDLE_CATEGORY_LABELS[asset.category] ?? "", asset.provider, asset.licenseId, asset.selectionTerm]
      .join(" ").normalize("NFKC").toLocaleLowerCase("ko-KR").includes(term)));
}

async function boundedBytes(url: string, limit: number, signal?: AbortSignal, cache: RequestCache = "default"): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url, {signal, credentials: "same-origin", redirect: "error", cache});
  if (!response.ok || Number(response.headers.get("content-length") ?? 0) > limit) throw new Error("에셋을 불러오지 못했습니다.");
  if (!response.body) throw new Error("에셋 응답 본문이 없습니다.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error("에셋 다운로드 크기 제한을 초과했습니다."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

export async function loadStudioBundleCatalog(signal?: AbortSignal): Promise<readonly StudioBundleAsset[]> {
  const bytes = await boundedBytes(STUDIO_BUNDLE_DELIVERY_ROOT + "manifest.json?v=bundle-renders-v1", MAX_MANIFEST_BYTES, signal, "no-cache");
  return parseStudioBundleCatalog(JSON.parse(new TextDecoder().decode(bytes)) as unknown);
}

export async function createStudioBundleImageRecord(asset: StudioBundleAsset, signal?: AbortSignal): Promise<StudioAsset> {
  const bytes = await boundedBytes(studioBundleAssetUrl(asset.path), MAX_IMAGE_BYTES, signal);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
  if (bytes.byteLength !== asset.bytes || hash !== asset.sha256) throw new Error("에셋 무결성 검증에 실패했습니다.");
  const bitmap = await createImageBitmap(new Blob([bytes], {type: "image/webp"}));
  try {
    if (bitmap.width !== asset.width || bitmap.height !== asset.height) throw new Error("에셋 이미지 크기가 일치하지 않습니다.");
  } finally { bitmap.close(); }
  signal?.throwIfAborted();
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return {id: `bundle:${asset.id}`, name: asset.name, dataUrl: `data:image/webp;base64,${btoa(binary)}`,
    contentHash: `sha256:${hash}`, width: asset.width, height: asset.height, createdAt: Date.UTC(2026, 9, 20), kind: "imported",
    rights: {sourceKind: "imported", sourceId: asset.id, licenseId: asset.licenseId, licenseLabel: asset.licenseId,
      licenseUrl: asset.licenseUrl, attributionRequired: false,
      attributionText: `${asset.provider} — ${asset.sourceUrl}`, rightsConfirmed: true}};
}
