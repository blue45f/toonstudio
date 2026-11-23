/**
 * 로컬 시스템 폰트(`window.queryLocalFonts`) ↔ 식자 도구 & Rights BOM 상업 라이선스 경고 브리지.
 *
 * - `queryLocalFonts()` 결과를 한글/영문 패밀리 단위로 중복 제거·정렬한다.
 * - 로컬 PC 시스템 폰트에는 `commercialLicenseVerified: false` 및 KO/EN Rights BOM 출고 경고를 부착한다.
 * - 미지원·권한 거부·오류 시 OFL-1.1 검증 표준 웹 안전 한글 폰트 폴백 목록을 제공한다.
 */

export const LOCAL_SYSTEM_FONT_RIGHTS_WARNING_KO = "로컬 PC 시스템 폰트 — 상업 연재 출고 전 라이선스 확인 필요";
export const LOCAL_SYSTEM_FONT_RIGHTS_WARNING_EN = "Local PC system font — verify commercial serialization license before export";

export interface LocalFontDataLike {
  readonly family: string;
  readonly fullName?: string;
  readonly postscriptName?: string;
  readonly style?: string;
  blob?: () => Promise<Blob>;
}

export interface LocalFontAccessWindowLike {
  readonly queryLocalFonts?: (options?: { readonly postscriptNames?: readonly string[] }) => Promise<readonly LocalFontDataLike[]>;
}

export type LetteringFontScriptGroup = "korean" | "latin-other";
export type LocalSystemFontBridgeStatus = "loaded" | "unsupported" | "denied" | "error" | "empty";

export interface LetteringFontRightsMetadata {
  readonly origin: "local-system" | "web-safe-fallback";
  readonly commercialLicenseVerified: boolean;
  readonly licenseCode: "UNKNOWN-LOCAL-SYSTEM" | "OFL-1.1";
  readonly requiresExportReview: boolean;
  readonly blocksCommercialExportByDefault: boolean;
  readonly warningKo: string | null;
  readonly warningEn: string | null;
}

export interface LetteringSystemFontEntry {
  readonly id: string;
  readonly family: string;
  readonly displayName: string;
  readonly cssFontFamily: string;
  readonly styles: readonly string[];
  readonly postscriptNames: readonly string[];
  readonly scriptGroup: LetteringFontScriptGroup;
  readonly source: "local-system" | "web-safe-fallback";
  readonly commercialLicenseVerified: boolean;
  readonly rightsBom: LetteringFontRightsMetadata;
}

export interface LoadLocalSystemFontsOptions {
  readonly targetWindow?: LocalFontAccessWindowLike | null;
  readonly search?: string;
  readonly includeWebSafeFallback?: boolean;
  readonly maxEntries?: number;
}

export interface LoadLocalSystemFontsResult {
  readonly status: LocalSystemFontBridgeStatus;
  readonly supported: boolean;
  readonly usedFallback: boolean;
  readonly fonts: readonly LetteringSystemFontEntry[];
  readonly unverifiedLocalFontCount: number;
  readonly rightsWarningBannerKo: string | null;
  readonly rightsWarningBannerEn: string | null;
  readonly errorMessage: string | null;
}

export interface LocalFontRightsBomRecord {
  readonly assetId: string;
  readonly name: string;
  readonly category: "font";
  readonly licenseCode: "UNKNOWN" | "OFL-1.1";
  readonly commercialAllowed: boolean;
  readonly commercialLicenseVerified: boolean;
  readonly verified: boolean;
  readonly warningKo: string | null;
  readonly warningEn: string | null;
  readonly usedInCutIds: readonly string[];
  readonly sourceOrigin: string;
}

