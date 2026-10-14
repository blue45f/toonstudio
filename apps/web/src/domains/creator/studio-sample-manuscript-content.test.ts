import { describe, expect, it } from "vitest";

import { hasContiguousLayerGroups } from "./studio-layers";
import {
  SAMPLE_EDITOR_HREF,
  SAMPLE_LAYER_GROUP_IDS,
  SAMPLE_MANUSCRIPT_LAYERS,
  SAMPLE_MANUSCRIPT_LICENSE_NOTICE,
  SAMPLE_PAGE_IDS,
  buildSampleManuscriptPages,
} from "./studio-sample-manuscript-content";

describe("sample manuscript content", () => {
  it("is an original two-page manuscript with a fixed editor href", () => {
    const pages = buildSampleManuscriptPages();
    expect(pages.map((page) => page.id)).toEqual([...SAMPLE_PAGE_IDS]);
    expect(pages.every((page) => page.canvasH === 1200)).toBe(true);
    expect(SAMPLE_EDITOR_HREF).toBe("/studio/p/sample-manuscript-trace/d/sample-manuscript-ep01?workspace=comic");
    // 외부 작품이 아니라 자체 제작본임을 명시한다.
    expect(SAMPLE_MANUSCRIPT_LICENSE_NOTICE).toContain("자체 제작");
  });

  it("separates every page into the six structural layer groups, back to front", () => {
    for (const page of buildSampleManuscriptPages()) {
      expect(page.groups?.map((group) => group.id)).toEqual([...SAMPLE_LAYER_GROUP_IDS]);
      // 레이어 엔진 계약: 같은 그룹의 요소는 z 순서에서 연속 구간이어야 패널에 한 블록으로 보인다.
      expect(hasContiguousLayerGroups(page.elements)).toBe(true);
      for (const element of page.elements) {
        expect(SAMPLE_LAYER_GROUP_IDS).toContain(element.groupId);
      }
    }
    expect(SAMPLE_MANUSCRIPT_LAYERS.map((layer) => layer.id))
      .toEqual(["frame", "sketch", "color", "tone", "ink", "letter"]);
    for (const layer of SAMPLE_MANUSCRIPT_LAYERS) {
      expect(layer.summaryKo.length).toBeGreaterThan(0);
      expect(layer.lookKo.length).toBeGreaterThan(0);
      expect(layer.missionKo.length).toBeGreaterThan(0);
      expect(layer.summaryEn.length).toBeGreaterThan(0);
      expect(layer.lookEn.length).toBeGreaterThan(0);
      expect(layer.missionEn.length).toBeGreaterThan(0);
    }
  });

  it("carries real tone, ink and balloon structure on every page", () => {
    for (const page of buildSampleManuscriptPages()) {
      const byGroup = (groupId: string) => page.elements.filter((element) => element.groupId === groupId);

      const tones = byGroup("sample-g-tone");
      expect(tones.length).toBeGreaterThanOrEqual(3);
      expect(tones.every((element) => element.type === "draw"
        && element.pattern?.patternId === "dots")).toBe(true);

      const letters = byGroup("sample-g-letter");
      const bubbles = letters.filter((element) => element.type === "bubble");
      expect(bubbles.length).toBeGreaterThanOrEqual(1);
      expect(bubbles.every((element) => element.type === "bubble" && element.text.trim().length > 0)).toBe(true);

      // 밑그림은 완성 선화와 구분되게 연하게 깔린다.
      expect(byGroup("sample-g-sketch").every((element) => (element.opacity ?? 1) < 1)).toBe(true);
      expect(byGroup("sample-g-ink").length).toBeGreaterThanOrEqual(8);
      expect(byGroup("sample-g-color").length).toBeGreaterThanOrEqual(5);
    }
  });

  it("keeps every element inside the 720x1200 page", () => {
    for (const page of buildSampleManuscriptPages()) {
      for (const element of page.elements) {
        if (element.type === "draw") {
          for (let i = 0; i + 1 < element.points.length; i += 2) {
            expect(element.points[i]).toBeGreaterThanOrEqual(0);
            expect(element.points[i]).toBeLessThanOrEqual(720);
            expect(element.points[i + 1]).toBeGreaterThanOrEqual(0);
            expect(element.points[i + 1]).toBeLessThanOrEqual(1200);
          }
        } else {
          expect(element.x).toBeGreaterThanOrEqual(0);
          expect(element.y).toBeGreaterThanOrEqual(0);
          if ("width" in element) {
            expect(element.x + element.width).toBeLessThanOrEqual(720);
          }
          if ("height" in element) {
            expect(element.y + element.height).toBeLessThanOrEqual(1200);
          }
        }
      }
    }
  });
});
