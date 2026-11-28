// @vitest-environment jsdom
import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STUDIO_LOCAL_DRAFT_OWNER_PREFIX, studioLocalDraftOwnerScope } from "../live/studio-live-local-draft-owner";
import { StudioDocumentLayoutContext, type StudioDocumentLayoutRuntime } from "../studio-router/studio-document-layout-context";
import { POSER_CUT_QUERY, readPoserCut, stagePoserCut } from "./studio-poser-cut-handoff";
import { StudioPoserCutHandoffHost } from "./StudioPoserCutHandoffHost";

afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); vi.restoreAllMocks(); });

const raster = { pngDataUrl: "data:image/png;base64,AAAA", width: 64, height: 128, displayWidth: 32, displayHeight: 64 };
const path = "/studio/p/work/d/page";
const location = { pathname: path, search: "?workspace=draw" };
const roomA = "work-instant-capture-1234";
const roomB = "work-instant-another-4321";
const roomContext = (roomId: string, ownedRoomId: string = roomId): StudioDocumentLayoutRuntime => ({
  documentKey: "test", documentId: null, draftId: null, documentWorkspace: null,
  draftSessionEpoch: 0, instantWorkId: ownedRoomId, liveRoomParam: roomId, liveInviteRoleParam: null,
  projectId: null, remixId: null, workId: null,
});
function tokenFromHref(href: string): string {
  const token = new URL(href, "http://localhost").searchParams.get(POSER_CUT_QUERY);
  if (!token) throw new Error("테스트용 포즈 인계 토큰이 없습니다.");
  return token;
}
function create(owner: string | null = "artist") {
  const href = stagePoserCut(path + "?workspace=draw", owner, raster);
  return { href, id: tokenFromHref(href) };
}

