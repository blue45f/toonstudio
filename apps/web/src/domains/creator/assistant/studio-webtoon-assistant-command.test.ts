import { describe, expect, it } from "vitest";

import { STUDIO_COMMAND_CATALOG } from "../studio-command-catalog";

/**
 * 명령 팔레트에서 "텐션 맵" 을 검색하면 그 도구가 들어 있는 보조 센터가 나오게 한다.
 * 탭 하나를 위해 명령을 따로 만들지 않고 기존 보조 센터 명령의 별칭과 설명에 이름을 올린다.
 */
describe("웹툰 창작 보조 센터 명령 항목", () => {
  const entry = STUDIO_COMMAND_CATALOG.find((candidate) => candidate.id === "comic.webtoon-assistant");

  it("텐션 맵을 이름 별칭으로 가진다", () => {
    expect(entry).toBeDefined();
    expect(entry?.aliases.map((alias) => alias.term)).toContain("텐션 맵");
  });

  it("한국어 설명이 제공 도구 목록에 텐션 맵을 포함한다", () => {
    const description = entry?.labels.find((label) => label.locale === "ko")?.description;
    expect(description).toContain("텐션 맵");
  });

  it("텐션 맵 별칭을 쓰는 명령은 이 항목 하나뿐이다(검색 결과가 갈리지 않는다)", () => {
    const owners = STUDIO_COMMAND_CATALOG.filter((candidate) =>
      candidate.aliases.some((alias) => alias.term === "텐션 맵"),
    ).map((candidate) => candidate.id);
    expect(owners).toEqual(["comic.webtoon-assistant"]);
  });
});
