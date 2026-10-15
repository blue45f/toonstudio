// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CreatorWorkRightsAside } from "./CreatorWorkRightsAside";

import {
  createDefaultCreatorCommunityMetadata,
  withCreatorCommunityAiTraining,
} from "@/shared/lib/creator-community-publication-contract";
import { useI18n } from "@/shared/lib/i18n";

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

afterEach(cleanup);

const base = createDefaultCreatorCommunityMetadata("upload");

describe("CreatorWorkRightsAside", () => {
  it("값을 밝히지 않은 작품은 AI 학습 '비허용'이 아니라 '미지정'으로 보여 준다", () => {
    render(<CreatorWorkRightsAside community={base} source={null} />);
    const aside = screen.getByLabelText("제작 출처와 이용 조건");
    expect(aside.querySelector('[data-ai-training="unspecified"]')).not.toBeNull();
    expect(screen.getByText("AI 학습 미지정")).toBeTruthy();
    expect(screen.queryByText(/AI 학습 비허용/)).toBeNull();
    // 다운로드는 기존 불리언 의미를 유지한다.
    expect(screen.getByText("다운로드 비허용")).toBeTruthy();
  });

  it("작가가 밝힌 허용·불허 표기를 설명과 한계 고지와 함께 보여 준다", () => {
    const { rerender } = render(
      <CreatorWorkRightsAside
        community={withCreatorCommunityAiTraining(base, "prohibited")}
        source={null}
      />,
    );
    expect(screen.getByText("AI 학습 불허 표기")).toBeTruthy();
    expect(screen.getByText("작가가 AI 학습에 쓰지 말아 달라고 표시했습니다.")).toBeTruthy();
    expect(screen.getByText(/별도 계약을 대체하지 않습니다/)).toBeTruthy();
    expect(screen.getByText(/강제할 수 없습니다/)).toBeTruthy();

    rerender(
      <CreatorWorkRightsAside
        community={withCreatorCommunityAiTraining(base, "allowed")}
        source={null}
      />,
    );
    expect(screen.getByText("AI 학습 허용 표기")).toBeTruthy();
    expect(screen.getByText("작가가 AI 학습에 써도 좋다고 표시했습니다.")).toBeTruthy();
    expect(screen.getByText(/별도 계약을 대체하지 않습니다/)).toBeTruthy();
  });

  it("aiTraining 필드가 없는 이전 응답은 켜 둔 레거시 값만 허용 표기로 읽는다", () => {
    const { aiTraining: _omitted, ...legacy } = base;
    const { rerender } = render(<CreatorWorkRightsAside community={legacy} source={null} />);
    expect(screen.getByText("AI 학습 미지정")).toBeTruthy();

    rerender(<CreatorWorkRightsAside community={{ ...legacy, trainingAllowed: true }} source={null} />);
    expect(screen.getByText("AI 학습 허용 표기")).toBeTruthy();
  });

  it("메타데이터가 없어도 출처 고지와 함께 미지정으로 표시한다", () => {
    render(
      <CreatorWorkRightsAside
        community={undefined}
        source={{ disclosure: "브라우저 편집기에서 제작", revisionId: "studio-generation:7" }}
      />,
    );
    expect(screen.getByText("브라우저 편집기에서 제작")).toBeTruthy();
    expect(screen.getByText("원본 revision studio-generation:7")).toBeTruthy();
    expect(screen.getByText("AI 학습 미지정")).toBeTruthy();
  });

  it("출처·이용 조건 문구는 작가가 쓴 그대로 보여 준다", () => {
    render(
      <CreatorWorkRightsAside
        community={{ ...base, attributionText: "© 작가명 · 재배포 시 출처 표기" }}
        source={null}
      />,
    );
    expect(screen.getByText("© 작가명 · 재배포 시 출처 표기")).toBeTruthy();
  });
});
