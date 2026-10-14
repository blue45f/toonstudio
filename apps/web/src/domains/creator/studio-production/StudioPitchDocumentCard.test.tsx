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

  it("applies the document to slides only when something is written", () => {
    const { onApplyToSlides } = renderCard();
    const applyButton = screen.getByRole("button", { name: "슬라이드로 반영" });
    expect(applyButton).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: "시놉시스" }), {
      target: { value: "꿈을 대신 꾸는 상담소의 이야기" },
    });
    expect(applyButton).not.toBeDisabled();
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
