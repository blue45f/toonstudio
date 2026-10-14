import { describe, expect, it } from "vitest";

import {
  SHARED_LIBRARY_FREE_POLICY,
  canManageSharedLibraryItem,
  canPublishToSharedLibraryScope,
  canViewSharedLibraryItem,
  resolveVisibleSharedLibraryItems,
  sharedLibraryPlacementErrors,
  type SharedLibraryItem,
  type SharedLibraryPlacement,
  type SharedLibraryViewerContext,
} from "./production-shared-library";

function item(
  id: string,
  kind: SharedLibraryItem["kind"],
  placement: Partial<SharedLibraryPlacement> & Pick<SharedLibraryPlacement, "scope">,
): SharedLibraryItem {
  return {
    id,
    kind,
    title: id,
    placement: {
      ownerUserId: "owner-1",
      workId: null,
      workspaceId: null,
      organizationId: null,
      ...placement,
    },
    revision: 1,
    updatedAt: "2026-10-14T00:00:00.000Z",
  };
}

function context(overrides: Partial<SharedLibraryViewerContext> = {}): SharedLibraryViewerContext {
  return {
    userId: "viewer-1",
    workId: "work-a",
    workspaceId: "team-1",
    teamRole: "member",
    organizationRoles: {},
    organizationLinkedWorkspaces: {},
    ...overrides,
  };
}

const teamBrush = item("brush-standard", "brush", { scope: "team", workspaceId: "team-1" });
const orgTemplate = item("tpl-standard", "template", {
  scope: "organization",
  organizationId: "org-1",
});

describe("shared library placement invariants", () => {
  it("requires the identifier each scope needs and rejects foreign ones", () => {
    expect(sharedLibraryPlacementErrors(teamBrush.placement)).toEqual([]);
    expect(sharedLibraryPlacementErrors(orgTemplate.placement)).toEqual([]);
    expect(sharedLibraryPlacementErrors(item("x", "asset", { scope: "team" }).placement)).toContain(
      "workspace-required",
    );
    expect(
      sharedLibraryPlacementErrors(
        item("x", "asset", { scope: "organization", workspaceId: "team-1" }).placement,
      ),
    ).toContain("organization-required");
    expect(
      sharedLibraryPlacementErrors(item("x", "asset", { scope: "personal", workId: "work-a" }).placement),
    ).toContain("work-not-allowed");
  });

  it("hides items whose placement is invalid instead of widening access", () => {
    const broken = item("broken", "asset", { scope: "team" });
    expect(canViewSharedLibraryItem(broken, context())).toBe(false);
  });
});

describe("team scope visibility (판정: 팀 공유는 같은 팀 작품에서 바로 보인다)", () => {
  it("shows a team brush in another work of the same team", () => {
    expect(canViewSharedLibraryItem(teamBrush, context({ workId: "work-b" }))).toBe(true);
  });

  it("hides a team brush from other teams and from team-less contexts", () => {
    expect(
      canViewSharedLibraryItem(teamBrush, context({ workspaceId: "team-2", workId: "work-c" })),
    ).toBe(false);
    expect(
      canViewSharedLibraryItem(
        teamBrush,
        context({ workspaceId: null, workId: null, teamRole: null }),
      ),
    ).toBe(false);
  });

  it("lets team guests read but not publish", () => {
    expect(canViewSharedLibraryItem(teamBrush, context({ teamRole: "guest" }))).toBe(true);
    expect(canPublishToSharedLibraryScope("team", context({ teamRole: "guest" }))).toBe(false);
    expect(canPublishToSharedLibraryScope("team", context({ teamRole: "member" }))).toBe(true);
    expect(canPublishToSharedLibraryScope("team", context({ teamRole: "owner" }))).toBe(true);
  });
});

