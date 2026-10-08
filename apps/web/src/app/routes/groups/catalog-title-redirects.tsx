import { Navigate, useLocation, useParams } from "react-router-dom";

/**
 * 옛 회차 목록 주소(/title/:slug/episodes) 호환 리다이렉트 (F-B13-2, 2026-10-08).
 *
 * 회차 목록의 정본은 작품 상세 페이지의 회차 섹션이다 — 뷰어의 "회차 목록"
 * 링크도 상세 주소에 #episodes 해시를 붙인 형태(/title/:slug#episodes)를
 * 쓴다. 독립된 /episodes 페이지는 존재한 적이 없어서 이 주소로 들어오면
 * 404가 뜨고 "홈으로 돌아가기"만 남았는데, 기대 목적지는 작품 상세이므로
 * 정본 형태 그대로 replace 리다이렉트한다. 쿼리는 유지한다.
 */
export function TitleEpisodesRedirect() {
  const { slug } = useParams();
  const { search } = useLocation();
  return (
    <Navigate
      to={`/title/${encodeURIComponent(slug ?? "")}${search}#episodes`}
      replace
    />
  );
}
