// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CreatorAiTrainingBadge, CreatorAiTrainingBadgeFor } from "./CreatorAiTrainingBadge";

import { useI18n } from "@/shared/lib/i18n";

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

afterEach(cleanup);

describe("CreatorAiTrainingBadge", () => {
  it.each([
    ["unspecified", "AI 학습 미지정"],
    ["allowed", "AI 학습 허용 표기"],
    ["prohibited", "AI 학습 불허 표기"],
  ] as const)("%s 상태를 문구와 data 속성으로 표시한다", (consent, label) => {
    render(<CreatorAiTrainingBadge consent={consent} />);
    expect(screen.getByText(label).getAttribute("data-ai-training")).toBe(consent);
  });

  it("칩은 스크린리더가 읽을 설명 한 문장을 시각적으로 숨겨 함께 둔다", () => {
    render(<CreatorAiTrainingBadge consent="unspecified" />);
    const chip = screen.getByText("AI 학습 미지정");
    const hidden = chip.querySelector(".sr-only");
    expect(hidden?.textContent).toContain("허용으로 해석하지 마세요");
    // 칩 줄에는 설명 블록이나 한계 문장을 눈에 띄게 펼치지 않는다.
    expect(screen.queryByText(/별도 계약을 대체하지 않습니다/)).toBeNull();
  });

  it("미지정은 허용 색조(cool)를 쓰지 않고 점선 테두리로 구분한다", () => {
    render(<CreatorAiTrainingBadge consent="unspecified" />);
    const className = screen.getByText("AI 학습 미지정").className;
    expect(className).toContain("border-dashed");
    // 점선 경계는 비텍스트 대비 3:1 이상인 fg-3 를 쓴다(line-strong 은 기본 테마에서 약 2:1).
    expect(className).toContain("border-fg-3");
    expect(className).not.toContain("text-cool");
    expect(className).not.toContain("text-warn");
  });

  it("허용·불허 칩의 글자는 본문색이고 의미 토큰 색은 아이콘·테두리·배경에만 쓴다", () => {
    // text-cool 글자는 라이트·세피아 테마에서 칩 배경 위 AA(4.5:1)에 못 미쳐 글자색에서 뺐다.
    const { container, rerender } = render(<CreatorAiTrainingBadge consent="allowed" />);
    const allowed = screen.getByText("AI 학습 허용 표기");
    expect(allowed.className).toContain("text-fg");
    expect(allowed.className).not.toMatch(/\btext-(cool|warn)\b/u);
    expect(allowed.className).toContain("border-cool/40");
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("text-cool");

    rerender(<CreatorAiTrainingBadge consent="prohibited" />);
    const prohibited = screen.getByText("AI 학습 불허 표기");
    expect(prohibited.className).toContain("text-fg");
    expect(prohibited.className).not.toMatch(/\btext-(cool|warn)\b/u);
    expect(prohibited.className).toContain("border-warn/40");
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("text-warn");
  });

  it("detail 변형은 독자용 설명과 한계 고지를 눈에 보이게 덧붙인다", () => {
    render(<CreatorAiTrainingBadge consent="prohibited" variant="detail" />);
    expect(screen.getByText("AI 학습 불허 표기")).toBeTruthy();
    expect(screen.getByText("작가가 AI 학습에 쓰지 말아 달라고 표시했습니다.")).toBeTruthy();
    expect(screen.getByText(/별도 계약을 대체하지 않습니다/)).toBeTruthy();
    expect(screen.getByText(/강제할 수 없습니다/)).toBeTruthy();
  });

  it("아이콘은 장식이라 접근성 트리에서 숨긴다", () => {
    const { container } = render(<CreatorAiTrainingBadge consent="allowed" />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("저장된 메타데이터를 그대로 읽어 구버전 필드 없는 응답도 보수적으로 표시한다", () => {
    const { rerender } = render(<CreatorAiTrainingBadgeFor community={undefined} />);
    expect(screen.getByText("AI 학습 미지정")).toBeTruthy();

    rerender(<CreatorAiTrainingBadgeFor community={{ trainingAllowed: false }} />);
    expect(screen.getByText("AI 학습 미지정")).toBeTruthy();

    rerender(<CreatorAiTrainingBadgeFor community={{ trainingAllowed: true }} />);
    expect(screen.getByText("AI 학습 허용 표기")).toBeTruthy();

    rerender(<CreatorAiTrainingBadgeFor community={{ aiTraining: "prohibited", trainingAllowed: true }} />);
    expect(screen.getByText("AI 학습 불허 표기")).toBeTruthy();
    expect(screen.queryByText("AI 학습 허용 표기")).toBeNull();

    rerender(<CreatorAiTrainingBadgeFor community={{ aiTraining: "yes", trainingAllowed: "true" }} />);
    expect(screen.getByText("AI 학습 미지정")).toBeTruthy();
  });

  it("로캘을 영어로 바꾸면 배지 문구도 영어로 바뀐다", () => {
    useI18n.getState().setLang("en");
    render(<CreatorAiTrainingBadge consent="allowed" />);
    expect(screen.getByText("AI training allowed (creator's label)")).toBeTruthy();
  });
});
