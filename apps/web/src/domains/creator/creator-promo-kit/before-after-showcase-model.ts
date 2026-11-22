/**
 * 브러시·3D 배경 셰이더 마켓/SNS 공유용 인터랙티브 Before/After 시연 카드 모델
 *
 * - 슬라이더 위치 클램핑, 포인터/키보드(ArrowLeft/ArrowRight/Home/End/PageUp/PageDown) 계산,
 *   XSS 안전 임베드 스니펫(iframe · 웹 컴포넌트 · 마크다운 공유 링크) 생성을 순수 함수로 제공한다.
 */

export type ShowcaseCategory = "custom-brush" | "bg3d-shader" | "tone-filter";

export type EmbedSnippetKind = "iframe" | "web-component" | "markdown";

export interface BeforeAfterShowcaseAsset {
  readonly id: string;
  readonly title: string;
  readonly creatorHandle: string;
  readonly category: ShowcaseCategory;
  readonly summary: string;
  readonly beforeLabel: string;
  readonly afterLabel: string;
  readonly beforeImageUrl?: string;
  readonly afterImageUrl?: string;
  readonly beforeCaption?: string;
  readonly afterCaption?: string;
  readonly initialPositionPct?: number;
  readonly marketUrl?: string;
  readonly tags?: readonly string[];
}

export interface BeforeAfterEmbedOptions {
  readonly baseOrigin?: string;
  readonly widthPx?: number;
  readonly heightPx?: number;
}

export interface BeforeAfterEmbedSnippets {
  readonly shareUrl: string;
  readonly embedUrl: string;
  readonly iframeHtml: string;
  readonly webComponentSnippet: string;
  readonly markdownBadge: string;
}

export const SHOWCASE_CATEGORY_LABEL_KO: Readonly<Record<ShowcaseCategory, string>> = Object.freeze({
  "custom-brush": "커스텀 브러시",
  "bg3d-shader": "3D 배경 셰이더",
  "tone-filter": "후보정 톤·필터",
});

export const DEFAULT_BEFORE_AFTER_SHOWCASE_PRESETS: readonly BeforeAfterShowcaseAsset[] = Object.freeze([
  Object.freeze({
    id: "ink-wash-rough-brush-v2",
    title: "수묵 거친 필압 브러시 v2",
    creatorHandle: "@studio_atelier",
    category: "custom-brush",
    summary: "기본 벡터 펜선 위에 한지 번짐·건필 텍스처를 1클릭으로 얹어 웹툰 감정선을 살립니다.",
    beforeLabel: "기본 펜선",
    afterLabel: "수묵 텍스처 적용",
    beforeCaption: "균일 두께 기본 선화",
    afterCaption: "7밴드 농담·한지 입자 반영",
    initialPositionPct: 52,
    marketUrl: "https://www.toonstudio.cloud/market/assets/ink-wash-rough-brush-v2",
    tags: ["수묵", "필압", "웹툰선화"],
  }),
  Object.freeze({
    id: "seoul-alley-npr-cel-shader",
    title: "저녁 골목 3D 배경 NPR 셰이더",
    creatorHandle: "@bg3d_architect",
    category: "bg3d-shader",
    summary: "3D 건축 와이어프레임을 웹툰 원고에 자연스럽게 붙는 외곽선·노을 2단 셀 음영으로 바꿉니다.",
    beforeLabel: "3D 기본 모델",
    afterLabel: "웹툰 NPR 셰이더",
    beforeCaption: "플랫 쉐이딩 3D 메시",
    afterCaption: "잉크 윤곽선 + 노을 2단 톤",
    initialPositionPct: 50,
    marketUrl: "https://www.toonstudio.cloud/market/assets/seoul-alley-npr-cel-shader",
    tags: ["3D배경", "NPR", "셀셰이더"],
  }),
]);

/**
 * 비교 슬라이더 위치(%)를 0..100 정수 범위로 안전하게 보정한다.
 */
export function clampComparisonPct(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.round(Math.min(100, Math.max(0, value)));
}

/**
 * 포인터 X 좌표를 스테이지 기준 0..100% 위치로 변환한다.
 */
export function computePointerComparisonPct(
  clientX: number,
  rectLeft: number,
  rectWidth: number,
): number {
  if (!Number.isFinite(clientX) || !Number.isFinite(rectLeft) || !Number.isFinite(rectWidth) || rectWidth <= 0) {
    return 50;
  }
  const rawPct = ((clientX - rectLeft) / rectWidth) * 100;
  return clampComparisonPct(rawPct);
}

