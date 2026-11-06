// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  STUDIO_VIRTUAL_SPACE_AVATAR_STORAGE_KEY,
  STUDIO_VIRTUAL_SPACE_ENTRY_STORAGE_KEY,
  STUDIO_VIRTUAL_SPACE_NICKNAME_STORAGE_KEY,
  STUDIO_VIRTUAL_SPACE_TOUR_STORAGE_KEY,
  normalizeStudioVirtualSpaceNickname,
  readStudioVirtualSpaceAvatarIndex,
  readStudioVirtualSpaceEntryPreference,
  readStudioVirtualSpaceTourSeen,
  studioVirtualSpaceNicknameFromAccount,
  validStudioVirtualSpaceAvatarIndex,
  validStudioVirtualSpaceStoredAvatarIndex,
  writeStudioVirtualSpaceAvatarIndex,
  writeStudioVirtualSpaceEntryPreference,
  writeStudioVirtualSpaceTourSeen,
} from "./studio-virtual-space-entry-preference";
import { STUDIO_VIRTUAL_SPACE_AUTO_AVATAR } from "./studio-virtual-space-model";

beforeEach(() => localStorage.clear());

describe("virtual space entry preference", () => {
  it("requires a first-entry confirmation without inventing a stored choice", () => {
    expect(readStudioVirtualSpaceEntryPreference()).toEqual({ avatarIndex: -1, confirmed: false, nickname: "" });
  });

  it("persists an explicitly selected character or automatic avatar (-1) with a versioned record", () => {
    expect(validStudioVirtualSpaceAvatarIndex(2)).toBe(true);
    expect(validStudioVirtualSpaceAvatarIndex(STUDIO_VIRTUAL_SPACE_AUTO_AVATAR)).toBe(false);
    expect(validStudioVirtualSpaceStoredAvatarIndex(STUDIO_VIRTUAL_SPACE_AUTO_AVATAR)).toBe(true);

    expect(writeStudioVirtualSpaceEntryPreference(2, "희준 작가")).toBe(true);
    expect(readStudioVirtualSpaceEntryPreference()).toEqual({ avatarIndex: 2, confirmed: true, nickname: "희준 작가" });
    expect(JSON.parse(localStorage.getItem(STUDIO_VIRTUAL_SPACE_ENTRY_STORAGE_KEY)!)).toEqual({
      version: 2,
      confirmed: true,
      avatarIndex: 2,
      nickname: "희준 작가",
    });

    // 인월드에서 '자동(-1)'을 선택하면 -1이 저장·복원되고 닉네임은 유지된다.
    expect(writeStudioVirtualSpaceAvatarIndex(STUDIO_VIRTUAL_SPACE_AUTO_AVATAR)).toBe(true);
    expect(localStorage.getItem(STUDIO_VIRTUAL_SPACE_AVATAR_STORAGE_KEY)).toBe("-1");
    expect(readStudioVirtualSpaceAvatarIndex()).toBe(STUDIO_VIRTUAL_SPACE_AUTO_AVATAR);
    expect(readStudioVirtualSpaceEntryPreference()).toEqual({
      avatarIndex: STUDIO_VIRTUAL_SPACE_AUTO_AVATAR,
      confirmed: true,
      nickname: "희준 작가",
    });
  });

  it("rejects corrupt and out-of-range values", () => {
    localStorage.setItem(STUDIO_VIRTUAL_SPACE_ENTRY_STORAGE_KEY, JSON.stringify({ version: 2, confirmed: true, avatarIndex: 99 }));
    expect(readStudioVirtualSpaceEntryPreference()).toEqual({ avatarIndex: -1, confirmed: false, nickname: "" });
    expect(writeStudioVirtualSpaceEntryPreference(99)).toBe(false);
    expect(writeStudioVirtualSpaceEntryPreference(-2)).toBe(false);
  });

  it("normalizes and persists a public nickname without exposing email addresses", () => {
    expect(normalizeStudioVirtualSpaceNickname("  희준   작가  ")).toBe("희준 작가");
    expect(normalizeStudioVirtualSpaceNickname("admin")).toBeNull();
    expect(normalizeStudioVirtualSpaceNickname("test@example.com")).toBeNull();
    expect(studioVirtualSpaceNicknameFromAccount("Creator Kim")).toBe("Creator Kim");
    expect(studioVirtualSpaceNicknameFromAccount("creator@example.com")).toBeNull();

    expect(writeStudioVirtualSpaceEntryPreference(1, " 희준 작가 ")).toBe(true);
    expect(readStudioVirtualSpaceEntryPreference()).toEqual({
      avatarIndex: 1,
      confirmed: true,
      nickname: "희준 작가",
    });
    expect(localStorage.getItem(STUDIO_VIRTUAL_SPACE_NICKNAME_STORAGE_KEY)).toBe("희준 작가");
    expect(JSON.parse(localStorage.getItem(STUDIO_VIRTUAL_SPACE_ENTRY_STORAGE_KEY)!)).toMatchObject({
      version: 2,
      confirmed: true,
      avatarIndex: 1,
      nickname: "희준 작가",
    });

    // 자동(-1) 아바타 상태에서도 닉네임 수정이 두 스토리지 키에 모두 저장된다.
    expect(writeStudioVirtualSpaceEntryPreference(STUDIO_VIRTUAL_SPACE_AUTO_AVATAR, " 자동 작가 ")).toBe(true);
    expect(localStorage.getItem(STUDIO_VIRTUAL_SPACE_NICKNAME_STORAGE_KEY)).toBe("자동 작가");
    expect(readStudioVirtualSpaceEntryPreference()).toEqual({
      avatarIndex: STUDIO_VIRTUAL_SPACE_AUTO_AVATAR,
      confirmed: true,
      nickname: "자동 작가",
    });
  });

  it("tracks whether the first-visit mini tour was seen", () => {
    expect(readStudioVirtualSpaceTourSeen()).toBe(false);
    expect(writeStudioVirtualSpaceTourSeen(true)).toBe(true);
    expect(localStorage.getItem(STUDIO_VIRTUAL_SPACE_TOUR_STORAGE_KEY)).toBe("seen");
    expect(readStudioVirtualSpaceTourSeen()).toBe(true);
    expect(writeStudioVirtualSpaceTourSeen(false)).toBe(true);
    expect(readStudioVirtualSpaceTourSeen()).toBe(false);
  });
});
