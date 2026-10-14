import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ART_BACKDROP_SCRIM_BOTTOM, ArtBackdrop, artBackdropBackground } from "./art-backdrop";

vi.mock("./cover-image", () => ({
  CoverImage: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    <img src={src} alt={alt} className={className} data-cover-image="true" />
  ),
}));

const COVER: [string, string] = ["oklch(0.45 0.14 260)", "oklch(0.28 0.1 290)"];

describe("artBackdropBackground — 사전 계산 틴트 (S3-17)", () => {
  it("메타데이터 틴트 쌍을 TitlePoster와 같은 혼합 비율의 그라디언트로 만든다", () => {
    const background = artBackdropBackground(COVER);
    expect(background).toContain("linear-gradient(150deg");
    expect(background).toContain("oklch(0.45 0.14 260) 88%");
    expect(background).toContain("oklch(0.28 0.1 290) 82%");
  });

  it("입력 순서가 바뀌면 그라디언트 방향 색도 바뀐다 (샘플링이 아닌 메타데이터 도출)", () => {
    expect(artBackdropBackground([COVER[1], COVER[0]])).not.toBe(artBackdropBackground(COVER));
  });
});

describe("ArtBackdrop", () => {
  it("표지가 없어도 틴트+스크림만으로 배경이 완성되고 장식 영역으로 숨는다", () => {
    const html = renderToStaticMarkup(<ArtBackdrop title={{ cover: COVER }} />);
    expect(html).toContain('data-art-backdrop="true"');
    expect(html).toContain('data-art-tint="precomputed"');
    expect(html).toContain("aria-hidden=\"true\"");
    expect(html).toContain("oklch(0.45 0.14 260)");
    expect(html).not.toContain("data-cover-image");
    expect(html).toContain("0.95"); // 하단 스크림 상수 경유
    expect(ART_BACKDROP_SCRIM_BOTTOM).toContain("to_top");
  });

  it("표지가 있으면 흐릿한 장식 레이어로만 겹치고 틴트가 먼저 깔린다", () => {
    const html = renderToStaticMarkup(
      <ArtBackdrop title={{ cover: COVER, coverImage: "https://example.com/cover.jpg" }} />,
    );
    expect(html).toContain('data-cover-image="true"');
    expect(html).toContain("blur-md");
    // 틴트 div가 이미지보다 앞에 온다 (첫 페인트는 틴트).
    expect(html.indexOf("oklch(0.45 0.14 260)")).toBeLessThan(html.indexOf("data-cover-image"));
  });
});
