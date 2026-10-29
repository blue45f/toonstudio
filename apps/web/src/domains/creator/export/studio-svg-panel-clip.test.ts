import { describe, expect, it } from "vitest";
import { studioSvgPanelClip } from "./studio-svg-panel-clip";

describe("SVG 컷 클립", () => {
  it("컷 밖 지우개와 일반 콘텐츠 모두에 쓸 실제 다각형을 문서 좌표로 직렬화한다", () => {
    expect(studioSvgPanelClip("sc1", { x: 10, y: 20, width: 100, height: 80,
      points: [0, 0, 100, 30, 60, 80] })).toBe(
      '<clipPath id="sc1" clipPathUnits="userSpaceOnUse"><polygon points="10 20 110 50 70 100"/></clipPath>',
    );
  });
  it("사각형 문서 클립과 잘못된 점의 오류를 보존한다", () => {
    expect(studioSvgPanelClip("sc2", { x: 10, y: 20, width: 100, height: 80 })).toContain(
      '<rect x="10" y="20" width="100" height="80"/>',
    );
    expect(() => studioSvgPanelClip("sc3", { x: 0, y: 0, width: 100, height: 80, points: [0, 1] })).toThrow();
  });
});