/**
 * 키보드 입력(ArrowLeft/ArrowRight/Home/End/PageUp/PageDown)에 따른 다음 비교 위치(%)를 반환한다.
 * 지원하지 않는 키이면 null을 반환해 브라우저 기본 동작을 방해하지 않는다.
 */
export function stepComparisonPctForKey(
  currentPct: number,
  key: string,
  shiftKey = false,
): number | null {
  const base = clampComparisonPct(currentPct);
  const arrowStep = shiftKey ? 10 : 5;

  switch (key) {
    case "ArrowLeft":
    case "ArrowDown":
      return clampComparisonPct(base - arrowStep);
    case "ArrowRight":
    case "ArrowUp":
      return clampComparisonPct(base + arrowStep);
    case "PageDown":
      return clampComparisonPct(base - 15);
    case "PageUp":
      return clampComparisonPct(base + 15);
    case "Home":
      return 0;
    case "End":
      return 100;
    default:
      return null;
  }
}

/**
 * HTML 속성 문자열에 안전한 이스케이프를 적용한다.
 */
export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}

/**
 * 임베드·공유 링크에 허용된 프로토콜(https/http)만 통과시키고 위험한 스킴을 차단한다.
 */
export function sanitizeEmbedUrl(
  rawUrl: string | undefined,
  fallbackUrl: string,
): string {
  const candidate = rawUrl?.trim();
  if (!candidate) return fallbackUrl;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
    return fallbackUrl;
  } catch {
    return fallbackUrl;
  }
}

function sanitizeAssetId(id: string): string {
  const cleaned = id.trim().replace(/[^a-zA-Z0-9_-]/gu, "-");
  return cleaned.length > 0 ? cleaned : "studio-showcase";
}

/**
 * 마켓·블로그·SNS 공유용 초경량 Before/After 임베드 스니펫(iframe · 웹 컴포넌트 · 마크다운)을 생성한다.
 */
export function buildBeforeAfterEmbedSnippets(
  asset: BeforeAfterShowcaseAsset,
  positionPct: number,
  options: BeforeAfterEmbedOptions = {},
): BeforeAfterEmbedSnippets {
  const safeId = sanitizeAssetId(asset.id);
  const pct = clampComparisonPct(positionPct);
  const baseOrigin = sanitizeEmbedUrl(options.baseOrigin, "https://www.toonstudio.cloud").replace(/\/$/u, "");
  const widthPx = Math.round(Math.min(1200, Math.max(280, options.widthPx ?? 640)));
  const heightPx = Math.round(Math.min(900, Math.max(240, options.heightPx ?? 400)));

  const fallbackShare = `${baseOrigin}/market/assets/${encodeURIComponent(safeId)}`;
  const safeMarketUrl = sanitizeEmbedUrl(asset.marketUrl, fallbackShare);

  const shareUrlObj = new URL(safeMarketUrl);
  shareUrlObj.searchParams.set("compare", String(pct));
  const shareUrl = shareUrlObj.toString();

  const embedUrlObj = new URL(`${baseOrigin}/embed/before-after/${encodeURIComponent(safeId)}`);
  embedUrlObj.searchParams.set("compare", String(pct));
  embedUrlObj.searchParams.set("before", asset.beforeLabel.trim() || "전");
  embedUrlObj.searchParams.set("after", asset.afterLabel.trim() || "후");
  const embedUrl = embedUrlObj.toString();

  const safeTitle = escapeHtmlAttribute(`${asset.title} 전후 비교 시연`);
  const safeBefore = escapeHtmlAttribute(asset.beforeLabel.trim() || "적용 전");
  const safeAfter = escapeHtmlAttribute(asset.afterLabel.trim() || "적용 후");

  const iframeHtml = `<iframe src="${escapeHtmlAttribute(embedUrl)}" title="${safeTitle}" width="${widthPx}" height="${heightPx}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" style="border:1px solid #d6d1c7;border-radius:12px;max-width:100%;"></iframe>`;

  const webComponentSnippet = `<toonstudio-compare asset-id="${escapeHtmlAttribute(safeId)}" initial-pct="${pct}" before-label="${safeBefore}" after-label="${safeAfter}"></toonstudio-compare>`;

  const cleanTitleForMd = asset.title.replace(/[[\]\r\n]/gu, " ").trim() || "시연 카드";
  const markdownBadge = `[${cleanTitleForMd} (${asset.beforeLabel} → ${asset.afterLabel}, ${pct}%)](${shareUrl})`;

  return {
    shareUrl,
    embedUrl,
    iframeHtml,
    webComponentSnippet,
    markdownBadge,
  };
}
