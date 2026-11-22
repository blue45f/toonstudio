/**
 * 화수 발행 연동 ₩0 마케팅 OG 1200×630 3컷 미리보기 카드 SVG · Canvas 렌더러.
 *
 * X(트위터), 인스타그램, 네이버·티스토리 블로그 공유에 최적화된 1200×630 카드 이미지를
 * 외부 API·서버 비용 없이 100% 브라우저 로컬에서 생성한다.
 */

export const OG_CARD_WIDTH = 1200;
export const OG_CARD_HEIGHT = 630;

export const OG_CARD_THEME_IDS = [
  "starlight-editorial",
  "warm-paper",
  "noir-thriller",
  "blossom-romance",
] as const;

export type OgCardThemeId = (typeof OG_CARD_THEME_IDS)[number];

export interface OgPreviewCutSlot {
  readonly id: string;
  readonly cutLabel: string;
  readonly captionKo: string;
  /** 브라우저 로컬에서 선택한 이미지 Data URL (없으면 벡터 컷 카드 조판) */
  readonly imageDataUrl?: string | null;
}

export interface OgMarketingCardInput {
  readonly seriesTitle: string;
  readonly episodeNumber: number;
  readonly episodeSubtitle: string;
  readonly authorName: string;
  readonly genreTag: string;
  readonly scheduleBadge: string;
  readonly ctaLabel: string;
  readonly theme: OgCardThemeId;
  readonly showSafeGuide?: boolean;
  readonly cuts: readonly [OgPreviewCutSlot, OgPreviewCutSlot, OgPreviewCutSlot];
}

export interface OgThemePalette {
  readonly id: OgCardThemeId;
  readonly labelKo: string;
  readonly bgTop: string;
  readonly bgBottom: string;
  readonly cardBg: string;
  readonly frameBorder: string;
  readonly titleColor: string;
  readonly subtitleColor: string;
  readonly accentBg: string;
  readonly accentText: string;
  readonly mutedText: string;
  readonly cutOverlayBg: string;
}

export const OG_CARD_THEMES: Readonly<Record<OgCardThemeId, OgThemePalette>> = {
  "starlight-editorial": {
    id: "starlight-editorial",
    labelKo: "스타라이트 에디토리얼",
    bgTop: "#141827",
    bgBottom: "#1d2238",
    cardBg: "#222943",
    frameBorder: "#4f5b8a",
    titleColor: "#f5f7ff",
    subtitleColor: "#c9d2f0",
    accentBg: "#74e2d8",
    accentText: "#0f1726",
    mutedText: "#97a4cc",
    cutOverlayBg: "#111524",
  },
  "warm-paper": {
    id: "warm-paper",
    labelKo: "웜 페이퍼 아틀리에",
    bgTop: "#f7f3eb",
    bgBottom: "#eee7da",
    cardBg: "#fffdf9",
    frameBorder: "#c8bca8",
    titleColor: "#1f1a15",
    subtitleColor: "#4d4338",
    accentBg: "#d95d39",
    accentText: "#fffaf5",
    mutedText: "#736657",
    cutOverlayBg: "#241d17",
  },
  "noir-thriller": {
    id: "noir-thriller",
    labelKo: "느와르 스릴러",
    bgTop: "#0e1014",
    bgBottom: "#1a1d24",
    cardBg: "#171a21",
    frameBorder: "#3e4656",
    titleColor: "#f3f5f8",
    subtitleColor: "#b8c0cf",
    accentBg: "#e04f5f",
    accentText: "#fff7f8",
    mutedText: "#8892a6",
    cutOverlayBg: "#0a0c10",
  },
  "blossom-romance": {
    id: "blossom-romance",
    labelKo: "블로섬 로맨스",
    bgTop: "#fcf4f7",
    bgBottom: "#f4e6ee",
    cardBg: "#ffffff",
    frameBorder: "#d9b4c7",
    titleColor: "#2c1a24",
    subtitleColor: "#5e3d4f",
    accentBg: "#c44d86",
    accentText: "#ffffff",
    mutedText: "#825d71",
    cutOverlayBg: "#2b1923",
  },
};

export interface OgCardArtifact {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly svgMarkup: string;
  readonly svgDataUrl: string;
  readonly estimatedBytes: number;
}

