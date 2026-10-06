// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { useFortuneStore } from "./fortune-store";

const EMPTY_PROFILE = {
  lastCharacterId: null,
  birthDate: "",
  birthTime: "",
  gender: "none",
  partnerBirthDate: "",
  partnerBirthTime: "",
  viewedDates: [] as string[],
  history: [],
  bonusDates: [] as string[],
};

beforeEach(() => {
  localStorage.clear();
  useFortuneStore.setState(EMPTY_PROFILE);
});

describe("fortune-store 생년월일 프로필 (LOW-2 민감정보 정책)", () => {
  it("clearBirthProfile은 생년월일 정보만 비우고 이용 이력은 남긴다", () => {
    const store = useFortuneStore.getState();
    store.setProfile({
      birthDate: "1990-06-15",
      birthTime: "10:30",
      gender: "female",
      partnerBirthDate: "1988-01-20",
      partnerBirthTime: "08:00",
      lastCharacterId: "char-1",
    });
    useFortuneStore.setState({ viewedDates: ["2026-10-06"], bonusDates: ["2026-10-06"] });

    useFortuneStore.getState().clearBirthProfile();

    const after = useFortuneStore.getState();
    expect(after.birthDate).toBe("");
    expect(after.birthTime).toBe("");
    expect(after.gender).toBe("none");
    expect(after.partnerBirthDate).toBe("");
    expect(after.partnerBirthTime).toBe("");
    // 생년월일과 무관한 상태는 보존된다
    expect(after.lastCharacterId).toBe("char-1");
    expect(after.viewedDates).toEqual(["2026-10-06"]);
    expect(after.bonusDates).toEqual(["2026-10-06"]);
  });

  it("지운 뒤에는 localStorage 영속분에도 생년월일이 남지 않는다", () => {
    useFortuneStore.getState().setProfile({ birthDate: "1990-06-15", birthTime: "10:30" });
    expect(localStorage.getItem("toonstudio-fortune")).toContain("1990-06-15");

    useFortuneStore.getState().clearBirthProfile();

    const persisted = localStorage.getItem("toonstudio-fortune") ?? "";
    expect(persisted).not.toContain("1990-06-15");
    expect(persisted).not.toContain("10:30");
  });

  it("이미 비어 있어도 clearBirthProfile은 안전하게 동작한다", () => {
    expect(() => useFortuneStore.getState().clearBirthProfile()).not.toThrow();
    expect(useFortuneStore.getState().birthDate).toBe("");
  });
});
