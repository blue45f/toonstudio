import { useMemo, useState } from "react";
import { studioDocumentHref } from "../studio-document-workspace";
import { readStudioProjectDocuments } from "../studio-project-document-reader";
import { readStudioProjectLibrary } from "../studio-project-library-reader";
import { readActiveProjectContext } from "../studio-shell/active-project-context";
import { isValidStudioWorkspaceWorkId, studioCanvasPathname } from "../studio-workspace-route";

/** 이 탭의 활성 작품을 먼저 선택한다. 원고 목록은 선택한 작품 한 개에서만 읽는다. */
export function useStudioPoserCutDestination(query: URLSearchParams, ko: boolean) {
  const [choice, setChoice] = useState<string | null>(null);
  const [documentChoice, setDocumentChoice] = useState("");
  const sources = useMemo(() => {
    try {
      return { projects: readStudioProjectLibrary(window.localStorage).projects, context: readActiveProjectContext(window.sessionStorage) };
    } catch {
      return { projects: [], context: null };
    }
  }, []);
  const explicit = query.get("project") ?? query.get("projectId");
  const selected = choice ?? explicit ?? sources.context ?? "";
  const registered = sources.projects.find((project) => project.id === selected);
  const eligible = useMemo(() => {
    if (!registered || registered.status !== "active") return [];
    try {
      return readStudioProjectDocuments(window.localStorage, registered.id).documents.filter((doc) =>
        doc.status === "active" && (doc.allowedWorkspaces.includes("draw") || doc.allowedWorkspaces.includes("comic")));
    } catch {
      return [];
    }
  }, [registered]);
  const requested = documentChoice || (choice === null ? query.get("document") ?? query.get("documentId") : null);
  const document = requested ? eligible.find((item) => item.id === requested)
    : eligible.find((item) => item.id === registered?.lastOpenedDocumentId) ?? eligible[0];
  let href: string | null = null;
  if (document) href = studioDocumentHref({ projectId: document.projectId, documentId: document.id, workspace: document.allowedWorkspaces.includes("draw") ? "draw" : "comic" });
  else if (!selected && !requested) href = studioCanvasPathname(null);
  else if (!registered && isValidStudioWorkspaceWorkId(selected) && !requested) href = studioCanvasPathname(selected);
  const style = "min-h-10 max-w-48 rounded-md border border-line bg-card px-2 text-xs text-fg";
  const selector = <div className="flex flex-wrap items-center gap-1">
    <label className="inline-flex items-center gap-1 text-xs text-fg-2">
      {ko ? "삽입할 원고" : "Insert into"}
      <select className={style} value={selected} onChange={(event) => { setChoice(event.target.value); setDocumentChoice(""); }}>
        <option value="">{ko ? "로컬 초안" : "Local draft"}</option>
        {selected && !registered && <option value={selected}>{selected}</option>}
        {sources.projects.filter((project) => project.status === "active" || project.id === selected).map((project) =>
          <option key={project.id} value={project.id}>{project.title}</option>)}
      </select>
    </label>
    {registered && <select aria-label={ko ? "대상 원고 문서" : "Destination document"} className={style}
      value={document?.id ?? ""} onChange={(event) => setDocumentChoice(event.target.value)}>
      {!document && <option value="">{ko ? "편집할 원고 선택" : "Choose an editable document"}</option>}
      {eligible.map((doc) => <option key={doc.id} value={doc.id}>{doc.title}</option>)}
    </select>}
  </div>;
  return { href, selector };
}
