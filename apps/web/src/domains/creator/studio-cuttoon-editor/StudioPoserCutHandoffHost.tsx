import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { toast } from "@/shared/lib/toast-store";
import { finishPoserCut, POSER_CUT_QUERY, readPoserCut, type PoserCutRaster } from "./studio-poser-cut-handoff";

interface Props {
  readonly id: string;
  readonly owner: string | null;
  readonly ready: boolean;
  readonly exists: (elementId: string) => boolean;
  readonly insert: (cut: PoserCutRaster, elementId: string) => boolean;
}

export function StudioPoserCutHandoffHost({ id, owner, ready, exists, insert }: Props) {
  const bt = useBilingual("StudioPoserCutHandoffHost");
  const { pathname, search, hash, state } = useLocation();
  const navigate = useNavigate();
  const [failure, setFailure] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const completed = useRef(false);
  useEffect(() => {
    if (!ready || completed.current || failure) return;
    try {
      const cut = readPoserCut(window.sessionStorage, id, owner, pathname);
      const elementId = `poser-cut-${id}`;
      if (!cut || (!exists(elementId) && !insert(cut, elementId))) {
        setFailure(true);
        return;
      }
      completed.current = true;
      finishPoserCut(window.sessionStorage, id);
      const params = new URLSearchParams(search);
      params.delete(POSER_CUT_QUERY);
      void navigate({ pathname, search: params.toString(), hash }, { replace: true, state });
      toast(bt("포즈 이미지를 현재 페이지의 레이어에 추가했습니다.", "Pose added to the current page as an image layer."), { tone: "success" });
    } catch {
      completed.current = false;
      setFailure(true);
    }
  }, [attempt, bt, exists, failure, hash, id, insert, navigate, owner, pathname, ready, search, state]);
  return <div className="mx-3 flex items-center gap-2 rounded-md bg-panel px-3 py-2 text-sm text-fg" role={failure ? "alert" : "status"}>
    {failure ? bt("포즈 컷을 추가하지 못했습니다. 캡처한 계정과 원고를 확인해 주세요.", "Could not add the pose. Check the original account and manuscript.")
      : bt("원고와 편집 권한을 확인한 뒤 포즈 컷을 추가합니다.", "The pose will be inserted when the manuscript is editable.")}
    {failure && <button type="button" className="min-h-10 rounded border border-line px-3" onClick={() => { setFailure(false); setAttempt((n) => n + 1); }}>
      {bt("다시 삽입", "Retry insertion")}</button>}
  </div>;
}
