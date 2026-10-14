// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SpectacleHero } from "./SpectacleHero";

afterEach(cleanup);

describe("SpectacleHero 렌더링 계약 (S3-15)", () => {
  it("title을 h1으로 렌더하고 섹션을 titleId로 연결한다", () => {
    render(<SpectacleHero title="오늘은 어떤 이야기를" titleId="hero-title" />);
    const h1 = screen.getByRole("heading", { level: 1, name: "오늘은 어떤 이야기를" });
    expect(h1.getAttribute("id")).toBe("hero-title");
    expect(h1.closest("section")?.getAttribute("aria-labelledby")).toBe("hero-title");
  });

  it("아트가 있으면 장식 img를 priority로 렌더하고 data-spectacle-art=image가 된다", () => {
    const { container } = render(
      <SpectacleHero title="제목" art={{ src: "/hero.webp", srcSet: "/hero-320.webp 320w", sizes: "100vw" }} />
    );
    const img = container.querySelector("img.spectacle-hero-art");
    expect(img?.getAttribute("src")).toBe("/hero.webp");
    expect(img?.getAttribute("srcset")).toBe("/hero-320.webp 320w");
    expect(img?.getAttribute("fetchpriority") ?? img?.getAttribute("fetchPriority")).toBe("high");
    expect(img?.getAttribute("alt")).toBe("");
    expect(img?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("[data-spectacle-hero]")?.getAttribute("data-spectacle-art")).toBe("image");
  });

  it("아트가 없으면 img 없이 스펙트럼 타이포 커버 모드(none)가 된다", () => {
    const { container } = render(<SpectacleHero title="제목" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[data-spectacle-hero]")?.getAttribute("data-spectacle-art")).toBe("none");
  });

  it("beforeTitle·eyebrow·lede·children·aside 슬롯이 카피 열과 패널 자리에 렌더된다", () => {
    const { container } = render(
      <SpectacleHero
        title="제목"
        beforeTitle={<p>브랜드</p>}
        eyebrow="눈썹 문장"
        lede="리드 문단"
        aside={<aside aria-label="보조 패널">패널</aside>}
      >
        <form aria-label="주 행동" />
      </SpectacleHero>
    );
    const copy = container.querySelector(".spectacle-hero-copy");
    expect(copy?.textContent).toContain("브랜드");
    expect(copy?.textContent).toContain("눈썹 문장");
    expect(copy?.textContent).toContain("리드 문단");
    expect(copy?.querySelector("form")).not.toBeNull();
    // aside는 카피 열 밖, 히어로 안에 있다 (Luna 패널이 히어로 안에 있는 홈 계약과 동일).
    expect(screen.getByRole("complementary", { name: "보조 패널" }).closest("[data-spectacle-hero]")).not.toBeNull();
    expect(copy?.contains(screen.getByRole("complementary", { name: "보조 패널" }))).toBe(false);
  });

  it("tint를 주면 --domain-tint만 히어로 인라인으로 덮어쓴다", () => {
    const { container } = render(<SpectacleHero title="제목" tint="oklch(0.6 0.2 30)" />);
    const section = container.querySelector("[data-spectacle-hero]");
    expect(section?.getAttribute("style")).toContain("--domain-tint: oklch(0.6 0.2 30)");
  });

  it("tint가 없으면 인라인 스타일을 남기지 않는다", () => {
    const { container } = render(<SpectacleHero title="제목" />);
    expect(container.querySelector("[data-spectacle-hero]")?.getAttribute("style")).toBeNull();
  });

  it("표면 마감 클래스(rd-poster 계열)를 그대로 전달한다", () => {
    const { container } = render(
      <SpectacleHero
        title="제목"
        className="rd-poster"
        artClassName="rd-poster-art"
        innerClassName="rd-poster-inner"
        copyClassName="rd-story"
        eyebrowClassName="rd-eyebrow"
        ledeClassName="rd-intro"
        eyebrow="눈썹"
        lede="리드"
        art={{ src: "/hero.webp" }}
      />
    );
    expect(container.querySelector("section.rd-poster")).not.toBeNull();
    expect(container.querySelector("img.rd-poster-art")).not.toBeNull();
    expect(container.querySelector(".rd-poster-inner .rd-story")).not.toBeNull();
    expect(screen.getByText("눈썹").className).toContain("rd-eyebrow");
    expect(screen.getByText("리드").className).toContain("rd-intro");
  });
});
