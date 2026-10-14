import {
  CreateChallengesPage,
  CreateSeriesPage,
  CreateStartPage,
  CreateWorkPage,
  ShowcasePage,
  StudioPinnedReviewShowcaseDetailPage,
  StudioPinnedReviewShowcasePage,
  StudioPromoPage,
} from "./creator-route-pages";
import { ShowcaseDetailRedirect, ShowcaseRedirect } from "./creator-showcase-redirects";

/**
 * /showcase 정식 표면과 /create 레거시 호환 경로.
 * creator.routes.tsx의 라우트 그룹 줄 수 상한(호스트 래칫) 때문에 분리했으며,
 * 배열 순서가 매칭 우선순위를 정하므로 creatorRoutes 안에서 와일드카드보다
 * 앞 자리를 그대로 유지한다.
 */
export const creatorShowcaseRoutes = [
  // /showcase는 쇼케이스 전용 첫 화면(스포트라이트·큐레이션)이 정본이다. 갤러리 본문은 그 아래 구간이 공유 컴포넌트로 잇는다.
  { id: "creator-showcase", path: "/showcase", element: <ShowcasePage /> },
  { id: "creator-showcase-reviews", path: "/showcase/reviews", element: <StudioPinnedReviewShowcasePage /> },
  { id: "creator-showcase-review", path: "/showcase/reviews/:shareId", element: <StudioPinnedReviewShowcaseDetailPage /> },
  { id: "creator-showcase-challenges", path: "/showcase/challenges", element: <CreateChallengesPage /> },
  { id: "creator-showcase-promo", path: "/showcase/promo", element: <StudioPromoPage /> },
  { id: "creator-showcase-series", path: "/showcase/series/:id", element: <CreateSeriesPage /> },
  { id: "creator-showcase-work", path: "/showcase/work/:id", element: <CreateWorkPage /> },
] as const;

/**
 * /create 시작 시트와 /showcase로의 호환 리다이렉트.
 * creatorRoutes 안에서는 레거시 도구 경로 리다이렉트 뒤에 온다(원래 순서 유지).
 */
export const creatorCreateRoutes = [
  // /create는 작품 시작 시트가 정본이다. 갤러리 본문은 /showcase로 일원화됐으므로
  // 상세 4경로(챌린지·홍보·시리즈·작품)는 정식 /showcase 주소로 리다이렉트해 호환을 유지한다.
  // 시작점 역할 구분 (O-05, 2026-10-09): /create는 "새 작품·템플릿·이어가기"를 고르는 시작 정문이고 실제 생성 폼은
  // /studio/new다. "작품 시작하기" 동선은 /create로 모이고 시트가 폼으로 넘긴다 — 본문이 다른 두 표면이라 유지한다.
  { id: "creator-gallery", path: "/create", element: <CreateStartPage /> },
  { id: "creator-challenges", path: "/create/challenges", element: <ShowcaseRedirect to="/showcase/challenges" /> },
  { id: "creator-promo", path: "/create/promo", element: <ShowcaseRedirect to="/showcase/promo" /> },
  { id: "creator-series", path: "/create/series/:id", element: <ShowcaseDetailRedirect base="/showcase/series" /> },
  { id: "creator-work", path: "/create/:id", element: <ShowcaseDetailRedirect base="/showcase/work" /> },
] as const;
