import { describe, expect, it } from "vitest";

import type { StudioStoryBible } from "./studio-story-bible";
import {
  detectSettingConflicts,
  settingConflictQcExtras,
  settingFactKeywords,
  type EpisodeSettingInput,
} from "./studio-setting-conflict";

const bible: StudioStoryBible = {
  projectId: "p1",
  characters: [
    { id: "char-mina", name: "미나", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
    { id: "char-jun", name: "준", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
  ],
  locations: [
    { id: "loc-ark", name: "아르카디아" },
    { id: "loc-port", name: "남쪽 항구" },
  ],
  facts: [
    { id: "fact-society", label: "비밀 결사 아르카의 존재", characterIds: ["char-mina"], locationId: "loc-ark" },
    { id: "fact-harbor", label: "항구 등대 지하 금고", characterIds: [], locationId: "loc-port" },
  ],
};

function input(partial: Partial<EpisodeSettingInput>): EpisodeSettingInput {
  return { episodeId: "ep-1", metaTexts: [], declaredLocationIds: [], dialogueLines: [], ...partial };
}

describe("setting conflict detection (R-1)", () => {
  it("사실 label에서 핵심 토큰을 뽑는다", () => {
    expect(settingFactKeywords(bible.facts[0]!)).toContain("아르카의");
    expect(settingFactKeywords(bible.facts[0]!)).toContain("존재");
  });

  it("아는 사실을 모른다고 말하면 지식 부정 후보가 화자와 함께 오른다", () => {
    const report = detectSettingConflicts(bible, input({
      dialogueLines: [{ id: "line-1", speakerId: "char-mina", text: "아르카? 그런 비밀 결사는 처음 들어." }],
    }));
    expect(report.needsReview).toBe(true);
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]).toMatchObject({
      code: "knowledge-negation",
      factId: "fact-society",
      characterId: "char-mina",
      characterName: "미나",
      sourceKind: "dialogue",
      sourceId: "line-1",
    });
    expect(report.candidates[0]?.messageKo).toContain("확인해 주세요");
  });

  it("부정 표현이 없으면 같은 언급도 후보가 아니다", () => {
    const report = detectSettingConflicts(bible, input({
      dialogueLines: [{ id: "line-1", speakerId: "char-mina", text: "아르카의 존재는 우리만 알아." }],
    }));
    expect(report.candidates).toHaveLength(0);
    expect(report.needsReview).toBe(false);
  });

  it("사실과 무관한 캐릭터가 모른다고 말하면 그 사실의 후보가 아니다", () => {
    const report = detectSettingConflicts(bible, input({
      dialogueLines: [{ id: "line-1", speakerId: "char-jun", text: "아르카? 처음 들어." }],
    }));
    expect(report.candidates).toHaveLength(0);
  });

  it("화자 없는 메타에서 부정이 있으면 연결 캐릭터가 1명일 때 그 캐릭터로 귀속한다", () => {
    const report = detectSettingConflicts(bible, input({
      metaTexts: [{ id: "synopsis", text: "미나는 아르카의 존재를 전혀 몰랐던 것으로 그려진다." }],
    }));
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]).toMatchObject({ characterId: "char-mina", sourceKind: "meta" });
  });

  it("사실의 장소와 다른 장소 이름이 함께 나오면 장소 불일치 후보가 오른다", () => {
    const report = detectSettingConflicts(bible, input({
      metaTexts: [{ id: "synopsis", text: "무대는 남쪽 항구. 비밀 결사 아르카의 존재가 드러난다." }],
    }));
    const locationCandidate = report.candidates.find((c) => c.code === "location-mismatch");
    expect(locationCandidate).toMatchObject({ factId: "fact-society" });
    expect(locationCandidate?.messageKo).toContain("아르카디아");
    expect(locationCandidate?.messageKo).toContain("남쪽 항구");
  });

  it("회차가 장소를 1곳으로 선언했는데 사실의 장소와 다르면 후보가 오른다", () => {
    const report = detectSettingConflicts(bible, input({
      declaredLocationIds: ["loc-ark"],
      dialogueLines: [{ id: "line-1", speakerId: null, text: "등대 지하 금고를 열자." }],
    }));
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]).toMatchObject({ code: "location-mismatch", factId: "fact-harbor" });
  });

  it("선언 장소가 여러 곳이면 장소 불일치를 단정하지 않는다", () => {
    const report = detectSettingConflicts(bible, input({
      declaredLocationIds: ["loc-ark", "loc-port"],
      dialogueLines: [{ id: "line-1", speakerId: null, text: "등대 지하 금고를 열자." }],
    }));
    expect(report.candidates).toHaveLength(0);
  });

  it("disabledCodes로 규칙을 끌 수 있고 QC 브리지가 모양을 맞춘다", () => {
    const report = detectSettingConflicts(bible, input({
      dialogueLines: [{ id: "line-1", speakerId: "char-mina", text: "아르카? 처음 들어." }],
    }), { disabledCodes: ["knowledge-negation"] });
    expect(report.candidates).toHaveLength(0);
    expect(settingConflictQcExtras(null)).toBeNull();
    const withCandidate = detectSettingConflicts(bible, input({
      dialogueLines: [{ id: "line-1", speakerId: "char-mina", text: "아르카? 처음 들어." }],
    }));
    const extras = settingConflictQcExtras(withCandidate);
    expect(extras?.candidateCount).toBe(1);
    expect(extras?.topMessage?.ko).toContain("미나");
  });
});
