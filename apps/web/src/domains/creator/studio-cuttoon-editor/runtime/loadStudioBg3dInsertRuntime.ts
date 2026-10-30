import { createStudioIntentLazyLoader } from "../../studio-intent-lazy-loader";
import type { StudioEditorMutationTicket } from "../../studio-editor-scope";
import type { StudioBackground3DInsertResult } from "../../scene-3d/studio-3d-insert-contract";

type InsertRuntime = Pick<typeof import("../studio-cuttoon-bg3d-insert"), "bindStudioBg3dRenderedImage">;
type InsertHost = Parameters<InsertRuntime["bindStudioBg3dRenderedImage"]>[0] & {
  readonly bg3dMutationTicketRef: { readonly current: StudioEditorMutationTicket | null };
  readonly currentPageIdRef: { readonly current: unknown };
  readonly canApplyStudioMutation: (ticket: StudioEditorMutationTicket) => boolean;
};

export const studioBg3dInsertLoader = createStudioIntentLazyLoader(
  () => import("../studio-cuttoon-bg3d-insert"),
);

/** 청크 대기 중 바뀐 페이지·편집 권한·3D 작업의 결과를 적용하지 않는다. */
export function createStudioBg3dRenderedImageBinder(load: () => Promise<InsertRuntime>) {
  return (host: InsertHost) => async (result: StudioBackground3DInsertResult, targetElementId?: string): Promise<boolean> => {
    const ticket = host.bg3dMutationTicketRef.current;
    const pageId = host.currentPageIdRef.current;
    if (!ticket || !host.canApplyStudioMutation(ticket)) return false;
    const runtime = await load();
    if (host.bg3dMutationTicketRef.current !== ticket
      || host.currentPageIdRef.current !== pageId
      || !host.canApplyStudioMutation(ticket)) return false;
    return runtime.bindStudioBg3dRenderedImage(host)(result, targetElementId);
  };
}

export const bindStudioBg3dRenderedImage = createStudioBg3dRenderedImageBinder(studioBg3dInsertLoader.load);
