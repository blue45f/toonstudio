/**
 * 완성 웹툰 바이럴 홍보 스튜디오 — 단일 파일 정적 랜딩 HTML & 3종 SNS 티저 카드 SVG 생성기.
 *
 * - 외부 CDN·외부 스크립트·트래킹 의존성 0 (100% 순수 로컬 생성).
 * - 모든 사용자 입력은 엄격한 HTML/XML 이스케이프 및 URL 프로토콜(http/https) 검증을 거친다.
 * - 색상은 전수 OKLCH 토큰으로 표현한다(raw hex/rgb/hsl 미사용).
 */

export type PromoMoodThemeId =
  | "editorial-warm"
  | "midnight-thriller"
  | "pastel-romance"
  | "ink-action";

export interface WebtoonPromoPlatformLinks {
  readonly naverWebtoon?: string;
  readonly kakaoPage?: string;
  readonly x?: string;
  readonly instagram?: string;
  readonly youtube?: string;
}

export interface WebtoonPromoInput {
  readonly title: string;
  readonly tagline: string;
  readonly genre: string;
  readonly authorName: string;
  readonly highlightCutCaptions: readonly string[];
  readonly platformLinks: WebtoonPromoPlatformLinks;
  readonly moodTheme: PromoMoodThemeId;
  readonly canonicalUrl?: string;
  readonly updateSchedule?: string;
  readonly copyrightYear?: number;
}

export interface PromoMoodThemeTokens {
  readonly id: PromoMoodThemeId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly bg: string;
  readonly surface: string;
  readonly surfaceAlt: string;
  readonly border: string;
  readonly ink: string;
  readonly inkMuted: string;
  readonly accent: string;
  readonly onAccent: string;
  readonly badgeBg: string;
  readonly badgeInk: string;
}

export type SnsTeaserPlatformId = "instagram" | "x" | "youtube-community";

export interface SnsTeaserCardItem {
  readonly id: SnsTeaserPlatformId;
  readonly platformLabelKo: string;
  readonly platformLabelEn: string;
  readonly aspectRatio: "4:5" | "16:9" | "1:1";
  readonly width: number;
  readonly height: number;
  readonly viewBox: string;
  readonly filename: string;
  readonly svg: string;
  readonly hookCopy: string;
  readonly hashtags: readonly string[];
}

export interface SnsTeaserCardPack {
  readonly workTitle: string;
  readonly moodTheme: PromoMoodThemeId;
  readonly cards: readonly [SnsTeaserCardItem, SnsTeaserCardItem, SnsTeaserCardItem];
  readonly combinedCopyText: string;
}

interface ResolvedPlatformCta {
  readonly key: keyof WebtoonPromoPlatformLinks;
  readonly label: string;
  readonly badge: string;
  readonly url: string;
}

