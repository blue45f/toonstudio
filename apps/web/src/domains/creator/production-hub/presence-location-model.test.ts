import { describe, expect, it } from "vitest";

import {
  buildPresenceLocationHref,
  derivePresenceLocation,
  formatPresenceLocation,
  isSamePresenceLocation,
  parsePresencePageId,
  presenceStageLabel,
} from "./presence-location-model";

describe("페이지 ID 파싱", () => {
  it("규약 ID에서 회차와 페이지 번호를 뽑는다", () => {
    expect(parsePresencePageId("episode-12-page-03")).toEqual({
      episodeId: "episode-12",
      episodeNumber: 12,
      pageNumber: 3,
    });
    expect(parsePresencePageId("episode-7-page-1")).toEqual({
      episodeId: "episode-7",
      episodeNumber: 7,
      pageNumber: 1,
    });
  });

  it("회차 규약이 아닌 접두는 회차로 단정하지 않지만 페이지 번호는 뽑는다", () => {
    expect(parsePresencePageId("storyboard-page-07")).toEqual({
      episodeId: null,
      episodeNumber: null,
      pageNumber: 7,
    });
  });

  it("규약 밖 ID와 빈 값에서는 아무것도 뽑지 않는다", () => {
    expect(parsePresencePageId("cover")).toEqual({ episodeId: null, episodeNumber: null, pageNumber: null });
    expect(parsePresencePageId("page-05")).toEqual({ episodeId: null, episodeNumber: null, pageNumber: null });
    expect(parsePresencePageId(null)).toEqual({ episodeId: null, episodeNumber: null, pageNumber: null });
    expect(parsePresencePageId("")).toEqual({ episodeId: null, episodeNumber: null, pageNumber: null });
  });
});

describe("위치 도출", () => {
  it("명시된 회차가 페이지 ID에서 뽑은 회차보다 우선한다", () => {
    const location = derivePresenceLocation({ pageId: "episode-12-page-03", episodeId: "episode-99" });
    expect(location.episodeId).toBe("episode-99");
    expect(location.pageId).toBe("episode-12-page-03");
  });

  it("빈 문자열은 없는 것으로 정리한다", () => {
    expect(derivePresenceLocation({ pageId: "", episodeId: "", stageId: "" })).toEqual({
      episodeId: null,
      pageId: null,
      stageId: null,
    });
    expect(derivePresenceLocation({})).toEqual({ episodeId: null, pageId: null, stageId: null });
  });

  it("같은 자리 판정은 세 조각이 모두 같을 때만 참이다", () => {
    const base = derivePresenceLocation({ pageId: "episode-12-page-03", stageId: "color" });
    expect(isSamePresenceLocation(base, { ...base })).toBe(true);
    expect(isSamePresenceLocation(base, { ...base, stageId: "line-art" })).toBe(false);
    expect(isSamePresenceLocation(base, { ...base, pageId: "episode-12-page-04" })).toBe(false);
    expect(isSamePresenceLocation(base, { ...base, episodeId: "episode-13" })).toBe(false);
  });
});

describe("위치 라벨", () => {
  it("회차·페이지·공정을 한 줄로 잇는다", () => {
    const location = derivePresenceLocation({ pageId: "episode-12-page-03", stageId: "color" });
    expect(formatPresenceLocation(location)).toEqual({
      ko: "12화 · 3페이지 · 채색",
      en: "Episode 12 · Page 3 · Color",
    });
  });

  it("공정 라벨은 제작 허브 라벨표를 쓰고 검수는 보탠 표를 쓴다", () => {
    expect(presenceStageLabel("storyboard")).toEqual({ ko: "콘티", en: "Storyboard" });
    expect(presenceStageLabel("line-art")).toEqual({ ko: "선화", en: "Line art" });
    expect(presenceStageLabel("review")).toEqual({ ko: "검수", en: "Review" });
    expect(presenceStageLabel("not-a-stage")).toBeNull();
    expect(presenceStageLabel(null)).toBeNull();
  });

  it("라벨표에 없는 공정 키는 원문을 그대로 싣는다 (팀 커스텀 공정)", () => {
    const location = derivePresenceLocation({ pageId: "episode-12-page-03", stageId: "team-ink" });
    expect(formatPresenceLocation(location)?.ko).toBe("12화 · 3페이지 · team-ink");
  });

  it("회차 제목을 알면 번호 대신 제목이 우선한다", () => {
    const location = derivePresenceLocation({ pageId: "episode-12-page-03" });
    expect(formatPresenceLocation(location, { episodeLabel: "12화 · 비 오는 밤" })?.ko)
      .toBe("12화 · 비 오는 밤 · 3페이지");
  });

  it("아는 조각만으로 라벨을 만들고, 아무것도 모르면 null이다", () => {
    expect(formatPresenceLocation(derivePresenceLocation({ stageId: "lettering" })))
      .toEqual({ ko: "식자", en: "Lettering" });
    expect(formatPresenceLocation(derivePresenceLocation({ pageId: "episode-9-page-01" })))
      .toEqual({ ko: "9화 · 1페이지", en: "Episode 9 · Page 1" });
    expect(formatPresenceLocation(derivePresenceLocation({}))).toBeNull();
  });

  it("파싱이 안 되는 페이지 ID는 원문을 최후의 라벨로 쓴다", () => {
    expect(formatPresenceLocation(derivePresenceLocation({ pageId: "opaque-page-id" })))
      .toEqual({ ko: "opaque-page-id", en: "opaque-page-id" });
  });

  it("번호를 모르는 회차 ID는 라벨에 싣지 않는다", () => {
    const location = derivePresenceLocation({ episodeId: "episode-special", stageId: "review" });
    expect(formatPresenceLocation(location)).toEqual({ ko: "검수", en: "Review" });
  });
});

describe("이동 경로", () => {
  it("회차 룸 경로를 만들고 식별자는 인코딩한다", () => {
    const location = derivePresenceLocation({ pageId: "episode-12-page-03" });
    expect(buildPresenceLocationHref(location, "project-1"))
      .toBe("/production/projects/project-1/episodes/episode-12");
    expect(buildPresenceLocationHref(location, "proj ect"))
      .toBe("/production/projects/proj%20ect/episodes/episode-12");
  });

  it("회차나 프로젝트를 모르면 경로를 만들지 않는다", () => {
    expect(buildPresenceLocationHref(derivePresenceLocation({ pageId: "storyboard-page-07" }), "project-1")).toBeNull();
    expect(buildPresenceLocationHref(derivePresenceLocation({ pageId: "episode-12-page-03" }), null)).toBeNull();
    expect(buildPresenceLocationHref(derivePresenceLocation({}), "project-1")).toBeNull();
  });
});
