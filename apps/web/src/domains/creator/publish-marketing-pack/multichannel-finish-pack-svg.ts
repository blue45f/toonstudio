/**
 * 멀티채널 마감 팩 SVG 렌더 유틸 (9:16 숏폼 티저 키프레임 포스터 · 대표 썸네일 3종).
 */

export const SHORTFORM_TEASER_WIDTH_PX = 1080;
export const SHORTFORM_TEASER_HEIGHT_PX = 1920;

export function escapeFinishPackXml(raw: string): string {
  return raw
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

export function fnv1aFinishPackDigest(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function toFinishPackSvgDataUrl(svgMarkup: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
}

export function trimFinishPackCopy(text: string, maxChars: number): string {
  const clean = text.trim().replace(/\s+/gu, " ");
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(1, maxChars - 1))}…`;
}

export function renderShortformTeaserPosterSvg(options: {
  readonly seriesTitle: string;
  readonly episodeNumber: number;
  readonly hookCopyKo: string;
  readonly climaxCopyKo: string;
}): string {
  const safeTitle = escapeFinishPackXml(trimFinishPackCopy(options.seriesTitle, 24));
  const safeEp = escapeFinishPackXml(
    `EP.${String(options.episodeNumber).padStart(2, "0")} · 9:16 SHORTFORM TEASER`,
  );
  const safeHook = escapeFinishPackXml(trimFinishPackCopy(options.hookCopyKo, 34));
  const safeClimax = escapeFinishPackXml(trimFinishPackCopy(options.climaxCopyKo, 34));
  const safeCta = escapeFinishPackXml(`지금 ${options.episodeNumber}화 바로 보기`);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHORTFORM_TEASER_WIDTH_PX}" height="${SHORTFORM_TEASER_HEIGHT_PX}" viewBox="0 0 ${SHORTFORM_TEASER_WIDTH_PX} ${SHORTFORM_TEASER_HEIGHT_PX}">`,
    `<defs><linearGradient id="teaserBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#141827"/><stop offset="100%" stop-color="#1f2740"/></linearGradient></defs>`,
    `<rect width="1080" height="1920" fill="url(#teaserBg)"/>`,
    `<rect x="64" y="210" width="840" height="1260" rx="36" fill="#202844" stroke="#5b6ea8" stroke-width="4" stroke-dasharray="14 10"/>`,
    `<text x="108" y="300" fill="#74e2d8" font-size="34" font-weight="700" font-family="sans-serif">${safeEp}</text>`,
    `<text x="108" y="388" fill="#f5f7ff" font-size="68" font-weight="800" font-family="sans-serif">${safeTitle}</text>`,
    `<rect x="108" y="456" width="752" height="390" rx="24" fill="#131829" stroke="#3f4d78" stroke-width="3"/>`,
    `<text x="140" y="540" fill="#9fb2e8" font-size="28" font-weight="700" font-family="sans-serif">HOOK (0.0s – 3.5s)</text>`,
    `<text x="140" y="620" fill="#f5f7ff" font-size="38" font-weight="700" font-family="sans-serif">${safeHook}</text>`,
    `<rect x="108" y="882" width="752" height="390" rx="24" fill="#131829" stroke="#3f4d78" stroke-width="3"/>`,
    `<text x="140" y="966" fill="#f0a875" font-size="28" font-weight="700" font-family="sans-serif">CLIMAX (8.5s – 14.0s)</text>`,
    `<text x="140" y="1046" fill="#f5f7ff" font-size="38" font-weight="700" font-family="sans-serif">${safeClimax}</text>`,
    `<rect x="108" y="1320" width="520" height="96" rx="48" fill="#74e2d8"/>`,
    `<text x="368" y="1382" text-anchor="middle" fill="#0f1726" font-size="36" font-weight="800" font-family="sans-serif">${safeCta}</text>`,
    `</svg>`,
  ].join("");
}

export function renderRepresentativeThumbnailSvg(options: {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly safeMarginPx: number;
  readonly badgeKo: string;
  readonly titleKo: string;
  readonly subtitleKo: string;
  readonly accentHex: string;
}): string {
  const { widthPx, heightPx, safeMarginPx, badgeKo, titleKo, subtitleKo, accentHex } = options;
  const safeBadge = escapeFinishPackXml(badgeKo);
  const safeTitle = escapeFinishPackXml(trimFinishPackCopy(titleKo, 20));
  const safeSub = escapeFinishPackXml(trimFinishPackCopy(subtitleKo, 30));
  const titleSize = Math.round(Math.min(widthPx, heightPx) * 0.09);
  const subSize = Math.round(Math.min(widthPx, heightPx) * 0.042);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}">`,
    `<rect width="${widthPx}" height="${heightPx}" fill="#171b2b"/>`,
    `<rect x="${safeMarginPx}" y="${safeMarginPx}" width="${widthPx - safeMarginPx * 2}" height="${heightPx - safeMarginPx * 2}" rx="20" fill="#222940" stroke="${accentHex}" stroke-width="3"/>`,
    `<text x="${safeMarginPx + 32}" y="${safeMarginPx + 66}" fill="${accentHex}" font-size="${subSize}" font-weight="700" font-family="sans-serif">${safeBadge}</text>`,
    `<text x="${safeMarginPx + 32}" y="${Math.round(heightPx * 0.56)}" fill="#f6f8ff" font-size="${titleSize}" font-weight="800" font-family="sans-serif">${safeTitle}</text>`,
    `<text x="${safeMarginPx + 32}" y="${Math.round(heightPx * 0.56) + titleSize + 18}" fill="#c7d1ee" font-size="${subSize}" font-weight="500" font-family="sans-serif">${safeSub}</text>`,
    `</svg>`,
  ].join("");
}
