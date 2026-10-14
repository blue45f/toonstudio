import { describe, expect, it } from "vitest";

import { PRODUCTION_SURFACE_ROLES } from "./production-surface-guide";

/**
 * 협업 제작 표면 정본 안내 계약 (pipeline 후보 9).
 * 판정: 두 표면 상단에 관계 한 줄 + 상호 링크 — 그 선언의 단일 출처인
 * PRODUCTION_SURFACE_ROLES가 정본 1개·상호 대칭·실제 라우트 경로를
 * 지키는지 고정한다.
 */
describe("production surface roles (collaboration convergence)", () => {
  it("declares the production hub as the only canonical collaboration production surface", () => {
    const canonical = Object.values(PRODUCTION_SURFACE_ROLES).filter((role) => role.canonical);
    expect(canonical).toHaveLength(1);
    expect(PRODUCTION_SURFACE_ROLES.hub.canonical).toBe(true);
    expect(PRODUCTION_SURFACE_ROLES.hub.href).toBe("/production");
  });

  it("fixes studio production as the editor-side collaboration view, not a second canonical", () => {
    expect(PRODUCTION_SURFACE_ROLES.studio.canonical).toBe(false);
    expect(PRODUCTION_SURFACE_ROLES.studio.href).toBe("/studio/projects");
  });

  it("cross-links the two surfaces symmetrically", () => {
    for (const role of Object.values(PRODUCTION_SURFACE_ROLES)) {
      const counterpart = PRODUCTION_SURFACE_ROLES[role.counterpart];
      expect(counterpart.counterpart).not.toBe(role.counterpart);
      expect(counterpart.href).not.toBe(role.href);
    }
    expect(PRODUCTION_SURFACE_ROLES.hub.counterpart).toBe("studio");
    expect(PRODUCTION_SURFACE_ROLES.studio.counterpart).toBe("hub");
    // 상호 링크 도착지는 상대 표면의 자기 경로와 일치해야 한다.
    expect(PRODUCTION_SURFACE_ROLES[PRODUCTION_SURFACE_ROLES.hub.counterpart].href).toBe("/studio/projects");
    expect(PRODUCTION_SURFACE_ROLES[PRODUCTION_SURFACE_ROLES.studio.counterpart].href).toBe("/production");
  });
});
