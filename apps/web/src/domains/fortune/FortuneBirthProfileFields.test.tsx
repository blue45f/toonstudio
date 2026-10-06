// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FortuneBirthProfileFields } from "./FortuneBirthProfileFields";

afterEach(() => {
  cleanup();
});

const baseProps = {
  birthDate: "1990-06-15",
  birthTime: "10:30",
  gender: "none",
  onBirthDateChange: () => {},
  onBirthTimeChange: () => {},
  onGenderChange: () => {},
  onClearBirthProfile: () => {},
  tx: (source: string) => source,
};

describe("FortuneBirthProfileFields (LOW-2 삭제 동선)", () => {
  it("저장된 프로필이 있으면 저장 고지와 지우기 버튼을 보여준다", () => {
    render(<FortuneBirthProfileFields {...baseProps} hasSavedBirthProfile />);
    expect(screen.getByText(/이 기기에만 저장돼/)).not.toBeNull();
    expect(screen.getByRole("button", { name: /저장된 생년월일 지우기/ })).not.toBeNull();
  });

  it("저장된 프로필이 없으면 지우기 버튼 없이 고지만 보여준다", () => {
    render(<FortuneBirthProfileFields {...baseProps} birthDate="" birthTime="" hasSavedBirthProfile={false} />);
    expect(screen.getByText(/이 기기에만 저장돼/)).not.toBeNull();
    expect(screen.queryByRole("button", { name: /저장된 생년월일 지우기/ })).toBeNull();
  });

  it("지우기는 확인 단계를 거쳐야 호출되고, 취소하면 호출되지 않는다", () => {
    const onClearBirthProfile = vi.fn();
    render(
      <FortuneBirthProfileFields {...baseProps} hasSavedBirthProfile onClearBirthProfile={onClearBirthProfile} />
    );
    fireEvent.click(screen.getByRole("button", { name: /저장된 생년월일 지우기/ }));
    expect(screen.getByText(/다시 입력해야 해요/)).not.toBeNull();
    expect(onClearBirthProfile).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onClearBirthProfile).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /저장된 생년월일 지우기/ })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /저장된 생년월일 지우기/ }));
    fireEvent.click(screen.getByRole("button", { name: "지우기" }));
    expect(onClearBirthProfile).toHaveBeenCalledTimes(1);
  });

  it("입력 변경 콜백이 그대로 전달된다", () => {
    const onBirthDateChange = vi.fn();
    render(
      <FortuneBirthProfileFields {...baseProps} hasSavedBirthProfile={false} onBirthDateChange={onBirthDateChange} />
    );
    fireEvent.change(screen.getByLabelText(/생년월일/), { target: { value: "2000-01-01" } });
    expect(onBirthDateChange).toHaveBeenCalledWith("2000-01-01");
  });
});
