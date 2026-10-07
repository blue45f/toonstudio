// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FanPostCardArt, FanPostImages } from "./fan-cafe-images";

const PNG_A = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const PNG_B = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=";
const PNG_C = "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=";

afterEach(cleanup);

describe("FanPostCardArt (피드 카드 미디어 무대)", () => {
  it("첫 이미지만 무대로 세우고 나머지 장수는 배지로 알린다", () => {
    render(<FanPostCardArt title="여름 팬아트" images={[PNG_A, PNG_B, PNG_C]} />);
    const stage = screen.getByAltText("여름 팬아트 첨부 이미지 1");
    expect(stage.getAttribute("src")).toBe(PNG_A);
    expect(stage.className).toContain("aspect-[16/10]");
    expect(screen.queryByAltText("여름 팬아트 첨부 이미지 2")).toBeNull();
    expect(screen.getByText("+2")).toBeTruthy();
  });

  it("이미지가 한 장이면 배지 없이 무대만 보여준다", () => {
    render(<FanPostCardArt title="단독 코스프레" images={[PNG_A]} />);
    expect(screen.getByAltText("단독 코스프레 첨부 이미지 1")).toBeTruthy();
    expect(screen.queryByText(/^\+\d+$/)).toBeNull();
  });

  it("허용되지 않은 URL과 빈 목록에서는 아무것도 그리지 않는다", () => {
    const { container } = render(
      <FanPostCardArt title="깨진 첨부" images={["https://example.com/x.png", "data:text/html;base64,PHNjcmlwdD4="]} />,
    );
    expect(container.querySelector("img")).toBeNull();
    cleanup();
    const empty = render(<FanPostCardArt title="첨부 없음" images={undefined} />);
    expect(empty.container.querySelector("img")).toBeNull();
  });
});

describe("FanPostImages (상세 그리드)", () => {
  it("전 장을 그대로 그리드로 보여준다", () => {
    render(<FanPostImages title="연작 팬아트" images={[PNG_A, PNG_B]} />);
    expect(screen.getByAltText("연작 팬아트 첨부 이미지 1")).toBeTruthy();
    expect(screen.getByAltText("연작 팬아트 첨부 이미지 2")).toBeTruthy();
  });
});
