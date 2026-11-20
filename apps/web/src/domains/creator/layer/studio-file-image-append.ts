import type { StudioEditorMutationTicket } from "../studio-editor-scope";
import type { El, FrameEl } from "../studio-element-model";
import type { PageState } from "../studio-page-state";

/** 협업 원고의 파일 가져오기는 새 레이어를 추가하므로 기존 레이어를 최신 배열 그대로 보존한다. */
export function resolveStudioFileImageAppend(input: {
  ticket: StudioEditorMutationTicket;
  currentTicket: StudioEditorMutationTicket;
  canApply: (ticket: StudioEditorMutationTicket) => boolean;
  originalPage: PageState;
  currentPage: PageState | undefined;
  originalFrame: FrameEl | null;
  originalMasterMode: boolean;
  currentMasterMode: boolean;
  currentMasterElements: El[];
  reviewLocked: boolean;
}): El[] | null {
  const { currentPage, originalPage, originalFrame, ticket } = input;
  if (!currentPage || currentPage.id !== originalPage.id || input.reviewLocked
    || input.originalMasterMode !== input.currentMasterMode) return null;
  if (input.currentMasterMode) return input.canApply(ticket) ? input.currentMasterElements : null;

  let authority = ticket;
  if (ticket.workId && ticket.documentGeneration !== input.currentTicket.documentGeneration) {
    // 파일을 읽는 동안 다른 레이어가 바뀌어도 시작한 페이지와 배치 기준은 같아야 한다.
    const frame = originalFrame && currentPage.elements.find(element => element.id === originalFrame.id);
    if (currentPage.canvasH === originalPage.canvasH
      && (!originalFrame || (frame?.type === "frame" && frame.x === originalFrame.x && frame.y === originalFrame.y
        && frame.width === originalFrame.width && frame.height === originalFrame.height))) {
      // 계정·원고·접근 권한은 파일 선택 시점의 값으로 검사한다.
      authority = { ...ticket, documentGeneration: input.currentTicket.documentGeneration };
    }
  }
  return input.canApply(authority) ? currentPage.elements : null;
}
