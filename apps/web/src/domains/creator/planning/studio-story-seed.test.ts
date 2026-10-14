import { describe, expect, it } from "vitest";

import {
  buildLocalStorySeed,
  localStorySeedProvider,
  storySeedGenreKit,
  storySeedPlanPatch,
} from "./studio-story-seed";

describe("buildLocalStorySeed", () => {
  it("장르가 없으면 초안을 만들지 않는다", () => {
    expect(buildLocalStorySeed({ genre: "  ", keywords: [] })).toBeNull();
  });

  it("같은 입력은 항상 같은 초안을 만든다 (결정적)", () => {
    const input = { genre: "판타지", keywords: ["저주받은 검", "왕위"] };
    const first = buildLocalStorySeed(input);
    const second = buildLocalStorySeed(input);
    expect(first).toEqual(second);
    expect(first?.id).toBe(second?.id);
  });

  it("로그라인 후보 3개가 모두 다르고 키워드를 품는다", () => {
    const draft = buildLocalStorySeed({ genre: "현판", keywords: ["히든 클래스"] });
    expect(draft).not.toBeNull();
    const candidates = draft!.loglineCandidates;
    expect(new Set(candidates).size).toBe(3);
    expect(candidates[0]).toContain("히든 클래스");
    expect(candidates[1]).toContain("히든 클래스");
  });

  it("키워드가 없으면 장르 기본 소재로 채운다", () => {
    const draft = buildLocalStorySeed({ genre: "공포", keywords: [] });
    expect(draft!.loglineCandidates[0]).toContain("들려서는 안 될 소리");
  });

  it("키워드는 정리·중복 제거·최대 5개로 정규화된다", () => {
    const draft = buildLocalStorySeed({
      genre: "일상",
      keywords: [" 단골 ", "단골", "축제", "비밀", "여행", "선물", "초과분"],
    });
    expect(draft!.keywords).toEqual(["단골", "축제", "비밀", "여행", "선물"]);
  });

  it("모르는 장르는 폴백 키트로도 초안을 만든다", () => {
    const draft = buildLocalStorySeed({ genre: "사이버펑크", keywords: ["해킹"] });
    expect(draft).not.toBeNull();
    expect(draft!.coreConflictDraft.length).toBeGreaterThan(0);
    expect(storySeedGenreKit("사이버펑크")).toBe(storySeedGenreKit("없는장르"));
  });

  it("설정 인용이 주인공·무대 기본값을 채우고 출처가 남는다", () => {
    const draft = buildLocalStorySeed({
      genre: "로맨스",
      keywords: ["재회"],
      settingRefs: [
        { id: "char-1", kind: "character", name: "서연" },
        { id: "loc-1", kind: "location", name: "연남동 카페 거리" },
      ],
    });
    expect(draft!.loglineCandidates[0]).toContain("서연");
    expect(draft!.loglineCandidates[0]).toContain("연남동 카페 거리");
    expect(draft!.referencedSettingIds).toEqual(["char-1", "loc-1"]);
  });

  it("직접 적은 주인공·무대가 설정 인용보다 우선한다", () => {
    const draft = buildLocalStorySeed({
      genre: "로맨스",
      keywords: [],
      protagonist: "민준",
      settingRefs: [{ id: "char-1", kind: "character", name: "서연" }],
    });
    expect(draft!.loglineCandidates[0]).toContain("민준");
    expect(draft!.loglineCandidates[0]).not.toContain("서연");
  });

  it("세계관 허브 로어 인용이 줄거리에 실제로 작동하고 출처로 남는다", () => {
    const draft = buildLocalStorySeed({
      genre: "판타지",
      keywords: ["예언"],
      settingRefs: [
        { id: "lore-faction-1", kind: "lore", name: "등불지기 길드" },
        { id: "lore-rule-1", kind: "lore", name: "물에 닿은 기억은 사라진다" },
      ],
    });
    expect(draft!.synopsisDraft).toContain("등불지기 길드");
    expect(draft!.synopsisDraft).toContain("물에 닿은 기억은 사라진다");
    expect(draft!.referencedSettingIds).toEqual(["lore-faction-1", "lore-rule-1"]);
  });

  it("허브 place 항목(location)은 무대 슬롯을 채운다", () => {
    const draft = buildLocalStorySeed({
      genre: "판타지",
      keywords: [],
      settingRefs: [
        { id: "lore-place-1", kind: "location", name: "침수된 옛 도서관" },
      ],
    });
    expect(draft!.loglineCandidates[0]).toContain("침수된 옛 도서관");
  });

  it("초안은 완성 원고가 아니라 채울 골격을 포함한다", () => {
    const draft = buildLocalStorySeed({ genre: "스릴러", keywords: ["목격자"] });
    expect(draft!.turningPointScaffold).toHaveLength(3);
    expect(draft!.turningPointScaffold[0]).toContain("채우기");
    expect(draft!.expansionProposals).toHaveLength(3);
    expect(draft!.emotionalArc.from).not.toBe(draft!.emotionalArc.to);
  });
});

describe("storySeedPlanPatch", () => {
  it("고른 로그라인으로 회차 기획 필드 패치를 만든다", () => {
    const draft = buildLocalStorySeed({ genre: "학원", keywords: ["비밀 동아리"] })!;
    const patch = storySeedPlanPatch(draft, 1);
    expect(patch.logline).toBe(draft.loglineCandidates[1]);
    expect(patch.goal).toBe(draft.goalDraft);
    expect(patch.synopsis).toBe(draft.synopsisDraft);
    expect(patch.openingHook).toBe(draft.openingHookDraft);
    expect(patch.turningPoints).toEqual(draft.turningPointScaffold);
    expect(patch.emotionalArc).toEqual(draft.emotionalArc);
  });

  it("패치에 초안의 referencedSettingIds가 그대로 실린다 (인계 카드 전파용)", () => {
    const draft = buildLocalStorySeed({
      genre: "학원",
      keywords: [],
      settingRefs: [{ id: "lore-rule-1", kind: "lore", name: "교칙 1조" }],
    })!;
    const patch = storySeedPlanPatch(draft);
    expect(patch.referencedSettingIds).toEqual(["lore-rule-1"]);
    expect(patch.referencedSettingIds).toEqual(draft.referencedSettingIds);
  });
});

describe("localStorySeedProvider", () => {
  it("제공자 계약으로 같은 초안을 돌려준다", async () => {
    const viaProvider = await localStorySeedProvider.generate({
      genre: "무협",
      keywords: ["비급"],
    });
    expect(viaProvider).toEqual(
      buildLocalStorySeed({ genre: "무협", keywords: ["비급"] }),
    );
    expect(localStorySeedProvider.kind).toBe("local");
  });
});
