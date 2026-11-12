import { Navigate, useLocation } from "react-router-dom";

/** 캔버스 별칭의 작업 조건과 앵커를 정본 주소로 그대로 전달한다. */
export function LegacyCanvasRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: "/studio/canvas", search, hash }} replace />;
}
