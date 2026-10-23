import { describe, expect, it } from "vitest";

import { ADVANCED_WEBTOON_POSES } from "./studio-3d-advanced-poses-library";
import {
  STUDIO_MANNEQUIN_POSE_CATEGORIES,
  STUDIO_MANNEQUIN_POSE_PRESETS,
  studioMannequinPosePresetScope,
} from "./studio-mannequin-poses";
import {
  STUDIO_POSE_LIBRARY_DUPLICATES,
  STUDIO_POSE_LIBRARY_ENTRIES,
  buildStudioPoseSearchIndex,
  buildStudioWebtoonPoseSearchIndex,
  countStudioPoseLibraryByCategory,
  countStudioPoseLibraryBySource,
  filterStudioPoseLibrary,
  matchesStudioPoseSearch,
  normalizeStudioPoseSearchText,
} from "./studio-pose-library-search";

function keysFor(query: string, source: "all" | "webtoon" | "library" | "hand" = "all"): string[] {
  return filterStudioPoseLibrary({ query, source }).map((entry) => entry.key);
}

const HAND_ONLY_COUNT = STUDIO_MANNEQUIN_POSE_PRESETS.filter(
  (preset) => studioMannequinPosePresetScope(preset) === "hand-only",
).length;
const DUPLICATE_COUNT = Object.keys(STUDIO_POSE_LIBRARY_DUPLICATES).length;

describe("통합 포즈 검색 기준 (B-10)", () => {
  it("한 글자 '검'은 칼 포즈만 찾고 '검지'(가리키기·OK·락 사인)는 찾지 않는다", () => {
    const all = keysFor("검");
    expect(all).toContain("mannequin:sword-ready");
    expect(all).toContain("webtoon:action-sword-slash");
    expect(all).toContain("webtoon:dramatic-knight-oath");
    for (const handKey of ["mannequin:hand-point", "mannequin:hand-ok", "mannequin:hand-rock"]) {
      expect(all).not.toContain(handKey);
    }
    // 같은 기준이 출처별 목록에도 그대로 쓰인다(검색창마다 결과가 달라지지 않는다).
    expect(keysFor("검", "hand")).toEqual([]);
    expect(keysFor("검", "webtoon")).toEqual([
      "webtoon:action-sword-slash",
      "webtoon:dramatic-knight-oath",
    ]);
  });

  it("'검지'처럼 두 글자 이상이면 그 낱말을 가진 손 포즈를 찾는다", () => {
    expect(keysFor("검지")).toEqual(
      expect.arrayContaining(["mannequin:hand-point", "mannequin:hand-ok", "mannequin:hand-rock"]),
    );
  });

  it("'주먹'은 출처와 무관하게 같은 기준으로 펀치·주먹 손·분노 포즈를 찾는다", () => {
    expect(keysFor("주먹").sort()).toEqual([
      "mannequin:emotion-anger-stomp",
      "mannequin:hand-fist",
      "mannequin:punch",
    ]);
    // 웹툰 프리셋에는 주먹 포즈가 없다 — 데이터 사실이지 기준 차이가 아니다.
    expect(keysFor("주먹", "webtoon")).toEqual([]);
    for (const preset of ADVANCED_WEBTOON_POSES) {
      expect(matchesStudioPoseSearch(buildStudioWebtoonPoseSearchIndex(preset), "주먹")).toBe(false);
    }
  });

  it("동의어로 같은 뜻의 다른 말도 찾는다(칼→검, 허그→포옹, fist→주먹)", () => {
    expect(keysFor("칼")).toEqual(expect.arrayContaining(["mannequin:sword-ready", "webtoon:action-sword-slash"]));
    expect(keysFor("허그")).toEqual(expect.arrayContaining(["mannequin:couple-back-hug", "mannequin:couple-hug-front"]));
    expect(keysFor("fist")).toContain("mannequin:hand-fist");
  });

  it("한 글자 낱말은 조사가 붙은 낱말까지는 같은 낱말로 본다", () => {
    const index = buildStudioPoseSearchIndex({ primary: ["인사"], secondary: ["한 손을 들어 흔든다"] });
    expect(matchesStudioPoseSearch(index, "손")).toBe(true);
    const fingerOnly = buildStudioPoseSearchIndex({ primary: ["가리키기", "검지"], secondary: ["검지로 가리킨다"] });
    expect(matchesStudioPoseSearch(fingerOnly, "검")).toBe(false);
  });

  it("여러 낱말은 모두 만족해야 하고(AND) 붙여 친 이름도 찾는다", () => {
    expect(keysFor("손잡고 걷기")).toEqual(["mannequin:couple-hand-hold-walk"]);
    expect(keysFor("손잡고걷기")).toEqual(["mannequin:couple-hand-hold-walk"]);
    expect(keysFor("포옹 백허그")).toEqual(["mannequin:couple-back-hug"]);
    expect(keysFor("없는포즈zzz")).toEqual([]);
  });

  it("서로 다른 태그를 가로지르는 붙여 쓰기 오탐이 없다", () => {
    const index = buildStudioPoseSearchIndex({ primary: ["주먹", "쥐기"] });
    expect(matchesStudioPoseSearch(index, "주먹쥐기")).toBe(false);
    expect(matchesStudioPoseSearch(index, "주먹")).toBe(true);
  });

  it("구두점·대소문자·호환 문자를 정규화한다", () => {
    expect(normalizeStudioPoseSearchText("  V 사인 (Peace)·OK  ")).toBe("v 사인 peace ok");
    expect(keysFor("PEACE")).toContain("mannequin:hand-peace");
    expect(keysFor("2인").length).toBeGreaterThan(0);
    expect(filterStudioPoseLibrary({ query: "2인" }).every((entry) => entry.figures === 2)).toBe(true);
  });
});

