import { describe, expect, it } from "vitest";

import {
  STORYWORLD_DEMO_PROJECT,
  type StoryworldProject,
} from "./studio-storyworld-causality";
import {
  addStoryworldCharacter,
  addStoryworldFact,
  addStoryworldScene,
  parseStoryworldTagInput,
  removeStoryworldCharacter,
  removeStoryworldFact,
  removeStoryworldScene,
  updateStoryworldCharacter,
  updateStoryworldFact,
  updateStoryworldScene,
} from "./studio-storyworld-editing";

const base: StoryworldProject = STORYWORLD_DEMO_PROJECT;

describe("storyworld editing — 캐릭터", () => {
  it("이름·설명·태그·별칭을 저장하고 빈 값은 필드 자체를 지운다", () => {
    const next = updateStoryworldCharacter(base, "haeun", {
      name: "하은(수정)",
      aliases: ["은이", ""],
      description: "기억 상인 길드의 견습생",
      tags: ["주인공", " 견습생 ", "주인공"],
      goal: "",
    });
    const haeun = next.characters.find((character) => character.id === "haeun");
    expect(haeun?.name).toBe("하은(수정)");
    expect(haeun?.aliases).toEqual(["은이"]);
    expect(haeun?.description).toBe("기억 상인 길드의 견습생");
    expect(haeun?.tags).toEqual(["주인공", "견습생"]);
    expect(haeun?.goal).toBeUndefined();
    // 원본은 변형하지 않는다.
    expect(base.characters[0]?.name).toBe("하은");
  });

  it("무빙툰 확장 설정을 저장하고 전부 비우면 프로필을 제거한다", () => {
    const withMotion = updateStoryworldCharacter(base, "dojin", {
      motion: { reveal: "fade-up", emphasis: "shake", expressionNotes: "무표정 기본", voiceNote: "낮고 느리게" },
    });
    expect(withMotion.characters.find((c) => c.id === "dojin")?.motion).toEqual({
      reveal: "fade-up",
      emphasis: "shake",
      expressionNotes: "무표정 기본",
      voiceNote: "낮고 느리게",
    });
    const cleared = updateStoryworldCharacter(withMotion, "dojin", { motion: {} });
    expect(cleared.characters.find((c) => c.id === "dojin")?.motion).toBeUndefined();
  });

  it("관계 연결은 실재하는 사실만 남긴다", () => {
    const next = updateStoryworldCharacter(base, "haeun", {
      initialFactIds: ["vault-open", "no-such-fact"],
      secretFactIds: ["dojin-is-brother"],
    });
    const haeun = next.characters.find((c) => c.id === "haeun");
    expect(haeun?.initialFactIds).toEqual(["vault-open"]);
    expect(haeun?.secretFactIds).toEqual(["dojin-is-brother"]);
  });

  it("캐릭터 삭제는 장면 참조를 함께 정리한다", () => {
    const next = removeStoryworldCharacter(base, "dojin");
    expect(next.characters.map((c) => c.id)).toEqual(["haeun"]);
    const s20 = next.scenes.find((scene) => scene.id === "s20");
    expect(s20?.participantIds).toEqual(["haeun"]);
    const s30 = next.scenes.find((scene) => scene.id === "s30");
    expect(s30?.emotionalBeats?.map((beat) => beat.characterId)).toEqual(["haeun"]);
    // 독자 공개는 남고 인물 공개만 빠진다.
    const s20Reveals = next.scenes.find((scene) => scene.id === "s20")?.reveals;
    expect(s20Reveals).toEqual([{ factId: "key-owned", audiences: ["haeun", "reader"] }]);
  });
});