describe("organization scope propagation (판정: 조직 공유는 연결 팀 전체로 전파)", () => {
  const linked = { organizationLinkedWorkspaces: { "org-1": ["team-1", "team-2"] } };

  it("reaches every linked team, even viewers who are not organization members", () => {
    expect(canViewSharedLibraryItem(orgTemplate, context(linked))).toBe(true);
    expect(
      canViewSharedLibraryItem(orgTemplate, context({ ...linked, workspaceId: "team-2", workId: "work-z" })),
    ).toBe(true);
  });

  it("does not reach unlinked teams, and stops when the link is removed", () => {
    expect(
      canViewSharedLibraryItem(orgTemplate, context({ ...linked, workspaceId: "team-9" })),
    ).toBe(false);
    expect(
      canViewSharedLibraryItem(
        orgTemplate,
        context({ organizationLinkedWorkspaces: { "org-1": ["team-2"] } }),
      ),
    ).toBe(false);
  });

  it("shows organization items to non-guest organization members anywhere", () => {
    expect(
      canViewSharedLibraryItem(
        orgTemplate,
        context({ organizationRoles: { "org-1": "member" }, workspaceId: "team-9" }),
      ),
    ).toBe(true);
    expect(
      canViewSharedLibraryItem(
        orgTemplate,
        context({ organizationRoles: { "org-1": "guest" }, workspaceId: "team-9" }),
      ),
    ).toBe(false);
  });

  it("limits organization publishing to owner/admin/manager", () => {
    const target = { organizationId: "org-1" };
    expect(
      canPublishToSharedLibraryScope("organization", context({ organizationRoles: { "org-1": "manager" } }), target),
    ).toBe(true);
    expect(
      canPublishToSharedLibraryScope("organization", context({ organizationRoles: { "org-1": "member" } }), target),
    ).toBe(false);
    expect(canPublishToSharedLibraryScope("organization", context(), target)).toBe(false);
  });
});

describe("existing scopes stay intact", () => {
  it("keeps personal items owner-only and work items in their work", () => {
    const mine = item("mine", "asset", { scope: "personal", ownerUserId: "viewer-1" });
    const others = item("others", "asset", { scope: "personal" });
    const workOnly = item("work-only", "template", { scope: "work", workId: "work-a" });
    expect(canViewSharedLibraryItem(mine, context())).toBe(true);
    expect(canViewSharedLibraryItem(others, context())).toBe(false);
    expect(canViewSharedLibraryItem(workOnly, context())).toBe(true);
    expect(canViewSharedLibraryItem(workOnly, context({ workId: "work-b" }))).toBe(false);
    expect(canViewSharedLibraryItem(item("pub", "asset", { scope: "market" }), context())).toBe(true);
    expect(canPublishToSharedLibraryScope("market", context())).toBe(false);
  });

  it("lets owners manage their items and scope managers manage shared ones", () => {
    expect(canManageSharedLibraryItem(teamBrush, context({ userId: "owner-1" }))).toBe(true);
    expect(canManageSharedLibraryItem(teamBrush, context({ teamRole: "admin" }))).toBe(true);
    expect(canManageSharedLibraryItem(teamBrush, context({ teamRole: "member" }))).toBe(false);
    expect(
      canManageSharedLibraryItem(orgTemplate, context({ organizationRoles: { "org-1": "admin" } })),
    ).toBe(true);
    expect(
      canManageSharedLibraryItem(orgTemplate, context({ organizationRoles: { "org-1": "manager" } })),
    ).toBe(false);
  });
});

describe("resolveVisibleSharedLibraryItems", () => {
  it("filters to the visible set and orders studio standards first, deterministically", () => {
    const items = [
      item("b-personal", "asset", { scope: "personal", ownerUserId: "viewer-1" }),
      teamBrush,
      orgTemplate,
      item("a-hidden", "asset", { scope: "team", workspaceId: "team-2" }),
    ];
    const ctx = context({ organizationLinkedWorkspaces: { "org-1": ["team-1"] } });
    const forward = resolveVisibleSharedLibraryItems(items, ctx).map((entry) => entry.id);
    const reversed = resolveVisibleSharedLibraryItems([...items].reverse(), ctx).map(
      (entry) => entry.id,
    );
    expect(forward).toEqual(["tpl-standard", "brush-standard", "b-personal"]);
    expect(reversed).toEqual(forward);
  });

  it("freezes a bounded free policy", () => {
    expect(SHARED_LIBRARY_FREE_POLICY.teamItemsPerWorkspace).toBeGreaterThan(0);
    expect(SHARED_LIBRARY_FREE_POLICY.organizationItemsPerOrganization).toBeGreaterThan(0);
    expect(Object.isFrozen(SHARED_LIBRARY_FREE_POLICY)).toBe(true);
  });
});
