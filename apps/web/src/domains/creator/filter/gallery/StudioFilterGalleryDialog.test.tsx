// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioFilterGalleryDialog } from "./StudioFilterGalleryDialog";

import type { StudioFilterGalleryDialogProps } from "./StudioFilterGalleryDialog";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function mountRoot(): { current: HTMLElement | null } {
  const root = document.createElement("div");
  const viewport = document.createElement("div");
  viewport.setAttribute("data-studio-canvas-viewport", "");
  viewport.tabIndex = 0;
  root.append(viewport);
  document.body.append(root);
  return { current: root };
}

function renderDialog(overrides: Partial<StudioFilterGalleryDialogProps> = {}) {
  const onPreview = vi.fn();
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(
    <StudioFilterGalleryDialog
      activeKey="filter:1"
      kind="filter-gallery"
      image={{}}
      rootRef={mountRoot()}
      onPreview={onPreview}
      onApply={onApply}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onPreview, onApply, onClose };
}

const effectButton = (label: string): HTMLElement =>
  within(screen.getByRole("list", { name: "효과 목록" })).getByRole("button", { name: new RegExp(label) });

describe("필터 갤러리 대화상자", () => {
  it("효과를 고르면 스택에 쌓고 적용하면 filterGallery 패치를 넘긴다", () => {
    const { onApply } = renderDialog();
    fireEvent.click(effectButton("명도 반전"));
    fireEvent.click(effectButton("닷지 / 번"));
    const stack = screen.getByRole("list", { name: "쌓인 효과" });
    expect(within(stack).getAllByRole("listitem")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const [patch, draft, scope] = onApply.mock.calls[0]!;
    expect(scope).toBe("whole");
    expect(draft.kind).toBe("filter-gallery");
    expect(patch.filterGallery.entries.map((entry: { id: string }) => entry.id)).toEqual(["color.value-invert", "color.dodge-burn"]);
  });

  it("선택한 겹의 매개변수·불투명도·표시를 바꾸고 순서를 옮긴다", () => {
    const { onApply } = renderDialog();
    fireEvent.click(effectButton("명도 반전"));
    fireEvent.click(effectButton("닷지 / 번"));
    fireEvent.change(screen.getByLabelText("노출"), { target: { value: "70" } });
    fireEvent.change(screen.getByLabelText("이 겹의 불투명도"), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "명도 반전 끄기" }));
    const rows = within(screen.getByRole("list", { name: "쌓인 효과" })).getAllByRole("listitem");
    fireEvent.click(within(rows[1]!).getByRole("button", { name: "2번째 닷지 / 번 위로 이동" }));
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    const [patch] = onApply.mock.calls[0]!;
    expect(patch.filterGallery.entries).toEqual([
      { id: "color.dodge-burn", params: { mode: "dodge", range: "midtones", exposure: 70 }, opacity: 0.4 },
      { id: "color.value-invert", params: {}, enabled: false },
    ]);
  });

  it("겹을 옮겨도 행을 다시 만들지 않아 키보드 포커스가 옮긴 겹의 버튼에 남는다", () => {
    renderDialog();
    fireEvent.click(effectButton("명도 반전"));
    fireEvent.click(effectButton("닷지 / 번"));
    fireEvent.click(effectButton("레티넥스"));
    const list = screen.getByRole("list", { name: "쌓인 효과" });
    const down = within(list).getByRole("button", { name: "1번째 명도 반전 아래로 이동" });
    down.focus();
    fireEvent.click(down);
    // 같은 버튼 요소가 그대로 남고 이름만 새 순번으로 바뀐다.
    expect(document.activeElement).toBe(down);
    expect(down.getAttribute("aria-label")).toBe("2번째 명도 반전 아래로 이동");
    fireEvent.click(down);
    // 맨 아래에 닿아 같은 방향 버튼이 꺼지면 반대 방향 버튼으로 포커스를 넘긴다.
    expect(document.activeElement).toBe(within(list).getByRole("button", { name: "3번째 명도 반전 위로 이동" }));
  });

  it("빈 스택을 적용하면 필드를 지우는 패치를 넘긴다", () => {
    const { onApply } = renderDialog({
      image: { filterGallery: { version: 1, seed: 9, entries: [{ id: "color.value-invert", params: {} }] } },
    });
    fireEvent.click(screen.getByRole("button", { name: "명도 반전 빼기" }));
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    expect(onApply.mock.calls[0]![0]).toEqual({ filterGallery: undefined });
  });

  it("작업량 표시가 이 조합을 적용할 수 있는 가장 큰 이미지 크기를 알린다", () => {
    renderDialog();
    // 가벼운 효과 하나는 상한이 충분히 커서 등급만 보인다.
    fireEvent.click(effectButton("명도 반전"));
    expect(screen.getByText("작업량: 가벼움")).toBeTruthy();
    // 무거운 겹을 쌓으면 적용되는 가장 큰 크기(MP·정사각 px)를 함께 보인다.
    for (let index = 0; index < 3; index += 1) fireEvent.click(effectButton("팔레트 나이프"));
    expect(screen.getByText(/^작업량: .+ · 약 \d+\.\dMP\([\d,]+×[\d,]+px\)까지 적용돼요/u)).toBeTruthy();
  });

  it("검색과 분류로 효과 목록을 좁힌다", () => {
    renderDialog();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Paint.NET · 디더링" } });
    const list = screen.getByRole("list", { name: "효과 목록" });
    expect(within(list).getAllByRole("button")).toHaveLength(1);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /^노이즈 \d+$/u }));
    for (const button of within(list).getAllByRole("button")) expect(button.textContent).toContain("노이즈");
  });

  it("미리보기를 캔버스 패치로 알리고 닫힐 때 거둬들인다", async () => {
    const { onPreview } = renderDialog();
    fireEvent.click(effectButton("명도 반전"));
    await waitFor(() => expect(onPreview).toHaveBeenLastCalledWith(
      expect.objectContaining({ filterGallery: expect.objectContaining({ entries: [{ id: "color.value-invert", params: {} }] }) }),
    ));
    cleanup();
    expect(onPreview).toHaveBeenLastCalledWith(null);
  });

  it("잠겨 있으면 효과를 더하거나 적용할 수 없고 사유를 보여 준다", () => {
    const { onApply } = renderDialog({ mutationLocked: true, mutationLockReason: "문서가 잠겨 있어요." });
    expect(screen.getByText("문서가 잠겨 있어요.")).toBeTruthy();
    expect((effectButton("명도 반전") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    expect(onApply).not.toHaveBeenCalled();
  });

  it("선택 영역이 있으면 선택 안·밖 적용 범위를 고른다", () => {
    const { onApply } = renderDialog({ selectionAvailable: true });
    fireEvent.click(effectButton("명도 반전"));
    fireEvent.click(screen.getByRole("radio", { name: "선택 밖" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 밖에 적용" }));
    expect(onApply.mock.calls[0]![2]).toBe("outside");
  });
});
