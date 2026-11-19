import { useState } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { resetFailedStudioLocalDatabaseOwnership } from "../studio-local-database-runtime";

export function StudioWorldLoadNotice({ error, onRetry }: { error: "floor" | "read" | null; onRetry: () => void }) {
  const bt = useBilingual("StudioWorldLoadNotice");
  const [waiting, setWaiting] = useState(false);
  const retry = async () => {
    setWaiting(true);
    try { await resetFailedStudioLocalDatabaseOwnership(); onRetry(); }
    finally { setWaiting(false); }
  };
  return <div className="studio-vspace-engine-message" role="status">
    {error === "floor" ? bt("이 월드에는 안전하게 시작할 수 있는 바닥이 없습니다.", "This world has no safe floor where a player can start.")
      : error === "read" ? <>{bt("저장한 공간을 불러오지 못했습니다.", "Could not load the saved world.")}
        <button className="min-h-11" type="button" disabled={waiting} onClick={retry}>{bt("다시 불러오기", "Try again")}</button></>
      : bt("공간 데이터 불러오는 중…", "Loading world data…")}
  </div>;
}