export interface SocialShareSnippets {
  readonly xPostText: string;
  readonly instagramCaption: string;
  readonly blogOgMetaHtml: string;
}

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function truncateLabel(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(1, maxChars - 1))}…`;
}

function isSafeDataImageUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  return /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/u.test(url.trim());
}

export function createDefaultOgMarketingInput(
  seriesTitle = "밤의 우편배달부",
  episodeNumber = 12,
): OgMarketingCardInput {
  return {
    seriesTitle,
    episodeNumber,
    episodeSubtitle: "옥상 위, 깨진 회중시계가 멈춘 밤",
    authorName: "스튜디오 작가",
    genreTag: "판타지 · 미스터리",
    scheduleBadge: "매주 토요일 무료 연재",
    ctaLabel: `지금 ${episodeNumber}화 바로 읽기 →`,
    theme: "starlight-editorial",
    showSafeGuide: false,
    cuts: [
      {
        id: "og-cut-1",
        cutLabel: "CUT 01 · 도입",
        captionKo: "비 내리는 역 플랫폼, 수상한 편지 한 통",
        imageDataUrl: null,
      },
      {
        id: "og-cut-2",
        cutLabel: "CUT 28 · 전개",
        captionKo: "“그 시계는 12년 전에 멈췄어야 했어.”",
        imageDataUrl: null,
      },
      {
        id: "og-cut-3",
        cutLabel: "CUT 54 · 하이라이트",
        captionKo: "결정적 진실이 드러나는 마지막 전면 컷",
        imageDataUrl: null,
      },
    ],
  };
}

/**
 * 1200×630 3컷 미리보기 OG 카드 SVG를 생성한다.
 */
export function renderOgCardSvg(input: OgMarketingCardInput): OgCardArtifact {
  const palette = OG_CARD_THEMES[input.theme];
  const epTag = `EP.${String(Math.max(1, Math.round(input.episodeNumber))).padStart(2, "0")}`;
  const safeSeries = escapeXml(truncateLabel(input.seriesTitle || "새 웹툰 작품", 26));
  const safeSubtitle = escapeXml(truncateLabel(input.episodeSubtitle || "최신 화 업데이트", 38));
  const safeAuthor = escapeXml(truncateLabel(input.authorName || "작가", 18));
  const safeGenre = escapeXml(truncateLabel(input.genreTag || "웹툰", 16));
  const safeSchedule = escapeXml(truncateLabel(input.scheduleBadge || "연재 중", 18));
  const safeCta = escapeXml(truncateLabel(input.ctaLabel || `${input.episodeNumber}화 읽기 →`, 22));

  // 3컷 프레임 기하(우측 3열 카드: x = 446..1152, 각 폭 224px, 간격 17px, 높이 476px)
  const cutFrames = [
    { x: 446, y: 76, w: 224, h: 478 },
    { x: 687, y: 76, w: 224, h: 478 },
    { x: 928, y: 76, w: 224, h: 478 },
  ] as const;

  const cutDefs: string[] = [];
  const cutElements: string[] = [];

  input.cuts.forEach((slot, idx) => {
    const frame = cutFrames[idx];
    if (!frame) return;
    const clipId = `og-cut-clip-${idx + 1}`;
    cutDefs.push(
      `<clipPath id="${clipId}"><rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" rx="16" /></clipPath>`,
    );

    const safeCutLabel = escapeXml(truncateLabel(slot.cutLabel || `CUT 0${idx + 1}`, 18));
    const safeCaption = escapeXml(truncateLabel(slot.captionKo || "미리보기 컷", 22));
    const hasImage = isSafeDataImageUrl(slot.imageDataUrl);

    const visualLayer = hasImage
      ? `<image href="${slot.imageDataUrl}" x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" />`
      : [
          `<g clip-path="url(#${clipId})">`,
          `<rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" fill="${palette.cardBg}" />`,
          // 웹툰 원고 패널 비율을 연상시키는 절제된 컷 분할 가이드 라인
          `<rect x="${frame.x + 14}" y="${frame.y + 54}" width="${frame.w - 28}" height="156" rx="10" fill="${palette.bgTop}" stroke="${palette.frameBorder}" stroke-width="1.2" opacity="0.88" />`,
          `<rect x="${frame.x + 14}" y="${frame.y + 224}" width="${frame.w - 28}" height="148" rx="10" fill="${palette.bgBottom}" stroke="${palette.frameBorder}" stroke-width="1.2" opacity="0.82" />`,
          `<rect x="${frame.x + 28}" y="${frame.y + 82}" width="${frame.w - 86}" height="32" rx="16" fill="${palette.accentBg}" opacity="0.22" stroke="${palette.accentBg}" stroke-width="1" />`,
          `<text x="${frame.x + frame.w / 2}" y="${frame.y + 146}" text-anchor="middle" fill="${palette.mutedText}" font-size="16" font-weight="700" font-family="'Pretendard', 'Noto Sans KR', sans-serif">PREVIEW 0${idx + 1}</text>`,
          `</g>`,
        ].join("");

    cutElements.push(
      [
        visualLayer,
        `<rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" rx="16" fill="none" stroke="${palette.frameBorder}" stroke-width="2" />`,
        `<rect x="${frame.x + 12}" y="${frame.y + 12}" width="116" height="28" rx="14" fill="${palette.cutOverlayBg}" opacity="0.88" />`,
        `<text x="${frame.x + 24}" y="${frame.y + 30}" fill="#f5f7ff" font-size="12" font-weight="700" font-family="'Pretendard', 'Noto Sans KR', sans-serif">${safeCutLabel}</text>`,
        `<rect x="${frame.x + 10}" y="${frame.y + frame.h - 74}" width="${frame.w - 20}" height="62" rx="12" fill="${palette.cutOverlayBg}" opacity="0.9" />`,
        `<text x="${frame.x + 22}" y="${frame.y + frame.h - 38}" fill="#f5f7ff" font-size="13" font-weight="600" font-family="'Pretendard', 'Noto Sans KR', sans-serif">${safeCaption}</text>`,
      ].join(""),
    );
  });

  const safeGuideOverlay = input.showSafeGuide
    ? `<rect x="48" y="40" width="${OG_CARD_WIDTH - 96}" height="${OG_CARD_HEIGHT - 80}" rx="12" fill="none" stroke="${palette.accentBg}" stroke-width="2" stroke-dasharray="10 6" opacity="0.7" />`
    : "";

  const svgMarkup = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_CARD_WIDTH}" height="${OG_CARD_HEIGHT}" viewBox="0 0 ${OG_CARD_WIDTH} ${OG_CARD_HEIGHT}" role="img" aria-label="${safeSeries} ${epTag} 3컷 미리보기 OG 공유 카드">`,
    "<defs>",
    `<linearGradient id="og-bg-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${palette.bgTop}" /><stop offset="100%" stop-color="${palette.bgBottom}" /></linearGradient>`,
    ...cutDefs,
    "</defs>",
    `<rect width="${OG_CARD_WIDTH}" height="${OG_CARD_HEIGHT}" fill="url(#og-bg-grad)" />`,
    // 좌측 정보 칼럼 (x = 56..412)
    `<rect x="56" y="76" width="110" height="36" rx="18" fill="${palette.accentBg}" />`,
    `<text x="111" y="99" text-anchor="middle" fill="${palette.accentText}" font-size="16" font-weight="800" font-family="'Space Grotesk', sans-serif">${epTag}</text>`,
    `<text x="180" y="100" fill="${palette.mutedText}" font-size="15" font-weight="700" font-family="'Pretendard', 'Noto Sans KR', sans-serif">${safeGenre}</text>`,
    `<text x="56" y="182" fill="${palette.titleColor}" font-size="40" font-weight="800" font-family="'Pretendard', 'Noto Sans KR', sans-serif">${safeSeries}</text>`,
    `<text x="56" y="232" fill="${palette.subtitleColor}" font-size="20" font-weight="600" font-family="'Pretendard', 'Noto Sans KR', sans-serif">${safeSubtitle}</text>`,
    `<line x1="56" y1="274" x2="396" y2="274" stroke="${palette.frameBorder}" stroke-width="1.5" opacity="0.65" />`,
    `<text x="56" y="318" fill="${palette.mutedText}" font-size="15" font-weight="600" font-family="'Pretendard', 'Noto Sans KR', sans-serif">글·그림 ${safeAuthor}</text>`,
    `<text x="56" y="350" fill="${palette.subtitleColor}" font-size="16" font-weight="700" font-family="'Pretendard', 'Noto Sans KR', sans-serif">${safeSchedule}</text>`,
    // CTA 배지
    `<rect x="56" y="458" width="320" height="62" rx="14" fill="${palette.accentBg}" />`,
    `<text x="216" y="496" text-anchor="middle" fill="${palette.accentText}" font-size="20" font-weight="800" font-family="'Pretendard', 'Noto Sans KR', sans-serif">${safeCta}</text>`,
    `<text x="56" y="552" fill="${palette.mutedText}" font-size="13" font-weight="600" font-family="'Space Grotesk', sans-serif">TOONSTUDIO · 1200×630 OG SHARE PACK</text>`,
    ...cutElements,
    safeGuideOverlay,
    "</svg>",
  ].join("");

  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
  const estimatedBytes = new TextEncoder().encode(svgMarkup).byteLength;

  return {
    widthPx: OG_CARD_WIDTH,
    heightPx: OG_CARD_HEIGHT,
    svgMarkup,
    svgDataUrl,
    estimatedBytes,
  };
}

