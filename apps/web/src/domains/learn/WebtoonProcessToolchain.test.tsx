// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { WebtoonProcessToolchain } from "./WebtoonProcessToolchain";
import { WEBTOON_PROCESS_TOOLCHAIN } from "./webtoon-process-toolchain";

afterEach(() => {
  cleanup();
});

const ALL_TOOLS = WEBTOON_PROCESS_TOOLCHAIN.flatMap((stage) => stage.tools);

describe("공정별 도구 데이터 무결성", () => {
  it("13개 공정 단계가 모두 도구를 하나 이상 가진다", () => {
    expect(WEBTOON_PROCESS_TOOLCHAIN).toHaveLength(13);
    for (const stage of WEBTOON_PROCESS_TOOLCHAIN) {
      expect(stage.tools.length).toBeGreaterThan(0);
    }
  });

  it("단계마다 외부 도구와 툰스튜디오 내장 기능이 모두 있다", () => {
    for (const stage of WEBTOON_PROCESS_TOOLCHAIN) {
      expect(stage.tools.some((tool) => tool.kind === "external")).toBe(true);
      expect(stage.tools.some((tool) => tool.kind === "builtin")).toBe(true);
    }
    expect(ALL_TOOLS.filter((tool) => tool.kind === "external").length).toBeGreaterThanOrEqual(90);
    expect(ALL_TOOLS.filter((tool) => tool.kind === "builtin").length).toBeGreaterThanOrEqual(50);
  });

  it("단계 제목·요약과 도구 이름·역할이 한/영 모두 비어 있지 않다", () => {
    for (const stage of WEBTOON_PROCESS_TOOLCHAIN) {
      expect(stage.title.ko.trim()).not.toBe("");
      expect(stage.title.en.trim()).not.toBe("");
      expect(stage.summary.ko.trim()).not.toBe("");
      expect(stage.summary.en.trim()).not.toBe("");
      for (const tool of stage.tools) {
        expect(tool.name.ko.trim()).not.toBe("");
        expect(tool.name.en.trim()).not.toBe("");
        expect(tool.role.ko.trim()).not.toBe("");
        expect(tool.role.en.trim()).not.toBe("");
      }
    }
  });

  it("단계 id와 단계 안 도구 이름이 중복되지 않는다", () => {
    const ids = WEBTOON_PROCESS_TOOLCHAIN.map((stage) => stage.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const stage of WEBTOON_PROCESS_TOOLCHAIN) {
      const names = stage.tools.map((tool) => tool.name.ko);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("과금 형태는 허용된 값만 쓰고, 링크는 내장 기능에만 달린다", () => {
    for (const tool of ALL_TOOLS) {
      if (tool.pricing !== undefined) {
        expect(["free", "freemium", "paid", "subscription"]).toContain(tool.pricing);
      }
      if (tool.href !== undefined) {
        expect(tool.kind).toBe("builtin");
      }
    }
  });

  it("내장 기능 링크는 정적 내부 경로만 쓴다 (실재 여부는 app 레이어의 링크 무결성 가드가 검증)", () => {
    const hrefs = ALL_TOOLS.map((tool) => tool.href).filter((href) => href !== undefined);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href.startsWith("/")).toBe(true);
      // 동적 파라미터(:id 등)나 공백이 있는 경로는 가이드 링크로 쓰지 않는다.
      expect(href).not.toMatch(/[:\s]/u);
    }
  });
});

function renderToolchain() {
  return render(
    <MemoryRouter>
      <WebtoonProcessToolchain />
    </MemoryRouter>,
  );
}

describe("공정별 도구 섹션 렌더", () => {
  it("섹션 제목과 정직성 전제 문구, 툰스튜디오 연결 문단을 렌더한다", () => {
    renderToolchain();
    const section = screen.getByRole("region", { name: "공정별로 쓰이는 도구들" });
    expect(within(section).getByText(/작품마다 다르므로/u)).toBeTruthy();
    expect(within(section).getByRole("heading", { name: "툰스튜디오는 이 도구들을 잇는 자리입니다" })).toBeTruthy();
    expect(within(section).getByText(/대체하려는 제품이 아닙니다/u)).toBeTruthy();
  });

  it("13개 단계 카드가 모두 렌더되고 핵심 도구(외부·내장)가 보인다", () => {
    const { container } = renderToolchain();
    expect(container.querySelectorAll("[data-process-toolchain-stage]")).toHaveLength(13);
    for (const stage of WEBTOON_PROCESS_TOOLCHAIN) {
      expect(screen.getByRole("heading", { name: stage.title.ko })).toBeTruthy();
    }
    for (const toolName of [
      "CRECO",
      "KAISTORY",
      "MangaPlay Studio",
      "SketchUp",
      "GenToon",
      "레터웍스 (letr.ai)",
      "APOC 에셋",
      "투닝 플러스 (Tooning Plus)",
      "OpenArt",
      "에이블러 (ABLUR)",
      "캐릭터 셰이퍼",
      "세계관 랩",
    ]) {
      expect(screen.getAllByText(toolName).length).toBeGreaterThan(0);
    }
  });

  it("내장 기능은 배지로 구분되고 독립 화면이 있는 기능은 링크로 이어진다", () => {
    renderToolchain();
    expect(screen.getAllByText("툰스튜디오 내장").length).toBeGreaterThan(0);
    const storyworldLink = screen.getByRole("link", { name: /세계관 랩/u });
    expect(storyworldLink.getAttribute("href")).toBe("/studio/storyworld");
    const shaperLink = screen.getByRole("link", { name: /캐릭터 셰이퍼/u });
    expect(shaperLink.getAttribute("href")).toBe("/studio/assets/characters/new");
  });

  it("종류 필터가 외부 도구와 내장 기능을 갈라 보여 준다", () => {
    renderToolchain();
    fireEvent.click(screen.getByRole("button", { name: "툰스튜디오 내장" }));
    expect(screen.queryByText("CRECO")).toBeNull();
    expect(screen.getAllByText("세계관 랩").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "외부 도구" }));
    expect(screen.getAllByText("CRECO").length).toBeGreaterThan(0);
    expect(screen.queryByText("세계관 랩")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "전체" }));
    expect(screen.getAllByText("CRECO").length).toBeGreaterThan(0);
    expect(screen.getAllByText("세계관 랩").length).toBeGreaterThan(0);
  });
});
