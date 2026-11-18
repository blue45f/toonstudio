import type { StudioDraftCollaborationReadiness } from "../../studio-draft-collaboration";

export interface StudioLocalVrmCutHostScope {
  readonly cutDocumentKey?: string;
  readonly cutTeamDocument?: boolean;
  readonly cutWorkScope?: { readonly workId: string; readonly actorId: string | null; readonly authorized: boolean; readonly anchorId?: string };
}

/** 자동 생성한 소유자 룸은 기기 원고다. 다른 참여자나 작품 권한이 생기면 로컬 원본을 발행할 수 없다. */
export function canStoreStudioLocalVrmCut(input: {
  namedDocument: boolean;
  workId: string | null;
  remixId: string | null;
  shared: boolean;
  joined: boolean;
  draftStatus?: StudioDraftCollaborationReadiness["status"];
  peerCount: number;
}): boolean {
  return input.namedDocument && !input.workId && !input.remixId && !input.shared && !input.joined
    && input.draftStatus !== "provisioning" && input.draftStatus !== "ready" && input.peerCount === 0;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 로컬 원고를 임시 팀 작품으로 바꾸기 전에 각 페이지와 마스터의 동결 원본을 검사한다. */
export function studioProjectHasLocalVrmCut(project: unknown): boolean {
  if (!record(project) || !Array.isArray(project.pagesList)) return false;
  return [...project.pagesList, project.master].some(page => record(page) && Array.isArray(page.elements)
    && page.elements.some(element => {
      if (!record(element) || !record(element.bg3dScene)) return false;
      const cut = element.bg3dScene.pinnedVersionedCut;
      return record(cut) && record(cut.source) && cut.source.linkedVrm !== undefined;
    }));
}
