import { Navigate, useLocation, useParams } from "react-router-dom";

/**
 * 옛 /production/workspaces 주소를 정식 /team/people 주소로 넘기는 호환 리다이렉트.
 * 두 패밀리는 원래도 같은 TeamWorkspacePage를 렌더했고(TeamPeoplePage가 그대로 감싼다)
 * 내부 링크·초대 링크도 전부 /team/people 기준으로 생성돼 왔으므로 본문 소실은 없다.
 * 쿼리·해시는 그대로 유지해 초대 토큰(?token=·#invite=) 같은 기존 공유 링크의
 * 의미가 끊기지 않게 한다. (O-03 일원화, 2026-10-08)
 */
export function TeamPeopleRedirect({ to }: { readonly to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}

export function TeamPeopleWorkspaceRedirect({ suffix = "" }: { readonly suffix?: string }) {
  const { workspaceId } = useParams();
  return <TeamPeopleRedirect to={`/team/people/${encodeURIComponent(workspaceId ?? "")}${suffix}`} />;
}
