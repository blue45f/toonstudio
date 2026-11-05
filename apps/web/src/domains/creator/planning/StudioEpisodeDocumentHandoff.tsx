import { useEffect, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { StudioStoryboardArtHandoffPanel } from "../StudioStoryboardArtHandoffPanel";
import { STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT, validIdentity } from "../studio-project-document-reader";
import { STUDIO_PROJECT_LIBRARY_UPDATED_EVENT } from "../studio-project-library-reader";
import { STUDIO_PLANNING_UPDATED_EVENT } from "./studio-planning-store";
import { readStudioEpisodeDocumentHandoff } from "./studio-episode-document-handoff";

type EpisodeDocumentHandoff = ReturnType<typeof readStudioEpisodeDocumentHandoff>;

/** 회차 기획은 읽기 전용으로 보여 주고, 작업공간만 바꿔 같은 원고·history를 유지한다. */
export function StudioEpisodeDocumentHandoff({ projectId, documentId, search }: {
  readonly projectId: string;
  readonly documentId: string;
  readonly search: string;
}) {
  const bt = useBilingual("StudioEpisodeDocumentHandoff");
  const values = new URLSearchParams(search).getAll("episode");
  const candidate = values[0];
  const episodeId = values.length === 1 && validIdentity(candidate) ? candidate : null;
  const scope = JSON.stringify([projectId, documentId, episodeId]);
  const [snapshot, setSnapshot] = useState<{ scope: string; value: EpisodeDocumentHandoff | null } | null>(null);

  useEffect(() => {
    const reload = () => {
      let value: EpisodeDocumentHandoff;
      try {
        value = readStudioEpisodeDocumentHandoff(window.localStorage, projectId, documentId, search);
      } catch {
        // localStorage 속성 접근 자체가 거부된 경우도 연결 불가로 표시한다.
        value = null;
      }
      setSnapshot({ scope, value });
    };
    reload();
    const events = [STUDIO_PLANNING_UPDATED_EVENT, STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT, STUDIO_PROJECT_LIBRARY_UPDATED_EVENT, "storage"];
    events.forEach((event) => window.addEventListener(event, reload));
    return () => events.forEach((event) => window.removeEventListener(event, reload));
  }, [documentId, projectId, scope, search]);

  if (snapshot?.scope !== scope) return null;
  const handoff = snapshot.value;
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
          </> : <p role="status">{bt("이 프로젝트의 회차와 기존 원고를 확인할 수 없습니다. 기획에서 대상 원고와 저장된 회차를 다시 선택해 주세요.", "The episode and manuscript could not be verified for this project. Select the manuscript and saved episode again in Planning.")}</p>}
        </div>
      </details>
    </aside>
  );
}