describe("포저 컷 원고 인계", () => {
  it("권한과 복구 대기 중에는 보존하고, 커밋 거부 뒤 다시 삽입하면 한 번만 반영한다", () => {
    const { href, id } = create();
    const insert = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const build = (ready: boolean) => <MemoryRouter initialEntries={[href]}><StrictMode>
      <StudioPoserCutHandoffHost id={id} owner="artist" ready={ready} exists={() => false} insert={insert} />
    </StrictMode></MemoryRouter>;
    const view = render(build(false));
    expect(insert).not.toHaveBeenCalled();
    view.rerender(build(true));
    expect(insert).toHaveBeenCalledTimes(1);
    expect(readPoserCut(sessionStorage, id, "artist", location)).toMatchObject(raster);
    expect(readPoserCut(localStorage, id, "artist", location)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다시 삽입" }));
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert).toHaveBeenLastCalledWith(expect.objectContaining(raster), `poser-cut-${id}`);
    expect(readPoserCut(sessionStorage, id, "artist", location)).toBeNull();
  });

  it("다른 계정·다른 문서의 토큰으로 편집할 수 없다", () => {
    const { href, id } = create();
    expect(readPoserCut(sessionStorage, id, "artist", { pathname: "/studio/canvas" })).toBeNull();
    const insert = vi.fn();
    render(<MemoryRouter initialEntries={[href]}><StudioPoserCutHandoffHost id={id} owner="other" ready exists={() => false} insert={insert} /></MemoryRouter>);
    expect(insert).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(readPoserCut(sessionStorage, id, "artist", location)).toMatchObject(raster);
  });

  it("이전 커밋 직후 정리가 끊긴 경우 같은 레이어 ID를 재사용한다", () => {
    const { href, id } = create(null);
    const insert = vi.fn();
    render(<MemoryRouter initialEntries={[href]}><StudioPoserCutHandoffHost id={id} owner={null} ready exists={(elementId) => elementId === `poser-cut-${id}`} insert={insert} /></MemoryRouter>);
    expect(insert).not.toHaveBeenCalled();
    expect(readPoserCut(sessionStorage, id, null, location)).toBeNull();
  });

  it("같은 캔버스 주소의 다른 룸과 소유권을 넘겨받지 못한 탭에서 원래 포즈를 쓰지 않는다", () => {
    const scope = studioLocalDraftOwnerScope({ ownerId: "artist", projectId: null, documentId: null, draftId: null });
    localStorage.setItem(STUDIO_LOCAL_DRAFT_OWNER_PREFIX + encodeURIComponent(scope), JSON.stringify({ v: 1, scope, room: roomA }));
    const href = stagePoserCut("/studio/canvas?focus=page#cut", "artist", raster);
    const id = tokenFromHref(href);
    const intended = new URL(href, "http://localhost");
    expect(intended.searchParams.get("room")).toBe(roomA);
    expect(intended.hash).toBe("#cut");
    expect(href).not.toContain("base64");
    const wrong = new URL(href, "http://localhost");
    wrong.searchParams.set("room", roomB);
    expect(readPoserCut(sessionStorage, id, "artist", wrong, roomContext(roomB))).toBeNull();
    expect(readPoserCut(sessionStorage, id, "artist", intended, roomContext(roomA, roomB))).toBeNull();
    expect(readPoserCut(sessionStorage, id, "artist", intended, roomContext(roomA))).toMatchObject(raster);

    const insert = vi.fn().mockReturnValue(true);
    function Recovery() {
      const current = useLocation();
      const navigate = useNavigate();
      const currentRoom = new URLSearchParams(current.search).get("room") ?? "";
      return <>
        <button type="button" onClick={() => void navigate(href, { state: { fixture: true } })}>원래 원고</button>
        <span data-testid="address">{current.pathname + current.search + current.hash}</span>
        <span data-testid="navigation-state">{JSON.stringify(current.state)}</span>
        {new URLSearchParams(current.search).has(POSER_CUT_QUERY) && (
          <StudioDocumentLayoutContext value={roomContext(currentRoom)}>
            <StudioPoserCutHandoffHost id={id} owner="artist" ready exists={() => false} insert={insert} />
          </StudioDocumentLayoutContext>
        )}
      </>;
    }
    render(<MemoryRouter initialEntries={[wrong.pathname + wrong.search + wrong.hash]}><Recovery /></MemoryRouter>);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(insert).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "원래 원고" }));
    fireEvent.click(screen.getByRole("button", { name: "다시 삽입" }));
    expect(insert).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("address").textContent).toBe(`/studio/canvas?focus=page&room=${roomA}#cut`);
    expect(screen.getByTestId("navigation-state").textContent).toBe('{"fixture":true}');
    expect(readPoserCut(sessionStorage, id, "artist", intended, roomContext(roomA))).toBeNull();
  });

  it("작품과 문서의 식별자를 보존하고 다른 원고, 검토 버전, 임의 공유 룸을 막는다", () => {
    const href = stagePoserCut("/studio/canvas?id=server-work", "artist", raster);
    const id = tokenFromHref(href);
    const work = { pathname: "/studio/work/server-work/canvas" };
    expect(readPoserCut(sessionStorage, id, "artist", work)).toMatchObject(raster);
    expect(readPoserCut(sessionStorage, id, "artist", { pathname: "/studio/work/other/canvas" })).toBeNull();
    expect(readPoserCut(sessionStorage, id, "artist", { ...work, search: "?version=2" })).toBeNull();
    expect(readPoserCut(sessionStorage, id, "artist", { ...work, search: `?room=${roomB}` }, {
      ...roomContext(roomB), workId: "server-work",
    })).toBeNull();
    const { id: documentId } = create();
    expect(readPoserCut(sessionStorage, documentId, "artist", { ...location, search: `?workspace=comic&room=${roomA}` },
      roomContext(roomA))).toMatchObject(raster);
    expect(readPoserCut(sessionStorage, documentId, "artist", { ...location, search: `?workspace=comic&room=${roomA}` },
      roomContext(roomA, roomB))).toBeNull();
  });

  it("예전 토큰은 원래 계정과 이름 있는 원고가 일치할 때만 보존한다", () => {
    const { id } = create();
    const key = `toonstudio:poser:cut:v1:${id}`;
    sessionStorage.setItem(key, JSON.stringify({ ...raster, owner: "artist", path }));
    expect(readPoserCut(sessionStorage, id, "artist", location)).toMatchObject(raster);
    expect(readPoserCut(sessionStorage, id, "other", location)).toBeNull();
    expect(readPoserCut(sessionStorage, id, "artist", { pathname: "/studio/p/work/d/other" })).toBeNull();
    sessionStorage.setItem(key, JSON.stringify({ ...raster, owner: null, path: "/studio/canvas" }));
    expect(readPoserCut(sessionStorage, id, null, { pathname: "/studio/canvas" })).toBeNull();
    expect(readPoserCut(sessionStorage, id, null, { pathname: "/studio/canvas", search: `?room=${roomA}` },
      roomContext(roomA))).toBeNull();
    expect(sessionStorage.getItem(key)).not.toBeNull();
  });

  it("5분이 지난 포즈는 다른 계정에서 읽거나 지울 수 없고 원래 계정에서 만료를 정리한다", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const { id } = create();
    const key = `toonstudio:poser:cut:v1:${id}`;
    now.mockReturnValue(300_999);
    expect(readPoserCut(sessionStorage, id, "artist", location)).toMatchObject(raster);
    now.mockReturnValue(301_000);
    expect(readPoserCut(sessionStorage, id, "other", location)).toBeNull();
    expect(sessionStorage.getItem(key)).not.toBeNull();
    expect(readPoserCut(sessionStorage, id, "artist", location)).toBeNull();
    expect(sessionStorage.getItem(key)).toBeNull();
  });
});