export const PROMO_MOOD_THEMES: Readonly<Record<PromoMoodThemeId, PromoMoodThemeTokens>> = {
  "editorial-warm": {
    id: "editorial-warm",
    labelKo: "에디토리얼 웜",
    labelEn: "Editorial Warm",
    descriptionKo: "한지 미색 바탕과 먹색 활자 · 드라마·일상·시대극 추천",
    descriptionEn: "Warm paper ground & ink type · Drama, slice-of-life",
    bg: "oklch(0.965 0.014 82)",
    surface: "oklch(0.992 0.008 82)",
    surfaceAlt: "oklch(0.935 0.018 78)",
    border: "oklch(0.84 0.02 76)",
    ink: "oklch(0.22 0.02 58)",
    inkMuted: "oklch(0.45 0.02 62)",
    accent: "oklch(0.56 0.175 36)",
    onAccent: "oklch(0.985 0.006 82)",
    badgeBg: "oklch(0.92 0.045 45)",
    badgeInk: "oklch(0.36 0.11 36)",
  },
  "midnight-thriller": {
    id: "midnight-thriller",
    labelKo: "미드나잇 스릴러",
    labelEn: "Midnight Thriller",
    descriptionKo: "짙은 밤남색과 크림슨 경고 악센트 · 스릴러·미스터리 추천",
    descriptionEn: "Deep midnight slate & crimson accent · Thriller, mystery",
    bg: "oklch(0.14 0.024 260)",
    surface: "oklch(0.19 0.026 258)",
    surfaceAlt: "oklch(0.24 0.028 256)",
    border: "oklch(0.35 0.032 256)",
    ink: "oklch(0.94 0.012 248)",
    inkMuted: "oklch(0.75 0.024 248)",
    accent: "oklch(0.66 0.21 22)",
    onAccent: "oklch(0.98 0.008 248)",
    badgeBg: "oklch(0.28 0.075 22)",
    badgeInk: "oklch(0.91 0.08 24)",
  },
  "pastel-romance": {
    id: "pastel-romance",
    labelKo: "파스텔 로맨스",
    labelEn: "Pastel Romance",
    descriptionKo: "부드러운 블로섬 아이보리와 로즈 포인트 · 로맨스·학원물 추천",
    descriptionEn: "Soft blossom ivory & rose accent · Romance, school life",
    bg: "oklch(0.968 0.018 352)",
    surface: "oklch(0.995 0.008 352)",
    surfaceAlt: "oklch(0.935 0.026 348)",
    border: "oklch(0.86 0.035 348)",
    ink: "oklch(0.25 0.03 345)",
    inkMuted: "oklch(0.47 0.035 345)",
    accent: "oklch(0.57 0.175 352)",
    onAccent: "oklch(0.99 0.006 352)",
    badgeBg: "oklch(0.92 0.055 350)",
    badgeInk: "oklch(0.38 0.11 350)",
  },
  "ink-action": {
    id: "ink-action",
    labelKo: "잉크 액션",
    labelEn: "Ink Action",
    descriptionKo: "먹선 차콜 캔버스와 앰버 임팩트 · 액션·판타지·무협 추천",
    descriptionEn: "Charcoal ink ground & amber spark · Action, fantasy",
    bg: "oklch(0.16 0.01 70)",
    surface: "oklch(0.21 0.012 68)",
    surfaceAlt: "oklch(0.26 0.014 66)",
    border: "oklch(0.37 0.016 66)",
    ink: "oklch(0.96 0.01 86)",
    inkMuted: "oklch(0.76 0.015 80)",
    accent: "oklch(0.76 0.175 72)",
    onAccent: "oklch(0.18 0.02 68)",
    badgeBg: "oklch(0.3 0.065 72)",
    badgeInk: "oklch(0.92 0.09 78)",
  },
};

export const PROMO_MOOD_THEME_LIST: readonly PromoMoodThemeTokens[] = [
  PROMO_MOOD_THEMES["editorial-warm"],
  PROMO_MOOD_THEMES["midnight-thriller"],
  PROMO_MOOD_THEMES["pastel-romance"],
  PROMO_MOOD_THEMES["ink-action"],
];

export const DEFAULT_WEBTOON_PROMO_INPUT: WebtoonPromoInput = {
  title: "별빛 종이공방의 마지막 서약",
  tagline: "닫힌 문 너머, 잊힌 계약서를 펼친 순간 두 세계의 시간이 다시 흐르기 시작했다.",
  genre: "판타지 · 로맨스",
  authorName: "한별 스튜디오",
  highlightCutCaptions: [
    "비 내리는 자정, 사라진 13번째 봉인이 공방 책상 위에 놓여 있었다.",
    "\"네가 서명한 건 기억의 대가야. 이제부터 내 시간을 빌려줄게.\"",
    "1~3화 무료 공개 · 매주 금요일 밤, 다음 선택은 독자의 몫으로 남는다.",
  ],
  platformLinks: {
    naverWebtoon: "https://comic.naver.com/webtoon",
    kakaoPage: "https://page.kakao.com/",
    x: "https://x.com/toonstudio_official",
    instagram: "https://www.instagram.com/toonstudio_official/",
    youtube: "https://www.youtube.com/@toonstudio_official",
  },
  moodTheme: "editorial-warm",
  updateSchedule: "매주 금요일 22:00 연재",
  copyrightYear: 2026,
};

