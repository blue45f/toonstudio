import { Navigate, useLocation, useParams } from "react-router-dom";

/**
 * 옛 /create 상세 주소를 정식 /showcase 주소로 넘기는 호환 리다이렉트.
 * 쿼리·해시는 그대로 유지해 리더 미리보기(?view=reader&publicPreview=1)와
 * 챌린지 선택(?c=) 같은 기존 공유 링크의 의미가 끊기지 않게 한다.
 */
export function ShowcaseRedirect({ to }: { readonly to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}

export function ShowcaseDetailRedirect({ base }: { readonly base: string }) {
  const { id } = useParams();
  return <ShowcaseRedirect to={`${base}/${encodeURIComponent(id ?? "")}`} />;
}
