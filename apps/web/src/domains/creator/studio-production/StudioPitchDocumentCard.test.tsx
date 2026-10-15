// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioPitchDocumentCard } from "./StudioPitchDocumentCard";
import { createEmptyPitchDocument } from "./studio-pitch-document";

afterEach(cleanup);

function renderCard() {
  const onSave = vi.fn();
  const onApplyToSlides = vi.fn();
  const onNotice = vi.fn();
  render(
    <StudioPitchDocumentCard
      document={createEmptyPitchDocument()}
      onSave={onSave}
      onApplyToSlides={onApplyToSlides}
      onNotice={onNotice}
    />,
  );
  return { onSave, onApplyToSlides, onNotice };
}

describe("StudioPitchDocumentCard", () => {
  it("saves a trimmed document written in the planning form", () => {
    const { onSave } = renderCard();

    fireEvent.change(screen.getByRole("textbox", { name: "로그라인 (한 문장)" }), {
      target: { value: "  꿈 상담사의 이야기  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "캐릭터 추가" }));
    fireEvent.change(screen.getByRole("textbox", { name: "이름" }), { target: { value: " 서연 " } });
    fireEvent.change(screen.getByRole("textbox", { name: "역할" }), { target: { value: "주인공" } });
    fireEvent.change(screen.getByRole("textbox", { name: "연재 주기" }), { target: { value: "주 1회" } });
    fireEvent.click(screen.getByRole("button", { name: "기획서 저장" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]![0];
    expect(saved.logline).toBe("꿈 상담사의 이야기");
    expect(saved.characters).toHaveLength(1);
    expect(saved.characters[0]).toMatchObject({ name: "서연", role: "주인공", description: "" });
    expect(saved.characters[0].id).toMatch(/^pitch-character-/);
    expect(saved.serializationPlan.cadence).toBe("주 1회");
  });

  it("keeps accepting consecutive edits in every text field of the planning form", () => {
    // 상태 갱신 함수는 이벤트 핸들러가 끝난 뒤 렌더 단계로 미뤄질 수 있다. 이때 갱신 함수 안에서
    // event.currentTarget 을 읽으면 이미 null 이라 두 번째 입력부터 예외가 났다.
    const { onSave } = renderCard();
    const logline = screen.getByRole("textbox", { name: "로그라인 (한 문장)" });
    const synopsis = screen.getByRole("textbox", { name: "시놉시스" });
    const cadence = screen.getByRole("textbox", { name: "연재 주기" });
    const episodeCount = screen.getByRole("textbox", { name: "목표 회차" });
    const outline = screen.getByRole("textbox", { name: "시즌 구성" });

    for (const [field, values] of [
      [logline, ["꿈", "꿈 상담사", "꿈 상담사의 이야기"]],
      [synopsis, ["첫 줄", "첫 줄과 둘째 줄"]],
      [cadence, ["주 1회", "주 2회"]],
      [episodeCount, ["시즌 1", "시즌 1 총 24화"]],
      [outline, ["1부", "1부와 2부"]],
    ] as const) {
      for (const value of values) fireEvent.change(field, { target: { value } });
    }
    fireEvent.click(screen.getByRole("button", { name: "기획서 저장" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]![0];
    expect(saved.logline).toBe("꿈 상담사의 이야기");
    expect(saved.synopsis).toBe("첫 줄과 둘째 줄");
    expect(saved.serializationPlan).toMatchObject({
      cadence: "주 2회",
      episodeCount: "시즌 1 총 24화",
      outline: "1부와 2부",
    });
  });

  it("applies the document to slides only when something is written", () => {
    const { onApplyToSlides } = renderCard();
    const applyButton = screen.getByRole("button", { name: "슬라이드로 반영" });
    expect((applyButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByRole("textbox", { name: "시놉시스" }), {
      target: { value: "꿈을 대신 꾸는 상담소의 이야기" },
    });
    expect((applyButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(applyButton);

    expect(onApplyToSlides).toHaveBeenCalledTimes(1);
    expect(onApplyToSlides.mock.calls[0]![0].synopsis).toBe("꿈을 대신 꾸는 상담소의 이야기");
  });

  it("refuses to save a character row that has details but no name", () => {
    const { onSave, onNotice } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "캐릭터 추가" }));
    fireEvent.change(screen.getByRole("textbox", { name: "역할" }), { target: { value: "주인공" } });
    fireEvent.click(screen.getByRole("button", { name: "기획서 저장" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onNotice).toHaveBeenCalledWith("이름이 비어 있는 캐릭터 행이 있어 기획서를 저장하지 않았습니다.");
  });
});
