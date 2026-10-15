// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MeProfile } from "@/platform/me-client";
import {
  creatorSpecialtyDefinition,
  creatorText,
  normalizeCreatorRoleProfile,
  normalizePublicCreatorRoleProfile,
  publicCreatorRoleProfile,
} from "@/shared/lib/creator-role-contract";
import {
  normalizeCreatorRoleWorkspacePreference,
  type PublicCreatorRoleCandidate,
} from "@/shared/lib/creator-role-workspace-contract";

import { StudioRolePersonalizationCenter } from "./StudioRolePersonalizationCenter";

const mocks = vi.hoisted(() => ({
  getMyProfile: vi.fn(),
  searchPublicCreatorRoles: vi.fn(),
  useCreatorRoleWorkspace: vi.fn(),
}));

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({ status: "authenticated" }),
}));
vi.mock("@/platform/me-client", () => ({
  getMyProfile: mocks.getMyProfile,
  updateMyProfile: vi.fn(),
}));
vi.mock("@/platform/creator-role-workspace-client", () => ({
  batchPublicCreatorRoleProfiles: vi.fn(),
  searchPublicCreatorRoles: mocks.searchPublicCreatorRoles,
}));
vi.mock("@/shared/lib/use-creator-role-workspace", () => ({
  useCreatorRoleWorkspace: mocks.useCreatorRoleWorkspace,
}));
vi.mock("../studio-production/studio-production-workspace", () => ({
  loadStudioProductionWorkspace: vi.fn().mockResolvedValue(null),
}));
vi.mock("../studio-production/studio-production-server-client", () => ({
  loadStudioServerProductionWorkspace: vi.fn(),
}));
vi.mock("../production-hub/production-api", () => ({
  getProductionProjectByWork: vi.fn(),
}));
vi.mock("../studio-team-client", () => ({ getStudioTeam: vi.fn() }));

const me: MeProfile = {
  id: "viewer",
  name: "Viewer",
  image: null,
  avatar: null,
  email: null,
  bio: null,
  regionSettings: null,
  creatorRoleProfile: normalizeCreatorRoleProfile({ primaryRole: "story" }),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMyProfile.mockResolvedValue(me);
  mocks.useCreatorRoleWorkspace.mockReturnValue({
    status: "ready",
    error: null,
    snapshot: {
      document: normalizeCreatorRoleWorkspacePreference({ onboardingComplete: true }),
    },
    save: vi.fn(),
  });
});

async function searchCandidate(candidate: PublicCreatorRoleCandidate) {
  mocks.searchPublicCreatorRoles.mockResolvedValue({ items: [candidate], total: 1 });
  render(
    <MemoryRouter initialEntries={["/studio/projects"]}>
      <StudioRolePersonalizationCenter locale="ko" />
    </MemoryRouter>,
  );
  const summary = await screen.findByText("팀 역할 추천·창작자 찾기");
  fireEvent.click(summary);
  fireEvent.click(screen.getByRole("button", { name: "검색", hidden: true }));
  return screen.findByRole("link", { name: new RegExp(candidate.name), hidden: true });
}