describe("통합 포즈 라이브러리 목록·중복 정리 (B-07)", () => {
  it("중복 표의 웹툰 id와 데생 인형 id가 모두 실제 프리셋이다", () => {
    const webtoonIds = new Set(ADVANCED_WEBTOON_POSES.map((preset) => preset.id));
    const mannequinIds = new Set(STUDIO_MANNEQUIN_POSE_PRESETS.map((preset) => preset.id));
    for (const [webtoonId, mannequinId] of Object.entries(STUDIO_POSE_LIBRARY_DUPLICATES)) {
      expect(webtoonIds.has(webtoonId), `웹툰 프리셋 없음: ${webtoonId}`).toBe(true);
      expect(mannequinIds.has(mannequinId), `데생 인형 프리셋 없음: ${mannequinId}`).toBe(true);
    }
  });

  it("'전체'는 겹치는 웹툰 판을 빼고, 출처를 고르면 각 라이브러리를 그대로 보여 준다", () => {
    const counts = countStudioPoseLibraryBySource();
    expect(counts.webtoon).toBe(ADVANCED_WEBTOON_POSES.length);
    expect(counts.hand).toBe(HAND_ONLY_COUNT);
    expect(counts.library).toBe(STUDIO_MANNEQUIN_POSE_PRESETS.length - HAND_ONLY_COUNT);
    expect(counts.all).toBe(
      STUDIO_MANNEQUIN_POSE_PRESETS.length + ADVANCED_WEBTOON_POSES.length - DUPLICATE_COUNT,
    );
    const allKeys = keysFor("");
    expect(allKeys).toContain("mannequin:couple-hand-hold-walk");
    expect(allKeys).not.toContain("webtoon:couple-hand-hold");
    expect(keysFor("", "webtoon")).toContain("webtoon:couple-hand-hold");
  });

  it("숨긴 웹툰 판의 이름으로 검색해도 합쳐진 카드가 나온다", () => {
    const romance = filterStudioPoseLibrary({ query: "로맨스 포옹" });
    expect(romance.map((entry) => entry.key)).toContain("mannequin:couple-hug-front");
    const hug = romance.find((entry) => entry.key === "mannequin:couple-hug-front");
    expect(hug?.mergedNames).toContain("로맨스 포옹");
  });

  it("항목 키가 유일하고, 분류 순서대로 묶여 있으며, 웹툰 분류는 통합 분류로 옮겨진다", () => {
    const keys = STUDIO_POSE_LIBRARY_ENTRIES.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
    const order = STUDIO_MANNEQUIN_POSE_CATEGORIES.map((meta) => meta.id);
    const categoryIndexes = STUDIO_POSE_LIBRARY_ENTRIES.map((entry) => order.indexOf(entry.category));
    expect(categoryIndexes.every((value) => value >= 0)).toBe(true);
    expect([...categoryIndexes].sort((a, b) => a - b)).toEqual(categoryIndexes);
    const shock = STUDIO_POSE_LIBRARY_ENTRIES.find((entry) => entry.key === "webtoon:dramatic-shock-stepback");
    expect(shock?.category).toBe("webtoon");
    expect(shock?.label).toBe("경악하며 뒷걸음질");
  });

  it("분류·인원·출처 조건을 함께 적용하고 분류 칩 개수는 분류 외 조건을 따른다", () => {
    const couples = filterStudioPoseLibrary({ category: "couple", source: "webtoon" });
    expect(couples.length).toBeGreaterThan(0);
    expect(couples.every((entry) => entry.source === "webtoon" && entry.category === "couple")).toBe(true);
    const twoFigures = filterStudioPoseLibrary({ figures: 2 });
    expect(twoFigures.every((entry) => entry.figures === 2)).toBe(true);
    const byCategory = countStudioPoseLibraryByCategory({ source: "hand" });
    expect(byCategory.hand).toBe(HAND_ONLY_COUNT);
    expect(byCategory.action).toBe(0);
  });
});