const PLATFORM_CATALOG: readonly {
  readonly key: keyof WebtoonPromoPlatformLinks;
  readonly label: string;
  readonly badge: string;
}[] = [
  { key: "naverWebtoon", label: "네이버웹툰에서 보기", badge: "NAVER" },
  { key: "kakaoPage", label: "카카오페이지에서 보기", badge: "KAKAO" },
  { key: "x", label: "X(트위터) 연재 소식", badge: "X" },
  { key: "instagram", label: "인스타그램 컷 미리보기", badge: "IG" },
  { key: "youtube", label: "유튜브 티저 쇼츠", badge: "YT" },
];

const CUT_ROLES = ["도입 훅", "결정적 전환", "엔딩 절단 훅"] as const;

export function escapeHtml(raw: string): string {
  return raw
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function sanitizeExternalUrl(rawUrl: string | undefined): string | null {
  if (typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  for (let i = 0; i < trimmed.length; i += 1) {
    const code = trimmed.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function buildPromoFileSlug(title: string): string {
  const cleaned = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return cleaned.slice(0, 48) || "webtoon-promo";
}

function resolveMoodTheme(moodTheme: PromoMoodThemeId): PromoMoodThemeTokens {
  return PROMO_MOOD_THEMES[moodTheme] ?? PROMO_MOOD_THEMES["editorial-warm"];
}

function normalizeThreeCutCaptions(captions: readonly string[]): readonly [string, string, string] {
  return [
    captions[0]?.trim() || "첫 컷에서 독자의 시선을 붙잡는 핵심 상황 설정",
    captions[1]?.trim() || "갈등이 터지는 결정적 대사와 감정 전환 포인트",
    captions[2]?.trim() || "다음 화를 클릭할 수밖에 없는 엔딩 절단 훅",
  ];
}

function resolvePlatformCtas(links: WebtoonPromoPlatformLinks): readonly ResolvedPlatformCta[] {
  const resolved: ResolvedPlatformCta[] = [];
  for (const item of PLATFORM_CATALOG) {
    const safeUrl = sanitizeExternalUrl(links[item.key]);
    if (safeUrl) {
      resolved.push({ key: item.key, label: item.label, badge: item.badge, url: safeUrl });
    }
  }
  return resolved;
}

function wrapTextLines(text: string, maxUnitsPerLine: number, maxLines: number): readonly string[] {
  const normalized = text.replace(/\s+/gu, " ").trim();
  if (!normalized) return [""];

  const lines: string[] = [];
  let current = "";
  let units = 0;

  for (const ch of normalized) {
    const charUnits = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/u.test(ch) ? 1.85 : 1;
    if (units + charUnits > maxUnitsPerLine && current.length > 0) {
      if (lines.length === maxLines - 1) {
        lines.push(`${current.trimEnd()}…`);
        return lines;
      }
      lines.push(current.trimEnd());
      current = ch === " " ? "" : ch;
      units = ch === " " ? 0 : charUnits;
    } else {
      current += ch;
      units += charUnits;
    }
  }

  if (current.trim().length > 0) lines.push(current.trim());
  return lines.slice(0, maxLines);
}

function renderSvgTspanLines(
  lines: readonly string[],
  x: number,
  startY: number,
  lineHeight: number,
): string {
  return lines
    .map((line, idx) => `<tspan x="${x}" y="${startY + idx * lineHeight}">${escapeHtml(line)}</tspan>`)
    .join("");
}

function buildHashtags(input: WebtoonPromoInput): readonly string[] {
  const compactTag = (raw: string): string | null => {
    const stripped = raw.trim().replace(/[^a-zA-Z0-9가-힣]/gu, "");
    return stripped.length >= 2 ? `#${stripped.slice(0, 20)}` : null;
  };
  const candidates: (string | null)[] = [
    "#웹툰추천",
    "#신작웹툰",
    compactTag(input.title),
    ...input.genre.split(/[·,/|\s]+/u).map((part) => compactTag(part)),
    compactTag(input.authorName),
    "#웹툰홍보",
  ];
  const unique: string[] = [];
  for (const tag of candidates) {
    if (tag && !unique.includes(tag)) unique.push(tag);
  }
  return unique.slice(0, 7);
}

/**
 * 외부 CDN 의존성 0, 모바일/데스크톱 반응형, OpenGraph + Twitter Card 메타태그,
 * 3컷 세로 스크롤 티저 스트립, 구독 링크 CTA, 저작권/작가 크레딧이 완비된
 * 단일 파일 정적 홍보 랜딩 페이지 HTML을 생성한다.
 */
export function buildStandalonePromoLandingHtml(input: WebtoonPromoInput): string {
  const theme = resolveMoodTheme(input.moodTheme);
  const title = input.title.trim() || "무제 웹툰";
  const tagline = input.tagline.trim() || "지금 첫 화 무료 공개를 만나보세요.";
  const genre = input.genre.trim() || "웹툰";
  const authorName = input.authorName.trim() || "작가 미상";
  const updateSchedule = input.updateSchedule?.trim() ?? "";
  const copyrightYear =
    typeof input.copyrightYear === "number" && Number.isFinite(input.copyrightYear)
      ? Math.max(2000, Math.min(2100, Math.trunc(input.copyrightYear)))
      : 2026;
  const cuts = normalizeThreeCutCaptions(input.highlightCutCaptions);
  const platformCtas = resolvePlatformCtas(input.platformLinks);
  const safeCanonicalUrl = sanitizeExternalUrl(input.canonicalUrl);

  const safeTitle = escapeHtml(title);
  const safeTagline = escapeHtml(tagline);
  const safeGenre = escapeHtml(genre);
  const safeAuthor = escapeHtml(authorName);
  const safeSchedule = escapeHtml(updateSchedule);
  const ogTitle = escapeHtml(`${title} · ${genre}`);
  const ogUrlMeta = safeCanonicalUrl
    ? `\n  <meta property="og:url" content="${escapeHtml(safeCanonicalUrl)}" />`
    : "";

  const cutPanelsHtml = cuts
    .map((caption, index) => {
      const cutNumber = `0${index + 1}`;
      const cutRole = CUT_ROLES[index] ?? "하이라이트";
      const safeCaption = escapeHtml(caption);
      const panelAccentRatio = 26 + index * 24;
      return `      <article class="cut-panel" aria-label="하이라이트 컷 ${cutNumber}">
        <div class="cut-header"><span class="cut-index">CUT ${cutNumber}</span><span class="cut-role">${cutRole}</span></div>
        <div class="cut-frame" role="img" aria-label="${safeTitle} ${cutNumber}번 하이라이트 컷 프레임">
          <svg viewBox="0 0 640 260" width="640" height="260" aria-hidden="true">
            <rect x="0" y="0" width="640" height="260" fill="var(--promo-surface-alt)" />
            <line x1="24" y1="${panelAccentRatio}" x2="616" y2="${panelAccentRatio + 96}" stroke="var(--promo-border)" stroke-width="2" />
            <line x1="616" y1="28" x2="24" y2="${220 - index * 26}" stroke="var(--promo-border)" stroke-width="1.5" stroke-dasharray="8 8" />
            <rect x="28" y="24" width="128" height="32" rx="16" fill="var(--promo-badge-bg)" />
            <text x="92" y="45" text-anchor="middle" fill="var(--promo-badge-ink)" font-size="13" font-weight="700" font-family="system-ui, sans-serif">SCENE ${cutNumber}</text>
            <rect x="28" y="196" width="584" height="40" rx="8" fill="var(--promo-surface)" stroke="var(--promo-border)" stroke-width="1.5" />
            <text x="46" y="221" fill="var(--promo-ink-muted)" font-size="13" font-family="system-ui, sans-serif">세로 스크롤 웹툰 컷 ${cutNumber} · ${safeGenre}</text>
          </svg>
        </div>
        <p class="cut-caption">${safeCaption}</p>
      </article>`;
    })
    .join("\n");

  const ctaSectionHtml =
    platformCtas.length > 0
      ? platformCtas
          .map(
            (cta, idx) =>
              `        <a class="cta-link${idx === 0 ? " cta-primary" : ""}" href="${escapeHtml(cta.url)}" target="_blank" rel="noopener noreferrer"><span class="cta-badge">${escapeHtml(cta.badge)}</span><span class="cta-label">${escapeHtml(cta.label)}</span><span aria-hidden="true">↗</span></a>`,
          )
          .join("\n")
      : `        <p class="empty-cta">연재 플랫폼 링크를 입력하면 이 영역에 바로가기 구독 버튼이 생성됩니다.</p>`;

  const scheduleBadgeHtml = safeSchedule ? `<span class="meta-pill">${safeSchedule}</span>` : "";

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle} — ${safeAuthor} | 웹툰 공식 홍보 페이지</title>
  <meta name="description" content="${safeTagline}" />
  <meta name="author" content="${safeAuthor}" />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="ko_KR" />
  <meta property="og:title" content="${ogTitle}" />
  <meta property="og:description" content="${safeTagline}" />${ogUrlMeta}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${ogTitle}" />
  <meta name="twitter:description" content="${safeTagline}" />
  <style>
    :root { --promo-bg: ${theme.bg}; --promo-surface: ${theme.surface}; --promo-surface-alt: ${theme.surfaceAlt}; --promo-border: ${theme.border}; --promo-ink: ${theme.ink}; --promo-ink-muted: ${theme.inkMuted}; --promo-accent: ${theme.accent}; --promo-on-accent: ${theme.onAccent}; --promo-badge-bg: ${theme.badgeBg}; --promo-badge-ink: ${theme.badgeInk}; }
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--promo-bg); color: var(--promo-ink); font-family: "Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", -apple-system, BlinkMacSystemFont, system-ui, sans-serif; line-height: 1.65; word-break: keep-all; }
    .page-shell { max-width: 720px; margin: 0 auto; padding: 36px 20px 64px; }
    .hero { background: var(--promo-surface); border: 1px solid var(--promo-border); border-radius: 20px; padding: 32px 28px; }
    .meta-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
    .genre-pill { display: inline-block; padding: 5px 12px; border-radius: 999px; background: var(--promo-badge-bg); color: var(--promo-badge-ink); font-size: 13px; font-weight: 700; }
    .meta-pill { display: inline-block; padding: 5px 12px; border-radius: 999px; border: 1px solid var(--promo-border); color: var(--promo-ink-muted); font-size: 13px; font-weight: 600; }
    h1 { margin: 0 0 12px; font-size: clamp(26px, 5vw, 38px); line-height: 1.25; letter-spacing: -0.02em; }
    .tagline { margin: 0 0 18px; font-size: 17px; color: var(--promo-ink-muted); }
    .author-line { margin: 0; padding-top: 14px; border-top: 1px solid var(--promo-border); font-size: 14px; color: var(--promo-ink-muted); }
    .author-line strong { color: var(--promo-ink); }
    .strip-section, .cta-section { margin-top: 28px; }
    .section-heading { margin: 0 0 14px; font-size: 14px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--promo-ink-muted); }
    .cut-strip { display: flex; flex-direction: column; gap: 20px; }
    .cut-panel { background: var(--promo-surface); border: 2px solid var(--promo-border); border-radius: 16px; overflow: hidden; }
    .cut-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 18px; border-bottom: 1px solid var(--promo-border); font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .cut-index { color: var(--promo-accent); }
    .cut-role { color: var(--promo-ink-muted); }
    .cut-frame svg { display: block; width: 100%; height: auto; }
    .cut-caption { margin: 0; padding: 18px; font-size: 17px; font-weight: 600; line-height: 1.6; }
    .cta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
    .cta-link { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 12px 16px; border-radius: 12px; border: 1px solid var(--promo-border); background: var(--promo-surface); color: var(--promo-ink); text-decoration: none; font-weight: 700; font-size: 15px; transition: transform 150ms ease, border-color 150ms ease; }
    .cta-link:hover, .cta-link:focus-visible { border-color: var(--promo-accent); transform: translateY(-1px); outline: 2px solid var(--promo-accent); outline-offset: 2px; }
    .cta-primary { background: var(--promo-accent); color: var(--promo-on-accent); border-color: var(--promo-accent); }
    .cta-badge { font-size: 11px; font-weight: 800; letter-spacing: 0.06em; padding: 3px 7px; border-radius: 6px; border: 1px solid currentColor; }
    .cta-label { flex: 1; }
    .empty-cta { margin: 0; padding: 16px; border-radius: 12px; border: 1px dashed var(--promo-border); color: var(--promo-ink-muted); font-size: 14px; }
    .page-footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--promo-border); font-size: 13px; color: var(--promo-ink-muted); display: flex; flex-direction: column; gap: 4px; }
    @media (max-width: 600px) { .page-shell { padding: 20px 14px 48px; } .hero { padding: 24px 18px; } .cut-caption { font-size: 16px; padding: 14px 16px; } }
    @media (prefers-reduced-motion: reduce) { .cta-link { transition: none; } .cta-link:hover, .cta-link:focus-visible { transform: none; } }
  </style>
