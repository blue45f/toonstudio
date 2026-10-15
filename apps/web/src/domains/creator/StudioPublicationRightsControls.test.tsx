// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioPublicationRightsControls } from "./StudioPublicationRightsControls";

import {
  createDefaultCreatorCommunityMetadata,
  withCreatorCommunityAiTraining,
} from "@/shared/lib/creator-community-publication-contract";
import { useI18n } from "@/shared/lib/i18n";

const base = createDefaultCreatorCommunityMetadata("upload");

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

afterEach(cleanup);

describe("StudioPublicationRightsControls", () => {
  it("edits provenance, accessibility copy, and rights before publishing", () => {
    const onChange = vi.fn();
    render(
      <StudioPublicationRightsControls
        metadata={base}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "게시 제작 방식" }), {
      target: { value: "agent_assisted" },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      provenance: "agent_assisted",
    }));

    fireEvent.change(screen.getByRole("textbox", { name: "작품 대체 텍스트" }), {
      target: { value: "별빛 왕관을 쓴 판타지 소녀" },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      altText: "별빛 왕관을 쓴 판타지 소녀",
    }));

    fireEvent.click(screen.getByRole("checkbox", { name: /독자 다운로드 허용/u }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      downloadAllowed: true,
    }));
  });

  it("surfaces blocking public-accessibility issues next to the fields", () => {
    render(
      <StudioPublicationRightsControls
        metadata={{ ...base, provenance: "agent_assisted" }}
        onChange={() => undefined}
        issues={[
          {
            code: "ALT_TEXT_REQUIRED",
            severity: "error",
            message: "작품 대체 텍스트를 입력해 주세요.",
            path: "community.altText",
          },
          {
            code: "ASSISTANCE_DISCLOSURE_REQUIRED",
            severity: "error",
            message: "AI 에이전트 참여 방식을 공개해 주세요.",
            path: "community.attributionText",
          },
        ]}
      />,
    );

    expect(screen.getByRole("list", { name: "접근성 및 권리 확인 사항" })).toBeTruthy();
    expect(screen.getByText("작품 대체 텍스트를 입력해 주세요.")).toBeTruthy();
    expect(screen.getByText("AI 에이전트 참여 방식을 공개해 주세요.")).toBeTruthy();
  });

  it("AI 학습은 체크박스가 아니라 미지정 기본의 3상태 선택이다", () => {
    render(<StudioPublicationRightsControls metadata={base} onChange={() => undefined} />);

    expect(screen.queryByRole("checkbox", { name: /AI 학습/u })).toBeNull();
    const group = screen.getByRole("group", { name: "AI 학습 허용 표기" });
    expect(group.querySelectorAll('input[type="radio"]')).toHaveLength(3);
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "미지정 (기본)" }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "허용" }).checked).toBe(false);
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "불허" }).checked).toBe(false);
  });

  it("허용·불허를 고르면 aiTraining 과 레거시 파생 불리언을 함께 맞춰 내보낸다", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <StudioPublicationRightsControls metadata={base} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "허용" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      aiTraining: "allowed",
      trainingAllowed: true,
    }));

    rerender(
      <StudioPublicationRightsControls
        metadata={withCreatorCommunityAiTraining(base, "allowed")}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "불허" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      aiTraining: "prohibited",
      trainingAllowed: false,
    }));
    // 다른 필드는 건드리지 않는다.
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      provenance: base.provenance,
      downloadAllowed: base.downloadAllowed,
    }));
  });

  it("aiTraining 필드가 없는 기존 게시물은 켜 둔 레거시 값만 허용으로 보여 준다", () => {
    const { aiTraining: _omitted, ...legacyOff } = base;
    const { rerender } = render(
      <StudioPublicationRightsControls metadata={legacyOff} onChange={() => undefined} />,
    );
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "미지정 (기본)" }).checked).toBe(true);

    rerender(
      <StudioPublicationRightsControls
        metadata={{ ...legacyOff, trainingAllowed: true }}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "허용" }).checked).toBe(true);
    // 허용 표기는 출처·이용 조건 입력을 필수로 표시한다.
    expect(screen.getByText("제작 참여·출처·이용 조건").parentElement?.textContent).toContain("*");
  });

  it("편집이 잠기면 AI 학습 표기도 바꿀 수 없다", () => {
    const onChange = vi.fn();
    render(<StudioPublicationRightsControls metadata={base} disabled onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "허용" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("이미 게시한 작품을 고치는 중이면 변경 확인 문구에 반영 시점을 덧붙인다", () => {
    function Harness() {
      const [metadata, setMetadata] = useState(base);
      return <StudioPublicationRightsControls metadata={metadata} published onChange={setMetadata} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: "불허" }));
    const status = screen.getAllByRole("status").find((node) => node.textContent?.includes("불허"));
    expect(status?.textContent).toContain("다음 게시(릴리스)부터");
  });
});
