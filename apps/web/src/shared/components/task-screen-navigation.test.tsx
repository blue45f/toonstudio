// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { TaskScreenNavigation } from "./task-screen-navigation";
import { useTaskScreen } from "./use-task-screen";

const ids = ["write", "preview"] as const;
const items = [{ id: "write", label: "작성" }, { id: "preview", label: "미리보기" }];

function Fixture() {
  const { activeScreen, navigateScreen } = useTaskScreen({ ids, defaultScreen: "write" });
  const location = useLocation();
  const navigate = useNavigate();
  return <main>
    <h1>작업 · {activeScreen}</h1>
    <TaskScreenNavigation label="작업 선택" items={items} activeScreen={activeScreen} defaultScreen="write" />
    <form hidden={activeScreen !== "write"} onSubmit={(event) => event.preventDefault()}>
      <label>제목<input required defaultValue="" /></label>
    </form>
    <section hidden={activeScreen !== "preview"}>본문 미리보기</section>
    <button type="button" onClick={() => navigateScreen("preview")}>프로그램으로 미리보기</button>
    <button type="button" onClick={() => navigate(-1)}>뒤로</button>
    <button type="button" onClick={() => navigate(1)}>앞으로</button>
    <output aria-label="위치">{location.pathname + location.search + location.hash}</output>
    <output aria-label="상태">{JSON.stringify(location.state)}</output>
  </main>;
}

afterEach(cleanup);

describe("작업 목적 화면의 URL과 입력 보존", () => {
  it("링크·프로그램 이동·뒤로·앞으로에서 반복 query와 hash·state·미저장 DOM을 보존한다", async () => {
    render(<MemoryRouter initialEntries={[{ pathname: "/example", search: "?tag=a&tag=b", hash: "#draft", state: { returnTo: "/studio" } }]}><Fixture /></MemoryRouter>);
    const input = screen.getByLabelText("제목");
    fireEvent.change(input, { target: { value: "미저장 초안" } });
    expect(screen.getByRole("link", { name: "미리보기" }).getAttribute("href")).toBe("/example?tag=a&tag=b&view=preview#draft");
    fireEvent.click(screen.getByRole("link", { name: "미리보기" }));
    expect(screen.getByLabelText("위치").textContent).toBe("/example?tag=a&tag=b&view=preview#draft");
    expect(screen.getByLabelText("상태").textContent).toBe('{"returnTo":"/studio"}');
    expect(screen.queryByRole("textbox", { name: "제목" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "작업 · preview" }));
    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "제목" })).toBe(input));
    expect(input).toHaveProperty("value", "미저장 초안");
    fireEvent.click(screen.getByRole("button", { name: "앞으로" }));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "제목" })).toBeNull());
    fireEvent.click(screen.getByRole("link", { name: "작성" }));
    fireEvent.click(screen.getByRole("button", { name: "프로그램으로 미리보기" }));
    expect(screen.getByLabelText("위치").textContent).toBe("/example?tag=a&tag=b&view=preview#draft");
    expect(screen.getByLabelText("상태").textContent).toBe('{"returnTo":"/studio"}');
    expect(input).toHaveProperty("value", "미저장 초안");
    fireEvent.change(screen.getByRole("combobox", { name: "작업 선택" }), { target: { value: "write" } });
    expect(screen.getByLabelText("위치").textContent).toBe("/example?tag=a&tag=b#draft");
    expect(screen.getByRole("textbox", { name: "제목" })).toBe(input);
    expect(screen.getByLabelText("상태").textContent).toBe('{"returnTo":"/studio"}');
  });

  it("알 수 없는 목적 query는 기본 작성 화면으로 안전하게 돌아온다", () => {
    render(<MemoryRouter initialEntries={["/example?view=unknown"]}><Fixture /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "작성" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("textbox", { name: "제목" })).toBeTruthy();
  });
});
