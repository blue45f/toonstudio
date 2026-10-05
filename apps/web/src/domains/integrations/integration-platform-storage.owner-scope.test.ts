/**
 * 통합 자동화 레시피 소유자 스코프 회귀 테스트.
 *
 * 자동화 레시피가 계정 구분 없이 레거시 단일 키를 공유해, 계정을 바꾸면
 * 이전 계정의 레시피 구성이 그대로 보이고 그 위에 덮어쓸 수 있던 혼선을
 * 막는다. 소유자 키잉·claim 계약은 학습 기록·수강 등록과 같다.
 */

import { describe, expect, it, vi } from "vitest";

import {
  RECIPE_STORAGE_KEY,
  loadIntegrationRecipes,
  recipeDraftFromTemplate,
  recipeStorageKey,
  saveIntegrationRecipes,
} from "./integration-platform-storage";

const template = {
  id: "review-meeting",
  name: "Review meeting",
  trigger: "review.requested",
  actions: ["calendar.create", "meeting.create", "message.send"],
} as const;

function memoryStorage() {
  const memory = new Map<string, string>();
  return {
    memory,
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
  };
}

const namedDraft = (name: string) => [{ ...recipeDraftFromTemplate(template), name }];

describe("자동화 레시피 소유자 스코프 (저장 함수)", () => {
  it("계정마다 레시피가 갈라져 저장되고 레거시 키는 건드리지 않는다", () => {
    const storage = memoryStorage();
    saveIntegrationRecipes(namedDraft("A의 레시피"), storage, "user-a");

    expect(storage.memory.has(recipeStorageKey("user-a"))).toBe(true);
    expect(storage.memory.has(RECIPE_STORAGE_KEY)).toBe(false);
    expect(loadIntegrationRecipes([template], storage, "user-a")).toEqual(namedDraft("A의 레시피"));
    expect(loadIntegrationRecipes([template], storage, "user-b")).toEqual([
      recipeDraftFromTemplate(template),
    ]);
    expect(loadIntegrationRecipes([template], storage, "guest")).toEqual([
      recipeDraftFromTemplate(template),
    ]);

    // 다른 계정의 저장이 앞 계정의 기록을 덮지 않는다.
    saveIntegrationRecipes(namedDraft("B의 레시피"), storage, "user-b");
    expect(loadIntegrationRecipes([template], storage, "user-a")).toEqual(namedDraft("A의 레시피"));
    expect(loadIntegrationRecipes([template], storage, "user-b")).toEqual(namedDraft("B의 레시피"));
  });

  it("소유자를 오가도 각 파티션의 저장본이 그대로 복원된다", () => {
    const storage = memoryStorage();
    saveIntegrationRecipes(namedDraft("A의 레시피"), storage, "user-a");
    saveIntegrationRecipes(namedDraft("B의 레시피"), storage, "user-b");

    expect(loadIntegrationRecipes([template], storage, "user-b")).toEqual(namedDraft("B의 레시피"));
    expect(loadIntegrationRecipes([template], storage, "user-a")).toEqual(namedDraft("A의 레시피"));
    expect(loadIntegrationRecipes([template], storage, "user-b")).toEqual(namedDraft("B의 레시피"));
  });

  it("레거시 기록은 첫 계정이 claim 하고, 게스트와 다음 계정은 claim 하지 않는다", () => {
    const storage = memoryStorage();
    storage.setItem(RECIPE_STORAGE_KEY, JSON.stringify(namedDraft("레거시 레시피")));

    // 게스트는 레거시를 가져가지 않고 템플릿 기본값을 본다 — 레거시는 남는다.
    expect(loadIntegrationRecipes([template], storage, "guest")).toEqual([
      recipeDraftFromTemplate(template),
    ]);
    expect(storage.memory.has(RECIPE_STORAGE_KEY)).toBe(true);
    expect(storage.memory.has(recipeStorageKey("guest"))).toBe(false);

    // 첫 로그인 계정이 읽는 자리에서 claim 한다: 복사 후 레거시 삭제.
    expect(loadIntegrationRecipes([template], storage, "user-a")).toEqual(namedDraft("레거시 레시피"));
    expect(storage.memory.has(RECIPE_STORAGE_KEY)).toBe(false);
    expect(JSON.parse(storage.memory.get(recipeStorageKey("user-a"))!)).toEqual(
      namedDraft("레거시 레시피"),
    );

    // 레거시가 소비됐으므로 다음 계정은 claim 할 것이 없고 자기 파티션만 본다.
    expect(loadIntegrationRecipes([template], storage, "user-b")).toEqual([
      recipeDraftFromTemplate(template),
    ]);
  });

  it("깨진 레거시 기록은 claim 하지 않고 템플릿으로 폴백한다", () => {
    const storage = memoryStorage();
    storage.setItem(RECIPE_STORAGE_KEY, "not-json");

    expect(loadIntegrationRecipes([template], storage, "user-a")).toEqual([
      recipeDraftFromTemplate(template),
    ]);
    expect(storage.memory.get(RECIPE_STORAGE_KEY)).toBe("not-json");
    expect(storage.memory.has(recipeStorageKey("user-a"))).toBe(false);
  });

  it("소유자 미지정 호출은 레거시 키를 그대로 쓴다(기존 호환)", () => {
    const setItem = vi.fn();
    saveIntegrationRecipes(namedDraft("기본 레시피"), { setItem });
    expect(setItem).toHaveBeenCalledWith(RECIPE_STORAGE_KEY, expect.any(String));

    const storage = memoryStorage();
    storage.setItem(RECIPE_STORAGE_KEY, JSON.stringify(namedDraft("기본 레시피")));
    expect(loadIntegrationRecipes([template], storage)).toEqual(namedDraft("기본 레시피"));
  });
});
