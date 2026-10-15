// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreatorAiTrainingConsentField } from "./CreatorAiTrainingConsentField";

import type { CreatorCommunityAiTrainingConsent } from "@/shared/lib/creator-community-publication-contract";
import { useI18n } from "@/shared/lib/i18n";

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

afterEach(cleanup);

function Harness({
  initial = "unspecified",
  onChange,
  ...rest
}: {
  readonly initial?: CreatorCommunityAiTrainingConsent;
  readonly onChange?: (next: CreatorCommunityAiTrainingConsent) => void;
  readonly disabled?: boolean;
  readonly published?: boolean;
  readonly context?: "publication" | "package";
}) {
  const [value, setValue] = useState<CreatorCommunityAiTrainingConsent>(initial);
  return (
    <CreatorAiTrainingConsentField
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      {...rest}
    />
  );
}

describe("CreatorAiTrainingConsentField", () => {
  it("기본값은 미지정이고 보수적인 값이 먼저, 허용이 마지막인 라디오 그룹이다", () => {
    render(<Harness />);
    const group = screen.getByRole("group", { name: "AI 학습 허용 표기" });
    const radios = Array.from(group.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    expect(radios.map((radio) => radio.value)).toEqual(["unspecified", "prohibited", "allowed"]);
    expect(radios.map((radio) => radio.checked)).toEqual([true, false, false]);
    expect(screen.getByRole("radio", { name: "미지정 (기본)" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "불허" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "허용" })).toBeTruthy();
  });

  it("방향키로 이동하는 네이티브 라디오 그룹이다(같은 name, 탭 순서 유지, 설명 연결)", () => {
    render(<Harness />);
    const radios = screen.getAllByRole("radio");
    expect(new Set(radios.map((radio) => radio.getAttribute("name"))).size).toBe(1);
    for (const radio of radios) {
      expect(radio.getAttribute("tabindex")).toBeNull();
      const describedBy = radio.getAttribute("aria-describedby");
      expect(describedBy && document.getElementById(describedBy)?.textContent).toBeTruthy();
    }
  });

  it("처음에는 변경 확인 문구가 비어 있고 한계 고지는 항상 보인다", () => {
    render(<Harness />);
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.getByText(/별도 계약을 대체하지 않습니다/)).toBeTruthy();
    expect(screen.getByText(/강제할 수 없습니다/)).toBeTruthy();
  });

  it("허용을 고르면 값을 알리고 변경 확인 문구를 상태 영역에 띄운다", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "허용" }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith("allowed");
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.getAttribute("data-ai-training-change-notice")).toBe("allowed");
    expect(status.textContent).toContain("AI 학습 '허용'으로 표기를 바꿨습니다");
    expect(status.textContent).toContain("되돌릴 수 없습니다");
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "허용" }).checked).toBe(true);
  });

  it("불허·미지정으로 바꿀 때마다 그 값에 맞는 문구로 갱신된다", () => {
    render(<Harness initial="allowed" />);
    fireEvent.click(screen.getByRole("radio", { name: "불허" }));
    expect(screen.getByRole("status").textContent).toContain("'불허'로 표기를 바꿨습니다");
    expect(screen.getByRole("status").textContent).toContain("기술적으로 막을 수는 없습니다");

    fireEvent.click(screen.getByRole("radio", { name: "미지정 (기본)" }));
    expect(screen.getByRole("status").textContent).toContain("'미지정'으로 표기를 바꿨습니다");
    expect(screen.getByRole("status").textContent).toContain("허용으로 해석되지 않습니다");
  });

  it("이미 선택된 값을 다시 눌러도 알리지 않고 문구도 만들지 않는다", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "미지정 (기본)" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("바깥에서 값이 바뀌면 이전 변경 확인 문구를 지운다", () => {
    const { rerender } = render(
      <CreatorAiTrainingConsentField value="unspecified" onChange={() => undefined} />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "허용" }));
    // 부모가 선택을 받아들이지 않아 값이 그대로면 문구를 띄우지 않는다.
    expect(screen.getByRole("status").textContent).toBe("");

    rerender(<CreatorAiTrainingConsentField value="allowed" onChange={() => undefined} />);
    expect(screen.getByRole("status").textContent).toContain("'허용'으로 표기를 바꿨습니다");

    rerender(<CreatorAiTrainingConsentField value="prohibited" onChange={() => undefined} />);
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("이미 게시한 작품이면 다음 게시부터 반영될 수 있다는 단서를 덧붙인다", () => {
    render(<Harness published />);
    fireEvent.click(screen.getByRole("radio", { name: "불허" }));
    expect(screen.getByRole("status").textContent).toContain("다음 게시(릴리스)부터");
  });

  it("패키지 문맥에서는 안내 문구도 독자 화면이 아니라 manifest 기록을 가리킨다", () => {
    render(<Harness context="package" />);
    const group = screen.getByRole("group", { name: "AI 학습 허용 표기" });
    expect(group.textContent).toContain("패키지 manifest에 기록할 작가의 의사 표시");
    expect(group.textContent).not.toContain("독자 화면에는 '미지정'으로 보이며");
  });

  it("패키지 문맥에서는 manifest 기록 위치를 알린다", () => {
    render(<Harness context="package" published />);
    fireEvent.click(screen.getByRole("radio", { name: "허용" }));
    const text = screen.getByRole("status").textContent ?? "";
    expect(text).toContain("manifest.json(rights.aiTraining)");
    expect(text).not.toContain("다음 게시(릴리스)부터");
  });

  it("비활성화하면 모든 선택지가 잠기고 값을 바꿀 수 없다", () => {
    const onChange = vi.fn();
    render(<Harness disabled onChange={onChange} />);
    const group = screen.getByRole("group", { name: "AI 학습 허용 표기" });
    expect(group.hasAttribute("disabled")).toBe(true);
    for (const radio of screen.getAllByRole<HTMLInputElement>("radio")) {
      expect(radio.matches(":disabled")).toBe(true);
    }
    fireEvent.click(screen.getByRole("radio", { name: "허용" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("영어 로캘에서는 같은 구조의 영어 라벨과 한계 고지를 쓴다", () => {
    useI18n.getState().setLang("en");
    render(<Harness />);
    expect(screen.getByRole("group", { name: "AI training label" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Not specified (default)" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Not allowed" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Allowed" })).toBeTruthy();
    expect(screen.getByText(/does not replace a separate agreement/)).toBeTruthy();
  });
});
