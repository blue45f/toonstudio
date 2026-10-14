import { describe, expect, it } from "vitest";

import {
  ORGANIZATION_FREE_POLICY,
  ORGANIZATION_ROLE_MATRIX,
  isOrganizationManager,
  organizationRoleCan,
  type OrganizationRole,
} from "./production-organization";

describe("organization role matrix (server contract source of truth)", () => {
  it("covers exactly the five organization roles", () => {
    expect(ORGANIZATION_ROLE_MATRIX.map((row) => row.role)).toEqual(["owner", "admin", "manager", "member", "guest"]);
  });

  it("keeps resource access out of organization roles", () => {
    const expectations: ReadonlyArray<readonly [OrganizationRole, boolean, boolean, boolean, boolean]> = [
      // role, edit-profile, manage-links, post-notice, view-rollup
      ["owner", true, true, true, true],
      ["admin", true, true, true, true],
      ["manager", false, false, true, true],
      ["member", false, false, false, true],
      ["guest", false, false, false, false],
    ];
    for (const [role, edit, links, notice, rollup] of expectations) {
      expect(organizationRoleCan(role, "edit-profile")).toBe(edit);
      expect(organizationRoleCan(role, "manage-links")).toBe(links);
      expect(organizationRoleCan(role, "post-notice")).toBe(notice);
      expect(organizationRoleCan(role, "view-rollup")).toBe(rollup);
    }
  });

  it("limits member management to owner and admin", () => {
    expect(isOrganizationManager("owner")).toBe(true);
    expect(isOrganizationManager("admin")).toBe(true);
    expect(isOrganizationManager("manager")).toBe(false);
    expect(isOrganizationManager("member")).toBe(false);
    expect(isOrganizationManager("guest")).toBe(false);
  });

  it("freezes a bounded free policy so invites cannot grow membership without limit", () => {
    expect(ORGANIZATION_FREE_POLICY.ownedOrganizations).toBeGreaterThan(0);
    expect(ORGANIZATION_FREE_POLICY.membersPerOrganization).toBeGreaterThan(0);
    expect(ORGANIZATION_FREE_POLICY.linkedWorkspacesPerOrganization).toBeGreaterThan(0);
    expect(Object.isFrozen(ORGANIZATION_FREE_POLICY)).toBe(true);
  });
});
