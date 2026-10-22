import { trimTrailingSlashes } from "../lib/trim-trailing-slashes.ts";

/** Shared discovery classification for the primary navigation and creative journey. */
export const DISCOVER_PURPOSE_PREFIXES = [
  "/discover", "/search", "/explore", "/ranking", "/recommend", "/calendar",
  "/compare", "/random", "/tags", "/authors", "/author", "/title", "/references",
] as const;

const PUBLIC_PAGES = new Set([
  "/", "/brand-film", "/product-tour", "/promo-library", "/ir", "/ir/present", "/features", "/events", "/membership", "/pricing", "/references", "/collaborate", "/collaborate/positions", "/collaborate/gallery", "/creators", "/about", "/about/studio", "/about/workflow", "/about/technology", "/about/technology/architecture", "/about/technology/libraries", "/about/technology/story", "/about/technology/playbook", "/about/technology/guides", "/about/technology/references", "/about/technology/field-notes", "/about/technology/deck", "/about/technology/videos", "/about/technology/licenses", "/about/technology/glossary", "/about/technology/atlas", "/about/principles", "/about/data", "/about/crawler", "/contact", "/business", "/support-us", "/support-creators", "/support", "/help", "/status", "/sitemap", "/install",
  "/discover", "/discover/works", "/search", "/explore", "/ranking", "/recommend",
  "/calendar", "/compare", "/random", "/tags", "/authors", "/insights", "/insights/resources", "/news", "/guide",
  "/research", "/research/catalog", "/research/assets", "/research/open-creation", "/research/packs", "/research/books", "/research/3d-assets", "/research/material-assets", "/research/space-assets", "/research/vam", "/research/rijksmuseum", "/research/fonts", "/research/creatures", "/research/music-metadata", "/research/archive", "/research/weather-light", "/research/open-data", "/references", "/now", "/opportunities", "/story-lab",
  "/learn", "/learn/recipes", "/learn/glossary", "/learn/studio", "/learn/process", "/learn/careers", "/learn/education", "/learn/accessibility", "/learn/resources", "/learn/classroom", "/learn/trace", "/learn/classes", "/learn/contract-checklist",
  "/ecosystem/education", "/ecosystem/collaboration", "/ecosystem/fandom", "/ecosystem/library",
  "/market", "/market/browse", "/market/fit", "/market/compare",
  "/showcase", "/showcase/reviews", "/showcase/challenges", "/showcase/promo", "/create", "/create/challenges", "/create/promo",
  "/community", "/community/events", "/community/promote", "/community/cafes", "/community/title", "/community/author", "/community/pencafe", "/reviews",
  "/accessibility", "/design", "/terms", "/privacy", "/copyright", "/feedback", "/developers",
]);

// 공개 목록과 같은 URL 깊이의 작성·운영 화면은 상세 경로로 분류하지 않는다.
const PRIVATE_WORKFLOW_PAGES = new Set([
  "/collaborate/new", "/collaborate/workspace", "/collaborate/moderation",
  "/community/promote/new", "/community/promote/moderation",
]);

const PUBLIC_DETAIL_ROUTES = [
  /^\/events\/[^/]+$/u,
  /^\/(?:title|author|pencafe)\/[^/]+$/u,
  /^\/market\/resource\/[^/]+$/u,
  /^\/(?:showcase|create)\/(?:series|work)\/[^/]+$/u,
  /^\/showcase\/reviews\/[^/]+$/u,
  /^\/community\/(?:cafes|post)\/[^/]+$/u,
  /^\/community\/promote\/[^/]+$/u,
  /^\/collaborate\/[^/]+$/u,
  /^\/u\/[^/]+$/u,
  /^\/create\/[^/]+$/u,
  /^\/learn\/(?:lessons|paths)\/[^/]+$/u,
  /^\/research\/open-data\/(?:ambientcg|vam|nasa|gbif|musicbrainz|internetarchive|kheritage|neis|tourapi|korean|smithsonian|wikimedia|europeana|dpla)$/u,
];

/** Promotional navigation belongs to public discovery and learning, never account workflows. */
export function isPublicCreativeRoute(pathname: string): boolean {
  const normalized = trimTrailingSlashes(pathname.toLowerCase()) || "/";
  if (PRIVATE_WORKFLOW_PAGES.has(normalized)) return false;
  return PUBLIC_PAGES.has(normalized)
    || PUBLIC_DETAIL_ROUTES.some((route) => route.test(normalized));
}

/** 정책 읽기와 전체화면 발표는 공개 셸을 유지하되 창작 홍보와 다음 작업 제안은 덧붙이지 않는다. */
export function supportsPublicSiteOnwardJourney(pathname: string): boolean {
  const normalized = trimTrailingSlashes(pathname.toLowerCase()) || "/";
  return normalized !== "/"
    && !["/terms", "/privacy", "/copyright", "/ir/present"].includes(normalized)
    && isPublicCreativeRoute(normalized);
}

/**
 * PWA 설치 안내(너짓·자동 쇼케이스)를 띄우지 않는 방해 없는 화면.
 * 전체화면 발표(/ir/present — 위 홍보 여정 제외와 같은 발표 분류)와,
 * 배경 효과까지 끄는 작업 집중 분류(ambient-routes)의 기술 발표 모드·영상 페이지가 근거다.
 * 제외 목록 방식이라 이 집합 밖의 공개·앱 경로에서는 설치 안내가 기존대로 유지된다.
 */
const PWA_INSTALL_PROMPT_EXCLUDED_PATHS = new Set([
  "/ir/present",
  "/about/technology/deck",
  "/about/technology/videos",
  "/brand-film",
]);

/** 발표·영상처럼 방해가 없어야 하는 화면에서만 PWA 설치 안내를 제외한다. */
export function supportsPwaInstallPrompts(pathname: string): boolean {
  const normalized = trimTrailingSlashes(pathname.toLowerCase()) || "/";
  return !PWA_INSTALL_PROMPT_EXCLUDED_PATHS.has(normalized);
}

export function isDiscoverPurposeRoute(pathname: string): boolean {
  const normalized = trimTrailingSlashes(pathname.toLowerCase()) || "/";
  return DISCOVER_PURPOSE_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}
