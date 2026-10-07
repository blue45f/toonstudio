// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EngineeringPageIntro } from "./EngineeringStoryUi";

afterEach(cleanup);

describe("EngineeringPageIntro 정체성 칩", () => {
  it("발표 동선이 없는 자료 페이지는 그룹과 문서 이름을 칩으로 보여준다", () => {
    render(
      <EngineeringPageIntro
        pageId="licenses"
        eyebrow="OPEN SOURCE · RIGHTS · NOTICES"
        title="제목"
        description="설명"
      />,
    );

    expect(screen.getByText(/자료 · 라이선스|Resources · Licenses/u)).toBeTruthy();
    expect(screen.queryByText(/발표 동선|Talk path/u)).toBeNull();
  });

  it("발표 동선 페이지는 기존 단계 배지를 유지하고 그룹 칩을 겹치지 않는다", () => {
    render(
      <EngineeringPageIntro
        pageId="story"
        eyebrow="ENGINEERING STORY"
        title="제목"
        description="설명"
      />,
    );

    expect(screen.getByText(/발표 동선 1\/5|Talk path 1\/5/u)).toBeTruthy();
    expect(screen.queryByText(/핵심 · 제작 스토리|Core · Story/u)).toBeNull();
  });
});
