// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { StudioPublicWiki } from "@/domains/creator/public/world-wiki";

import { WorldWikiSection } from "./WorldWikiSection";

afterEach(() => {
  cleanup();
});

const SAMPLE_WIKI: StudioPublicWiki = {
  spoilerThroughEpisode: 12,
  publicCount: 2,
  sections: [
    {
      kind: "character",
      label: "캐릭터",
      entries: [
        {
          id: "char-1",
          kind: "character",
          name: "서진우",
          aliases: ["신호수"],
          summary: "안개 구역의 첫 관측자",
          details: "1화에서 낡은 라디오를 통해 경보를 수신한다.",
          revealEpisode: 1,
          related: [{ id: "loc-1", name: "남쪽 등대" }],
        },
      ],
    },
    {
      kind: "location",
      label: "장소",
      entries: [
        {
          id: "loc-1",
          kind: "location",
          name: "남쪽 등대",
          aliases: [],
          summary: "안개가 가장 짙은 해안 초소",
          details: "매달 초 전파가 끊긴다.",
          revealEpisode: 4,
          related: [],
        },
      ],
    },
  ],
};

describe("WorldWikiSection", () => {
  it("분류 필터와 검색을 통해 스포일러 경계 내 공개 설정만 필터링한다", () => {
    render(<WorldWikiSection wiki={SAMPLE_WIKI} titleName="안개 속의 신호" />);

    expect(screen.getByText("안개 속의 신호 공식 설정 위키")).toBeTruthy();
    expect(screen.getByText("서진우")).toBeTruthy();
    expect(screen.getByText("남쪽 등대")).toBeTruthy();

    const locationFilter = screen.getByRole("button", { name: "장소 · 1" });
    fireEvent.click(locationFilter);
    expect(locationFilter.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("서진우")).toBeNull();
    expect(screen.getByText("남쪽 등대")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "전체 · 2" }));
    fireEvent.change(screen.getByPlaceholderText("공개된 설정 안에서 검색"), {
      target: { value: "라디오" },
    });
    expect(screen.getByText("서진우")).toBeTruthy();
    expect(screen.queryByText("남쪽 등대")).toBeNull();
  });

  it("공개 설정이 없으면 빈 상태 안내를 표시한다", () => {
    render(
      <WorldWikiSection
        wiki={{ spoilerThroughEpisode: 0, publicCount: 0, sections: [] }}
      />,
    );

    expect(screen.getByText("아직 공개된 설정이 없어요")).toBeTruthy();
  });
});
