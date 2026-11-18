// @vitest-environment jsdom
import { useRef } from "react";
import { useStudioMutationAuthorityRuntime } from "./useStudioMutationAuthorityRuntime";
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

interface WorkFrame {
  actor: string | null;
  authReady: boolean;
  route: StudioDccRouteAccess;
  locked: boolean;
  workId: string | null;
  pageId: string;
  open: boolean;
}
const cold: WorkFrame = { actor: null, authReady: false, route: "pending", locked: false, workId: "work", pageId: "page-a", open: true };
const loadingWork: WorkFrame = { ...cold, actor: "owner", authReady: true, locked: true };
const readyWork: WorkFrame = { ...loadingWork, route: "allowed", locked: false };

function openWork(initialProps: WorkFrame = cold) {
  return renderHook((frame: WorkFrame) => {
    const page = useRef(frame.pageId);
    page.current = frame.pageId;
    const authority = useStudioMutationAuthorityRuntime({
      studioAuthUserId: frame.actor, workId: frame.workId, remixId: null,
      collaborationDocumentLocked: frame.locked, reportError: vi.fn(),
    });
    const tools = useStudio3dToolMutationTickets(authority.captureStudioMutationTicket, page,
      frame.open, frame.open, frame.open, {
        locked: frame.locked, route: frame.route,
        namedWork: frame.workId ? { workId: frame.workId, actorId: frame.actor, authReady: frame.authReady } : undefined,
      });
    const toolsTickets = [tools.poserMutationTicketRef, tools.mannequinMutationTicketRef, tools.bg3dMutationTicketRef];
    return {
      tickets: () => toolsTickets.map((ref) => ref.current),
      admitted: () => toolsTickets.every((ref) => ref.current && authority.canApplyStudioMutation(ref.current)),
      editDocument: authority.markStudioDocumentChanged,
    };
  }, { initialProps });
}

it("공동 원고의 인증과 편집 권한을 모두 확인한 뒤 최초 사용자에게만 세 도구의 쓰기를 허용한다", () => {
  const hook = openWork();
  expect(hook.result.current.tickets()).toEqual([null, null, null]);
  hook.rerender(loadingWork);
  expect(hook.result.current.tickets()).toEqual([null, null, null]);
  hook.rerender(readyWork);
  expect(hook.result.current.admitted()).toBe(true);
  for (const ticket of hook.result.current.tickets()) expect(ticket?.authScopeKey).toBe("owner");
  hook.rerender({ ...readyWork, actor: "teammate" });
  expect(hook.result.current.admitted()).toBe(false);
  hook.rerender({ ...readyWork, actor: "teammate", open: false });
  hook.rerender({ ...readyWork, actor: "teammate" });
  expect(hook.result.current.admitted()).toBe(true);
});

it.each(["actor", "work", "page", "document", "viewer", "403", "signed-out"])(
  "공동 원고의 승인 대기 중 %s를 거친 편집기는 쓰기 티켓을 받을 수 없다", (change) => {
    const hook = openWork();
    if (change === "403") hook.rerender({ ...cold, route: "denied" });
    if (change === "signed-out") hook.rerender({ ...cold, authReady: true });
    hook.rerender(loadingWork);
    if (change === "actor") hook.rerender({ ...loadingWork, actor: "teammate" });
    if (change === "work") hook.rerender({ ...loadingWork, workId: "another-work" });
    if (change === "page") hook.rerender({ ...loadingWork, pageId: "page-b" });
    if (change === "document") hook.result.current.editDocument();
    if (change === "viewer") hook.rerender({ ...loadingWork, route: "denied" });
    hook.rerender(readyWork);
    expect(hook.result.current.tickets()).toEqual([null, null, null]);
  },
);

it.each([true, false])("같은 사용자의 서버 재확인 동안 삽입을 멈추고 같은 원고의 승인만 복원한다 · 잠금 %s", (locked) => {
  const hook = openWork(readyWork);
  const owner = hook.result.current.tickets()[0];
  expect(hook.result.current.admitted()).toBe(true);
  hook.rerender({ ...readyWork, route: "pending", locked });
  expect(hook.result.current.tickets()).toEqual([null, null, null]);
  hook.rerender(readyWork);
  const restored = hook.result.current.tickets()[0];
  expect(hook.result.current.admitted()).toBe(true);
  expect(restored).not.toBe(owner);
  expect(restored).toEqual({ ...owner, accessGeneration: locked ? 2 : 0 });
});

it.each(["actor", "work", "page", "document", "viewer"])(
  "이미 승인받은 공동 원고도 재확인 중 %s가 바뀌면 기존 창의 삽입을 복원하지 않는다", (change) => {
    const hook = openWork(readyWork);
    const checking: WorkFrame = { ...readyWork, route: "pending", locked: true };
    hook.rerender(checking);
    if (change === "actor") hook.rerender({ ...checking, actor: "teammate" });
    if (change === "work") hook.rerender({ ...checking, workId: "another-work" });
    if (change === "page") hook.rerender({ ...checking, pageId: "page-b" });
    if (change === "document") hook.result.current.editDocument();
    if (change === "viewer") hook.rerender({ ...checking, route: "denied" });
    hook.rerender(readyWork);
    expect(hook.result.current.tickets()).toEqual([null, null, null]);
  },
);

it("공동 원고에서 보기 권한으로 바뀐 편집기는 권한 복구 뒤에도 다시 열어야 한다", () => {
  const hook = openWork(readyWork);
  expect(hook.result.current.admitted()).toBe(true);
  hook.rerender({ ...readyWork, route: "denied" });
  expect(hook.result.current.tickets()).toEqual([null, null, null]);
  hook.rerender(readyWork);
  expect(hook.result.current.admitted()).toBe(false);
});

it("팀 작품이 없는 게스트 원고와 독립 도구는 로그인 복원 동안에도 편집할 수 있다", () => {
  const hook = openWork({ ...cold, workId: null });
  expect(hook.result.current.admitted()).toBe(true);
  for (const ticket of hook.result.current.tickets()) expect(ticket?.authScopeKey).toBeNull();
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
