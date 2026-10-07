// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FanPostCardSkeleton } from "./fan-cafe-post-card-skeleton";

afterEach(cleanup);

describe("FanPostCardSkeleton (글 카드 로딩 실루엣)", () => {
  it("아바타·제목 줄·이미지 무대·본문 줄의 실물 카드 골격을 그린다", () => {
    const { container } = render(<FanPostCardSkeleton />);
    const root = container.firstElementChild;
    expect(root?.getAttribute("aria-hidden")).toBe("true");
    // 아바타 원 + 무대를 포함한 스켈레톤 조각이 카드 골격 수만큼 있다.
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThanOrEqual(6);
    expect(container.querySelector(".rounded-full")).toBeTruthy();
    expect(container.querySelector(".aspect-\\[16\\/10\\]")).toBeTruthy();
    // 실루엣은 장식 전용이다 — 실제 이미지나 텍스트를 흉내 내지 않는다.
    expect(container.querySelector("img")).toBeNull();
    expect(root?.textContent).toBe("");
  });
});
