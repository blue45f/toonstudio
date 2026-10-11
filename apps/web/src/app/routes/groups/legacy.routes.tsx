import { Navigate } from "react-router-dom";

import { defineAppRoutes } from "../app-route-definition";

/**
 * 레거시 단축 URL을 인앱 404 대신 실제 목적지로 연결한다.
 *
 * `/new`, `/more`, `/tour`, `/principles`, `/story`, `/canvas`는 현재 등록된
 * 라우트가 아니며, 이전에 배포된 헤더·히어로·탭바나 북마크에서 유입될 수 있다.
 * 각각 가장 가까운 실제 목적지로 리다이렉트한다. 사용자 화면에 노출되는 코드는
 * canonical 경로만 사용하고, 이 redirect는 호환성 목적 전용이다.
 *
 * 별칭 정책 확정 (2026-10-08, 소형 잔여 처분): `/new`와 `/make`(creator-resources
 * routes의 resources-make)는 별칭으로 유지한다. 전역 기능 중복 감사 O-02의 "유지"
 * 판정을 코드 실측으로 검증했다 — 두 별칭 모두 `Navigate replace`로 canonical
 * 목적지에 합류하고, 내부 링크 생성(to/href/navigate)은 별칭을 목적지로 쓰지
 * 않는다. 별칭의 존재 이유는 북마크·구버전 화면에서 들어오는 유입을 404 없이
 * 받는 것뿐이다.
 *
 * 목적지 갱신 (2026-10-11, 사용성 웨이브): 웨이브 6에서 인앱 시작 진입점(헤더
 * 제작 CTA·내비·명령 팔레트)이 전부 `/create` 시작 시트로 수렴하면서, 별칭만
 * `/studio/new` 생성 양식으로 직행해 시트를 우회하는 불일치가 남았다. 별칭은
 * 유지하되 목적지를 `/create`로 맞춘다 — 북마크 유입도 템플릿·이어가기를
 * 거치는 같은 시작 경험을 받는다. `/studio/new`는 시트에서 "새 작품 만들기"를
 * 골랐을 때 닿는 2단계 양식으로 그대로 있다.
 */
export const legacyRedirectRoutes = defineAppRoutes([
  // 구 "새 작품" 단축 주소 -> 시작 시트. 기존 `/make` redirect와 동일 목적지.
  { id: "legacy-new", path: "/new", element: <Navigate to="/create" replace /> },
  // 헤더 "전체" 메뉴 -> 현재 내비게이션이 쓰는 사이트맵 디렉터리.
  { id: "legacy-more", path: "/more", element: <Navigate to="/sitemap" replace /> },
  // 히어로 "8분 제품 투어" -> 제품 투어 페이지.
  { id: "legacy-tour", path: "/tour", element: <Navigate to="/product-tour" replace /> },
  // 히어로 "12가지 제품 원칙" -> 제품 원칙 페이지.
  { id: "legacy-principles", path: "/principles", element: <Navigate to="/about/principles" replace /> },
  // 모바일 탭 "스토리" -> 스토리 기획 랩.
  { id: "legacy-story", path: "/story", element: <Navigate to="/story-lab" replace /> },
  // 모바일 탭 "캔버스" -> Studio 캔버스 에디터 (`/studio/*` 라우터가 처리).
  { id: "legacy-canvas", path: "/canvas", element: <Navigate to="/studio/canvas" replace /> },
]);
