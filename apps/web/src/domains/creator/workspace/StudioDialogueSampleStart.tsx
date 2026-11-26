import { useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { createSampleManuscriptPracticeCopy } from "../studio-sample-manuscript-seed";
import { useStudioSeedAutosavePersistence } from "./useStudioSeedAutosavePersistence";

export function StudioDialogueSampleStart() {
  const bt = useBilingual("StudioDialogueSampleStart");
  const navigate = useNavigate();
  const { ownerReady, persist } = useStudioSeedAutosavePersistence();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  async function openSample(event: MouseEvent<HTMLButtonElement>) {
    if (!ownerReady || opening) return;
    const trigger = event.currentTarget;
    setOpening(true);
    setError("");
    try {
      const copy = createSampleManuscriptPracticeCopy(window.localStorage, { mode: "study", target: window });
      if (copy.status === "full") {
        setError(bt("작업 목록에 빈자리가 없습니다.", "Your project library is full."));
        return;
      }
      if (copy.status === "sample-trashed") {
        setError(bt("휴지통에서 샘플 원고를 복원한 뒤 열어 주세요.", "Restore the sample manuscript from Trash to open it."));
        return;
      }
      const outcome = await persist(copy.autosave);
      if (outcome === "busy") {
        setError(bt("다른 탭에서 사본을 사용 중입니다. 그 탭을 닫고 다시 열어 주세요.", "Close the tab using this copy, then try again."));
      } else if (outcome === "unavailable") {
        setError(bt("사본을 저장하지 못했습니다. 기기 저장 공간을 확인한 뒤 다시 열어 주세요.", "Check device storage, then try opening the copy again."));
      } else if (trigger.isConnected) {
        navigate(copy.editorHref);
      }
    } catch {
      setError(bt("샘플을 열지 못했습니다. 기기 저장 공간을 확인한 뒤 다시 열어 주세요.", "Check device storage, then try opening the sample again."));
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="space-y-1">
      <button type="button" disabled={!ownerReady || opening} aria-busy={opening}
        onClick={openSample}
        className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 whitespace-normal rounded-lg" })}>
        {opening ? bt("연습 사본 여는 중…", "Opening practice copy…") : bt("샘플 3컷 대사 고치기", "Edit dialogue in a three-panel sample")}
      </button>
      <p className="text-xs leading-5 text-fg-2">
        {bt("사본의 ‘웹툰/식자’ 메뉴에서 ‘대사 일괄 편집’을 여세요. 대사를 고친 뒤 ‘출고’에서 현재 페이지를 PNG로 받을 수 있어요.", "In the copy, open Webtoon / Lettering and choose Batch dialogue editing. Edit a line, then export the current page as a PNG.")}
      </p>
      {error && <p role="alert" className="text-xs leading-5 text-fg">{error}</p>}
    </div>
  );
}
