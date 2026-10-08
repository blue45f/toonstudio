import { describe, expect, it } from "vitest";

import { studioNearbyNpcCards, studioPromptNpc } from "./studio-virtual-space-page-helpers";

const npc = (id: string, interaction: object | null) => ({
  id, labelKo: `NPC · ${id}`, labelEn: `NPC · ${id}`, activityKo: "기다리는 중", activityEn: "Waiting", skinKey: id, interaction,
});

describe("studioPromptNpc", () => {
  it("대화할 수 있는 가까운 NPC 중 첫 번째를 하단 프롬프트의 NPC로 고른다", () => {
    const quiet = npc("quiet", null);
    const guide = npc("guide", {});
    const cafe = npc("cafe", {});
    expect(studioPromptNpc([quiet, guide, cafe], false)).toBe(guide);
  });

  it("가까운 오브젝트 상호작용이 있으면 프롬프트는 그쪽을 가리키므로 NPC는 없다", () => {
    expect(studioPromptNpc([npc("guide", {})], true)).toBeNull();
  });

  it("대화할 수 있는 NPC가 없으면 null이다", () => {
    expect(studioPromptNpc([npc("quiet", null)], false)).toBeNull();
    expect(studioPromptNpc([], false)).toBeNull();
  });
});

describe("studioNearbyNpcCards", () => {
  const nearby = [npc("guide", {}), npc("cafe", {}), npc("quiet", null)];

  it("프롬프트가 없으면 대화할 수 있는 NPC 카드마다 대화 버튼을 둔다", () => {
    expect(studioNearbyNpcCards(nearby).map((card) => [card.id, card.canTalk])).toEqual([["guide", true], ["cafe", true], ["quiet", false]]);
  });

  it("하단 프롬프트가 맡은 NPC 카드에는 같은 동작의 대화 버튼을 또 두지 않고 다른 NPC는 그대로 둔다", () => {
    const cards = studioNearbyNpcCards(nearby, "guide");
    expect(cards.map((card) => [card.id, card.canTalk])).toEqual([["guide", false], ["cafe", true], ["quiet", false]]);
    // 버튼만 빠질 뿐 카드의 이름·활동 정보는 그대로다.
    expect(cards[0]).toMatchObject({ id: "guide", labelKo: "NPC · guide", activityKo: "기다리는 중", skinKey: "guide" });
  });

  it("프롬프트 NPC 하나만 가까이 있어도 카드는 남는다", () => {
    expect(studioNearbyNpcCards([npc("guide", {})], "guide")).toHaveLength(1);
  });
});
