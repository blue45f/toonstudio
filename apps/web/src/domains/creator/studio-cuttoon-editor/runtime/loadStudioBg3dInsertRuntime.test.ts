import { describe, expect, it, vi } from "vitest";
import { createStudioIntentLazyLoader } from "../../studio-intent-lazy-loader";
import { createStudioBg3dRenderedImageBinder } from "./loadStudioBg3dInsertRuntime";
import type { StudioEditorMutationTicket } from "../../studio-editor-scope";
import type { StudioBackground3DInsertResult } from "../../scene-3d/studio-3d-insert-contract";

// 이 경계는 렌더 결과의 내부 스키마를 읽지 않고 동일 객체를 기존 어댑터에 전달한다.
const result = Object.freeze({ kind: "separated" }) as StudioBackground3DInsertResult;

function fixture() {
  const ticket: StudioEditorMutationTicket = {
    authScopeKey: "artist", workId: "work", accessGeneration: 2, documentGeneration: 3,
  };
  const ticketRef = { current: ticket as StudioEditorMutationTicket | null };
  const pageRef = { current: "page-1" };
  const permission = { current: true };
  const host = {
    bg3dMutationTicketRef: ticketRef,
    currentPageIdRef: pageRef,
    canApplyStudioMutation: vi.fn(() => permission.current),
  };
  const apply = vi.fn(async (_result: StudioBackground3DInsertResult, _target?: string) => true);
  const bind = vi.fn((_host: Record<string, unknown>) => apply);
  const runtime = { bindStudioBg3dRenderedImage: bind };
  return { ticket, ticketRef, pageRef, permission, host, apply, bind, runtime };
}

describe("3D 결과 적용 런타임의 지연 경계", () => {
  it("권한 없는 결과는 청크도 요청하지 않는다", async () => {
    const f = fixture();
    f.ticketRef.current = null;
    const load = vi.fn(async () => f.runtime);
    await expect(createStudioBg3dRenderedImageBinder(load)(f.host)(result)).resolves.toBe(false);
    expect(load).not.toHaveBeenCalled();
    expect(f.bind).not.toHaveBeenCalled();
  });

  it.each(["page", "ticket", "permission"] as const)("청크 대기 중 %s 변경을 적용 전에 거부한다", async (change) => {
    const f = fixture();
    const deferred: { resolve?: (value: typeof f.runtime) => void } = {};
    const load = vi.fn(() => new Promise<typeof f.runtime>((resolve) => { deferred.resolve = resolve; }));
    const pending = createStudioBg3dRenderedImageBinder(load)(f.host)(result, "target");
    if (change === "page") f.pageRef.current = "page-2";
    if (change === "ticket") f.ticketRef.current = { ...f.ticket };
    if (change === "permission") f.permission.current = false;
    expect(deferred.resolve).toBeTypeOf("function");
    deferred.resolve?.(f.runtime);
    await expect(pending).resolves.toBe(false);
    expect(f.bind).not.toHaveBeenCalled();
    expect(f.apply).not.toHaveBeenCalled();
  });

  it("유효한 결과·대상·호스트와 기존 어댑터의 반환값을 유지한다", async () => {
    const f = fixture();
    f.apply.mockResolvedValue(false);
    const bind = createStudioBg3dRenderedImageBinder(async () => f.runtime);
    await expect(bind(f.host)(result, "target")).resolves.toBe(false);
    expect(f.bind).toHaveBeenCalledExactlyOnceWith(f.host);
    expect(f.apply).toHaveBeenCalledExactlyOnceWith(result, "target");
  });

  it("청크 실패는 전파하고 다음 사용자 요청에서 다시 불러온다", async () => {
    const f = fixture();
    const error = new Error("chunk unavailable");
    const importer = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(f.runtime);
    const loader = createStudioIntentLazyLoader<typeof f.runtime>(importer);
    const apply = createStudioBg3dRenderedImageBinder(loader.load)(f.host);
    await expect(apply(result)).rejects.toBe(error);
    expect(f.apply).not.toHaveBeenCalled();
    await expect(apply(result)).resolves.toBe(true);
    expect(importer).toHaveBeenCalledTimes(2);
    expect(f.apply).toHaveBeenCalledTimes(1);
  });
});
