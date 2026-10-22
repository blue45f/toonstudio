// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { productTourSpaceToggle } from "./product-tour-playback";

type SpaceEventInit = {
  readonly key?: string;
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
  readonly repeat?: boolean;
};

function spaceEvent(target: EventTarget | null, init: SpaceEventInit = {}) {
  return {
    key: " ",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    ...init,
    target,
  };
}

function element(html: string): Element {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.firstElementChild!;
}

function inner(html: string, selector: string): Element {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.querySelector(selector)!;
}

describe("제품 투어 Space 재생·정지 토글 판정", () => {
  it("본문·일반 요소 위의 Space는 토글로 받아들인다", () => {
    expect(productTourSpaceToggle(spaceEvent(document.body))).toBe(true);
    expect(productTourSpaceToggle(spaceEvent(element("<div></div>")))).toBe(true);
    expect(productTourSpaceToggle(spaceEvent(inner("<div><span>제목</span></div>", "span")))).toBe(true);
    expect(productTourSpaceToggle(spaceEvent(element("<a>링크 아님</a>")))).toBe(true);
  });

  it("Space 기본 동작이 있는 대상에서는 가로채지 않는다", () => {
    expect(productTourSpaceToggle(spaceEvent(element("<button type='button'>재생</button>")))).toBe(false);
    expect(productTourSpaceToggle(spaceEvent(inner("<button type='button'><span>재생</span></button>", "span")))).toBe(false);
    expect(productTourSpaceToggle(spaceEvent(element("<a href='/studio'>열기</a>")))).toBe(false);
    expect(productTourSpaceToggle(spaceEvent(element("<input type='range'>")))).toBe(false);
    expect(productTourSpaceToggle(spaceEvent(element("<textarea></textarea>")))).toBe(false);
    expect(productTourSpaceToggle(spaceEvent(element("<select></select>")))).toBe(false);
    expect(productTourSpaceToggle(spaceEvent(inner("<div contenteditable='true'><span>대본</span></div>", "span")))).toBe(false);
    expect(productTourSpaceToggle(spaceEvent(element("<summary>대본</summary>")))).toBe(false);
    expect(productTourSpaceToggle(spaceEvent(element("<video controls></video>")))).toBe(false);
    expect(productTourSpaceToggle(spaceEvent(element("<div role='button'>조작</div>")))).toBe(false);
  });

  it("수정 키 조합과 키 반복은 토글로 받지 않는다", () => {
    expect(productTourSpaceToggle(spaceEvent(document.body, { ctrlKey: true }))).toBe(false);
    expect(productTourSpaceToggle(spaceEvent(document.body, { metaKey: true }))).toBe(false);
    expect(productTourSpaceToggle(spaceEvent(document.body, { altKey: true }))).toBe(false);
    expect(productTourSpaceToggle(spaceEvent(document.body, { shiftKey: true }))).toBe(false);
    expect(productTourSpaceToggle(spaceEvent(document.body, { repeat: true }))).toBe(false);
  });

  it("Space가 아닌 키는 토글이 아니다", () => {
    expect(productTourSpaceToggle(spaceEvent(document.body, { key: "Enter" }))).toBe(false);
    expect(productTourSpaceToggle(spaceEvent(document.body, { key: "ArrowLeft" }))).toBe(false);
    expect(productTourSpaceToggle(spaceEvent(document.body, { key: "k" }))).toBe(false);
    expect(productTourSpaceToggle(spaceEvent(document.body, { key: "Spacebar" }))).toBe(true);
  });
});
