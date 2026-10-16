/**
 * UI/UX 감사 대상 라우트와 뷰포트.
 *
 * 선정 근거 (apps/web/src/shared/lib/site-route-authority.ts 와 apps/web/src/app/routes/groups/*.routes.tsx,
 * route-manifest.ts 를 읽고 2026-10-16 기준으로 고름. 라우트 전체는 수백 개라 "핵심 화면 30개 안팎"만 잰다.)
 *
 * 1. 사이트 라우트 권위(SITE_ROUTE_AUTHORITIES)의 1차 노출 화면(SITE_PRIMARY_ROUTE_IDS)을 먼저 넣는다:
 *    /home /team /production /studio /studio/new /studio/assets. (/hub 는 /discover·/community 와 목적이 겹쳐 뺐고,
 *    /studio/publish 는 프로젝트 문맥이 필수(access: project)라 라우트 감사가 아닌 후속 여정 범위로 남겼다 — 보고서 gaps.)
 * 2. route-manifest 의 정본 입구(tier: primary)와 사용자가 처음 만나는 화면을 넣는다:
 *    홈 / 탐색(/discover·/explore) / 커뮤니티 / 마켓 / 요금 / 도움말 / 설정.
 * 3. 사용자가 요구한 범주를 빠짐없이 채운다: 홈, 탐색, 마켓, 만들기 진입(/create), 스튜디오 라이브러리,
 *    새 작품, 템플릿, 리서치, 협업 허브(/collaborate), 매뉴얼(/studio/manual), 설정, 에디터 진입 화면.
 * 4. 접근성·반응형 압력이 큰 유형을 골고루 섞는다: DOM 이 큰 목록(/ranking 약 1.5만 노드, /search, /sitemap),
 *    폼(/auth/login, /studio/new, /studio/import), 데이터 탐색(/market/browse, /research/catalog),
 *    문서형(/studio/manual, /help, /about), 오류 화면(404), 에디터 진입(캔버스·워커).
 * 5. 공개/로그인 분리: access 가 sign-in 이거나 개인 데이터를 보여 주는 화면은 시드 테스트 계정으로 로그인한 상태로 재고(auth: "user"),
 *    나머지는 비로그인 방문자 상태로 잰다(auth: "public"). 로컬 우선 제품이라 /studio 는 비로그인으로도 열리므로
 *    같은 경로를 두 상태로 모두 잰다(studio-library-guest, studio-library) — 비로그인 방문자에게만 생기는 문제(예: 인증 필요한 API 호출)를 놓치지 않으려는 것이다.
 * 6. 동적 경로(/title/:slug, /production/projects/:id …)는 시드 데이터에 의존해 재현성이 낮아 제외했다.
 *    에디터 진입은 예제 프로젝트(라이브러리가 첫 진입에 심는 로컬 프로젝트)를 쓰며 prepare 로 먼저 심는다.
 *
 * 이 파일은 데이터만 둔다. 측정은 measure.mjs, 점수는 rubric.mjs 가 맡는다.
 */

export const VIEWPORTS = Object.freeze([
  Object.freeze({ id: "mobile", label: "모바일 390×844", width: 390, height: 844, isMobile: true, hasTouch: true }),
  Object.freeze({ id: "tablet", label: "태블릿 768×1024", width: 768, height: 1024, isMobile: false, hasTouch: true }),
  Object.freeze({ id: "desktop", label: "데스크톱 1440×900", width: 1440, height: 900, isMobile: false, hasTouch: false }),
]);

/** 에디터 진입 라우트가 쓰는 예제 프로젝트 경로(StudioExampleProjectBanner 의 "예제 열기" 링크와 같다). */
export const EXAMPLE_EDITOR_PATH = "/studio/p/example-first-webtoon/d/example-ep01?resume=latest&workspace=comic";

const route = (id, path, label, auth, group, extra = {}) => Object.freeze({ id, path, label, auth, group, ...extra });