/**
 * 1200×630 OG 카드를 브라우저 HTMLCanvasElement에 직접 렌더링한다(PNG 저장용).
 */
export function renderOgCardToCanvas(
  canvas: HTMLCanvasElement,
  input: OgMarketingCardInput,
): boolean {
  canvas.width = OG_CARD_WIDTH;
  canvas.height = OG_CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  const palette = OG_CARD_THEMES[input.theme];
  const gradient = ctx.createLinearGradient(0, 0, OG_CARD_WIDTH, OG_CARD_HEIGHT);
  gradient.addColorStop(0, palette.bgTop);
  gradient.addColorStop(1, palette.bgBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, OG_CARD_WIDTH, OG_CARD_HEIGHT);

  // 좌측 메타 & 타이틀
  ctx.fillStyle = palette.accentBg;
  ctx.fillRect(56, 76, 110, 36);
  ctx.fillStyle = palette.accentText;
  ctx.font = "800 16px sans-serif";
  ctx.fillText(`EP.${String(Math.max(1, Math.round(input.episodeNumber))).padStart(2, "0")}`, 84, 100);

  ctx.fillStyle = palette.mutedText;
  ctx.font = "700 15px sans-serif";
  ctx.fillText(truncateLabel(input.genreTag, 16), 180, 100);

  ctx.fillStyle = palette.titleColor;
  ctx.font = "800 38px sans-serif";
  ctx.fillText(truncateLabel(input.seriesTitle, 22), 56, 182);

  ctx.fillStyle = palette.subtitleColor;
  ctx.font = "600 20px sans-serif";
  ctx.fillText(truncateLabel(input.episodeSubtitle, 32), 56, 232);

  ctx.fillStyle = palette.mutedText;
  ctx.font = "600 15px sans-serif";
  ctx.fillText(`글·그림 ${truncateLabel(input.authorName, 18)}`, 56, 318);
  ctx.fillText(truncateLabel(input.scheduleBadge, 20), 56, 350);

  ctx.fillStyle = palette.accentBg;
  ctx.fillRect(56, 458, 320, 62);
  ctx.fillStyle = palette.accentText;
  ctx.font = "800 20px sans-serif";
  ctx.fillText(truncateLabel(input.ctaLabel, 22), 92, 496);

  // 우측 3컷 미리보기 프레임
  const cutXs = [446, 687, 928] as const;
  input.cuts.forEach((slot, idx) => {
    const x = cutXs[idx];
    if (x === undefined) return;
    ctx.fillStyle = palette.cardBg;
    ctx.fillRect(x, 76, 224, 478);
    ctx.strokeStyle = palette.frameBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, 76, 224, 478);

    ctx.fillStyle = palette.cutOverlayBg;
    ctx.fillRect(x + 10, 480, 204, 62);
    ctx.fillStyle = "#f5f7ff";
    ctx.font = "600 13px sans-serif";
    ctx.fillText(truncateLabel(slot.captionKo, 18), x + 20, 516);
  });

  return true;
}

