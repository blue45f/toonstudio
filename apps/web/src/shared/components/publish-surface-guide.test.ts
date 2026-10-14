import { describe, expect, it } from "vitest";

import { PUBLISH_SURFACE_ROLES } from "./publish-surface-guide";

/**
 * S1-6 게시 2표면 역할 고정 계약 (BLUEPRINT §1.2).
 * 판정: 두 표면에 역할 한 줄과 상호 링크 표시 — 그 선언의 단일 출처인
 * PUBLISH_SURFACE_ROLES가 정본 1개·상호 대칭·실제 라우트 경로를 지키는지 고정한다.
 */
describe("publish surface roles (S1-6)", () => {
  it("declares /studio/publish as the only canonical publish surface", () => {
    const canonical = Object.values(PUBLISH_SURFACE_ROLES).filter((role) => role.canonical);
    expect(canonical).toHaveLength(1);
    expect(PUBLISH_SURFACE_ROLES.studio.canonical).toBe(true);
    expect(PUBLISH_SURFACE_ROLES.studio.href).toBe("/studio/publish");
  });

  it("fixes /publish as the serialization operations view, not a second canonical", () => {
    expect(PUBLISH_SURFACE_ROLES.serial.canonical).toBe(false);
    expect(PUBLISH_SURFACE_ROLES.serial.href).toBe("/publish");
  });

  it("cross-links the two surfaces symmetrically", () => {
    for (const role of Object.values(PUBLISH_SURFACE_ROLES)) {
      const counterpart = PUBLISH_SURFACE_ROLES[role.counterpart];
      expect(counterpart.counterpart).not.toBe(role.counterpart);
      expect(counterpart.href).not.toBe(role.href);
    }
    expect(PUBLISH_SURFACE_ROLES.studio.counterpart).toBe("serial");
    expect(PUBLISH_SURFACE_ROLES.serial.counterpart).toBe("studio");
    // 상호 링크 도착지는 상대 표면의 자기 경로와 일치해야 한다.
    expect(PUBLISH_SURFACE_ROLES[PUBLISH_SURFACE_ROLES.studio.counterpart].href).toBe("/publish");
    expect(PUBLISH_SURFACE_ROLES[PUBLISH_SURFACE_ROLES.serial.counterpart].href).toBe("/studio/publish");
  });
});
