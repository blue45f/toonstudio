// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StudioDrawingStyleEditor } from "./StudioDrawingStyleEditor";
import { blankDrawingStyle } from "./studio-drawing-style-library";

const fixture = vi.hoisted(() => {
  const rows = new Map<string, string>();
  const db = { asAsyncKeyValueStore: () => ({
    get: async (key: string) => rows.get(key) ?? null,
    set: async (key: string, value: string) => { rows.set(key, value); },
  }) };
  return { rows, db, open: vi.fn(async () => db), retry: vi.fn(async () => false) };
});
vi.mock("../studio-local-database-runtime", () => ({
  acquireStudioLocalDatabase: fixture.open,
  resetFailedStudioLocalDatabaseOwnership: fixture.retry,
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); fixture.rows.clear(); });

function open() {
  const view = render(<StudioDrawingStyleEditor onApply={vi.fn()} locale="ko"/>);
  const details = view.container.querySelector("details");
  if (!details) throw new Error("그림체 설정을 찾을 수 없습니다.");
  details.open = true;
  fireEvent(details, new Event("toggle"));
}

it("저장소 경합은 명시적으로 다시 열고 입력한 선과 슬라이더 조작을 보존한다", async () => {
  fixture.open.mockRejectedValueOnce(new Error("busy"));
  open();
  await screen.findByRole("alert");
  fireEvent.change(screen.getByLabelText("선", { exact: true }), { target: { value: "가느다란 선" } });
  expect(fixture.retry).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  await screen.findByText("저장한 그림체가 없습니다.");
  expect(fixture.retry).toHaveBeenCalledOnce();
  expect(screen.getByDisplayValue("가느다란 선")).toBeTruthy();
  fireEvent.change(screen.getByRole("combobox", { name: "이미지 보정" }), { target: { value: "noir" } });
  expect(screen.getByRole("slider", { name: "대비 미세 조정" })).toBeTruthy();
});

it("다른 창에서 바뀐 원본은 안내 뒤 작가가 최신 저장본을 열 때만 입력을 교체한다", async () => {
  const id = crypto.randomUUID();
  const original = { ...blankDrawingStyle, name: "항구", line: "가는 선" };
  const put = (line: string) => fixture.rows.set("library", JSON.stringify({ version: 1, entries: [{ id, recipe: { ...original, line } }] }));
  put(original.line);
  open();
  await screen.findByRole("option", { name: "항구" });
  fireEvent.change(screen.getByRole("combobox", { name: "이 기기의 그림체" }), { target: { value: id } });
  fireEvent.change(screen.getByLabelText("선", { exact: true }), { target: { value: "내 선" } });
  put("공동 작업 뒤 최신 선");
  fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));
  await screen.findByRole("button", { name: "사본으로 편집" });
  expect(screen.getByDisplayValue("내 선")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "최신 저장본 열기" }));
  await waitFor(() => expect(screen.getByDisplayValue("공동 작업 뒤 최신 선")).toBeTruthy());
});
