// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBubbleToolPopoverBody } from "./StudioBubbleToolPopoverBody";

import type { StudioToolBeltContentProps } from "../StudioToolBeltContent";

afterEach(cleanup);

function toolBelt(): StudioToolBeltContentProps {
  return {
    dialogueScript: "",
    setDialogueBatchOpen: vi.fn(),
    setDialogueScript: vi.fn(),
    setDialogueTranslateOpen: vi.fn(),
    setMenu: vi.fn(),
    stableHandlers: {
      addBubble: vi.fn(),
      addDialogueBubbles: vi.fn(),
      openFeatureTutorial: vi.fn(),
    },
  } as unknown as StudioToolBeltContentProps;
}

/**
 * axe 의 aria-required-children / aria-required-parent 위반(둘 다 critical)을 고정한다.
 * 예전에는 list 안에 구역(group)이 있고 그 안에 listitem 이 있어서, list 가 허용하지 않는 자식을 갖고
 * listitem 은 list 부모가 없다고 판정됐다. 화면 낭독기에서는 "목록 16개 항목" 이 낭독되지 않는 문제다.
 */
describe("말풍선 라이브러리의 목록 구조", () => {
  it("결과 영역은 group 이고, list 는 구역마다 따로 있으며 listitem 의 바로 위 부모가 list 다", () => {
    render(<StudioBubbleToolPopoverBody toolBelt={toolBelt()} />);

    const results = document.getElementById("studio-bubble-library-results");
    expect(results?.getAttribute("role")).toBe("group");
    expect(results?.getAttribute("aria-label")).toBeTruthy();

    const lists = Array.from(document.querySelectorAll('[role="list"]'));
    expect(lists.length).toBeGreaterThan(0);
    for (const list of lists) {
      // list 는 자기 구역 제목으로 이름이 붙고, 자식은 listitem 뿐이다.
      const heading = document.getElementById(list.getAttribute("aria-labelledby") ?? "");
      expect(heading?.textContent?.trim()).toBeTruthy();
      expect(Array.from(list.children).map((child) => child.getAttribute("role"))).not.toContain("group");
      for (const child of Array.from(list.children)) expect(child.getAttribute("role")).toBe("listitem");
    }

    const items = Array.from(document.querySelectorAll('[role="listitem"]'));
    expect(items).toHaveLength(16);
    for (const item of items) expect(item.parentElement?.getAttribute("role")).toBe("list");

    // 어떤 list 도 group 을 품지 않는다.
    expect(document.querySelectorAll('[role="list"] [role="group"]')).toHaveLength(0);
  });
});
