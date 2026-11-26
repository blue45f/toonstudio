import { Navigate, useLocation } from "react-router-dom";

/** 옛 스튜디오 입구의 작업 조건, 앵커, 탐색 상태를 정본 주소로 전달한다. */
export function StudioEntryRedirect({ pathname }: { readonly pathname: string }) {
  const { search, hash, state } = useLocation();
  return <Navigate to={{ pathname, search, hash }} state={state} replace />;
}

export function LegacyCanvasRedirect() {
  return <StudioEntryRedirect pathname="/studio/canvas" />;
}
