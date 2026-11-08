import { useEffect, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { StudioStoryboardArtHandoffPanel } from "../StudioStoryboardArtHandoffPanel";
import { STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT, validIdentity } from "../studio-project-document-reader";
import { STUDIO_PROJECT_LIBRARY_UPDATED_EVENT } from "../studio-project-library-reader";
import { STUDIO_PLANNING_UPDATED_EVENT } from "./studio-planning-store";
import { readStudioEpisodeDocumentHandoff } from "./studio-episode-document-handoff";
import { canCopyEpisodeShots, canInitializeEpisodeShotPages, initializeEpisodeShotPages } from "./studio-episode-shot-pages";

import type { PageState } from "../studio-page-state";

export interface EpisodePageEditor {
  readonly pages: readonly PageState[];
  readonly writable: boolean;
  readonly apply: (build: (current: PageState[]) => PageState[] | null) => boolean;
}

type EpisodeDocumentHandoff = ReturnType<typeof readStudioEpisodeDocumentHandoff>;

function readSavedHandoff(projectId: string, documentId: string, search: string): EpisodeDocumentHandoff {
  try {
    return readStudioEpisodeDocumentHandoff(window.localStorage, projectId, documentId, search);
  } catch {
    // 브라우저 정책으로 저장소 자체에 접근할 수 없는 경우도 포함한다.
    return null;
  }
}

/** 회차 기획을 표시하고, 작가가 선택할 때만 현재 빈 원고의 편집 이력에 반영한다. */
export function StudioEpisodeDocumentHandoff({ projectId, documentId, search, editor }: {
  readonly projectId: string;
  readonly documentId: string;
  readonly search: string;
  readonly editor: EpisodePageEditor;
}) {
  const bt = useBilingual("StudioEpisodeDocumentHandoff");
  const [notice, setNotice] = useState("");
  const values = new URLSearchParams(search).getAll("episode");
  const candidate = values[0];
  const episodeId = values.length === 1 && validIdentity(candidate) ? candidate : null;
  const scope = JSON.stringify([projectId, documentId, episodeId]);
  const [snapshot, setSnapshot] = useState<{ scope: string; value: EpisodeDocumentHandoff | null } | null>(null);

  useEffect(() => {
    const reload = () => setSnapshot({ scope, value: readSavedHandoff(projectId, documentId, search) });
    reload();
    const events = [STUDIO_PLANNING_UPDATED_EVENT, STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT, STUDIO_PROJECT_LIBRARY_UPDATED_EVENT, "storage"];
    events.forEach((event) => window.addEventListener(event, reload));
    return () => events.forEach((event) => window.removeEventListener(event, reload));
  }, [documentId, projectId, scope, search]);

  if (snapshot?.scope !== scope) return null;
  const handoff = snapshot.value;
  const blank = handoff !== null && canInitializeEpisodeShotPages(editor.pages, handoff.document.title);
  const fits = handoff !== null && canCopyEpisodeShots(handoff.beats);
  function createPages() {
    if (!handoff || !editor.writable || !blank || !fits) return;
    const fresh = readSavedHandoff(projectId, documentId, search);
    if (!fresh || fresh.document.title !== handoff.document.title
      || fresh.beats.length !== handoff.beats.length
      || fresh.beats.some((beat, index) => beat.summary !== handoff.beats[index]?.summary)) {
      setSnapshot({ scope, value: fresh });
      setNotice(bt("저장된 샷 계획이 바뀌었어요. 현재 계획을 다시 확인해 주세요.", "The saved shot plan changed. Review the current plan before continuing."));
      return;
    }
    const applied = editor.apply((current) => initializeEpisodeShotPages(current, fresh.document.title, fresh.beats));
    setNotice(applied
      ? bt("콘티 페이지와 메모를 만들었어요. 실행 취소로 되돌릴 수 있어요.", "Storyboard pages and notes created. You can undo this change.")
      : bt("현재 원고에 적용할 수 없어요. 편집 권한과 페이지 상태를 확인해 주세요.", "Could not apply the plan. Check edit access and the current pages."));
  }
  return (
    <aside
      aria-label={bt("회차 콘티·작화 인계", "Episode storyboard and artwork handoff")}
      className="fixed bottom-24 right-3 z-[30] w-[min(calc(100vw-1.5rem),24rem)] rounded-xl border border-line bg-card text-sm text-fg shadow-lg"
      data-studio-episode-document-handoff={handoff ? "ready" : "unavailable"}
    >
      <details>
        <summary className="min-h-11 cursor-pointer px-3 py-2.5 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          {handoff ? bt(`${handoff.plan.episodeNumber}화 컷 계획 · ${handoff.document.title}`, `Episode ${handoff.plan.episodeNumber} shot plan · ${handoff.document.title}`)
            : bt("회차 연결 확인 필요", "Check the episode link")}
        </summary>
        <div className="max-h-[45vh] space-y-3 overflow-y-auto border-t border-line p-3">
          {handoff ? <>
            <p>{bt("저장된 회차 기획의 샷 초안입니다. 기존 원고의 페이지를 자동 생성하거나 교체하지 않습니다.", "These shots are a draft from the saved episode plan. Existing manuscript pages are not created or replaced automatically.")}</p>
            <StudioStoryboardArtHandoffPanel
              episodeId={handoff.plan.episodeId}
              beats={handoff.beats}
              artHref={handoff.artHref}
            />
            {handoff.beats.length > 0 ? <div className="space-y-1">
              <button type="button" disabled={!editor.writable || !blank || !fits} onClick={createPages}
                className="min-h-11 rounded-lg border border-line px-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50">
                {bt(`샷 ${handoff.beats.length}개로 콘티 페이지 만들기`, `Create storyboard pages from ${handoff.beats.length} shots`)}
              </button>
              <p className="text-xs text-fg-2">{!fits
                ? bt("샷 수나 메모 길이가 원고 한도를 넘어요. 회차 기획을 줄인 뒤 다시 시도해 주세요.", "The shots exceed the manuscript page or note limit. Shorten the episode plan and try again.")
                : bt("편집 가능한 빈 원고 한 장에서 각 샷을 한 페이지로 만들고, 장면 설명을 콘티 메모에 넣습니다.", "Start with one blank editable page to create a page per shot with its description in the storyboard note.")}</p>
            </div> : null}
            {notice ? <p role="status">{notice}</p> : null}
          </> : <p role="status">{bt("이 프로젝트의 회차와 기존 원고를 확인할 수 없습니다. 기획에서 대상 원고와 저장된 회차를 다시 선택해 주세요.", "The episode and manuscript could not be verified for this project. Select the manuscript and saved episode again in Planning.")}</p>}
        </div>
      </details>
    </aside>
  );
}