/**
 * X(트위터)·인스타그램·블로그용 ₩0 발행 홍보 문구와 OG 메타 태그를 자동 생성한다.
 */
export function buildSocialShareSnippets(
  input: OgMarketingCardInput,
  workUrl = "https://toonstudio.kr/work/episode",
): SocialShareSnippets {
  const ep = Math.max(1, Math.round(input.episodeNumber));
  const cleanTitle = input.seriesTitle.trim() || "새 웹툰";
  const cleanTag = input.genreTag.replaceAll("·", " ").trim().split(/\s+/u).filter(Boolean);
  const hashtags = [
    "#웹툰",
    `#${cleanTitle.replaceAll(/\s+/gu, "")}`,
    ...cleanTag.slice(0, 2).map((tag) => `#${tag}`),
  ].join(" ");

  const xPostText = `[${cleanTitle}] ${ep}화 공개 — ${input.episodeSubtitle.trim()}\n${workUrl}\n${hashtags}`.slice(
    0,
    240,
  );

  const instagramCaption = [
    `${cleanTitle} ${ep}화가 올라왔어요.`,
    `“${input.episodeSubtitle.trim()}”`,
    "",
    `• ${input.scheduleBadge.trim()}`,
    `• 프로필 링크에서 ${ep}화 바로 읽기`,
    "",
    `${hashtags} #웹툰추천 #1인창작`,
  ].join("\n");

  const blogOgMetaHtml = [
    `<meta property="og:title" content="${escapeXml(`${cleanTitle} ${ep}화 — ${input.episodeSubtitle}`)}" />`,
    `<meta property="og:description" content="${escapeXml(`${input.authorName} · ${input.scheduleBadge}`)}" />`,
    `<meta property="og:image" content="${escapeXml(`${workUrl}/og-ep${ep}-1200x630.png`)}" />`,
    `<meta property="og:image:width" content="${OG_CARD_WIDTH}" />`,
    `<meta property="og:image:height" content="${OG_CARD_HEIGHT}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].join("\n");

  return { xPostText, instagramCaption, blogOgMetaHtml };
}
