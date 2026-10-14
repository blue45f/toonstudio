import { describe, expect, it } from "vitest";

import { COLLABORATION_ROLES } from "../../../../../packages/core/src/collaboration";

import {
  COLLABORATION_ROLE_PROCESS_MAP,
  PRODUCTION_DEFAULT_PROCESS_ORDER,
  PRODUCTION_OPTIONAL_PROCESS_STEPS,
  PRODUCTION_PROCESS_LABELS,
  collaborationRoleBilingualLabel,
  collaborationRoleProcessKeys,
  productionOptionalProcessStep,
  productionProcessCollaborationRole,
} from "./production-labels";

describe("스케치·데생/밑색 선택 단계", () => {
  it("두 단계 모두 공정 이름표가 있다", () => {
    expect(PRODUCTION_PROCESS_LABELS["sketch"]).toEqual({ ko: "스케치·데생", en: "Sketch" });
    expect(PRODUCTION_PROCESS_LABELS["undercolor"]).toEqual({ ko: "밑색", en: "Undercolor" });
  });

  it("기본 공정 순서에서 스케치는 콘티와 선화 사이, 밑색은 선화와 채색 사이에 있다", () => {
    const order = PRODUCTION_DEFAULT_PROCESS_ORDER;
    expect(order.indexOf("storyboard")).toBeLessThan(order.indexOf("sketch"));
    expect(order.indexOf("sketch")).toBeLessThan(order.indexOf("line-art"));
    expect(order.indexOf("line-art")).toBeLessThan(order.indexOf("undercolor"));
    expect(order.indexOf("undercolor")).toBeLessThan(order.indexOf("color"));
  });

  it("선택 단계 카탈로그는 두 단계만, 실제 공정 뒤에 붙는 위치로 제공한다", () => {
    expect(PRODUCTION_OPTIONAL_PROCESS_STEPS.map((step) => step.key)).toEqual(["sketch", "undercolor"]);
    for (const step of PRODUCTION_OPTIONAL_PROCESS_STEPS) {
      expect(PRODUCTION_DEFAULT_PROCESS_ORDER).toContain(step.insertAfter);
      expect(PRODUCTION_DEFAULT_PROCESS_ORDER.indexOf(step.insertAfter)).toBeLessThan(
        PRODUCTION_DEFAULT_PROCESS_ORDER.indexOf(step.key),
      );
      expect(step.estimateHours).toBeGreaterThan(0);
    }
    expect(productionOptionalProcessStep("sketch")?.defaultRole).toBe("line-artist");
    expect(productionOptionalProcessStep("undercolor")?.defaultRole).toBe("colorist");
    expect(productionOptionalProcessStep("color")).toBeNull();
  });
});

describe("구인 분야 ↔ 공정 키 정본 매핑", () => {
  it("구인 분야 전수를 빠짐없이 담고, 한국어 이름이 core 분류와 같다", () => {
    expect(Object.keys(COLLABORATION_ROLE_PROCESS_MAP).sort()).toEqual(
      Object.keys(COLLABORATION_ROLES).sort(),
    );
    for (const [role, korean] of Object.entries(COLLABORATION_ROLES)) {
      const mapping =
        COLLABORATION_ROLE_PROCESS_MAP[role as keyof typeof COLLABORATION_ROLE_PROCESS_MAP];
      expect(mapping.label.ko).toBe(korean);
      expect(mapping.label.en.length).toBeGreaterThan(0);
    }
  });

  it("분야가 가리키는 공정 키는 전부 공정 이름표가 있다", () => {
    for (const mapping of Object.values(COLLABORATION_ROLE_PROCESS_MAP)) {
      for (const processKey of mapping.processKeys) {
        expect(PRODUCTION_PROCESS_LABELS[processKey]).toBeDefined();
      }
    }
  });

  it("스케치 분야는 sketch 공정, 밑색 분야는 undercolor 공정으로 이어진다", () => {
    expect(collaborationRoleProcessKeys("sketch")).toEqual(["sketch"]);
    expect(collaborationRoleProcessKeys("flat")).toEqual(["undercolor"]);
    expect(collaborationRoleProcessKeys("ink")).toEqual(["line-art"]);
    expect(collaborationRoleProcessKeys("story")).toEqual(["story-lock", "storyboard"]);
    expect(productionProcessCollaborationRole("sketch")).toBe("sketch");
    expect(productionProcessCollaborationRole("undercolor")).toBe("flat");
    expect(productionProcessCollaborationRole("publication")).toBeNull();
  });

  it("대응 공정이 없는 분야는 빈 목록으로 명시하고, 모르는 분야는 이름표가 없다", () => {
    expect(collaborationRoleProcessKeys("model3d")).toEqual([]);
    expect(collaborationRoleProcessKeys("animation")).toEqual([]);
    expect(collaborationRoleProcessKeys("unknown-role")).toEqual([]);
    expect(collaborationRoleBilingualLabel("sketch")).toEqual({
      ko: "러프·스케치",
      en: "Roughs · sketches",
    });
    expect(collaborationRoleBilingualLabel("unknown-role")).toBeNull();
  });
});
