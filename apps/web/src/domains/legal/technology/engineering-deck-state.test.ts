import { describe, expect, it } from "vitest";

import {
  DECK_TRACKS,
  engineeringDeckHash,
  engineeringDeckHref,
  isDeckSlideId,
  parseEngineeringDeckState,
  resolveDeckSlideIndex,
} from "./engineering-deck-state";

describe("발표 URL 상태: 트랙", () => {
  it("도감 부록 트랙(atlas)을 ?track=atlas 로 연다", () => {
    expect(DECK_TRACKS).toEqual(["talk", "brief", "lecture", "atlas"]);
    expect(parseEngineeringDeckState("?track=atlas", "#slide-5")).toEqual({ track: "atlas", index: 4, view: "audience" });
    expect(parseEngineeringDeckState("?track=atlas&view=presenter", "")).toEqual({ track: "atlas", index: 0, view: "presenter" });
  });
});

describe("발표 URL 상태: 슬라이드 id 딥링크", () => {
  it("숫자 해시(#slide-3)는 그대로 번호로 읽고 slideId 를 만들지 않는다", () => {
    const state = parseEngineeringDeckState("?track=talk", "#slide-3");
    expect(state).toStrictEqual({ track: "talk", index: 2, view: "audience" });
    expect("slideId" in state).toBe(false);
  });

  it("#slide-<id> 는 slideId 로 읽고 위치는 모델이 정해질 때까지 0 으로 둔다", () => {
    expect(parseEngineeringDeckState("?track=talk", "#slide-talk-ai")).toStrictEqual({
      track: "talk",
      index: 0,
      view: "audience",
      slideId: "talk-ai",
    });
    expect(parseEngineeringDeckState("?track=atlas", "#slide-atlas-opfs-code-2").slideId).toBe("atlas-opfs-code-2");
    // 숫자로 시작하는 id 도 숫자만 있지 않으면 id 다.
    expect(parseEngineeringDeckState("?track=talk", "#slide-3d-engine").slideId).toBe("3d-engine");
  });

  it("숫자만 있는 값·형식이 틀린 값은 id 가 아니다", () => {
    expect(isDeckSlideId("12345")).toBe(false);
    expect(isDeckSlideId("0")).toBe(false);
    expect(isDeckSlideId("")).toBe(false);
    expect(isDeckSlideId("a b")).toBe(false);
    expect(isDeckSlideId("<script>")).toBe(false);
    expect(isDeckSlideId("-leading")).toBe(false);
    expect(isDeckSlideId("a".repeat(161))).toBe(false);
    expect(isDeckSlideId("talk-ai")).toBe(true);
    expect(parseEngineeringDeckState("", "#slide-12345")).toEqual({ track: "talk", index: 0, view: "audience" });
    expect(parseEngineeringDeckState("", "#slide-<img>")).toEqual({ track: "talk", index: 0, view: "audience" });
    expect(parseEngineeringDeckState("", "#slide-0")).toEqual({ track: "talk", index: 0, view: "audience" });
  });

  it("id 를 슬라이드 id 순서로 위치로 바꾸고, 모르는 id 는 주소의 번호(없으면 0)로 되돌린다", () => {
    const ids = ["talk-cover", "talk-agenda", "talk-ai"];
    expect(resolveDeckSlideIndex(parseEngineeringDeckState("?track=talk", "#slide-talk-ai"), ids)).toBe(2);
    expect(resolveDeckSlideIndex(parseEngineeringDeckState("?track=talk", "#slide-talk-gone"), ids)).toBe(0);
    expect(resolveDeckSlideIndex(parseEngineeringDeckState("?track=talk", "#slide-2"), ids)).toBe(1);
    expect(resolveDeckSlideIndex({ index: 7 }, ids)).toBe(7);
  });

  it("id 형식 주소를 만들고 다시 읽으면 같은 슬라이드다", () => {
    expect(engineeringDeckHash(4)).toBe("#slide-5");
    expect(engineeringDeckHash(4, "talk-ai")).toBe("#slide-talk-ai");
    // 올바르지 않은 id 는 번호로 되돌린다.
    expect(engineeringDeckHash(4, "bad id")).toBe("#slide-5");
    const href = engineeringDeckHref({ track: "atlas", index: 9, view: "presenter", slideId: "atlas-opfs-usage" });
    expect(href).toBe("/about/technology/deck?track=atlas&view=presenter#slide-atlas-opfs-usage");
    const url = new URL(href, "https://toonstudio.cloud");
    expect(parseEngineeringDeckState(url.search, url.hash)).toEqual({
      track: "atlas",
      index: 0,
      view: "presenter",
      slideId: "atlas-opfs-usage",
    });
  });
});