export const ROUTES = Object.freeze([
  // ── 비로그인 방문자 ────────────────────────────────────────────
  route("home", "/", "홈", "public", "home"),
  route("discover", "/discover", "작품 탐색", "public", "discover"),
  route("explore", "/explore", "스펙트럼 탐색 허브", "public", "discover"),
  route("search", "/search", "검색", "public", "discover"),
  route("ranking", "/ranking", "통합 랭킹(큰 목록)", "public", "discover"),
  route("market-home", "/market", "마켓 홈", "public", "market"),
  route("market-browse", "/market/browse", "마켓 둘러보기", "public", "market"),
  route("community", "/community", "커뮤니티", "public", "community"),
  route("collaborate-hub", "/collaborate", "협업 허브(구인·의뢰)", "public", "community"),
  route("research-desk", "/research", "창작 리서치 데스크", "public", "research"),
  route("research-catalog", "/research/catalog", "작품 리서치 랩", "public", "research"),
  route("learn", "/learn", "배우기", "public", "learn"),
  route("manual", "/studio/manual", "스튜디오 매뉴얼", "public", "learn"),
  route("create-start", "/create", "작품 시작하기(만들기 진입)", "public", "create"),
  route("showcase", "/showcase", "쇼케이스", "public", "create"),
  route("about", "/about", "서비스 소개", "public", "info"),
  route("pricing", "/pricing", "요금제", "public", "info"),
  route("help", "/help", "도움말", "public", "info"),
  route("sitemap", "/sitemap", "사이트맵", "public", "info"),
  route("login", "/auth/login", "로그인", "public", "account"),
  route("not-found", "/__ux-audit-missing__", "없는 주소(404)", "public", "system"),
  route("studio-library-guest", "/studio", "스튜디오 라이브러리(비로그인)", "public", "studio"),

  // ── 시드 테스트 계정으로 로그인한 상태 ──────────────────────────
  route("work-home", "/home", "작업 홈", "user", "home"),
  route("my-space", "/my", "내 공간", "user", "account"),
  route("studio-library", "/studio", "스튜디오 라이브러리", "user", "studio"),
  route("studio-new", "/studio/new", "새 작품", "user", "studio"),
  route("studio-templates", "/studio/templates", "템플릿", "user", "studio"),
  route("studio-import", "/studio/import", "가져오기", "user", "studio"),
  route("studio-assets", "/studio/assets", "작품 재료", "user", "studio"),
  route("editor-entry", EXAMPLE_EDITOR_PATH, "에디터 진입(예제 프로젝트)", "user", "studio", {
    // 라이브러리가 첫 진입에 예제 프로젝트를 로컬 저장소에 심으므로, 에디터 주소를 열기 전에 라이브러리를 한 번 연다.
    prepare: Object.freeze({ path: "/studio", waitForLinkName: "예제 · 첫 웹툰 한 컷 이어서 작업", settleMs: 3000 }),
  }),
  route("settings", "/settings", "설정", "user", "account"),
  route("team", "/team", "팀(협업 홈)", "user", "community"),
  route("production", "/production", "제작 관리", "user", "studio"),
  route("publish-center", "/publish", "연재 센터", "user", "studio"),
]);

/** 로그인이 필요한 라우트인지. */
export const requiresLogin = (entry) => entry.auth === "user";

/**
 * 라우트·뷰포트 선택. 필터가 비어 있으면 전체. 결과 순서는 항상 ROUTES/VIEWPORTS 선언 순서다(결정적).
 * @param {{ routeIds?: readonly string[], viewportIds?: readonly string[], auth?: "public" | "user" }} [filter]
 */
export function selectPlan(filter = {}) {
  const routeIds = filter.routeIds?.length ? new Set(filter.routeIds) : null;
  const viewportIds = filter.viewportIds?.length ? new Set(filter.viewportIds) : null;
  const routes = ROUTES.filter((entry) => (!routeIds || routeIds.has(entry.id)) && (!filter.auth || entry.auth === filter.auth));
  const viewports = VIEWPORTS.filter((entry) => !viewportIds || viewportIds.has(entry.id));
  const unknownRoutes = routeIds ? [...routeIds].filter((id) => !ROUTES.some((entry) => entry.id === id)) : [];
  const unknownViewports = viewportIds ? [...viewportIds].filter((id) => !VIEWPORTS.some((entry) => entry.id === id)) : [];
  return { routes, viewports, unknownRoutes, unknownViewports };
}

/** 측정 칸(라우트×뷰포트) 목록. */
export function planCells(routes, viewports) {
  return routes.flatMap((entry) => viewports.map((viewport) => ({
    key: `${entry.id}@${viewport.id}`,
    route: entry,
    viewport,
  })));
}

/**
 * 사이트 라우트 권위와 대조한 주석. 권위에 등록된 경로면 접근 방식(access)·목적(purpose)을 붙인다.
 * @param {typeof ROUTES} routes
 * @param {(path: string) => ({ access: string, purpose: string, label: { ko: string } } | null)} resolveAuthority
 */
export function annotateWithAuthority(routes, resolveAuthority) {
  return routes.map((entry) => {
    const authority = resolveAuthority(entry.path.split(/[?#]/u, 1)[0]);
    return {
      id: entry.id,
      path: entry.path,
      auth: entry.auth,
      authority: authority ? { access: authority.access, purpose: authority.purpose, label: authority.label.ko } : null,
    };
  });
}

/**
 * 사이트 라우트 권위(TypeScript)를 불러온다. 실패해도 감사는 계속하고 주석만 생략한다.
 * Node 의 TypeScript 직접 실행을 쓰며, 패키지 type 미지정 경고는 이 가져오기에서만 숨긴다.
 */
export async function loadSiteRouteAuthority(repositoryRoot) {
  const original = process.emitWarning;
  process.emitWarning = function emitFiltered(warning, ...rest) {
    const code = typeof rest[0] === "object" && rest[0] !== null ? rest[0].code : rest[1];
    if (code === "MODULE_TYPELESS_PACKAGE_JSON") return undefined;
    return original.call(this, warning, ...rest);
  };
  try {
    const url = new URL("apps/web/src/shared/lib/site-route-authority.ts", `file://${repositoryRoot.replace(/\/?$/u, "/")}`);
    const module = await import(url.href);
    return typeof module.resolveSiteRouteAuthority === "function" ? module.resolveSiteRouteAuthority : null;
  } catch {
    return null;
  } finally {
    process.emitWarning = original;
  }
}
