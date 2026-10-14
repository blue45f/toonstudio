// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Title } from "@/shared/lib/types";

import { CoverCard } from "./cover-card";

vi.mock("@/platform/environment/use-app-config", () => ({
  useAppConfig: () => ({ showCovers: true }),
}));

const TITLE = {
  id: "title-1",
  title: "비 오는 날의 첫사랑",
  author: "김작가",
  artist: "김작가",
  type: "webtoon",
  releaseYear: 2026,
  cover: ["oklch(0.62 0.19 300)", "oklch(0.55 0.16 200)"],
  coverImage: undefined,
  ageRating: "all",
} as unknown as Title;

afterEach(cleanup);

describe("CoverCard 렌더링 계약 (S3-15)", () => {
  it("표지 이미지가 없으면 즉시 보이는 타이포 폴백(제목·저자)이 기본이다", () => {
    const { container } = render(<CoverCard title={TITLE} />);
    expect(container.querySelector("[data-cover-card]")?.getAttribute("data-cover-ratio")).toBe("portrait");
    expect(screen.getByRole("heading", { name: "비 오는 날의 첫사랑" })).toBeTruthy();
    expect(screen.getByText(/김작가/u)).toBeTruthy();
    // 빈 타일이 아니라 폴백 포스터가 첫 페인트부터 서 있다.
    expect(container.querySelector(".cover-card-poster")).not.toBeNull();
  });

  it("ratio=wide면 마켓 변형 데이터 속성이 붙는다", () => {
    const { container } = render(<CoverCard title={TITLE} ratio="wide" />);
    expect(container.querySelector("[data-cover-card]")?.getAttribute("data-cover-ratio")).toBe("wide");
  });

  it("badge·meta 슬롯이 표지 위와 아래에 렌더된다", () => {
    const { container } = render(
      <CoverCard title={TITLE} badge={<span>₩4,900</span>} meta={<p>상업 이용 가능</p>} />
    );
    const badge = container.querySelector(".cover-card-badge");
    expect(badge?.textContent).toContain("₩4,900");
    expect(container.querySelector(".cover-card-meta")?.textContent).toContain("상업 이용 가능");
  });

  it("tint를 주면 --domain-tint만 카드 인라인으로 덮어쓴다", () => {
    const { container } = render(<CoverCard title={TITLE} tint="oklch(0.6 0.2 30)" />);
    expect(container.querySelector("[data-cover-card]")?.getAttribute("style")).toContain(
      "--domain-tint: oklch(0.6 0.2 30)"
    );
  });

  it("rank를 TitlePoster로 전달한다", () => {
    render(<CoverCard title={TITLE} rank={1} />);
    expect(screen.getByText("1", { selector: ".numeral" })).toBeTruthy();
  });
});
