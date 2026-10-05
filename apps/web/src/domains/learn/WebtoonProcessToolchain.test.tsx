// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { WebtoonProcessToolchain } from "./WebtoonProcessToolchain";
import { WEBTOON_PROCESS_TOOLCHAIN } from "./webtoon-process-toolchain";

afterEach(() => {
  cleanup();
});

describe("공정별 도구 데이터 무결성", () => {
  it("13개 공정 단계가 모두 도구를 하나 이상 가진다", () => {
    expect(WEBTOON_PROCESS_TOOLCHAIN).toHaveLength(13);
    for (const stage of WEBTOON_PROCESS_TOOLCHAIN) {
      expect(stage.copy.ko.tools.length).toBeGreaterThan(0);
    }
  });

  it("한/영 카피가 같은 구조(단계 제목·요약·도구 수·이름·역할 비어 있지 않음)를 유지한다", () => {
    for (const stage of WEBTOON_PROCESS_TOOLCHAIN) {
      const { ko, en } = stage.copy;
      expect(ko.title.trim()).not.toBe("");
      expect(en.title.trim()).not.toBe("");
      expect(ko.summary.trim()).not.toBe("");
      expect(en.summary.trim()).not.toBe("");
      expect(en.tools).toHaveLength(ko.tools.length);
      for (const tool of [...ko.tools, ...en.tools]) {
        expect(tool.name.trim()).not.toBe("");
        expect(tool.role.trim()).not.toBe("");
      }
    }
  });

  it("단계 id가 중복되지 않는다", () => {
    const ids = WEBTOON_PROCESS_TOOLCHAIN.map((stage) => stage.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("공정별 도구 섹션 렌더", () => {
  it("섹션 제목과 정직성 전제 문구, 툰스튜디오 연결 문단을 렌더한다", () => {
    render(<WebtoonProcessToolchain />);
    const section = screen.getByRole("region", { name: "공정별로 쓰이는 도구들" });
    expect(within(section).getByText(/작품마다 다르므로/u)).toBeTruthy();
    expect(within(section).getByRole("heading", { name: "툰스튜디오는 이 도구들을 잇는 자리입니다" })).toBeTruthy();
    expect(within(section).getByText(/대체하려는 제품이 아닙니다/u)).toBeTruthy();
  });

  it("13개 단계 카드가 모두 렌더되고 핵심 도구가 보인다", () => {
    const { container } = render(<WebtoonProcessToolchain />);
    expect(container.querySelectorAll("[data-process-toolchain-stage]")).toHaveLength(13);
    for (const stage of WEBTOON_PROCESS_TOOLCHAIN) {
      expect(screen.getByRole("heading", { name: stage.copy.ko.title })).toBeTruthy();
    }
    for (const toolName of ["CRECO", "KAISTORY", "MangaPlay Studio", "SketchUp", "GenToon", "레터웍스 (letr.ai)"]) {
      expect(screen.getAllByText(toolName).length).toBeGreaterThan(0);
    }
  });
});
