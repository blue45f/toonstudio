// @vitest-environment jsdom
import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POSER_CUT_QUERY, readPoserCut, stagePoserCut } from "./studio-poser-cut-handoff";
import { StudioPoserCutHandoffHost } from "./StudioPoserCutHandoffHost";

afterEach(() => { cleanup(); sessionStorage.clear(); });

const raster = { pngDataUrl: "data:image/png;base64,AAAA", width: 64, height: 128, displayWidth: 32, displayHeight: 64 };
const path = "/studio/p/work/d/page";
function create(owner: string | null = "artist") {
  const href = stagePoserCut(sessionStorage, path + "?workspace=draw", owner, raster);
  const id = new URL(href, "http://localhost").searchParams.get(POSER_CUT_QUERY);
  if (!id) throw new Error("테스트용 포즈 인계 토큰이 없습니다.");
  return { href, id };
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
    expect(readPoserCut(sessionStorage, id, "artist", path)).toMatchObject(raster);
    fireEvent.click(screen.getByRole("button", { name: "다시 삽입" }));
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert).toHaveBeenLastCalledWith(expect.objectContaining(raster), `poser-cut-${id}`);
    expect(readPoserCut(sessionStorage, id, "artist", path)).toBeNull();
  });

  it("다른 계정·다른 문서의 토큰으로 편집할 수 없다", () => {
    const { href, id } = create();
    expect(readPoserCut(sessionStorage, id, "artist", "/studio/canvas")).toBeNull();
    const insert = vi.fn();
    render(<MemoryRouter initialEntries={[href]}><StudioPoserCutHandoffHost id={id} owner="other" ready exists={() => false} insert={insert} /></MemoryRouter>);
    expect(insert).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(readPoserCut(sessionStorage, id, "artist", path)).toMatchObject(raster);
  });

  it("이전 커밋 직후 정리가 끊긴 경우 같은 레이어 ID를 재사용한다", () => {
    const { href, id } = create(null);
    const insert = vi.fn();
    render(<MemoryRouter initialEntries={[href]}><StudioPoserCutHandoffHost id={id} owner={null} ready exists={(elementId) => elementId === `poser-cut-${id}`} insert={insert} /></MemoryRouter>);
    expect(insert).not.toHaveBeenCalled();
    expect(readPoserCut(sessionStorage, id, null, path)).toBeNull();
  });
});
