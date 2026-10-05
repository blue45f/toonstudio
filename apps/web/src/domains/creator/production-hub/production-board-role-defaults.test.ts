import { describe, expect, it } from "vitest";

import { boardRoleDefaultFilters, resolveBoardRoleProcess } from "./production-board-role-defaults";

describe("boardRoleDefaultFilters (§5 매트릭스 — 제작 허브 기본 뷰·필터)", () => {
  it("글·기획은 스토리 공정을, 콘티는 콘티 공정을 기본으로 고른다", () => {
    expect(boardRoleDefaultFilters("story")).toEqual({ processCandidates: ["story-lock", "story"] });
    expect(boardRoleDefaultFilters("planner")).toEqual({ processCandidates: ["story-lock", "story"] });
    expect(boardRoleDefaultFilters("storyboard")).toEqual({ processCandidates: ["storyboard"] });
  });

  it("선화·캐릭터·어시는 내 카드, 편집·검수·PD는 검수 대기를 기본으로 고른다", () => {
    for (const role of ["line-art", "character", "assistant"] as const) {
      expect(boardRoleDefaultFilters(role)).toEqual({ focus: "mine" });
    }
    for (const role of ["editor", "reviewer", "producer"] as const) {
      expect(boardRoleDefaultFilters(role)).toEqual({ focus: "review" });
    }
  });

  it("배경·3D·채색·식자·현지화는 자기 공정을 기본으로 고른다", () => {
    expect(boardRoleDefaultFilters("background")?.processCandidates).toContain("background");
    expect(boardRoleDefaultFilters("three-d")?.processCandidates).toContain("background");
    expect(boardRoleDefaultFilters("color")).toEqual({ processCandidates: ["color"] });
    expect(boardRoleDefaultFilters("lettering")).toEqual({ processCandidates: ["lettering"] });
    expect(boardRoleDefaultFilters("localization")).toEqual({ processCandidates: ["lettering"] });
  });

  it("1인 작가·교육자·미선택은 기본 필터가 없다(전체 보기 유지)", () => {
    expect(boardRoleDefaultFilters("creator")).toBeNull();
    expect(boardRoleDefaultFilters("educator")).toBeNull();
    expect(boardRoleDefaultFilters(null)).toBeNull();
    expect(boardRoleDefaultFilters(undefined)).toBeNull();
  });
});

describe("resolveBoardRoleProcess", () => {
  it("후보 중 프로젝트에 실제로 있는 첫 공정을 고른다", () => {
    const available = new Set(["background-draft", "color"]);
    expect(resolveBoardRoleProcess(["background", "background-draft"], available)).toBe("background-draft");
  });

  it("구 표기(story)는 canonical 키(story-lock)로 맞춰 고른다", () => {
    expect(resolveBoardRoleProcess(["story"], new Set(["story-lock"]))).toBe("story-lock");
  });

  it("맞는 공정이 없으면 빈 문자열을 돌려줘 기본값을 적용하지 않는다", () => {
    expect(resolveBoardRoleProcess(["color"], new Set(["story-lock"]))).toBe("");
  });
});