</head>
<body>
  <main class="page-shell">
    <header class="hero">
      <div class="meta-row"><span class="genre-pill">${safeGenre}</span>${scheduleBadgeHtml}</div>
      <h1>${safeTitle}</h1>
      <p class="tagline">${safeTagline}</p>
      <p class="author-line">글·그림 <strong>${safeAuthor}</strong></p>
    </header>
    <section class="strip-section" aria-label="3컷 세로 스크롤 티저 스트립">
      <h2 class="section-heading">3-CUT VERTICAL TEASER STRIP</h2>
      <div class="cut-strip">
${cutPanelsHtml}
      </div>
    </section>
    <section class="cta-section" aria-label="연재처 구독 및 공식 채널 링크">
      <h2 class="section-heading">지금 바로 읽기 · 공식 채널</h2>
      <div class="cta-grid">
${ctaSectionHtml}
      </div>
    </section>
    <footer class="page-footer">
      <span>© ${copyrightYear} ${safeAuthor}. All rights reserved.</span>
      <span>외부 CDN·추적 스크립트 없는 정적 단일 HTML 홍보 페이지 (ToonStudio 로컬 생성)</span>
    </footer>
  </main>
</body>
</html>`;
}

function buildSnsCardSvg(params: {
  readonly width: number;
  readonly height: number;
  readonly aspectRatio: "4:5" | "16:9" | "1:1";
  readonly title: string;
  readonly tagline: string;
  readonly genre: string;
  readonly authorName: string;
  readonly cuts: readonly [string, string, string];
  readonly theme: PromoMoodThemeTokens;
  readonly ctaSummary: string;
}): string {
  const { width, height, aspectRatio, title, tagline, genre, authorName, cuts, theme, ctaSummary } =
    params;
  const viewBox = `0 0 ${width} ${height}`;
  const isWide = width > height;
  const pad = isWide ? 56 : 68;
  const titleLines = wrapTextLines(title, isWide ? 24 : 18, 2);
  const taglineLines = wrapTextLines(tagline, isWide ? 36 : 28, 2);

  if (isWide) {
    const rightX = 676;
    const rightW = 468;
    const cutBlocks = cuts
      .map((caption, idx) => {
        const y = 68 + idx * 184;
        const lines = wrapTextLines(caption, 28, 2);
        return `  <rect x="${rightX}" y="${y}" width="${rightW}" height="162" rx="16" fill="${theme.surfaceAlt}" stroke="${theme.border}" stroke-width="2" />
  <text x="${rightX + 24}" y="${y + 34}" fill="${theme.accent}" font-size="16" font-weight="800" font-family="system-ui, sans-serif">CUT 0${idx + 1}</text>
  <text fill="${theme.ink}" font-size="20" font-weight="600" font-family="system-ui, sans-serif">${renderSvgTspanLines(lines, rightX + 24, y + 72, 30)}</text>`;
      })
      .join("\n");

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}" role="img" aria-label="${escapeHtml(title)} ${aspectRatio} 홍보 카드">
  <rect x="0" y="0" width="${width}" height="${height}" fill="${theme.bg}" />
  <rect x="28" y="28" width="${width - 56}" height="${height - 56}" rx="28" fill="${theme.surface}" stroke="${theme.border}" stroke-width="2" />
  <rect x="${pad}" y="68" width="210" height="42" rx="21" fill="${theme.badgeBg}" />
  <text x="${pad + 20}" y="95" fill="${theme.badgeInk}" font-size="20" font-weight="700" font-family="system-ui, sans-serif">${escapeHtml(genre.slice(0, 14))}</text>
  <text fill="${theme.ink}" font-size="48" font-weight="800" font-family="system-ui, sans-serif">${renderSvgTspanLines(titleLines, pad, 178, 60)}</text>
  <text fill="${theme.inkMuted}" font-size="24" font-weight="500" font-family="system-ui, sans-serif">${renderSvgTspanLines(taglineLines, pad, 316, 36)}</text>
  <rect x="${pad}" y="472" width="560" height="64" rx="14" fill="${theme.accent}" />
  <text x="${pad + 24}" y="512" fill="${theme.onAccent}" font-size="22" font-weight="700" font-family="system-ui, sans-serif">${escapeHtml(ctaSummary)}</text>
  <text x="${pad}" y="592" fill="${theme.inkMuted}" font-size="20" font-weight="600" font-family="system-ui, sans-serif">글·그림 ${escapeHtml(authorName)} · ${aspectRatio} TEASER</text>
${cutBlocks}
</svg>`;
  }

  const isTall = height > width;
  const cutStartY = isTall ? 492 : 418;
  const cutHeight = isTall ? 186 : 142;
  const cutGap = isTall ? 24 : 18;
  const ctaY = height - (isTall ? 196 : 158);
  const footerY = height - (isTall ? 84 : 68);
  const cardInnerW = width - pad * 2;

  const cutBlocks = cuts
    .map((caption, idx) => {
      const y = cutStartY + idx * (cutHeight + cutGap);
      const lines = wrapTextLines(caption, 30, 2);
      return `  <rect x="${pad}" y="${y}" width="${cardInnerW}" height="${cutHeight}" rx="18" fill="${theme.surfaceAlt}" stroke="${theme.border}" stroke-width="2" />
  <text x="${pad + 26}" y="${y + 38}" fill="${theme.accent}" font-size="18" font-weight="800" font-family="system-ui, sans-serif">CUT 0${idx + 1} · ${CUT_ROLES[idx] ?? "하이라이트"}</text>
  <text fill="${theme.ink}" font-size="${isTall ? 26 : 22}" font-weight="600" font-family="system-ui, sans-serif">${renderSvgTspanLines(lines, pad + 26, y + (isTall ? 88 : 76), isTall ? 38 : 32)}</text>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}" role="img" aria-label="${escapeHtml(title)} ${aspectRatio} 홍보 카드">
  <rect x="0" y="0" width="${width}" height="${height}" fill="${theme.bg}" />
  <rect x="32" y="32" width="${width - 64}" height="${height - 64}" rx="32" fill="${theme.surface}" stroke="${theme.border}" stroke-width="2" />
  <rect x="${pad}" y="76" width="236" height="46" rx="23" fill="${theme.badgeBg}" />
  <text x="${pad + 24}" y="106" fill="${theme.badgeInk}" font-size="22" font-weight="700" font-family="system-ui, sans-serif">${escapeHtml(genre.slice(0, 14))}</text>
  <text x="${width - pad}" y="106" text-anchor="end" fill="${theme.inkMuted}" font-size="20" font-weight="700" font-family="system-ui, sans-serif">${aspectRatio} PROMO CARD</text>
  <text fill="${theme.ink}" font-size="${isTall ? 56 : 50}" font-weight="800" font-family="system-ui, sans-serif">${renderSvgTspanLines(titleLines, pad, isTall ? 202 : 190, isTall ? 68 : 60)}</text>
  <text fill="${theme.inkMuted}" font-size="${isTall ? 28 : 25}" font-weight="500" font-family="system-ui, sans-serif">${renderSvgTspanLines(taglineLines, pad, isTall ? 364 : 326, isTall ? 40 : 35)}</text>
${cutBlocks}
  <rect x="${pad}" y="${ctaY}" width="${cardInnerW}" height="68" rx="16" fill="${theme.accent}" />
  <text x="${width / 2}" y="${ctaY + 43}" text-anchor="middle" fill="${theme.onAccent}" font-size="24" font-weight="800" font-family="system-ui, sans-serif">${escapeHtml(ctaSummary)}</text>
  <text x="${pad}" y="${footerY}" fill="${theme.inkMuted}" font-size="22" font-weight="600" font-family="system-ui, sans-serif">글·그림 ${escapeHtml(authorName)}</text>
</svg>`;
}

/**
 * 인스타그램 4:5, X(트위터) 16:9, 유튜브 커뮤니티 1:1 3종 홍보 카드 SVG와
 * 플랫폼별 해시태그·후킹 카피 패키지를 생성한다.
 */
export function buildSnsTeaserCardPack(input: WebtoonPromoInput): SnsTeaserCardPack {
  const theme = resolveMoodTheme(input.moodTheme);
  const title = input.title.trim() || "무제 웹툰";
  const tagline = input.tagline.trim() || "지금 첫 화 무료 공개를 만나보세요.";
  const genre = input.genre.trim() || "웹툰";
  const authorName = input.authorName.trim() || "작가 미상";
  const cuts = normalizeThreeCutCaptions(input.highlightCutCaptions);
  const platformCtas = resolvePlatformCtas(input.platformLinks);
  const hashtags = buildHashtags(input);
  const hashtagLine = hashtags.join(" ");
  const slug = buildPromoFileSlug(title);
  const primaryLink = platformCtas[0]?.url ?? "";
  const ctaSummary =
    platformCtas.length > 0
      ? `${platformCtas[0].badge} 포함 ${platformCtas.length}개 채널 공개 중`
      : "1~3화 무료 공개 · 프로필 링크에서 보기";

  const cards: readonly [SnsTeaserCardItem, SnsTeaserCardItem, SnsTeaserCardItem] = [
    {
      id: "instagram",
      platformLabelKo: "인스타그램 4:5",
      platformLabelEn: "Instagram 4:5",
      aspectRatio: "4:5",
      width: 1080,
      height: 1350,
      viewBox: "0 0 1080 1350",
      filename: `${slug}-instagram-4x5.svg`,
      svg: buildSnsCardSvg({ width: 1080, height: 1350, aspectRatio: "4:5", title, tagline, genre, authorName, cuts, theme, ctaSummary }),
      hookCopy: [
        `[${genre}] ${title}`,
        tagline,
        "",
        `CUT 1. ${cuts[0]}`,
        `CUT 2. ${cuts[1]}`,
        `CUT 3. ${cuts[2]}`,
        "",
        primaryLink ? `지금 바로 읽기 → ${primaryLink}` : "저장해두고 오늘 밤 1~3화 정주행하세요.",
        hashtagLine,
      ].join("\n"),
      hashtags,
    },
    {
      id: "x",
      platformLabelKo: "X(트위터) 16:9",
      platformLabelEn: "X (Twitter) 16:9",
      aspectRatio: "16:9",
      width: 1200,
      height: 675,
      viewBox: "0 0 1200 675",
      filename: `${slug}-x-16x9.svg`,
      svg: buildSnsCardSvg({ width: 1200, height: 675, aspectRatio: "16:9", title, tagline, genre, authorName, cuts, theme, ctaSummary }),
      hookCopy: [
        `신작 <${title}> (${genre}) 공개합니다.`,
        `"${cuts[1]}"`,
        primaryLink ? `1화 바로가기: ${primaryLink}` : "타래에서 3컷 하이라이트 이어보기 ↓",
        hashtags.slice(0, 4).join(" "),
      ].join("\n"),
      hashtags: hashtags.slice(0, 5),
    },
    {
      id: "youtube-community",
      platformLabelKo: "유튜브 커뮤니티 1:1",
      platformLabelEn: "YouTube Community 1:1",
      aspectRatio: "1:1",
      width: 1080,
      height: 1080,
      viewBox: "0 0 1080 1080",
      filename: `${slug}-youtube-1x1.svg`,
      svg: buildSnsCardSvg({ width: 1080, height: 1080, aspectRatio: "1:1", title, tagline, genre, authorName, cuts, theme, ctaSummary }),
      hookCopy: [
        `[웹툰 신작 안내] <${title}> · 글/그림 ${authorName}`,
        tagline,
        "가장 기대되는 컷을 댓글로 골라주세요!",
        `① ${cuts[0]}`,
        `② ${cuts[1]}`,
        primaryLink ? `본편 감상 링크: ${primaryLink}` : "",
        hashtagLine,
      ]
        .filter(Boolean)
        .join("\n"),
      hashtags,
    },
  ];

  const combinedCopyText = cards
    .map((card) => `=== ${card.platformLabelKo} (${card.aspectRatio}) ===\n${card.hookCopy}`)
    .join("\n\n");

  return { workTitle: title, moodTheme: theme.id, cards, combinedCopyText };
}
