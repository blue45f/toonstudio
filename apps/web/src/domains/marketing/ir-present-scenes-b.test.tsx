// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GTM_STEPS } from "./ir-pitch-data";
import { SCENE_NODES_B } from "./ir-present-scenes-b";
import { formatProductTourDuration, formatProductTourTime, PRODUCT_TOUR, productTourChapterHref } from "./product-tour-content";

afterEach(cleanup);

describe("IR 발표의 제품 투어 연결", () => {
  it("정본의 모든 챕터를 해당 시작 시간으로 열고 개념 도해를 구분한다", () => {
    const { container } = render(SCENE_NODES_B[5]);
    const links = Array.from(container.querySelectorAll<HTMLAnchorElement>(".chapter-row"));
    expect(links).toHaveLength(PRODUCT_TOUR.chapters.length);
    PRODUCT_TOUR.chapters.forEach((chapter, index) => {
      const link = links[index];
      expect(link).toBeDefined();
      expect(link?.getAttribute("href")).toBe(productTourChapterHref(chapter.start));
      expect(link?.textContent).toContain(chapter.ko);
      expect(link?.textContent).toContain(formatProductTourTime(chapter.start));
      expect(link?.textContent?.includes("개념 도해")).toBe(chapter.visual === "concept");
    });
    expect(container.textContent).toContain(formatProductTourDuration(PRODUCT_TOUR.duration, "ko"));
    expect(container.textContent).toContain("CH.4·CH.6");
    expect(screen.getByRole("link", { name: "ToonStudio 전체 제품 투어 영상, 처음부터 열기" }).getAttribute("href"))
      .toBe(productTourChapterHref(0));
  });

  it("발표의 고객 확보 단계가 투자 소개와 같은 검증 계획을 사용한다", () => {
    const { container } = render(SCENE_NODES_B[9]);
    const steps = container.querySelectorAll<HTMLElement>(".road-steps")[1];
    expect(steps).toBeDefined();
    if (!steps) throw new Error("고객 검증 단계가 없습니다.");
    for (const step of GTM_STEPS) {
      expect(within(steps).getByText(step.ko.title)).toBeTruthy();
      expect(within(steps).getByText(step.ko.body)).toBeTruthy();
    }
  });
});
