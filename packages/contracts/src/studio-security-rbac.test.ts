import { describe, expect, it } from "vitest";

import {
  SECURITY_ROLE_CATALOG,
  canAssignTargetRole,
  evaluateSecurityPermission,
  type RoleAssignmentRecord,
} from "./studio-security-rbac";

describe("studio-security-rbac", () => {
  it("12개 보안 역할 카탈로그와 최소 권한·워터마크 정책을 적용한다", () => {
    expect(SECURITY_ROLE_CATALOG.length).toBe(12);

    const lineAssistant: RoleAssignmentRecord = {
      userId: "u-line",
      displayName: "선화 어시",
      roleId: "line_assistant",
      scopeType: "work",
      scopeId: "work-1",
    };

    const writeAssigned = evaluateSecurityPermission(lineAssistant, "manuscript:write_assigned_layer");
    const exportRaw = evaluateSecurityPermission(lineAssistant, "manuscript:export_raw");
    const manageRoles = evaluateSecurityPermission(lineAssistant, "rbac:manage_roles");

    expect(writeAssigned.allowed).toBe(true);
    expect(writeAssigned.enforceWatermark).toBe(true);
    expect(exportRaw.allowed).toBe(false);
    expect(manageRoles.allowed).toBe(false);
  });

  it("허용 IP 목록과 역할 계층 위임 제한을 강제한다", () => {
    const pd: RoleAssignmentRecord = {
      userId: "u-pd",
      displayName: "총괄 PD",
      roleId: "executive_pd",
      scopeType: "studio",
      scopeId: "studio-1",
      allowedIpCidrs: ["10.0.0.5"],
    };

    expect(evaluateSecurityPermission(pd, "rbac:manage_roles", "10.0.0.5").allowed).toBe(true);
    expect(evaluateSecurityPermission(pd, "rbac:manage_roles", "203.0.113.9").allowed).toBe(false);
    expect(canAssignTargetRole("executive_pd", "line_assistant")).toBe(true);
    expect(canAssignTargetRole("executive_pd", "studio_owner")).toBe(false);
  });
});