describe("storyworld editing — 사실", () => {
  it("라벨·설명·주체·키·태그·캐논을 저장한다", () => {
    const next = updateStoryworldFact(base, "vault-open", {
      label: "금고가 열린 상태",
      description: "s30 이후 성립",
      subjectId: "haeun",
      key: "vault-open-state",
      tags: ["상태"],
      canonical: true,
    });
    const fact = next.facts.find((item) => item.id === "vault-open");
    expect(fact).toMatchObject({
      label: "금고가 열린 상태",
      description: "s30 이후 성립",
      subjectId: "haeun",
      key: "vault-open-state",
      tags: ["상태"],
      canonical: true,
    });
  });

  it("사실 삭제는 전제·효과·지식·공개·인물 목록 참조를 정리한다", () => {
    const next = removeStoryworldFact(base, "key-owned");
    expect(next.facts.some((fact) => fact.id === "key-owned")).toBe(false);
    const s20 = next.scenes.find((scene) => scene.id === "s20");
    expect(s20?.effects).toEqual([]);
    expect(s20?.reveals).toEqual([]);
    const s30 = next.scenes.find((scene) => scene.id === "s30");
    expect(s30?.preconditions).toEqual([]);
    expect(next.characters.find((c) => c.id === "haeun")?.initialFactIds).toEqual(["city-rains-at-night"]);
  });
});

describe("storyworld editing — 장면", () => {
  it("제목·설명·순서·시간·장소·참여자·의존을 저장하고 자기 의존은 막는다", () => {
    const next = updateStoryworldScene(base, "s20", {
      title: "열쇠 거래(수정)",
      description: "시장 뒷골목",
      order: 25,
      timeIndex: null,
      locationId: "alley",
      participantIds: ["haeun", "ghost"],
      dependsOnSceneIds: ["s10", "s20"],
      disabled: true,
    });
    const scene = next.scenes.find((item) => item.id === "s20");
    expect(scene).toMatchObject({
      title: "열쇠 거래(수정)",
      description: "시장 뒷골목",
      order: 25,
      locationId: "alley",
      participantIds: ["haeun"],
      dependsOnSceneIds: ["s10"],
      disabled: true,
    });
    expect(scene?.timeIndex).toBeUndefined();
  });

  it("장면 삭제는 다른 장면의 선행 의존을 정리한다", () => {
    const next = removeStoryworldScene(base, "s10");
    expect(next.scenes.some((scene) => scene.id === "s10")).toBe(false);
    expect(next.scenes.find((scene) => scene.id === "s20")?.dependsOnSceneIds).toEqual([]);
  });
});

describe("storyworld editing — 생성과 태그 입력", () => {
  it("생성 id는 종류 접두 + 가장 작은 빈 번호이고 장면 순서는 뒤에 붙는다", () => {
    const withCharacter = addStoryworldCharacter(base, "새 인물");
    expect(withCharacter.id).toBe("character-1");
    expect(withCharacter.project.characters.at(-1)?.name).toBe("새 인물");
    const withFact = addStoryworldFact(base, "새 사실");
    expect(withFact.id).toBe("fact-1");
    expect(withFact.project.facts.at(-1)?.subjectId).toBe("haeun");
    const withScene = addStoryworldScene(base, "새 장면");
    expect(withScene.id).toBe("scene-1");
    expect(withScene.project.scenes.at(-1)?.order).toBe(50);
  });

  it("태그 입력은 쉼표·줄바꿈을 분리하고 중복·공백을 제거한다", () => {
    expect(parseStoryworldTagInput("주인공, 악역\n조력자,, 주인공")).toEqual(["주인공", "악역", "조력자"]);
    expect(parseStoryworldTagInput("  ")).toEqual([]);
  });

  it("없는 요소를 편집·삭제하면 프로젝트를 그대로 돌려준다", () => {
    expect(updateStoryworldCharacter(base, "nope", { name: "x" })).toBe(base);
    expect(updateStoryworldFact(base, "nope", { label: "x" })).toBe(base);
    expect(updateStoryworldScene(base, "nope", { title: "x" })).toBe(base);
    expect(removeStoryworldCharacter(base, "nope")).toBe(base);
    expect(removeStoryworldFact(base, "nope")).toBe(base);
    expect(removeStoryworldScene(base, "nope")).toBe(base);
  });
});
