// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioExportBookLayoutSection } from "./StudioExportBookLayoutSection";
import {
  DEFAULT_STUDIO_BOOK_LAYOUT_SPEC,
  resolveBookPrintRequest,
  type StudioBookLayoutSpecState,
} from "./studio-export-book-spec";

const PRESET_NAME = "A5 세로 제본 책 (148×210)";

/** 패널이 상태를 소유하는 방식 그대로, 섹션이 바꾼 상태가 요청(binding)으로 어떻게 해석되는지 함께 보여 준다. */
function Harness({ initial = DEFAULT_STUDIO_BOOK_LAYOUT_SPEC }: { readonly initial?: StudioBookLayoutSpecState }) {
  const [spec, setSpec] = useState(initial);
  return (
    <>
      <StudioExportBookLayoutSection bookLayoutSpec={spec} setBookLayoutSpec={setSpec} />
      <output data-testid="binding">{JSON.stringify(resolveBookPrintRequest(spec)?.binding ?? null)}</output>
    </>
  );
}

function boundBinding(): Record<string, unknown> | null {
  const parsed: unknown = JSON.parse(screen.getByTestId("binding").textContent ?? "null");
  return typeof parsed === "object" && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : null;
}

function checkbox(name: string | RegExp): HTMLInputElement {
  const element = screen.getByRole("checkbox", { name });
  if (!(element instanceof HTMLInputElement)) throw new Error("체크 상자가 아니에요.");
  return element;
}

afterEach(() => {
  cleanup();
});

describe("StudioExportBookLayoutSection — 책 구성", () => {
  it("꺼 두었을 때는 책 프리셋만 보이고 책 구성 항목은 숨겨져 있다", () => {
    render(<Harness />);
    const presets = screen.getByRole("group", { name: "책 프리셋" });
    expect(within(presets).getByRole("button", { name: PRESET_NAME }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByTestId("export-book-binding-group")).toBeNull();
    expect(screen.queryByRole("group", { name: "단행본 판형 프리셋" })).toBeNull();
    expect(boundBinding()).toBeNull();
  });

  it("A5 세로 제본 책 프리셋을 누르면 A5 판형과 여백 안에 맞춤·쪽 번호·표지가 한 번에 켜진다", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: PRESET_NAME }));

    expect(screen.getByRole("button", { name: PRESET_NAME }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "A5 (148×210)" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "300dpi" }).getAttribute("aria-pressed")).toBe("true");
    // 안전 여백 수치는 판형 프리셋 값(안전 11mm, 제본 5mm 추가)에서 온다.
    expect(checkbox("여백 안에 맞추기 (바깥 11mm · 안쪽 16mm · 위아래 11mm)").checked).toBe(true);
    expect(checkbox(/쪽 번호/).checked).toBe(true);
    expect(checkbox(/글자 표지/).checked).toBe(true);
    expect(boundBinding()).toMatchObject({ placement: "inside-safe", folio: { startAt: 1 }, cover: {} });
  });

  it("항목을 하나 끄면 프리셋 눌림이 풀리고 요청의 binding에서도 빠진다", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: PRESET_NAME }));
    fireEvent.click(checkbox(/쪽 번호/));

    expect(checkbox(/쪽 번호/).checked).toBe(false);
    expect(screen.getByRole("button", { name: PRESET_NAME }).getAttribute("aria-pressed")).toBe("false");
    expect(boundBinding()).not.toHaveProperty("folio");
    expect(boundBinding()).toMatchObject({ placement: "inside-safe" });
  });

  it("표지를 켜면 지은이 입력칸이 생기고 입력한 이름이 요청에 실린다(프리셋 눌림은 유지)", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: PRESET_NAME }));
    const author = screen.getByRole("textbox", { name: "지은이" });
    fireEvent.change(author, { target: { value: "  홍길동 " } });

    expect(boundBinding()?.cover).toEqual({ author: "홍길동" });
    expect(screen.getByRole("button", { name: PRESET_NAME }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(checkbox(/글자 표지/));
    expect(screen.queryByRole("textbox", { name: "지은이" })).toBeNull();
    expect(boundBinding()).not.toHaveProperty("cover");
  });

  it("책 구성 항목은 이름 붙은 체크 상자라서 모두 라벨로 찾을 수 있고, 한계 안내가 항상 보인다", () => {
    render(<Harness initial={{ ...DEFAULT_STUDIO_BOOK_LAYOUT_SPEC, enabled: true }} />);
    const group = screen.getByRole("group", { name: "책 구성" });
    expect(within(group).getAllByRole("checkbox")).toHaveLength(3);
    expect(group.textContent).toContain("쪽으로 나누지 않고");
    expect(group.textContent).toContain("일러스트는 첫 페이지로 직접 넣어야 합니다");
    expect(group.textContent).toContain("인쇄소 규격이 우선입니다");
  });
});
