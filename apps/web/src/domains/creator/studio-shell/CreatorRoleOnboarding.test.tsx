// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CreatorRoleOnboarding } from "./CreatorRoleOnboarding";

import type { MeProfile } from "@/platform/me-client";
import {
  CREATOR_ROLE_PROFILE_VERSION,
  normalizeCreatorRoleProfile,
  type CreatorRoleLocale,
} from "@/shared/lib/creator-role-contract";

const { updateMyProfile } = vi.hoisted(() => ({
  updateMyProfile: vi.fn(),
}));

vi.mock("@/platform/me-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/platform/me-client")>();
  return { ...actual, updateMyProfile };
});

const initialProfile: MeProfile = {
  id: "creator-me",
  name: "창작자",
  image: null,
  avatar: null,
  email: "creator@example.com",
  bio: null,
  regionSettings: null,
  creatorRoleProfile: normalizeCreatorRoleProfile(null),
};

function Harness({ onDismiss, locale = "ko" }: { readonly onDismiss: () => void; readonly locale?: CreatorRoleLocale }) {
  const [profile, setProfile] = useState(initialProfile);
  return (
    <>
      <CreatorRoleOnboarding
        profile={profile}
        locale={locale}
        onProfileChange={setProfile}
        onDismiss={onDismiss}
      />
      <output data-testid="role-profile-state">
        {JSON.stringify(profile.creatorRoleProfile)}
      </output>
    </>
  );
}

function readRoleProfile() {
  return JSON.parse(
    screen.getByTestId("role-profile-state").textContent ?? "{}",
  ) as MeProfile["creatorRoleProfile"];
}

afterEach(() => {
  cleanup();
  updateMyProfile.mockReset();
});

describe("CreatorRoleOnboarding", () => {
  it("persists resumable steps and completes with private-by-default visibility", async () => {
    const onDismiss = vi.fn();
    updateMyProfile.mockImplementation(async ({ creatorRoleProfile }) => ({
      ...initialProfile,
      creatorRoleProfile,
    }));
    render(<Harness onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole("button", { name: /글작가/ }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    await screen.findByText("어떤 작업에 강점이 있나요?");
    expect(readRoleProfile().onboarding).toMatchObject({
      status: "in-progress",
      step: 2,
    });

    fireEvent.click(screen.getByRole("button", { name: "대사" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    await screen.findByText("툰스튜디오를 어디에 사용할까요?");
    fireEvent.click(screen.getByRole("button", { name: /팀 프로젝트 참여/ }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    await screen.findByText("공개할 정보만 선택하세요");

    expect((screen.getByRole("checkbox", {
      name: "대표·보조 직무",
    }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "내 작업공간 시작" }));

    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
    expect(readRoleProfile()).toMatchObject({
      version: CREATOR_ROLE_PROFILE_VERSION,
      primaryRole: "story",
      specialties: ["dialogue"],
      usagePurposes: ["team-production"],
      visibility: {
        roles: false,
        specialties: false,
        experienceLevel: false,
        collaborationStatus: false,
      },
      onboarding: {
        status: "completed",
        step: 4,
        completedAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    });
    expect(updateMyProfile).toHaveBeenCalledTimes(4);
  });

  it("직군 선택은 추천 환경만 미리 보여 주고 프로필을 저장하지 않는다", () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole("button", { name: "전문 어시스턴트" }));
    fireEvent.click(screen.getByRole("button", { name: /선화·펜터치 어시스턴트/ }));

    const preview = screen.getByTestId("onboarding-role-environment-preview");
    expect(preview.textContent).toContain("선화 클린업·잔선 제거·펜터치 보조 도구를 위한 작업공간을 추천합니다.");
    expect(preview.textContent).toContain("Clip Studio Paint");
    const rbacPreview = screen.getByTestId("onboarding-role-rbac-preview");
    expect(rbacPreview.textContent).toContain("직무별 작업분담 미리보기");
    expect(rbacPreview.textContent).toContain("담당 그룹 예시 1개");
    expect(rbacPreview.textContent).toContain("실제 편집 권한과 레이어 잠금은 프로젝트의 팀 설정에서 확인하세요");
    expect(rbacPreview.textContent).not.toContain("자동 잠금");
    expect(rbacPreview.textContent).not.toContain("편집 권한 레이어");
    expect(readRoleProfile().primaryRole).toBeNull();
    expect(updateMyProfile).not.toHaveBeenCalled();
  });

  it("영문 직무 미리보기도 작업 계획과 실제 프로젝트 권한을 구분한다", () => {
    render(<Harness locale="en" onDismiss={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox", { name: /Choose from all roles/u }), {
      target: { value: "line-assistant" },
    });
    const preview = screen.getByTestId("onboarding-role-environment-preview");
    expect(preview.textContent).toContain("Role work plan preview");
    expect(preview.textContent).toContain("1 suggested group");
    expect(preview.textContent).toContain("team settings for actual edit permissions and layer locks");
    expect(preview.textContent).toContain("Lead artwork protection planning");
    expect(preview.textContent).not.toMatch(/[가-힣]/u);
    expect(updateMyProfile).not.toHaveBeenCalled();
  });
});
