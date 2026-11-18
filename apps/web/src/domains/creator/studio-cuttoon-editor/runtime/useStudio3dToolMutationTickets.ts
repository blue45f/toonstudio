import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { StudioEditorMutationTicket } from "../../studio-editor-scope";
import type { StudioDccRouteAccess } from "../../studio-router/studio-dcc-workbench-navigation";

import type { StudioLtInsertLayers } from "../../lt-convert/studio-lt-raster-output";

type LtEntry = typeof import("../../lt-convert/studio-lt-image-insert");
type LtManuscript = Omit<Parameters<LtEntry["applyStudioLtToManuscript"]>[0], "layers">;

export function useStudioCharacterLtInsert(read: () => LtManuscript): StudioLtInsertLayers {
  const current = useRef(read);
  current.current = read;
  return useCallback(async (layers, signal) => {
    const before = current.current();
    if (signal.aborted || !before.ticket || before.locked || before.currentPageId !== before.openedPageId) return false;
    const { applyStudioLtToManuscript } = await import("../../lt-convert/studio-lt-image-insert");
    const after = current.current();
    if (signal.aborted || before.ticket !== after.ticket || before.openedPageId !== after.openedPageId) return false;
    return applyStudioLtToManuscript({ ...after, layers });
  }, []);
}

function useToolTicket(open: boolean, capture: () => StudioEditorMutationTicket | null, page: RefObject<string>, access: StudioDccRouteAccess) {
  const ticket = useRef<StudioEditorMutationTicket | null>(null);
  const pageId = useRef<string | null>(null);
  const pending = useRef<StudioEditorMutationTicket | null>(null);
  useEffect(() => {
    if (!open) {
      pageId.current = null;
      ticket.current = null;
      pending.current = null;
      return;
    }
    if (pageId.current === null) {
      pageId.current = page.current;
      if (access === "allowed") ticket.current = capture();
      if (access === "pending") pending.current = capture();
      return;
    }
    const initial = pending.current;
    if (!initial || access === "pending") return;
    pending.current = null;
    if (access !== "allowed" || page.current !== pageId.current) return;
    const current = capture();
    // 최초 권한 확인만 기다린 같은 원고에 한 번 발급한다. 이후 권한 회수·원고 교체는 기존 티켓이 거부한다.
    if (current && current.authScopeKey === initial.authScopeKey && current.workId === initial.workId
      && current.documentGeneration === initial.documentGeneration
      && (current.accessGeneration === initial.accessGeneration || current.accessGeneration === initial.accessGeneration + 1)) {
      ticket.current = current;
    }
  }, [access, capture, open, page]);
  return { ticket, pageId };
}

export function useStudio3dToolMutationTickets(capture: () => StudioEditorMutationTicket | null, page: RefObject<string>,
  poserOpen: boolean, mannequinOpen: boolean, bg3dOpen: boolean, documentAccess: { locked: boolean; route: StudioDccRouteAccess }) {
  let access: StudioDccRouteAccess = "allowed";
  if (documentAccess.locked) access = documentAccess.route === "pending" ? "pending" : "denied";
  const poser = useToolTicket(poserOpen, capture, page, access);
  const mannequin = useToolTicket(mannequinOpen, capture, page, access);
  const bg3d = useToolTicket(bg3dOpen, capture, page, access);
  return { poserMutationTicketRef: poser.ticket, poserMutationPageIdRef: poser.pageId,
    mannequinMutationTicketRef: mannequin.ticket, bg3dMutationTicketRef: bg3d.ticket, bg3dMutationPageIdRef: bg3d.pageId };
}
