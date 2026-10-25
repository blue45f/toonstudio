import { describe, expect, it } from "vitest";

import {
  extractDynamicComponentsFromOpenSkpHierarchy,
  inferDynamicComponentsFromSkpSidecar,
  inferWebtoonArchetypeFromSkpMetadata,
} from "./studio-bg3d-skp-dynamic-attributes";

import type { StudioBg3dSkpSidecar } from "./studio-bg3d-skp-sidecar";

describe("studio-bg3d-skp-dynamic-attributes", () => {
  it("extracts SketchUp dynamic_attributes (OnClick) and interactive components from OpenSKP sceneHierarchy", () => {
    const fakeOpenSkpRoot = {
      name: "ROOT",
      definitionName: "ROOT_MODEL",
      layer: "Layer0",
      properties: {},
      children: [
        {
          name: "교실_앞문_미닫이",
          definitionName: "SlidingDoor_Front",
          layer: "복도_미닫이문",
          guid: "guid-front-door",
          properties: {
            onclick: 'ANIMATE("x", 0, 90)',
            _name: "ClassroomFrontDoor",
          },
          children: [],
        },
        {
          name: "교탁_본체",
          definitionName: "Podium_Body",
          layer: "교실_가구",
          guid: "guid-podium",
          properties: {},
          children: [
            {
              name: "교탁_출석부_서랍",
              definitionName: "Podium_Drawer",
              layer: "교탁_서랍",
              guid: "guid-drawer",
              properties: {
                onclick: 'ANIMATEFAST("z", 0, 45)',
              },
              children: [],
            },
          ],
        },
        {
          name: "일반_기둥_정적메시",
          definitionName: "Static_Pillar",
          layer: "구조물",
          guid: "guid-static",
          properties: {},
          children: [],
        },
      ],
    };

    const components = extractDynamicComponentsFromOpenSkpHierarchy(fakeOpenSkpRoot);
    expect(components.length).toBe(2);
    expect(components[0]?.id).toBe("guid-front-door");
    expect(components[0]?.kind).toBe("door-sliding");
    expect(components[0]?.maxRange).toBe(0.9);

    expect(components[1]?.id).toBe("guid-drawer");
    expect(components[1]?.kind).toBe("furniture-drawer");
    expect(components[1]?.maxRange).toBe(0.45);
  });

  it("classifies all 4 canonical webtoon background archetypes from SKP metadata", () => {
    expect(
      inferWebtoonArchetypeFromSkpMetadata({
        title: "로판 황실 대성전 알현실",
        tags: ["황실_외벽", "옥좌_비밀통로", "샹들리에"],
      }),
    ).toBe("fantasy-imperial-palace");

    expect(
      inferWebtoonArchetypeFromSkpMetadata({
        title: "현대 고등학교 교실 세트",
        components: ["교탁_서랍", "학생_사물함", "운동장_창문"],
      }),
    ).toBe("modern-high-school-classroom");

    expect(
      inferWebtoonArchetypeFromSkpMetadata({
        title: "주인공 원룸 자취방",
        tags: ["붙박이_옷장", "베란다_창문", "독서등"],
      }),
    ).toBe("protagonist-studio-apartment");

    expect(
      inferWebtoonArchetypeFromSkpMetadata({
        title: "조선시대 저막 객주 세트",
        components: ["싸리문_대문", "대청_들어열개_들창", "내실_병풍"],
      }),
    ).toBe("joseon-dynasty-tavern");
  });

  it("restores dynamic components and archetype id from StudioBg3dSkpSidecar", () => {
    const sidecar: StudioBg3dSkpSidecar = {
      contentHash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      components: {
        available: true,
        items: ["저막_싸리문_대문", "대청_들어열개_들창", "객주_부엌_찬장_서랍", "마당_장독대"],
        total: 4,
        truncated: false,
      },
      tags: {
        available: true,
        items: ["조선_저막", "창호", "부엌", "소품"],
        total: 4,
        truncated: false,
      },
      scenes: {
        available: true,
        items: ["저막_마당_전경샷", "객주_내실_밀담샷"],
        total: 2,
        truncated: false,
      },
    };

    const result = inferDynamicComponentsFromSkpSidecar(sidecar);
    expect(result.detectedArchetypeId).toBe("joseon-dynasty-tavern");
    expect(result.components.length).toBe(3);
    expect(result.components.map((c) => c.kind)).toEqual([
      "door-double-swing",
      "window-lift-up",
      "furniture-drawer",
    ]);
  });
});
