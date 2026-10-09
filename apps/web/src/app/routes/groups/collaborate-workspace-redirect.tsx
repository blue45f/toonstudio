import { Navigate, useLocation } from "react-router-dom";

/**
 * 옛 /collaborate/workspace 주소를 정식 /team/recruiting 주소로 넘기는 호환 리다이렉트.
 * 두 주소는 원래도 같은 HiringWorkspacePage를 경로 분기 없이 렌더했고, 내부 링크는
 * 전부 /team/recruiting 기준으로 생성돼 왔으므로 본문 소실은 없다.
 * 페이지가 useSearchParams로 탭 상태를 읽으므로 쿼리·해시를 그대로 유지한다.
 * (O-10 구인 워크스페이스 일원화, 2026-10-09)
 */
export function CollaborateWorkspaceRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={`/team/recruiting${search}${hash}`} replace />;
}
