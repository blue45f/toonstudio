import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
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

interface NamedWorkAccess {
  workId: string;
  actorId: string | null;
  authReady: boolean;
}

function useToolTicket(open: boolean, capture: () => StudioEditorMutationTicket | null, page: RefObject<string>,
  access: StudioDccRouteAccess, namedWork?: NamedWorkAccess) {
  const ticket = useRef<StudioEditorMutationTicket | null>(null);
  const pageId = useRef<string | null>(null);
  const pending = useRef<StudioEditorMutationTicket | null>(null);
  const awaitingFirstActor = useRef(false);
  const { workId, actorId, authReady } = namedWork ?? {};
  const activePageId = page.current;
  useLayoutEffect(() => {
    if (!open) {
      pageId.current = null;
      ticket.current = null;
      pending.current = null;
      awaitingFirstActor.current = false;
      return;
    }
    if (pageId.current === null) {
      pageId.current = activePageId;
      const origin = capture();
      if (access === "allowed" && (!workId || (origin?.workId === workId && origin.authScopeKey === actorId))) {
        ticket.current = origin;
      }
      if (access === "pending") {
        pending.current = origin;
        awaitingFirstActor.current = Boolean(workId && !authReady && !origin?.authScopeKey);
      }
      return;
    }
    let initial = pending.current;
    if (!initial) {
      const issued = ticket.current;
      if (!workId || !issued) return;
      if (access === "allowed" && activePageId === pageId.current
        && issued.workId === workId && issued.authScopeKey === actorId) return;
      ticket.current = null;
      if (access !== "pending") return;
      // 재확인 중에는 삽입을 막고, 이 창이 이미 승인받았던 원고를 비교 기준으로 남긴다.
      initial = issued;
    }
    const current = capture();
    if (!current || access === "denied" || activePageId !== pageId.current || current.workId !== initial.workId
      || current.documentGeneration !== initial.documentGeneration) {
      pending.current = null;
      return;
    }
    // 로그인 복원 중에 연 원고는 처음 확인한 계정에만 연결한다.
    if (awaitingFirstActor.current && current.authScopeKey) {
      if (current.authScopeKey !== actorId || current.workId !== workId) {
        pending.current = null;
        return;
      }
      awaitingFirstActor.current = false;
      initial = current;
      pending.current = current;
    }
    if (current.authScopeKey !== initial.authScopeKey ||
      (current.accessGeneration !== initial.accessGeneration && current.accessGeneration !== initial.accessGeneration + 1)) {
      pending.current = null;
      return;
    }
    if (access === "pending") {
      pending.current ??= current;
      return;
    }
    pending.current = null;
    if (workId && (current.workId !== workId || current.authScopeKey !== actorId)) return;
    ticket.current = current;
  }, [access, activePageId, actorId, authReady, capture, open, workId]);
  return { ticket, pageId };
}

export function useStudio3dToolMutationTickets(capture: () => StudioEditorMutationTicket | null, page: RefObject<string>,
  poserOpen: boolean, mannequinOpen: boolean, bg3dOpen: boolean,
  documentAccess: { locked: boolean; route: StudioDccRouteAccess; namedWork?: NamedWorkAccess }) {
  const { locked, route, namedWork } = documentAccess;
  let access: StudioDccRouteAccess = namedWork ? route : "allowed";
  if (locked) access = route === "pending" ? "pending" : "denied";
  if (namedWork && access !== "denied") {
    if (!namedWork.authReady) access = "pending";
    else if (!namedWork.actorId) access = "denied";
  }
  const poser = useToolTicket(poserOpen, capture, page, access, namedWork);
  const mannequin = useToolTicket(mannequinOpen, capture, page, access, namedWork);
  const bg3d = useToolTicket(bg3dOpen, capture, page, access, namedWork);
  return { poserMutationTicketRef: poser.ticket, poserMutationPageIdRef: poser.pageId,
    mannequinMutationTicketRef: mannequin.ticket, bg3dMutationTicketRef: bg3d.ticket, bg3dMutationPageIdRef: bg3d.pageId };
}