const HANGUL_RE = /[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/u;
const KOREAN_FAMILY_HINT_RE =
  /(?:pretendard|noto\s*sans\s*kr|noto\s*serif\s*kr|nanum|spoqa|sandoll|gmarket|maruburi|kopub|malgun|apple\s*sd|batang|gulim|dotum|gungsuh|jua|black\s*han|do\s*hyeon|ibm\s*plex\s*sans\s*kr|suit|wanted\s*sans)/iu;

const LOCAL_FONT_RIGHTS_METADATA: LetteringFontRightsMetadata = Object.freeze({
  origin: "local-system", commercialLicenseVerified: false, licenseCode: "UNKNOWN-LOCAL-SYSTEM",
  requiresExportReview: true, blocksCommercialExportByDefault: true,
  warningKo: LOCAL_SYSTEM_FONT_RIGHTS_WARNING_KO, warningEn: LOCAL_SYSTEM_FONT_RIGHTS_WARNING_EN,
});
const WEB_SAFE_OFL_RIGHTS_METADATA: LetteringFontRightsMetadata = Object.freeze({
  origin: "web-safe-fallback", commercialLicenseVerified: true, licenseCode: "OFL-1.1",
  requiresExportReview: false, blocksCommercialExportByDefault: false,
  warningKo: null, warningEn: null,
});

/** CSS `font-family` 선언에 쓸 수 있도록 패밀리명을 안전하게 인용한다. */
export function formatLetteringCssFontFamily(family: string): string {
  return `"${family.trim().replace(/\\/gu, "\\\\").replace(/"/gu, '\\"')}", sans-serif`;
}

/** 한글 식자용 패밀리인지 판별해 정렬 우선순위를 결정한다. */
export function classifyLetteringFontScriptGroup(family: string, fullName?: string): LetteringFontScriptGroup {
  const sample = `${family} ${fullName ?? ""}`;
  return HANGUL_RE.test(sample) || KOREAN_FAMILY_HINT_RE.test(sample) ? "korean" : "latin-other";
}

function makeFontEntryId(prefix: "local" | "fallback", family: string): string {
  const slug = family.trim().toLowerCase().replace(/\s+/gu, "-").replace(/[^\p{L}\p{N}-]/gu, "");
  return `${prefix}-font-${slug || "unnamed"}`;
}

function createWebSafeFallbackEntry(id: string, family: string, displayName: string, styles: readonly string[]): LetteringSystemFontEntry {
  return Object.freeze({
    id, family, displayName, cssFontFamily: formatLetteringCssFontFamily(family),
    styles: Object.freeze([...styles]), postscriptNames: Object.freeze([]),
    scriptGroup: "korean", source: "web-safe-fallback",
    commercialLicenseVerified: true, rightsBom: WEB_SAFE_OFL_RIGHTS_METADATA,
  });
}

/** 비지원 브라우저·권한 거부 시 제공하는 상업 검증 완료(OFL-1.1) 표준 한글 웹툰 식자 폴백 목록. */
export const WEB_SAFE_KOREAN_FALLBACK_FONTS: readonly LetteringSystemFontEntry[] = Object.freeze([
  createWebSafeFallbackEntry("fallback-font-pretendard", "Pretendard", "Pretendard (대사 기본)", ["Regular", "Medium", "Bold"]),
  createWebSafeFallbackEntry("fallback-font-noto-sans-kr", "Noto Sans KR", "본고딕 · Noto Sans KR", ["Regular", "Medium", "Bold"]),
  createWebSafeFallbackEntry("fallback-font-nanum-gothic", "Nanum Gothic", "나눔고딕", ["Regular", "Bold"]),
  createWebSafeFallbackEntry("fallback-font-nanum-myeongjo", "Nanum Myeongjo", "나눔명조 (독백·나레이션)", ["Regular", "Bold"]),
  createWebSafeFallbackEntry("fallback-font-nanum-square-neo", "NanumSquare Neo", "나눔스퀘어 네오", ["Regular", "Bold"]),
  createWebSafeFallbackEntry("fallback-font-black-han-sans", "Black Han Sans", "검은고딕 (효과음·제목)", ["Regular"]),
]);

const resolveTargetWindow = (target?: LocalFontAccessWindowLike | null): LocalFontAccessWindowLike | null =>
  target !== undefined ? target : typeof window !== "undefined" ? (window as unknown as LocalFontAccessWindowLike) : null;

const isPermissionDeniedError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "name" in error && (error as { readonly name?: unknown }).name === "NotAllowedError";

function compareFontEntries(left: LetteringSystemFontEntry, right: LetteringSystemFontEntry): number {
  if (left.scriptGroup !== right.scriptGroup) return left.scriptGroup === "korean" ? -1 : 1;
  return left.family.localeCompare(right.family, left.scriptGroup === "korean" ? "ko" : "en", { sensitivity: "base" });
}

function normalizeLocalFontRecords(rawFonts: readonly LocalFontDataLike[]): LetteringSystemFontEntry[] {
  const buckets = new Map<string, { family: string; styles: Set<string>; postscriptNames: Set<string>; scriptGroup: LetteringFontScriptGroup }>();
  for (const item of rawFonts) {
    const family = typeof item?.family === "string" ? item.family.trim() : "";
    if (!family) continue;
    const key = family.toLowerCase();
    const style = typeof item.style === "string" && item.style.trim() ? item.style.trim() : "Regular";
    const postscript = typeof item.postscriptName === "string" ? item.postscriptName.trim() : "";
    const detectedGroup = classifyLetteringFontScriptGroup(family, item.fullName);
    const existing = buckets.get(key);
    if (existing) {
      existing.styles.add(style);
      if (postscript) existing.postscriptNames.add(postscript);
      if (detectedGroup === "korean") existing.scriptGroup = "korean";
    } else {
      buckets.set(key, { family, styles: new Set([style]), postscriptNames: new Set(postscript ? [postscript] : []), scriptGroup: detectedGroup });
    }
  }
  return [...buckets.values()]
    .map((b) => Object.freeze({
      id: makeFontEntryId("local", b.family), family: b.family, displayName: b.family,
      cssFontFamily: formatLetteringCssFontFamily(b.family),
      styles: Object.freeze([...b.styles].sort((a, z) => a.localeCompare(z, "en"))),
      postscriptNames: Object.freeze([...b.postscriptNames].sort((a, z) => a.localeCompare(z, "en"))),
      scriptGroup: b.scriptGroup, source: "local-system" as const,
      commercialLicenseVerified: false, rightsBom: LOCAL_FONT_RIGHTS_METADATA,
    }))
    .sort(compareFontEntries);
}

function applyFilterAndLimit(entries: readonly LetteringSystemFontEntry[], search?: string, maxEntries?: number): readonly LetteringSystemFontEntry[] {
  const query = search?.trim().toLowerCase() ?? "";
  const filtered = query
    ? entries.filter((item) => item.family.toLowerCase().includes(query) || item.displayName.toLowerCase().includes(query))
    : entries;
  if (maxEntries === undefined || !Number.isFinite(maxEntries)) return Object.freeze([...filtered]);
  return Object.freeze(filtered.slice(0, Math.max(1, Math.trunc(maxEntries))));
}

/** 식자 폰트 항목을 출고 Rights BOM 프리플라이트 레코드로 변환한다(로컬 폰트는 fail-closed 차단). */
export function buildLocalFontRightsBomRecord(entry: LetteringSystemFontEntry, usedInCutIds: readonly string[] = []): LocalFontRightsBomRecord {
  const verified = entry.commercialLicenseVerified && entry.rightsBom.commercialLicenseVerified;
  return Object.freeze({
    assetId: entry.id, name: entry.displayName, category: "font",
    licenseCode: verified ? "OFL-1.1" : "UNKNOWN",
    commercialAllowed: verified, commercialLicenseVerified: verified, verified,
    warningKo: entry.rightsBom.warningKo, warningEn: entry.rightsBom.warningEn,
    usedInCutIds: Object.freeze([...usedInCutIds]),
    sourceOrigin: verified ? "ToonStudio Web-Safe OFL Fallback" : "Local PC System Font (Unverified)",
  });
}

/** 식자용 로컬 시스템 폰트 목록을 안전 로드하고 Rights BOM 상업 라이선스 경고 메타데이터를 자동 부착한다. */
export async function loadLocalSystemFontsForLettering(options: LoadLocalSystemFontsOptions = {}): Promise<LoadLocalSystemFontsResult> {
  const queryLocalFonts = resolveTargetWindow(options.targetWindow)?.queryLocalFonts;
  const fallbackResult = (
    status: Exclude<LocalSystemFontBridgeStatus, "loaded">,
    supported: boolean,
    errorMessage: string | null,
  ): LoadLocalSystemFontsResult => Object.freeze({
    status, supported, usedFallback: true,
    fonts: applyFilterAndLimit(WEB_SAFE_KOREAN_FALLBACK_FONTS, options.search, options.maxEntries),
    unverifiedLocalFontCount: 0, rightsWarningBannerKo: null, rightsWarningBannerEn: null, errorMessage,
  });

  if (typeof queryLocalFonts !== "function") return fallbackResult("unsupported", false, null);

  let rawFonts: readonly LocalFontDataLike[];
  try {
    rawFonts = await queryLocalFonts();
  } catch (error: unknown) {
    if (isPermissionDeniedError(error)) {
      return fallbackResult("denied", true, "로컬 폰트 접근 권한이 거부되어 기본 안전 한글 폰트 목록을 표시합니다.");
    }
    const message = error instanceof Error && error.message
      ? error.message
      : "로컬 시스템 폰트 목록을 불러오지 못해 기본 안전 한글 폰트 목록으로 전환했습니다.";
    return fallbackResult("error", true, message);
  }

  const localEntries = normalizeLocalFontRecords(Array.isArray(rawFonts) ? rawFonts : []);
  if (localEntries.length === 0) return fallbackResult("empty", true, null);

  let combined = localEntries;
  if (options.includeWebSafeFallback) {
    const seen = new Set(localEntries.map((item) => item.family.toLowerCase()));
    combined = [...localEntries, ...WEB_SAFE_KOREAN_FALLBACK_FONTS.filter((item) => !seen.has(item.family.toLowerCase()))];
  }

  const fonts = applyFilterAndLimit(combined, options.search, options.maxEntries);
  const unverifiedLocalFontCount = fonts.filter((item) => !item.commercialLicenseVerified).length;
  return Object.freeze({
    status: "loaded", supported: true, usedFallback: false, fonts, unverifiedLocalFontCount,
    rightsWarningBannerKo: unverifiedLocalFontCount > 0 ? LOCAL_SYSTEM_FONT_RIGHTS_WARNING_KO : null,
    rightsWarningBannerEn: unverifiedLocalFontCount > 0 ? LOCAL_SYSTEM_FONT_RIGHTS_WARNING_EN : null,
    errorMessage: null,
  });
}
