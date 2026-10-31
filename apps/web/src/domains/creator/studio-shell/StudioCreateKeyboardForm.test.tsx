// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioCreateKeyboardForm } from "./StudioCreateKeyboardForm";

function fixture(options: { titleReady?: boolean; sizeReady?: boolean; creating?: boolean; create?: () => boolean } = {}) {
  const create = options.create ?? vi.fn(() => true);
  const fixName = vi.fn(() => screen.getByLabelText("이름").focus());
  const fixSize = vi.fn(() => screen.getByLabelText("너비").focus());
  const props = { label: "새 프로젝트 설정", titleReady: true, sizeReady: true, creating: false, ...options, onCreate: create, onFixName: fixName, onFixSize: fixSize };
  const children: ComponentProps<typeof StudioCreateKeyboardForm>["children"] = (onInputKeyDown) => <><label>이름<input onKeyDown={onInputKeyDown} /></label><label>너비<input type="number" onKeyDown={onInputKeyDown} /></label><label>선택<select><option>하나</option><option>둘</option></select></label><label>메모<textarea /></label><details><summary>설정</summary>상세</details><button type="button">선택 변경</button><button type="submit">시작</button></>;
  const view = render(<StudioCreateKeyboardForm {...props}>{children}</StudioCreateKeyboardForm>);
  return { ...view, create, fixName, fixSize, props, children, form: screen.getByRole("form", { name: props.label }), input: screen.getByLabelText("이름") };
}

afterEach(() => cleanup());

describe("프로젝트 시작의 단일 키보드 제출 경계", () => {
  it("입력란 Enter로 같은 생성 동작을 실행한다", () => {
    const { create, input } = fixture();
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(create).toHaveBeenCalledOnce();
  });
  it("입력란이 취소한 Enter는 생성하지 않는다", () => {
    const create = vi.fn(() => true);
    render(<StudioCreateKeyboardForm label="취소 가능한 프로젝트 설정" titleReady sizeReady creating={false}
      onCreate={create} onFixName={vi.fn()} onFixSize={vi.fn()}>
      {(onInputKeyDown) => <label>취소 가능한 이름<input onKeyDown={(event) => {
        event.preventDefault();
        onInputKeyDown(event);
      }} /></label>}
    </StudioCreateKeyboardForm>);
    expect(fireEvent.keyDown(screen.getByLabelText("취소 가능한 이름"), { key: "Enter" })).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
  it("클릭과 같은 틱의 연속 제출도 한 번만 생성한다", () => {
    const { create, form } = fixture();
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    fireEvent.submit(form); fireEvent.submit(form);
    expect(create).toHaveBeenCalledOnce();
  });
  it("검증 오류가 여러 개면 이름을 먼저 수정한다", () => {
    const { create, fixName, fixSize, input } = fixture({ titleReady: false, sizeReady: false });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(fixName).toHaveBeenCalledOnce(); expect(fixSize).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
  });
  it("이름은 정상인데 크기가 잘못됐으면 크기 복구를 실행한다", () => {
    const { create, fixSize, form } = fixture({ sizeReady: false });
    fireEvent.submit(form);
    expect(fixSize).toHaveBeenCalledOnce(); expect(create).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByLabelText("너비"));
  });
  it("한글 조합 중 Enter와 직접 제출을 차단하고 조합 종료 후 시작한다", () => {
    const { create, input, form } = fixture();
    fireEvent.compositionStart(input); fireEvent.keyDown(input, { key: "Enter" }); fireEvent.submit(form);
    expect(create).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input); fireEvent.keyDown(input, { key: "Enter" });
    expect(create).toHaveBeenCalledOnce();
  });
  it.each([{ isComposing: true }, { keyCode: 229 }, { repeat: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true }])("조합·반복·수식키 Enter를 생성으로 처리하지 않는다: %j", (event) => {
    const { create, input } = fixture(); fireEvent.keyDown(input, { key: "Enter", ...event });
    expect(create).not.toHaveBeenCalled();
  });
  it("선택상자·여러줄 입력·접기의 Enter를 가로채지 않는다", () => {
    const { create } = fixture();
    for (const element of [screen.getByLabelText("선택"), screen.getByLabelText("메모"), screen.getByText("설정")]) {
      expect(fireEvent.keyDown(element, { key: "Enter" })).toBe(true);
    }
    expect(create).not.toHaveBeenCalled();
  });
  it("보조 버튼으로 선택을 바꿔도 프로젝트를 만들지 않는다", () => {
    const { create } = fixture(); fireEvent.click(screen.getByRole("button", { name: "선택 변경" }));
    expect(create).not.toHaveBeenCalled();
  });
  it("진행 중에는 직접 submit 이벤트도 다시 실행하지 않는다", () => {
    const { create, input, form } = fixture({ creating: true });
    fireEvent.keyDown(input, { key: "Enter" }); fireEvent.submit(form);
    expect(create).not.toHaveBeenCalled();
  });
  it("실패를 반환하면 입력을 지우지 않고 재시도를 허용한다", () => {
    const create = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const { input, form } = fixture({ create });
    fireEvent.change(input, { target: { value: "남겨 둘 제목" } });
    fireEvent.submit(form); fireEvent.submit(form);
    expect(create).toHaveBeenCalledTimes(2);
    expect(screen.getByDisplayValue("남겨 둘 제목")).toBe(input);
  });
  it("오류 수정 뒤 최신 상태와 콜백으로 제출한다", () => {
    const { create, fixName, form, props, children, rerender } = fixture({ titleReady: false });
    fireEvent.submit(form); expect(fixName).toHaveBeenCalledOnce();
    rerender(<StudioCreateKeyboardForm {...props} titleReady>{children}</StudioCreateKeyboardForm>);
    fireEvent.submit(form); expect(create).toHaveBeenCalledOnce();
  });
  it("form은 새로고침하지 않고 지정한 생성 동작을 수행한다", () => {
    const { form } = fixture();
    expect(form.hasAttribute("novalidate")).toBe(true);
    expect(fireEvent.submit(form)).toBe(false);
  });
});
