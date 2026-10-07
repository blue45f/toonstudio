import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lobbyCss = readFileSync(new URL("./space-lobby.css", import.meta.url), "utf8");
const spaceCss = readFileSync(new URL("../studio-virtual-space.css", import.meta.url), "utf8");
const artStyleSource = readFileSync(new URL("../studio-virtual-space-art-style.ts", import.meta.url), "utf8");

describe("입장 로비 구조 계약 (웨이브 2)", () => {
  it("무대가 주인공인 비율과 월드 아트 장면을 유지한다", () => {
    expect(lobbyCss).toContain("grid-template-columns: minmax(0, 1.6fr) minmax(330px, .9fr)");
    expect(lobbyCss).toContain(".space-lobby__scene");
    expect(lobbyCss).toContain("object-fit: cover");
    expect(lobbyCss).toContain("object-position: 61% 73%");
  });

  it("월드 미리보기 초점은 스타일별 실측 레지스트리를 정본으로 한다 (W5-T7)", () => {
    expect(artStyleSource).toContain("STUDIO_VIRTUAL_LOBBY_PREVIEW_FOCUS");
    for (const key of ["sky-island", "webtoon", "pastel", "retro", "ink", "neon"]) {
      expect(artStyleSource).toContain(`"${key}": { x: 61,`);
    }
  });

  it("입력 카드는 뷰포트 높이 안에서 내부 스크롤로 완결되고 입장 버튼이 sticky로 남는다", () => {
    expect(lobbyCss).toContain("max-height: calc(100dvh - var(--space-lobby-pad) * 2 - var(--service-status-overlay-clearance, 0px))");
    expect(lobbyCss).toContain("overflow-y: auto");
    expect(lobbyCss).toMatch(/\.space-lobby__actions \{\s*position: sticky;/u);
  });

  it("피커 격자는 두 행이 온전히 보이는 높이와 링이 잘리지 않는 여백을 가진다", () => {
    expect(lobbyCss).toContain("max-height: 300px");
    expect(lobbyCss).toContain("scroll-snap-type: y proximity");
    expect(lobbyCss).toContain("padding: 6px");
  });

  it("피커 셀은 스프라이트가 작게 뭉개지지 않는 크기를 유지한다", () => {
    expect(spaceCss).toContain("grid-template-columns:repeat(auto-fill,minmax(104px,1fr))");
    expect(spaceCss).toContain("min-height:140px");
    expect(spaceCss).toContain("height:100px");
  });
});
