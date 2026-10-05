import { describe, expect, it } from "vitest";
import type { TeamWorkspaceSummary } from "@toonstudio/contracts/production-workspace";

import { createLocalOrganizationDirectory, type OrganizationStorage } from "./organization-directory";
import {
  createOrganizationProfile,
  organizationRoleCan,
  organizationStorageKey,
  parseLocalOrganizationState,
  summarizeOrganizationRollup,
  toggleLinkedWorkspace,
  type LocalOrganizationState,
} from "./organization-model";

function fakeStorage(): OrganizationStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
  };
}

function workspace(id: string, overrides: Partial<TeamWorkspaceSummary> = {}): TeamWorkspaceSummary {
  return {
    id,
    name: `팀 ${id}`,
    ownerUserId: "owner",
    revision: 1,
    role: "owner",
    createdAt: "2026-10-06T00:00:00Z",
    projectCount: 0,
    memberCount: 0,
    pendingInvites: 0,
    ...overrides,
  };
}

describe("organization local state", () => {
  it("round-trips through the local directory under an owner-scoped key", () => {
    const storage = fakeStorage();
    const directory = createLocalOrganizationDirectory(storage);
    const profile = createOrganizationProfile(
      { name: "희준 스튜디오", kind: "studio", description: "웹툰 제작" },
      "owner",
      new Date("2026-10-06T00:00:00Z"),
      "org-1",
    );
    const state: LocalOrganizationState = {
      profile,
      linkedWorkspaceIds: ["team-a"],
      notices: [{ id: "n-1", body: "금주 휴재", createdAt: "2026-10-06T00:00:00Z" }],
    };
    directory.save("owner", state);
    expect([...storage.map.keys()]).toEqual([organizationStorageKey("owner")]);
    expect(directory.load("owner")).toEqual(state);
    // 다른 소유자에게는 보이지 않는다.
    expect(directory.load("someone-else").profile).toBeNull();
  });

  it("falls back to an empty state for broken or foreign payloads", () => {
    expect(parseLocalOrganizationState("{broken", "owner").profile).toBeNull();
    const foreign = JSON.stringify({
      profile: { id: "org-1", name: "남의 조직", ownerUserId: "other" },
      linkedWorkspaceIds: [],
      notices: [],
    });
    expect(parseLocalOrganizationState(foreign, "owner").profile).toBeNull();
    const brokenNotice = JSON.stringify({
      profile: null,
      linkedWorkspaceIds: ["team-a", "team-a", 42],
      notices: [{ id: "", body: "" }, { id: "n-1", body: "공지" }],
    });
    const parsed = parseLocalOrganizationState(brokenNotice, "owner");
    expect(parsed.linkedWorkspaceIds).toEqual(["team-a"]);
    expect(parsed.notices).toHaveLength(1);
  });

  it("toggles workspace links without mutating the original state", () => {
    const base: LocalOrganizationState = { profile: null, linkedWorkspaceIds: ["team-a"], notices: [] };
    const added = toggleLinkedWorkspace(base, "team-b", true);
    expect(added.linkedWorkspaceIds).toEqual(["team-a", "team-b"]);
    expect(base.linkedWorkspaceIds).toEqual(["team-a"]);
    expect(toggleLinkedWorkspace(added, "team-a", false).linkedWorkspaceIds).toEqual(["team-b"]);
    expect(toggleLinkedWorkspace(base, "team-a", true)).toBe(base);
  });
});

describe("organization rollup", () => {
  it("sums only linked teams from server counters and reports missing links", () => {
    const rollup = summarizeOrganizationRollup(
      [
        workspace("team-a", { projectCount: 3, memberCount: 4, pendingInvites: 1 }),
        workspace("team-b", { projectCount: 2, memberCount: 5, pendingInvites: 0 }),
        workspace("team-c", { projectCount: 9, memberCount: 9, pendingInvites: 9 }),
      ],
      ["team-a", "team-b", "team-gone"],
    );
    expect(rollup.teams.map((team) => team.id)).toEqual(["team-a", "team-b"]);
    expect(rollup.projectCount).toBe(5);
    expect(rollup.memberSlotCount).toBe(9);
    expect(rollup.pendingInvites).toBe(1);
    expect(rollup.missingCount).toBe(1);
  });
});

describe("organization role matrix", () => {
  it("keeps resource access out of organization roles", () => {
    expect(organizationRoleCan("owner", "edit-profile")).toBe(true);
    expect(organizationRoleCan("admin", "manage-links")).toBe(true);
    expect(organizationRoleCan("manager", "post-notice")).toBe(true);
    expect(organizationRoleCan("manager", "edit-profile")).toBe(false);
    expect(organizationRoleCan("member", "view-rollup")).toBe(true);
    expect(organizationRoleCan("member", "post-notice")).toBe(false);
    expect(organizationRoleCan("guest", "view-rollup")).toBe(false);
  });
});
