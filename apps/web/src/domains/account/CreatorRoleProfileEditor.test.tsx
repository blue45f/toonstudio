// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CreatorRoleProfileEditor } from "./CreatorRoleProfileEditor";

import {
  EMPTY_CREATOR_ROLE_PROFILE,
  type CreatorRoleProfile,
} from "@/shared/lib/creator-role-contract";
import { useI18n } from "@/shared/lib/i18n";

function EditorHarness() {
  const [profile, setProfile] = useState<CreatorRoleProfile>(() => ({
    ...EMPTY_CREATOR_ROLE_PROFILE,
    secondaryRoles: [],
    specialties: [],
  }));
  return (
    <>
      <CreatorRoleProfileEditor value={profile} onChange={setProfile} />
      <output data-testid="role-profile-state">{JSON.stringify(profile)}</output>
    </>
  );
}

function readProfile(): CreatorRoleProfile {
  return JSON.parse(screen.getByTestId("role-profile-state").textContent ?? "{}") as CreatorRoleProfile;
}

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(cleanup);

describe("CreatorRoleProfileEditor", () => {
  it("대표·보조 직무와 전문 분야, 작업 모드, 공개 여부를 함께 편집한다", () => {
    render(<EditorHarness />);

    fireEvent.change(screen.getByLabelText(/현재 활동 단계/), {
      target: { value: "professional" },
    });
    fireEvent.click(within(screen.getByRole("group", { name: "대표 직무" }))
      .getByRole("button", { name: /글작가/ }));
    expect(readProfile()).toMatchObject({
      primaryRole: "story",
      activeRole: "story",
      secondaryRoles: [],
    });

    fireEvent.click(within(screen.getByRole("group", { name: "보조 직무" }))
      .getByRole("button", { name: "어시" }));
    fireEvent.click(within(screen.getByRole("group", { name: "전문 분야" }))
      .getByRole("button", { name: "대사" }));
    fireEvent.change(screen.getByLabelText("현재 작업 모드"), {
      target: { value: "assistant" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /공개 프로필에 직무와 전문 분야 표시/ }));

    expect(readProfile()).toMatchObject({
      creatorStage: "professional",
      primaryRole: "story",
      secondaryRoles: ["assistant"],
      specialties: ["dialogue"],
      activeRole: "assistant",
      roleVisibility: false,
    });
  });

  it("직군 카테고리 필터 탭을 통해 세분화 어시스턴트·보조 글작가·각색 작가를 선택할 수 있다", () => {
    render(<EditorHarness />);

    fireEvent.click(screen.getByRole("button", { name: "글·각색·기획" }));
    fireEvent.click(within(screen.getByRole("group", { name: "대표 직무" }))
      .getByRole("button", { name: /보조 글작가·자료조사/ }));
    expect(readProfile()).toMatchObject({
      primaryRole: "associate-writer",
      activeRole: "associate-writer",
    });

    fireEvent.click(screen.getByRole("button", { name: "전문 어시스턴트" }));
    fireEvent.click(within(screen.getByRole("group", { name: "대표 직무" }))
      .getByRole("button", { name: /선화·펜터치 어시스턴트/ }));
    expect(readProfile()).toMatchObject({
      primaryRole: "line-assistant",
      activeRole: "line-assistant",
    });
  });
});
