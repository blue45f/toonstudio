// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useStudio3dToolMutationTickets, useStudioCharacterLtInsert } from "./useStudio3dToolMutationTickets";
import type { StudioLtPngPair } from "../../lt-convert/studio-lt-raster-output";
import type { StudioDccRouteAccess } from "../../studio-router/studio-dcc-workbench-navigation";

const loading = vi.hoisted(() => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  return { wait, release };
});
vi.mock("../../lt-convert/studio-lt-image-insert", async (original) => {
  await loading.wait;
  return original();
});
afterEach(cleanup);

const initialTicket = { workId: "work", authScopeKey: "owner", documentGeneration: 1, accessGeneration: 0 };
function openWhilePending() {
  const page = { current: "page-a" }, capture = vi.fn(() => initialTicket);
  const hook = renderHook(({ access }: { access: StudioDccRouteAccess }) =>
    useStudio3dToolMutationTickets(capture, page, false, false, true, { locked: access !== "allowed", route: access }),
  { initialProps: { access: "pending" } });
  return { hook, capture, page, ticket: hook.result.current.bg3dMutationTicketRef };
}

it("같은 원고를 여는 동안 최초 동기화를 기다렸다가 한 번만 접근 티켓을 발급한다", () => {
  const { hook, capture, ticket } = openWhilePending();
  expect(ticket.current).toBeNull();
  const admitted = { ...initialTicket, accessGeneration: 1 };
  capture.mockReturnValue(admitted);
  hook.rerender({ access: "allowed" });
  expect(ticket.current).toBe(admitted);
  hook.rerender({ access: "denied" });
  capture.mockReturnValue({ ...admitted, accessGeneration: 3 });
  hook.rerender({ access: "allowed" });
  expect(ticket.current).toBe(admitted);
});

it.each(["actor", "work", "document", "access", "page", "denied"])("권한 확인 중 %s 변경은 기존 3D 작업에 새 티켓을 주지 않는다", (change) => {
  const { hook, capture, page, ticket } = openWhilePending();
  capture.mockReturnValue({ ...initialTicket, authScopeKey: change === "actor" ? "other" : "owner",
    workId: change === "work" ? "other" : "work", documentGeneration: change === "document" ? 2 : 1,
    accessGeneration: change === "access" ? 3 : 1 });
  if (change === "page") page.current = "page-b";
  if (change === "denied") hook.rerender({ access: "denied" });
  hook.rerender({ access: "allowed" });
  expect(ticket.current).toBeNull();
});

it("LT 모듈 대기 중 취소·페이지 이동·쓰기 권한 회수·셰이퍼 재열기는 삽입하지 않는다", async () => {
  const data: StudioLtPngPair = [
    { name: "선", src: "data:image/png;base64,AAAA", width: 4, height: 4 },
    { name: "톤", src: "data:image/png;base64,BBBB", width: 4, height: 4 },
  ];
  const commit = vi.fn(() => true);
  const ticket = { workId: "work", authScopeKey: "owner", accessGeneration: 1, documentGeneration: 1 };
  const scope = { currentPageId: "a", openedPageId: "a", locked: false, ticket, admit: () => true,
    canvas: () => ({ canvasWidth: 8, canvasHeight: 8, uid: () => crypto.randomUUID() }), commit };
  const cases = [scope, scope, scope, scope, scope].map(() => {
    const hook = renderHook(({ ctx }) => useStudioCharacterLtInsert(() => ctx), { initialProps: { ctx: scope } });
    const cancel = new AbortController();
    return { hook, cancel, pending: hook.result.current(data, cancel.signal) };
  });
  cases[0]!.cancel.abort();
  cases[1]!.hook.rerender({ ctx: { ...scope, currentPageId: "b" } });
  cases[2]!.hook.rerender({ ctx: { ...scope, admit: () => false } });
  cases[3]!.hook.rerender({ ctx: { ...scope, ticket: { ...ticket } } });
  loading.release();
  expect(await Promise.all(cases.map((item) => item.pending))).toEqual([false, false, false, false, true]);
  expect(commit).toHaveBeenCalledTimes(1);
});
