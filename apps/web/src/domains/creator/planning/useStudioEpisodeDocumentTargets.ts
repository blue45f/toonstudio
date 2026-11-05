import { useEffect, useState } from "react";

import { STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT } from "../studio-project-document-reader";
import { STUDIO_PROJECT_LIBRARY_UPDATED_EVENT } from "../studio-project-library-reader";
import { readStudioEpisodeDocumentTargets, selectStudioEpisodeDocumentTarget } from "./studio-episode-document-handoff";

type Targets = ReturnType<typeof readStudioEpisodeDocumentTargets>;

export function useStudioEpisodeDocumentTargets(projectId: string) {
  const [snapshot, setSnapshot] = useState<{ projectId: string; targets: Targets | null }>({ projectId, targets: null });
  const [selection, setSelection] = useState<{ projectId: string; documentId: string } | null>(null);

  useEffect(() => {
    const reload = () => {
      try {
        setSnapshot({ projectId, targets: readStudioEpisodeDocumentTargets(window.localStorage, projectId) });
      } catch {
        setSnapshot({ projectId, targets: null });
      }
    };
    reload();
    window.addEventListener(STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT, reload);
    window.addEventListener(STUDIO_PROJECT_LIBRARY_UPDATED_EVENT, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT, reload);
      window.removeEventListener(STUDIO_PROJECT_LIBRARY_UPDATED_EVENT, reload);
      window.removeEventListener("storage", reload);
    };
  }, [projectId]);

  const targets = snapshot.projectId === projectId ? snapshot.targets : null;
  const documents = targets?.documents ?? [];
  const selected = selectStudioEpisodeDocumentTarget(
    documents,
    selection?.projectId === projectId ? selection.documentId : undefined,
  );
  return {
    documents,
    selected,
    select: (documentId: string) => setSelection({ projectId, documentId }),
  };
}
