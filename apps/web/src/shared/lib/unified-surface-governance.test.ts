import { describe, expect, it } from "vitest";

import {
  ADMIN_FOUR_DOMAIN_GROUPS,
  resolveProjectWorkspaceTabs,
  resolveResearchPinboardFilter,
} from "./unified-surface-governance";

describe("unified-surface-governance (AC-020)", () => {
  it("28개 레거시 /research/* 경로를 5대 통합 핀보드 필터 쿼리로 무손실 투영한다", () => {
    const arch = resolveResearchPinboardFilter("/research/smithsonian-3d/");
    expect(arch.category).toBe("architecture-3d");
    expect(arch.canonicalHref).toBe("/research?category=architecture-3d&source=smithsonian-3d");

    const cc0 = resolveResearchPinboardFilter("/research/wikimedia-cc0");
    expect(cc0.category).toBe("cc0-commercial");

    const costume = resolveResearchPinboardFilter("/research/hanbok-archive");
    expect(costume.category).toBe("costume-props");
  });

  it("프로젝트 워크스페이스는 1인 6탭, 팀원 합류 시 8탭(일정·칸반 포함)으로 점진 확장한다", () => {
    expect(resolveProjectWorkspaceTabs(1)).toHaveLength(6);
    const teamTabs = resolveProjectWorkspaceTabs(3);
    expect(teamTabs).toHaveLength(8);
    expect(teamTabs.some((t) => t.id === "kanban")).toBe(true);
  });

  it("Admin 16개 운영 탭을 정확히 4대 아코디언 그룹으로 구조화한다", () => {
    expect(ADMIN_FOUR_DOMAIN_GROUPS).toHaveLength(4);
    const totalTabs = ADMIN_FOUR_DOMAIN_GROUPS.reduce((sum, g) => sum + g.tabKeys.length, 0);
    expect(totalTabs).toBe(16);
  });
});
