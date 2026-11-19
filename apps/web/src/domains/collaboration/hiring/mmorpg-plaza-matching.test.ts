import { describe, expect, it } from "vitest";

import {
  DETAILED_WEBTOON_ROLES,
  assignAvatarToPartySlot,
  matchPlazaAvatarsForSlot,
  type PlazaAssistantAvatar,
  type PlazaRecruitmentParty,
} from "./mmorpg-plaza-matching";

describe("mmorpg-plaza-matching", () => {
  it("기존 17개 공정 + 11개 신규 전문 직군 총 28개 직군을 제공한다", () => {
    expect(DETAILED_WEBTOON_ROLES.length).toBe(28);
    expect(DETAILED_WEBTOON_ROLES.some((r) => r.code === "001.021")).toBe(true);
    expect(DETAILED_WEBTOON_ROLES.some((r) => r.code === "001.027")).toBe(true);
  });

  it("파티 슬롯 조건에 맞춰 온라인 어시스턴트를 실시간 점수화하고 배치한다", () => {
    const party: PlazaRecruitmentParty = {
      partyId: "p-1",
      title: "긴급 선화 파티",
      studioName: "스튜디오 A",
      genre: "modern-fantasy",
      zone: "urgent-sub-gate",
      createdAt: "2026-11-19T00:00:00.000Z",
      slots: [
        {
          slotId: "slot-line",
          roleCode: "001.003",
          requiredCount: 1,
          filledAvatarIds: [],
          budgetPerCutKrw: 18000,
          urgent: true,
        },
      ],
    };

    const avatars: PlazaAssistantAvatar[] = [
      {
        id: "a-best",
        nickname: "선화장인",
        roleCode: "001.003",
        secondaryRoleCodes: [],
        tier: "veteran",
        status: "urgent-sub-ready",
        preferredGenres: ["modern-fantasy"],
        tools: ["clip-studio-ex"],
        cutRateKrw: 16000,
        weeklyCapacityCuts: 60,
        responseMinutes: 5,
        completedEpisodes: 80,
        urgentSubAvailable: true,
      },
      {
        id: "a-away",
        nickname: "자리비움",
        roleCode: "001.003",
        secondaryRoleCodes: [],
        tier: "pro",
        status: "away",
        preferredGenres: ["modern-fantasy"],
        tools: ["clip-studio-ex"],
        cutRateKrw: 15000,
        weeklyCapacityCuts: 50,
        responseMinutes: 5,
        completedEpisodes: 20,
        urgentSubAvailable: true,
      },
    ];

    const results = matchPlazaAvatarsForSlot(party, party.slots[0], avatars);
    expect(results[0]?.avatarId).toBe("a-best");
    expect(results[0]?.compatible).toBe(true);
    expect(results[0]?.score).toBeGreaterThanOrEqual(85);
    expect(results[1]?.compatible).toBe(false);

    const updated = assignAvatarToPartySlot(party, "slot-line", "a-best");
    expect(updated.slots[0]?.filledAvatarIds).toEqual(["a-best"]);
  });
});
