import { studioScopedWriteAuthority } from "./studio-scoped-write-authority";

export interface StudioScopedCanvasBoundary { readonly pageId: string; readonly locked: boolean }
export type StudioScopedCanvasBoundaryRef = { readonly current: StudioScopedCanvasBoundary };
type Owner = { readonly current: { readonly locked: boolean } };

/** 공용 잠금은 보존하고 현재 페이지의 명시 그리기 동작만 별도로 허용한다. */
export function canStartStudioScopedDrawing(owner: Owner, boundary: StudioScopedCanvasBoundaryRef, tool: string): boolean {
  const authority = studioScopedWriteAuthority(owner);
  return owner.current.locked && tool === "draw" && !boundary.current.locked && Boolean(authority?.drawingAllowed
    && authority.currentTarget?.definition.pageId === boundary.current.pageId);
}

/** 저장·검수·페이지 전환은 늦은 원본 PNG 응답에도 현재 시점에 다시 검사한다. */
export function scopedStudioDrawingContinuationLocked(owner: Owner, strokeId: string, globalLocked: boolean, boundary?: StudioScopedCanvasBoundaryRef): boolean {
  if (!owner.current.locked) return globalLocked;
  const authority = studioScopedWriteAuthority(owner);
  return !boundary || boundary.current.locked || authority?.currentTarget?.definition.pageId !== boundary.current.pageId
    || !authority?.canContinueCreation("stroke", strokeId);
}
