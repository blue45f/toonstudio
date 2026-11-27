import { lazy, Suspense, useState } from "react";
import { useLocation } from "react-router-dom";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { STUDIO_IMPORT_HANDOFF_QUERY_KEY } from "../studio-import-handoff";
import type { StudioImportHandoffHostProps } from "./StudioImportHandoffHost";

function ImportHandoffLoadError() {
  const bt = useBilingual("StudioImportHandoffEntry");
  return (
    <div role="alert" className="mx-3 mt-2 flex flex-wrap items-center gap-2 text-sm text-danger">
      {bt("파일 가져오기를 열지 못했어요.", "Could not open the file importer.")}
      <a href="/studio/import" className="inline-flex min-h-11 items-center font-semibold underline">
        {bt("파일 다시 선택", "Choose the file again")}
      </a>
    </div>
  );
}

// 자동 새로고침은 아직 전달하지 않은 브라우저 메모리의 File을 잃게 한다.
const LazyStudioImportHandoffHost = lazy(() => import("./StudioImportHandoffHost")
  .then(({ StudioImportHandoffHost }) => ({ default: StudioImportHandoffHost }))
  .catch(() => ({ default: ImportHandoffLoadError })));

export function StudioImportHandoffEntry(props: Omit<StudioImportHandoffHostProps, "handoffToken">) {
  const { search } = useLocation();
  const requestToken = new URLSearchParams(search).get(STUDIO_IMPORT_HANDOFF_QUERY_KEY);
  const [handoffToken, setHandoffToken] = useState(requestToken);
  // 결과 확인 중 주소에서 전달 ID가 사라져도 같은 편집기의 상태 안내를 유지한다.
  if (requestToken && requestToken !== handoffToken) {
    setHandoffToken(requestToken);
  }
  if (!handoffToken) return null;

  return <Suspense fallback={null}><LazyStudioImportHandoffHost {...props} handoffToken={handoffToken} /></Suspense>;
}