describe("role personalization public creator rendering", () => {
  it.each([
    { specialties: ["dialogue"] },
    { experienceLevel: "professional" },
    { collaborationStatus: "available" },
  ])("retains a roleless candidate with public evidence %j", async (evidence) => {
    const roleProfile = normalizePublicCreatorRoleProfile({
      version: 2,
      primaryRole: null,
      secondaryRoles: [],
      roleAliases: [],
      ...evidence,
    });
    if (!roleProfile) throw new Error("Expected useful public evidence");
    const link = await searchCandidate({ userId: "roleless", name: "Roleless candidate", roleProfile });

    expect(link.getAttribute("href")).toBe("/users/roleless");
    expect(within(link).getByText("Roleless candidate")).toBeTruthy();
    expect(link.textContent).not.toMatch(/null|undefined/);
    expect(roleProfile.primaryRole).toBeNull();
    if (roleProfile.specialties.length > 0) {
      expect(within(link).getByText(creatorText(creatorSpecialtyDefinition("dialogue")!.label, "ko"))).toBeTruthy();
    } else {
      expect(link.textContent).toBe("Roleless candidate");
    }
  });

  it("renders a selected secondary role alias without inventing a primary role", async () => {
    const roleProfile = normalizePublicCreatorRoleProfile({
      version: 2,
      primaryRole: null,
      secondaryRoles: ["story"],
      roleAliases: [{ role: "story", label: "Dialogue specialist" }],
    });
    if (!roleProfile) throw new Error("Expected a public secondary role");
    const link = await searchCandidate({ userId: "secondary", name: "Secondary candidate", roleProfile });

    expect(within(link).getByText("Dialogue specialist")).toBeTruthy();
    expect(roleProfile.primaryRole).toBeNull();
  });

  it.each([
    { customRoleLabel: null, expectedLabel: "Script writer" },
    { customRoleLabel: "Legacy display label", expectedLabel: "Legacy display label" },
  ])("renders a public primary display label: $expectedLabel", async ({ customRoleLabel, expectedLabel }) => {
    const roleProfile = normalizePublicCreatorRoleProfile({
      version: 2,
      primaryRole: "story",
      roleAliases: [{ role: "story", label: "Script writer" }],
    });
    if (!roleProfile) throw new Error("Expected a public primary role");
    const link = await searchCandidate({
      userId: "primary",
      name: "Primary candidate",
      roleProfile,
      customRoleLabel,
    });

    expect(within(link).getByText(expectedLabel)).toBeTruthy();
  });

  it("does not restore hidden roles or aliases while rendering public specialties", async () => {
    const roleProfile = publicCreatorRoleProfile({
      primaryRole: "story",
      secondaryRoles: ["line-art"],
      roleAliases: [{ role: "story", label: "Private alias" }],
      specialties: ["dialogue"],
      experienceLevel: "professional",
      collaborationStatus: "available",
      visibility: { roles: false, specialties: true, experienceLevel: false, collaborationStatus: false },
    });
    if (!roleProfile) throw new Error("Expected public specialties");
    const link = await searchCandidate({
      userId: "specialty",
      name: "Specialty candidate",
      roleProfile,
      customRoleLabel: "Hidden legacy role label",
    });

    expect(within(link).getByText(creatorText(creatorSpecialtyDefinition("dialogue")!.label, "ko"))).toBeTruthy();
    expect(link.textContent).not.toMatch(/Private alias|Hidden legacy role label|professional|available/);
    expect(roleProfile).toMatchObject({
      primaryRole: null,
      secondaryRoles: [],
      roleAliases: [],
      experienceLevel: null,
      collaborationStatus: null,
    });
  });
});

describe("role onboarding privacy step", () => {
  it("keeps accepting consecutive visibility toggles on the last step", async () => {
    // 온보딩이 필요한 상태(전역 온보딩 미완료)로 연다.
    mocks.useCreatorRoleWorkspace.mockReturnValue({
      status: "ready",
      error: null,
      snapshot: { document: normalizeCreatorRoleWorkspacePreference({ onboardingComplete: false }) },
      save: vi.fn(),
    });
    render(
      <MemoryRouter initialEntries={["/studio/projects"]}>
        <StudioRolePersonalizationCenter locale="ko" />
      </MemoryRouter>,
    );
    fireEvent.change(await screen.findByLabelText("전체 직무에서 선택"), { target: { value: "story" } });
    for (let step = 0; step < 3; step += 1) fireEvent.click(screen.getByRole("button", { name: "다음" }));

    // 같은 이름의 공개 범위 스위치가 화면 아래쪽 설정에도 있으므로 온보딩 카드 안에서만 찾는다.
    const onboarding = within(screen.getByRole("button", { name: "내 작업실 만들기" }).closest("section")!);
    // 상태 갱신 함수가 핸들러 종료 뒤에 실행되어도 event.currentTarget 에 기대지 않아야 두 번째 토글부터 끊기지 않는다.
    const toggles = ["직무", "전문 분야", "경력 수준", "협업 가능 상태"].map(
      (name) => onboarding.getByRole("checkbox", { name }) as HTMLInputElement,
    );
    for (const toggle of toggles) fireEvent.click(toggle);
    expect(toggles.map((toggle) => toggle.checked)).toEqual([true, true, true, true]);
    fireEvent.click(toggles[1]!);
    expect(toggles.map((toggle) => toggle.checked)).toEqual([true, false, true, true]);
  });
});
